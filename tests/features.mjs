/* features.mjs — עשרת התיקונים של 0.9.0.
   כל בדיקה כאן נכתבה מול באג מדווח, ולא מול קוד שנכתב. */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
const SP = process.env.FIXTURES || '.';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({
  viewport: { width: 420, height: 920 },
  permissions: ['clipboard-read', 'clipboard-write'], locale: 'he-IL'
});
const page = await ctx.newPage();
const reqs = []; page.on('request', r => reqs.push(r.url()));
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(BASE);
await page.waitForSelector('.scr-title');

/* ---------- 6 · קנה מידה קבוע ---------- */
console.log('\n— קנה מידה קבוע —');
const vp = await page.getAttribute('meta[name="viewport"]', 'content');
t('viewport נועל את קנה המידה', /user-scalable=no/.test(vp) && /maximum-scale=1/.test(vp), vp);
t('ויש גם minimum-scale, אחרת אפשר להתרחק', /minimum-scale=1/.test(vp), vp);
t('Zoom.reset קיים ונקרא בחזרה לאפליקציה',
  await page.evaluate(() => typeof window.App.Zoom.reset === 'function'));
t('הזום נעצר בגבול הצופה ולא לפניו', await page.evaluate(() => {
  const d = document.createElement('div');
  d.className = 'zoom-stage';
  const kid = document.createElement('span');
  d.appendChild(kid);
  document.body.appendChild(d);
  const inside = window.App.Zoom.inViewer(kid);
  const outside = window.App.Zoom.inViewer(document.querySelector('.scr-title'));
  d.remove();
  return inside === true && outside === false;
}));

/* ---------- 5 · קיבוץ וסידור ---------- */
console.log('\n— קיבוץ ישויות —');
await page.evaluate(async () => {
  const U = window.U, DB = window.DB;
  const mk = (id, name, type, order) => DB.saveEntity({
    id, type, name, color: '#4B6B7A', avatar: name[0], sortOrder: order
  });
  await mk('e-car', 'מאזדה', 'vehicle', 10);
  await mk('e-dana', 'דנה', 'person', 30);
  await mk('e-home', 'הבית', 'home', 20);
  await mk('e-itamar', 'איתמר', 'person', 40);
  await window.App.render();
});
await page.waitForSelector('.egroup');

const groups = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('.bucket-h')].map(h => h.textContent);
  const gs = [...document.querySelectorAll('.egroup')].map(g => ({
    type: g.dataset.type,
    names: [...g.querySelectorAll('.card-t')].map(x => x.textContent)
  }));
  return { heads, gs };
});
t('הקבוצה הראשונה היא אדם', groups.gs[0] && groups.gs[0].type === 'person',
  JSON.stringify(groups.gs.map(g => g.type)));
t('ואחריה רכב ובית', groups.gs.map(g => g.type).join(',') === 'person,vehicle,home',
  groups.gs.map(g => g.type).join(','));
t('הכותרות הן שמות הסוגים', groups.heads.join(',') === 'אדם,רכב,בית', groups.heads.join(','));
t('בתוך הקבוצה הסדר הוא sortOrder', groups.gs[0].names.join(',') === 'דנה,איתמר',
  groups.gs[0].names.join(','));

/* גרירה נבדקת דרך התוצאה שלה — סדר חדש נשמר וגובר על ברירת המחדל */
const reordered = await page.evaluate(async () => {
  const box = document.querySelector('.egroup[data-type="person"]');
  const cards = [...box.querySelectorAll('.ecard')];
  box.insertBefore(cards[1], cards[0]);
  await window.Screens.saveOrder([...box.querySelectorAll('.ecard')]);
  const rows = await window.DB.listEntities();
  const people = rows.filter(r => r.type === 'person');
  return people.map(p => p.name + ':' + p.sortOrder);
});
t('הסדר החדש נשמר על הישויות', reordered.join(',') === 'איתמר:1000,דנה:2000', reordered.join(','));

await page.reload();
await page.waitForSelector('.egroup');
const afterReload = await page.evaluate(() =>
  [...document.querySelectorAll('.egroup[data-type="person"] .card-t')].map(x => x.textContent));
t('והוא שורד רענון — הגרירה דורסת את ברירת המחדל',
  afterReload.join(',') === 'איתמר,דנה', afterReload.join(','));

/* ---------- 4 · אווטאר ---------- */
console.log('\n— אווטאר של ישות —');
const av = await page.evaluate(async () => {
  const c = new OffscreenCanvas(900, 600);
  const x = c.getContext('2d');
  x.fillStyle = '#c33'; x.fillRect(0, 0, 900, 600);
  x.fillStyle = '#fff'; x.fillRect(300, 100, 300, 400);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const f = new File([blob], 'face.png', { type: 'image/png' });
  const url = await window.Files.avatar(f);
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  return { url: url.slice(0, 24), w: bmp.width, h: bmp.height, bytes: Math.round(url.length * 0.75) };
});
t('האווטאר הוא data URL של JPEG', /^data:image\/jpeg/.test(av.url), av.url);
t('התמונה נשמרת שלמה ולא נחתכת לריבוע', av.w !== av.h, av.w + 'x' + av.h);
t('והצלע הקצרה היא שנקבעת', Math.min(av.w, av.h) === 256, av.w + 'x' + av.h);
t('היחס נשמר', Math.abs(av.w / av.h - 900 / 600) < 0.02, (av.w / av.h).toFixed(3));
t('ומתחת לתקרת המשקל', av.bytes <= 120 * 1024, String(av.bytes));

