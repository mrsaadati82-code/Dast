import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || 'dastrast-local-dev-secret-change-me';

fs.mkdirSync(DATA_DIR, { recursive: true });

const seed = {
  users: [],
  transactions: [],
  cheques: [],
  recurring: [],
  smsInbox: [],
  persons: [],
  accounts: [],
  categories: [],
  assistantTraining: [],
  settings: {
    appName: 'دست راست',
    aiProvider: 'local',
    aiBaseUrl: '',
    aiModel: 'gpt-4o-mini',
    aiToken: '',
    temperature: 0.2,
    systemPrompt: 'تو دستیار مالی فارسی اپلیکیشن دست راست هستی. پاسخ‌ها را دقیق، کوتاه و فارسی بده.',
    defaultCurrency: 'تومان',
    reminderDays: [7, 3, 1],
    notificationChannels: ['inApp']
  }
};

function nowIso() { return new Date().toISOString(); }
function normalizeDb(db){ db.users ||= []; db.transactions ||= []; db.cheques ||= []; db.smsInbox ||= []; db.persons ||= []; db.accounts ||= []; db.categories ||= ['حمل و نقل','خوراکی و سوپرمارکت','رستوران و کافه','حقوق و درآمد','اقساط و بدهی','بدهکار / بدهی','بستانکار / طلب','مسکن و اجاره','قبوض و خدمات','درمان و سلامت','پوشاک','آموزش','سفر','تفریح و اشتراک','سرمایه‌گذاری','سایر']; db.assistantTraining ||= []; return db; }
function readDb() {
  if (!fs.existsSync(DB_PATH)) writeDb(seed);
  return normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
}
function writeDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8'); }
function id(prefix = '') { return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`; }
function publicUser(u) { return u ? { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt } : null; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hashPassword(password, salt).split(':')[1]));
}
function b64url(input) { return Buffer.from(JSON.stringify(input)).toString('base64url'); }
function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 };
  const unsigned = `${b64url(header)}.${b64url(body)}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(unsigned).digest('base64url');
  return `${unsigned}.${sig}`;
}
function verifyToken(token) {
  const [h, p, sig] = (token || '').split('.');
  if (!h || !p || !sig) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  if (expected !== sig) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'نیاز به ورود دارید.' });
  const db = readDb();
  const user = db.users.find(u => u.id === payload.uid);
  if (!user) return res.status(401).json({ error: 'کاربر معتبر نیست.' });
  req.user = user;
  req.db = db;
  next();
}
function admin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'دسترسی ادمین لازم است.' });
  next();
}

