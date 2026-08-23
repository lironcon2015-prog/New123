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
     ריבוע חתוך מהמרכז, מוקטן ומקודד ל-data URL. נשמר על רשומת הישות
     ולא בחנות ה-blobs: הוא נצבע בכל כרטיס ובכל שורה, ותצוגה שמחכה
     לקריאה אסינכרונית מהדיסק מהבהבת. הוא גם מסתנכרן לדרייב עם הישות
     בלי שורת קוד נוספת בסנכרון.

     ההקטנה ל-192px נעשית פעם אחת בבחירה, ולכן המחיר משולם שם ולא בכל
     רינדור. איכות יורדת בלולאה עד שהתוצאה נכנסת לתקרה. */
  F.avatar = function (file) {
    if (typeof createImageBitmap !== 'function') {
      return Promise.reject(new Error('הדפדפן הזה לא יודע לקרוא את הקובץ'));
    }
    return createImageBitmap(file).then(function (bitmap) {
      var edge = Math.min(bitmap.width, bitmap.height);
      var sx = Math.round((bitmap.width - edge) / 2);
      var sy = Math.round((bitmap.height - edge) / 2);
      var size = C.AVATAR_EDGE;
      var canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d').drawImage(bitmap, sx, sy, edge, edge, 0, 0, size, size);
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
