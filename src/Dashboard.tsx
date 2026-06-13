import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, Bell, Plus, Sparkles, Settings2, Check, GripVertical } from 'lucide-react';
import { Pager, AmountInput } from './ui';

const money = (n = 0) => Number(n || 0).toLocaleString('fa-IR');
const PALETTE = ['#3b38a0', '#7a85c1', '#b2b0e8', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7'];

/* ===================== Types ===================== */
export type SummaryPoint = { ym: string; label: string; income: number; expense: number; net: number; cumulative: number };
export type Summary = {
  income: number; expense: number; balance: number; count: number;
  series: SummaryPoint[];
  byCategory: { name: string; value: number }[];
  incomeByCategory: { name: string; value: number }[];
  byMethod: { name: string; value: number }[];
  topPersons: { name: string; balance: number }[];
  topProjects: { name: string; amount: number; paid: number; balance: number }[];
  accounts: { name: string; value: number }[];
};
export type Compare = Record<string, { income: any; expense: any; net: any }>;
export type Alert = { level: 'danger' | 'warning' | 'info' | 'success'; icon: string; title: string; text: string };
export type Prefs = { kpis: string[]; charts: string[]; compare: boolean; alerts: boolean };
type Api = <T>(u: string, o?: RequestInit) => Promise<T>;

/* ===================== Reusable Charts (inline SVG) ===================== */
function useAnimatedMount() { const [m, setM] = useState(false); useEffect(() => { const t = setTimeout(() => setM(true), 30); return () => clearTimeout(t); }, []); return m; }

export function GroupedBars({ series }: { series: SummaryPoint[] }) {
  const max = Math.max(1, ...series.map(s => Math.max(s.income, s.expense)));
  const W = 320, H = 140, n = Math.max(1, series.length), gap = 14;
  const groupW = (W - gap * (n + 1)) / n;
  const barW = Math.min(9, Math.max(3.5, groupW / 2 - 2)); // باریک و خوش‌فرم
  const mounted = useAnimatedMount();
  const [sel, setSel] = useState<number | null>(null);
  const s = sel !== null ? series[sel] : null;
  return <div className="relative">
    {s && <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-zinc-950/95 px-3 py-2 text-[9px] leading-4 text-white shadow-xl border border-white/10 whitespace-nowrap">
      <b>{s.label}</b>
      <div className="flex items-center gap-1 mt-0.5"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"/> درآمد: {money(s.income)}</div>
      <div className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block"/> هزینه: {money(s.expense)}</div>
      <div className={s.net >= 0 ? 'text-emerald-300' : 'text-red-300'}>خالص: {money(s.net)}</div>
    </div>}
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-36" preserveAspectRatio="none" onMouseLeave={() => setSel(null)} onTouchEnd={() => setTimeout(() => setSel(null), 2500)}>
      {[0.25, 0.5, 0.75].map(g => <line key={g} x1="0" x2={W} y1={(H - 22) * g + 4} y2={(H - 22) * g + 4} stroke="currentColor" strokeOpacity="0.07" />)}
      {series.map((sp, i) => {
        const x = gap + i * (groupW + gap);
        const cx = x + groupW / 2;
        const ih = mounted ? (sp.income / max) * (H - 30) : 0, eh = mounted ? (sp.expense / max) * (H - 30) : 0;
        const delay = `${i * 0.07}s`;
        const active = sel === i;
        return <g key={sp.ym} onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} style={{ cursor: 'pointer' }}>
          <rect x={x - gap / 2} y="0" width={groupW + gap} height={H} fill="transparent" />
          {active && <rect x={x - gap / 2 + 1} y="2" width={groupW + gap - 2} height={H - 18} rx="8" fill="currentColor" opacity="0.05" />}
          <rect x={cx - barW - 1.5} y={H - 20 - ih} width={barW} height={ih} rx={barW / 2} fill="url(#gIncome)" opacity={sel === null || active ? 1 : 0.35} style={{ transition: `y .8s cubic-bezier(.16,1,.3,1) ${delay}, height .8s cubic-bezier(.16,1,.3,1) ${delay}, opacity .25s ease` }} />
          <rect x={cx + 1.5} y={H - 20 - eh} width={barW} height={eh} rx={barW / 2} fill="url(#gExpense)" opacity={sel === null || active ? 1 : 0.35} style={{ transition: `y .8s cubic-bezier(.16,1,.3,1) ${delay}, height .8s cubic-bezier(.16,1,.3,1) ${delay}, opacity .25s ease` }} />
          <text x={cx} y={H - 6} fontSize="7.5" fill={active ? '#3b38a0' : '#9ca3af'} fontWeight={active ? 'bold' : 'normal'} textAnchor="middle">{sp.label.slice(0, 5)}</text>
        </g>;
      })}
      <defs>
        <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#059669" /></linearGradient>
        <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f87171" /><stop offset="1" stopColor="#dc2626" /></linearGradient>
      </defs>
    </svg>
  </div>;
}

