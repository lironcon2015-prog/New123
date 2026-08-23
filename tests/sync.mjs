/* בדיקות מיזוג וסנכרון — שני "מכשירים" אמיתיים (שני contexts, שני IndexedDB)
   שחולקים דרייב מזויף שיושב ב-Node. אף בקשה לא יוצאת. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

/* ---------- הדרייב המזויף ---------- */
const drive = { db: null, files: {}, n: 0, offline: false, log: [] };
function guard() { if (drive.offline) throw new Error('אין חיבור'); }

async function device(name) {
  const ctx = await browser.newContext({ locale: 'he-IL' });
  await ctx.exposeFunction('__dGet', async () => { guard(); drive.log.push(name + ':get'); return drive.db; });
  await ctx.exposeFunction('__dPut', async db => { guard(); drive.log.push(name + ':put'); drive.db = db; });
  await ctx.exposeFunction('__dUp', async (docId, fname, mime, b64) => {
    guard(); const id = 'drive-' + (++drive.n);
    drive.files[id] = { docId, name: fname, mime, b64 }; return id;
  });
  await ctx.exposeFunction('__dDown', async id => {
    guard(); const f = drive.files[id]; return f ? { b64: f.b64, mime: f.mime } : null;
  });

  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(name + ': ' + e.message));
  await page.goto(BASE);
  await page.waitForSelector('.scr-title');
  await page.evaluate(() => {
    const toB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); });
    const fromB64 = (b64, mime) => {
      const bin = atob(b64), a = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return new Blob([a], { type: mime });
    };
    window.Sync.transport = {
      connected: () => true,
      getDb: () => window.__dGet(),
      putDb: db => window.__dPut(db),
      uploadBlob: (docId, name, mime, blob) => toB64(blob).then(b64 => window.__dUp(docId, name, mime, b64)),
      downloadBlob: id => window.__dDown(id).then(r => { if (!r) throw new Error('חסר'); return fromB64(r.b64, r.mime); })
    };
  });
  return { page, errs, name };
}

const A = await device('A');
const B = await device('B');

const seed = async (d, spec) => d.page.evaluate(async s => {
  const U = window.U, DB = window.DB;
  const e = await DB.saveEntity({ id: s.entId, type: 'person', name: s.entName, color: '#4B6B7A', avatar: s.entName[0] });
  return e.id;
}, spec);

const run = d => d.page.evaluate(() => window.Sync.run({ silent: true }));
const docs = d => d.page.evaluate(() => window.DB.listDocs());
const ents = d => d.page.evaluate(() => window.DB.listEntities());

/* ---------- מיזוג טהור ---------- */
console.log('\n— מיזוג ברמת הרשומה —');
const pure = await A.page.evaluate(() => {
  const M = (r, l) => window.Sync.mergeRecords('entities', r, l);
  const rec = (id, at, name) => ({ id, updatedAt: at, name, deleted: 0 });
  return {
    fresh:    M([rec('1', 100, 'א')], []),
    newer:    M([rec('1', 200, 'חדש')], [rec('1', 100, 'ישן')]),
    older:    M([rec('1', 100, 'ישן')], [rec('1', 200, 'חדש')]),
    tie:      M([rec('1', 100, 'מרוחק')], [rec('1', 100, 'מקומי')]),
    localOnly: M([], [rec('2', 100, 'רק כאן')]),
    tomb:     M([{ id: '1', deleted: 1, updatedAt: 300 }], [rec('1', 100, 'קיים')])
  };
});
t('רשומה שאין מקומית נכתבת', pure.fresh.writes.length === 1 && !pure.fresh.needUpload);
t('מרוחק חדש יותר דורס', pure.newer.writes[0].name === 'חדש');
t('מקומי חדש יותר לא נדרס', pure.older.writes.length === 0);
t('ומסמן שצריך להעלות', pure.older.needUpload === true);
t('תיקו — המקומי מנצח בשקט', pure.tie.writes.length === 0 && pure.tie.needUpload === false);
t('רשומה שקיימת רק מקומית מסמנת העלאה', pure.localOnly.needUpload === true);
t('tombstone מרוחק דורס רשומה חיה', pure.tomb.writes.length === 1 && pure.tomb.writes[0].deleted === 1);

