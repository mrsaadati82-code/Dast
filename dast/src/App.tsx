import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
  Search,
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
  TrendingUp,
  User,
  RotateCcw
} from 'lucide-react';
import darkTypo from './assets/dark-theme-typo.png';
import lightTypo from './assets/light-theme-typo.png';
import logoMark from './assets/logo.png';
import { Dashboard, Donut, HBars } from './Dashboard';
import { confirmDialog, promptDialog, alertDialog, toast, JalaliDatePicker, useLongPress, ActionRow, AmountInput, toFaDigits, toEnDigits, Pager } from './ui';

type Role = 'admin' | 'user';
type TxType = 'income' | 'expense';
type Tab = 'home' | 'chat' | 'analytics' | 'cheques' | 'sms' | 'admin' | 'persons' | 'accounts' | 'claims' | 'experts' | 'treasury' | 'history' | 'incomeExpense' | 'categories' | 'ledger' | 'training' | 'accounting' | 'journal' | 'trialBalance' | 'profitLoss' | 'cashFlow' | 'projects' | 'customers' | 'invoices' | 'advancedAI';
type Provider = 'local' | 'openai' | 'openrouter' | 'groq' | 'custom';

interface UserInfo { id: string; name: string; email: string; role: Role; createdAt: string; }
interface Transaction { id: string; title: string; amount: number; type: TxType; category: string; bank?: string; party?: string; personId?: string; projectId?: string; accountingSide?: string; date: string; method: string; note?: string; createdAt: string; }
interface Cheque { id: string; title: string; amount: number; dueDate: string; type: 'payable' | 'receivable'; status: string; personName?: string; bank?: string; serial?: string; note?: string; computedStatus?: string; daysLeft?: number | null; reminderChannels?: string[]; }
interface SmsItem { id: string; sender: string; text: string; status: string; parsed: Partial<Transaction>; createdAt: string; }
interface Person { id: string; name: string; phone?: string; mobile?: string; nationalId?: string; address?: string; kind?: string; tags?: string[]; note?: string; balance: number; docCount?: number; }
interface AiSettings { appName: string; aiProvider: Provider; aiBaseUrl: string; aiModel: string; aiToken: string; aiTokenSet?: boolean; temperature: number; systemPrompt: string; defaultCurrency: string; reminderDays: number[]; notificationChannels: string[]; }
interface AdminStats { users: UserInfo[]; counts: { users: number; transactions: number; cheques: number; sms: number }; totals: { income: number; expense: number }; byCat: Record<string, number>; }
interface Message { id: string; sender: 'user' | 'ai'; text: string; time: string; tx?: Partial<Transaction>; alternatives?: Person[]; txId?: string; candidates?: Person[]; pendingText?: string; confirmTarget?: { kind: string; id: string; title: string }; canUndo?: boolean; learnText?: string; sideSuggestions?: { side: string; label: string }[]; sideTxId?: string; }

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
        setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: result.question, time: 'اکنون', candidates: result.candidates, pendingText: text }]);
      } else if (result.action === 'confirm_delete') {
        setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: result.message, time: 'اکنون', confirmTarget: result.target }]);
      } else {
        const tx = result.transaction as Transaction | undefined;
        const reply = result.message || (tx ? `ثبت شد ✅\n${tx.title}\nمبلغ: ${money(tx.amount)} تومان\nدسته‌بندی: ${tx.category}` : 'دستور پردازش شد.');
        const learned = tx?.category && (tx as any).learned ? undefined : (tx && text ? text : undefined);
        setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: reply, time: 'اکنون', tx, alternatives: result.alternatives, txId: tx?.id, canUndo: result.canUndo, learnText: learned, sideSuggestions: result.sideSuggestions, sideTxId: result.txId || tx?.id }]);
        await boot();
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: e instanceof Error ? e.message : 'خطا رخ داد', time: 'اکنون' }]);
    } finally { setBusy(false); }
  }


  async function confirmDelete(target: { kind: string; id: string }) {
    try { const r = await api<any>('/assistant/confirm-delete', { method: 'POST', body: JSON.stringify(target) }); setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: r.message, time: 'اکنون', canUndo: r.canUndo }]); await boot(); }
    catch (e) { setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: e instanceof Error ? e.message : 'خطا', time: 'اکنون' }]); }
  }
  async function undoLast() {
    try { const r = await api<any>('/assistant/undo', { method: 'POST', body: JSON.stringify({}) }); setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: r.message, time: 'اکنون' }]); await boot(); }
    catch (e) { setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: e instanceof Error ? e.message : 'خطا', time: 'اکنون' }]); }
  }
  async function teachCorrection(text: string) {
    const value = await promptDialog({ title: 'این تراکنش باید در کدام دسته‌بندی ثبت شود؟ (دستیار یاد می‌گیرد)' });
    if (!value) return;
    try { const r = await api<any>('/assistant/correction', { method: 'POST', body: JSON.stringify({ text, field: 'category', value }) }); setMessages(prev => [...prev, { id: uid(), sender: 'ai', text: r.message, time: 'اکنون' }]); }
    catch {}
  }

  function deleteMessage(msgId: string) { setMessages(prev => prev.filter(m => m.id !== msgId)); }
  function clearChat() { setMessages([{ id: uid(), sender: 'ai', text: 'گفتگو پاک شد. چطور می‌توانم کمک کنم؟', time: 'اکنون' }]); }
  async function reclassifyTx(txId: string, side: string, msgId: string) {
    try { const r = await api<any>(`/transactions/${txId}/reclassify`, { method: 'POST', body: JSON.stringify({ side }) });
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, sideSuggestions: undefined, text: m.text + '\n✓ ' + r.message } : m));
      toast('اصلاح شد'); await boot();
    } catch { toast('خطا در اصلاح', 'error'); }
  }

  async function resolveClarification(person: Person, pendingText: string) {
    // جایگزینی نام مبهم با نام کامل شخص انتخاب‌شده و ارسال دوباره
    const firstName = person.name.split(' ')[0];
    const newText = pendingText.replace(firstName, person.name);
    await sendMessage(newText === pendingText ? `${pendingText} (${person.name})` : newText);
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
    const myMsgId = uid();
    setMessages(prev => [...prev,
      { id: myMsgId, sender: 'user', text: `📸 رسید «${file.name}» ارسال شد`, time: 'اکنون' },
      { id: uid(), sender: 'ai', text: 'در حال خواندن رسید…', time: 'اکنون' }
    ]);
    const imageBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file);
    });
    let parsed: Partial<Transaction> & { aiWarning?: string } = {};
    // ۱) اگر توکن Vision در پنل ادمین وصل باشد، سرور تحلیل می‌کند
    try { parsed = await api('/ai/parse-receipt', { method: 'POST', body: JSON.stringify({ imageBase64, text: file.name }) }); } catch {}
    // ۲) اگر مبلغ پیدا نشد، OCR محلی روی خود دستگاه (بدون نیاز به توکن)
    if (!Number(parsed.amount)) {
      try {
        const { ocrReceipt } = await import('./ocr');
        setMessages(prev => prev.map(m => m.id !== myMsgId && m.sender === 'ai' && m.text === 'در حال خواندن رسید…' ? { ...m, text: 'در حال پردازش تصویر با OCR محلی…' } : m));
        const ocr = await ocrReceipt(file, () => {});
        if (ocr.amount > 0) parsed = { ...parsed, amount: ocr.amount, title: parsed.title || ocr.title, category: parsed.category || 'سایر', type: 'expense' };
      } catch { /* OCR در دسترس نبود */ }
    }
    let tx: Transaction | undefined;
    try {
      if (Number(parsed.amount) > 0) tx = await addTransaction({ ...parsed, method: 'Receipt OCR' });
      else {
        const amountText = await promptDialog({ title: 'مبلغ رسید به‌صورت خودکار پیدا نشد. مبلغ را وارد کن (تومان):' });
        if (amountText) {
          const title = await promptDialog({ title: 'عنوان رسید / فروشگاه:', defaultValue: String(parsed.title || 'رسید خرید') }) || 'رسید خرید';
          tx = await addTransaction({ title, amount: Number(amountText.replace(/[,٬]/g, '')), type: 'expense', category: parsed.category || 'سایر', method: 'Receipt Manual' });
        }
      }
    } finally {
      // پیام «در حال…» را با نتیجه جایگزین کن
      setMessages(prev => { const copy = [...prev]; for (let i = copy.length - 1; i >= 0; i--) { if (copy[i].sender === 'ai' && /در حال (خواندن|پردازش)/.test(copy[i].text)) { copy[i] = { ...copy[i], text: tx ? `رسید ثبت شد ✅\n${tx.title} - ${money(tx.amount)} تومان\nدسته: ${tx.category}` : 'مبلغ رسید استخراج نشد. می‌توانی دوباره با عکس واضح‌تر یا نور بهتر امتحان کنی، یا مبلغ را دستی بنویسی.', tx, learnText: tx ? `${file.name}` : undefined }; break; } } return copy; });
      setBusy(false);
    }
  }

  async function handleSms(text: string) {
    const sms = await api<SmsItem>('/sms/parse', { method: 'POST', body: JSON.stringify({ text }) });
    setSmsInbox(prev => [sms, ...prev]);
    setNotice(`پیامک تحلیل شد: ${sms.parsed.title || 'تراکنش'} - ${money(Number(sms.parsed.amount || 0))} تومان`);
  }

  if (loading) return <Splash />;
  if (!user) return <AuthScreen saveToken={saveToken} />;

  return (
    <div dir="rtl" className="flex h-[100dvh] items-stretch justify-center bg-zinc-100 text-zinc-950 dark:bg-[#050507] dark:text-[#f4f4f5] transition-colors sm:items-center">
      <div className="fixed inset-0 pointer-events-none overflow-hidden"><div className="absolute -top-32 -left-24 h-72 w-72 rounded-full bg-[#3b38a0]/25 blur-3xl" /><div className="absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-[#7a85c1]/20 blur-3xl" /></div>
      {notice && <Toast text={notice} onClose={() => setNotice(null)} />}
      <main className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-white dark:bg-zinc-950 shadow-2xl sm:h-[min(812px,calc(100dvh-2rem))] sm:rounded-[34px] sm:border sm:border-white/10">
        <header className="shrink-0 z-20 bg-white/90 dark:bg-black/70 backdrop-blur-xl border-b border-black/5 dark:border-white/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><button onClick={() => setDrawerOpen(true)} className="icon-btn"><Menu size={17} /></button><div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-[#3b38a0] to-[#7a85c1] p-2 shadow-lg shadow-[#3b38a0]/20"><img src={logoMark} alt="دست راست" className="h-6 w-6 object-contain" /></div><div><img src={theme === 'dark' ? darkTypo : lightTypo} alt="دست راست" className="h-7 w-auto max-w-[120px] object-contain"/><p className="text-[10px] text-zinc-500">{user.name} • {todayFa()}</p></div></div>
            <div className="flex gap-2"><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="icon-btn">{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button><button onClick={logout} className="icon-btn"><LogOut size={16} /></button></div>
          </div>
        </header>

        <section className={`min-h-0 flex-1 no-scrollbar ${tab === 'chat' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overscroll-contain'}`}>
          {tab === 'home' && <Dashboard totals={totals} transactions={transactions} persons={persons} setTab={setTab} api={api} QuickTxForm={(p: { onDone: () => void }) => <QuickTxForm addTransaction={addTransaction} onDone={p.onDone} api={api} />} TxRow={TxRow} Empty={Empty} />}
          {tab === 'chat' && <ChatScreen messages={messages} input={input} setInput={setInput} sendMessage={sendMessage} busy={busy} scanReceipt={scanReceipt} resolveClarification={resolveClarification} confirmDelete={confirmDelete} undoLast={undoLast} teachCorrection={teachCorrection} reclassifyTx={reclassifyTx} deleteMessage={deleteMessage} clearChat={clearChat} />}
          {tab === 'analytics' && <AnalyticsScreen transactions={transactions} askAnalysis={askAnalysis} busy={busy} />}
          {tab === 'cheques' && <ChequesScreen cheques={cheques} api={api} reload={boot} />}
          {tab === 'sms' && <SmsScreen smsInbox={smsInbox} handleSms={handleSms} addTransaction={addTransaction} />}
          {tab === 'persons' && <PersonsScreen api={api} persons={persons} reload={boot} />}
          {tab === 'experts' && <ExpertsScreen api={api} />}
          {tab === 'treasury' && <TreasuryScreen api={api} />}
          {tab === 'accounts' && <AccountsScreen api={api} />}
          {tab === 'claims' && <ClaimsScreen api={api} />}
          {tab === 'history' && <HistoryScreen api={api} transactions={transactions} reload={boot} />}
          {tab === 'incomeExpense' && <IncomeExpenseScreen api={api} transactions={transactions} reload={boot} />}
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

function TxRow({ tx }: { tx: Transaction }) { return <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900/70 border border-black/5 dark:border-white/5 p-3 flex items-center justify-between"><div className="flex gap-2"><div className={`grid h-9 w-9 place-items-center rounded-xl ${tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>{tx.type === 'income' ? <ArrowUpRight size={17} /> : <ArrowDownRight size={17} />}</div><div><h4 className="text-xs font-bold">{tx.title}</h4><p className="mt-0.5 text-[9px] text-zinc-500">{tx.category} • {tx.method}</p></div></div><div className="text-left"><b className={`text-[11px] ${tx.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>{tx.type === 'income' ? '+' : '-'}{money(tx.amount)}</b><p className="text-[9px] text-zinc-500">{toFaDigits(tx.date)}</p></div></div>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-6 text-center text-xs text-zinc-500">{text}</div>; }
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="absolute inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-[28px] bg-white p-4 shadow-2xl dark:bg-zinc-950 border border-black/10 dark:border-white/10"><div className="mb-4 flex items-center justify-between"><b className="text-sm">{title}</b><button onClick={onClose} className="icon-btn"><X size={15}/></button></div>{children}</div></div>; }


// دراپ‌داون جستجوشونده: گزینه‌ها را نشان می‌دهد و امکان جستجو دارد (و در صورت نیاز افزودن مقدار جدید)
function SearchSelect({ value, onChange, options, placeholder, allowNew = false }: { value: string; onChange: (v: string) => void; options: { id?: string; label: string; value: string; hint?: string }[]; placeholder: string; allowNew?: boolean }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); } document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc); }, []);
  const list = options.filter(o => o.label.includes(q) || o.value.includes(q));
  const selected = options.find(o => o.value === value);
  return <div className="relative" ref={ref}>
    <button type="button" onClick={() => setOpen(o => !o)} className="input flex items-center justify-between text-right"><span className={value ? '' : 'text-zinc-400'}>{selected?.label || value || placeholder}</span><span className="text-zinc-400 text-[10px]">▾</span></button>
    {open && <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-3xl border border-black/10 bg-white p-2 shadow-2xl dark:border-white/10 dark:bg-zinc-950">
      <input autoFocus className="input mb-2" placeholder="جستجو..." value={q} onChange={e => setQ(e.target.value)} />
      <div className="max-h-52 overflow-y-auto no-scrollbar space-y-1">
        {list.map(o => <button type="button" key={o.id || o.value} onClick={() => { onChange(o.value); setOpen(false); setQ(''); }} className={`w-full rounded-2xl p-3 text-right text-xs flex justify-between items-center ${o.value === value ? 'bg-[#3b38a0]/15 text-[#3b38a0] dark:text-[#b2b0e8]' : 'bg-zinc-100 dark:bg-zinc-900'}`}><span>{o.label}</span>{o.hint && <span className="text-[10px] text-zinc-500">{o.hint}</span>}</button>)}
        {!list.length && allowNew && q && <button type="button" onClick={() => { onChange(q); setOpen(false); }} className="w-full rounded-2xl border border-dashed border-[#3b38a0]/40 p-3 text-right text-xs text-[#3b38a0]">افزودن «{q}»</button>}
        {!list.length && !allowNew && <div className="p-3 text-center text-[10px] text-zinc-500">موردی پیدا نشد</div>}
      </div>
    </div>}
  </div>;
}

// هدر استاندارد لیست: عنوان + فیلد جستجو + دکمهٔ افزودن (که پاپ‌آپ باز می‌کند)
function ListHeader({ title, q, setQ, onAdd, placeholder }: { title: string; q: string; setQ: (v: string) => void; onAdd: () => void; placeholder?: string }) {
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><h2 className="text-sm font-bold">{title}</h2><button onClick={onAdd} className="flex items-center gap-1 rounded-2xl bg-[#3b38a0] px-3 py-2 text-xs text-white active:scale-95"><Plus size={14}/> افزودن</button></div>
    <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input className="input !pr-9" placeholder={placeholder || 'جستجو...'} value={q} onChange={e => setQ(e.target.value)} /></div>
  </div>;
}

function QuickTxForm({ addTransaction, onDone, api }: { addTransaction: (tx: Partial<Transaction>) => Promise<Transaction>; onDone: () => void; api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [title, setTitle] = useState(''); const [amount, setAmount] = useState(''); const [type, setType] = useState<TxType>('expense');
  const [category, setCategory] = useState(''); const [account, setAccount] = useState('صندوق');
  const [cats, setCats] = useState<string[]>([]); const [accounts, setAccounts] = useState<any[]>([]);
  useEffect(() => { void api<string[]>('/categories').then(setCats).catch(()=>{}); void api<any[]>('/accounts').then(setAccounts).catch(()=>{}); }, []);
  async function submit(e: React.FormEvent) { e.preventDefault(); await addTransaction({ title, amount: Number(amount), type, category: category || (type === 'income' ? 'حقوق و درآمد' : 'سایر'), bank: account, method: 'Manual' }); onDone(); }
  return <form onSubmit={submit} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2">
    <input className="input" placeholder="عنوان" value={title} onChange={e=>setTitle(e.target.value)} required />
    <AmountInput value={amount} onChange={setAmount} placeholder="مبلغ تومان"/>
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setType('expense')} className={`pill ${type==='expense'?'active-red':''}`}>هزینه</button><button type="button" onClick={()=>setType('income')} className={`pill ${type==='income'?'active-green':''}`}>درآمد</button></div>
    <SearchSelect value={category} onChange={setCategory} placeholder="دسته‌بندی" allowNew options={cats.map(c=>({label:c,value:c}))} />
    <SearchSelect value={account} onChange={setAccount} placeholder="از/به حساب" allowNew options={[{label:'صندوق',value:'صندوق'},...accounts.map(a=>({id:a.id,label:a.title,value:a.title,hint:money(a.balance||0)}))]} />
    <button className="primary-btn">ثبت</button>
  </form>;
}

