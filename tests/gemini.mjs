/* בדיקות ג׳מיני — מול API מזויף. אף בקשה אמיתית לא יוצאת.
   מה שנבדק כאן הוא מה שאפשר לבדוק בלי מפתח: השער, המפל, והכללים. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

// ---------- API מזויף ----------
let hits = [];
let sent = [];        /* גודל גוף הבקשה, לבדיקת ההקטנה */
let plan = {};
await ctx.route('https://generativelanguage.googleapis.com/**', async route => {
  const url = route.request().url();
  hits.push(url);
  if (url.includes('/models?')) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ models: [
        { name: 'models/gemini-x-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embed-only', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-x-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-x-flash-lite', supportedGenerationMethods: ['generateContent'] }
      ] })
    });
  }
  const model = (url.match(/models\/([^:]+):/) || [])[1];
  if (model) sent.push((route.request().postData() || '').length);
  // '*' חל על כל מודל — הבדיקות לא צריכות לדעת מי ניצח במפל
  const rule = plan[model] || plan['*'];
  if (rule && rule.hang) return new Promise(() => {});   // לעולם לא עונה
  if (rule && rule.status) return route.fulfill({ status: rule.status, body: rule.body || '{}' });
  if (rule && rule.finish) {
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ finishReason: rule.finish, content: { parts: [] } }] })
    });
  }
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: (rule && rule.text) ||
      '{"typeKey":"vehicle_insurance","fields":{"policyNumber":"PL 229 1043","insurer":"הראל","plate":"84-521-03","nope":"התעלם ממני"},"expiryDate":"2027-03-20"}' }] } }] })
  });
});

await page.goto(BASE);
await page.waitForSelector('.scr-title');

console.log('\n— השער —');
const gate = await page.evaluate(async () => {
  const G = window.Gemini;
  const before = { configured: G.configured(), text: G.consented('text'), img: G.consented('image') };
  const noKey = await G.parse({ text: 'משהו' }).then(() => 'עבר', e => e.message);
  await window.Settings.set(window.CONFIG.K.geminiKey, 'FAKE');
  const noConsent = await G.parse({ text: 'משהו' }).then(() => 'עבר', e => e.message);
  return { before, noKey, noConsent };
});
t('ברירת המחדל: אין מפתח ואין הסכמה',
  gate.before.configured === false && !gate.before.text && !gate.before.img);
t('בלי מפתח — נדחה', /מפתח/.test(gate.noKey), gate.noKey);
t('עם מפתח ובלי הסכמה — נדחה', /הסכמה/.test(gate.noConsent), gate.noConsent);
t('ובשני המקרים אפס בקשות יצאו', hits.length === 0, String(hits.length));

console.log('\n— הפרומפט נבנה מהטבלה —');
const prompt = await page.evaluate(() => window.Gemini.prompt());
const keys = await page.evaluate(() => window.DOC_TYPES.all().map(t => t.key));
t('כל 12 הסוגים בפרומפט', keys.every(k => prompt.includes(k)),
  keys.filter(k => !prompt.includes(k)).join(','));
t('שדות מופיעים עם התווית והסוג', prompt.includes('policyNumber — מספר פוליסה (policy)'));
t('נדרש JSON נקי', /JSON נקי בלבד/.test(prompt));
t('נאסר להשלים או לנחש', /אל תנחש/.test(prompt) && /אל תמציא/.test(prompt));
t('נאסר לשנות סדר ספרות', /אל תשנה את סדר הספרות/.test(prompt));
t('מבנה ת״ז מוסבר במפורש', /ספרת הביקורת היא האחרונה/.test(prompt));

console.log('\n— דירוג מודלים ומפל —');
await page.evaluate(() => window.Settings.set(window.CONFIG.K.geminiConsentText, true));
hits = [];
const first = await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' }));
const used = hits.filter(u => u.includes(':generateContent'));
t('מודל שאינו תומך generateContent מסונן', !used.some(u => u.includes('embed-only')));
/* עד 0.9.4 flash-lite היה ראשון. זו הייתה בחירת מהירות ומחיר שהפכה
   בשקט לבחירת דיוק — המודל החלש קרא את המסמכים כמעט תמיד. DEC-28. */
t('pro נבחר לפני flash ולפני flash-lite', used[0].includes('-pro'), used[0]);
t('התשובה נותחה', first.typeKey === 'vehicle_insurance', JSON.stringify(first).slice(0, 80));

