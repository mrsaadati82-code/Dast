// موتور NLQ ترکیبی «دست راست» — تحلیلگر مالی محاوره‌ای
// سوال فارسی → { metric, dimension, aggregation, timeRange, filters } → اجرا روی داده
// → پاسخ ساخت‌یافته { answer, table?, chart?, total? } برای رندر در چت.
// همچنین: گزارش‌ساز سفارشی (runReport)، بینش‌های پیشگیرانه (proactiveInsights)
// و سنجش کیفیت موتور (engineQuality).
import { normalizeFa, faToEnDigits, parseTimeRangeFa, parseAmount, cleanPersonName, todayJalali, MONTHS_FA, jalaliMonthLength } from './nlp.js';

const DAY = 86400000;
const faN = n => Math.round(Number(n) || 0).toLocaleString('fa-IR');
const MONTH_NAMES = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/* ===================== ابزار تاریخ شمسی ===================== */
function jalaliYM(iso) {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso));
    const y = parts.find(p => p.type === 'year')?.value || '';
    const m = parts.find(p => p.type === 'month')?.value || '';
    return { y: +y, m: +m };
  } catch { return { y: 0, m: 0 }; }
}
function jalaliDayKey(iso) {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'long', day: 'numeric' }).format(new Date(iso));
  } catch { return ''; }
}

/* ===================== ۱) پارز سوال ترکیبی ===================== */
// خروجی: { metric: expense|income|net|receivable|payable|count|balance,
//          agg: sum|max|min|avg|avgDaily|count|list|compare|share|trend,
//          dim: category|person|month|day|bank|method|none,
//          range, topicCategory, topicPerson, limit }
export function parseQuery(q, ctx = {}) {
  const t = normalizeFa(faToEnDigits(q));
  const Q = { metric: 'expense', agg: 'sum', dim: 'none', range: null, topicCategory: '', topicPerson: '', limit: 5, raw: t };

  // بازهٔ زمانی (این ماه/ماه قبل/فروردین/امسال/هفته...)
  Q.range = parseTimeRangeFa(t);

  // metric
  if (/(درآمد|دریافتی|فروش)/.test(t) && !/(هزینه|خرج)/.test(t)) Q.metric = 'income';
  else if (/(خالص|سود|زیان|مانده\s*(ماه|دوره))/.test(t)) Q.metric = 'net';
  else if (/(طلب|بستانکار)/.test(t) && !/(بدهی|بدهکار)/.test(t)) Q.metric = 'receivable';
  else if (/(بدهی|بدهکار)/.test(t) && !/(طلب|بستانکار)/.test(t)) Q.metric = 'payable';
  else if (/(تعداد|چند\s*(تا|تراکنش|بار))/.test(t)) Q.metric = 'count';
  else if (/(موجودی|حساب\s*ها|صندوق)/.test(t) && !/(خرج|هزینه)/.test(t)) Q.metric = 'balance';

  // aggregation
  if (/(بیشترین|بزرگ\s*ترین|گرون\s*ترین|بالاترین|بیشتر از همه)/.test(t)) Q.agg = 'max';
  else if (/(کمترین|کوچک\s*ترین|ارزون\s*ترین|پایین\s*ترین)/.test(t)) Q.agg = 'min';
  else if (/میانگین|متوسط/.test(t)) Q.agg = /(روزانه|روزی|هر\s*روز)/.test(t) ? 'avgDaily' : 'avg';
  else if (/مقایسه/.test(t)) Q.agg = 'compare';
  else if (/(سهم|درصد|چند\s*درصد)/.test(t)) { Q.agg = 'share'; Q.dim = 'category'; }
  else if (/(روند|نمودار|تغییرات)/.test(t)) Q.agg = 'trend';
  else if (/(لیست|فهرست|کدوما|چیا(ست)?\b|نشون بده همه)/.test(t)) Q.agg = 'list';
  else if (/(تعداد|چند\s*بار|چند\s*تا)/.test(t)) Q.agg = 'count';

  // dimension (تفکیک بر اساس...)
  if (/(به\s*تفکیک|بر\s*اساس|تو\s*هر|در\s*هر)\s*(دسته|گروه)/.test(t) || /(کدوم|کدام)\s*دسته/.test(t)) Q.dim = 'category';
  else if (/(به\s*تفکیک|بر\s*اساس)\s*(شخص|نفر|مشتری|افراد)/.test(t) || /(به\s*کی|از\s*کی|کدوم\s*(شخص|مشتری))/.test(t)) Q.dim = 'person';
  else if (/(به\s*تفکیک|بر\s*اساس|هر)\s*ماه|ماهانه|ماه\s*به\s*ماه/.test(t)) Q.dim = 'month';
  else if (/(به\s*تفکیک|بر\s*اساس|هر)\s*روز|روز\s*به\s*روز/.test(t) && Q.agg !== 'avgDaily') Q.dim = 'day';
  else if (/(به\s*تفکیک|بر\s*اساس)\s*(بانک|حساب)/.test(t)) Q.dim = 'bank';

  // اگر «بیشترین/کمترین» + «چی بود» → موضوع تک‌تراکنش؛ + «دسته» → بُعد دسته
  if ((Q.agg === 'max' || Q.agg === 'min') && /(کدوم|کدام)\s*دسته|دسته\s*ای/.test(t)) Q.dim = 'category';
  if ((Q.agg === 'max' || Q.agg === 'min') && /(به\s*کی|از\s*کی)/.test(t)) Q.dim = 'person';

  // topic: دسته یا برند («بابت اسنپ»، «هزینه خوراکی»)
  const cats = ctx.categories || [];
  const sorted = [...cats].sort((a, b) => b.length - a.length);
  for (const c of sorted) { if (t.includes(normalizeFa(c))) { Q.topicCategory = c; break; } }
  // تطبیق جزئی: «رستوران» → «رستوران و کافه» (واژهٔ معنادار دسته در متن باشد)
  if (!Q.topicCategory) {
    for (const c of sorted) {
      const words = normalizeFa(c).split(/\s+/).filter(w => w.length > 2 && w !== 'سایر');
      if (words.some(w => t.includes(w))) { Q.topicCategory = c; break; }
    }
  }
  if (!Q.topicCategory) {
    const tm = /بابت\s+([آ-ی ]{2,20}?)(?:\s+(?:چقدر|چنده|خرج|هزینه|چی|کی)|\s*[؟?]|$)/.exec(t);
    if (tm) Q.topicCategory = tm[1].trim(); // برند آزاد — با includes روی title هم match می‌شود
  }
  // topic: شخص
  const pm = /(?:به|از|با|برای)\s+([آ-ی]+(?:\s+[آ-ی]+){0,2})\s+(?:چقدر|چی|چند)/.exec(t);
  if (pm) { const nm = cleanPersonName(pm[1]); if (nm && (ctx.personNames || []).some(p => p.includes(nm) || nm.includes(p))) Q.topicPersonName = nm; }
  for (const p of (ctx.personNames || []).slice().sort((a, b) => b.length - a.length)) {
    if (t.includes(normalizeFa(p))) { Q.topicPersonName = p; break; }
  }
  // limit «۳ تای اول»
  const lm = /(\d+)\s*(تا(ی)?|مورد)\s*(اول|برتر)/.exec(t);
  if (lm) Q.limit = Math.min(20, +lm[1]);
  return Q;
}