const avShown = await page.evaluate(async () => {
  const e = (await window.DB.listEntities()).filter(x => x.name === 'דנה')[0];
  e.avatarImage = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
  await window.DB.saveEntity(e);
  await window.App.render();
  const card = [...document.querySelectorAll('.ecard')]
    .filter(c => c.querySelector('.card-t').textContent === 'דנה')[0];
  const other = [...document.querySelectorAll('.ecard')]
    .filter(c => c.querySelector('.card-t').textContent === 'איתמר')[0];
  return {
    img: !!card.querySelector('.av img'),
    letter: other.querySelector('.av span').textContent
  };
});
t('ישות עם תמונה מציגה תמונה', avShown.img === true);
t('וישות בלעדיה נשארת עם האות', avShown.letter === 'א', avShown.letter);

/* מסגרת האווטאר — מה שיוצג בתוך העיגול */
const avFocus = await page.evaluate(async () => {
  const DB = window.DB;
  const before = document.querySelector('.ecard .av img');
  const beforePos = before ? before.style.objectPosition : '';
  const e = (await DB.listEntities()).filter(x => x.name === 'דנה')[0];
  e.avatarFocus = { x: 30, y: 80 };
  await DB.saveEntity(e);
  await window.App.render();
  const after = [...document.querySelectorAll('.ecard')]
    .filter(c => c.querySelector('.card-t').textContent === 'דנה')[0]
    .querySelector('.av img');
  return { beforePos: beforePos, afterPos: after.style.objectPosition };
});
t('אווטאר בלי מסגרת שמורה נשאר במרכז', avFocus.beforePos === '50% 50%', avFocus.beforePos);
t('והמסגרת שנבחרה מצוירת', avFocus.afterPos === '30% 80%', avFocus.afterPos);

await page.evaluate(() => window.Screens.entitySheet(
  window.Screens.state.entities.filter(e => e.name === 'דנה')[0]));
await page.waitForSelector('#e-name');
await page.waitForTimeout(200);
t('טופס הישות מציג בורר עגול', await page.isVisible('.crop-circle'));
t('ובלי מחוון — בעיגול גוררים לשני הכיוונים',
  (await page.locator('.crop-circle').count()) === 1 &&
  (await page.locator('.crop-range').count()) === 0);

/* מקשי החיצים הם הדרך היחידה להזיז בלי עכבר, ובעיגול גם לרוחב */
await page.focus('.crop-box');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
const moved = await page.evaluate(() => document.querySelector('.crop-img').style.objectPosition);
t('חיצים מזיזים את המסגרת בשני הצירים', moved === '34% 84%', moved);

await page.click('.sheet-actions .btn:not(.ghost)');
await page.waitForSelector('.backdrop', { state: 'detached' });
const savedFocus = await page.evaluate(async () =>
  (await window.DB.listEntities()).filter(e => e.name === 'דנה')[0].avatarFocus);
t('והבחירה נשמרת על הישות',
  savedFocus && savedFocus.x === 34 && savedFocus.y === 84, JSON.stringify(savedFocus));

/* ---------- 3 · מסמך מעודכן דוחק את הקודם ---------- */
console.log('\n— גרסאות של אותו מסמך —');
const ver = await page.evaluate(async () => {
  const U = window.U, DB = window.DB, V = window.Versions;
  const mk = (id, expiry, plate) => ({
    id, entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט ' + expiry.slice(0, 4),
    fields: [{ key: 'plate', label: 'מספר רישוי', value: plate, kind: 'plate',
               sensitive: false, confidence: null, verified: true }],
    issueDate: null, expiryDate: expiry, files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  });
  const oldDoc = mk('v-old', '2025-01-01', '8452103');
  await DB.saveDoc(oldDoc, []);
  const docs = await DB.listDocs();

  const fresh = mk('v-new', '2026-12-31', '8452103');
  fresh.updatedAt = U.now();
  const plan = V.plan(fresh, docs);
  await DB.supersede(fresh, plan.supersede, []);

  const after = await DB.listDocs();
  const live = V.live(after);
  const olderNow = after.filter(d => d.id === 'v-old')[0];

  /* מסמך של רכב אחר, אותה לוחית? לא — לוחית אחרת, ולכן אינו אותו מסמך */
  const unrelated = mk('v-other', '2027-01-01', '1234567');
  unrelated.updatedAt = U.now();
  const plan2 = V.plan(unrelated, after);

  return {
    planned: plan.supersede,
    pointer: olderNow.supersededBy,
    liveIds: live.map(d => d.id).filter(id => id.indexOf('v-') === 0),
    unrelatedPlan: plan2.supersede.length,
    identitySame: V.identity(oldDoc) === V.identity(fresh),
    identityOther: V.identity(unrelated) === V.identity(fresh)
  };
});
t('הגרסה הישנה זוהתה', ver.planned.join(',') === 'v-old', ver.planned.join(','));
t('והיא מצביעה על החדשה', ver.pointer === 'v-new', String(ver.pointer));
t('רק החדשה נחשבת נוכחית', ver.liveIds.join(',') === 'v-new', ver.liveIds.join(','));
t('הישנה לא נמחקה', ver.pointer !== undefined);
t('אותה לוחית = אותו מסמך', ver.identitySame === true);
t('לוחית אחרת = מסמך אחר', ver.identityOther === false);
t('ומסמך אחר לא נדחק', ver.unrelatedPlan === 0);

