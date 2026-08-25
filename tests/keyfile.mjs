/* keyfile.mjs — קובץ המפתחות (SPEC §12.8, DEC-42).
   הבדיקה החשובה כאן היא האחרונה: **שני מכשירים אמיתיים** — שני contexts
   ושני IndexedDB — שהשני מהם מתחיל ריק, מקבל את הקובץ שהראשון ייצר,
   ומגיע לגשר מחובר ולכספת מסונכרנת בלי שהוקלד בו תו אחד. */
import { chromium } from 'playwright';
import { writeFileSync, unlinkSync } from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
const SP = process.env.FIXTURES || '.';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const URL_EXEC = 'https://script.google.com/macros/s/FAKE/exec';
const SECRET = 'סוד-ארוך-מספיק-לבדיקה-הזאת';
const GKEY = 'AIzaFAKEKEY0123456789';

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

/* ---------- גשר מזויף, משותף לשני המכשירים ---------- */
const store = { db: null, files: {} };
async function fakeBridge(ctx) {
  await ctx.route('https://script.google.com/**', async route => {
    const body = JSON.parse(route.request().postData() || '{}');
    const reply = o => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (body.token !== SECRET) return reply({ ok: false, error: 'סוד שגוי' });
    switch (body.action) {
      case 'ping':  return reply({ ok: true, result: { name: 'DocVault' } });
      case 'getDb': return reply({ ok: true, result: { db: store.db } });
      case 'putDb': store.db = body.db; return reply({ ok: true, result: { id: 'db-1' } });
      default:      return reply({ ok: false, error: 'פעולה לא מוכרת: ' + body.action });
    }
  });
}

const errs = [];
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 920 }, locale: 'he-IL' });
  await fakeBridge(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  await page.goto(BASE);
  await page.waitForSelector('.scr-title');
  return page;
}

const a = await device('א');

/* ---------- הטבלה היא המקור ---------- */
console.log('\n— הטבלה קובעת, לא הקוד —');
const table = await a.evaluate(() => window.CONFIG.KEYFILE.FIELDS.map(f => f.key));
t('שש שורות בטבלה', table.length === 6, table.join(','));
t('והשדות שהמשתמש אינו יכול לנחש כולם בה',
  ['bridgeUrl', 'bridgeToken', 'driveClientId', 'geminiKey'].every(k => table.includes(k)),
  table.join(','));

const kfSrc = await a.evaluate(() => fetch('/js/keyfile.js').then(r => r.text()));
t('keyfile.js אינו מזכיר שם מפתח כלשהו בקוד', !/bridgeToken|geminiKey|driveClientId/.test(kfSrc));

/* ---------- אין מה לייצא מכספת ריקה ---------- */
console.log('\n— מה נחשב "יש מה לשלוח" —');
t('אפליקציה ריקה — אין מה לשלוח', (await a.evaluate(() => window.KeyFile.has())) === false);

await a.evaluate(async ([u, s, g]) => {
  const S = window.Settings, C = window.CONFIG;
  await S.set(C.K.bridgeUrl, u);
  await S.set(C.K.bridgeToken, s);
  await S.set(C.K.geminiKey, g);
  await S.set(C.K.geminiModels, ['gemini-3-pro', 'gemini-3-flash']);
}, [URL_EXEC, SECRET, GKEY]);
t('אחרי שהוגדר גשר — יש', (await a.evaluate(() => window.KeyFile.has())) === true);

/* ---------- מה נוסע ומה לא ---------- */
console.log('\n— מה נוסע בקובץ —');
await a.evaluate(async () => {
  const S = window.Settings, C = window.CONFIG;
  await window.Vault.setPin('1234');
  await S.set(C.K.geminiConsentImage, true);
  await S.set(C.K.driveFolderId, 'folder-של-החשבון-הזה');
  await S.set(C.K.privacyMode, true);
});
const built = await a.evaluate(() => window.KeyFile.build());
t('מעטפת מזוהה: app · kind · format',
  built.app === 'family-vault' && built.kind === 'keys' && built.format === 1);
