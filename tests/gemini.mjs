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
  // '*' חל על כל מודל — הבדיקות לא צריכות לדעת מי ניצח במפל
  const rule = plan[model] || plan['*'];
  if (rule && rule.hang) return new Promise(() => {});   // לעולם לא עונה
  if (rule && rule.status) return route.fulfill({ status: rule.status, body: '{}' });
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

hits = [];
plan = { '*': { status: 400 } };
const bad = await page.evaluate(() => window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
const used3 = hits.filter(u => u.includes(':generateContent'));
t('מפתח פסול עוצר את המפל אחרי מודל אחד', used3.length === 1, String(used3.length));
t('וההודעה מפנה להגדרות', /המפתח נדחה/.test(bad), bad);

console.log('\n— חילוץ JSON —');
hits = [];
plan = { '*': { text: '```json\n{"typeKey":"generic","fields":{"title":"בדיקה"}}\n```' } };
const f1 = await page.evaluate(() => window.Gemini.parse({ text: 'x' }));
t('גדרות קוד מוסרות', f1.typeKey === 'generic', JSON.stringify(f1));

plan = { '*': { text: 'הנה התשובה: {"typeKey":"generic","fields":{}} תודה' } };
const f2 = await page.evaluate(() => window.Gemini.parse({ text: 'x' }));
t('פטפוט סביב ה-JSON מסונן', f2.typeKey === 'generic');

plan = { '*': { text: 'אין לי מושג' } };
const f3 = await page.evaluate(() => window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message));
t('תשובה שאינה JSON נכשלת בבירור', /JSON/.test(f3), f3);

console.log('\n— טיימאאוט —');
plan = { '*': { hang: true } };
const t0 = Date.now();
const timedOut = await page.evaluate(async () => {
  window.CONFIG.GEMINI_TIMEOUT_MS = 900;
  return window.Gemini.parse({ text: 'x' }).then(() => 'עבר', e => e.message);
});
t('בקשה תקועה נקטעת ולא נתלית', /זמן רב מדי/.test(timedOut), timedOut);
t('והקטיעה מהירה', Date.now() - t0 < 6000, String(Date.now() - t0));
await page.evaluate(() => { window.CONFIG.GEMINI_TIMEOUT_MS = 45000; });

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

t('אפס שגיאות', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