/* ===================== ۲) اجرا روی داده ===================== */
function inRange(tx, range) {
  if (!range) return true;
  if (range.month) { const { m } = jalaliYM(tx.createdAt); return m === range.month; }
  const ts = new Date(tx.createdAt).getTime();
  return ts >= (range.from || 0) && ts <= (range.to || Date.now());
}
function matchTopic(tx, Q) {
  if (!Q.topicCategory) return true;
  const top = normalizeFa(Q.topicCategory);
  return normalizeFa(tx.category || '').includes(top) || normalizeFa(tx.title || '').includes(top) || normalizeFa(tx.party || '').includes(top);
}
const sum = a => a.reduce((s, x) => s + Number(x.amount || 0), 0);

export function runQuery(Q, data) {
  const { txs = [], persons = [], accounts = [] } = data;
  const rangeLbl = Q.range ? `${Q.range.label} ` : '';
  const catLbl = Q.topicCategory ? `بابت «${Q.topicCategory}» ` : '';

  /* --- موجودی حساب‌ها --- */
  if (Q.metric === 'balance') {
    const rows = accounts.map(a => ({ name: a.title, value: a.balance }));
    const total = rows.reduce((s, r) => s + r.value, 0);
    return { answer: `موجودی کل حساب‌ها: ${faN(total)} تومان`, chart: { type: 'hbar', title: 'موجودی حساب‌ها', rows }, total };
  }

  /* --- طلب/بدهی اشخاص --- */
  if (Q.metric === 'receivable' || Q.metric === 'payable') {
    const rec = Q.metric === 'receivable';
    if (Q.topicPersonName) {
      const p = persons.find(x => x.name === Q.topicPersonName) || persons.find(x => x.name.includes(Q.topicPersonName));
      if (!p) return { answer: `شخصی به نام «${Q.topicPersonName}» پیدا نکردم.` };
      if (p.balance > 0) return { answer: `«${p.name}» ${faN(p.balance)} تومان به شما بدهکار است (طلب شما).`, total: p.balance };
      if (p.balance < 0) return { answer: `شما ${faN(Math.abs(p.balance))} تومان به «${p.name}» بدهکارید.`, total: p.balance };
      return { answer: `حساب شما با «${p.name}» تسویه است.`, total: 0 };
    }
    const list = persons.filter(p => rec ? p.balance > 0 : p.balance < 0)
      .map(p => ({ name: p.name, value: Math.abs(p.balance) }))
      .sort((a, b) => b.value - a.value);
    if (!list.length) return { answer: rec ? 'فعلاً طلبی از کسی ندارید.' : 'فعلاً به کسی بدهی ندارید.' };
    const total = list.reduce((s, r) => s + r.value, 0);
    if (Q.agg === 'max') return { answer: `بیشترین ${rec ? 'طلب شما از' : 'بدهی شما به'} «${list[0].name}» است: ${faN(list[0].value)} تومان.`, chart: { type: 'hbar', title: rec ? 'طلب از اشخاص' : 'بدهی به اشخاص', rows: list.slice(0, Q.limit) }, total };
    return { answer: `جمع ${rec ? 'طلب شما' : 'بدهی شما'}: ${faN(total)} تومان (${list.length.toLocaleString('fa-IR')} نفر)`, chart: { type: 'hbar', title: rec ? 'طلب از اشخاص' : 'بدهی به اشخاص', rows: list.slice(0, Q.limit) }, total };
  }

  /* --- مقایسه این ماه/ماه قبل --- */
  if (Q.agg === 'compare') {
    const [, , jd] = todayJalali();
    const curFrom = Date.now() - (jd - 1) * DAY;
    const cur = txs.filter(x => new Date(x.createdAt).getTime() >= curFrom && matchTopic(x, Q));
    const prev = txs.filter(x => { const ts = new Date(x.createdAt).getTime(); return ts >= curFrom - 31 * DAY && ts < curFrom && matchTopic(x, Q); });
    const ce = sum(cur.filter(x => x.type === 'expense')), pe = sum(prev.filter(x => x.type === 'expense'));
    const ci = sum(cur.filter(x => x.type === 'income')), pi = sum(prev.filter(x => x.type === 'income'));
    const pct = (a, b) => b ? Math.round((a - b) / b * 100) : (a ? 100 : 0);
    return {
      answer: `مقایسهٔ ${catLbl}این ماه با ماه قبل:\nهزینه: ${faN(ce)} در برابر ${faN(pe)} (${pct(ce, pe) >= 0 ? '+' : ''}${faN(pct(ce, pe))}٪)\nدرآمد: ${faN(ci)} در برابر ${faN(pi)} (${pct(ci, pi) >= 0 ? '+' : ''}${faN(pct(ci, pi))}٪)\nخالص: ${faN(ci - ce)} در برابر ${faN(pi - pe)}`,
      table: { title: 'مقایسهٔ دوره‌ای', headers: ['', 'این ماه', 'ماه قبل', 'تغییر'], rows: [
        ['هزینه', faN(ce), faN(pe), `${pct(ce, pe) >= 0 ? '+' : ''}${faN(pct(ce, pe))}٪`],
        ['درآمد', faN(ci), faN(pi), `${pct(ci, pi) >= 0 ? '+' : ''}${faN(pct(ci, pi))}٪`],
        ['خالص', faN(ci - ce), faN(pi - pe), '']] },
      chart: { type: 'bars2', title: 'این ماه در برابر ماه قبل', rows: [{ name: 'هزینه', a: ce, b: pe }, { name: 'درآمد', a: ci, b: pi }], legend: ['این ماه', 'ماه قبل'] }
    };
  }

  /* --- فیلتر پایه برای metricهای تراکنشی --- */
  // برای «سهم»، مخرج باید کل (بدون فیلتر topic) باشد
  let list = txs.filter(x => inRange(x, Q.range) && (Q.agg === 'share' ? true : matchTopic(x, Q)));
  if (Q.topicPersonName) list = list.filter(x => (x.party || '').includes(Q.topicPersonName));
  const typed = Q.metric === 'income' ? list.filter(x => x.type === 'income')
    : Q.metric === 'net' || Q.metric === 'count' ? list
    : list.filter(x => x.type === 'expense');
  const metricFa = Q.metric === 'income' ? 'درآمد' : Q.metric === 'net' ? 'خالص' : Q.metric === 'count' ? 'تراکنش' : 'هزینه';

  /* --- روند ماهانه / بُعد ماه --- */
  if (Q.agg === 'trend' || Q.dim === 'month') {
    const by = {};
    for (const x of typed) { const { y, m } = jalaliYM(x.createdAt); const k = `${y}-${String(m).padStart(2, '0')}`; by[k] ||= { name: `${MONTH_NAMES[m]} ${String(y).slice(-2)}`, value: 0, k }; by[k].value += (Q.metric === 'net' ? (x.type === 'income' ? 1 : -1) : 1) * Number(x.amount || 0); }
    const rows = Object.values(by).sort((a, b) => a.k.localeCompare(b.k)).slice(-8).map(({ name, value }) => ({ name, value }));
    if (!rows.length) return { answer: `${rangeLbl}${catLbl}داده‌ای برای روند ${metricFa} نیست.` };
    return { answer: `روند ${metricFa} ${catLbl}ماه به ماه:`, chart: { type: 'hbar', title: `روند ${metricFa}`, rows }, total: rows.reduce((s, r) => s + r.value, 0) };
  }

  /* --- بُعد روز --- */
  if (Q.dim === 'day') {
    const by = {};
    for (const x of typed) { const k = jalaliDayKey(x.createdAt); by[k] = (by[k] || 0) + Number(x.amount || 0); }
    const rows = Object.entries(by).map(([name, value]) => ({ name, value })).slice(-10);
    return { answer: `${metricFa} ${rangeLbl}${catLbl}روز به روز:`, chart: { type: 'hbar', title: `${metricFa} روزانه`, rows }, total: rows.reduce((s, r) => s + r.value, 0) };
  }

  /* --- بُعد دسته / شخص / بانک --- */
  if (Q.dim === 'category' || Q.dim === 'person' || Q.dim === 'bank') {
    const keyOf = x => Q.dim === 'category' ? (x.category || 'سایر') : Q.dim === 'person' ? (x.party || '—') : (x.bank || 'صندوق');
    const by = {};
    for (const x of typed) { const k = keyOf(x); by[k] = (by[k] || 0) + Number(x.amount || 0); }
    let rows = Object.entries(by).map(([name, value]) => ({ name, value })).filter(r => r.name !== '—').sort((a, b) => b.value - a.value);
    const total = rows.reduce((s, r) => s + r.value, 0);
    if (!rows.length) return { answer: `${rangeLbl}${catLbl}داده‌ای پیدا نشد.` };
    if (Q.agg === 'max') return { answer: `بیشترین ${metricFa} ${rangeLbl}در «${rows[0].name}» بود: ${faN(rows[0].value)} تومان (${faN(Math.round(rows[0].value / (total || 1) * 100))}٪ کل).`, chart: { type: 'donut', title: `${metricFa} به تفکیک`, rows: rows.slice(0, 7) }, total };
    if (Q.agg === 'min') { const last = rows[rows.length - 1]; return { answer: `کمترین ${metricFa} ${rangeLbl}در «${last.name}» بود: ${faN(last.value)} تومان.`, chart: { type: 'donut', title: `${metricFa} به تفکیک`, rows: rows.slice(0, 7) }, total }; }
    if (Q.agg === 'share' && Q.topicCategory) {
      const mine = rows.find(r => normalizeFa(r.name).includes(normalizeFa(Q.topicCategory)));
      const v = mine ? mine.value : 0;
      return { answer: `سهم «${Q.topicCategory}» از کل ${metricFa} ${rangeLbl}${faN(Math.round(v / (total || 1) * 100))}٪ است (${faN(v)} از ${faN(total)}).`, chart: { type: 'donut', title: `${metricFa} به تفکیک`, rows: rows.slice(0, 7) }, total };
    }
    return { answer: `${metricFa} ${rangeLbl}به تفکیک ${Q.dim === 'category' ? 'دسته' : Q.dim === 'person' ? 'شخص' : 'حساب'} — جمع ${faN(total)} تومان:`, chart: { type: 'donut', title: `${metricFa} به تفکیک`, rows: rows.slice(0, Q.limit + 2) }, total };
  }

  /* --- بیشترین/کمترین تک‌تراکنش --- */
  if (Q.agg === 'max' || Q.agg === 'min') {
    const sortedTx = [...typed].sort((a, b) => Number(b.amount) - Number(a.amount));
    const m = Q.agg === 'max' ? sortedTx[0] : sortedTx[sortedTx.length - 1];
    if (!m) return { answer: `${rangeLbl}${catLbl}تراکنشی ثبت نشده.` };
    const top = sortedTx.slice(0, Q.limit).map(x => ({ name: x.title.slice(0, 24), value: Number(x.amount) }));
    return { answer: `${Q.agg === 'max' ? 'بیشترین' : 'کمترین'} ${metricFa} ${rangeLbl}${catLbl}«${m.title}» بود: ${faN(m.amount)} تومان (دسته: ${m.category}${m.date ? `، ${m.date}` : ''}).`, chart: { type: 'hbar', title: `${Q.limit.toLocaleString('fa-IR')} ${metricFa} برتر`, rows: top } };
  }

  /* --- میانگین روزانه --- */
  if (Q.agg === 'avgDaily') {
    if (!typed.length) return { answer: `${rangeLbl}${catLbl}${metricFa}‌ای ثبت نشده.` };
    const t0 = Q.range && Q.range.from ? Q.range.from : Math.min(...typed.map(x => new Date(x.createdAt).getTime()));
    const t1 = Q.range && Q.range.to ? Q.range.to : Date.now();
    const days = Math.max(1, Math.round((t1 - t0) / DAY));
    const total = sum(typed);
    return { answer: `میانگین ${metricFa} روزانهٔ شما ${rangeLbl}${catLbl}حدود ${faN(total / days)} تومان است (${faN(total)} تومان در ${faN(days)} روز).`, table: { title: 'میانگین روزانه', headers: ['جمع', 'روز', 'میانگین'], rows: [[faN(total), faN(days), faN(total / days)]] }, total };
  }

  /* --- میانگین تراکنش --- */
  if (Q.agg === 'avg') {
    if (!typed.length) return { answer: `${rangeLbl}${catLbl}تراکنشی نیست.` };
    return { answer: `میانگین هر ${metricFa} ${rangeLbl}${catLbl}${faN(sum(typed) / typed.length)} تومان است (${typed.length.toLocaleString('fa-IR')} تراکنش).`, total: sum(typed) / typed.length };
  }

  /* --- تعداد --- */
  if (Q.agg === 'count' || Q.metric === 'count') {
    return { answer: `${rangeLbl}${catLbl}${typed.length.toLocaleString('fa-IR')} تراکنش ثبت شده (جمع ${faN(sum(typed))} تومان).`, total: typed.length };
  }

  /* --- لیست --- */
  if (Q.agg === 'list') {
    const rows = typed.slice(0, 10).map(x => [x.date || '', x.title.slice(0, 28), faN(x.amount)]);
    if (!rows.length) return { answer: `${rangeLbl}${catLbl}موردی نیست.` };
    return { answer: `${rangeLbl}${catLbl}${typed.length.toLocaleString('fa-IR')} مورد — ${faN(sum(typed))} تومان:`, table: { title: metricFa, headers: ['تاریخ', 'شرح', 'مبلغ'], rows } };
  }

  /* --- net --- */
  if (Q.metric === 'net') {
    const i = sum(typed.filter(x => x.type === 'income')), e = sum(typed.filter(x => x.type === 'expense'));
    return { answer: `${rangeLbl}${catLbl}درآمد ${faN(i)}، هزینه ${faN(e)} و خالص ${faN(i - e)} تومان.`, table: { title: 'خلاصه', headers: ['درآمد', 'هزینه', 'خالص'], rows: [[faN(i), faN(e), faN(i - e)]] }, total: i - e };
  }

  /* --- sum پیش‌فرض --- */
  const total = sum(typed);
  return { answer: `${rangeLbl}${catLbl}مجموع ${metricFa} شما ${faN(total)} تومان است (${typed.length.toLocaleString('fa-IR')} تراکنش).`, total };
}

