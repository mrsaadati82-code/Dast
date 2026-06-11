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
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || 'dastrast-local-dev-secret-change-me';

fs.mkdirSync(DATA_DIR, { recursive: true });

const seed = {
  users: [], transactions: [], cheques: [], smsInbox: [], persons: [], accounts: [], assistantTraining: [],
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

const nowIso = () => new Date().toISOString();
const faDate = () => new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date());
const toFa = (n) => String(n ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

function normalizeDb(db) {
  db.users ||= []; db.transactions ||= []; db.cheques ||= []; db.smsInbox ||= [];
  db.persons ||= []; db.accounts ||= []; db.projects ||= []; db.experts ||= [];
  db.expertSettlements ||= []; db.treasuryMovements ||= []; db.chartAccounts ||= [];
  db.journalEntries ||= []; db.invoices ||= []; db.aiRules ||= []; db.pushSubscriptions ||= [];
  db.undoStack ||= []; db.corrections ||= []; db.dashboardPrefs ||= {}; db.branding ||= {};
  db.categories = (db.categories && db.categories.length) ? db.categories : ['حمل و نقل','خوراکی و سوپرمارکت','رستوران و کافه','حقوق و درآمد','اقساط و بدهی','بدهکار / بدهی','بستانکار / طلب','مسکن و اجاره','قبوض و خدمات','درمان و سلامت','پوشاک','آموزش','سفر','تفریح و اشتراک','سرمایه‌گذاری','سایر'];
  db.assistantTraining ||= [];
  db.settings ||= seed.settings;
  return db;
}
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
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}
function b64url(input) { return Buffer.from(JSON.stringify(input)).toString('base64url'); }
function signToken(payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 };
  const unsigned = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(body)}`;
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

/* ------------------------- Persian NLP helpers ------------------------- */
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
  if (m) { const n = wordsToNumber(m[1]); if (n) return Math.round(n * 1000); }
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
function sanitizeSettingsForClient(settings) {
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

/* ------------------------- Domain helpers ------------------------- */
function compactName(name = '') { return String(name).trim().replace(/^(آقا|خانم|جناب)\s+/, '').replace(/\s+/g, ' '); }
function findPersonCandidates(db, userId, name = '') {
  const n = compactName(name); if (!n) return [];
  const words = n.split(/\s+/);
  const isSingleWord = words.length === 1;
  return db.persons.filter(p => {
    if (p.userId !== userId) return false;
    if (p.name === n) return true;                 // تطابق دقیق
    if (p.name.includes(n)) return true;           // نام شخص شامل عبارت جستجو (مثل «علی» در «علی محسنی»)
    // فقط وقتی کاربر یک کلمه گفته، نام‌خانوادگی‌دار‌ها را با نام کوچک تطبیق بده.
    // اگر کاربر نام کامل (چندکلمه‌ای) گفت، نباید با یک شخص تک‌اسمی تطبیق شود.
    if (isSingleWord && p.name.split(' ')[0] === n) return true;
    return false;
  });
}
function ensurePerson(db, userId, name = '') {
  const n = compactName(name || 'شخص بدون نام');
  const exact = db.persons.find(p => p.userId === userId && p.name === n);
  if (exact) return exact;
  const person = { id: id('p_'), userId, name: n, phone: '', mobile: '', nationalId: '', address: '', kind: 'person', tags: [], note: '', createdAt: nowIso() };
  db.persons.push(person); return person;
}
function personBalance(db, userId, personId) {
  return db.transactions.filter(t => t.userId === userId && t.personId === personId).reduce((sum, t) => {
    if (t.accountingSide === 'receivable') return sum + Number(t.amount || 0);
    if (t.accountingSide === 'payable') return sum - Number(t.amount || 0);
    if (t.accountingSide === 'settlement') return sum + Number(t.settlementDelta || 0);
    return sum;
  }, 0);
}
// واژه‌هایی که هرگز بخشی از نام شخص نیستند و باید از انتهای نام بریده شوند
const NAME_STOPWORDS = ['پول','مبلغ','قرض','چک','طلب','بدهی','بدهکار','بستانکار','دادم','گرفتم','پرداخت','دریافت','بده','واریز','برداشت','تومن','تومان','میلیون','ملیون','هزار','ریال','بابت','برای','رو','را','که','از','به','با','کردم','شد','شدم'];
function cleanPersonName(name = '') {
  let n = compactName(name);
  // حذف هر چیزی از اولین واژهٔ ایست به بعد
  const parts = n.split(/\s+/);
  const out = [];
  for (const w of parts) { if (NAME_STOPWORDS.includes(w) || /\d/.test(w)) break; out.push(w); }
  return out.join(' ').trim();
}
function extractPersonName(text = '') {
  const cleaned = String(text).replace(/برای\s+\d{1,2}\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/g, '').replace(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g, '');
  const direct = /(?:از|به)\s+([آ-یA-Za-z]+(?:\s+[آ-یA-Za-z]+)?)\s+(?:پول|مبلغ|قرض|چک|طلب|دادم|گرفتم|پرداخت|بده|بدهکار|بستانکار)/.exec(cleaned);
  if (direct) return cleanPersonName(direct[1]);
  // تسویه: «علی رو تسویه کن» / «حساب علی رو تسویه کن» / «با علی تسویه»
  const settle = /(?:حساب\s+)?([آ-یA-Za-z][آ-یA-Za-z ]{1,22}?)\s+(?:رو|را)\s+تسویه/.exec(cleaned) || /با\s+([آ-یA-Za-z ]{2,24})\s+تسویه/.exec(cleaned) || /تسویه\s+(?:حساب\s+)?([آ-یA-Za-z][آ-یA-Za-z ]{1,22})/.exec(cleaned);
  if (settle) return cleanPersonName(settle[1]);
  const patterns = [/از\s+([آ-یA-Za-z ]{2,24}?)\s+(?:پول|مبلغ|چک|طلب|قرض|گرفتم|دریافت)/, /به\s+([آ-یA-Za-z ]{2,24}?)\s+(?:پول|مبلغ|چک|قرض|دادم|پرداخت)/, /(?:طلب از|بدهی به)\s+([آ-یA-Za-z ]{2,24})/];
  for (const r of patterns) { const m = r.exec(cleaned); if (m) return cleanPersonName(m[1]); }
  const tail = /(?:^|\s)(?:به|از|با)\s+([آ-یA-Za-z][آ-یA-Za-z ]{1,22})\s*$/.exec(cleaned);
  if (tail) return cleanPersonName(tail[1]);
  const pp = pickParty(cleaned); return /\d/.test(pp) ? '' : cleanPersonName(pp);
}
function parsePersianDueDate(text = '') {
  const months = { فروردین:'01', اردیبهشت:'02', خرداد:'03', تیر:'04', مرداد:'05', شهریور:'06', مهر:'07', آبان:'08', آذر:'09', دی:'10', بهمن:'11', اسفند:'12' };
  const t = faToEnDigits(text);
  const m = /(\d{1,2})\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/.exec(t);
  if (m) { const y = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date()).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); return `${y}/${months[m[2]]}/${String(m[1]).padStart(2, '0')}`; }
  const d = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(t); if (d) return `${d[1]}/${String(d[2]).padStart(2, '0')}/${String(d[3]).padStart(2, '0')}`;
  return '';
}
// ---- تبدیل تاریخ شمسی به میلادی و محاسبهٔ روز مانده تا سررسید ----
function jalaliToGregorian(jy, jm, jd) {
  jy = +jy; jm = +jm; jd = +jd;
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0, gd = days + 1;
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return [gy, gm, gd];
}
function jalaliStrToDate(s = '') {
  const t = faToEnDigits(String(s)); const m = /(\d{3,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(t);
  if (!m) return null;
  const [gy, gm, gd] = jalaliToGregorian(+m[1], +m[2], +m[3]);
  return new Date(gy, gm - 1, gd);
}
function daysUntil(jalaliStr) {
  const d = jalaliStrToDate(jalaliStr); if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
// وضعیت محاسباتی چک: paid / overdue (معوق) / near (نزدیک) / upcoming
function chequeComputedStatus(c) {
  if (c.status === 'paid') return 'paid';
  if (c.status === 'bounced') return 'bounced';
  const d = daysUntil(c.dueDate);
  if (d === null) return c.status || 'pending';
  if (d < 0) return 'overdue';
  if (d <= 7) return 'near';
  return 'upcoming';
}
function ensureExpert(db, userId, name = '') {
  const n = compactName(name || 'کارشناس'); let e = db.experts.find(x => x.userId === userId && x.name === n);
  if (!e) { e = { id: id('ex_'), userId, name: n, role: 'کارشناس', balance: 0, createdAt: nowIso() }; db.experts.push(e); }
  return e;
}
function ensureTreasuryAccount(db, userId, title = 'صندوق اصلی') {
  let a = db.accounts.find(x => x.userId === userId && x.title === title);
  if (!a) { a = { id: id('acc_'), userId, title, bank: '', accountNumber: '', card: '', sheba: '', balance: 0, type: /بانک|ملت|ملی|پاسارگاد|سامان/.test(title) ? 'bank' : 'cash', createdAt: nowIso() }; db.accounts.push(a); }
  return a;
}
// مانده لحظه‌ای محاسبه‌شده از روی گردش (برای کنترل مغایرت با مانده ذخیره‌شده)
// مانده هر حساب نقد/بانک = مانده اولیه + (بدهکار − بستانکار) همان حساب در دفتر اسناد.
// تک‌منبع حقیقت = اسناد حسابداری؛ همهٔ عملیات (تراکنش، چک، خزانه، انتقال) سند می‌زنند.
function accountComputedBalance(db, userId, acc) {
  const init = Number(acc.initialBalance || 0);
  let delta = 0;
  db.journalEntries.filter(j => j.userId === userId).forEach(j => j.lines.forEach(l => {
    if (l.accountId === acc.id || l.accountTitle === acc.title) delta += Number(l.debit || 0) - Number(l.credit || 0);
  }));
  return init + delta;
}
function extractAfter(text, words) {
  for (const w of words) {
    const r = new RegExp(w + '\\s+([آ-یA-Za-z0-9 ]{2,30})');
    const m = r.exec(text);
    if (m) return compactName(m[1].replace(/(مبلغ|به مبلغ|برای|بابت|واریز|برداشت|پرداخت).*/, '').replace(/[0-9۰-۹]+.*/, '').replace(/(میلیون|ملیون|هزار|تومن|تومان).*/, ''));
  }
  return '';
}
const typeFa = { asset: 'دارایی', liability: 'بدهی', equity: 'سرمایه', income: 'درآمد', expense: 'هزینه' };
const LEVEL_FA = { total: 'کل', sub: 'معین', detail: 'تفصیلی' };
function nextChartCode(db, userId, type, parentId) {
  if (parentId) {
    const parent = db.chartAccounts.find(x => x.id === parentId);
    const siblings = db.chartAccounts.filter(x => x.userId === userId && x.parentId === parentId);
    return `${parent ? parent.code : '1'}${String(siblings.length + 1).padStart(2, '0')}`;
  }
  const base = { asset: 1000, liability: 2000, equity: 3000, income: 4000, expense: 5000 }[type] || 9000;
  const sameType = db.chartAccounts.filter(x => x.userId === userId && x.type === type && !x.parentId).length;
  return String(base + sameType + 1);
}
function ensureChartAccount(db, userId, title, type = 'asset') {
  let a = db.chartAccounts.find(x => x.userId === userId && x.title === title);
  if (!a) { a = { id: id('ca_'), userId, code: nextChartCode(db, userId, type, null), title, type, typeFa: typeFa[type] || type, level: 'total', parentId: '', createdAt: nowIso() }; db.chartAccounts.push(a); }
  return a;
}
function createJournal(db, userId, description, lines, source = 'manual', refId = '') {
  const norm = lines.map(l => { const acc = ensureChartAccount(db, userId, l.accountTitle, l.type || 'asset'); return { ...l, accountId: acc.id, accountTitle: acc.title, debit: Number(l.debit || 0), credit: Number(l.credit || 0) }; });
  const totalDebit = norm.reduce((s, l) => s + l.debit, 0), totalCredit = norm.reduce((s, l) => s + l.credit, 0);
  const num = db.journalEntries.filter(j => j.userId === userId).length + 1;
  const entry = { id: id('je_'), userId, number: num, refId, description, totalDebit, totalCredit, balanced: totalDebit === totalCredit, lines: norm, source, status: source === 'manual' ? 'final' : 'auto', date: faDate(), createdAt: nowIso() };
  db.journalEntries.unshift(entry); return entry;
}
// حذف اسناد خودکار مرتبط با یک رکورد (هنگام حذف/ویرایش تراکنش یا چک)
function removeJournalsByRef(db, userId, refId) {
  if (!refId) return;
  db.journalEntries = db.journalEntries.filter(j => !(j.userId === userId && j.refId === refId));
}
/*
  منطق حسابداری دوطرفهٔ یکپارچه — تک‌منبع حقیقت = سند حسابداری (journalEntries).
  هر تراکنش بسته به accountingSide سند درست می‌سازد:
   - receivable (طلب از شخص / فروش نسیه): بدهکار «حساب‌های دریافتنی»، بستانکار درآمد.  (نقد جابه‌جا نمی‌شود)
   - payable    (بدهی به شخص / خرید نسیه): بدهکار هزینه/دارایی، بستانکار «حساب‌های پرداختنی».
   - settlement (تسویه با شخص): نقد در برابر دریافتنی/پرداختنی.
   - income نقدی: بدهکار حساب نقد، بستانکار درآمد.
   - expense نقدی: بدهکار هزینه، بستانکار حساب نقد.
  حساب نقد = نام بانک/حساب اگر مشخص شده باشد، وگرنه «صندوق».
*/
function cashAccountTitle(tx) { return tx.bank || tx.account || 'صندوق'; }
function journalFromTransaction(db, tx) {
  const amount = Number(tx.amount || 0); if (!amount) return;
  const side = tx.accountingSide || '';
  const cash = cashAccountTitle(tx);
  if (side === 'receivable') {
    // طلب ما از شخص بیشتر می‌شود (دارایی) در برابر درآمد
    createJournal(db, tx.userId, tx.title, [
      { accountTitle: 'حساب‌های دریافتنی', type: 'asset', debit: amount },
      { accountTitle: tx.category && tx.category !== 'بستانکار / طلب' ? tx.category : 'درآمد', type: 'income', credit: amount }
    ], 'transaction', tx.id);
  } else if (side === 'payable') {
    // بدهی ما به شخص بیشتر می‌شود در برابر هزینه/دارایی
    createJournal(db, tx.userId, tx.title, [
      { accountTitle: tx.category && tx.category !== 'بدهکار / بدهی' ? tx.category : 'هزینه', type: 'expense', debit: amount },
      { accountTitle: 'حساب‌های پرداختنی', type: 'liability', credit: amount }
    ], 'transaction', tx.id);
  } else if (side === 'settlement') {
    // تسویه: settlementDelta منفی یعنی طلب ما کم شد (نقد دریافت کردیم)؛ مثبت یعنی بدهی ما کم شد (نقد پرداخت کردیم)
    const delta = Number(tx.settlementDelta || 0);
    if (delta <= 0) { // وصول طلب: نقد +، دریافتنی -
      createJournal(db, tx.userId, tx.title, [
        { accountTitle: cash, type: 'asset', debit: amount },
        { accountTitle: 'حساب‌های دریافتنی', type: 'asset', credit: amount }
      ], 'settlement', tx.id);
    } else { // پرداخت بدهی: پرداختنی -، نقد -
      createJournal(db, tx.userId, tx.title, [
        { accountTitle: 'حساب‌های پرداختنی', type: 'liability', debit: amount },
        { accountTitle: cash, type: 'asset', credit: amount }
      ], 'settlement', tx.id);
    }
  } else if (tx.type === 'income') {
    createJournal(db, tx.userId, tx.title, [
      { accountTitle: cash, type: 'asset', debit: amount },
      { accountTitle: tx.category || 'درآمد', type: 'income', credit: amount }
    ], 'transaction', tx.id);
  } else {
    createJournal(db, tx.userId, tx.title, [
      { accountTitle: tx.category || 'هزینه', type: 'expense', debit: amount },
      { accountTitle: cash, type: 'asset', credit: amount }
    ], 'transaction', tx.id);
  }
}
function parseLocalCommand(db, user, text) {
  let raw = String(text || '');
  for (const tr of db.assistantTraining.filter(x => x.userId === user.id)) { if (tr.phrase && raw.includes(tr.phrase)) raw += ' ' + (tr.meaning || ''); }
  for (const rule of db.aiRules.filter(x => x.userId === user.id)) { if (rule.pattern && raw.includes(rule.pattern)) raw += ' ' + (rule.action || ''); }
  // جداکننده‌های صریح یا ضمنی (؛ ; / «و» بین دو عملیات دارای فعل پولی / خط جدید)
  let segments = null;
  if (/[؛;]+/.test(raw)) segments = raw.split(/[؛;]+/);
  else if (/\n/.test(raw)) segments = raw.split(/\n+/);
  else {
    // تشخیص ضمنی: اگر دو بار الگوی «عدد + فعل پولی» دیده شد، روی «و» می‌شکنیم
    const moneyVerb = /(\d|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|بیست|سی|چهل|پنجاه|صد|میلیون|ملیون|هزار|تومن|تومان)[^و]*?(دادم|گرفتم|خریدم|خرج|پرداخت|واریز|برداشت|قرض|طلب)/g;
    const hits = raw.match(moneyVerb) || [];
    if (hits.length >= 2 && /\sو\s/.test(raw)) segments = raw.split(/\sو\s/);
  }
  if (segments) {
    const parts = segments.map(x => x.trim()).filter(p => p.length > 1 && /\d|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|بیست|سی|چهل|صد|میلیون|هزار|تومن|تومان/.test(p));
    if (parts.length >= 2) return { action: 'multi_command', results: parts.map(part => parseLocalCommand(db, user, part)), message: `${parts.length.toLocaleString('fa-IR')} عملیات پردازش شد.` };
  }
  const amount = parseAmount(raw);
  // ویرایش آخرین تراکنش با دستور طبیعی: «مبلغ آخرین تراکنش رو ... کن» یا «عنوان آخری رو ... کن»
  const isEditIntent = (/(ویرایش|اصلاح|تغییر|عوض)/.test(raw) || (/(آخری|اخری|آخرین)/.test(raw) && /(کن|بکن|بشه|کن\.)/.test(raw))) && /(تراکنش|آخری|اخری|آخرین|مبلغ|عنوان)/.test(raw) && !/حذف|پاک/.test(raw);
  if (isEditIntent) {
    const tx = db.transactions.filter(t => t.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (tx) {
      if (amount > 0 && /مبلغ|تومن|تومان|میلیون|هزار/.test(raw)) tx.amount = amount;
      const titleM = /(?:عنوان|اسم|نام).*?(?:به|بکن|کن)\s+([آ-یA-Za-z ]{2,30})/.exec(raw);
      if (titleM) tx.title = compactName(titleM[1]);
      if (/درآمد|واریز/.test(raw)) tx.type = 'income';
      if (/هزینه|خرج/.test(raw)) tx.type = 'expense';
      const catM = /دسته(?:‌| )?بندی.*?(?:به|بکن|کن)\s+([آ-یA-Za-z ]{2,24})/.exec(raw);
      if (catM) tx.category = compactName(catM[1]);
      return { action: 'edited', transaction: tx, message: `آخرین تراکنش ویرایش شد: ${tx.title} - ${Number(tx.amount).toLocaleString('fa-IR')} تومان` };
    }
  }
  // ویرایش آخرین چک با دستور طبیعی
  if (/(ویرایش|اصلاح|تغییر|عوض)/.test(raw) && /چک/.test(raw)) {
    const ch = db.cheques.filter(c => c.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (ch) {
      if (amount > 0 && /مبلغ|تومن|تومان|میلیون|هزار/.test(raw)) ch.amount = amount;
      const due = parsePersianDueDate(raw); if (due) ch.dueDate = due;
      if (/پاس|وصول|نقد/.test(raw)) ch.status = 'paid';
      return { action: 'cheque_edited', cheque: ch, message: `چک «${ch.title}» ویرایش شد. مبلغ: ${Number(ch.amount).toLocaleString('fa-IR')} تومان، سررسید: ${ch.dueDate || 'نامشخص'}` };
    }
  }
  // حذف با تایید دو مرحله‌ای: ابتدا درخواست تایید، سپس انجام پس از «بله/تایید»
  if (/حذف|پاک/.test(raw) && !/تایید|بله|آره|اره|مطمئن/.test(raw)) {
    if (/آخرین|اخرین/.test(raw) && /تراکنش|ثبت/.test(raw)) { const tx = db.transactions.filter(t => t.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; if (tx) return { action: 'confirm_delete', target: { kind: 'transaction', id: tx.id, title: tx.title }, message: `حذف تراکنش «${tx.title}» (${Number(tx.amount).toLocaleString('fa-IR')} تومان)؟` }; }
    if (/آخرین|اخرین/.test(raw) && /چک/.test(raw)) { const ch = db.cheques.filter(c => c.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; if (ch) return { action: 'confirm_delete', target: { kind: 'cheque', id: ch.id, title: ch.title }, message: `حذف چک «${ch.title}» (${Number(ch.amount).toLocaleString('fa-IR')} تومان)؟` }; }
  }
  if (/پاس|وصول/.test(raw) && /چک/.test(raw) && !/(ویرایش|اصلاح|حذف)/.test(raw)) {
    // اگر نام شخص گفته شده، چک همان شخص را پاس کن، وگرنه آخرین چک پاس‌نشده
    const pn = extractPersonName(raw);
    let pool = db.cheques.filter(c => c.userId === user.id && c.status !== 'paid');
    if (pn) { const f = pool.filter(c => (c.personName || '').includes(pn)); if (f.length) pool = f; }
    const ch = pool.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (ch) { const eff = payChequeEffect(db, ch, ''); return { action: 'cheque_paid', cheque: ch, transaction: eff.tx, canUndo: true, message: `چک «${ch.title}» پاس شد. مبلغ ${Number(ch.amount).toLocaleString('fa-IR')} تومان ${ch.type === 'receivable' ? 'به' : 'از'} ${eff.account.title} اعمال و سند حسابداری ثبت شد.` }; }
    return { action: 'noop', message: 'چک پاس‌نشده‌ای پیدا نشد.' };
  }
  if (/انتقال/.test(raw) && /از/.test(raw) && /به/.test(raw)) {
    const fromName = extractAfter(raw, ['از']) || 'صندوق اصلی'; const toName = extractAfter(raw, ['به']) || 'صندوق اصلی';
    const from = ensureTreasuryAccount(db, user.id, fromName), to = ensureTreasuryAccount(db, user.id, toName);
    const mv = { id: id('mv_'), userId: user.id, type: 'transfer', fromAccountId: from.id, toAccountId: to.id, from: from.title, to: to.title, amount: Number(amount || 0), note: raw, date: faDate(), createdAt: nowIso() }; db.treasuryMovements.push(mv);
    createJournal(db, user.id, `انتقال از ${from.title} به ${to.title}`, [{ accountTitle: to.title, type: 'asset', debit: Number(amount || 0) }, { accountTitle: from.title, type: 'asset', credit: Number(amount || 0) }], 'treasury', mv.id);
    return { action: 'treasury_transfer', movement: mv, message: `انتقال ${Number(amount || 0).toLocaleString('fa-IR')} تومان از ${from.title} به ${to.title} ثبت شد.` };
  }
  if (/واریز|برداشت/.test(raw) && /(صندوق|حساب|بانک|کیف)/.test(raw)) {
    const isDeposit = /واریز/.test(raw); const accName = extractAfter(raw, ['به', 'از']) || (/بانک ملت/.test(raw) ? 'بانک ملت' : 'صندوق اصلی'); const acc = ensureTreasuryAccount(db, user.id, accName);
    const mv = { id: id('mv_'), userId: user.id, type: isDeposit ? 'deposit' : 'withdraw', accountId: acc.id, account: acc.title, amount: Number(amount || 0), note: raw, date: faDate(), createdAt: nowIso() }; db.treasuryMovements.push(mv);
    if (isDeposit) createJournal(db, user.id, `واریز به ${acc.title}`, [{ accountTitle: acc.title, type: 'asset', debit: Number(amount || 0) }, { accountTitle: 'سایر درآمدها', type: 'income', credit: Number(amount || 0) }], 'treasury', mv.id);
    else createJournal(db, user.id, `برداشت از ${acc.title}`, [{ accountTitle: 'سایر هزینه‌ها', type: 'expense', debit: Number(amount || 0) }, { accountTitle: acc.title, type: 'asset', credit: Number(amount || 0) }], 'treasury', mv.id);
    return { action: 'treasury_movement', movement: mv, message: `${isDeposit ? 'واریز به' : 'برداشت از'} ${acc.title} به مبلغ ${Number(amount || 0).toLocaleString('fa-IR')} تومان ثبت شد.` };
  }
  if (/کارشناس|کارشناسان/.test(raw)) {
    const name = extractAfter(raw, ['کارشناس', 'با']) || 'کارشناس'; const ex = ensureExpert(db, user.id, name);
    const st = { id: id('set_'), userId: user.id, expertId: ex.id, expertName: ex.name, amount: Number(amount || 0), type: /پرداخت|تسویه/.test(raw) ? 'payment' : 'debt', status: 'paid', note: raw, createdAt: nowIso() };
    db.expertSettlements.push(st); ex.balance += st.type === 'payment' ? -st.amount : st.amount;
    return { action: 'expert_settlement', settlement: st, message: `تسویه/پرداخت کارشناس ${ex.name} به مبلغ ${st.amount.toLocaleString('fa-IR')} تومان ثبت شد.` };
  }
  if (/پروژه|مشتری/.test(raw)) {
    const cm = /مشتری\s+([آ-یA-Za-z ]+?)(?:\s+[0-9۰-۹]|\s+\d|\s+میلیون|\s+ملیون|\s+هزار|$)/.exec(raw); const customer = (cm && compactName(cm[1])) || extractAfter(raw, ['مشتری', 'برای']) || extractPersonName(raw) || 'مشتری'; const projectName = extractAfter(raw, ['پروژه']) || `پروژه ${customer}`;
    const person = ensurePerson(db, user.id, customer);
    const pr = { id: id('pr_'), userId: user.id, customerId: person.id, customerName: person.name, title: projectName, amount: Number(amount || 0), paid: 0, expertName: '', stages: DEFAULT_STAGES.map(s => ({ name: s, done: false, date: '' })), createdAt: nowIso() };
    db.projects.push(pr);
    if (amount) db.transactions.push({ id: id('tx_'), userId: user.id, personId: person.id, party: person.name, projectId: pr.id, title: `مطالبه پروژه ${projectName}`, amount: Number(amount), type: 'income', category: 'بستانکار / طلب', accountingSide: 'receivable', date: faDate(), method: 'Assistant Project', createdAt: nowIso() });
    return { action: 'project_created', project: pr, message: `پروژه ${projectName} برای ${person.name} با مبلغ ${Number(amount || 0).toLocaleString('fa-IR')} تومان ثبت شد.` };
  }
  const personName = extractPersonName(raw);
  const candidates = personName ? findPersonCandidates(db, user.id, personName) : [];
  const exact = candidates.find(p => p.name === personName);
  // رفتار مطابق خواستهٔ کاربر: همیشه به بهترین گزینه تخصیص بده (دقیق، یا اولین هم‌نام،
  // یا ساخت شخص جدید)، و اگر افراد هم‌نام دیگری بودند آن‌ها را به‌صورت دکمهٔ اصلاح برگردان.
  const person = personName ? (exact || candidates[0] || ensurePerson(db, user.id, personName)) : null;
  let alternatives;
  if (person && personName) {
    const sameName = findPersonCandidates(db, user.id, personName).filter(p => p.id !== person.id);
    if (sameName.length) alternatives = sameName.map(p => ({ ...p, balance: personBalance(db, user.id, p.id) }));
  }
  if (/چک/.test(raw)) {
    const receivable = /(گرفتم|دریافتی|دریافت|از)/.test(raw) && !/(دادم|صادر|پرداختنی)/.test(raw);
    const payable = /(دادم|صادر|پرداختنی|به)/.test(raw) && !/(گرفتم|دریافتی)/.test(raw);
    const type = receivable && !payable ? 'receivable' : 'payable';
    const bank = (/ملت/.test(raw) && 'بانک ملت') || (/ملی/.test(raw) && 'بانک ملی') || (/پاسارگاد/.test(raw) && 'بانک پاسارگاد') || (/سامان/.test(raw) && 'بانک سامان') || '';
    const dueDate = parsePersianDueDate(raw) || 'بدون تاریخ';
    const chq = { id: id('chq_'), userId: user.id, personId: person?.id || '', personName: person?.name || personName || '', title: `چک ${type === 'receivable' ? 'دریافتی' : 'صادره'} ${person?.name ? `- ${person.name}` : ''}`, amount: Number(amount || 0), dueDate, type, status: 'pending', bank, createdAt: nowIso() };
    db.cheques.push(chq);
    return { action: 'cheque_created', cheque: chq, message: `چک ${type === 'receivable' ? 'دریافتی' : 'صادره'} به مبلغ ${Number(amount || 0).toLocaleString('fa-IR')} تومان برای ${dueDate} ثبت شد.` };
  }
  if (/تسویه/.test(raw) && person) {
    const bal = personBalance(db, user.id, person.id); if (!bal) return { action: 'settled', message: `حساب ${person.name} از قبل تسویه است (مانده صفر).`, person };
    // bal>0 یعنی او به ما بدهکار است → ما دریافت می‌کنیم؛ bal<0 یعنی ما به او بدهکاریم → ما پرداخت می‌کنیم
    const tx = { id: id('tx_'), userId: user.id, personId: person.id, party: person.name, title: `تسویه کامل حساب ${person.name}`, amount: Math.abs(bal), type: bal > 0 ? 'income' : 'expense', category: 'تسویه حساب', accountingSide: 'settlement', settlementDelta: -bal, bank: 'صندوق', date: faDate(), method: 'Assistant Settlement', createdAt: nowIso() };
    db.transactions.push(tx); journalFromTransaction(db, tx);
    return { action: 'settled', transaction: tx, canUndo: true, message: `حساب ${person.name} به‌طور کامل تسویه شد.\nمبلغ ${Math.abs(bal).toLocaleString('fa-IR')} تومان ${bal > 0 ? 'از او دریافت شد (طلب وصول شد)' : 'به او پرداخت شد (بدهی تسویه شد)'} و مانده صفر شد.` };
  }
  const tx = detectTransaction(raw);
  if (person) {
    tx.personId = person.id; tx.party = person.name;
    // تشخیص جهت بدهکاری/طلبکاری بر اساس فعل و حرف اضافه
    const gaveToPerson = /(به|برای)\s/.test(raw) && /(دادم|پرداخت|پرداختم|قرض\s*دادم|رسوندم|واریز)/.test(raw);
    const tookFromPerson = /از\s/.test(raw) && /(گرفتم|قرض\s*گرفتم|دریافت|گرفتم)/.test(raw);
    const explicitPayable = /(قرض\s*گرفتم|بدهکارم|بدهی\s*دارم|باید\s*بدم|باید.*پرداخت)/.test(raw);
    const explicitReceivable = /(قرض\s*دادم|طلب\s*دارم|طلبکارم|بستانکارم|ازش\s*طلب)/.test(raw);
    if (explicitPayable) { tx.accountingSide = 'payable'; tx.category = 'بدهکار / بدهی'; tx.type = 'expense'; }
    else if (explicitReceivable) { tx.accountingSide = 'receivable'; tx.category = 'بستانکار / طلب'; tx.type = 'income'; }
    else if (gaveToPerson) { tx.accountingSide = 'receivable'; tx.category = 'بستانکار / طلب'; tx.type = 'income'; }
    else if (tookFromPerson) { tx.accountingSide = 'payable'; tx.category = 'بدهکار / بدهی'; tx.type = 'expense'; }
    // دکمه‌های پیشنهادی برای اصلاح نوع ثبت
    tx.sideSuggestions = [
      { side: 'receivable', label: 'طلب از او' },
      { side: 'payable', label: 'بدهی به او' },
      { side: '', label: 'هزینه/درآمد معمولی' }
    ];
  }
  for (const c of (db.corrections || []).filter(x => x.userId === user.id && x.field === 'category')) {
    const key = String(c.text).split(/\s+/).filter(w => w.length > 2);
    if (key.length && key.every(w => raw.includes(w))) { tx.category = c.value; tx.learned = true; break; }
  }
  return { action: 'transaction_parsed', parsed: tx, person, alternatives };
}

/* ------------------------- App + default admin ------------------------- */
const app = express();
app.use(express.json({ limit: '12mb' }));
// فایل‌های دارای hash را بلندمدت کش کن، اما index.html هرگز کش نشود (رفع باگ دیدن نسخهٔ قدیمی)
app.use(express.static(DIST, { setHeaders: (res, p) => { if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); } }));

// بازسازی اسناد خودکار از روی منابع (تراکنش/گردش/چک) — اصلاح دیتابیس‌های قدیمی ناهماهنگ
function rebuildAutoJournals(db) {
  for (const user of db.users) {
    const uid = user.id;
    // فقط اسناد دستی کاربر را نگه دار، بقیه را بازبساز
    db.journalEntries = db.journalEntries.filter(j => !(j.userId === uid && j.source !== 'manual'));
    // تراکنش‌های معمولی (نه آن‌هایی که از چک ساخته شده‌اند — آن‌ها جدا بازسازی می‌شوند)
    db.transactions.filter(t => t.userId === uid && !t.chequeId).forEach(t => journalFromTransaction(db, t));
    // گردش‌های خزانه (به‌جز گردش‌های ناشی از چک که جدا هستند)
    db.treasuryMovements.filter(m => m.userId === uid && m.source !== 'cheque').forEach(m => {
      if (m.type === 'deposit') createJournal(db, uid, `واریز به ${m.account}`, [{ accountTitle: m.account, type: 'asset', debit: Number(m.amount) }, { accountTitle: m.note || 'سایر درآمدها', type: 'income', credit: Number(m.amount) }], 'treasury', m.id);
      else if (m.type === 'withdraw') createJournal(db, uid, `برداشت از ${m.account}`, [{ accountTitle: m.note || 'سایر هزینه‌ها', type: 'expense', debit: Number(m.amount) }, { accountTitle: m.account, type: 'asset', credit: Number(m.amount) }], 'treasury', m.id);
      else if (m.type === 'transfer') createJournal(db, uid, `انتقال از ${m.from} به ${m.to}`, [{ accountTitle: m.to, type: 'asset', debit: Number(m.amount) }, { accountTitle: m.from, type: 'asset', credit: Number(m.amount) }], 'treasury', m.id);
    });
    // چک‌های پاس‌شده: سند وصول/پرداخت متصل به تراکنش چک
    db.transactions.filter(t => t.userId === uid && t.chequeId).forEach(t => {
      const amt = Number(t.amount || 0); const acc = t.bank || 'صندوق';
      if (t.type === 'income') createJournal(db, uid, t.title, [{ accountTitle: acc, type: 'asset', debit: amt }, { accountTitle: 'وصول چک', type: 'income', credit: amt }], 'cheque', t.id);
      else createJournal(db, uid, t.title, [{ accountTitle: 'پرداخت چک', type: 'expense', debit: amt }, { accountTitle: acc, type: 'asset', credit: amt }], 'cheque', t.id);
    });
  }
}
{
  const db = readDb();
  if (!db.users.length) {
    db.users.push({ id: id('u_'), name: 'مدیر دست راست', email: 'admin@dastrast.local', passwordHash: hashPassword('Admin12345'), role: 'admin', createdAt: nowIso() });
  }
  // یک‌بار اجرا: همگام‌سازی دفتر با منابع برای دیتابیس‌های ساخته‌شده با نسخهٔ قدیمی
  if (db.ledgerVersion !== 3) { rebuildAutoJournals(db); db.ledgerVersion = 3; }
  writeDb(db);
}

/* ------------------------- Auth ------------------------- */
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
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), settings: sanitizeSettingsForClient(req.db.settings) }));

/* ------------------------- Transactions ------------------------- */
app.get('/api/transactions', auth, (req, res) => res.json(req.db.transactions.filter(t => t.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.post('/api/transactions', auth, (req, res) => {
  const b = req.body;
  const tx = { id: id('tx_'), userId: req.user.id, title: b.title || 'تراکنش', amount: Number(b.amount || 0), type: b.type || 'expense', category: b.category || 'سایر', bank: b.bank || '', personId: b.personId || '', party: b.party || '', projectId: b.projectId || '', accountingSide: b.accountingSide || '', date: b.date || faDate(), method: b.method || 'Manual', note: b.note || '', createdAt: nowIso() };
  // برای تراکنش‌های نقدی، حساب خزانه را تضمین کن تا در لیست خزانه دیده شود
  if (!tx.accountingSide && (tx.bank || tx.type)) ensureTreasuryAccount(req.db, req.user.id, tx.bank || 'صندوق');
  req.db.transactions.push(tx); journalFromTransaction(req.db, tx); writeDb(req.db); res.json(tx);
});
app.put('/api/transactions/:id', auth, (req, res) => {
  const tx = req.db.transactions.find(t => t.id === req.params.id && t.userId === req.user.id);
  if (!tx) return res.status(404).json({ error: 'تراکنش پیدا نشد.' });
  Object.assign(tx, req.body); if (req.body.amount !== undefined) tx.amount = Number(req.body.amount);
  // سند حسابداری مرتبط را بازبساز تا دفتر هماهنگ بماند
  removeJournalsByRef(req.db, req.user.id, tx.id);
  journalFromTransaction(req.db, tx);
  writeDb(req.db); res.json(tx);
});
app.delete('/api/transactions/:id', auth, (req, res) => {
  removeJournalsByRef(req.db, req.user.id, req.params.id);
  req.db.transactions = req.db.transactions.filter(t => !(t.id === req.params.id && t.userId === req.user.id)); writeDb(req.db); res.json({ ok: true });
});
// تغییر نوع ثبت تراکنش (طلب/بدهی/معمولی) با دکمه‌های پیشنهادی دستیار
app.post('/api/transactions/:id/reclassify', auth, (req, res) => {
  const tx = req.db.transactions.find(t => t.id === req.params.id && t.userId === req.user.id);
  if (!tx) return res.status(404).json({ error: 'تراکنش پیدا نشد.' });
  const side = req.body.side || '';
  if (side === 'receivable') { tx.accountingSide = 'receivable'; tx.category = 'بستانکار / طلب'; tx.type = 'income'; tx.bank = ''; }
  else if (side === 'payable') { tx.accountingSide = 'payable'; tx.category = 'بدهکار / بدهی'; tx.type = 'expense'; tx.bank = ''; }
  else { tx.accountingSide = ''; if (!tx.bank) tx.bank = 'صندوق'; if (tx.category === 'بستانکار / طلب' || tx.category === 'بدهکار / بدهی') tx.category = 'سایر'; }
  removeJournalsByRef(req.db, req.user.id, tx.id);
  journalFromTransaction(req.db, tx);
  writeDb(req.db);
  res.json({ ok: true, transaction: tx, message: side === 'receivable' ? 'به‌عنوان طلب از این شخص ثبت شد.' : side === 'payable' ? 'به‌عنوان بدهی به این شخص ثبت شد.' : 'به‌عنوان تراکنش معمولی ثبت شد.' });
});

/* ------------------------- Cheques ------------------------- */
function publicCheque(c) { return { ...c, computedStatus: chequeComputedStatus(c), daysLeft: daysUntil(c.dueDate) }; }
// پاس‌کردن چک: ثبت تراکنش + سند حسابداری + اثر روی حساب خزانه (اتوماسیون حساب‌ها)
function payChequeEffect(db, c, accountTitle) {
  const acc = ensureTreasuryAccount(db, c.userId, accountTitle || (c.bank || 'صندوق اصلی'));
  const amt = Number(c.amount || 0);
  const mv = { id: id('mv_'), userId: c.userId, type: c.type === 'receivable' ? 'deposit' : 'withdraw', accountId: acc.id, account: acc.title, amount: amt, note: `وصول چک ${c.title}`, source: 'cheque', date: faDate(), createdAt: nowIso() };
  db.treasuryMovements.push(mv);
  // تراکنش نمایشی (بدون سند جداگانه) + یک سند حسابداری واحد متصل به همین تراکنش
  const tx = { id: id('tx_'), userId: c.userId, personId: c.personId || '', party: c.personName || '', title: `پاس شدن ${c.title}`, amount: amt, type: c.type === 'receivable' ? 'income' : 'expense', category: c.type === 'receivable' ? 'وصول چک' : 'پرداخت چک', bank: acc.title, date: faDate(), method: 'Cheque Paid', chequeId: c.id, createdAt: nowIso() };
  db.transactions.push(tx);
  if (c.type === 'receivable') createJournal(db, c.userId, `وصول چک ${c.title}`, [{ accountTitle: acc.title, type: 'asset', debit: amt }, { accountTitle: 'وصول چک', type: 'income', credit: amt }], 'cheque', tx.id);
  else createJournal(db, c.userId, `پرداخت چک ${c.title}`, [{ accountTitle: 'پرداخت چک', type: 'expense', debit: amt }, { accountTitle: acc.title, type: 'asset', credit: amt }], 'cheque', tx.id);
  c.status = 'paid'; c.paidAt = nowIso(); c.paidAccount = acc.title;
  return { tx, mv, account: acc };
}
app.get('/api/cheques', auth, (req, res) => res.json(req.db.cheques.filter(c => c.userId === req.user.id).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate))).map(publicCheque)));
app.post('/api/cheques', auth, (req, res) => {
  const b = req.body;
  const chq = { id: id('chq_'), userId: req.user.id, title: b.title || 'چک', amount: Number(b.amount || 0), dueDate: b.dueDate || '', type: b.type || 'payable', status: b.status || 'pending', personId: b.personId || '', personName: b.personName || '', bank: b.bank || '', serial: b.serial || '', note: b.note || '', reminderChannels: b.reminderChannels || ['inApp'], createdAt: nowIso() };
  req.db.cheques.push(chq); writeDb(req.db); res.json(publicCheque(chq));
});
app.put('/api/cheques/:id', auth, (req, res) => {
  const c = req.db.cheques.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!c) return res.status(404).json({ error: 'چک پیدا نشد.' });
  const was = c.status;
  for (const f of ['title', 'dueDate', 'type', 'personId', 'personName', 'bank', 'serial', 'note', 'status']) if (req.body[f] !== undefined) c[f] = req.body[f];
  if (req.body.amount !== undefined) c.amount = Number(req.body.amount);
  // پاس‌کردن از طریق ویرایش وضعیت
  if (req.body.status === 'paid' && was !== 'paid') payChequeEffect(req.db, c, req.body.account);
  writeDb(req.db); res.json(publicCheque(c));
});
// اکشن اختصاصی پاس‌کردن چک (با انتخاب حساب مقصد)
app.post('/api/cheques/:id/pay', auth, (req, res) => {
  const c = req.db.cheques.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!c) return res.status(404).json({ error: 'چک پیدا نشد.' });
  if (c.status === 'paid') return res.status(400).json({ error: 'این چک قبلاً پاس شده است.' });
  const eff = payChequeEffect(req.db, c, req.body.account);
  writeDb(req.db); res.json({ cheque: publicCheque(c), ...eff });
});
// برگشت‌خوردن چک
app.post('/api/cheques/:id/bounce', auth, (req, res) => {
  const c = req.db.cheques.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!c) return res.status(404).json({ error: 'چک پیدا نشد.' });
  c.status = 'bounced'; c.bouncedAt = nowIso();
  writeDb(req.db); res.json(publicCheque(c));
});
app.delete('/api/cheques/:id', auth, (req, res) => { req.db.cheques = req.db.cheques.filter(c => !(c.id === req.params.id && c.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
// گزارش چک‌های در جریان وصول
app.get('/api/cheques/report', auth, (req, res) => {
  const list = req.db.cheques.filter(c => c.userId === req.user.id).map(publicCheque);
  const inflow = list.filter(c => c.type === 'receivable' && c.status !== 'paid' && c.status !== 'bounced');
  const outflow = list.filter(c => c.type === 'payable' && c.status !== 'paid' && c.status !== 'bounced');
  res.json({
    receivableInFlow: inflow.reduce((s, c) => s + Number(c.amount), 0),
    payableInFlow: outflow.reduce((s, c) => s + Number(c.amount), 0),
    overdue: list.filter(c => c.computedStatus === 'overdue'),
    near: list.filter(c => c.computedStatus === 'near'),
    upcoming: list.filter(c => c.computedStatus === 'upcoming'),
    bounced: list.filter(c => c.computedStatus === 'bounced'),
    paid: list.filter(c => c.computedStatus === 'paid').length
  });
});

/* ------------------------- Persons ------------------------- */
const PERSON_FIELDS = ['name', 'phone', 'mobile', 'nationalId', 'address', 'kind', 'tags', 'note'];
function publicPerson(db, uid, p) {
  const docCount = db.transactions.filter(t => t.userId === uid && t.personId === p.id).length;
  return { ...p, balance: personBalance(db, uid, p.id), docCount };
}
app.get('/api/persons', auth, (req, res) => {
  let list = req.db.persons.filter(x => x.userId === req.user.id);
  if (req.query.kind) list = list.filter(p => (p.kind || 'person') === req.query.kind);
  res.json(list.map(x => publicPerson(req.db, req.user.id, x)));
});
app.post('/api/persons', auth, (req, res) => {
  const person = ensurePerson(req.db, req.user.id, req.body.name || 'شخص جدید');
  for (const f of PERSON_FIELDS) if (req.body[f] !== undefined && f !== 'name') person[f] = req.body[f];
  writeDb(req.db); res.json(publicPerson(req.db, req.user.id, person));
});
app.put('/api/persons/:id', auth, (req, res) => {
  const person = req.db.persons.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!person) return res.status(404).json({ error: 'شخص پیدا نشد.' });
  for (const f of PERSON_FIELDS) if (req.body[f] !== undefined) person[f] = req.body[f];
  writeDb(req.db); res.json(publicPerson(req.db, req.user.id, person));
});
app.delete('/api/persons/:id', auth, (req, res) => {
  const hasDocs = req.db.transactions.some(t => t.userId === req.user.id && t.personId === req.params.id);
  if (hasDocs && req.query.force !== '1') return res.status(409).json({ error: 'این شخص دارای سند مالی است؛ ابتدا اسناد را منتقل/حذف کنید یا با تایید اجباری حذف کنید.', hasDocs: true });
  req.db.persons = req.db.persons.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true });
});
app.get('/api/persons/:id/ledger', auth, (req, res) => res.json(req.db.transactions.filter(t => t.userId === req.user.id && t.personId === req.params.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
// ادغام اشخاص تکراری: همه اسناد و چک‌های source به target منتقل و source حذف می‌شود
app.post('/api/persons/merge', auth, (req, res) => {
  const { sourceId, targetId } = req.body || {};
  if (!sourceId || !targetId || sourceId === targetId) return res.status(400).json({ error: 'شناسه‌های نامعتبر.' });
  const src = req.db.persons.find(p => p.id === sourceId && p.userId === req.user.id);
  const tgt = req.db.persons.find(p => p.id === targetId && p.userId === req.user.id);
  if (!src || !tgt) return res.status(404).json({ error: 'شخص پیدا نشد.' });
  let moved = 0;
  req.db.transactions.forEach(t => { if (t.userId === req.user.id && t.personId === sourceId) { t.personId = targetId; t.party = tgt.name; moved++; } });
  req.db.cheques.forEach(c => { if (c.userId === req.user.id && c.personId === sourceId) { c.personId = targetId; c.personName = tgt.name; } });
  req.db.projects.forEach(p => { if (p.userId === req.user.id && p.customerId === sourceId) { p.customerId = targetId; p.customerName = tgt.name; } });
  // پر کردن فیلدهای خالی target از source
  for (const f of ['phone', 'mobile', 'nationalId', 'address']) if (!tgt[f] && src[f]) tgt[f] = src[f];
  req.db.persons = req.db.persons.filter(p => p.id !== sourceId);
  writeDb(req.db);
  res.json({ ok: true, moved, person: publicPerson(req.db, req.user.id, tgt) });
});
// ساخت پیام یادآوری بدهی برای یک شخص
app.get('/api/persons/:id/reminder', auth, (req, res) => {
  const p = req.db.persons.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!p) return res.status(404).json({ error: 'شخص پیدا نشد.' });
  const bal = personBalance(req.db, req.user.id, p.id);
  const abs = Math.abs(bal).toLocaleString('fa-IR');
  let text;
  if (bal < 0) text = `سلام ${p.name} عزیز،\nمبلغ ${abs} تومان از شما نزد ما طلب است. لطفاً در اولین فرصت تسویه بفرمایید. سپاس‌گزارم.`;
  else if (bal > 0) text = `سلام ${p.name} عزیز،\nمبلغ ${abs} تومان از طرف ما به شما بدهکار هستیم و به‌زودی تسویه خواهد شد.`;
  else text = `سلام ${p.name} عزیز، حساب شما تسویه است.`;
  const link = p.mobile || p.phone ? `https://wa.me/${String(p.mobile || p.phone).replace(/^0/, '98').replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : '';
  res.json({ text, mobile: p.mobile || p.phone || '', whatsapp: link, balance: bal });
});

