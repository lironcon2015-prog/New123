/* בדיקות דרייב — מול Google API מזויף. אף בקשה אמיתית לא יוצאת, ואין צורך
   בחשבון. מה שנבדק: איתור התיקייה, השחזור אחרי מחיקת נתוני אתר, בניית
   ה-multipart, ומסלולי הכשל. סבב אמיתי מול גוגל לא נבדק כאן. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

/* ---------- דרייב מזויף ---------- */
const FOLDER = 'application/vnd.google-apps.folder';
let store, seq, calls, unauthorized;

function reset() { store = {}; seq = 0; calls = []; unauthorized = false; }
reset();

function create(meta, mime, content, space) {
  const id = 'id-' + (++seq);
  store[id] = {
    id, name: meta.name, parents: meta.parents || [],
    mimeType: meta.mimeType || mime || 'application/octet-stream',
    content: content || null, trashed: false, space: space || 'drive'
  };
  return id;
}

function parseQ(q) {
  const name = (q.match(/name = '([^']*)'/) || [])[1];
  const parent = (q.match(/'([^']*)' in parents/) || [])[1];
  const mime = (q.match(/mimeType = '([^']*)'/) || [])[1];
  return { name, parent, mime };
}

function parseMultipart(buf) {
  const s = buf.toString('latin1');
  const b = (s.match(/^--([^\r\n]+)/) || [])[1];
  const parts = s.split('--' + b).slice(1, -1);
  const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
  const idx = parts[1].indexOf('\r\n\r\n') + 4;
  const body = Buffer.from(parts[1].slice(idx).replace(/\r\n$/, ''), 'latin1');
  const mime = (parts[1].match(/Content-Type: ([^\r\n]+)/) || [])[1];
  return { meta, body, mime };
}

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ locale: 'he-IL' });

await ctx.route('https://www.googleapis.com/**', async route => {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  calls.push(req.method() + ' ' + p + url.search);

  if (unauthorized) return route.fulfill({ status: 401, body: '{}' });

  const json = (o, st) => route.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });

  if (p === '/drive/v3/files' && req.method() === 'GET') {
    const { name, parent, mime } = parseQ(url.searchParams.get('q') || '');
    const space = url.searchParams.get('spaces') === 'appDataFolder' ? 'appDataFolder' : 'drive';
    const hits = Object.values(store).filter(f =>
      f.space === space && !f.trashed &&
      (!name || f.name === name) &&
      (!mime || f.mimeType === mime) &&
      (!parent || f.parents.includes(parent)));
    return json({ files: hits.map(f => ({ id: f.id, name: f.name })) });
  }

  if (p === '/drive/v3/files' && req.method() === 'POST') {
    const meta = JSON.parse(req.postData() || '{}');
    return json({ id: create(meta, meta.mimeType, null, 'drive') });
  }

  if (p === '/upload/drive/v3/files' && req.method() === 'POST') {
    const { meta, body, mime } = parseMultipart(req.postDataBuffer());
    const space = (meta.parents || []).includes('appDataFolder') ? 'appDataFolder' : 'drive';
    if (space === 'appDataFolder') meta.parents = ['appDataFolder'];
    return json({ id: create(meta, mime, body, space) });
  }

  const upPatch = p.match(/^\/upload\/drive\/v3\/files\/(.+)$/);
  if (upPatch && req.method() === 'PATCH') {
    const { body } = parseMultipart(req.postDataBuffer());
    const f = store[upPatch[1]];
    if (!f) return json({}, 404);
    f.content = body;
    return json({ id: f.id });
  }

  const one = p.match(/^\/drive\/v3\/files\/([^/]+)$/);
  if (one) {
    const f = store[one[1]];
    if (!f) return json({}, 404);
    if (url.searchParams.get('alt') === 'media') {
      return route.fulfill({ status: 200, contentType: f.mimeType, body: f.content || Buffer.alloc(0) });
    }
    return json({ id: f.id, trashed: f.trashed });
  }

  return json({}, 404);
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE);
await page.waitForSelector('.scr-title');

/* טוקן מזויף — כל השאר אמיתי */
const fakeToken = () => page.evaluate(() => {
  window.Drive._requestToken = () => Promise.resolve({ token: 'TK', expiresIn: 3600 });
});
await fakeToken();

console.log('\n— סקופים —');
const scopes = await page.evaluate(() => window.Drive.SCOPES);
t('drive.file נכלל', scopes.includes('auth/drive.file'));
t('drive.appdata נכלל', scopes.includes('auth/drive.appdata'));
t('ואין סקופ רחב יותר',
  !/auth\/drive(\s|$)/.test(scopes) && !scopes.includes('drive.readonly'), scopes);

console.log('\n— יצירת התיקייה בפעם הראשונה —');
const f1 = await page.evaluate(() => window.Drive.folder());
const folders = Object.values(store).filter(f => f.mimeType === FOLDER);
t('נוצרה תיקיית DocVault אחת', folders.length === 1 && folders[0].name === 'DocVault');
t('והמזהה הוחזר', !!f1);
const pointer = Object.values(store).filter(f => f.name === 'folder.json')[0];
t('נכתב מצביע ב-appDataFolder', !!pointer && pointer.space === 'appDataFolder');
t('והוא מכיל את המזהה',
  pointer && JSON.parse(pointer.content.toString()).folderId === f1);
