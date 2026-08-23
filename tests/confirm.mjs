/* בדיקות מסך האישור — הצעת פרסינג, מיסוך כשלים, והצעת ישויות. */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
const OUT = process.env.FIXTURES || '.';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, locale: 'he-IL' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

await page.goto(BASE);
await page.waitForSelector('.scr-title');

// ---------- מייצרים צילומי מסמך אמיתיים על הדיסק ----------
const png = await page.evaluate(() => {
  const cd = window.MRZ.checkDigit, pad = (s, n) => String(s).padEnd(n, '<').slice(0, n);

  const num3 = '12345678<', b = '850312', e = '310804', per = pad('', 14);
  const h3 = num3 + cd(num3) + 'ISR' + b + cd(b) + 'F' + e + cd(e) + per + cd(per);
  const c3 = h3.slice(0, 10) + h3.slice(13, 20) + h3.slice(21, 43);
  const td3 = [pad('P<ISRCOHEN<<MICHAL', 44), h3 + cd(c3)];

  const num1 = '004821639', opt = pad('123456782', 15);
  const l1 = 'I<ISR' + num1 + cd(num1) + opt;
  const h2 = b + cd(b) + 'M' + e + cd(e) + 'ISR' + pad('', 11);
  const comp = l1.slice(5, 30) + h2.slice(0, 7) + h2.slice(8, 15) + h2.slice(18, 29);
  const td1 = [l1, h2 + cd(comp), pad('COHEN<<LIOR', 30)];

  const bad = td3.slice();
  bad[1] = bad[1].slice(0, 9) + '9' + bad[1].slice(10);

  const draw = (lines, size) => {
    const c = document.createElement('canvas');
    c.width = 1400; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 1400, 900);
    x.fillStyle = '#dedad2'; x.fillRect(60, 60, 500, 420);
    x.fillStyle = '#111'; x.font = size + 'px "Courier New", monospace'; x.textBaseline = 'top';
    const top = 900 - 40 - lines.length * 80;
    lines.forEach((l, i) => x.fillText(l, 14, top + i * 80));
    return c.toDataURL('image/png').split(',')[1];
  };
  return { passport: draw(td3, 46), id: draw(td1, 62), bad: draw(bad, 46) };
});
writeFileSync(OUT + '/mrz-passport.png', Buffer.from(png.passport, 'base64'));
writeFileSync(OUT + '/mrz-id.png', Buffer.from(png.id, 'base64'));
writeFileSync(OUT + '/mrz-bad.png', Buffer.from(png.bad, 'base64'));

// ---------- ישות אחת ----------
await page.evaluate(async () => {
  const U = window.U;
  await window.DB.saveEntity({ id: U.id(), type: 'person', name: 'ליאור', color: '#4B6B7A', avatar: 'ל' });
});
await page.reload();
await page.waitForSelector('.nav');

async function scan(file) {
  // לצאת מהמסך הקודם קודם, אחרת #d-type של הסריקה הקודמת עדיין על המסך
  await page.goto(BASE + '#/expiries');
  await page.waitForSelector('.nav');
  await page.click('.fab');
  await page.waitForSelector('.routes');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('.route:has-text("סריקת דרכון")')
  ]);
  await chooser.setFiles(file);
  await page.waitForSelector('#d-type', { timeout: 60000 });
}

console.log('\n— סריקת דרכון —');
await scan(OUT + '/mrz-passport.png');
t('הסוג נבחר מהפורמט, בלי שהמשתמש אמר',
  (await page.inputValue('#d-type')) === 'passport', await page.inputValue('#d-type'));
t('מספר הדרכון מולא', (await page.inputValue('#f-passportNumber')) === '12345678',
  await page.inputValue('#f-passportNumber'));
t('תאריך התפוגה מולא', (await page.inputValue('#d-expiry')) === '2031-08-04',
  await page.inputValue('#d-expiry'));
t('השם מולא', (await page.inputValue('#f-fullNameLatin')).includes('MICHAL'),
  await page.inputValue('#f-fullNameLatin'));
t('הודעה שהקריאה הצליחה', await page.isVisible('.notice'));
t('נאמר במפורש שהצילום לא נשמר',
  (await page.textContent('.scr')).includes('לא נשמר'));
t('אין קבצים מצורפים לדרכון', (await page.locator('.staged').count()) === 0);