console.log('\n— files[] לא נדרס —');
const files = await A.page.evaluate(() => {
  const M = (r, l) => window.Sync.mergeRecords('docs', r, l);
  const local = {
    id: 'd1', updatedAt: 100, typeKey: 'generic', files: [
      { blobId: 'local-1', driveFileId: 'drive-1', mime: 'image/jpeg', name: 'a.jpg', size: 10 },
      { blobId: 'local-2', driveFileId: null, mime: 'image/jpeg', name: 'טרם-עלה.jpg', size: 20 }
    ]
  };
  const remote = {
    id: 'd1', updatedAt: 200, typeKey: 'generic', files: [
      { driveFileId: 'drive-1', mime: 'image/jpeg', name: 'a.jpg', size: 10 },
      { driveFileId: 'drive-9', mime: 'image/jpeg', name: 'ממכשיר-אחר.jpg', size: 30 }
    ]
  };
  const out = M([remote], [local]).writes[0].files;
  return {
    kept: out.filter(f => f.driveFileId === 'drive-1')[0],
    incoming: out.filter(f => f.driveFileId === 'drive-9')[0],
    pending: out.filter(f => f.name === 'טרם-עלה.jpg')[0],
    count: out.length
  };
});
t('blobId מקומי נשמר לקובץ שכבר עלה', files.kept && files.kept.blobId === 'local-1',
  JSON.stringify(files.kept));
t('קובץ ממכשיר אחר נכנס בלי blobId, לקראת הורדה',
  files.incoming && files.incoming.blobId === null);
t('קובץ מקומי שטרם עלה שורד את המיזוג',
  !!files.pending && files.pending.blobId === 'local-2', JSON.stringify(files.pending));
t('שלושתם', files.count === 3, String(files.count));

console.log('\n— ייצוא —');
const exported = await A.page.evaluate(async () => {
  const U = window.U, DB = window.DB;
  const e = await DB.saveEntity({ id: U.id(), type: 'person', name: 'ליאור', color: '#444', avatar: 'ל' });
  const F = (k, l, v, kind) => ({ key: k, label: l, value: v, kind, sensitive: false, confidence: null, verified: true });
  await DB.saveDoc({ id: 'p1', entityId: e.id, typeKey: 'passport', title: 'דרכון',
    fields: [F('passportNumber', 'מספר דרכון', 'M4821639', 'passport')],
    issueDate: null, expiryDate: '2031-08-04', files: [], source: 'camera', notes: 'סודי', deleted: 0 }, []);
  await DB.saveDoc({ id: 'g1', entityId: e.id, typeKey: 'generic', title: 'כללי',
    fields: [F('title', 'כותרת', 'חוזה', 'text')], issueDate: null, expiryDate: null,
    files: [{ blobId: 'local-x', driveFileId: 'drive-x', mime: 'image/jpeg', name: 'x.jpg', size: 5 }],
    source: 'upload', notes: '', deleted: 0 }, []);
  const db = await window.Sync.exportDb();
  return {
    passport: db.docs.filter(d => d.id === 'p1')[0],
    generic: db.docs.filter(d => d.id === 'g1')[0],
    ents: db.entities.length
  };
});
t('שדות הדרכון לא עוזבים את המכשיר', exported.passport.fields.length === 0);
t('וגם ההערות שלו לא', exported.passport.notes === '');
t('אבל התפוגה כן — היא כל מה שהתזכורת צריכה',
  exported.passport.expiryDate === '2031-08-04');
t('סוג רגיל מייצא את שדותיו', exported.generic.fields.length === 1);
t('blobId נחתך בגבול הייצוא',
  exported.generic.files[0].blobId === undefined, JSON.stringify(exported.generic.files[0]));
t('driveFileId כן נשלח', exported.generic.files[0].driveFileId === 'drive-x');
t('ישויות מיוצאות', exported.ents >= 1);

/* ---------- שני מכשירים ---------- */
console.log('\n— שני מכשירים, דרייב אחד —');
await A.page.evaluate(() => window.indexedDB.deleteDatabase('DocVaultDB'));
await A.page.reload(); await A.page.waitForSelector('.scr-title');
await A.page.evaluate(() => {
  const toB64 = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).split(',')[1]); f.readAsDataURL(b); });
  const fromB64 = (b64, mime) => { const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); };
  window.Sync.transport = { connected: () => true, getDb: () => window.__dGet(), putDb: db => window.__dPut(db),
    uploadBlob: (d, n, m, b) => toB64(b).then(x => window.__dUp(d, n, m, x)),
    downloadBlob: id => window.__dDown(id).then(r => { if (!r) throw new Error('חסר'); return fromB64(r.b64, r.mime); }) };
});
drive.db = null; drive.files = {}; drive.n = 0;

await A.page.evaluate(async () => {
  const U = window.U, DB = window.DB;
  const e = await DB.saveEntity({ id: 'ent-1', type: 'vehicle', name: 'מאזדה 3', color: '#8B6F47', avatar: 'מ' });
  const c = document.createElement('canvas'); c.width = 40; c.height = 40;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#c33'; ctx.fillRect(0, 0, 40, 40);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const bid = U.id();
  await DB.saveDoc({ id: 'doc-1', entityId: e.id, typeKey: 'vehicle_insurance', title: 'ביטוח רכב',
    fields: [{ key: 'policyNumber', label: 'מספר פוליסה', value: '2291043', kind: 'policy', sensitive: true, confidence: null, verified: true }],
    issueDate: null, expiryDate: '2027-03-20',
    files: [{ blobId: bid, driveFileId: null, mime: 'image/png', name: 'policy.png', size: blob.size }],
    source: 'upload', notes: '', deleted: 0 },
    [{ id: bid, docId: 'doc-1', data: blob, mime: 'image/png', size: blob.size }]);
});

