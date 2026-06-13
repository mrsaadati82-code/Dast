// OCR محلی رسید/فاکتور با Tesseract.js (از CDN در زمان اجرا بارگذاری می‌شود).
// در مرورگر واقعی کار می‌کند؛ در پیش‌نمایش بدون اینترنت به‌صورت نرم رد می‌شود.

let tessPromise: Promise<any> | null = null;
function loadTesseract(): Promise<any> {
  if ((window as any).Tesseract) return Promise.resolve((window as any).Tesseract);
  if (tessPromise) return tessPromise;
  tessPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.async = true;
    s.onload = () => resolve((window as any).Tesseract);
    s.onerror = () => reject(new Error('عدم دسترسی به موتور OCR (اینترنت لازم است).'));
    document.head.appendChild(s);
  });
  return tessPromise;
}

const faToEn = (s: string) => {
  const fa = '۰۱۲۳۴۵۶۷۸۹', ar = '٠١٢٣٤٥٦٧٨٩';
  return s.replace(/[۰-۹]/g, d => String(fa.indexOf(d))).replace(/[٠-٩]/g, d => String(ar.indexOf(d)));
};

export interface OcrResult { amount: number; title: string; rawText: string; line?: string; }

// از متن استخراج‌شده، بزرگ‌ترین مبلغ منطقی و یک عنوان حدس می‌زند
export function extractFromText(rawText: string): OcrResult {
  const text = faToEn(rawText);
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);

  // کلمات کلیدی مبلغ نهایی
  const totalKeywords = /(جمع کل|مبلغ کل|قابل پرداخت|مبلغ قابل|جمع نهایی|پرداختی|total|amount|sum|قیمت کل)/i;
  let bestAmount = 0; let bestLine = '';

  const numbersIn = (s: string) => {
    const out: number[] = [];
    const re = /(\d[\d,٬.\s]{2,})/g; let m;
    while ((m = re.exec(s))) {
      const n = parseInt(m[1].replace(/[,٬.\s]/g, ''), 10);
      if (!isNaN(n) && n >= 1000) out.push(n);
    }
    return out;
  };

  // ۱) اگر خطی شامل کلمهٔ «جمع کل/قابل پرداخت» بود، بزرگ‌ترین عدد همان خط
  for (const l of lines) {
    if (totalKeywords.test(l)) {
      const nums = numbersIn(l);
      if (nums.length) { const v = Math.max(...nums); if (v > bestAmount) { bestAmount = v; bestLine = l; } }
    }
  }
  // ۲) در غیر این صورت بزرگ‌ترین عدد کل سند
  if (!bestAmount) {
    const all = numbersIn(text);
    if (all.length) { bestAmount = Math.max(...all); bestLine = lines.find(l => numbersIn(l).includes(bestAmount)) || ''; }
  }

  // عنوان: اولین خط متنی معنادار (فارسی، بدون عدد زیاد)
  let title = '';
  for (const l of lines) {
    const lettersOnly = l.replace(/[\d,٬.\s\-:|*]/g, '');
    if (lettersOnly.length >= 3 && !totalKeywords.test(l)) { title = l.slice(0, 40); break; }
  }
  if (!title) title = 'رسید اسکن‌شده';

  return { amount: bestAmount, title, rawText, line: bestLine };
}

// اجرای کامل OCR روی فایل تصویر
export async function ocrReceipt(file: File, onProgress?: (p: number) => void): Promise<OcrResult> {
  const Tesseract = await loadTesseract();
  const { data } = await Tesseract.recognize(file, 'fas+eng', {
    logger: (m: any) => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round((m.progress || 0) * 100)); }
  });
  return extractFromText(data?.text || '');
}
