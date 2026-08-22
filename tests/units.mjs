import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
const SP = process.env.FIXTURES || '.';
let pass=0,fail=0;
const t=(n,c,x)=>{ c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+(x?' :: '+x:''))); };

const browser=await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx=await browser.newContext({viewport:{width:420,height:920},permissions:['clipboard-read','clipboard-write'],locale:'he-IL'});
const page=await ctx.newPage();
const reqs=[]; page.on('request',r=>reqs.push(r.url()));
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

await page.goto(BASE);
await page.waitForSelector('.scr-title');

console.log('\n— נרמול תמונה —');
const norm = await page.evaluate(async () => {
  // PNG סינתטי גדול וקל — שטחים אחידים, בדיוק המקרה ש-JPEG מנפח
  const c = new OffscreenCanvas(3000, 2000);
  const x = c.getContext('2d');
  x.fillStyle = '#e8e4dd'; x.fillRect(0, 0, 3000, 2000);
  x.fillStyle = '#3a3a3a'; x.fillRect(200, 300, 2600, 60);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const f = new File([blob], 'צילום.png', { type: 'image/png' });
  const out = await window.Files.normalize(f);
  const bmp = await createImageBitmap(out.blob);
  return { orig: f.size, size: out.size, mime: out.mime, name: out.name,
           converted: out.converted, w: bmp.width, h: bmp.height,
           label: window.Files.label(out) };
});
t('תמונה מעל 2400px מומרת גם כשהיא קלה', norm.converted === true, norm.orig + ' → ' + norm.size);
t('ההמרה הקטינה אותה', norm.size < norm.orig, norm.orig + ' → ' + norm.size);

// מקרה שבו JPEG דווקא מנפח: מדרג לאורך ציר Y, ש-PNG דוחס כמעט לאפס
const inflate = await page.evaluate(async () => {
  const w = 2000, h = 1600;
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d');
  const img = x.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let px = 0; px < w; px++) {
    const i = (y * w + px) * 4;
    img.data[i] = (y * 7) % 256; img.data[i+1] = (y * 3) % 256;
    img.data[i+2] = 200; img.data[i+3] = 255;
  }
  x.putImageData(img, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const f = new File([blob], 'grad.png', { type: 'image/png' });
  const o = await window.Files.normalize(f);
  return { orig: f.size, size: o.size, converted: o.converted, mime: o.mime };
});
t('PNG שנדחס היטב אינו מנופח ל-JPEG', inflate.size <= inflate.orig,
  inflate.orig + ' → ' + inflate.size);
t('והמקור נשמר כמות שהוא', inflate.converted === false && inflate.mime === 'image/png');

const photo = await page.evaluate(async () => {
  // צילום סינתטי רועש — מתנהג כמו תמונת מצלמה אמיתית מול JPEG
  const c = new OffscreenCanvas(3200, 2400);
  const x = c.getContext('2d');
  const img = x.createImageData(3200, 2400);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.random() * 255; img.data[i+1] = Math.random() * 255;
    img.data[i+2] = Math.random() * 255; img.data[i+3] = 255;
  }
  x.putImageData(img, 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const f = new File([blob], 'IMG_4821.png', { type: 'image/png' });
  const out = await window.Files.normalize(f);
  const bmp = await createImageBitmap(out.blob);
  return { orig: f.size, size: out.size, mime: out.mime, name: out.name,
           converted: out.converted, w: bmp.width, h: bmp.height,
           label: window.Files.label(out) };
});
t('צילום כבד מומר', photo.converted === true);
t('פלט JPEG', photo.mime === 'image/jpeg', photo.mime);
t('צלע ארוכה 2400', Math.max(photo.w, photo.h) === 2400, photo.w + 'x' + photo.h);
t('הגודל קטן מהמקור', photo.size < photo.orig, photo.orig + ' → ' + photo.size);
t('הגודל אחרי ההמרה מוצג', /הומר מ/.test(photo.label), photo.label);
t('סיומת עודכנה', /\.jpg$/.test(photo.name), photo.name);

