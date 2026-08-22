/* בדיקות MRZ — פרסינג, ספרות ביקורת, וקריאה מקצה לקצה דרך Tesseract מקומי. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8777/index.html';
let pass = 0, fail = 0;
const t = (n, c, x) => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + (x ? ' :: ' + x : ''))); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const ctx = await browser.newContext({ locale: 'he-IL' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));

const net = [];
const origin = new URL(BASE).origin;
page.on('request', r => {
  const u = r.url();
  if (u.startsWith(origin) || u.startsWith('blob:') || u.startsWith('data:')) return;
  net.push(u);
});

await page.goto(BASE);
await page.waitForSelector('.scr-title');

// ---------- בניית דגימות תקינות ----------
const samples = await page.evaluate(() => {
  const cd = window.MRZ.checkDigit;
  const pad = (s, n) => String(s).padEnd(n, '<').slice(0, n);

  // TD3 — דרכון
  // 0-8 מספר · 9 ביקורת · 10-12 אזרחות · 13-18 לידה · 19 ביקורת · 20 מין
  // 21-26 תפוגה · 27 ביקורת · 28-41 אישי · 42 ביקורת אישי · 43 ביקורת מרכיבה
  const num3 = '12345678<';
  const birth3 = '850312', exp3 = '310804', personal3 = pad('', 14);
  const head3 = num3 + cd(num3) + 'ISR' + birth3 + cd(birth3) + 'F' +
                exp3 + cd(exp3) + personal3 + cd(personal3);
  const comp3 = head3.slice(0, 10) + head3.slice(13, 20) + head3.slice(21, 43);
  const td3 = [pad('P<ISRCOHEN<<MICHAL', 44), head3 + cd(comp3)];

  // TD1 — גב תעודת זהות ביומטרית
  const num1 = '004821639';
  const optional1 = pad('123456782', 15);            // ת״ז תקינה בשדה האופציונלי
  const l1 = 'I<ISR' + num1 + cd(num1) + optional1;
  const birth1 = '850312', exp1 = '310804';
  const head2 = birth1 + cd(birth1) + 'F' + exp1 + cd(exp1) + 'ISR' + pad('', 11);
  const composite = l1.slice(5, 30) + head2.slice(0, 7) + head2.slice(8, 15) + head2.slice(18, 29);
  const td1 = [l1, head2 + cd(composite), pad('COHEN<<LIOR', 30)];

  return { td3, td1 };
});

console.log('\n— פרסינג TD3 —');
const r3 = await page.evaluate(s => window.MRZ.parseTD3(s.td3), samples);
t('TD3 נקרא', r3.ok === true, r3.reason);
t('מספר מסמך', r3.ok && r3.fields.documentNumber === '12345678', r3.ok && r3.fields.documentNumber);
t('תאריך לידה מפוענח למאה הנכונה', r3.ok && r3.fields.birthDate === '1985-03-12', r3.ok && r3.fields.birthDate);
t('תאריך תפוגה', r3.ok && r3.fields.expiryDate === '2031-08-04', r3.ok && r3.fields.expiryDate);
t('שם מפורק', r3.ok && r3.fields.surname === 'COHEN' && r3.fields.givenNames === 'MICHAL', r3.ok && r3.fields.nameEn);
t('מדינה ואזרחות', r3.ok && r3.fields.issuingCountry === 'ISR' && r3.fields.nationality === 'ISR');

console.log('\n— פרסינג TD1 —');
const r1 = await page.evaluate(s => window.MRZ.parseTD1(s.td1), samples);
t('TD1 נקרא — זה מה שנאביגו לא יודעת לעשות', r1.ok === true, r1.reason);
t('מספר התעודה', r1.ok && r1.fields.documentNumber === '004821639', r1.ok && r1.fields.documentNumber);
t('תאריך לידה', r1.ok && r1.fields.birthDate === '1985-03-12', r1.ok && r1.fields.birthDate);
t('תאריך תפוגה', r1.ok && r1.fields.expiryDate === '2031-08-04', r1.ok && r1.fields.expiryDate);
t('שם מהשורה השלישית', r1.ok && r1.fields.surname === 'COHEN' && r1.fields.givenNames === 'LIOR', r1.ok && r1.fields.nameEn);

const foundId = await page.evaluate(s => {
  const r = window.MRZ.parseTD1(s.td1);
  return window.MRZ.israeliIdIn(r.fields.optional);
}, samples);
t('ת״ז נמצאת בשדה האופציונלי דרך ספרת הביקורת שלה', foundId === '123456782', foundId);

const noId = await page.evaluate(() => window.MRZ.israeliIdIn('999888777 000111222'));
t('רצף ספרות שאינו ת״ז תקינה לא נלקח', noId === '', noId);

console.log('\n— כשלים מובחנים —');
const fails = await page.evaluate(s => {
  const bad3 = s.td3.slice();
  bad3[1] = bad3[1].slice(0, 9) + '9' + bad3[1].slice(10);        // ספרת ביקורת שגויה
  const bad1 = s.td1.slice();
  bad1[0] = bad1[0].slice(0, 14) + '9' + bad1[0].slice(15);
  return {
    ck3: window.MRZ.parseTD3(bad3),
    ck1: window.MRZ.parseTD1(bad1),
    pattern3: window.MRZ.parseTD3(['X<ISRCOHEN', '1234']),
    none: window.MRZ.fromText('שלום עולם\nאין כאן שום דבר'),
    ckText: window.MRZ.fromText(bad3.join('\n'))
  };
}, samples);
t('ספרת ביקורת שגויה ב-TD3 → checkdigit', fails.ck3.ok === false && fails.ck3.reason === 'checkdigit', fails.ck3.reason);
t('ספרת ביקורת שגויה ב-TD1 → checkdigit', fails.ck1.ok === false && fails.ck1.reason === 'checkdigit', fails.ck1.reason);
t('שורה שאינה דרכון → pattern', fails.pattern3.reason === 'pattern', fails.pattern3.reason);
t('טקסט ללא MRZ → none', fails.none.reason === 'none', fails.none.reason);
t('הסיבה שורדת עד fromText — "זיהיתי ולא עבר" נבדל מ"לא זיהיתי"',
  fails.ckText.reason === 'checkdigit', fails.ckText.reason);
t('כשל לעולם אינו מחזיר שדות', fails.ck3.fields === null && fails.none.fields === null);

console.log('\n— זיהוי אוטומטי של הפורמט ---');
const auto = await page.evaluate(s => ({
  a: window.MRZ.fromText(s.td3.join('\n')),
  b: window.MRZ.fromText(s.td1.join('\n'))
}), samples);
t('fromText מזהה TD3', auto.a.ok && auto.a.format === 'TD3', auto.a.format);
t('fromText מזהה TD1', auto.b.ok && auto.b.format === 'TD1', auto.b.format);

console.log('\n— ניקוי רעש מילוי ---');
const noisy = await page.evaluate(s => {
  const l = s.td3.slice();
  l[0] = 'P<ISRCOHEN<<MICHAL<<<<LLLLLLLLLLLLLLLLLLLLLL';   // '<' נקרא כ-'L'
  return window.MRZ.parseTD3(l);
}, samples);
t('רצף אות חוזרת מהמילוי לא נכנס לשם', noisy.ok && noisy.fields.givenNames === 'MICHAL', noisy.ok && noisy.fields.givenNames);

console.log('\n— קריאה מקצה לקצה דרך Tesseract מקומי —');
const t0 = Date.now();
const ocr = await page.evaluate(async (s) => {
  // מסמך אמיתי: שטח תוכן למעלה, MRZ בתחתית — שם read() מחפש אותו
  const draw = (lines, w) => {
    const c = document.createElement('canvas');
    c.width = 1400; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#dedad2'; x.fillRect(60, 60, 500, 420);
    x.fillStyle = '#111';
    x.font = (w === 44 ? 46 : 62) + 'px "Courier New", monospace';
    x.textBaseline = 'top';
    const step = 80;
    const top = c.height - 40 - lines.length * step;
    lines.forEach((l, i) => x.fillText(l, 14, top + i * step));
    return new Promise(res => c.toBlob(res, 'image/png'));
  };
  const b3 = await draw(s.td3, 44);
  const b1 = await draw(s.td1, 30);
  const a = await window.MRZ.read(b3);
  const b = await window.MRZ.read(b1);
  return {
    a: { ok: a.ok, reason: a.reason, f: a.fields, m: a.message },
    b: { ok: b.ok, reason: b.reason, f: b.fields, m: b.message }
  };
}, samples);
console.log('  שניות:', ((Date.now() - t0) / 1000).toFixed(1));
t('דרכון נקרא מתמונה', ocr.a.ok === true, ocr.a.reason + ' ' + (ocr.a.m || ''));
t('ומספר המסמך נכון', ocr.a.ok && ocr.a.f.documentNumber === '12345678', ocr.a.ok && ocr.a.f.documentNumber);
t('ותאריך התפוגה נכון', ocr.a.ok && ocr.a.f.expiryDate === '2031-08-04', ocr.a.ok && ocr.a.f.expiryDate);
t('תעודת זהות נקראת מתמונה', ocr.b.ok === true, ocr.b.reason + ' ' + (ocr.b.m || ''));
t('ומספר התעודה נכון', ocr.b.ok && ocr.b.f.documentNumber === '004821639', ocr.b.ok && ocr.b.f.documentNumber);

console.log('\n— אין תלות ברשת —');
t('אפס בקשות לדומיין חיצוני לאורך כל הקריאה', net.length === 0, net.slice(0, 3).join(' | '));
t('אפס שגיאות', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
console.log(`\nסה״כ: ${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
