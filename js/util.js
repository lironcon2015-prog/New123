/* util.js — מזהים, תאריכים, DOM, bidi, פורמט. תלוי ב-CONFIG בלבד. */
(function () {
  'use strict';

  var U = {};

  /* ---------- מזהים וזמן — SPEC §2.1, §2.2 ---------- */

  U.id = function () {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(8);
    crypto.getRandomValues(b);
    var hex = Array.prototype.map.call(b, function (x) {
      return x.toString(16).padStart(2, '0');
    }).join('');
    return Date.now().toString(36) + '-' + hex;
  };

  /* ported from Navigo: js/db.js:put — epoch ms, מספר, לא מחרוזת ISO.
     `(rec.updatedAt || 0)` נשען על כך שהערך מספרי כדי שרשומה בלי חותמת
     תיפול ל-0 ותפסיד כל התנגשות. עם מחרוזות, `'' > '2026-…'` הוא false
     בשני הכיוונים — רשומה בלי חותמת נתקעת ולא מסתנכרנת לשום כיוון. */
  U.now = function () { return Date.now(); };

  U.todayYmd = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  /* חצות מקומי בשני הצדדים — SPEC §6.2 */
  U.daysBetween = function (ymd, today) {
    var p = String(ymd).split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return null;
    var exp = new Date(p[0], p[1] - 1, p[2]);
    var t = today || new Date();
    var now = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((exp - now) / 86400000);
  };

  U.isRealDate = function (ymd) {
    var p = String(ymd).split('-').map(Number);
    if (p.length !== 3 || p.some(isNaN)) return false;
    var d = new Date(p[0], p[1] - 1, p[2]);
    return d.getFullYear() === p[0] && d.getMonth() === p[1] - 1 && d.getDate() === p[2];
  };

  /* ---------- טקסט ומספרים ---------- */

  U.norm = function (s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[֑-ׇ]/g, '')
      .replace(/[-.\/\\_,()\[\]\s]/g, '');
  };

  U.bytes = function (n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' ב׳';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };

  /* ספירת ימים בעברית — "בעוד 1 ימים" הוא טקסט שבור */
  U.daysAhead = function (n) {
    if (n === 1) return 'מחר';
    if (n === 2) return 'בעוד יומיים';
    return 'בעוד ' + n + ' ימים';
  };

  U.daysBehind = function (n) {
    if (n === 0) return 'פג היום';
    if (n === 1) return 'פג אתמול';
    if (n === 2) return 'פג לפני יומיים';
    return 'פג לפני ' + n + ' ימים';
  };

  U.count = function (n, one, many) {
    return n === 1 ? one : n + ' ' + many;
  };

  /* ---------- DOM ---------- */

  U.el = function (tag, props, kids) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2).toLowerCase(), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    U.add(e, kids);
    return e;
  };

  U.add = function (parent, kids) {
    if (kids == null) return parent;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (k) {
      if (k == null || k === false) return;
      parent.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
    });
    return parent;
  };

  U.clear = function (e) { while (e.firstChild) e.removeChild(e.firstChild); return e; };

  U.icon = function (name, size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size || 20);
    svg.setAttribute('height', size || 20);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ic');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + name);
    svg.appendChild(use);
    return svg;
  };

  /* ---------- בידוד bidi ---------- */
  /* ported from Navigo: js/ui.js — דפוס, לא קוד. לנאביגו אין פונקציית עטיפה
     ואין `<bdi>` בכלל; היא שמה `dir="ltr"` ידנית בנקודת השימוש, ולכן ערך
     מעורב עברית-לטינית נשבר אצלה. ההמלצה שחזרה משם, ואומצה כאן:

       לטיני/מספרי בלבד  →  <bdi dir="ltr">   כפיית כיוון, בטוחה
       מעורב              →  <bdi>             בידוד בלי כפייה
       עברית בלבד         →  <span>            אין מה לבודד

     `dir="ltr"` על "רחוב הרצל 5, תל אביב" זורק את הסיפא לתחילת השורה.
     ההבדל בין השורה השנייה לראשונה הוא ההבדל בין בידוד לכפייה.

     תווי בקרה של יוניקוד (U+2066/U+2069) נשקלו ונדחו: הם בלתי-נראים במקור,
     נמלטים מ-grep, ונוסעים בשקט לתוך ערכים שנשמרים ב-DB. */
  U.HAS_LTR = /[0-9A-Za-z]/;
  U.HAS_RTL = /[\u0590-\u05FF]/;

  U.bidi = function (value, cls) {
    var s = String(value == null ? '' : value);
    var node;
    if (!U.HAS_LTR.test(s)) node = U.el('span', { text: s });
    else if (U.HAS_RTL.test(s)) node = U.el('bdi', { text: s });
    else node = U.el('bdi', { dir: 'ltr', text: s });
    if (!cls) return node;
    return U.el('span', { class: cls }, node);
  };

  /* ---------- שונות ---------- */

  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  U.pick = function (arr, seed) {
    var h = 0, s = String(seed);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return arr[Math.abs(h) % arr.length];
  };

  window.U = U;
})();