/* ------------------------- Accounts (treasury cash/bank) ------------------------- */
const ACC_FIELDS = ['title', 'bank', 'accountNumber', 'card', 'sheba', 'type', 'note'];
function publicAccount(db, uid, a) {
  const computed = accountComputedBalance(db, uid, a);
  return { ...a, balance: computed, computedBalance: computed };
}
app.get('/api/accounts', auth, (req, res) => { ensureTreasuryAccount(req.db, req.user.id, 'صندوق'); writeDb(req.db); res.json(req.db.accounts.filter(x => x.userId === req.user.id).map(a => publicAccount(req.db, req.user.id, a))); });
app.post('/api/accounts', auth, (req, res) => {
  const initial = Number(req.body.balance || 0);
  const acc = { id: id('acc_'), userId: req.user.id, title: req.body.title || 'حساب جدید', bank: req.body.bank || '', accountNumber: req.body.accountNumber || '', card: req.body.card || '', sheba: req.body.sheba || '', type: req.body.type || 'bank', note: req.body.note || '', initialBalance: initial, balance: initial, createdAt: nowIso() };
  req.db.accounts.push(acc); writeDb(req.db); res.json(publicAccount(req.db, req.user.id, acc));
});
app.put('/api/accounts/:id', auth, (req, res) => {
  const acc = req.db.accounts.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!acc) return res.status(404).json({ error: 'حساب پیدا نشد.' });
  for (const f of ACC_FIELDS) if (req.body[f] !== undefined) acc[f] = req.body[f];
  if (req.body.balance !== undefined) acc.balance = Number(req.body.balance);
  writeDb(req.db); res.json(publicAccount(req.db, req.user.id, acc));
});
app.delete('/api/accounts/:id', auth, (req, res) => {
  const acc = req.db.accounts.find(x => x.id === req.params.id && x.userId === req.user.id);
  const hasFlow = req.db.treasuryMovements.some(m => m.userId === req.user.id && (m.accountId === req.params.id || m.fromAccountId === req.params.id || m.toAccountId === req.params.id));
  if (hasFlow && req.query.force !== '1') return res.status(409).json({ error: 'این حساب دارای گردش است؛ حذف اجباری لازم است.', hasFlow: true });
  req.db.accounts = req.db.accounts.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true });
});