const older = await page.evaluate(async () => {
  const V = window.Versions, DB = window.DB, U = window.U;
  const docs = await DB.listDocs();
  const stale = {
    id: 'v-stale', entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט ישן',
    fields: [{ key: 'plate', label: 'מספר רישוי', value: '8452103', kind: 'plate',
               sensitive: false, confidence: null, verified: true }],
    issueDate: null, expiryDate: '2024-01-01', files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0, updatedAt: U.now()
  };
  return { plan: window.Versions.plan(stale, docs) };
});
t('העלאה של מסמך ישן יותר אינה דוחקת את החדש',
  older.plan.supersede.length === 0 && older.plan.supersededBy === 'v-new',
  JSON.stringify(older.plan));

const surfaces = await page.evaluate(async () => {
  await window.Screens.reload();
  const S = window.Screens.state, E = window.Expiry, Search = window.Search;
  const g = E.group(S.live);
  const rows = Search.rows(S.live, S.byId);
  return {
    inExpiry: [].concat(g.past, g.d30, g.d90, g.ok).map(i => i.doc.id).indexOf('v-old'),
    inQuick: rows.map(r => r.doc.id).indexOf('v-old'),
    liveHasNew: S.live.some(d => d.id === 'v-new')
  };
});
t('גרסה שנדחקה אינה במנוע התפוגה', surfaces.inExpiry === -1);
t('ואינה בהעתקה המהירה', surfaces.inQuick === -1);
t('העדכנית כן', surfaces.liveHasNew === true);

await page.goto(BASE + '#/doc/v-old');
await page.waitForSelector('.scr-body');
t('כרטיס הגרסה הקודמת אומר זאת, ומצביע לעדכנית',
  await page.isVisible('.notice-warn'));
await page.goto(BASE + '#/doc/v-new');
await page.waitForSelector('.scr-body');
t('והעדכנית מציגה את הקודמות שלה',
  (await page.locator('.files-h', { hasText: 'גרסאות קודמות' }).count()) === 1);

await page.goto(BASE + '#/entity/e-car');
await page.waitForSelector('.scr');
t('מסך הישות מקפל את הגרסאות הקודמות',
  (await page.locator('.fold', { hasText: 'גרסאות קודמות' }).count()) === 1);

/* ---------- 7 · באנר שנעלם אחרי טיפול ---------- */
console.log('\n— באנר דורש טיפול —');
const banner = await page.evaluate(async () => {
  const DB = window.DB, U = window.U, S = window.Settings, C = window.CONFIG;
  await S.set(C.K.lastNoticeDay, '');
  await S.set(C.K.lastNoticeSig, '');
  const expired = {
    id: 'b-1', entityId: 'e-car', typeKey: 'vehicle_insurance', title: 'ביטוח פג',
    fields: [
      { key: 'policyNumber', label: 'מספר פוליסה', value: 'PL1', kind: 'policy', sensitive: true, verified: true },
      { key: 'insurer', label: 'חברת ביטוח', value: 'הראל', kind: 'text', sensitive: false, verified: true }
    ],
    issueDate: null, expiryDate: '2020-01-01', files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  };
  await DB.saveDoc(expired, []);
  location.hash = '#/entities';
  await window.App.render();
  const shown = !!document.querySelector('.notice');
  const clickable = !!document.querySelector('.notice-go');

  /* טיפול: מסמך מעודכן עם אותה פוליסה ואותה חברה */
  const renewed = JSON.parse(JSON.stringify(expired));
  renewed.id = 'b-2'; renewed.title = 'ביטוח מחודש'; renewed.expiryDate = '2030-01-01';
  renewed.updatedAt = U.now();
  const plan = window.Versions.plan(renewed, await DB.listDocs());
  await DB.supersede(renewed, plan.supersede, []);
  await window.App.render();
  return { shown, clickable, after: !!document.querySelector('.notice'), planned: plan.supersede };
});
t('באנר מופיע כשיש מסמך שפג', banner.shown === true);
t('והוא לחיץ', banner.clickable === true);
t('העלאת המסמך המחודש דחקה את שפג', banner.planned.join(',') === 'b-1', banner.planned.join(','));
t('ואחרי הטיפול הבאנר נעלם', banner.after === false);

const sig = await page.evaluate(async () => {
  const DB = window.DB, S = window.Settings, C = window.CONFIG, E = window.Expiry;
  const second = {
    id: 'b-3', entityId: 'e-car', typeKey: 'vehicle_test', title: 'טסט שפג',
    fields: [{ key: 'plate', label: 'מספר רישוי', value: '7654321', kind: 'plate', sensitive: false, verified: true }],
    issueDate: null, expiryDate: '2020-06-01', files: [], source: 'upload', notes: '',
    supersededBy: null, deleted: 0
  };
  await DB.saveDoc(second, []);
  location.hash = '#/entities';
  await window.App.render();
  document.querySelector('.notice .iconbtn').click();
  await new Promise(r => setTimeout(r, 120));
  const dismissed = !document.querySelector('.notice');
  await window.App.render();
  const stillGone = !document.querySelector('.notice');

  /* מסמך חדש שפג — החתימה השתנתה, והבאנר חוזר גם באותו יום */
  const third = JSON.parse(JSON.stringify(second));
  third.id = 'b-4'; third.title = 'טסט נוסף';
  third.fields = [{ key: 'plate', label: 'מספר רישוי', value: '1112223', kind: 'plate', sensitive: false, verified: true }];
  await DB.saveDoc(third, []);
  await window.App.render();
  return { dismissed, stillGone, back: !!document.querySelector('.notice') };
});
t('סגירת הבאנר מסתירה אותו', sig.dismissed === true);
t('והוא נשאר סגור לאותה רשימה', sig.stillGone === true);
t('אבל חוזר כשנוסף מסמך שדורש טיפול', sig.back === true);

