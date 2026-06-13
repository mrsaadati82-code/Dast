import { useEffect, useState } from 'react';
// کاراکتر راهنمای اپ: «دستِ راست» 🤖
// شش ژست از کاراکتر رسمی برند (وب‌پی سبک، داخل باندل تک‌فایل):
import poseWave from './assets/coach/wave.webp';
import posePoint from './assets/coach/point.webp';
import poseJump from './assets/coach/jump.webp';
import poseExplain from './assets/coach/explain.webp';
import poseThink from './assets/coach/think.webp';
import poseCrossed from './assets/coach/crossed.webp';
import poseCoin from './assets/coach/coin.webp';
import poseMagnifier from './assets/coach/magnifier.webp';
import poseFlying from './assets/coach/flying.webp';
import poseSitting from './assets/coach/sitting.webp';
import poseRunning from './assets/coach/running.webp';
import posePhone from './assets/coach/phone.webp';
import poseChart from './assets/coach/chart.webp';
import poseLaptop from './assets/coach/laptop.webp';

// ۱۴ ژست رسمی کاراکتر «دستِ راست» — همگی توسط کاربر بدون پس‌زمینه تهیه شده‌اند
const POSES: Record<string, string> = {
  wave: poseWave,           // 👋 سلام و خوش‌آمد
  point: posePoint,         // ☝️ اشاره به نکته/دکمه
  jump: poseJump,           // 🙌 جشن و موفقیت
  explain: poseExplain,     // 🤲 توضیح‌دادن
  think: poseThink,         // 🤔 نکتهٔ فکری (علامت سوال)
  crossed: poseCrossed,     // 💪 اطمینان و اقتدار
  coin: poseCoin,           // 🪙 پول/بودجه/پس‌انداز
  magnifier: poseMagnifier, // 🔍 جستجو/تحلیل/گزارش
  flying: poseFlying,       // 🚀 شروع پرقدرت/پیشرفت
  sitting: poseSitting,     // 🪑 نشسته و صمیمی (خوش‌آمد)
  running: poseRunning,     // 🏃 سرعت/میان‌بر/عملیات سریع
  phone: posePhone,         // 📱 موبایل/اپ/تایید
  chart: poseChart,         // 📈 نمودار/داشبورد/تحلیل
  laptop: poseLaptop,       // 💻 کار با سیستم/تنظیمات/آموزش
  // aliasهای ژست‌های قدیمی → نزدیک‌ترین ژست رسمی
  thumbs: posePhone,        // تایید → موبایل+لایک
  shield: poseCrossed,      // امنیت → اقتدار
  clipboard: poseChart,     // سند/گزارش → نمودار
};

export interface CoachStep { pose: keyof typeof POSES; title: string; text: string; target?: string; }
export type TourId = string;

