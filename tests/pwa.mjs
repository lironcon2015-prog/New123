/* בדיקות שלב 6 — גרסה, מניפסט, Service Worker, אופליין אמיתי, וצופה ה-PDF. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
const ROOT = process.env.ROOT || '/home/user/New123';
const FIX = process.env.FIXTURES || '.';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };
const read = f => readFileSync(ROOT + '/' + f, 'utf8');

console.log('\n— עקביות הגרסה —');
/* הבדיקה שנאביגו אמרה שאם עושים רק דבר אחד — עושים אותה */
const vJson = JSON.parse(read('version.json')).version;
const vSw = (read('sw.js').match(/CACHE_VERSION = '([^']+)'/) || [])[1];
const vHtml = (read('index.html').match(/_BUNDLE_VERSION = '([^']+)'/) || [])[1];
t('version.json קיים ותקין', /^\d+\.\d+\.\d+$/.test(vJson || ''), vJson);
t('sw.js תואם', vSw === vJson, vSw + ' vs ' + vJson);
t('index.html תואם', vHtml === vJson, vHtml + ' vs ' + vJson);
t('הגרסה אינה מקודדת רביעית ב-config.js',
  /window\._BUNDLE_VERSION/.test(read('js/config.js')));

console.log('\n— מניפסט —');
const mf = JSON.parse(read('manifest.json'));
t('שם, שפה וכיוון', mf.name === 'התיק המשפחתי' && mf.lang === 'he' && mf.dir === 'rtl');
t('standalone עם scope יחסי', mf.display === 'standalone' && mf.scope === './');
t('שלושה אייקונים כולל maskable',
  mf.icons.length === 3 && mf.icons.some(i => i.purpose === 'maskable'));

console.log('\n— רשימת ה-precache —');
const sw = read('sw.js');
const core = [...sw.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
t('המעטפת כולה בפנים', ['index.html', 'style.css', 'js/app.js', 'js/sync.js'].every(f => core.includes(f)));
t('כל קובץ ברשימה קיים בפועל', core.every(f => {
  try { readFileSync(ROOT + '/' + f); return true; } catch { return f === ''; }
}), core.filter(f => { try { readFileSync(ROOT + '/' + f); return false; } catch { return f !== ''; } }).join(','));

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

console.log('\n— Service Worker —');
await page.goto(BASE);
await page.waitForSelector('.scr-title');
await page.waitForTimeout(600);
const controlled = await page.evaluate(() =>
  navigator.serviceWorker.ready.then(() => new Promise(res => {
    if (navigator.serviceWorker.controller) return res(true);
    navigator.serviceWorker.addEventListener('controllerchange', () => res(true));
    setTimeout(() => res(!!navigator.serviceWorker.controller), 8000);
  })));
t('נרשם ותפס שליטה', controlled === true);

const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const c = await caches.open(keys[0]);
  const all = await c.keys();
  return { name: keys[0], count: all.length, has: all.map(r => new URL(r.url).pathname) };
});
t('שם הקאש נושא את הגרסה', cached.name.includes(vJson), cached.name);
t('הליבה נשמרה', cached.count >= 30, String(cached.count));
t('הכתב בפנים', cached.has.some(p => p.includes('assistant-hebrew')));
t('worker של pdf.js בפנים', cached.has.some(p => p.includes('pdf.worker')));
/* נבדק מול הקאש בפועל ולא מול המקור — הרשימה נבנית שם בתבנית */
t('14 גופני תחליף של pdf.js נשמרו — הם נטענים עצלה ו-runtime לא תופס אותם',
  cached.has.filter(p => p.includes('standard_fonts')).length === 14,
  String(cached.has.filter(p => p.includes('standard_fonts')).length));
t('Tesseract בכוונה בחוץ — 6.7MB שרובם לא ייגעו בהם',
  !cached.has.some(p => p.includes('tesseract')));
t('cmaps בכוונה בחוץ', !cached.has.some(p => p.includes('cmaps')));

console.log('\n— אופליין אמיתי —');
await ctx.setOffline(true);
await page.goto(BASE);
const offlineOk = await page.waitForSelector('.scr-title', { timeout: 8000 }).then(() => true, () => false);
t('האפליקציה עולה בלי רשת', offlineOk === true);
t('והכותרת נכונה', offlineOk && (await page.textContent('.scr-title')) === 'התיק המשפחתי');
const offFont = await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('16px Assistant')));
t('והכתב נטען מהקאש', offFont === true);
await ctx.setOffline(false);

