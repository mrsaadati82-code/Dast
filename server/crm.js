// ماژول مشترک CRM «دست راست»: سقف اعتبار، گروه مشتری، امتیاز اعتباری،
// جریمهٔ دیرکرد، یادآوری زمان‌بندی‌شده، گزارش وصولی‌ها و صورتحساب رسمی شخص.
// هر دو سرور (express و standalone) از همین فایل استفاده می‌کنند تا محاسبات یکی باشد.
import { normalizeFa, parseAmount, extractPersonName, cleanPersonName, personBalance } from './nlp.js';

const DAY = 86400000;
const faN = n => Math.round(Number(n) || 0).toLocaleString('fa-IR');

// استخراج نام مقاوم برای دستورات CRM: الگوی عمومی، سپس «X رو/را»، سپس تطبیق با اشخاص موجود
function crmFindName(db, uid, text) {
  const t = normalizeFa(text);
  let nm = extractPersonName(t);
  if (nm) return nm;
  const m = /([آ-یA-Za-z]+(?:\s+[آ-یA-Za-z]+){0,2})\s+(?:رو|را)\b/.exec(t);
  if (m) { const c = cleanPersonName(m[1]); if (c) return c; }
  // آخرین راه: نام یکی از اشخاص موجود که در متن آمده (طولانی‌ترین اول)
  const persons = db.persons.filter(p => p.userId === uid).sort((a, b) => b.name.length - a.name.length);
  for (const p of persons) if (t.includes(normalizeFa(p.name))) return p.name;
  for (const p of persons) { const first = normalizeFa(p.name).split(' ')[0]; if (first.length > 2 && new RegExp(`(^|\\s)${first}(\\s|$)`).test(t)) return p.name; }
  return '';
}

// ماندهٔ شخص از ماژول مشترک nlp.js — تک‌منبع حقیقت
export const crmPersonBalance = personBalance;

/* ------------------------- تنظیمات CRM هر کاربر ------------------------- */
export const DEFAULT_CRM = {
  lateFee: { enabled: false, graceDays: 30, monthlyPct: 2 },          // جریمه: بعد از مهلت، ٪ ماهانه روی مانده
  reminderCadence: { enabled: true, everyDays: 7, minDebtDays: 15 }    // یادآوری: هر N روز برای بدهی‌های بالای M روز
};
export function getCrmSettings(db, uid) {
  db.crmSettings ||= {};
  const s = db.crmSettings[uid] || {};
  return { lateFee: { ...DEFAULT_CRM.lateFee, ...(s.lateFee || {}) }, reminderCadence: { ...DEFAULT_CRM.reminderCadence, ...(s.reminderCadence || {}) } };
}
export function setCrmSettings(db, uid, body) {
  db.crmSettings ||= {};
  const cur = getCrmSettings(db, uid);
  db.crmSettings[uid] = {
    lateFee: { ...cur.lateFee, ...(body.lateFee || {}) },
    reminderCadence: { ...cur.reminderCadence, ...(body.reminderCadence || {}) }
  };
  return db.crmSettings[uid];
}

/* ------------------------- سن بدهی شخص ------------------------- */
export function debtAgeDays(db, uid, personId) {
  // تراکنش‌های «جریمهٔ دیرکرد» سن بدهی را ریست نمی‌کنند (وگرنه هر جریمه، تاخیر را صفر می‌کرد)
  const txs = db.transactions.filter(t => t.userId === uid && t.personId === personId && t.accountingSide === 'receivable' && t.method !== 'Late Fee');
  const last = txs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return last ? Math.floor((Date.now() - new Date(last.createdAt).getTime()) / DAY) : 0;
}