const remembered = await page.evaluate(() => window.Settings.get(window.CONFIG.K.geminiLastModel));
t('המודל שהצליח נזכר לתצוגה', remembered === 'gemini-x-pro', remembered);

hits = [];
plan = { 'gemini-x-pro': { status: 429 } };   // רק הראשון נופל
await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' }));
const used2 = hits.filter(u => u.includes(':generateContent'));
t('429 מפנה מקום למודל הבא', used2.length === 2 && used2[1].includes('flash'), used2.join(' → '));

/* המודל שהצליח **אינו** מוקפץ לראש בקריאה הבאה. הקפצה כזאת נועלת 429
   חד-פעמי על מודל חלש ומשאירה שם את כל הקריאות הבאות. */
hits = [];
plan = {};
await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' }));
const used2b = hits.filter(u => u.includes(':generateContent'));
t('והמפל חוזר להתחיל מלמעלה, ולא מהמודל שהצליח',
  used2b[0].includes('-pro'), used2b.join(' → '));

console.log('\n— דירוג ומפל שהמשתמש מגדיר —');
const ranked = await page.evaluate(() => {
  const names = ['gemini-2.5-flash', 'gemini-3-pro-preview', 'gemini-2.5-pro',
                 'gemini-3-flash-lite', 'gemini-3-flash'];
  return names.slice().sort(window.Gemini.cmpRank);
});
t('שכבה גוברת על דור — pro של דור קודם לפני flash של הדור הבא',
  ranked[0] === 'gemini-3-pro-preview' && ranked[1] === 'gemini-2.5-pro',
  ranked.join(' → '));
t('בתוך שכבה, הדור הגבוה קודם',
  ranked.indexOf('gemini-3-flash') < ranked.indexOf('gemini-2.5-flash'),
  ranked.join(' → '));
t('flash-lite אחרון', ranked[ranked.length - 1] === 'gemini-3-flash-lite', ranked.join(' → '));

const stable = await page.evaluate(() =>
  ['gemini-3-pro-preview', 'gemini-3-pro'].sort(window.Gemini.cmpRank));
t('יציב לפני preview באותו דור', stable[0] === 'gemini-3-pro', stable.join(' → '));

hits = [];
await page.evaluate(() => window.Settings.set(window.CONFIG.K.geminiModels,
  ['gemini-x-flash', 'gemini-x-pro']));
await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' }));
const usedMine = hits.filter(u => u.includes(':generateContent'));
t('מפל שהמשתמש הגדיר גובר על הדירוג', usedMine[0].includes('-flash'), usedMine[0]);
t('ואינו שואל את ה-API אילו מודלים קיימים',
  !hits.slice(-2).some(u => u.includes('/models?')), hits.slice(-2).join(' | '));

hits = [];
plan = { 'gemini-x-flash': { status: 404 } };   // שם שהתיישן
await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' }));
const used404 = hits.filter(u => u.includes(':generateContent'));
t('שם מודל שאינו קיים נופל לבא אחריו ולא מפיל את הכל',
  used404.length === 2 && used404[1].includes('-pro'), used404.join(' → '));

plan = {};
await page.evaluate(() => window.Settings.set(window.CONFIG.K.geminiModels, []));
hits = [];
const fresh = await page.evaluate(() => window.Gemini.available());
t('גילוי מחזיר את הרשימה מדורגת', fresh[0].includes('-pro'), fresh.join(' → '));
t('והוא שואל את ה-API מחדש ולא מהקאש',
  hits.some(u => u.includes('/models?')), String(hits.length));

/* 400 אינו שם נרדף ל"מפתח פסול" — DEC-44. מודל שדחה את הפורמט מחזיר
   אותו קוד, וקודם הוא עצר את המפל כולו והאשים את המפתח. */
