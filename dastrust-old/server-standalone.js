// Dast Rast portable server - no npm install required
// Run: node server-standalone.js
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(__filename);
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PORT || 8787;
const JWT_SECRET = process.env.JWT_SECRET || 'dastrast-portable-secret-change-me';
fs.mkdirSync(DATA_DIR, { recursive: true });

const seed = {
  users: [], transactions: [], cheques: [], smsInbox: [], persons: [], accounts: [], categories: [], assistantTraining: [],
  settings: { appName:'دست راست', aiProvider:'local', aiBaseUrl:'', aiModel:'gpt-4o-mini', aiToken:'', temperature:0.2, systemPrompt:'تو دستیار مالی فارسی اپلیکیشن دست راست هستی.', defaultCurrency:'تومان', reminderDays:[7,3,1], notificationChannels:['inApp'] }
};
const nowIso = () => new Date().toISOString();

function normalizeDb(db){
  db.users ||= []; db.transactions ||= []; db.cheques ||= []; db.smsInbox ||= [];
  db.persons ||= []; db.accounts ||= []; db.projects ||= []; db.experts ||= []; db.expertSettlements ||= []; db.treasuryMovements ||= []; db.chartAccounts ||= []; db.journalEntries ||= []; db.invoices ||= []; db.aiRules ||= []; db.pushSubscriptions ||= []; db.categories ||= [
    'حمل و نقل','خوراکی و سوپرمارکت','رستوران و کافه','حقوق و درآمد','اقساط و بدهی','بدهکار / بدهی','بستانکار / طلب','مسکن و اجاره','قبوض و خدمات','درمان و سلامت','پوشاک','آموزش','سفر','تفریح و اشتراک','سرمایه‌گذاری','سایر'
  ];
  db.assistantTraining ||= [];
  return db;
}
const readDb = () => { if(!fs.existsSync(DB_PATH)) writeDb(seed); return normalizeDb(JSON.parse(fs.readFileSync(DB_PATH,'utf8'))); };