// ورودی سطح بالا: سوال → پاسخ ساخت‌یافته
export function answerNLQ(question, data) {
  const Q = parseQuery(question, { categories: data.categories || [], personNames: (data.persons || []).map(p => p.name) });
  const res = runQuery(Q, data);
  res.parsed = { metric: Q.metric, agg: Q.agg, dim: Q.dim, range: Q.range?.label || null, topic: Q.topicCategory || Q.topicPersonName || null };
  return res;
}

/* ===================== ۳) گزارش‌ساز سفارشی ===================== */
// spec = { metric, dim, rangeDays|month, type(income|expense|all), category, personId, sort, limit }
export function runReport(spec, data) {
  const { txs = [] } = data;
  let list = txs;
  if (spec.rangeDays) { const from = Date.now() - Number(spec.rangeDays) * DAY; list = list.filter(x => new Date(x.createdAt).getTime() >= from); }
  if (spec.month) list = list.filter(x => jalaliYM(x.createdAt).m === Number(spec.month));
  if (spec.type && spec.type !== 'all') list = list.filter(x => x.type === spec.type);
  if (spec.category) list = list.filter(x => x.category === spec.category);
  if (spec.personId) list = list.filter(x => x.personId === spec.personId);
  const dim = spec.dim || 'category';
  const keyOf = x => dim === 'person' ? (x.party || '—') : dim === 'month' ? (() => { const { y, m } = jalaliYM(x.createdAt); return `${MONTH_NAMES[m]} ${String(y).slice(-2)}`; })() : dim === 'bank' ? (x.bank || 'صندوق') : dim === 'method' ? (x.method || '—') : (x.category || 'سایر');
  const by = {};
  for (const x of list) { const k = keyOf(x); by[k] ||= { name: k, value: 0, count: 0 }; by[k].value += Number(x.amount || 0); by[k].count += 1; }
  let rows = Object.values(by);
  rows.sort((a, b) => spec.sort === 'count' ? b.count - a.count : b.value - a.value);
  if (spec.limit) rows = rows.slice(0, Number(spec.limit));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const totalCount = rows.reduce((s, r) => s + r.count, 0);
  return { rows, total, totalCount, generatedAt: new Date().toISOString() };
}