hits = [];
plan = { '*': { status: 400 } };
const soft400 = await page.evaluate(() => window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
const used3 = hits.filter(u => u.includes(':generateContent'));
t('400 סתמי אינו מפיל את המפל', used3.length === 3, String(used3.length));
t('וההודעה אומרת שהמודל דחה, לא שהמפתח פסול',
  /המודל דחה/.test(soft400) && !/המפתח/.test(soft400), soft400);

hits = [];
plan = { '*': { status: 400, body: JSON.stringify({
  error: { message: 'API key not valid. Please pass a valid API key.' } }) } };
const bad = await page.evaluate(() => window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
const usedKey = hits.filter(u => u.includes(':generateContent'));
t('מפתח פסול עוצר את המפל אחרי מודל אחד', usedKey.length === 1, String(usedKey.length));
t('וההודעה מפנה להגדרות', /המפתח נדחה/.test(bad), bad);

hits = [];
plan = { '*': { status: 401 } };
const un = await page.evaluate(() => window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
t('401 גם הוא המפתח, ועוצר מיד',
  /המפתח נדחה/.test(un) && hits.filter(u => u.includes(':generateContent')).length === 1, un);

console.log('\n— חילוץ JSON —');
hits = [];
plan = { '*': { text: '```json\n{"typeKey":"generic","fields":{"title":"בדיקה"}}\n```' } };
const f1 = await page.evaluate(() => window.Gemini.parse({ text: 'x' }));
t('גדרות קוד מוסרות', f1.typeKey === 'generic', JSON.stringify(f1));

plan = { '*': { text: 'הנה התשובה: {"typeKey":"generic","fields":{}} תודה' } };
const f2 = await page.evaluate(() => window.Gemini.parse({ text: 'x' }));
t('פטפוט סביב ה-JSON מסונן', f2.typeKey === 'generic');

/* "התשובה חזרה ריקה" הוא שלושה מצבים שנראים אותו דבר — DEC-44.
   הראשון שבהם נפוץ דווקא כאן: מודל שמסרב לקרוא תעודת זהות. */
const said = {};
for (const fin of ['SAFETY', 'MAX_TOKENS', 'STOP']) {
  plan = { '*': { finish: fin } };
  said[fin] = await page.evaluate(() =>
    window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
}
t('מודל שסירב לקרוא תעודה אומר את זה', /סירב/.test(said.SAFETY), said.SAFETY);
t('תשובה שנקטעה באורך אומרת את זה', /נקטעה/.test(said.MAX_TOKENS), said.MAX_TOKENS);
t('ורק מה שנשאר באמת הוא "ריקה"', /ריקה/.test(said.STOP), said.STOP);

plan = { '*': { text: 'אין לי מושג' } };
const f3 = await page.evaluate(() => window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
t('תשובה שאינה JSON נכשלת בבירור', /JSON/.test(f3), f3);

console.log('\n— תקרות זמן — DEC-44 —');
/* **הבדיקה שמכסה את הבאג שדווח.** מודל ראשון שנתקע בלע קודם את התקציב
   כולו, ה-abort הפיל את הבקשה, והמפל לא רץ מעולם: 45 שניות המתנה
   וכישלון, בזמן ששני מודלים מהירים יותר עמדו בתור. */
hits = [];
plan = { 'gemini-x-pro': { hang: true } };
await page.evaluate(() => { window.CONFIG.GEMINI_TIMEOUT_MS = 700; });
const t1 = Date.now();
const rescued = await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' })
  .then(r => r, e => ({ err: e.message })));
const usedSlow = hits.filter(u => u.includes(':generateContent'));
t('מודל שנתקע אינו מפיל את המפל', rescued.typeKey === 'vehicle_insurance',
  JSON.stringify(rescued).slice(0, 80));
t('והבא בתור הוא שענה', usedSlow.length === 2 && usedSlow[1].includes('flash'),
  usedSlow.join(' → '));
t('בלי לחכות לתקרה של כל הפרסינג', Date.now() - t1 < 6000, String(Date.now() - t1));

plan = { '*': { hang: true } };
hits = [];
const t0 = Date.now();
const timedOut = await page.evaluate(() =>
  window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
t('בקשה תקועה נקטעת ולא נתלית', /לא ענה בזמן/.test(timedOut), timedOut);
t('אחרי שנוסו שלושה מודלים', hits.filter(u => u.includes(':generateContent')).length === 3,
  String(hits.filter(u => u.includes(':generateContent')).length));
t('והקטיעה מהירה', Date.now() - t0 < 6000, String(Date.now() - t0));

/* התקרה העליונה קיימת כדי שנפילה תיגמר, ולא כדי שהיא תהיה זו שקוצבת
   כל ניסיון. ההודעה שלה שונה, מפני שהמצב שונה. */
const totalOut = await page.evaluate(async () => {
  window.CONFIG.GEMINI_TIMEOUT_MS = 9000;
  window.CONFIG.GEMINI_TOTAL_MS = 700;
  const out = await window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message);
  window.CONFIG.GEMINI_TOTAL_MS = 75000;
  window.CONFIG.GEMINI_TIMEOUT_MS = 25000;
  return out;
});
t('תקרת הפרסינג כולו אומרת משהו אחר', /לא הסתיים בזמן/.test(totalOut), totalOut);

/* הרשימה שגוגל מחזירה היא עשרות שמות. בלי תקרה, מפתח שחרג ממכסה היה
   מהלך על כולם לפני שנאמר למשתמש משהו. */
hits = [];
plan = { '*': { status: 429 } };
await page.evaluate(() => window.Settings.set(window.CONFIG.K.geminiModels,
  ['m-1', 'm-2', 'm-3', 'm-4', 'm-5']));
const capped = await page.evaluate(() => window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
t('המפל נעצר אחרי שלושה ניסיונות',
  hits.filter(u => u.includes(':generateContent')).length === 3, String(hits.length));
t('וההודעה היא של הכישלון האחרון', /מכסת/.test(capped), capped);
await page.evaluate(() => window.Settings.set(window.CONFIG.K.geminiModels, []));

/* ---------- הגילוי יצא מהמסלול הקריטי — DEC-44 ----------
   עד כאן כל פרסינג בטעינה חדשה שילם סיבוב רשת שלם רק כדי לשאול אילו
   מודלים קיימים, לפני שבייט אחד של המסמך יצא. */
console.log('\n— רשימת המודלים נשמרת בין טעינות —');
plan = {};
const seen = await page.evaluate(() => window.Settings.get(window.CONFIG.K.geminiModelsSeen));
t('הגילוי נשמר להגדרות', (seen || []).length >= 3, JSON.stringify(seen));

await page.reload();
await page.waitForSelector('.scr-title');
hits = [];
await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' }));
t('אחרי רענון, הפרסינג מתחיל בבקשה למודל ולא בשאלה',
  hits[0] && hits[0].includes(':generateContent'), hits.join(' | '));
t('ובזמן שהמשתמש מחכה לא נשאלה שום שאלה נוספת',
  !hits.some(u => u.includes('/models?')), hits.join(' | '));
await page.waitForTimeout(2200);
t('והרשימה מתרעננת ברקע — אחרי, לא לפני',
  hits.some(u => u.includes('/models?')), hits.join(' | '));

console.log('\n— מהתשובה להצעה —');
plan = {};
const prop = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
t('הסוג נלקח מהתשובה', prop.typeKey === 'vehicle_insurance', prop.typeKey);
t('שדה שאינו בטבלה נזרק', prop.values.nope === undefined, JSON.stringify(prop.values));
t('ערכים עוברים קנוניזציה לפי ה-kind',
  prop.values.policyNumber === 'PL2291043' && prop.values.plate === '8452103',
  JSON.stringify(prop.values));
t('תאריך תפוגה נלקח', prop.expiryDate === '2027-03-20', prop.expiryDate);
t('יש הודעה שמבקשת בדיקה', /בדוק/.test(prop.notice.text), prop.notice.text);

plan = { '*': { text: '{"typeKey":"id_card","fields":{"idNumber":"212345678","fullName":"ליאור כהן"}}' } };
const flip = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
t('ת״ז שהמודל הפך מתוקנת לפי ספרת הביקורת',
  flip.values.idNumber === '123456782', flip.values.idNumber);
t('והשדה מסומן לאימות', flip.unverified.indexOf('idNumber') !== -1, JSON.stringify(flip.unverified));
t('וההודעה אומרת שתוקן סדר ספרות',
  /סדר הספרות תוקן/.test(flip.notice.text), flip.notice.text);
t('שדה אחר לא נגוע', flip.values.fullName === 'ליאור כהן');

plan = { '*': { text: '{"typeKey":"id_card","fields":{"idNumber":"123456782"}}' } };
const clean = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
t('ת״ז תקינה עוברת בלי תיקון ובלי סימון',
  clean.values.idNumber === '123456782' && clean.unverified.length === 0);
t('וההודעה חוזרת להיות רגילה', /בדוק/.test(clean.notice.text) && !/סדר הספרות/.test(clean.notice.text));

plan = { '*': { text: '{"typeKey":"generic","fields":{},"expiryDate":"2026-02-30"}' } };
const badDate = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
t('תאריך שאינו קיים נדחה', badDate.expiryDate === null, String(badDate.expiryDate));

plan = { '*': { status: 500 } };
const failProp = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
t('כשל מוחזר כהודעה ולא כחריגה', failProp.notice.level === 'warn', JSON.stringify(failProp.notice));
t('ובלי שום שדה מולא', Object.keys(failProp.values).length === 0);

console.log('\n— תעודה שאין לה שורה בטבלה —');
/* הבאג: מסמך לא מוכר נפל ל-generic, ואז כל מה שנקרא ממנו — חוץ משלושת
   השדות של generic — נזרק בשקט, והמשתמש ראה טופס כמעט ריק. */
plan = { '*': { text: JSON.stringify({
  typeKey: 'generic',
  fields: { title: 'אישור ניהול חשבון', issuer: 'בנק לאומי', idNumber: '123456782' },
  extra: { 'מספר חשבון': '12-345-678901', 'סניף': '842', 'סוג חשבון': 'עו״ש', 'ריק': '' },
  issueDate: '2026-01-15'
}) } };
const unk = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
const byLabel = Object.fromEntries(unk.extra.map(e => [e.label, e.value]));

t('הסוג הפתוח נבחר', unk.typeKey === 'generic', unk.typeKey);
t('העמודות שיש להן מקום נכנסו לשם',
  unk.values.title === 'אישור ניהול חשבון' && unk.values.issuer === 'בנק לאומי',
  JSON.stringify(unk.values));
t('ומה שאין לו עמודה כבר לא נזרק', unk.extra.length > 0, JSON.stringify(unk.extra));
t('התוויות הן מה שמודפס במסמך',
  byLabel['מספר חשבון'] === '12-345-678901' && byLabel['סניף'] === '842',
  JSON.stringify(byLabel));
t('שדה ריק אינו נכנס', byLabel['ריק'] === undefined);
t('מפתח שמוכר משורה אחרת בטבלה מקבל את התווית שלה',
  unk.extra.some(e => e.key === 'idNumber' && e.label === 'מספר תעודת זהות'),
  JSON.stringify(unk.extra));
t('וההודעה סופרת גם אותם',
  /שדות מולאו/.test(unk.notice.text) && unk.notice.level === 'ok', unk.notice.text);
t('מפתחות ה-extra יציבים בין הרצות',
  JSON.stringify(unk.extra) ===
  JSON.stringify((await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }))).extra));

/* אותה תשובה בדיוק, על סוג סגור: שם זריקה היא הדבר הנכון */
plan = { '*': { text: JSON.stringify({
  typeKey: 'vehicle_test',
  fields: { plate: '8452103', nope: 'לא קיים' },
  extra: { 'משהו': 'שנקרא' },
  expiryDate: '2027-01-01'
}) } };
const closed = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
t('סוג סגור אינו אוסף שדות פתוחים', closed.extra.length === 0, JSON.stringify(closed.extra));
t('והוא עדיין זורק מפתח שאינו בעמודות שלו', closed.values.nope === undefined);

plan = { '*': { text: JSON.stringify({
  typeKey: 'generic', fields: { title: 'ערמה' },
  extra: Object.fromEntries(Array.from({ length: 60 }, (_, i) => ['שדה ' + i, 'ערך ' + i]))
}) } };
const flood = await page.evaluate(() => window.Parse.fromGemini({ text: 'x' }));
t('מודל שמפליג נעצר בתקרה', flood.extra.length === 20, String(flood.extra.length));

console.log('\n— הפרומפט מבקש את מה שהיה נזרק —');
const pr = await page.evaluate(() => window.Gemini.prompt());
const openKeys = await page.evaluate(() => window.Gemini.openKeys());
const schema = await page.evaluate(() => window.Gemini.schemaText());
t('הפרומפט מסביר את extra', /extra/.test(pr));
const tableOpen = await page.evaluate(() =>
  window.DOC_TYPES.all().filter(t => window.DOC_TYPES.openFields(t.key)).map(t => t.key));
t('הטבלה היא שקובעת מי פתוח',
  openKeys.length > 0 && openKeys.join(',') === tableOpen.join(','),
  openKeys.join(',') + ' vs ' + tableOpen.join(','));
t('והפרומפט מפנה לסוגים שהיא סימנה',
  openKeys.every(k => pr.includes(k)) && /סוג פתוח/.test(pr), openKeys.join(','));
t('סוג פתוח מסומן ככזה בסכמה', /\[סוג פתוח/.test(schema));
t('וסוג סגור אינו מסומן',
  schema.split('\n').filter(l => /\[סוג פתוח/.test(l)).length === openKeys.length,
  String(openKeys.length));

console.log('\n— הסכמות נפרדות —');
plan = {};
hits = [];
const imgBlocked = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 8; c.height = 8;
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  return window.Gemini.parse({ blob: blob, mime: 'image/png' }).then(() => 'עבר', e => e.message);
});
t('הסכמת טקסט אינה מתירה שליחת צילום', /הסכמה/.test(imgBlocked), imgBlocked);
t('ואפס בקשות יצאו', hits.filter(u => u.includes(':generateContent')).length === 0);

console.log('\n— מסך ההגדרות —');
await page.goto(BASE + '#/settings');
await page.waitForSelector('.sect');
const setText = await page.textContent('.scr');
t('נאמר שהמסלול אופציונלי', /אופציונלי/.test(setText));
t('ונאמר שהסריקה המקומית לא נוגעת בזה', /על המכשיר/.test(setText));
t('שדה המפתח הוא password', (await page.getAttribute('#g-key', 'type')) === 'password');
t('שני מתגי הסכמה נפרדים',
  setText.includes('שליחת טקסט מודבק') && setText.includes('שליחת צילומי מסמכים'));

const before = await page.evaluate(() => window.Settings.get(window.CONFIG.K.geminiConsentImage));
await page.click('.sect:has-text("פרסינג") .switch >> nth=1');
await page.waitForSelector('.sheet-actions');
const dialog = await page.textContent('.sheet');
t('הסכמת צילום דורשת אישור מפורש', /יישלח/.test(dialog), dialog.slice(0, 80));
await page.click('.sheet-actions .btn.ghost');
await page.waitForTimeout(300);
const after = await page.evaluate(() => window.Settings.get(window.CONFIG.K.geminiConsentImage));
t('ביטול לא מדליק את ההסכמה', after === before && !after, String(after));

console.log('\n— פענוח לפי דרישה במסך המסמך —');
/* צילום 1x1 אמיתי, כדי שהמסלול יעבור נרמול כמו קובץ רגיל */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

await page.evaluate(async () => {
  const U = window.U;
  await window.Settings.set(window.CONFIG.K.geminiKey, '');
  await window.Settings.set(window.CONFIG.K.geminiConsentImage, false);
  await window.DB.saveEntity({ id: U.id(), type: 'person', name: 'ליאור', color: '#4B6B7A', avatar: 'ל' });
  await window.DB.saveEntity({ id: U.id(), type: 'vehicle', name: 'מאזדה 3', color: '#8B6F47', avatar: 'מ' });
});
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');

async function attach() {
  await page.click('.fab');
  await page.waitForSelector('.routes');
  const [ch] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('.route:has-text("בחירת קובץ")')
  ]);
  await ch.setFiles({ name: 'doc.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('#d-type', { timeout: 10000 });
}
await attach();
t('הכפתור מופיע כשיש קובץ', await page.isVisible('.scr > .btn.ghost.wide'));

await page.click('.scr > .btn.ghost.wide');
await page.waitForSelector('.sheet-actions');
const miss = await page.textContent('.sheet:has(.sheet-actions)');
t('בלי מפתח — מסביר מה חסר במקום כפתור מת', /מפתח Gemini/.test(miss), miss.slice(0, 70));
await page.click('.sheet-actions .btn');
await page.waitForSelector('.sect');
t('ולוקח להגדרות', (await page.evaluate(() => location.hash)) === '#/settings');

await page.evaluate(async () => {
  await window.Settings.set(window.CONFIG.K.geminiKey, 'FAKE');
  await window.Settings.set(window.CONFIG.K.geminiConsentImage, true);
});
plan = { '*': { text: '{"typeKey":"vehicle_insurance","fields":{"policyNumber":"PL2291043","insurer":"הראל"},"expiryDate":"2027-03-20"}' } };
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await attach();
/* ברירת המחדל של השיוך היא הישות הראשונה — אדם — וביטוח רכב אינו שייך לה */
t('סוג שאינו מתאים לישות אינו נבלע בשקט',
  (await page.textContent('.scr')).includes('אינו מתאים'),
  (await page.textContent('.scr')).slice(0, 110));

const vehId = await page.evaluate(() => {
  const opts = [...document.querySelectorAll('#d-entity option')];
  return (opts.find(o => o.textContent === 'מאזדה 3') || {}).value;
});
await page.selectOption('#d-entity', vehId);
await page.click('.scr > .btn.ghost.wide');
await page.waitForFunction(() => document.querySelector('#f-policyNumber')?.value === 'PL2291043',
  null, { timeout: 15000 });
t('אחרי שינוי השיוך הפענוח ממלא', (await page.inputValue('#f-policyNumber')) === 'PL2291043');
t('וגם התפוגה', (await page.inputValue('#d-expiry')) === '2027-03-20',
  await page.inputValue('#d-expiry'));

/* עכשיו התרחיש שהתלוננת עליו: הפרסינג לא זיהה כלום, והמשתמש רוצה לנסות שוב */
plan = { '*': { text: '{"typeKey":"generic","fields":{}}' } };
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await attach();
t('פענוח שלא מצא כלום משאיר טופס ריק', (await page.inputValue('#f-title')) === '');
plan = { '*': { text: '{"typeKey":"generic","fields":{"title":"חוזה שכירות","issuer":"עורך דין"}}' } };
await page.click('.scr > .btn.ghost.wide');
await page.waitForFunction(() => document.querySelector('#f-title')?.value === 'חוזה שכירות',
  null, { timeout: 15000 });
t('לחיצה על הכפתור מפענחת שוב וממלאת', (await page.inputValue('#f-title')) === 'חוזה שכירות');
t('גם שדה שני', (await page.inputValue('#f-issuer')) === 'עורך דין');

/* מה שהמשתמש כבר הקליד לא נמחק לטובת ניחוש של מודל */
await page.fill('#f-issuer', 'הוקלד ידנית');
plan = { '*': { text: '{"typeKey":"generic","fields":{"issuer":"מהמודל","reference":"REF-9"}}' } };
await page.click('.scr > .btn.ghost.wide');
await page.waitForFunction(() => document.querySelector('#f-reference')?.value === 'REF-9',
  null, { timeout: 15000 });
t('שדה שהוקלד ידנית לא נדרס', (await page.inputValue('#f-issuer')) === 'הוקלד ידנית',
  await page.inputValue('#f-issuer'));
t('ושדה ריק כן מתמלא', (await page.inputValue('#f-reference')) === 'REF-9');

await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await page.click('.fab');
await page.waitForSelector('.routes');
await page.click('.route:has-text("הזנה ידנית")');
await page.waitForSelector('#d-type');
t('בהזנה ידנית בלי קובץ אין כפתור פענוח',
  (await page.locator('.scr > .btn.ghost.wide').count()) === 0);

/* ---------- מה שנשלח קטן ממה שנשמר — DEC-44 ----------
   ההעלאה היא רוב ההמתנה במכשיר סלולרי, וזה מה שמקצר אותה. */
console.log('\n— מה שנשלח בפועל —');
plan = {};
const heavy = await page.evaluate(async () => {
  /* צילום סינתטי רועש בגודל אמיתי של מצלמה — JPEG לא מכווץ אותו לאפס */
  const c = document.createElement('canvas');
  c.width = 2400; c.height = 1800;
  const x = c.getContext('2d');
  const img = x.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (i * 37) % 251;
    img.data[i] = v; img.data[i + 1] = (v * 3) % 253;
    img.data[i + 2] = (v * 7) % 249; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  const small = await window.Files.forParse(blob, 'image/jpeg');
  const bmp = await createImageBitmap(small.blob);
  window.__heavy = blob;
  return { orig: blob.size, size: small.blob.size, w: bmp.width, h: bmp.height,
           mime: small.mime };
});
t('הצלע יורדת לתקרה שבקונפיג', Math.max(heavy.w, heavy.h) === 1600,
  heavy.w + 'x' + heavy.h);
t('והמשקל יורד לפחות בחצי', heavy.size < heavy.orig / 2,
  heavy.orig + ' → ' + heavy.size);

sent = [];
await page.evaluate(() => window.Gemini.parse({ blob: window.__heavy, mime: 'image/jpeg' }));
const bodyLen = sent[sent.length - 1] || 0;
t('הבקשה שיצאה נושאת את המוקטן ולא את המקור',
  bodyLen < heavy.orig, bodyLen + ' מול ' + Math.round(heavy.orig * 4 / 3));

const cap = await page.evaluate(async () => {
  const big = new Blob([new Uint8Array(200)], { type: 'application/pdf' });
  Object.defineProperty(big, 'size', { value: 40 * 1024 * 1024 });
  return window.Gemini.parse({ blob: big, mime: 'application/pdf' })
    .then(() => 'עבר', e => e.message);
});
t('קובץ גדול מדי נעצר לפני השליחה ולא אחרי דקה', /גדול מדי/.test(cap), cap);

/* ---------- דלג — DEC-43 ----------
   הפרסינג הוא מסך שחוסם, ולפעמים המשתמש כבר יודע שאין בו טעם. */
console.log('\n— דלג —');

/* ביטול לפני שיצאה בקשה: הסיגנל כבר קטוע, ולכן שום דבר לא נשלח. */
hits = [];
const preAbort = await page.evaluate(() => {
  const ac = new AbortController();
  ac.abort();
  return window.Gemini.parse({ text: 'פוליסה' }, null, ac.signal)
    .then(() => ({ msg: 'עבר' }), e => ({ msg: e.message, canceled: !!e.canceled }));
});
t('דילוג לפני השליחה נעצר', /דולג/.test(preAbort.msg), preAbort.msg);
t('ומסומן כביטול ולא ככשל', preAbort.canceled === true);
t('ואפס בקשות יצאו', hits.filter(u => u.includes(':generateContent')).length === 0);

/* ביטול באמצע: אותו AbortError של הטיימאאוט, ושתי הודעות שונות. */
plan = { '*': { hang: true } };
const midAbort = await page.evaluate(() => {
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 150);
  return window.Gemini.parse({ text: 'פוליסה' }, null, ac.signal)
    .then(() => ({ msg: 'עבר' }), e => ({ msg: e.message, canceled: !!e.canceled }));
});
t('דילוג באמצע בקשה תלויה נעצר', /דולג/.test(midAbort.msg), midAbort.msg);
t('ואינו מתחזה לטיימאאוט', midAbort.canceled === true && !/זמן רב/.test(midAbort.msg));

/* ומכאן דרך המסך, על בקשה שלעולם אינה עונה */
await page.evaluate(async () => {
  await window.Settings.set(window.CONFIG.K.geminiKey, 'FAKE');
  await window.Settings.set(window.CONFIG.K.geminiConsentImage, true);
});
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await page.click('.fab');
await page.waitForSelector('.routes');
const [ch2] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('.route:has-text("בחירת קובץ")')
]);
await ch2.setFiles({ name: 'doc.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('.sheet:has-text("קריאת המסמך")');
const waitTxt = await page.textContent('.sheet:has-text("קריאת המסמך")');
t('גיליון ההמתנה אומר לאן הקובץ הולך', /נשלח לגוגל/.test(waitTxt));
t('ויש בו דלג', /דלג/.test(waitTxt), waitTxt.slice(0, 80));
t('שאומר מה יקרה אחריו', /מסך המסמך/.test(waitTxt));
t('והטופס עוד לא נפתח', (await page.locator('#d-type').count()) === 0);

await page.click('.sheet:has-text("קריאת המסמך") .btn:has-text("דלג")');
await page.waitForSelector('#d-type', { timeout: 3000 });
t('דלג פותח את מסך המסמך מיד', await page.isVisible('#d-type'));
await page.waitForTimeout(700);
t('הגיליון נסגר', (await page.locator('.sheet:has-text("קריאת המסמך")').count()) === 0);
t('ושום שדה לא מולא', (await page.inputValue('#f-policyNumber').catch(() => '')) === '');
const skipScreen = await page.textContent('.scr');
t('הקובץ עצמו נשאר מצורף', skipScreen.includes('doc.png'));

/* סגירת הגיליון היא דילוג — אחרת הצינור ממשיך מאחורי מסך שכבר נעלם */
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await page.click('.fab');
await page.waitForSelector('.routes');
const [ch3] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('.route:has-text("בחירת קובץ")')
]);
await ch3.setFiles({ name: 'doc.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('.sheet:has-text("קריאת המסמך")');
await page.keyboard.press('Escape');
await page.waitForSelector('#d-type', { timeout: 3000 });
t('Escape על הגיליון מתנהג כמו דלג', await page.isVisible('#d-type'));

/* דילוג וכישלון אינם אותו מסך: כישלון ממשיך לטופס עם הודעה שאומרת
   מה קרה, ודילוג ממשיך לטופס נקי — בלי "הפרסינג נכשל" שלא נכשל. */
plan = { '*': { status: 500 } };
await page.goto(BASE + '#/entities');
await page.waitForSelector('.nav');
await page.click('.fab');
await page.waitForSelector('.routes');
const [ch4] = await Promise.all([
  page.waitForEvent('filechooser'),
  page.click('.route:has-text("בחירת קובץ")')
]);
await ch4.setFiles({ name: 'doc.png', mimeType: 'image/png', buffer: png });
await page.waitForSelector('#d-type', { timeout: 15000 });
await page.waitForTimeout(300);
const failTxt = await page.textContent('.scr');
t('פרסינג שנכשל אומר את זה ולא נראה כמו דילוג', /הפרסינג נכשל/.test(failTxt),
  failTxt.slice(0, 90));
t('והדילוג אינו מדווח ככישלון', !/הפרסינג נכשל/.test(skipScreen), skipScreen.slice(0, 90));

t('אפס שגיאות', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
