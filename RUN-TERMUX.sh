#!/data/data/com.termux/files/usr/bin/bash
# ───────────────────────────────────────────────
#  اجرای اپ «دست راست» روی Termux اندروید
#  Arena.ai's Agent Mode
# ───────────────────────────────────────────────
cd "$(dirname "$0")"

echo "=> بررسی نصب Node.js ..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js پیدا نشد. در حال نصب ..."
  pkg install -y nodejs
fi
echo "=> نسخهٔ Node: $(node -v)"

# اگر vite واقعاً نصب نیست (نه فقط وجود پوشهٔ node_modules)، نصب کن
if [ ! -x node_modules/.bin/vite ]; then
  echo "=> وابستگی‌ها کامل نیستند. در حال نصب (npm install) ..."
  echo "   (بار اول روی موبایل ۲ تا ۵ دقیقه طول می‌کشد؛ صبر کن)"
  npm install --no-audit --no-fund || { echo "خطا در npm install"; exit 1; }
fi

# باز هم چک نهایی
if [ ! -x node_modules/.bin/vite ]; then
  echo "!! vite هنوز نصب نشد. دستور زیر را دستی اجرا کن:"
  echo "   npm install --no-audit --no-fund"
  exit 1
fi

echo "=> ساخت و اجرای سرور روی پورت 8787 ..."
echo "   بعد از بالا آمدن، در مرورگر گوشی برو به: http://localhost:8787"
echo "   ورود:  admin@dastrast.local  /  Admin12345"
npm start