const pdf = await page.evaluate(async () => {
  const f = new File([new Uint8Array([37,80,68,70])], 'x.pdf', { type: 'application/pdf' });
  const o = await window.Files.normalize(f);
  return { mime: o.mime, converted: o.converted };
});
t('PDF עובר בלי נגיעה', pdf.mime === 'application/pdf' && pdf.converted === false);

const broken = await page.evaluate(async () => {
  const f = new File([new Uint8Array([1,2,3,4,5])], 'x.heic', { type: 'image/heic' });
  try { await window.Files.normalize(f); return 'saved'; }
  catch (e) { return e.message; }
});
t('קובץ שבור נדחה עם הודעה, לא נשמר בשקט', /HEIC/.test(broken), broken);

console.log('\n— ולידטורים —');
const v = await page.evaluate(() => {
  const K = window.KINDS;
  return {
    idGood: K.id.validate('123456782').ok,
    idBad:  K.id.validate('123456783').ok,
    idPad:  K.id.validate('39284617').ok === K.id.validate('039284617').ok,
    idFmt:  K.id.format('39284617'),
    plate7: K.plate.format('8452103'),
    plate8: K.plate.format('12345678'),
    plateBad: K.plate.validate('123456').ok,
    phone:  K.phone.format('0524418890'),
    phone972: K.phone.canonical('+972-52-441-8890'),
    dateFmt: K.date.format('2026-11-01'),
    dateBad: K.date.validate('2026-02-30').ok,
    dateOld: K.date.validate('1799-01-01').ok,
    passOk: K.passport.validate('M4821639').ok,
    copyId: K.copyValue({ value: '123456782', kind: 'id' }),
    copyDate: K.copyValue({ value: '2026-11-01', kind: 'date' }),
    mask: K.mask('123456782'),
    maskShort: K.mask('12'),
    plateSens: K.isSensitive({ kind: 'plate' }),
    idSens: K.isSensitive({ kind: 'id' })
  };
});
t('ת״ז תקינה עוברת', v.idGood === true);
t('ספרת ביקורת שגויה נופלת', v.idBad === false);
t('ריפוד לאפס מוביל שקול', v.idPad === true);
t('תצוגה מרפדת ל-9 ספרות', v.idFmt === '039284617', v.idFmt);
t('לוחית 7 ספרות', v.plate7 === '84-521-03', v.plate7);
t('לוחית 8 ספרות', v.plate8 === '123-45-678', v.plate8);
t('לוחית 6 ספרות נופלת', v.plateBad === false);
t('טלפון מפורמט', v.phone === '052-441-8890', v.phone);
t('קידומת 972 מנורמלת', v.phone972 === '0524418890', v.phone972);
t('תאריך מוצג DD/MM/YYYY', v.dateFmt === '01/11/2026', v.dateFmt);
t('30 בפברואר נופל', v.dateBad === false);
t('שנה 1799 נופלת', v.dateOld === false);
t('מספר דרכון תקין', v.passOk === true);
t('ת״ז מועתקת קנונית', v.copyId === '123456782', v.copyId);
t('תאריך מועתק כפי שמוצג', v.copyDate === '01/11/2026', v.copyDate);
t('מיסוך ארבע אחרונות', v.mask === '•••• 6782', v.mask);
t('ערך קצר ממוסך במלואו', v.maskShort === '••••', v.maskShort);
t('לוחית רישוי אינה רגישה', v.plateSens === false);
t('ת״ז רגישה', v.idSens === true);

