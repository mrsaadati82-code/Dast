import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Camera,
  Calendar,
  Check,
  CreditCard,
  LogOut,
  Mic,
  Moon,
  Plus,
  Send,
  Settings,
  Shield,
  Menu,
  X,
  Users,
  Wallet,
  BookOpen,
  History,
  ListChecks,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  TrendingUp,
  User,
  Zap
} from 'lucide-react';
import darkTypo from './assets/dark-theme-typo.png';
import lightTypo from './assets/light-theme-typo.png';
import logoMark from './assets/logo.png';

type Role = 'admin' | 'user';
type TxType = 'income' | 'expense';
type Tab = 'home' | 'chat' | 'analytics' | 'cheques' | 'sms' | 'admin' | 'persons' | 'accounts' | 'claims' | 'experts' | 'treasury' | 'history' | 'incomeExpense' | 'categories' | 'ledger' | 'training' | 'accounting' | 'journal' | 'trialBalance' | 'profitLoss' | 'cashFlow' | 'projects' | 'customers' | 'invoices' | 'advancedAI';
type Provider = 'local' | 'openai' | 'openrouter' | 'groq' | 'custom';

interface UserInfo { id: string; name: string; email: string; role: Role; createdAt: string; }
interface Transaction { id: string; title: string; amount: number; type: TxType; category: string; bank?: string; date: string; method: string; note?: string; createdAt: string; }
interface Cheque { id: string; title: string; amount: number; dueDate: string; type: 'payable' | 'receivable'; status: 'pending' | 'paid' | 'urgent'; reminderChannels?: string[]; }
interface SmsItem { id: string; sender: string; text: string; status: string; parsed: Partial<Transaction>; createdAt: string; }
interface Person { id: string; name: string; phone?: string; note?: string; balance: number; }
interface AiSettings { appName: string; aiProvider: Provider; aiBaseUrl: string; aiModel: string; aiToken: string; aiTokenSet?: boolean; temperature: number; systemPrompt: string; defaultCurrency: string; reminderDays: number[]; notificationChannels: string[]; }
interface AdminStats { users: UserInfo[]; counts: { users: number; transactions: number; cheques: number; sms: number }; totals: { income: number; expense: number }; byCat: Record<string, number>; }
interface Message { id: string; sender: 'user' | 'ai'; text: string; time: string; tx?: Partial<Transaction>; alternatives?: Person[]; txId?: string; }

const TOKEN_KEY = 'dastrast_token';
const todayFa = () => new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date());
const money = (n = 0) => Number(n || 0).toLocaleString('fa-IR');
const uid = () => Math.random().toString(36).slice(2);