export function LineChart({ series, field, color = '#3b38a0' }: { series: SummaryPoint[]; field: 'net' | 'income' | 'expense' | 'cumulative'; color?: string }) {
  const W = 320, H = 120, pad = 10;
  const vals = series.map(s => s[field]);
  const max = Math.max(1, ...vals.map(Math.abs));
  const n = Math.max(1, series.length - 1);
  const pts = series.map((s, i) => { const x = pad + (i * (W - 2 * pad)) / (n || 1); const y = H / 2 - (s[field] / max) * (H / 2 - 14); return [x, y]; });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${path} L${pts[pts.length - 1]?.[0] || pad},${H} L${pts[0]?.[0] || pad},${H} Z`;
  const mounted = useAnimatedMount();
  const [sel, setSel] = useState<number | null>(null);
  const FIELD_FA: Record<string, string> = { net: 'خالص', income: 'درآمد', expense: 'هزینه', cumulative: 'تجمعی' };
  const s = sel !== null ? series[sel] : null;
  return <div className="relative">
    {s && <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-zinc-950/95 px-3 py-1.5 text-[9px] leading-4 text-white shadow-xl border border-white/10 whitespace-nowrap"><b>{s.label}</b> — {FIELD_FA[field]}: <b style={{ color }}>{money(s[field])}</b></div>}
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28" preserveAspectRatio="none" onMouseLeave={() => setSel(null)} onTouchEnd={() => setTimeout(() => setSel(null), 2500)}>
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeOpacity="0.08" />
      <path d={area} fill={color} style={{ opacity: mounted ? 0.12 : 0, transition: 'opacity 1s ease' }} />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 1000, strokeDashoffset: mounted ? 0 : 1000, transition: 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)' }} />
      {sel !== null && <line x1={pts[sel][0]} x2={pts[sel][0]} y1="6" y2={H - 6} stroke={color} strokeOpacity="0.35" strokeDasharray="3 3" />}
      {pts.map((p, i) => <g key={i} onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} style={{ cursor: 'pointer' }}>
        <rect x={p[0] - (W / Math.max(1, pts.length)) / 2} y="0" width={W / Math.max(1, pts.length)} height={H} fill="transparent" />
        <circle cx={p[0]} cy={p[1]} r={sel === i ? 4.5 : 2.6} fill={sel === i ? color : '#fff'} stroke={color} strokeWidth="2" style={{ opacity: mounted ? 1 : 0, transition: `opacity .4s ease ${i * 0.05}s, r .2s ease` }} />
      </g>)}
    </svg>
  </div>;
}

export function Donut({ data, label }: { data: { name: string; value: number }[]; label?: string }) {
  const top = data.slice(0, 7);
  const total = top.reduce((s, d) => s + d.value, 0) || 1;
  let acc = 0; const R = 42, C = 2 * Math.PI * R;
  const mounted = useAnimatedMount();
  const [sel, setSel] = useState<number | null>(null);
  const s = sel !== null ? top[sel] : null;
  return <div className="flex items-center gap-4">
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 110 110" className="h-28 w-28 -rotate-90">
        <circle cx="55" cy="55" r={R} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="14" />
        {top.map((d, i) => { const frac = d.value / total; const dash = (mounted ? frac : 0) * C; const seg = <circle key={i} cx="55" cy="55" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={sel === i ? 18 : 14} strokeLinecap="round" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} opacity={sel === null || sel === i ? 1 : 0.3} onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} style={{ transition: 'stroke-dasharray .9s cubic-bezier(.16,1,.3,1), stroke-width .2s ease, opacity .25s ease', cursor: 'pointer' }} />; acc += (mounted ? frac : 0) * C; return seg; })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center pointer-events-none"><div>{s ? <><div className="text-[8px] text-zinc-500 truncate max-w-[70px]">{s.name}</div><div className="text-[10px] font-black">{money(s.value)}</div><div className="text-[8px]" style={{ color: PALETTE[(sel || 0) % PALETTE.length] }}>{Math.round(s.value / total * 100)}٪</div></> : <><div className="text-[8px] text-zinc-500">{label || 'مجموع'}</div><div className="text-[10px] font-black">{money(total)}</div></>}</div></div>
    </div>
    <div className="flex-1 space-y-1.5" onMouseLeave={() => setSel(null)}>{top.map((d, i) => <div key={i} onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} className={`flex items-center justify-between text-[10px] rounded-lg px-1 py-0.5 transition cursor-pointer ${sel === i ? 'bg-black/5 dark:bg-white/10' : ''}`}><span className="flex items-center gap-1.5 truncate"><i className="h-2.5 w-2.5 rounded-sm inline-block shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="truncate">{d.name}</span></span><b className="shrink-0">{sel === i ? money(d.value) : `${Math.round(d.value / total * 100)}٪`}</b></div>)}{!top.length && <div className="text-[10px] text-zinc-500">داده‌ای نیست</div>}</div>
  </div>;
}

export function HBars({ data, formatter }: { data: { name: string; value: number }[]; formatter?: (n: number) => string }) {
  const max = Math.max(1, ...data.map(d => Math.abs(d.value)));
  const mounted = useAnimatedMount();
  const [sel, setSel] = useState<number | null>(null);
  return <div className="space-y-2" onMouseLeave={() => setSel(null)}>{data.map((d, i) => <div key={i} onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} className={`rounded-lg px-1 py-0.5 transition cursor-pointer ${sel === i ? 'bg-black/5 dark:bg-white/10' : ''}`}>
    <div className="flex justify-between text-[10px] mb-1"><span className="truncate">{d.name}</span><b className={d.value < 0 ? 'text-red-500' : 'text-emerald-500'}>{(formatter || money)(d.value)}{sel === i && <span className="text-zinc-500 font-normal"> ({Math.round(Math.abs(d.value) / max * 100)}٪ بیشینه)</span>}</b></div>
    <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"><div className="h-2 rounded-full" style={{ width: mounted ? `${Math.max(4, Math.abs(d.value) / max * 100)}%` : '0%', background: d.value < 0 ? 'linear-gradient(90deg,#f87171,#dc2626)' : 'linear-gradient(90deg,#34d399,#059669)', transition: `width .9s cubic-bezier(.16,1,.3,1) ${i * 0.08}s` }} /></div>
  </div>)}{!data.length && <div className="text-[10px] text-zinc-500">داده‌ای نیست</div>}</div>;
}

export function Gauge({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(1, max ? value / max : 0));
  const R = 50, C = Math.PI * R; const mounted = useAnimatedMount();
  return <div className="flex flex-col items-center">
    <svg viewBox="0 0 120 70" className="w-40 h-24">
      <path d={`M10,62 A${R},${R} 0 0 1 110,62`} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="11" strokeLinecap="round" />
      <path d={`M10,62 A${R},${R} 0 0 1 110,62`} fill="none" stroke="url(#gg)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(mounted ? pct : 0) * C} ${C}`} style={{ transition: 'stroke-dasharray 1s ease' }} />
      <defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b38a0" /><stop offset="1" stopColor="#7a85c1" /></linearGradient></defs>
    </svg>
    <div className="-mt-6 text-center"><div className="text-base font-black">{Math.round(pct * 100)}٪</div><div className="text-[9px] text-zinc-500">{label}</div></div>
  </div>;
}