function faToEnDigits(str = '') {
  const fa = '۰۱۲۳۴۵۶۷۸۹'; const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(str).replace(/[۰-۹]/g, d => fa.indexOf(d)).replace(/[٠-٩]/g, d => ar.indexOf(d));
}
const numberWords = {
  'صفر':0,'یه':1,'ی':1,'یک':1,'اول':1,'دو':2,'سه':3,'چار':4,'چهار':4,'پنج':5,'شیش':6,'شش':6,'هفت':7,'هشت':8,'نه':9,
  'ده':10,'یازده':11,'دوازده':12,'سیزده':13,'چهارده':14,'پونزده':15,'پانزده':15,'شانزده':16,'هفده':17,'هجده':18,'نوزده':19,
  'بیست':20,'سی':30,'سین':30,'چهل':40,'پنجاه':50,'شصت':60,'هفتاد':70,'هشتاد':80,'نود':90,
  'صد':100,'یکصد':100,'دویست':200,'سیصد':300,'چهارصد':400,'پونصد':500,'پانصد':500,'ششصد':600,'هفتصد':700,'هشتصد':800,'نهصد':900
};
function wordsToNumber(phrase = '') {
  const clean = phrase.replace(/\s+و\s+/g, ' ').trim();
  if (!clean) return 0;
  let total = 0;
  for (const part of clean.split(/\s+/)) total += numberWords[part] || 0;
  if (/نیم/.test(phrase)) total += 0.5;
  return total;
}
function parseAmount(text = '') {
  const original = String(text);
  const t = faToEnDigits(original).replace(/,/g, '').replace(/٬/g, '');
  let m = /(\d+(?:\.\d+)?)\s*(میلیون|ملیون|م\b)/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 1000000);
  m = /(\d+)\s*(هزار|هزارتومن|هزار تومن|هزارتومان|کا|k\b)/i.exec(t);
  if (m) return parseInt(m[1]) * 1000;
  m = /([آ-ی\s]+?)\s*(میلیون|ملیون)/.exec(original);
  if (m) return Math.round(wordsToNumber(m[1]) * 1000000);
  m = /([آ-ی\s]+?)\s*(هزار|تومن|تومان)/.exec(original);
  if (m) {
    const n = wordsToNumber(m[1]);
    if (n) return Math.round(n * 1000);
  }
  m = /(\d+)\s*(تومن|تومان)/.exec(t);
  if (m) { const v = parseInt(m[1]); return v < 1000 ? v * 1000 : v; }
  m = /(\d+)\s*(ریال)/.exec(t);
  if (m) return Math.round(parseInt(m[1]) / 10);
  const num = /(\d{1,})/.exec(t);
  if (!num) return 0;
  let val = parseInt(num[1]);
  if (val > 0 && val < 1000 && /(دادم|گرفتم|خریدم|کرایه|تاکسی|اسنپ|خرج|هزینه|پرداخت|واریز|حقوق|طلب|بدهکار|بستانکار)/.test(original)) val *= 1000;
  return val;
}
function pickParty(text = '') {
  const m = /(از|به|برای|بابت)\s+([آ-یA-Za-z0-9_\- ]{2,18})/.exec(text);
  return m ? m[2].replace(/(طلب|بدهکار|قرض|پول|تومن|تومان).*/, '').trim() : '';
}
function detectTransaction(text = '') {
  const raw = String(text || '').trim();
  const normalized = raw.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const amount = parseAmount(normalized);
  const isReceivable = /(طلب\s*دارم|طلبکارم|بستانکارم|قرض\s*دادم|پول\s*دادم\s*به|چک\s*دریافتنی|از .* طلب)/.test(normalized);
  const isPayable = /(بدهکارم|بدهی|قرض\s*گرفتم|باید\s*بدم|باید\s*پرداخت|چک\s*پرداختنی|به .* بدهکار)/.test(normalized);
  const incomeWords = /(واریز|واریزی|حقوق|درآمد|دریافت|گرفتم|فروش|سود|پورسانت|اجاره\s*گرفتم|برگشت\s*پول|کش\s*بک|دستمزد|کارمزد\s*گرفتم)/;
  const expenseWords = /(دادم|پرداخت|برداشت|خریدم|خرید|خرج|هزینه|کرایه|قسط|اجاره\s*دادم|قبض|شارژ|کارت\s*به\s*کارت\s*کردم|پوز|خرید اینترنتی)/;
  let type = incomeWords.test(normalized) && !expenseWords.test(normalized) ? 'income' : 'expense';
  if (isReceivable) type = 'income';
  if (isPayable) type = 'expense';

  let category = 'سایر';
  if (isReceivable) category = 'بستانکار / طلب';
  else if (isPayable) category = 'بدهکار / بدهی';
  else if (/تاکسی|اسنپ|تپسی|مترو|اتوبوس|بنزین|سوخت|پارکینگ|کرایه|رفت\s*و\s*آمد|حمل/.test(normalized)) category = 'حمل و نقل';
  else if (/سوپر|مارکت|نان|نونوایی|میوه|تره\s*بار|قصابی|مرغ|خوراک|برنج|لبنیات|افق|شهروند|هایپر/.test(normalized)) category = 'خوراکی و سوپرمارکت';
  else if (/رستوران|کافه|ناهار|شام|صبحانه|فست\s*فود|پیتزا|کباب|قهوه|اسنک/.test(normalized)) category = 'رستوران و کافه';
  else if (/حقوق|واریز|درآمد|فروش|سود|پورسانت|دستمزد/.test(normalized)) category = 'حقوق و درآمد';
  else if (/قسط|وام|بدهی|اقساط|تسهیلات/.test(normalized)) category = 'اقساط و بدهی';
  else if (/اجاره|رهن|خانه|منزل|دفتر/.test(normalized)) category = 'مسکن و اجاره';
  else if (/قبض|برق|آب|گاز|تلفن|اینترنت|شارژ/.test(normalized)) category = 'قبوض و خدمات';
  else if (/دکتر|دارو|درمان|بیمارستان|آزمایش|دندان/.test(normalized)) category = 'درمان و سلامت';
  else if (/لباس|کفش|پوشاک/.test(normalized)) category = 'پوشاک';
  else if (/مدرسه|دانشگاه|کتاب|آموزش|دوره|کلاس/.test(normalized)) category = 'آموزش';
  else if (/سفر|هتل|بلیط|پرواز|قطار/.test(normalized)) category = 'سفر';
  else if (/تفریح|سینما|بازی|اشتراک|نتفلیکس|فیلیمو|اسپاتیفای/.test(normalized)) category = 'تفریح و اشتراک';
  else if (/سرمایه|بورس|طلا|دلار|صندوق|کریپتو|ارز/.test(normalized)) category = 'سرمایه‌گذاری';

  const bank = (/ملی/.test(normalized) && 'بانک ملی') || (/ملت/.test(normalized) && 'بانک ملت') || (/پاسارگاد/.test(normalized) && 'بانک پاسارگاد') || (/سامان/.test(normalized) && 'بانک سامان') || (/صادرات/.test(normalized) && 'بانک صادرات') || '';
  const party = pickParty(normalized);
  let title = normalized || (type === 'income' ? 'درآمد جدید' : 'هزینه جدید');
  if (isReceivable && party) title = `طلب از ${party}`;
  if (isPayable && party) title = `بدهی به ${party}`;
  if (title.length > 52) title = title.slice(0, 52) + '…';
  return { title, amount: amount || 0, type, category, bank, party, accountingSide: isReceivable ? 'receivable' : isPayable ? 'payable' : '', confidence: amount ? 0.9 : 0.55, rawText: raw };
}
function sanitizeSettingsForClient(settings, isAdmin = false) {
  const copy = { ...settings };
  copy.aiToken = '';
  copy.aiTokenSet = Boolean(settings?.aiToken);
  return copy;
}
async function callAi(db, messages, json = false, imageBase64 = null) {
  const s = db.settings || {};
  if (!s.aiToken || s.aiProvider === 'local') return null;
  let url = s.aiBaseUrl;
  if (!url) {
    if (s.aiProvider === 'openai') url = 'https://api.openai.com/v1/chat/completions';
    else if (s.aiProvider === 'openrouter') url = 'https://openrouter.ai/api/v1/chat/completions';
    else if (s.aiProvider === 'groq') url = 'https://api.groq.com/openai/v1/chat/completions';
  }
  const finalMessages = [{ role: 'system', content: s.systemPrompt }, ...messages];
  if (imageBase64) {
    finalMessages.push({ role: 'user', content: [
      { type: 'text', text: 'این تصویر رسید/فاکتور را تحلیل کن و فقط JSON تراکنش را بده.' },
      { type: 'image_url', image_url: { url: imageBase64 } }
    ]});
  }
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s.aiToken}` },
    body: JSON.stringify({ model: s.aiModel, temperature: Number(s.temperature ?? 0.2), response_format: json ? { type: 'json_object' } : undefined, messages: finalMessages })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || 'خطا در ارتباط با ارائه‌دهنده هوش مصنوعی');
  return data?.choices?.[0]?.message?.content || '';
}

const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(ROOT, 'dist')));

// create default admin if db is empty
{
  const db = readDb();
  if (!db.users.length) {
    db.users.push({ id: id('u_'), name: 'مدیر دست راست', email: 'admin@dastrast.local', passwordHash: hashPassword('Admin12345'), role: 'admin', createdAt: nowIso() });
    writeDb(db);
  }
}

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'نام، ایمیل و رمز حداقل ۶ کاراکتر لازم است.' });
  const db = readDb();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'این ایمیل قبلاً ثبت شده است.' });
  const role = db.users.length === 0 ? 'admin' : 'user';
  const user = { id: id('u_'), name, email: email.toLowerCase(), passwordHash: hashPassword(password), role, createdAt: nowIso() };
  db.users.push(user); writeDb(db);
  res.json({ token: signToken({ uid: user.id }), user: publicUser(user) });
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !verifyPassword(password || '', user.passwordHash)) return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' });
  res.json({ token: signToken({ uid: user.id }), user: publicUser(user) });
});
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), settings: sanitizeSettingsForClient(req.db.settings, req.user.role === 'admin') }));

app.get('/api/transactions', auth, (req, res) => {
  res.json(req.db.transactions.filter(t => t.userId === req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
});
app.post('/api/transactions', auth, (req, res) => {
  const tx = { id: id('tx_'), userId: req.user.id, title: req.body.title || 'تراکنش', amount: Number(req.body.amount || 0), type: req.body.type || 'expense', category: req.body.category || 'سایر', bank: req.body.bank || '', date: req.body.date || new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()), method: req.body.method || 'Manual', note: req.body.note || '', createdAt: nowIso() };
  req.db.transactions.push(tx); writeDb(req.db); res.json(tx);
});
app.put('/api/transactions/:id', auth, (req, res) => {
  const i = req.db.transactions.findIndex(t => t.id === req.params.id && t.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'تراکنش پیدا نشد.' });
  req.db.transactions[i] = { ...req.db.transactions[i], ...req.body, amount: Number(req.body.amount ?? req.db.transactions[i].amount) };
  writeDb(req.db); res.json(req.db.transactions[i]);
});
app.delete('/api/transactions/:id', auth, (req, res) => {
  req.db.transactions = req.db.transactions.filter(t => !(t.id === req.params.id && t.userId === req.user.id)); writeDb(req.db); res.json({ ok: true });
});

app.post('/api/ai/parse-transaction', auth, async (req, res) => {
  const text = req.body.text || '';
  try {
    const content = await callAi(req.db, [{ role: 'user', content: `متن کاربر را به JSON با کلیدهای title, amount, type(income/expense), category, note تبدیل کن: ${text}` }], true);
    let parsed = content ? JSON.parse(content.replace(/```json|```/g, '')) : detectTransaction(text);
    parsed = { ...detectTransaction(text), ...parsed, amount: Number(parsed.amount || detectTransaction(text).amount) };
    res.json(parsed);
  } catch (e) { res.json({ ...detectTransaction(text), aiWarning: e.message }); }
});
app.post('/api/ai/parse-receipt', auth, async (req, res) => {
  const { imageBase64, text } = req.body || {};
  try {
    const content = await callAi(req.db, [{ role: 'user', content: 'از رسید خرید JSON تراکنش بده: title, amount, type, category, note' }], true, imageBase64);
    const parsed = content ? JSON.parse(content.replace(/```json|```/g, '')) : detectTransaction(text || 'خرید رسید');
    res.json({ ...detectTransaction(text || 'خرید رسید'), ...parsed, type: parsed.type || 'expense' });
  } catch (e) { res.json({ ...detectTransaction(text || 'خرید از روی رسید'), title: 'رسید اسکن‌شده', category: 'خوراکی و سوپرمارکت', aiWarning: e.message }); }
});
app.post('/api/ai/ask', auth, async (req, res) => {
  const q = req.body.question || '';
  const txs = req.db.transactions.filter(t => t.userId === req.user.id);
  try {
    const content = await callAi(req.db, [{ role: 'user', content: `با این داده‌های تراکنش پاسخ تحلیلی فارسی بده. سوال: ${q}\nداده‌ها:${JSON.stringify(txs.slice(0,150))}` }]);
    if (content) return res.json({ answer: content });
  } catch {}
  const totalExpense = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
  const totalIncome = txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const rest = txs.filter(t=>/رستوران|کافه/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0);
  const payable = txs.filter(t=>/بدهکار|بدهی/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0);
  const receivable = txs.filter(t=>/بستانکار|طلب/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0);
  const biggest = [...txs].sort((a,b)=>Number(b.amount)-Number(a.amount))[0];
  const byCat = txs.reduce((acc,t)=>{acc[t.category]=(acc[t.category]||0)+Number(t.amount); return acc;},{});
  const topCats = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,v])=>`${c}: ${Number(v).toLocaleString('fa-IR')} تومان`).join('، ');
  let answer = `خلاصه مالی شما: ${txs.length.toLocaleString('fa-IR')} تراکنش، درآمد ${totalIncome.toLocaleString('fa-IR')} تومان، هزینه ${totalExpense.toLocaleString('fa-IR')} تومان و مانده ${(totalIncome-totalExpense).toLocaleString('fa-IR')} تومان.`;
  if (/رستوران|کافه/.test(q)) answer = `مجموع هزینه‌های رستوران و کافه شما ${rest.toLocaleString('fa-IR')} تومان است.`;
  else if (/بده|طلب|بستان/.test(q)) answer = `جمع طلب/بستانکاری شما ${receivable.toLocaleString('fa-IR')} تومان و جمع بدهی/بدهکاری شما ${payable.toLocaleString('fa-IR')} تومان است.`;
  else if (/بزرگترین|بزرگ‌ترین/.test(q) && biggest) answer = `بزرگ‌ترین تراکنش ثبت‌شده: ${biggest.title} به مبلغ ${Number(biggest.amount).toLocaleString('fa-IR')} تومان در دسته ${biggest.category}.`;
  else if (/کجا|دسته|بیشتر/.test(q)) answer = `بیشترین مبالغ ثبت‌شده مربوط به این دسته‌هاست: ${topCats || 'داده کافی وجود ندارد'}.`;
  res.json({ answer });
});
app.post('/api/sms/parse', auth, (req, res) => {
  const text = req.body.text || '';
  const parsed = detectTransaction(text);
  const sms = { id: id('sms_'), userId: req.user.id, sender: req.body.sender || 'BANK', text, parsed, status: 'pending', createdAt: nowIso() };
  req.db.smsInbox.unshift(sms); writeDb(req.db); res.json(sms);
});
app.get('/api/sms', auth, (req, res) => res.json(req.db.smsInbox.filter(s => s.userId === req.user.id)));

app.get('/api/cheques', auth, (req, res) => res.json(req.db.cheques.filter(c => c.userId === req.user.id).sort((a,b)=>a.dueDate.localeCompare(b.dueDate))));
app.post('/api/cheques', auth, (req, res) => {
  const chq = { id: id('chq_'), userId: req.user.id, title: req.body.title || 'چک', amount: Number(req.body.amount || 0), dueDate: req.body.dueDate || '', type: req.body.type || 'payable', status: req.body.status || 'pending', reminderChannels: req.body.reminderChannels || ['inApp'], createdAt: nowIso() };
  req.db.cheques.push(chq); writeDb(req.db); res.json(chq);
});
app.put('/api/cheques/:id', auth, (req, res) => {
  const i = req.db.cheques.findIndex(c => c.id === req.params.id && c.userId === req.user.id);
  if (i < 0) return res.status(404).json({ error: 'چک پیدا نشد.' });
  req.db.cheques[i] = { ...req.db.cheques[i], ...req.body, amount: Number(req.body.amount ?? req.db.cheques[i].amount) };
  writeDb(req.db); res.json(req.db.cheques[i]);
});
app.delete('/api/cheques/:id', auth, (req, res) => { req.db.cheques = req.db.cheques.filter(c => !(c.id === req.params.id && c.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });

app.get('/api/admin/stats', auth, admin, (req, res) => {
  const txs = req.db.transactions;
  const byCat = {};
  txs.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
  res.json({ users: req.db.users.map(publicUser), counts: { users: req.db.users.length, transactions: txs.length, cheques: req.db.cheques.length, sms: req.db.smsInbox.length }, totals: { income: txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0), expense: txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0) }, byCat });
});
app.get('/api/admin/settings', auth, admin, (req, res) => res.json(sanitizeSettingsForClient(req.db.settings, true)));
app.put('/api/admin/settings', auth, admin, (req, res) => {
  const next = { ...req.db.settings, ...req.body };
  if (!req.body.aiToken || req.body.aiToken === '********') next.aiToken = req.db.settings.aiToken;
  req.db.settings = next; writeDb(req.db); res.json(sanitizeSettingsForClient(next, true));
});
app.post('/api/admin/test-ai', auth, admin, async (req, res) => {
  try {
    const answer = await callAi(req.db, [{ role: 'user', content: req.body.prompt || 'سلام، فقط بگو اتصال برقرار است.' }]);
    res.json({ ok: true, answer: answer || 'حالت Local فعال است؛ اتصال خارجی تست نشد.' });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(ROOT, 'dist', 'index.html')));
app.listen(PORT, () => console.log(`Dast Rast API running on http://localhost:${PORT}`));
