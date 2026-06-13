import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeFa, faToEnDigits, wordsToNumber, parseAmount, personBalance, parsePastDateFa, parsePersianDueDate, parseTimeRangeFa, dateToJalaliStr, jalaliToGregorian, jalaliStrToDate, daysUntil, compactName, cleanPersonName, extractPersonName, pickParty, detectBank, detectTransaction, detectMeta, REPAY_GAVE_RE, REPAY_TOOK_RE, CONTEXT_PERSON_RE, CONTEXT_AMOUNT_RE, buildAnalyticsAnswer, parseBankSms, handleAssistantExtras, budgetStatusList, monthSpent, evaluateBudgetAndCustomAlerts, monthStartTs } from './nlp.js';
import { answerNLQ, runReport, proactiveInsights, engineQuality } from './nlq.js';
import { handleCrmCommands, crmAlerts, getCrmSettings, setCrmSettings, creditInfo, lateFeeList, applyLateFee, dueReminders, markReminderSent, collectionsReport, personStatement, PERSON_GROUPS, lateFeeFor, allGroups, addGroup, removeGroup } from './crm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT || 8787;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ------------------------- امنیت: کلید مشترک، رمزنگاری، بکاپ ------------------------- */
// کلید در data/secret.key ذخیره می‌شود تا «هر دو سرور» (express و standalone) یک کلید داشته باشند
// → توکن ورود و توکن رمزنگاری‌شدهٔ AI بین دو سرور سازگار می‌ماند.
const SECRET_PATH = path.join(DATA_DIR, 'secret.key');
function getSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try { const s = fs.readFileSync(SECRET_PATH, 'utf8').trim(); if (s) return s; } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_PATH, s, 'utf8');
  return s;
}
const JWT_SECRET = getSecret();
const ENC_KEY = crypto.createHash('sha256').update(JWT_SECRET).digest();
// رمزنگاری اطلاعات حساس (توکن AI) با AES-256-GCM
function encryptSecret(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'enc:v1:' + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + enc.toString('base64');
}
function decryptSecret(stored) {
  if (!stored) return '';
  if (!String(stored).startsWith('enc:v1:')) return String(stored); // سازگاری با مقدار قدیمی متنی
  try {
    const [, , ivB, tagB, dataB] = String(stored).split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB, 'base64'));
    d.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8');
  } catch { return ''; }
}
// بکاپ خودکار دیتابیس: حداکثر هر ۶ ساعت یک نسخه، نگهداری ۱۴ نسخهٔ آخر
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function listBackups() {
  try { return fs.readdirSync(BACKUP_DIR).filter(f => /^db-\d+\.json$/.test(f)).sort(); } catch { return []; }
}
function makeBackup(force = false) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    if (!fs.existsSync(DB_PATH)) return null;
    const files = listBackups();
    const last = files[files.length - 1];
    const now = Date.now();
    if (!force && last) { const m = /^db-(\d+)\.json$/.exec(last); if (m && now - Number(m[1]) < 6 * 3600 * 1000) return null; }
    const name = `db-${now}.json`;
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, name));
    const all = listBackups();
    while (all.length > 14) fs.unlinkSync(path.join(BACKUP_DIR, all.shift()));
    return name;
  } catch { return null; }
}
// سیاست رمز عبور: حداقل ۸ کاراکتر شامل حرف و عدد
function passwordIssue(pw) {
  const p = String(pw || '');
  if (p.length < 8) return 'رمز عبور باید حداقل ۸ کاراکتر باشد.';
  if (!/[A-Za-zآ-ی]/.test(p) || !/\d/.test(p)) return 'رمز عبور باید شامل حرف و عدد باشد.';
  return '';
}
// محدودسازی تلاش ورود: ۵ تلاش ناموفق → ۱۵ دقیقه قفل
const loginFails = new Map();
function loginLocked(key) { const e = loginFails.get(key); return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 60000) : 0; }
function loginFailed(key) { const e = loginFails.get(key) || { count: 0, until: 0 }; e.count += 1; if (e.count >= 5) { e.until = Date.now() + 15 * 60000; e.count = 0; } loginFails.set(key, e); }
function loginOk(key) { loginFails.delete(key); }
// اعتبارسنجی مبلغ: عدد متناهی، نامنفی و در محدودهٔ منطقی
function badAmount(v) { const n = Number(v); return !Number.isFinite(n) || n < 0 || n > 1e15; }
// لاگ تغییرات (Audit Trail) — آخرین ۲۰۰۰ رویداد نگه داشته می‌شود
function recordAudit(db, userId, action, detail = '') {
  db.auditLog ||= [];
  db.auditLog.push({ id: id('au_'), userId, action, detail: String(detail).slice(0, 200), at: nowIso() });
  if (db.auditLog.length > 2000) db.auditLog.splice(0, db.auditLog.length - 2000);
}

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
  db.categoryMeta ||= {};   // متادیتای دسته‌بندی‌ها: { [userId]: { [name]: { color, icon, parent } } }
  db.auditLog ||= [];       // لاگ تغییرات (Audit Trail)
  db.assistantContext ||= {}; // حافظهٔ کوتاه‌مدت دستیار: { [userId]: { personId, personName, amount } }
  db.budgets ||= [];        // بودجه‌بندی ماهانه: { userId, category(''=کل), amount, period }
  db.goals ||= [];          // اهداف پس‌انداز: { userId, title, target, saved, deadline, done }
  db.customAlerts ||= [];   // هشدارهای سفارشی: { userId, kind, category, threshold, enabled }
  db.crmSettings ||= {};    // تنظیمات CRM هر کاربر: lateFee + reminderCadence
  db.personGroups ||= {};   // گروه‌های سفارشی اشخاص هر کاربر
  db.savedReports ||= [];   // گزارش‌های ذخیره‌شدهٔ کاربر (saved views)
  db.categories = (db.categories && db.categories.length) ? db.categories : ['حمل و نقل','خوراکی و سوپرمارکت','رستوران و کافه','حقوق و درآمد','اقساط و بدهی','بدهکار / بدهی','بستانکار / طلب','مسکن و اجاره','قبوض و خدمات','درمان و سلامت','پوشاک','آموزش','سفر','تفریح و اشتراک','سرمایه‌گذاری','سایر'];
  db.assistantTraining ||= [];
  db.settings ||= seed.settings;
  return db;
}
function readDb() {
  if (!fs.existsSync(DB_PATH)) writeDb(seed);
  return normalizeDb(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
}
// نوشتن اتمیک: ابتدا فایل موقت، سپس rename (در یک فایل‌سیستم، rename اتمیک است)
// → اگر وسط نوشتن برق برود یا پروسه بمیرد، db.json هرگز خراب/نصفه نمی‌ماند.
// قفل درون‌پروسه‌ای: جلوگیری از تداخل نوشتن در مسیرهای async (مثل endpoints با await)
let _writing = false;
const _writeQueue = [];
function _atomicWrite(json) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, DB_PATH);
}
function writeDb(db) {
  makeBackup(); // بکاپ خودکار (حداکثر هر ۶ ساعت یک نسخه؛ قبل از بازنویسی فایل)
  const json = JSON.stringify(db, null, 2);
  if (_writing) { _writeQueue.push(json); return; }
  _writing = true;
  try {
    _atomicWrite(json);
    while (_writeQueue.length) _atomicWrite(_writeQueue.shift());
  } finally { _writing = false; }
}
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

