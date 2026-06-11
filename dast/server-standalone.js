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
  users: [], transactions: [], cheques: [], smsInbox: [], persons: [], accounts: [], assistantTraining: [],
  settings: { appName:'دست راست', aiProvider:'local', aiBaseUrl:'', aiModel:'gpt-4o-mini', aiToken:'', temperature:0.2, systemPrompt:'تو دستیار مالی فارسی اپلیکیشن دست راست هستی.', defaultCurrency:'تومان', reminderDays:[7,3,1], notificationChannels:['inApp'] }
};
const nowIso = () => new Date().toISOString();

function normalizeDb(db){
  db.users ||= []; db.transactions ||= []; db.cheques ||= []; db.smsInbox ||= [];
  db.persons ||= []; db.accounts ||= []; db.projects ||= []; db.experts ||= []; db.expertSettlements ||= []; db.treasuryMovements ||= []; db.chartAccounts ||= []; db.journalEntries ||= []; db.invoices ||= []; db.aiRules ||= []; db.pushSubscriptions ||= []; db.undoStack ||= []; db.corrections ||= []; db.dashboardPrefs ||= {}; db.branding ||= {}; db.categories ||= [
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

// default admin + بازسازی دفتر برای دیتابیس قدیمی
function rebuildAutoJournals(db){ for(const user of db.users){ const uid=user.id; db.journalEntries=db.journalEntries.filter(j=>!(j.userId===uid&&j.source!=='manual')); db.transactions.filter(t=>t.userId===uid&&!t.chequeId).forEach(t=>journalFromTransaction(db,t)); db.treasuryMovements.filter(m=>m.userId===uid&&m.source!=='cheque').forEach(m=>{ if(m.type==='deposit') createJournal(db,uid,`واریز به ${m.account}`,[{accountTitle:m.account,type:'asset',debit:Number(m.amount)},{accountTitle:m.note||'سایر درآمدها',type:'income',credit:Number(m.amount)}],'treasury',m.id); else if(m.type==='withdraw') createJournal(db,uid,`برداشت از ${m.account}`,[{accountTitle:m.note||'سایر هزینه‌ها',type:'expense',debit:Number(m.amount)},{accountTitle:m.account,type:'asset',credit:Number(m.amount)}],'treasury',m.id); else if(m.type==='transfer') createJournal(db,uid,`انتقال از ${m.from} به ${m.to}`,[{accountTitle:m.to,type:'asset',debit:Number(m.amount)},{accountTitle:m.from,type:'asset',credit:Number(m.amount)}],'treasury',m.id); }); db.transactions.filter(t=>t.userId===uid&&t.chequeId).forEach(t=>{ const amt=Number(t.amount||0); const acc=t.bank||'صندوق'; if(t.type==='income') createJournal(db,uid,t.title,[{accountTitle:acc,type:'asset',debit:amt},{accountTitle:'وصول چک',type:'income',credit:amt}],'cheque',t.id); else createJournal(db,uid,t.title,[{accountTitle:'پرداخت چک',type:'expense',debit:amt},{accountTitle:acc,type:'asset',credit:amt}],'cheque',t.id); }); } }
{ const db=readDb(); if(!db.users.length){ db.users.push({id:id('u_'),name:'مدیر دست راست',email:'admin@dastrast.local',passwordHash:hashPassword('Admin12345'),role:'admin',createdAt:nowIso()}); } if(db.ledgerVersion!==3){ rebuildAutoJournals(db); db.ledgerVersion=3; } writeDb(db); }

function send(res, code, data, type='application/json'){ const body=type==='application/json'?JSON.stringify(data):data; res.writeHead(code, {'Content-Type': type==='application/json'?'application/json; charset=utf-8':type}); res.end(body); }
function getBody(req){ return new Promise(resolve=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ try{resolve(b?JSON.parse(b):{})}catch{resolve({})} }); }); }
function auth(req){ const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''); const pl=verifyToken(token); if(!pl) return null; const db=readDb(); const user=db.users.find(u=>u.id===pl.uid); return user ? {db,user} : null; }
function match(url){ const u=new URL(url, `http://localhost:${PORT}`); return { path:u.pathname, parts:u.pathname.split('/').filter(Boolean) }; }