function VoiceWave({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const audioRef = useRef<{ ctx?: AudioContext; analyser?: AnalyserNode; stream?: MediaStream }>({});
  const phaseRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx2d = canvas.getContext('2d'); if (!ctx2d) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr; };
    resize();

    let analyser: AnalyserNode | undefined; let dataArray: Uint8Array | undefined;
    // تلاش برای دسترسی واقعی به میکروفون؛ اگر نشد، موج شبیه‌سازی‌شدهٔ نرم اجرا می‌شود
    (async () => {
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        const audioCtx: AudioContext = new AC();
        const src = audioCtx.createMediaStreamSource(stream);
        analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.82;
        src.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        audioRef.current = { ctx: audioCtx, analyser, stream };
      } catch { /* fallback: simulated wave */ }
    })();

    const palette = ['rgba(122,133,193,0.95)', 'rgba(59,56,160,0.6)', 'rgba(178,176,232,0.45)'];
    const draw = () => {
      const w = canvas.width, h = canvas.height; const mid = h / 2;
      ctx2d.clearRect(0, 0, w, h);
      // دامنه از روی صدای واقعی، یا مقدار آرام پیش‌فرض
      let level = 0.18;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray as any);
        let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        level = Math.min(1, (sum / dataArray.length) / 90) * 0.9 + 0.12;
      }
      phaseRef.current += 0.045;
      const layers = [
        { amp: 0.42 * level, freq: 1.6, speed: 1.0, color: palette[0], width: 2.5 },
        { amp: 0.30 * level, freq: 2.4, speed: -0.7, color: palette[1], width: 2 },
        { amp: 0.22 * level, freq: 3.3, speed: 1.4, color: palette[2], width: 1.6 }
      ];
      for (const L of layers) {
        ctx2d.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const t = x / w;
          const env = Math.sin(Math.PI * t); // صفر در دو لبه، اوج در وسط
          const y = mid + Math.sin(t * Math.PI * 2 * L.freq + phaseRef.current * L.speed * 2.2) * (mid * L.amp) * env;
          x === 0 ? ctx2d.moveTo(x, y) : ctx2d.lineTo(x, y);
        }
        ctx2d.strokeStyle = L.color; ctx2d.lineWidth = L.width * dpr; ctx2d.lineCap = 'round';
        ctx2d.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      try { audioRef.current.stream?.getTracks().forEach(t => t.stop()); } catch {}
      try { audioRef.current.ctx?.close(); } catch {}
      audioRef.current = {};
    };
  }, [active]);

  return <canvas ref={canvasRef} className="h-16 w-full" />;
}

function ChatBubble({ m, onCopy, onDelete, onClear, children }: { m: Message; onCopy: () => void; onDelete: () => void; onClear: () => void; children: React.ReactNode }) {
  const lp = useLongPress(() => [{ label: 'کپی متن', onClick: onCopy }, { label: 'حذف پیام', danger: true, onClick: onDelete }, { label: 'پاک‌کردن کل گفتگو', danger: true, onClick: onClear }]);
  return <div {...lp} className={`flex ${m.sender === 'user' ? 'justify-start' : 'justify-end'}`}>{children}</div>;
}
function ChatScreen({ messages, input, setInput, sendMessage, busy, scanReceipt, resolveClarification, confirmDelete, undoLast, teachCorrection, reclassifyTx, deleteMessage, clearChat }: { messages: Message[]; input: string; setInput: (v: string) => void; sendMessage: (t?: string) => void; busy: boolean; scanReceipt: (f: File) => void; resolveClarification: (p: Person, text: string) => void; confirmDelete: (t: { kind: string; id: string }) => void; undoLast: () => void; teachCorrection: (text: string) => void; reclassifyTx: (txId: string, side: string, msgId: string) => void; deleteMessage: (id: string) => void; clearChat: () => void; }) {
  const end = useRef<HTMLDivElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const [recording,setRecording]=useState(false);   // پاپ‌آپ ضبط باز است
  const [listening,setListening]=useState(false);    // میکروفون درحال شنیدن است
  const [voiceText,setVoiceText]=useState(''); const [timer,setTimer]=useState(0);
  const [voiceLog,setVoiceLog]=useState<string[]>([]);   // لاگ رویدادهای ضبط (برای عیب‌یابی)
  const recRef = useRef<any>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceTextRef = useRef('');
  const gotSpeechRef = useRef(false);          // آیا اصلاً صدایی شنیده شد؟
  const SILENCE_MS = 3000;                     // مدت سکوت قبل از توقف خودکار میکروفون
  const vlog = (s: string) => setVoiceLog(p => [...p.slice(-6), s]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(()=>{ if(!listening) return; const t=setInterval(()=>setTimer(x=>x+1),1000); return()=>clearInterval(t); },[listening]);
  function clearSilence(){ if(silenceRef.current){ clearTimeout(silenceRef.current); silenceRef.current=null; } }
  // پس از هر گفتار، تایمر سکوت ریست می‌شود؛ اگر SILENCE_MS سکوت شد فقط میکروفون قطع می‌شود (پاپ‌آپ باز می‌ماند)
  function armSilence(){ clearSilence(); silenceRef.current=setTimeout(()=>{ try { recRef.current?.stop?.(); } catch {} },SILENCE_MS); }
  // فقط میکروفون را قطع می‌کند (پاپ‌آپ باز می‌ماند تا متن دیده/ارسال شود)
  function stopMic(){ clearSilence(); try { recRef.current?.stop?.(); } catch {} }
  // پاپ‌آپ را کامل می‌بندد (انصراف)
  function closeRec(){ clearSilence(); try { recRef.current?.abort?.(); } catch {} recRef.current=null; setListening(false); setRecording(false); }
  const [voiceErr,setVoiceErr]=useState('');
  function startVoice() {
    clearSilence(); voiceTextRef.current=''; gotSpeechRef.current=false;
    setRecording(true); setListening(true); setTimer(0); setVoiceText(''); setVoiceErr(''); setVoiceLog([]);
    const w = window as unknown as { webkitSpeechRecognition?: new () => any; SpeechRecognition?: new () => any };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setVoiceErr('مرورگر شما تشخیص گفتار را پشتیبانی نمی‌کند. روی موبایل از Chrome استفاده کنید یا متن را تایپ کنید.'); setListening(false); return; }
    if (!navigator.onLine) { setVoiceErr('تشخیص گفتار به اینترنت نیاز دارد و دستگاه آفلاین است. اینترنت را روشن کنید.'); setListening(false); return; }
    try {
      const rec = new SR(); rec.lang = 'fa-IR';
      // continuous=true دقت تشخیص را بالا می‌برد؛ قطع خودکار را خودمان با تایمر سکوت انجام می‌دهیم
      rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onstart = () => vlog('شروع شنیدن');
      rec.onaudiostart = () => vlog('میکروفون فعال');
      rec.onsoundstart = () => { gotSpeechRef.current=true; vlog('صدا دریافت شد'); };
      rec.onspeechstart = () => { gotSpeechRef.current=true; vlog('گفتار آغاز شد'); armSilence(); };
      rec.onresult = (e: any) => {
        gotSpeechRef.current=true;
        let t=''; for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript;
        voiceTextRef.current=t; setVoiceText(t); setVoiceErr('');
        vlog('متن: ' + (t.slice(0,30) || '(خالی)'));
        armSilence();   // فقط پس از شنیدن صدای واقعی، شمارش سکوت شروع/ریست می‌شود
      };
      rec.onspeechend = () => vlog('گفتار پایان یافت');
      rec.onerror = (e: any) => {
        vlog('خطا: ' + (e.error || '?'));
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setVoiceErr('دسترسی به میکروفون داده نشد. از تنظیمات مرورگر اجازه دهید.');
        else if (e.error === 'no-speech') { /* پیام نهایی را onend می‌دهد */ }
        else if (e.error === 'network') setVoiceErr('تشخیص گفتار به اینترنت نیاز دارد (اتصال برقرار نشد).');
        else if (e.error === 'audio-capture') setVoiceErr('میکروفونی یافت نشد. دسترسی میکروفون مرورگر را بررسی کنید.');
        else if (e.error !== 'aborted') setVoiceErr('خطا در ضبط: ' + (e.error || ''));
      };
      rec.onend = () => {
        clearSilence(); recRef.current=null; setListening(false); vlog('پایان');
        // اگر اصلاً صدایی شنیده نشد و متنی نداریم، پیام راهنما بده
        if (!voiceTextRef.current.trim() && !gotSpeechRef.current) {
          setVoiceErr('صدایی شنیده نشد. بلندتر/نزدیک‌تر صحبت کنید و «ضبط مجدد» را بزنید. اگر باز هم نشد، اینترنت و دسترسی میکروفون را بررسی کنید.');
        }
      };
      rec.start(); recRef.current = rec;
      // توجه: armSilence اینجا صدا زده نمی‌شود تا مکث طبیعیِ قبل از شروع صحبت باعث قطع زودهنگام نشود
    } catch (err) { setVoiceErr('شروع ضبط ممکن نشد. دوباره تلاش کنید.'); setListening(false); }
  }
  function restartVoice(){ clearSilence(); try { recRef.current?.abort?.(); } catch {} recRef.current=null; voiceTextRef.current=''; setVoiceText(''); setVoiceErr(''); setTimer(0); setListening(false); setTimeout(()=>startVoice(),150); }
  function sendVoice(){ const t=(voiceText||'').trim(); if(!t){ setVoiceErr('متنی تشخیص داده نشد. روی «ضبط مجدد» بزنید یا متن را تایپ کنید.'); return; } closeRec(); sendMessage(t); }
  useEffect(()=>()=>{ clearSilence(); try { recRef.current?.abort?.(); } catch {} },[]);
  const [reassigned, setReassigned] = useState<Record<string, string>>({});
  async function reassign(txId: string, p: Person){
    await fetch(`/api/transactions/${txId}`, { method:'PUT', headers:{'Content-Type':'application/json', Authorization:`Bearer ${localStorage.getItem(TOKEN_KEY)||''}`}, body: JSON.stringify({ personId:p.id, party:p.name }) });
    setReassigned(prev => ({ ...prev, [txId]: p.name }));
  }
  return <div className="flex h-full min-h-0 flex-1 flex-col relative">
    {recording && <div className="absolute inset-0 z-40 grid place-items-center bg-black/80 backdrop-blur-xl p-5"><div className="w-full max-w-xs rounded-[32px] bg-zinc-950 border border-white/10 p-6 text-center text-white shadow-2xl"><div className={`mic-glow mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br ${listening?'from-[#3b38a0] to-[#7a85c1]':'from-zinc-700 to-zinc-600'}`}><Mic className="text-white" size={34}/></div><h3 className="font-black">{listening?'در حال شنیدن…':'گفتار ضبط شد'}</h3><p className="mt-1 text-xs text-zinc-400">{listening?`${timer.toLocaleString('fa-IR')} ثانیه`:'متن را بررسی و ارسال کنید'}</p><div className="my-5"><VoiceWave active={listening} /></div><p className="min-h-10 rounded-2xl bg-white/5 p-3 text-xs leading-6">{voiceText || (voiceErr ? '' : (listening?'صحبت کنید… (بعد از مکث کوتاه خودکار متوقف می‌شود)':'متنی تشخیص داده نشد.'))}</p>{voiceErr && <p className="mt-2 rounded-2xl bg-red-500/15 p-2 text-[10px] leading-5 text-red-300">{voiceErr}</p>}{voiceLog.length>0 && <details className="mt-2 text-right"><summary className="cursor-pointer text-[9px] text-zinc-500">جزئیات فنی ضبط</summary><div dir="ltr" className="mt-1 rounded-xl bg-white/5 p-2 text-[9px] leading-4 text-zinc-400 text-left">{voiceLog.map((l,i)=><div key={i}>• {l}</div>)}</div></details>}<div className="mt-5 grid grid-cols-3 gap-2"><button onClick={closeRec} className="rounded-2xl bg-zinc-800 py-3 text-xs font-bold">انصراف</button>{listening ? <button onClick={stopMic} className="flex items-center justify-center gap-1 rounded-2xl bg-zinc-700 py-3 text-xs font-bold">توقف</button> : <button onClick={restartVoice} className="flex items-center justify-center gap-1 rounded-2xl bg-zinc-700 py-3 text-xs font-bold"><RotateCcw size={15}/>ضبط مجدد</button>}<button onClick={sendVoice} className="rounded-2xl bg-gradient-to-r from-[#3b38a0] to-[#7a85c1] py-3 text-xs font-bold">ارسال</button></div></div></div>}
    <div className="flex-1 overflow-y-auto no-scrollbar p-4"><div className="flex min-h-full flex-col justify-end gap-3">{messages.map(m => <ChatBubble key={m.id} m={m} onCopy={()=>{navigator.clipboard?.writeText(m.text); toast('کپی شد');}} onDelete={()=>deleteMessage(m.id)} onClear={clearChat}><div className={`max-w-[86%] rounded-2xl p-3 text-xs leading-6 whitespace-pre-line ${m.sender === 'user' ? 'bg-zinc-100 dark:bg-zinc-900 rounded-tr-none' : 'bg-[#3b38a0]/15 text-[#3b38a0] dark:text-[#b2b0e8] border border-[#3b38a0]/20 rounded-tl-none'}`}>{m.text}{m.tx && <div className="mt-2 rounded-xl bg-white/40 dark:bg-white/5 p-2 flex justify-between"><span>{m.tx.category}</span><b>{money(Number(m.tx.amount || 0))}</b></div>}{m.alternatives?.length ? <div className="mt-2">{m.txId && reassigned[m.txId] ? <div className="text-[10px] text-emerald-500">به «{reassigned[m.txId]}» اصلاح شد ✓</div> : <><div className="text-[10px] opacity-70 mb-1">منظورت فرد دیگری بود؟ برای اصلاح بزن:</div><div className="flex flex-wrap gap-1.5">{m.alternatives.map(p=><button key={p.id} onClick={()=>m.txId&&reassign(m.txId,p)} className="glass-btn px-3 py-1.5 text-[10px] font-bold">{p.name}{typeof p.balance==='number'?` • ${money(Math.abs(p.balance))}`:''}</button>)}</div></>}</div> : null}{m.candidates?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{m.candidates.map(p=><button key={p.id} onClick={()=>m.pendingText&&resolveClarification(p,m.pendingText)} className="glass-btn px-3 py-1.5 text-[10px] font-bold">{p.name}{typeof p.balance==='number'?` • ${money(Math.abs(p.balance))}`:''}</button>)}</div> : null}{m.confirmTarget ? <div className="mt-2 flex gap-1.5"><button onClick={()=>m.confirmTarget&&confirmDelete(m.confirmTarget)} className="rounded-2xl bg-red-500 px-3 py-1.5 text-[10px] font-bold text-white active:scale-95">بله، حذف کن</button><button onClick={()=>{}} className="glass-btn px-3 py-1.5 text-[10px] font-bold">انصراف</button></div> : null}{m.sideSuggestions?.length && m.sideTxId ? <div className="mt-2"><div className="text-[10px] opacity-70 mb-1">نوع ثبت درست است؟ در صورت نیاز اصلاح کن:</div><div className="flex flex-wrap gap-1.5">{m.sideSuggestions.map(s=><button key={s.side||'none'} onClick={()=>m.sideTxId&&reclassifyTx(m.sideTxId,s.side,m.id)} className="glass-btn px-3 py-1.5 text-[10px] font-bold">{s.label}</button>)}</div></div> : null}{m.canUndo ? <button onClick={undoLast} className="mt-2 glass-btn inline-flex items-center gap-1 !rounded-full px-3 py-1 text-[10px] font-bold">↩ بازگردان</button> : null}{m.learnText ? <button onClick={()=>m.learnText&&teachCorrection(m.learnText)} className="mt-2 mr-2 glass-btn inline-flex items-center gap-1 !rounded-full px-3 py-1 text-[10px]">✎ اصلاح دسته‌بندی</button> : null}<span className="mt-1 block text-[8px] opacity-50">{m.time}</span></div></ChatBubble>)}{busy && <div className="text-center text-xs text-zinc-500">دست راست در حال فکر کردن...</div>}<div ref={end} /></div></div>
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

function ReportCard({ label, value, tone, unit = 'تومان' }: { label: string; value: number; tone: 'green' | 'red' | 'purple' | 'gray'; unit?: string }) {
  const colors = { green: 'text-emerald-500', red: 'text-red-500', purple: 'text-[#3b38a0] dark:text-[#b2b0e8]', gray: 'text-zinc-700 dark:text-zinc-200' };
  return <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 border border-black/5 dark:border-white/5"><span className="text-[10px] text-zinc-500">{label}</span><b className={`mt-1 block text-sm ${colors[tone]}`}>{money(value)}{unit ? ' ' + unit : ''}</b></div>;
}

const CHEQUE_STATUS_FA: Record<string,string> = { paid: 'پاس شده', overdue: 'معوق', near: 'نزدیک سررسید', upcoming: 'در جریان', bounced: 'برگشتی', pending: 'در جریان' };
function ChequesScreen({ cheques, api, reload }: { cheques: Cheque[]; api: <T>(u: string, o?: RequestInit) => Promise<T>; reload: () => Promise<void>; }) {
  const [show,setShow]=useState(false); const [editC,setEditC]=useState<Cheque|null>(null); const [payC,setPayC]=useState<Cheque|null>(null);
  const [accounts,setAccounts]=useState<any[]>([]); const [persons,setPersons]=useState<Person[]>([]);
  const [q,setQ]=useState(''); const [filter,setFilter]=useState('all'); const [sort,setSort]=useState<'date'|'amount'>('date');
  const [form,setForm]=useState<any>({ title:'', amount:'', dueDate:'', type:'payable', personName:'', bank:'', serial:'' });
  const [payAccount,setPayAccount]=useState('');
  useEffect(()=>{ void api<any[]>('/accounts').then(setAccounts).catch(()=>{}); void api<Person[]>('/persons').then(setPersons).catch(()=>{}); },[cheques.length]);
  const cs=(c:Cheque)=>c.computedStatus||c.status;
  const list=cheques.filter(c=>(c.title.includes(q)||(c.personName||'').includes(q))&&(filter==='all'||c.type===filter||cs(c)===filter)).sort((a,b)=>sort==='amount'?Number(b.amount)-Number(a.amount):String(a.dueDate).localeCompare(String(b.dueDate)));
  async function add(e:React.FormEvent){e.preventDefault(); await api('/cheques',{method:'POST',body:JSON.stringify({...form,amount:Number(form.amount)})}); setForm({title:'',amount:'',dueDate:'',type:'payable',personName:'',bank:'',serial:''}); setShow(false); await reload();}
  async function saveEdit(e:React.FormEvent){e.preventDefault(); if(!editC) return; await api(`/cheques/${editC.id}`,{method:'PUT',body:JSON.stringify({title:editC.title,amount:Number(editC.amount),dueDate:editC.dueDate,type:editC.type,personName:editC.personName,bank:editC.bank})}); setEditC(null); await reload();}
  async function del(id:string){if(await confirmDialog({ title: 'چک حذف شود؟', danger: true })){await api(`/cheques/${id}`,{method:'DELETE'}); await reload();}}
  async function doPay(){ if(!payC) return; await api(`/cheques/${payC.id}/pay`,{method:'POST',body:JSON.stringify({account:payAccount})}); setPayC(null); setPayAccount(''); await reload(); }
  async function bounce(c:Cheque){ if(await confirmDialog({ title: 'این چک برگشت خورده ثبت شود؟', danger: true })){ await api(`/cheques/${c.id}/bounce`,{method:'POST',body:JSON.stringify({})}); await reload(); } }
  const received=list.filter(c=>c.type==='receivable'), issued=list.filter(c=>c.type==='payable');
  const overdue=cheques.filter(c=>cs(c)==='overdue'), near=cheques.filter(c=>cs(c)==='near');
  const inflow=cheques.filter(c=>c.type==='receivable'&&c.status!=='paid').reduce((s,c)=>s+Number(c.amount),0);
  const outflow=cheques.filter(c=>c.type==='payable'&&c.status!=='paid').reduce((s,c)=>s+Number(c.amount),0);
  function Card({c}:{c:Cheque}){ const st=cs(c); const tone=st==='paid'?'emerald':st==='overdue'?'red':st==='near'?'amber':st==='bounced'?'red':'zinc'; const dl=c.daysLeft;
    const menu=[...(c.status!=='paid'?[{label:'پاس شد',onClick:()=>{setPayC(c);setPayAccount(c.bank||(accounts[0]?.title||''));}}]:[]),...(c.status!=='paid'&&c.type==='receivable'?[{label:'برگشت خورد',onClick:()=>bounce(c)}]:[]),{label:'ویرایش',onClick:()=>setEditC({...c})},{label:'حذف',danger:true,onClick:()=>del(c.id)}];
    return <ActionRow actions={menu} className={`rounded-2xl p-3 border ${tone==='emerald'?'bg-emerald-500/10 border-emerald-500/20':tone==='red'?'bg-red-500/10 border-red-500/30':tone==='amber'?'bg-amber-500/10 border-amber-500/30':'bg-zinc-100 dark:bg-zinc-900 border-black/5 dark:border-white/5'}`}>
      <div className="flex justify-between items-start"><div><b className="text-xs">{c.title}</b>{c.personName&&<div className="text-[9px] text-zinc-500">{c.personName}{c.bank?` • ${c.bank}`:''}</div>}</div><b className="text-xs">{money(c.amount)}</b></div>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-500"><span>سررسید: {c.dueDate||'—'}</span><span>{c.status!=='paid'&&typeof dl==='number'?(dl<0?`${Math.abs(dl).toLocaleString('fa-IR')} روز گذشته`:`${dl.toLocaleString('fa-IR')} روز مانده`):''}</span></div>
      <div className="mt-2 flex flex-wrap gap-1 items-center"><span className="badge">{c.type==='receivable'?'دریافتی':'صادره'}</span><span className={`badge ${st==='overdue'?'!bg-red-500/15 !text-red-500':st==='near'?'!bg-amber-500/15 !text-amber-600':st==='paid'?'!bg-emerald-500/15 !text-emerald-500':''}`}>{CHEQUE_STATUS_FA[st]||st}</span></div>
      <div className="mt-2 flex gap-3 text-[10px]">{c.status!=='paid'&&<button onClick={()=>{setPayC(c);setPayAccount(c.bank||(accounts[0]?.title||''));}} className="op-btn-green">پاس شد</button>}{c.status!=='paid'&&c.type==='receivable'&&<button onClick={()=>bounce(c)} className="op-btn-danger">برگشت خورد</button>}<button onClick={()=>setEditC({...c})} className="op-btn">ویرایش</button><button onClick={()=>del(c.id)} className="op-btn-danger">حذف</button></div>
    </ActionRow>;
  }
  return <div className="p-4 space-y-4">
    <ListHeader title="چک‌ها" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجوی چک یا شخص..." />
    {/* خلاصهٔ وضعیت */}
    <div className="grid grid-cols-2 gap-2"><ReportCard label="دریافتنی در جریان" value={inflow} tone="green"/><ReportCard label="پرداختنی در جریان" value={outflow} tone="red"/></div>
    {(overdue.length>0||near.length>0)&&<div className="space-y-2">{overdue.length>0&&<div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] text-red-700 dark:text-red-300">⚠️ {overdue.length.toLocaleString('fa-IR')} چک معوق (گذشته از سررسید) دارید.</div>}{near.length>0&&<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-700 dark:text-amber-300">🔔 {near.length.toLocaleString('fa-IR')} چک نزدیک سررسید (تا ۷ روز).</div>}</div>}
    <div className="grid grid-cols-2 gap-2"><select className="input" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">همه</option><option value="receivable">دریافتی</option><option value="payable">صادره</option><option value="overdue">معوق</option><option value="near">نزدیک سررسید</option><option value="paid">پاس شده</option><option value="bounced">برگشتی</option></select><select className="input" value={sort} onChange={e=>setSort(e.target.value as any)}><option value="date">مرتب‌سازی: سررسید</option><option value="amount">مرتب‌سازی: مبلغ</option></select></div>
    {show&&<Modal title="ثبت چک" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setForm({...form,type:'receivable'})} className={`pill ${form.type==='receivable'?'active-green':''}`}>دریافتی</button><button type="button" onClick={()=>setForm({...form,type:'payable'})} className={`pill ${form.type==='payable'?'active-red':''}`}>صادره</button></div><input className="input" placeholder="عنوان چک" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required/><AmountInput value={form.amount} onChange={v=>setForm({...form,amount:v})} placeholder="مبلغ (تومان)" className="!w-full" /><JalaliDatePicker value={form.dueDate} onChange={v=>setForm({...form,dueDate:v})} placeholder="تاریخ سررسید"/><SearchSelect value={form.personName} onChange={v=>setForm({...form,personName:v})} placeholder="طرف حساب (اختیاری)" allowNew options={persons.map(p=>({id:p.id,label:p.name,value:p.name}))}/><input className="input" placeholder="بانک / شماره سریال (اختیاری)" value={form.bank} onChange={e=>setForm({...form,bank:e.target.value})}/><button className="primary-btn">ثبت چک</button></form></Modal>}
    {editC&&<Modal title="ویرایش چک" onClose={()=>setEditC(null)}><form onSubmit={saveEdit} className="space-y-2"><input className="input" value={editC.title} onChange={e=>setEditC({...editC,title:e.target.value})} placeholder="عنوان"/><AmountInput value={editC.amount} onChange={v=>setEditC({...editC,amount:Number(v)})} placeholder="مبلغ"/><JalaliDatePicker value={editC.dueDate} onChange={v=>setEditC({...editC,dueDate:v})} placeholder="تاریخ سررسید"/><input className="input" value={editC.bank||''} onChange={e=>setEditC({...editC,bank:e.target.value})} placeholder="بانک"/><button className="primary-btn">ذخیره</button></form></Modal>}
    {payC&&<Modal title={`پاس کردن «${payC.title}»`} onClose={()=>setPayC(null)}><div className="space-y-2"><p className="text-[11px] text-zinc-500">مبلغ {money(payC.amount)} تومان {payC.type==='receivable'?'به حساب واریز':'از حساب برداشت'} می‌شود و سند حسابداری ثبت می‌گردد.</p><SearchSelect value={payAccount} onChange={setPayAccount} placeholder="انتخاب حساب مقصد" allowNew options={accounts.map(a=>({id:a.id,label:a.title,value:a.title,hint:money(a.balance||0)}))}/><button onClick={doPay} className="primary-btn">تایید پاس شدن</button></div></Modal>}
    <h3 className="text-xs font-bold text-emerald-500">چک‌های دریافتی</h3><div className="space-y-2">{received.map(c=><Card key={c.id} c={c}/>)}{!received.length&&<Empty text="چک دریافتی ندارید."/>}</div>
    <h3 className="text-xs font-bold text-red-500">چک‌های صادره</h3><div className="space-y-2">{issued.map(c=><Card key={c.id} c={c}/>)}{!issued.length&&<Empty text="چک صادره ندارید."/>}</div>
  </div>;
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