/* NLP helpers از ماژول مشترک server/nlp.js وارد می‌شوند */
function sanitizeSettingsForClient(settings) {
  const copy = { ...settings };
  copy.aiToken = '';
  copy.aiTokenSet = Boolean(settings?.aiToken);
  return copy;
}
async function callAi(db, messages, json = false, imageBase64 = null) {
  const s = db.settings || {};
  const aiToken = decryptSecret(s.aiToken); // توکن به‌صورت رمزنگاری‌شده ذخیره می‌شود
  if (!aiToken || s.aiProvider === 'local') return null;
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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${aiToken}` },
    body: JSON.stringify({ model: s.aiModel, temperature: Number(s.temperature ?? 0.2), response_format: json ? { type: 'json_object' } : undefined, messages: finalMessages })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || 'خطا در ارتباط با ارائه‌دهنده هوش مصنوعی');
  return data?.choices?.[0]?.message?.content || '';
}

/* ------------------------- Domain helpers ------------------------- */
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
// personBalance از ماژول مشترک ./nlp.js import می‌شود (تک‌منبع حقیقت)
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
// نام واحد برای صندوق: «صندوق اصلی»، «صندوق مغازه» و... همگی به حساب «صندوق» map می‌شوند
// تا دو حساب صندوق موازی ساخته نشود (رفع باگ دوگانگی صندوق/صندوق اصلی)
function canonicalAccountTitle(title = '') {
  const t = String(title).trim();
  if (!t || /^صندوق(\s|$)/.test(t) || t === 'نقد' || t === 'کش') return 'صندوق';
  return t;
}
function ensureTreasuryAccount(db, userId, title = 'صندوق') {
  title = canonicalAccountTitle(title);
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
  let raw = normalizeFa(String(text || ''));
  const ctx = (db.assistantContext ||= {})[user.id] || {};
  // بودجه / اهداف پس‌انداز / هشدار سفارشی — قبل از گیت سوال (چون «بودجه چقدر مونده؟» هم سوال است)
  const extras = handleAssistantExtras(db, user.id, raw, { id, nowIso });
  if (extras) return extras;
  // دستورات CRM: سقف اعتبار، گروه، تخفیف اختصاصی، جریمه، امتیاز، یادآوری، وصولی، صورتحساب
  const crm = handleCrmCommands(db, user, raw, { id, nowIso, faDate, journalFromTransaction, findPerson: (nm) => { const c = findPersonCandidates(db, user.id, nm); return c.find(p => p.name === nm) || c[0] || null; } });
  if (crm) return crm;
  const meta = detectMeta(raw);
  // ۱) سوال تحلیلی → پاسخ گزارش، نه ثبت (رفع: «به علی چقدر بدهکارم؟» دیگر تراکنش نمی‌سازد)
  if (meta.question) {
    const persons = db.persons.filter(p => p.userId === user.id).map(p => ({ name: p.name, balance: personBalance(db, user.id, p.id) }));
    const accounts = db.accounts.filter(a => a.userId === user.id).map(a => ({ title: a.title, balance: accountComputedBalance(db, user.id, a) }));
    const txsAll = db.transactions.filter(t => t.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // موتور NLQ ترکیبی: metric × بازه × بُعد × تجمیع → پاسخ + جدول/نمودار کوچک
    const nlq = answerNLQ(raw, { txs: txsAll, persons, accounts, categories: db.categories || [] });
    // سوالات چک هنوز توسط موتور قدیمی پوشش بهتری دارند
    if (/چک/.test(raw)) {
      const answer = buildAnalyticsAnswer(raw, { txs: txsAll, cheques: db.cheques.filter(c => c.userId === user.id), accounts, persons });
      return { action: 'analytics_answer', message: answer };
    }
    return { action: 'analytics_answer', message: nlq.answer, table: nlq.table || null, chart: nlq.chart || null, parsedQuery: nlq.parsed };
  }
  // ۲) نفی → هیچ ثبتی انجام نشود
  if (meta.negation) {
    return { action: 'noop', message: 'متوجه شدم — چون گفتی این کار «انجام نشده»، چیزی ثبت نکردم. هر وقت انجام شد بگو تا ثبت کنم.' };
  }
  // ۳) آینده/شرطی → یادآوری به‌جای ثبت فوری
  if (meta.future) {
    const due = parsePersianDueDate(raw);
    return { action: 'noop', message: `این یک برنامهٔ آینده است؛ تراکنشی ثبت نکردم${due ? ` (تاریخ موردنظر: ${toFa(due)})` : ''}. وقتی انجامش دادی همین جمله را به‌صورت گذشته بگو تا ثبت شود.` };
  }
  // ۴) ارز خارجی → پشتیبانی نشده، شفاف بگو
  if (meta.foreignCurrency) {
    return { action: 'noop', message: 'مبلغ ارزی (دلار/یورو/کریپتو) تشخیص دادم. ثبت ارزی هنوز پشتیبانی نمی‌شود؛ لطفاً معادل تومانی را بگو (مثلا: «معادل ۶ میلیون تومن از حسین گرفتم»).' };
  }
  // ۵) ارجاع ضمیری: «بهش دادم» / «همون شخص قبلی» → شخص قبلی از حافظه
  let contextPerson = null;
  if (CONTEXT_PERSON_RE.test(raw) && ctx.personId) {
    contextPerson = db.persons.find(p => p.id === ctx.personId && p.userId === user.id) || null;
  }
  if (CONTEXT_AMOUNT_RE.test(raw) && ctx.amount) raw += ` ${ctx.amount} تومان`;
  for (const tr of db.assistantTraining.filter(x => x.userId === user.id)) { if (tr.phrase && raw.includes(normalizeFa(tr.phrase))) raw += ' ' + (tr.meaning || ''); }
  // قوانین کاربر + قوانین عمومی ادمین؛ غیرفعال‌ها نادیده، مرتب بر اساس وزن (وزن بالاتر = اولویت بیشتر)
  const rules = db.aiRules
    .filter(x => (x.userId === user.id || x.scope === 'global') && x.enabled !== false)
    .sort((a, b) => Number(b.weight || 10) - Number(a.weight || 10));
  for (const rule of rules) { if (rule.pattern && raw.includes(rule.pattern)) raw += ' ' + (rule.action || ''); }
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
    // اگر نام شخص گفته شده، چک همان شخص را پاس کن
    let pn = extractPersonName(raw);
    if (!pn) { const cm = /چک\s+([آ-یA-Za-z]+(?:\s+[آ-یA-Za-z]+){0,2}?)\s*(?:رو|را)?\s*(?:پاس|وصول)/.exec(raw); if (cm) pn = cleanPersonName(cm[1]); }
    let pool = db.cheques.filter(c => c.userId === user.id && c.status !== 'paid' && c.status !== 'bounced');
    let matchedByName = false;
    if (pn) { const f = pool.filter(c => (c.personName || '').includes(pn)); if (f.length) { pool = f; matchedByName = true; } }
    const ch = pool.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!ch) return { action: 'noop', message: 'چک پاس‌نشده‌ای پیدا نشد.' };
    // تایید قبلی کاربر؟ («بله/تایید/آره» یا اشارهٔ مستقیم به همین چک از مرحلهٔ قبل)
    const confirmed = /(بله|آره|اره|تایید|مطمئن)/.test(raw) && ctx.pendingChequeId === ch.id;
    if (matchedByName || confirmed) {
      delete ctx.pendingChequeId; db.assistantContext[user.id] = ctx;
      const eff = payChequeEffect(db, ch, '');
      return { action: 'cheque_paid', cheque: ch, transaction: eff.tx, canUndo: true, message: `چک «${ch.title}» پاس شد. مبلغ ${Number(ch.amount).toLocaleString('fa-IR')} تومان ${ch.type === 'receivable' ? 'به' : 'از'} ${eff.account.title} اعمال و سند حسابداری ثبت شد.` };
    }
    // بدون نام → تایید دومرحله‌ای: مشخصات چک کاندید را نشان بده
    ctx.pendingChequeId = ch.id; db.assistantContext[user.id] = ctx;
    return { action: 'confirm_cheque_pay', target: { kind: 'cheque_pay', id: ch.id, title: ch.title }, message: `نام چک را نگفتی. آیا منظورت این چک است؟\n«${ch.title}» — ${Number(ch.amount).toLocaleString('fa-IR')} تومان${ch.personName ? ` — ${ch.personName}` : ''}${ch.dueDate ? ` — سررسید ${ch.dueDate}` : ''}\nاگر بله، بگو «بله چک رو پاس کن» یا نام شخص را بگو.` };
  }
  if (/انتقال/.test(raw) && /از/.test(raw) && /به/.test(raw)) {
    const fromName = extractAfter(raw, ['از']) || 'صندوق'; const toName = extractAfter(raw, ['به']) || 'صندوق';
    const from = ensureTreasuryAccount(db, user.id, fromName), to = ensureTreasuryAccount(db, user.id, toName);
    const mv = { id: id('mv_'), userId: user.id, type: 'transfer', fromAccountId: from.id, toAccountId: to.id, from: from.title, to: to.title, amount: Number(amount || 0), note: raw, date: faDate(), createdAt: nowIso() }; db.treasuryMovements.push(mv);
    createJournal(db, user.id, `انتقال از ${from.title} به ${to.title}`, [{ accountTitle: to.title, type: 'asset', debit: Number(amount || 0) }, { accountTitle: from.title, type: 'asset', credit: Number(amount || 0) }], 'treasury', mv.id);
    return { action: 'treasury_transfer', movement: mv, message: `انتقال ${Number(amount || 0).toLocaleString('fa-IR')} تومان از ${from.title} به ${to.title} ثبت شد.` };
  }
  if (/واریز|برداشت/.test(raw) && /(صندوق|حساب|بانک|کیف)/.test(raw)) {
    const isDeposit = /واریز/.test(raw); const accName = extractAfter(raw, ['به', 'از']) || detectBank(raw) || 'صندوق'; const acc = ensureTreasuryAccount(db, user.id, accName);
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
  const personName = (contextPerson || CONTEXT_PERSON_RE.test(raw)) ? '' : extractPersonName(raw);
  const candidates = personName ? findPersonCandidates(db, user.id, personName) : [];
  const exact = candidates.find(p => p.name === personName);
  // رفتار مطابق خواستهٔ کاربر: همیشه به بهترین گزینه تخصیص بده (دقیق، یا اولین هم‌نام،
  // یا ساخت شخص جدید)، و اگر افراد هم‌نام دیگری بودند آن‌ها را به‌صورت دکمهٔ اصلاح برگردان.
  // اگر نام صریح نبود ولی ارجاع ضمیری بود («بهش»، «همون شخص قبلی») → شخص حافظه
  const person = personName ? (exact || candidates[0] || ensurePerson(db, user.id, personName)) : contextPerson;
  let alternatives;
  if (person && personName) {
    const sameName = findPersonCandidates(db, user.id, personName).filter(p => p.id !== person.id);
    if (sameName.length) alternatives = sameName.map(p => ({ ...p, balance: personBalance(db, user.id, p.id) }));
  }
  if (/چک/.test(raw)) {
    const receivable = /(گرفتم|دریافتی|دریافت|از)/.test(raw) && !/(دادم|صادر|پرداختنی)/.test(raw);
    const payable = /(دادم|صادر|پرداختنی|به)/.test(raw) && !/(گرفتم|دریافتی)/.test(raw);
    const type = receivable && !payable ? 'receivable' : 'payable';
    const bank = detectBank(raw);
    const dueDate = parsePersianDueDate(raw) || 'بدون تاریخ';
    if (!Number(amount)) return { action: 'noop', message: 'مبلغ چک را متوجه نشدم. لطفاً مبلغ را هم بگو؛ مثلا: «چک ۵ میلیونی از احمد گرفتم برای ۱۵ مهر».' };
    const chq = { id: id('chq_'), userId: user.id, personId: person?.id || '', personName: person?.name || personName || '', title: `چک ${type === 'receivable' ? 'دریافتی' : 'صادره'} ${person?.name ? `- ${person.name}` : ''}`, amount: Number(amount || 0), dueDate, type, status: 'pending', bank, createdAt: nowIso() };
    db.cheques.push(chq);
    return { action: 'cheque_created', cheque: chq, message: `چک ${type === 'receivable' ? 'دریافتی' : 'صادره'} به مبلغ ${Number(amount || 0).toLocaleString('fa-IR')} تومان برای ${dueDate} ثبت شد.` };
  }
  // بازپرداخت: «بدهیم به علی رو پس دادم» (ما دادیم) / «علی بدهیش رو پس داد» (او داد = وصول)
  if (REPAY_GAVE_RE.test(raw) || REPAY_TOOK_RE.test(raw)) {
    let pr = person || contextPerson;
    if (!pr) { // نام در ابتدای جمله بدون حرف اضافه: «علی ۱ میلیون از بدهیش رو پس داد»
      const ps = db.persons.filter(p => p.userId === user.id).sort((a, b) => b.name.length - a.name.length);
      pr = ps.find(p => raw.includes(p.name)) || null;
    }
    if (pr) {
      const bal = personBalance(db, user.id, pr.id);
      let gave = REPAY_GAVE_RE.test(raw) && !REPAY_TOOK_RE.test(raw); // ما پرداخت کردیم
      // سازگاری جهت با ماندهٔ واقعی — جلوگیری از خطای حساب‌وکتاب
      if (gave && bal >= 0) {
        if (bal > 0) return { action: 'noop', message: `شما به ${pr.name} بدهی ندارید؛ برعکس، او ${bal.toLocaleString('fa-IR')} تومان به شما بدهکار است. اگر او پرداخت کرده بگو: «${pr.name} بدهیش رو پس داد».` };
        return { action: 'noop', message: `حساب ${pr.name} تسویه است؛ بدهی‌ای برای بازپرداخت وجود ندارد.` };
      }
      if (!gave && bal <= 0) {
        if (bal < 0) return { action: 'noop', message: `طلبی از ${pr.name} ندارید؛ برعکس، شما ${Math.abs(bal).toLocaleString('fa-IR')} تومان به او بدهکارید. اگر شما پرداخت کردی بگو: «بدهیم به ${pr.name} رو پس دادم».` };
        return { action: 'noop', message: `حساب ${pr.name} تسویه است؛ طلبی برای وصول وجود ندارد.` };
      }
      let amt = amount > 0 ? amount : Math.abs(bal);
      if (amt > Math.abs(bal)) amt = Math.abs(bal); // بیش از مانده تسویه نشود
      const tx = { id: id('tx_'), userId: user.id, personId: pr.id, party: pr.name, title: gave ? `بازپرداخت بدهی به ${pr.name}` : `وصول طلب از ${pr.name}`, amount: amt, type: gave ? 'expense' : 'income', category: 'تسویه حساب', accountingSide: 'settlement', settlementDelta: gave ? amt : -amt, bank: 'صندوق', date: faDate(), method: 'Assistant Repayment', createdAt: nowIso() };
      db.transactions.push(tx); journalFromTransaction(db, tx);
      db.assistantContext[user.id] = { personId: pr.id, personName: pr.name, amount: amt };
      const remain = Math.abs(bal) - amt;
      return { action: 'settled', transaction: tx, canUndo: true, message: (gave ? `بازپرداخت ${amt.toLocaleString('fa-IR')} تومان به ${pr.name} ثبت شد و از بدهی شما کم شد.` : `وصول ${amt.toLocaleString('fa-IR')} تومان از ${pr.name} ثبت شد و از طلب شما کم شد.`) + (remain > 0 ? `\nماندهٔ ${gave ? 'بدهی' : 'طلب'}: ${remain.toLocaleString('fa-IR')} تومان.` : '\nحساب تسویه شد. ✅') };
    }
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
  // رفع باگ «دستور پردازش شد با عملیات ناقص»: بدون مبلغ هیچ ثبتی انجام نمی‌شود؛
  // به‌جای آن سوال شفاف می‌پرسیم (slot-filling ساده).
  if (!Number(tx.amount)) {
    return { action: 'noop', needAmount: true, message: `متوجه شدم می‌خواهی «${tx.title.slice(0, 40)}» را ثبت کنی، اما مبلغ را پیدا نکردم. لطفاً مبلغ را هم بگو؛ مثلا: «${tx.title.slice(0, 25)} ۵۰ تومن».` };
  }
  // تاریخ گذشته در جمله («دیروز ۵۰ تومن دادم») → ثبت با همان تاریخ واقعی
  const pastDate = parsePastDateFa(raw);
  if (pastDate) { tx.pastDate = pastDate.toISOString(); tx.pastDateFa = new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(pastDate); }
  // ذخیرهٔ حافظهٔ کوتاه‌مدت برای ارجاع‌های بعدی («بهش»، «همون مبلغ»)
  db.assistantContext[user.id] = { personId: person?.id || ctx.personId || '', personName: person?.name || ctx.personName || '', amount: Number(tx.amount) || ctx.amount || 0 };
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
  if (db.ledgerVersion !== 4) {
    // ادغام حساب‌های «صندوق اصلی» در «صندوق» (رفع دوگانگی صندوق)
    for (const u of db.users) {
      const variants = db.accounts.filter(a => a.userId === u.id && /^صندوق\s+/.test(a.title));
      if (!variants.length) continue;
      const main = db.accounts.find(a => a.userId === u.id && a.title === 'صندوق') || (() => { const a = { id: id('acc_'), userId: u.id, title: 'صندوق', bank: '', accountNumber: '', card: '', sheba: '', initialBalance: 0, type: 'cash', createdAt: nowIso() }; db.accounts.push(a); return a; })();
      for (const v of variants) {
        main.initialBalance = Number(main.initialBalance || 0) + Number(v.initialBalance || 0);
        db.treasuryMovements.filter(m => m.userId === u.id).forEach(m => {
          if (m.accountId === v.id) { m.accountId = main.id; m.account = 'صندوق'; }
          if (m.fromAccountId === v.id) { m.fromAccountId = main.id; m.from = 'صندوق'; }
          if (m.toAccountId === v.id) { m.toAccountId = main.id; m.to = 'صندوق'; }
        });
        db.journalEntries.filter(j => j.userId === u.id).forEach(j => j.lines.forEach(l => { if (l.accountId === v.id || l.accountTitle === v.title) { l.accountTitle = 'صندوق'; delete l.accountId; } }));
        db.transactions.filter(t => t.userId === u.id && t.bank === v.title).forEach(t => { t.bank = 'صندوق'; });
        db.cheques.filter(c => c.userId === u.id && c.paidAccount === v.title).forEach(c => { c.paidAccount = 'صندوق'; });
        db.accounts = db.accounts.filter(a => a.id !== v.id);
      }
    }
    rebuildAutoJournals(db); db.ledgerVersion = 4;
  }
  writeDb(db);
}

/* ------------------------- Auth ------------------------- */
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'نام، ایمیل و رمز عبور لازم است.' });
  const pwErr = passwordIssue(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return res.status(400).json({ error: 'فرمت ایمیل صحیح نیست.' });
  const db = readDb();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) return res.status(409).json({ error: 'این ایمیل قبلاً ثبت شده است.' });
  const role = db.users.length === 0 ? 'admin' : 'user';
  const user = { id: id('u_'), name, email: email.toLowerCase(), passwordHash: hashPassword(password), role, createdAt: nowIso() };
  db.users.push(user); recordAudit(db, user.id, 'auth.register', email); writeDb(db);
  res.json({ token: signToken({ uid: user.id }), user: publicUser(user) });
});
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const key = String(email || '').toLowerCase();
  const lockedMin = loginLocked(key);
  if (lockedMin) return res.status(429).json({ error: `به‌دلیل تلاش‌های ناموفق، ورود تا ${lockedMin.toLocaleString('fa-IR')} دقیقه دیگر قفل است.` });
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === key);
  if (!user || !verifyPassword(password || '', user.passwordHash)) { loginFailed(key); return res.status(401).json({ error: 'ایمیل یا رمز عبور اشتباه است.' }); }
  loginOk(key);
  recordAudit(db, user.id, 'auth.login', email); writeDb(db);
  res.json({ token: signToken({ uid: user.id }), user: publicUser(user) });
});
// تغییر رمز عبور (با رمز فعلی) — برای همهٔ کاربران
app.post('/api/auth/change-password', auth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!verifyPassword(oldPassword || '', req.user.passwordHash)) return res.status(401).json({ error: 'رمز فعلی اشتباه است.' });
  const pwErr = passwordIssue(newPassword);
  if (pwErr) return res.status(400).json({ error: pwErr });
  req.user.passwordHash = hashPassword(newPassword);
  recordAudit(req.db, req.user.id, 'auth.change-password');
  writeDb(req.db);
  res.json({ ok: true, message: 'رمز عبور با موفقیت تغییر کرد.' });
});
app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user), settings: sanitizeSettingsForClient(req.db.settings) }));

/* ------------------------- Transactions ------------------------- */
app.get('/api/transactions', auth, (req, res) => res.json(req.db.transactions.filter(t => t.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.post('/api/transactions', auth, (req, res) => {
  const b = req.body;
  if (badAmount(b.amount)) return res.status(400).json({ error: 'مبلغ نامعتبر است.' });
  if (b.type && !['income', 'expense'].includes(b.type)) return res.status(400).json({ error: 'نوع تراکنش نامعتبر است.' });
  const tx = { id: id('tx_'), userId: req.user.id, title: b.title || 'تراکنش', amount: Number(b.amount || 0), type: b.type || 'expense', category: b.category || 'سایر', bank: b.bank || '', personId: b.personId || '', party: b.party || '', projectId: b.projectId || '', accountingSide: b.accountingSide || '', date: b.date || faDate(), method: b.method || 'Manual', note: b.note || '', createdAt: nowIso() };
  // برای تراکنش‌های نقدی، حساب خزانه را تضمین کن تا در لیست خزانه دیده شود
  if (!tx.accountingSide && (tx.bank || tx.type)) ensureTreasuryAccount(req.db, req.user.id, tx.bank || 'صندوق');
  req.db.transactions.push(tx); journalFromTransaction(req.db, tx); writeDb(req.db); res.json(tx);
});
app.put('/api/transactions/:id', auth, (req, res) => {
  const tx = req.db.transactions.find(t => t.id === req.params.id && t.userId === req.user.id);
  if (!tx) return res.status(404).json({ error: 'تراکنش پیدا نشد.' });
  if (req.body.amount !== undefined && badAmount(req.body.amount)) return res.status(400).json({ error: 'مبلغ نامعتبر است.' });
  // فیلدهای سیستمی قابل بازنویسی از بیرون نیستند (id/userId/createdAt)
  const { id: _id, userId: _uid, createdAt: _c, ...safe } = req.body || {};
  Object.assign(tx, safe); if (req.body.amount !== undefined) tx.amount = Number(req.body.amount);
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
  const acc = ensureTreasuryAccount(db, c.userId, accountTitle || (c.bank || 'صندوق'));
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
  if (badAmount(b.amount)) return res.status(400).json({ error: 'مبلغ نامعتبر است.' });
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
const PERSON_FIELDS = ['name', 'phone', 'mobile', 'nationalId', 'address', 'kind', 'tags', 'note', 'group', 'creditLimit', 'discountPct'];
function publicPerson(db, uid, p) {
  const docCount = db.transactions.filter(t => t.userId === uid && t.personId === p.id).length;
  const balance = personBalance(db, uid, p.id);
  const lim = Number(p.creditLimit || 0);
  return { ...p, balance, docCount, creditLimit: lim, group: p.group || 'normal', discountPct: Number(p.discountPct || 0), overLimit: lim > 0 && balance > lim, limitPct: lim > 0 ? Math.round(Math.max(0, balance) / lim * 100) : null };
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
  // bal > 0 یعنی او به ما بدهکار است (ما طلبکاریم) → درخواست تسویه از او
  if (bal > 0) text = `سلام ${p.name} عزیز،\nیادآوری دوستانه: مبلغ ${abs} تومان از حساب شما نزد ما باقی است. لطفاً در اولین فرصت تسویه بفرمایید. سپاس‌گزارم 🙏`;
  else if (bal < 0) text = `سلام ${p.name} عزیز،\nمبلغ ${abs} تومان از طرف ما به شما بدهکار هستیم و به‌زودی تسویه خواهد شد.`;
  else text = `سلام ${p.name} عزیز، حساب شما تسویه است.`;
  const link = p.mobile || p.phone ? `https://wa.me/${String(p.mobile || p.phone).replace(/^0/, '98').replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : '';
  res.json({ text, mobile: p.mobile || p.phone || '', whatsapp: link, balance: bal });
});