/* ================= تورهای آموزشی هر بخش ================= */
export const TOURS: Record<TourId, { label: string; steps: CoachStep[] }> = {
  welcome: {
    label: 'خوش‌آمدگویی',
    steps: [
      { pose: 'sitting', title: 'سلام! من دستِ راستم 👋', text: 'به اپلیکیشن دست راست خوش اومدی! من راهنمای شخصی تو هستم و قدم‌به‌قدم همه‌چیز رو یادت می‌دم. هر جا گیر کردی، دکمهٔ «؟» بالای صفحه رو بزن تا دوباره بیام.' },
      { pose: 'phone', title: 'اینجا چه خبره؟', text: 'دست راست یک دستیار مالی کامله: ثبت هزینه و درآمد با یک جمله، مدیریت چک‌ها، طلب و بدهی اشخاص، بودجه‌بندی، فاکتور، گزارش‌های حسابداری حرفه‌ای و خیلی چیزهای دیگه — همه فارسی و آفلاین!' },
      { pose: 'point', target: '[data-coach="menu"]', title: 'منوی اصلی', text: 'دکمهٔ ☰ بالا سمت راست، منوی کامل بخش‌هاست. پایین صفحه هم پنج میان‌بر اصلی داری: خانه، دستیار، گزارش، چک و اشخاص.' },
      { pose: 'think', target: '[data-coach="nav"]', title: 'مهم‌ترین قابلیت!', text: 'برو به تب «دستیار» و فقط بنویس یا بگو: «۵۰ تومن دادم بابت تاکسی». من خودم مبلغ، دسته‌بندی و همه‌چیز رو می‌فهمم و ثبت می‌کنم. می‌تونی ویس بفرستی یا عکس رسید هم بدی!' },
      { pose: 'flying', target: '[data-coach="help"]', title: 'بزن بریم! 🚀', text: 'هر بخش جدیدی که برای اولین بار واردش بشی، خودم میام و توضیحش می‌دم. از منو هم می‌تونی هر وقت خواستی «آموزش اپلیکیشن» رو دوباره شروع کنی. موفق باشی!' },
    ]
  },
  home: {
    label: 'داشبورد',
    steps: [
      { pose: 'chart', target: '[data-coach="dash-card"]', title: 'داشبورد مالی', text: 'اینجا قلب اپه! یک نگاه بنداز و کل وضعیت مالیت رو ببین: مانده، درآمد، هزینه، نمودارها و هشدارها.' },
      { pose: 'point', target: '[data-coach="dash-range"]', title: 'بازهٔ زمانی و فیلترها', text: 'بالای صفحه دکمه‌های هفته/ماهانه/فصلی/سالانه/کل رو داری. پایین‌ترش هم می‌تونی روی دسته، شخص، پروژه یا بانک فیلتر کنی.' },
      { pose: 'coin', title: 'ویجت‌های هوشمند', text: 'کارت «بودجه» مصرف ماهت رو با نوار رنگی نشون می‌ده (سبز=خوب، قرمز=رد شده). «اهداف پس‌انداز» پیشرفتت رو دنبال می‌کنه و «پیش‌بینی جریان نقد» وضعیت ۶ ماه آینده رو حدس می‌زنه.' },
      { pose: 'laptop', target: '[data-coach="dash-custom"]', title: 'شخصی‌سازی', text: 'آیکن ⚙️ کنار بازه‌ها رو بزن: می‌تونی انتخاب کنی کدوم کارت‌ها و نمودارها نشون داده بشن و حتی با کشیدن (drag) ترتیبشون رو عوض کنی.' },
      { pose: 'thumbs', title: 'نکتهٔ طلایی', text: 'روی هر نمودار انگشتت رو نگه‌دار (یا موس ببر) تا جزئیات دقیق همون نقطه رو ببینی!' },
    ]
  },
  chat: {
    label: 'دستیار هوشمند',
    steps: [
      { pose: 'wave', title: 'دستیار هوشمند 🤖', text: 'اینجا فقط کافیه حرف بزنی! تایپ کن، ویس بفرست یا عکس رسید بده — خودم می‌فهمم و ثبت می‌کنم.' },
      { pose: 'explain', target: '[data-coach="chat-quick"]', title: 'چی می‌تونم بفهمم؟', text: 'مثال‌ها: «۵۰ تومن دادم بابت تاکسی» (هزینه)، «به علی ۲۰۰ تومن قرض دادم» (طلب)، «چک ۵ میلیونی از احمد گرفتم برای ۱۵ مهر»، «حساب علی رو تسویه کن»، «بودجه خوراکی رو ۲ میلیون بذار» و ده‌ها دستور دیگه!' },
      { pose: 'phone', target: '[data-coach="chat-mic"]', title: 'دکمه‌های پایین', text: '🎤 میکروفون قرمز: ضبط صدا (بعد از مکث کوتاه خودش قطع می‌شه). 📷 دوربین: عکس رسید بفرست تا با OCR بخونمش. جمله‌های آماده هم بالای کادر تایپ هست.' },
      { pose: 'magnifier', target: '[data-coach="chat-input"]', title: 'سوال هم بپرس!', text: 'من تحلیلگر مالی‌ام: «بیشترین هزینه‌ام این ماه چی بود؟»، «به کی بیشترین بدهی رو دارم؟»، «مقایسه کن این ماه با ماه قبل» — با جدول و نمودار جواب می‌دم.' },
      { pose: 'thumbs', title: 'اشتباه کردم؟ یادم بده!', text: 'اگه دسته‌بندی رو اشتباه زدم، روی «اصلاح دسته‌بندی» بزن — یاد می‌گیرم و دفعهٔ بعد درست می‌زنم. دکمهٔ «بازگردان» هم آخرین عملیات رو لغو می‌کنه.' },
    ]
  },
  analytics: {
    label: 'گزارش‌ها',
    steps: [
      { pose: 'chart', title: 'گزارش‌های تحلیلی', text: 'اینجا همهٔ تحلیل‌های مالیت جمعه: نمودارها، بینش‌های هوشمند و گزارش‌ساز.' },
      { pose: 'explain', target: '[data-coach="ana-ask"]', title: 'از مشاور مالی بپرس', text: 'تو کادر «هر سوالی بپرس» هر سوال مالی‌ای بنویس — مثل «سهم رستوران از هزینه‌هام چند درصده؟» — و جواب دقیق با نمودار بگیر.' },
      { pose: 'magnifier', target: '[data-coach="ana-insights"]', title: 'بینش‌های هوشمند 💡', text: 'خودم حواسم به همه‌چیز هست: اگه هزینهٔ یه دسته ناگهانی زیاد بشه، نرخ پس‌اندازت کم بشه یا یه هزینهٔ تکراری (مثل اشتراک) ببینم، همینجا بهت هشدار می‌دم.' },
      { pose: 'clipboard', target: '[data-coach="ana-report"]', title: 'گزارش‌ساز سفارشی 🛠', text: 'گزارش دلخواهت رو بساز: تفکیک بر اساس دسته/شخص/ماه/بانک، فیلتر بازه و نوع، بعد ذخیره‌اش کن (Saved View) یا خروجی Excel بگیر.' },
      { pose: 'crossed', target: '[data-coach="ana-quality"]', title: 'کیفیت موتور 🎯', text: 'پایین صفحه می‌بینی من چند درصد تشخیص‌هام درست بوده! اگه الگوی اصلاح تکراری داشته باشی، خودم پیشنهاد قانون می‌دم که با یک کلیک اضافه می‌شه.' },
    ]
  },
  cheques: {
    label: 'چک‌ها',
    steps: [
      { pose: 'point', target: '[data-coach="chq-sum"]', title: 'مدیریت چک‌ها', text: 'چک‌های دریافتی و صادره رو اینجا مدیریت کن — با تقویم شمسی و محاسبهٔ خودکار روزهای مانده تا سررسید.' },
      { pose: 'clipboard', target: '[data-coach="chq-filter"]', title: 'وضعیت‌ها', text: 'هر چک یکی از این وضعیت‌ها رو داره: در جریان، نزدیک سررسید (۷ روز)، معوق، پاس‌شده یا برگشتی. بالای صفحه هشدار چک‌های معوق و نزدیک سررسید رو می‌بینی.' },
      { pose: 'coin', target: '[data-coach="chq-list"]', title: 'پاس کردن چک', text: 'وقتی چک پاس شد، دکمهٔ «پاس شد» رو بزن و حساب مقصد رو انتخاب کن — خودم مبلغ رو به حساب اعمال می‌کنم و سند حسابداری هم می‌زنم.' },
      { pose: 'running', title: 'میان‌بر دستیار', text: 'به دستیار بگو: «چک ۵ میلیونی از احمد گرفتم برای ۱۵ مهر» یا «چک احمد رو پاس کن» — لازم نیست فرم پر کنی!' },
    ]
  },
  persons: {
    label: 'اشخاص',
    steps: [
      { pose: 'explain', target: '[data-coach="per-tabs"]', title: 'اشخاص و بدهکار/بستانکار', text: 'همهٔ طرف‌حساب‌هات اینجان: کی بهت بدهکاره (سبز) و تو به کی بدهکاری (قرمز).' },
      { pose: 'magnifier', target: '[data-coach="per-list"]', title: 'پروفایل کامل', text: 'روی هر شخص بزن تا دفتر حسابش رو ببینی. می‌تونی سقف اعتبار بذاری، گروه‌بندی کنی (VIP/عمده/...)، تخفیف اختصاصی تعریف کنی و امتیاز اعتباریش رو ببینی.' },
      { pose: 'clipboard', title: 'صورتحساب رسمی 📄', text: 'تو پروفایل شخص، دکمهٔ «صورتحساب رسمی» یه سند چاپی با سربرگ کسب‌وکارت می‌سازه که می‌تونی PDF کنی یا براش بفرستی.' },
      { pose: 'think', target: '[data-coach="per-list"]', title: 'منوی لمسی', text: 'روی هر شخص انگشتت رو نگه‌دار: دفتر حساب، ویرایش، ادغام (برای اشخاص تکراری)، انتخاب گروهی و حذف.' },
      { pose: 'thumbs', title: 'یادآوری بدهی', text: 'دکمهٔ «یادآوری بدهی» یه پیام آماده می‌سازه و مستقیم می‌بره واتساپ! متن مودبانه‌اش رو هم خودم می‌نویسم. 😎' },
    ]
  },
  claims: {
    label: 'مطالبات',
    steps: [
      { pose: 'crossed', target: '[data-coach="claims-tabs"]', title: 'مطالبات و وصول', text: 'مرکز فرماندهی وصول طلب‌ها! چهار تب داره: سن مطالبات، یادآوری‌ها، جریمه دیرکرد و وصولی‌ها.' },
      { pose: 'magnifier', target: '[data-coach="claims-aging"]', title: 'سن مطالبات (Aging)', text: 'طلب‌ها بر اساس قدمت رنگ‌بندی شدن: ۰-۳۰ روز سبز تا +۹۰ روز قرمز. روی هر بازه بزن تا فیلتر بشه.' },
      { pose: 'point', target: '[data-coach="claims-tabs"]', title: 'یادآوری خودکار', text: 'تو تب «یادآوری‌ها» زمان‌بندی تعیین کن (مثلا هر ۷ روز) — خودم صف یادآوری می‌سازم و با یه کلیک پیام واتساپ/SMS می‌فرستی.' },
      { pose: 'crossed', target: '[data-coach="claims-tabs"]', title: 'جریمهٔ دیرکرد', text: 'سیاست جریمه تنظیم کن (مثلا ۲٪ ماهانه بعد از ۳۰ روز مهلت). جریمهٔ هر مشتری محاسبه می‌شه و با تاییدت به طلبت اضافه می‌شه — با سند حسابداری خودکار.' },
      { pose: 'coin', target: '[data-coach="claims-tabs"]', title: 'پیش‌بینی وصول', text: 'تب «وصولی‌ها» بر اساس رفتار تاریخی هر مشتری پیش‌بینی می‌کنه کِی و چقدر احتمال داره طلبت وصول بشه!' },
    ]
  },
  budgeting: {
    label: 'بودجه و اهداف',
    steps: [
      { pose: 'thumbs', title: 'بودجه و اهداف پس‌انداز', text: 'اینجا خرجت رو کنترل می‌کنی و برای رویاهات پس‌انداز می‌سازی!' },
      { pose: 'coin', target: '[data-coach="bud-tabs"]', title: 'بودجه ماهانه', text: 'برای هر دسته (یا کل هزینه‌ها) سقف ماهانه بذار. نوار رنگی نشون می‌ده چقدر مصرف کردی: سبز=امن، زرد=۸۰٪، قرمز=رد شدی! موقع رد شدن هم بهت هشدار می‌دم.' },
      { pose: 'jump', target: '[data-coach="bud-tabs"]', title: 'اهداف پس‌انداز 🎯', text: 'هدف بساز (مثلا «خرید ماشین، ۵۰۰ میلیون تا اسفند») و هر بار که پولی کنار گذاشتی واریزش کن. وقتی برسی بهش جشن می‌گیریم! 🎉' },
      { pose: 'think', target: '[data-coach="bud-tabs"]', title: 'هشدارهای سفارشی', text: 'تب «هشدارها»: شرط خودت رو تعریف کن — مثلا «اگه هزینه خوراکی از ۲ میلیون گذشت خبرم کن» یا «اگه موجودی از ۵ میلیون کمتر شد».' },
      { pose: 'running', title: 'با دستیار هم می‌شه!', text: 'فقط بگو: «بودجه خوراکی رو ۲ میلیون بذار»، «هدف پس‌انداز سفر ۳۰ میلیون»، «۱ میلیون به هدف سفر اضافه کن». به همین سادگی!' },
    ]
  },
  treasury: {
    label: 'خزانه‌داری',
    steps: [
      { pose: 'coin', title: 'خزانه‌داری', text: 'واریز، برداشت و انتقال وجه بین حساب‌ها و صندوق‌هات از اینجا انجام می‌شه.' },
      { pose: 'crossed', title: 'سند خودکار', text: 'هر عملیاتی اینجا ثبت کنی، خودم سند حسابداری دوطرفه‌اش رو می‌زنم — دفترت همیشه تراز می‌مونه.' },
      { pose: 'running', title: 'میان‌بر دستیار', text: 'به دستیار بگو: «انتقال ۲ میلیون از صندوق به بانک ملت» — تمام!' },
    ]
  },
  accounts: {
    label: 'حساب‌ها',
    steps: [
      { pose: 'phone', title: 'صندوق‌ها و حساب‌ها', text: 'حساب‌های بانکی و صندوق‌هات رو اینجا تعریف کن: شماره حساب، کارت، شبا و موجودی اولیه.' },
      { pose: 'coin', title: 'ماندهٔ زنده', text: 'ماندهٔ هر حساب از روی دفتر اسناد محاسبه می‌شه — یعنی همیشه با گزارش‌های حسابداری یکیه و خطا نداره.' },
      { pose: 'think', title: 'نکته', text: 'حساب «صندوق» پیش‌فرض همیشه هست. هر تراکنش نقدی که بانکش رو نگی، می‌ره توی صندوق.' },
    ]
  },
  invoices: {
    label: 'فاکتور',
    steps: [
      { pose: 'clipboard', title: 'فاکتور و پیش‌فاکتور', text: 'فاکتور رسمی با آیتم‌ها، تخفیف، مالیات و شمارهٔ خودکار صادر کن.' },
      { pose: 'coin', title: 'تخفیف اختصاصی مشتری', text: 'اگه برای مشتری تخفیف اختصاصی تعریف کرده باشی (تو پروفایلش)، خودکار روی فاکتورش اعمال می‌شه!' },
      { pose: 'clipboard', title: 'چاپ و برندینگ', text: 'دکمهٔ «چاپ/PDF» قالب رسمی فارسی می‌سازه. از «برندینگ» هم لوگو، رنگ و پاورقی کسب‌وکارت رو تنظیم کن.' },
      { pose: 'coin', title: 'دریافت پول', text: 'وقتی مشتری پرداخت کرد، «ثبت دریافت» رو بزن — درآمد ثبت می‌شه، به حسابت اضافه می‌شه و سند هم می‌خوره.' },
    ]
  },
  accounting: {
    label: 'حسابداری',
    steps: [
      { pose: 'laptop', title: 'دفتر کل و سرفصل‌ها', text: 'بخش حسابداری حرفه‌ای! سرفصل‌های کل/معین/تفصیلی با کدینگ استاندارد.' },
      { pose: 'clipboard', title: 'شروع سریع', text: 'دکمهٔ «واردسازی کدینگ استاندارد» رو بزن تا ۱۴ سرفصل پایه (دارایی، بدهی، درآمد، هزینه...) یکجا ساخته بشن.' },
      { pose: 'crossed', title: 'همه‌چیز خودکاره', text: 'لازم نیست سند دستی بزنی — هر تراکنش، چک و انتقالی که ثبت می‌کنی، خودم سند دوطرفه‌اش رو می‌سازم. تراز آزمایشی همیشه balanced می‌مونه.' },
    ]
  },
  categories: {
    label: 'دسته‌بندی‌ها',
    steps: [
      { pose: 'think', title: 'دسته‌بندی‌ها', text: 'دسته‌های هزینه و درآمدت رو اینجا مدیریت کن: رنگ، آیکون و حتی ساختار والد/فرزند!' },
      { pose: 'explain', title: 'تغییر نام امن', text: 'اگه اسم دسته‌ای رو عوض کنی، همهٔ تراکنش‌ها، اسناد حسابداری و حافظهٔ من خودکار همگام می‌شن — هیچی خراب نمی‌شه.' },
      { pose: 'thumbs', title: 'من یاد می‌گیرم!', text: 'وقتی تو چت دسته‌بندیم رو اصلاح می‌کنی، یاد می‌گیرم. دفعهٔ بعد جمله‌های مشابه رو خودم درست دسته‌بندی می‌کنم.' },
    ]
  },
  training: {
    label: 'آموزش دستیار',
    steps: [
      { pose: 'laptop', title: 'آموزش من! 🎓', text: 'اینجا می‌تونی به من جمله‌های خاص خودت رو یاد بدی.' },
      { pose: 'explain', title: 'مثال', text: 'یاد بده: «دنگ شامو حساب کردم» یعنی «هزینه رستوران». از این به بعد هر وقت اینو بگی، درست ثبت می‌کنم.' },
      { pose: 'magnifier', title: 'چت‌بات تست ⚗️', text: 'تب «چت‌بات تست»: جمله بنویس و ببین چطور می‌فهممش — بدون اینکه چیزی واقعا ثبت بشه. عالیه برای امتحان کردن!' },
      { pose: 'think', title: 'تاریخچهٔ آموخته‌ها', text: 'تب سوم همهٔ چیزهایی که ازت یاد گرفتم رو نشون می‌ده. اگه چیزی اشتباه یاد گرفتم، حذفش کن.' },
    ]
  },
  advancedAI: {
    label: 'قوانین AI',
    steps: [
      { pose: 'laptop', title: 'هوش مصنوعی پیشرفته', text: 'قانون‌های شرطی برای من تعریف کن: «اگه جمله شامل X بود → یعنی Y».' },
      { pose: 'magnifier', title: 'وزن و تست', text: 'هر قانون وزن داره (بالاتر = اولویت بیشتر). قبل از ذخیره هم می‌تونی با یه جملهٔ نمونه تستش کنی که مطمئن بشی درست کار می‌کنه.' },
      { pose: 'shield', title: 'پشتیبان‌گیری', text: 'با Export/Import می‌تونی قوانینت رو فایل JSON کنی و جای دیگه برگردونی.' },
    ]
  },
  history: {
    label: 'تاریخچه',
    steps: [
      { pose: 'magnifier', title: 'تاریخچهٔ تراکنش‌ها', text: 'همهٔ تراکنش‌هات اینجاست — با جستجو، فیلتر و مرتب‌سازی.' },
      { pose: 'point', title: 'عملیات گروهی', text: 'دکمهٔ «انتخاب» بالا (یا نگه‌داشتن انگشت روی یک ردیف) حالت انتخاب گروهی رو فعال می‌کنه — چندتا رو با هم حذف کن.' },
    ]
  },
  security: {
    label: 'امنیت',
    steps: [
      { pose: 'shield', title: 'امنیت حساب', text: 'اینجا رمزت رو عوض می‌کنی و می‌بینی چه محافظت‌هایی فعاله.' },
      { pose: 'crossed', title: 'چی فعاله؟', text: 'قفل خودکار بعد از ۵ تلاش ناموفق ورود، رمزنگاری توکن AI، بکاپ خودکار هر ۶ ساعت و ثبت لاگ همهٔ تغییرات مهم.' },
    ]
  },
  projects: {
    label: 'پروژه‌ها',
    steps: [
      { pose: 'flying', title: 'پروژه‌ها', text: 'برای کارهای پروژه‌ای: قرارداد، مراحل (پیش‌فاکتور تا تسویه)، هزینه‌ها و سود هر پروژه.' },
      { pose: 'coin', title: 'پرداخت مشتری', text: 'هر پرداختی که مشتری انجام داد رو با «ثبت پرداخت» وارد کن — از طلبش کم می‌شه و مونده قرارداد به‌روز می‌شه.' },
    ]
  },
};