function useApi(token: string) {
  async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`/api${url}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'خطای ارتباط با سرور');
    return data as T;
  }
  return api;
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || '');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [tab, setTab] = useState<Tab>('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [persons, setPersons] = useState<Person[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [smsInbox, setSmsInbox] = useState<SmsItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([{ id: uid(), sender: 'ai', text: 'سلام! من دست راست هستم. فقط بنویس، بگو یا عکس رسید بفرست تا تراکنش واقعی در حساب تو ثبت کنم.', time: 'اکنون' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const api = useApi(token);

  const totals = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    void boot();
  }, [token]);

  async function boot() {
    try {
      setLoading(true);
      const me = await api<{ user: UserInfo; settings: AiSettings }>('/me');
      setUser(me.user); setSettings(me.settings);
      const [tx, chq, sms, prs] = await Promise.all([
        api<Transaction[]>('/transactions'),
        api<Cheque[]>('/cheques'),
        api<SmsItem[]>('/sms'),
        api<Person[]>('/persons')
      ]);
      setTransactions(tx); setCheques(chq); setSmsInbox(sms); setPersons(prs);
    } catch {
      logout();
    } finally { setLoading(false); }
  }

  function saveToken(t: string) { localStorage.setItem(TOKEN_KEY, t); setToken(t); }
  function logout() { localStorage.removeItem(TOKEN_KEY); setToken(''); setUser(null); setTransactions([]); setCheques([]); }

  async function addTransaction(tx: Partial<Transaction>) {
    const created = await api<Transaction>('/transactions', { method: 'POST', body: JSON.stringify({ ...tx, date: tx.date || todayFa() }) });
    setTransactions(prev => [created, ...prev]);
    return created;
  }

  async function sendMessage(text = input) {
    if (!text.trim() || busy) return;
    setInput(''); setBusy(true); setTab('chat');
    const userMsg: Message = { id: uid(), sender: 'user', text, time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) };
    setMessages(prev => [...prev, userMsg]);
    try {
      const result = await api<any>('/assistant/command', { method: 'POST', body: JSON.stringify({ text }) });
      if (result.needsClarification) {
        setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: `${result.question}\n${result.candidates.map((p: Person, i: number) => `${i + 1}) ${p.name}`).join('\n')}`, time: 'اکنون' }]);
      } else {
        const tx = result.transaction as Transaction | undefined;
        const reply = result.message || (tx ? `ثبت شد ✅\n${tx.title}\nمبلغ: ${money(tx.amount)} تومان\nدسته‌بندی: ${tx.category}` : 'دستور پردازش شد.');
        setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: reply, time: 'اکنون', tx, alternatives: result.alternatives, txId: tx?.id }]);
        await boot();
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: e instanceof Error ? e.message : 'خطا رخ داد', time: 'اکنون' }]);
    } finally { setBusy(false); }
  }


  async function askAnalysis(question: string) {
    setBusy(true); setTab('analytics');
    try {
      const r = await api<{ answer: string }>('/ai/ask', { method: 'POST', body: JSON.stringify({ question }) });
      setMessages(prev => [...prev, { id: uid(), sender: 'user', text: question, time: 'اکنون' }, { id: uid(), sender: 'ai', text: r.answer, time: 'اکنون' }]);
      setNotice(r.answer);
    } finally { setBusy(false); }
  }

  async function scanReceipt(file: File) {
    setBusy(true); setTab('chat');
    const imageBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file);
    });
    try {
      const parsed = await api<Partial<Transaction> & { aiWarning?: string }>('/ai/parse-receipt', { method: 'POST', body: JSON.stringify({ imageBase64, text: file.name }) });
      if (!parsed.amount) parsed.amount = 0;
      let tx = Number(parsed.amount) > 0 ? await addTransaction({ ...parsed, method: 'Receipt OCR' }) : undefined;
      if (!tx) {
        const amountText = prompt('OCR محلی مبلغ را دقیق پیدا نکرد. مبلغ رسید را وارد کن (تومان):');
        if (amountText) {
          const title = prompt('عنوان رسید / فروشگاه:', parsed.title || 'رسید خرید') || 'رسید خرید';
          tx = await addTransaction({ title, amount: Number(amountText.replace(/,/g,'')), type: 'expense', category: parsed.category || 'سایر', method: 'Receipt Manual OCR' });
        }
      }
      setMessages(prev => [...prev,
        { id: uid(), sender: 'user', text: `📸 رسید «${file.name}» ارسال شد`, time: 'اکنون' },
        { id: uid(), sender: 'ai', text: tx ? `رسید ثبت شد ✅\n${tx.title} - ${money(tx.amount)} تومان` : 'رسید دریافت شد اما مبلغ استخراج نشد. برای OCR خودکار دقیق، مدل Vision را در پنل ادمین وصل کن.', time: 'اکنون', tx }
      ]);
    } finally { setBusy(false); }
  }

  async function handleSms(text: string) {
    const sms = await api<SmsItem>('/sms/parse', { method: 'POST', body: JSON.stringify({ text }) });
    setSmsInbox(prev => [sms, ...prev]);
    setNotice(`پیامک تحلیل شد: ${sms.parsed.title || 'تراکنش'} - ${money(Number(sms.parsed.amount || 0))} تومان`);
  }

  if (loading) return <Splash />;
  if (!user) return <AuthScreen saveToken={saveToken} />;

  return (
    <div dir="rtl" className="min-h-screen bg-zinc-100 text-zinc-950 dark:bg-[#050507] dark:text-[#f4f4f5] transition-colors">
      <div className="fixed inset-0 pointer-events-none overflow-hidden"><div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-[#3b38a0]/25 blur-3xl" /><div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-[#7a85c1]/20 blur-3xl" /></div>
      {notice && <Toast text={notice} onClose={() => setNotice(null)} />}
      <main className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white dark:bg-zinc-950 shadow-2xl sm:my-4 sm:h-[812px] sm:rounded-[34px] sm:border sm:border-white/10">
        <header className="shrink-0 z-20 bg-white/90 dark:bg-black/70 backdrop-blur-xl border-b border-black/5 dark:border-white/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><button onClick={() => setDrawerOpen(true)} className="icon-btn"><Menu size={17} /></button><div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#3b38a0] to-[#7a85c1] p-2 shadow-lg shadow-[#3b38a0]/20"><img src={logoMark} alt="دست راست" className="h-6 w-6 object-contain" /></div><div><img src={theme === 'dark' ? darkTypo : lightTypo} alt="دست راست" className="h-7 w-auto max-w-[120px] object-contain"/><p className="text-[10px] text-zinc-500">{user.name} • {todayFa()}</p></div></div>
            <div className="flex gap-2"><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="icon-btn">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button><button onClick={logout} className="icon-btn"><LogOut size={16} /></button></div>
          </div>
        </header>

        <section className={`min-h-0 flex-1 no-scrollbar ${tab === 'chat' ? 'overflow-hidden pb-0' : 'overflow-y-auto pb-24'}`}>
          {tab === 'home' && <HomeScreen totals={totals} transactions={transactions} cheques={cheques} persons={persons} setTab={setTab} addTransaction={addTransaction} />}
          {tab === 'chat' && <ChatScreen messages={messages} input={input} setInput={setInput} sendMessage={sendMessage} busy={busy} scanReceipt={scanReceipt} />}
          {tab === 'analytics' && <AnalyticsScreen transactions={transactions} askAnalysis={askAnalysis} busy={busy} />}
          {tab === 'cheques' && <ChequesScreen cheques={cheques} api={api} reload={boot} />}
          {tab === 'sms' && <SmsScreen smsInbox={smsInbox} handleSms={handleSms} addTransaction={addTransaction} />}
          {tab === 'persons' && <PersonsScreen api={api} persons={persons} reload={boot} />}
          {tab === 'experts' && <ExpertsScreen api={api} />}
          {tab === 'treasury' && <TreasuryScreen api={api} />}
          {tab === 'accounts' && <AccountsScreen api={api} />}
          {tab === 'claims' && <ClaimsScreen persons={persons} />}
          {tab === 'history' && <HistoryScreen transactions={transactions} />}
          {tab === 'incomeExpense' && <IncomeExpenseScreen transactions={transactions} />}
          {tab === 'categories' && <CategoriesScreen api={api} />}
          {tab === 'ledger' && <LedgerScreen persons={persons} transactions={transactions} />}
          {tab === 'training' && <TrainingScreen api={api} />}
          {tab === 'accounting' && <AccountingScreen api={api} />}
          {tab === 'journal' && <JournalScreen api={api} />}
          {tab === 'trialBalance' && <TrialBalanceScreen api={api} />}
          {tab === 'profitLoss' && <ProfitLossScreen api={api} />}
          {tab === 'cashFlow' && <CashFlowScreen api={api} />}
          {tab === 'projects' && <ProjectsScreen api={api} />}
          {tab === 'customers' && <CustomersScreen api={api} />}
          {tab === 'invoices' && <InvoicesScreen api={api} />}
          {tab === 'advancedAI' && <AdvancedAIScreen api={api} />}
          {tab === 'admin' && user.role === 'admin' && settings && <AdminPanel api={api} settings={settings} setSettings={setSettings} />}
        </section>

        <nav className="shrink-0 z-30 flex items-center justify-around border-t border-black/10 dark:border-white/10 bg-white/95 dark:bg-black/95 backdrop-blur-xl px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <TabButton icon={<Smartphone size={20} />} label="خانه" active={tab === 'home'} onClick={() => setTab('home')} />
          <TabButton icon={<Sparkles size={20} />} label="دستیار" active={tab === 'chat'} onClick={() => setTab('chat')} />
          <TabButton icon={<TrendingUp size={20} />} label="گزارش" active={tab === 'analytics'} onClick={() => setTab('analytics')} />
          <TabButton icon={<Calendar size={20} />} label="چک" active={tab === 'cheques'} onClick={() => setTab('cheques')} />
          <TabButton icon={<Users size={20} />} label="اشخاص" active={tab === 'persons'} onClick={() => setTab('persons')} />
          </nav>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} setTab={(t) => { setTab(t); setDrawerOpen(false); }} isAdmin={user.role === 'admin'} />
      </main>
    </div>
  );
}

function Splash() { return <div className="grid min-h-screen place-items-center bg-zinc-950 text-[#b2b0e8]"><Sparkles className="animate-pulse" /><p className="mt-3 text-xs">در حال بارگذاری دست راست...</p></div>; }

function AuthScreen({ saveToken }: { saveToken: (t: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('علی عزیز');
  const [email, setEmail] = useState('admin@dastrast.local');
  const [password, setPassword] = useState('Admin12345');
  const [error, setError] = useState('');
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      saveToken(data.token);
    } catch (err) { setError(err instanceof Error ? err.message : 'خطا'); }
  }
  return (
    <div dir="rtl" className="min-h-screen bg-[#050507] text-white grid place-items-center p-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[32px] border border-white/10 bg-zinc-950/90 p-6 shadow-2xl space-y-4">
        <div className="text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-[#3b38a0] to-[#7a85c1] text-xl font-black">د</div><h1 className="mt-3 text-xl font-black">دستِ راست</h1><p className="text-xs text-zinc-500">ورود به دستیار مالی هوشمند</p></div>
        <div className="grid grid-cols-2 rounded-2xl bg-zinc-900 p-1 text-xs"><button type="button" onClick={() => setMode('login')} className={`rounded-xl py-2 ${mode === 'login' ? 'bg-[#3b38a0]' : 'text-zinc-400'}`}>ورود</button><button type="button" onClick={() => setMode('register')} className={`rounded-xl py-2 ${mode === 'register' ? 'bg-[#3b38a0]' : 'text-zinc-400'}`}>ثبت‌نام</button></div>
        {mode === 'register' && <Field label="نام" value={name} onChange={setName} />}
        <Field label="ایمیل" value={email} onChange={setEmail} type="email" />
        <Field label="رمز عبور" value={password} onChange={setPassword} type="password" />
        {error && <p className="rounded-xl bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}
        <button className="w-full rounded-2xl bg-gradient-to-r from-[#3b38a0] to-[#7a85c1] py-3 text-sm font-bold">{mode === 'login' ? 'ورود' : 'ساخت حساب'}</button>
        <p className="text-[10px] leading-5 text-zinc-500">حساب پیش‌فرض ادمین: admin@dastrast.local / Admin12345</p>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', textarea = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; textarea?: boolean }) {
  return <label className="block text-xs text-zinc-500"><span className="mb-1 block">{label}</span>{textarea ? <textarea rows={4} value={value} onChange={e => onChange(e.target.value)} className="input" /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} className="input" />}</label>;
}

function TabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`flex min-w-10 flex-col items-center gap-0.5 text-[9px] ${active ? 'text-[#3b38a0] dark:text-[#b2b0e8]' : 'text-zinc-500'}`}>{icon}<span>{label}</span></button>;
}

function HomeScreen({ totals, transactions, cheques, persons, setTab, addTransaction }: { totals: { income: number; expense: number; balance: number }; transactions: Transaction[]; cheques: Cheque[]; persons: Person[]; setTab: (t: Tab) => void; addTransaction: (tx: Partial<Transaction>) => Promise<Transaction>; }) {
  const [showForm, setShowForm] = useState(false);
  return <div className="p-4 space-y-4">
    <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-black p-4 text-white border border-white/10 overflow-hidden relative"><div className="absolute -left-8 -top-8 h-24 w-24 rounded-full bg-[#3b38a0]/40 blur-2xl" /><span className="text-[10px] text-zinc-400">داشبورد مالی</span><div className="mt-1 text-2xl font-black">{money(totals.balance)} <span className="text-xs text-zinc-400">تومان</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-3"><Stat label="درآمد کل" value={totals.income} good /><Stat label="مخارج" value={totals.expense} /></div></div>
    <div className="grid grid-cols-2 gap-2"><ReportCard label="مطالبات" value={persons.filter(p=>p.balance>0).reduce((s,p)=>s+p.balance,0)} tone="green"/><ReportCard label="بدهی اشخاص" value={Math.abs(persons.filter(p=>p.balance<0).reduce((s,p)=>s+p.balance,0))} tone="red"/><ReportCard label="سود ناخالص" value={totals.income-totals.expense} tone="purple"/><ReportCard label="پروژه‌های بدهکار" value={persons.filter(p=>p.balance>0).length} tone="gray"/></div>
    <div onClick={() => setTab('chat')} className="cursor-pointer rounded-3xl bg-gradient-to-r from-[#3b38a0] to-[#7a85c1] p-4 text-white flex items-center justify-between"><div><h3 className="text-sm font-bold">ثبت ۱۰ ثانیه‌ای؛ فقط بگو</h3><p className="mt-1 text-[11px] text-white/80">بنویس، وویس بفرست یا عکس رسید بده</p></div><Sparkles className="animate-pulse" /></div>
    <div className="rounded-2xl bg-[#3b38a0]/10 border border-[#3b38a0]/20 p-3"><span className="text-[10px] font-bold text-[#7a85c1] dark:text-[#b2b0e8]">سخن روز از سنکا</span><p className="mt-1 text-[10px] leading-5 text-zinc-600 dark:text-zinc-300">«این گونه نیست که ما زمان اندکی برای زندگی داشته باشیم، بلکه بسیاری از زمان‌ها را هدر می‌دهیم.»</p></div>
    {cheques.some(c => c.status === 'urgent') && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex gap-2"><AlertCircle size={16} /> سررسید یک چک نزدیک است.</div>}
    <div className="flex items-center justify-between"><h3 className="text-sm font-bold">تراکنش‌های اخیر</h3><button onClick={() => setShowForm(!showForm)} className="text-[11px] text-[#3b38a0] dark:text-[#b2b0e8] flex gap-1"><Plus size={14} /> افزودن دستی</button></div>
    {showForm && <QuickTxForm addTransaction={addTransaction} onDone={() => setShowForm(false)} />}
    <div className="space-y-2">{transactions.slice(0, 8).map(t => <TxRow key={t.id} tx={t} />)}{!transactions.length && <Empty text="هنوز تراکنشی ثبت نشده؛ از دستیار شروع کن." />}</div>
  </div>;
}

function Stat({ label, value, good = false }: { label: string; value: number; good?: boolean }) { return <div><div className={`flex gap-1 text-[10px] ${good ? 'text-emerald-400' : 'text-red-400'}`}>{good ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{label}</div><b className="text-xs">{money(value)} تومان</b></div>; }
function TxRow({ tx }: { tx: Transaction }) { return <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900/70 border border-black/5 dark:border-white/5 p-3 flex items-center justify-between"><div className="flex gap-2"><div className={`grid h-9 w-9 place-items-center rounded-xl ${tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{tx.type === 'income' ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</div><div><h4 className="text-xs font-bold">{tx.title}</h4><p className="mt-0.5 text-[9px] text-zinc-500">{tx.category} • {tx.method}</p></div></div><div className="text-left"><b className={`text-[11px] ${tx.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>{tx.type === 'income' ? '+' : '-'}{money(tx.amount)}</b><p className="text-[9px] text-zinc-500">{tx.date}</p></div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500">{text}</div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="absolute inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl dark:bg-zinc-950 border border-black/10 dark:border-white/10"><div className="mb-4 flex items-center justify-between"><b className="text-sm">{title}</b><button onClick={onClose} className="icon-btn"><X size={15}/></button></div>{children}</div></div>; }

function QuickTxForm({ addTransaction, onDone }: { addTransaction: (tx: Partial<Transaction>) => Promise<Transaction>; onDone: () => void }) {
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [type, setType] = useState<TxType>('expense');
  async function submit(e: React.FormEvent) { e.preventDefault(); await addTransaction({ title, amount: Number(amount), type, category: type === 'income' ? 'حقوق و درآمد' : 'سایر', method: 'Manual' }); onDone(); }
  return <form onSubmit={submit} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" placeholder="عنوان" value={title} onChange={e=>setTitle(e.target.value)} required /><input className="input" placeholder="مبلغ تومان" value={amount} onChange={e=>setAmount(e.target.value)} required /><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setType('expense')} className={`pill ${type==='expense'?'active-red':''}`}>هزینه</button><button type="button" onClick={()=>setType('income')} className={`pill ${type==='income'?'active-green':''}`}>درآمد</button></div><button className="primary-btn">ثبت</button></form>;
}

function ChatScreen({ messages, input, setInput, sendMessage, busy, scanReceipt }: { messages: Message[]; input: string; setInput: (v: string) => void; sendMessage: (t?: string) => void; busy: boolean; scanReceipt: (f: File) => void; }) {
  const end = useRef<HTMLDivElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const [recording,setRecording]=useState(false); const [voiceText,setVoiceText]=useState(''); const [timer,setTimer]=useState(0);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(()=>{ if(!recording) return; const t=setInterval(()=>setTimer(x=>x+1),1000); return()=>clearInterval(t); },[recording]);
  function startVoice() {
    setRecording(true); setTimer(0); setVoiceText('');
    const w = window as unknown as { webkitSpeechRecognition?: new () => { lang: string; continuous: boolean; start: () => void; stop: () => void; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onend:()=>void; } };
    if (w.webkitSpeechRecognition) {
      const rec = new w.webkitSpeechRecognition(); rec.lang = 'fa-IR'; rec.continuous = true;
      rec.onresult = e => setVoiceText(e.results[0][0].transcript);
      rec.onend = () => {};
      try { rec.start(); } catch {}
    }
  }
  function sendVoice(){ const t=voiceText || 'امروز ۱۵۰ هزار تومن برای ناهار رستوران خرج کردم'; setRecording(false); sendMessage(t); }
  async function reassign(txId: string, p: Person){
    await fetch(`/api/transactions/${txId}`, { method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem(TOKEN_KEY)||''}`}, body: JSON.stringify({ personId:p.id, party:p.name }) });
    alert(`به ${p.name} اصلاح شد`);
  }
  return <div className="flex h-full min-h-0 flex-col relative">
    {recording && <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 backdrop-blur-xl p-5"><div className="w-full max-w-xs rounded-[32px] bg-zinc-950 border border-white/10 p-6 text-center text-white shadow-2xl"><div className="mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full bg-red-500/15 border border-red-500/40 animate-pulse"><Mic className="text-red-400" size={42}/></div><h3 className="font-black">در حال ضبط صدا</h3><p className="mt-2 text-xs text-zinc-400">{timer.toLocaleString('fa-IR')} ثانیه</p><div className="my-5 flex items-end justify-center gap-1 h-12">{[1,2,3,4,5,6,7].map(i=><span key={i} className="w-1.5 rounded-full bg-red-400 animate-pulse" style={{height:`${12+(i%4)*8}px`, animationDelay:`${i*80}ms`}} />)}</div><p className="min-h-10 rounded-2xl bg-white/5 p-3 text-xs leading-5">{voiceText || 'صحبت کنید...'}</p><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={()=>setRecording(false)} className="rounded-2xl bg-zinc-800 py-3 text-xs font-bold">انصراف</button><button onClick={sendVoice} className="rounded-2xl bg-gradient-to-r from-[#3b38a0] to-[#7a85c1] py-3 text-xs font-bold">ارسال</button></div></div></div>}
    <div className="flex-1 overflow-y-auto no-scrollbar p-4"><div className="flex min-h-full flex-col justify-end gap-3">{messages.map(m => <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[86%] rounded-2xl p-3 text-xs leading-6 whitespace-pre-line ${m.sender === 'user' ? 'bg-zinc-100 dark:bg-zinc-900 rounded-tr-none' : 'bg-[#3b38a0]/15 text-[#3b38a0] dark:text-[#b2b0e8] border border-[#3b38a0]/20 rounded-tl-none'}`}>{m.text}{m.tx && <div className="mt-2 rounded-xl bg-white/40 dark:bg-white/5 p-2 flex justify-between"><span>{m.tx.category}</span><b>{money(Number(m.tx.amount || 0))}</b></div>}{m.alternatives?.length ? <div className="mt-2 flex flex-wrap gap-1">{m.alternatives.map(p=><button key={p.id} onClick={()=>m.txId&&reassign(m.txId,p)} className="rounded-full bg-white/70 dark:bg-zinc-950 px-2 py-1 text-[10px] border border-[#3b38a0]/20">{p.name}</button>)}</div> : null}<span className="mt-1 block text-[8px] opacity-50">{m.time}</span></div></div>)}{busy && <div className="text-center text-xs text-zinc-500">دست راست در حال فکر کردن...</div>}<div ref={end} /></div></div>
    <div className="shrink-0 border-t border-black/5 bg-white/95 p-3 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95"><div className="mb-2 flex gap-1.5 overflow-x-auto no-scrollbar">{['۳۰ تومن پول تاکسی رو دادم','۱۲۰ هزار برای خرید سوپرمارکت','واریز حقوق ۲۲ میلیون تومان'].map(s=><button key={s} onClick={()=>sendMessage(s)} className="shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-900 px-3 py-1.5 text-[10px]">{s}</button>)}</div><div className="flex gap-2"><button onClick={startVoice} className="icon-btn text-red-500"><Mic size={18}/></button><button onClick={()=>fileRef.current?.click()} className="icon-btn text-[#3b38a0]"><Camera size={18}/></button><input ref={fileRef} hidden type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) void scanReceipt(f)}}/><div className="relative flex-1"><input className="input !rounded-full pl-10" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter') sendMessage()}} placeholder="مثلا: ۵۰ تومن به علی دادم..."/><button onClick={()=>sendMessage()} className="absolute left-1 top-1 rounded-full bg-[#3b38a0] p-2 text-white"><Send size={14} className="rotate-180"/></button></div></div></div>
  </div>;
}

function AnalyticsScreen({ transactions, askAnalysis, busy }: { transactions: Transaction[]; askAnalysis: (q: string) => void; busy: boolean }) {
  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    const byCat: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    transactions.forEach(t => {
      byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount);
      byMethod[t.method] = (byMethod[t.method] || 0) + 1;
    });
    const expenseCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const biggest = [...transactions].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
    const receivable = transactions.filter(t => /بستانکار|طلب/.test(t.category)).reduce((s, t) => s + Number(t.amount), 0);
    const payable = transactions.filter(t => /بدهکار|بدهی/.test(t.category)).reduce((s, t) => s + Number(t.amount), 0);
    const avgExpense = transactions.filter(t => t.type === 'expense').length ? Math.round(expense / transactions.filter(t => t.type === 'expense').length) : 0;
    return { income, expense, balance: income - expense, expenseCats, biggest, receivable, payable, avgExpense, byMethod };
  }, [transactions]);
  const catTotal = stats.expenseCats.reduce((s, [, v]) => s + v, 0) || 1;
  const questions = [
    'این ماه چقدر برای رستوران خرج کردم؟',
    'بزرگترین هزینه این ماه من چی بوده؟',
    'جمع بدهکاری و طلب‌های من چقدره؟',
    'کجاها بیشتر پول خرج کردم؟',
    'وضعیت مالی من رو خلاصه و پیشنهاد بده'
  ];
  return <div className="p-4 space-y-4">
    <div><h2 className="text-sm font-bold">گزارش‌های تحلیلی کامل</h2><p className="mt-1 text-[10px] text-zinc-500">تحلیل درآمد، هزینه، بدهکار/بستانکار و رفتار خرج‌کردن</p></div>
    <div className="grid grid-cols-2 gap-2">
      <ReportCard label="درآمد" value={stats.income} tone="green" />
      <ReportCard label="هزینه" value={stats.expense} tone="red" />
      <ReportCard label="مانده" value={stats.balance} tone="purple" />
      <ReportCard label="میانگین هزینه" value={stats.avgExpense} tone="gray" />
      <ReportCard label="طلب/بستانکار" value={stats.receivable} tone="green" />
      <ReportCard label="بدهی/بدهکار" value={stats.payable} tone="red" />
    </div>
    {stats.biggest && <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 border border-black/5 dark:border-white/5"><h3 className="text-xs font-bold mb-2">بزرگ‌ترین تراکنش</h3><TxRow tx={stats.biggest} /></div>}
    <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 space-y-3">
      <h3 className="text-xs font-bold">دسته‌بندی تراکنش‌ها</h3>
      {stats.expenseCats.map(([c, v]) => <div key={c}>
        <div className="flex justify-between text-[10px]"><span>{c}</span><b>{money(v)} تومان</b></div>
        <div className="mt-1 h-2 rounded-full bg-zinc-200 dark:bg-zinc-800"><div className="h-2 rounded-full bg-gradient-to-r from-[#3b38a0] to-[#7a85c1]" style={{ width: `${Math.max(4, Math.round(v / catTotal * 100))}%` }} /></div>
      </div>)}
      {!stats.expenseCats.length && <Empty text="برای گزارش، ابتدا تراکنش ثبت کن." />}
    </div>
    <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4">
      <h3 className="text-xs font-bold mb-3">روش ثبت</h3>
      <div className="grid grid-cols-2 gap-2">{Object.entries(stats.byMethod).map(([m, c]) => <div key={m} className="rounded-2xl bg-white dark:bg-zinc-950 p-3"><span className="text-[10px] text-zinc-500">{m}</span><b className="block text-lg">{money(c)}</b></div>)}</div>
    </div>
    <div className="rounded-3xl border border-[#3b38a0]/20 bg-[#3b38a0]/10 p-4 space-y-2"><h3 className="text-xs font-bold text-[#3b38a0] dark:text-[#b2b0e8]">از مشاور مالی بپرس</h3>{questions.map(q=><button disabled={busy} key={q} onClick={()=>askAnalysis(q)} className="w-full rounded-2xl bg-white/70 dark:bg-zinc-950 p-3 text-right text-[11px] disabled:opacity-60">{q}</button>)}</div>
  </div>;
}

function ReportCard({ label, value, tone }: { label: string; value: number; tone: 'green' | 'red' | 'purple' | 'gray' }) {
  const colors = { green: 'text-emerald-500', red: 'text-red-500', purple: 'text-[#3b38a0] dark:text-[#b2b0e8]', gray: 'text-zinc-700 dark:text-zinc-200' };
  return <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 border border-black/5 dark:border-white/5"><span className="text-[10px] text-zinc-500">{label}</span><b className={`mt-1 block text-sm ${colors[tone]}`}>{money(value)} تومان</b></div>;
}

function ChequesScreen({ cheques, api, reload }: { cheques: Cheque[]; api: <T>(u: string, o?: RequestInit) => Promise<T>; reload: () => Promise<void>; }) {
  const [title,setTitle]=useState(''); const [amount,setAmount]=useState(''); const [dueDate,setDueDate]=useState('۱۴۰۵/۰۳/۰۱');
  async function add(e: React.FormEvent){e.preventDefault(); await api('/cheques',{method:'POST',body:JSON.stringify({title,amount:Number(amount),dueDate,type:'payable'})}); setTitle(''); setAmount(''); await reload();}
  async function del(id:string){await api(`/cheques/${id}`,{method:'DELETE'}); await reload();}
  return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">یادآوری هوشمند چک‌ها و پرداخت‌های دوره‌ای</h2><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" placeholder="عنوان چک" value={title} onChange={e=>setTitle(e.target.value)} required/><input className="input" placeholder="مبلغ" value={amount} onChange={e=>setAmount(e.target.value)} required/><input className="input" placeholder="تاریخ شمسی" value={dueDate} onChange={e=>setDueDate(e.target.value)}/><button className="primary-btn">ثبت چک</button></form><div className="space-y-2">{cheques.map(c=><div key={c.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 border border-black/5 dark:border-white/5"><div className="flex justify-between"><b className="text-xs">{c.title}</b><button onClick={()=>del(c.id)} className="text-red-500"><Trash2 size={15}/></button></div><div className="mt-2 flex justify-between text-[10px] text-zinc-500"><span>{money(c.amount)} تومان</span><span>{c.dueDate}</span></div><div className="mt-2 flex gap-1 text-[9px]"><span className="badge">پیامک</span><span className="badge">نوتیفیکیشن</span><span className="badge">تلگرام</span></div></div>)}{!cheques.length && <Empty text="چک یا تعهدی ثبت نشده است." />}</div></div>;
}

function SmsScreen({ smsInbox, handleSms, addTransaction }: { smsInbox: SmsItem[]; handleSms: (t: string) => Promise<void>; addTransaction: (tx: Partial<Transaction>) => Promise<Transaction>; }) {
  const [text,setText]=useState('برداشت مبلغ ۲۵۰,۰۰۰ ریال از بانک پاسارگاد بابت خرید کتاب فروشی');
  return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">ثبت خودکار پیامک تراکنش‌های بانکی</h2><div className="rounded-3xl border border-[#3b38a0]/20 bg-[#3b38a0]/10 p-4"><p className="text-[10px] leading-5">در وب، خواندن مستقیم SMS به دلیل محدودیت سیستم‌عامل ممکن نیست؛ اما همین API برای اتصال اپ اندروید یا سرویس پیامکی آماده است. اینجا متن پیامک را تست می‌کنی.</p></div><textarea className="input" rows={4} value={text} onChange={e=>setText(e.target.value)}/><button onClick={()=>handleSms(text)} className="primary-btn">آنالیز پیامک</button><div className="space-y-2">{smsInbox.map(s=><div key={s.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs"><div className="flex justify-between"><b>{s.sender}</b><span className="badge">{s.status}</span></div><p className="mt-2 text-[10px] text-zinc-500 leading-5">{s.text}</p>{s.parsed?.amount ? <button onClick={()=>addTransaction({...s.parsed, method:'SMS Auto'})} className="mt-2 rounded-xl bg-[#3b38a0] px-3 py-2 text-[10px] text-white"><Check size={12} className="inline"/> ثبت تراکنش</button> : null}</div>)}</div></div>;
}


function Drawer({ open, onClose, setTab, isAdmin }: { open: boolean; onClose: () => void; setTab: (t: Tab) => void; isAdmin: boolean }) {
  const [openGroup, setOpenGroup] = useState<string>('main');
  const groups: { id: string; title: string; icon: React.ReactNode; items: { tab: Tab; label: string; icon: React.ReactNode }[] }[] = [
    { id: 'main', title: 'عملیات روزانه', icon: <Smartphone size={17}/>, items: [
      { tab: 'persons', label: 'اشخاص و بدهکار/بستانکار', icon: <Users size={16}/> },
      { tab: 'claims', label: 'مطالبات مشتریان', icon: <ListChecks size={16}/> },
      { tab: 'incomeExpense', label: 'درآمدها و هزینه‌ها', icon: <TrendingUp size={16}/> },
      { tab: 'history', label: 'تاریخچه', icon: <History size={16}/> },
    ]},
    { id: 'treasury', title: 'خزانه و حساب‌ها', icon: <Wallet size={17}/>, items: [
      { tab: 'treasury', label: 'خزانه داری', icon: <Wallet size={16}/> },
      { tab: 'accounts', label: 'صندوق‌ها و حساب‌ها', icon: <CreditCard size={16}/> },
      { tab: 'ledger', label: 'گردش حساب', icon: <BookOpen size={16}/> },
    ]},
    { id: 'accounting', title: 'حسابداری حرفه‌ای', icon: <BookOpen size={17}/>, items: [
      { tab: 'accounting', label: 'دفتر کل و سرفصل‌ها', icon: <BookOpen size={16}/> },
      { tab: 'journal', label: 'اسناد دوطرفه', icon: <ListChecks size={16}/> },
      { tab: 'trialBalance', label: 'تراز آزمایشی', icon: <TrendingUp size={16}/> },
      { tab: 'profitLoss', label: 'صورت سود و زیان', icon: <TrendingUp size={16}/> },
      { tab: 'cashFlow', label: 'جریان نقدی', icon: <Wallet size={16}/> },
      { tab: 'categories', label: 'دسته‌بندی‌ها', icon: <CreditCard size={16}/> },
    ]},
    { id: 'projects', title: 'پروژه و مشتری', icon: <Users size={17}/>, items: [
      { tab: 'customers', label: 'مشتریان', icon: <Users size={16}/> },
      { tab: 'projects', label: 'پروژه‌ها و مراحل', icon: <ListChecks size={16}/> },
      { tab: 'invoices', label: 'فاکتور / پیش‌فاکتور', icon: <CreditCard size={16}/> },
      { tab: 'experts', label: 'تسویه کارشناسان', icon: <User size={16}/> },
    ]},
    { id: 'ai', title: 'دستیار و تنظیمات', icon: <Sparkles size={17}/>, items: [
      { tab: 'training', label: 'آموزش دستیار', icon: <Sparkles size={16}/> },
      { tab: 'advancedAI', label: 'هوش مصنوعی پیشرفته و قوانین', icon: <Sparkles size={16}/> },
      { tab: 'sms', label: 'اتصال پیامک', icon: <CreditCard size={16}/> },
      ...(isAdmin ? [{ tab: 'admin' as Tab, label: 'پنل ادمین', icon: <Shield size={16}/> }] : []),
    ]},
  ];
  return <div className={`absolute inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
    <div onClick={onClose} className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} />
    <aside className={`absolute right-0 top-0 h-full w-80 max-w-[86%] overflow-y-auto bg-white dark:bg-zinc-950 border-l border-black/10 dark:border-white/10 p-4 transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="mb-5 flex items-center justify-between"><div><b>منوی دست راست</b><p className="text-[10px] text-zinc-500 mt-1">بخش‌ها دسته‌بندی شده‌اند</p></div><button onClick={onClose} className="icon-btn"><X size={16}/></button></div>
      <div className="space-y-2">{groups.map(g => <div key={g.id} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
        <button onClick={() => setOpenGroup(openGroup === g.id ? '' : g.id)} className="flex w-full items-center justify-between p-3 text-xs font-black"><span className="flex items-center gap-2">{g.icon}{g.title}</span><span className={`transition-transform ${openGroup === g.id ? 'rotate-180' : ''}`}>⌄</span></button>
        {openGroup === g.id && <div className="space-y-1 border-t border-black/5 dark:border-white/5 p-2">{g.items.map(i => <button key={i.tab} onClick={() => setTab(i.tab)} className="flex w-full items-center gap-2 rounded-2xl bg-white/70 p-3 text-right text-[11px] font-bold hover:bg-[#3b38a0]/10 dark:bg-zinc-950/70">{i.icon}<span>{i.label}</span></button>)}</div>}
      </div>)}</div>
    </aside>
  </div>;
}


function PersonsScreen({ api, persons, reload }: { api: <T>(u: string, o?: RequestInit) => Promise<T>; persons: Person[]; reload: () => Promise<void>; }) {
  const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [name, setName] = useState(''); const [phone,setPhone]=useState(''); const [selected, setSelected] = useState<Person | null>(null); const [ledger, setLedger] = useState<Transaction[]>([]);
  const list=persons.filter(p=>p.name.includes(q));
  async function add(e: React.FormEvent){ e.preventDefault(); await api('/persons',{method:'POST',body:JSON.stringify({name,phone})}); setName(''); setPhone(''); setShow(false); await reload(); }
  async function open(p: Person){ setSelected(p); setLedger(await api<Transaction[]>(`/persons/${p.id}/ledger`)); }
  async function edit(p: Person){ const name=prompt('نام شخص',p.name); if(!name) return; await api(`/persons/${p.id}`,{method:'PUT',body:JSON.stringify({name})}); await reload(); }
  async function del(p: Person){ if(confirm(`حذف ${p.name}؟`)){ await api(`/persons/${p.id}`,{method:'DELETE'}); await reload(); } }
  return <div className="p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">اشخاص و بدهکار/بستانکار</h2><button onClick={()=>setShow(true)} className="rounded-2xl bg-[#3b38a0] px-3 py-2 text-xs text-white">افزودن</button></div><input className="input" placeholder="جستجوی شخص..." value={q} onChange={e=>setQ(e.target.value)} />{show&&<Modal title="افزودن شخص" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><input className="input" placeholder="نام و نام خانوادگی" value={name} onChange={e=>setName(e.target.value)} required/><input className="input" placeholder="شماره تماس / توضیح" value={phone} onChange={e=>setPhone(e.target.value)}/><button className="primary-btn">ذخیره</button></form></Modal>}{selected ? <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4"><button onClick={()=>setSelected(null)} className="text-[10px] text-[#3b38a0] mb-3">بازگشت</button><h3 className="font-bold text-sm">حساب و کتاب با {selected.name}</h3><p className={`mt-1 text-xs ${selected.balance>=0?'text-emerald-500':'text-red-500'}`}>مانده: {money(Math.abs(selected.balance))} تومان {selected.balance>=0?'طلب شما':'بدهی شما'}</p><div className="mt-3 space-y-2">{ledger.map(t=><TxRow key={t.id} tx={t}/>)}{!ledger.length&&<Empty text="تاریخچه‌ای با این شخص نیست."/>}</div></div> : <div className="space-y-2">{list.map(p=><div key={p.id} className="w-full rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><button onClick={()=>open(p)} className="w-full flex justify-between text-right"><span className="text-xs font-bold">{p.name}</span><span className={`text-[11px] ${p.balance>=0?'text-emerald-500':'text-red-500'}`}>{money(Math.abs(p.balance))} {p.balance>=0?'طلب':'بدهی'}</span></button><div className="mt-2 flex gap-3 text-[10px]"><button onClick={()=>edit(p)} className="text-[#3b38a0]">ویرایش</button><button onClick={()=>del(p)} className="text-red-500">حذف</button></div></div>)}{!list.length&&<Empty text="شخصی پیدا نشد."/>}</div>}</div>;
}
function AccountsScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [items,setItems]=useState<any[]>([]); const [title,setTitle]=useState(''); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [balance,setBalance]=useState('');
  async function load(){ setItems(await api<any[]>('/accounts')); }
  useEffect(()=>{void load()},[]);
  async function add(e:React.FormEvent){e.preventDefault(); await api<any>('/accounts',{method:'POST',body:JSON.stringify({title,balance:Number(balance||0)})}); setTitle(''); setBalance(''); setShow(false); await load();}
  async function edit(a:any){ const title=prompt('نام حساب',a.title); if(!title) return; await api(`/accounts/${a.id}`,{method:'PUT',body:JSON.stringify({title})}); await load(); }
  async function del(a:any){ if(confirm(`حذف ${a.title}؟`)){ await api(`/accounts/${a.id}`,{method:'DELETE'}); await load(); } }
  const list=items.filter(a=>a.title.includes(q));
  return <div className="p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">حساب‌ها</h2><button onClick={()=>setShow(true)} className="rounded-2xl bg-[#3b38a0] px-3 py-2 text-xs text-white">افزودن</button></div><input className="input" placeholder="جستجوی حساب..." value={q} onChange={e=>setQ(e.target.value)}/>{show&&<Modal title="افزودن حساب" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><input className="input" placeholder="نام حساب / صندوق" value={title} onChange={e=>setTitle(e.target.value)} required/><input className="input" placeholder="مانده اولیه" value={balance} onChange={e=>setBalance(e.target.value)}/><button className="primary-btn">ذخیره</button></form></Modal>}{list.map(a=><div key={a.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{a.title}</b><div className="flex gap-2"><button onClick={()=>edit(a)} className="text-[10px] text-[#3b38a0]">ویرایش</button><button onClick={()=>del(a)} className="text-[10px] text-red-500">حذف</button></div></div><p className="text-[10px] text-zinc-500">مانده: {money(a.balance||0)}</p></div>)}</div> }
function ClaimsScreen({ persons }: { persons: Person[] }) {
  const [q, setQ] = useState('');
  const filtered = persons.filter(p => p.balance > 0 && p.name.includes(q));
  return <div className="p-4 space-y-4"><div><h2 className="text-sm font-bold">مطالبات مشتریان</h2><p className="text-[10px] text-zinc-500 mt-1">لیست بدهکاران، مانده هر مشتری و جستجوی سریع</p></div><input className="input" placeholder="جستجوی مشتری..." value={q} onChange={e=>setQ(e.target.value)}/><div className="grid grid-cols-2 gap-2"><ReportCard label="تعداد بدهکاران" value={filtered.length} tone="gray"/><ReportCard label="جمع مطالبات" value={filtered.reduce((s,p)=>s+p.balance,0)} tone="green"/></div>{filtered.map(p=><div key={p.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{p.name}</b><span className="text-emerald-500 text-xs">{money(p.balance)} تومان</span></div><p className="text-[10px] text-zinc-500 mt-2">مانده مشتری / پروژه‌های مرتبط</p></div>)}{!filtered.length&&<Empty text="مطالبه فعالی پیدا نشد."/>}</div> }
function HistoryScreen({ transactions }: { transactions: Transaction[] }) { return <div className="p-4 space-y-3"><h2 className="text-sm font-bold">تاریخچه</h2>{transactions.map(t=><TxRow key={t.id} tx={t}/>)}{!transactions.length&&<Empty text="تاریخچه خالی است."/>}</div> }
function IncomeExpenseScreen({ transactions }: { transactions: Transaction[] }) { return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">درآمدها و هزینه‌ها</h2><h3 className="text-xs text-emerald-500">درآمدها</h3>{transactions.filter(t=>t.type==='income').map(t=><TxRow key={t.id} tx={t}/>)}<h3 className="text-xs text-red-500 mt-4">هزینه‌ها</h3>{transactions.filter(t=>t.type==='expense').map(t=><TxRow key={t.id} tx={t}/>)}</div> }
function CategoriesScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [cats,setCats]=useState<string[]>([]); const [name,setName]=useState(''); const [q,setQ]=useState(''); const [show,setShow]=useState(false); useEffect(()=>{void api<string[]>('/categories').then(setCats)},[]); async function add(e:React.FormEvent){e.preventDefault(); const c=await api<string[]>('/categories',{method:'POST',body:JSON.stringify({name})}); setCats(c); setName(''); setShow(false);} async function edit(c:string){ const n=prompt('نام دسته‌بندی',c); if(!n) return; setCats(await api<string[]>(`/categories/${encodeURIComponent(c)}`,{method:'PUT',body:JSON.stringify({name:n})})); } async function del(c:string){ if(confirm(`حذف ${c}؟`)) setCats(await api<string[]>(`/categories/${encodeURIComponent(c)}`,{method:'DELETE'})); } const list=cats.filter(c=>c.includes(q)); return <div className="p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">دسته‌بندی‌ها</h2><button onClick={()=>setShow(true)} className="rounded-2xl bg-[#3b38a0] px-3 py-2 text-xs text-white">افزودن</button></div><input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="جستجوی دسته‌بندی..."/>{show&&<Modal title="افزودن دسته‌بندی" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="نام دسته جدید"/><button className="primary-btn">ذخیره</button></form></Modal>}<div className="space-y-2">{list.map(c=><div key={c} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 flex justify-between"><span className="text-xs font-bold">{c}</span><div className="flex gap-3 text-[10px]"><button onClick={()=>edit(c)} className="text-[#3b38a0]">ویرایش</button><button onClick={()=>del(c)} className="text-red-500">حذف</button></div></div>)}</div></div> }
function LedgerScreen({ persons, transactions }: { persons: Person[]; transactions: Transaction[] }) { return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">گردش حساب</h2><div className="grid grid-cols-2 gap-2"><ReportCard label="اشخاص" value={persons.length} tone="gray"/><ReportCard label="اسناد" value={transactions.length} tone="purple"/></div>{transactions.map(t=><TxRow key={t.id} tx={t}/>)}</div> }
function TrainingScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [items,setItems]=useState<any[]>([]); const [phrase,setPhrase]=useState(''); const [meaning,setMeaning]=useState(''); useEffect(()=>{void api<any[]>('/training').then(setItems)},[]); async function add(e:React.FormEvent){e.preventDefault(); const tr=await api<any>('/training',{method:'POST',body:JSON.stringify({phrase,meaning})}); setItems([tr,...items]); setPhrase(''); setMeaning('');} return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">آموزش دستیار</h2><p className="text-[10px] text-zinc-500 leading-5">اینجا جمله‌های اختصاصی خودت را به حافظه دستیار اضافه کن. این آموزش در حافظه ذخیره می‌شود و موتور محلی هنگام تشخیص جملات مشابه از آن کمک می‌گیرد.</p><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" placeholder="جمله کاربر: دنگ شامو حساب کردم" value={phrase} onChange={e=>setPhrase(e.target.value)}/><input className="input" placeholder="معنی: هزینه رستوران / طلب از دوستان" value={meaning} onChange={e=>setMeaning(e.target.value)}/><button className="primary-btn">آموزش بده</button></form>{items.map(i=><div key={i.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs"><b>{i.phrase}</b><p className="text-zinc-500 mt-1">{i.meaning}</p></div>)}</div> }

function ExpertsScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [experts,setExperts]=useState<any[]>([]); const [settlements,setSettlements]=useState<any[]>([]); const [name,setName]=useState(''); const [amount,setAmount]=useState('');
  async function load(){ const [e,s]=await Promise.all([api<any[]>('/experts'),api<any[]>('/expert-settlements')]); setExperts(e); setSettlements(s); }
  useEffect(()=>{void load()},[]);
  async function addExpert(e:React.FormEvent){e.preventDefault(); await api('/experts',{method:'POST',body:JSON.stringify({name})}); setName(''); await load();}
  async function pay(expertName:string){ await api('/expert-settlements',{method:'POST',body:JSON.stringify({expertName,amount:Number(amount||0),type:'payment',note:'پرداخت دستی'})}); setAmount(''); await load(); }
  return <div className="p-4 space-y-4"><div><h2 className="text-sm font-bold">تسویه کارشناسان</h2><p className="text-[10px] text-zinc-500">لیست کارشناسان، پرداخت دستی، تاریخچه و مانده</p></div><form onSubmit={addExpert} className="flex gap-2"><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="نام کارشناس"/><button className="w-24 rounded-2xl bg-[#3b38a0] text-white text-xs">افزودن</button></form><input className="input" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مبلغ پرداخت/تسویه گروهی"/><div className="space-y-2">{experts.map(ex=><div key={ex.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{ex.name}</b><span className={Number(ex.balance||0)>0?'text-red-500 text-xs':'text-emerald-500 text-xs'}>مانده {money(Math.abs(Number(ex.balance||0)))}</span></div><button onClick={()=>pay(ex.name)} className="mt-2 rounded-xl bg-[#3b38a0] px-3 py-2 text-[10px] text-white">پرداخت دستی</button></div>)}</div><h3 className="text-xs font-bold">تاریخچه تسویه</h3>{settlements.map(st=><div key={st.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs flex justify-between"><span>{st.expertName}</span><b>{money(st.amount)}</b></div>)}</div>
}
function TreasuryScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [accounts,setAccounts]=useState<any[]>([]); const [movements,setMovements]=useState<any[]>([]); const [account,setAccount]=useState('صندوق اصلی'); const [amount,setAmount]=useState(''); const [type,setType]=useState<'deposit'|'withdraw'>('deposit');
  async function load(){ const r=await api<{accounts:any[];movements:any[]}>('/treasury'); setAccounts(r.accounts); setMovements(r.movements); }
  useEffect(()=>{void load()},[]);
  async function submit(e:React.FormEvent){e.preventDefault(); await api('/treasury/movement',{method:'POST',body:JSON.stringify({account,amount:Number(amount),type})}); setAmount(''); await load();}
  return <div className="p-4 space-y-4"><div><h2 className="text-sm font-bold">خزانه داری</h2><p className="text-[10px] text-zinc-500">صندوق‌ها، حساب‌های بانکی، واریز، برداشت و گردش حساب</p></div><div className="grid grid-cols-2 gap-2">{accounts.map(a=><div key={a.id} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3"><span className="text-[10px] text-zinc-500">{a.title}</span><b className="block text-sm mt-1">{money(a.balance||0)}</b></div>)}</div><form onSubmit={submit} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input list="treasury-accounts" className="input" value={account} onChange={e=>setAccount(e.target.value)} placeholder="جستجو/انتخاب صندوق یا حساب"/><datalist id="treasury-accounts">{accounts.map(a=><option key={a.id} value={a.title}/>)}</datalist><input className="input" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مبلغ"/><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setType('deposit')} className={`pill ${type==='deposit'?'active-green':''}`}>واریز</button><button type="button" onClick={()=>setType('withdraw')} className={`pill ${type==='withdraw'?'active-red':''}`}>برداشت</button></div><button className="primary-btn">ثبت عملیات خزانه</button></form><h3 className="text-xs font-bold">گردش حساب</h3>{movements.map(m=><div key={m.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs flex justify-between"><span>{m.account||`${m.from} ← ${m.to}`}</span><b>{money(m.amount)}</b></div>)}</div>
}
function AccountingScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [accounts,setAccounts]=useState<any[]>([]); const [title,setTitle]=useState(''); const [type,setType]=useState('asset');
  async function load(){ setAccounts(await api<any[]>('/accounting/chart')); }
  useEffect(()=>{void load()},[]);
  async function add(e:React.FormEvent){e.preventDefault(); await api<any>('/accounting/chart',{method:'POST',body:JSON.stringify({title,type})}); setTitle(''); await load();}
  async function edit(a:any){ const title=prompt('عنوان سرفصل',a.title); if(!title) return; await api(`/accounting/chart/${a.id}`,{method:'PUT',body:JSON.stringify({title,type:a.type})}); await load(); }
  async function del(a:any){ if(confirm(`حذف سرفصل ${a.title}؟`)){ await api(`/accounting/chart/${a.id}`,{method:'DELETE'}); await load(); } }
  return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">دفتر کل و سرفصل حساب‌ها</h2><p className="text-[10px] text-zinc-500">سرفصل‌ها پایه سند دوطرفه، تراز آزمایشی و گزارش‌های مالی هستند.</p><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="نام حساب: صندوق، فروش، هزینه تبلیغات..."/><select className="input" value={type} onChange={e=>setType(e.target.value)}><option value="asset">دارایی</option><option value="liability">بدهی</option><option value="equity">سرمایه</option><option value="income">درآمد</option><option value="expense">هزینه</option></select><button className="primary-btn">افزودن سرفصل</button></form><div className="space-y-2">{accounts.map(a=><div key={a.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{a.code} - {a.title}</b><span className="badge">{a.typeFa||a.type}</span></div><div className="mt-2 flex gap-3 text-[10px]"><button onClick={()=>edit(a)} className="text-[#3b38a0]">ویرایش</button><button onClick={()=>del(a)} className="text-red-500">حذف</button></div></div>)}</div></div>
}
function JournalScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
 const [items,setItems]=useState<any[]>([]); const [desc,setDesc]=useState(''); const [debit,setDebit]=useState('صندوق'); const [credit,setCredit]=useState('درآمد فروش'); const [amount,setAmount]=useState('');
 async function load(){ setItems(await api<any[]>('/accounting/journal')); }
 useEffect(()=>{void load()},[]);
 async function add(e:React.FormEvent){e.preventDefault(); const j=await api<any>('/accounting/journal',{method:'POST',body:JSON.stringify({description:desc,lines:[{accountTitle:debit,debit:Number(amount),credit:0},{accountTitle:credit,debit:0,credit:Number(amount)}]})}); setItems([j,...items]); setDesc(''); setAmount('');}
 return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">اسناد حسابداری دوطرفه</h2><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" placeholder="شرح سند" value={desc} onChange={e=>setDesc(e.target.value)}/><input className="input" placeholder="حساب بدهکار" value={debit} onChange={e=>setDebit(e.target.value)}/><input className="input" placeholder="حساب بستانکار" value={credit} onChange={e=>setCredit(e.target.value)}/><input className="input" placeholder="مبلغ" value={amount} onChange={e=>setAmount(e.target.value)}/><button className="primary-btn">ثبت سند تراز</button></form>{items.map(j=><div key={j.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{j.description}</b><button onClick={async()=>{if(confirm('حذف سند؟')){await api(`/accounting/journal/${j.id}`,{method:'DELETE'}); await load();}}} className="text-[10px] text-red-500">حذف</button></div><p className="text-[10px] text-zinc-500 mt-1">بدهکار: {money(j.totalDebit)} / بستانکار: {money(j.totalCredit)}</p>{j.lines?.map((l:any,i:number)=><div key={i} className="mt-1 flex justify-between text-[10px]"><span>{l.accountTitle}</span><span>{money(l.debit||0)} / {money(l.credit||0)}</span></div>)}</div>)}</div>
}
function TrialBalanceScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [rows,setRows]=useState<any[]>([]); useEffect(()=>{void api<any[]>('/accounting/trial-balance').then(setRows)},[]); return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">تراز آزمایشی</h2>{rows.map(r=><div key={r.accountId} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><b className="text-xs">{r.accountTitle}</b><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><span>بدهکار {money(r.debit)}</span><span>بستانکار {money(r.credit)}</span><span>مانده {money(Math.abs(r.balance))}</span></div></div>)}{!rows.length&&<Empty text="هنوز سند حسابداری ثبت نشده است."/>}</div> }
function ProfitLossScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [r,setR]=useState<any>(null); useEffect(()=>{void api<any>('/accounting/profit-loss').then(setR)},[]); return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">صورت سود و زیان</h2>{r&&<><ReportCard label="درآمد عملیاتی" value={r.income} tone="green"/><ReportCard label="هزینه‌ها" value={r.expense} tone="red"/><ReportCard label="سود/زیان خالص" value={r.netProfit} tone="purple"/><div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 text-[11px] leading-6">سود ناخالص بر اساس درآمدها و هزینه‌های ثبت‌شده و اسناد حسابداری محاسبه شده است.</div></>}</div> }
function CashFlowScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [r,setR]=useState<any>(null); useEffect(()=>{void api<any>('/accounting/cash-flow').then(setR)},[]); return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">گزارش جریان نقدی</h2>{r&&<><ReportCard label="ورودی نقد" value={r.cashIn} tone="green"/><ReportCard label="خروجی نقد" value={r.cashOut} tone="red"/><ReportCard label="خالص جریان نقد" value={r.netCashFlow} tone="purple"/>{r.movements?.map((m:any)=><div key={m.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs flex justify-between"><span>{m.account||m.to||m.from}</span><b>{money(m.amount)}</b></div>)}</>}</div> }
function ProjectsScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [items,setItems]=useState<any[]>([]); const [title,setTitle]=useState(''); const [customerName,setCustomer]=useState(''); const [amount,setAmount]=useState(''); async function load(){setItems(await api<any[]>('/projects'));} useEffect(()=>{void load()},[]); async function add(e:React.FormEvent){e.preventDefault(); const pr=await api<any>('/projects',{method:'POST',body:JSON.stringify({title,customerName,amount:Number(amount)})}); setItems([pr,...items]); setTitle(''); setCustomer(''); setAmount('');} async function edit(pr:any){ const title=prompt('نام پروژه',pr.title); if(!title) return; const paid=prompt('مبلغ پرداخت‌شده',String(pr.paid||0)); await api(`/projects/${pr.id}`,{method:'PUT',body:JSON.stringify({title,paid:Number(paid||0)})}); await load(); } async function del(pr:any){ if(confirm(`حذف پروژه ${pr.title}؟`)){ await api(`/projects/${pr.id}`,{method:'DELETE'}); await load(); } } return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">پروژه و مشتری</h2><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="نام پروژه"/><input className="input" value={customerName} onChange={e=>setCustomer(e.target.value)} placeholder="مشتری"/><input className="input" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مبلغ قرارداد"/><button className="primary-btn">تعریف پروژه</button></form>{items.map(pr=><div key={pr.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{pr.title}</b><span className="badge">{pr.customerName}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><span>قرارداد {money(pr.amount)}</span><span>پرداخت {money(pr.paid)}</span><span>مانده {money(pr.balance)}</span></div><p className="mt-2 text-[10px] text-zinc-500">مراحل: پیش‌فاکتور، شروع، اجرا، تحویل، تسویه</p><div className="mt-2 flex gap-3 text-[10px]"><button onClick={()=>edit(pr)} className="text-[#3b38a0]">ویرایش/پرداخت</button><button onClick={()=>del(pr)} className="text-red-500">حذف</button></div></div>)}</div> }
function CustomersScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [persons,setPersons]=useState<Person[]>([]); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [name,setName]=useState(''); async function load(){setPersons(await api<Person[]>('/persons'));} useEffect(()=>{void load()},[]); async function add(e:React.FormEvent){e.preventDefault(); await api('/persons',{method:'POST',body:JSON.stringify({name})}); setName(''); setShow(false); await load();} const list=persons.filter(p=>p.name.includes(q)); return <div className="p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">مشتریان</h2><button onClick={()=>setShow(true)} className="rounded-2xl bg-[#3b38a0] px-3 py-2 text-xs text-white">افزودن</button></div><input className="input" placeholder="جستجوی مشتری..." value={q} onChange={e=>setQ(e.target.value)}/>{show&&<Modal title="افزودن مشتری" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="نام مشتری"/><button className="primary-btn">ذخیره</button></form></Modal>}{list.map(p=><div key={p.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 flex justify-between"><b className="text-xs">{p.name}</b><span className={p.balance>=0?'text-emerald-500 text-xs':'text-red-500 text-xs'}>{money(Math.abs(p.balance))}</span></div>)}{!list.length&&<Empty text="مشتری ثبت نشده است."/>}</div> }
function InvoicesScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [items,setItems]=useState<any[]>([]); const [persons,setPersons]=useState<Person[]>([]); const [customer,setCustomer]=useState(''); const [amount,setAmount]=useState(''); const [type,setType]=useState('invoice'); async function load(){const [i,p]=await Promise.all([api<any[]>('/invoices'),api<Person[]>('/persons')]); setItems(i); setPersons(p);} useEffect(()=>{void load()},[]); async function add(e:React.FormEvent){e.preventDefault(); const inv=await api<any>('/invoices',{method:'POST',body:JSON.stringify({customerName:customer,amount:Number(amount),type})}); setItems([inv,...items]); setCustomer(''); setAmount('');} async function edit(i:any){ const amount=prompt('مبلغ',String(i.amount)); if(!amount) return; await api(`/invoices/${i.id}`,{method:'PUT',body:JSON.stringify({amount:Number(amount)})}); await load(); } async function del(i:any){ if(confirm('حذف فاکتور؟')){ await api(`/invoices/${i.id}`,{method:'DELETE'}); await load(); } } return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">فاکتور و پیش‌فاکتور</h2><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><select className="input" value={type} onChange={e=>setType(e.target.value)}><option value="invoice">فاکتور</option><option value="proforma">پیش‌فاکتور</option></select><input list="customers-list" className="input" value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="جستجو/انتخاب مشتری"/><datalist id="customers-list">{persons.map(p=><option key={p.id} value={p.name}/>)}</datalist><input className="input" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="مبلغ"/><button className="primary-btn">صدور</button></form>{items.map(i=><div key={i.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between text-xs"><span>{i.type==='proforma'?'پیش‌فاکتور':'فاکتور'} - {i.customerName}</span><b>{money(i.amount)}</b></div><div className="mt-2 flex gap-3 text-[10px]"><button onClick={()=>edit(i)} className="text-[#3b38a0]">ویرایش</button><button onClick={()=>del(i)} className="text-red-500">حذف</button></div></div>)}</div> }
function AdvancedAIScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [rules,setRules]=useState<any[]>([]); const [pattern,setPattern]=useState(''); const [action,setAction]=useState(''); useEffect(()=>{void api<any[]>('/ai/rules').then(setRules)},[]); async function add(e:React.FormEvent){e.preventDefault(); const r=await api<any>('/ai/rules',{method:'POST',body:JSON.stringify({pattern,action})}); setRules([r,...rules]); setPattern(''); setAction('');} return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">هوش مصنوعی پیشرفته</h2><p className="text-[10px] text-zinc-500 leading-5">حافظه آموزشی، قوانین سفارشی ادمین، رفع ابهام، چند عملیات در یک پیام و اصلاح خودکار پایه‌گذاری شده‌اند.</p><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" value={pattern} onChange={e=>setPattern(e.target.value)} placeholder="اگر جمله شامل..."/><input className="input" value={action} onChange={e=>setAction(e.target.value)} placeholder="پس این معنی/عملیات را انجام بده"/><button className="primary-btn">افزودن قانون</button></form>{rules.map(r=><div key={r.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs"><b>{r.pattern}</b><p className="text-zinc-500 mt-1">{r.action}</p></div>)}</div> }
function AdminPanel({ api, settings, setSettings }: { api: <T>(u: string, o?: RequestInit) => Promise<T>; settings: AiSettings; setSettings: (s: AiSettings) => void; }) {
  const [local,setLocal]=useState(settings); const [stats,setStats]=useState<AdminStats | null>(null); const [result,setResult]=useState('');
  useEffect(()=>{void api<AdminStats>('/admin/stats').then(setStats)},[]);
  async function save(){const saved=await api<AiSettings>('/admin/settings',{method:'PUT',body:JSON.stringify(local)}); const clean={...saved, aiToken:''}; setSettings(clean); setLocal(clean); setResult('تنظیمات ذخیره شد. توکن کامل روی سرور محفوظ است و برای امنیت نمایش داده نمی‌شود.');}
  async function test(){try{const r=await api<{answer:string}>('/admin/test-ai',{method:'POST',body:JSON.stringify({prompt:'اتصال را تست کن'})}); setResult(r.answer)}catch(e){setResult(e instanceof Error?e.message:'خطا')}}
  return <div className="p-4 space-y-4"><div className="flex items-center gap-2"><Shield className="text-[#3b38a0]"/><h2 className="text-sm font-bold">پنل ادمین و تنظیمات پیشرفته</h2></div>{stats && <div className="grid grid-cols-2 gap-2">{Object.entries(stats.counts).map(([k,v])=><div key={k} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><span className="text-[10px] text-zinc-500">{k}</span><b className="block text-lg">{money(v)}</b></div>)}</div>}<div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 space-y-3"><h3 className="text-xs font-bold flex gap-1"><Settings size={15}/> تنظیمات هوش مصنوعی</h3><label className="block text-xs text-zinc-500">ارائه‌دهنده<select className="input mt-1" value={local.aiProvider} onChange={e=>setLocal({...local,aiProvider:e.target.value as Provider})}><option value="local">موتور محلی بدون توکن</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="groq">Groq</option><option value="custom">Custom OpenAI Compatible</option></select></label><Field label="Base URL اختیاری" value={local.aiBaseUrl || ''} onChange={v=>setLocal({...local,aiBaseUrl:v})}/><Field label="Model" value={local.aiModel || ''} onChange={v=>setLocal({...local,aiModel:v})}/><Field label={`API Token ${local.aiTokenSet ? '(قبلاً ذخیره شده؛ برای تغییر، توکن جدید را وارد کن)' : ''}`} value={local.aiToken || ''} onChange={v=>setLocal({...local,aiToken:v})} type="password"/><Field label="System Prompt" value={local.systemPrompt || ''} onChange={v=>setLocal({...local,systemPrompt:v})} textarea/><div className="grid grid-cols-2 gap-2"><button onClick={save} className="primary-btn" type="button">ذخیره تنظیمات</button><button onClick={test} className="rounded-2xl bg-zinc-200 dark:bg-zinc-800 py-3 text-xs font-bold" type="button">تست اتصال</button></div>{result && <p className="rounded-2xl bg-[#3b38a0]/10 p-3 text-[11px] leading-5 text-[#3b38a0] dark:text-[#b2b0e8]">{result}</p>}</div><div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4"><h3 className="text-xs font-bold mb-2">کاربران</h3>{stats?.users.map(u=><div key={u.id} className="flex justify-between border-t border-black/5 dark:border-white/5 py-2 text-[11px]"><span><User size={12} className="inline"/> {u.name}</span><span>{u.role}</span></div>)}</div></div>;
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) { useEffect(()=>{const t=setTimeout(onClose,5000); return()=>clearTimeout(t)},[onClose]); return <div className="fixed top-4 left-1/2 z-50 w-[92%] max-w-sm -translate-x-1/2 rounded-3xl bg-zinc-950 p-4 text-xs text-white shadow-2xl border border-white/10"><div className="flex gap-2"><Bell size={16} className="text-[#b2b0e8]"/><p className="leading-5">{text}</p></div></div>; }