/* ------------------------- CRM: صورتحساب، اعتبار، جریمه، یادآوری، وصولی ------------------------- */
// صورتحساب رسمی شخص (Statement) با گردش و ماندهٔ تجمعی — برای چاپ با سربرگ
app.get('/api/persons/:id/statement', auth, (req, res) => {
  const p = req.db.persons.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!p) return res.status(404).json({ error: 'شخص پیدا نشد.' });
  res.json(personStatement(req.db, req.user.id, p));
});
// امتیاز اعتباری شخص
app.get('/api/persons/:id/credit', auth, (req, res) => {
  const p = req.db.persons.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!p) return res.status(404).json({ error: 'شخص پیدا نشد.' });
  res.json({ ...creditInfo(req.db, req.user.id, p.id), name: p.name, creditLimit: Number(p.creditLimit || 0), group: p.group || 'normal' });
});
// تنظیمات CRM (سیاست جریمه + زمان‌بندی یادآوری)
app.get('/api/crm/settings', auth, (req, res) => res.json(getCrmSettings(req.db, req.user.id)));
app.put('/api/crm/settings', auth, (req, res) => { const s = setCrmSettings(req.db, req.user.id, req.body || {}); recordAudit(req.db, req.user.id, 'crm.settings'); writeDb(req.db); res.json(s); });
// جریمه‌های دیرکرد قابل‌ثبت + اعمال جریمه
app.get('/api/crm/late-fees', auth, (req, res) => res.json({ policy: getCrmSettings(req.db, req.user.id).lateFee, list: lateFeeList(req.db, req.user.id) }));
app.post('/api/crm/late-fees/:personId/apply', auth, (req, res) => {
  const st = getCrmSettings(req.db, req.user.id);
  if (!st.lateFee.enabled) return res.status(400).json({ error: 'سیاست جریمهٔ دیرکرد غیرفعال است.' });
  const p = req.db.persons.find(x => x.id === req.params.personId && x.userId === req.user.id);
  if (!p) return res.status(404).json({ error: 'شخص پیدا نشد.' });
  const r = applyLateFee(req.db, req.user.id, p, { id, nowIso, faDate, journalFromTransaction });
  if (!r) return res.status(400).json({ error: 'این شخص جریمه‌ای ندارد.' });
  if (r.blocked) return res.status(409).json({ error: `جریمهٔ این شخص ${r.sinceDays} روز پیش ثبت شده؛ ${r.nextInDays} روز دیگر دوباره امکان‌پذیر است (گارد جریمهٔ مضاعف).` });
  recordAudit(req.db, req.user.id, 'crm.late-fee', `${p.name}: ${r.info.fee}`);
  writeDb(req.db); res.json({ ok: true, transaction: r.tx, fee: r.info.fee, overdueDays: r.info.overdueDays });
});
// یادآوری‌های زمان‌بندی‌شدهٔ در نوبت + ثبت ارسال
app.get('/api/crm/reminders', auth, (req, res) => res.json({ cadence: getCrmSettings(req.db, req.user.id).reminderCadence, due: dueReminders(req.db, req.user.id) }));
app.post('/api/crm/reminders/:personId/sent', auth, (req, res) => {
  if (!markReminderSent(req.db, req.user.id, req.params.personId, nowIso)) return res.status(404).json({ error: 'شخص پیدا نشد.' });
  writeDb(req.db); res.json({ ok: true });
});
// گزارش وصولی‌ها + پیش‌بینی وصول
app.get('/api/crm/collections', auth, (req, res) => res.json(collectionsReport(req.db, req.user.id)));
// گروه‌های اشخاص (پیش‌فرض + سفارشی)
app.get('/api/person-groups', auth, (req, res) => res.json(allGroups(req.db, req.user.id)));
app.post('/api/person-groups', auth, (req, res) => {
  const g = addGroup(req.db, req.user.id, req.body.label || '');
  if (!g) return res.status(400).json({ error: 'نام گروه لازم است.' });
  writeDb(req.db); res.json(g);
});
app.delete('/api/person-groups/:key', auth, (req, res) => {
  if (!removeGroup(req.db, req.user.id, req.params.key)) return res.status(404).json({ error: 'گروه سفارشی پیدا نشد (گروه‌های پیش‌فرض حذف نمی‌شوند).' });
  writeDb(req.db); res.json({ ok: true });
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
  const acc = ensureTreasuryAccount(req.db, req.user.id, req.body.account || 'صندوق');
  if (badAmount(req.body.amount)) return res.status(400).json({ error: 'مبلغ نامعتبر است.' });
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
  const from = ensureTreasuryAccount(req.db, req.user.id, req.body.from || 'صندوق');
  const to = ensureTreasuryAccount(req.db, req.user.id, req.body.to || 'صندوق');
  if (from.id === to.id) return res.status(400).json({ error: 'حساب مبدأ و مقصد یکی است.' });
  if (badAmount(req.body.amount) || !Number(req.body.amount)) return res.status(400).json({ error: 'مبلغ نامعتبر است.' });
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
  // تخفیف اختصاصی مشتری (قیمت‌گذاری گروهی): درصد ثبت‌شده روی پروفایل شخص خودکار اعمال می‌شود
  const customer = req.db.persons.find(x => x.userId === req.user.id && x.name === inv.customerName);
  if (customer && Number(customer.discountPct || 0) > 0 && !req.body.skipPersonalDiscount) {
    const subtotal = inv.items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price || 0), 0);
    const pd = Math.round(subtotal * Number(customer.discountPct) / 100);
    inv.discount = Number(inv.discount || 0) + pd;
    inv.personalDiscount = pd; inv.personalDiscountPct = Number(customer.discountPct);
  }
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
app.post('/api/categories', auth, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name && !req.db.categories.includes(name)) req.db.categories.push(name);
  // متادیتا (رنگ/آیکون/والد) در صورت ارسال ذخیره می‌شود
  if (name && (req.body.color !== undefined || req.body.icon !== undefined || req.body.parent !== undefined)) {
    req.db.categoryMeta ||= {}; req.db.categoryMeta[req.user.id] ||= {};
    const meta = req.db.categoryMeta[req.user.id][name] || {};
    if (req.body.color !== undefined) meta.color = String(req.body.color).slice(0, 16);
    if (req.body.icon !== undefined) meta.icon = String(req.body.icon).slice(0, 8);
    if (req.body.parent !== undefined) meta.parent = req.body.parent && req.body.parent !== name && req.db.categories.includes(req.body.parent) ? req.body.parent : '';
    req.db.categoryMeta[req.user.id][name] = meta;
  }
  recordAudit(req.db, req.user.id, 'category.create', name);
  writeDb(req.db); res.json(req.db.categories);
});
// متادیتای دسته‌بندی‌ها (رنگ/آیکون/والد) + تعداد استفاده در تراکنش‌های همین کاربر
app.get('/api/categories/meta', auth, (req, res) => {
  const meta = (req.db.categoryMeta || {})[req.user.id] || {};
  const usage = {};
  req.db.transactions.filter(t => t.userId === req.user.id).forEach(t => { usage[t.category] = (usage[t.category] || 0) + 1; });
  res.json({ meta, usage });
});
// تغییر نام دسته: همگام‌سازی کامل با تراکنش‌ها، اصلاحات یادگرفته‌شده، سرفصل‌ها و متادیتا
app.put('/api/categories/:name', auth, (req, res) => {
  const old = decodeURIComponent(req.params.name);
  const next = String(req.body.name || '').trim() || old;
  const idx = req.db.categories.indexOf(old);
  if (idx < 0) return res.status(404).json({ error: 'دسته‌بندی پیدا نشد.' });
  if (next !== old && req.db.categories.includes(next)) return res.status(409).json({ error: 'دسته‌ای با این نام از قبل وجود دارد.' });
  req.db.categories[idx] = next;
  req.db.categoryMeta ||= {}; req.db.categoryMeta[req.user.id] ||= {};
  const userMeta = req.db.categoryMeta[req.user.id];
  if (next !== old) {
    // ۱) تراکنش‌های کاربر با دستهٔ قدیمی → نام جدید
    req.db.transactions.filter(t => t.userId === req.user.id && t.category === old).forEach(t => { t.category = next; });
    // ۲) خطوط اسناد حسابداری که سرفصل‌شان از روی نام دسته ساخته شده → هماهنگ بماند
    const chart = req.db.chartAccounts.find(c => c.userId === req.user.id && c.title === old);
    if (chart && !req.db.chartAccounts.some(c => c.userId === req.user.id && c.title === next)) {
      chart.title = next;
      req.db.journalEntries.filter(j => j.userId === req.user.id).forEach(j => j.lines.forEach(l => { if (l.accountId === chart.id || l.accountTitle === old) l.accountTitle = next; }));
    }
    // ۳) اصلاحات یادگرفته‌شدهٔ دستیار
    (req.db.corrections || []).filter(c => c.userId === req.user.id && c.field === 'category' && c.value === old).forEach(c => { c.value = next; });
    // ۴) متادیتا و والدِ زیرمجموعه‌ها
    if (userMeta[old]) { userMeta[next] = userMeta[old]; delete userMeta[old]; }
    Object.values(userMeta).forEach(m => { if (m.parent === old) m.parent = next; });
  }
  // به‌روزرسانی رنگ/آیکون/والد در صورت ارسال
  const meta = userMeta[next] || {};
  if (req.body.color !== undefined) meta.color = String(req.body.color).slice(0, 16);
  if (req.body.icon !== undefined) meta.icon = String(req.body.icon).slice(0, 8);
  if (req.body.parent !== undefined) meta.parent = req.body.parent && req.body.parent !== next && req.db.categories.includes(req.body.parent) ? req.body.parent : '';
  userMeta[next] = meta;
  recordAudit(req.db, req.user.id, 'category.rename', `${old} → ${next}`);
  writeDb(req.db); res.json(req.db.categories);
});
app.delete('/api/categories/:name', auth, (req, res) => {
  const old = decodeURIComponent(req.params.name);
  const used = req.db.transactions.some(t => t.userId === req.user.id && t.category === old);
  if (used && req.query.force !== '1') return res.status(409).json({ error: 'این دسته‌بندی در تراکنش‌ها استفاده شده؛ برای حذف اجباری force=1 بفرستید.', used: true });
  // حذف اجباری: تراکنش‌های آن دسته به «سایر» منتقل می‌شوند تا گزارش‌ها خراب نشوند
  if (used) req.db.transactions.filter(t => t.userId === req.user.id && t.category === old).forEach(t => { t.category = 'سایر'; });
  req.db.categories = req.db.categories.filter(c => c !== old);
  const userMeta = (req.db.categoryMeta || {})[req.user.id] || {};
  delete userMeta[old];
  Object.values(userMeta).forEach(m => { if (m.parent === old) m.parent = ''; });
  recordAudit(req.db, req.user.id, 'category.delete', old);
  writeDb(req.db); res.json(req.db.categories);
});

