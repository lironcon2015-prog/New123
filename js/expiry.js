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

  E.needsNotice = function (grouped) {
    return grouped.past.length > 0 || grouped.d30.length > 0;
  };

  window.Expiry = E;
})();