/* ===================== ۴) بینش‌های پیشگیرانه ===================== */
export function proactiveInsights(data) {
  const { txs = [], budgets = [], persons = [] } = data;
  const out = [];
  const now = Date.now();
  // ۱) جهش هزینهٔ دسته نسبت به میانگین ۳ ماه
  const cats = {};
  for (const x of txs.filter(x => x.type === 'expense')) {
    const age = Math.floor((now - new Date(x.createdAt).getTime()) / DAY);
    if (age > 120) continue;
    const c = x.category || 'سایر';
    cats[c] ||= { cur: 0, hist: 0, histMonths: new Set() };
    if (age <= 30) cats[c].cur += Number(x.amount);
    else { cats[c].hist += Number(x.amount); cats[c].histMonths.add(Math.floor(age / 30)); }
  }
  for (const [c, v] of Object.entries(cats)) {
    const histAvg = v.histMonths.size ? v.hist / v.histMonths.size : 0;
    if (histAvg > 100000 && v.cur > histAvg * 1.5) {
      out.push({ kind: 'spike', level: 'warning', title: `جهش هزینهٔ «${c}»`, text: `این ماه ${faN(v.cur)} تومان خرج «${c}» کرده‌ای — ${faN(Math.round((v.cur / histAvg - 1) * 100))}٪ بیشتر از میانگین ${v.histMonths.size.toLocaleString('fa-IR')} ماه قبل (${faN(histAvg)}).` });
    }
  }
  // ۲) نرخ پس‌انداز و پیشنهاد
  const m30 = txs.filter(x => (now - new Date(x.createdAt).getTime()) <= 30 * DAY);
  const inc30 = sum(m30.filter(x => x.type === 'income')), exp30 = sum(m30.filter(x => x.type === 'expense'));
  if (inc30 > 0) {
    const rate = Math.round((inc30 - exp30) / inc30 * 100);
    if (rate < 10 && exp30 > 0) {
      const topCat = Object.entries(cats).sort((a, b) => b[1].cur - a[1].cur)[0];
      out.push({ kind: 'saving', level: 'info', title: 'نرخ پس‌انداز پایین', text: `نرخ پس‌انداز این ماه ${rate < 0 ? 'منفی' : faN(rate) + '٪'} است.${topCat ? ` بزرگ‌ترین محل هزینه «${topCat[0]}» (${faN(topCat[1].cur)}) است؛ ۱۰٪ صرفه‌جویی در آن یعنی ${faN(topCat[1].cur * 0.1)} تومان پس‌انداز.` : ''}` });
    } else if (rate >= 30) {
      out.push({ kind: 'saving', level: 'success', title: 'پس‌انداز عالی 👏', text: `نرخ پس‌انداز این ماه ${faN(rate)}٪ است. پیشنهاد: ${faN((inc30 - exp30) * 0.5)} تومان از آن را به یک هدف پس‌انداز اختصاص بده.` });
    }
  }
  // ۳) هزینهٔ تکرارشونده (اشتراک‌مانند): عنوان مشابه ۳+ بار با مبلغ مشابه
  const rec = {};
  for (const x of txs.filter(x => x.type === 'expense' && (now - new Date(x.createdAt).getTime()) <= 120 * DAY)) {
    const k = normalizeFa(x.title).slice(0, 18);
    rec[k] ||= []; rec[k].push(Number(x.amount));
  }
  for (const [k, arr] of Object.entries(rec)) {
    if (arr.length >= 3) {
      const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
      const similar = arr.every(v => Math.abs(v - avg) < avg * 0.2);
      if (similar && avg > 50000) { out.push({ kind: 'recurring', level: 'info', title: 'هزینهٔ تکرارشونده', text: `«${k}» ${arr.length.toLocaleString('fa-IR')} بار با میانگین ${faN(avg)} تومان تکرار شده (${faN(avg)} در ماه ≈ ${faN(avg * 12)} در سال). اگر اشتراک است، بررسی کن لازم است یا نه.` }); break; }
  }
  }
  // ۴) تمرکز ریسک طلب: یک نفر > ۵۰٪ کل طلب
  const recv = persons.filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance);
  const recvTotal = recv.reduce((s, p) => s + p.balance, 0);
  if (recv.length >= 2 && recv[0].balance > recvTotal * 0.5) {
    out.push({ kind: 'risk', level: 'warning', title: 'تمرکز ریسک مطالبات', text: `${faN(Math.round(recv[0].balance / recvTotal * 100))}٪ کل طلب شما فقط نزد «${recv[0].name}» است (${faN(recv[0].balance)} تومان). وصول آن را در اولویت بگذار.` });
  }
  return out.slice(0, 6);
}

