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
t('flash-lite נבחר לפני flash ולפני pro', used[0].includes('flash-lite'), used[0]);
t('התשובה נותחה', first.typeKey === 'vehicle_insurance', JSON.stringify(first).slice(0, 80));

const remembered = await page.evaluate(() => window.Settings.get(window.CONFIG.K.geminiLastModel));
t('המודל שהצליח נזכר', remembered === 'gemini-x-flash-lite', remembered);

hits = [];
plan = { 'gemini-x-flash-lite': { status: 429 } };   // רק הראשון נופל
await page.evaluate(() => window.Gemini.parse({ text: 'פוליסה' }));
const used2 = hits.filter(u => u.includes(':generateContent'));
t('429 מפנה מקום למודל הבא', used2.length === 2 && used2[1].includes('flash'), used2.join(' → '));

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

t('אפס שגיאות', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
