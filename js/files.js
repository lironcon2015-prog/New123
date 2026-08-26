/* files.js — נרמול קבצים. SPEC §7.2. */
(function () {
  'use strict';

  var C = window.CONFIG, U = window.U;

  function isPdf(f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''); }

  function isHeic(f) {
    return /hei[cf]/i.test(f.type || '') || /\.hei[cf]$/i.test(f.name || '');
  }

  function toJpeg(bitmap) {
    var scale = Math.min(1, C.IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    var w = Math.max(1, Math.round(bitmap.width * scale));
    var h = Math.max(1, Math.round(bitmap.height * scale));
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    return new Promise(function (res, rej) {
      canvas.toBlob(function (blob) {
        blob ? res(blob) : rej(new Error('הקידוד ל-JPEG נכשל'));
      }, 'image/jpeg', C.JPEG_QUALITY);
    });
  }

  var F = {};

  /* מחזיר { blob, mime, name, size, converted } או זורק עם הודעה בעברית.
     PDF עובר כמו שהוא. תמונה קטנה וקלה עוברת כמו שהיא.
     כל השאר — כולל HEIC — עוברת createImageBitmap → canvas → JPEG. */
  F.normalize = function (file) {
    if (isPdf(file)) {
      return Promise.resolve({
        blob: file, mime: 'application/pdf', name: file.name || 'מסמך.pdf',
        size: file.size, converted: false
      });
    }

    if (typeof createImageBitmap !== 'function') {
      return Promise.reject(new Error('הדפדפן הזה לא יודע לקרוא את הקובץ'));
    }

    /* המימדים ידועים רק אחרי פענוח, ולכן הפענוח קודם להחלטה. תמונה שעוברת
       את שני התנאים — צלע ומשקל — מוחזרת כמות שהיא ולא מקודדת מחדש. */
    return createImageBitmap(file).then(function (bitmap) {
      var edge = Math.max(bitmap.width, bitmap.height);
      var plain = /^image\/(jpeg|png|webp)$/.test(file.type || '');

      if (plain && edge <= C.IMAGE_MAX_EDGE && file.size <= C.IMAGE_PASS_BYTES) {
        if (bitmap.close) bitmap.close();
        return {
          blob: file, mime: file.type, name: file.name || 'תמונה',
          size: file.size, converted: false
        };
      }

      return toJpeg(bitmap).then(function (blob) {
        /* JPEG על תמונה סינתטית — צילום מסך, טקסט, שטחים אחידים — יוצא
           גדול מ-PNG המקורי. נרמול לא מייצר קובץ שמן יותר ממה שקיבל. */
        if (blob.size >= file.size && plain && file.size <= C.IMAGE_PASS_BYTES) {
          return {
            blob: file, mime: file.type, name: file.name || 'תמונה',
            size: file.size, converted: false
          };
        }
        var base = (file.name || 'תמונה').replace(/\.[^.]+$/, '');
        return {
          blob: blob, mime: 'image/jpeg', name: base + '.jpg',
          size: blob.size, converted: true, originalSize: file.size
        };
      });
    }).catch(function () {
      /* לא שומרים קובץ שבור בשקט — SPEC §7.2 */
      throw new Error(isHeic(file)
        ? 'לא הצלחתי להמיר את קובץ ה-HEIC. נסה לצלם שוב או לשמור כ-JPEG.'
        : 'לא הצלחתי לקרוא את הקובץ. ייתכן שהוא פגום או בפורמט שאינו נתמך.');
    });
  };

  /* ---------- עותק לשליחה — DEC-44 ----------
     מה שנשמר במכשיר ומה שנשלח לפרסינג אינם חייבים להיות אותו קובץ.
     הכספת שומרת 2400px כדי שהמסמך ייקרא על המסך; הפרסינג מקבל קטן
     ממנו, מפני שגוגל מרצפת תמונה ל-768px לפני שהיא קוראת אותה —
     הפיקסלים העודפים אינם קונים דיוק, הם קונים שניות של העלאה.

     **המקור אינו נוגע בזה.** מה שמוקטן כאן חי עד סוף הבקשה. */
  F.forParse = function (blob, mime) {
    var type = mime || blob.type || '';
    if (type === 'application/pdf' || typeof createImageBitmap !== 'function') {
      return Promise.resolve({ blob: blob, mime: type });
    }
    if (String(type).indexOf('image/') !== 0) {
      return Promise.resolve({ blob: blob, mime: type });
    }

    return createImageBitmap(blob).then(function (bitmap) {
      var edge = Math.max(bitmap.width, bitmap.height);
      var scale = Math.min(1, C.GEMINI_EDGE / edge);
      var w = Math.max(1, Math.round(bitmap.width * scale));
      var h = Math.max(1, Math.round(bitmap.height * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();
      return new Promise(function (res) {
        canvas.toBlob(function (out) {
          /* הקטנה שמייצרת קובץ שמן יותר אינה הקטנה. אותו כלל של
             `normalize`, ומאותה סיבה: JPEG על תמונה סינתטית מנפח. */
          res(out && out.size < blob.size
            ? { blob: out, mime: 'image/jpeg' }
            : { blob: blob, mime: type });
        }, 'image/jpeg', C.GEMINI_QUALITY);
      });
    }).catch(function () {
      /* קובץ שאי אפשר לפענח כאן עדיין עשוי להיקרא אצל גוגל. ההקטנה היא
         אופטימיזציה, ואופטימיזציה שנכשלת אינה מפילה את הפעולה. */
      return { blob: blob, mime: type };
    });
  };

  F.normalizeAll = function (fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var out = [], errors = [];
    return files.reduce(function (chain, f) {
      return chain.then(function () {
        return F.normalize(f).then(function (r) { out.push(r); },
          function (e) { errors.push(e.message); });
      });
    }, Promise.resolve()).then(function () {
      return { files: out, errors: errors };
    });
  };

  /* שם ברירת מחדל לקובץ שהגיע מהלוח — שם אין לו אחד */
  F.nameFor = function (mime) {
    var ext = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/webp': '.webp' }[mime] ||
              (String(mime || '').indexOf('image/') === 0 ? '.jpg' : '');
    return 'הדבקה' + ext;
  };

  /* מ-clipboard או מ-drop */
  F.fromDataTransfer = function (dt) {
    if (!dt) return [];
    if (dt.files && dt.files.length) return Array.prototype.slice.call(dt.files);
    var out = [];
    Array.prototype.forEach.call(dt.items || [], function (it) {
      if (it.kind === 'file') {
        var f = it.getAsFile();
        if (f) out.push(f);
      }
    });
    return out;
  };

  /* ---------- אווטאר של ישות ----------
     מוקטן ומקודד ל-data URL. נשמר על רשומת הישות ולא בחנות ה-blobs:
     הוא נצבע בכל כרטיס ובכל שורה, ותצוגה שמחכה לקריאה אסינכרונית
     מהדיסק מהבהבת. הוא גם מסתנכרן לדרייב עם הישות בלי שורת קוד בסנכרון.

     **התמונה נשמרת שלמה ולא נחתכת כאן.** החיתוך לעיגול הוא `object-fit`
     בזמן תצוגה, עם `object-position` שהמשתמש בוחר — ולכן אפשר להזיז את
     המסגרת גם חודש אחרי הבחירה, בלי לבקש את הקובץ המקורי שכבר אין.

     מה שנקבע הוא **הצלע הקצרה**: כל חיתוך ריבועי אפשרי יוצא לפחות
     בגודל הזה. איכות יורדת בלולאה עד שהתוצאה נכנסת לתקרה. */
  /* ---------- ריפוד לריבוע ----------
     העיגול חותך ריבוע מהמרכז, ובתצלום של רכב או של בית **הרוחב הוא
     הנושא** — חיתוך כזה מותיר ידית דלת. לכן תמונה רחבה מ-
     `AVATAR_WIDE_RATIO` מרופדת לריבוע כבר בייבוא, ומכאן והלאה שום דבר
     במסלול אינו יודע שהיה הבדל: אותה רשומה, אותו `object-fit: cover`,
     ואותו בורר מסגרת — שמזהה ריבוע ואומר "אין מה להזיז".

     רק **רחבה**, לא גם גבוהה: תצלום אנכי הוא כמעט תמיד של אדם, והריבוע
     שנחתך ממרכזו הוא הפנים. ריפוד שלו היה מכווץ את מי שצולם. */

  /* צבע הריפוד נדגם מהמסגרת של התצלום עצמו — ממוצע של טבעת הפיקסלים
     בשוליו. ניסיתי קודם רקע מטושטש של התמונה, וזה נראה טוב עד שמסתכלים
     מקרוב: תצלום רכב על לבן מודבק על מריחה כהה משאיר תפר מלבני חד.
     הרקע של התצלום הוא הדבר היחיד שממשיך אותו בלי תפר. */
  function padColor(bitmap) {
    var n = 24;
    var c = document.createElement('canvas');
    c.width = n; c.height = n;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bitmap, 0, 0, n, n);
    var d = x.getImageData(0, 0, n, n).data;
    var r = 0, g = 0, b = 0, k = 0;
    function take(px, py) {
      var o = (py * n + px) * 4;
      r += d[o]; g += d[o + 1]; b += d[o + 2]; k++;
    }
    for (var i = 0; i < n; i++) { take(i, 0); take(i, n - 1); take(0, i); take(n - 1, i); }
    return 'rgb(' + Math.round(r / k) + ',' + Math.round(g / k) + ',' + Math.round(b / k) + ')';
  }

  function squarePad(bitmap, side) {
    var canvas = document.createElement('canvas');
    canvas.width = side; canvas.height = side;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = padColor(bitmap);
    ctx.fillRect(0, 0, side, side);

    /* העיגול הוא המעגל החסום בריבוע, ולכן הפינות ממילא נחתכות. שוליים
       של 4% בכל צד מונעים מהנושא לגעת בדופן — מכונית שנוגעת בקצה
       העיגול נראית כאילו לא נכנסה, גם כשהיא שלמה. */
    var fit = Math.min(side / bitmap.width, side / bitmap.height) * 0.92;
    var fw = bitmap.width * fit, fh = bitmap.height * fit;
    ctx.drawImage(bitmap, (side - fw) / 2, (side - fh) / 2, fw, fh);
    return canvas;
  }

  F.avatar = function (file) {
    if (typeof createImageBitmap !== 'function') {
      return Promise.reject(new Error('הדפדפן הזה לא יודע לקרוא את הקובץ'));
    }
    return createImageBitmap(file).then(function (bitmap) {
      var canvas;
      if (bitmap.width / bitmap.height > C.AVATAR_WIDE_RATIO) {
        /* הצלע לא עולה על רוחב המקור — אין הגדלה של פיקסלים שאין */
        canvas = squarePad(bitmap, Math.min(bitmap.width, C.AVATAR_SQUARE_EDGE));
      } else {
        var short = Math.min(bitmap.width, bitmap.height);
        var scale = Math.min(1, C.AVATAR_SHORT_EDGE / short);
        var w = Math.max(1, Math.round(bitmap.width * scale));
        var h = Math.max(1, Math.round(bitmap.height * scale));
        canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      }
      if (bitmap.close) bitmap.close();

      var q = C.AVATAR_QUALITY, url = '';
      for (var i = 0; i < 4; i++) {
        url = canvas.toDataURL('image/jpeg', q);
        if (url.length * 0.75 <= C.AVATAR_MAX_BYTES) return url;
        q -= 0.15;
      }
      return url;
    }).catch(function () {
      throw new Error('לא הצלחתי לקרוא את התמונה. נסה קובץ אחר.');
    });
  };

  F.label = function (rec) {
    if (rec.converted && rec.originalSize) {
      return U.bytes(rec.size) + ' · הומר מ-' + U.bytes(rec.originalSize);
    }
    return U.bytes(rec.size);
  };

  window.Files = F;
})();