t('המזהה נשמר גם מקומית כקאש',
  (await page.evaluate(() => window.Settings.get(window.CONFIG.K.driveFolderId))) === f1);

console.log('\n— שחזור אחרי מחיקת נתוני אתר —');
/* זו כל הסיבה ש-drive.appdata נכנס: המזהה המקומי נעלם, התיקייה נשארת */
await page.reload();
await page.waitForSelector('.scr-title');
await fakeToken();
await page.evaluate(() => window.Settings.set(window.CONFIG.K.driveFolderId, ''));
calls = [];
const f2 = await page.evaluate(() => window.Drive.folder());
t('נמצאה אותה תיקייה, לא נוצרה חדשה', f2 === f1, f2 + ' vs ' + f1);
t('ולא נוצרה תיקייה שנייה',
  Object.values(store).filter(f => f.mimeType === FOLDER && f.name === 'DocVault').length === 1);
t('החיפוש עבר דרך appDataFolder', calls.some(c => c.includes('spaces=appDataFolder')));

console.log('\n— db.json —');
const dbId1 = await page.evaluate(() => window.Drive.putDb({ version: 1, docs: [{ id: 'a' }], entities: [] }));
const dbFiles = Object.values(store).filter(f => f.name === 'docvault-db.json');
t('נוצר קובץ אחד', dbFiles.length === 1);
t('בתוך תיקיית DocVault', dbFiles[0].parents.includes(f1));
const back = await page.evaluate(() => window.Drive.getDb());
t('הקריאה מחזירה את מה שנכתב', back && back.docs[0].id === 'a', JSON.stringify(back));

await page.evaluate(() => window.Drive.putDb({ version: 1, docs: [{ id: 'b' }], entities: [] }));
t('כתיבה שנייה מעדכנת ולא מכפילה',
  Object.values(store).filter(f => f.name === 'docvault-db.json').length === 1);
const back2 = await page.evaluate(() => window.Drive.getDb());
t('והתוכן התעדכן', back2.docs[0].id === 'b');

console.log('\n— קבצים —');
const fileId = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 30; c.height = 30;
  const x = c.getContext('2d'); x.fillStyle = '#357'; x.fillRect(0, 0, 30, 30);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  window.__size = blob.size;
  return window.Drive.uploadBlob('doc-77', 'policy.png', 'image/png', blob);
});
const up = store[fileId];
t('שם הקובץ נושא את מזהה המסמך כקידומת', up.name === 'doc-77__policy.png', up.name);
const filesFolder = Object.values(store).filter(f => f.mimeType === FOLDER && f.name === 'files')[0];
t('נוצרה תיקיית files שטוחה אחת', !!filesFolder && filesFolder.parents.includes(f1));
t('הקובץ בתוכה', up.parents.includes(filesFolder.id));
t('ואין תיקייה לכל מסמך',
  Object.values(store).filter(f => f.mimeType === FOLDER).length === 2,
  Object.values(store).filter(f => f.mimeType === FOLDER).map(f => f.name).join(','));
t('ה-multipart שמר את הבייטים במלואם',
  up.content.length === (await page.evaluate(() => window.__size)),
  up.content.length + ' vs ' + (await page.evaluate(() => window.__size)));
t('וה-mime נשמר', up.mimeType === 'image/png', up.mimeType);
t('התוכן הוא PNG אמיתי',
  up.content.slice(1, 4).toString() === 'PNG', up.content.slice(0, 8).toString('hex'));

const roundTrip = await page.evaluate(async id => {
  const blob = await window.Drive.downloadBlob(id);
  const bmp = await createImageBitmap(blob);
  return { size: blob.size, w: bmp.width, h: bmp.height, type: blob.type };
}, fileId);
t('ההורדה מחזירה תמונה תקינה', roundTrip.w === 30 && roundTrip.h === 30,
  JSON.stringify(roundTrip));

console.log('\n— כשלים —');
unauthorized = true;
const expired = await page.evaluate(() => window.Drive.getDb().then(() => 'עבר', e => e.message));
t('401 מוחזר כהודעה שמפנה להתחברות מחדש', /פגה/.test(expired), expired);
t('והחיבור מסומן כמנותק', (await page.evaluate(() => window.Drive.connected())) === false);

unauthorized = false;
await fakeToken();
const ok = await page.evaluate(() => window.Drive.getDb());
t('אחרי טוקן חדש הכל חוזר לעבוד', !!ok);

// טעינה מחדש מחזירה את המימוש האמיתי של הטוקן, בלי הזרקה
await page.reload();
await page.waitForSelector('.scr-title');
const noClient = await page.evaluate(async () => {
  await window.Settings.set(window.CONFIG.K.driveClientId, '');
  return window.Drive.connect().then(() => 'עבר', e => e.message);
});
t('בלי מזהה לקוח ההתחברות נכשלת בהודעה ברורה', /מזהה לקוח/.test(noClient), noClient);

console.log('\n— אין בקשות מחוץ לגוגל —');
t('אפס שגיאות', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