/* ------------------------- Treasury ------------------------- */
app.get('/api/treasury', auth, (req, res) => res.json({ accounts: req.db.accounts.filter(x => x.userId === req.user.id).map(a => publicAccount(req.db, req.user.id, a)), movements: req.db.treasuryMovements.filter(x => x.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }));
app.post('/api/treasury/movement', auth, (req, res) => {
  const acc = ensureTreasuryAccount(req.db, req.user.id, req.body.account || 'صندوق اصلی');
  const val = Number(req.body.amount || 0); const type = req.body.type || 'deposit';
  const mv = { id: id('mv_'), userId: req.user.id, type, accountId: acc.id, account: acc.title, amount: val, note: req.body.note || '', date: faDate(), createdAt: nowIso() };
  req.db.treasuryMovements.push(mv);
  // سند حسابداری خودکار (تک‌منبع حقیقت) با refId گردش
  if (type === 'deposit') createJournal(req.db, req.user.id, `واریز به ${acc.title}${req.body.note ? ' - ' + req.body.note : ''}`, [{ accountTitle: acc.title, type: 'asset', debit: val }, { accountTitle: req.body.note || 'سایر درآمدها', type: 'income', credit: val }], 'treasury', mv.id);
  else createJournal(req.db, req.user.id, `برداشت از ${acc.title}${req.body.note ? ' - ' + req.body.note : ''}`, [{ accountTitle: req.body.note || 'سایر هزینه‌ها', type: 'expense', debit: val }, { accountTitle: acc.title, type: 'asset', credit: val }], 'treasury', mv.id);
  writeDb(req.db); res.json(mv);
});
// انتقال وجه با فرم کامل از حساب مبدأ به مقصد + سند حسابداری (انتقال داخلی، نه درآمد/هزینه)
app.post('/api/treasury/transfer', auth, (req, res) => {
  const from = ensureTreasuryAccount(req.db, req.user.id, req.body.from || 'صندوق اصلی');
  const to = ensureTreasuryAccount(req.db, req.user.id, req.body.to || 'صندوق اصلی');
  if (from.id === to.id) return res.status(400).json({ error: 'حساب مبدأ و مقصد یکی است.' });
  const val = Number(req.body.amount || 0);
  const mv = { id: id('mv_'), userId: req.user.id, type: 'transfer', fromAccountId: from.id, toAccountId: to.id, from: from.title, to: to.title, amount: val, note: req.body.note || '', date: faDate(), createdAt: nowIso() };
  req.db.treasuryMovements.push(mv);
  createJournal(req.db, req.user.id, `انتقال از ${from.title} به ${to.title}`, [{ accountTitle: to.title, type: 'asset', debit: val }, { accountTitle: from.title, type: 'asset', credit: val }], 'treasury', mv.id);
  writeDb(req.db); res.json(mv);
});
app.put('/api/treasury/movement/:id', auth, (req, res) => {
  const m = req.db.treasuryMovements.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!m) return res.status(404).json({ error: 'گردش پیدا نشد.' });
  if (req.body.amount !== undefined) m.amount = Number(req.body.amount);
  if (req.body.note !== undefined) m.note = req.body.note;
  // سند مرتبط را بازبساز
  removeJournalsByRef(req.db, req.user.id, m.id);
  const acc = req.db.accounts.find(a => a.id === m.accountId) || { title: m.account };
  if (m.type === 'deposit') createJournal(req.db, req.user.id, `واریز به ${m.account}`, [{ accountTitle: m.account, type: 'asset', debit: Number(m.amount) }, { accountTitle: m.note || 'سایر درآمدها', type: 'income', credit: Number(m.amount) }], 'treasury', m.id);
  else if (m.type === 'withdraw') createJournal(req.db, req.user.id, `برداشت از ${m.account}`, [{ accountTitle: m.note || 'سایر هزینه‌ها', type: 'expense', debit: Number(m.amount) }, { accountTitle: m.account, type: 'asset', credit: Number(m.amount) }], 'treasury', m.id);
  else createJournal(req.db, req.user.id, `انتقال از ${m.from} به ${m.to}`, [{ accountTitle: m.to, type: 'asset', debit: Number(m.amount) }, { accountTitle: m.from, type: 'asset', credit: Number(m.amount) }], 'treasury', m.id);
  void acc;
  writeDb(req.db); res.json(m);
});
app.delete('/api/treasury/movement/:id', auth, (req, res) => {
  removeJournalsByRef(req.db, req.user.id, req.params.id);
  req.db.treasuryMovements = req.db.treasuryMovements.filter(x => !(x.id === req.params.id && x.userId === req.user.id));
  writeDb(req.db); res.json({ ok: true });
});
// گزارش بانک/صندوق به تفکیک بازه زمانی
app.get('/api/treasury/report', auth, (req, res) => {
  const { accountId, days } = req.query;
  let m = req.db.treasuryMovements.filter(x => x.userId === req.user.id);
  if (accountId) m = m.filter(x => x.accountId === accountId || x.fromAccountId === accountId || x.toAccountId === accountId);
  if (days) { const from = Date.now() - Number(days) * 86400000; m = m.filter(x => new Date(x.createdAt).getTime() >= from); }
  const inflow = m.filter(x => x.type === 'deposit').reduce((s, x) => s + Number(x.amount), 0);
  const outflow = m.filter(x => x.type === 'withdraw').reduce((s, x) => s + Number(x.amount), 0);
  res.json({ movements: m.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), inflow, outflow, net: inflow - outflow, count: m.length });
});