console.log('\n— בידוד bidi —');
const bidi = await page.evaluate(() => {
  const out = {};
  const one = (v) => {
    const n = window.U.bidi(v);
    return { tag: n.tagName.toLowerCase(), dir: n.getAttribute('dir'), text: n.textContent };
  };
  out.latin = one('M4821639');
  out.digits = one('84-521-03');
  out.date = one('01/11/2026');
  out.hebrew = one('הראל');
  out.mixed = one('רחוב הרצל 5, תל אביב');
  out.mixed2 = one('ביטוח רכב PL-2291043');
  out.empty = one('');
  return out;
});
t('לטיני בלבד → bdi dir=ltr', bidi.latin.tag === 'bdi' && bidi.latin.dir === 'ltr');
t('מספרי בלבד → bdi dir=ltr', bidi.digits.dir === 'ltr' && bidi.date.dir === 'ltr');
t('עברית בלבד → span, בלי בידוד', bidi.hebrew.tag === 'span' && bidi.hebrew.dir === null);
t('מעורב → bdi בלי dir (בידוד, לא כפייה)',
  bidi.mixed.tag === 'bdi' && bidi.mixed.dir === null, bidi.mixed.dir);
t('מעורב שני → bdi בלי dir', bidi.mixed2.tag === 'bdi' && bidi.mixed2.dir === null);
t('הטקסט נשמר כמות שהוא', bidi.mixed.text === 'רחוב הרצל 5, תל אביב');
t('ערך ריק לא מתפוצץ', bidi.empty.text === '');

// הבאג שהדפוס הזה מונע: dir=ltr כפוי זורק את הסיפא העברית לתחילת השורה
// ההבדל בין בידוד לכפייה נמדד על סדר הגלישה בפועל, לא על מיקום האלמנט.
// דקות שכדאי לדעת: בערך שיש בו ספרות בלבד לצד עברית, EN נצמדת לריצה
// העברית וכפיית LTR לא משנה דבר. ההבדל אמיתי כשיש אותיות לטיניות.
const order = await page.evaluate(() => {
  const where = (html, needle) => {
    const d = document.createElement('div');
    d.setAttribute('dir', 'rtl');
    d.style.cssText = 'position:fixed;top:-999px;left:0;width:400px;font-size:16px';
    d.innerHTML = html;
    document.body.appendChild(d);
    const node = d.firstChild.firstChild;
    const i = node.textContent.indexOf(needle);
    const r = document.createRange();
    r.setStart(node, i); r.setEnd(node, i + needle.length);
    const x = Math.round(r.getBoundingClientRect().left - d.getBoundingClientRect().left);
    d.remove();
    return x;
  };
  const v = 'ביטוח AIG ישראל';
  const num = 'רחוב הרצל 5';
  return {
    forced:   where('<bdi dir="ltr">' + v + '</bdi>', 'ביטוח'),
    isolated: where('<bdi>' + v + '</bdi>', 'ביטוח'),
    numForced:   where('<bdi dir="ltr">' + num + '</bdi>', '5'),
    numIsolated: where('<bdi>' + num + '</bdi>', '5')
  };
});
t('כפיית dir=ltr הופכת את סדר הקריאה בערך מעורב',
  order.forced !== order.isolated,
  'forced=' + order.forced + ' isolated=' + order.isolated);
t('בידוד משאיר את הרישא במקומה הטבעי בצד ימין',
  order.isolated > order.forced,
  'forced=' + order.forced + ' isolated=' + order.isolated);
t('בערך עם ספרות בלבד אין הבדל — הספרה נצמדת לריצה העברית',
  order.numForced === order.numIsolated,
  order.numForced + ' vs ' + order.numIsolated);

