/* kinds.js — רישום סוגי שדה. SPEC §4.
   אין if על שם kind מחוץ לקובץ הזה. */
(function () {
  'use strict';

  var digits = function (v) { return String(v == null ? '' : v).replace(/\D/g, ''); };
  var trim = function (v) { return String(v == null ? '' : v).trim(); };
  var ok = { ok: true, reason: '' };
  var bad = function (r) { return { ok: false, reason: r }; };

  /* ספרת ביקורת של תעודת זהות ישראלית — SPEC §4.1 */
  function israeliIdValid(raw) {
    var s = digits(raw).padStart(9, '0');
    if (s.length !== 9) return false;
    var sum = 0;
    for (var i = 0; i < 9; i++) {
      var d = Number(s[i]) * (i % 2 === 0 ? 1 : 2);
      if (d > 9) d -= 9;
      sum += d;
    }
    return sum % 10 === 0;
  }

  function ibanValid(raw) {
    var s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.length < 15 || s.length > 34) return false;
    var re = s.slice(4) + s.slice(0, 4);
    var expanded = re.replace(/[A-Z]/g, function (c) { return c.charCodeAt(0) - 55; });
    var rem = 0;
    for (var i = 0; i < expanded.length; i++) rem = (rem * 10 + Number(expanded[i])) % 97;
    return rem === 1;
  }

  var KINDS = {

    id: {
      label: 'תעודת זהות',
      inputMode: 'numeric',
      sensitive: true,
      copyAs: 'canonical',
      canonical: function (v) { return digits(v); },
      format: function (v) { var s = digits(v); return s ? s.padStart(9, '0') : ''; },
      validate: function (v) {
        if (!digits(v)) return bad('חסר ערך');
        return israeliIdValid(v) ? ok : bad('ספרת ביקורת נכשלה');
      }
    },

    passport: {
      label: 'מספר דרכון',
      inputMode: 'text',
      sensitive: true,
      copyAs: 'canonical',
      canonical: function (v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); },
      format: function (v) { return KINDS.passport.canonical(v); },
      validate: function (v) {
        var s = KINDS.passport.canonical(v);
        if (!s) return bad('חסר ערך');
        return /^[A-Z0-9]{6,9}$/.test(s) ? ok : bad('תבנית מספר דרכון לא תקינה');
      }
    },

    plate: {
      label: 'מספר רישוי',
      inputMode: 'numeric',
      sensitive: false,           /* מודפס על הרכב ברחוב */
      copyAs: 'canonical',
      canonical: function (v) { return digits(v); },
      format: function (v) {
        var s = digits(v);
        if (s.length === 7) return s.slice(0, 2) + '-' + s.slice(2, 5) + '-' + s.slice(5);
        if (s.length === 8) return s.slice(0, 3) + '-' + s.slice(3, 5) + '-' + s.slice(5);
        return s;
      },
      validate: function (v) {
        var s = digits(v);
        if (!s) return bad('חסר ערך');
        return (s.length === 7 || s.length === 8) ? ok : bad('לוחית רישוי היא 7 או 8 ספרות');
      }
    },

    policy: {
      label: 'מספר פוליסה',
      inputMode: 'text',
      sensitive: true,
      copyAs: 'canonical',
      canonical: function (v) { return trim(v).replace(/\s+/g, ''); },
      format: function (v) { return KINDS.policy.canonical(v); },
      validate: function (v) {
        return KINDS.policy.canonical(v) ? ok : bad('חסר ערך');
      }
    },

    date: {
      label: 'תאריך',
      inputMode: 'text',
      inputType: 'date',        /* בורר תאריך, לא שדה טקסט */
      sensitive: false,
      copyAs: 'display',
      canonical: function (v) { return trim(v); },
      format: function (v) {
        var p = trim(v).split('-');
        if (p.length !== 3) return trim(v);
        return p[2] + '/' + p[1] + '/' + p[0];
      },
      validate: function (v) {
        var s = trim(v);
        if (!s) return bad('חסר ערך');
        if (!window.U.isRealDate(s)) return bad('תאריך לא קיים');
        var y = Number(s.split('-')[0]);
        var max = new Date().getFullYear() + 50;
        return (y >= 1900 && y <= max) ? ok : bad('שנה מחוץ לטווח הסביר');
      }
    },

    iban: {
      label: 'IBAN',
      inputMode: 'text',
      sensitive: true,
      copyAs: 'canonical',
      canonical: function (v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); },
      format: function (v) {
        return KINDS.iban.canonical(v).replace(/(.{4})/g, '$1 ').trim();
      },
      validate: function (v) {
        if (!KINDS.iban.canonical(v)) return bad('חסר ערך');
        return ibanValid(v) ? ok : bad('ספרת ביקורת נכשלה');
      }
    },

    phone: {
      label: 'טלפון',
      inputMode: 'tel',
      inputType: 'tel',
      sensitive: false,
      copyAs: 'display',
      canonical: function (v) {
        var s = digits(v);
        if (s.slice(0, 3) === '972') s = '0' + s.slice(3);
        return s;
      },
      format: function (v) {
        var s = KINDS.phone.canonical(v);
        if (s.length === 10) return s.slice(0, 3) + '-' + s.slice(3, 6) + '-' + s.slice(6);
        if (s.length === 9) return s.slice(0, 2) + '-' + s.slice(2, 5) + '-' + s.slice(5);
        return s;
      },
      validate: function (v) {
        var s = KINDS.phone.canonical(v);
        if (!s) return bad('חסר ערך');
        if (s[0] !== '0') return bad('מספר טלפון פותח ב-0');
        return (s.length === 9 || s.length === 10) ? ok : bad('9 או 10 ספרות');
      }
    },

    text: {
      label: 'טקסט',
      inputMode: 'text',
      sensitive: false,
      copyAs: 'display',
      canonical: trim,
      format: trim,
      validate: function (v) { return trim(v) ? ok : bad('חסר ערך'); }
    }
  };

  /* ---------- שירותים נגזרים ---------- */

  KINDS.get = function (kind) { return KINDS[kind] || KINDS.text; };

  /* סוג ה-input נגזר מהרישום ולא מ-if על שם ה-kind */
  KINDS.inputType = function (kind) { return KINDS.get(kind).inputType || 'text'; };

  KINDS.isSensitive = function (field) {
    return field.sensitive != null ? !!field.sensitive : !!KINDS.get(field.kind).sensitive;
  };

  KINDS.display = function (field) {
    return KINDS.get(field.kind).format(field.value);
  };

  /* ההעתקה קוראת תמיד את הערך המלא — SPEC §4.2 */
  KINDS.copyValue = function (field) {
    var k = KINDS.get(field.kind);
    return k.copyAs === 'canonical' ? k.canonical(field.value) : k.format(field.value);
  };

  KINDS.mask = function (shown) {
    var s = String(shown == null ? '' : shown);
    return s.length > 4 ? '•••• ' + s.slice(-4) : '••••';
  };

  /* verified = true אם ורק אם עבר את הוולידטור. SPEC §3.3 */
  KINDS.check = function (field) {
    var raw = String(field.value == null ? '' : field.value).trim();
    if (!raw) return { ok: false, reason: 'חסר ערך', empty: true };
    var r = KINDS.get(field.kind).validate(raw);
    return { ok: r.ok, reason: r.reason, empty: false };
  };

  window.KINDS = KINDS;
})();