/* ------------------------- امتیاز اعتباری (مدل چندعاملی واقعی) ------------------------- */
// مدل امتیازدهی شبیه credit scoring واقعی — پنج عامل وزن‌دار (جمع وزن‌ها = ۱۰۰):
//  ۱) سابقهٔ وصول (۳۵): چند درصد از کل طلب تاریخی واقعاً وصول شده + تعداد دفعات وصول
//  ۲) سرعت تسویه (۲۵): میانگین وزنیِ روزهای طلب→وصول (وصول‌های جدیدتر مهم‌ترند)
//  ۳) وضعیت فعلی (۲۰): سن بدهی باز فعلی (decay نمایی) — بدهی صفر = نمرهٔ کامل
//  ۴) نسبت بدهی به گردش (۱۰): بدهی باز نسبت به کل حجم معاملات تاریخی
//  ۵) عمق رابطه (۱۰): طول رابطه و تعداد معاملات (مشتری قدیمیِ فعال قابل اعتمادتر است)
// مشتری بدون سابقهٔ کافی → امتیاز «نامشخص» با پرچم insufficientData (نه عدد گمراه‌کننده)
export function creditInfo(db, uid, personId) {
  const txs = db.transactions.filter(t => t.userId === uid && t.personId === personId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const receivables = txs.filter(t => t.accountingSide === 'receivable');
  const settlements = txs.filter(t => t.accountingSide === 'settlement' && Number(t.settlementDelta || 0) < 0);
  const totalReceivable = receivables.reduce((s, t) => s + Number(t.amount || 0), 0);
  const collected = settlements.reduce((s, t) => s + Math.abs(Number(t.settlementDelta || 0)), 0);
  const balance = crmPersonBalance(db, uid, personId);
  const debtDays = balance > 0 ? debtAgeDays(db, uid, personId) : 0;

  // فاصلهٔ هر وصول تا آخرین طلب قبلش + وزن زمانی (وصول ۶ ماه اخیر ×۲)
  const gaps = [];
  let lastRec = null;
  for (const t of txs) {
    if (t.accountingSide === 'receivable') lastRec = t;
    else if (t.accountingSide === 'settlement' && Number(t.settlementDelta || 0) < 0 && lastRec) {
      const days = Math.max(0, Math.floor((new Date(t.createdAt) - new Date(lastRec.createdAt)) / DAY));
      const recency = (Date.now() - new Date(t.createdAt).getTime()) < 183 * DAY ? 2 : 1;
      gaps.push({ days, w: recency });
    }
  }
  const wSum = gaps.reduce((s, g) => s + g.w, 0);
  const avgSettleDays = wSum ? Math.round(gaps.reduce((s, g) => s + g.days * g.w, 0) / wSum) : null;

  // دادهٔ ناکافی: نه طلبی نه وصولی → امتیاز قابل‌محاسبه نیست
  if (!totalReceivable && !collected) {
    return { score: null, label: 'نامشخص', insufficientData: true, totalReceivable: 0, collected: 0, balance, debtDays, avgSettleDays: null, factors: [] };
  }

  // ۱) سابقهٔ وصول (۳۵)
  const collectRatio = totalReceivable ? Math.min(1, collected / totalReceivable) : 0;
  const f1 = 35 * collectRatio * (settlements.length >= 3 ? 1 : settlements.length === 2 ? 0.9 : settlements.length === 1 ? 0.75 : 0.4);
  // ۲) سرعت تسویه (۲۵) — ۷ روز=کامل، ۹۰ روز=صفر (خطی)
  const f2 = avgSettleDays === null ? 12.5 : 25 * Math.max(0, Math.min(1, (90 - avgSettleDays) / 83));
  // ۳) وضعیت فعلی (۲۰) — decay نمایی با نیمه‌عمر ۴۵ روز
  const f3 = balance <= 0 ? 20 : 20 * Math.pow(0.5, debtDays / 45);
  // ۴) نسبت بدهی به گردش (۱۰)
  const exposure = totalReceivable ? Math.max(0, balance) / totalReceivable : 0;
  const f4 = 10 * Math.max(0, 1 - exposure);
  // ۵) عمق رابطه (۱۰): ماه‌های رابطه (تا ۶) + تعداد معامله (تا ۱۲)
  const firstTx = txs[0] ? new Date(txs[0].createdAt).getTime() : Date.now();
  const months = Math.min(6, (Date.now() - firstTx) / (30 * DAY));
  const f5 = 10 * Math.min(1, (months / 6) * 0.5 + Math.min(1, txs.length / 12) * 0.5);

  const score = Math.max(0, Math.min(100, Math.round(f1 + f2 + f3 + f4 + f5)));
  const label = score >= 80 ? 'عالی' : score >= 60 ? 'خوب' : score >= 40 ? 'متوسط' : 'ضعیف';
  const factors = [
    { name: 'سابقهٔ وصول', got: Math.round(f1), max: 35 },
    { name: 'سرعت تسویه', got: Math.round(f2), max: 25 },
    { name: 'وضعیت بدهی فعلی', got: Math.round(f3), max: 20 },
    { name: 'نسبت بدهی به گردش', got: Math.round(f4), max: 10 },
    { name: 'عمق رابطه', got: Math.round(f5), max: 10 }
  ];
  return { score, label, insufficientData: false, totalReceivable, collected, balance, debtDays, avgSettleDays, factors };
}

/* ------------------------- جریمهٔ دیرکرد ------------------------- */
export function lateFeeFor(db, uid, person, policy) {
  const bal = crmPersonBalance(db, uid, person.id);
  if (bal <= 0) return { fee: 0, overdueDays: 0, balance: bal };
  const days = debtAgeDays(db, uid, person.id);
  const overdueDays = Math.max(0, days - Number(policy.graceDays || 0));
  const fee = Math.round(bal * (Number(policy.monthlyPct || 0) / 100) * (overdueDays / 30));
  return { fee, overdueDays, balance: bal, debtDays: days };
}
export function lateFeeList(db, uid) {
  const policy = getCrmSettings(db, uid).lateFee;
  return db.persons.filter(p => p.userId === uid)
    .map(p => ({ id: p.id, name: p.name, ...lateFeeFor(db, uid, p, policy) }))
    .filter(r => r.fee > 0)
    .sort((a, b) => b.fee - a.fee);
}
// اعمال جریمه: تراکنش طلب جدید + سند خودکار (journalFromTransaction از سرور پاس داده می‌شود)
export function applyLateFee(db, uid, person, helpers) {
  const policy = getCrmSettings(db, uid).lateFee;
  const info = lateFeeFor(db, uid, person, policy);
  if (info.fee <= 0) return null;
  // گارد جریمهٔ مضاعف: حداقل ۲۵ روز فاصله از آخرین جریمهٔ همین شخص
  if (person.lastLateFeeAt) {
    const sinceDays = Math.floor((Date.now() - new Date(person.lastLateFeeAt).getTime()) / DAY);
    if (sinceDays < 25) return { blocked: true, sinceDays, nextInDays: 25 - sinceDays };
  }
  const tx = {
    id: helpers.id('tx_'), userId: uid, personId: person.id, party: person.name,
    title: `جریمه دیرکرد ${person.name} (${faN(info.overdueDays)} روز)`,
    amount: info.fee, type: 'income', category: 'بستانکار / طلب', accountingSide: 'receivable',
    date: helpers.faDate(), method: 'Late Fee', note: `${policy.monthlyPct}٪ ماهانه پس از ${policy.graceDays} روز مهلت`, createdAt: helpers.nowIso()
  };
  db.transactions.push(tx);
  helpers.journalFromTransaction(db, tx);
  person.lastLateFeeAt = helpers.nowIso();
  return { tx, info };
}

/* ------------------------- یادآوری زمان‌بندی‌شده ------------------------- */
export function dueReminders(db, uid) {
  const cad = getCrmSettings(db, uid).reminderCadence;
  if (!cad.enabled) return [];
  const out = [];
  for (const p of db.persons.filter(x => x.userId === uid)) {
    const bal = crmPersonBalance(db, uid, p.id);
    if (bal <= 0) continue;
    const days = debtAgeDays(db, uid, p.id);
    if (days < Number(cad.minDebtDays || 0)) continue;
    const sinceLast = p.lastReminderAt ? Math.floor((Date.now() - new Date(p.lastReminderAt).getTime()) / DAY) : Infinity;
    if (sinceLast < Number(cad.everyDays || 7)) continue;
    const text = `سلام ${p.name} عزیز،\nیادآوری دوستانه: مبلغ ${faN(bal)} تومان از حساب شما نزد ما باقی است (${faN(days)} روز). لطفاً در اولین فرصت تسویه بفرمایید. سپاس 🙏`;
    const mobile = p.mobile || p.phone || '';
    out.push({ id: p.id, name: p.name, mobile, balance: bal, days, sinceLast: sinceLast === Infinity ? null : sinceLast, text, whatsapp: mobile ? `https://wa.me/${String(mobile).replace(/^0/, '98').replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : '', sms: mobile ? `sms:${mobile}?body=${encodeURIComponent(text)}` : '' });
  }
  return out.sort((a, b) => b.balance - a.balance);
}
export function markReminderSent(db, uid, personId, nowIso) {
  const p = db.persons.find(x => x.id === personId && x.userId === uid);
  if (!p) return false;
  p.lastReminderAt = nowIso();
  p.reminderCount = Number(p.reminderCount || 0) + 1;
  return true;
}

/* ------------------------- گزارش وصولی‌ها + پیش‌بینی واقعی ------------------------- */
// پیش‌بینی وصول هر بدهکار:
//  - زمان انتظار = میانگین وزنی روز تسویهٔ خود مشتری؛ اگر سابقه ندارد → میانگین کل
//    مشتریان کاربر؛ اگر آن هم نبود → ۴۵ روز پیش‌فرض صنعتی
//  - احتمال وصول = ترکیب امتیاز اعتباری (پیوسته، نه پله‌ای) × جریمهٔ سن بدهی
//    (هرچه از موعد گذشته‌تر، احتمال کمتر — decay نمایی) — کف ۵٪، سقف ۹۵٪
//  - مبلغ انتظاری = مانده × احتمال
export function collectionsReport(db, uid) {
  const settlements = db.transactions.filter(t => t.userId === uid && t.accountingSide === 'settlement' && Number(t.settlementDelta || 0) < 0);
  const byMonth = {};
  for (const t of settlements) {
    const d = new Date(t.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] || 0) + Math.abs(Number(t.settlementDelta || 0));
  }
  const months = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([k, v]) => ({ month: k, value: v }));
  const totalCollected = settlements.reduce((s, t) => s + Math.abs(Number(t.settlementDelta || 0)), 0);

  // میانگین کل بازار کاربر (برای مشتری‌های بدون سابقه)
  const allPersons = db.persons.filter(x => x.userId === uid);
  const allAvgs = allPersons.map(p => creditInfo(db, uid, p.id).avgSettleDays).filter(v => v !== null);
  const marketAvg = allAvgs.length ? Math.round(allAvgs.reduce((s, v) => s + v, 0) / allAvgs.length) : 45;

  const forecast = [];
  for (const p of allPersons) {
    const bal = crmPersonBalance(db, uid, p.id);
    if (bal <= 0) continue;
    const ci = creditInfo(db, uid, p.id);
    const expectDays = ci.avgSettleDays !== null ? ci.avgSettleDays : marketAvg;
    const elapsed = debtAgeDays(db, uid, p.id);
    const remaining = Math.max(0, expectDays - elapsed);
    // احتمال پایه از امتیاز (پیوسته): score/100 با کف ۰.۳۵ برای دادهٔ ناکافی
    const base = ci.insufficientData ? 0.5 : Math.max(0.1, ci.score / 100);
    // جریمهٔ گذشت از موعد: بعد از موعد انتظار، هر ۳۰ روز احتمال ×۰.۷
    const overdue = Math.max(0, elapsed - expectDays);
    const agePenalty = Math.pow(0.7, overdue / 30);
    const likelihood = Math.max(0.05, Math.min(0.95, base * agePenalty));
    forecast.push({ id: p.id, name: p.name, balance: bal, expectedInDays: remaining, overdueDays: overdue, likelihood: Math.round(likelihood * 100) / 100, expectedAmount: Math.round(bal * likelihood), score: ci.score, scoreLabel: ci.label, basis: ci.avgSettleDays !== null ? 'سابقهٔ خود مشتری' : (allAvgs.length ? 'میانگین مشتریان شما' : 'پیش‌فرض') });
  }
  forecast.sort((a, b) => a.expectedInDays - b.expectedInDays);
  const expectedTotal = forecast.reduce((s, f) => s + f.expectedAmount, 0);
  const outstanding = forecast.reduce((s, f) => s + f.balance, 0);
  // بازه‌های زمانی پیش‌بینی (۳۰/۶۰/۹۰ روز) برای برنامه‌ریزی نقدینگی
  const inDays = d => forecast.filter(f => f.expectedInDays <= d).reduce((s, f) => s + f.expectedAmount, 0);
  return { months, totalCollected, outstanding, expectedTotal, marketAvgSettleDays: marketAvg, expectedIn30: inDays(30), expectedIn60: inDays(60), expectedIn90: inDays(90), forecast };
}

/* ------------------------- صورتحساب رسمی شخص (Statement) ------------------------- */
export function personStatement(db, uid, person) {
  const txs = db.transactions.filter(t => t.userId === uid && t.personId === person.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let running = 0;
  const rows = txs.map(t => {
    let debit = 0, credit = 0; // بدهکار = طلب ما از او بیشتر شد
    if (t.accountingSide === 'receivable') { debit = Number(t.amount || 0); running += debit; }
    else if (t.accountingSide === 'payable') { credit = Number(t.amount || 0); running -= credit; }
    else if (t.accountingSide === 'settlement') { const d = Number(t.settlementDelta || 0); if (d < 0) { credit = Math.abs(d); running += d; } else { debit = d; running += d; } }
    else if (t.type === 'income') { credit = Number(t.amount || 0); }
    else { debit = Number(t.amount || 0); }
    return { date: t.date || '', title: t.title, method: t.method || '', debit, credit, running };
  });
  const closing = crmPersonBalance(db, uid, person.id);
  return { person: { id: person.id, name: person.name, mobile: person.mobile || person.phone || '', group: person.group || '', creditLimit: Number(person.creditLimit || 0) }, rows, closing, generatedAt: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'full' }).format(new Date()) };
}

/* ------------------------- گروه‌بندی مشتری (پیش‌فرض + سفارشی) ------------------------- */
export const PERSON_GROUPS = { vip: 'VIP', wholesale: 'عمده', retail: 'خرده', normal: 'عادی' };
const GROUP_WORDS = { 'وی آی پی': 'vip', 'وی‌آی‌پی': 'vip', vip: 'vip', 'ویژه': 'vip', 'عمده': 'wholesale', 'خرده': 'retail', 'عادی': 'normal', 'معمولی': 'normal' };
// همهٔ گروه‌های کاربر: پیش‌فرض + سفارشی (db.personGroups[uid] = [{key,label}])
export function allGroups(db, uid) {
  db.personGroups ||= {};
  const custom = db.personGroups[uid] || [];
  return [...Object.entries(PERSON_GROUPS).map(([key, label]) => ({ key, label, builtin: true })), ...custom.map(g => ({ ...g, builtin: false }))];
}
export function addGroup(db, uid, label) {
  db.personGroups ||= {}; db.personGroups[uid] ||= [];
  const clean = String(label).trim().slice(0, 24);
  if (!clean) return null;
  const exists = allGroups(db, uid).find(g => g.label === clean);
  if (exists) return exists;
  const g = { key: 'g_' + Date.now().toString(36), label: clean };
  db.personGroups[uid].push(g);
  return g;
}
export function removeGroup(db, uid, key) {
  db.personGroups ||= {}; db.personGroups[uid] ||= [];
  const g = db.personGroups[uid].find(x => x.key === key);
  if (!g) return false;
  db.personGroups[uid] = db.personGroups[uid].filter(x => x.key !== key);
  // اشخاص آن گروه → عادی
  db.persons.filter(p => p.userId === uid && p.group === key).forEach(p => { p.group = 'normal'; });
  return true;
}
export function groupLabel(db, uid, key) {
  return PERSON_GROUPS[key] || ((db.personGroups || {})[uid] || []).find(g => g.key === key)?.label || 'عادی';
}

/* ------------------------- دستورات دستیار CRM ------------------------- */
// helpers = { id, nowIso, faDate, journalFromTransaction, findPerson(name)→person|null }
export function handleCrmCommands(db, user, raw, helpers) {
  const t = normalizeFa(raw);
  const uid = user.id;
  db.crmSettings ||= {};

  /* --- سقف اعتبار --- */
  if (/سقف\s*اعتبار/.test(t)) {
    const name = crmFindName(db, uid, t.replace(/سقف\s*اعتبار|بذار|بگذار|کن|چقدر|چنده|چیه|نشون|حذف|بردار|پاک/g, ' '));
    const p = name ? helpers.findPerson(name) : null;
    if (!p) return { action: 'crm', message: 'نام شخص را متوجه نشدم. مثال: «سقف اعتبار علی رو ۱۰ میلیون بذار».' };
    if (/(چقدر|چنده|چیه|نشون)/.test(t)) {
      const bal = crmPersonBalance(db, uid, p.id);
      const lim = Number(p.creditLimit || 0);
      return { action: 'crm', message: lim ? `سقف اعتبار «${p.name}»: ${faN(lim)} تومان.\nبدهی فعلی او: ${faN(Math.max(0, bal))} تومان (${lim ? faN(Math.round(Math.max(0, bal) / lim * 100)) : 0}٪ سقف).` : `برای «${p.name}» سقف اعتباری تنظیم نشده.` };
    }
    if (/(حذف|بردار|پاک)/.test(t)) { p.creditLimit = 0; return { action: 'crm', message: `سقف اعتبار «${p.name}» برداشته شد.` }; }
    const amount = parseAmount(t);
    if (amount > 0) {
      p.creditLimit = amount;
      const bal = crmPersonBalance(db, uid, p.id);
      const over = Math.max(0, bal) > amount;
      return { action: 'crm', message: `سقف اعتبار «${p.name}» روی ${faN(amount)} تومان تنظیم شد. ✅${over ? `\n⚠️ توجه: بدهی فعلی او (${faN(bal)}) همین حالا از سقف بیشتر است!` : ''}` };
    }
    return { action: 'crm', message: 'مبلغ سقف را متوجه نشدم. مثال: «سقف اعتبار علی رو ۱۰ میلیون بذار».' };
  }

  /* --- گروه مشتری --- */
  if (/گروه/.test(t) && !/گروهی/.test(t)) {
    // ساخت گروه جدید: «گروه جدید بساز به نام همکاران»
    const ng = /گروه\s*(جدید)?\s*(بساز|تعریف|اضافه)\s*(کن)?\s*(به\s*نام|با\s*نام|به\s*اسم)?\s+([آ-یA-Za-z ]{2,24})/.exec(t) || /(یه|یک)\s*گروه\s+([آ-یA-Za-z ]{2,24}?)\s*(بساز|تعریف|اضافه)/.exec(t);
    if (ng) {
      const label = (ng[5] || ng[2] || '').trim();
      if (label) { const g = addGroup(db, uid, label); return { action: 'crm', message: g ? `گروه «${g.label}» ساخته شد. ✅ حالا می‌توانی بگویی: «علی رو بذار تو گروه ${g.label}».` : 'نام گروه را متوجه نشدم.' }; }
    }
    // لیست گروه‌ها
    if (/(لیست|نشون|نمایش|چیا|کدوم)/.test(t) && /گروه\s*ها|گروهها/.test(t)) {
      const gs = allGroups(db, uid);
      return { action: 'crm', message: 'گروه‌های شما:\n' + gs.map(g => `• ${g.label}${g.builtin ? '' : ' (سفارشی)'}`).join('\n') + '\nبرای گروه جدید بگو: «گروه جدید بساز به نام همکاران».' };
    }
    let gKey = '';
    const tl = t.toLowerCase();
    for (const [w, k] of Object.entries(GROUP_WORDS)) if (tl.includes(w)) { gKey = k; break; }
    // گروه‌های سفارشی کاربر
    if (!gKey) { for (const g of ((db.personGroups || {})[uid] || [])) if (t.includes(normalizeFa(g.label))) { gKey = g.key; break; } }
    const name = crmFindName(db, uid, t.replace(/گروه|بذار|بگذار|کن|توی|تو|در|vip|وی\s*آی\s*پی|عمده|خرده|عادی|معمولی|ویژه/gi, ' '));
    const p = name ? helpers.findPerson(name) : null;
    if (p && gKey) { p.group = gKey; return { action: 'crm', message: `«${p.name}» در گروه «${groupLabel(db, uid, gKey)}» قرار گرفت. ✅` }; }
    if (p && /(چیه|چنده|کدومه)/.test(t)) return { action: 'crm', message: `گروه «${p.name}»: ${groupLabel(db, uid, p.group)}${p.discountPct ? ` — تخفیف اختصاصی ${faN(p.discountPct)}٪` : ''}.` };
    if (!p) return { action: 'crm', message: 'نام شخص را متوجه نشدم. مثال: «علی رو بذار تو گروه VIP».' };
    return { action: 'crm', message: 'گروه را متوجه نشدم. گروه‌های موجود: ' + allGroups(db, uid).map(g => g.label).join('، ') + '. برای گروه جدید بگو: «گروه جدید بساز به نام همکاران».' };
  }

  /* --- تخفیف اختصاصی --- */
  if (/تخفیف\s*(اختصاصی|ویژه|ثابت)/.test(t)) {
    const pm = /(\d+(?:\.\d+)?)\s*(?:درصد|٪|%)/.exec(t.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    const name = crmFindName(db, uid, t.replace(/تخفیف\s*(اختصاصی|ویژه|ثابت)|درصد|بذار|بگذار|کن/g, ' '));
    const p = name ? helpers.findPerson(name) : null;
    if (!p) return { action: 'crm', message: 'نام شخص را متوجه نشدم. مثال: «تخفیف اختصاصی علی رو ۱۰ درصد بذار».' };
    if (pm) { p.discountPct = Math.min(100, parseFloat(pm[1])); return { action: 'crm', message: `تخفیف اختصاصی «${p.name}» روی ${faN(p.discountPct)}٪ تنظیم شد. از این پس در فاکتورهای او خودکار اعمال می‌شود. ✅` }; }
    if (/(حذف|بردار|صفر)/.test(t)) { p.discountPct = 0; return { action: 'crm', message: `تخفیف اختصاصی «${p.name}» حذف شد.` }; }
    return { action: 'crm', message: p.discountPct ? `تخفیف اختصاصی «${p.name}»: ${faN(p.discountPct)}٪.` : `برای «${p.name}» تخفیف اختصاصی تنظیم نشده.` };
  }

  /* --- جریمهٔ دیرکرد --- */
  if (/جریمه/.test(t)) {
    const st = getCrmSettings(db, uid);
    // تنظیم نرخ: «نرخ جریمه دیرکرد رو ۳ درصد کن»
    const rate = /(\d+(?:\.\d+)?)\s*(?:درصد|٪|%)/.exec(t.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
    if (/(نرخ|سیاست|تنظیم)/.test(t) && rate) {
      setCrmSettings(db, uid, { lateFee: { enabled: true, monthlyPct: parseFloat(rate[1]) } });
      return { action: 'crm', message: `سیاست جریمهٔ دیرکرد فعال شد: ${rate[1]}٪ ماهانه پس از ${st.lateFee.graceDays} روز مهلت. ✅` };
    }
    if (/(غیرفعال|خاموش)/.test(t)) { setCrmSettings(db, uid, { lateFee: { enabled: false } }); return { action: 'crm', message: 'جریمهٔ دیرکرد غیرفعال شد.' }; }
    const name = crmFindName(db, uid, t.replace(/جریمه|دیرکرد|ثبت|اعمال|بزن|نشون|بده|چقدر|چنده|های|ها/g, ' '));
    const p = name ? helpers.findPerson(name) : null;
    if (p) {
      const info = lateFeeFor(db, uid, p, st.lateFee);
      if (/(ثبت|اعمال|بزن|حساب کن و ثبت)/.test(t)) {
        if (!st.lateFee.enabled) return { action: 'crm', message: 'سیاست جریمه غیرفعال است. اول بگو: «نرخ جریمه دیرکرد رو ۲ درصد کن».' };
        const r = applyLateFee(db, uid, p, helpers);
        if (!r) return { action: 'crm', message: `«${p.name}» جریمه‌ای ندارد (در مهلت است یا بدهی ندارد).` };
        if (r.blocked) return { action: 'crm', message: `جریمهٔ «${p.name}» همین ${faN(r.sinceDays)} روز پیش ثبت شده؛ برای جلوگیری از جریمهٔ مضاعف، ${faN(r.nextInDays)} روز دیگر دوباره امکان‌پذیر است.` };
        return { action: 'crm', canUndo: false, message: `جریمهٔ دیرکرد ${faN(r.info.fee)} تومان برای «${p.name}» ثبت شد (${faN(r.info.overdueDays)} روز تاخیر) و به طلب شما اضافه شد. سند حسابداری هم خورد. ✅` };
      }
      return { action: 'crm', message: info.fee > 0 ? `جریمهٔ دیرکرد «${p.name}» تاکنون: ${faN(info.fee)} تومان (${faN(info.overdueDays)} روز پس از مهلت، روی بدهی ${faN(info.balance)}).\nبرای ثبت بگو: «جریمه دیرکرد ${p.name} رو ثبت کن».` : `«${p.name}» فعلاً جریمه‌ای ندارد.` };
    }
    // لیست کل جریمه‌ها
    const list = lateFeeList(db, uid);
    if (!st.lateFee.enabled) return { action: 'crm', message: 'سیاست جریمهٔ دیرکرد غیرفعال است. برای فعال‌سازی بگو: «نرخ جریمه دیرکرد رو ۲ درصد کن».' };
    if (!list.length) return { action: 'crm', message: 'هیچ مشتری‌ای مشمول جریمهٔ دیرکرد نیست. 👌' };
    return { action: 'crm', message: 'جریمه‌های دیرکرد قابل‌ثبت:\n' + list.slice(0, 8).map(r => `• ${r.name}: ${faN(r.fee)} تومان (${faN(r.overdueDays)} روز تاخیر)`).join('\n') };
  }

  /* --- امتیاز اعتباری --- */
  if (/امتیاز\s*(اعتباری)?|اعتبارسنجی/.test(t) && /امتیاز|اعتبارسنجی/.test(t)) {
    const name = crmFindName(db, uid, t.replace(/امتیاز|اعتباری|اعتبارسنجی|چنده|چقدر|چیه|نشون|بده/g, ' '));
    const p = name ? helpers.findPerson(name) : null;
    if (p) {
      const ci = creditInfo(db, uid, p.id);
      if (ci.insufficientData) return { action: 'crm', message: `امتیاز اعتباری «${p.name}»: نامشخص — هنوز معاملهٔ نسیه‌ای با او ثبت نشده تا رفتارش قابل سنجش باشد.` };
      const fx = (ci.factors || []).map(f => `  - ${f.name}: ${faN(f.got)}/${faN(f.max)}`).join('\n');
      return { action: 'crm', message: `امتیاز اعتباری «${p.name}»: ${faN(ci.score)} از ۱۰۰ (${ci.label})\n• کل طلب تاریخی: ${faN(ci.totalReceivable)} | وصول‌شده: ${faN(ci.collected)}\n• بدهی فعلی: ${faN(Math.max(0, ci.balance))}${ci.balance > 0 ? ` (${faN(ci.debtDays)} روز)` : ''}${ci.avgSettleDays !== null ? `\n• میانگین زمان تسویه: ${faN(ci.avgSettleDays)} روز` : ''}\nعوامل:\n${fx}` };
    }
    // رتبه‌بندی کلی
    const ranked = db.persons.filter(x => x.userId === uid).map(x => ({ name: x.name, ...creditInfo(db, uid, x.id) })).filter(x => !x.insufficientData && x.score != null).sort((a, b) => b.score - a.score);
    if (!ranked.length) return { action: 'crm', message: 'هنوز داده‌ای برای امتیازدهی نیست (طلبی ثبت نشده).' };
    return { action: 'crm', message: 'امتیاز اعتباری مشتریان:\n' + ranked.slice(0, 8).map(r => `${r.score >= 80 ? '🟢' : r.score >= 60 ? '🟡' : r.score >= 40 ? '🟠' : '🔴'} ${r.name}: ${faN(r.score)} (${r.label})`).join('\n') };
  }

  /* --- یادآوری‌ها --- */
  if (/یادآوری/.test(t)) {
    if (/(هر|تنظیم|زمانبندی|زمان بندی)/.test(t)) {
      const dm = /هر\s+(\d+|[آ-ی]+)\s*روز/.exec(t.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
      if (dm) {
        const every = /^\d/.test(dm[1]) ? parseInt(dm[1]) : ({ 'سه': 3, 'پنج': 5, 'هفت': 7, 'ده': 10, 'چهارده': 14 }[dm[1]] || 7);
        setCrmSettings(db, uid, { reminderCadence: { enabled: true, everyDays: every } });
        return { action: 'crm', message: `یادآوری خودکار تنظیم شد: هر ${faN(every)} روز برای بدهکاران. ✅` };
      }
    }
    const due = dueReminders(db, uid);
    if (!due.length) return { action: 'crm', message: 'فعلاً کسی نیاز به یادآوری ندارد. 👌' };
    return { action: 'crm', reminders: due, message: `${faN(due.length)} نفر در نوبت یادآوری هستند:\n` + due.slice(0, 8).map(r => `• ${r.name}: ${faN(r.balance)} تومان (${faN(r.days)} روز)`).join('\n') + '\nاز بخش «مطالبات» می‌توانی با یک لمس برایشان پیام بفرستی.' };
  }

  /* --- گزارش وصولی‌ها --- */
  if (/وصولی|وصول\s*ها|گزارش\s*وصول/.test(t)) {
    const rep = collectionsReport(db, uid);
    const monthsTxt = rep.months.length ? rep.months.map(m => `• ${m.month}: ${faN(m.value)}`).join('\n') : '—';
    return { action: 'crm', message: `گزارش وصولی‌ها:\nکل وصول‌شدهٔ تاریخی: ${faN(rep.totalCollected)} تومان\nمطالبات باز: ${faN(rep.outstanding)} تومان\nپیش‌بینی وصول (وزن‌دار بر اساس رفتار مشتری): ${faN(rep.expectedTotal)} تومان\nوصولی ماه‌های اخیر:\n${monthsTxt}` };
  }

  /* --- صورتحساب شخص --- */
  if (/صورتحساب|صورت\s*حساب|کارت\s*حساب/.test(t)) {
    const name = crmFindName(db, uid, t.replace(/صورتحساب|صورت\s*حساب|کارت\s*حساب|بده|بفرست|چاپ|نشون/g, ' '));
    const p = name ? helpers.findPerson(name) : null;
    if (!p) return { action: 'crm', message: 'نام شخص را متوجه نشدم. مثال: «صورتحساب علی رو بده».' };
    const st = personStatement(db, uid, p);
    const tail = st.rows.slice(-5).map(r => `• ${r.title.slice(0, 25)}: ${r.debit ? faN(r.debit) + ' بد' : faN(r.credit) + ' بس'} → مانده ${faN(r.running)}`).join('\n');
    return { action: 'crm', statementPersonId: p.id, message: `صورتحساب «${p.name}» — ماندهٔ نهایی: ${faN(st.closing)} تومان ${st.closing > 0 ? '(بدهکار به شما)' : st.closing < 0 ? '(بستانکار از شما)' : '(تسویه)'}\nآخرین گردش‌ها:\n${tail || '—'}\nنسخهٔ چاپی با سربرگ: بخش اشخاص → دفتر حساب → «صورتحساب رسمی».` };
  }

  return null;
}

/* ------------------------- هشدارهای CRM برای داشبورد ------------------------- */
export function crmAlerts(db, uid) {
  const out = [];
  // عبور از سقف اعتبار
  for (const p of db.persons.filter(x => x.userId === uid && Number(x.creditLimit || 0) > 0)) {
    const bal = crmPersonBalance(db, uid, p.id);
    if (bal > Number(p.creditLimit)) out.push({ level: 'danger', icon: 'credit', title: 'عبور از سقف اعتبار', text: `بدهی «${p.name}» (${faN(bal)}) از سقف اعتبار ${faN(p.creditLimit)} تومان گذشته است.` });
    else if (bal > Number(p.creditLimit) * 0.85) out.push({ level: 'warning', icon: 'credit', title: 'نزدیک سقف اعتبار', text: `«${p.name}» به ${faN(Math.round(bal / Number(p.creditLimit) * 100))}٪ سقف اعتبار خود رسیده.` });
  }
  // یادآوری‌های در نوبت
  const due = dueReminders(db, uid);
  if (due.length) out.push({ level: 'info', icon: 'reminder', title: 'یادآوری وصول در نوبت', text: `${faN(due.length)} مشتری در نوبت یادآوری هستند (جمعاً ${faN(due.reduce((s, r) => s + r.balance, 0))} تومان).` });
  return out;
}