/* ===================== ۵) سنجش کیفیت موتور ===================== */
export function engineQuality(db, uid) {
  const txs = db.transactions.filter(t => t.userId === uid && /Assistant/i.test(t.method || ''));
  const corrections = (db.corrections || []).filter(c => c.userId === uid);
  const reclass = db.transactions.filter(t => t.userId === uid && t.reclassified);
  const totalParsed = txs.length;
  const corrected = corrections.length;
  const accuracy = totalParsed ? Math.max(0, Math.round((1 - corrected / totalParsed) * 100)) : null;
  // پیشنهاد خودکار قانون: واژهٔ مشترک در ۲+ اصلاح با مقدار یکسان
  const byValue = {};
  for (const c of corrections.filter(c => c.field === 'category')) {
    byValue[c.value] ||= [];
    byValue[c.value].push(normalizeFa(c.text));
  }
  const suggestions = [];
  for (const [value, texts] of Object.entries(byValue)) {
    if (texts.length < 2) continue;
    const words = {};
    for (const t of texts) for (const w of t.split(/\s+/)) { if (w.length > 2 && !/^\d+$/.test(w)) words[w] = (words[w] || 0) + 1; }
    const common = Object.entries(words).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])[0];
    if (common && !(db.aiRules || []).some(r => r.userId === uid && r.pattern === common[0])) {
      suggestions.push({ pattern: common[0], action: value, occurrences: common[1], reason: `${common[1].toLocaleString('fa-IR')} بار جمله‌های حاوی «${common[0]}» را به «${value}» اصلاح کرده‌ای.` });
    }
  }
  return { totalParsed, corrected, accuracy, rulesCount: (db.aiRules || []).filter(r => r.userId === uid).length, trainingCount: (db.assistantTraining || []).filter(t => t.userId === uid).length, suggestions: suggestions.slice(0, 5) };
}
