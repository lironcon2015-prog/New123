/* mrz.js — קריאת MRZ מקומית. שום דבר לא עוזב את המכשיר.
   ported from Navigo: js/mrz.js — checkDigit, yyToDate, TD3 parse, fromText.
   מה שונה בהתאמה:
     1. TD1 (3×30) נוסף. נאביגו תומכת ב-TD3 בלבד ודוחה כל שורה שאינה 'P'.
     2. הכישלון מוחזר עם סיבה במקום null — מסך האישור חייב להבחין בין
        "לא נמצא MRZ" לבין "נמצא ונכשל בספרת ביקורת".
     3. Tesseract מתארח עצמית, same-origin. אצל נאביגו הוא מ-CDN וה-traineddata
        מהוסט שלישי שאינו נתפס בקאש, ולכן קריאה ראשונה שם חייבת רשת. */
(function () {
  'use strict';

  var CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<';
  var BASE = 'lib/tesseract/';

  /* ---------- ספרות ביקורת ---------- */

  function charVal(c) {
    if (c === '<') return 0;
    if (c >= '0' && c <= '9') return +c;
    return c.charCodeAt(0) - 55;
  }

  function checkDigit(s) {
    var w = [7, 3, 1], sum = 0;
    for (var i = 0; i < s.length; i++) sum += charVal(s[i]) * w[i % 3];
    return String(sum % 10);
  }

  function checks(s, d) { return checkDigit(s) === (d === '<' ? '0' : d); }

  /* בלבולי OCR במקומות שהם ספרתיים בהגדרה */
  function fixNum(s) {
    return String(s).replace(/O/g, '0').replace(/[IL]/g, '1').replace(/B/g, '8').replace(/S/g, '5');
  }

  function yyToDate(yymmdd, birth) {
    var s = fixNum(yymmdd);
    if (!/^\d{6}$/.test(s)) return null;
    var yy = +s.slice(0, 2);
    var century = birth ? (yy > (new Date().getFullYear() % 100) ? 1900 : 2000) : 2000;
    var out = (century + yy) + '-' + s.slice(2, 4) + '-' + s.slice(4, 6);
    return window.U.isRealDate(out) ? out : null;
  }

  /* מילוי '<' נקרא לעיתים כרצף של אות אחת חוזרת. אין ל-l1 ספרת ביקורת,
     ולכן השם תמיד חוזר לא מאומת — כאן רק מנקים את הרעש הגלוי. */
  function cleanName(s) {
    return String(s || '')
      .replace(/</g, ' ')
      .split(/\s+/)
      .filter(function (tok) {
        if (!tok) return false;
        return !(tok.length >= 4 && /^(.)\1+$/.test(tok));
      })
      .join(' ')
      .trim();
  }

  var fail = function (reason) { return { ok: false, reason: reason, fields: null }; };

  /* ---------- TD3 — דרכון, 2×44 ---------- */

  function parseTD3(lines) {
    var l1 = lines[0].toUpperCase().padEnd(44, '<').slice(0, 44);
    var l2 = lines[1].toUpperCase().padEnd(44, '<').slice(0, 44);
    if (l1[0] !== 'P') return fail('pattern');

    var number = l2.slice(0, 9);
    var birth = fixNum(l2.slice(13, 19));
    var expiry = fixNum(l2.slice(21, 27));
    var personal = l2.slice(28, 42);

    if (!checks(number, fixNum(l2[9])) ||
        !checks(birth, fixNum(l2[19])) ||
        !checks(expiry, fixNum(l2[27]))) return fail('checkdigit');

    var composite = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
    if (!checks(composite, fixNum(l2[43]))) return fail('checkdigit');
    if (personal.replace(/</g, '') && !checks(personal, l2[42])) return fail('checkdigit');

    var parts = l1.slice(5).split('<<');
    return {
      ok: true, reason: '', format: 'TD3',
      fields: {
        documentNumber: number.replace(/</g, ''),
        surname: cleanName(parts[0]),
        givenNames: cleanName(parts[1]),
        nameEn: cleanName((parts[1] || '') + ' ' + (parts[0] || '')),
        nationality: l2.slice(10, 13).replace(/</g, ''),
        issuingCountry: l1.slice(2, 5).replace(/</g, ''),
        birthDate: yyToDate(birth, true),
        sex: l2[20] === '<' ? '' : l2[20],
        expiryDate: yyToDate(expiry, false),
        personalNumber: personal.replace(/</g, '')
      }
    };
  }

  /* ---------- TD1 — גב תעודת זהות, 3×30 ---------- */
  /* המבנה התקבל מנאביגו; המימוש חדש. ההרכב:
     composite = l1[5..30] + l2[0..7] + l2[8..15] + l2[18..29], וספרתו ב-l2[29]. */

  function parseTD1(lines) {
    var l1 = lines[0].toUpperCase().padEnd(30, '<').slice(0, 30);
    var l2 = lines[1].toUpperCase().padEnd(30, '<').slice(0, 30);
    var l3 = lines[2].toUpperCase().padEnd(30, '<').slice(0, 30);
    if ('IAC'.indexOf(l1[0]) === -1) return fail('pattern');

    var number = l1.slice(5, 14);
    var birth = fixNum(l2.slice(0, 6));
    var expiry = fixNum(l2.slice(8, 14));

    if (!checks(number, fixNum(l1[14])) ||
        !checks(birth, fixNum(l2[6])) ||
        !checks(expiry, fixNum(l2[14]))) return fail('checkdigit');

    var composite = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
    if (!checks(composite, fixNum(l2[29]))) return fail('checkdigit');

    var parts = l3.split('<<');
    return {
      ok: true, reason: '', format: 'TD1',
      fields: {
        documentNumber: number.replace(/</g, ''),
        surname: cleanName(parts[0]),
        givenNames: cleanName(parts[1]),
        nameEn: cleanName((parts[1] || '') + ' ' + (parts[0] || '')),
        nationality: l2.slice(15, 18).replace(/</g, ''),
        issuingCountry: l1.slice(2, 5).replace(/</g, ''),
        birthDate: yyToDate(birth, true),
        sex: l2[7] === '<' ? '' : l2[7],
        expiryDate: yyToDate(expiry, false),
        /* שני שדות ה"אופציונלי" — שם יושב לרוב מספר הזהות */
        optional: (l1.slice(15, 30) + '<' + l2.slice(18, 29)).replace(/</g, ' ')
      }
    };
  }

  /* מספר תעודת זהות ישראלי מזהה את עצמו: אין צורך לנחש איפה הוא יושב
     ב-optional data — מריצים כל רצף ספרות דרך ספרת הביקורת, ומה שעובר, עבר. */
  function israeliIdIn(text) {
    var m = String(text || '').match(/\d{5,9}/g) || [];
    for (var i = 0; i < m.length; i++) {
      if (window.KINDS.id.validate(m[i]).ok) return window.KINDS.id.canonical(m[i]);
    }
    return '';
  }

  /* ---------- איתור זוג/שלישיית שורות בטקסט גולמי ---------- */

  function fromText(text) {
    var lines = String(text || '').toUpperCase().split('\n')
      .map(function (l) { return l.replace(/\s/g, '').replace(/[«»]/g, '<'); })
      .filter(function (l) { return l.length >= 25 && /^[A-Z0-9<]+$/.test(l); });

    var lastFail = null;

    /* הגייט הוא על השורה השנייה, לא הראשונה. שורה 1 נושאת שם ומילוי בלבד,
       אין לה ספרת ביקורת, ו-OCR מאבד בה תווי '<' באופן שגרתי — 39 תווים
       במקום 44 הוא המצב הרגיל ולא חריג. השורה שקובעת היא זו שמאמתת את עצמה. */
    for (var i = 0; i < lines.length - 1; i++) {
      if (lines[i][0] !== 'P' || lines[i + 1].length < 40) continue;
      var td3 = parseTD3([lines[i], lines[i + 1]]);
      if (td3.ok) return td3;
      if (td3.reason === 'checkdigit') lastFail = td3;
    }
    for (var j = 0; j < lines.length - 2; j++) {
      if ('IAC'.indexOf(lines[j][0]) === -1) continue;
      if (lines[j + 1].length < 28 || lines[j + 1].length > 32) continue;
      var td1 = parseTD1([lines[j], lines[j + 1], lines[j + 2]]);
      if (td1.ok) return td1;
      if (td1.reason === 'checkdigit') lastFail = td1;
    }
    return lastFail || fail('none');
  }

  /* ---------- Tesseract, טעינה עצלה, same-origin ---------- */

  var _workerP = null;

  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = BASE + 'tesseract.min.js';
      s.onload = res;
      s.onerror = function () { rej(new Error('טעינת רכיב הקריאה נכשלה')); };
      document.head.appendChild(s);
    });
  }

  function worker(onProgress) {
    if (_workerP) return _workerP;
    _workerP = loadScript().then(function () {
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: BASE + 'worker.min.js',
        corePath: BASE,
        langPath: BASE + 'tessdata',
        gzip: true,
        logger: function (m) { if (onProgress) onProgress(m); }
      });
    }).then(function (w) {
      return w.setParameters({ tessedit_char_whitelist: CHARSET }).then(function () { return w; });
    });
    /* כשל טעינה לא נועל את המסלול לנצח */
    _workerP.catch(function () { _workerP = null; });
    return _workerP;
  }

  function toCanvas(blob, bottomFrac) {
    return createImageBitmap(blob).then(function (bmp) {
      var sy = Math.round(bmp.height * (1 - bottomFrac));
      var sh = bmp.height - sy;
      var scale = Math.min(2, 1600 / bmp.width);
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale);
      c.height = Math.round(sh * scale);
      var ctx = c.getContext('2d');
      ctx.filter = 'grayscale(1) contrast(1.3)';
      ctx.drawImage(bmp, 0, sy, bmp.width, sh, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      return c;
    });
  }

  /* ה-MRZ יושב בתחתית המסמך. מנסים קודם את השליש-וחצי התחתון, ורק אם
     אין תוצאה — את המסגרת כולה, שעולה זמן. */
  function read(blob, opts) {
    opts = opts || {};
    var attempts = opts.thorough === false ? [0.45] : [0.45, 1];
    var last = fail('none');
    var oops = null;

    return worker(opts.onProgress).then(function (w) {
      return attempts.reduce(function (chain, frac) {
        return chain.then(function (done) {
          if (done) return done;
          return toCanvas(blob, frac)
            .then(function (c) { return w.recognize(c); })
            .then(function (r) {
              var out = fromText(r.data.text);
              if (out.ok) return out;
              if (out.reason === 'checkdigit') last = out;
              return null;
            })
            .catch(function (e) {
              /* כשל של הרצה בודדת נזכר ולא נבלע — "לא נמצא MRZ" ו"ה-OCR
                 קרס" הם שני מצבים שונים לגמרי במסך האישור. */
              oops = e;
              return null;
            });
        });
      }, Promise.resolve(null));
    }).then(function (hit) {
      if (hit) return hit;
      if (oops && last.reason === 'none') {
        return { ok: false, reason: 'ocr', fields: null, message: String(oops && oops.message || oops) };
      }
      return last;
    }).catch(function (e) {
      return { ok: false, reason: 'load', fields: null, message: String(e && e.message || e) };
    });
  }

  window.MRZ = {
    read: read,
    fromText: fromText,
    parseTD3: parseTD3,
    parseTD1: parseTD1,
    checkDigit: checkDigit,
    israeliIdIn: israeliIdIn,
    /* משקל ההורדה החד-פעמית, למסך ההסכמה */
    ASSET_MB: 6.7
  };
})();