const r1 = await run(A);
t('סנכרון ראשון של A הצליח', r1.ok === true, JSON.stringify(r1));
t('הקובץ עלה לדרייב', Object.keys(drive.files).length === 1);
t('ה-driveFileId נרשם על המסמך',
  (await docs(A))[0].files[0].driveFileId === 'drive-1');

const r2 = await run(B);
t('B משך את הנתונים', r2.ok === true && r2.localChanged === true, JSON.stringify(r2));
const bEnts = await ents(B), bDocs = await docs(B);
t('B רואה את הישות', bEnts.length === 1 && bEnts[0].name === 'מאזדה 3');
t('B רואה את המסמך ואת השדה', bDocs.length === 1 && bDocs[0].fields[0].value === '2291043');
t('B הוריד את הקובץ לקאש המקומי',
  !!bDocs[0].files[0].blobId, JSON.stringify(bDocs[0].files[0]));
const bBlob = await B.page.evaluate(id => window.DB.blob(id).then(b => b && b.size), bDocs[0].files[0].blobId);
t('וה-blob באמת שם', bBlob > 0, String(bBlob));

console.log('\n— עריכה נגדית —');
await B.page.evaluate(async () => {
  const d = (await window.DB.listDocs())[0];
  d.fields[0].value = '9999999';
  d.title = 'ביטוח רכב · עודכן ב-B';
  await window.DB.saveDoc(d, []);
});
await run(B);
await run(A);
const aDocs = await docs(A);
t('A קיבל את העריכה של B', aDocs[0].title === 'ביטוח רכב · עודכן ב-B', aDocs[0].title);
t('והקובץ המקומי של A לא נותק מהמסמך',
  !!aDocs[0].files[0].blobId && aDocs[0].files[0].driveFileId === 'drive-1',
  JSON.stringify(aDocs[0].files[0]));

console.log('\n— מחיקה —');
await A.page.evaluate(() => window.DB.deleteDoc('doc-1'));
await run(A);
await run(B);
t('המחיקה הגיעה ל-B', (await docs(B)).length === 0);
const tomb = await B.page.evaluate(() => window.DB.get('docs', 'doc-1'));
t('ונשאר tombstone ולא מחיקה שקטה', tomb && tomb.deleted === 1);
t('ה-tombstone לא נושא שדות', !tomb.fields || tomb.fields.length === 0);

console.log('\n— מנעול והצטברות —');
const both = await A.page.evaluate(() =>
  Promise.all([window.Sync.run({ silent: true }), window.Sync.run({ silent: true })]));
t('הרצה שנייה במקביל נחסמת', both.some(r => r.skipped === 'busy'), JSON.stringify(both));

drive.offline = true;
await A.page.evaluate(async () => {
  const U = window.U;
  await window.DB.saveEntity({ id: 'ent-off', type: 'home', name: 'הבית', color: '#4F6B4A', avatar: 'ה' });
});
const offRes = await run(A);
t('אופליין מוחזר כשגיאה ולא מתפוצץ', !!offRes.error, JSON.stringify(offRes));
t('והנתון המקומי נשאר', (await ents(A)).some(e => e.name === 'הבית'));

drive.offline = false;
const back = await run(A);
t('בחזרה לרשת הסנכרון תופס את מה שהצטבר', back.ok === true, JSON.stringify(back));
await run(B);
t('ו-B מקבל אותו', (await ents(B)).some(e => e.name === 'הבית'));

console.log('\n— תור עם debounce —');
const q = await A.page.evaluate(async () => {
  window.Sync.cancelQueue();
  const before = window.Sync.pending();
  window.Sync.queue(); window.Sync.queue(); window.Sync.queue();
  const after = window.Sync.pending();
  window.Sync.cancelQueue();
  return { before, after, ms: window.Sync.DEBOUNCE_MS };
});
t('שלוש קריאות לתור מייצרות המתנה אחת', q.before === false && q.after === true);
t('ה-debounce הוא 4 שניות', q.ms === 4000, String(q.ms));

const notReady = await A.page.evaluate(() => {
  const keep = window.Sync.transport;
  window.Sync.transport = null;
  return window.Sync.run({ silent: true }).then(r => { window.Sync.transport = keep; return r; });
});
t('בלי חיבור לדרייב הסנכרון מדלג בשקט', notReady.skipped === 'not-connected');

t('אפס שגיאות', A.errs.length === 0 && B.errs.length === 0,
  A.errs.concat(B.errs).slice(0, 2).join(' | '));

await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