function compactName(name=''){ return String(name).trim().replace(/^(آقا|خانم|جناب)\s+/,'').replace(/\s+/g,' '); }
function findPersonCandidates(db,userId,name=''){
  const n=compactName(name); if(!n) return [];
  const isSingleWord=n.split(/\s+/).length===1;
  return db.persons.filter(p=>{ if(p.userId!==userId) return false; if(p.name===n) return true; if(p.name.includes(n)) return true; if(isSingleWord && p.name.split(' ')[0]===n) return true; return false; });
}
function ensurePerson(db,userId,name=''){
  const n=compactName(name || 'شخص بدون نام');
  const exact=db.persons.find(p=>p.userId===userId && p.name===n);
  if(exact) return exact;
  const person={id:id('p_'),userId,name:n,phone:'',mobile:'',nationalId:'',address:'',kind:'person',tags:[],note:'',createdAt:nowIso()};
  db.persons.push(person); return person;
}
const PERSON_FIELDS=['name','phone','mobile','nationalId','address','kind','tags','note'];
function publicPerson(db,uid,p){ const docCount=db.transactions.filter(t=>t.userId===uid&&t.personId===p.id).length; return {...p,balance:personBalance(db,uid,p.id),docCount}; }
function personBalance(db,userId,personId){
  return db.transactions.filter(t=>t.userId===userId && t.personId===personId).reduce((sum,t)=>{
    if(t.accountingSide==='receivable') return sum+Number(t.amount||0);
    if(t.accountingSide==='payable') return sum-Number(t.amount||0);
    if(t.accountingSide==='settlement') return sum+Number(t.settlementDelta||0);
    return sum;
  },0);
}
const NAME_STOPWORDS=['پول','مبلغ','قرض','چک','طلب','بدهی','بدهکار','بستانکار','دادم','گرفتم','پرداخت','دریافت','بده','واریز','برداشت','تومن','تومان','میلیون','ملیون','هزار','ریال','بابت','برای','رو','را','که','از','به','با','کردم','شد','شدم'];
function cleanPersonName(name=''){ let n=compactName(name); const out=[]; for(const w of n.split(/\s+/)){ if(NAME_STOPWORDS.includes(w)||/\d/.test(w)) break; out.push(w); } return out.join(' ').trim(); }
function extractPersonName(text=''){
  const cleaned=String(text).replace(/برای\s+\d{1,2}\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/g,'').replace(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g,'');
  const direct=/(?:از|به)\s+([آ-یA-Za-z]+(?:\s+[آ-یA-Za-z]+)?)\s+(?:پول|مبلغ|قرض|چک|طلب|دادم|گرفتم|پرداخت|بده|بدهکار|بستانکار)/.exec(cleaned);
  if(direct) return cleanPersonName(direct[1]);
  const settle=/(?:حساب\s+)?([آ-یA-Za-z][آ-یA-Za-z ]{1,22}?)\s+(?:رو|را)\s+تسویه/.exec(cleaned) || /با\s+([آ-یA-Za-z ]{2,24})\s+تسویه/.exec(cleaned) || /تسویه\s+(?:حساب\s+)?([آ-یA-Za-z][آ-یA-Za-z ]{1,22})/.exec(cleaned);
  if(settle) return cleanPersonName(settle[1]);
  const patterns=[/از\s+([آ-یA-Za-z ]{2,24}?)\s+(?:پول|مبلغ|چک|طلب|قرض|گرفتم|دریافت)/,/به\s+([آ-یA-Za-z ]{2,24}?)\s+(?:پول|مبلغ|چک|قرض|دادم|پرداخت)/,/(?:طلب از|بدهی به)\s+([آ-یA-Za-z ]{2,24})/];
  for(const r of patterns){ const m=r.exec(cleaned); if(m) return cleanPersonName(m[1]); }
  const tail=/(?:^|\s)(?:به|از|با)\s+([آ-یA-Za-z][آ-یA-Za-z ]{1,22})\s*$/.exec(cleaned);
  if(tail) return cleanPersonName(tail[1]);
  const pp=pickParty(cleaned); return /\d/.test(pp)?'':cleanPersonName(pp);
}
function parsePersianDueDate(text=''){
  const months={فروردین:'01',اردیبهشت:'02',خرداد:'03',تیر:'04',مرداد:'05',شهریور:'06',مهر:'07',آبان:'08',آذر:'09',دی:'10',بهمن:'11',اسفند:'12'};
  const t=faToEnDigits(text);
  const m=/(\d{1,2})\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/.exec(t);
  if(m){ const y=new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric'}).format(new Date()).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d)); return `${y}/${months[m[2]]}/${String(m[1]).padStart(2,'0')}`; }
  const d=/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(t); if(d) return `${d[1]}/${String(d[2]).padStart(2,'0')}/${String(d[3]).padStart(2,'0')}`;
  return '';
}
function jalaliToGregorian(jy,jm,jd){ jy=+jy;jm=+jm;jd=+jd; let gy=jy<=979?621:1600; jy-=jy<=979?0:979; let days=365*jy+Math.floor(jy/33)*8+Math.floor(((jy%33)+3)/4)+78+jd+(jm<7?(jm-1)*31:(jm-7)*30+186); gy+=400*Math.floor(days/146097); days%=146097; if(days>36524){ gy+=100*Math.floor(--days/36524); days%=36524; if(days>=365) days++; } gy+=4*Math.floor(days/1461); days%=1461; if(days>365){ gy+=Math.floor((days-1)/365); days=(days-1)%365; } const sal_a=[0,31,(gy%4===0&&gy%100!==0)||gy%400===0?29:28,31,30,31,30,31,31,30,31,30,31]; let gm=0,gd=days+1; for(gm=1;gm<=12&&gd>sal_a[gm];gm++) gd-=sal_a[gm]; return [gy,gm,gd]; }
function jalaliStrToDate(s=''){ const t=faToEnDigits(String(s)); const m=/(\d{3,4})[\/\-](\d{1,2})[\/\-](\d{1,2})/.exec(t); if(!m) return null; const [gy,gm,gd]=jalaliToGregorian(+m[1],+m[2],+m[3]); return new Date(gy,gm-1,gd); }
function daysUntil(s){ const d=jalaliStrToDate(s); if(!d) return null; const t=new Date(); t.setHours(0,0,0,0); d.setHours(0,0,0,0); return Math.round((d.getTime()-t.getTime())/86400000); }
function chequeComputedStatus(c){ if(c.status==='paid') return 'paid'; if(c.status==='bounced') return 'bounced'; const d=daysUntil(c.dueDate); if(d===null) return c.status||'pending'; if(d<0) return 'overdue'; if(d<=7) return 'near'; return 'upcoming'; }
function publicCheque(c){ return {...c,computedStatus:chequeComputedStatus(c),daysLeft:daysUntil(c.dueDate)}; }
function accountComputedBalance(db,userId,acc){ const init=Number(acc.initialBalance||0); let delta=0; db.journalEntries.filter(j=>j.userId===userId).forEach(j=>j.lines.forEach(l=>{ if(l.accountId===acc.id||l.accountTitle===acc.title) delta+=Number(l.debit||0)-Number(l.credit||0); })); return init+delta; }
function publicAccount(db,uid,a){ const computed=accountComputedBalance(db,uid,a); return {...a,balance:computed,computedBalance:computed}; }
function payChequeEffect(db,c,accountTitle){ const acc=ensureTreasuryAccount(db,c.userId,accountTitle||(c.bank||'صندوق اصلی')); const amt=Number(c.amount||0); const mv={id:id('mv_'),userId:c.userId,type:c.type==='receivable'?'deposit':'withdraw',accountId:acc.id,account:acc.title,amount:amt,note:`وصول چک ${c.title}`,source:'cheque',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()}; db.treasuryMovements.push(mv); const tx={id:id('tx_'),userId:c.userId,personId:c.personId||'',party:c.personName||'',title:`پاس شدن ${c.title}`,amount:amt,type:c.type==='receivable'?'income':'expense',category:c.type==='receivable'?'وصول چک':'پرداخت چک',bank:acc.title,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Cheque Paid',chequeId:c.id,createdAt:nowIso()}; db.transactions.push(tx); if(c.type==='receivable') createJournal(db,c.userId,`وصول چک ${c.title}`,[{accountTitle:acc.title,type:'asset',debit:amt},{accountTitle:'وصول چک',type:'income',credit:amt}],'cheque',tx.id); else createJournal(db,c.userId,`پرداخت چک ${c.title}`,[{accountTitle:'پرداخت چک',type:'expense',debit:amt},{accountTitle:acc.title,type:'asset',credit:amt}],'cheque',tx.id); c.status='paid'; c.paidAt=nowIso(); c.paidAccount=acc.title; return {tx,mv,account:acc}; }
const LEVEL_FA={total:'کل',sub:'معین',detail:'تفصیلی'};
const toFa=(n)=>String(n??'').replace(/\d/g,d=>'۰۱۲۳۴۵۶۷۸۹'[+d]);
const DEFAULT_STAGES=['پیش‌فاکتور','شروع','اجرا','تحویل','تسویه'];
function computeInvoice(inv){ const items=inv.items||[]; const subtotal=items.reduce((s,it)=>s+Number(it.qty||0)*Number(it.price||0),0); const discount=items.reduce((s,it)=>s+Number(it.discount||0),0)+Number(inv.discount||0); const taxable=Math.max(0,subtotal-discount); const tax=Math.round(taxable*Number(inv.taxRate||0)/100); const total=taxable+tax; inv.subtotal=subtotal; inv.discountTotal=discount; inv.tax=tax; inv.amount=total; inv.balance=total-Number(inv.paid||0); return inv; }
function publicProject(db,uid,pr){ const txs=db.transactions.filter(t=>t.userId===uid&&t.projectId===pr.id); const income=txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0); const expense=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0); const invoiced=db.invoices.filter(i=>i.userId===uid&&i.projectId===pr.id).reduce((s,i)=>s+Number(i.amount||0),0); const profit=Number(pr.amount||0)-expense; return {...pr,relatedIncome:income,relatedExpense:expense,invoiced,profit,balance:Number(pr.amount||0)-Number(pr.paid||0),status:(Number(pr.amount||0)-Number(pr.paid||0))>0?'debtor':'clear'}; }

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

function faYearMonth(iso){ try{ const parts=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit'}).formatToParts(new Date(iso)); const y=parts.find(x=>x.type==='year')?.value||''; const m=parts.find(x=>x.type==='month')?.value||''; return `${y}-${m}`; }catch{ return ''; } }
const faMonthNames=['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
function faMonthLabel(ym){ const m=parseInt(String(ym).split('-')[1]||'1',10); return faMonthNames[(m-1+12)%12]||ym; }
const DEFAULT_BRANDING={company:'کسب‌وکار من',phone:'',address:'',logo:'',footer:'با تشکر از خرید شما',color:'#3b38a0'};
const DEFAULT_DASH={ kpis:['balance','income','expense','profit','receivable','payable','count','projects'], charts:['trendBar','netLine','expenseDonut','incomeDonut','cumulativeArea','topPersons'], compare:true, alerts:true };
const typeFa = {asset:'دارایی',liability:'بدهی',equity:'سرمایه',income:'درآمد',expense:'هزینه'};
function ensureChartAccount(db,userId,title,type='asset'){
  let a=db.chartAccounts.find(x=>x.userId===userId && x.title===title);
  if(!a){ const count=db.chartAccounts.filter(x=>x.userId===userId).length+1; a={id:id('ca_'),userId,code:String(1000+count),title,type,typeFa:typeFa[type]||type,createdAt:nowIso()}; db.chartAccounts.push(a); }
  return a;
}
function createJournal(db,userId,description,lines,source='manual',refId=''){
  const norm=lines.map(l=>{ const acc=ensureChartAccount(db,userId,l.accountTitle,l.type||'asset'); return {...l,accountId:acc.id,accountTitle:acc.title,debit:Number(l.debit||0),credit:Number(l.credit||0)}; });
  const totalDebit=norm.reduce((s,l)=>s+l.debit,0), totalCredit=norm.reduce((s,l)=>s+l.credit,0);
  const num=db.journalEntries.filter(j=>j.userId===userId).length+1;
  const entry={id:id('je_'),userId,number:num,refId,description,totalDebit,totalCredit,balanced:totalDebit===totalCredit,lines:norm,source,status:source==='manual'?'final':'auto',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()};
  db.journalEntries.unshift(entry); return entry;
}
function removeJournalsByRef(db,userId,refId){ if(!refId) return; db.journalEntries=db.journalEntries.filter(j=>!(j.userId===userId&&j.refId===refId)); }
function cashAccountTitle(tx){ return tx.bank||tx.account||'صندوق'; }
function journalFromTransaction(db,tx){
  const amount=Number(tx.amount||0); if(!amount) return;
  const side=tx.accountingSide||''; const cash=cashAccountTitle(tx);
  if(side==='receivable') createJournal(db,tx.userId,tx.title,[{accountTitle:'حساب‌های دریافتنی',type:'asset',debit:amount},{accountTitle:tx.category&&tx.category!=='بستانکار / طلب'?tx.category:'درآمد',type:'income',credit:amount}],'transaction',tx.id);
  else if(side==='payable') createJournal(db,tx.userId,tx.title,[{accountTitle:tx.category&&tx.category!=='بدهکار / بدهی'?tx.category:'هزینه',type:'expense',debit:amount},{accountTitle:'حساب‌های پرداختنی',type:'liability',credit:amount}],'transaction',tx.id);
  else if(side==='settlement'){ const delta=Number(tx.settlementDelta||0); if(delta<=0) createJournal(db,tx.userId,tx.title,[{accountTitle:cash,type:'asset',debit:amount},{accountTitle:'حساب‌های دریافتنی',type:'asset',credit:amount}],'settlement',tx.id); else createJournal(db,tx.userId,tx.title,[{accountTitle:'حساب‌های پرداختنی',type:'liability',debit:amount},{accountTitle:cash,type:'asset',credit:amount}],'settlement',tx.id); }
  else if(tx.type==='income') createJournal(db,tx.userId,tx.title,[{accountTitle:cash,type:'asset',debit:amount},{accountTitle:tx.category||'درآمد',type:'income',credit:amount}],'transaction',tx.id);
  else createJournal(db,tx.userId,tx.title,[{accountTitle:tx.category||'هزینه',type:'expense',debit:amount},{accountTitle:cash,type:'asset',credit:amount}],'transaction',tx.id);
}
function parseLocalCommand(db,user,text){
  let raw=String(text||'');
  for(const tr of db.assistantTraining.filter(x=>x.userId===user.id)){ if(tr.phrase && raw.includes(tr.phrase)) raw += ' ' + (tr.meaning||''); }
  for(const rule of db.aiRules.filter(x=>x.userId===user.id)){ if(rule.pattern && raw.includes(rule.pattern)) raw += ' ' + (rule.action||''); }
  let segments=null;
  if(/[؛;]+/.test(raw)) segments=raw.split(/[؛;]+/);
  else if(/\n/.test(raw)) segments=raw.split(/\n+/);
  else { const moneyVerb=/(\d|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|بیست|سی|چهل|پنجاه|صد|میلیون|ملیون|هزار|تومن|تومان)[^و]*?(دادم|گرفتم|خریدم|خرج|پرداخت|واریز|برداشت|قرض|طلب)/g; const hits=raw.match(moneyVerb)||[]; if(hits.length>=2 && /\sو\s/.test(raw)) segments=raw.split(/\sو\s/); }
  if(segments){ const parts=segments.map(x=>x.trim()).filter(p=>p.length>1 && /\d|یک|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|بیست|سی|چهل|صد|میلیون|هزار|تومن|تومان/.test(p)); if(parts.length>=2) return {action:'multi_command', results:parts.map(part=>parseLocalCommand(db,user,part)), message:`${parts.length.toLocaleString('fa-IR')} عملیات پردازش شد.`}; }
  const amount=parseAmount(raw);
  const isEditIntent=(/(ویرایش|اصلاح|تغییر|عوض)/.test(raw) || (/(آخری|اخری|آخرین)/.test(raw) && /(کن|بکن|بشه)/.test(raw))) && /(تراکنش|آخری|اخری|آخرین|مبلغ|عنوان)/.test(raw) && !/حذف|پاک/.test(raw);
  if(isEditIntent){ const tx=db.transactions.filter(t=>t.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]; if(tx){ if(amount>0 && /مبلغ|تومن|تومان|میلیون|هزار/.test(raw)) tx.amount=amount; const titleM=/(?:عنوان|اسم|نام).*?(?:به|بکن|کن)\s+([آ-یA-Za-z ]{2,30})/.exec(raw); if(titleM) tx.title=compactName(titleM[1]); if(/درآمد|واریز/.test(raw)) tx.type='income'; if(/هزینه|خرج/.test(raw)) tx.type='expense'; return {action:'edited',transaction:tx,message:`آخرین تراکنش ویرایش شد: ${tx.title} - ${Number(tx.amount).toLocaleString('fa-IR')} تومان`}; } }
  if(/(ویرایش|اصلاح|تغییر|عوض)/.test(raw) && /چک/.test(raw)){ const ch=db.cheques.filter(c=>c.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]; if(ch){ if(amount>0 && /مبلغ|تومن|تومان|میلیون|هزار/.test(raw)) ch.amount=amount; const due=parsePersianDueDate(raw); if(due) ch.dueDate=due; if(/پاس|وصول|نقد/.test(raw)) ch.status='paid'; return {action:'cheque_edited',cheque:ch,message:`چک «${ch.title}» ویرایش شد. مبلغ: ${Number(ch.amount).toLocaleString('fa-IR')} تومان`}; } }
  if(/حذف|پاک/.test(raw) && !/تایید|بله|آره|اره|مطمئن/.test(raw)){
    if(/آخرین|اخرین/.test(raw) && /تراکنش|ثبت/.test(raw)){ const tx=db.transactions.filter(t=>t.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]; if(tx) return {action:'confirm_delete',target:{kind:'transaction',id:tx.id,title:tx.title},message:`حذف تراکنش «${tx.title}» (${Number(tx.amount).toLocaleString('fa-IR')} تومان)؟`}; }
    if(/آخرین|اخرین/.test(raw) && /چک/.test(raw)){ const ch=db.cheques.filter(c=>c.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]; if(ch) return {action:'confirm_delete',target:{kind:'cheque',id:ch.id,title:ch.title},message:`حذف چک «${ch.title}»؟`}; }
  }
  if(/پاس|وصول/.test(raw)&&/چک/.test(raw)&&!/(ویرایش|اصلاح|حذف)/.test(raw)){ const pn=extractPersonName(raw); let pool=db.cheques.filter(c=>c.userId===user.id&&c.status!=='paid'); if(pn){ const f=pool.filter(c=>(c.personName||'').includes(pn)); if(f.length) pool=f; } const ch=pool.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]; if(ch){ const eff=payChequeEffect(db,ch,''); return {action:'cheque_paid',cheque:ch,transaction:eff.tx,canUndo:true,message:`چک «${ch.title}» پاس شد. مبلغ ${Number(ch.amount).toLocaleString('fa-IR')} تومان ${ch.type==='receivable'?'به':'از'} ${eff.account.title} اعمال و سند ثبت شد.`}; } return {action:'noop',message:'چک پاس‌نشده‌ای پیدا نشد.'}; }
  // Treasury: deposit, withdraw, transfer
  if(/انتقال/.test(raw) && /از/.test(raw) && /به/.test(raw)){
    const fromName=extractAfter(raw,['از'])||'صندوق اصلی'; const toName=extractAfter(raw,['به'])||'صندوق اصلی';
    const from=ensureTreasuryAccount(db,user.id,fromName), to=ensureTreasuryAccount(db,user.id,toName);
    const mv={id:id('mv_'),userId:user.id,type:'transfer',fromAccountId:from.id,toAccountId:to.id,from:from.title,to:to.title,amount:Number(amount||0),note:raw,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()}; db.treasuryMovements.push(mv); createJournal(db,user.id,`انتقال از ${from.title} به ${to.title}`,[{accountTitle:to.title,type:'asset',debit:Number(amount||0)},{accountTitle:from.title,type:'asset',credit:Number(amount||0)}],'treasury',mv.id);
    return {action:'treasury_transfer',movement:mv,message:`انتقال ${Number(amount||0).toLocaleString('fa-IR')} تومان از ${from.title} به ${to.title} ثبت شد.`};
  }
  if(/واریز|برداشت/.test(raw) && /(صندوق|حساب|بانک|کیف)/.test(raw)){
    const isDeposit=/واریز/.test(raw); const accName=extractAfter(raw,['به','از'])||(/بانک ملت/.test(raw)?'بانک ملت':'صندوق اصلی'); const acc=ensureTreasuryAccount(db,user.id,accName);
    const mv={id:id('mv_'),userId:user.id,type:isDeposit?'deposit':'withdraw',accountId:acc.id,account:acc.title,amount:Number(amount||0),note:raw,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()}; db.treasuryMovements.push(mv); if(isDeposit) createJournal(db,user.id,`واریز به ${acc.title}`,[{accountTitle:acc.title,type:'asset',debit:Number(amount||0)},{accountTitle:'سایر درآمدها',type:'income',credit:Number(amount||0)}],'treasury',mv.id); else createJournal(db,user.id,`برداشت از ${acc.title}`,[{accountTitle:'سایر هزینه‌ها',type:'expense',debit:Number(amount||0)},{accountTitle:acc.title,type:'asset',credit:Number(amount||0)}],'treasury',mv.id);
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
    const pr={id:id('pr_'),userId:user.id,customerId:person.id,customerName:person.name,title:projectName,amount:Number(amount||0),paid:0,expertName:'',stages:DEFAULT_STAGES.map(s=>({name:s,done:false,date:''})),createdAt:nowIso()};
    db.projects.push(pr);
    if(amount) db.transactions.push({id:id('tx_'),userId:user.id,personId:person.id,party:person.name,projectId:pr.id,title:`مطالبه پروژه ${projectName}`,amount:Number(amount),type:'income',category:'بستانکار / طلب',accountingSide:'receivable',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Assistant Project',createdAt:nowIso()});
    return {action:'project_created',project:pr,message:`پروژه ${projectName} برای ${person.name} با مبلغ ${Number(amount||0).toLocaleString('fa-IR')} تومان ثبت شد.`};
  }
  const personName=extractPersonName(raw);
  const candidates=personName?findPersonCandidates(db,user.id,personName):[];
  const exact=candidates.find(p=>p.name===personName);
  const person=personName ? (exact || candidates[0] || ensurePerson(db,user.id,personName)) : null;
  let alternatives;
  if(person && personName){ const sameName=findPersonCandidates(db,user.id,personName).filter(p=>p.id!==person.id); if(sameName.length) alternatives=sameName.map(p=>({...p,balance:personBalance(db,user.id,p.id)})); }
  if(/چک/.test(raw)){
    const receivable=/(گرفتم|دریافتی|دریافت|از)/.test(raw) && !/(دادم|صادر|پرداختنی)/.test(raw);
    const payable=/(دادم|صادر|پرداختنی|به)/.test(raw) && !/(گرفتم|دریافتی)/.test(raw);
    const type=receivable&&!payable?'receivable':'payable';
    const bank=(/ملت/.test(raw)&&'بانک ملت')||(/ملی/.test(raw)&&'بانک ملی')||(/پاسارگاد/.test(raw)&&'بانک پاسارگاد')||(/سامان/.test(raw)&&'بانک سامان')||'';
    const dueDate=parsePersianDueDate(raw)||'بدون تاریخ';
    const chq={id:id('chq_'),userId:user.id,personId:person?.id||'',personName:person?.name||personName||'',title:`چک ${type==='receivable'?'دریافتی':'صادره'} ${person?.name?`- ${person.name}`:''}`,amount:Number(amount||0),dueDate,type,status:'pending',bank,createdAt:nowIso()};
    db.cheques.push(chq);
    return {action:'cheque_created', cheque:chq, message:`چک ${type==='receivable'?'دریافتی':'صادره'} به مبلغ ${Number(amount||0).toLocaleString('fa-IR')} تومان برای ${dueDate} ثبت شد.`};
  }
  if(/تسویه/.test(raw) && person){
    const bal=personBalance(db,user.id,person.id); if(!bal) return {action:'settled', message:`حساب ${person.name} از قبل تسویه است (مانده صفر).`, person};
    const tx={id:id('tx_'),userId:user.id,personId:person.id,party:person.name,title:`تسویه کامل حساب ${person.name}`,amount:Math.abs(bal),type:bal>0?'income':'expense',category:'تسویه حساب',accountingSide:'settlement',settlementDelta:-bal,bank:'صندوق',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Assistant Settlement',createdAt:nowIso()};
    db.transactions.push(tx); journalFromTransaction(db,tx); return {action:'settled', transaction:tx, canUndo:true, message:`حساب ${person.name} به‌طور کامل تسویه شد.\nمبلغ ${Math.abs(bal).toLocaleString('fa-IR')} تومان ${bal>0?'از او دریافت شد (طلب وصول شد)':'به او پرداخت شد (بدهی تسویه شد)'} و مانده صفر شد.`};
  }
  const tx=detectTransaction(raw);
  if(person){ tx.personId=person.id; tx.party=person.name; const gaveToPerson=/(به|برای)\s/.test(raw)&&/(دادم|پرداخت|پرداختم|قرض\s*دادم|رسوندم|واریز)/.test(raw); const tookFromPerson=/از\s/.test(raw)&&/(گرفتم|قرض\s*گرفتم|دریافت)/.test(raw); const eP=/(قرض\s*گرفتم|بدهکارم|بدهی\s*دارم|باید\s*بدم)/.test(raw); const eR=/(قرض\s*دادم|طلب\s*دارم|طلبکارم|بستانکارم|ازش\s*طلب)/.test(raw); if(eP){tx.accountingSide='payable';tx.category='بدهکار / بدهی';tx.type='expense';} else if(eR){tx.accountingSide='receivable';tx.category='بستانکار / طلب';tx.type='income';} else if(gaveToPerson){tx.accountingSide='receivable';tx.category='بستانکار / طلب';tx.type='income';} else if(tookFromPerson){tx.accountingSide='payable';tx.category='بدهکار / بدهی';tx.type='expense';} tx.sideSuggestions=[{side:'receivable',label:'طلب از او'},{side:'payable',label:'بدهی به او'},{side:'',label:'هزینه/درآمد معمولی'}]; }
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
      if(p==='/api/transactions' && method==='POST'){ const tx={id:id('tx_'),userId:user.id,title:body.title||'تراکنش',amount:Number(body.amount||0),type:body.type||'expense',category:body.category||'سایر',bank:body.bank||'',personId:body.personId||'',party:body.party||'',projectId:body.projectId||'',accountingSide:body.accountingSide||'',date:body.date||new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:body.method||'Manual',note:body.note||'',createdAt:nowIso()}; if(!tx.accountingSide) ensureTreasuryAccount(db,user.id,tx.bank||'صندوق'); db.transactions.push(tx); journalFromTransaction(db,tx); writeDb(db); return send(res,200,tx); }
      if(parts[1]==='transactions' && parts[2] && method==='PUT'){ const tx=db.transactions.find(t=>t.id===parts[2]&&t.userId===user.id); if(!tx) return send(res,404,{error:'تراکنش پیدا نشد'}); Object.assign(tx,body); if(body.amount!==undefined) tx.amount=Number(body.amount); removeJournalsByRef(db,user.id,tx.id); journalFromTransaction(db,tx); writeDb(db); return send(res,200,tx); }
      if(parts[1]==='transactions' && parts[2] && method==='DELETE'){ removeJournalsByRef(db,user.id,parts[2]); db.transactions=db.transactions.filter(t=>!(t.id===parts[2]&&t.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(parts[1]==='transactions' && parts[2] && parts[3]==='reclassify' && method==='POST'){ const tx=db.transactions.find(t=>t.id===parts[2]&&t.userId===user.id); if(!tx) return send(res,404,{error:'تراکنش پیدا نشد'}); const side=body.side||''; if(side==='receivable'){tx.accountingSide='receivable';tx.category='بستانکار / طلب';tx.type='income';tx.bank='';} else if(side==='payable'){tx.accountingSide='payable';tx.category='بدهکار / بدهی';tx.type='expense';tx.bank='';} else {tx.accountingSide='';if(!tx.bank)tx.bank='صندوق';if(tx.category==='بستانکار / طلب'||tx.category==='بدهکار / بدهی')tx.category='سایر';} removeJournalsByRef(db,user.id,tx.id); journalFromTransaction(db,tx); writeDb(db); return send(res,200,{ok:true,transaction:tx,message:side==='receivable'?'به‌عنوان طلب از این شخص ثبت شد.':side==='payable'?'به‌عنوان بدهی به این شخص ثبت شد.':'به‌عنوان تراکنش معمولی ثبت شد.'}); }
      if(p==='/api/cheques' && method==='GET') return send(res,200,db.cheques.filter(c=>c.userId===user.id).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))).map(publicCheque));
      if(p==='/api/cheques' && method==='POST'){ const c={id:id('chq_'),userId:user.id,title:body.title||'چک',amount:Number(body.amount||0),dueDate:body.dueDate||'',type:body.type||'payable',status:body.status||'pending',personId:body.personId||'',personName:body.personName||'',bank:body.bank||'',serial:body.serial||'',note:body.note||'',createdAt:nowIso()}; db.cheques.push(c); writeDb(db); return send(res,200,publicCheque(c)); }
      if(parts[1]==='cheques' && parts[2] && parts[3]==='pay' && method==='POST'){ const c=db.cheques.find(x=>x.id===parts[2]&&x.userId===user.id); if(!c) return send(res,404,{error:'چک پیدا نشد'}); if(c.status==='paid') return send(res,400,{error:'قبلاً پاس شده'}); const eff=payChequeEffect(db,c,body.account); writeDb(db); return send(res,200,{cheque:publicCheque(c),...eff}); }
      if(parts[1]==='cheques' && parts[2] && parts[3]==='bounce' && method==='POST'){ const c=db.cheques.find(x=>x.id===parts[2]&&x.userId===user.id); if(!c) return send(res,404,{error:'چک پیدا نشد'}); c.status='bounced'; c.bouncedAt=nowIso(); writeDb(db); return send(res,200,publicCheque(c)); }
      if(parts[1]==='cheques' && parts[2] && method==='PUT'){ const c=db.cheques.find(x=>x.id===parts[2]&&x.userId===user.id); if(!c) return send(res,404,{error:'چک پیدا نشد'}); const was=c.status; for(const f of ['title','dueDate','type','personId','personName','bank','serial','note','status']) if(body[f]!==undefined) c[f]=body[f]; if(body.amount!==undefined) c.amount=Number(body.amount); if(body.status==='paid'&&was!=='paid') payChequeEffect(db,c,body.account); writeDb(db); return send(res,200,publicCheque(c)); }
      if(parts[1]==='cheques' && parts[2] && method==='DELETE'){ db.cheques=db.cheques.filter(c=>!(c.id===parts[2]&&c.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/cheques/report' && method==='GET'){ const list=db.cheques.filter(c=>c.userId===user.id).map(publicCheque); const inflow=list.filter(c=>c.type==='receivable'&&c.status!=='paid'&&c.status!=='bounced'); const outflow=list.filter(c=>c.type==='payable'&&c.status!=='paid'&&c.status!=='bounced'); return send(res,200,{receivableInFlow:inflow.reduce((s,c)=>s+Number(c.amount),0),payableInFlow:outflow.reduce((s,c)=>s+Number(c.amount),0),overdue:list.filter(c=>c.computedStatus==='overdue'),near:list.filter(c=>c.computedStatus==='near'),upcoming:list.filter(c=>c.computedStatus==='upcoming'),bounced:list.filter(c=>c.computedStatus==='bounced'),paid:list.filter(c=>c.computedStatus==='paid').length}); }
      if(p==='/api/accounting/chart' && method==='GET'){ const list=db.chartAccounts.filter(x=>x.userId===user.id); const bal={}; db.journalEntries.filter(j=>j.userId===user.id).forEach(j=>j.lines.forEach(l=>{ bal[l.accountId]=(bal[l.accountId]||0)+Number(l.debit||0)-Number(l.credit||0); })); return send(res,200,list.map(a=>({...a,levelFa:LEVEL_FA[a.level]||a.level||'کل',balance:bal[a.id]||0,hasFlow:!!bal[a.id],childrenCount:list.filter(c=>c.parentId===a.id).length}))); }
      if(p==='/api/accounting/chart' && method==='POST'){ const type=body.type||'asset'; const a={id:id('ca_'),userId:user.id,code:body.code||String(1000+db.chartAccounts.filter(x=>x.userId===user.id).length+1),title:body.title||'حساب جدید',type,typeFa:typeFa[type]||type,level:body.level||(body.parentId?'sub':'total'),parentId:body.parentId||'',createdAt:nowIso()}; db.chartAccounts.push(a); writeDb(db); return send(res,200,a); }
      if(p==='/api/accounting/chart/import-standard' && method==='POST'){ const std=[['1000','دارایی‌ها','asset','total',''],['1010','صندوق','asset','sub','1000'],['1020','بانک','asset','sub','1000'],['1030','حساب‌های دریافتنی','asset','sub','1000'],['2000','بدهی‌ها','liability','total',''],['2010','حساب‌های پرداختنی','liability','sub','2000'],['3000','سرمایه','equity','total',''],['4000','درآمدها','income','total',''],['4010','درآمد فروش','income','sub','4000'],['4020','درآمد خدمات','income','sub','4000'],['5000','هزینه‌ها','expense','total',''],['5010','هزینه حقوق','expense','sub','5000'],['5020','هزینه اجاره','expense','sub','5000'],['5030','هزینه تبلیغات','expense','sub','5000']]; let added=0; const byCode={}; std.forEach(([code,title,type,level,parent])=>{ if(db.chartAccounts.some(x=>x.userId===user.id&&x.code===code)) return; const parentId=parent?(byCode[parent]||(db.chartAccounts.find(x=>x.userId===user.id&&x.code===parent)||{}).id||''):''; const a={id:id('ca_'),userId:user.id,code,title,type,typeFa:typeFa[type],level,parentId,createdAt:nowIso()}; byCode[code]=a.id; db.chartAccounts.push(a); added++; }); writeDb(db); return send(res,200,{ok:true,added}); }
      if(parts[1]==='accounting' && parts[2]==='chart' && parts[3] && method==='PUT'){ const a=db.chartAccounts.find(x=>x.id===parts[3]&&x.userId===user.id); if(!a) return send(res,404,{error:'سرفصل پیدا نشد'}); Object.assign(a,body,{typeFa:typeFa[body.type]||a.typeFa}); writeDb(db); return send(res,200,a); }
      if(parts[1]==='accounting' && parts[2]==='chart' && parts[3] && method==='DELETE'){ db.chartAccounts=db.chartAccounts.filter(x=>!(x.id===parts[3]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/accounting/journal' && method==='GET') return send(res,200,db.journalEntries.filter(x=>x.userId===user.id));
      if(p==='/api/accounting/journal' && method==='POST'){ const j=createJournal(db,user.id,body.description||'سند حسابداری',body.lines||[],'manual'); writeDb(db); return send(res,200,j); }
      if(parts[1]==='accounting' && parts[2]==='journal' && parts[3] && method==='PUT'){ const j=db.journalEntries.find(x=>x.id===parts[3]&&x.userId===user.id); if(!j) return send(res,404,{error:'سند پیدا نشد'}); if(body.description!==undefined) j.description=body.description; if(body.date!==undefined) j.date=body.date; if(body.status!==undefined) j.status=body.status; if(Array.isArray(body.lines)){ j.lines=body.lines.map(l=>{ const acc=ensureChartAccount(db,user.id,l.accountTitle,l.type||'asset'); return {...l,accountId:acc.id,accountTitle:acc.title,debit:Number(l.debit||0),credit:Number(l.credit||0)}; }); j.totalDebit=j.lines.reduce((s,l)=>s+l.debit,0); j.totalCredit=j.lines.reduce((s,l)=>s+l.credit,0); j.balanced=j.totalDebit===j.totalCredit; } writeDb(db); return send(res,200,j); }
      if(parts[1]==='accounting' && parts[2]==='journal' && parts[3] && method==='DELETE'){ db.journalEntries=db.journalEntries.filter(x=>!(x.id===parts[3]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/accounting/trial-balance' && method==='GET'){
        const u=new URL(req.url,`http://localhost:${PORT}`); const days=u.searchParams.get('days'); const fromT=days?Date.now()-Number(days)*86400000:0;
        const chart={}; db.chartAccounts.filter(c=>c.userId===user.id).forEach(c=>chart[c.id]=c);
        const rows={}; db.journalEntries.filter(j=>j.userId===user.id&&(!fromT||new Date(j.createdAt).getTime()>=fromT)).forEach(j=>j.lines.forEach(l=>{ rows[l.accountId] ||= {accountId:l.accountId,accountTitle:l.accountTitle,code:chart[l.accountId]?.code||'',typeFa:chart[l.accountId]?.typeFa||'',debit:0,credit:0,balance:0}; rows[l.accountId].debit+=Number(l.debit||0); rows[l.accountId].credit+=Number(l.credit||0); rows[l.accountId].balance=rows[l.accountId].debit-rows[l.accountId].credit; }));
        const lst=Object.values(rows).sort((a,b)=>String(a.code).localeCompare(String(b.code))); const td=lst.reduce((s,r)=>s+r.debit,0),tc=lst.reduce((s,r)=>s+r.credit,0); return send(res,200,{rows:lst,totalDebit:td,totalCredit:tc,balanced:Math.abs(td-tc)<1});
      }
      if(p==='/api/accounting/profit-loss' && method==='GET'){ const u=new URL(req.url,`http://localhost:${PORT}`); const days=u.searchParams.get('days'); const fromT=days?Date.now()-Number(days)*86400000:0; const chart={}; db.chartAccounts.filter(c=>c.userId===user.id).forEach(c=>chart[c.id]=c); const typeOf=l=>(chart[l.accountId]?.type)||l.type||''; const op=/(فروش|خدمات|درآمد فروش|درآمد خدمات|پروژه|فاکتور)/; const cogsR=/(بهای تمام|خرید کالا|مواد اولیه)/; let operatingIncome=0,nonOperatingIncome=0,cogs=0,operatingExpense=0; const bE={},bI={}; db.journalEntries.filter(j=>j.userId===user.id&&(!fromT||new Date(j.createdAt).getTime()>=fromT)).forEach(j=>j.lines.forEach(l=>{ const t=typeOf(l); if(t==='income'){ const v=Number(l.credit||0)-Number(l.debit||0); if(v===0) return; if(op.test(l.accountTitle)) operatingIncome+=v; else nonOperatingIncome+=v; bI[l.accountTitle]=(bI[l.accountTitle]||0)+v; } else if(t==='expense'){ const v=Number(l.debit||0)-Number(l.credit||0); if(v===0) return; if(cogsR.test(l.accountTitle)) cogs+=v; else operatingExpense+=v; bE[l.accountTitle]=(bE[l.accountTitle]||0)+v; } })); const income=operatingIncome+nonOperatingIncome; const expense=cogs+operatingExpense; return send(res,200,{income,expense,operatingIncome,nonOperatingIncome,cogs,operatingExpense,grossProfit:operatingIncome-cogs,netProfit:income-expense,profitMargin:income?Math.round((income-expense)/income*100):0,byExpenseCat:Object.entries(bE).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value),byIncomeCat:Object.entries(bI).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value)}); }
      if(p==='/api/accounting/cash-flow' && method==='GET'){ const u=new URL(req.url,`http://localhost:${PORT}`); const days=u.searchParams.get('days'); const fromT=days?Date.now()-Number(days)*86400000:0; const ca=db.accounts.filter(a=>a.userId===user.id); const cashIds=new Set(ca.map(a=>a.id)); const cashTitles=new Set(ca.map(a=>a.title)); cashTitles.add('صندوق'); const isCash=l=>cashIds.has(l.accountId)||cashTitles.has(l.accountTitle); let operating=0,investing=0,financing=0,cashIn=0,cashOut=0; const rows=[]; db.journalEntries.filter(j=>j.userId===user.id&&(!fromT||new Date(j.createdAt).getTime()>=fromT)).forEach(j=>{ const cl=j.lines.filter(isCash); if(!cl.length) return; const net=cl.reduce((s,l)=>s+Number(l.debit||0)-Number(l.credit||0),0); if(net===0) return; const other=j.lines.find(l=>!isCash(l)); const ot=other?other.type:'income'; let cat=ot==='asset'?'investing':(ot==='liability'||ot==='equity')?'financing':'operating'; if(cat==='operating') operating+=net; else if(cat==='investing') investing+=net; else financing+=net; if(net>0) cashIn+=net; else cashOut+=-net; rows.push({id:j.id,date:j.date,description:j.description,amount:net,category:cat}); }); const unpaid=db.cheques.filter(c=>c.userId===user.id&&c.status!=='paid'&&c.status!=='bounced'); const expectedIn=unpaid.filter(c=>c.type==='receivable').reduce((s,c)=>s+Number(c.amount),0); const expectedOut=unpaid.filter(c=>c.type==='payable').reduce((s,c)=>s+Number(c.amount),0); const currentCash=ca.reduce((s,a)=>s+accountComputedBalance(db,user.id,a),0); const fc=unpaid.map(c=>({title:c.title,dueDate:c.dueDate,daysLeft:daysUntil(c.dueDate),amount:(c.type==='receivable'?1:-1)*Number(c.amount)})).sort((a,b)=>(a.daysLeft??9999)-(b.daysLeft??9999)); return send(res,200,{cashIn,cashOut,netCashFlow:cashIn-cashOut,operating,investing,financing,rows:rows.sort((a,b)=>b.id.localeCompare(a.id)),forecast:{currentCash,expectedIn,expectedOut,projectedCash:currentCash+expectedIn-expectedOut,items:fc}}); }
      if(p==='/api/invoices' && method==='GET') return send(res,200,db.invoices.filter(x=>x.userId===user.id));
      if(p==='/api/invoices' && method==='POST'){ const num=db.invoices.filter(x=>x.userId===user.id).length+1; const inv={id:id('inv_'),userId:user.id,number:num,type:body.type||'invoice',customerName:body.customerName||'مشتری',items:body.items||[],discount:Number(body.discount||0),taxRate:Number(body.taxRate||0),paid:0,status:'unpaid',projectId:body.projectId||'',date:body.date||new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()}; if((!inv.items.length)&&body.amount) inv.items=[{title:'مبلغ کل',qty:1,price:Number(body.amount),discount:0}]; computeInvoice(inv); db.invoices.unshift(inv); writeDb(db); return send(res,200,inv); }
      if(parts[1]==='invoices' && parts[2] && parts[3]==='convert' && method==='POST'){ const inv=db.invoices.find(x=>x.id===parts[2]&&x.userId===user.id); if(!inv) return send(res,404,{error:'فاکتور پیدا نشد'}); inv.type='invoice'; writeDb(db); return send(res,200,inv); }
      if(parts[1]==='invoices' && parts[2] && parts[3]==='pay' && method==='POST'){ const inv=db.invoices.find(x=>x.id===parts[2]&&x.userId===user.id); if(!inv) return send(res,404,{error:'فاکتور پیدا نشد'}); const amt=Number(body.amount||inv.balance||0); const acc=body.account||'صندوق'; ensureTreasuryAccount(db,user.id,acc); const tx={id:id('tx_'),userId:user.id,title:`دریافت فاکتور #${toFa(inv.number)} - ${inv.customerName}`,amount:amt,type:'income',category:'درآمد فروش',bank:acc,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Invoice Payment',refInvoice:inv.id,createdAt:nowIso()}; db.transactions.push(tx); journalFromTransaction(db,tx); inv.paid=Number(inv.paid||0)+amt; inv.balance=Number(inv.amount||0)-inv.paid; inv.status=inv.balance<=0?'paid':'partial'; writeDb(db); return send(res,200,{ok:true,invoice:inv,transaction:tx}); }
      if(parts[1]==='invoices' && parts[2] && method==='PUT'){ const inv=db.invoices.find(x=>x.id===parts[2]&&x.userId===user.id); if(!inv) return send(res,404,{error:'فاکتور پیدا نشد'}); for(const f of ['customerName','items','discount','taxRate','type','date','projectId','status']) if(body[f]!==undefined) inv[f]=body[f]; if(body.amount!==undefined&&!body.items) inv.items=[{title:'مبلغ کل',qty:1,price:Number(body.amount),discount:0}]; computeInvoice(inv); writeDb(db); return send(res,200,inv); }
      if(parts[1]==='invoices' && parts[2] && method==='DELETE'){ db.invoices=db.invoices.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/ai/rules' && method==='GET') return send(res,200,db.aiRules.filter(x=>x.userId===user.id));
      if(p==='/api/ai/rules' && method==='POST'){ const rule={id:id('rule_'),userId:user.id,pattern:body.pattern||'',action:body.action||'',createdAt:nowIso()}; db.aiRules.unshift(rule); writeDb(db); return send(res,200,rule); }
      if(p==='/api/push/subscribe' && method==='POST'){ db.pushSubscriptions.push({id:id('sub_'),userId:user.id,subscription:body,createdAt:nowIso()}); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/projects' && method==='GET') return send(res,200,db.projects.filter(x=>x.userId===user.id).map(p=>publicProject(db,user.id,p)));
      if(p==='/api/projects' && method==='POST'){ const customer=ensurePerson(db,user.id,body.customerName||'مشتری'); const amount=Number(body.amount||0); const pr={id:id('pr_'),userId:user.id,customerId:customer.id,customerName:customer.name,title:body.title||'پروژه',amount,paid:Number(body.paid||0),expertName:body.expertName||'',stages:DEFAULT_STAGES.map(st=>({name:st,done:false,date:''})),createdAt:nowIso()}; if(amount>0){ db.transactions.push({id:id('tx_'),userId:user.id,personId:customer.id,party:customer.name,projectId:pr.id,title:`مطالبه پروژه ${pr.title}`,amount,type:'income',category:'بستانکار / طلب',accountingSide:'receivable',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Project',createdAt:nowIso()}); journalFromTransaction(db,db.transactions[db.transactions.length-1]); } db.projects.push(pr); writeDb(db); return send(res,200,publicProject(db,user.id,pr)); }
      if(parts[1]==='projects' && parts[2] && parts[3]==='stage' && method==='POST'){ const pr=db.projects.find(x=>x.id===parts[2]&&x.userId===user.id); if(!pr) return send(res,404,{error:'پروژه پیدا نشد'}); pr.stages=pr.stages||DEFAULT_STAGES.map(st=>({name:st,done:false,date:''})); const st=pr.stages[body.index]; if(st){ st.done=!st.done; st.date=st.done?new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()):''; } writeDb(db); return send(res,200,publicProject(db,user.id,pr)); }
      if(parts[1]==='projects' && parts[2] && method==='PUT'){ const pr=db.projects.find(x=>x.id===parts[2]&&x.userId===user.id); if(!pr) return send(res,404,{error:'پروژه پیدا نشد'}); for(const f of ['title','customerName','expertName','stages','paid','amount']) if(body[f]!==undefined) pr[f]=body[f]; if(body.amount!==undefined) pr.amount=Number(body.amount); if(body.paid!==undefined) pr.paid=Number(body.paid); writeDb(db); return send(res,200,publicProject(db,user.id,pr)); }
      if(parts[1]==='projects' && parts[2] && method==='DELETE'){ db.projects=db.projects.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/experts' && method==='GET') return send(res,200,db.experts.filter(x=>x.userId===user.id));
      if(p==='/api/experts' && method==='POST'){ const ex=ensureExpert(db,user.id,body.name||'کارشناس'); ex.role=body.role||ex.role; if(body.commissionRate!==undefined) ex.commissionRate=Number(body.commissionRate); writeDb(db); return send(res,200,ex); }
      if(parts[1]==='experts' && parts[2] && method==='PUT'){ const ex=db.experts.find(x=>x.id===parts[2]&&x.userId===user.id); if(!ex) return send(res,404,{error:'کارشناس پیدا نشد'}); Object.assign(ex,body); writeDb(db); return send(res,200,ex); }
      if(parts[1]==='experts' && parts[2] && method==='DELETE'){ db.experts=db.experts.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/expert-settlements' && method==='GET') return send(res,200,db.expertSettlements.filter(x=>x.userId===user.id));
      if(p==='/api/expert-settlements' && method==='POST'){ const ex=ensureExpert(db,user.id,body.expertName||'کارشناس'); const acc=body.account||'صندوق'; const amt=Number(body.amount||0); const st={id:id('set_'),userId:user.id,expertId:ex.id,expertName:ex.name,amount:amt,type:body.type||'payment',status:'paid',account:acc,note:body.note||'',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()}; db.expertSettlements.push(st); ex.balance += st.type==='payment'?-amt:amt; if(st.type==='payment'&&amt>0){ ensureTreasuryAccount(db,user.id,acc); const tx={id:id('tx_'),userId:user.id,title:`تسویه کارشناس ${ex.name}`,amount:amt,type:'expense',category:'تسویه کارشناسان',bank:acc,date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Expert Settlement',createdAt:nowIso()}; db.transactions.push(tx); journalFromTransaction(db,tx); st.txId=tx.id; } writeDb(db); return send(res,200,st); }
      if(p==='/api/experts/report' && method==='GET'){ const u=new URL(req.url,`http://localhost:${PORT}`); const days=u.searchParams.get('days'); const fromT=days?Date.now()-Number(days)*86400000:0; const rows=db.experts.filter(e=>e.userId===user.id).map(e=>{ const setts=db.expertSettlements.filter(st=>st.userId===user.id&&st.expertId===e.id&&(!fromT||new Date(st.createdAt).getTime()>=fromT)); const paid=setts.filter(st=>st.type==='payment').reduce((s2,st)=>s2+Number(st.amount),0); const projects=db.projects.filter(pp=>pp.userId===user.id&&pp.expertName===e.name); const commissionBase=projects.reduce((s,pp)=>s+Number(pp.amount||0),0); const commission=Math.round(commissionBase*Number(e.commissionRate||0)/100); return {id:e.id,name:e.name,commissionRate:Number(e.commissionRate||0),commissionBase,commission,paid,balance:commission-paid,settlements:setts.length}; }); return send(res,200,{rows,totalPaid:rows.reduce((s,r)=>s+r.paid,0),totalCommission:rows.reduce((s,r)=>s+r.commission,0)}); }
      if(p==='/api/treasury' && method==='GET') return send(res,200,{accounts:db.accounts.filter(x=>x.userId===user.id).map(a=>publicAccount(db,user.id,a)),movements:db.treasuryMovements.filter(x=>x.userId===user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))});
      if(p==='/api/treasury/movement' && method==='POST'){ const acc=ensureTreasuryAccount(db,user.id,body.account||'صندوق اصلی'); const val=Number(body.amount||0); const type=body.type||'deposit'; const mv={id:id('mv_'),userId:user.id,type,accountId:acc.id,account:acc.title,amount:val,note:body.note||'',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()}; db.treasuryMovements.push(mv); if(type==='deposit') createJournal(db,user.id,`واریز به ${acc.title}`,[{accountTitle:acc.title,type:'asset',debit:val},{accountTitle:body.note||'سایر درآمدها',type:'income',credit:val}],'treasury',mv.id); else createJournal(db,user.id,`برداشت از ${acc.title}`,[{accountTitle:body.note||'سایر هزینه‌ها',type:'expense',debit:val},{accountTitle:acc.title,type:'asset',credit:val}],'treasury',mv.id); writeDb(db); return send(res,200,mv); }
      if(p==='/api/treasury/transfer' && method==='POST'){ const from=ensureTreasuryAccount(db,user.id,body.from||'صندوق اصلی'),to=ensureTreasuryAccount(db,user.id,body.to||'صندوق اصلی'); if(from.id===to.id) return send(res,400,{error:'مبدأ و مقصد یکی است'}); const val=Number(body.amount||0); const mv={id:id('mv_'),userId:user.id,type:'transfer',fromAccountId:from.id,toAccountId:to.id,from:from.title,to:to.title,amount:val,note:body.note||'',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),createdAt:nowIso()}; db.treasuryMovements.push(mv); createJournal(db,user.id,`انتقال از ${from.title} به ${to.title}`,[{accountTitle:to.title,type:'asset',debit:val},{accountTitle:from.title,type:'asset',credit:val}],'treasury',mv.id); writeDb(db); return send(res,200,mv); }
      if(parts[1]==='treasury' && parts[2]==='movement' && parts[3] && method==='DELETE'){ removeJournalsByRef(db,user.id,parts[3]); db.treasuryMovements=db.treasuryMovements.filter(x=>!(x.id===parts[3]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/treasury/report' && method==='GET'){ const u=new URL(req.url,`http://localhost:${PORT}`); const accountId=u.searchParams.get('accountId'); const days=u.searchParams.get('days'); let m=db.treasuryMovements.filter(x=>x.userId===user.id); if(accountId) m=m.filter(x=>x.accountId===accountId||x.fromAccountId===accountId||x.toAccountId===accountId); if(days){ const from=Date.now()-Number(days)*86400000; m=m.filter(x=>new Date(x.createdAt).getTime()>=from); } const inflow=m.filter(x=>x.type==='deposit').reduce((s,x)=>s+Number(x.amount),0),outflow=m.filter(x=>x.type==='withdraw').reduce((s,x)=>s+Number(x.amount),0); return send(res,200,{movements:m.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),inflow,outflow,net:inflow-outflow,count:m.length}); }
      if(p==='/api/persons' && method==='GET'){ let list=db.persons.filter(x=>x.userId===user.id); const u=new URL(req.url,`http://localhost:${PORT}`); const kind=u.searchParams.get('kind'); if(kind) list=list.filter(x=>(x.kind||'person')===kind); return send(res,200,list.map(x=>publicPerson(db,user.id,x))); }
      if(p==='/api/persons' && method==='POST'){ const person=ensurePerson(db,user.id,body.name||'شخص جدید'); for(const f of PERSON_FIELDS) if(body[f]!==undefined && f!=='name') person[f]=body[f]; writeDb(db); return send(res,200,publicPerson(db,user.id,person)); }
      if(p==='/api/persons/merge' && method==='POST'){ const {sourceId,targetId}=body; if(!sourceId||!targetId||sourceId===targetId) return send(res,400,{error:'شناسه نامعتبر'}); const src=db.persons.find(x=>x.id===sourceId&&x.userId===user.id), tgt=db.persons.find(x=>x.id===targetId&&x.userId===user.id); if(!src||!tgt) return send(res,404,{error:'شخص پیدا نشد'}); let moved=0; db.transactions.forEach(t=>{ if(t.userId===user.id&&t.personId===sourceId){ t.personId=targetId; t.party=tgt.name; moved++; } }); db.cheques.forEach(c=>{ if(c.userId===user.id&&c.personId===sourceId){ c.personId=targetId; c.personName=tgt.name; } }); db.projects.forEach(pr=>{ if(pr.userId===user.id&&pr.customerId===sourceId){ pr.customerId=targetId; pr.customerName=tgt.name; } }); for(const f of ['phone','mobile','nationalId','address']) if(!tgt[f]&&src[f]) tgt[f]=src[f]; db.persons=db.persons.filter(x=>x.id!==sourceId); writeDb(db); return send(res,200,{ok:true,moved,person:publicPerson(db,user.id,tgt)}); }
      if(parts[1]==='persons' && parts[2] && parts[3]==='reminder'){ const pr=db.persons.find(x=>x.id===parts[2]&&x.userId===user.id); if(!pr) return send(res,404,{error:'شخص پیدا نشد'}); const bal=personBalance(db,user.id,pr.id); const abs=Math.abs(bal).toLocaleString('fa-IR'); let text; if(bal<0) text=`سلام ${pr.name} عزیز،\nمبلغ ${abs} تومان از شما نزد ما طلب است. لطفاً تسویه بفرمایید.`; else if(bal>0) text=`سلام ${pr.name} عزیز،\nمبلغ ${abs} تومان به شما بدهکاریم و به‌زودی تسویه می‌شود.`; else text=`سلام ${pr.name}، حساب شما تسویه است.`; const link=(pr.mobile||pr.phone)?`https://wa.me/${String(pr.mobile||pr.phone).replace(/^0/,'98').replace(/\D/g,'')}?text=${encodeURIComponent(text)}`:''; return send(res,200,{text,mobile:pr.mobile||pr.phone||'',whatsapp:link,balance:bal}); }
      if(parts[1]==='persons' && parts[2] && method==='PUT'){ const person=db.persons.find(x=>x.id===parts[2]&&x.userId===user.id); if(!person) return send(res,404,{error:'شخص پیدا نشد'}); for(const f of PERSON_FIELDS) if(body[f]!==undefined) person[f]=body[f]; writeDb(db); return send(res,200,publicPerson(db,user.id,person)); }
      if(parts[1]==='persons' && parts[2] && method==='DELETE'){ const hasDocs=db.transactions.some(t=>t.userId===user.id&&t.personId===parts[2]); const u=new URL(req.url,`http://localhost:${PORT}`); if(hasDocs&&u.searchParams.get('force')!=='1') return send(res,409,{error:'این شخص دارای سند مالی است.',hasDocs:true}); db.persons=db.persons.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(parts[1]==='persons' && parts[2] && parts[3]==='ledger') return send(res,200,db.transactions.filter(t=>t.userId===user.id&&t.personId===parts[2]).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
      if(p==='/api/receivables/aging' && method==='GET'){ const now=Date.now(); const buckets={'۰ تا ۳۰ روز':0,'۳۱ تا ۶۰ روز':0,'۶۱ تا ۹۰ روز':0,'بیش از ۹۰ روز':0}; const rows=[]; db.persons.filter(pp=>pp.userId===user.id).forEach(pp=>{ const bal=personBalance(db,user.id,pp.id); if(bal<=0) return; const txs=db.transactions.filter(t=>t.userId===user.id&&t.personId===pp.id&&t.accountingSide==='receivable'); const last=txs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]; const days=last?Math.floor((now-new Date(last.createdAt).getTime())/86400000):0; const bucket=days<=30?'۰ تا ۳۰ روز':days<=60?'۳۱ تا ۶۰ روز':days<=90?'۶۱ تا ۹۰ روز':'بیش از ۹۰ روز'; buckets[bucket]+=bal; rows.push({id:pp.id,name:pp.name,mobile:pp.mobile||pp.phone||'',balance:bal,days,bucket}); }); rows.sort((a,b)=>b.days-a.days); return send(res,200,{buckets:Object.entries(buckets).map(([name,value])=>({name,value})),rows,total:rows.reduce((s,r)=>s+r.balance,0),count:rows.length}); }
      if(p==='/api/accounts' && method==='GET'){ ensureTreasuryAccount(db,user.id,'صندوق'); writeDb(db); return send(res,200,db.accounts.filter(x=>x.userId===user.id).map(a=>publicAccount(db,user.id,a))); }
      if(p==='/api/accounts' && method==='POST'){ const initial=Number(body.balance||0); const acc={id:id('acc_'),userId:user.id,title:body.title||'حساب جدید',bank:body.bank||'',accountNumber:body.accountNumber||'',card:body.card||'',sheba:body.sheba||'',type:body.type||'bank',note:body.note||'',initialBalance:initial,createdAt:nowIso()}; db.accounts.push(acc); writeDb(db); return send(res,200,publicAccount(db,user.id,acc)); }
      if(parts[1]==='accounts' && parts[2] && method==='PUT'){ const acc=db.accounts.find(x=>x.id===parts[2]&&x.userId===user.id); if(!acc) return send(res,404,{error:'حساب پیدا نشد'}); for(const f of ['title','bank','accountNumber','card','sheba','type','note']) if(body[f]!==undefined) acc[f]=body[f]; if(body.balance!==undefined) acc.initialBalance=Number(body.balance); writeDb(db); return send(res,200,publicAccount(db,user.id,acc)); }
      if(parts[1]==='accounts' && parts[2] && method==='DELETE'){ db.accounts=db.accounts.filter(x=>!(x.id===parts[2]&&x.userId===user.id)); writeDb(db); return send(res,200,{ok:true}); }
      if(p==='/api/categories' && method==='GET') return send(res,200,db.categories);
      if(p==='/api/categories' && method==='POST'){ const name=String(body.name||'').trim(); if(name&&!db.categories.includes(name)) db.categories.push(name); writeDb(db); return send(res,200,db.categories); }
      if(parts[1]==='categories' && parts[2] && method==='PUT'){ const old=decodeURIComponent(parts[2]); const idx=db.categories.indexOf(old); if(idx>=0) db.categories[idx]=body.name||old; writeDb(db); return send(res,200,db.categories); }
      if(parts[1]==='categories' && parts[2] && method==='DELETE'){ const old=decodeURIComponent(parts[2]); const u=new URL(req.url,`http://localhost:${PORT}`); const used=db.transactions.some(t=>t.userId===user.id&&t.category===old); if(used&&u.searchParams.get('force')!=='1') return send(res,409,{error:'این دسته‌بندی در تراکنش‌ها استفاده شده.',used:true}); db.categories=db.categories.filter(c=>c!==old); writeDb(db); return send(res,200,db.categories); }
      if(p==='/api/training' && method==='GET') return send(res,200,db.assistantTraining.filter(x=>x.userId===user.id));
      if(p==='/api/training' && method==='POST'){ const tr={id:id('tr_'),userId:user.id,phrase:body.phrase||'',meaning:body.meaning||'',createdAt:nowIso()}; db.assistantTraining.push(tr); writeDb(db); return send(res,200,tr); }
      if(p==='/api/assistant/command' && method==='POST'){
        const result=parseLocalCommand(db,user,body.text||'');
        if(result.needsClarification) return send(res,200,result);
        if(result.action==='confirm_delete'){ writeDb(db); return send(res,200,result); }
        const pushUndo=(e)=>{ db.undoStack ||= []; db.undoStack.push({...e,userId:user.id,at:nowIso()}); if(db.undoStack.length>50) db.undoStack.shift(); };
        const persistParsed=(r,note)=>{ if(r.action==='transaction_parsed'){ const parsed=r.parsed; if(Number(parsed.amount)>0){ const tx={id:id('tx_'),userId:user.id,title:parsed.title||'تراکنش',amount:Number(parsed.amount||0),type:parsed.type||'expense',category:parsed.category||'سایر',bank:parsed.bank||(parsed.accountingSide?'':'صندوق'),party:parsed.party||'',personId:parsed.personId||'',accountingSide:parsed.accountingSide||'',date:new Intl.DateTimeFormat('fa-IR-u-ca-persian').format(new Date()),method:'Assistant Local',note,createdAt:nowIso()}; db.transactions.push(tx); journalFromTransaction(db,tx); pushUndo({kind:'create',collection:'transactions',id:tx.id}); r.transaction=tx; r.txId=tx.id; r.sideSuggestions=parsed.sideSuggestions; r.canUndo=true; const sideFa=tx.accountingSide==='receivable'?'(طلب از '+(tx.party||'او')+')':tx.accountingSide==='payable'?'(بدهی به '+(tx.party||'او')+')':''; r.message=`ثبت شد: ${tx.title}\\nمبلغ ${Number(tx.amount).toLocaleString('fa-IR')} تومان ${sideFa}`; } } return r; };
        if(result.action==='multi_command') { result.results=result.results.map(r=>persistParsed(r,body.text||'')); writeDb(db); return send(res,200,{...result,message:`${result.results.length.toLocaleString('fa-IR')} عملیات پردازش و ثبت شد.`}); }
        if(result.action==='transaction_parsed') { persistParsed(result,body.text||''); writeDb(db); return send(res,200,result); }
        if(['cheque_created','project_created','expert_settlement','treasury_movement','treasury_transfer','cheque_paid','edited','cheque_edited','settled'].includes(result.action)) result.canUndo=true;
        writeDb(db); return send(res,200,result);
      }
      if(p==='/api/sms' && method==='GET') return send(res,200,db.smsInbox.filter(s=>s.userId===user.id));
      if(p==='/api/sms/parse' && method==='POST'){ const parsed=detectTransaction(body.text||''); const sms={id:id('sms_'),userId:user.id,sender:body.sender||'BANK',text:body.text||'',parsed,status:'pending',createdAt:nowIso()}; db.smsInbox.unshift(sms); writeDb(db); return send(res,200,sms); }
      if(p==='/api/ai/parse-transaction' && method==='POST'){ try{ const content=await callAi(db,[{role:'user',content:`متن را JSON تراکنش کن: ${body.text||''}`}],true); const parsed=content?{...detectTransaction(body.text||''),...JSON.parse(content.replace(/```json|```/g,''))}:detectTransaction(body.text||''); return send(res,200,parsed); }catch(e){ return send(res,200,{...detectTransaction(body.text||''),aiWarning:e.message}); } }
      if(p==='/api/ai/parse-receipt' && method==='POST'){ try{ const content=await callAi(db,[{role:'user',content:'رسید را تحلیل کن'}],true,body.imageBase64); const parsed=content?JSON.parse(content.replace(/```json|```/g,'')):detectTransaction(body.text||'رسید خرید'); return send(res,200,{...detectTransaction(body.text||'رسید خرید'),...parsed,type:parsed.type||'expense'}); }catch(e){ return send(res,200,{title:'رسید اسکن‌شده',amount:0,type:'expense',category:'سایر',aiWarning:e.message}); } }
      if(p==='/api/ai/ask' && method==='POST'){ const txs=db.transactions.filter(t=>t.userId===user.id); try{ const content=await callAi(db,[{role:'user',content:`سوال: ${body.question}\nداده‌ها:${JSON.stringify(txs.slice(0,150))}`}]); if(content) return send(res,200,{answer:content}); }catch{} const inc=txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0), exp=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0), rest=txs.filter(t=>/رستوران|کافه/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0), payable=txs.filter(t=>/بدهکار|بدهی/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0), receivable=txs.filter(t=>/بستانکار|طلب/.test(t.category)).reduce((s,t)=>s+Number(t.amount),0); const biggest=[...txs].sort((a,b)=>Number(b.amount)-Number(a.amount))[0]; const q=body.question||''; let answer=`خلاصه مالی: درآمد ${inc.toLocaleString('fa-IR')}، هزینه ${exp.toLocaleString('fa-IR')} و مانده ${(inc-exp).toLocaleString('fa-IR')} تومان.`; if(/رستوران|کافه/.test(q)) answer=`مجموع هزینه‌های رستوران و کافه شما ${rest.toLocaleString('fa-IR')} تومان است.`; else if(/بده|طلب|بستان/.test(q)) answer=`طلب/بستانکاری: ${receivable.toLocaleString('fa-IR')} تومان، بدهی/بدهکاری: ${payable.toLocaleString('fa-IR')} تومان.`; else if(/بزرگترین|بزرگ‌ترین/.test(q)&&biggest) answer=`بزرگ‌ترین تراکنش: ${biggest.title} به مبلغ ${Number(biggest.amount).toLocaleString('fa-IR')} تومان.`; return send(res,200,{answer}); }
      if(p.startsWith('/api/analytics/summary') && method==='GET'){
        const u=new URL(req.url,`http://localhost:${PORT}`); const range=u.searchParams.get('range')||'all'; const category=u.searchParams.get('category'); const personId=u.searchParams.get('personId'); const type=u.searchParams.get('type'); const bank=u.searchParams.get('bank'); const projectId=u.searchParams.get('projectId');
        let txs=db.transactions.filter(t=>t.userId===user.id); const now=Date.now(); const sd=range==='week'?7:range==='month'?31:range==='quarter'?93:range==='year'?366:null; if(sd){ const from=now-sd*86400000; txs=txs.filter(t=>new Date(t.createdAt).getTime()>=from); }
        if(category) txs=txs.filter(t=>t.category===category); if(personId) txs=txs.filter(t=>t.personId===personId); if(type) txs=txs.filter(t=>t.type===type); if(bank) txs=txs.filter(t=>(t.bank||'')===bank); if(projectId) txs=txs.filter(t=>t.projectId===projectId);
        const income=txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0); const expense=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0);
        const mm={}; txs.forEach(t=>{ const ym=faYearMonth(t.createdAt); if(!ym) return; mm[ym] ||= {ym,label:faMonthLabel(ym),income:0,expense:0}; if(t.type==='income') mm[ym].income+=Number(t.amount); else mm[ym].expense+=Number(t.amount); });
        let run=0; const series=Object.values(mm).sort((a,b)=>a.ym.localeCompare(b.ym)).slice(-12).map(m=>{ run+=(m.income-m.expense); return {...m,net:m.income-m.expense,cumulative:run}; });
        const cm={}; txs.filter(t=>t.type==='expense').forEach(t=>cm[t.category]=(cm[t.category]||0)+Number(t.amount)); const byCategory=Object.entries(cm).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
        const icm={}; txs.filter(t=>t.type==='income').forEach(t=>icm[t.category]=(icm[t.category]||0)+Number(t.amount)); const incomeByCategory=Object.entries(icm).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
        const mtm={}; txs.forEach(t=>{ const m=t.method||'سایر'; mtm[m]=(mtm[m]||0)+1; }); const byMethod=Object.entries(mtm).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
        const topPersons=db.persons.filter(p2=>p2.userId===user.id).map(p2=>({name:p2.name,balance:personBalance(db,user.id,p2.id)})).filter(p2=>p2.balance!==0).sort((a,b)=>Math.abs(b.balance)-Math.abs(a.balance)).slice(0,6);
        const topProjects=db.projects.filter(p2=>p2.userId===user.id).map(p2=>({name:p2.title,amount:Number(p2.amount||0),paid:Number(p2.paid||0),balance:Number(p2.balance||0)})).sort((a,b)=>b.balance-a.balance).slice(0,6);
        const accounts=db.accounts.filter(a=>a.userId===user.id).map(a=>({name:a.title,value:Number(a.balance||0)}));
        return send(res,200,{income,expense,balance:income-expense,count:txs.length,series,byCategory,incomeByCategory,byMethod,topPersons,topProjects,accounts});
      }
      if(p==='/api/analytics/filters' && method==='GET'){ const txs=db.transactions.filter(t=>t.userId===user.id); return send(res,200,{categories:db.categories,banks:Array.from(new Set(txs.map(t=>t.bank).filter(Boolean))),persons:db.persons.filter(p2=>p2.userId===user.id).map(p2=>({id:p2.id,name:p2.name})),projects:db.projects.filter(p2=>p2.userId===user.id).map(p2=>({id:p2.id,name:p2.title})),experts:db.experts.filter(e=>e.userId===user.id).map(e=>({id:e.id,name:e.name}))}); }
      if(p==='/api/analytics/compare' && method==='GET'){ const txs=db.transactions.filter(t=>t.userId===user.id); const now=Date.now(); const periods={month:31,quarter:93,year:366}; const out={}; for(const [key,days] of Object.entries(periods)){ const span=days*86400000; const cf=now-span,pf=now-2*span; const sum=(f,tt)=>txs.filter(t=>{const ts=new Date(t.createdAt).getTime(); return ts>=f&&ts<tt;}); const cur=sum(cf,now),prev=sum(pf,cf); const ci=cur.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0),ce=cur.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0),pi=prev.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0),pe=prev.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0); const pct=(c,pp)=>pp===0?(c>0?100:0):Math.round(((c-pp)/pp)*100); out[key]={income:{current:ci,previous:pi,changePct:pct(ci,pi)},expense:{current:ce,previous:pe,changePct:pct(ce,pe)},net:{current:ci-ce,previous:pi-pe,changePct:pct(ci-ce,pi-pe)}}; } return send(res,200,out); }
      if(p==='/api/analytics/alerts' && method==='GET'){ const txs=db.transactions.filter(t=>t.userId===user.id); const alerts=[]; const income=txs.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0),expense=txs.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount),0); if(expense>income&&income>0) alerts.push({level:'danger',icon:'trend',title:'هزینه بیشتر از درآمد',text:`مخارج شما ${(expense-income).toLocaleString('fa-IR')} تومان از درآمد بیشتر است.`}); const debtors=db.persons.filter(p2=>p2.userId===user.id).map(p2=>({name:p2.name,balance:personBalance(db,user.id,p2.id)})).filter(p2=>p2.balance<0).sort((a,b)=>a.balance-b.balance); if(debtors.length) alerts.push({level:'info',icon:'person',title:'بدهی به اشخاص',text:`بیشترین بدهی: ${debtors[0].name} (${Math.abs(debtors[0].balance).toLocaleString('fa-IR')} تومان).`}); const cred=db.persons.filter(p2=>p2.userId===user.id).map(p2=>({name:p2.name,balance:personBalance(db,user.id,p2.id)})).filter(p2=>p2.balance>0).sort((a,b)=>b.balance-a.balance); if(cred.length) alerts.push({level:'success',icon:'money',title:'مطالبات قابل وصول',text:`بیشترین طلب: ${cred[0].name} (${cred[0].balance.toLocaleString('fa-IR')} تومان).`}); if(!alerts.length) alerts.push({level:'info',icon:'ok',title:'وضعیت پایدار',text:'هشدار مالی فعالی وجود ندارد.'}); return send(res,200,alerts); }
      if(p==='/api/dashboard/prefs' && method==='GET'){ const pr=db.dashboardPrefs?.[user.id]; return send(res,200,pr?{...DEFAULT_DASH,...pr}:DEFAULT_DASH); }
      if(p==='/api/dashboard/prefs' && method==='PUT'){ db.dashboardPrefs ||= {}; db.dashboardPrefs[user.id]={...DEFAULT_DASH,...(db.dashboardPrefs[user.id]||{}),...body}; writeDb(db); return send(res,200,db.dashboardPrefs[user.id]); }
      if(p==='/api/branding' && method==='GET'){ db.branding ||= {}; return send(res,200,{...DEFAULT_BRANDING,...(db.branding[user.id]||{})}); }
      if(p==='/api/branding' && method==='PUT'){ db.branding ||= {}; db.branding[user.id]={...DEFAULT_BRANDING,...(db.branding[user.id]||{}),...body}; writeDb(db); return send(res,200,db.branding[user.id]); }
      if(p==='/api/assistant/confirm-delete' && method==='POST'){ db.undoStack ||= []; const {kind,id:tid}=body; if(kind==='transaction'){ const tx=db.transactions.find(t=>t.id===tid&&t.userId===user.id); if(!tx) return send(res,404,{error:'تراکنش پیدا نشد.'}); db.undoStack.push({kind:'delete',collection:'transactions',record:tx,userId:user.id,at:nowIso()}); db.transactions=db.transactions.filter(t=>t.id!==tid); writeDb(db); return send(res,200,{action:'deleted',canUndo:true,message:`تراکنش «${tx.title}» حذف شد.`}); } if(kind==='cheque'){ const ch=db.cheques.find(c=>c.id===tid&&c.userId===user.id); if(!ch) return send(res,404,{error:'چک پیدا نشد.'}); db.undoStack.push({kind:'delete',collection:'cheques',record:ch,userId:user.id,at:nowIso()}); db.cheques=db.cheques.filter(c=>c.id!==tid); writeDb(db); return send(res,200,{action:'deleted',canUndo:true,message:`چک «${ch.title}» حذف شد.`}); } return send(res,400,{error:'نوع نامعتبر.'}); }
      if(p==='/api/assistant/undo' && method==='POST'){ db.undoStack ||= []; const idx=[...db.undoStack].reverse().findIndex(e=>e.userId===user.id); if(idx<0) return send(res,200,{message:'عملیاتی برای بازگردانی وجود ندارد.'}); const ri=db.undoStack.length-1-idx; const e=db.undoStack.splice(ri,1)[0]; if(e.kind==='create'){ db[e.collection]=(db[e.collection]||[]).filter(x=>x.id!==e.id); writeDb(db); return send(res,200,{action:'undone',message:'آخرین ثبت لغو شد.'}); } if(e.kind==='delete'){ (db[e.collection] ||= []).push(e.record); writeDb(db); return send(res,200,{action:'restored',message:`«${e.record.title||'رکورد'}» بازگردانده شد.`}); } writeDb(db); return send(res,200,{message:'انجام شد.'}); }
      if(p==='/api/assistant/correction' && method==='POST'){ const {text,field,value}=body; if(!text||!field||!value) return send(res,400,{error:'داده ناقص.'}); db.corrections ||= []; db.corrections.push({id:id('cor_'),userId:user.id,text:String(text).slice(0,120),field,value,createdAt:nowIso()}); db.assistantTraining.push({id:id('tr_'),userId:user.id,phrase:String(text).slice(0,60),meaning:`${field}=${value}`,createdAt:nowIso()}); writeDb(db); return send(res,200,{ok:true,message:'یاد گرفتم؛ دفعهٔ بعد بهتر تشخیص می‌دهم.'}); }
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
    // index.html هرگز کش نشود تا همیشه نسخهٔ جدید نمایش داده شود
    const headers={'Content-Type':type}; if(ext==='.html') headers['Cache-Control']='no-store, no-cache, must-revalidate';
    res.writeHead(200, headers); res.end(fs.readFileSync(file));
  }catch(e){ send(res,500,{error:e.message||'server error'}); }
});
server.listen(PORT,()=>console.log(`Dast Rast portable is running: http://localhost:${PORT}`));