const PERSON_KINDS: Record<string,string> = { person: 'شخص', customer: 'مشتری', supplier: 'تامین‌کننده', expert: 'کارشناس' };
function exportCSV(filename: string, rows: string[][]) {
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
function PersonForm({ initial, onSubmit, submitLabel }: { initial?: Partial<Person>; onSubmit: (p: Partial<Person>) => void; submitLabel: string }) {
  const [f, setF] = useState<Partial<Person>>({ name: '', mobile: '', nationalId: '', address: '', kind: 'person', note: '', ...initial });
  const [tagInput, setTagInput] = useState((initial?.tags || []).join('، '));
  return <form onSubmit={e => { e.preventDefault(); onSubmit({ ...f, tags: tagInput.split(/[،,]/).map(t => t.trim()).filter(Boolean) }); }} className="space-y-2">
    <input className="input" placeholder="نام و نام خانوادگی *" value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} required />
    <input className="input" placeholder="موبایل (مثل ۰۹۱۲...)" value={f.mobile || ''} onChange={e => setF({ ...f, mobile: e.target.value })} />
    <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="کد ملی" value={f.nationalId || ''} onChange={e => setF({ ...f, nationalId: e.target.value })} /><select className="input" value={f.kind || 'person'} onChange={e => setF({ ...f, kind: e.target.value })}>{Object.entries(PERSON_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    <input className="input" placeholder="آدرس" value={f.address || ''} onChange={e => setF({ ...f, address: e.target.value })} />
    <input className="input" placeholder="برچسب‌ها (با ، جدا کن)" value={tagInput} onChange={e => setTagInput(e.target.value)} />
    <textarea className="input" rows={2} placeholder="یادداشت" value={f.note || ''} onChange={e => setF({ ...f, note: e.target.value })} />
    <button className="primary-btn">{submitLabel}</button>
  </form>;
}
function PersonsScreen({ api, persons, reload }: { api: <T>(u: string, o?: RequestInit) => Promise<T>; persons: Person[]; reload: () => Promise<void>; }) {
  const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [editP,setEditP]=useState<Person|null>(null); const [selected, setSelected] = useState<Person | null>(null); const [ledger, setLedger] = useState<Transaction[]>([]); const [ptab,setPtab]=useState<'all'|'debtor'|'creditor'>('all'); const [mergeFrom,setMergeFrom]=useState<Person|null>(null); const [ledgerEdit,setLedgerEdit]=useState<Transaction|null>(null);
  const list=persons.filter(p=>p.name.includes(q)||(p.mobile||'').includes(q)||(p.tags||[]).some(t=>t.includes(q))).filter(p=>ptab==='all'||(ptab==='creditor'&&p.balance>0)||(ptab==='debtor'&&p.balance<0));
  async function add(p: Partial<Person>){ await api('/persons',{method:'POST',body:JSON.stringify(p)}); setShow(false); await reload(); }
  async function saveEdit(p: Partial<Person>){ if(!editP) return; await api(`/persons/${editP.id}`,{method:'PUT',body:JSON.stringify(p)}); setEditP(null); await reload(); }
  async function open(p: Person){ setSelected(p); setLedger(await api<Transaction[]>(`/persons/${p.id}/ledger`)); }
  async function refreshLedger(){ if(!selected) return; setLedger(await api<Transaction[]>(`/persons/${selected.id}/ledger`)); await reload(); const fresh=(await api<Person[]>('/persons')).find(x=>x.id===selected.id); if(fresh) setSelected(fresh); }
  async function delLedgerTx(t: Transaction){ if(await confirmDialog({ title:'حذف این تراکنش؟', message:`${t.title} - ${money(t.amount)} تومان`, danger:true })){ await api(`/transactions/${t.id}`,{method:'DELETE'}); toast('حذف شد'); await refreshLedger(); } }
  async function del(p: Person){
    if(!await confirmDialog({ title: `«${p.name}» حذف شود؟`, danger: true })) return;
    try { await api(`/persons/${p.id}`,{method:'DELETE'}); await reload(); }
    catch(e){ if(e instanceof Error && /سند مالی/.test(e.message)){ if(await confirmDialog({ title: `${p.name} دارای ${(p.docCount||0).toLocaleString('fa-IR')} سند است. با حذف اجباری، اسناد بدون شخص می‌مانند. ادامه؟`, danger: true })){ await api(`/persons/${p.id}?force=1`,{method:'DELETE'}); await reload(); } } else await alertDialog({ title: e instanceof Error?e.message:'خطا' }); }
  }
  async function sendReminder(p: Person){ const r=await api<{text:string;whatsapp:string}>(`/persons/${p.id}/reminder`); if(r.whatsapp){ window.open(r.whatsapp,'_blank'); } else { navigator.clipboard?.writeText(r.text); await alertDialog({ title: 'شماره موبایل ثبت نشده؛ متن یادآوری کپی شد:\n\n'+r.text }); } }
  function exportPerson(p: Person){ const rows=[['تاریخ','عنوان','نوع','دسته','مبلغ'],...ledger.map(t=>[t.date,t.title,t.type==='income'?'بستانکار':'بدهکار',t.category,String(t.amount)])]; exportCSV(`حساب-${p.name}.csv`,rows); }
  async function doMerge(target: Person){ if(!mergeFrom) return; if(!await confirmDialog({ title: `«${mergeFrom.name}» در «${target.name}» ادغام شود؟ همهٔ اسناد منتقل می‌شوند.`, danger: true })) return; await api('/persons/merge',{method:'POST',body:JSON.stringify({sourceId:mergeFrom.id,targetId:target.id})}); setMergeFrom(null); await reload(); }

  if (selected) return <div className="p-4 space-y-3">
    <button onClick={()=>setSelected(null)} className="text-[11px] text-[#3b38a0]">‹ بازگشت به لیست</button>
    <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-black p-4 text-white border border-white/10">
      <div className="flex items-center justify-between"><div><h3 className="font-black text-sm">{selected.name}</h3><span className="text-[10px] text-zinc-400">{PERSON_KINDS[selected.kind||'person']}{selected.mobile?` • ${selected.mobile}`:''}</span></div><span className={`text-sm font-black ${selected.balance>=0?'text-emerald-400':'text-red-400'}`}>{money(Math.abs(selected.balance))}</span></div>
      <p className={`mt-1 text-[10px] ${selected.balance>=0?'text-emerald-400':'text-red-400'}`}>{selected.balance>=0?'این مبلغ از او طلب دارید':'این مبلغ به او بدهکارید'}</p>
      {(selected.nationalId||selected.address)&&<p className="mt-2 text-[10px] text-zinc-400 leading-5">{selected.nationalId&&`کد ملی: ${selected.nationalId}`}{selected.address&&` • ${selected.address}`}</p>}
      {(selected.tags||[]).length>0&&<div className="mt-2 flex flex-wrap gap-1">{selected.tags!.map(t=><span key={t} className="rounded-full bg-black/10 dark:bg-white/10 px-2 py-0.5 text-[9px]">{t}</span>)}</div>}
    </div>
    <div className="grid grid-cols-3 gap-2"><button onClick={()=>sendReminder(selected)} className="rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 p-3 text-[10px] font-bold">یادآوری بدهی</button><button onClick={()=>exportPerson(selected)} className="rounded-2xl bg-[#3b38a0]/15 text-[#3b38a0] dark:text-[#b2b0e8] p-3 text-[10px] font-bold">خروجی Excel/CSV</button><button onClick={()=>{setEditP(selected);setSelected(null);}} className="rounded-2xl bg-zinc-200 dark:bg-zinc-800 p-3 text-[10px] font-bold">ویرایش پروفایل</button></div>
    <h4 className="text-xs font-bold">دفتر حساب</h4>
    <div className="space-y-2">{ledger.map(t=><ActionRow key={t.id} actions={[{label:'ویرایش',onClick:()=>setLedgerEdit(t)},{label:'حذف',danger:true,onClick:()=>delLedgerTx(t)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900/70 border border-black/5 dark:border-white/5 p-3"><TxRow tx={t}/><div className="mt-2 flex gap-3 text-[10px] justify-end"><button onClick={()=>setLedgerEdit(t)} className="op-btn">ویرایش</button><button onClick={()=>delLedgerTx(t)} className="op-btn-danger">حذف</button></div></ActionRow>)}{!ledger.length&&<Empty text="تاریخچه‌ای با این شخص نیست."/>}</div>
    {ledgerEdit&&<TxEditModal tx={ledgerEdit} api={api} onClose={()=>setLedgerEdit(null)} onDone={refreshLedger}/>}
    {editP&&<Modal title={`ویرایش ${editP.name}`} onClose={()=>setEditP(null)}><PersonForm initial={editP} submitLabel="ذخیره تغییرات" onSubmit={saveEdit}/></Modal>}
  </div>;

  return <div className="p-4 space-y-4">
    <ListHeader title="اشخاص / بدهکار و بستانکار" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجو بر اساس نام، موبایل یا برچسب..." />
    <div className="grid grid-cols-3 gap-2"><button onClick={()=>setPtab('all')} className={`pill ${ptab==='all'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>همه</button><button onClick={()=>setPtab('creditor')} className={`pill ${ptab==='creditor'?'active-green':''}`}>طلبکار از او</button><button onClick={()=>setPtab('debtor')} className={`pill ${ptab==='debtor'?'active-red':''}`}>بدهکار به او</button></div>
    {mergeFrom&&<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-[10px] text-amber-700 dark:text-amber-300 flex items-center justify-between"><span>«{mergeFrom.name}» را در کدام شخص ادغام می‌کنی؟ روی شخص مقصد بزن.</span><button onClick={()=>setMergeFrom(null)} className="underline">لغو</button></div>}
    {show&&<Modal title="افزودن شخص" onClose={()=>setShow(false)}><PersonForm submitLabel="ذخیره" onSubmit={add}/></Modal>}
    {editP&&<Modal title={`ویرایش ${editP.name}`} onClose={()=>setEditP(null)}><PersonForm initial={editP} submitLabel="ذخیره تغییرات" onSubmit={saveEdit}/></Modal>}
    <div className="space-y-2">{list.map(p=><ActionRow key={p.id} actions={[{label:'دفتر حساب',onClick:()=>open(p)},{label:'ویرایش',onClick:()=>setEditP(p)},{label:'ادغام با…',onClick:()=>setMergeFrom(p)},{label:'حذف',danger:true,onClick:()=>del(p)}]} className={`w-full rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 ${mergeFrom&&mergeFrom.id!==p.id?'ring-2 ring-amber-400 cursor-pointer':''}`}>
      <div onClick={()=>mergeFrom?(mergeFrom.id!==p.id&&doMerge(p)):open(p)} className="cursor-pointer"><div className="flex justify-between items-start"><div><div className="text-xs font-bold flex items-center gap-1">{p.name}{p.kind&&p.kind!=='person'&&<span className="badge">{PERSON_KINDS[p.kind]}</span>}</div><div className="text-[9px] text-zinc-500 mt-0.5">{p.mobile||''}{p.docCount?` • ${toFaDigits(p.docCount)} سند`:''}</div></div><span className={`text-[11px] font-bold ${p.balance>=0?'text-emerald-500':'text-red-500'}`}>{money(Math.abs(p.balance))} {p.balance>=0?'طلب':'بدهی'}</span></div></div>
      {!mergeFrom&&<div className="mt-2 flex gap-2 text-[10px]"><button onClick={()=>open(p)} className="op-btn">دفتر حساب</button><button onClick={()=>setEditP(p)} className="op-btn">ویرایش</button><button onClick={()=>setMergeFrom(p)} className="op-btn">ادغام</button><button onClick={()=>del(p)} className="op-btn-danger">حذف</button></div>}
    </ActionRow>)}{!list.length&&<Empty text="شخصی پیدا نشد."/>}</div>
  </div>;
}
function AccountForm({ val, set, submit, label }: { val: any; set: (v: any) => void; submit: (e: React.FormEvent) => void; label: string }) {
  return <form onSubmit={submit} className="space-y-2"><input className="input" placeholder="نام حساب / صندوق *" value={val.title||''} onChange={e=>set({...val,title:e.target.value})} required/><select className="input" value={val.type||'bank'} onChange={e=>set({...val,type:e.target.value})}><option value="bank">بانکی</option><option value="cash">نقدی / صندوق</option></select><input className="input" placeholder="نام بانک" value={val.bank||''} onChange={e=>set({...val,bank:e.target.value})}/><input className="input" placeholder="شماره حساب" value={val.accountNumber||''} onChange={e=>set({...val,accountNumber:e.target.value})}/><input className="input" placeholder="شماره کارت" value={val.card||''} onChange={e=>set({...val,card:e.target.value})}/><input className="input" placeholder="شماره شبا" value={val.sheba||''} onChange={e=>set({...val,sheba:e.target.value})}/>{val.balance!==undefined&&<input className="input" placeholder="مانده اولیه (تومان)" value={val.balance||''} onChange={e=>set({...val,balance:e.target.value})}/>}<button className="primary-btn">{label}</button></form>;
}
function AccountsScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [items,setItems]=useState<any[]>([]); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [editA,setEditA]=useState<any|null>(null);
  const [f,setF]=useState<any>({ title:'', type:'bank', balance:'', accountNumber:'', card:'', sheba:'', bank:'' });
  async function load(){ setItems(await api<any[]>('/accounts')); }
  useEffect(()=>{void load()},[]);
  async function add(e:React.FormEvent){e.preventDefault(); await api<any>('/accounts',{method:'POST',body:JSON.stringify({...f,balance:Number(f.balance||0)})}); setF({title:'',type:'bank',balance:'',accountNumber:'',card:'',sheba:'',bank:''}); setShow(false); await load();}
  async function saveEdit(e:React.FormEvent){e.preventDefault(); if(!editA) return; await api(`/accounts/${editA.id}`,{method:'PUT',body:JSON.stringify(editA)}); setEditA(null); await load();}
  async function del(a:any){ if(!await confirmDialog({ title: `«${a.title}» حذف شود؟`, danger: true })) return; try{ await api(`/accounts/${a.id}`,{method:'DELETE'}); await load(); }catch(e){ if(e instanceof Error&&/گردش/.test(e.message)){ if(await confirmDialog({ title: 'این حساب دارای گردش است. حذف اجباری؟', danger: true })){ await api(`/accounts/${a.id}?force=1`,{method:'DELETE'}); await load(); } } else await alertDialog({ title: e instanceof Error?e.message:'خطا' }); } }
  const list=items.filter(a=>a.title.includes(q)||(a.accountNumber||'').includes(q)||(a.card||'').includes(q));
  return <div className="p-4 space-y-4"><ListHeader title="حساب‌ها و صندوق‌ها" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجوی حساب، شماره یا کارت..." />
    {show&&<Modal title="افزودن حساب" onClose={()=>setShow(false)}><AccountForm val={f} set={setF} submit={add} label="ذخیره"/></Modal>}
    {editA&&<Modal title={`ویرایش ${editA.title}`} onClose={()=>setEditA(null)}><AccountForm val={editA} set={setEditA} submit={saveEdit} label="ذخیره تغییرات"/></Modal>}
    <div className="space-y-2">{list.map(a=><ActionRow key={a.id} actions={[{label:'ویرایش',onClick:()=>setEditA({...a,balance:a.balance})},{label:'حذف',danger:true,onClick:()=>del(a)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs flex items-center gap-1">{a.title}<span className="badge">{a.type==='cash'?'صندوق':'بانکی'}</span></b><b className="text-xs">{money(a.balance||0)} تومان</b></div>{(a.accountNumber||a.card||a.sheba)&&<p className="text-[9px] text-zinc-500 mt-1 leading-5">{a.card?`کارت: ${a.card}`:''}{a.accountNumber?` • حساب: ${a.accountNumber}`:''}{a.sheba?` • شبا: ${a.sheba}`:''}</p>}<div className="mt-2 flex gap-3 text-[10px]"><button onClick={()=>setEditA({...a,balance:a.balance})} className="op-btn">ویرایش</button><button onClick={()=>del(a)} className="op-btn-danger">حذف</button></div></ActionRow>)}{!list.length&&<Empty text="حسابی ثبت نشده است."/>}</div></div>;
}
type AgingRow = { id: string; name: string; mobile: string; balance: number; days: number; bucket: string };
type Aging = { buckets: { name: string; value: number }[]; rows: AgingRow[]; total: number; count: number };
function ClaimsScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [q, setQ] = useState('');
  const [aging, setAging] = useState<Aging | null>(null);
  const [bucket, setBucket] = useState('');
  const [sort, setSort] = useState<'amount' | 'days'>('amount');
  const [minAmount, setMinAmount] = useState('');
  useEffect(() => { void api<Aging>('/receivables/aging').then(setAging).catch(() => {}); }, []);
  async function remind(r: AgingRow) { const x = await api<{ text: string; whatsapp: string }>(`/persons/${r.id}/reminder`); if (x.whatsapp) window.open(x.whatsapp, '_blank'); else { navigator.clipboard?.writeText(x.text); await alertDialog({ title: 'شماره موبایل ثبت نشده؛ متن کپی شد:\n\n' + x.text }); } }
  if (!aging) return <div className="p-4"><Empty text="در حال بارگذاری مطالبات..." /></div>;
  let rows = aging.rows.filter(r => r.name.includes(q) || r.mobile.includes(q));
  if (bucket) rows = rows.filter(r => r.bucket === bucket);
  if (minAmount) rows = rows.filter(r => r.balance >= Number(minAmount.replace(/[,٬]/g, '')));
  rows = [...rows].sort((a, b) => sort === 'amount' ? b.balance - a.balance : b.days - a.days);
  const bucketColors: Record<string, string> = { '۰ تا ۳۰ روز': 'emerald', '۳۱ تا ۶۰ روز': 'amber', '۶۱ تا ۹۰ روز': 'orange', 'بیش از ۹۰ روز': 'red' };
  const maxBucket = Math.max(1, ...aging.buckets.map(b => b.value));
  return <div className="p-4 space-y-4">
    <div><h2 className="text-sm font-bold">مطالبات مشتریان و گزارش سن (Aging)</h2><p className="text-[10px] text-zinc-500 mt-1">قدمت طلب‌ها، فیلتر پیشرفته و یادآوری دریافت وجه</p></div>
    <div className="grid grid-cols-2 gap-2"><ReportCard label="تعداد بدهکاران" value={aging.count} tone="gray" /><ReportCard label="جمع مطالبات" value={aging.total} tone="green" /></div>
    {/* نمودار سن مطالبات */}
    <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 border border-black/5 dark:border-white/5"><h3 className="text-xs font-bold mb-3">سن مطالبات</h3><div className="space-y-2">{aging.buckets.map(b => { const c = bucketColors[b.name] || 'zinc'; const on = bucket === b.name; return <button key={b.name} onClick={() => setBucket(on ? '' : b.name)} className={`w-full text-right ${on ? 'opacity-100' : 'opacity-90'}`}><div className="flex justify-between text-[10px] mb-1"><span className={on ? 'font-bold' : ''}>{b.name}{on ? ' ●' : ''}</span><b>{money(b.value)}</b></div><div className="h-2.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden"><div className="h-2.5 rounded-full" style={{ width: `${Math.max(3, b.value / maxBucket * 100)}%`, background: `var(--tw-${c})`, backgroundColor: c === 'emerald' ? '#10b981' : c === 'amber' ? '#f59e0b' : c === 'orange' ? '#f97316' : '#ef4444' }} /></div></button>; })}</div>{bucket && <button onClick={() => setBucket('')} className="mt-2 text-[10px] text-[#3b38a0]">حذف فیلتر بازه</button>}</div>
    {/* فیلترهای پیشرفته */}
    <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input className="input !pr-9" placeholder="جستجوی مشتری یا موبایل..." value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="حداقل مبلغ" value={minAmount} onChange={e => setMinAmount(e.target.value)} /><select className="input" value={sort} onChange={e => setSort(e.target.value as any)}><option value="amount">مرتب‌سازی: مبلغ</option><option value="days">مرتب‌سازی: قدمت</option></select></div>
    <div className="space-y-2">{rows.map(r => <div key={r.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between items-start"><div><b className="text-xs">{r.name}</b><div className="text-[9px] text-zinc-500 mt-0.5">{r.bucket} • {r.days.toLocaleString('fa-IR')} روز{r.mobile ? ` • ${r.mobile}` : ''}</div></div><span className="text-emerald-500 text-xs font-bold">{money(r.balance)} تومان</span></div><button onClick={() => remind(r)} className="mt-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 text-[10px] font-bold">ارسال یادآوری</button></div>)}{!rows.length && <Empty text="مطالبه‌ای با این فیلتر پیدا نشد." />}</div>
  </div>;
}
function TxEditModal({ tx, api, onClose, onDone }: { tx: Transaction; api: <T>(u: string, o?: RequestInit) => Promise<T>; onClose: () => void; onDone: () => void }) {
  const [d,setD]=useState({ title:tx.title, amount:String(tx.amount), type:tx.type, category:tx.category });
  async function save(e:React.FormEvent){ e.preventDefault(); await api(`/transactions/${tx.id}`,{method:'PUT',body:JSON.stringify({...d,amount:Number(d.amount)})}); onDone(); onClose(); }
  return <Modal title="ویرایش تراکنش" onClose={onClose}><form onSubmit={save} className="space-y-2"><input className="input" value={d.title} onChange={e=>setD({...d,title:e.target.value})} placeholder="عنوان"/><AmountInput value={d.amount} onChange={v=>setD({...d,amount:v})} placeholder="مبلغ"/><input className="input" value={d.category} onChange={e=>setD({...d,category:e.target.value})} placeholder="دسته‌بندی"/><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setD({...d,type:'expense'})} className={`pill ${d.type==='expense'?'active-red':''}`}>هزینه</button><button type="button" onClick={()=>setD({...d,type:'income'})} className={`pill ${d.type==='income'?'active-green':''}`}>درآمد</button></div><button className="primary-btn">ذخیره</button></form></Modal>;
}
function HistoryScreen({ api, transactions, reload }: { api: <T>(u: string, o?: RequestInit) => Promise<T>; transactions: Transaction[]; reload: () => Promise<void> }) {
  const [q,setQ]=useState(''); const [sort,setSort]=useState<'new'|'old'|'amount'|'amountAsc'>('new'); const [tf,setTf]=useState('all'); const [edit,setEdit]=useState<Transaction|null>(null);
  const [selMode,setSelMode]=useState(false); const [sel,setSel]=useState<Set<string>>(new Set()); const [page,setPage]=useState(0); const PER=15;
  const cats=Array.from(new Set(transactions.map(t=>t.category)));
  const list=transactions.filter(t=>(t.title.includes(q)||t.category.includes(q))&&(tf==='all'||tf===t.type||tf===t.category)).sort((a,b)=>sort==='amount'?Number(b.amount)-Number(a.amount):sort==='amountAsc'?Number(a.amount)-Number(b.amount):sort==='old'?String(a.createdAt).localeCompare(String(b.createdAt)):String(b.createdAt).localeCompare(String(a.createdAt)));
  async function del(t:Transaction){ if(await confirmDialog({ title: 'تراکنش حذف شود؟', message: `«${t.title}» - ${money(t.amount)} تومان`, danger: true })){ await api(`/transactions/${t.id}`,{method:'DELETE'}); toast('حذف شد'); await reload(); } }
  function toggle(id:string){ setSel(p=>{ const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n; }); }
  function enterSel(id:string){ setSelMode(true); setSel(new Set([id])); }
  async function bulkDelete(){ if(!sel.size) return; if(await confirmDialog({ title: `حذف ${sel.size.toLocaleString('fa-IR')} تراکنش؟`, message:'این عملیات قابل بازگشت نیست.', danger:true })){ for(const id of sel) await api(`/transactions/${id}`,{method:'DELETE'}); toast(`${sel.size.toLocaleString('fa-IR')} مورد حذف شد`); setSel(new Set()); setSelMode(false); await reload(); } }
  const total=list.filter(t=>sel.has(t.id)).reduce((s,t)=>s+Number(t.amount),0);
  return <div className="p-4 space-y-3"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">تاریخچه تراکنش‌ها</h2><button onClick={()=>{setSelMode(!selMode);setSel(new Set());}} className="text-[11px] text-[#3b38a0] dark:text-[#b2b0e8]">{selMode?'لغو انتخاب':'انتخاب'}</button></div>
    <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input className="input !pr-9" placeholder="جستجو..." value={q} onChange={e=>setQ(e.target.value)}/></div>
    <div className="grid grid-cols-2 gap-2"><select className="input" value={tf} onChange={e=>setTf(e.target.value)}><option value="all">همه</option><option value="income">درآمد</option><option value="expense">هزینه</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select><select className="input" value={sort} onChange={e=>setSort(e.target.value as any)}><option value="new">جدیدترین</option><option value="old">قدیمی‌ترین</option><option value="amount">بیشترین مبلغ</option><option value="amountAsc">کمترین مبلغ</option></select></div>
    {edit&&<TxEditModal tx={edit} api={api} onClose={()=>setEdit(null)} onDone={reload}/>}
    {list.slice(page*PER,(page+1)*PER).map(t=><TxHistoryRow key={t.id} t={t} selMode={selMode} selected={sel.has(t.id)} onToggle={()=>toggle(t.id)} onEdit={()=>setEdit(t)} onDelete={()=>del(t)} onEnterSel={()=>enterSel(t.id)} />)}{!list.length&&<Empty text="تاریخچه خالی است."/>}
    <Pager page={page} pageCount={Math.ceil(list.length/PER)} onChange={setPage} />
    {selMode&&<div className="fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-zinc-950 px-4 py-2.5 text-white shadow-2xl border border-white/10"><span className="text-[11px]">{sel.size.toLocaleString('fa-IR')} مورد • {money(total)}</span><button onClick={bulkDelete} disabled={!sel.size} className="rounded-xl bg-red-500 px-3 py-1.5 text-[11px] font-bold disabled:opacity-40">حذف گروهی</button></div>}
  </div>;
}
function TxHistoryRow({ t, selMode, selected, onToggle, onEdit, onDelete, onEnterSel }: { t: Transaction; selMode: boolean; selected: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onEnterSel: () => void }) {
  const lp = useLongPress(() => [{ label: 'ویرایش', onClick: onEdit }, { label: 'انتخاب چندتایی', onClick: onEnterSel }, { label: 'حذف', danger: true, onClick: onDelete }]);
  return <div {...(selMode ? {} : lp)} onClick={() => selMode && onToggle()} className={`rounded-2xl border p-3 transition ${selMode && selected ? 'border-[#3b38a0] bg-[#3b38a0]/10' : 'bg-zinc-100 dark:bg-zinc-900/70 border-black/5 dark:border-white/5'}`}>
    <div className="flex items-center gap-2">{selMode && <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] ${selected ? 'bg-[#3b38a0] border-[#3b38a0] text-white' : 'border-zinc-400'}`}>{selected ? '✓' : ''}</span>}<div className="flex-1"><TxRow tx={t} /></div></div>
    {!selMode && <div className="mt-2 flex gap-3 text-[10px] justify-end"><button onClick={onEdit} className="op-btn">ویرایش</button><button onClick={onDelete} className="op-btn-danger">حذف</button></div>}
  </div>;
}
function IncomeExpenseScreen({ api, transactions, reload }: { api: <T>(u: string, o?: RequestInit) => Promise<T>; transactions: Transaction[]; reload: () => Promise<void> }) {
  const [edit,setEdit]=useState<Transaction|null>(null);
  async function del(t:Transaction){ if(await confirmDialog({ title: 'تراکنش حذف شود؟', danger: true })){ await api(`/transactions/${t.id}`,{method:'DELETE'}); await reload(); } }
  const Row=({t}:{t:Transaction})=><ActionRow actions={[{label:'ویرایش',onClick:()=>setEdit(t)},{label:'حذف',danger:true,onClick:()=>del(t)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900/70 border border-black/5 dark:border-white/5 p-3"><TxRow tx={t}/><div className="mt-2 flex gap-3 text-[10px] justify-end"><button onClick={()=>setEdit(t)} className="op-btn">ویرایش</button><button onClick={()=>del(t)} className="op-btn-danger">حذف</button></div></ActionRow>;
  return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">درآمدها و هزینه‌ها</h2>{edit&&<TxEditModal tx={edit} api={api} onClose={()=>setEdit(null)} onDone={reload}/>}<h3 className="text-xs text-emerald-500">درآمدها</h3><div className="space-y-2">{transactions.filter(t=>t.type==='income').map(t=><Row key={t.id} t={t}/>)}</div><h3 className="text-xs text-red-500 mt-4">هزینه‌ها</h3><div className="space-y-2">{transactions.filter(t=>t.type==='expense').map(t=><Row key={t.id} t={t}/>)}</div></div>;
}
const DEFAULT_CATEGORIES = ['حمل و نقل','خوراکی و سوپرمارکت','رستوران و کافه','حقوق و درآمد','اقساط و بدهی','بدهکار / بدهی','بستانکار / طلب','مسکن و اجاره','قبوض و خدمات','درمان و سلامت','پوشاک','آموزش','سفر','تفریح و اشتراک','سرمایه‌گذاری','سایر'];
function CategoriesScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [cats,setCats]=useState<string[]>([]); const [name,setName]=useState(''); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [tab,setTab]=useState<'all'|'default'|'custom'>('all');
  useEffect(()=>{void api<string[]>('/categories').then(c=>setCats(Array.from(new Set([...DEFAULT_CATEGORIES,...c]))))},[]);
  async function add(e:React.FormEvent){e.preventDefault(); if(!name.trim()) return; const c=await api<string[]>('/categories',{method:'POST',body:JSON.stringify({name:name.trim()})}); setCats(c); setName(''); setShow(false);}
  async function edit(c:string){ const n=await promptDialog({ title: 'نام جدید دسته‌بندی', defaultValue: String(c) }); if(!n||n===c) return; setCats(await api<string[]>(`/categories/${encodeURIComponent(c)}`,{method:'PUT',body:JSON.stringify({name:n.trim()})})); }
  async function del(c:string){ if(await confirmDialog({ title: `دسته‌بندی «${c}» حذف شود؟`, danger: true })) setCats(await api<string[]>(`/categories/${encodeURIComponent(c)}`,{method:'DELETE'})); }
  const isDefault=(c:string)=>DEFAULT_CATEGORIES.includes(c);
  const list=cats.filter(c=>c.includes(q)).filter(c=>tab==='all'||(tab==='default'&&isDefault(c))||(tab==='custom'&&!isDefault(c)));
  return <div className="p-4 space-y-4">
    <ListHeader title="دسته‌بندی‌ها" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجوی دسته‌بندی..." />
    <div className="grid grid-cols-3 gap-2"><button onClick={()=>setTab('all')} className={`pill ${tab==='all'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>همه ({cats.length.toLocaleString('fa-IR')})</button><button onClick={()=>setTab('default')} className={`pill ${tab==='default'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>پیش‌فرض</button><button onClick={()=>setTab('custom')} className={`pill ${tab==='custom'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>سفارشی</button></div>
    {show&&<Modal title="افزودن دسته‌بندی" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="نام دستهٔ جدید"/><button className="primary-btn">ذخیره</button></form></Modal>}
    <div className="space-y-2">{list.map(c=><ActionRow key={c} actions={[{label:'ویرایش',onClick:()=>edit(c)},{label:'حذف',danger:true,onClick:()=>del(c)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 flex justify-between items-center"><span className="flex items-center gap-2 text-xs font-bold">{c}{isDefault(c)&&<span className="badge">پیش‌فرض</span>}</span><div className="flex gap-3 text-[10px]"><button onClick={()=>edit(c)} className="op-btn">ویرایش</button><button onClick={()=>del(c)} className="op-btn-danger">حذف</button></div></ActionRow>)}{!list.length&&<Empty text="دسته‌بندی‌ای پیدا نشد."/>}</div>
  </div>;
}
function LedgerScreen({ persons, transactions }: { persons: Person[]; transactions: Transaction[] }) {
  const [q,setQ]=useState(''); const [page,setPage]=useState(0); const PER=15;
  const receivable=persons.filter(p=>p.balance>0).reduce((s,p)=>s+p.balance,0);
  const payable=Math.abs(persons.filter(p=>p.balance<0).reduce((s,p)=>s+p.balance,0));
  const list=transactions.filter(t=>t.title.includes(q)||t.category.includes(q)||(t.party||'').includes(q));
  return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">گردش حساب</h2>
    <div className="grid grid-cols-2 gap-2"><ReportCard label="جمع طلب از اشخاص" value={receivable} tone="green"/><ReportCard label="جمع بدهی به اشخاص" value={payable} tone="red"/></div>
    <div className="grid grid-cols-2 gap-2"><ReportCard label="تعداد اشخاص" value={persons.length} tone="gray" unit="نفر"/><ReportCard label="تعداد تراکنش‌ها" value={transactions.length} tone="purple" unit="مورد"/></div>
    <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input className="input !pr-9" placeholder="جستجو در گردش..." value={q} onChange={e=>{setQ(e.target.value);setPage(0);}}/></div>
    {list.slice(page*PER,(page+1)*PER).map(t=><TxRow key={t.id} tx={t}/>)}{!list.length&&<Empty text="گردشی پیدا نشد."/>}
    <Pager page={page} pageCount={Math.ceil(list.length/PER)} onChange={setPage}/>
  </div>;
}
function TrainingScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [items,setItems]=useState<any[]>([]); const [phrase,setPhrase]=useState(''); const [meaning,setMeaning]=useState(''); useEffect(()=>{void api<any[]>('/training').then(setItems)},[]); async function add(e:React.FormEvent){e.preventDefault(); const tr=await api<any>('/training',{method:'POST',body:JSON.stringify({phrase,meaning})}); setItems([tr,...items]); setPhrase(''); setMeaning('');} return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">آموزش دستیار</h2><p className="text-[10px] text-zinc-500 leading-5">اینجا جمله‌های اختصاصی خودت را به حافظه دستیار اضافه کن. این آموزش در حافظه ذخیره می‌شود و موتور محلی هنگام تشخیص جملات مشابه از آن کمک می‌گیرد.</p><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" placeholder="جمله کاربر: دنگ شامو حساب کردم" value={phrase} onChange={e=>setPhrase(e.target.value)}/><input className="input" placeholder="معنی: هزینه رستوران / طلب از دوستان" value={meaning} onChange={e=>setMeaning(e.target.value)}/><button className="primary-btn">آموزش بده</button></form>{items.map(i=><div key={i.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs"><b>{i.phrase}</b><p className="text-zinc-500 mt-1">{i.meaning}</p></div>)}</div> }

function ExpertsScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [experts,setExperts]=useState<any[]>([]); const [settlements,setSettlements]=useState<any[]>([]); const [report,setReport]=useState<any>(null); const [accounts,setAccounts]=useState<any[]>([]); const [name,setName]=useState(''); const [rate,setRate]=useState(''); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [tab,setTab]=useState<'list'|'report'>('list');
  const [payExpert,setPayExpert]=useState<any|null>(null); const [amount,setAmount]=useState(''); const [payAcc,setPayAcc]=useState('صندوق'); const [editEx,setEditEx]=useState<any|null>(null);
  async function load(){ const [e,s,r,a]=await Promise.all([api<any[]>('/experts'),api<any[]>('/expert-settlements'),api<any>('/experts/report'),api<any[]>('/accounts')]); setExperts(e); setSettlements(s); setReport(r); setAccounts(a); }
  useEffect(()=>{void load()},[]);
  async function addExpert(e:React.FormEvent){e.preventDefault(); if(!name.trim()) return; await api('/experts',{method:'POST',body:JSON.stringify({name:name.trim(),commissionRate:Number(rate||0)})}); setName(''); setRate(''); setShow(false); await load();}
  async function saveEdit(e:React.FormEvent){e.preventDefault(); if(!editEx) return; await api(`/experts/${editEx.id}`,{method:'PUT',body:JSON.stringify({name:editEx.name,commissionRate:Number(editEx.commissionRate||0)})}); setEditEx(null); await load(); toast('ذخیره شد');}
  async function pay(e:React.FormEvent){ e.preventDefault(); if(!payExpert||!amount) return; await api('/expert-settlements',{method:'POST',body:JSON.stringify({expertName:payExpert.name,amount:Number(amount||0),type:'payment',account:payAcc,note:'پرداخت دستی'})}); setAmount(''); setPayExpert(null); await load(); toast('تسویه ثبت شد'); }
  async function delEx(ex:any){ if(await confirmDialog({title:`«${ex.name}» حذف شود؟`,danger:true})){ await api(`/experts/${ex.id}`,{method:'DELETE'}); await load(); } }
  const list=experts.filter(ex=>ex.name.includes(q));
  return <div className="p-4 space-y-4">
    <ListHeader title="تسویه کارشناسان" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجوی کارشناس..." />
    <div className="grid grid-cols-2 gap-2"><button onClick={()=>setTab('list')} className={`pill ${tab==='list'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>کارشناسان</button><button onClick={()=>setTab('report')} className={`pill ${tab==='report'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>گزارش پورسانت</button></div>
    {show&&<Modal title="افزودن کارشناس" onClose={()=>setShow(false)}><form onSubmit={addExpert} className="space-y-2"><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="نام کارشناس" required/><AmountInput value={rate} onChange={setRate} placeholder="درصد پورسانت (مثلاً ۱۰)"/><button className="primary-btn">ذخیره</button></form></Modal>}
    {editEx&&<Modal title={`ویرایش ${editEx.name}`} onClose={()=>setEditEx(null)}><form onSubmit={saveEdit} className="space-y-2"><input className="input" value={editEx.name} onChange={e=>setEditEx({...editEx,name:e.target.value})} placeholder="نام"/><AmountInput value={String(editEx.commissionRate||'')} onChange={v=>setEditEx({...editEx,commissionRate:Number(v)})} placeholder="درصد پورسانت"/><button className="primary-btn">ذخیره</button></form></Modal>}
    {payExpert&&<Modal title={`پرداخت به ${payExpert.name}`} onClose={()=>setPayExpert(null)}><form onSubmit={pay} className="space-y-2"><p className="text-[10px] text-zinc-500">مانده فعلی: {money(Math.abs(Number(payExpert.balance||0)))} تومان</p><AmountInput value={amount} onChange={setAmount} placeholder="مبلغ پرداخت (تومان)"/><SearchSelect value={payAcc} onChange={setPayAcc} placeholder="از حساب" allowNew options={[{label:'صندوق',value:'صندوق'},...accounts.map(a=>({id:a.id,label:a.title,value:a.title}))]}/><button className="primary-btn">ثبت پرداخت + سند</button></form></Modal>}
    {tab==='list'?<>
    <div className="space-y-2">{list.map(ex=><ActionRow key={ex.id} actions={[{label:'پرداخت/تسویه',onClick:()=>{setPayExpert(ex);setAmount('');setPayAcc('صندوق');}},{label:'ویرایش',onClick:()=>setEditEx({...ex})},{label:'حذف',danger:true,onClick:()=>delEx(ex)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{ex.name}{ex.commissionRate?<span className="badge mr-1">{toFaDigits(ex.commissionRate)}٪ پورسانت</span>:null}</b><span className={Number(ex.balance||0)>0?'text-red-500 text-xs':'text-emerald-500 text-xs'}>مانده {money(Math.abs(Number(ex.balance||0)))}</span></div><div className="mt-2 flex gap-2 text-[10px]"><button onClick={()=>{setPayExpert(ex);setAmount('');setPayAcc('صندوق');}} className="op-btn-green">پرداخت/تسویه</button><button onClick={()=>setEditEx({...ex})} className="op-btn">ویرایش</button><button onClick={()=>delEx(ex)} className="op-btn-danger">حذف</button></div></ActionRow>)}{!list.length&&<Empty text="کارشناسی ثبت نشده است."/>}</div>
    <h3 className="text-xs font-bold">تاریخچه تسویه</h3>{settlements.map(st=><div key={st.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs flex justify-between"><span>{st.expertName}{st.account?` • ${st.account}`:''}</span><b>{money(st.amount)} تومان</b></div>)}{!settlements.length&&<Empty text="تسویه‌ای ثبت نشده."/>}
    </>:<>
    {report&&<><div className="grid grid-cols-2 gap-2"><ReportCard label="کل پورسانت محاسبه‌شده" value={report.totalCommission} tone="purple"/><ReportCard label="کل پرداخت‌شده" value={report.totalPaid} tone="green"/></div>
    <div className="space-y-2">{report.rows.map((r:any)=><div key={r.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{r.name}</b><span className="badge">{toFaDigits(r.commissionRate)}٪</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px]"><span>مبنای پورسانت (قرارداد پروژه‌ها): {money(r.commissionBase)}</span><span>پورسانت: {money(r.commission)}</span><span>پرداخت‌شده: {money(r.paid)}</span><span className={r.balance>0?'text-red-500':'text-emerald-500'}>مانده پورسانت: {money(r.balance)}</span></div></div>)}{!report.rows.length&&<Empty text="کارشناسی برای گزارش نیست."/>}</div></>}
    </>}
  </div>;
}
function TreasuryScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [accounts,setAccounts]=useState<any[]>([]); const [movements,setMovements]=useState<any[]>([]);
  const [account,setAccount]=useState(''); const [amount,setAmount]=useState(''); const [type,setType]=useState<'deposit'|'withdraw'>('deposit'); const [note,setNote]=useState('');
  const [tab,setTab]=useState<'op'|'transfer'>('op'); const [from,setFrom]=useState(''); const [to,setTo]=useState('');
  const [mq,setMq]=useState(''); const [mfilter,setMfilter]=useState('all');
  async function load(){ const r=await api<{accounts:any[];movements:any[]}>('/treasury'); setAccounts(r.accounts); setMovements(r.movements); if(!account&&r.accounts[0]) setAccount(r.accounts[0].title); }
  useEffect(()=>{void load()},[]);
  async function submit(e:React.FormEvent){e.preventDefault(); if(!account||!amount) return; await api('/treasury/movement',{method:'POST',body:JSON.stringify({account,amount:Number(amount),type,note})}); setAmount(''); setNote(''); await load();}
  async function transfer(e:React.FormEvent){e.preventDefault(); if(!from||!to||!amount) return; await api('/treasury/transfer',{method:'POST',body:JSON.stringify({from,to,amount:Number(amount),note})}); setAmount(''); setNote(''); await load();}
  async function delMv(id:string){ if(await confirmDialog({ title: 'این گردش حذف شود؟', danger: true })){ await api(`/treasury/movement/${id}`,{method:'DELETE'}); await load(); } }
  const opts=accounts.map(a=>({id:a.id,label:a.title,value:a.title,hint:money(a.balance||0)}));
  const mList=movements.filter(m=>{const t=m.account||`${m.from} ${m.to}`; return (t.includes(mq)||(m.note||'').includes(mq))&&(mfilter==='all'||m.type===mfilter);});
  const total=accounts.reduce((s,a)=>s+Number(a.balance||0),0);
  return <div className="p-4 space-y-4">
    <div><h2 className="text-sm font-bold">خزانه‌داری</h2><p className="text-[10px] text-zinc-500">موجودی کل: {money(total)} تومان</p></div>
    <div className="grid grid-cols-2 gap-2">{accounts.map(a=><div key={a.id} className="rounded-3xl p-3 bg-zinc-100 dark:bg-zinc-900"><span className="text-[10px] text-zinc-500">{a.title}</span><b className="block text-sm mt-1">{money(a.balance||0)}</b></div>)}{!accounts.length&&<div className="col-span-2"><Empty text="حسابی ثبت نشده. از «صندوق‌ها و حساب‌ها» اضافه کن یا همین‌جا عملیات بزن."/></div>}</div>
    <div className="grid grid-cols-2 gap-2"><button onClick={()=>setTab('op')} className={`pill ${tab==='op'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>واریز / برداشت</button><button onClick={()=>setTab('transfer')} className={`pill ${tab==='transfer'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>انتقال وجه</button></div>
    {tab==='op'?<form onSubmit={submit} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><SearchSelect value={account} onChange={setAccount} placeholder="انتخاب صندوق/حساب" allowNew options={opts}/><AmountInput value={amount} onChange={setAmount} placeholder="مبلغ (تومان)"/><input className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="بابت / توضیح (اختیاری)"/><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setType('deposit')} className={`pill ${type==='deposit'?'active-green':''}`}>واریز</button><button type="button" onClick={()=>setType('withdraw')} className={`pill ${type==='withdraw'?'active-red':''}`}>برداشت</button></div><button className="primary-btn">ثبت + سند خودکار</button></form>
    :<form onSubmit={transfer} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><label className="text-[10px] text-zinc-500">از حساب مبدأ</label><SearchSelect value={from} onChange={setFrom} placeholder="حساب مبدأ" allowNew options={opts}/><label className="text-[10px] text-zinc-500">به حساب مقصد</label><SearchSelect value={to} onChange={setTo} placeholder="حساب مقصد" allowNew options={opts}/><AmountInput value={amount} onChange={setAmount} placeholder="مبلغ (تومان)"/><input className="input" value={note} onChange={e=>setNote(e.target.value)} placeholder="بابت (اختیاری)"/><button className="primary-btn">انتقال + سند خودکار</button></form>}
    <h3 className="text-xs font-bold">گردش حساب</h3>
    <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="جستجوی گردش..." value={mq} onChange={e=>setMq(e.target.value)}/><select className="input" value={mfilter} onChange={e=>setMfilter(e.target.value)}><option value="all">همه</option><option value="deposit">واریز</option><option value="withdraw">برداشت</option><option value="transfer">انتقال</option></select></div>
    <div className="space-y-2">{mList.map(m=><ActionRow key={m.id} actions={[{label:'حذف گردش',danger:true,onClick:()=>delMv(m.id)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs"><div className="flex justify-between"><span className="flex items-center gap-1"><span className={`badge ${m.type==='deposit'?'!bg-emerald-500/15 !text-emerald-500':m.type==='withdraw'?'!bg-red-500/15 !text-red-500':''}`}>{m.type==='deposit'?'واریز':m.type==='withdraw'?'برداشت':'انتقال'}</span>{m.account||`${m.from} ← ${m.to}`}</span><b>{money(m.amount)}</b></div>{m.note&&<p className="text-[9px] text-zinc-500 mt-1">{m.note}</p>}<div className="mt-1 flex justify-between items-center"><span className="text-[9px] text-zinc-400">{toFaDigits(m.date||'')}</span><button onClick={()=>delMv(m.id)} className="op-btn-danger">حذف</button></div></ActionRow>)}{!mList.length&&<Empty text="گردشی ثبت نشده."/>}</div>
  </div>;
}
const CHART_TYPES: [string,string][] = [['asset','دارایی'],['liability','بدهی'],['equity','سرمایه'],['income','درآمد'],['expense','هزینه']];
function ChartForm({ val, set, submit, label, accounts }: { val: any; set: (v: any) => void; submit: (e: React.FormEvent) => void; label: string; accounts: any[] }) {
  return <form onSubmit={submit} className="space-y-2"><input className="input" value={val.title||''} onChange={e=>set({...val,title:e.target.value})} placeholder="نام حساب: صندوق، فروش، هزینه..." required/><select className="input" value={val.type} onChange={e=>set({...val,type:e.target.value})}>{CHART_TYPES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select><select className="input" value={val.level||'total'} onChange={e=>set({...val,level:e.target.value})}><option value="total">کل</option><option value="sub">معین</option><option value="detail">تفصیلی</option></select><select className="input" value={val.parentId||''} onChange={e=>set({...val,parentId:e.target.value})}><option value="">بدون والد (سطح کل)</option>{accounts.filter(a=>a.level!=='detail').map(a=><option key={a.id} value={a.id}>{a.code} - {a.title}</option>)}</select><button className="primary-btn">{label}</button></form>;
}
function AccountingScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [accounts,setAccounts]=useState<any[]>([]); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [editA,setEditA]=useState<any|null>(null);
  const [f,setF]=useState<any>({ title:'', type:'asset', level:'total', parentId:'' });
  async function load(){ setAccounts(await api<any[]>('/accounting/chart')); }
  useEffect(()=>{void load()},[]);
  async function add(e:React.FormEvent){e.preventDefault(); await api<any>('/accounting/chart',{method:'POST',body:JSON.stringify(f)}); setF({title:'',type:'asset',level:'total',parentId:''}); setShow(false); await load();}
  async function saveEdit(e:React.FormEvent){e.preventDefault(); if(!editA) return; await api(`/accounting/chart/${editA.id}`,{method:'PUT',body:JSON.stringify(editA)}); setEditA(null); await load();}
  async function del(a:any){ if(!await confirmDialog({ title: `سرفصل «${a.title}» حذف شود؟`, danger: true })) return; try{ await api(`/accounting/chart/${a.id}`,{method:'DELETE'}); await load(); }catch(e){ if(e instanceof Error&&/گردش/.test(e.message)){ if(await confirmDialog({ title: 'این سرفصل گردش دارد. حذف اجباری؟', danger: true })){ await api(`/accounting/chart/${a.id}?force=1`,{method:'DELETE'}); await load(); } } else await alertDialog({ title: e instanceof Error?e.message:'خطا' }); } }
  async function importStd(){ if(await confirmDialog({ title: 'کدینگ استاندارد حسابداری وارد شود؟', danger: true })){ const r=await api<{added:number}>('/accounting/chart/import-standard',{method:'POST',body:JSON.stringify({})}); await alertDialog({ title: `${r.added.toLocaleString('fa-IR')} سرفصل اضافه شد.` }); await load(); } }
  const list=accounts.filter(a=>a.title.includes(q)||String(a.code).includes(q));
  // مرتب بر اساس کد برای نمایش درختی
  const sorted=[...list].sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  return <div className="p-4 space-y-4">
    <ListHeader title="دفتر کل و سرفصل حساب‌ها" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجوی سرفصل یا کد..." />
    <button onClick={importStd} className="w-full rounded-2xl bg-[#3b38a0]/10 text-[#3b38a0] dark:text-[#b2b0e8] py-2.5 text-[11px] font-bold">واردسازی کدینگ استاندارد حسابداری</button>
    {show&&<Modal title="افزودن سرفصل" onClose={()=>setShow(false)}><ChartForm val={f} set={setF} submit={add} label="افزودن سرفصل" accounts={accounts}/></Modal>}
    {editA&&<Modal title={`ویرایش ${editA.title}`} onClose={()=>setEditA(null)}><ChartForm val={editA} set={setEditA} submit={saveEdit} label="ذخیره" accounts={accounts}/></Modal>}
    <div className="space-y-1.5">{sorted.map(a=><ActionRow key={a.id} actions={[{label:'ویرایش',onClick:()=>setEditA({...a})},{label:'حذف',danger:true,onClick:()=>del(a)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3" ><div style={{marginRight:a.parentId?'1rem':0}}><div className="flex justify-between items-start"><div><b className="text-xs">{toFaDigits(a.code)} - {a.title}</b><div className="text-[9px] text-zinc-500 mt-0.5">{a.typeFa||a.type} • {a.levelFa||'کل'}{a.balance?` • مانده ${money(a.balance)}`:''}</div></div><div className="flex gap-2 text-[10px]"><button onClick={()=>setEditA({...a})} className="op-btn">ویرایش</button><button onClick={()=>del(a)} className="op-btn-danger">حذف</button></div></div></div></ActionRow>)}{!sorted.length&&<Empty text="سرفصلی ثبت نشده. کدینگ استاندارد را وارد کن."/>}</div>
  </div>;
}
function JournalScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [items,setItems]=useState<any[]>([]); const [chart,setChart]=useState<any[]>([]); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [editJ,setEditJ]=useState<any|null>(null);
  const blank=()=>({ description:'', date:'', status:'final', lines:[{accountTitle:'',debit:'',credit:''},{accountTitle:'',debit:'',credit:''}] });
  const [f,setF]=useState<any>(blank());
  async function load(){ const [j,c]=await Promise.all([api<any[]>('/accounting/journal'),api<any[]>('/accounting/chart')]); setItems(j); setChart(c); }
  useEffect(()=>{void load()},[]);
  const opts=chart.map(c=>({id:c.id,label:`${c.code} - ${c.title}`,value:c.title,hint:c.typeFa}));
  function totals(lines:any[]){ return { d:lines.reduce((s,l)=>s+Number(l.debit||0),0), c:lines.reduce((s,l)=>s+Number(l.credit||0),0) }; }
  async function add(e:React.FormEvent){e.preventDefault(); const t=totals(f.lines); if(t.d!==t.c){ await alertDialog({ title: 'سند تراز نیست! جمع بدهکار و بستانکار باید برابر باشد.' }); return; } await api('/accounting/journal',{method:'POST',body:JSON.stringify({description:f.description,date:f.date,status:f.status,lines:f.lines.filter((l:any)=>l.accountTitle).map((l:any)=>({accountTitle:l.accountTitle,debit:Number(l.debit||0),credit:Number(l.credit||0)}))})}); setF(blank()); setShow(false); await load();}
  async function saveEdit(e:React.FormEvent){e.preventDefault(); if(!editJ) return; const t=totals(editJ.lines); if(t.d!==t.c){ await alertDialog({ title: 'سند تراز نیست!' }); return; } await api(`/accounting/journal/${editJ.id}`,{method:'PUT',body:JSON.stringify({description:editJ.description,status:editJ.status,lines:editJ.lines.map((l:any)=>({accountTitle:l.accountTitle,debit:Number(l.debit||0),credit:Number(l.credit||0)}))})}); setEditJ(null); await load();}
  async function del(j:any){ if(await confirmDialog({ title: 'سند حذف شود؟', danger: true })){ await api(`/accounting/journal/${j.id}`,{method:'DELETE'}); await load(); } }
  const list=items.filter(j=>String(j.description).includes(q)||String(j.number||'').includes(q));
  function LineEditor({val,set}:{val:any;set:(v:any)=>void}){ const t=totals(val.lines); const balanced=t.d===t.c;
    return <div className="space-y-2"><input className="input" placeholder="شرح سند" value={val.description} onChange={e=>set({...val,description:e.target.value})} required/><JalaliDatePicker value={val.date||''} onChange={v=>set({...val,date:v})} placeholder="تاریخ سند (پیش‌فرض امروز)"/>
      <div className="space-y-2">{val.lines.map((l:any,i:number)=><div key={i} className="rounded-2xl border border-black/10 dark:border-white/10 p-2 space-y-1.5"><SearchSelect value={l.accountTitle} onChange={v=>{const ls=[...val.lines];ls[i]={...ls[i],accountTitle:v};set({...val,lines:ls});}} placeholder="حساب" allowNew options={opts}/><div className="grid grid-cols-2 gap-2"><AmountInput value={l.debit} onChange={v=>{const ls=[...val.lines];ls[i]={...ls[i],debit:v,credit:v?'':ls[i].credit};set({...val,lines:ls});}} placeholder="بدهکار"/><AmountInput value={l.credit} onChange={v=>{const ls=[...val.lines];ls[i]={...ls[i],credit:v,debit:v?'':ls[i].debit};set({...val,lines:ls});}} placeholder="بستانکار"/></div>{val.lines.length>2&&<button type="button" onClick={()=>set({...val,lines:val.lines.filter((_:any,j:number)=>j!==i)})} className="text-[10px] text-red-500">حذف خط</button>}</div>)}</div>
      <button type="button" onClick={()=>set({...val,lines:[...val.lines,{accountTitle:'',debit:'',credit:''}]})} className="w-full rounded-2xl bg-zinc-200 dark:bg-zinc-800 py-2 text-[11px]">+ افزودن خط</button>
      <div className={`flex justify-between text-[10px] font-bold ${balanced?'text-emerald-500':'text-red-500'}`}><span>بدهکار: {money(t.d)}</span><span>بستانکار: {money(t.c)}</span><span>{balanced?'تراز ✓':'ناتراز!'}</span></div>
      <select className="input" value={val.status} onChange={e=>set({...val,status:e.target.value})}><option value="final">قطعی</option><option value="draft">پیش‌نویس</option></select>
      <button className="primary-btn" disabled={!balanced}>ثبت سند</button></div>;
  }
  return <div className="p-4 space-y-4">
    <ListHeader title="اسناد حسابداری دوطرفه" q={q} setQ={setQ} onAdd={()=>{setF(blank());setShow(true);}} placeholder="جستجوی سند..." />
    {show&&<Modal title="ثبت سند جدید" onClose={()=>setShow(false)}><form onSubmit={add}><LineEditor val={f} set={setF}/></form></Modal>}
    {editJ&&<Modal title={`ویرایش سند ${editJ.number||''}`} onClose={()=>setEditJ(null)}><form onSubmit={saveEdit}><LineEditor val={editJ} set={setEditJ}/></form></Modal>}
    <div className="space-y-2">{list.map(j=><ActionRow key={j.id} actions={[{label:'ویرایش',onClick:()=>setEditJ({...j,lines:j.lines.map((l:any)=>({...l,debit:l.debit||'',credit:l.credit||''}))})},{label:'حذف',danger:true,onClick:()=>del(j)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between items-start"><div><b className="text-xs">سند {j.number?`#${toFaDigits(j.number)}`:''} — {j.description}</b><div className="text-[9px] text-zinc-500 mt-0.5">{toFaDigits(j.date)} • {j.status==='draft'?'پیش‌نویس':j.status==='auto'?'خودکار':'قطعی'}{!j.balanced?' • ⚠️ ناتراز':''}</div></div><div className="flex gap-2 text-[10px]"><button onClick={()=>setEditJ({...j,lines:j.lines.map((l:any)=>({...l,debit:l.debit||'',credit:l.credit||''}))})} className="op-btn">ویرایش</button><button onClick={()=>del(j)} className="op-btn-danger">حذف</button></div></div><p className="text-[10px] text-zinc-500 mt-1">بدهکار: {money(j.totalDebit)} / بستانکار: {money(j.totalCredit)}</p>{j.lines?.map((l:any,i:number)=><div key={i} className="mt-1 flex justify-between text-[10px]"><span>{l.accountTitle}</span><span>{money(l.debit||0)} / {money(l.credit||0)}</span></div>)}</ActionRow>)}{!list.length&&<Empty text="سندی ثبت نشده است."/>}</div>
  </div>;
}
const RANGE_OPTS: [string,string][] = [['','کل دوره'],['30','۳۰ روز اخیر'],['90','۳ ماه اخیر'],['365','یک سال اخیر']];
function TrialBalanceScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [data,setData]=useState<any>(null); const [days,setDays]=useState('');
  useEffect(()=>{void api<any>(`/accounting/trial-balance${days?`?days=${days}`:''}`).then(setData)},[days]);
  function exportIt(){ if(!data) return; const rows=[['کد','حساب','بدهکار','بستانکار','مانده'],...data.rows.map((r:any)=>[r.code,r.accountTitle,String(r.debit),String(r.credit),String(r.balance)])]; exportCSV('تراز-آزمایشی.csv',rows); }
  return <div className="p-4 space-y-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">تراز آزمایشی</h2><button onClick={exportIt} className="text-[11px] text-[#3b38a0] dark:text-[#b2b0e8]">خروجی CSV</button></div>
    <select className="input" value={days} onChange={e=>setDays(e.target.value)}>{RANGE_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    {data&&<><div className={`rounded-2xl border p-3 text-[11px] ${data.balanced?'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'}`}>{data.balanced?'✓ تراز است':'⚠️ عدم توازن!'} — جمع بدهکار {money(data.totalDebit)} / جمع بستانکار {money(data.totalCredit)}</div>
    <div className="space-y-1.5">{data.rows.map((r:any)=><div key={r.accountId} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{r.code} {r.accountTitle}</b><span className="badge">{r.typeFa}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><span>بدهکار {money(r.debit)}</span><span>بستانکار {money(r.credit)}</span><span className={r.balance>=0?'text-emerald-500':'text-red-500'}>مانده {money(Math.abs(r.balance))} {r.balance>=0?'بد':'بس'}</span></div></div>)}{!data.rows.length&&<Empty text="هنوز سند حسابداری ثبت نشده است."/>}</div></>}</div>;
}
function ProfitLossScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [r,setR]=useState<any>(null); const [days,setDays]=useState('');
  useEffect(()=>{void api<any>(`/accounting/profit-loss${days?`?days=${days}`:''}`).then(setR)},[days]);
  return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">صورت سود و زیان</h2>
    <select className="input" value={days} onChange={e=>setDays(e.target.value)}>{RANGE_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    {r&&<>
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-black p-4 text-white border border-white/10"><span className="text-[10px] text-zinc-400">سود/زیان خالص</span><div className={`mt-1 text-2xl font-black ${r.netProfit>=0?'text-emerald-400':'text-red-400'}`}>{money(r.netProfit)} <span className="text-xs text-zinc-400">تومان</span></div><span className="text-[10px] text-zinc-400">حاشیه سود: {r.profitMargin.toLocaleString('fa-IR')}٪</span></div>
      <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 space-y-2 text-[11px]">
        <div className="flex justify-between"><span>درآمد عملیاتی</span><b className="text-emerald-500">{money(r.operatingIncome)}</b></div>
        <div className="flex justify-between"><span>درآمد غیرعملیاتی</span><b className="text-emerald-500">{money(r.nonOperatingIncome)}</b></div>
        <div className="flex justify-between border-t border-black/5 dark:border-white/5 pt-2"><span>بهای تمام‌شده کالا/خدمات</span><b className="text-red-500">{money(r.cogs)}</b></div>
        <div className="flex justify-between font-bold"><span>سود ناخالص</span><b className="text-[#3b38a0] dark:text-[#b2b0e8]">{money(r.grossProfit)}</b></div>
        <div className="flex justify-between border-t border-black/5 dark:border-white/5 pt-2"><span>هزینه‌های عملیاتی</span><b className="text-red-500">{money(r.operatingExpense)}</b></div>
        <div className="flex justify-between font-black text-sm border-t border-black/10 dark:border-white/10 pt-2"><span>سود/زیان خالص</span><b className={r.netProfit>=0?'text-emerald-500':'text-red-500'}>{money(r.netProfit)}</b></div>
      </div>
      {r.byExpenseCat?.length>0&&<div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4"><h3 className="text-xs font-bold mb-3">ترکیب هزینه‌ها</h3><Donut data={r.byExpenseCat} label="هزینه"/></div>}
      {r.byIncomeCat?.length>0&&<div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4"><h3 className="text-xs font-bold mb-3">ترکیب درآمدها</h3><HBars data={r.byIncomeCat}/></div>}
    </>}
  </div>;
}
const CF_CAT_FA: Record<string,string> = { operating: 'عملیاتی', investing: 'سرمایه‌گذاری', financing: 'تامین مالی' };
function CashFlowScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [r,setR]=useState<any>(null); const [days,setDays]=useState('');
  useEffect(()=>{void api<any>(`/accounting/cash-flow${days?`?days=${days}`:''}`).then(setR)},[days]);
  return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">گزارش جریان نقدی</h2>
    <select className="input" value={days} onChange={e=>setDays(e.target.value)}>{RANGE_OPTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    {r&&<>
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-black p-4 text-white border border-white/10"><span className="text-[10px] text-zinc-400">خالص جریان نقد</span><div className={`mt-1 text-2xl font-black ${r.netCashFlow>=0?'text-emerald-400':'text-red-400'}`}>{money(r.netCashFlow)} <span className="text-xs text-zinc-400">تومان</span></div></div>
      <div className="grid grid-cols-2 gap-2"><ReportCard label="ورودی نقد" value={r.cashIn} tone="green"/><ReportCard label="خروجی نقد" value={r.cashOut} tone="red"/></div>
      <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 space-y-2 text-[11px]"><h3 className="text-xs font-bold mb-1">تفکیک جریان نقد</h3>
        <div className="flex justify-between"><span>فعالیت‌های عملیاتی</span><b className={r.operating>=0?'text-emerald-500':'text-red-500'}>{money(r.operating)}</b></div>
        <div className="flex justify-between"><span>فعالیت‌های سرمایه‌گذاری</span><b className={r.investing>=0?'text-emerald-500':'text-red-500'}>{money(r.investing)}</b></div>
        <div className="flex justify-between"><span>فعالیت‌های تامین مالی</span><b className={r.financing>=0?'text-emerald-500':'text-red-500'}>{money(r.financing)}</b></div>
      </div>
      {r.forecast&&<div className="rounded-3xl bg-[#3b38a0]/10 border border-[#3b38a0]/20 p-4 space-y-2 text-[11px]"><h3 className="text-xs font-bold text-[#3b38a0] dark:text-[#b2b0e8] mb-1">پیش‌بینی جریان نقد (بر اساس چک‌ها)</h3>
        <div className="flex justify-between"><span>موجودی فعلی نقد</span><b>{money(r.forecast.currentCash)}</b></div>
        <div className="flex justify-between"><span>چک‌های دریافتنی در راه</span><b className="text-emerald-500">+{money(r.forecast.expectedIn)}</b></div>
        <div className="flex justify-between"><span>چک‌های پرداختنی در راه</span><b className="text-red-500">−{money(r.forecast.expectedOut)}</b></div>
        <div className="flex justify-between font-black border-t border-[#3b38a0]/20 pt-2"><span>موجودی پیش‌بینی‌شده</span><b className={r.forecast.projectedCash>=0?'text-emerald-500':'text-red-500'}>{money(r.forecast.projectedCash)}</b></div>
      </div>}
      <h3 className="text-xs font-bold">ریز جریان نقد</h3>
      <div className="space-y-2">{(r.rows||[]).map((m:any)=><div key={m.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs"><div className="flex justify-between"><span className="flex items-center gap-1"><span className="badge">{CF_CAT_FA[m.category]}</span>{m.description}</span><b className={m.amount>=0?'text-emerald-500':'text-red-500'}>{m.amount>=0?'+':''}{money(m.amount)}</b></div></div>)}{!r.rows?.length&&<Empty text="جریان نقدی ثبت نشده است."/>}</div>
    </>}
  </div>;
}
function ProjectsScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [items,setItems]=useState<any[]>([]); const [persons,setPersons]=useState<Person[]>([]); const [experts,setExperts]=useState<any[]>([]); const [title,setTitle]=useState(''); const [customerName,setCustomer]=useState(''); const [expert,setExpert]=useState(''); const [amount,setAmount]=useState(''); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [sel,setSel]=useState<any|null>(null);
  async function load(){ const [pr,ps,ex]=await Promise.all([api<any[]>('/projects'),api<Person[]>('/persons'),api<any[]>('/experts').catch(()=>[])]); setItems(pr); setPersons(ps); setExperts(ex); if(sel){ const f=pr.find(x=>x.id===sel.id); if(f) setSel(f); } }
  useEffect(()=>{void load()},[]);
  async function add(e:React.FormEvent){e.preventDefault(); if(!title||!customerName) return; await api('/projects',{method:'POST',body:JSON.stringify({title,customerName,expertName:expert,amount:Number(amount)})}); setTitle(''); setCustomer(''); setExpert(''); setAmount(''); setShow(false); await load(); toast('پروژه ثبت شد');}
  async function del(pr:any){ if(await confirmDialog({ title: `پروژه «${pr.title}» حذف شود؟`, danger: true })){ await api(`/projects/${pr.id}`,{method:'DELETE'}); setSel(null); await load(); } }
  async function toggleStage(pr:any,index:number){ await api(`/projects/${pr.id}/stage`,{method:'POST',body:JSON.stringify({index})}); await load(); }
  async function addPaid(pr:any){ const v=await promptDialog({title:'مبلغ پرداخت دریافتی از مشتری',placeholder:'تومان'}); if(!v) return; await api(`/projects/${pr.id}`,{method:'PUT',body:JSON.stringify({paid:Number(pr.paid||0)+Number(toEnDigits(v))})}); await load(); toast('ثبت شد'); }
  const list=items.filter(pr=>String(pr.title).includes(q)||String(pr.customerName).includes(q));
  if(sel) return <div className="p-4 space-y-3">
    <button onClick={()=>setSel(null)} className="op-btn">‹ بازگشت</button>
    <div className="rounded-3xl bg-gradient-to-br from-zinc-900 to-black p-4 text-white border border-white/10"><div className="flex justify-between"><div><h3 className="font-black text-sm">{sel.title}</h3><span className="text-[10px] text-zinc-400">مشتری: {sel.customerName}{sel.expertName?` • کارشناس: ${sel.expertName}`:''}</span></div></div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div>مبلغ قرارداد: <b>{money(sel.amount)}</b></div><div>پرداخت‌شده: <b className="text-emerald-400">{money(sel.paid)}</b></div><div>مانده دریافت: <b className="text-amber-400">{money(sel.balance)}</b></div><div>هزینهٔ پروژه: <b className="text-red-400">{money(sel.relatedExpense)}</b></div></div>
      <div className="mt-2 border-t border-white/10 pt-2 text-xs font-black">سود پروژه: <span className={sel.profit>=0?'text-emerald-400':'text-red-400'}>{money(sel.profit)} تومان</span></div>
    </div>
    <h4 className="text-xs font-bold">مراحل پروژه</h4>
    <div className="space-y-2">{(sel.stages||[]).map((st:any,i:number)=><button key={i} onClick={()=>toggleStage(sel,i)} className={`w-full flex items-center justify-between rounded-2xl p-3 text-[11px] border ${st.done?'border-emerald-500/30 bg-emerald-500/10':'border-black/10 dark:border-white/10 bg-zinc-100 dark:bg-zinc-900'}`}><span className="flex items-center gap-2"><span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${st.done?'bg-emerald-500 text-white':'border border-zinc-400'}`}>{st.done?'✓':toFaDigits(i+1)}</span>{st.name}</span>{st.date&&<span className="text-[9px] text-zinc-500">{toFaDigits(st.date)}</span>}</button>)}</div>
    <div className="flex gap-2"><button onClick={()=>addPaid(sel)} className="op-btn-green flex-1 !py-2">ثبت پرداخت مشتری</button><button onClick={()=>del(sel)} className="op-btn-danger flex-1 !py-2">حذف پروژه</button></div>
  </div>;
  return <div className="p-4 space-y-4">
    <ListHeader title="پروژه‌ها" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجوی پروژه یا مشتری..." />
    {show&&<Modal title="تعریف پروژه" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="نام پروژه" required/><SearchSelect value={customerName} onChange={setCustomer} placeholder="انتخاب مشتری" allowNew options={persons.map(p=>({id:p.id,label:p.name,value:p.name}))} /><SearchSelect value={expert} onChange={setExpert} placeholder="کارشناس مسئول (اختیاری)" allowNew options={experts.map(e=>({id:e.id,label:e.name,value:e.name}))} /><AmountInput value={amount} onChange={setAmount} placeholder="مبلغ قرارداد (تومان)"/><button className="primary-btn">تعریف پروژه</button></form></Modal>}
    <div className="space-y-2">{list.map(pr=><ActionRow key={pr.id} actions={[{label:'مشاهده/مراحل',onClick:()=>setSel(pr)},{label:'ثبت پرداخت',onClick:()=>addPaid(pr)},{label:'حذف',danger:true,onClick:()=>del(pr)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div onClick={()=>setSel(pr)} className="cursor-pointer"><div className="flex justify-between"><b className="text-xs">{pr.title}</b><span className="badge">{pr.customerName}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><span>قرارداد {money(pr.amount)}</span><span>سود {money(pr.profit)}</span><span>مانده {money(pr.balance)}</span></div><div className="mt-1 text-[9px] text-zinc-500">مراحل انجام‌شده: {toFaDigits((pr.stages||[]).filter((s:any)=>s.done).length)} از {toFaDigits((pr.stages||[]).length)}</div></div><div className="mt-2 flex gap-2 text-[10px]"><button onClick={()=>setSel(pr)} className="op-btn">مشاهده</button><button onClick={()=>del(pr)} className="op-btn-danger">حذف</button></div></ActionRow>)}{!list.length&&<Empty text="پروژه‌ای ثبت نشده است."/>}</div>
  </div>;
}
function CustomersScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [persons,setPersons]=useState<Person[]>([]); const [q,setQ]=useState(''); const [ctab,setCtab]=useState<'all'|'debtor'|'creditor'>('all'); const [kindTab,setKindTab]=useState<'all'|'customer'|'supplier'|'expert'>('all'); const [show,setShow]=useState(false); const [name,setName]=useState(''); const [mobile,setMobile]=useState(''); const [kind,setKind]=useState('customer');
  async function load(){setPersons(await api<Person[]>('/persons'));} useEffect(()=>{void load()},[]);
  async function add(e:React.FormEvent){e.preventDefault(); await api('/persons',{method:'POST',body:JSON.stringify({name,mobile,kind})}); setName(''); setMobile(''); setShow(false); await load();}
  async function editCust(p:Person){ const nm=await promptDialog({title:'نام',defaultValue:p.name}); if(!nm) return; const mob=await promptDialog({title:'موبایل',defaultValue:p.mobile||''}); await api(`/persons/${p.id}`,{method:'PUT',body:JSON.stringify({name:nm,mobile:mob||''})}); await load(); toast('ویرایش شد'); }
  async function delCust(p:Person){ if(!await confirmDialog({title:`«${p.name}» حذف شود؟`,danger:true})) return; try{ await api(`/persons/${p.id}`,{method:'DELETE'}); await load(); }catch(e){ if(e instanceof Error&&/سند مالی/.test(e.message)){ if(await confirmDialog({title:`${p.name} دارای سند است. حذف اجباری؟`,danger:true})){ await api(`/persons/${p.id}?force=1`,{method:'DELETE'}); await load(); } } else toast('خطا','error'); } }
  const list=persons.filter(p=>p.name.includes(q)||(p.mobile||'').includes(q)).filter(p=>kindTab==='all'||(p.kind||'person')===kindTab).filter(p=>ctab==='all'||(ctab==='creditor'&&p.balance>0)||(ctab==='debtor'&&p.balance<0));
  return <div className="p-4 space-y-4">
    <ListHeader title="مشتریان و تامین‌کنندگان" q={q} setQ={setQ} onAdd={()=>setShow(true)} placeholder="جستجوی نام یا موبایل..." />
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{([['all','همه'],['customer','مشتری'],['supplier','تامین‌کننده'],['expert','کارشناس']] as const).map(([k,l])=><button key={k} onClick={()=>setKindTab(k as any)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${kindTab===k?'bg-[#3b38a0] text-white':'bg-zinc-100 dark:bg-zinc-900 text-zinc-500'}`}>{l}</button>)}</div>
    <div className="grid grid-cols-3 gap-2"><button onClick={()=>setCtab('all')} className={`pill ${ctab==='all'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>همه</button><button onClick={()=>setCtab('creditor')} className={`pill ${ctab==='creditor'?'active-green':''}`}>طلب از او</button><button onClick={()=>setCtab('debtor')} className={`pill ${ctab==='debtor'?'active-red':''}`}>بدهی به او</button></div>
    {show&&<Modal title="افزودن مشتری/تامین‌کننده" onClose={()=>setShow(false)}><form onSubmit={add} className="space-y-2"><input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="نام *" required/><input className="input" value={mobile} onChange={e=>setMobile(e.target.value)} placeholder="موبایل"/><select className="input" value={kind} onChange={e=>setKind(e.target.value)}><option value="customer">مشتری</option><option value="supplier">تامین‌کننده</option><option value="expert">کارشناس</option><option value="person">شخص عادی</option></select><button className="primary-btn">ذخیره</button></form></Modal>}
    {list.map(p=><ActionRow key={p.id} actions={[{label:'ویرایش',onClick:()=>editCust(p)},{label:'حذف',danger:true,onClick:()=>delCust(p)}]} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between items-center"><div><b className="text-xs flex items-center gap-1">{p.name}{p.kind&&p.kind!=='person'&&<span className="badge">{PERSON_KINDS[p.kind]}</span>}</b>{p.mobile&&<div className="text-[9px] text-zinc-500 mt-0.5">{p.mobile}</div>}</div><span className={p.balance>=0?'text-emerald-500 text-xs font-bold':'text-red-500 text-xs font-bold'}>{money(Math.abs(p.balance))}{p.balance>0?' طلب':p.balance<0?' بدهی':''}</span></div><div className="mt-2 flex gap-2 text-[10px]"><button onClick={()=>editCust(p)} className="op-btn">ویرایش</button><button onClick={()=>delCust(p)} className="op-btn-danger">حذف</button></div></ActionRow>)}{!list.length&&<Empty text="موردی ثبت نشده است."/>}
  </div>;
}
function printInvoice(inv: any, b: any = {}) {
  const color = b.color || '#3b38a0';
  const title = inv.type==='proforma'?'پیش‌فاکتور':'فاکتور';
  const rows = (inv.items||[]).map((it:any,n:number)=>`<tr><td>${toFaDigits(n+1)}</td><td style="text-align:right">${it.title||''}</td><td>${toFaDigits(it.qty||0)}</td><td>${money(it.price||0)}</td><td>${money(it.discount||0)}</td><td>${money(Number(it.qty||0)*Number(it.price||0)-Number(it.discount||0))}</td></tr>`).join('');
  const logo = b.logo ? `<img src="${b.logo}" style="height:54px;border-radius:10px"/>` : `<div style="width:54px;height:54px;border-radius:12px;background:${color};color:#fff;display:grid;place-items:center;font-weight:900;font-size:22px">د</div>`;
  const html=`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>${title} ${toFaDigits(inv.number)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;900&display=swap" rel="stylesheet">
  <style>
    *{font-family:'Vazirmatn',Tahoma,sans-serif;box-sizing:border-box}
    body{margin:0;padding:32px;color:#1a1a2e;background:#f4f5fa}
    .card{max-width:760px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.08)}
    .head{background:linear-gradient(135deg,${color},${color}cc);color:#fff;padding:24px;display:flex;justify-content:space-between;align-items:center}
    .head h1{margin:0;font-size:22px;font-weight:900}
    .head .co{display:flex;align-items:center;gap:12px}
    .head .co b{font-size:16px}.head .co div small{opacity:.85;font-size:11px}
    .meta{display:flex;justify-content:space-between;padding:18px 24px;font-size:13px;border-bottom:1px solid #eee;flex-wrap:wrap;gap:8px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:11px 10px;text-align:center;font-size:13px;border-bottom:1px solid #f0f0f0}
    thead th{background:${color}14;color:${color};font-weight:700}
    .tot{padding:18px 24px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;font-size:13px}
    .tot .final{font-size:18px;font-weight:900;color:${color};border-top:2px solid ${color}33;padding-top:8px;margin-top:6px;width:100%;display:flex;justify-content:space-between}
    .ft{padding:16px 24px;background:#fafafe;color:#888;font-size:12px;text-align:center;border-top:1px solid #eee}
    @media print{body{background:#fff;padding:0}.card{box-shadow:none}}
  </style></head><body><div class="card">
  <div class="head"><div class="co">${logo}<div><b>${b.company||'دست راست'}</b><div>${b.phone?`<small>${b.phone}</small>`:''}${b.address?`<small> • ${b.address}</small>`:''}</div></div></div><h1>${title}</h1></div>
  <div class="meta"><span>شمارهٔ ${title}: <b>${toFaDigits(inv.number)}</b></span><span>تاریخ: <b>${toFaDigits(inv.date||'')}</b></span><span>مشتری: <b>${inv.customerName}</b></span></div>
  <table><thead><tr><th>#</th><th>شرح کالا / خدمت</th><th>تعداد</th><th>قیمت واحد</th><th>تخفیف</th><th>جمع</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="tot"><span>جمع جزء: ${money(inv.subtotal||0)} تومان</span><span>تخفیف: ${money(inv.discountTotal||0)} تومان</span><span>مالیات (${toFaDigits(inv.taxRate||0)}٪): ${money(inv.tax||0)} تومان</span><span class="final"><span>مبلغ قابل پرداخت</span><span>${money(inv.amount||0)} تومان</span></span></div>
  <div class="ft">${b.footer||'با تشکر از خرید شما'}</div>
  </div></body></html>`;
  const w=window.open('','_blank'); if(w){ w.document.write(html); w.document.close(); setTimeout(()=>w.print(),500); } else { toast('برای چاپ، اجازهٔ بازشدن پنجره را بدهید','error'); }
}
function InvoiceForm({ persons, onSubmit }: { persons: Person[]; onSubmit: (data:any)=>void }) {
  const [type,setType]=useState('invoice'); const [customer,setCustomer]=useState(''); const [taxRate,setTaxRate]=useState('9');
  const [lines,setLines]=useState<any[]>([{title:'',qty:'1',price:'',discount:''}]);
  const subtotal=lines.reduce((s,l)=>s+Number(l.qty||0)*Number(l.price||0),0);
  const disc=lines.reduce((s,l)=>s+Number(l.discount||0),0);
  const tax=Math.round(Math.max(0,subtotal-disc)*Number(taxRate||0)/100);
  return <form onSubmit={e=>{e.preventDefault(); if(!customer) return; onSubmit({type,customerName:customer,taxRate:Number(taxRate||0),items:lines.filter(l=>l.title||l.price).map(l=>({title:l.title,qty:Number(l.qty||1),price:Number(l.price||0),discount:Number(l.discount||0)}))});}} className="space-y-2">
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setType('invoice')} className={`pill ${type==='invoice'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>فاکتور</button><button type="button" onClick={()=>setType('proforma')} className={`pill ${type==='proforma'?'bg-[#3b38a0] text-white dark:bg-[#3b38a0]':''}`}>پیش‌فاکتور</button></div>
    <SearchSelect value={customer} onChange={setCustomer} placeholder="انتخاب مشتری" allowNew options={persons.map(p=>({id:p.id,label:p.name,value:p.name}))} />
    <div className="space-y-2">{lines.map((l,i)=><div key={i} className="rounded-2xl border border-black/10 dark:border-white/10 p-2 space-y-1.5"><input className="input" placeholder="شرح کالا/خدمت" value={l.title} onChange={e=>{const x=[...lines];x[i]={...x[i],title:e.target.value};setLines(x);}}/><div className="grid grid-cols-3 gap-1.5"><AmountInput value={l.qty} onChange={v=>{const x=[...lines];x[i]={...x[i],qty:v};setLines(x);}} placeholder="تعداد"/><AmountInput value={l.price} onChange={v=>{const x=[...lines];x[i]={...x[i],price:v};setLines(x);}} placeholder="قیمت واحد"/><AmountInput value={l.discount} onChange={v=>{const x=[...lines];x[i]={...x[i],discount:v};setLines(x);}} placeholder="تخفیف"/></div>{lines.length>1&&<button type="button" onClick={()=>setLines(lines.filter((_,j)=>j!==i))} className="op-btn-danger">حذف ردیف</button>}</div>)}</div>
    <button type="button" onClick={()=>setLines([...lines,{title:'',qty:'1',price:'',discount:''}])} className="w-full rounded-2xl bg-zinc-200 dark:bg-zinc-800 py-2 text-[11px]">+ افزودن ردیف</button>
    <div className="flex items-center gap-2"><label className="text-[10px] text-zinc-500">مالیات ٪</label><AmountInput value={taxRate} onChange={setTaxRate} placeholder="۹" className="!py-2" /></div>
    <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-2 text-[10px] space-y-1"><div className="flex justify-between"><span>جمع جزء</span><b>{money(subtotal)}</b></div><div className="flex justify-between"><span>تخفیف</span><b>{money(disc)}</b></div><div className="flex justify-between"><span>مالیات</span><b>{money(tax)}</b></div><div className="flex justify-between font-black text-[#3b38a0] dark:text-[#b2b0e8]"><span>مبلغ نهایی</span><b>{money(Math.max(0,subtotal-disc)+tax)}</b></div></div>
    <button className="primary-btn">صدور</button>
  </form>;
}
function InvoicesScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) {
  const [items,setItems]=useState<any[]>([]); const [persons,setPersons]=useState<Person[]>([]); const [q,setQ]=useState(''); const [show,setShow]=useState(false); const [payInv,setPayInv]=useState<any|null>(null); const [accounts,setAccounts]=useState<any[]>([]); const [payAcc,setPayAcc]=useState('صندوق');
  const [branding,setBranding]=useState<any>({}); const [showBrand,setShowBrand]=useState(false); const [bForm,setBForm]=useState<any>({});
  async function load(){const [i,p,a,b]=await Promise.all([api<any[]>('/invoices'),api<Person[]>('/persons'),api<any[]>('/accounts'),api<any>('/branding')]); setItems(i); setPersons(p); setAccounts(a); setBranding(b); setBForm(b);}
  useEffect(()=>{void load()},[]);
  async function saveBrand(e:React.FormEvent){ e.preventDefault(); const b=await api<any>('/branding',{method:'PUT',body:JSON.stringify(bForm)}); setBranding(b); setShowBrand(false); toast('برندینگ ذخیره شد'); }
  function pickLogo(file:File){ const r=new FileReader(); r.onload=()=>setBForm((f:any)=>({...f,logo:String(r.result)})); r.readAsDataURL(file); }
  async function add(data:any){ await api('/invoices',{method:'POST',body:JSON.stringify(data)}); setShow(false); await load(); toast('فاکتور صادر شد'); }
  async function convert(i:any){ await api(`/invoices/${i.id}/convert`,{method:'POST',body:JSON.stringify({})}); await load(); toast('به فاکتور تبدیل شد'); }
  async function doPay(){ if(!payInv) return; await api(`/invoices/${payInv.id}/pay`,{method:'POST',body:JSON.stringify({account:payAcc})}); setPayInv(null); await load(); toast('پرداخت ثبت شد'); }
  async function del(i:any){ if(await confirmDialog({ title: 'فاکتور حذف شود؟', danger: true })){ await api(`/invoices/${i.id}`,{method:'DELETE'}); await load(); } }
  const STAT_FA:Record<string,string>={unpaid:'پرداخت‌نشده',partial:'نیمه‌پرداخت',paid:'پرداخت‌شده'};
  const list=items.filter(i=>String(i.customerName).includes(q)||String(i.number).includes(q));
  return <div className="p-4 space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-sm font-bold">فاکتور و پیش‌فاکتور</h2><div className="flex gap-2"><button onClick={()=>{setBForm(branding);setShowBrand(true);}} className="icon-btn" title="تنظیمات برندینگ فاکتور"><Settings size={16}/></button><button onClick={()=>setShow(true)} className="flex items-center gap-1 rounded-2xl bg-[#3b38a0] px-3 py-2 text-xs text-white active:scale-95"><Plus size={14}/> صدور</button></div></div>
    <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input className="input !pr-9" placeholder="جستجو بر اساس مشتری یا شماره..." value={q} onChange={e=>setQ(e.target.value)} /></div>
    {showBrand&&<Modal title="برندینگ فاکتور" onClose={()=>setShowBrand(false)}><form onSubmit={saveBrand} className="space-y-2">
      <div className="flex items-center gap-3"><div className="grid h-14 w-14 place-items-center rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-900">{bForm.logo?<img src={bForm.logo} className="h-full w-full object-cover"/>:<span className="text-xs text-zinc-400">لوگو</span>}</div><label className="op-btn cursor-pointer">انتخاب لوگو<input type="file" hidden accept="image/*" onChange={e=>{const f=e.target.files?.[0]; if(f) pickLogo(f);}}/></label>{bForm.logo&&<button type="button" onClick={()=>setBForm((f:any)=>({...f,logo:''}))} className="op-btn-danger">حذف لوگو</button>}</div>
      <input className="input" placeholder="نام کسب‌وکار" value={bForm.company||''} onChange={e=>setBForm({...bForm,company:e.target.value})}/>
      <input className="input" placeholder="تلفن" value={bForm.phone||''} onChange={e=>setBForm({...bForm,phone:e.target.value})}/>
      <input className="input" placeholder="آدرس" value={bForm.address||''} onChange={e=>setBForm({...bForm,address:e.target.value})}/>
      <input className="input" placeholder="متن پاورقی" value={bForm.footer||''} onChange={e=>setBForm({...bForm,footer:e.target.value})}/>
      <div className="flex items-center gap-2"><span className="text-[11px] text-zinc-500">رنگ برند:</span><input type="color" value={bForm.color||'#3b38a0'} onChange={e=>setBForm({...bForm,color:e.target.value})} className="h-9 w-16 rounded-lg border border-black/10"/></div>
      <button className="primary-btn">ذخیره برندینگ</button>
    </form></Modal>}
    {show&&<Modal title="صدور فاکتور" onClose={()=>setShow(false)}><InvoiceForm persons={persons} onSubmit={add}/></Modal>}
    {payInv&&<Modal title={`دریافت فاکتور #${toFaDigits(payInv.number)}`} onClose={()=>setPayInv(null)}><div className="space-y-2"><p className="text-[11px] text-zinc-500">مانده قابل دریافت: {money(payInv.balance)} تومان</p><SearchSelect value={payAcc} onChange={setPayAcc} placeholder="حساب مقصد" allowNew options={[{label:'صندوق',value:'صندوق'},...accounts.map(a=>({id:a.id,label:a.title,value:a.title}))]}/><button onClick={doPay} className="primary-btn">ثبت دریافت کامل</button></div></Modal>}
    <div className="space-y-2">{list.map(i=>{ const acts=[{label:'چاپ / PDF',onClick:()=>printInvoice(i,branding)},...(i.type==='proforma'?[{label:'تبدیل به فاکتور',onClick:()=>convert(i)}]:[]),...(i.status!=='paid'?[{label:'ثبت دریافت',onClick:()=>{setPayInv(i);setPayAcc('صندوق');}}]:[]),{label:'حذف',danger:true,onClick:()=>del(i)}];
      return <ActionRow key={i.id} actions={acts} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><div className="flex justify-between text-xs"><span className="flex items-center gap-2"><span className="badge">{i.type==='proforma'?'پیش‌فاکتور':'فاکتور'} #{toFaDigits(i.number)}</span>{i.customerName}</span><b>{money(i.amount)}</b></div><div className="mt-1 flex justify-between text-[9px] text-zinc-500"><span>{STAT_FA[i.status]||''}{i.paid?` • پرداختی: ${money(i.paid)}`:''}</span><span>{toFaDigits(i.date||'')}</span></div><div className="mt-2 flex flex-wrap gap-2 text-[10px]"><button onClick={()=>printInvoice(i,branding)} className="op-btn">چاپ/PDF</button>{i.type==='proforma'&&<button onClick={()=>convert(i)} className="op-btn">تبدیل به فاکتور</button>}{i.status!=='paid'&&<button onClick={()=>{setPayInv(i);setPayAcc('صندوق');}} className="op-btn-green">ثبت دریافت</button>}<button onClick={()=>del(i)} className="op-btn-danger">حذف</button></div></ActionRow>;
    })}{!list.length&&<Empty text="فاکتوری ثبت نشده است."/>}</div>
  </div>;
}
function AdvancedAIScreen({ api }: { api: <T>(u: string, o?: RequestInit) => Promise<T> }) { const [rules,setRules]=useState<any[]>([]); const [pattern,setPattern]=useState(''); const [action,setAction]=useState(''); useEffect(()=>{void api<any[]>('/ai/rules').then(setRules)},[]); async function add(e:React.FormEvent){e.preventDefault(); const r=await api<any>('/ai/rules',{method:'POST',body:JSON.stringify({pattern,action})}); setRules([r,...rules]); setPattern(''); setAction('');} return <div className="p-4 space-y-4"><h2 className="text-sm font-bold">هوش مصنوعی پیشرفته</h2><p className="text-[10px] text-zinc-500 leading-5">حافظه آموزشی، قوانین سفارشی ادمین، رفع ابهام، چند عملیات در یک پیام و اصلاح خودکار پایه‌گذاری شده‌اند.</p><form onSubmit={add} className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-3 space-y-2"><input className="input" value={pattern} onChange={e=>setPattern(e.target.value)} placeholder="اگر جمله شامل..."/><input className="input" value={action} onChange={e=>setAction(e.target.value)} placeholder="پس این معنی/عملیات را انجام بده"/><button className="primary-btn">افزودن قانون</button></form>{rules.map(r=><div key={r.id} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3 text-xs"><b>{r.pattern}</b><p className="text-zinc-500 mt-1">{r.action}</p></div>)}</div> }
function AdminPanel({ api, settings, setSettings }: { api: <T>(u: string, o?: RequestInit) => Promise<T>; settings: AiSettings; setSettings: (s: AiSettings) => void; }) {
  const [local,setLocal]=useState(settings); const [stats,setStats]=useState<AdminStats | null>(null); const [result,setResult]=useState('');
  useEffect(()=>{void api<AdminStats>('/admin/stats').then(setStats)},[]);
  async function save(){const saved=await api<AiSettings>('/admin/settings',{method:'PUT',body:JSON.stringify(local)}); const clean={...saved, aiToken:''}; setSettings(clean); setLocal(clean); setResult('تنظیمات ذخیره شد. توکن کامل روی سرور محفوظ است و برای امنیت نمایش داده نمی‌شود.');}
  async function test(){try{const r=await api<{answer:string}>('/admin/test-ai',{method:'POST',body:JSON.stringify({prompt:'اتصال را تست کن'})}); setResult(r.answer)}catch(e){setResult(e instanceof Error?e.message:'خطا')}}
  return <div className="p-4 space-y-4"><div className="flex items-center gap-2"><Shield className="text-[#3b38a0]"/><h2 className="text-sm font-bold">پنل ادمین و تنظیمات پیشرفته</h2></div>{stats && <div className="grid grid-cols-2 gap-2">{Object.entries(stats.counts).map(([k,v])=><div key={k} className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 p-3"><span className="text-[10px] text-zinc-500">{k}</span><b className="block text-lg">{money(v)}</b></div>)}</div>}<div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4 space-y-3"><h3 className="text-xs font-bold flex gap-1"><Settings size={15}/> تنظیمات هوش مصنوعی</h3><label className="block text-xs text-zinc-500">ارائه‌دهنده<select className="input mt-1" value={local.aiProvider} onChange={e=>setLocal({...local,aiProvider:e.target.value as Provider})}><option value="local">موتور محلی بدون توکن</option><option value="openai">OpenAI</option><option value="openrouter">OpenRouter</option><option value="groq">Groq</option><option value="custom">Custom OpenAI Compatible</option></select></label><Field label="Base URL اختیاری" value={local.aiBaseUrl || ''} onChange={v=>setLocal({...local,aiBaseUrl:v})}/><Field label="Model" value={local.aiModel || ''} onChange={v=>setLocal({...local,aiModel:v})}/><Field label={`API Token ${local.aiTokenSet ? '(قبلاً ذخیره شده؛ برای تغییر، توکن جدید را وارد کن)' : ''}`} value={local.aiToken || ''} onChange={v=>setLocal({...local,aiToken:v})} type="password"/><Field label="System Prompt" value={local.systemPrompt || ''} onChange={v=>setLocal({...local,systemPrompt:v})} textarea/><div className="grid grid-cols-2 gap-2"><button onClick={save} className="primary-btn" type="button">ذخیره تنظیمات</button><button onClick={test} className="rounded-2xl bg-zinc-200 dark:bg-zinc-800 py-3 text-xs font-bold" type="button">تست اتصال</button></div>{result && <p className="rounded-2xl bg-[#3b38a0]/10 p-3 text-[11px] leading-5 text-[#3b38a0] dark:text-[#b2b0e8]">{result}</p>}</div><div className="rounded-3xl bg-zinc-100 dark:bg-zinc-900 p-4"><h3 className="text-xs font-bold mb-2">کاربران</h3>{stats?.users.map(u=><div key={u.id} className="flex justify-between border-t border-black/5 dark:border-white/5 py-2 text-[11px]"><span><User size={12} className="inline"/> {u.name}</span><span>{u.role}</span></div>)}</div></div>;
}

function Toast({ text, onClose }: { text: string; onClose: () => void }) { useEffect(()=>{const t=setTimeout(onClose,5000); return()=>clearTimeout(t)},[onClose]); return <div className="fixed top-4 left-1/2 z-50 w-[92%] max-w-sm -translate-x-1/2 rounded-3xl bg-zinc-950 p-4 text-xs text-white shadow-2xl border border-white/10"><div className="flex gap-2"><Bell size={16} className="text-[#b2b0e8]"/><p className="leading-5">{text}</p></div></div>; }
