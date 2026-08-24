/* expiry.js — מנוע התפוגה. SPEC §6.
   נגזר בזמן ריצה בלבד. אין לשמור ערכים נגזרים. */
(function () {
  'use strict';

  var U = window.U;

  var BUCKETS = [
    { key: 'past', label: 'פג',          cls: 'past' },
    { key: 'd30',  label: 'עד 30 יום',   cls: 'd30' },
    { key: 'd90',  label: 'עד 90 יום',   cls: 'd90' },
    { key: 'ok',   label: 'תקין',        cls: 'ok' }
  ];

  var E = {};

  E.BUCKETS = BUCKETS;

  E.daysLeft = function (ymd, today) {
    if (!ymd) return null;
    return U.daysBetween(ymd, today);
  };

  /* daysLeft === 0 נכנס ל-past. יום התפוגה הוא היום שבו צריך לפעול. SPEC §6.3 */
  E.bucket = function (days) {
    if (days == null) return null;
    if (days <= 0) return 'past';
    if (days <= 30) return 'd30';
    if (days <= 90) return 'd90';
    return 'ok';
  };

  E.label = function (days, ymd) {
    if (days == null) return '';
    if (days <= 0) return U.daysBehind(-days);
    if (days <= 90) return U.daysAhead(days);
    return 'בתוקף עד ' + window.KINDS.get('date').format(ymd);
  };

  /* תווית קצרה, לאריח שרוחבו 106 פיקסלים. `E.label` הוא הקנון וממשיך
     להיות מה שמופיע בשורה ובכרטיס; כאן אין מקום למשפט. */
  E.shortLabel = function (days) {
    if (days == null) return '';
    if (days <= 0) return 'פג';
    if (days === 1) return 'מחר';
    return days + ' ימים';
  };

  /* מסמך בלי expiryDate אינו נכנס לרשימה כלל — הוא לא "תקין" ולא "חסר" */
  E.group = function (docs, today) {
    var out = { past: [], d30: [], d90: [], ok: [] };
    docs.forEach(function (d) {
      if (!d.expiryDate) return;
      var days = E.daysLeft(d.expiryDate, today);
      if (days == null) return;
      var b = E.bucket(days);
      out[b].push({ doc: d, days: days, bucket: b });
    });
    Object.keys(out).forEach(function (k) {
      out[k].sort(function (a, b) { return a.days - b.days; });
    });
    return out;
  };

  /* התפוגה הקרובה ביותר מתוך אוסף מסמכים, או null. זה מה שמסך הבית
     מציג על ישות: לא כמה מסמכים יש לה, אלא מה עומד לפוג בה ומתי.
     מסמך בלי תאריך אינו משתתף — הוא לא "תקין" ולא "חסר". SPEC §6.7 */
  E.next = function (docs, today) {
    var best = null;
    (docs || []).forEach(function (d) {
      if (!d.expiryDate) return;
      var days = E.daysLeft(d.expiryDate, today);
      if (days == null) return;
      if (!best || days < best.days) best = { doc: d, days: days, bucket: E.bucket(days) };
    });
    return best;
  };

  /* DEC-14: סוג עם notify:false מופיע ברשימת התפוגות אבל אינו נספר בבאנר.
     הדרכון מוצג כעובדה על המסך, ולא כהתראה יזומה — נאביגו כבר מתריעה עליו,
     והתראה כפולה מאמנת להתעלם משתיהן. */
  E.notifiable = function (grouped) {
    return grouped.past.concat(grouped.d30).filter(function (it) {
      return window.DOC_TYPES.notify(it.doc.typeKey);
    });
  };

  E.needsNotice = function (grouped) {
    return E.notifiable(grouped).length > 0;
  };

  window.Expiry = E;
})();