function ForecastChart({ forecast }: { forecast: any }) {
  const pts = [{ month: 0, projected: forecast.currentCash, best: forecast.currentCash, worst: forecast.currentCash }, ...(forecast.points || [])];
  const W = 320, H = 130, pad = 12;
  const all = pts.flatMap((p: any) => [p.projected, p.best ?? p.projected, p.worst ?? p.projected]);
  const min = Math.min(0, ...all), max = Math.max(1, ...all);
  const span = max - min || 1;
  const X = (i: number) => pad + (i * (W - 2 * pad)) / Math.max(1, pts.length - 1);
  const Y = (v: number) => H - 20 - ((v - min) / span) * (H - 34);
  const path = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.projected).toFixed(1)}`).join(' ');
  // باند بهترین/بدترین حالت
  const band = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${X(i).toFixed(1)},${Y(p.best ?? p.projected).toFixed(1)}`).join(' ')
    + ' ' + [...pts].reverse().map((p: any, i: number) => `L${X(pts.length - 1 - i).toFixed(1)},${Y(p.worst ?? p.projected).toFixed(1)}`).join(' ') + ' Z';
  const zeroY = Y(0);
  const mounted = useAnimatedMount();
  const [sel, setSel] = useState<number | null>(null);
  const MONTH_LBL = ['اکنون', '۱ ماه', '۲ ماه', '۳ ماه', '۴ ماه', '۵ ماه', '۶ ماه'];
  const s = sel !== null ? pts[sel] : null;
  return <div className="relative">
    {s && <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-zinc-950/95 px-3 py-2 text-[9px] leading-4 text-white shadow-xl border border-white/10 whitespace-nowrap">
      <b>{MONTH_LBL[sel!]}</b>
      <div>پیش‌بینی: <b className={s.projected < 0 ? 'text-red-300' : 'text-emerald-300'}>{money(s.projected)}</b></div>
      {sel! > 0 && <><div className="text-zinc-400">بهترین: {money(s.best)} | بدترین: {money(s.worst)}</div>{s.chequeNet ? <div className="text-zinc-400">اثر چک‌ها: {money(s.chequeNet)}</div> : null}</>}
    </div>}
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" preserveAspectRatio="none" onMouseLeave={() => setSel(null)} onTouchEnd={() => setTimeout(() => setSel(null), 2500)}>
      {min < 0 && <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="#ef4444" strokeOpacity="0.35" strokeDasharray="4 3" />}
      <path d={band} fill="#3b38a0" opacity={mounted ? 0.08 : 0} style={{ transition: 'opacity 1s ease' }} />
      <path d={`${path} L${X(pts.length - 1)},${H} L${X(0)},${H} Z`} fill="#3b38a0" opacity={mounted ? 0.1 : 0} style={{ transition: 'opacity .8s ease' }} />
      <path d={path} fill="none" stroke="#3b38a0" strokeWidth="2.5" strokeLinecap="round" style={{ strokeDasharray: 1000, strokeDashoffset: mounted ? 0 : 1000, transition: 'stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)' }} />
      {sel !== null && <line x1={X(sel)} x2={X(sel)} y1="6" y2={H - 14} stroke="#3b38a0" strokeOpacity="0.35" strokeDasharray="3 3" />}
      {pts.map((p: any, i: number) => <g key={i} onMouseEnter={() => setSel(i)} onTouchStart={() => setSel(i)} style={{ cursor: 'pointer' }}>
        <rect x={X(i) - (W / pts.length) / 2} y="0" width={W / pts.length} height={H} fill="transparent" />
        <circle cx={X(i)} cy={Y(p.projected)} r={sel === i ? 4.5 : 2.8} fill={p.projected < 0 ? '#ef4444' : sel === i ? '#3b38a0' : '#fff'} stroke="#3b38a0" strokeWidth="2" style={{ opacity: mounted ? 1 : 0, transition: `opacity .4s ease ${i * 0.06}s` }} />
        <text x={X(i)} y={H - 4} fontSize="7" fill={sel === i ? '#3b38a0' : '#9ca3af'} fontWeight={sel === i ? 'bold' : 'normal'} textAnchor="middle">{MONTH_LBL[i] || ''}</text>
      </g>)}
    </svg>
  </div>;
}