console.log('\n— צופה ה-PDF, עדיין אופליין —');
await page.goto(BASE);
await page.waitForSelector('.nav');
const pdfB64 = readFileSync(FIX + '/policy.pdf').toString('base64');
await ctx.setOffline(true);
const render = await page.evaluate(async b64 => {
  const bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const blob = new Blob([a], { type: 'application/pdf' });
  const box = document.createElement('div');
  box.style.width = '360px';
  document.body.appendChild(box);
  await window.UI.renderPdf(blob, box);
  const c = box.querySelector('canvas');
  if (!c) return { ok: false, why: box.textContent.slice(0, 80) };
  const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i] < 128) ink++;
  return { ok: true, w: c.width, h: c.height, ink, dir: c.getContext('2d').direction };
}, pdfB64);
t('PDF מרונדר ל-canvas בלי רשת', render.ok === true, render.why);
t('הקנבס בגודל סביר', render.ok && render.w > 300 && render.h > 150, JSON.stringify(render));
t('ויש עליו דיו — הטקסט צויר', render.ok && render.ink > 200, String(render.ink));
t('ctx.direction הוא ltr — הבאג ששבר טקסט באפליקציית RTL',
  render.dir === 'ltr', render.dir);
await ctx.setOffline(false);

t('השורה עצמה קיימת בקוד, לא רק בזמן ריצה',
  /ctx\.direction = 'ltr'/.test(read('js/ui.js')));
t('ואין יותר iframe לצפייה ב-PDF', !/viewer-pdf|<iframe/.test(read('js/ui.js')));

console.log('\n— blob: URL מבוטל בסגירה —');
const leak = await page.evaluate(async () => {
  const created = [];
  const revoked = [];
  const oc = URL.createObjectURL, or = URL.revokeObjectURL;
  URL.createObjectURL = function (b) { const u = oc.call(URL, b); created.push(u); return u; };
  URL.revokeObjectURL = function (u) { revoked.push(u); return or.call(URL, u); };
  const c = document.createElement('canvas'); c.width = c.height = 20;
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const s = window.UI.viewer({ data: blob, mime: 'image/png' }, 'x.png');
  const mid = created.length;
  s.close();
  await new Promise(r => setTimeout(r, 300));
  URL.createObjectURL = oc; URL.revokeObjectURL = or;
  return { created: mid, revoked: revoked.length };
});
t('נוצר blob: URL לתמונה', leak.created >= 1, JSON.stringify(leak));
t('וכולם בוטלו בסגירה', leak.revoked >= leak.created, JSON.stringify(leak));

console.log('\n— באנר עדכון —');
const banner = await page.evaluate(() => {
  const bars = () => document.querySelectorAll('.update-bar').length;
  window.__u = window.__u; // no-op
  return bars();
});
t('אין באנר כשאין עדכון', banner === 0, String(banner));

console.log('\n— בולם הרענון —');
/* הלולאה שדווחה: version.json הכריז 0.10.1 ו-index.html נשאר 0.10.0, ולכן כל
   בדיקה רשמה SW בכתובת אחרת, skipWaiting החליף controller, זה רענן, ואחרי
   הרענון הפער עדיין היה שם. הבדיקה מריצה בדיוק את התרחיש. */
const loop = await page.evaluate(() => {
  const U = window.App && window.App.Updater;
  if (!U) return { missing: true };
  sessionStorage.removeItem('fv-reload');
  U.remote = '9.9.9';                       // השרת מכריז גרסה שאינה כאן
  const first = U.shouldReload();           // רענון אחד — לגיטימי
  const second = U.shouldReload();          // הפער לא נסגר: לא מרעננים שוב
  U.remote = '9.9.10';                      // גרסה חדשה באמת
  const third = U.shouldReload();
  sessionStorage.removeItem('fv-reload');
  return { first, second, third, reg: typeof U.registered };
});
t('הבולם קיים ונגיש', !loop.missing);
t('רענון ראשון מותר', loop.first === true, String(loop.first));
t('רענון שני על אותו פער נחסם', loop.second === false, String(loop.second));
t('אבל גרסה חדשה מרעננת שוב', loop.third === true, String(loop.third));
t('ורישום ה-SW מוגבל לגרסה', loop.reg === 'string', String(loop.reg));

const appSrc = read('js/app.js');
t('controllerchange עובר דרך הבולם ולא ישירות ל-reload',
  /controllerchange[\s\S]{0,220}Updater\.reload\(\)/.test(appSrc));
t('כשהבולם חוסם — מוצג פס עדכון במקום',
  /shouldReload\(\)\)\s*\{\s*Updater\.offer\(\)/.test(appSrc));

t('אפס שגיאות', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