t('הגשר בפנים', built.keys.bridgeUrl === URL_EXEC && built.keys.bridgeToken === SECRET);
t('מפתח Gemini והמפל בפנים',
  built.keys.geminiKey === GKEY && built.keys.geminiModels.length === 2);
t('ה-PIN אינו נוסע', built.keys.pinHash === undefined);
t('ההסכמה לשליחת צילומים אינה נוסעת', built.keys.geminiConsentImage === undefined);
t('מצביע התיקייה אינו נוסע', built.keys.driveFolderId === undefined);
t('העדפות מסך אינן נוסעות', built.keys.privacyMode === undefined);
t('ואין בקובץ שום מסמך', built.docs === undefined && built.entities === undefined);

/* ---------- שם הקובץ ---------- */
const fname = await a.evaluate(() => window.KeyFile.name(new Date(2026, 7, 25)));
t('שם הקובץ נושא תאריך וסיומת json', fname === 'מפתחות-התיק-המשפחתי-2026-08-25.json', fname);

/* ---------- מה מוצג לפני האישור ---------- */
console.log('\n— מיסוך לפני אישור —');
const rows = await a.evaluate(() => window.KeyFile.rows(window.KeyFile.build().keys));
const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
t('הסוד ממוסך', /^•+ /.test(byKey.bridgeToken.text) && !byKey.bridgeToken.text.includes(SECRET.slice(0, 6)),
  byKey.bridgeToken.text);
t('ומפתח Gemini ממוסך', !byKey.geminiKey.text.includes('AIza'), byKey.geminiKey.text);
t('הכתובת מוצגת במלואה — אין בה סוד', byKey.bridgeUrl.text === URL_EXEC);
t('שיטת הגיבוי מוצגת בשם ולא במפתח', byKey.backupMode.text === 'גשר Apps Script');
t('התוויות מגיעות מהטבלה', byKey.bridgeToken.label === 'סוד הגשר');

/* ---------- ולידציה של הקובץ הנכנס ---------- */
console.log('\n— קובץ שאינו הקובץ —');
const bad = txt => a.evaluate(s => {
  try { window.KeyFile.parse(s); return 'עבר'; } catch (e) { return e.message; }
}, txt);

t('טקסט שאינו JSON', /אינו קובץ מפתחות/.test(await bad('שלום')), await bad('שלום'));
t('JSON של משהו אחר', /אינו קובץ מפתחות של התיק/.test(await bad('{"app":"other","kind":"keys"}')));
t('פורמט מגרסה חדשה יותר',
  /גרסה חדשה יותר/.test(await bad('{"app":"family-vault","kind":"keys","format":9,"keys":{}}')));
t('קובץ בלי מפתחות',
  /אין בקובץ אף מפתח/.test(await bad('{"app":"family-vault","kind":"keys","format":1,"keys":{}}')));

const poisoned = await a.evaluate(() => window.KeyFile.parse(JSON.stringify({
  app: 'family-vault', kind: 'keys', format: 1,
  keys: {
    bridgeUrl: 12345, bridgeToken: 'סוד-שהוא-מחרוזת-תקינה-לגמרי',
    backupMode: 'ftp', geminiModels: 'לא-מערך',
    pinHash: 'abc', geminiConsentImage: true, מפתח_זר: 'x'
  }
})));
t('ערך מטיפוס שגוי נזרק', poisoned.bridgeUrl === undefined);
t('ערך תקין באותו קובץ נשמר', poisoned.bridgeToken === 'סוד-שהוא-מחרוזת-תקינה-לגמרי');
t('ערך שאינו ברשימה נזרק', poisoned.backupMode === undefined);
t('רשימה שאינה מערך נזרקת', poisoned.geminiModels === undefined);
t('מפתח שאינו בטבלה אינו נכנס',
  poisoned.pinHash === undefined && poisoned.geminiConsentImage === undefined &&
  poisoned['מפתח_זר'] === undefined);

