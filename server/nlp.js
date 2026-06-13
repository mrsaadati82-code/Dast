// ماژول مشترک درک زبان فارسی «دست راست»
// هر دو سرور (server/index.js و server-standalone.js) از همین فایل import می‌کنند
// تا موتور محلی همیشه یکسان و همگام باشد.

/* ------------------------- ماندهٔ شخص (تک‌منبع حقیقت) ------------------------- */
// + = او به ما بدهکار است (طلب ما)؛ − = ما به او بدهکاریم
// این تنها پیاده‌سازی مجاز است؛ هر دو سرور و crm.js از همین import می‌کنند.
export function personBalance(db, userId, personId) {
  return db.transactions.filter(t => t.userId === userId && t.personId === personId).reduce((sum, t) => {
    if (t.accountingSide === 'receivable') return sum + Number(t.amount || 0);
    if (t.accountingSide === 'payable') return sum - Number(t.amount || 0);
    if (t.accountingSide === 'settlement') return sum + Number(t.settlementDelta || 0);
    return sum;
  }, 0);
}

/* ------------------------- نرمال‌سازی پایه ------------------------- */
export function faToEnDigits(str = '') {
  const fa = '۰۱۲۳۴۵۶۷۸۹'; const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(str).replace(/[۰-۹]/g, d => fa.indexOf(d)).replace(/[٠-٩]/g, d => ar.indexOf(d));
}

// ترجمهٔ حداقلی فینگلیش/STT برای واژه‌های پولی پرکاربرد
const TRANSLIT = [
  [/\bhezar\b/gi, 'هزار'], [/\btooman\b|\btoman\b|\btomen\b/gi, 'تومن'],
  [/\bmillion\b|\bmilion\b/gi, 'میلیون'], [/\bmiliard\b|\bmilliard\b/gi, 'میلیارد'],
  [/\bdadam\b/gi, 'دادم'], [/\bgereftam\b/gi, 'گرفتم'], [/\bkharidam\b/gi, 'خریدم'],
  [/\btaxi\b/gi, 'تاکسی'], [/\bgharz\b/gi, 'قرض'],
];

// نرمال‌سازی متن برای تحلیل: حروف عربی→فارسی، ارقام، نیم‌فاصله→فاصله،
// املاهای محاوره/STT (تمن، چوق، پنجا...)، فینگلیش پایه
export function normalizeFa(text = '') {
  let t = String(text)
    .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/ۀ/g, 'ه').replace(/ة/g, 'ه')
    .replace(/\u200c/g, ' ')                 // نیم‌فاصله → فاصله (اسنپ‌فود = اسنپ فود)
    .replace(/\u0654/g, '')                  // همزهٔ بالای ه (هفتهٔ → هفته)
    .replace(/[ًٌٍَُِّْ]/g, '');             // اعراب
  for (const [re, rep] of TRANSLIT) t = t.replace(re, rep);
  t = t
    .replace(/تومنی|تومانی/g, 'تومنی')        // یکدست برای الگوی قیمت واحد
    .replace(/\bتمن\b|\sتمن\s|تمن$/g, ' تومن ')
    .replace(/چوق/g, 'تومن')                  // «صد چوق» = صد تومن (محاوره)
    .replace(/هزارتومن/g, 'هزار تومن').replace(/هزارتا/g, 'هزار')
    .replace(/\s+/g, ' ').trim();
  return t;
}

/* ------------------------- اعداد حرفی ------------------------- */
export const numberWords = {
  'صفر':0,'یه':1,'ی':1,'یک':1,'اول':1,'دو':2,'سه':3,'چار':4,'چهار':4,'پنج':5,'شیش':6,'شش':6,'هفت':7,'هشت':8,'نه':9,
  'ده':10,'یازده':11,'دوازده':12,'سیزده':13,'چهارده':14,'پونزده':15,'پانزده':15,'شانزده':16,'شونزده':16,'هفده':17,'هیفده':17,'هجده':18,'هیجده':18,'نوزده':19,
  'بیست':20,'سی':30,'سین':30,'چهل':40,'چل':40,'پنجاه':50,'پنجا':50,'شصت':60,'هفتاد':70,'هشتاد':80,'نود':90,
  'صد':100,'یکصد':100,'دویست':200,'دویس':200,'سیصد':300,'چهارصد':400,'چارصد':400,'پونصد':500,'پانصد':500,'ششصد':600,'شیشصد':600,'هفتصد':700,'هشتصد':800,'نهصد':900
};
export function wordsToNumber(phrase = '') {
  let p = String(phrase).trim();
  if (!p) return 0;
  let extra = 0;
  if (/سه\s*ربع/.test(p)) { extra += 0.75; p = p.replace(/سه\s*ربع/g, ' '); }
  else if (/ربع/.test(p)) { extra += 0.25; p = p.replace(/ربع/g, ' '); }
  if (/نیم/.test(p)) { extra += 0.5; p = p.replace(/نیم/g, ' '); }
  const clean = p.replace(/\s+و\s+/g, ' ').trim();
  let total = 0;
  for (const part of clean.split(/\s+/)) total += numberWords[part] || 0;
  return total + extra;
}

/* ------------------------- تفسیر مبلغ ------------------------- */
const UNIT_VAL = { 'میلیارد': 1e9, 'ملیارد': 1e9, 'میلیون': 1e6, 'ملیون': 1e6, 'هزار': 1e3 };
// جمع گروه‌های [عدد/حروف][واحد] : «دو میلیارد و پانصد میلیون» ، «یک و نیم میلیون»
function compositeAmount(t) {
  const re = /((?:\d+(?:\.\d+)?)|(?:[آ-ی][آ-ی ]*?))\s*(میلیارد|ملیارد|میلیون|ملیون|هزار)(?:ی\b)?/g;
  let m, sum = 0, found = false;
  while ((m = re.exec(t))) {
    let v = /^\d/.test(m[1].trim()) ? parseFloat(m[1]) : wordsToNumber(m[1]);
    if (!v) v = 1; // «هزار تومن دادم» = ۱×هزار
    sum += v * UNIT_VAL[m[2]];
    found = true;
  }
  return found ? Math.round(sum) : 0;
}
export const FOREIGN_CURRENCY_RE = /دلار|یورو|درهم|پوند|لیر|بیت\s*کوین|بیتکوین|تتر|اتریوم/;
export function parseAmount(text = '') {
  const original = normalizeFa(text);
  let t = faToEnDigits(original).replace(/[,٬]/g, '').replace(/٫/g, '.');
  // نقطهٔ هزارگان (2.000.000) را حذف کن — نقطهٔ اعشاری واقعی (2.5) دست‌نخورده می‌ماند
  t = t.replace(/(\d)\.(?=\d{3}(?:\D|$))/g, '$1');
  const isRial = /ریال/.test(t);
  const fin = v => Math.round(isRial ? v / 10 : v);
  // تعداد × قیمت واحد: «۳ تا مانیتور ۸۰۰ تومنی» / «۲ عدد کیبورد ۱.۵ میلیونی»
  let m = /(\d+(?:\.\d+)?)\s*(?:تا|عدد|دونه|دانه)\s+\S+\s+(\d+(?:\.\d+)?)\s*(میلیارد|میلیون|ملیون|هزار)?\s*(?:تومنی|تومنی?)/.exec(t);
  if (m) {
    const qty = parseFloat(m[1]); let unit = parseFloat(m[2]);
    if (m[3]) unit *= UNIT_VAL[m[3]]; else if (unit < 1000) unit *= 1000;
    return fin(qty * unit);
  }
  // ترکیب واحدها (میلیارد/میلیون/هزار با عدد یا حروف)
  const comp = compositeAmount(t);
  if (comp) return fin(comp);
  // حروف + تومن/تومان: «پنجاه تومن» = ۵۰٬۰۰۰
  m = /([آ-ی][آ-ی ]*?)\s*(تومن|تومان)/.exec(original);
  if (m) { const n = wordsToNumber(m[1]); if (n) return fin(n * 1000); }
  // عدد + تومن/تومان: <۱۰۰۰ → ×۱۰۰۰ (عرف محاوره)
  m = /(\d+(?:\.\d+)?)\s*(تومن|تومان)/.exec(t);
  if (m) { const v = parseFloat(m[1]); return fin(v < 1000 ? v * 1000 : v); }
  // N کا / Nk / 50k
  m = /(\d+(?:\.\d+)?)\s*(کا|k)\b/i.exec(t);
  if (m) return fin(parseFloat(m[1]) * 1000);
  m = /(\d+(?:\.\d+)?)\s*ریال/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) / 10);
  const num = /(\d+(?:\.\d+)?)/.exec(t);
  if (!num) return 0;
  let val = parseFloat(num[1]);
  if (val > 0 && val < 1000 && /(دادم|گرفتم|خریدم|فروختم|کرایه|تاکسی|اسنپ|خرج|هزینه|پرداخت|واریز|حقوق|طلب|بدهکار|بستانکار|قرض|دیگه دادم)/.test(original)) val *= 1000;
  return fin(val);
}