const writeDb = db => fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2));
const id = (p='') => p + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const pub = u => u && ({ id:u.id, name:u.name, email:u.email, role:u.role, createdAt:u.createdAt });
const hashPassword = (password, salt=crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')}`;
const verifyPassword = (password, stored) => { const [salt,h]=stored.split(':'); return hashPassword(password,salt).split(':')[1] === h; };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function signToken(payload){ const body={...payload,exp:Math.floor(Date.now()/1000)+2592000}; const u=`${b64({alg:'HS256',typ:'JWT'})}.${b64(body)}`; return `${u}.${crypto.createHmac('sha256',JWT_SECRET).update(u).digest('base64url')}`; }
function verifyToken(token=''){ const [h,p,s]=token.split('.'); if(!h||!p||!s) return null; const ex=crypto.createHmac('sha256',JWT_SECRET).update(`${h}.${p}`).digest('base64url'); if(ex!==s) return null; const pl=JSON.parse(Buffer.from(p,'base64url').toString()); return pl.exp > Math.floor(Date.now()/1000) ? pl : null; }
function faToEnDigits(str = '') {
  const fa = '۰۱۲۳۴۵۶۷۸۹'; const ar = '٠١٢٣٤٥٦٧٨٩';
  return String(str).replace(/[۰-۹]/g, d => fa.indexOf(d)).replace(/[٠-٩]/g, d => ar.indexOf(d));
}
const numberWords = {
  'صفر':0,'یه':1,'ی':1,'یک':1,'اول':1,'دو':2,'سه':3,'چار':4,'چهار':4,'پنج':5,'شیش':6,'شش':6,'هفت':7,'هشت':8,'نه':9,
  'ده':10,'یازده':11,'دوازده':12,'سیزده':13,'چهارده':14,'پونزده':15,'پانزده':15,'شانزده':16,'هفده':17,'هجده':18,'نوزده':19,
  'بیست':20,'سی':30,'سین':30,'چهل':40,'پنجاه':50,'شصت':60,'هفتاد':70,'هشتاد':80,'نود':90,
  'صد':100,'یکصد':100,'دویست':200,'سیصد':300,'چهارصد':400,'پونصد':500,'پانصد':500,'ششصد':600,'هفتصد':700,'هشتصد':800,'نهصد':900
};
function wordsToNumber(phrase = '') {
  const clean = phrase.replace(/\s+و\s+/g, ' ').trim();
  if (!clean) return 0;
  let total = 0;
  for (const part of clean.split(/\s+/)) total += numberWords[part] || 0;
  if (/نیم/.test(phrase)) total += 0.5;
  return total;
}
function parseAmount(text = '') {
  const original = String(text);
  const t = faToEnDigits(original).replace(/,/g, '').replace(/٬/g, '');
  let m = /(\d+(?:\.\d+)?)\s*(میلیون|ملیون|م\b)/.exec(t);
  if (m) return Math.round(parseFloat(m[1]) * 1000000);
  m = /(\d+)\s*(هزار|هزارتومن|هزار تومن|هزارتومان|کا|k\b)/i.exec(t);
  if (m) return parseInt(m[1]) * 1000;
  m = /([آ-ی\s]+?)\s*(میلیون|ملیون)/.exec(original);
  if (m) return Math.round(wordsToNumber(m[1]) * 1000000);
  m = /([آ-ی\s]+?)\s*(هزار|تومن|تومان)/.exec(original);
  if (m) {
    const n = wordsToNumber(m[1]);
    if (n) return Math.round(n * 1000);
  }
  m = /(\d+)\s*(تومن|تومان)/.exec(t);
  if (m) { const v = parseInt(m[1]); return v < 1000 ? v * 1000 : v; }
  m = /(\d+)\s*(ریال)/.exec(t);
  if (m) return Math.round(parseInt(m[1]) / 10);
  const num = /(\d{1,})/.exec(t);
  if (!num) return 0;
  let val = parseInt(num[1]);
  if (val > 0 && val < 1000 && /(دادم|گرفتم|خریدم|کرایه|تاکسی|اسنپ|خرج|هزینه|پرداخت|واریز|حقوق|طلب|بدهکار|بستانکار)/.test(original)) val *= 1000;
  return val;
}
function pickParty(text = '') {
  const m = /(از|به|برای|بابت)\s+([آ-یA-Za-z0-9_\- ]{2,18})/.exec(text);
  return m ? m[2].replace(/(طلب|بدهکار|قرض|پول|تومن|تومان).*/, '').trim() : '';
}
function detectTransaction(text = '') {
  const raw = String(text || '').trim();
  const normalized = raw.replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  const amount = parseAmount(normalized);
  const isReceivable = /(طلب\s*دارم|طلبکارم|بستانکارم|قرض\s*دادم|پول\s*دادم\s*به|چک\s*دریافتنی|از .* طلب)/.test(normalized);
  const isPayable = /(بدهکارم|بدهی|قرض\s*گرفتم|باید\s*بدم|باید\s*پرداخت|چک\s*پرداختنی|به .* بدهکار)/.test(normalized);
  const incomeWords = /(واریز|واریزی|حقوق|درآمد|دریافت|گرفتم|فروش|سود|پورسانت|اجاره\s*گرفتم|برگشت\s*پول|کش\s*بک|دستمزد|کارمزد\s*گرفتم)/;
  const expenseWords = /(دادم|پرداخت|برداشت|خریدم|خرید|خرج|هزینه|کرایه|قسط|اجاره\s*دادم|قبض|شارژ|کارت\s*به\s*کارت\s*کردم|پوز|خرید اینترنتی)/;
  let type = incomeWords.test(normalized) && !expenseWords.test(normalized) ? 'income' : 'expense';
  if (isReceivable) type = 'income';
  if (isPayable) type = 'expense';

  let category = 'سایر';
  if (isReceivable) category = 'بستانکار / طلب';
  else if (isPayable) category = 'بدهکار / بدهی';
  else if (/تاکسی|اسنپ|تپسی|مترو|اتوبوس|بنزین|سوخت|پارکینگ|کرایه|رفت\s*و\s*آمد|حمل/.test(normalized)) category = 'حمل و نقل';
  else if (/سوپر|مارکت|نان|نونوایی|میوه|تره\s*بار|قصابی|مرغ|خوراک|برنج|لبنیات|افق|شهروند|هایپر/.test(normalized)) category = 'خوراکی و سوپرمارکت';
  else if (/رستوران|کافه|ناهار|شام|صبحانه|فست\s*فود|پیتزا|کباب|قهوه|اسنک/.test(normalized)) category = 'رستوران و کافه';
  else if (/حقوق|واریز|درآمد|فروش|سود|پورسانت|دستمزد/.test(normalized)) category = 'حقوق و درآمد';
  else if (/قسط|وام|بدهی|اقساط|تسهیلات/.test(normalized)) category = 'اقساط و بدهی';
  else if (/اجاره|رهن|خانه|منزل|دفتر/.test(normalized)) category = 'مسکن و اجاره';
  else if (/قبض|برق|آب|گاز|تلفن|اینترنت|شارژ/.test(normalized)) category = 'قبوض و خدمات';
  else if (/دکتر|دارو|درمان|بیمارستان|آزمایش|دندان/.test(normalized)) category = 'درمان و سلامت';
  else if (/لباس|کفش|پوشاک/.test(normalized)) category = 'پوشاک';
  else if (/مدرسه|دانشگاه|کتاب|آموزش|دوره|کلاس/.test(normalized)) category = 'آموزش';
  else if (/سفر|هتل|بلیط|پرواز|قطار/.test(normalized)) category = 'سفر';
  else if (/تفریح|سینما|بازی|اشتراک|نتفلیکس|فیلیمو|اسپاتیفای/.test(normalized)) category = 'تفریح و اشتراک';
  else if (/سرمایه|بورس|طلا|دلار|صندوق|کریپتو|ارز/.test(normalized)) category = 'سرمایه‌گذاری';

  const bank = (/ملی/.test(normalized) && 'بانک ملی') || (/ملت/.test(normalized) && 'بانک ملت') || (/پاسارگاد/.test(normalized) && 'بانک پاسارگاد') || (/سامان/.test(normalized) && 'بانک سامان') || (/صادرات/.test(normalized) && 'بانک صادرات') || '';
  const party = pickParty(normalized);
  let title = normalized || (type === 'income' ? 'درآمد جدید' : 'هزینه جدید');
  if (isReceivable && party) title = `طلب از ${party}`;
  if (isPayable && party) title = `بدهی به ${party}`;
  if (title.length > 52) title = title.slice(0, 52) + '…';
  return { title, amount: amount || 0, type, category, bank, party, accountingSide: isReceivable ? 'receivable' : isPayable ? 'payable' : '', confidence: amount ? 0.9 : 0.55, rawText: raw };
}
function sanitizeSettingsForClient(settings, isAdmin = false) {
  const copy = { ...settings };
  copy.aiToken = '';
  copy.aiTokenSet = Boolean(settings?.aiToken);
  return copy;
}

const faToEn = faToEnDigits;
const clientSettings = sanitizeSettingsForClient;
async function callAi(db,messages,json=false,imageBase64=null){ const s=db.settings||{}; if(!s.aiToken||s.aiProvider==='local') return null; let url=s.aiBaseUrl; if(!url){ if(s.aiProvider==='openai') url='https://api.openai.com/v1/chat/completions'; else if(s.aiProvider==='openrouter') url='https://openrouter.ai/api/v1/chat/completions'; else if(s.aiProvider==='groq') url='https://api.groq.com/openai/v1/chat/completions'; }
 const final=[{role:'system',content:s.systemPrompt},...messages]; if(imageBase64) final.push({role:'user',content:[{type:'text',text:'این رسید را JSON کن: title, amount, type, category, note'},{type:'image_url',image_url:{url:imageBase64}}]});
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${s.aiToken}`},body:JSON.stringify({model:s.aiModel,temperature:Number(s.temperature??0.2),response_format:json?{type:'json_object'}:undefined,messages:final})}); const d=await r.json(); if(!r.ok) throw new Error(d?.error?.message||'AI connection error'); return d?.choices?.[0]?.message?.content || ''; }

// default admin
{ const db=readDb(); if(!db.users.length){ db.users.push({id:id('u_'),name:'مدیر دست راست',email:'admin@dastrast.local',passwordHash:hashPassword('Admin12345'),role:'admin',createdAt:nowIso()}); writeDb(db); } }

function send(res, code, data, type='application/json'){ const body=type==='application/json'?JSON.stringify(data):data; res.writeHead(code, {'Content-Type': type==='application/json'?'application/json; charset=utf-8':type}); res.end(body); }
function getBody(req){ return new Promise(resolve=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{resolve(b?JSON.parse(b):{})}catch{resolve({})} }); }); }
function auth(req){ const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); const pl=verifyToken(token); if(!pl) return null; const db=readDb(); const user=db.users.find(u=>u.id===pl.uid); return user ? {db,user} : null; }
function match(url){ const u=new URL(url, `http://localhost:${PORT}`); return { path:u.pathname, parts:u.pathname.split('/').filter(Boolean) }; }


function compactName(name=''){ return String(name).trim().replace(/^(آقا|خانم|جناب)\s+/,'').replace(/\s+/g,' '); }
function findPersonCandidates(db,userId,name=''){
  const n=compactName(name); if(!n) return [];
  return db.persons.filter(p=>p.userId===userId && (p.name===n || p.name.includes(n) || n.includes(p.name.split(' ')[0])));
}
function ensurePerson(db,userId,name=''){
  const n=compactName(name || 'شخص بدون نام');
  const exact=db.persons.find(p=>p.userId===userId && p.name===n);
  if(exact) return exact;
  const person={id:id('p_'),userId,name:n,phone:'',note:'',createdAt:nowIso()};
  db.persons.push(person); return person;
}
function personBalance(db,userId,personId){
  return db.transactions.filter(t=>t.userId===userId && t.personId===personId).reduce((sum,t)=>{
    if(t.accountingSide==='receivable') return sum+Number(t.amount||0);
    if(t.accountingSide==='payable') return sum-Number(t.amount||0);
    if(t.accountingSide==='settlement') return sum+Number(t.settlementDelta||0);
    return sum;
  },0);
}
function extractPersonName(text=''){
  const cleaned=String(text).replace(/برای\s+\d{1,2}\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/g,'').replace(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g,'');
  const direct=/(?:از|به)\s+([آ-یA-Za-z]+(?:\s+[آ-یA-Za-z]+)?)\s+(?:پول|مبلغ|قرض|چک|طلب|دادم|گرفتم|پرداخت)/.exec(cleaned);
  if(direct) return compactName(direct[1]);
  const patterns=[/از\s+([آ-یA-Za-z ]{2,24}?)\s+(?:پول|مبلغ|چک|طلب|قرض|گرفتم|دریافت)/,/به\s+([آ-یA-Za-z ]{2,24}?)\s+(?:پول|مبلغ|چک|قرض|دادم|پرداخت)/,/با\s+([آ-یA-Za-z ]{2,24})\s+تسویه/,/(?:طلب از|بدهی به)\s+([آ-یA-Za-z ]{2,24})/];
  for(const r of patterns){ const m=r.exec(cleaned); if(m) return compactName(m[1].replace(/(برای|بابت|رو|را|که).*$/,'')); }
  const tail=/(?:^|\s)(?:به|از|با)\s+([آ-یA-Za-z][آ-یA-Za-z ]{1,22})\s*$/.exec(cleaned);
  if(tail) return compactName(tail[1]);
  const pp=pickParty(cleaned); return /\d/.test(pp)?'':pp;
}
function parsePersianDueDate(text=''){
  const months={فروردین:'01',اردیبهشت:'02',خرداد:'03',تیر:'04',مرداد:'05',شهریور:'06',مهر:'07',آبان:'08',آذر:'09',دی:'10',بهمن:'11',اسفند:'12'};
  const t=faToEnDigits(text);
  const m=/(\d{1,2})\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/.exec(t);
  if(m){ const y=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric'}).format(new Date()).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); return `${y}/${months[m[2]]}/${String(m[1]).padStart(2,'0')}`; }
  const d=/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(t); if(d) return `${d[1]}/${String(d[2]).padStart(2,'0')}/${String(d[3]).padStart(2,'0')}`;
  return '';
}

function ensureExpert(db,userId,name=''){
  const n=compactName(name||'کارشناس'); let e=db.experts.find(x=>x.userId===userId&&x.name===n);
  if(!e){ e={id:id('ex_'),userId,name:n,role:'کارشناس',balance:0,createdAt:nowIso()}; db.experts.push(e); }
  return e;
}
function ensureTreasuryAccount(db,userId,title='صندوق اصلی'){
  let a=db.accounts.find(x=>x.userId===userId&&x.title===title);
  if(!a){ a={id:id('acc_'),userId,title,bank:'',balance:0,type:/بانک|ملت|ملی|پاسارگاد|سامان/.test(title)?'bank':'cash',createdAt:nowIso()}; db.accounts.push(a); }
  return a;
}
function extractAfter(text, words){ for(const w of words){ const r=new RegExp(w+'\\s+([آ-یA-Za-z0-9 ]{2,30})'); const m=r.exec(text); if(m) return compactName(m[1].replace(/(مبلغ|به مبلغ|برای|بابت|واریز|برداشت|پرداخت).*/,'').replace(/[0-9۰-۹]+.*/,'').replace(/(میلیون|ملیون|هزار|تومن|تومان).*/,'')); } return ''; }

const typeFa = {asset:'دارایی',liability:'بدهی',equity:'سرمایه',income:'درآمد',expense:'هزینه'};
function ensureChartAccount(db,userId,title,type='asset'){
  let a=db.chartAccounts.find(x=>x.userId===userId && x.title===title);
  if(!a){ const count=db.chartAccounts.filter(x=>x.userId===userId).length+1; a={id:id('ca_'),userId,code:String(1000+count),title,type,typeFa:typeFa[type]||type,createdAt:nowIso()}; db.chartAccounts.push(a); }
  return a;
}
function createJournal(db,userId,description,lines,source='manual'){
  const norm=lines.map(l=>{ const acc=ensureChartAccount(db,userId,l.accountTitle,l.type||'asset'); return {...l,accountId:acc.id,accountTitle:acc.title,debit:Number(l.debit||0),credit:Number(l.credit||0)}; });
  const totalDebit=norm.reduce((s,l)=>s+l.debit,0), totalCredit=norm.reduce((s,l)=>s+l.credit,0);
  const entry={id:id('je_'),userId,description,totalDebit,totalCredit,balanced:totalDebit===totalCredit,lines:norm,source,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()};
  db.journalEntries.unshift(entry); return entry;
}
function journalFromTransaction(db,tx){
  const amount=Number(tx.amount||0); if(!amount) return;
  if(tx.type==='income') createJournal(db,tx.userId,tx.title,[{accountTitle:'صندوق',type:'asset',debit:amount},{accountTitle:tx.category||'درآمد',type:'income',credit:amount}],tx.method||'transaction');
  else createJournal(db,tx.userId,tx.title,[{accountTitle:tx.category||'هزینه',type:'expense',debit:amount},{accountTitle:'صندوق',type:'asset',credit:amount}],tx.method||'transaction');
}
function parseLocalCommand(db,user,text){
  let raw=String(text||'');
  for(const tr of db.assistantTraining.filter(x=>x.userId===user.id)){ if(tr.phrase && raw.includes(tr.phrase)) raw += ' ' + (tr.meaning||''); }
  for(const rule of db.aiRules.filter(x=>x.userId===user.id)){ if(rule.pattern && raw.includes(rule.pattern)) raw += ' ' + (rule.action||''); }
  if(/[؛;]+/.test(raw)){ const parts=raw.split(/[؛;]+/).map(x=>x.trim()).filter(Boolean); return {action:'multi_command', results:parts.map(part=>parseLocalCommand(db,user,part)), message:`${parts.length.toLocaleString('fa-IR')} عملیات پردازش شد.`}; }
  const amount=parseAmount(raw);
  // Treasury: deposit, withdraw, transfer
  if(/انتقال/.test(raw) && /از/.test(raw) && /به/.test(raw)){
    const fromName=extractAfter(raw,['از'])||'صندوق اصلی'; const toName=extractAfter(raw,['به'])||'صندوق اصلی';
    const from=ensureTreasuryAccount(db,user.id,fromName), to=ensureTreasuryAccount(db,user.id,toName);
    from.balance-=Number(amount||0); to.balance+=Number(amount||0);
    const mv={id:id('mv_'),userId:user.id,type:'transfer',fromAccountId:from.id,toAccountId:to.id,from:from.title,to:to.title,amount:Number(amount||0),note:raw,createdAt:nowIso()}; db.treasuryMovements.push(mv);
    return {action:'treasury_transfer',movement:mv,message:`انتقال ${Number(amount||0).toLocaleString('fa-IR')} تومان از ${from.title} به ${to.title} ثبت شد.`};
  }
  if(/واریز|برداشت/.test(raw) && /(صندوق|حساب|بانک|کیف)/.test(raw)){
    const isDeposit=/واریز/.test(raw); const accName=extractAfter(raw,['به','از'])||(/بانک ملت/.test(raw)?'بانک ملت':'صندوق اصلی'); const acc=ensureTreasuryAccount(db,user.id,accName);
    acc.balance += isDeposit ? Number(amount||0) : -Number(amount||0);
    const mv={id:id('mv_'),userId:user.id,type:isDeposit?'deposit':'withdraw',accountId:acc.id,account:acc.title,amount:Number(amount||0),note:raw,createdAt:nowIso()}; db.treasuryMovements.push(mv);
    return {action:'treasury_movement',movement:mv,message:`${isDeposit?'واریز به':'برداشت از'} ${acc.title} به مبلغ ${Number(amount||0).toLocaleString('fa-IR')} تومان ثبت شد.`};
  }
  if(/کارشناس|کارشناسان/.test(raw)){
    const name=extractAfter(raw,['کارشناس','با']) || 'کارشناس'; const ex=ensureExpert(db,user.id,name);
    const st={id:id('set_'),userId:user.id,expertId:ex.id,expertName:ex.name,amount:Number(amount||0),type:/پرداخت|تسویه/.test(raw)?'payment':'debt',status:'paid',note:raw,createdAt:nowIso()};
    db.expertSettlements.push(st); ex.balance += st.type==='payment' ? -st.amount : st.amount;
    return {action:'expert_settlement',settlement:st,message:`تسویه/پرداخت کارشناس ${ex.name} به مبلغ ${st.amount.toLocaleString('fa-IR')} تومان ثبت شد.`};
  }
  if(/پروژه|مشتری/.test(raw)){
    const cm=/مشتری\s+([آ-یA-Za-z ]+?)(?:\s+[0-9۰-۹]|\s+\d|\s+میلیون|\s+ملیون|\s+هزار|$)/.exec(raw); const customer=(cm&&compactName(cm[1])) || extractAfter(raw,['مشتری','برای']) || extractPersonName(raw) || 'مشتری'; const projectName=extractAfter(raw,['پروژه']) || `پروژه ${customer}`;
    const person=ensurePerson(db,user.id,customer);
    const pr={id:id('pr_'),userId:user.id,customerId:person.id,customerName:person.name,title:projectName,amount:Number(amount||0),paid:0,balance:Number(amount||0),status:Number(amount||0)>0?'debtor':'clear',createdAt:nowIso()};
    db.projects.push(pr);
    if(amount) db.transactions.push({id:id('tx_'),userId:user.id,personId:person.id,party:person.name,projectId:pr.id,title:`مطالبه پروژه ${projectName}`,amount:Number(amount),type:'income',category:'بستانکار / طلب',accountingSide:'receivable',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Assistant Project',createdAt:nowIso()});
    return {action:'project_created',project:pr,message:`پروژه ${projectName} برای ${person.name} با مبلغ ${Number(amount||0).toLocaleString('fa-IR')} تومان ثبت شد.`};
  }
  const personName=extractPersonName(raw);
  const candidates=personName?findPersonCandidates(db,user.id,personName):[];
  const ambiguous=candidates.length>1 && !candidates.some(p=>p.name===personName);
  const alternatives=candidates.length>1?candidates:undefined;
  if(ambiguous) return {needsClarification:true, question:`چند نفر با نام «${personName}» پیدا شد؛ کدام مورد؟`, candidates, pending:{text:raw, amount, personName}};
  const person=personName ? (candidates[0] || ensurePerson(db,user.id,personName)) : null;
  if(/چک/.test(raw)){
    const receivable=/(گرفتم|دریافتی|دریافت|از)/.test(raw) && !/(دادم|صادر|پرداختنی)/.test(raw);
    const payable=/(دادم|صادر|پرداختنی|به)/.test(raw) && !/(گرفتم|دریافتی)/.test(raw);
    const type=receivable&&!payable?'receivable':'payable';
    const bank=(/ملت/.test(raw)&&'بانک ملت')||(/ملی/.test(raw)&&'بانک ملی')||(/پاسارگاد/.test(raw)&&'بانک پاسارگاد')||(/سامان/.test(raw)&&'بانک سامان')||'';
    const dueDate=parsePersianDueDate(raw)||'بدون تاریخ';
    const chq={id:id('chq_'),userId:user.id,personId:person?.id||'',personName:person?.name||personName||'',title:`چک ${type==='receivable'?'دریافتی':'صادره'} ${person?.name?`- ${person.name}`:''}`,amount:Number(amount||0),dueDate,type,status:'pending',bank,createdAt:nowIso()};
    db.cheques.push(chq);
    if(person && amount){ db.transactions.push({id:id('tx_'),userId:user.id,personId:person.id,party:person.name,title:chq.title,amount:Number(amount),type:type==='receivable'?'income':'expense',category:type==='receivable'?'بستانکار / طلب':'بدهکار / بدهی',accountingSide:type==='receivable'?'receivable':'payable',bank,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Assistant Cheque',createdAt:nowIso()}); }
    return {action:'cheque_created', cheque:chq, message:`چک ${type==='receivable'?'دریافتی':'صادره'} به مبلغ ${Number(amount||0).toLocaleString('fa-IR')} تومان برای ${dueDate} ثبت شد.`};
  }
  if(/تسویه/.test(raw) && person){
    const bal=personBalance(db,user.id,person.id); if(!bal) return {action:'settled', message:`حساب ${person.name} از قبل صفر است.`, person};
    const tx={id:id('tx_'),userId:user.id,personId:person.id,party:person.name,title:`تسویه حساب با ${person.name}`,amount:Math.abs(bal),type:bal>0?'income':'expense',category:'تسویه حساب',accountingSide:'settlement',settlementDelta:-bal,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Assistant Settlement',createdAt:nowIso()};
    db.transactions.push(tx); return {action:'settled', transaction:tx, message:`حساب ${person.name} تسویه شد. مانده قبلی ${Math.abs(bal).toLocaleString('fa-IR')} تومان بود.`};
  }
  const tx=detectTransaction(raw);
  if(person){ tx.personId=person.id; tx.party=person.name; if(/قرض\s*گرفتم|بدهکار|بدهی|باید.*بدم/.test(raw)){tx.accountingSide='payable';tx.category='بدهکار / بدهی';tx.type='expense';} if(/قرض\s*دادم|طلب|طلبکار|بستانکار/.test(raw)){tx.accountingSide='receivable';tx.category='بستانکار / طلب';tx.type='income';} }
  return {action:'transaction_parsed', parsed:tx, person, alternatives};
}
const server = http.createServer(async (req,res)=>{
  try{
    const {path: p, parts}=match(req.url); const method=req.method; const body = ['POST','PUT','PATCH'].includes(method) ? await getBody(req) : {};
    if(p.startsWith('/api/auth/register') && method==='POST'){ const {name,email,password}=body; const db=readDb(); if(!name||!email||!password||password.length<6) return send(res,400,{error:'نام، ایمیل و رمز حداقل ۶ کاراکتر لازم است.'}); if(db.users.some(u=>u.email.toLowerCase()===email.toLowerCase())) return send(res,409,{error:'این ایمیل قبلاً ثبت شده است.'}); const user={id:id('u_'),name,email:email.toLowerCase(),passwordHash:hashPassword(password),role:'user',createdAt:nowIso()}; db.users.push(user); writeDb(db); return send(res,200,{token:signToken({uid:user.id}),user:pub(user)}); }
    if(p.startsWith('/api/auth/login') && method==='POST'){ const db=readDb(); const user=db.users.find(u=>u.email.toLowerCase()===String(body.email||'').toLowerCase()); if(!user||!verifyPassword(body.password||'',user.passwordHash)) return send(res,401,{error:'ایمیل یا رمز عبور اشتباه است.'}); return send(res,200,{token:signToken({uid:user.id}),user:pub(user)}); }
    if(p.startsWith('/api/')){
      const ctx=auth(req); if(!ctx) return send(res,401,{error:'نیاز به ورود دارید.'}); const {db,user}=ctx;
      if(p==='/api/me') return send(res,200,{user:pub(user),settings:clientSettings(db.settings,user.role==='admin')});
      if(p==='/api/transactions' && method==='GET') return send(res,200,db.transactions.filter(t=>t.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
      if(p==='/api/transactions' && method==='POST'){ const tx={id:id('tx_'),userId:user.id,title:body.title||'تراکنش',amount:Number(body.amount||0),type:body.type||'expense',category:body.category||'سایر',bank:body.bank||'',date:body.date||new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:body.method||'Manual',note:body.note||'',createdAt:nowIso()}; db.transactions.push(tx); journalFromTransaction(db,tx); writeDb(db); return send(res,200,tx); }
      if(parts[1]==='transactions' && parts[2] && method==='PUT'){ const tx=db.transactions.find(t=>t.id===parts[2]&&t.userId===user.id); if(!tx) return send(res,404,{error:'تراکنش پیدا نشد'}); Object.assign(tx,body); writeDb(db); return send(res,200,tx); }
      if(parts[1]==='transactions' && parts[2] && method==='DELETE'){ db.transactions=db.transactions.filter(t=>!(t.id===parts[2]&&t.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/cheques' && method==='GET') return send(res,200,db.cheques.filter(c=>c.userId===user.id));
      if(p==='/api/cheques' && method==='POST'){ const c={id:id('chq_'),userId:user.id,title:body.title||'چک',amount:Number(body.amount||0),dueDate:body.dueDate||'',type:body.type||'payable',status:body.status||'pending',createdAt:nowIso()}; db.cheques.push(c); writeDb(db); return send(res,200,c); }
      if(parts[1]==='cheques' && parts[2] && method==='DELETE'){ db.cheques=db.cheques.filter(c=>!(c.id===parts[2]&&c.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/accounting/chart' && method==='GET') return send(res,200,db.chartAccounts.filter(x=>x.userId===user.id));
      if(p==='/api/accounting/chart' && method==='POST'){ const a=ensureChartAccount(db,user.id,body.title||'حساب جدید',body.type||'asset'); writeDb(db); return send(res,200,a); }
      if(parts[1]==='accounting' && parts[2]==='chart' && parts[3] && method==='PUT'){ const a=db.chartAccounts.find(x=>x.id===parts[3]&&x.userId===user.id); if(!a) return send(res,404,{error:'سرفصل پیدا نشد'}); Object.assign(a,body,{typeFa:typeFa[body.type]||a.typeFa}); writeDb(db); return send(res,200,a); }
      if(parts[1]==='accounting' && parts[2]==='chart' && parts[3] && method==='DELETE'){ db.chartAccounts=db.chartAccounts.filter(x=>!(x.id===parts[3]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/accounting/journal' && method==='GET') return send(res,200,db.journalEntries.filter(x=>x.userId===user.id));
      if(p==='/api/accounting/journal' && method==='POST'){ const j=createJournal(db,user.id,body.description||'سند حسابداری',body.lines||[],'manual'); writeDb(db); return send(res,200,j); }
      if(parts[1]==='accounting' && parts[2]==='journal' && parts[3] && method==='DELETE'){ db.journalEntries=db.journalEntries.filter(x=>!(x.id===parts[3]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/accounting/trial-balance' && method==='GET'){
        const rows={}; db.journalEntries.filter(j=>j.userId===user.id).forEach(j=>j.lines.forEach(l=>{ rows[l.accountId] ||= {accountId:l.accountId,accountTitle:l.accountTitle,debit:0,credit:0,balance:0}; rows[l.accountId].debit+=Number(l.debit||0); rows[l.accountId].credit+=Number(l.credit||0); rows[l.accountId].balance=rows[l.accountId].debit-rows[l.accountId].credit; })); return send(res,200,Object.values(rows));
      }
      if(p==='/api/accounting/profit-loss' && method==='GET'){ const txs=db.transactions.filter(t=>t.userId===user.id); const income=txs.filter(t=>t.type==='income').reduce((a,t)=>a+Number(t.amount),0); const expense=txs.filter(t=>t.type==='expense').reduce((a,t)=>a+Number(t.amount),0); return send(res,200,{income,expense,netProfit:income-expense,grossProfit:income-expense}); }
      if(p==='/api/accounting/cash-flow' && method==='GET'){ const m=db.treasuryMovements.filter(x=>x.userId===user.id); const cashIn=m.filter(x=>x.type==='deposit').reduce((a,x)=>a+Number(x.amount),0); const cashOut=m.filter(x=>x.type==='withdraw').reduce((a,x)=>a+Number(x.amount),0); return send(res,200,{cashIn,cashOut,netCashFlow:cashIn-cashOut,movements:m}); }
      if(p==='/api/invoices' && method==='GET') return send(res,200,db.invoices.filter(x=>x.userId===user.id));
      if(p==='/api/invoices' && method==='POST'){ const inv={id:id('inv_'),userId:user.id,type:body.type||'invoice',customerName:body.customerName||'مشتری',amount:Number(body.amount||0),status:'draft',items:body.items||[],createdAt:nowIso()}; db.invoices.unshift(inv); writeDb(db); return send(res,200,inv); }
      if(parts[1]==='invoices' && parts[2] && method==='PUT'){ const inv=db.invoices.find(x=>x.id===parts[2]&&x.userId===user.id); if(!inv) return send(res,404,{error:'فاکتور پیدا نشد'}); Object.assign(inv,body); if(body.amount!==undefined) inv.amount=Number(body.amount); writeDb(db); return send(res,200,inv); }
      if(parts[1]==='invoices' && parts[2] && method==='DELETE'){ db.invoices=db.invoices.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/ai/rules' && method==='GET') return send(res,200,db.aiRules.filter(x=>x.userId===user.id));
      if(p==='/api/ai/rules' && method==='POST'){ const rule={id:id('rule_'),userId:user.id,pattern:body.pattern||'',action:body.action||'',createdAt:nowIso()}; db.aiRules.unshift(rule); writeDb(db); return send(res,200,rule); }
      if(p==='/api/push/subscribe' && method==='POST'){ db.pushSubscriptions.push({id:id('sub_'),userId:user.id,subscription:body,createdAt:nowIso()}); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/projects' && method==='GET') return send(res,200,db.projects.filter(x=>x.userId===user.id));
      if(p==='/api/projects' && method==='POST'){ const customer=ensurePerson(db,user.id,body.customerName||'مشتری'); const pr={id:id('pr_'),userId:user.id,customerId:customer.id,customerName:customer.name,title:body.title||'پروژه',amount:Number(body.amount||0),paid:Number(body.paid||0),balance:Number(body.amount||0)-Number(body.paid||0),status:(Number(body.amount||0)-Number(body.paid||0))>0?'debtor':'clear',createdAt:nowIso()}; db.projects.push(pr); writeDb(db); return send(res,200,pr); }
      if(parts[1]==='projects' && parts[2] && method==='PUT'){ const pr=db.projects.find(x=>x.id===parts[2]&&x.userId===user.id); if(!pr) return send(res,404,{error:'پروژه پیدا نشد'}); Object.assign(pr,body); if(body.amount!==undefined) pr.amount=Number(body.amount); if(body.paid!==undefined) pr.paid=Number(body.paid); pr.balance=Number(pr.amount||0)-Number(pr.paid||0); pr.status=pr.balance>0?'debtor':'clear'; writeDb(db); return send(res,200,pr); }
      if(parts[1]==='projects' && parts[2] && method==='DELETE'){ db.projects=db.projects.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/experts' && method==='GET') return send(res,200,db.experts.filter(x=>x.userId===user.id));
      if(p==='/api/experts' && method==='POST'){ const ex=ensureExpert(db,user.id,body.name||'کارشناس'); ex.role=body.role||ex.role; writeDb(db); return send(res,200,ex); }
      if(parts[1]==='experts' && parts[2] && method==='PUT'){ const ex=db.experts.find(x=>x.id===parts[2]&&x.userId===user.id); if(!ex) return send(res,404,{error:'کارشناس پیدا نشد'}); Object.assign(ex,body); writeDb(db); return send(res,200,ex); }
      if(parts[1]==='experts' && parts[2] && method==='DELETE'){ db.experts=db.experts.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/expert-settlements' && method==='GET') return send(res,200,db.expertSettlements.filter(x=>x.userId===user.id));
      if(p==='/api/expert-settlements' && method==='POST'){ const ex=ensureExpert(db,user.id,body.expertName||'کارشناس'); const st={id:id('set_'),userId:user.id,expertId:ex.id,expertName:ex.name,amount:Number(body.amount||0),type:body.type||'payment',status:'paid',note:body.note||'',createdAt:nowIso()}; db.expertSettlements.push(st); ex.balance += st.type==='payment'?-st.amount:st.amount; writeDb(db); return send(res,200,st); }
      if(p==='/api/treasury' && method==='GET') return send(res,200,{accounts:db.accounts.filter(x=>x.userId===user.id),movements:db.treasuryMovements.filter(x=>x.userId===user.id)});
      if(p==='/api/treasury/movement' && method==='POST'){ const acc=ensureTreasuryAccount(db,user.id,body.account||'صندوق اصلی'); const val=Number(body.amount||0); const type=body.type||'deposit'; acc.balance += type==='withdraw'?-val:val; const mv={id:id('mv_'),userId:user.id,type,accountId:acc.id,account:acc.title,amount:val,note:body.note||'',createdAt:nowIso()}; db.treasuryMovements.push(mv); writeDb(db); return send(res,200,mv); }
      if(p==='/api/persons' && method==='GET') return send(res,200,db.persons.filter(x=>x.userId===user.id).map(x=>({...x,balance:personBalance(db,user.id,x.id)})));
      if(p==='/api/persons' && method==='POST'){ const person=ensurePerson(db,user.id,body.name||'شخص جدید'); person.phone=body.phone||person.phone||''; person.note=body.note||person.note||''; writeDb(db); return send(res,200,{...person,balance:personBalance(db,user.id,person.id)}); }
      if(parts[1]==='persons' && parts[2] && method==='PUT'){ const person=db.persons.find(x=>x.id===parts[2]&&x.userId===user.id); if(!person) return send(res,404,{error:'شخص پیدا نشد'}); Object.assign(person,body); writeDb(db); return send(res,200,{...person,balance:personBalance(db,user.id,person.id)}); }
      if(parts[1]==='persons' && parts[2] && method==='DELETE'){ db.persons=db.persons.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(parts[1]==='persons' && parts[2] && parts[3]==='ledger') return send(res,200,db.transactions.filter(t=>t.userId===user.id&&t.personId===parts[2]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
      if(p==='/api/accounts' && method==='GET') return send(res,200,db.accounts.filter(x=>x.userId===user.id));
      if(p==='/api/accounts' && method==='POST'){ const acc={id:id('acc_'),userId:user.id,title:body.title||'حساب جدید',bank:body.bank||'',balance:Number(body.balance||0),createdAt:nowIso()}; db.accounts.push(acc); writeDb(db); return send(res,200,acc); }
      if(parts[1]==='accounts' && parts[2] && method==='PUT'){ const acc=db.accounts.find(x=>x.id===parts[2]&&x.userId===user.id); if(!acc) return send(res,404,{error:'حساب پیدا نشد'}); Object.assign(acc,body); if(body.balance!==undefined) acc.balance=Number(body.balance); writeDb(db); return send(res,200,acc); }
      if(parts[1]==='accounts' && parts[2] && method==='DELETE'){ db.accounts=db.accounts.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/categories' && method==='GET') return send(res,200,db.categories);
      if(p==='/api/categories' && method==='POST'){ const name=String(body.name||'').trim(); if(name&&!db.categories.includes(name)) db.categories.push(name); writeDb(db); return send(res,200,db.categories); }
      if(parts[1]==='categories' && parts[2] && method==='PUT'){ const old=decodeURIComponent(parts[2]); const idx=db.categories.indexOf(old); if(idx>=0) db.categories[idx]=body.name||old; writeDb(db); return send(res,200,db.categories); }
      if(parts[1]==='categories' && parts[2] && method==='DELETE'){ const old=decodeURIComponent(parts[2]); db.categories=db.categories.filter(c=>c!==old); writeDb(db); return send(res,200,db.categories); }
      if(p==='/api/training' && method==='GET') return send(res,200,db.assistantTraining.filter(x=>x.userId===user.id));
      if(p==='/api/training' && method==='POST'){ const tr={id:id('tr_'),userId:user.id,phrase:body.phrase||'',meaning:body.meaning||'',createdAt:nowIso()}; db.assistantTraining.push(tr); writeDb(db); return send(res,200,tr); }
      if(p==='/api/assistant/command' && method==='POST'){
        const result=parseLocalCommand(db,user,body.text||'');
        if(result.needsClarification) return send(res,200,result);
        const persistParsed=(r,note)=>{ if(r.action==='transaction_parsed'){ const parsed=r.parsed; if(Number(parsed.amount)>0){ const tx={id:id('tx_'),userId:user.id,title:parsed.title||'تراکنش',amount:Number(parsed.amount||0),type:parsed.type||'expense',category:parsed.category||'سایر',bank:parsed.bank||'',party:parsed.party||'',personId:parsed.personId||'',accountingSide:parsed.accountingSide||'',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Assistant Local',note,createdAt:nowIso()}; db.transactions.push(tx); journalFromTransaction(db,tx); r.transaction=tx; r.message=`ثبت شد: ${tx.title} - ${Number(tx.amount).toLocaleString('fa-IR')} تومان`; } } return r; };
        if(result.action==='multi_command') { result.results=result.results.map(r=>persistParsed(r,body.text||'')); writeDb(db); return send(res,200,{...result,message:`${result.results.length.toLocaleString('fa-IR')} عملیات پردازش و ثبت شد.`}); }
        if(result.action==='transaction_parsed') { persistParsed(result,body.text||''); writeDb(db); return send(res,200,result); }
        writeDb(db); return send(res,200,result);
      }
      if(p==='/api/sms' && method==='GET') return send(res,200,db.smsInbox.filter(s=>s.userId===user.id));
      if(p==='/api/sms/parse' && method==='POST'){ const parsed=detectTransaction(body.text||''); const sms={id:id('sms_'),userId:user.id,sender:body.sender||'BANK',text:body.text||'',parsed,status:'pending',createdAt:nowIso()}; db.smsInbox.unshift(sms); writeDb(db); return send(res,200,sms); }
      if(p==='/api/ai/parse-transaction' && method==='POST'){ try{ const content=await callAi(db,[{role:'user',content:`متن را JSON تراکنش کن: ${body.text||''}`}],true); const parsed=content?{...detectTransaction(body.text||''),...JSON.parse(content.replace(/```json|```/g,''))}:detectTransaction(body.text||''); return send(res,200,parsed); }catch(e){ return send(res,200,{...detectTransaction(body.text||''),aiWarning:e.message}); } }
      if(p==='/api/ai/parse-receipt' && method==='POST'){ try{ const content=await callAi(db,[{role:'user',content:'رسید را تحلیل کن'}],true,body.imageBase64); const parsed=content?JSON.parse(content.replace(/```json|```/g,'')):detectTransaction(body.text||'رسید خرید'); return send(res,200,{...detectTransaction(body.text||'رسید خرید'),...parsed,type:parsed.type||'expense'}); }catch(e){ return send(res,200,{title:'رسید اسکن‌شده',amount:0,type:'expense',category:'سایر',aiWarning:e.message}); } }
      if(p==='/api/ai/ask' && method==='POST'){ const txs=db.transactions.filter(t=>t.userId===user.id); try{ const content=await callAi(db,[{role:'user',content:`سوال: ${body.question}\nداده‌ها:${JSON.stringify(txs.slice(0,150))}`}]); if(content) return send(res,200,{answer:content}); }catch{} const inc=txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0), exp=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0), rest=txs.filter(t=>/رستوران|کافه/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0), payable=txs.filter(t=>/بدهکار|بدهی/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0), receivable=txs.filter(t=>/بستانکار|طلب/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0); const biggest=[...txs].sort((a,b)=>Number(b.amount)-Number(a.amount))[0]; const q=body.question||''; let answer=`خلاصه مالی: درآمد ${inc.toLocaleString('fa-IR')}، هزینه ${exp.toLocaleString('fa-IR')} و مانده ${(inc-exp).toLocaleString('fa-IR')} تومان.`; if(/رستوران|کافه/.test(q)) answer=`مجموع هزینه‌های رستوران و کافه شما ${rest.toLocaleString('fa-IR')} تومان است.`; else if(/بده|طلب|بستان/.test(q)) answer=`طلب/بستانکاری: ${receivable.toLocaleString('fa-IR')} تومان، بدهی/بدهکاری: ${payable.toLocaleString('fa-IR')} تومان.`; else if(/بزرگترین|بزرگ‌ترین/.test(q)&&biggest) answer=`بزرگ‌ترین تراکنش: ${biggest.title} به مبلغ ${Number(biggest.amount).toLocaleString('fa-IR')} تومان.`; return send(res,200,{answer}); }
      if(user.role !== 'admin') return send(res,403,{error:'دسترسی ادمین لازم است.'});
      if(p==='/api/admin/stats'){ const byCat={}; db.transactions.forEach(t=>byCat[t.category]=(byCat[t.category]||0)+Number(t.amount)); return send(res,200,{users:db.users.map(pub),counts:{users:db.users.length,transactions:db.transactions.length,cheques:db.cheques.length,sms:db.smsInbox.length},totals:{income:db.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0),expense:db.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0)},byCat}); }
      if(p==='/api/admin/settings' && method==='GET') return send(res,200,clientSettings(db.settings,true));
      if(p==='/api/admin/settings' && method==='PUT'){ const next={...db.settings,...body}; if(!body.aiToken || body.aiToken==='********') next.aiToken=db.settings.aiToken; db.settings=next; writeDb(db); return send(res,200,clientSettings(next,true)); }
      if(p==='/api/admin/test-ai' && method==='POST'){ try{ const answer=await callAi(db,[{role:'user',content:body.prompt||'سلام'}]); return send(res,200,{ok:true,answer:answer||'حالت Local فعال است؛ اتصال خارجی تست نشد.'}); }catch(e){ return send(res,400,{ok:false,error:e.message}); } }
      return send(res,404,{error:'API not found'});
    }
    if(p==='/manifest.webmanifest') return send(res,200,fs.readFileSync(path.join(ROOT,'manifest.webmanifest')),'application/manifest+json');
    if(p==='/sw.js') return send(res,200,fs.readFileSync(path.join(ROOT,'sw.js')),'application/javascript');
    if(p==='/icon-192.png' || p==='/icon-512.png') return send(res,200,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGOSHzRgAAAAABJRU5ErkJggg==','base64'),'image/png');
    let file = p==='/' ? path.join(DIST,'index.html') : path.join(DIST, decodeURIComponent(p));
    if(!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file=path.join(DIST,'index.html');
    const ext=path.extname(file).toLowerCase(); const type=ext==='.html'?'text/html; charset=utf-8':ext==='.js'?'application/javascript':ext==='.css'?'text/css':'application/octet-stream';
    send(res,200,fs.readFileSync(file),type);
  }catch(e){ send(res,500,{error:e.message||'server error'}); }
});
server.listen(PORT,()=>console.log(`Dast Rast portable is running: http://localhost:${PORT}`));
