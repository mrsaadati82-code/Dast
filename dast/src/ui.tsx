import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';

/* ============================================================
   سیستم دیالوگ داخلی (جایگزین confirm / prompt / alert مرورگر)
   استفادهٔ امری: await confirmDialog({...})
   ============================================================ */
type DialogKind = 'confirm' | 'prompt' | 'alert';
interface DialogReq {
  kind: DialogKind;
  title: string;
  message?: string;
  danger?: boolean;
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  placeholder?: string;
  resolve: (v: any) => void;
}
let pushDialog: ((d: DialogReq) => void) | null = null;

export function confirmDialog(opts: { title: string; message?: string; danger?: boolean; confirmText?: string; cancelText?: string }): Promise<boolean> {
  return new Promise(res => pushDialog && pushDialog({ kind: 'confirm', resolve: res, confirmText: 'تایید', cancelText: 'انصراف', ...opts }));
}
export function promptDialog(opts: { title: string; message?: string; defaultValue?: string; placeholder?: string; confirmText?: string }): Promise<string | null> {
  return new Promise(res => pushDialog && pushDialog({ kind: 'prompt', resolve: res, confirmText: 'ثبت', cancelText: 'انصراف', ...opts }));
}
export function alertDialog(opts: { title: string; message?: string }): Promise<void> {
  return new Promise(res => pushDialog && pushDialog({ kind: 'alert', resolve: res, confirmText: 'باشه', ...opts }));
}

/* Toast */
let pushToast: ((t: { text: string; tone?: string }) => void) | null = null;
export function toast(text: string, tone: 'success' | 'error' | 'info' = 'success') { pushToast && pushToast({ text, tone }); }

export function DialogHost() {
  const [dialog, setDialog] = useState<DialogReq | null>(null);
  const [value, setValue] = useState('');
  const [toasts, setToasts] = useState<{ id: number; text: string; tone?: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    pushDialog = (d) => { setValue(d.defaultValue || ''); setDialog(d); };
    pushToast = (t) => { const id = Date.now() + Math.random(); setToasts(p => [...p, { id, ...t }]); setTimeout(() => setToasts(p => p.filter(x => x.id !== id)), 3500); };
    return () => { pushDialog = null; pushToast = null; };
  }, []);
  useEffect(() => { if (dialog?.kind === 'prompt') setTimeout(() => inputRef.current?.focus(), 50); }, [dialog]);
  function close(result: any) { dialog?.resolve(result); setDialog(null); }
  const toneCls: Record<string, string> = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-zinc-900' };
  return <>
    {dialog && <div dir="rtl" className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-5 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget && dialog.kind !== 'alert') close(dialog.kind === 'confirm' ? false : null); }}>
      <div className="w-full max-w-xs rounded-[28px] border border-black/10 bg-white p-5 shadow-2xl text-zinc-900 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100 animate-message">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: dialog.danger ? 'rgba(239,68,68,.12)' : 'rgba(59,56,160,.12)' }}>
          {dialog.danger ? <AlertTriangle className="text-red-500" size={22} /> : dialog.kind === 'alert' ? <Info className="text-[#3b38a0] dark:text-[#b2b0e8]" size={22} /> : <Check className="text-[#3b38a0] dark:text-[#b2b0e8]" size={22} />}
        </div>
        <h3 className="text-center text-sm font-black text-zinc-900 dark:text-zinc-100">{dialog.title}</h3>
        {dialog.message && <p className="mt-2 text-center text-[11px] leading-6 text-zinc-600 dark:text-zinc-400 whitespace-pre-line">{dialog.message}</p>}
        {dialog.kind === 'prompt' && <input ref={inputRef} value={value} onChange={e => setValue(e.target.value)} placeholder={dialog.placeholder} onKeyDown={e => { if (e.key === 'Enter') close(value); }} className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-xs text-zinc-900 outline-none focus:border-[#3b38a0] dark:border-white/10 dark:bg-zinc-900 dark:text-white" />}
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: dialog.kind === 'alert' ? '1fr' : '1fr 1fr' }}>
          {dialog.kind !== 'alert' && <button onClick={() => close(dialog.kind === 'confirm' ? false : null)} className="rounded-2xl bg-zinc-200 py-3 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">{dialog.cancelText}</button>}
          <button onClick={() => close(dialog.kind === 'confirm' ? true : dialog.kind === 'prompt' ? value : undefined)} className={`rounded-2xl py-3 text-xs font-bold text-white ${dialog.danger ? 'bg-red-500' : 'bg-gradient-to-r from-[#3b38a0] to-[#7a85c1]'}`}>{dialog.confirmText}</button>
        </div>
      </div>
    </div>}
    <div className="fixed bottom-24 left-1/2 z-[110] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map(t => <div key={t.id} className={`rounded-2xl px-4 py-2.5 text-xs font-bold text-white shadow-2xl animate-message ${toneCls[t.tone || 'success']}`}>{t.text}</div>)}
    </div>
  </>;
}

