/* versions.js — מסמך מעודכן שדוחק מסמך קודם. SPEC §6.6.
   הזהות נגזרת מהטבלה: **שדות החובה של הסוג הם מה שמזהה מסמך**. רישיון רכב
   מזוהה בלוחית, פוליסה במספר ובחברה, תעודת זהות במספר ובשם. הוספת סוג חדש
   לא דורשת שורה כאן — היא מביאה איתה את שדות החובה שלה.

   מה שנשמר על הרשומה הוא `supersededBy` בלבד — מצביע קדימה, לגרסה שדחקה
   אותה. השרשרת נגזרת ממנו בזמן ריצה, ואין ערך נגזר שנשמר. */
(function () {
  'use strict';

  var DT = window.DOC_TYPES, KINDS = window.KINDS;

  var V = {};

  /* מפתח זהות. `null` כשחסר ולו שדה חובה אחד — בלי כל שדות החובה אין די
     ראיות כדי לקרוא לשני מסמכים "אותו מסמך", והשתיקה עדיפה על ניחוש. */
  V.identity = function (doc) {
    var t = doc && DT.get(doc.typeKey);
    if (!t || !doc.entityId || doc.deleted) return null;
    var required = t.fields.filter(function (f) { return f.required; });
    if (!required.length) return null;
    var parts = [];
    for (var i = 0; i < required.length; i++) {
      var def = required[i];
      var f = (doc.fields || []).filter(function (x) { return x.key === def.key; })[0];
      if (!f || !f.value) return null;
      parts.push(def.key + '=' + KINDS.get(def.kind).canonical(f.value));
    }
    return doc.entityId + '|' + doc.typeKey + '|' + parts.join('&');
  };

  /* סדר הגרסאות: תפוגה, ואז הנפקה, ואז חותמת הזמן. תאריך התפוגה קודם
     מפני שהוא מה שמייצר את הצורך — מסמך "מעודכן" הוא זה שתקף יותר. */
  V.rank = function (doc) {
    return [doc.expiryDate || '', doc.issueDate || '', String(doc.updatedAt || 0)];
  };

  V.cmp = function (a, b) {
    var ra = V.rank(a), rb = V.rank(b);
    for (var i = 0; i < ra.length; i++) {
      if (ra[i] > rb[i]) return 1;
      if (ra[i] < rb[i]) return -1;
    }
    return 0;
  };

  /* כל המסמכים שהם אותו מסמך, למעט הרשומה עצמה */
  V.family = function (doc, docs) {
    var key = V.identity(doc);
    if (!key) return [];
    return (docs || []).filter(function (d) {
      return d.id !== doc.id && !d.deleted && V.identity(d) === key;
    });
  };

  /* טהורה. מה לכתוב, בלי לגעת ב-DB:
       supersede    — מזהים שצריכים להצביע על הרשומה הזאת
       supersededBy — הרשומה עצמה ישנה יותר וצריכה להצביע על אחר */
  V.plan = function (doc, docs) {
    var fam = V.family(doc, docs);
    if (!fam.length) return { supersede: [], supersededBy: null };

    var newest = fam.reduce(function (a, b) { return V.cmp(a, b) >= 0 ? a : b; });
    if (V.cmp(doc, newest) <= 0) {
      return { supersede: [], supersededBy: newest.id };
    }

    /* רק ראשי השרשרת מוסטים. מי שכבר מצביע קדימה נשאר מצביע לשם,
       והשרשרת נשמרת שלמה במקום להשתטח. */
    var ids = {};
    ids[doc.id] = 1;
    fam.forEach(function (d) { ids[d.id] = 1; });
    return {
      supersede: fam.filter(function (d) {
        return !d.supersededBy || !ids[d.supersededBy];
      }).map(function (d) { return d.id; }),
      supersededBy: null
    };
  };

  /* מסמך נחשב נדחק רק אם היורש שלו באמת קיים ברשימה. מחיקת היורש
     מחזירה את הקודם לחיים במקום להעלים את שניהם. */
  V.live = function (docs) {
    var ids = {};
    (docs || []).forEach(function (d) { ids[d.id] = 1; });
    return (docs || []).filter(function (d) {
      return !(d.supersededBy && ids[d.supersededBy]);
    });
  };

  V.isSuperseded = function (doc, docs) {
    if (!doc || !doc.supersededBy) return false;
    return (docs || []).some(function (d) { return d.id === doc.supersededBy; });
  };

  /* היורש הישיר, או null */
  V.successor = function (doc, docs) {
    if (!doc || !doc.supersededBy) return null;
    return (docs || []).filter(function (d) { return d.id === doc.supersededBy; })[0] || null;
  };

  /* הגרסה העדכנית של אותו מסמך — הולכים על השרשרת עד הסוף.
     שומר על מונה כדי שמחזור בנתונים לא ייתקע בלולאה. */
  V.latest = function (doc, docs) {
    var cur = doc, hops = 0;
    while (cur && hops++ < 50) {
      var next = V.successor(cur, docs);
      if (!next) return cur;
      cur = next;
    }
    return cur;
  };

  /* כל הגרסאות הקודמות של מסמך, מהחדשה לישנה */
  V.previous = function (doc, docs) {
    return V.family(doc, docs)
      .filter(function (d) { return V.latest(d, docs).id === doc.id; })
      .sort(function (a, b) { return V.cmp(b, a); });
  };

  window.Versions = V;
})();