/* ------------------------- تاریخ شمسی + تاریخ نسبی ------------------------- */
export function jalaliToGregorian(jy, jm, jd) {
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
export function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = (gy <= 1600) ? 0 : 979; gy -= (gy <= 1600) ? 621 : 1600;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return [jy, jm, jd];
}
export function dateToJalaliStr(d) {
  const [jy, jm, jd] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}
export function todayJalali() { const d = new Date(); return gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
const isJalaliLeap = jy => [1, 5, 9, 13, 17, 22, 26, 30].includes(jy % 33);
export function jalaliMonthLength(jy, jm) { return jm <= 6 ? 31 : jm <= 11 ? 30 : (isJalaliLeap(jy) ? 30 : 29); }
export function jalaliStrToDate(s = '') {
  const t = faToEnDigits(String(s)); const m = /(\d{3,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(t);
  if (!m) return null;
  const [gy, gm, gd] = jalaliToGregorian(+m[1], +m[2], +m[3]);
  return new Date(gy, gm - 1, gd);
}
export function daysUntil(jalaliStr) {
  const d = jalaliStrToDate(jalaliStr); if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}
const MONTHS_FA = { فروردین: 1, اردیبهشت: 2, خرداد: 3, تیر: 4, مرداد: 5, شهریور: 6, مهر: 7, آبان: 8, آذر: 9, دی: 10, بهمن: 11, اسفند: 12 };
export { MONTHS_FA };
// تاریخ نسبی → آبجکت Date (یا null)
export function parseRelativeDate(text = '') {
  const t = normalizeFa(faToEnDigits(text));
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const add = days => { const d = new Date(now); d.setDate(d.getDate() + days); return d; };
  if (/پس\s*فردا|پسفردا/.test(t)) return add(2);
  if (/فردا/.test(t)) return add(1);
  if (/پریروز/.test(t)) return add(-2);
  if (/دیروز/.test(t)) return add(-1);
  if (/امروز/.test(t)) return add(0);
  let m = /(\d+|[آ-ی]+)\s*روز\s*(دیگه|دیگر|بعد|آینده)/.exec(t);
  if (m) { const n = /^\d/.test(m[1]) ? parseInt(m[1]) : wordsToNumber(m[1]); if (n) return add(n); }
  m = /(\d+|[آ-ی]+)?\s*هفته\s*(بعد|آینده|دیگه|دیگر)/.exec(t);
  if (m) { const n = m[1] ? (/^\d/.test(m[1]) ? parseInt(m[1]) : wordsToNumber(m[1]) || 1) : 1; return add(n * 7); }
  m = /(\d+|[آ-ی]+)?\s*ماه\s*(بعد|آینده|دیگه|دیگر)/.exec(t);
  if (m) { const n = m[1] ? (/^\d/.test(m[1]) ? parseInt(m[1]) : wordsToNumber(m[1]) || 1) : 1; return add(n * 30); }
  if (/آخر\s*ماه/.test(t)) { const [jy, jm, jd] = todayJalali(); const last = jalaliMonthLength(jy, jm); return add(last - jd); }
  if (/اول\s*هفته|شنبه\s*(بعد|آینده)?/.test(t)) { const delta = (6 - now.getDay() + 7) % 7 || 7; return add(delta); }
  if (/آخر\s*هفته|جمعه/.test(t)) { const delta = (5 - now.getDay() + 7) % 7 || 7; return add(delta); }
  return null;
}
// تاریخ گذشته برای «ثبت» تراکنش: دیروز/پریروز/N روز پیش/هفته پیش + تاریخ شمسی صریح گذشته
export function parsePastDateFa(text = '') {
  const t = normalizeFa(faToEnDigits(text));
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const add = d => { const x = new Date(now); x.setDate(x.getDate() + d); return x; };
  if (/پریروز/.test(t)) return add(-2);
  if (/دیروز/.test(t)) return add(-1);
  let m = /(\d+|[آ-ی]+)\s*روز\s*(پیش|قبل)/.exec(t);
  if (m) { const n = /^\d/.test(m[1]) ? parseInt(m[1]) : wordsToNumber(m[1]); if (n > 0 && n < 366) return add(-n); }
  m = /(\d+|[آ-ی]+)?\s*هفته\s*(پیش|قبل|گذشته)/.exec(t);
  if (m) { const n = m[1] ? (/^\d/.test(m[1]) ? parseInt(m[1]) : wordsToNumber(m[1]) || 1) : 1; return add(-n * 7); }
  m = /(\d+|[آ-ی]+)?\s*ماه\s*(پیش|قبل)/.exec(t);
  if (m) { const n = m[1] ? (/^\d/.test(m[1]) ? parseInt(m[1]) : wordsToNumber(m[1]) || 1) : 1; return add(-n * 30); }
  // تاریخ شمسی صریح فقط با پیشوند مکانی/زمانی (در/تو/تاریخ) و فقط اگر در گذشته باشد
  m = /(?:در|تو|توی|تاریخ)\s+(\d{1,2})\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/.exec(t);
  if (m) {
    const [jy] = todayJalali();
    const d = jalaliStrToDate(`${jy}/${String(MONTHS_FA[m[2]]).padStart(2, '0')}/${String(m[1]).padStart(2, '0')}`);
    if (d && d.getTime() < now.getTime()) { d.setHours(12, 0, 0, 0); return d; }
  }
  return null;
}
// تاریخ سررسید: مطلق (۱۵ مهر / 1404/07/15) یا نسبی (فردا، هفته بعد...)
export function parsePersianDueDate(text = '') {
  const t = faToEnDigits(normalizeFa(text));
  let m = /(\d{1,2})\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/.exec(t);
  if (m) { const [jy] = todayJalali(); return `${jy}/${String(MONTHS_FA[m[2]]).padStart(2, '0')}/${String(m[1]).padStart(2, '0')}`; }
  const d = /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(t);
  if (d) return `${d[1]}/${String(d[2]).padStart(2, '0')}/${String(d[3]).padStart(2, '0')}`;
  const rel = parseRelativeDate(t);
  if (rel) return dateToJalaliStr(rel);
  return '';
}
// بازهٔ زمانی پرسش تحلیلی: «این ماه»، «هفته پیش»، «از اول سال»، «فروردین» ...
export function parseTimeRangeFa(text = '') {
  const t = normalizeFa(faToEnDigits(text));
  const now = Date.now(); const DAY = 86400000;
  const [jy, jm, jd] = todayJalali();
  if (/امروز/.test(t)) { const d = new Date(); d.setHours(0, 0, 0, 0); return { from: d.getTime(), to: now, label: 'امروز' }; }
  if (/دیروز/.test(t)) { const d = new Date(); d.setHours(0, 0, 0, 0); return { from: d.getTime() - DAY, to: d.getTime(), label: 'دیروز' }; }
  if (/این\s*هفته|هفته\s*جاری/.test(t)) return { from: now - 7 * DAY, to: now, label: 'این هفته' };
  if (/هفته\s*(پیش|قبل|گذشته)/.test(t)) return { from: now - 14 * DAY, to: now - 7 * DAY, label: 'هفتهٔ پیش' };
  if (/این\s*ماه|ماه\s*جاری/.test(t)) return { from: now - (jd - 1) * DAY, to: now, label: 'این ماه' };
  if (/ماه\s*(پیش|قبل|گذشته)/.test(t)) { const pm = jm === 1 ? 12 : jm - 1; const py = jm === 1 ? jy - 1 : jy; const len = jalaliMonthLength(py, pm); const end = now - (jd - 1) * DAY; return { from: end - len * DAY, to: end, label: 'ماه قبل' }; }
  if (/امسال|این\s*سال|از\s*اول\s*سال|سال\s*جاری/.test(t)) { const elapsed = (jm <= 6 ? (jm - 1) * 31 : 186 + (jm - 7) * 30) + jd - 1; return { from: now - elapsed * DAY, to: now, label: 'امسال' }; }
  for (const [name, idx] of Object.entries(MONTHS_FA)) {
    if (new RegExp(`(تو|توی|در|ماه)\\s*${name}|${name}\\s*(ماه|چقدر|چی|چه)`).test(t)) return { month: idx, label: name };
  }
  return null;
}

/* ------------------------- نام شخص ------------------------- */
export function compactName(name = '') {
  let n = String(name).trim().replace(/\s+/g, ' ');
  // حذف القاب تا جایی که تکرار شوند: آقای دکتر رضایی → رضایی
  const TITLE_RE = /^(آقا|آقای|خانم|خانوم|جناب|سرکار|دکتر|مهندس|حاج\s*آقا|حاجی|حاج|استاد|سید|عمو|دایی|خاله|عمه|مش|کربلایی)\s+/;
  while (TITLE_RE.test(n)) n = n.replace(TITLE_RE, '');
  return n;
}
export const NAME_STOPWORDS = ['پول','مبلغ','قرض','چک','طلب','بدهی','بدهکار','بستانکار','دادم','گرفتم','پرداخت','دریافت','بده','واریز','برداشت','تومن','تومان','تومنی','میلیون','ملیون','میلیارد','هزار','ریال','بابت','برای','رو','را','که','از','به','با','کردم','شد','شدم','پس','دیگه','دیگر','هم','فردا','دیروز','امروز','چقدر','هنوز','تا','عدد','همون','همان','قبلی','شخص','نفر','بدهیش','طلبش','قرضش','بدهی‌اش','حسابش','پولش','داد','گرفت'];
// واژه‌هایی که شیء هستند نه شخص (برای جلوگیری از ساخت «شخص تاکسی»)
const NON_PERSON_WORDS = /^(همون|همان|شخص|نفر|قبلی|همون شخص|همون نفر|همین|خودش|اون|این|تاکسی|اسنپ|اتوبوس|مترو|بنزین|ناهار|نهار|شام|صبحانه|خرید|سوپر|مارکت|قبض|برق|آب|گاز|اینترنت|شارژ|دکتر|دارو|بلیط|هتل|سینما|کتاب|لباس|کفش|میوه|نان|نون|گوشت|مرغ|برنج|شیر|رستوران|کافه|قسط|وام|اجاره|کرایه|سفر|تعمیر|بیمه)$/;
export function cleanPersonName(name = '') {
  let n = compactName(name);
  // اشخاص حقوقی: شرکت/فروشگاه/... + نام → کامل نگه داشته شود
  const ORG = /^(شرکت|فروشگاه|بنگاه|مؤسسه|موسسه|مغازه|دفتر|آژانس|تعمیرگاه|کارگاه)\s+/;
  if (ORG.test(n)) {
    const parts = n.split(/\s+/); const out = [parts[0]];
    for (const w of parts.slice(1, 4)) { if (NAME_STOPWORDS.includes(w) || /\d/.test(w) || numberWords[w] !== undefined) break; out.push(w); }
    return out.length > 1 ? out.join(' ') : '';
  }
  const parts = n.split(/\s+/);
  const out = [];
  for (const w of parts) { if (NAME_STOPWORDS.includes(w) || /\d/.test(w) || numberWords[w] !== undefined) break; out.push(w); if (out.length >= 4) break; } // تا ۴ کلمه (اعداد حرفی جزو نام نیستند)
  const res = out.join(' ').trim();
  return NON_PERSON_WORDS.test(res) ? '' : res;
}
export function pickParty(text = '') {
  const m = /(از|به|برای|بابت)\s+([آ-یA-Za-z0-9_\- ]{2,24})/.exec(text);
  return m ? m[2].replace(/(طلب|بدهکار|قرض|پول|تومن|تومان).*/, '').trim() : '';
}
const NAME_TOKEN = '[آ-یA-Za-z]+(?:\\s+[آ-یA-Za-z]+){0,3}'; // ۱ تا ۴ کلمه (نیم‌فاصله‌ها به فاصله تبدیل شده‌اند)
export function extractPersonName(text = '') {
  const cleaned = normalizeFa(String(text))
    .replace(/برای\s+\d{1,2}\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/g, '')
    .replace(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g, '')
    .replace(/(برای|تا)\s*(پس\s*فردا|فردا|هفته\s*\S*\s*(بعد|آینده|دیگه)|ماه\s*(بعد|آینده)|آخر\s*ماه|اول\s*هفته|آخر\s*هفته)/g, '');
  const direct = new RegExp(`(?:از|به)\\s+(${NAME_TOKEN})\\s+(?:پول|مبلغ|قرض|چک|طلب|دادم|گرفتم|پرداخت|بده|بدهکار|بستانکار|چقدر)`).exec(cleaned);
  if (direct) { const r = cleanPersonName(direct[1]); if (r) return r; }
  const settle = new RegExp(`(?:حساب\\s+)?(${NAME_TOKEN})\\s+(?:رو|را)\\s+تسویه`).exec(cleaned)
    || new RegExp(`با\\s+(${NAME_TOKEN})\\s+تسویه`).exec(cleaned)
    || new RegExp(`تسویه\\s+(?:حساب\\s+)?(${NAME_TOKEN})`).exec(cleaned);
  if (settle) { const r = cleanPersonName(settle[1]); if (r) return r; }
  const patterns = [
    new RegExp(`از\\s+(${NAME_TOKEN})\\s+(?:پول|مبلغ|چک|طلب|قرض|گرفتم|دریافت|پس\\s*گرفتم)`),
    new RegExp(`به\\s+(${NAME_TOKEN})\\s+(?:پول|مبلغ|چک|قرض|دادم|پرداخت|پس\\s*دادم|بدهکارم)`),
    new RegExp(`(?:طلب از|بدهی به|بدهیم به|قرضم به)\\s+(${NAME_TOKEN})`)
  ];
  for (const r of patterns) { const m = r.exec(cleaned); if (m) { const res = cleanPersonName(m[1]); if (res) return res; } }
  const tail = new RegExp(`(?:^|\\s)(?:به|از|با)\\s+(${NAME_TOKEN})\\s*$`).exec(cleaned);
  if (tail) { const r = cleanPersonName(tail[1]); if (r) return r; }
  // فقط حرف اضافهٔ از/به (نه بابت/برای — آن‌ها معمولاً شیء هستند نه شخص)
  const pp = /(از|به)\s+([آ-یA-Za-z ]{2,24})/.exec(cleaned);
  if (pp && !/\d/.test(pp[2])) { const r = cleanPersonName(pp[2]); if (r) return r; }
  return '';
}
// ارجاع ضمیری به شخص قبلی: «بهش دادم»، «همون شخص قبلی»
export const CONTEXT_PERSON_RE = /بهش|ازش|باهاش|به\s*همون|از\s*همون|همون\s*(شخص|نفر|قبلی|آدم)|همان\s*(شخص|نفر|قبلی)|نفر\s*قبلی|شخص\s*قبلی/;
export const CONTEXT_AMOUNT_RE = /همون\s*مبلغ|همان\s*مبلغ|همون\s*قدر|همان\s*قدر/;

/* ------------------------- بانک‌ها ------------------------- */
const BANKS_SAFE = ['ملت','پاسارگاد','سامان','صادرات','تجارت','رفاه','سپه','کشاورزی','پارسیان','بلوبانک','رسالت','سینا','گردشگری','خاورمیانه','کارآفرین','اقتصاد نوین'];
const BANKS_AFTER_WORD = ['ملی','ملت','پاسارگاد','سامان','صادرات','تجارت','رفاه','سپه','کشاورزی','آینده','پارسیان','شهر','دی','مهر','مسکن','رسالت','سینا','گردشگری','پست'];
export function detectBank(text = '') {
  const t = normalizeFa(text);
  const m = new RegExp(`بانک\\s+(${BANKS_AFTER_WORD.join('|')}|اقتصاد\\s*نوین)`).exec(t);
  if (m) return 'بانک ' + m[1].replace(/\s+/g, ' ');
  for (const b of BANKS_SAFE) if (t.includes(b)) return b === 'بلوبانک' ? 'بلوبانک' : 'بانک ' + b;
  if (/(?<!کد )ملی/.test(t) && /بانک|کارت|حساب|واریز|برداشت/.test(t)) return 'بانک ملی';
  return '';
}

/* ------------------------- نیت‌های فرا-تراکنشی (نفی/آینده/سوال/ارز) ------------------------- */
const NEG_VERBS = /ندادم|ندادیم|نگرفتم|نگرفتیم|نخریدم|نکردم|نکردیم|نشد(?:ه|م)?\b|نپرداختم|نفرستادم|نریختم|پاس\s+نکردم|واریز\s+نکردم|نمی\s*خرم|نمیخرم|نزدم/;
const FUTURE_MARKERS = /قراره|قرار\s+است|می\s*خوام|میخوام|می\s*خواهم|خواهم\s+(داد|خرید|گرفت|ریخت)|تصمیم\s+دارم|بعدا|بعداً|قصد\s+دارم/;
const FUTURE_VERBS = /می\s*دم|میدم|می\s*دهم|می\s*خرم|میخرم|می\s*گیرم|میگیرم|می\s*ریزم|میریزم|بدم\b|بخرم\b|بریزم\b|بگیرم\b/;
const PAST_VERBS = /دادم|دادیم|گرفتم|گرفتیم|خریدم|فروختم|کردم|کردیم|شد\b|پرداختم|ریختم|واریز\s+شد|پاس\s+شد/;
const QUESTION_RE = /[?؟]|چقدر|چنده\b|چند\s+(تومن|تومان|بود|شد|تا)|چیه\b|چی\s+بود|چطوره\b|چیا\s+بود|به\s+کی\s|از\s+کی\s|کدوم|آیا\s|میانگین|متوسط|بیشترین\s+(هزینه|خرج|بدهی|طلب|درآمد)|کمترین\s+(هزینه|خرج|درآمد)|وضعیت\s+(چک|حساب|مالی)|گزارش\s+(بده|کن)|مقایسه\s+کن|لیست\s+.*(بده|نشون|نمایش)|سهم\s+.*(درصد|چند)|روند\s+/;
const FUTURE_DATE_RE = /فردا|پس\s*فردا|هفته\s*\S*\s*(بعد|آینده|دیگه)|ماه\s*(بعد|آینده)|روز\s*دیگه/;
export function detectMeta(text = '') {
  const t = normalizeFa(text);
  const negation = NEG_VERBS.test(t);
  const question = QUESTION_RE.test(t);
  // آینده: نشانگر صریح، یا تاریخ آیندهٔ نسبی + فعل مضارع بدون فعل گذشته
  const future = !negation && (FUTURE_MARKERS.test(t) || (FUTURE_DATE_RE.test(t) && FUTURE_VERBS.test(t) && !PAST_VERBS.test(t)));
  const conditional = /^اگر|^اگه|\sاگه\s|\sاگر\s/.test(t) && !PAST_VERBS.test(t);
  const foreignCurrency = FOREIGN_CURRENCY_RE.test(t);
  return { negation, question, future: future || conditional, foreignCurrency };
}
// بازپرداخت: «پس دادم» (بدهی خود را برگرداندیم) / «پس گرفتم» (طلب خود را وصول کردیم)
export const REPAY_GAVE_RE = /پس\s*دادم|پس\s*فرستادم|برگردوندم|برگرداندم|بدهیم?\s*(رو|را)?\s*(صاف|دادم|پرداخت کردم)/;
export const REPAY_TOOK_RE = /پس\s*گرفتم|قرضم?\s*(رو|را)?\s*پس(?=\s|$)|طلبم?\s*(رو|را)?\s*(گرفتم|وصول)|پس\s*داد(?=\s|$|ه)|پس\s*آورد|برگردوند(?=\s|$)|برگرداند(?=\s|$)|بدهیش\s*(رو|را)?\s*(داد|پرداخت|پس)/;

/* ------------------------- دسته‌بندی و تشخیص تراکنش ------------------------- */
export function detectTransaction(text = '') {
  const raw = String(text || '').trim();
  const normalized = normalizeFa(raw);
  const amount = parseAmount(normalized);
  const isReceivable = /(طلب\s*دارم|طلبکارم|بستانکارم|قرض\s*دادم|پول\s*دادم\s*به|چک\s*دریافتنی|از .* طلب)/.test(normalized);
  const isPayable = /(بدهکارم|بدهی|قرض\s*گرفتم|باید\s*بدم|باید\s*پرداخت|چک\s*پرداختنی|به .* بدهکار)/.test(normalized);
  const incomeWords = /(واریز|واریزی|حقوق|درآمد|دریافت|گرفتم|فروش|فروختم|سود|پورسانت|اجاره\s*گرفتم|برگشت\s*پول|کش\s*بک|دستمزد|کارمزد\s*گرفتم)/;
  const expenseWords = /(دادم|پرداخت|برداشت|خریدم|خرید|خرج|هزینه|کرایه|قسط|اجاره\s*دادم|قبض|شارژ|کارت\s*به\s*کارت\s*کردم|پوز|خرید اینترنتی)/;
  let type = incomeWords.test(normalized) && !expenseWords.test(normalized) ? 'income' : 'expense';
  if (isReceivable) type = 'income';
  if (isPayable) type = 'expense';

  let category = 'سایر';
  if (isReceivable) category = 'بستانکار / طلب';
  else if (isPayable) category = 'بدهکار / بدهی';
  // برندهای چندمنظوره — قبل از قواعد عمومی (اسنپ فود قبل از اسنپ=تاکسی، کافه بازار قبل از کافه)
  else if (/اسنپ\s*فود|تپسی\s*فود|دلینو|چنگال|فودرو|اسنپفود/.test(normalized)) category = 'رستوران و کافه';
  else if (/اسنپ\s*مارکت|اکالا|دیجی\s*کالا|دیجیکالا|اسنپ\s*شاپ|باسلام|ترب\b/.test(normalized)) category = 'خوراکی و سوپرمارکت';
  else if (/کافه\s*بازار|گوگل\s*پلی|اپ\s*استور|پلی\s*استیشن|ایکس\s*باکس/.test(normalized)) category = 'تفریح و اشتراک';
  else if (/شارژ\s*(ساختمان|آپارتمان|مجتمع)/.test(normalized)) category = 'مسکن و اجاره';
  else if (/شارژ\s*(سیمکارت|سیم\s*کارت|موبایل|ایرانسل|همراه\s*اول|رایتل)/.test(normalized)) category = 'قبوض و خدمات';
  else if (/تاکسی|اسنپ|تپسی|مترو|اتوبوس|بنزین|سوخت|پارکینگ|کرایه|رفت\s*و\s*آمد|حمل|ماکسیم/.test(normalized)) category = 'حمل و نقل';
  else if (/سوپر|مارکت|نان|نون|بربری|سنگک|لواش|نونوایی|نانوایی|میوه|تره\s*بار|قصابی|مرغ|خوراک|برنج|لبنیات|افق|شهروند|هایپر/.test(normalized)) category = 'خوراکی و سوپرمارکت';
  else if (/رستوران|کافه|ناهار|نهار|شام|صبحانه|فست\s*فود|پیتزا|کباب|قهوه|اسنک|ساندویچ/.test(normalized)) category = 'رستوران و کافه';
  else if (/حقوق|واریز|درآمد|فروش|فروختم|سود|پورسانت|دستمزد/.test(normalized)) category = 'حقوق و درآمد';
  else if (/قسط|وام|اقساط|تسهیلات/.test(normalized)) category = 'اقساط و بدهی';
  else if (/اجاره|رهن|خانه|منزل|دفتر/.test(normalized)) category = 'مسکن و اجاره';
  else if (/قبض|برق|آب|گاز|تلفن|اینترنت|شارژ/.test(normalized)) category = 'قبوض و خدمات';
  else if (/دکتر|دارو|درمان|بیمارستان|آزمایش|دندان|ویزیت/.test(normalized)) category = 'درمان و سلامت';
  else if (/لباس|کفش|پوشاک|مانتو|شلوار/.test(normalized)) category = 'پوشاک';
  else if (/مدرسه|دانشگاه|کتاب|آموزش|دوره|کلاس|شهریه/.test(normalized)) category = 'آموزش';
  else if (/سفر|هتل|بلیط|پرواز|قطار/.test(normalized)) category = 'سفر';
  else if (/تفریح|سینما|بازی|اشتراک|نتفلیکس|فیلیمو|اسپاتیفای|نماوا/.test(normalized)) category = 'تفریح و اشتراک';
  else if (/سرمایه|بورس|طلا|سکه|صندوق\s*سرمایه|کریپتو|ارز\s*دیجیتال/.test(normalized)) category = 'سرمایه‌گذاری';

  const bank = detectBank(normalized);
  const party = pickParty(normalized);
  let title = raw.trim() || (type === 'income' ? 'درآمد جدید' : 'هزینه جدید');
  if (isReceivable && party) title = `طلب از ${party}`;
  if (isPayable && party) title = `بدهی به ${party}`;
  if (title.length > 52) title = title.slice(0, 52) + '…';
  return { title, amount: amount || 0, type, category, bank, party, accountingSide: isReceivable ? 'receivable' : isPayable ? 'payable' : '', confidence: amount ? 0.9 : 0.55, rawText: raw };
}

/* ------------------------- پاسخ تحلیلی (NLQ محلی) ------------------------- */
// data = { txs, cheques, accounts:[{title,balance}], persons:[{name,balance}] }
export function buildAnalyticsAnswer(q = '', data = {}) {
  const t = normalizeFa(q);
  const txsAll = data.txs || [];
  const persons = data.persons || [];
  const accounts = data.accounts || [];
  const cheques = data.cheques || [];
  const faN = n => Math.round(n).toLocaleString('fa-IR');
  // بازهٔ زمانی
  const range = parseTimeRangeFa(t);
  let txs = txsAll;
  if (range) {
    if (range.month) txs = txsAll.filter(x => { const m = /^\d{3,4}\/(\d{1,2})\//.exec(faToEnDigits(x.date || '')); return m && +m[1] === range.month; });
    else txs = txsAll.filter(x => { const ts = new Date(x.createdAt).getTime(); return ts >= range.from && ts <= (range.to || Date.now()); });
  }
  const label = range ? `${range.label} ` : '';
  // موضوع: «بابت اسنپ» یا برند/کلیدواژه در سوال
  let topic = '';
  const tm = /بابت\s+([آ-ی ]{2,20}?)(?:\s+(?:چقدر|چنده|خرج|هزینه)|\s*[؟?]|$)/.exec(t);
  if (tm) topic = tm[1].trim();
  const matchTopic = x => !topic || (x.title || '').includes(topic) || (x.category || '').includes(topic) || (x.party || '').includes(topic);
  const exp = txs.filter(x => x.type === 'expense' && matchTopic(x));
  const inc = txs.filter(x => x.type === 'income' && matchTopic(x));
  const sum = a => a.reduce((s, x) => s + Number(x.amount || 0), 0);

  // «به کی بیشترین بدهی دارم؟» / «از کی بیشترین طلب دارم؟»
  if (/به\s+کی\s+.*(بدهی|بدهکار)/.test(t)) {
    const d = persons.filter(p => p.balance < 0).sort((a, b) => a.balance - b.balance)[0];
    return d ? `بیشترین بدهی شما به «${d.name}» است: ${faN(Math.abs(d.balance))} تومان.` : 'در حال حاضر به کسی بدهی ثبت‌شده ندارید.';
  }
  if (/از\s+کی\s+.*(طلب|بستانکار)/.test(t) || /کی\s+بهم\s+بدهکاره/.test(t)) {
    const c = persons.filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance)[0];
    return c ? `بیشترین طلب شما از «${c.name}» است: ${faN(c.balance)} تومان.` : 'طلبی از کسی ثبت نشده است.';
  }
  // «به علی چقدر بدهکارم؟» / «علی چقدر بدهکاره؟»
  const pq = /(?:به|از)\s+([آ-ی]+(?:\s+[آ-ی]+){0,2})\s+چقدر\s+(بدهکارم|بدهی|طلب|بستانکارم|طلبکارم)/.exec(t)
    || /([آ-ی]+(?:\s+[آ-ی]+){0,2})\s+چقدر\s+(بدهکاره|بهم\s+بدهکاره|طلب\s+داره)/.exec(t);
  if (pq) {
    const nm = cleanPersonName(pq[1]);
    const p = persons.find(x => x.name === nm) || persons.find(x => x.name.includes(nm) || nm.includes(x.name));
    if (!p) return `شخصی به نام «${nm}» پیدا نکردم.`;
    if (p.balance > 0) return `«${p.name}» ${faN(p.balance)} تومان به شما بدهکار است (طلب شما).`;
    if (p.balance < 0) return `شما ${faN(Math.abs(p.balance))} تومان به «${p.name}» بدهکارید.`;
    return `حساب شما با «${p.name}» تسویه است (مانده صفر).`;
  }
  // میانگین خرج روزانه
  if (/میانگین|متوسط/.test(t) && /(خرج|هزینه)/.test(t)) {
    if (!exp.length) return `${label}هزینه‌ای ثبت نشده است.`;
    const days = range && range.from ? Math.max(1, Math.round(((range.to || Date.now()) - range.from) / 86400000)) : Math.max(1, Math.round((Date.now() - new Date(exp[exp.length - 1].createdAt).getTime()) / 86400000));
    return `میانگین هزینهٔ روزانهٔ شما ${label}حدود ${faN(sum(exp) / days)} تومان است (${faN(sum(exp))} تومان در ${days.toLocaleString('fa-IR')} روز).`;
  }
  // بیشترین هزینه (با بازه)
  if (/بیشترین\s+(هزینه|خرج)/.test(t)) {
    const m = [...exp].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    return m ? `بیشترین هزینهٔ شما ${label}«${m.title}» به مبلغ ${faN(m.amount)} تومان (دسته: ${m.category}) بود.` : `${label}هزینه‌ای ثبت نشده.`;
  }
  // مقایسه این ماه با ماه قبل
  if (/مقایسه/.test(t) && /ماه/.test(t)) {
    const now = Date.now(); const [, , jd] = todayJalali(); const DAY = 86400000;
    const curFrom = now - (jd - 1) * DAY;
    const cur = txsAll.filter(x => new Date(x.createdAt).getTime() >= curFrom);
    const prev = txsAll.filter(x => { const ts = new Date(x.createdAt).getTime(); return ts >= curFrom - 31 * DAY && ts < curFrom; });
    const ce = sum(cur.filter(x => x.type === 'expense')), pe = sum(prev.filter(x => x.type === 'expense'));
    const ci = sum(cur.filter(x => x.type === 'income')), pi = sum(prev.filter(x => x.type === 'income'));
    const pct = (a, b) => b ? Math.round((a - b) / b * 100) : (a ? 100 : 0);
    return `مقایسهٔ این ماه با ماه قبل:\nهزینه: ${faN(ce)} در برابر ${faN(pe)} تومان (${pct(ce, pe) >= 0 ? '+' : ''}${pct(ce, pe).toLocaleString('fa-IR')}٪)\nدرآمد: ${faN(ci)} در برابر ${faN(pi)} تومان (${pct(ci, pi) >= 0 ? '+' : ''}${pct(ci, pi).toLocaleString('fa-IR')}٪)`;
  }
  if (/چک/.test(t)) {
    const open = cheques.filter(c => c.status !== 'paid' && c.status !== 'bounced');
    const inflow = open.filter(c => c.type === 'receivable').reduce((s, c) => s + Number(c.amount), 0);
    const outflow = open.filter(c => c.type === 'payable').reduce((s, c) => s + Number(c.amount), 0);
    return `وضعیت چک‌ها: ${open.length.toLocaleString('fa-IR')} چک در جریان.\nدریافتنی پاس‌نشده: ${faN(inflow)} تومان\nپرداختنی پاس‌نشده: ${faN(outflow)} تومان`;
  }
  if (/موجودی|حساب\s*ها|صندوق/.test(t) && !topic) {
    const total = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    return `موجودی حساب‌ها و صندوق‌ها: ${faN(total)} تومان\n` + (accounts.map(a => `• ${a.title}: ${faN(a.balance || 0)}`).join('\n') || 'حسابی ثبت نشده.');
  }
  if (/سود|زیان/.test(t)) {
    const i = sum(inc), e = sum(exp); const net = i - e;
    return `${label}درآمد ${faN(i)} تومان، هزینه ${faN(e)} تومان، سود/زیان خالص ${faN(net)} تومان${i ? ` (حاشیه سود ${Math.round(net / i * 100).toLocaleString('fa-IR')}٪)` : ''}.`;
  }
  if (/(طلب|بستانکار)/.test(t) && !topic) {
    const rec = persons.filter(p => p.balance > 0).reduce((s, p) => s + p.balance, 0);
    const pay = Math.abs(persons.filter(p => p.balance < 0).reduce((s, p) => s + p.balance, 0));
    return `جمع طلب شما از اشخاص ${faN(rec)} تومان و جمع بدهی شما ${faN(pay)} تومان است.`;
  }
  if (/بزرگترین|بزرگ‌ترین/.test(t)) {
    const m = [...txs].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    return m ? `بزرگ‌ترین تراکنش ${label}«${m.title}» به مبلغ ${faN(m.amount)} تومان (دسته: ${m.category}).` : 'تراکنشی ثبت نشده.';
  }
  // عمومی: خرج/هزینه/درآمد با بازه و موضوع
  if (/(خرج|هزینه)/.test(t)) {
    return `${label}${topic ? `بابت «${topic}» ` : ''}مجموع هزینهٔ شما ${faN(sum(exp))} تومان است (${exp.length.toLocaleString('fa-IR')} تراکنش).`;
  }
  if (/درآمد|دریافتی/.test(t)) {
    return `${label}${topic ? `بابت «${topic}» ` : ''}مجموع درآمد شما ${faN(sum(inc))} تومان است (${inc.length.toLocaleString('fa-IR')} تراکنش).`;
  }
  const i = sum(inc), e = sum(exp);
  return `خلاصهٔ مالی ${label || 'کل'}: ${txs.length.toLocaleString('fa-IR')} تراکنش، درآمد ${faN(i)} تومان، هزینه ${faN(e)} تومان و مانده ${faN(i - e)} تومان.`;
}

/* ------------------------- پیامک بانکی ------------------------- */
export function parseBankSms(text = '') {
  const raw = String(text || '');
  const t = faToEnDigits(normalizeFa(raw)).replace(/[,٬]/g, '');
  const base = detectTransaction(raw);
  // مبلغ تراکنش: اولین «مبلغ N» یا الگوی برداشت/واریز N
  let m = /(?:مبلغ|به\s*مبلغ)\s*:?\s*(\d+)\s*(ریال|تومان|تومن)?/.exec(t) || /(?:برداشت|واریز|خرید|انتقال)\s*:?\s*(\d+)\s*(ریال|تومان|تومن)?/.exec(t);
  if (m) {
    let amt = parseInt(m[1]);
    if ((m[2] || 'ریال') === 'ریال') amt = Math.round(amt / 10);
    base.amount = amt;
  }
  base.type = /واریز|انتقال\s*به\s*حساب\s*شما|حقوق/.test(t) ? 'income' : 'expense';
  if (base.type === 'income' && base.category === 'سایر') base.category = 'حقوق و درآمد';
  // مانده پس از تراکنش
  const bm = /(?:مانده|موجودی)\s*:?\s*(\d+)/.exec(t);
  if (bm) base.remaining = Math.round(parseInt(bm[1]) / 10);
  // شناسهٔ پیگیری برای جلوگیری از ثبت تکراری
  const rm = /(?:پیگیری|مرجع|شناسه)\s*:?\s*(\d{4,})/.exec(t);
  if (rm) base.refCode = rm[1];
  if (!base.bank) base.bank = detectBank(raw);
  return base;
}

/* ------------------------- بودجه‌بندی، اهداف پس‌انداز، هشدار سفارشی ------------------------- */
const DAY_MS = 86400000;
export const MONTH_NAMES_FA = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
// شروع ماه شمسی جاری (timestamp)
export function monthStartTs() {
  const [, , jd] = todayJalali();
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.getTime() - (jd - 1) * DAY_MS;
}
// جمع هزینه‌های ماه جاری (کل یا یک دسته)
export function monthSpent(db, userId, category = '') {
  const from = monthStartTs();
  return db.transactions
    .filter(t => t.userId === userId && t.type === 'expense' && new Date(t.createdAt).getTime() >= from && (!category || t.category === category))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}
// وضعیت بودجه‌ها: مصرف‌شده/درصد/باقی‌مانده برای ماه جاری
export function budgetStatusList(db, userId) {
  return (db.budgets || []).filter(b => b.userId === userId).map(b => {
    const spent = monthSpent(db, userId, b.category);
    const pct = b.amount ? Math.round((spent / b.amount) * 100) : 0;
    return { ...b, spent, pct, remaining: Math.max(0, Number(b.amount) - spent) };
  });
}
// تطبیق نام دسته در متن آزاد («خوراکی» → «خوراکی و سوپرمارکت»)
export function matchCategory(raw, categories = []) {
  const t = normalizeFa(raw);
  let best = '';
  for (const c of [...categories].sort((a, b) => b.length - a.length)) {
    const cn = normalizeFa(c);
    if (t.includes(cn)) return c;
    if (!best && cn.split(/\s+/).some(w => w.length > 2 && t.includes(w))) best = c;
  }
  return best;
}
function extractGoalTitle(t) {
  const m = /هدف(?:\s+پس\s*انداز)?(?:\s+برای)?\s+(.+)/.exec(t);
  if (!m) return '';
  const out = [];
  for (const w of m[1].split(/\s+/)) {
    if (/[\d۰-۹٠-٩]/.test(w) || numberWords[w] !== undefined || ['هزار','میلیون','میلیارد','تومن','تومان','تا','بذار','بگذار','بساز','کن','جدید','رو','را','اضافه','واریز'].includes(w)) break;
    out.push(w); if (out.length >= 4) break;
  }
  return out.join(' ').trim();
}
// نیت‌های بودجه/هدف/هشدار — قبل از گیت‌های سوال/آینده صدا زده می‌شود.
// helpers = { id, nowIso, cashBalance? }
export function handleAssistantExtras(db, userId, raw, helpers) {
  const { id, nowIso } = helpers;
  const t = normalizeFa(raw);
  const faN = n => Math.round(Number(n) || 0).toLocaleString('fa-IR');
  const amount = parseAmount(t);
  db.budgets ||= []; db.goals ||= []; db.customAlerts ||= [];

  /* ---------- هشدار سفارشی ---------- */
  const alertIntent = /هشدار/.test(t) && /(بده|بساز|تنظیم|کن|حذف|پاک|بردار|نشون|نمایش|لیست|هام|ها|چی|اگه|اگر)/.test(t);
  if (alertIntent) {
    const mine = db.customAlerts.filter(a => a.userId === userId);
    if (/(حذف|پاک|بردار)/.test(t)) {
      const cat = matchCategory(t, db.categories || []);
      const before = mine.length;
      db.customAlerts = db.customAlerts.filter(a => !(a.userId === userId && (!cat || a.category === cat)));
      const n = before - db.customAlerts.filter(a => a.userId === userId).length;
      return { action: 'alert_rule', message: n ? `${faN(n)} هشدار حذف شد.` : 'هشداری برای حذف پیدا نشد.' };
    }
    // ساخت هشدار: موجودی کمتر از X
    if (/(موجودی|مانده)/.test(t) && /(کمتر|زیر|پایین)/.test(t) && amount > 0) {
      db.customAlerts.push({ id: id('al_'), userId, kind: 'balanceBelow', category: '', threshold: amount, enabled: true, createdAt: nowIso() });
      return { action: 'alert_rule', canUndo: false, message: `هشدار تنظیم شد: هر وقت موجودی کل از ${faN(amount)} تومان کمتر شود خبرت می‌کنم. ✅` };
    }
    if (/(هزینه|خرج)/.test(t) && amount > 0) {
      const cat = matchCategory(t, db.categories || []);
      if (cat) {
        db.customAlerts.push({ id: id('al_'), userId, kind: 'categoryOver', category: cat, threshold: amount, enabled: true, createdAt: nowIso() });
        return { action: 'alert_rule', message: `هشدار تنظیم شد: اگر هزینهٔ «${cat}» در ماه از ${faN(amount)} تومان بگذرد خبرت می‌کنم. ✅` };
      }
      db.customAlerts.push({ id: id('al_'), userId, kind: 'expenseOver', category: '', threshold: amount, enabled: true, createdAt: nowIso() });
      return { action: 'alert_rule', message: `هشدار تنظیم شد: اگر کل هزینهٔ ماه از ${faN(amount)} تومان بگذرد خبرت می‌کنم. ✅` };
    }
    // لیست هشدارها
    if (mine.length) {
      const KIND_FA = { categoryOver: c => `هزینهٔ «${c.category}» از ${faN(c.threshold)} بگذرد`, expenseOver: c => `کل هزینهٔ ماه از ${faN(c.threshold)} بگذرد`, balanceBelow: c => `موجودی از ${faN(c.threshold)} کمتر شود` };
      return { action: 'alert_rule', message: 'هشدارهای فعال شما:\n' + mine.map(a => `• ${(KIND_FA[a.kind] || (() => a.kind))(a)}${a.enabled === false ? ' (غیرفعال)' : ''}`).join('\n') };
    }
    return { action: 'alert_rule', message: 'هنوز هشداری تنظیم نکرده‌ای. مثال: «هشدار بده اگه هزینه خوراکی از ۲ میلیون گذشت» یا «هشدار بده اگه موجودی از ۵۰۰ تومن کمتر شد».' };
  }

  /* ---------- بودجه ---------- */
  const budgetIntent = /بودجه/.test(t) && (/(بذار|بگذار|تنظیم|تعیین|بکن|باشه|کن|حذف|پاک|بردار|چقدر|چنده|وضعیت|گزارش|مونده|باقی|نشون|نمایش|هام|ها)/.test(t) || parseAmount(t) > 0);
  if (budgetIntent) {
    const cat = matchCategory(t, db.categories || []);
    if (/(حذف|پاک|بردار)/.test(t)) {
      const before = db.budgets.filter(b => b.userId === userId).length;
      db.budgets = db.budgets.filter(b => !(b.userId === userId && (!cat || b.category === cat)));
      const n = before - db.budgets.filter(b => b.userId === userId).length;
      return { action: 'budget', message: n ? `بودجهٔ ${cat ? `«${cat}»` : 'موردنظر'} حذف شد.` : 'بودجه‌ای برای حذف پیدا نشد.' };
    }
    if (amount > 0 && !/(چقدر|چطور|وضعیت|گزارش|مونده|باقی)/.test(t)) {
      const existing = db.budgets.find(b => b.userId === userId && b.category === cat);
      if (existing) existing.amount = amount;
      else db.budgets.push({ id: id('bg_'), userId, category: cat, amount, period: 'month', createdAt: nowIso() });
      const spent = monthSpent(db, userId, cat);
      return { action: 'budget', message: `بودجهٔ ماهانهٔ ${cat ? `«${cat}»` : 'کل هزینه‌ها'}: ${faN(amount)} تومان تنظیم شد. ✅\nمصرف این ماه تاکنون: ${faN(spent)} تومان (${faN(amount ? Math.round(spent / amount * 100) : 0)}٪).` };
    }
    // گزارش بودجه
    const list = budgetStatusList(db, userId);
    if (!list.length) return { action: 'budget', message: 'هنوز بودجه‌ای تنظیم نکرده‌ای. مثال: «بودجه خوراکی رو ۲ میلیون بذار» یا «بودجه کل ماهم ۱۰ میلیون باشه».' };
    const icon = p => p >= 100 ? '🔴' : p >= 80 ? '🟡' : '🟢';
    return { action: 'budget', message: 'بودجه در برابر واقعی (ماه جاری):\n' + list.map(b => `${icon(b.pct)} ${b.category || 'کل هزینه‌ها'}: ${faN(b.spent)} از ${faN(b.amount)} (${faN(b.pct)}٪) — باقی‌مانده ${faN(b.remaining)}`).join('\n') };
  }

  /* ---------- اهداف پس‌انداز ---------- */
  // نیت واقعی هدف: «هدف پس‌انداز...»، عملیات روی هدف (اضافه/واریز/حذف)، یا پرسش از اهداف.
  // جملاتی مثل «بدون هدف ۸۰ تومن خرج کردم» نباید وارد این شاخه شوند.
  const goalIntent = /هدف\s*پس\s*انداز/.test(t)
    || /(به|برای)\s+هدف\s+/.test(t)
    || /هدف\s+\S+.*(اضافه|واریز|بریز|شارژ|حذف|پاک)/.test(t)
    || /(اهداف|هدف\s*هام|هدفهام|هدف\s*ها)/.test(t)
    || (/هدف/.test(t) && /(بساز|بذار|بگذار|تنظیم|جدید|نشون|نمایش|لیست|چقدر|چنده|وضعیت)/.test(t));
  if (goalIntent) {
    const myGoals = db.goals.filter(g => g.userId === userId);
    // واریز به هدف: «۲ میلیون به هدف ماشین اضافه کن»
    const cm = /هدف\s+([آ-ی ]+?)\s*(?:رو|را)?\s*(?:اضافه|واریز|بریز|ریختم|گذاشتم|شارژ)/.exec(t);
    if (cm && amount > 0) {
      const name = cm[1].replace(/\s+(رو|را)$/, '').trim();
      const g = myGoals.find(x => normalizeFa(x.title).includes(normalizeFa(name)) || normalizeFa(name).includes(normalizeFa(x.title)));
      if (!g) return { action: 'goal', message: `هدفی با نام «${name}» پیدا نکردم. اهداف فعلی: ${myGoals.map(x => x.title).join('، ') || 'هیچ'}.` };
      g.saved = Number(g.saved || 0) + amount;
      const pct = g.target ? Math.round(g.saved / g.target * 100) : 0;
      const done = g.saved >= Number(g.target || 0);
      if (done) g.done = true;
      return { action: 'goal', canUndo: false, message: `${faN(amount)} تومان به هدف «${g.title}» اضافه شد. 💰\nپیشرفت: ${faN(g.saved)} از ${faN(g.target)} (${faN(pct)}٪)${done ? '\n🎉 تبریک! به هدفت رسیدی!' : ''}` };
    }
    if (/(حذف|پاک)/.test(t)) {
      const nm = extractGoalTitle(t.replace(/(حذف|پاک)( کن)?/g, '').trim());
      const g = myGoals.find(x => nm && (normalizeFa(x.title).includes(normalizeFa(nm)) || normalizeFa(nm).includes(normalizeFa(x.title))));
      if (g) { db.goals = db.goals.filter(x => x.id !== g.id); return { action: 'goal', message: `هدف «${g.title}» حذف شد.` }; }
      return { action: 'goal', message: 'هدفی با این نام پیدا نکردم.' };
    }
    // ساخت هدف: «هدف پس‌انداز خرید ماشین ۵۰۰ میلیون تا اسفند»
    const title = extractGoalTitle(t);
    if (title && amount > 0) {
      let deadline = parsePersianDueDate(t);
      if (!deadline) { const mm = /تا\s+(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/.exec(t); if (mm) { const [jy] = todayJalali(); const mi = MONTHS_FA[mm[1]]; deadline = `${jy}/${String(mi).padStart(2, '0')}/${String(jalaliMonthLength(jy, mi)).padStart(2, '0')}`; } }
      const existing = myGoals.find(x => normalizeFa(x.title) === normalizeFa(title));
      if (existing) { existing.target = amount; if (deadline) existing.deadline = deadline; return { action: 'goal', message: `هدف «${existing.title}» به‌روزرسانی شد: ${faN(amount)} تومان${deadline ? ` تا ${deadline}` : ''}.` }; }
      db.goals.push({ id: id('gl_'), userId, title, target: amount, saved: 0, deadline: deadline || '', done: false, createdAt: nowIso() });
      return { action: 'goal', message: `هدف پس‌انداز «${title}» ساخته شد: ${faN(amount)} تومان${deadline ? ` تا ${deadline}` : ''}. 🎯\nبرای واریز بگو: «۱ میلیون به هدف ${title} اضافه کن».` };
    }
    // گزارش اهداف
    if (!myGoals.length) return { action: 'goal', message: 'هنوز هدفی نساخته‌ای. مثال: «هدف پس‌انداز خرید ماشین ۵۰۰ میلیون تا اسفند».' };
    return { action: 'goal', message: 'اهداف پس‌انداز شما:\n' + myGoals.map(g => { const pct = g.target ? Math.round(Number(g.saved || 0) / Number(g.target) * 100) : 0; const dl = g.deadline ? ` — تا ${g.deadline}` : ''; return `${g.done || pct >= 100 ? '✅' : '🎯'} ${g.title}: ${faN(g.saved)} از ${faN(g.target)} (${faN(pct)}٪)${dl}`; }).join('\n') };
  }
  return null;
}
// ارزیابی هشدارهای بودجه و سفارشی برای /analytics/alerts
export function evaluateBudgetAndCustomAlerts(db, userId, cashBalance) {
  const out = [];
  const faN = n => Math.round(Number(n) || 0).toLocaleString('fa-IR');
  for (const b of budgetStatusList(db, userId)) {
    if (b.pct >= 100) out.push({ level: 'danger', icon: 'budget', title: 'بودجه تمام شد', text: `بودجهٔ ${b.category ? `«${b.category}»` : 'کل'} (${faN(b.amount)}) تمام شده؛ مصرف: ${faN(b.spent)} تومان (${faN(b.pct)}٪).` });
    else if (b.pct >= 80) out.push({ level: 'warning', icon: 'budget', title: 'نزدیک سقف بودجه', text: `${faN(b.pct)}٪ بودجهٔ ${b.category ? `«${b.category}»` : 'کل'} مصرف شده؛ باقی‌مانده ${faN(b.remaining)} تومان.` });
  }
  for (const a of (db.customAlerts || []).filter(x => x.userId === userId && x.enabled !== false)) {
    if (a.kind === 'categoryOver') { const sp = monthSpent(db, userId, a.category); if (sp > a.threshold) out.push({ level: 'danger', icon: 'custom', title: 'هشدار سفارشی شما', text: `هزینهٔ «${a.category}» این ماه ${faN(sp)} تومان شد و از سقف ${faN(a.threshold)} گذشت.` }); }
    else if (a.kind === 'expenseOver') { const sp = monthSpent(db, userId, ''); if (sp > a.threshold) out.push({ level: 'danger', icon: 'custom', title: 'هشدار سفارشی شما', text: `کل هزینهٔ این ماه ${faN(sp)} تومان شد و از سقف ${faN(a.threshold)} گذشت.` }); }
    else if (a.kind === 'balanceBelow' && cashBalance !== undefined) { if (cashBalance < a.threshold) out.push({ level: 'warning', icon: 'custom', title: 'هشدار سفارشی شما', text: `موجودی کل (${faN(cashBalance)}) از حد ${faN(a.threshold)} تومان کمتر شده.` }); }
  }
  // اهداف نزدیک به سررسید
  for (const g of (db.goals || []).filter(x => x.userId === userId && !x.done)) {
    const dl = g.deadline ? daysUntil(g.deadline) : null;
    const pct = g.target ? Math.round(Number(g.saved || 0) / Number(g.target) * 100) : 0;
    if (dl !== null && dl >= 0 && dl <= 14 && pct < 100) out.push({ level: 'info', icon: 'goal', title: 'هدف نزدیک سررسید', text: `«${g.title}» ${faN(dl)} روز تا سررسید دارد و ${faN(pct)}٪ تکمیل شده.` });
  }
  return out;
}