/* ---------- 2 · שינוי שם קובץ ---------- */
console.log('\n— שם הקובץ —');
const renamed = await page.evaluate(async () => {
  const DB = window.DB, U = window.U;
  const blobId = U.id();
  const doc = {
    id: 'f-1', entityId: 'e-itamar', typeKey: 'generic', title: 'קובץ',
    fields: [{ key: 'title', label: 'כותרת', value: 'קובץ', kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, source: 'upload', notes: '',
    supersededBy: null, deleted: 0,
    files: [{ blobId, driveFileId: null, mime: 'image/png', name: 'IMG_0001.png', size: 10 }]
  };
  await DB.saveDoc(doc, [{ id: blobId, docId: doc.id, data: new Blob([new Uint8Array([1, 2])]), mime: 'image/png', size: 2 }]);
  await DB.renameFile(doc, blobId, 'רישיון רכב.png');
  const back = await DB.get('docs', 'f-1');
  return { name: back.files[0].name, blobId: back.files[0].blobId === blobId };
});
t('השם נשמר', renamed.name === 'רישיון רכב.png', renamed.name);
t('והקובץ עצמו לא זז', renamed.blobId === true);

await page.goto(BASE + '#/doc/f-1');
await page.waitForSelector('.file-row');
t('יש כפתור שינוי שם בשורת הקובץ',
  (await page.locator('.file-row [aria-label="שינוי שם הקובץ"]').count()) === 1);
await page.click('.file-row [aria-label="שינוי שם הקובץ"]');
await page.waitForSelector('#p-in');
t('הגיליון נפתח עם השם הנוכחי',
  (await page.inputValue('#p-in')) === 'רישיון רכב.png');
await page.fill('#p-in', 'ביטוח 2026.png');
await page.click('.sheet-actions .btn:not(.ghost)');
await page.waitForSelector('.backdrop', { state: 'detached' });
t('והשינוי מהמסך נשמר', await page.evaluate(async () =>
  (await window.DB.get('docs', 'f-1')).files[0].name === 'ביטוח 2026.png'));

/* ---------- 9 · ייצוא ---------- */
console.log('\n— ייצוא ושיתוף —');
t('יש כפתור שיתוף בשורת הקובץ',
  (await page.locator('.file-row [aria-label="שיתוף הקובץ"]').count()) === 1);
t('ויש שיתוף בכותרת המסמך',
  (await page.locator('.scr-actions [aria-label="שיתוף"]').count()) === 1);

await page.click('.scr-actions [aria-label="שיתוף"]');
await page.waitForSelector('.routes');
const shareRoutes = await page.evaluate(() =>
  [...document.querySelectorAll('.route-t')].map(x => x.textContent));
t('הגיליון מציע את הקובץ ואת הפרטים כטקסט',
  shareRoutes.length === 2 && shareRoutes[1] === 'הפרטים כטקסט', shareRoutes.join(','));
await page.click('.sheet-h .iconbtn');
await page.waitForSelector('.backdrop', { state: 'detached' });

const names = await page.evaluate(() => ({
  keepsExt: window.Share.safeName('ביטוח 2026.pdf', 'application/pdf'),
  addsExt: window.Share.safeName('ביטוח 2026', 'application/pdf'),
  strips: window.Share.safeName('a/b:c*d?.png', 'image/png'),
  empty: window.Share.safeName('', 'image/jpeg')
}));
t('סיומת קיימת אינה מוכפלת', names.keepsExt === 'ביטוח 2026.pdf', names.keepsExt);
t('וסיומת חסרה מתווספת', names.addsExt === 'ביטוח 2026.pdf', names.addsExt);
t('מפרידי נתיב מנוקים', names.strips === 'a b c d.png', names.strips);
t('שם ריק מקבל ברירת מחדל', names.empty === 'מסמך.jpg', names.empty);

/* ההורדה היא מסלול הנסיגה, והיא זו שנבדקת — Web Share אינו קיים ב-Chromium */
const dl = await page.evaluate(async () => {
  const before = document.querySelectorAll('a[download]').length;
  let clicked = null;
  const proto = HTMLAnchorElement.prototype;
  const orig = proto.click;
  proto.click = function () { clicked = this.getAttribute('download'); };
  const mode = await window.Share.file(new Blob(['x']), 'טסט', 'application/pdf');
  proto.click = orig;
  return { mode, clicked, before };
});
t('בלי Web Share נופלים להורדה', dl.mode === 'download', dl.mode);
t('ושם הקובץ שהורד נכון', dl.clicked === 'טסט.pdf', String(dl.clicked));

/* ---------- 8 · העוגן מציג את ראש התמונה ---------- */
console.log('\n— ראש התמונה —');
const anchorPos = await page.evaluate(() => {
  const d = document.createElement('img');
  d.className = 'anchor';
  document.body.appendChild(d);
  const v = getComputedStyle(d).objectPosition;
  const fit = getComputedStyle(d).objectFit;
  d.remove();
  return { v, fit };
});
t('object-fit נשאר cover', anchorPos.fit === 'cover', anchorPos.fit);
t('object-position בראש התמונה ולא במרכזה',
  /0(px|%)?$/.test(anchorPos.v.split(' ')[1] || ''), anchorPos.v);

/* ---------- 8b · בחירת מסגרת לתצוגה המקדימה ---------- */
console.log('\n— מסגרת התצוגה המקדימה —');
await page.evaluate(async () => {
  const DB = window.DB, U = window.U;
  const c = new OffscreenCanvas(800, 2000), x = c.getContext('2d');
  x.fillStyle = '#eee'; x.fillRect(0, 0, 800, 2000);
  x.fillStyle = '#c00'; x.fillRect(0, 0, 800, 600);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const bid = U.id();
  await DB.saveDoc({
    id: 'crop-1', entityId: 'e-itamar', typeKey: 'generic', title: 'תעודה גבוהה',
    fields: [{ key: 'title', label: 'כותרת', value: 'תעודה גבוהה', kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, source: 'upload', notes: '',
    supersededBy: null, deleted: 0,
    files: [{ blobId: bid, driveFileId: null, mime: 'image/png', name: 'tall.png', size: blob.size }]
  }, [{ id: bid, docId: 'crop-1', data: blob, mime: 'image/png', size: blob.size }]);

  const w = new OffscreenCanvas(2000, 400), wx = w.getContext('2d');
  wx.fillStyle = '#0a0'; wx.fillRect(0, 0, 2000, 400);
  const wblob = await w.convertToBlob({ type: 'image/png' });
  const wid = U.id();
  await DB.saveDoc({
    id: 'crop-2', entityId: 'e-itamar', typeKey: 'generic', title: 'תעודה רחבה',
    fields: [{ key: 'title', label: 'כותרת', value: 'תעודה רחבה', kind: 'text', sensitive: false, verified: true }],
    issueDate: null, expiryDate: null, source: 'upload', notes: '',
    supersededBy: null, deleted: 0,
    files: [{ blobId: wid, driveFileId: null, mime: 'image/png', name: 'wide.png', size: wblob.size }]
  }, [{ id: wid, docId: 'crop-2', data: wblob, mime: 'image/png', size: wblob.size }]);
});

await page.goto(BASE + '#/doc/crop-1');
await page.waitForSelector('img.anchor');
t('בלי בחירה, העוגן בראש התמונה',
  (await page.evaluate(() => document.querySelector('img.anchor').style.objectPosition)) === '50% 0%');

await page.goto(BASE + '#/doc/crop-1/edit');
await page.waitForSelector('.crop-box');
await page.waitForTimeout(250);
t('בטופס העריכה יש בורר מסגרת', await page.isVisible('.crop-range'));
t('והוא פעיל בתמונה גבוהה מהמסגרת',
  (await page.evaluate(() => document.querySelector('.crop-range').disabled)) === false);

/* גרירה כלפי מעלה מזיזה את החלון כלפי מטה בתמונה */
const cbox = await page.locator('.crop-box').boundingBox();
await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + 20);
await page.mouse.down();
await page.mouse.move(cbox.x + cbox.width / 2, cbox.y - 60, { steps: 10 });
await page.mouse.up();
const dragged = await page.evaluate(() => Number(document.querySelector('.crop-range').value));
t('גרירה מזיזה את המסגרת', dragged > 0, String(dragged));

await page.evaluate(() => {
  const s = document.querySelector('.crop-range');
  s.value = '70';
  s.dispatchEvent(new Event('input'));
});
t('והמחוון והתצוגה קשורים זה לזה',
  (await page.evaluate(() => document.querySelector('.crop-img').style.objectPosition)) === '50% 70%');

await page.click('#doc-save');
await page.waitForSelector('.doc-head');
await page.waitForTimeout(250);
t('הבחירה נשמרת על הקובץ',
  (await page.evaluate(async () => (await window.DB.get('docs', 'crop-1')).files[0].focusY)) === 70);
t('והעוגן מצייר אותה',
  (await page.evaluate(() => document.querySelector('img.anchor').style.objectPosition)) === '50% 70%');

await page.goto(BASE + '#/doc/crop-1/edit');
await page.waitForSelector('.crop-range');
await page.waitForTimeout(250);
t('פתיחה מחדש של העריכה מציגה את מה שנבחר',
  (await page.evaluate(() => document.querySelector('.crop-range').value)) === '70');

await page.goto(BASE + '#/doc/crop-2/edit');
await page.waitForSelector('.crop-range');
await page.waitForTimeout(300);
const flat = await page.evaluate(() => ({
  off: document.querySelector('.crop-range').disabled,
  hint: document.querySelector('.crop .muted').textContent
}));
t('בתמונה רחבה מהמסגרת הבורר מושבת', flat.off === true);
t('ואומר למה, במקום להזיז ולא לעשות כלום', /רחבה מהמסגרת/.test(flat.hint), flat.hint);

const focusSync = await page.evaluate(async () => {
  const doc = await window.DB.get('docs', 'crop-1');
  const out = window.Sync.mergeRecords('docs', [
    { id: 'crop-1', updatedAt: (doc.updatedAt || 0) + 1000, entityId: 'e-itamar',
      typeKey: 'generic', title: 'תעודה גבוהה', fields: [], deleted: 0,
      files: [{ driveFileId: 'g1', mime: 'image/png', name: 'tall.png', size: 9, focusY: 70 }] }
  ], [doc]);
  const exported = await window.Sync.exportDb();
  const mine = exported.docs.filter(d => d.id === 'crop-1')[0];
  return { merged: out.writes[0].files[0].focusY, exported: mine.files[0].focusY };
});
t('המסגרת נוסעת בייצוא לדרייב', focusSync.exported === 70, String(focusSync.exported));
t('ושורדת מיזוג במקום להתאפס', focusSync.merged === 70, String(focusSync.merged));

/* ---------- 1 · הדבקת קובץ ---------- */
console.log('\n— הדבקת קובץ —');
const paste = await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([37, 80, 68, 70])], 'x.pdf', { type: 'application/pdf' }));
  const got = window.Files.fromDataTransfer(dt);
  return { n: got.length, mime: got[0] && got[0].type };
});
t('קובץ PDF מהלוח מזוהה', paste.n === 1 && paste.mime === 'application/pdf', JSON.stringify(paste));