/* ------------------------- Accounting ------------------------- */
app.get('/api/accounting/chart', auth, (req, res) => {
  const list = req.db.chartAccounts.filter(x => x.userId === req.user.id);
  // مانده هر سرفصل از روی اسناد
  const bal = {};
  req.db.journalEntries.filter(j => j.userId === req.user.id).forEach(j => j.lines.forEach(l => { bal[l.accountId] = (bal[l.accountId] || 0) + Number(l.debit || 0) - Number(l.credit || 0); }));
  res.json(list.map(a => ({ ...a, levelFa: LEVEL_FA[a.level] || a.level || 'کل', balance: bal[a.id] || 0, hasFlow: !!bal[a.id], childrenCount: list.filter(c => c.parentId === a.id).length })));
});
app.post('/api/accounting/chart', auth, (req, res) => {
  const type = req.body.type || 'asset';
  const a = { id: id('ca_'), userId: req.user.id, code: req.body.code || nextChartCode(req.db, req.user.id, type, req.body.parentId || ''), title: req.body.title || 'حساب جدید', type, typeFa: typeFa[type] || type, level: req.body.level || (req.body.parentId ? 'sub' : 'total'), parentId: req.body.parentId || '', createdAt: nowIso() };
  req.db.chartAccounts.push(a); writeDb(req.db); res.json(a);
});
app.put('/api/accounting/chart/:id', auth, (req, res) => {
  const a = req.db.chartAccounts.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!a) return res.status(404).json({ error: 'سرفصل پیدا نشد.' });
  for (const f of ['title', 'type', 'code', 'level', 'parentId']) if (req.body[f] !== undefined) a[f] = req.body[f];
  a.typeFa = typeFa[a.type] || a.typeFa;
  writeDb(req.db); res.json(a);
});
app.delete('/api/accounting/chart/:id', auth, (req, res) => {
  const hasFlow = req.db.journalEntries.some(j => j.userId === req.user.id && j.lines.some(l => l.accountId === req.params.id));
  const hasChildren = req.db.chartAccounts.some(x => x.userId === req.user.id && x.parentId === req.params.id);
  if (hasChildren) return res.status(409).json({ error: 'این سرفصل دارای زیرمجموعه است؛ ابتدا آن‌ها را حذف کنید.' });
  if (hasFlow && req.query.force !== '1') return res.status(409).json({ error: 'این سرفصل دارای گردش است؛ حذف اجباری لازم است.', hasFlow: true });
  req.db.chartAccounts = req.db.chartAccounts.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true });
});
// واردسازی کدینگ استاندارد
app.post('/api/accounting/chart/import-standard', auth, (req, res) => {
  const std = [
    { code: '1000', title: 'دارایی‌ها', type: 'asset', level: 'total' },
    { code: '1010', title: 'صندوق', type: 'asset', level: 'sub', parent: '1000' },
    { code: '1020', title: 'بانک', type: 'asset', level: 'sub', parent: '1000' },
    { code: '1030', title: 'حساب‌های دریافتنی', type: 'asset', level: 'sub', parent: '1000' },
    { code: '2000', title: 'بدهی‌ها', type: 'liability', level: 'total' },
    { code: '2010', title: 'حساب‌های پرداختنی', type: 'liability', level: 'sub', parent: '2000' },
    { code: '3000', title: 'سرمایه', type: 'equity', level: 'total' },
    { code: '4000', title: 'درآمدها', type: 'income', level: 'total' },
    { code: '4010', title: 'درآمد فروش', type: 'income', level: 'sub', parent: '4000' },
    { code: '4020', title: 'درآمد خدمات', type: 'income', level: 'sub', parent: '4000' },
    { code: '5000', title: 'هزینه‌ها', type: 'expense', level: 'total' },
    { code: '5010', title: 'هزینه حقوق', type: 'expense', level: 'sub', parent: '5000' },
    { code: '5020', title: 'هزینه اجاره', type: 'expense', level: 'sub', parent: '5000' },
    { code: '5030', title: 'هزینه تبلیغات', type: 'expense', level: 'sub', parent: '5000' }
  ];
  let added = 0;
  const byCode = {};
  std.forEach(s => {
    if (req.db.chartAccounts.some(x => x.userId === req.user.id && x.code === s.code)) return;
    const parentId = s.parent ? (byCode[s.parent] || (req.db.chartAccounts.find(x => x.userId === req.user.id && x.code === s.parent) || {}).id || '') : '';
    const a = { id: id('ca_'), userId: req.user.id, code: s.code, title: s.title, type: s.type, typeFa: typeFa[s.type], level: s.level, parentId, createdAt: nowIso() };
    byCode[s.code] = a.id; req.db.chartAccounts.push(a); added++;
  });
  writeDb(req.db); res.json({ ok: true, added });
});
app.get('/api/accounting/journal', auth, (req, res) => res.json(req.db.journalEntries.filter(x => x.userId === req.user.id)));
app.post('/api/accounting/journal', auth, (req, res) => {
  const lines = req.body.lines || [];
  const j = createJournal(req.db, req.user.id, req.body.description || 'سند حسابداری', lines, 'manual');
  if (req.body.status) j.status = req.body.status;
  if (req.body.date) j.date = req.body.date;
  writeDb(req.db); res.json(j);
});
app.put('/api/accounting/journal/:id', auth, (req, res) => {
  const j = req.db.journalEntries.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!j) return res.status(404).json({ error: 'سند پیدا نشد.' });
  if (req.body.description !== undefined) j.description = req.body.description;
  if (req.body.date !== undefined) j.date = req.body.date;
  if (req.body.status !== undefined) j.status = req.body.status;
  if (Array.isArray(req.body.lines)) {
    j.lines = req.body.lines.map(l => { const acc = ensureChartAccount(req.db, req.user.id, l.accountTitle, l.type || 'asset'); return { ...l, accountId: acc.id, accountTitle: acc.title, debit: Number(l.debit || 0), credit: Number(l.credit || 0) }; });
    j.totalDebit = j.lines.reduce((s, l) => s + l.debit, 0); j.totalCredit = j.lines.reduce((s, l) => s + l.credit, 0); j.balanced = j.totalDebit === j.totalCredit;
  }
  writeDb(req.db); res.json(j);
});
app.delete('/api/accounting/journal/:id', auth, (req, res) => { req.db.journalEntries = req.db.journalEntries.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
app.get('/api/accounting/trial-balance', auth, (req, res) => {
  const { days } = req.query;
  const from = days ? Date.now() - Number(days) * 86400000 : 0;
  const chart = {}; req.db.chartAccounts.filter(c => c.userId === req.user.id).forEach(c => { chart[c.id] = c; });
  const rows = {};
  req.db.journalEntries.filter(j => j.userId === req.user.id && (!from || new Date(j.createdAt).getTime() >= from)).forEach(j => j.lines.forEach(l => {
    rows[l.accountId] ||= { accountId: l.accountId, accountTitle: l.accountTitle, code: chart[l.accountId]?.code || '', typeFa: chart[l.accountId]?.typeFa || '', debit: 0, credit: 0, balance: 0 };
    rows[l.accountId].debit += Number(l.debit || 0); rows[l.accountId].credit += Number(l.credit || 0);
    rows[l.accountId].balance = rows[l.accountId].debit - rows[l.accountId].credit;
  }));
  const list = Object.values(rows).sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const totalDebit = list.reduce((s, r) => s + r.debit, 0), totalCredit = list.reduce((s, r) => s + r.credit, 0);
  res.json({ rows: list, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 });
});
app.get('/api/accounting/profit-loss', auth, (req, res) => {
  // تک‌منبع حقیقت = دفتر اسناد. درآمد = بستانکارِ حساب‌های درآمدی، هزینه = بدهکارِ حساب‌های هزینه‌ای.
  const { days } = req.query;
  const from = days ? Date.now() - Number(days) * 86400000 : 0;
  const uid = req.user.id;
  const chart = {}; req.db.chartAccounts.filter(c => c.userId === uid).forEach(c => { chart[c.id] = c; });
  const typeOf = l => (chart[l.accountId]?.type) || (l.type) || '';
  const opIncome = /(فروش|خدمات|درآمد فروش|درآمد خدمات|پروژه|فاکتور)/;
  const cogsRe = /(بهای تمام|خرید کالا|مواد اولیه)/;
  let operatingIncome = 0, nonOperatingIncome = 0, cogs = 0, operatingExpense = 0;
  const byExpenseCat = {}, byIncomeCat = {};
  req.db.journalEntries.filter(j => j.userId === uid && (!from || new Date(j.createdAt).getTime() >= from)).forEach(j => j.lines.forEach(l => {
    const t = typeOf(l);
    if (t === 'income') { const v = Number(l.credit || 0) - Number(l.debit || 0); if (v === 0) return; if (opIncome.test(l.accountTitle)) operatingIncome += v; else nonOperatingIncome += v; byIncomeCat[l.accountTitle] = (byIncomeCat[l.accountTitle] || 0) + v; }
    else if (t === 'expense') { const v = Number(l.debit || 0) - Number(l.credit || 0); if (v === 0) return; if (cogsRe.test(l.accountTitle)) cogs += v; else operatingExpense += v; byExpenseCat[l.accountTitle] = (byExpenseCat[l.accountTitle] || 0) + v; }
  }));
  const income = operatingIncome + nonOperatingIncome;
  const expense = cogs + operatingExpense;
  const grossProfit = operatingIncome - cogs;
  res.json({
    income, expense, operatingIncome, nonOperatingIncome, cogs, operatingExpense, grossProfit,
    netProfit: income - expense,
    profitMargin: income ? Math.round((income - expense) / income * 100) : 0,
    byExpenseCat: Object.entries(byExpenseCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    byIncomeCat: Object.entries(byIncomeCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  });
});
app.get('/api/accounting/cash-flow', auth, (req, res) => {
  const { days } = req.query;
  const from = days ? Date.now() - Number(days) * 86400000 : 0;
  const uid = req.user.id;
  // مجموعهٔ حساب‌های نقد/بانک
  const cashAccounts = req.db.accounts.filter(a => a.userId === uid);
  const cashIds = new Set(cashAccounts.map(a => a.id));
  const cashTitles = new Set(cashAccounts.map(a => a.title)); cashTitles.add('صندوق');
  const isCash = l => cashIds.has(l.accountId) || cashTitles.has(l.accountTitle);
  // طبقه‌بندی جریان نقد بر اساس طرف مقابلِ خط نقدی
  let operating = 0, investing = 0, financing = 0, cashIn = 0, cashOut = 0;
  const rows = [];
  req.db.journalEntries.filter(j => j.userId === uid && (!from || new Date(j.createdAt).getTime() >= from)).forEach(j => {
    const cashLines = j.lines.filter(isCash);
    if (!cashLines.length) return; // سند غیرنقدی (مثل فروش نسیه) در جریان نقد اثر ندارد
    const net = cashLines.reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0); // + ورود نقد، - خروج
    if (net === 0) return; // انتقال داخلی بین دو حساب نقد → خنثی
    const other = j.lines.find(l => !isCash(l));
    const otherType = other ? other.type : 'income';
    let cat = 'operating';
    if (otherType === 'asset') cat = 'investing';
    else if (otherType === 'liability' || otherType === 'equity') cat = 'financing';
    if (cat === 'operating') operating += net; else if (cat === 'investing') investing += net; else financing += net;
    if (net > 0) cashIn += net; else cashOut += -net;
    rows.push({ id: j.id, date: j.date, description: j.description, amount: net, category: cat });
  });
  // پیش‌بینی جریان نقد آینده بر اساس چک‌های پاس‌نشده (دریافتنی = ورود، صادره = خروج)
  const unpaid = req.db.cheques.filter(c => c.userId === uid && c.status !== 'paid' && c.status !== 'bounced');
  const expectedIn = unpaid.filter(c => c.type === 'receivable').reduce((s, c) => s + Number(c.amount), 0);
  const expectedOut = unpaid.filter(c => c.type === 'payable').reduce((s, c) => s + Number(c.amount), 0);
  const currentCash = req.db.accounts.filter(a => a.userId === uid).reduce((s, a) => s + accountComputedBalance(req.db, uid, a), 0);
  const forecast = unpaid.map(c => ({ title: c.title, dueDate: c.dueDate, daysLeft: daysUntil(c.dueDate), amount: (c.type === 'receivable' ? 1 : -1) * Number(c.amount) })).sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
  res.json({ cashIn, cashOut, netCashFlow: cashIn - cashOut, operating, investing, financing, rows: rows.sort((a, b) => b.id.localeCompare(a.id)), forecast: { currentCash, expectedIn, expectedOut, projectedCash: currentCash + expectedIn - expectedOut, items: forecast } });
});

/* ------------------------- Invoices ------------------------- */
// محاسبهٔ جمع فاکتور از روی آیتم‌ها (تعداد×قیمت − تخفیف + مالیات)
function computeInvoice(inv) {
  const items = inv.items || [];
  const subtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
  const discount = items.reduce((s, it) => s + Number(it.discount || 0), 0) + Number(inv.discount || 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * Number(inv.taxRate || 0) / 100);
  const total = taxable + tax;
  inv.subtotal = subtotal; inv.discountTotal = discount; inv.tax = tax; inv.amount = total;
  inv.balance = total - Number(inv.paid || 0);
  return inv;
}
app.get('/api/invoices', auth, (req, res) => res.json(req.db.invoices.filter(x => x.userId === req.user.id)));
app.post('/api/invoices', auth, (req, res) => {
  const num = req.db.invoices.filter(x => x.userId === req.user.id).length + 1;
  const inv = { id: id('inv_'), userId: req.user.id, number: num, type: req.body.type || 'invoice', customerName: req.body.customerName || 'مشتری', items: req.body.items || [], discount: Number(req.body.discount || 0), taxRate: Number(req.body.taxRate || 0), paid: 0, status: 'unpaid', projectId: req.body.projectId || '', date: req.body.date || faDate(), createdAt: nowIso() };
  // اگر آیتم نبود ولی مبلغ مستقیم داده شد (سازگاری قدیمی)
  if ((!inv.items.length) && req.body.amount) inv.items = [{ title: 'مبلغ کل', qty: 1, price: Number(req.body.amount), discount: 0 }];
  computeInvoice(inv);
  req.db.invoices.unshift(inv); writeDb(req.db); res.json(inv);
});
app.put('/api/invoices/:id', auth, (req, res) => {
  const inv = req.db.invoices.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!inv) return res.status(404).json({ error: 'فاکتور پیدا نشد.' });
  for (const f of ['customerName', 'items', 'discount', 'taxRate', 'type', 'date', 'projectId', 'status']) if (req.body[f] !== undefined) inv[f] = req.body[f];
  if (req.body.amount !== undefined && !(req.body.items)) inv.items = [{ title: 'مبلغ کل', qty: 1, price: Number(req.body.amount), discount: 0 }];
  computeInvoice(inv); writeDb(req.db); res.json(inv);
});
// تبدیل پیش‌فاکتور به فاکتور
app.post('/api/invoices/:id/convert', auth, (req, res) => {
  const inv = req.db.invoices.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!inv) return res.status(404).json({ error: 'فاکتور پیدا نشد.' });
  inv.type = 'invoice'; writeDb(req.db); res.json(inv);
});
// دریافت پرداخت از فاکتور → تراکنش درآمد + اثر روی حساب + سند
app.post('/api/invoices/:id/pay', auth, (req, res) => {
  const inv = req.db.invoices.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!inv) return res.status(404).json({ error: 'فاکتور پیدا نشد.' });
  const amt = Number(req.body.amount || inv.balance || 0);
  const acc = req.body.account || 'صندوق';
  ensureTreasuryAccount(req.db, req.user.id, acc);
  const tx = { id: id('tx_'), userId: req.user.id, title: `دریافت فاکتور #${toFa(inv.number)} - ${inv.customerName}`, amount: amt, type: 'income', category: 'درآمد فروش', bank: acc, personId: '', date: faDate(), method: 'Invoice Payment', refInvoice: inv.id, createdAt: nowIso() };
  req.db.transactions.push(tx); journalFromTransaction(req.db, tx);
  inv.paid = Number(inv.paid || 0) + amt; inv.balance = Number(inv.amount || 0) - inv.paid; inv.status = inv.balance <= 0 ? 'paid' : 'partial';
  writeDb(req.db); res.json({ ok: true, invoice: inv, transaction: tx });
});
app.delete('/api/invoices/:id', auth, (req, res) => { req.db.invoices = req.db.invoices.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });

/* ------------------------- Projects ------------------------- */
const DEFAULT_STAGES = ['پیش‌فاکتور', 'شروع', 'اجرا', 'تحویل', 'تسویه'];
function publicProject(db, uid, pr) {
  // درآمد و هزینهٔ مرتبط با پروژه از تراکنش‌ها + فاکتورها
  const txs = db.transactions.filter(t => t.userId === uid && t.projectId === pr.id);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const invoiced = db.invoices.filter(i => i.userId === uid && i.projectId === pr.id).reduce((s, i) => s + Number(i.amount || 0), 0);
  const profit = Number(pr.amount || 0) - expense; // سود = قرارداد − هزینه‌ها
  return { ...pr, relatedIncome: income, relatedExpense: expense, invoiced, profit, balance: Number(pr.amount || 0) - Number(pr.paid || 0), status: (Number(pr.amount || 0) - Number(pr.paid || 0)) > 0 ? 'debtor' : 'clear' };
}
app.get('/api/projects', auth, (req, res) => res.json(req.db.projects.filter(x => x.userId === req.user.id).map(p => publicProject(req.db, req.user.id, p))));
app.post('/api/projects', auth, (req, res) => {
  const customer = ensurePerson(req.db, req.user.id, req.body.customerName || 'مشتری');
  const amount = Number(req.body.amount || 0), paid = Number(req.body.paid || 0);
  const pr = { id: id('pr_'), userId: req.user.id, customerId: customer.id, customerName: customer.name, title: req.body.title || 'پروژه', amount, paid, expertName: req.body.expertName || '', stages: DEFAULT_STAGES.map(s => ({ name: s, done: false, date: '' })), createdAt: nowIso() };
  if (amount > 0) { ensurePerson(req.db, req.user.id, customer.name); req.db.transactions.push({ id: id('tx_'), userId: req.user.id, personId: customer.id, party: customer.name, projectId: pr.id, title: `مطالبه پروژه ${pr.title}`, amount, type: 'income', category: 'بستانکار / طلب', accountingSide: 'receivable', date: faDate(), method: 'Project', createdAt: nowIso() }); const lastTx = req.db.transactions[req.db.transactions.length - 1]; journalFromTransaction(req.db, lastTx); }
  req.db.projects.push(pr); writeDb(req.db); res.json(publicProject(req.db, req.user.id, pr));
});
app.put('/api/projects/:id', auth, (req, res) => {
  const pr = req.db.projects.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!pr) return res.status(404).json({ error: 'پروژه پیدا نشد.' });
  for (const f of ['title', 'customerName', 'expertName', 'stages', 'paid', 'amount']) if (req.body[f] !== undefined) pr[f] = req.body[f];
  if (req.body.amount !== undefined) pr.amount = Number(req.body.amount);
  if (req.body.paid !== undefined) pr.paid = Number(req.body.paid);
  writeDb(req.db); res.json(publicProject(req.db, req.user.id, pr));
});
// تغییر وضعیت یک مرحله
app.post('/api/projects/:id/stage', auth, (req, res) => {
  const pr = req.db.projects.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!pr) return res.status(404).json({ error: 'پروژه پیدا نشد.' });
  pr.stages = pr.stages || DEFAULT_STAGES.map(s => ({ name: s, done: false, date: '' }));
  const st = pr.stages[req.body.index]; if (st) { st.done = !st.done; st.date = st.done ? faDate() : ''; }
  writeDb(req.db); res.json(publicProject(req.db, req.user.id, pr));
});
app.delete('/api/projects/:id', auth, (req, res) => { req.db.projects = req.db.projects.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });

/* ------------------------- Experts & settlements ------------------------- */
app.get('/api/experts', auth, (req, res) => res.json(req.db.experts.filter(x => x.userId === req.user.id)));
app.post('/api/experts', auth, (req, res) => { const ex = ensureExpert(req.db, req.user.id, req.body.name || 'کارشناس'); ex.role = req.body.role || ex.role; if (req.body.commissionRate !== undefined) ex.commissionRate = Number(req.body.commissionRate); writeDb(req.db); res.json(ex); });
app.put('/api/experts/:id', auth, (req, res) => { const ex = req.db.experts.find(x => x.id === req.params.id && x.userId === req.user.id); if (!ex) return res.status(404).json({ error: 'کارشناس پیدا نشد.' }); Object.assign(ex, req.body); writeDb(req.db); res.json(ex); });
app.delete('/api/experts/:id', auth, (req, res) => { req.db.experts = req.db.experts.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
app.get('/api/expert-settlements', auth, (req, res) => res.json(req.db.expertSettlements.filter(x => x.userId === req.user.id)));
app.post('/api/expert-settlements', auth, (req, res) => { const ex = ensureExpert(req.db, req.user.id, req.body.expertName || 'کارشناس'); const acc = req.body.account || 'صندوق'; const amt = Number(req.body.amount || 0); const st = { id: id('set_'), userId: req.user.id, expertId: ex.id, expertName: ex.name, amount: amt, type: req.body.type || 'payment', status: 'paid', account: acc, note: req.body.note || '', date: faDate(), createdAt: nowIso() }; req.db.expertSettlements.push(st); ex.balance += st.type === 'payment' ? -amt : amt;
  // پرداخت به کارشناس = هزینه + اثر روی حساب + سند حسابداری
  if (st.type === 'payment' && amt > 0) { ensureTreasuryAccount(req.db, req.user.id, acc); const tx = { id: id('tx_'), userId: req.user.id, title: `تسویه کارشناس ${ex.name}`, amount: amt, type: 'expense', category: 'تسویه کارشناسان', bank: acc, date: faDate(), method: 'Expert Settlement', createdAt: nowIso() }; req.db.transactions.push(tx); journalFromTransaction(req.db, tx); st.txId = tx.id; }
  writeDb(req.db); res.json(st); });
// به‌روزرسانی کارشناس (درصد پورسانت)
// گزارش تسویه کارشناسان با بازه زمانی + محاسبه پورسانت از پروژه‌ها
app.get('/api/experts/report', auth, (req, res) => {
  const { days } = req.query; const from = days ? Date.now() - Number(days) * 86400000 : 0; const uid = req.user.id;
  const rows = req.db.experts.filter(e => e.userId === uid).map(e => {
    const setts = req.db.expertSettlements.filter(s => s.userId === uid && s.expertId === e.id && (!from || new Date(s.createdAt).getTime() >= from));
    const paid = setts.filter(s => s.type === 'payment').reduce((s2, s) => s2 + Number(s.amount), 0);
    // پورسانت محاسبه‌شده از پروژه‌های این کارشناس
    const projects = req.db.projects.filter(p => p.userId === uid && p.expertName === e.name);
    const commissionBase = projects.reduce((s, p) => s + Number(p.amount || 0), 0);
    const commission = Math.round(commissionBase * Number(e.commissionRate || 0) / 100);
    return { id: e.id, name: e.name, commissionRate: Number(e.commissionRate || 0), commissionBase, commission, paid, balance: commission - paid, settlements: setts.length };
  });
  res.json({ rows, totalPaid: rows.reduce((s, r) => s + r.paid, 0), totalCommission: rows.reduce((s, r) => s + r.commission, 0) });
});

/* ------------------------- Categories ------------------------- */
app.get('/api/categories', auth, (req, res) => res.json(req.db.categories));
app.post('/api/categories', auth, (req, res) => { const name = String(req.body.name || '').trim(); if (name && !req.db.categories.includes(name)) req.db.categories.push(name); writeDb(req.db); res.json(req.db.categories); });
app.put('/api/categories/:name', auth, (req, res) => { const old = decodeURIComponent(req.params.name); const idx = req.db.categories.indexOf(old); if (idx >= 0) req.db.categories[idx] = req.body.name || old; writeDb(req.db); res.json(req.db.categories); });
app.delete('/api/categories/:name', auth, (req, res) => {
  const old = decodeURIComponent(req.params.name);
  const used = req.db.transactions.some(t => t.userId === req.user.id && t.category === old);
  if (used && req.query.force !== '1') return res.status(409).json({ error: 'این دسته‌بندی در تراکنش‌ها استفاده شده؛ برای حذف اجباری force=1 بفرستید.', used: true });
  req.db.categories = req.db.categories.filter(c => c !== old); writeDb(req.db); res.json(req.db.categories);
});

/* ------------------------- Assistant training & AI rules ------------------------- */
app.get('/api/training', auth, (req, res) => res.json(req.db.assistantTraining.filter(x => x.userId === req.user.id)));
app.post('/api/training', auth, (req, res) => { const tr = { id: id('tr_'), userId: req.user.id, phrase: req.body.phrase || '', meaning: req.body.meaning || '', createdAt: nowIso() }; req.db.assistantTraining.push(tr); writeDb(req.db); res.json(tr); });
app.get('/api/ai/rules', auth, (req, res) => res.json(req.db.aiRules.filter(x => x.userId === req.user.id)));
app.post('/api/ai/rules', auth, (req, res) => { const rule = { id: id('rule_'), userId: req.user.id, pattern: req.body.pattern || '', action: req.body.action || '', createdAt: nowIso() }; req.db.aiRules.unshift(rule); writeDb(req.db); res.json(rule); });

/* ------------------------- Push subscriptions (PWA foundation) ------------------------- */
app.post('/api/push/subscribe', auth, (req, res) => { req.db.pushSubscriptions.push({ id: id('sub_'), userId: req.user.id, subscription: req.body, createdAt: nowIso() }); writeDb(req.db); res.json({ ok: true }); });

/* ------------------------- Assistant command ------------------------- */
app.post('/api/assistant/command', auth, (req, res) => {
  const db = req.db, user = req.user;
  const result = parseLocalCommand(db, user, req.body.text || '');
  if (result.needsClarification) return res.json(result);
  const pushUndo = (entry) => { db.undoStack ||= []; db.undoStack.push({ ...entry, userId: user.id, at: nowIso() }); if (db.undoStack.length > 50) db.undoStack.shift(); };
  const persistParsed = (r, note) => {
    if (r.action === 'transaction_parsed') {
      const parsed = r.parsed;
      if (Number(parsed.amount) > 0) {
        const tx = { id: id('tx_'), userId: user.id, title: parsed.title || 'تراکنش', amount: Number(parsed.amount || 0), type: parsed.type || 'expense', category: parsed.category || 'سایر', bank: parsed.bank || (parsed.accountingSide ? '' : 'صندوق'), party: parsed.party || '', personId: parsed.personId || '', accountingSide: parsed.accountingSide || '', date: faDate(), method: 'Assistant Local', note, createdAt: nowIso() };
        db.transactions.push(tx); journalFromTransaction(db, tx);
        pushUndo({ kind: 'create', collection: 'transactions', id: tx.id });
        r.transaction = tx; r.txId = tx.id; r.sideSuggestions = parsed.sideSuggestions;
        const sideFa = tx.accountingSide === 'receivable' ? '(طلب از ' + (tx.party || 'او') + ')' : tx.accountingSide === 'payable' ? '(بدهی به ' + (tx.party || 'او') + ')' : '';
        r.message = `ثبت شد: ${tx.title}\nمبلغ ${Number(tx.amount).toLocaleString('fa-IR')} تومان ${sideFa}`;
        r.canUndo = true;
      }
    }
    return r;
  };
  // حذف تاییدشده (مرحله دوم)
  if (result.action === 'confirm_delete') { writeDb(db); return res.json(result); }
  if (result.action === 'multi_command') { result.results = result.results.map(r => persistParsed(r, req.body.text || '')); writeDb(db); return res.json({ ...result, message: `${result.results.length.toLocaleString('fa-IR')} عملیات پردازش و ثبت شد.` }); }
  if (result.action === 'transaction_parsed') { persistParsed(result, req.body.text || ''); writeDb(db); return res.json(result); }
  if (['cheque_created','project_created','expert_settlement','treasury_movement','treasury_transfer','cheque_paid','edited','cheque_edited','settled'].includes(result.action)) result.canUndo = true;
  writeDb(db); res.json(result);
});

// تایید حذف (مرحله دوم) — با قابلیت بازیابی
app.post('/api/assistant/confirm-delete', auth, (req, res) => {
  const db = req.db, uid = req.user.id; const { kind, id: targetId } = req.body || {};
  db.undoStack ||= [];
  if (kind === 'transaction') { const tx = db.transactions.find(t => t.id === targetId && t.userId === uid); if (!tx) return res.status(404).json({ error: 'تراکنش پیدا نشد.' }); db.undoStack.push({ kind: 'delete', collection: 'transactions', record: tx, userId: uid, at: nowIso() }); db.transactions = db.transactions.filter(t => t.id !== targetId); writeDb(db); return res.json({ action: 'deleted', canUndo: true, message: `تراکنش «${tx.title}» حذف شد. برای بازگرداندن «بازگردان» را بزنید.` }); }
  if (kind === 'cheque') { const ch = db.cheques.find(c => c.id === targetId && c.userId === uid); if (!ch) return res.status(404).json({ error: 'چک پیدا نشد.' }); db.undoStack.push({ kind: 'delete', collection: 'cheques', record: ch, userId: uid, at: nowIso() }); db.cheques = db.cheques.filter(c => c.id !== targetId); writeDb(db); return res.json({ action: 'deleted', canUndo: true, message: `چک «${ch.title}» حذف شد. برای بازگرداندن «بازگردان» را بزنید.` }); }
  res.status(400).json({ error: 'نوع نامعتبر.' });
});

// بازگردانی آخرین عملیات (undo / restore)
app.post('/api/assistant/undo', auth, (req, res) => {
  const db = req.db, uid = req.user.id; db.undoStack ||= [];
  const idx = [...db.undoStack].reverse().findIndex(e => e.userId === uid);
  if (idx < 0) return res.json({ message: 'عملیاتی برای بازگردانی وجود ندارد.' });
  const realIdx = db.undoStack.length - 1 - idx;
  const entry = db.undoStack.splice(realIdx, 1)[0];
  if (entry.kind === 'create') { db[entry.collection] = (db[entry.collection] || []).filter(x => x.id !== entry.id); writeDb(db); return res.json({ action: 'undone', message: 'آخرین ثبت لغو شد.' }); }
  if (entry.kind === 'delete') { (db[entry.collection] ||= []).push(entry.record); writeDb(db); return res.json({ action: 'restored', message: `«${entry.record.title || 'رکورد'}» بازگردانده شد.` }); }
  writeDb(db); res.json({ message: 'انجام شد.' });
});

// یادگیری از اصلاح کاربر: ذخیره الگوی متن→دسته/شخص برای دفعات بعد
app.post('/api/assistant/correction', auth, (req, res) => {
  const db = req.db, uid = req.user.id; const { text, field, value } = req.body || {};
  if (!text || !field || !value) return res.status(400).json({ error: 'داده ناقص.' });
  db.corrections ||= [];
  db.corrections.push({ id: id('cor_'), userId: uid, text: String(text).slice(0, 120), field, value, createdAt: nowIso() });
  // همچنین به‌صورت یک قاعده آموزشی ذخیره می‌شود
  db.assistantTraining.push({ id: id('tr_'), userId: uid, phrase: String(text).slice(0, 60), meaning: `${field}=${value}`, createdAt: nowIso() });
  writeDb(db);
  res.json({ ok: true, message: 'یاد گرفتم؛ دفعهٔ بعد بهتر تشخیص می‌دهم.' });
});

/* ------------------------- SMS ------------------------- */
app.get('/api/sms', auth, (req, res) => res.json(req.db.smsInbox.filter(s => s.userId === req.user.id)));
app.post('/api/sms/parse', auth, (req, res) => {
  const text = req.body.text || '';
  const parsed = detectTransaction(text);
  const sms = { id: id('sms_'), userId: req.user.id, sender: req.body.sender || 'BANK', text, parsed, status: 'pending', createdAt: nowIso() };
  req.db.smsInbox.unshift(sms); writeDb(req.db); res.json(sms);
});

/* ------------------------- AI parsing & analysis ------------------------- */
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
    const content = await callAi(req.db, [{ role: 'user', content: `با این داده‌های تراکنش پاسخ تحلیلی فارسی بده. سوال: ${q}\nداده‌ها:${JSON.stringify(txs.slice(0, 150))}` }]);
    if (content) return res.json({ answer: content });
  } catch {}
  const totalExpense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const rest = txs.filter(t => /رستوران|کافه/.test(t.category)).reduce((s, t) => s + Number(t.amount), 0);
  const payable = txs.filter(t => /بدهکار|بدهی/.test(t.category)).reduce((s, t) => s + Number(t.amount), 0);
  const receivable = txs.filter(t => /بستانکار|طلب/.test(t.category)).reduce((s, t) => s + Number(t.amount), 0);
  const biggest = [...txs].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  const byCat = txs.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + Number(t.amount); return acc; }, {});
  const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c}: ${Number(v).toLocaleString('fa-IR')} تومان`).join('، ');
  // داده‌های چک و خزانه برای پاسخ‌های تحلیلی
  const cheques = req.db.cheques.filter(c => c.userId === req.user.id);
  const accounts = req.db.accounts.filter(a => a.userId === req.user.id);
  let answer = `خلاصه مالی شما: ${txs.length.toLocaleString('fa-IR')} تراکنش، درآمد ${totalIncome.toLocaleString('fa-IR')} تومان، هزینه ${totalExpense.toLocaleString('fa-IR')} تومان و مانده ${(totalIncome - totalExpense).toLocaleString('fa-IR')} تومان.`;
  if (/چک/.test(q)) {
    const overdue = cheques.filter(c => chequeComputedStatus(c) === 'overdue');
    const near = cheques.filter(c => chequeComputedStatus(c) === 'near');
    const inflow = cheques.filter(c => c.type === 'receivable' && c.status !== 'paid').reduce((s, c) => s + Number(c.amount), 0);
    const outflow = cheques.filter(c => c.type === 'payable' && c.status !== 'paid').reduce((s, c) => s + Number(c.amount), 0);
    answer = `وضعیت چک‌ها: ${cheques.filter(c => c.status !== 'paid').length.toLocaleString('fa-IR')} چک در جریان.\nچک‌های دریافتنی پاس‌نشده: ${inflow.toLocaleString('fa-IR')} تومان\nچک‌های پرداختنی پاس‌نشده: ${outflow.toLocaleString('fa-IR')} تومان`;
    if (overdue.length) answer += `\n⚠️ ${overdue.length.toLocaleString('fa-IR')} چک معوق (گذشته از سررسید).`;
    if (near.length) answer += `\n🔔 ${near.length.toLocaleString('fa-IR')} چک نزدیک سررسید (تا ۷ روز).`;
  } else if (/صندوق|حساب|موجودی|بانک|خزانه/.test(q)) {
    const total = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    answer = `موجودی حساب‌ها و صندوق‌ها: ${total.toLocaleString('fa-IR')} تومان\n` + (accounts.map(a => `• ${a.title}: ${Number(a.balance || 0).toLocaleString('fa-IR')}`).join('\n') || 'حسابی ثبت نشده.');
  } else if (/سود|زیان|سودده|سود و زیان|حاشیه/.test(q)) {
    const inc = totalIncome, exp = totalExpense; const net = inc - exp;
    answer = `صورت سود و زیان: درآمد ${inc.toLocaleString('fa-IR')} تومان، هزینه ${exp.toLocaleString('fa-IR')} تومان، سود/زیان خالص ${net.toLocaleString('fa-IR')} تومان (حاشیه سود ${inc ? Math.round(net / inc * 100) : 0}٪).`;
  } else if (/تراز|دفتر کل|سرفصل/.test(q)) {
    const rows = {}; req.db.journalEntries.filter(j => j.userId === req.user.id).forEach(j => j.lines.forEach(l => { rows[l.accountId] = (rows[l.accountId] || 0) + Number(l.debit || 0) - Number(l.credit || 0); }));
    const td = req.db.journalEntries.filter(j => j.userId === req.user.id).reduce((s, j) => s + Number(j.totalDebit || 0), 0);
    const tc = req.db.journalEntries.filter(j => j.userId === req.user.id).reduce((s, j) => s + Number(j.totalCredit || 0), 0);
    answer = `تراز آزمایشی: ${Object.keys(rows).length.toLocaleString('fa-IR')} حساب فعال، جمع بدهکار ${td.toLocaleString('fa-IR')} و جمع بستانکار ${tc.toLocaleString('fa-IR')} تومان. ${Math.abs(td - tc) < 1 ? 'تراز است ✓' : 'عدم توازن!'}`;
  } else if (/رستوران|کافه/.test(q)) answer = `مجموع هزینه‌های رستوران و کافه شما ${rest.toLocaleString('fa-IR')} تومان است.`;
  else if (/بده|طلب|بستان/.test(q)) answer = `جمع طلب/بستانکاری شما ${receivable.toLocaleString('fa-IR')} تومان و جمع بدهی/بدهکاری شما ${payable.toLocaleString('fa-IR')} تومان است.`;
  else if (/بزرگترین|بزرگ‌ترین/.test(q) && biggest) answer = `بزرگ‌ترین تراکنش ثبت‌شده: ${biggest.title} به مبلغ ${Number(biggest.amount).toLocaleString('fa-IR')} تومان در دسته ${biggest.category}.`;
  else if (/کجا|دسته|بیشتر/.test(q)) answer = `بیشترین مبالغ ثبت‌شده مربوط به این دسته‌هاست: ${topCats || 'داده کافی وجود ندارد'}.`;
  res.json({ answer });
});

/* ------------------------- Dashboard analytics ------------------------- */
// تبدیل ISO به «سال-ماه شمسی» برای گروه‌بندی دوره‌ای
function faYearMonth(iso) {
  try {
    const d = new Date(iso);
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit' }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value || '';
    const m = parts.find(p => p.type === 'month')?.value || '';
    return `${y}-${m}`;
  } catch { return ''; }
}
const faMonthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function faMonthLabel(ym) { const m = parseInt(String(ym).split('-')[1] || '1', 10); return faMonthNames[(m - 1 + 12) % 12] || ym; }

// GET /api/analytics/summary?range=month|quarter|year|all & account & category & personId
app.get('/api/analytics/summary', auth, (req, res) => {
  const { range = 'all', category, personId, type, bank, projectId, expertId } = req.query;
  const db = req.db, uid = req.user.id;
  let txs = db.transactions.filter(t => t.userId === uid);
  const now = Date.now();
  const spanDays = range === 'week' ? 7 : range === 'month' ? 31 : range === 'quarter' ? 93 : range === 'year' ? 366 : null;
  if (spanDays) { const from = now - spanDays * 86400000; txs = txs.filter(t => new Date(t.createdAt).getTime() >= from); }
  if (category) txs = txs.filter(t => t.category === category);
  if (personId) txs = txs.filter(t => t.personId === personId);
  if (type) txs = txs.filter(t => t.type === type);
  if (bank) txs = txs.filter(t => (t.bank || '') === bank);
  if (projectId) txs = txs.filter(t => t.projectId === projectId);

  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  // سری زمانی ماهانه + مانده تجمعی
  const monthMap = {};
  txs.forEach(t => {
    const ym = faYearMonth(t.createdAt); if (!ym) return;
    monthMap[ym] ||= { ym, label: faMonthLabel(ym), income: 0, expense: 0 };
    if (t.type === 'income') monthMap[ym].income += Number(t.amount); else monthMap[ym].expense += Number(t.amount);
  });
  let run = 0;
  const series = Object.values(monthMap).sort((a, b) => a.ym.localeCompare(b.ym)).slice(-12).map(m => { run += (m.income - m.expense); return { ...m, net: m.income - m.expense, cumulative: run }; });

  // دسته‌بندی هزینه‌ها
  const catMap = {};
  txs.filter(t => t.type === 'expense').forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount); });
  const byCategory = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // درآمد به تفکیک دسته (برای نمودار درآمد)
  const incCatMap = {};
  txs.filter(t => t.type === 'income').forEach(t => { incCatMap[t.category] = (incCatMap[t.category] || 0) + Number(t.amount); });
  const incomeByCategory = Object.entries(incCatMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // به تفکیک روش ثبت
  const methodMap = {};
  txs.forEach(t => { const m = t.method || 'سایر'; methodMap[m] = (methodMap[m] || 0) + 1; });
  const byMethod = Object.entries(methodMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  // اشخاص برتر بر اساس مانده
  const topPersons = db.persons.filter(p => p.userId === uid).map(p => ({ name: p.name, balance: personBalance(db, uid, p.id) })).filter(p => p.balance !== 0).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 6);

  // پروژه‌ها بر اساس مانده
  const topProjects = db.projects.filter(p => p.userId === uid).map(p => ({ name: p.title, amount: Number(p.amount || 0), paid: Number(p.paid || 0), balance: Number(p.balance || 0) })).sort((a, b) => b.balance - a.balance).slice(0, 6);

  // خزانه: مانده هر حساب
  const accounts = db.accounts.filter(a => a.userId === uid).map(a => ({ name: a.title, value: Number(a.balance || 0) }));

  res.json({ income, expense, balance: income - expense, count: txs.length, series, byCategory, incomeByCategory, byMethod, topPersons, topProjects, accounts });
});

// گزینه‌های فیلتر داشبورد
app.get('/api/analytics/filters', auth, (req, res) => {
  const db = req.db, uid = req.user.id;
  const txs = db.transactions.filter(t => t.userId === uid);
  res.json({
    categories: db.categories,
    banks: Array.from(new Set(txs.map(t => t.bank).filter(Boolean))),
    persons: db.persons.filter(p => p.userId === uid).map(p => ({ id: p.id, name: p.name })),
    projects: db.projects.filter(p => p.userId === uid).map(p => ({ id: p.id, name: p.title })),
    experts: db.experts.filter(e => e.userId === uid).map(e => ({ id: e.id, name: e.name }))
  });
});

// GET /api/analytics/compare  — مقایسه ماه/فصل/سال جاری با دوره قبل
app.get('/api/analytics/compare', auth, (req, res) => {
  const txs = req.db.transactions.filter(t => t.userId === req.user.id);
  const now = Date.now();
  const periods = { month: 31, quarter: 93, year: 366 };
  const out = {};
  for (const [key, days] of Object.entries(periods)) {
    const span = days * 86400000;
    const curFrom = now - span, prevFrom = now - 2 * span;
    const sum = (from, to) => txs.filter(t => { const ts = new Date(t.createdAt).getTime(); return ts >= from && ts < to; });
    const cur = sum(curFrom, now), prev = sum(prevFrom, curFrom);
    const cInc = cur.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const cExp = cur.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const pInc = prev.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const pExp = prev.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const pct = (c, p) => p === 0 ? (c > 0 ? 100 : 0) : Math.round(((c - p) / p) * 100);
    out[key] = { income: { current: cInc, previous: pInc, changePct: pct(cInc, pInc) }, expense: { current: cExp, previous: pExp, changePct: pct(cExp, pExp) }, net: { current: cInc - cExp, previous: pInc - pExp, changePct: pct(cInc - cExp, pInc - pExp) } };
  }
  res.json(out);
});

// GET /api/analytics/alerts — هشدارهای مالی هوشمند
app.get('/api/analytics/alerts', auth, (req, res) => {
  const db = req.db, uid = req.user.id;
  const txs = db.transactions.filter(t => t.userId === uid);
  const alerts = [];
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  if (expense > income && income > 0) alerts.push({ level: 'danger', icon: 'trend', title: 'هزینه بیشتر از درآمد', text: `مخارج شما ${(expense - income).toLocaleString('fa-IR')} تومان از درآمد بیشتر است.` });

  // مقایسه هزینه ۳۱ روز اخیر با ۳۱ روز قبل‌تر
  const now = Date.now(), span = 31 * 86400000;
  const recent = txs.filter(t => new Date(t.createdAt).getTime() >= now - span && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const prior = txs.filter(t => { const ts = new Date(t.createdAt).getTime(); return ts >= now - 2 * span && ts < now - span && t.type === 'expense'; }).reduce((s, t) => s + Number(t.amount), 0);
  if (prior > 0 && recent > prior * 1.25) alerts.push({ level: 'warning', icon: 'up', title: 'افزایش چشمگیر هزینه', text: `هزینه‌های این ماه ${Math.round((recent / prior - 1) * 100)}٪ بیشتر از ماه قبل است.` });

  // چک‌های نزدیک سررسید
  const nearCheques = db.cheques.filter(c => c.userId === uid && c.status !== 'paid' && /۱۴۰|1404|1405|1406/.test(String(c.dueDate)));
  if (nearCheques.length) alerts.push({ level: 'warning', icon: 'cheque', title: 'چک نزدیک سررسید', text: `${nearCheques.length.toLocaleString('fa-IR')} چک پاس‌نشده در فهرست شماست؛ سررسیدها را بررسی کنید.` });

  // بدهکاران بزرگ
  const debtors = db.persons.filter(p => p.userId === uid).map(p => ({ name: p.name, balance: personBalance(db, uid, p.id) })).filter(p => p.balance < 0).sort((a, b) => a.balance - b.balance);
  if (debtors.length) alerts.push({ level: 'info', icon: 'person', title: 'بدهی به اشخاص', text: `بیشترین بدهی: ${debtors[0].name} (${Math.abs(debtors[0].balance).toLocaleString('fa-IR')} تومان).` });

  // طلب از مشتریان
  const creditors = db.persons.filter(p => p.userId === uid).map(p => ({ name: p.name, balance: personBalance(db, uid, p.id) })).filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance);
  if (creditors.length) alerts.push({ level: 'success', icon: 'money', title: 'مطالبات قابل وصول', text: `بیشترین طلب: ${creditors[0].name} (${creditors[0].balance.toLocaleString('fa-IR')} تومان).` });

  if (!alerts.length) alerts.push({ level: 'info', icon: 'ok', title: 'وضعیت پایدار', text: 'هشدار مالی فعالی وجود ندارد. عالی پیش می‌روید!' });
  res.json(alerts);
});

// گزارش سن مطالبات (Aging) — بدهکاران بر اساس قدمت آخرین سند بدهکاری
app.get('/api/receivables/aging', auth, (req, res) => {
  const db = req.db, uid = req.user.id;
  const now = Date.now();
  const buckets = { '۰ تا ۳۰ روز': 0, '۳۱ تا ۶۰ روز': 0, '۶۱ تا ۹۰ روز': 0, 'بیش از ۹۰ روز': 0 };
  const rows = [];
  db.persons.filter(p => p.userId === uid).forEach(p => {
    const bal = personBalance(db, uid, p.id);
    if (bal <= 0) return; // فقط طلبکاری‌ها (مشتری بدهکار به ما)
    const txs = db.transactions.filter(t => t.userId === uid && t.personId === p.id && t.accountingSide === 'receivable');
    const last = txs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const days = last ? Math.floor((now - new Date(last.createdAt).getTime()) / 86400000) : 0;
    const bucket = days <= 30 ? '۰ تا ۳۰ روز' : days <= 60 ? '۳۱ تا ۶۰ روز' : days <= 90 ? '۶۱ تا ۹۰ روز' : 'بیش از ۹۰ روز';
    buckets[bucket] += bal;
    rows.push({ id: p.id, name: p.name, mobile: p.mobile || p.phone || '', balance: bal, days, bucket });
  });
  rows.sort((a, b) => b.days - a.days);
  const total = rows.reduce((s, r) => s + r.balance, 0);
  res.json({ buckets: Object.entries(buckets).map(([name, value]) => ({ name, value })), rows, total, count: rows.length });
});

// تنظیمات شخصی‌سازی داشبورد (انتخاب نمودارها و KPIها توسط کاربر)
const DEFAULT_DASH = {
  kpis: ['balance', 'income', 'expense', 'profit', 'receivable', 'payable', 'count', 'projects'],
  charts: ['trendBar', 'netLine', 'expenseDonut', 'incomeDonut', 'cumulativeArea', 'topPersons'],
  compare: true, alerts: true
};
app.get('/api/dashboard/prefs', auth, (req, res) => {
  const p = req.db.dashboardPrefs?.[req.user.id];
  res.json(p ? { ...DEFAULT_DASH, ...p } : DEFAULT_DASH);
});
app.put('/api/dashboard/prefs', auth, (req, res) => {
  req.db.dashboardPrefs ||= {};
  req.db.dashboardPrefs[req.user.id] = { ...DEFAULT_DASH, ...(req.db.dashboardPrefs[req.user.id] || {}), ...req.body };
  writeDb(req.db);
  res.json(req.db.dashboardPrefs[req.user.id]);
});
// تنظیمات برندینگ فاکتور
const DEFAULT_BRANDING = { company: 'کسب‌وکار من', phone: '', address: '', logo: '', footer: 'با تشکر از خرید شما', color: '#3b38a0' };
app.get('/api/branding', auth, (req, res) => { req.db.branding ||= {}; res.json({ ...DEFAULT_BRANDING, ...(req.db.branding[req.user.id] || {}) }); });
app.put('/api/branding', auth, (req, res) => { req.db.branding ||= {}; req.db.branding[req.user.id] = { ...DEFAULT_BRANDING, ...(req.db.branding[req.user.id] || {}), ...req.body }; writeDb(req.db); res.json(req.db.branding[req.user.id]); });

/* ------------------------- Admin ------------------------- */
app.get('/api/admin/stats', auth, admin, (req, res) => {
  const txs = req.db.transactions;
  const byCat = {};
  txs.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount); });
  res.json({ users: req.db.users.map(publicUser), counts: { users: req.db.users.length, transactions: txs.length, cheques: req.db.cheques.length, sms: req.db.smsInbox.length }, totals: { income: txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0), expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0) }, byCat });
});
app.get('/api/admin/settings', auth, admin, (req, res) => res.json(sanitizeSettingsForClient(req.db.settings)));
app.put('/api/admin/settings', auth, admin, (req, res) => {
  const next = { ...req.db.settings, ...req.body };
  if (!req.body.aiToken || req.body.aiToken === '********') next.aiToken = req.db.settings.aiToken;
  req.db.settings = next; writeDb(req.db); res.json(sanitizeSettingsForClient(next));
});
app.post('/api/admin/test-ai', auth, admin, async (req, res) => {
  try {
    const answer = await callAi(req.db, [{ role: 'user', content: req.body.prompt || 'سلام، فقط بگو اتصال برقرار است.' }]);
    res.json({ ok: true, answer: answer || 'حالت Local فعال است؛ اتصال خارجی تست نشد.' });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

/* ------------------------- SPA fallback ------------------------- */
app.use((req, res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.sendFile(path.join(DIST, 'index.html')); });

app.listen(PORT, () => console.log(`Dast Rast API running on http://localhost:${PORT}`));