console.log('\n— חותמות זמן ו-tombstones —');
const stamps = await page.evaluate(async () => {
  const U = window.U, DB = window.DB;
  const now = U.now();
  const e = await DB.saveEntity({ id: U.id(), type: 'person', name: 'זמני', color: '#4B6B7A', avatar: 'ז' });
  const d = await DB.saveDoc({
    id: U.id(), entityId: e.id, typeKey: 'generic', title: 'זמני',
    fields: [{ key: 'title', label: 'כותרת', value: 'סודי', kind: 'text', sensitive: false, confidence: null, verified: true }],
    issueDate: null, expiryDate: null, files: [], source: 'upload', notes: 'הערה', deleted: 0
  }, []);
  await DB.deleteDoc(d.id);
  const tomb = await DB.get('docs', d.id);
  await DB.deleteEntity(e.id);
  const etomb = await DB.get('entities', e.id);
  return {
    type: typeof now, isEpoch: now > 1.6e12 && now < 4e12,
    docType: typeof d.updatedAt,
    tombKeys: Object.keys(tomb).sort(),
    tombDeleted: tomb.deleted,
    etombKeys: Object.keys(etomb).sort()
  };
});
t('updatedAt הוא מספר', stamps.type === 'number' && stamps.docType === 'number');
t('והוא epoch במילישניות', stamps.isEpoch === true);
t('tombstone של מסמך מצומצם לארבעה מפתחות',
  stamps.tombKeys.join(',') === 'deleted,entityId,id,updatedAt', stamps.tombKeys.join(','));
t('ולא נשארו בו שדות, קבצים או הערות',
  !stamps.tombKeys.includes('fields') && !stamps.tombKeys.includes('notes'));
t('tombstone של ישות מצומצם לשלושה',
  stamps.etombKeys.join(',') === 'deleted,id,updatedAt', stamps.etombKeys.join(','));
t('deleted נשמר כ-1 ולא כבוליאני', stamps.tombDeleted === 1);

console.log('\n— מצב ריק —');
await page.goto(BASE + '#/expiries');
await page.waitForTimeout(300);
const emptyShape = await page.evaluate(() => {
  const e = document.querySelector('.empty');
  if (!e) return null;
  return { tag: e.tagName.toLowerCase(), inner: e.querySelectorAll('button').length };
});
t('כל מסגרת מצב הריק היא button אחד',
  emptyShape && emptyShape.tag === 'button', emptyShape && emptyShape.tag);
t('ואין בתוכה כפתור מקונן', emptyShape && emptyShape.inner === 0);

console.log('\n— אין תלות ברשת ---');
const external = reqs.filter(u => !u.startsWith('http://127.0.0.1:8777') && !u.startsWith('data:'));
t('אפס בקשות לדומיין חיצוני', external.length === 0, external.join(' | '));

console.log('\n— טבלה בלבד, בלי if על סוג —');
const noIfs = await page.evaluate(() => {
  return fetch('/js/screens.js').then(r => r.text()).then(src => {
    const keys = window.DOC_TYPES.all().map(t => t.key);
    return keys.filter(k => new RegExp("['\"]" + k + "['\"]").test(src));
  });
});
t('screens.js אינו מזכיר אף מפתח סוג מסמך', noIfs.length === 0, noIfs.join(','));
const noIfs2 = await page.evaluate(() =>
  fetch('/js/forms.js').then(r => r.text()).then(src =>
    window.DOC_TYPES.all().map(t => t.key).filter(k => new RegExp("['\"]" + k + "['\"]").test(src))));
t('forms.js אינו מזכיר אף מפתח סוג מסמך', noIfs2.length === 0, noIfs2.join(','));

console.log('\n— תנועה מרוסנת —');
const rm = await ctx.newPage();
await rm.emulateMedia({ reducedMotion: 'reduce' });
await rm.goto(BASE);
await rm.waitForSelector('.card, .empty');
const dur = await rm.evaluate(() => {
  const e = document.querySelector('.empty .btn') || document.body;
  return getComputedStyle(e).transitionDuration;
});
t('prefers-reduced-motion מרסן מעברים', parseFloat(dur) < 0.002, dur);

console.log('\n— צילומי מסך —');
await page.goto(BASE + '#/expiries');
await page.waitForTimeout(400);
await page.screenshot({ path: SP + '/s-home.png' });
await page.goto(BASE + '#/settings');
await page.waitForTimeout(300);
await page.screenshot({ path: SP + '/s-settings.png' });
t('צילומי מסך נשמרו', true);

t('אפס שגיאות', errs.length === 0, errs.slice(0,3).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