/* ---------- ייבוא ממזג ולא דורס ---------- */
console.log('\n— מיזוג ולא החלפה —');
const merged = await a.evaluate(async () => {
  const S = window.Settings, C = window.CONFIG;
  const n = await window.KeyFile.apply({ geminiKey: 'AIzaחדש' });
  return { n, gem: S.get(C.K.geminiKey), url: S.get(C.K.bridgeUrl) };
});
t('קובץ שנושא מפתח אחד כותב אחד', merged.n === 1);
t('והמפתח הוחלף', merged.gem === 'AIzaחדש');
t('והגשר שלא היה בקובץ נשאר', merged.url === URL_EXEC);
await a.evaluate(g => window.Settings.set(window.CONFIG.K.geminiKey, g), GKEY);

/* ---------- מסך ההגדרות ---------- */
console.log('\n— מסך ההגדרות —');
await a.goto(BASE + '#/settings');
await a.waitForSelector('.scr-title');
const secTitles = await a.$$eval('.sect-h', els => els.map(e => e.textContent));
t('יש מסגרת למפתחות', secTitles.includes('מפתחות למכשיר נוסף'), secTitles.join(' | '));
const btns = await a.$$eval('.sect button', els => els.map(e => e.textContent));
t('כפתור שליחה מוצג כשיש מה לשלוח', btns.some(b => /שליחת המפתחות שלי/.test(b)));
t('וכפתור טעינה תמיד', btns.some(b => /טעינת קובץ מפתחות/.test(b)));

/* ---------- הקובץ עצמו ---------- */
const text = await a.evaluate(() => new Response(window.KeyFile.blob()).text());
const path = SP + '/keys.json';
writeFileSync(path, text);
t('הקובץ הוא JSON קריא', JSON.parse(text).kind === 'keys');
t('והסוד יושב בו בגלוי — זה מה שהאזהרה אומרת', text.includes(SECRET));

/* ---------- המכשיר השני ---------- */
console.log('\n— מכשיר שני, ריק, דרך המסך —');
const b = await device('ב');
await b.goto(BASE + '#/settings');
await b.waitForSelector('.scr-title');
t('מתחיל בלי חיבור', (await b.evaluate(() => window.App.transport().connected())) === false);
const bBtns = await b.$$eval('.sect button', els => els.map(e => e.textContent));
t('ואין לו מה לשלוח', !bBtns.some(x => /שליחת המפתחות שלי/.test(x)));

await b.setInputFiles('#kf-file', path);
await b.waitForSelector('.backdrop .sheet-actions .btn');
const sheetBody = await b.textContent('.backdrop .sheet-p');
t('הגיליון מונה מה בקובץ', /סוד הגשר/.test(sheetBody) && /מפתח Gemini/.test(sheetBody), sheetBody);
t('ואומר שההסכמות אינן נוסעות', /הסכמות/.test(sheetBody));
await b.click('.backdrop .sheet-actions .btn:not(.ghost)');
await b.waitForTimeout(1200);

t('אחרי הטעינה — מחובר, בלי שהוקלד דבר',
  (await b.evaluate(() => window.App.transport().connected())) === true);
const bKeys = await b.evaluate(() => {
  const S = window.Settings, C = window.CONFIG;
  return { url: S.get(C.K.bridgeUrl), tok: S.get(C.K.bridgeToken),
           gem: S.get(C.K.geminiKey), models: S.get(C.K.geminiModels),
           consent: S.get(C.K.geminiConsentImage), pin: S.get(C.K.pinHash) };
});
t('הגשר נכתב', bKeys.url === URL_EXEC && bKeys.tok === SECRET);
t('ומפתח Gemini', bKeys.gem === GKEY);
t('והמפל', (bKeys.models || []).length === 2);
t('ההסכמה נשארה כבויה', bKeys.consent === false);
t('וה-PIN לא נולד יש מאין', !bKeys.pin);
t('הסנכרון הראשון רץ מעצמו', store.db !== null && store.db.version === 1);

await b.reload();
await b.waitForSelector('.scr-title');
t('והחיבור שורד רענון',
  (await b.evaluate(() => window.App.transport().connected())) === true);

try { unlinkSync(path); } catch { /* לא נורא */ }

t('אפס שגיאות', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