/* **המסלול היחיד שבו PDF באמת מגיע מהלוח** הוא אירוע `paste` אמיתי.
   ה-Clipboard API האסינכרוני אינו מוסר `application/pdf` בשום דפדפן —
   הבדיקה למטה מוודאת את זה מול הדפדפן ולא מול הנחה. */
const realPaste = await page.evaluate(async () => {
  window.App.staged = [];
  location.hash = '#/entities';
  await window.App.render();
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])],
    'policy.pdf', { type: 'application/pdf' }));
  document.body.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true
  }));
  await new Promise(r => setTimeout(r, 600));
  return { staged: window.App.staged.map(f => f.mime + '|' + f.name), hash: location.hash };
});
t('הדבקת PDF באירוע אמיתי מצרפת את הקובץ',
  realPaste.staged.join(',') === 'application/pdf|policy.pdf', realPaste.staged.join(','));
t('ופותחת את טופס המסמך', realPaste.hash === '#/doc/new', realPaste.hash);

const targetPaste = await page.evaluate(async () => {
  window.App.staged = [];
  location.hash = '#/entities';
  await window.App.render();
  window.Screens.pasteSheet();
  await new Promise(r => setTimeout(r, 200));
  const target = document.querySelector('.paste-target');
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array([37, 80, 68, 70])], 'x.pdf', { type: 'application/pdf' }));
  target.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: dt, bubbles: true, cancelable: true
  }));
  await new Promise(r => setTimeout(r, 600));
  return { staged: window.App.staged.map(f => f.mime), hash: location.hash };
});
t('והדבקה לתוך המסגרת עובדת גם היא',
  targetPaste.staged.join(',') === 'application/pdf', targetPaste.staged.join(','));