/* ============================================================
   تقویم شمسی (Jalali Date Picker)
   ============================================================ */
function gregorianToJalali(gy: number, gm: number, gd: number) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979; gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
function jalaliToGregorian(jy: number, jm: number, jd: number) {
  let gy = jy <= 979 ? 621 : 1600; jy -= jy <= 979 ? 0 : 979;
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
const J_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const J_DAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
function jalaliMonthLength(jy: number, jm: number) { if (jm <= 6) return 31; if (jm <= 11) return 30; const leap = (jalaliToGregorian(jy, 12, 30)[1] === 12); return leap ? 30 : 29; }
function todayJalali() { const n = new Date(); return gregorianToJalali(n.getFullYear(), n.getMonth() + 1, n.getDate()); }
const fa = (n: number | string) => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);

export function JalaliDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const parsed = (() => { const m = /(\d{3,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(String(value).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))); return m ? [+m[1], +m[2], +m[3]] : todayJalali(); })();
  const [view, setView] = useState<[number, number]>([parsed[0], parsed[1]]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const [vy, vm] = view;
  const firstDow = (() => { const [gy, gm, gd] = jalaliToGregorian(vy, vm, 1); return (new Date(gy, gm - 1, gd).getDay() + 1) % 7; })();
  const len = jalaliMonthLength(vy, vm);
  const tj = todayJalali();
  function pick(d: number) { onChange(`${vy}/${String(vm).padStart(2, '0')}/${String(d).padStart(2, '0')}`); setOpen(false); }
  function nav(delta: number) { let m = vm + delta, y = vy; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } setView([y, m]); }
  const display = value ? value.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]) : '';
  return <div className="relative" ref={ref}>
    <button type="button" onClick={() => setOpen(o => !o)} className="input flex items-center justify-between text-right"><span className={value ? '' : 'text-zinc-400'}>{display || placeholder}</span><span className="text-zinc-400">📅</span></button>
    {open && <div className="absolute inset-x-0 top-full z-[60] mt-2 rounded-3xl border border-black/10 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
      <div className="flex items-center justify-between mb-2"><button type="button" onClick={() => nav(-1)} className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 dark:bg-zinc-900">‹</button><b className="text-xs">{J_MONTHS[vm - 1]} {fa(vy)}</b><button type="button" onClick={() => nav(1)} className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100 dark:bg-zinc-900">›</button></div>
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-zinc-400 mb-1">{J_DAYS.map(d => <span key={d}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <span key={'e' + i} />)}
        {Array.from({ length: len }).map((_, i) => { const d = i + 1; const isToday = tj[0] === vy && tj[1] === vm && tj[2] === d; const isSel = parsed[0] === vy && parsed[1] === vm && parsed[2] === d; return <button type="button" key={d} onClick={() => pick(d)} className={`grid h-8 place-items-center rounded-xl text-[11px] ${isSel ? 'bg-gradient-to-br from-[#3b38a0] to-[#7a85c1] text-white font-bold' : isToday ? 'bg-[#3b38a0]/15 text-[#3b38a0] dark:text-[#b2b0e8]' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'}`}>{fa(d)}</button>; })}
      </div>
      <button type="button" onClick={() => { const t = todayJalali(); onChange(`${t[0]}/${String(t[1]).padStart(2, '0')}/${String(t[2]).padStart(2, '0')}`); setOpen(false); }} className="mt-2 w-full rounded-2xl bg-zinc-100 dark:bg-zinc-900 py-2 text-[10px] font-bold">امروز</button>
    </div>}
  </div>;
}

/* ============================================================
   منوی کانتکست (کلیک‌راست / لمس طولانی) + هوک
   ============================================================ */
export interface MenuAction { label: string; icon?: React.ReactNode; danger?: boolean; onClick: () => void; }
let pushMenu: ((m: { x: number; y: number; actions: MenuAction[] }) => void) | null = null;
export function openMenu(x: number, y: number, actions: MenuAction[]) { pushMenu && pushMenu({ x, y, actions }); }