/* ------------------------- Assistant training & AI rules ------------------------- */
app.get('/api/training', auth, (req, res) => res.json(req.db.assistantTraining.filter(x => x.userId === req.user.id)));
app.post('/api/training', auth, (req, res) => { const tr = { id: id('tr_'), userId: req.user.id, phrase: req.body.phrase || '', meaning: req.body.meaning || '', createdAt: nowIso() }; req.db.assistantTraining.push(tr); recordAudit(req.db, req.user.id, 'training.create', tr.phrase); writeDb(req.db); res.json(tr); });
app.put('/api/training/:id', auth, (req, res) => { const tr = req.db.assistantTraining.find(x => x.id === req.params.id && x.userId === req.user.id); if (!tr) return res.status(404).json({ error: 'آموزش پیدا نشد.' }); if (req.body.phrase !== undefined) tr.phrase = String(req.body.phrase); if (req.body.meaning !== undefined) tr.meaning = String(req.body.meaning); writeDb(req.db); res.json(tr); });
app.delete('/api/training/:id', auth, (req, res) => { req.db.assistantTraining = req.db.assistantTraining.filter(x => !(x.id === req.params.id && x.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
// قوانین AI: قوانین خود کاربر + قوانین عمومی ادمین (scope==='global')
app.get('/api/ai/rules', auth, (req, res) => res.json(req.db.aiRules.filter(x => x.userId === req.user.id || x.scope === 'global').map(r => ({ ...r, editable: r.userId === req.user.id || req.user.role === 'admin' }))));
app.post('/api/ai/rules', auth, (req, res) => {
  const scope = req.body.scope === 'global' && req.user.role === 'admin' ? 'global' : 'user';
  const weight = Math.max(1, Math.min(100, Number(req.body.weight || 10)));
  const rule = { id: id('rule_'), userId: req.user.id, pattern: String(req.body.pattern || '').trim(), action: String(req.body.action || '').trim(), weight, scope, enabled: req.body.enabled !== false, createdAt: nowIso() };
  if (!rule.pattern || !rule.action) return res.status(400).json({ error: 'الگو و عملیات هر دو لازم‌اند.' });
  req.db.aiRules.unshift(rule); recordAudit(req.db, req.user.id, 'rule.create', `${rule.pattern} (${scope})`); writeDb(req.db); res.json(rule);
});
app.put('/api/ai/rules/:id', auth, (req, res) => {
  const rule = req.db.aiRules.find(x => x.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'قانون پیدا نشد.' });
  if (rule.userId !== req.user.id && !(rule.scope === 'global' && req.user.role === 'admin')) return res.status(403).json({ error: 'اجازهٔ ویرایش این قانون را ندارید.' });
  if (req.body.pattern !== undefined) rule.pattern = String(req.body.pattern).trim();
  if (req.body.action !== undefined) rule.action = String(req.body.action).trim();
  if (req.body.weight !== undefined) rule.weight = Math.max(1, Math.min(100, Number(req.body.weight)));
  if (req.body.enabled !== undefined) rule.enabled = Boolean(req.body.enabled);
  if (req.body.scope !== undefined && req.user.role === 'admin') rule.scope = req.body.scope === 'global' ? 'global' : 'user';
  writeDb(req.db); res.json(rule);
});
app.delete('/api/ai/rules/:id', auth, (req, res) => {
  const rule = req.db.aiRules.find(x => x.id === req.params.id);
  if (!rule) return res.status(404).json({ error: 'قانون پیدا نشد.' });
  if (rule.userId !== req.user.id && !(rule.scope === 'global' && req.user.role === 'admin')) return res.status(403).json({ error: 'اجازهٔ حذف این قانون را ندارید.' });
  req.db.aiRules = req.db.aiRules.filter(x => x.id !== rule.id);
  recordAudit(req.db, req.user.id, 'rule.delete', rule.pattern);
  writeDb(req.db); res.json({ ok: true });
});
// تست قانون قبل از ذخیره: متن نمونه + الگو/عملیات → نتیجهٔ پردازش بدون ثبت چیزی
app.post('/api/ai/rules/test', auth, (req, res) => {
  const { sample, pattern, action } = req.body || {};
  if (!sample) return res.status(400).json({ error: 'متن نمونه لازم است.' });
  const matched = pattern ? String(sample).includes(String(pattern)) : false;
  // اجرای آزمایشی روی کپی دیتابیس — هیچ تغییری ذخیره نمی‌شود
  const ghost = JSON.parse(JSON.stringify(req.db));
  if (matched && action) ghost.aiRules.unshift({ id: 'tmp', userId: req.user.id, pattern: String(pattern), action: String(action), weight: 100, scope: 'user', enabled: true, createdAt: nowIso() });
  const result = parseLocalCommand(ghost, req.user, String(sample));
  res.json({ matched, result: { action: result.action, message: result.message || '', parsed: result.parsed || null } });
});
// اجرای آزمایشی دستیار (برای چت‌بات آموزشی): پردازش بدون ثبت
app.post('/api/assistant/dry-run', auth, (req, res) => {
  const ghost = JSON.parse(JSON.stringify(req.db));
  const result = parseLocalCommand(ghost, req.user, String(req.body.text || ''));
  res.json({ action: result.action, message: result.message || '', parsed: result.parsed || null, dryRun: true });
});
// تاریخچهٔ اصلاحات کاربر (آنچه دستیار یاد گرفته است)
app.get('/api/assistant/corrections', auth, (req, res) => res.json((req.db.corrections || []).filter(c => c.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))));
app.delete('/api/assistant/corrections/:id', auth, (req, res) => { req.db.corrections = (req.db.corrections || []).filter(c => !(c.id === req.params.id && c.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
// خروجی/ورودی قوانین و آموزش‌ها (Export/Import JSON)
app.get('/api/ai/rules/export', auth, (req, res) => {
  res.json({ version: 1, exportedAt: nowIso(), rules: req.db.aiRules.filter(x => x.userId === req.user.id).map(({ id: _i, userId: _u, ...r }) => r), training: req.db.assistantTraining.filter(x => x.userId === req.user.id).map(({ id: _i, userId: _u, ...t }) => t) });
});
app.post('/api/ai/rules/import', auth, (req, res) => {
  const { rules, training } = req.body || {};
  let added = 0;
  if (Array.isArray(rules)) for (const r of rules) {
    const pattern = String(r.pattern || '').trim(), action = String(r.action || '').trim();
    if (!pattern || !action) continue;
    if (req.db.aiRules.some(x => x.userId === req.user.id && x.pattern === pattern && x.action === action)) continue;
    req.db.aiRules.unshift({ id: id('rule_'), userId: req.user.id, pattern, action, weight: Math.max(1, Math.min(100, Number(r.weight || 10))), scope: 'user', enabled: r.enabled !== false, createdAt: nowIso() }); added++;
  }
  if (Array.isArray(training)) for (const t of training) {
    const phrase = String(t.phrase || '').trim(); if (!phrase) continue;
    if (req.db.assistantTraining.some(x => x.userId === req.user.id && x.phrase === phrase)) continue;
    req.db.assistantTraining.push({ id: id('tr_'), userId: req.user.id, phrase, meaning: String(t.meaning || ''), createdAt: nowIso() }); added++;
  }
  recordAudit(req.db, req.user.id, 'rules.import', `${added} مورد`);
  writeDb(req.db); res.json({ ok: true, added });
});

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
        // تاریخ گذشتهٔ تشخیصی («دیروز/۳ روز پیش/در ۱۵ مهر») → date و createdAt واقعی
        const txDate = parsed.pastDateFa || faDate();
        const txCreated = parsed.pastDate || nowIso();
        const tx = { id: id('tx_'), userId: user.id, title: parsed.title || 'تراکنش', amount: Number(parsed.amount || 0), type: parsed.type || 'expense', category: parsed.category || 'سایر', bank: parsed.bank || (parsed.accountingSide ? '' : 'صندوق'), party: parsed.party || '', personId: parsed.personId || '', accountingSide: parsed.accountingSide || '', date: txDate, method: 'Assistant Local', note, createdAt: txCreated, backdated: !!parsed.pastDate };
        db.transactions.push(tx); journalFromTransaction(db, tx);
        pushUndo({ kind: 'create', collection: 'transactions', id: tx.id });
        r.transaction = tx; r.txId = tx.id; r.sideSuggestions = parsed.sideSuggestions;
        const sideFa = tx.accountingSide === 'receivable' ? '(طلب از ' + (tx.party || 'او') + ')' : tx.accountingSide === 'payable' ? '(بدهی به ' + (tx.party || 'او') + ')' : '';
        r.message = `ثبت شد: ${tx.title}\nمبلغ ${Number(tx.amount).toLocaleString('fa-IR')} تومان ${sideFa}${tx.backdated ? `\n📅 با تاریخ ${tx.date} (گذشته) ثبت شد.` : ''}`;
        // هشدار سقف اعتبار: اگر با این طلب از سقف مشتری گذشت، همان لحظه اخطار بده
        if (tx.accountingSide === 'receivable' && tx.personId) {
          const pp = db.persons.find(x => x.id === tx.personId);
          const lim = Number(pp?.creditLimit || 0);
          if (lim > 0) { const nb = personBalance(db, user.id, tx.personId); if (nb > lim) r.message += `\n⚠️ هشدار: بدهی «${pp.name}» (${nb.toLocaleString('fa-IR')}) از سقف اعتبار ${lim.toLocaleString('fa-IR')} تومان گذشت!`; else if (nb > lim * 0.85) r.message += `\n🔔 «${pp.name}» به ${Math.round(nb / lim * 100).toLocaleString('fa-IR')}٪ سقف اعتبارش رسید.`; }
        }
        r.canUndo = true;
      }
    }
    return r;
  };
  // حذف تاییدشده (مرحله دوم)
  if (result.action === 'confirm_delete') { writeDb(db); return res.json(result); }
  if (result.action === 'multi_command') {
    result.results = result.results.map(r => persistParsed(r, req.body.text || ''));
    const okCount = result.results.filter(r => r.transaction || ['cheque_created','treasury_movement','treasury_transfer','cheque_paid','settled','edited','cheque_edited','project_created','expert_settlement'].includes(r.action)).length;
    const failed = result.results.filter(r => r.action === 'noop' || r.action === 'analytics_answer' || (r.action === 'transaction_parsed' && !r.transaction));
    let msg = okCount ? `${okCount.toLocaleString('fa-IR')} عملیات ثبت شد.` : 'هیچ عملیاتی ثبت نشد.';
    if (failed.length) msg += `\n${failed.length.toLocaleString('fa-IR')} بخش ثبت نشد:` + failed.map(f => `\n• ${f.message || 'نامفهوم بود'}`).join('');
    writeDb(db); return res.json({ ...result, message: msg });
  }
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
  const parsed = parseBankSms(text);
  // جلوگیری از ثبت تکراری با شناسهٔ پیگیری
  if (parsed.refCode && req.db.smsInbox.some(s => s.userId === req.user.id && s.parsed?.refCode === parsed.refCode)) {
    return res.status(409).json({ error: 'این پیامک قبلاً ثبت شده (شناسهٔ پیگیری تکراری).' });
  }
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
  const txs = req.db.transactions.filter(t => t.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  try {
    const content = await callAi(req.db, [{ role: 'user', content: `با این داده‌های تراکنش پاسخ تحلیلی فارسی بده. سوال: ${q}\nداده‌ها:${JSON.stringify(txs.slice(0, 150))}` }]);
    if (content) return res.json({ answer: content });
  } catch {}
  const persons = req.db.persons.filter(p => p.userId === req.user.id).map(p => ({ name: p.name, balance: personBalance(req.db, req.user.id, p.id) }));
  const accounts = req.db.accounts.filter(a => a.userId === req.user.id).map(a => ({ title: a.title, balance: accountComputedBalance(req.db, req.user.id, a) }));
  if (/چک/.test(q)) {
    const answer = buildAnalyticsAnswer(q, { txs, cheques: req.db.cheques.filter(c => c.userId === req.user.id), accounts, persons });
    return res.json({ answer });
  }
  const nlq = answerNLQ(q, { txs, persons, accounts, categories: req.db.categories || [] });
  res.json({ answer: nlq.answer, table: nlq.table || null, chart: nlq.chart || null, parsedQuery: nlq.parsed });
});

/* ------------------------- گزارش‌ساز سفارشی + بینش‌ها + کیفیت موتور ------------------------- */
// اجرای گزارش ad-hoc (بدون ذخیره)
app.post('/api/reports/run', auth, (req, res) => {
  const data = { txs: req.db.transactions.filter(t => t.userId === req.user.id) };
  res.json(runReport(req.body || {}, data));
});
// saved views
app.get('/api/reports', auth, (req, res) => res.json(req.db.savedReports.filter(r => r.userId === req.user.id)));
app.post('/api/reports', auth, (req, res) => {
  const r = { id: id('rp_'), userId: req.user.id, name: String(req.body.name || 'گزارش').slice(0, 40), spec: req.body.spec || {}, createdAt: nowIso() };
  req.db.savedReports.unshift(r); recordAudit(req.db, req.user.id, 'report.save', r.name); writeDb(req.db); res.json(r);
});
app.delete('/api/reports/:id', auth, (req, res) => { req.db.savedReports = req.db.savedReports.filter(r => !(r.id === req.params.id && r.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
// بینش‌های پیشگیرانه (proactive insights)
app.get('/api/insights', auth, (req, res) => {
  const persons = req.db.persons.filter(p => p.userId === req.user.id).map(p => ({ name: p.name, balance: personBalance(req.db, req.user.id, p.id) }));
  res.json(proactiveInsights({ txs: req.db.transactions.filter(t => t.userId === req.user.id), budgets: req.db.budgets.filter(b => b.userId === req.user.id), persons }));
});
// کیفیت موتور تشخیص + پیشنهاد خودکار قانون
app.get('/api/engine/quality', auth, (req, res) => res.json(engineQuality(req.db, req.user.id)));

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
  const accounts = db.accounts.filter(a => a.userId === uid).map(a => ({ name: a.title, value: accountComputedBalance(db, uid, a) }));

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
  // هشدارهای بودجه، هشدارهای سفارشی کاربر و اهداف نزدیک سررسید
  const cashTotal = db.accounts.filter(a => a.userId === uid).reduce((s, a) => s + accountComputedBalance(db, uid, a), 0);
  alerts.push(...evaluateBudgetAndCustomAlerts(db, uid, cashTotal));
  alerts.push(...crmAlerts(db, uid));
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
/* ------------------------- بودجه‌بندی / اهداف / هشدار سفارشی ------------------------- */
// بودجه‌ها: وضعیت «بودجه در برابر واقعی» ماه جاری
app.get('/api/budgets', auth, (req, res) => res.json(budgetStatusList(req.db, req.user.id)));
app.post('/api/budgets', auth, (req, res) => {
  const category = String(req.body.category || '').trim(); // '' = کل هزینه‌ها
  if (badAmount(req.body.amount) || !Number(req.body.amount)) return res.status(400).json({ error: 'مبلغ بودجه نامعتبر است.' });
  if (category && !req.db.categories.includes(category)) return res.status(400).json({ error: 'این دسته‌بندی وجود ندارد.' });
  const existing = req.db.budgets.find(b => b.userId === req.user.id && b.category === category);
  if (existing) existing.amount = Number(req.body.amount);
  else req.db.budgets.push({ id: id('bg_'), userId: req.user.id, category, amount: Number(req.body.amount), period: 'month', createdAt: nowIso() });
  recordAudit(req.db, req.user.id, 'budget.set', `${category || 'کل'}=${req.body.amount}`);
  writeDb(req.db); res.json(budgetStatusList(req.db, req.user.id));
});
app.delete('/api/budgets/:id', auth, (req, res) => { req.db.budgets = req.db.budgets.filter(b => !(b.id === req.params.id && b.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
// اهداف پس‌انداز
app.get('/api/goals', auth, (req, res) => res.json(req.db.goals.filter(g => g.userId === req.user.id).map(g => ({ ...g, pct: g.target ? Math.round(Number(g.saved || 0) / Number(g.target) * 100) : 0, daysLeft: g.deadline ? daysUntil(g.deadline) : null }))));
app.post('/api/goals', auth, (req, res) => {
  if (!String(req.body.title || '').trim()) return res.status(400).json({ error: 'نام هدف لازم است.' });
  if (badAmount(req.body.target) || !Number(req.body.target)) return res.status(400).json({ error: 'مبلغ هدف نامعتبر است.' });
  const g = { id: id('gl_'), userId: req.user.id, title: String(req.body.title).trim().slice(0, 40), target: Number(req.body.target), saved: Number(req.body.saved || 0), deadline: req.body.deadline || '', done: false, createdAt: nowIso() };
  req.db.goals.push(g); recordAudit(req.db, req.user.id, 'goal.create', g.title); writeDb(req.db); res.json(g);
});
app.put('/api/goals/:id', auth, (req, res) => {
  const g = req.db.goals.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!g) return res.status(404).json({ error: 'هدف پیدا نشد.' });
  if (req.body.title !== undefined) g.title = String(req.body.title).slice(0, 40);
  if (req.body.target !== undefined) { if (badAmount(req.body.target)) return res.status(400).json({ error: 'مبلغ نامعتبر است.' }); g.target = Number(req.body.target); }
  if (req.body.deadline !== undefined) g.deadline = req.body.deadline;
  if (req.body.done !== undefined) g.done = Boolean(req.body.done);
  writeDb(req.db); res.json(g);
});
// واریز/برداشت از هدف
app.post('/api/goals/:id/deposit', auth, (req, res) => {
  const g = req.db.goals.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!g) return res.status(404).json({ error: 'هدف پیدا نشد.' });
  if (badAmount(Math.abs(Number(req.body.amount)))) return res.status(400).json({ error: 'مبلغ نامعتبر است.' });
  g.saved = Math.max(0, Number(g.saved || 0) + Number(req.body.amount || 0));
  if (g.saved >= Number(g.target || 0)) g.done = true;
  writeDb(req.db); res.json({ ...g, pct: g.target ? Math.round(g.saved / g.target * 100) : 0 });
});
app.delete('/api/goals/:id', auth, (req, res) => { req.db.goals = req.db.goals.filter(g => !(g.id === req.params.id && g.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
// هشدارهای سفارشی
app.get('/api/custom-alerts', auth, (req, res) => res.json(req.db.customAlerts.filter(a => a.userId === req.user.id)));
app.post('/api/custom-alerts', auth, (req, res) => {
  const kind = ['categoryOver', 'expenseOver', 'balanceBelow'].includes(req.body.kind) ? req.body.kind : 'expenseOver';
  if (badAmount(req.body.threshold) || !Number(req.body.threshold)) return res.status(400).json({ error: 'مبلغ آستانه نامعتبر است.' });
  const a = { id: id('al_'), userId: req.user.id, kind, category: String(req.body.category || ''), threshold: Number(req.body.threshold), enabled: true, createdAt: nowIso() };
  req.db.customAlerts.push(a); writeDb(req.db); res.json(a);
});
app.put('/api/custom-alerts/:id', auth, (req, res) => {
  const a = req.db.customAlerts.find(x => x.id === req.params.id && x.userId === req.user.id);
  if (!a) return res.status(404).json({ error: 'هشدار پیدا نشد.' });
  if (req.body.threshold !== undefined) a.threshold = Number(req.body.threshold);
  if (req.body.enabled !== undefined) a.enabled = Boolean(req.body.enabled);
  writeDb(req.db); res.json(a);
});
app.delete('/api/custom-alerts/:id', auth, (req, res) => { req.db.customAlerts = req.db.customAlerts.filter(a => !(a.id === req.params.id && a.userId === req.user.id)); writeDb(req.db); res.json({ ok: true }); });
// پیش‌بینی جریان نقد ۶ ماه آینده (مدل بهبودیافته):
//  - میانگین وزنیِ خالص ماهانهٔ تا ۶ ماه اخیر (ماه‌های نزدیک‌تر وزن بیشتر: 6,5,4,...)
//  - تفکیک درآمد/هزینه و حذف ماه‌های بدون داده از میانگین
//  - چک‌های دریافتنی با «احتمال وصول» مشتری وزن می‌خورند (نه ۱۰۰٪ خوش‌بینانه)
//  - چک‌های پرداختنی کامل کسر می‌شوند (تعهد قطعی ما)
//  - باند عدم‌قطعیت (انحراف معیار خالص ماهانه) → بهترین/بدترین حالت
app.get('/api/analytics/forecast', auth, (req, res) => {
  const db = req.db, uid = req.user.id;
  const cash = db.accounts.filter(a => a.userId === uid).reduce((s, a) => s + accountComputedBalance(db, uid, a), 0);
  const now = Date.now(); const M = 30 * 86400000;
  const txs = db.transactions.filter(t => t.userId === uid && !t.chequeId && t.accountingSide !== 'receivable' && t.accountingSide !== 'payable'); // فقط تراکنش‌های نقدی (نسیه نقد جابه‌جا نمی‌کند)؛ چک‌ها جدا مدل می‌شوند
  // خالص ماهانهٔ ۶ ماه اخیر
  const monthly = [];
  for (let k = 0; k < 6; k++) {
    const list = txs.filter(t => { const ts = new Date(t.createdAt).getTime(); return ts >= now - (k + 1) * M && ts < now - k * M; });
    if (!list.length) continue;
    const inc = list.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const exp = list.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    monthly.push({ k, net: inc - exp, income: inc, expense: exp });
  }
  // میانگین وزنی (ماه نزدیک‌تر وزن بیشتر)
  let wSum = 0, nSum = 0;
  for (const m of monthly) { const w = 6 - m.k; wSum += w; nSum += m.net * w; }
  const avgNet = wSum ? Math.round(nSum / wSum) : 0;
  // انحراف معیار برای باند عدم‌قطعیت
  const mean = monthly.length ? monthly.reduce((s, m) => s + m.net, 0) / monthly.length : 0;
  const variance = monthly.length > 1 ? monthly.reduce((s, m) => s + Math.pow(m.net - mean, 2), 0) / (monthly.length - 1) : 0;
  const stdev = Math.round(Math.sqrt(variance));
  // چک‌ها: دریافتنی وزن‌خورده با احتمال وصول مشتری، پرداختنی کامل
  const cheques = db.cheques.filter(c => c.userId === uid && c.status !== 'paid' && c.status !== 'bounced');
  const likelihoodOf = (c) => {
    if (c.type !== 'receivable') return 1;
    if (!c.personId) return 0.85;
    const ci = creditInfo(db, uid, c.personId);
    return ci.insufficientData ? 0.75 : Math.max(0.3, Math.min(0.95, ci.score / 100));
  };
  const points = []; let running = cash, runBest = cash, runWorst = cash;
  for (let m = 1; m <= 6; m++) {
    const from = (m - 1) * 30, to = m * 30;
    let chequeNet = 0;
    for (const c of cheques) {
      const d = daysUntil(c.dueDate);
      if (d === null || d < from || d >= to) continue;
      const amt = Number(c.amount);
      chequeNet += c.type === 'receivable' ? Math.round(amt * likelihoodOf(c)) : -amt;
    }
    running += avgNet + chequeNet;
    runBest += avgNet + stdev + chequeNet;
    runWorst += avgNet - stdev + chequeNet;
    points.push({ month: m, projected: running, best: runBest, worst: runWorst, chequeNet, avgNet });
  }
  res.json({ currentCash: cash, avgMonthlyNet: avgNet, stdev, monthsUsed: monthly.length, points });
});

const DEFAULT_DASH = {
  kpis: ['balance', 'income', 'expense', 'profit', 'receivable', 'payable', 'count', 'projects'],
  charts: ['budgets', 'goals', 'forecast', 'trendBar', 'netLine', 'expenseDonut', 'incomeDonut', 'cumulativeArea', 'topPersons'],
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
  else next.aiToken = encryptSecret(req.body.aiToken); // رمزنگاری توکن قبل از ذخیره
  req.db.settings = next; recordAudit(req.db, req.user.id, 'admin.settings', 'AI settings updated'); writeDb(req.db); res.json(sanitizeSettingsForClient(next));
});
app.post('/api/admin/test-ai', auth, admin, async (req, res) => {
  try {
    const answer = await callAi(req.db, [{ role: 'user', content: req.body.prompt || 'سلام، فقط بگو اتصال برقرار است.' }]);
    res.json({ ok: true, answer: answer || 'حالت Local فعال است؛ اتصال خارجی تست نشد.' });
  } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
// لاگ تغییرات (Audit Trail) — فقط ادمین
app.get('/api/admin/audit', auth, admin, (req, res) => {
  const users = Object.fromEntries(req.db.users.map(u => [u.id, u.name]));
  const list = (req.db.auditLog || []).slice(-300).reverse().map(a => ({ ...a, userName: users[a.userId] || a.userId }));
  res.json(list);
});
// مدیریت بکاپ — فقط ادمین
app.get('/api/admin/backups', auth, admin, (req, res) => {
  const files = listBackups().reverse().map(f => { const m = /^db-(\d+)\.json$/.exec(f); let size = 0; try { size = fs.statSync(path.join(BACKUP_DIR, f)).size; } catch {} return { name: f, at: m ? new Date(Number(m[1])).toISOString() : '', size }; });
  res.json(files);
});
app.post('/api/admin/backups', auth, admin, (req, res) => {
  const name = makeBackup(true);
  recordAudit(req.db, req.user.id, 'backup.manual', name || '');
  writeDb(req.db);
  res.json({ ok: true, name });
});
// تغییر نقش کاربر (user/admin) — فقط ادمین؛ آخرین ادمین قابل تنزل نیست
app.put('/api/admin/users/:id/role', auth, admin, (req, res) => {
  const target = req.db.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'کاربر پیدا نشد.' });
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (target.role === 'admin' && role === 'user' && req.db.users.filter(u => u.role === 'admin').length <= 1) return res.status(400).json({ error: 'حداقل یک ادمین باید باقی بماند.' });
  target.role = role;
  recordAudit(req.db, req.user.id, 'admin.role-change', `${target.email} → ${role}`);
  writeDb(req.db);
  res.json({ ok: true, user: publicUser(target) });
});

/* ------------------------- SPA fallback ------------------------- */
app.use((req, res) => { res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate'); res.sendFile(path.join(DIST, 'index.html')); });

app.listen(PORT, () => console.log(`Dast Rast API running on http://localhost:${PORT}`));