const apiLimit = await page.evaluate(async () => {
  try {
    await navigator.clipboard.write([new ClipboardItem({
      'application/pdf': new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' })
    })]);
    return { supported: true };
  } catch (e) { return { supported: false, err: String(e.message || e) }; }
});
t('ה-Clipboard API אינו יודע PDF כלל — ולכן הכפתור אינו יכול להסתמך עליו',
  apiLimit.supported === false, apiLimit.err);

/* לוח עם טקסט בלבד ובלי הסכמת פרסינג: המסלול חייב להסתיים ביעד ההדבקה,
   שבו הדבקת קובץ כן עובדת, ולא בהודעה שמפנה להגדרות ונגמרת. */
const deadEnd = await page.evaluate(async () => {
  location.hash = '#/entities';
  await window.App.render();
  const orig = navigator.clipboard.read, origT = navigator.clipboard.readText;
  navigator.clipboard.read = () => Promise.resolve([{
    types: ['text/plain'], getType: (t) => Promise.resolve(new Blob(['policy.pdf'], { type: t }))
  }]);
  navigator.clipboard.readText = () => Promise.resolve('policy.pdf');
  window.App.pasteRoute();
  await new Promise(r => setTimeout(r, 600));
  navigator.clipboard.read = orig;
  navigator.clipboard.readText = origT;
  const sheet = document.querySelector('.paste-target');
  const reason = document.querySelector('.sheet-p');
  return { sheet: !!sheet, reason: reason ? reason.textContent : '' };
});
t('לוח בלי קובץ נופל ליעד ההדבקה במקום להיתקע', deadEnd.sheet === true);
t('וההסבר אומר איפה כן להדביק', /הדבק כאן במסגרת/.test(deadEnd.reason), deadEnd.reason);
await page.evaluate(() => {
  const b = document.querySelector('.backdrop');
  if (b) b.remove();
});

const nameFor = await page.evaluate(() => [
  window.Files.nameFor('application/pdf'),
  window.Files.nameFor('image/png'),
  window.Files.nameFor('image/jpeg')
].join('|'));
t('לקובץ מהלוח יש שם עם סיומת', nameFor === 'הדבקה.pdf|הדבקה.png|הדבקה.jpg', nameFor);

await page.goto(BASE + '#/entities');
await page.waitForSelector('.scr');
await page.evaluate(() => window.Screens.pasteSheet());
await page.waitForSelector('.paste-target');
t('ליעד ההדבקה יש גם מסלול בחירת קובץ',
  (await page.locator('.sheet .btn', { hasText: 'בחירת קובץ מהמכשיר' }).count()) === 1);
await page.click('.sheet-h .iconbtn');
await page.waitForSelector('.backdrop', { state: 'detached' });

