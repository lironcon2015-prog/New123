/* share.js — הוצאת קובץ מהאפליקציה. SPEC §7.5.
   שלושה מסלולים בסדר יורד: Web Share עם קובץ · הורדה · פתיחה בכרטיסייה.
   הראשון הוא היחיד שמגיע לוואטסאפ ולמייל, והשניים האחרים קיימים כדי
   שכפתור השיתוף לא יהיה כפתור שאינו עושה דבר בדפדפן שאינו תומך. */
(function () {
  'use strict';

  var U = window.U;

  var EXT = {
    'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png',
    'image/webp': 'webp', 'image/heic': 'heic', 'text/plain': 'txt'
  };

  var Sh = {};

  /* שם קובץ שאפשר לכתוב לדיסק: בלי מפרידי נתיב ובלי תווים שמורים,
     עם סיומת שנגזרת מה-mime כשאין אחת. */
  Sh.safeName = function (name, mime) {
    var s = String(name || 'מסמך').replace(/[\\\/:*?"<>|]+/g, ' ').trim();
    s = s.replace(/\s+/g, ' ').replace(/\s+\./g, '.').slice(0, 80) || 'מסמך';
    var ext = EXT[mime] || '';
    if (ext && !new RegExp('\\.' + ext + '$', 'i').test(s)) s += '.' + ext;
    return s;
  };

  Sh.canShareFiles = function () {
    return typeof navigator !== 'undefined' &&
           !!navigator.canShare && !!navigator.share &&
           typeof File === 'function';
  };

  /* מחזירה 'share' | 'download' | 'tab' | 'cancel' — איזה מסלול נבחר בפועל.
     הקוראים משתמשים בזה כדי לומר למשתמש מה קרה, במקום לשתוק. */
  Sh.file = function (blob, name, mime) {
    var fname = Sh.safeName(name, mime || blob.type);
    var type = mime || blob.type || 'application/octet-stream';

    if (Sh.canShareFiles()) {
      var f = new File([blob], fname, { type: type });
      var data = { files: [f], title: fname };
      var ok = false;
      try { ok = navigator.canShare(data); } catch (e) { ok = false; }
      if (ok) {
        return navigator.share(data).then(function () { return 'share'; },
          function (e) {
            /* ביטול של המשתמש אינו כישלון ואינו מצדיק נפילה למסלול אחר */
            if (e && e.name === 'AbortError') return 'cancel';
            return Sh.download(blob, fname);
          });
      }
    }
    return Promise.resolve(Sh.download(blob, fname));
  };

  Sh.download = function (blob, fname) {
    var url = URL.createObjectURL(blob);
    var a = U.el('a', { href: url, download: fname, class: 'hidden-input' });
    document.body.appendChild(a);
    var mode = 'download';
    try {
      a.click();
    } catch (e) {
      window.open(url, '_blank');
      mode = 'tab';
    }
    /* השחרור נדחה — ביטול מיידי קוטע את ההורדה בחלק מהדפדפנים */
    setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 60000);
    return mode;
  };

  /* שיתוף טקסט — פרטי מסמך, לא הקובץ. אותו סדר נסיגה, ובסופו הלוח. */
  Sh.text = function (title, text) {
    if (navigator.share) {
      return navigator.share({ title: title, text: text }).then(function () { return 'share'; },
        function (e) {
          if (e && e.name === 'AbortError') return 'cancel';
          window.UI.copy(text);
          return 'copy';
        });
    }
    window.UI.copy(text);
    return Promise.resolve('copy');
  };

  window.Share = Sh;
})();