await page.click('#doc-save');
await page.waitForSelector('.doc-head', { timeout: 8000 });
const saved = await page.evaluate(async () => {
  const docs = await window.DB.listDocs();
  const d = docs.filter(x => x.typeKey === 'passport')[0];
  const blobs = await window.DB.all('blobs');
  return {
    files: d.files.length, blobs: blobs.length,
    name: d.fields.filter(f => f.key === 'fullNameLatin')[0],
    num: d.fields.filter(f => f.key === 'passportNumber')[0]
  };
});
t('נשמר בלי קובץ', saved.files === 0 && saved.blobs === 0);
t('מספר הדרכון נשמר מאומת — ספרת ביקורת עברה', saved.num.verified === true);
t('השם נשמר לא מאומת — אין לו ספרת ביקורת', saved.name.verified === false);

console.log('\n— סריקת תעודת זהות —');
await scan(OUT + '/mrz-id.png');
t('TD1 מזוהה כתעודת זהות', (await page.inputValue('#d-type')) === 'id_card',
  await page.inputValue('#d-type'));
t('מספר התעודה מולא', (await page.inputValue('#f-docNumber')) === '004821639',
  await page.inputValue('#f-docNumber'));
t('ת״ז חולצה מהשדה האופציונלי לפי ספרת הביקורת שלה',
  (await page.inputValue('#f-idNumber')) === '123456782', await page.inputValue('#f-idNumber'));
t('לתעודת זהות כן נשמר צילום', (await page.locator('.staged').count()) === 1);

console.log('\n— צילום שנכשל בספרת ביקורת —');
await scan(OUT + '/mrz-bad.png');
const badText = await page.textContent('.scr');
t('נאמר שזוהה MRZ ושהוא נכשל, ולא "לא זוהה"',
  badText.includes('ספרת הביקורת נכשלה'), badText.slice(0, 120));
t('ההודעה מסומנת כאזהרה', await page.isVisible('.notice-warn'));
t('אף שדה לא מולא מקריאה שנכשלה',
  (await page.inputValue('#f-idNumber')) === '' && (await page.inputValue('#d-expiry')) === '');

console.log('\n— הצעת ישויות מספח —');
await page.click('.fab');
await page.waitForSelector('.routes');
await page.click('.route:has-text("הזנה ידנית")');
await page.waitForSelector('#d-type');
await page.selectOption('#d-type', 'id_appendix');
await page.waitForSelector('#f-children');
await page.fill('#f-idNumber', '123456782');
await page.fill('#f-fullName', 'ליאור כהן');
await page.fill('#f-children', 'נועם כהן 2016\nיעל כהן 2019');
await page.click('#doc-save');
await page.waitForSelector('.checks .chk');
t('הצעת הישויות עולה לפני השמירה', (await page.locator('.chk').count()) === 2);
t('ברירת המחדל אינה מסומנת',
  (await page.locator('.chk[aria-pressed="true"]').count()) === 0);
t('השם והשנה הופרדו', (await page.textContent('.chk >> nth=0')).includes('נועם כהן'),
  await page.textContent('.chk >> nth=0'));

await page.click('.chk >> nth=0');
await page.click('.sheet-actions .btn:not(.ghost)');
await page.waitForSelector('.doc-head', { timeout: 8000 });
const ents = await page.evaluate(() => window.DB.listEntities().then(e => e.map(x => x.name)));
t('רק הילד שסומן נוצר', ents.includes('נועם כהן') && !ents.includes('יעל כהן'), ents.join(','));
t('הישות המקורית נשארה', ents.includes('ליאור'));

console.log('\n— שמירה בלי ליצור —');
await page.click('.fab');
await page.waitForSelector('.routes');
await page.click('.route:has-text("הזנה ידנית")');
await page.waitForSelector('#d-type');
await page.selectOption('#d-type', 'id_appendix');
await page.waitForSelector('#f-children');
await page.fill('#f-idNumber', '123456782');
await page.fill('#f-fullName', 'מיכל כהן');
await page.fill('#f-children', 'דן כהן 2021');
await page.click('#doc-save');
await page.waitForSelector('.checks .chk');
await page.click('.sheet-actions .btn.ghost');
await page.waitForSelector('.doc-head', { timeout: 8000 });
const ents2 = await page.evaluate(() => window.DB.listEntities().then(e => e.map(x => x.name)));
t('דילוג לא יוצר ישות', !ents2.includes('דן כהן'), ents2.join(','));
t('אבל המסמך כן נשמר', (await page.locator('.doc-head').count()) === 1);

t('אפס שגיאות', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
