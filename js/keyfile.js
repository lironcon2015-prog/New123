/* keyfile.js — קובץ המפתחות. SPEC §12.8.

   מכשיר שני מתחיל ריק, וכל מה שמפריד בינו לבין אפליקציה מלאה הוא כמה
   מחרוזות שאי אפשר לנחש ואי אפשר להקליד בלי טעות: כתובת הגשר, הסוד,
   מזהה הלקוח ומפתח Gemini. הקובץ נושא אותן, וזה **כל** תפקידו —
   הוא אינו נושא נתונים. הכספת עצמה מגיעה מהסנכרון הראשון, שהמפתחות
   הם מה שמאפשר אותו: מדביקים קובץ אחד, ומיד יש גם מסמכים.

   `CONFIG.KEYFILE.FIELDS` היא המקור היחיד. אותה טבלה קובעת מה נכתב
   לקובץ, מה מוצג לפני הייבוא ומה נכתב ל-settings — ולכן **מפתח נייד
   נוסף הוא שורה בטבלה ואפס קוד חדש**, בדיוק כמו סוג מסמך.

   מה שאינו נוסע, ובכוונה:
     · `pinHash` — שער של מכשיר, לא של חשבון. קוד שנוסע בקובץ הופך
       את הנעילה למשותפת, ומי שמקבל את הקובץ כבר מקבל את הנתונים.
     · הסכמות השליחה לגוגל — אישור אישי. ייבוא שמדליק אותן בשקט שולח
       צילומי תעודות זהות לשרת בלי שאיש אמר "כן".
     · `driveFolderId` ו-`driveDbFileId` — קאש של מצביעים בחשבון אחר.
       מצביע שגוי גרוע ממצביע חסר: החסר נמצא מחדש, השגוי מפנה לכלום. */
(function () {
  'use strict';

  var C = window.CONFIG, U = window.U, S = window.Settings, KINDS = window.KINDS;
  var F = C.KEYFILE;

  var KF = {};

  function field(key) {
    for (var i = 0; i < F.FIELDS.length; i++) {
      if (F.FIELDS[i].key === key) return F.FIELDS[i];
    }
    return null;
  }

  /* ערך שעבר את הטבלה, או `null`. גם בייצוא וגם בייבוא, ובאותה
     פונקציה — קובץ שנערך ביד או נוצר בגרסה אחרת לא יזליג טיפוס שגוי
     לתוך `settings`. `bridgeUrl` שהוא מספר נשבר בקריאה הבאה לגשר,
     רחוק מאוד מהמקום שבו הוא נכנס. */
  function clean(f, v) {
    if (!f) return null;
    if (f.type === 'list') {
      if (!Array.isArray(v)) return null;
      var list = v.map(function (x) { return String(x == null ? '' : x).trim(); })
                  .filter(Boolean);
      return list.length ? list : null;
    }
    if (typeof v !== 'string') return null;
    var s = v.trim();
    if (!s) return null;
    if (f.type === 'enum' && !optionOf(f, s)) return null;
    return s;
  }

  function optionOf(f, v) {
    var hit = null;
    (f.options || []).forEach(function (o) { if (o.key === v) hit = o; });
    return hit;
  }

  /* ---------- ייצוא ---------- */

  KF.build = function () {
    var keys = {};
    F.FIELDS.forEach(function (f) {
      var v = clean(f, S.get(f.key));
      if (v !== null) keys[f.key] = v;
    });
    return {
      app: F.APP, kind: F.KIND, format: F.FORMAT,
      created: U.now(), keys: keys
    };
  };

  /* "יש מה לייצא" אינו "יש ערך כלשהו": `backupMode` תמיד מלא, ומפל
     המודלים הוא העדפה. קובץ שנושא רק אותם הוא קובץ ריק שנראה מלא. */
  KF.has = function () {
    var keys = KF.build().keys;
    return F.FIELDS.some(function (f) {
      return !f.pref && keys[f.key] !== undefined;
    });
  };

  KF.name = function (d) {
    return 'מפתחות-התיק-המשפחתי-' + U.todayYmd(d) + '.json';
  };

  KF.blob = function () {
    return new Blob([JSON.stringify(KF.build(), null, 2)],
      { type: 'application/json' });
  };

  /* ---------- ייבוא ---------- */

  /* זורקת עם הודעה בעברית שאומרת **מה** לא בסדר בקובץ. "קובץ לא תקין"
     שולח את מי שקיבל אותו לנחש בין ארבעה מצבים שונים לגמרי. */
  KF.parse = function (text) {
    var j = null;
    try { j = JSON.parse(String(text == null ? '' : text)); } catch (e) { j = null; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      throw new Error('זה אינו קובץ מפתחות — לא הצלחנו לקרוא אותו');
    }
    if (j.app !== F.APP || j.kind !== F.KIND) {
      throw new Error('הקובץ אינו קובץ מפתחות של התיק המשפחתי');
    }
    if (Number(j.format) > F.FORMAT) {
      throw new Error('הקובץ נוצר בגרסה חדשה יותר — עדכן את האפליקציה ונסה שוב');
    }
    var src = j.keys && typeof j.keys === 'object' ? j.keys : {};
    var keys = {};
    /* לפי הטבלה ולא לפי הקובץ: מפתח שאיננו מכירים אינו נכתב, וכך קובץ
       מגרסה עתידית נקלט חלקית במקום להישבר או להבריח מפתח זר. */
    F.FIELDS.forEach(function (f) {
      var v = clean(f, src[f.key]);
      if (v !== null) keys[f.key] = v;
    });
    if (!Object.keys(keys).length) {
      throw new Error('אין בקובץ אף מפתח שאפשר לטעון');
    }
    return keys;
  };

  /* מה שהמשתמש רואה לפני שהוא מאשר. סודות ממוסכים באותו מיסוך של
     שדה רגיש במסמך — ארבעה תווים אחרונים, מספיק כדי לוודא שזה הקובץ
     הנכון ולא מספיק כדי לקרוא אותו מעל הכתף. */
  KF.rows = function (keys) {
    return F.FIELDS.filter(function (f) {
      return keys[f.key] !== undefined;
    }).map(function (f) {
      var v = keys[f.key];
      var text;
      if (f.secret) text = KINDS.mask(v);
      else if (f.type === 'list') text = v.join(' · ');
      else if (f.type === 'enum') text = (optionOf(f, v) || { label: v }).label;
      else text = v;
      return { key: f.key, label: f.label, text: text };
    });
  };

  /* מיזוג ולא החלפה: קובץ שנושא רק מפתח Gemini לא ימחק גשר מוגדר.
     כתיבה סדרתית — הערך הבא נכתב רק אחרי שקודמו ירד לדיסק, ולכן
     ייבוא שנקטע באמצע משאיר הגדרות שלמות ולא חצי הגדרה. */
  KF.apply = function (keys) {
    var list = Object.keys(keys).filter(function (k) { return !!field(k); });
    return list.reduce(function (p, k) {
      return p.then(function () { return S.set(k, keys[k]); });
    }, Promise.resolve()).then(function () { return list.length; });
  };

  window.KeyFile = KF;
})();
