/* vault.js — שער PIN. DEC-03: דלוק כברירת מחדל, ניתן לכיבוי מההגדרות.

   **אין לזה קנון בנאביגו** (DEC-07). האפיון §9 מפנה ל-`js/vault.js` שלה, אבל
   ה-PIN שם מגן רק על פתיחת כספת הדרכונים והוא כבוי כברירת מחדל — מודל אחר.
   מה שכן התקבל משם: SHA-256 ללא מלח על PIN בן 4 ספרות הוא **נוחות ולא
   אבטחה** — 10,000 אפשרויות נסרקות בפחות משנייה. השער מונע הצצה של מי
   שהרים את המכשיר, ולא יותר. הגנה אמיתית דורשת הצפנת ה-blobs במפתח נגזר,
   וזה נאסר מפורשות ב-§1 באפיון.

   נעילה מחדש אחרי זמן ברקע קיימת כאן ולא שם: נאביגו סימנה את היעדרה
   כפער ולא כהחלטה. */
(function () {
  'use strict';

  var C = window.CONFIG, S = window.Settings;
  var unlocked = false;
  var hiddenAt = 0;

  function sha256Hex(text) {
    var buf = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', buf).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  var V = {};

  V.enabled = function () { return !!S.get(C.K.pinEnabled); };
  V.hasPin = function () { return !!S.get(C.K.pinHash); };
  V.isUnlocked = function () { return unlocked || !V.enabled() || !V.hasPin(); };

  V.setPin = function (pin) {
    return sha256Hex(pin).then(function (h) {
      return S.set(C.K.pinHash, h);
    }).then(function () {
      return S.set(C.K.pinEnabled, true);
    }).then(function () { unlocked = true; });
  };

  V.verify = function (pin) {
    return sha256Hex(pin).then(function (h) {
      var okay = h === S.get(C.K.pinHash);
      if (okay) unlocked = true;
      return okay;
    });
  };

  V.disable = function () {
    unlocked = true;
    return S.set(C.K.pinEnabled, false).then(function () {
      return S.set(C.K.pinHash, '');
    });
  };

  V.lock = function () { unlocked = false; };

  /* נעילה מחדש אחרי זמן ברקע. הכניסה לרקע לבדה אינה נועלת —
     החלפה מהירה לאפליקציית הודעות כדי להדביק מספר היא תרחיש שכיח. */
  V.watch = function (onLock) {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (!V.enabled() || !V.hasPin() || !unlocked) return;
      var minutes = Number(S.get(C.K.autoLockMinutes)) || 0;
      if (minutes > 0 && hiddenAt && Date.now() - hiddenAt > minutes * 60000) {
        V.lock();
        onLock();
      }
    });
  };

  window.Vault = V;
})();
