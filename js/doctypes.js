/* doctypes.js — הטבלה המרכזית. SPEC §5.
   שורה אחת מייצרת: הטופס · הפרומפט ל-Gemini · רשימת ההעתקה · מנוע התפוגה.
   הוספת סוג מסמך = שורה. אפס קוד חדש. */
(function () {
  'use strict';

  var T = {

    id_card: {
      label: 'תעודת זהות', icon: 'i-card',
      entityTypes: ['person'], expiry: 'optional', allowFiles: true, parse: 'mrz+gemini',
      fields: [
        { key: 'idNumber',  label: 'מספר תעודת זהות', kind: 'id',   required: true },
        { key: 'fullName',  label: 'שם מלא',          kind: 'text', required: true },
        { key: 'birthDate', label: 'תאריך לידה',      kind: 'date' },
        { key: 'docNumber', label: 'מספר התעודה',     kind: 'text' }
      ]
    },

    id_appendix: {
      label: 'ספח תעודת זהות', icon: 'i-doc',
      entityTypes: ['person'], expiry: 'none', allowFiles: true, parse: 'gemini',
      fields: [
        { key: 'idNumber', label: 'מספר תעודת זהות', kind: 'id',   required: true },
        { key: 'fullName', label: 'שם מלא',          kind: 'text', required: true },
        { key: 'address',  label: 'כתובת',           kind: 'text', multiline: true },
        { key: 'children', label: 'ילדים',           kind: 'text', multiline: true }
      ]
    },

    /* allowFiles: false — DEC-01. מקור האמת לסריקה הוא נאביגו. */
    passport: {
      label: 'דרכון', icon: 'i-passport',
      entityTypes: ['person'], expiry: 'required', allowFiles: false, parse: 'mrz',
      fields: [
        { key: 'passportNumber', label: 'מספר דרכון', kind: 'passport', required: true },
        { key: 'fullNameLatin',  label: 'שם באנגלית', kind: 'text' },
        { key: 'birthDate',      label: 'תאריך לידה', kind: 'date' }
      ]
    },

    driving_license: {
      label: 'רישיון נהיגה', icon: 'i-license',
      entityTypes: ['person'], expiry: 'required', allowFiles: true, parse: 'gemini',
      fields: [
        { key: 'idNumber',      label: 'מספר תעודת זהות', kind: 'id', required: true },
        { key: 'licenseNumber', label: 'מספר רישיון',     kind: 'text' },
        { key: 'classes',       label: 'דרגות',           kind: 'text' }
      ]
    },

    vehicle_license: {
      label: 'רישיון רכב', icon: 'i-car',
      entityTypes: ['vehicle'], expiry: 'required', allowFiles: true, parse: 'gemini',
      titleFrom: 'makeModel',
      fields: [
        { key: 'plate',     label: 'מספר רישוי', kind: 'plate', required: true },
        { key: 'vin',       label: 'מספר שלדה',  kind: 'text' },
        { key: 'makeModel', label: 'יצרן ודגם',  kind: 'text' },
        { key: 'year',      label: 'שנת ייצור',  kind: 'text' },
        { key: 'ownerName', label: 'בעלים',      kind: 'text' }
      ]
    },

    vehicle_test: {
      label: 'טסט', icon: 'i-gauge',
      entityTypes: ['vehicle'], expiry: 'required', allowFiles: true, parse: 'gemini',
      fields: [
        { key: 'plate',   label: 'מספר רישוי', kind: 'plate', required: true },
        { key: 'station', label: 'תחנת בדיקה', kind: 'text' },
        { key: 'mileage', label: 'קילומטראז׳', kind: 'text' }
      ]
    },

    vehicle_insurance: {
      label: 'ביטוח רכב', icon: 'i-shield',
      entityTypes: ['vehicle'], expiry: 'required', allowFiles: true, parse: 'gemini',
      titleFrom: 'insurer',
      fields: [
        { key: 'policyNumber', label: 'מספר פוליסה', kind: 'policy', required: true },
        { key: 'insurer',      label: 'חברת ביטוח',  kind: 'text',   required: true },
        { key: 'plate',        label: 'מספר רישוי',  kind: 'plate' },
        { key: 'coverage',     label: 'סוג כיסוי',   kind: 'text' },
        { key: 'agentName',    label: 'סוכן',        kind: 'text' },
        { key: 'agentPhone',   label: 'טלפון סוכן',  kind: 'phone' }
      ]
    },

    home_insurance: {
      label: 'ביטוח דירה', icon: 'i-home',
      entityTypes: ['home'], expiry: 'required', allowFiles: true, parse: 'gemini',
      titleFrom: 'insurer',
      fields: [
        { key: 'policyNumber', label: 'מספר פוליסה', kind: 'policy', required: true },
        { key: 'insurer',      label: 'חברת ביטוח',  kind: 'text',   required: true },
        { key: 'address',      label: 'כתובת הנכס',  kind: 'text',   multiline: true },
        { key: 'coverage',     label: 'סוג כיסוי',   kind: 'text' },
        { key: 'agentPhone',   label: 'טלפון סוכן',  kind: 'phone' }
      ]
    },

    life_insurance: {
      label: 'ביטוח בריאות / חיים', icon: 'i-heart',
      entityTypes: ['person'], expiry: 'optional', allowFiles: true, parse: 'gemini',
      titleFrom: 'insurer',
      fields: [
        { key: 'policyNumber', label: 'מספר פוליסה', kind: 'policy', required: true },
        { key: 'insurer',      label: 'חברה',        kind: 'text',   required: true },
        { key: 'insuredName',  label: 'שם המבוטח',   kind: 'text' },
        { key: 'agentPhone',   label: 'טלפון סוכן',  kind: 'phone' }
      ]
    },

    hmo_card: {
      label: 'כרטיס קופת חולים', icon: 'i-cross',
      entityTypes: ['person'], expiry: 'optional', allowFiles: true, parse: 'gemini',
      titleFrom: 'hmo',
      fields: [
        { key: 'idNumber',     label: 'מספר תעודת זהות', kind: 'id',   required: true },
        { key: 'hmo',          label: 'קופת חולים',      kind: 'text', required: true },
        { key: 'memberNumber', label: 'מספר חבר',        kind: 'text' },
        { key: 'clinic',       label: 'מרפאה',           kind: 'text' }
      ]
    },

    diploma: {
      label: 'תעודה / דיפלומה', icon: 'i-cert',
      entityTypes: ['person'], expiry: 'none', allowFiles: true, parse: 'gemini',
      titleFrom: 'title',
      fields: [
        { key: 'title',        label: 'שם התעודה', kind: 'text', required: true },
        { key: 'institution',  label: 'מוסד',      kind: 'text' },
        { key: 'fieldOfStudy', label: 'תחום',      kind: 'text' }
      ]
    },

    /* שסתום הביטחון */
    generic: {
      label: 'מסמך כללי', icon: 'i-file',
      entityTypes: ['person', 'vehicle', 'home', 'other'],
      expiry: 'optional', allowFiles: true, parse: 'gemini',
      titleFrom: 'title',
      fields: [
        { key: 'title',     label: 'כותרת',      kind: 'text', required: true },
        { key: 'issuer',    label: 'גורם מנפיק', kind: 'text' },
        { key: 'reference', label: 'מספר אסמכתא', kind: 'text' }
      ]
    }
  };

  /* מפתח נשמר גם בתוך השורה, כדי שאפשר יהיה להעביר שורה בלי המפתח שלה */
  Object.keys(T).forEach(function (k) { T[k].key = k; });

  var API = {
    all: function () { return Object.keys(T).map(function (k) { return T[k]; }); },
    get: function (key) { return T[key] || null; },
    label: function (key) { return T[key] ? T[key].label : 'מסמך'; },
    icon: function (key) { return T[key] ? T[key].icon : 'i-file'; },
    forEntityType: function (etype) {
      return API.all().filter(function (t) { return t.entityTypes.indexOf(etype) !== -1; });
    },
    hasExpiry: function (key) { return T[key] ? T[key].expiry !== 'none' : false; }
  };

  window.DOC_TYPES = API;
})();
