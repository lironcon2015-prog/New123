/* parse.js — צינור הפרסינג. כל המסלולים נכנסים לכאן ויוצאים כהצעה אחת.
   שום דבר לא נשמר מכאן. הפלט הולך למסך האישור, ורק שמירה כותבת ל-DB. */
(function () {
  'use strict';

  var U = window.U, DT = window.DOC_TYPES, MRZ = window.MRZ, KINDS = window.KINDS;

  var REASONS = {
    none:       { level: 'info', text: 'לא זוהו שורות MRZ בצילום' },
    checkdigit: { level: 'warn', text: 'זוהו שורות MRZ אבל ספרת הביקורת נכשלה — כנראה צילום מטושטש. בדוק את הצילום או מלא ידנית.' },
    pattern:    { level: 'info', text: 'הצילום אינו נראה כמו מסמך עם MRZ' },
    ocr:        { level: 'warn', text: 'קריאת הצילום נכשלה. נסה לצלם שוב באור טוב יותר.' },
    load:       { level: 'warn', text: 'רכיב הקריאה לא נטען. נדרשת רשת בפעם הראשונה בלבד.' }
  };

  var P = {};

  P.ASSET_MB = MRZ.ASSET_MB;

  /* ---------- הצעה ריקה ---------- */
  function empty(typeKey) {
    return {
      typeKey: typeKey || null,
      values: {},          /* key של שדה בטבלה → ערך */
      issueDate: null,
      expiryDate: null,
      unverified: [],      /* שדות שנשמרים לא מאומתים גם אם אין להם ולידטור */
      dropFiles: false,
      origin: null,        /* 'mrz' | 'gemini' | 'text' */
      notice: null
    };
  }

  P.empty = empty;

  /* ---------- MRZ ---------- */

  /* הפורמט קובע את הסוג. הצילום לא צריך לספר לנו מה הוא — TD3 הוא דרכון,
     TD1 הוא תעודת זהות, וזו הבחנה שספרות הביקורת כבר אימתו. */
  P.fromMrz = function (blob, opts) {
    return MRZ.read(blob, opts || {}).then(function (r) {
      if (!r.ok) {
        var out = empty(null);
        out.notice = REASONS[r.reason] || REASONS.none;
        if (r.message) out.notice = { level: out.notice.level, text: out.notice.text };
        return out;
      }

      var type = DT.byMrzFormat(r.format);
      if (!type) {
        var unknown = empty(null);
        unknown.notice = REASONS.none;
        return unknown;
      }

      var p = empty(type.key);
      p.origin = 'mrz';

      var derived = {
        israeliId: r.fields.optional ? MRZ.israeliIdIn(r.fields.optional) : ''
      };

      Object.keys(type.mrzMap || {}).forEach(function (fieldKey) {
        var src = type.mrzMap[fieldKey];
        var v = derived[src] !== undefined ? derived[src] : r.fields[src];
        if (v) p.values[fieldKey] = v;
      });

      p.expiryDate = r.fields.expiryDate || null;

      /* לשורת השם אין ספרת ביקורת. היא נכנסת, ונכנסת לא מאומתת. */
      Object.keys(type.mrzMap || {}).forEach(function (fieldKey) {
        if (/name/i.test(type.mrzMap[fieldKey])) p.unverified.push(fieldKey);
      });

      p.dropFiles = !type.allowFiles;
      p.notice = {
        level: 'ok',
        text: p.dropFiles
          ? 'נקרא מהצילום. הצילום עצמו לא נשמר — לסוג הזה נשמרים שדות בלבד.'
          : 'נקרא מהצילום. ספרות הביקורת עברו.'
      };
      return p;
    });
  };

  /* ---------- הצעת ישויות מתוך שדה ---------- */
  /* DEC-04: מציעים, לא יוצרים. עובד על כל סוג שהטבלה מסמנת ב-peopleFrom,
     ולכן גם בהזנה ידנית ולא רק אחרי פרסינג. */
  P.peopleIn = function (typeKey, values) {
    var type = DT.get(typeKey);
    if (!type || !type.peopleFrom) return [];
    var raw = values[type.peopleFrom];
    if (!raw) return [];
    return String(raw).split(/[\n,;]+/)
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l.length >= 2; })
      .map(function (l) {
        var year = (l.match(/\b(19|20)\d{2}\b/) || [])[0] || '';
        var name = l.replace(/\b(19|20)\d{2}\b/, '').replace(/[·\-–—]+/g, ' ').trim();
        return { name: name || l, year: year };
      })
      .filter(function (p) { return p.name; });
  };

  /* ---------- מיזוג הצעה לתוך ערכים קיימים ---------- */
  P.applyTo = function (proposal, current) {
    var out = {};
    Object.keys(current || {}).forEach(function (k) { out[k] = current[k]; });
    Object.keys(proposal.values || {}).forEach(function (k) {
      if (proposal.values[k]) out[k] = proposal.values[k];
    });
    return out;
  };

  window.Parse = P;
})();
