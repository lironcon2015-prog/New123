/* search.js — חיפוש גלובלי על שדות. SPEC §8.
   סריקה ליניארית במכוון. הסף למדוד רשום ב-DEBT.md D3. */
(function () {
  'use strict';

  var U = window.U, KINDS = window.KINDS, DT = window.DOC_TYPES;

  var S = {};

  /* שורות שדה לכל המסמכים, כולל שורות התאריך הסינתטיות */
  S.rows = function (docs, entityById) {
    var out = [];
    docs.forEach(function (doc) {
      var ent = entityById[doc.entityId];
      var t = DT.get(doc.typeKey);
      (doc.fields || []).forEach(function (f) {
        out.push({ doc: doc, entity: ent, field: f, synthetic: false });
      });
      if (t && t.expiry !== 'none' && doc.expiryDate) {
        out.push({
          doc: doc, entity: ent, synthetic: true,
          field: { key: '__expiry', label: 'בתוקף עד', value: doc.expiryDate, kind: 'date', verified: true }
        });
      }
      if (doc.issueDate) {
        out.push({
          doc: doc, entity: ent, synthetic: true,
          field: { key: '__issue', label: 'תאריך הנפקה', value: doc.issueDate, kind: 'date', verified: true }
        });
      }
    });
    return out;
  };

  S.query = function (rows, q) {
    var n = U.norm(q);
    if (!n) return [];
    var scored = [];
    rows.forEach(function (r) {
      var value = U.norm(KINDS.display(r.field));
      var raw = U.norm(r.field.value);
      var rest = U.norm(
        r.field.label + ' ' +
        (r.doc.title || '') + ' ' +
        DT.label(r.doc.typeKey) + ' ' +
        (r.entity ? r.entity.name : '')
      );
      var rank = -1;
      if (value.indexOf(n) === 0 || raw.indexOf(n) === 0) rank = 0;
      else if (value.indexOf(n) !== -1 || raw.indexOf(n) !== -1) rank = 1;
      else if (rest.indexOf(n) !== -1) rank = 2;
      if (rank >= 0) scored.push({ row: r, rank: rank });
    });
    scored.sort(function (a, b) {
      return a.rank - b.rank ||
        String(b.row.doc.updatedAt).localeCompare(String(a.row.doc.updatedAt));
    });
    return scored.map(function (s) { return s.row; });
  };

  /* שורה שהמסמך שלה נמחק מסוננת בזמן הרינדור, לא נמחקת מהרשימה */
  S.recent = function (rows, recentList) {
    var out = [];
    (recentList || []).forEach(function (r) {
      var hit = rows.filter(function (x) {
        return x.doc.id === r.docId && x.field.key === r.fieldKey;
      })[0];
      if (hit) out.push(hit);
    });
    return out;
  };

  window.Search = S;
})();