export function ContextMenuHost() {
  const [menu, setMenu] = useState<{ x: number; y: number; actions: MenuAction[] } | null>(null);
  const openedAt = useRef(0);
  useEffect(() => { pushMenu = (m) => { openedAt.current = Date.now(); setMenu(m); }; return () => { pushMenu = null; }; }, []);
  if (!menu) return null;
  const top = Math.min(menu.y, window.innerHeight - menu.actions.length * 48 - 40);
  const left = Math.min(menu.x, window.innerWidth - 180);
  // رویدادهای شبیه‌سازی‌شدهٔ بلافاصله پس از باز شدن (ghost click پس از لمس طولانی) نادیده گرفته می‌شوند
  const tryClose = () => { if (Date.now() - openedAt.current > 350) setMenu(null); };
  return <div dir="rtl" className="fixed inset-0 z-[90]" onMouseDown={tryClose} onTouchStart={tryClose} onContextMenu={e => { e.preventDefault(); tryClose(); }}>
    <div className="absolute min-w-[160px] rounded-2xl border border-black/10 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-zinc-950 animate-message" style={{ top, left }} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
      {menu.actions.map((a, i) => <button key={i} onClick={() => { setMenu(null); a.onClick(); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold transition hover:bg-zinc-100 dark:hover:bg-zinc-900 ${a.danger ? 'text-red-600 dark:text-red-400' : 'text-zinc-800 dark:text-zinc-100'}`}>{a.icon}<span>{a.label}</span></button>)}
    </div>
  </div>;
}

// هوک لمس طولانی + کلیک‌راست
export function useLongPress(getActions: () => MenuAction[]) {
  const timer = useRef<any>(null);
  const fired = useRef(false);
  function start(x: number, y: number) {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      if (navigator.vibrate) navigator.vibrate(15);
      try { window.getSelection?.()?.removeAllRanges(); } catch {} // جلوگیری از انتخاب‌شدن متن گزینهٔ زیر انگشت
      openMenu(x, y, getActions());
    }, 450);
  }
  function clear() { clearTimeout(timer.current); }
  const noSelect: React.CSSProperties = { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' };
  return {
    style: noSelect,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); openMenu(e.clientX, e.clientY, getActions()); },
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; start(t.clientX, t.clientY); },
    onTouchEnd: clear, onTouchMove: clear,
  };
}

// ردیف عملیاتی آماده: کلیک‌راست/لمس طولانی → منو، با پشتیبانی حالت انتخاب
export function ActionRow({ actions, selectMode, selected, onToggle, className = '', children }: { actions: MenuAction[]; selectMode?: boolean; selected?: boolean; onToggle?: () => void; className?: string; children: React.ReactNode }) {
  const lp = useLongPress(() => actions);
  const handlers = selectMode ? { onClick: onToggle } : lp;
  return <div {...handlers} className={`relative ${selectMode ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-[#3b38a0] rounded-2xl' : ''} ${className}`}>
    {selectMode && <span className={`absolute left-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full border text-[10px] ${selected ? 'bg-[#3b38a0] border-[#3b38a0] text-white' : 'border-zinc-400 bg-white/70 dark:bg-zinc-950/70'}`}>{selected ? '✓' : ''}</span>}
    {children}
  </div>;
}

// تبدیل همهٔ ارقام لاتین به فارسی
export function toFaDigits(s: any): string { return String(s ?? '').replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]); }
export function toEnDigits(s: any): string { return String(s ?? '').replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))); }
// فیلد مبلغ: نمایش با جداکنندهٔ سه‌رقمی فارسی، مقدار خام عددی به onChange می‌دهد
export function AmountInput({ value, onChange, placeholder, className = '' }: { value: string | number; onChange: (raw: string) => void; placeholder?: string; className?: string }) {
  const raw = toEnDigits(value).replace(/[^\d]/g, '');
  const display = raw ? toFaDigits(Number(raw).toLocaleString('en-US')) : '';
  return <input
    inputMode="numeric"
    className={`input ${className}`}
    value={display}
    placeholder={placeholder}
    onChange={e => { const r = toEnDigits(e.target.value).replace(/[^\d]/g, ''); onChange(r); }}
  />;
}

// صفحه‌بندی ساده: نوار «قبلی/بعدی» + شمارهٔ صفحه
export function Pager({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (p: number) => void }) {
  if (pageCount <= 1) return null;
  return <div className="flex items-center justify-center gap-2 pt-1">
    <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} className="op-btn disabled:opacity-40">قبلی</button>
    <span className="text-[10px] text-zinc-500">صفحهٔ {toFaDigits(page + 1)} از {toFaDigits(pageCount)}</span>
    <button onClick={() => onChange(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} className="op-btn disabled:opacity-40">بعدی</button>
  </div>;
}

export { DialogHost as default };