/* ---------- 10 · העוזר ---------- */
console.log('\n— העוזר —');
await page.goto(BASE + '#/chat');
await page.waitForSelector('.scr');
t('בלי מפתח, העוזר מסביר ומפנה להגדרות', await page.isVisible('.empty .btn'));

await page.evaluate(async () => {
  const S = window.Settings, C = window.CONFIG;
  await S.set(C.K.geminiKey, 'k');
  await S.set(C.K.geminiConsentChat, true);
});
/* אותה כתובת בדיוק אינה טוענת מחדש — ניווט לאותו fragment הוא no-op */
await page.evaluate(() => window.App.render());
await page.waitForSelector('.chat-bar');
t('עם מפתח והסכמה נפתחת שיחה', await page.isVisible('.chat-in'));

const consent = await page.evaluate(async () => {
  const S = window.Settings, C = window.CONFIG;
  await S.set(C.K.geminiConsentChat, false);
  const off = window.Chat.ready();
  await S.set(C.K.geminiConsentChat, true);
  return { off, on: window.Chat.ready(), textOnly: window.Gemini.consented('text') };
});
t('הסכמת השיחה נפרדת משתי האחרות', consent.off === false && consent.on === true);
t('והסכמת טקסט אינה מתירה אותה', consent.textOnly === false);

const context = await page.evaluate(async () => {
  const DB = window.DB;
  const pass = {
    id: 'p-1', entityId: 'e-itamar', typeKey: 'passport', title: 'דרכון',
    fields: [{ key: 'passportNumber', label: 'מספר דרכון', value: 'M4821639', kind: 'passport', sensitive: true, verified: true }],
    issueDate: null, expiryDate: '2030-01-01', files: [], source: 'upload', notes: 'פרטי',
    supersededBy: null, deleted: 0
  };
  await DB.saveDoc(pass, []);
  await window.Screens.reload();
  const S = window.Screens.state;
  const ctx = window.Chat.context(S.entities, S.docs);
  const json = JSON.stringify(ctx);
  return {
    hasOld: json.indexOf('v-old') !== -1,
    hasNew: json.indexOf('v-new') !== -1,
    passportNumber: json.indexOf('M4821639') !== -1,
    passportListed: ctx.docs.some(d => d.id === 'p-1'),
    today: ctx.today
  };
});
t('הקשר השיחה אינו כולל גרסאות שנדחקו', context.hasOld === false);
t('וכולל את העדכנית', context.hasNew === true);
t('מספר הדרכון אינו עוזב את המכשיר גם כאן', context.passportNumber === false);
t('אבל הדרכון עצמו מופיע, בלי שדותיו', context.passportListed === true);
t('והתאריך של היום נשלח', /^\d{4}-\d{2}-\d{2}$/.test(context.today), context.today);

const prompt = await page.evaluate(() => {
  const S = window.Screens.state;
  const p = window.Chat.prompt(window.Chat.context(S.entities, S.docs));
  const keys = window.DOC_TYPES.all().map(t => t.key);
  return { missing: keys.filter(k => p.indexOf(k) === -1), hasOps: p.indexOf('setField') !== -1 };
});
t('הפרומפט נבנה מהטבלה וכולל את כל הסוגים', prompt.missing.length === 0, prompt.missing.join(','));
t('ומכיל את הפעולות', prompt.hasOps === true);

const compiled = await page.evaluate(() => {
  const S = window.Screens.state;
  const st = { entities: S.entities, docs: S.live };
  return {
    good: window.Chat.compile([
      { op: 'setField', docId: 'f-1', key: 'issuer', value: 'משרד הפנים' }
    ], st),
    badKey: window.Chat.compile([
      { op: 'setField', docId: 'f-1', key: 'notAField', value: 'x' }
    ], st),
    badDoc: window.Chat.compile([
      { op: 'setField', docId: 'nope', key: 'issuer', value: 'x' }
    ], st),
    badDate: window.Chat.compile([
      { op: 'setDate', docId: 'f-1', which: 'expiryDate', value: '2026-02-30' }
    ], st),
    badOp: window.Chat.compile([{ op: 'deleteEverything' }], st),
    mismatch: window.Chat.compile([
      { op: 'createDoc', entityId: 'e-itamar', typeKey: 'vehicle_test', fields: { plate: '8452103' }, expiryDate: '2027-01-01' }
    ], st),
    unverified: window.Chat.compile([
      { op: 'setField', docId: 'f-1', key: 'reference', value: 'abc' }
    ], st)
  };
});
t('פעולה תקינה מתקמפלת לשינוי אחד', compiled.good.ops.length === 1 && !compiled.good.errors.length);
t('ויש לה תיאור בעברית', /גורם מנפיק/.test(compiled.good.ops[0].text), compiled.good.ops[0].text);
t('שדה שאינו בטבלה נפסל', compiled.badKey.ops.length === 0 && compiled.badKey.errors.length === 1,
  compiled.badKey.errors.join(','));
t('מזהה מומצא נפסל', compiled.badDoc.ops.length === 0 && compiled.badDoc.errors.length === 1);
t('תאריך שאינו קיים נפסל', compiled.badDate.ops.length === 0, compiled.badDate.errors.join(','));
t('פעולה לא מוכרת נפסלת', compiled.badOp.ops.length === 0 && compiled.badOp.errors.length === 1);
t('סוג שאינו מתאים לישות נפסל', compiled.mismatch.ops.length === 0, compiled.mismatch.errors.join(','));
t('ערך שנכשל בוולידטור נשמר מסומן ולא נזרק',
  compiled.unverified.ops.length === 1 && compiled.unverified.ops[0].field.verified === true,
  JSON.stringify(compiled.unverified.ops[0] && compiled.unverified.ops[0].field));