// ترتیب تورهای «آموزش کامل» (دکمهٔ منو)
export const FULL_TOUR_ORDER: TourId[] = ['welcome', 'home', 'chat', 'analytics', 'cheques', 'persons', 'claims', 'budgeting'];

/* ================= ذخیرهٔ وضعیت دیده‌شدن ================= */
const SEEN_KEY = 'dast_coach_seen';
export function getSeenTours(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
}
export function markTourSeen(id: string) {
  const s = getSeenTours(); s.add(id);
  localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
}

/* ================= کامپوننت نمایش ================= */
export function CoachOverlay({ tour, queue, onClose, onNavigate }: { tour: TourId | null; queue?: TourId[]; onClose: () => void; onNavigate?: (tourId: TourId) => void }) {
  const [step, setStep] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [hl, setHl] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [transit, setTransit] = useState<{ label: string } | null>(null);
  const activeQueue = queue && queue.length ? queue : tour ? [tour] : [];
  const currentTour = activeQueue[qIdx] ? TOURS[activeQueue[qIdx]] : null;

  useEffect(() => { setStep(0); setQIdx(0); }, [tour, queue]);
  useEffect(() => { setAnimKey(k => k + 1); }, [step, qIdx]);

  // هایلایت عنصر هدف + اسکرول نرم به آن
  const steps = currentTour ? currentTour.steps : [];
  const s = steps[Math.min(step, Math.max(0, steps.length - 1))];
  useEffect(() => {
    if (!s) return;
    setHl(null);
    if (!s.target) return;
    let tries = 0;
    let raf = 0;
    const locate = () => {
      const el = document.querySelector(s.target!) as HTMLElement | null;
      if (!el) { if (++tries < 12) raf = window.setTimeout(locate, 120) as unknown as number; return; }
      // اسکرول نرم به عنصر (وسط نیمهٔ بالایی صفحه تا زیر حباب نماند)
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const measure = () => {
        const r = el.getBoundingClientRect();
        const host = el.closest('main')?.getBoundingClientRect() || { top: 0, left: 0 };
        setHl({ top: r.top - host.top, left: r.left - host.left, width: r.width, height: r.height });
      };
      // بعد از پایان اسکرول اندازه بگیر (دوبار برای اطمینان)
      setTimeout(measure, 350);
      setTimeout(measure, 750);
    };
    locate();
    return () => clearTimeout(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey, s?.target]);

  if (!currentTour || !s) return null;
  const isLastStep = step >= steps.length - 1;
  const isLastTour = qIdx >= activeQueue.length - 1;

  function next() {
    if (!isLastStep) { setStep(step + 1); return; }
    markTourSeen(activeQueue[qIdx]);
    if (!isLastTour) {
      const nextId = activeQueue[qIdx + 1];
      const nextLabel = TOURS[nextId]?.label || '';
      // انیمیشن انتقال: نمایش «در حال رفتن به...» + تعویض واقعی تب + سپس استپ‌های بخش جدید
      setTransit({ label: nextLabel });
      onNavigate?.(nextId);
      setTimeout(() => { setQIdx(qIdx + 1); setStep(0); setTransit(null); }, 1250);
      return;
    }
    onClose();
  }
  function prev() {
    if (step > 0) { setStep(step - 1); return; }
    if (qIdx > 0) { const prevTour = TOURS[activeQueue[qIdx - 1]]; setQIdx(qIdx - 1); setStep(prevTour.steps.length - 1); }
  }
  function finish() { activeQueue.forEach(markTourSeen); onClose(); }

  const hasTarget = !!(s.target && hl);
  // صفحهٔ انتقال بین بخش‌ها (تور کامل): موج لمسی + کاراکتر دونده + نام مقصد
  if (transit) {
    return <div className="absolute inset-0 z-[70] grid place-items-center overflow-hidden bg-black/60">
      <style>{`
        @keyframes ripple { 0% { transform: scale(.35); opacity: .8; } 100% { transform: scale(2.6); opacity: 0; } }
        @keyframes transitIn { 0% { transform: translateY(16px) scale(.92); opacity: 0; } 100% { transform: translateY(0) scale(1); opacity: 1; } }
        @keyframes runShift { 0%,100% { transform: translateX(0); } 50% { transform: translateX(10px); } }
        @keyframes dotBlink { 0%,80%,100% { opacity: .25; } 40% { opacity: 1; } }
      `}</style>
      <div className="relative grid place-items-center" style={{ animation: 'transitIn .35s cubic-bezier(.16,1,.3,1)' }}>
        {/* موج‌های لمسی هم‌مرکز */}
        {[0, 1, 2].map(i => <span key={i} className="pointer-events-none absolute h-44 w-44 rounded-full border-2 border-[#7a85c1]/60" style={{ animation: `ripple 1.4s ease-out ${i * 0.35}s infinite` }} />)}
        <span className="pointer-events-none absolute h-44 w-44 rounded-full bg-[#3b38a0]/25 blur-xl" />
        <div className="relative z-10 flex flex-col items-center">
          <img src={POSES.running} alt="دستِ راست" className="h-40 w-auto object-contain drop-shadow-[0_14px_30px_rgba(59,56,160,0.6)]" style={{ animation: 'runShift 0.6s ease-in-out infinite' }} />
          <div className="mt-4 rounded-2xl bg-white dark:bg-zinc-950 border border-[#7a85c1]/40 px-5 py-3 text-center shadow-2xl shadow-[#3b38a0]/40">
            <p className="text-[10px] text-zinc-500">در حال رفتن به بخش</p>
            <p className="mt-0.5 text-sm font-black text-[#3b38a0] dark:text-[#b2b0e8]">{transit.label}
              <span className="inline-block w-6 text-right">{[0,1,2].map(i => <i key={i} className="not-italic" style={{ animation: `dotBlink 1.2s ${i * 0.2}s infinite` }}>.</i>)}</span>
            </p>
          </div>
        </div>
      </div>
    </div>;
  }
  return <div className="absolute inset-0 z-[70] overflow-hidden" onClick={finish}>
    <style>{`
      @keyframes coachIn { 0% { transform: translateY(60px) scale(.85); opacity: 0; } 60% { transform: translateY(-8px) scale(1.02); opacity: 1; } 100% { transform: translateY(0) scale(1); } }
      @keyframes bubbleIn { 0% { transform: translateY(14px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
      @keyframes bubbleFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes glowPulse { 0%,100% { opacity: .5; } 50% { opacity: .75; } }
      @keyframes hlRing { 0%,100% { outline: 4px solid rgba(122,133,193,.55); outline-offset: 2px; } 50% { outline: 7px solid rgba(122,133,193,.8); outline-offset: 4px; } }
      @keyframes hlArrow { 0%,100% { transform: translateY(0) rotate(180deg); } 50% { transform: translateY(5px) rotate(180deg); } }
    `}</style>
    {/* پس‌زمینه: فقط وقتی هدف «نداریم» کل صفحه تیره می‌شود */}
    {!hasTarget && <div className="absolute inset-0 bg-black/60 transition-all duration-300" />}
    {/* اسپات‌لایت با حفرهٔ شفاف: box-shadow عظیمِ قاب، اطراف را تیره می‌کند
        ولی خود عنصر هدف کاملاً روشن و بدون سایه/تیرگی می‌ماند */}
    {hasTarget && hl && <>
      <div className="pointer-events-none absolute z-[71] rounded-2xl border-2 border-[#b2b0e8] transition-all duration-500" style={{ top: hl.top - 6, left: hl.left - 6, width: hl.width + 12, height: hl.height + 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)', animation: 'hlRing 1.8s ease-in-out infinite' }} />
      {/* فلش اشاره به هدف */}
      <div className="pointer-events-none absolute z-[71] text-2xl transition-all duration-500" style={{ top: hl.top + hl.height + 10, left: hl.left + hl.width / 2 - 12, animation: 'hlArrow 1.2s ease-in-out infinite' }}>🔻</div>
    </>}
    <div className="absolute inset-x-0 bottom-0 z-[72]" onClick={e => e.stopPropagation()}>
      {/* حباب گفتگو — شناوری خیلی ملایم */}
      <div key={`b${animKey}`} className="relative z-10 mx-4 mb-2 rounded-[26px] bg-white dark:bg-zinc-950 border border-[#7a85c1]/40 p-4 shadow-2xl shadow-[#3b38a0]/40" style={{ animation: 'bubbleIn .35s cubic-bezier(.16,1,.3,1), bubbleFloat 4.5s ease-in-out .4s infinite' }}>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#3b38a0]/10 px-2.5 py-1 text-[9px] font-bold text-[#3b38a0] dark:text-[#b2b0e8]">دستِ راست • {currentTour.label}</span>
          <span className="text-[9px] text-zinc-400">{(step + 1).toLocaleString('fa-IR')} از {steps.length.toLocaleString('fa-IR')}{activeQueue.length > 1 ? ` • بخش ${(qIdx + 1).toLocaleString('fa-IR')}/${activeQueue.length.toLocaleString('fa-IR')}` : ''}</span>
        </div>
        <h3 className="mt-2 text-sm font-black text-zinc-900 dark:text-white">{s.title}</h3>
        <p className="mt-1.5 text-[11px] leading-6 text-zinc-600 dark:text-zinc-300">{s.text}</p>
        <div className="mt-3 flex gap-1">{steps.map((_, i) => <i key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? 'bg-[#3b38a0]' : 'bg-zinc-200 dark:bg-zinc-800'}`} />)}</div>
        <div className="mt-3 flex items-center gap-2">
          <button onClick={finish} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 px-3 py-2.5 text-[10px] font-bold text-zinc-500">تمام</button>
          <div className="flex-1" />
          {(step > 0 || qIdx > 0) && <button onClick={prev} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 px-4 py-2.5 text-[10px] font-bold">قبلی</button>}
          <button onClick={next} className="rounded-2xl bg-gradient-to-r from-[#3b38a0] to-[#7a85c1] px-5 py-2.5 text-[10px] font-bold text-white shadow-lg shadow-[#3b38a0]/30">
            {isLastStep ? (isLastTour ? 'فهمیدم! ✓' : 'بخش بعدی ←') : 'بعدی'}
          </button>
        </div>
        <div className="absolute -bottom-2 right-14 h-4 w-4 rotate-45 border-b border-l border-[#7a85c1]/40 bg-white dark:bg-zinc-950" />
      </div>
      {/* کاراکتر — کاملاً ثابت (فقط ورود فنری)؛ وقتی هدف هایلایت است کوچک‌تر تا صفحه دیده شود */}
      <div key={`c${animKey}`} className="relative flex justify-end pl-4 pr-2 pb-1" style={{ animation: 'coachIn .55s cubic-bezier(.16,1,.3,1)' }}>
        <div className="pointer-events-none absolute bottom-0 right-[18%] h-10 w-56 rounded-[50%] bg-[#7a85c1] blur-2xl" style={{ animation: 'glowPulse 4s ease-in-out infinite' }} />
        <img src={POSES[s.pose]} alt="دستِ راست" className={`relative w-auto object-contain drop-shadow-[0_18px_40px_rgba(59,56,160,0.55)] transition-all duration-300 ${hasTarget ? 'h-[26vh] max-h-[250px] min-h-[170px]' : 'h-[42vh] max-h-[400px] min-h-[260px]'}`} />
      </div>
    </div>
  </div>;
}