/* ===================== Cards ===================== *//* ===================== Cards ===================== */
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 border border-black/5 dark:border-white/5"><h3 className="text-xs font-bold mb-3">{title}</h3>{children}</div>;
}
function Stat({ label, value, good = false }: { label: string; value: number; good?: boolean }) { return <div><div className={`flex gap-1 text-[10px] ${good ? 'text-emerald-400' : 'text-red-400'}`}>{good ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{label}</div><b className="text-xs">{money(value)} تومان</b></div>; }
function CompareCard({ label, data, invert = false }: { label: string; data: { current: number; previous: number; changePct: number }; invert?: boolean }) {
  const up = data.changePct >= 0; const good = invert ? !up : up;
  return <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 border border-black/5 dark:border-white/5"><span className="text-[9px] text-zinc-500">{label}</span><b className="mt-1 block text-xs">{money(data.current)}</b><span className={`mt-1 flex items-center gap-0.5 text-[10px] ${good ? 'text-emerald-500' : 'text-red-500'}`}>{up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{Math.abs(data.changePct).toLocaleString('fa-IR')}٪</span></div>;
}
function AlertRow({ a }: { a: Alert }) {
  const styles: Record<string, string> = { danger: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300', warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300', info: 'border-[#3b38a0]/30 bg-[#3b38a0]/10 text-[#3b38a0] dark:text-[#b2b0e8]', success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
  return <div className={`rounded-2xl border p-3 flex gap-2 ${styles[a.level]}`}><AlertCircle size={15} className="shrink-0 mt-0.5" /><div><b className="text-[11px] block">{a.title}</b><p className="text-[10px] leading-5 opacity-90">{a.text}</p></div></div>;
}

/* ===================== Catalog ===================== */
const KPI_CATALOG: { id: string; label: string; tone: string; calc: (s: Summary, persons: any[]) => number }[] = [
  { id: 'balance', label: 'مانده', tone: 'purple', calc: s => s.balance },
  { id: 'income', label: 'درآمد', tone: 'green', calc: s => s.income },
  { id: 'expense', label: 'هزینه', tone: 'red', calc: s => s.expense },
  { id: 'profit', label: 'سود ناخالص', tone: 'purple', calc: s => s.income - s.expense },
  { id: 'receivable', label: 'مطالبات', tone: 'green', calc: (_s, p) => p.filter((x: any) => x.balance > 0).reduce((a: number, x: any) => a + x.balance, 0) },
  { id: 'payable', label: 'بدهی اشخاص', tone: 'red', calc: (_s, p) => Math.abs(p.filter((x: any) => x.balance < 0).reduce((a: number, x: any) => a + x.balance, 0)) },
  { id: 'count', label: 'تعداد تراکنش', tone: 'gray', calc: s => s.count },
  { id: 'projects', label: 'پروژه‌های بدهکار', tone: 'gray', calc: s => s.topProjects.filter(p => p.balance > 0).length }
];
const CHART_CATALOG = [
  { id: 'budgets', label: 'بودجه' },
  { id: 'goals', label: 'اهداف پس‌انداز' },
  { id: 'forecast', label: 'پیش‌بینی جریان نقد ۶ ماه' },
  { id: 'trendBar', label: 'روند درآمد/هزینه (میله‌ای)' },
  { id: 'netLine', label: 'سود خالص ماهانه (خطی)' },
  { id: 'cumulativeArea', label: 'مانده تجمعی (سطحی)' },
  { id: 'expenseDonut', label: 'سهم هزینه‌ها (دونات)' },
  { id: 'incomeDonut', label: 'سهم درآمدها (دونات)' },
  { id: 'topPersons', label: 'اشخاص برتر (افقی)' },
  { id: 'topProjects', label: 'پروژه‌ها (افقی)' },
  { id: 'accounts', label: 'مانده حساب‌ها (افقی)' },
  { id: 'methods', label: 'روش ثبت (دونات)' },
  { id: 'savingGauge', label: 'نرخ پس‌انداز (گِیج)' }
];
const KPI_COLORS: Record<string, string> = { green: 'text-emerald-500', red: 'text-red-500', purple: 'text-[#3b38a0] dark:text-[#b2b0e8]', gray: 'text-zinc-700 dark:text-zinc-200' };

/* ===================== Dashboard ===================== */
export function Dashboard({ totals, transactions, persons, setTab, api, QuickTxForm, TxRow, Empty }: {
  totals: { income: number; expense: number; balance: number };
  transactions: any[]; persons: any[]; setTab: (t: any) => void; api: Api;
  QuickTxForm: any; TxRow: any; Empty: any;
}) {
  const [showForm, setShowForm] = useState(false);
  const [txPage, setTxPage] = useState(0);
  const [range, setRange] = useState<'week' | 'month' | 'quarter' | 'year' | 'all'>('all');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [filters, setFilters] = useState<any>(null);
  const [customize, setCustomize] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [f, setF] = useState<{ category?: string; personId?: string; projectId?: string; bank?: string }>({});
  const [budgets, setBudgets] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [forecast, setForecast] = useState<any>(null);
  const [manage, setManage] = useState<'' | 'budget' | 'goal' | 'alert'>('');
  const [allCats, setAllCats] = useState<string[]>([]);
  const [customAlerts, setCustomAlerts] = useState<any[]>([]);
  const [bgCat, setBgCat] = useState(''); const [bgAmt, setBgAmt] = useState('');
  const [glTitle, setGlTitle] = useState(''); const [glAmt, setGlAmt] = useState('');
  const [alKind, setAlKind] = useState('categoryOver'); const [alCat, setAlCat] = useState(''); const [alAmt, setAlAmt] = useState('');
  const reloadExtras = () => { void api<any[]>('/budgets').then(setBudgets).catch(() => {}); void api<any[]>('/goals').then(setGoals).catch(() => {}); void api<any>('/analytics/forecast').then(setForecast).catch(() => {}); void api<string[]>('/categories').then(setAllCats).catch(() => {}); void api<any[]>('/custom-alerts').then(setCustomAlerts).catch(() => {}); };

  const qs = useMemo(() => { const p = new URLSearchParams({ range }); Object.entries(f).forEach(([k, v]) => v && p.set(k, v as string)); return p.toString(); }, [range, f]);

  useEffect(() => { void api<Summary>(`/analytics/summary?${qs}`).then(setSummary).catch(() => {}); }, [qs, transactions.length]);
  useEffect(() => { void api<Compare>('/analytics/compare').then(setCompare).catch(() => {}); void api<Alert[]>('/analytics/alerts').then(setAlerts).catch(() => {}); void api<any>('/analytics/filters').then(setFilters).catch(() => {}); void api<Prefs>('/dashboard/prefs').then(setPrefs).catch(() => {}); reloadExtras(); }, [transactions.length, persons.length]);

  async function savePrefs(next: Prefs) { setPrefs(next); try { await api('/dashboard/prefs', { method: 'PUT', body: JSON.stringify(next) }); } catch {} }
  function toggle(list: keyof Prefs, idv: string) { if (!prefs) return; const arr = (prefs[list] as string[]).slice(); const i = arr.indexOf(idv); if (i >= 0) arr.splice(i, 1); else arr.push(idv); void savePrefs({ ...prefs, [list]: arr }); }
  function reorderCharts(from: number, to: number) { if (!prefs || from === to) return; const arr = prefs.charts.slice(); const [m] = arr.splice(from, 1); arr.splice(to, 0, m); void savePrefs({ ...prefs, charts: arr }); }

  const rangeLabel: Record<string, string> = { week: 'هفته', month: 'ماهانه', quarter: 'فصلی', year: 'سالانه', all: 'کل' };
  const cmpKey = range === 'all' || range === 'week' ? 'month' : range;
  const cmp = compare?.[cmpKey];
  const savingRate = summary && summary.income > 0 ? (summary.income - summary.expense) : 0;

  const renderChart = (cid: string) => {
    if (!summary) return null;
    switch (cid) {
      case 'trendBar': return summary.series.length ? <ChartCard key={cid} title="روند درآمد و هزینه"><GroupedBars series={summary.series} /><div className="mt-2 flex gap-4 text-[9px] text-zinc-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> درآمد</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-500 inline-block" /> هزینه</span></div></ChartCard> : null;
      case 'netLine': return summary.series.length ? <ChartCard key={cid} title="سود خالص ماهانه"><LineChart series={summary.series} field="net" color="#10b981" /></ChartCard> : null;
      case 'cumulativeArea': return summary.series.length ? <ChartCard key={cid} title="مانده تجمعی"><LineChart series={summary.series} field="cumulative" color="#3b38a0" /></ChartCard> : null;
      case 'expenseDonut': return summary.byCategory.length ? <ChartCard key={cid} title="سهم دسته‌بندی هزینه‌ها"><Donut data={summary.byCategory} label="هزینه" /></ChartCard> : null;
      case 'incomeDonut': return summary.incomeByCategory.length ? <ChartCard key={cid} title="سهم درآمدها"><Donut data={summary.incomeByCategory} label="درآمد" /></ChartCard> : null;
      case 'topPersons': return summary.topPersons.length ? <ChartCard key={cid} title="اشخاص برتر (طلب/بدهی)"><HBars data={summary.topPersons.map(p => ({ name: p.name, value: p.balance }))} /></ChartCard> : null;
      case 'topProjects': return summary.topProjects.length ? <ChartCard key={cid} title="پروژه‌ها بر اساس مانده"><HBars data={summary.topProjects.map(p => ({ name: p.name, value: p.balance }))} /></ChartCard> : null;
      case 'accounts': return summary.accounts.length ? <ChartCard key={cid} title="مانده حساب‌ها و صندوق‌ها"><HBars data={summary.accounts} /></ChartCard> : null;
      case 'methods': return summary.byMethod.length ? <ChartCard key={cid} title="روش ثبت تراکنش‌ها"><Donut data={summary.byMethod} label="تعداد" /></ChartCard> : null;
      case 'savingGauge': return <ChartCard key={cid} title="نرخ پس‌انداز دوره"><div className="grid place-items-center"><Gauge value={Math.max(0, savingRate)} max={Math.max(1, summary.income)} label="پس‌انداز از درآمد" /></div></ChartCard>;
      case 'budgets': return <ChartCard key={cid} title="بودجه (ماه جاری)">
        <div className="space-y-2.5">{budgets.map(b => { const pct = Math.min(100, b.pct); const color = b.pct >= 100 ? '#ef4444' : b.pct >= 80 ? '#f59e0b' : '#10b981'; return <div key={b.id}>
          <div className="flex justify-between text-[10px] mb-1"><span className="truncate">{b.category || 'کل هزینه‌ها'}</span><b style={{ color }}>{money(b.spent)} از {money(b.amount)} ({b.pct.toLocaleString('fa-IR')}٪)</b></div>
          <div className="h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"><div className="h-2.5 rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: color, transition: 'width .8s ease' }} /></div>
        </div>; })}{!budgets.length && <p className="text-[10px] text-zinc-500">بودجه‌ای تنظیم نشده. در دستیار بگو: «بودجه خوراکی رو ۲ میلیون بذار»</p>}</div>
        <button onClick={() => setManage('budget')} className="mt-3 w-full rounded-2xl bg-zinc-200 dark:bg-zinc-800 py-2 text-[10px] font-bold">مدیریت بودجه‌ها</button>
      </ChartCard>;
      case 'goals': return <ChartCard key={cid} title="اهداف پس‌انداز">
        <div className="space-y-2.5">{goals.map(g => { const pct = Math.min(100, g.pct || 0); const done = g.done || pct >= 100; return <div key={g.id}>
          <div className="flex justify-between text-[10px] mb-1"><span className="truncate">{done ? '✅' : '🎯'} {g.title}{g.deadline ? <span className="text-zinc-400"> — تا {g.deadline}</span> : null}</span><b className={done ? 'text-emerald-500' : ''}>{money(g.saved)} از {money(g.target)}</b></div>
          <div className="h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"><div className="h-2.5 rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: done ? 'linear-gradient(90deg,#34d399,#059669)' : 'linear-gradient(90deg,#3b38a0,#7a85c1)', transition: 'width .8s ease' }} /></div>
        </div>; })}{!goals.length && <p className="text-[10px] text-zinc-500">هدفی نساخته‌ای. در دستیار بگو: «هدف پس‌انداز خرید ماشین ۵۰۰ میلیون تا اسفند»</p>}</div>
        <button onClick={() => setManage('goal')} className="mt-3 w-full rounded-2xl bg-zinc-200 dark:bg-zinc-800 py-2 text-[10px] font-bold">مدیریت اهداف</button>
      </ChartCard>;
      case 'forecast': return forecast ? <ChartCard key={cid} title="پیش‌بینی جریان نقد ۶ ماه آینده">
        <ForecastChart forecast={forecast} />
        <p className="mt-2 text-[9px] leading-4 text-zinc-500">مدل: میانگین وزنیِ خالص {forecast.monthsUsed ? `${Number(forecast.monthsUsed).toLocaleString('fa-IR')} ماه اخیر` : 'ماه‌های اخیر'} ({forecast.avgMonthlyNet >= 0 ? '+' : ''}{money(forecast.avgMonthlyNet)}/ماه) + چک‌های دریافتنیِ وزن‌خورده با احتمال وصول مشتری + باند عدم‌قطعیت (±{money(forecast.stdev || 0)}). ناحیهٔ کم‌رنگ = بازهٔ بهترین/بدترین حالت.</p>
      </ChartCard> : null;
      default: return null;
    }
  };

  return <div className="p-4 space-y-4">
    {/* نوار بازه + دکمه شخصی‌سازی */}
    <div className="flex items-center gap-2">
      <div data-coach="dash-range" className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">{(['week', 'month', 'quarter', 'year', 'all'] as const).map(r => <button key={r} onClick={() => setRange(r)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold transition ${range === r ? 'bg-[#3b38a0] text-white' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'}`}>{rangeLabel[r]}</button>)}</div>
      <button data-coach="dash-custom" onClick={() => setCustomize(true)} className="icon-btn shrink-0" title="شخصی‌سازی داشبورد"><Settings2 size={16} /></button>
    </div>

    {/* فیلترهای پیشرفته */}
    {filters && <div className="grid grid-cols-2 gap-2">
      <select value={f.category || ''} onChange={e => setF({ ...f, category: e.target.value })} className="input !py-2 !text-[10px]"><option value="">همه دسته‌ها</option>{filters.categories.map((c: string) => <option key={c} value={c}>{c}</option>)}</select>
      <select value={f.personId || ''} onChange={e => setF({ ...f, personId: e.target.value })} className="input !py-2 !text-[10px]"><option value="">همه اشخاص</option>{filters.persons.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {filters.projects.length > 0 && <select value={f.projectId || ''} onChange={e => setF({ ...f, projectId: e.target.value })} className="input !py-2 !text-[10px]"><option value="">همه پروژه‌ها</option>{filters.projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      {filters.banks.length > 0 && <select value={f.bank || ''} onChange={e => setF({ ...f, bank: e.target.value })} className="input !py-2 !text-[10px]"><option value="">همه بانک‌ها</option>{filters.banks.map((b: string) => <option key={b} value={b}>{b}</option>)}</select>}
    </div>}

    {/* کارت اصلی */}
    <div data-coach="dash-card" className="rounded-3xl bg-gradient-to-br from-zinc-900 to-black p-4 text-white border border-white/10 overflow-hidden relative"><div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-[#3b38a0]/40 blur-2xl" /><span className="text-[10px] text-zinc-400">داشبورد مالی • {rangeLabel[range]}</span><div className="mt-1 text-2xl font-black">{money(summary?.balance ?? totals.balance)} <span className="text-xs text-zinc-400">تومان</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3"><Stat label="درآمد" value={summary?.income ?? totals.income} good /><Stat label="مخارج" value={summary?.expense ?? totals.expense} /></div></div>

    {/* KPI های انتخابی */}
    {summary && prefs && prefs.kpis.length > 0 && <div className="grid grid-cols-2 gap-2">{prefs.kpis.map(kid => { const k = KPI_CATALOG.find(x => x.id === kid); if (!k) return null; return <div key={kid} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 border border-black/5 dark:border-white/5"><span className="text-[10px] text-zinc-500">{k.label}</span><b className={`mt-1 block text-sm ${KPI_COLORS[k.tone]}`}>{money(k.calc(summary, persons))}{k.id !== 'count' && k.id !== 'projects' ? ' تومان' : ''}</b></div>; })}</div>}

    {/* مقایسه دوره‌ای */}
    {prefs?.compare && cmp && <div className="grid grid-cols-3 gap-2"><CompareCard label="درآمد" data={cmp.income} /><CompareCard label="هزینه" data={cmp.expense} invert /><CompareCard label="مانده" data={cmp.net} /></div>}

    {/* هشدارها */}
    {prefs?.alerts && alerts.length > 0 && <div className="space-y-2"><h3 className="text-xs font-bold flex items-center gap-1"><Bell size={13} className="text-[#3b38a0] dark:text-[#b2b0e8]" /> هشدارهای مالی هوشمند</h3>{alerts.slice(0, 4).map((a, i) => <AlertRow key={i} a={a} />)}</div>}

    {/* نمودارهای انتخابی */}
    {prefs?.charts.map(renderChart)}

    {/* CTA دستیار */}
    <div onClick={() => setTab('chat')} className="cursor-pointer rounded-3xl bg-gradient-to-r from-[#3b38a0] to-[#7a85c1] p-4 text-white flex items-center justify-between"><div><h3 className="text-sm font-bold">ثبت ۱۰ ثانیه‌ای؛ فقط بگو</h3><p className="mt-1 text-[11px] text-white/80">بنویس، وویس بفرست یا عکس رسید بده</p></div><Sparkles className="animate-pulse" /></div>

    {/* تراکنش‌های اخیر */}
    <div className="flex items-center justify-between"><h3 className="text-sm font-bold">تراکنش‌های اخیر</h3><button onClick={() => setShowForm(!showForm)} className="text-[11px] text-[#3b38a0] dark:text-[#b2b0e8] flex gap-1"><Plus size={14} /> افزودن دستی</button></div>
    {showForm && <QuickTxForm onDone={() => setShowForm(false)} />}
    <div className="space-y-2">{transactions.slice(txPage*8,(txPage+1)*8).map((t: any) => <TxRow key={t.id} tx={t} />)}{!transactions.length && <Empty text="هنوز تراکنشی ثبت نشده؛ از دستیار شروع کن." />}</div>
    <Pager page={txPage} pageCount={Math.ceil(transactions.length/8)} onChange={setTxPage} />

    {/* پنل مدیریت بودجه/اهداف/هشدار */}
    {manage && <div className="absolute inset-0 z-50 grid place-items-end bg-black/55 backdrop-blur-sm" onClick={() => setManage('')}>
      <div className="w-full max-h-[80%] overflow-y-auto no-scrollbar rounded-t-[28px] bg-white dark:bg-zinc-950 border-t border-black/10 dark:border-white/10 p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><b className="text-sm">{manage === 'budget' ? 'مدیریت بودجه‌ها' : manage === 'goal' ? 'مدیریت اهداف پس‌انداز' : 'هشدارهای سفارشی'}</b><button onClick={() => setManage('')} className="rounded-full bg-[#3b38a0] px-3 py-1.5 text-[11px] text-white">بستن</button></div>
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          <button onClick={() => setManage('budget')} className={`rounded-2xl py-2 text-[10px] font-bold ${manage === 'budget' ? 'bg-[#3b38a0] text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}>بودجه‌ها</button>
          <button onClick={() => setManage('goal')} className={`rounded-2xl py-2 text-[10px] font-bold ${manage === 'goal' ? 'bg-[#3b38a0] text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}>اهداف</button>
          <button onClick={() => setManage('alert')} className={`rounded-2xl py-2 text-[10px] font-bold ${manage === 'alert' ? 'bg-[#3b38a0] text-white' : 'bg-zinc-100 dark:bg-zinc-900'}`}>هشدارها</button>
        </div>
        {manage === 'budget' && <div className="space-y-3">
          <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2">
            <p className="text-[10px] font-bold">بودجهٔ ماهانهٔ جدید / به‌روزرسانی</p>
            <select className="input !text-[11px]" value={bgCat} onChange={e => setBgCat(e.target.value)}><option value="">کل هزینه‌ها</option>{allCats.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <AmountInput value={bgAmt} onChange={setBgAmt} placeholder="مبلغ (تومان)" className="!text-[11px]" />
            <button onClick={async () => { const amt = Number(bgAmt); if (!amt) return; await api('/budgets', { method: 'POST', body: JSON.stringify({ category: bgCat, amount: amt }) }); setBgAmt(''); reloadExtras(); }} className="w-full rounded-2xl bg-[#3b38a0] py-2.5 text-[11px] font-bold text-white">ذخیرهٔ بودجه</button>
          </div>
          {budgets.map(b => <div key={b.id} className="flex items-center justify-between rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-[11px]"><span>{b.category || 'کل هزینه‌ها'} — {money(b.amount)} <span className="text-zinc-500">({b.pct.toLocaleString('fa-IR')}٪ مصرف)</span></span><button onClick={async () => { await api(`/budgets/${b.id}`, { method: 'DELETE' }); reloadExtras(); }} className="text-red-500 text-[10px] font-bold">حذف</button></div>)}
          {!budgets.length && <p className="text-center text-[10px] text-zinc-500">بودجه‌ای ثبت نشده.</p>}
        </div>}
        {manage === 'goal' && <div className="space-y-3">
          <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2">
            <p className="text-[10px] font-bold">هدف جدید</p>
            <input className="input !text-[11px]" placeholder="نام هدف (مثلا: خرید ماشین)" value={glTitle} onChange={e => setGlTitle(e.target.value)} />
            <AmountInput value={glAmt} onChange={setGlAmt} placeholder="مبلغ هدف (تومان)" className="!text-[11px]" />
            <button onClick={async () => { const amt = Number(glAmt); if (!amt || !glTitle.trim()) return; await api('/goals', { method: 'POST', body: JSON.stringify({ title: glTitle.trim(), target: amt }) }); setGlTitle(''); setGlAmt(''); reloadExtras(); }} className="w-full rounded-2xl bg-[#3b38a0] py-2.5 text-[11px] font-bold text-white">ساخت هدف</button>
          </div>
          {goals.map(g => <div key={g.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-[11px]">
            <div className="flex items-center justify-between"><span>{g.done ? '✅' : '🎯'} {g.title} — {money(g.saved)} از {money(g.target)}</span><button onClick={async () => { await api(`/goals/${g.id}`, { method: 'DELETE' }); reloadExtras(); }} className="text-red-500 text-[10px] font-bold">حذف</button></div>
            <div className="mt-2 flex gap-2">{[500000, 1000000, 5000000].map(v => <button key={v} onClick={async () => { await api(`/goals/${g.id}/deposit`, { method: 'POST', body: JSON.stringify({ amount: v }) }); reloadExtras(); }} className="flex-1 rounded-xl bg-zinc-200 dark:bg-zinc-800 py-1.5 text-[9px] font-bold">+{money(v)}</button>)}</div>
          </div>)}
          {!goals.length && <p className="text-center text-[10px] text-zinc-500">هدفی ثبت نشده.</p>}
        </div>}
        {manage === 'alert' && <div className="space-y-3">
          <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2">
            <p className="text-[10px] font-bold">هشدار جدید</p>
            <select className="input !text-[11px]" value={alKind} onChange={e => setAlKind(e.target.value)}>
              <option value="categoryOver">هزینهٔ یک دسته از سقف بگذرد</option>
              <option value="expenseOver">کل هزینهٔ ماه از سقف بگذرد</option>
              <option value="balanceBelow">موجودی کل از حد کمتر شود</option>
            </select>
            {alKind === 'categoryOver' && <select className="input !text-[11px]" value={alCat} onChange={e => setAlCat(e.target.value)}><option value="">انتخاب دسته...</option>{allCats.map(c => <option key={c} value={c}>{c}</option>)}</select>}
            <AmountInput value={alAmt} onChange={setAlAmt} placeholder="مبلغ آستانه (تومان)" className="!text-[11px]" />
            <button onClick={async () => { const amt = Number(alAmt); if (!amt || (alKind === 'categoryOver' && !alCat)) return; await api('/custom-alerts', { method: 'POST', body: JSON.stringify({ kind: alKind, category: alCat, threshold: amt }) }); setAlAmt(''); reloadExtras(); }} className="w-full rounded-2xl bg-[#3b38a0] py-2.5 text-[11px] font-bold text-white">ثبت هشدار</button>
          </div>
          {customAlerts.map(a => <div key={a.id} className="flex items-center justify-between rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-[11px]">
            <span className={a.enabled === false ? 'opacity-50' : ''}>{a.kind === 'categoryOver' ? `«${a.category}» > ${money(a.threshold)}` : a.kind === 'expenseOver' ? `کل هزینه > ${money(a.threshold)}` : `موجودی < ${money(a.threshold)}`}</span>
            <span className="flex gap-2"><button onClick={async () => { await api(`/custom-alerts/${a.id}`, { method: 'PUT', body: JSON.stringify({ enabled: !(a.enabled !== false) }) }); reloadExtras(); }} className="text-[10px] font-bold text-zinc-500">{a.enabled !== false ? 'غیرفعال' : 'فعال'}</button><button onClick={async () => { await api(`/custom-alerts/${a.id}`, { method: 'DELETE' }); reloadExtras(); }} className="text-red-500 text-[10px] font-bold">حذف</button></span>
          </div>)}
          {!customAlerts.length && <p className="text-center text-[10px] text-zinc-500">هشداری ثبت نشده.</p>}
        </div>}
      </div>
    </div>}

    {/* پنل شخصی‌سازی */}
    {customize && prefs && <div className="absolute inset-0 z-50 grid place-items-end bg-black/55 backdrop-blur-sm" onClick={() => setCustomize(false)}>
      <div className="w-full max-h-[80%] overflow-y-auto no-scrollbar rounded-t-[28px] bg-white dark:bg-zinc-950 border-t border-black/10 dark:border-white/10 p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2"><GripVertical size={16} className="text-zinc-400" /><b className="text-sm">شخصی‌سازی داشبورد</b></div><button onClick={() => setCustomize(false)} className="rounded-full bg-[#3b38a0] px-3 py-1.5 text-[11px] text-white">تمام</button></div>
        <h4 className="text-[11px] font-bold text-zinc-500 mb-2">کارت‌های KPI</h4>
        <div className="grid grid-cols-2 gap-2 mb-4">{KPI_CATALOG.map(k => { const on = prefs.kpis.includes(k.id); return <button key={k.id} onClick={() => toggle('kpis', k.id)} className={`flex items-center justify-between rounded-2xl border p-3 text-[11px] text-right transition ${on ? 'border-[#3b38a0] bg-[#3b38a0]/10' : 'border-black/10 dark:border-white/10'}`}><span>{k.label}</span>{on && <Check size={14} className="text-[#3b38a0] dark:text-[#b2b0e8]" />}</button>; })}</div>
        <h4 className="text-[11px] font-bold text-zinc-500 mb-2">نمودارها</h4>
        <p className="text-[9px] text-zinc-400 mb-2">نمودارهای فعال (برای جابه‌جایی، آیکون ⠿ را بکش و رها کن):</p>
        <div className="grid grid-cols-1 gap-2 mb-3">{prefs.charts.map((cid, idx) => { const c = CHART_CATALOG.find(x => x.id === cid); if (!c) return null; const dragging = dragIdx === idx; const over = overIdx === idx && dragIdx !== null && dragIdx !== idx;
          return <div key={cid}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragEnter={() => setOverIdx(idx)}
            onDragOver={e => e.preventDefault()}
            onDragEnd={() => { if (dragIdx !== null && overIdx !== null) reorderCharts(dragIdx, overIdx); setDragIdx(null); setOverIdx(null); }}
            className={`flex items-center justify-between rounded-2xl border p-2.5 text-[11px] transition-all duration-200 ${dragging ? 'border-[#3b38a0] bg-[#3b38a0]/20 scale-[1.03] shadow-lg shadow-[#3b38a0]/20 opacity-80' : over ? 'border-[#7a85c1] bg-[#3b38a0]/10 translate-y-0.5' : 'border-[#3b38a0]/40 bg-[#3b38a0]/8'}`}>
            <span className="flex items-center gap-2"><GripVertical size={15} className="cursor-grab text-zinc-400 active:cursor-grabbing" />{c.label}</span>
            <button onClick={() => toggle('charts', cid)} className="op-btn-danger">حذف</button>
          </div>; })}</div>
        <p className="text-[9px] text-zinc-400 mb-2">افزودن نمودار:</p>
        <div className="grid grid-cols-1 gap-2 mb-4">{CHART_CATALOG.filter(c=>!prefs.charts.includes(c.id)).map(c => <button key={c.id} onClick={() => toggle('charts', c.id)} className="flex items-center justify-between rounded-2xl border border-black/10 dark:border-white/10 p-2.5 text-[11px] text-right"><span>{c.label}</span><Plus size={14} className="text-[#3b38a0] dark:text-[#b2b0e8]" /></button>)}{CHART_CATALOG.filter(c=>!prefs.charts.includes(c.id)).length===0 && <p className="text-[10px] text-zinc-400 text-center">همهٔ نمودارها فعال‌اند</p>}</div>
        <h4 className="text-[11px] font-bold text-zinc-500 mb-2">بخش‌های دیگر</h4>
        <div className="grid grid-cols-2 gap-2"><button onClick={() => savePrefs({ ...prefs, compare: !prefs.compare })} className={`flex items-center justify-between rounded-2xl border p-3 text-[11px] ${prefs.compare ? 'border-[#3b38a0] bg-[#3b38a0]/10' : 'border-black/10 dark:border-white/10'}`}><span>مقایسه دوره‌ای</span>{prefs.compare && <Check size={14} className="text-[#3b38a0]" />}</button><button onClick={() => savePrefs({ ...prefs, alerts: !prefs.alerts })} className={`flex items-center justify-between rounded-2xl border p-3 text-[11px] ${prefs.alerts ? 'border-[#3b38a0] bg-[#3b38a0]/10' : 'border-black/10 dark:border-white/10'}`}><span>هشدارهای مالی</span>{prefs.alerts && <Check size={14} className="text-[#3b38a0]" />}</button></div>
      </div>
    </div>}
  </div>;
}