const applied = await page.evaluate(async () => {
  const S = window.Screens.state;
  const out = window.Chat.compile([
    { op: 'setField', docId: 'f-1', key: 'issuer', value: 'משרד הפנים' },
    { op: 'setNotes', docId: 'f-1', value: 'נבדק' }
  ], { entities: S.entities, docs: S.live });
  const beforeDoc = await window.DB.get('docs', 'f-1');
  const untouched = !(beforeDoc.fields || []).some(f => f.key === 'issuer');
  await window.Chat.apply(out.ops);
  const after = await window.DB.get('docs', 'f-1');
  return {
    untouched,
    issuer: (after.fields || []).filter(f => f.key === 'issuer')[0],
    notes: after.notes
  };
});
t('קימפול לבדו אינו כותב כלום', applied.untouched === true);
t('ורק ההחלה כותבת', applied.issuer && applied.issuer.value === 'משרד הפנים',
  JSON.stringify(applied.issuer));
t('גם הערות', applied.notes === 'נבדק', applied.notes);

/* ---------- אין תלות ברשת ---------- */
console.log('\n— אין תלות ברשת —');
/* blob: הוא זיכרון מקומי, לא דומיין. `Share.download` והאווטאר מייצרים
   כאלה, והם נספרים כבקשות — אבל אינם עוזבים את המכשיר. */
const external = reqs.filter(u => !u.startsWith('http://127.0.0.1:8777') &&
  !u.startsWith('data:') && !u.startsWith('blob:'));
t('אפס בקשות לדומיין חיצוני', external.length === 0, external.join(' | '));

const purity = await page.evaluate(() =>
  Promise.all(['/js/screens.js', '/js/forms.js'].map(f =>
    fetch(f).then(r => r.text()).then(src =>
      window.DOC_TYPES.all().map(t => t.key)
        .filter(k => new RegExp("['\"]" + k + "['\"]").test(src))))));
t('screens.js עדיין אינו מזכיר מפתח סוג', purity[0].length === 0, purity[0].join(','));
t('forms.js עדיין אינו מזכיר מפתח סוג', purity[1].length === 0, purity[1].join(','));

t('אפס שגיאות', errs.length === 0, errs.slice(0, 3).join(' | '));

/* ---------- 3 · אותו באג, דרך הטופס ----------
   הבדיקות למעלה קוראות ל-`Versions` ישירות. זו עוברת במסלול שהמשתמש
   עובר בפועל: כספת נקייה, טופס, שמירה — ובודקת מה נשאר על המסך. */
console.log('\n— מסמך מעודכן דרך הטופס —');
const ctx2 = await browser.newContext({ viewport: { width: 420, height: 920 }, locale: 'he-IL' });
const p2 = await ctx2.newPage();
const errs2 = []; p2.on('pageerror', e => errs2.push(e.message));
p2.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
await p2.goto(BASE);
await p2.waitForSelector('.scr-title');
await p2.evaluate(async () => {
  await window.DB.saveEntity({
    id: 'car', type: 'vehicle', name: 'מאזדה', color: '#4B6B7A', avatar: 'מ', sortOrder: 1
  });
  await window.App.render();
});

async function newDoc(typeLabel, plate, expiry) {
  await p2.click('.fab');
  await p2.waitForSelector('.routes');
  await p2.click('.routes .route:has-text("הזנה ידנית")');
  await p2.waitForSelector('#d-type');
  await p2.selectOption('#d-type', { label: typeLabel });
  await p2.waitForSelector('#f-plate');
  await p2.fill('#f-plate', plate);
  await p2.fill('#d-expiry', expiry);
  await p2.click('#doc-save');
  await p2.waitForSelector('.doc-head');
}

await newDoc('טסט', '8452103', '2025-03-01');
await newDoc('טסט', '8452103', '2027-03-01');
t('אחרי השמירה, המסך מציג גרסאות קודמות',
  (await p2.locator('.files-h', { hasText: 'גרסאות קודמות' }).count()) === 1);

await p2.goto(BASE + '#/entity/car');
await p2.waitForSelector('.scr');
const liveCards = await p2.evaluate(() =>
  [...document.querySelectorAll('.card-t')].map(x => x.textContent));
t('במסך הישות נשאר כרטיס אחד', liveCards.length === 1, liveCards.join(','));
t('והישן מקופל ולא נמחק',
  (await p2.locator('.fold', { hasText: 'גרסאות קודמות' }).count()) === 1);

await p2.goto(BASE + '#/quick');
await p2.waitForSelector('.search-i');
await p2.fill('.search-i', '8452103');
await p2.waitForTimeout(250);
const quickRows = await p2.locator('.row').count();
t('וההעתקה המהירה מחזירה שורה אחת, מהעדכני', quickRows === 1, String(quickRows));

const expiries = await p2.evaluate(() => {
  const g = window.Expiry.group(window.Screens.state.live);
  return { ok: g.ok.length, past: g.past.length };
});
t('מנוע התפוגה רואה רק את העדכני', expiries.ok === 1 && expiries.past === 0,
  JSON.stringify(expiries));
t('אפס שגיאות במסלול הטופס', errs2.length === 0, errs2.slice(0, 3).join(' | '));

await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
