/* chat.js — עוזר שיחה עם גישה לכספת. SPEC §14.
   שני חצאים, ורק אחד מהם נוגע ברשת:

     Chat.context / Chat.prompt   — מה נשלח. נגזר מהטבלה, לא מרשימה כתובה.
     Chat.compile                 — פונקציה **טהורה** שממירה פעולות שהמודל
                                    החזיר לשינויים מאומתים, או לשגיאות.

   `compile` היא הגבול. שום דבר שהמודל אמר אינו נכתב לפניה, ושום דבר
   שהיא פסלה אינו נכתב אחריה. הכתיבה עצמה קורית רק אחרי אישור מפורש
   במסך — אותו כלל של מסך האישור, על ערוץ אחר.

   האפליקציה עובדת מלאה בלי זה: בלי מפתח ובלי הסכמה, המסך מסביר מה חסר. */
(function () {
  'use strict';

  var U = window.U, DT = window.DOC_TYPES, KINDS = window.KINDS,
      C = window.CONFIG, DB = window.DB, V = window.Versions;

  var Chat = {};

  Chat.HISTORY_MAX = 12;

  /* ההיסטוריה חיה כאן ולא במסך, כדי שיציאה מהמסך וחזרה אליו
     לא תמחק את השיחה. היא אינה נשמרת ל-DB ואינה שורדת רענון. */
  Chat.log = [];

  Chat.ready = function () { return window.Gemini.ready('chat'); };

  /* ---------- מה נשלח ---------- */

  /* מפת הכספת. עוברת דרך `DB.forSync` ולכן סוג עם `syncFields:false`
     יוצא ריק — DEC-13 חל על כל ערוץ שמוציא נתונים מהמכשיר, לא רק על
     הדרייב. גרסאות שנדחקו אינן נשלחות: העוזר עובד על העדכני. */
  Chat.context = function (entities, docs) {
    var live = V.live((docs || []).filter(function (d) { return !d.deleted; }));
    return {
      today: U.todayYmd(),
      entities: (entities || []).map(function (e) {
        return { id: e.id, name: e.name, type: e.type };
      }),
      docs: live.map(function (d) {
        var safe = DB.forSync(d);
        var fields = {};
        (safe.fields || []).forEach(function (f) { fields[f.key] = f.value; });
        return {
          id: safe.id, entityId: safe.entityId, typeKey: safe.typeKey,
          title: safe.title, fields: fields,
          issueDate: safe.issueDate || null, expiryDate: safe.expiryDate || null,
          notes: safe.notes || ''
        };
      })
    };
  };

  Chat.OPS = [
    'setField — שינוי ערך שדה: {"op":"setField","docId":"..","key":"..","value":".."}',
    'clearField — ריקון שדה: {"op":"clearField","docId":"..","key":".."}',
    'setDate — תאריך: {"op":"setDate","docId":"..","which":"expiryDate|issueDate","value":"YYYY-MM-DD"}',
    'setTitle — כותרת: {"op":"setTitle","docId":"..","value":".."}',
    'setNotes — הערות: {"op":"setNotes","docId":"..","value":".."}',
    'moveDoc — שיוך מחדש: {"op":"moveDoc","docId":"..","entityId":".."}',
    'renameEntity — שם ישות: {"op":"renameEntity","entityId":"..","value":".."}',
    'createEntity — ישות חדשה: {"op":"createEntity","name":"..","type":"person|vehicle|home|other"}',
    'createDoc — מסמך חדש: {"op":"createDoc","entityId":"..","typeKey":"..","title":"..",' +
      '"fields":{"<key>":"<ערך>"},"issueDate":null,"expiryDate":null}'
  ];

  Chat.prompt = function (ctx) {
    return [
      'אתה עוזר בתוך אפליקציית מסמכים משפחתית בעברית. אתה עונה בעברית,',
      'קצר וענייני, ואתה יכול להציע שינויים בנתונים.',
      '',
      'החזר JSON נקי בלבד, בלי הסברים ובלי גדרות קוד:',
      '{"reply":"<תשובה בעברית>","actions":[<פעולות, אפשר ריק>]}',
      '',
      'הפעולות האפשריות:',
      Chat.OPS.map(function (o) { return '- ' + o; }).join('\n'),
      '',
      'סוגי המסמכים והשדות שלהם:',
      window.Gemini.schemaText(),
      '',
      'סוגי ישות: ' + C.ENTITY_TYPES.map(function (t) {
        return t.key + ' (' + t.label + ')';
      }).join(', '),
      '',
      'כללים:',
      '- השתמש אך ורק במזהים שמופיעים בנתונים למטה. אל תמציא מזהה.',
      '- שדה חייב להיות מפתח שקיים בסוג המסמך שלו. אחרת אל תציע אותו.',
      '- אל תמציא ערכים. אם המידע אינו בנתונים, אמור זאת ב-reply והחזר actions ריק.',
      '- שאלה שאין בה בקשה לשינוי מקבלת actions ריק.',
      '- תאריכים תמיד YYYY-MM-DD.',
      '- מספר תעודת זהות ישראלי הוא תשע ספרות וספרת הביקורת אחרונה.',
      '- מסמך שאין לו שדות בנתונים הוא מסמך שהפרטים שלו אינם עוזבים את המכשיר.',
      '  אל תניח שהוא ריק, ואל תציע למלא אותו.',
      '',
      'הנתונים:',
      JSON.stringify(ctx)
    ].join('\n');
  };

  /* ---------- הגבול: אימות הפעולות ---------- */

  function entityById(state, id) {
    return (state.entities || []).filter(function (e) { return e.id === id; })[0] || null;
  }
  function docById(state, id) {
    return (state.docs || []).filter(function (d) { return d.id === id && !d.deleted; })[0] || null;
  }
  function fieldDef(typeKey, key) {
    var t = DT.get(typeKey);
    if (!t) return null;
    return t.fields.filter(function (f) { return f.key === key; })[0] || null;
  }

  /* בונה רשומת שדה מאומתת — אותו חוזה בדיוק כמו `Forms.doc.read`:
     `verified` נכון אם ורק אם הערך עבר את הוולידטור. */
  function buildField(def, raw) {
    var kind = KINDS.get(def.kind);
    var field = {
      key: def.key, label: def.label, value: kind.canonical(raw), kind: def.kind,
      sensitive: def.sensitive != null ? !!def.sensitive : !!kind.sensitive,
      confidence: null, verified: true, multiline: !!def.multiline
    };
    field.verified = KINDS.check(field).ok;
    return field;
  }

  /* טהורה. מקבלת פעולות ומצב, מחזירה מה ייכתב ומה נפסל.
     כל פעולה יוצאת עם `text` בעברית — מה שהמשתמש מאשר הוא התיאור הזה. */
  Chat.compile = function (actions, state) {
    var ops = [], errors = [];
    var newEntities = [];

    function knownEntity(id) {
      return entityById(state, id) ||
        newEntities.filter(function (e) { return e.id === id; })[0] || null;
    }

    (actions || []).forEach(function (a) {
      if (!a || typeof a !== 'object') { errors.push('פעולה שאינה מובנת'); return; }
      var doc, def, ent, t;

      switch (a.op) {
        case 'setField':
          doc = docById(state, a.docId);
          if (!doc) { errors.push('מסמך לא נמצא'); return; }
          def = fieldDef(doc.typeKey, a.key);
          if (!def) { errors.push('אין שדה ' + a.key + ' ב' + DT.label(doc.typeKey)); return; }
          if (a.value == null || String(a.value).trim() === '') {
            errors.push('ערך ריק ל' + def.label); return;
          }
          ops.push({
            op: 'setField', docId: doc.id, key: def.key,
            field: buildField(def, String(a.value)),
            before: fieldValue(doc, def.key),
            text: doc.title + ' · ' + def.label + ': ' + KINDS.get(def.kind).format(a.value)
          });
          return;

        case 'clearField':
          doc = docById(state, a.docId);
          if (!doc) { errors.push('מסמך לא נמצא'); return; }
          def = fieldDef(doc.typeKey, a.key);
          if (!def) { errors.push('אין שדה ' + a.key + ' ב' + DT.label(doc.typeKey)); return; }
          if (def.required) { errors.push(def.label + ' הוא שדה חובה ואינו מרוקן'); return; }
          ops.push({
            op: 'clearField', docId: doc.id, key: def.key,
            before: fieldValue(doc, def.key),
            text: doc.title + ' · ריקון ' + def.label
          });
          return;

        case 'setDate':
          doc = docById(state, a.docId);
          if (!doc) { errors.push('מסמך לא נמצא'); return; }
          if (a.which !== 'expiryDate' && a.which !== 'issueDate') {
            errors.push('סוג תאריך לא מוכר'); return;
          }
          if (!U.isRealDate(a.value)) { errors.push('תאריך שאינו קיים: ' + a.value); return; }
          ops.push({
            op: 'setDate', docId: doc.id, which: a.which, value: a.value,
            before: doc[a.which] || '',
            text: doc.title + ' · ' + (a.which === 'expiryDate' ? 'בתוקף עד ' : 'תאריך הנפקה ') +
                  KINDS.get('date').format(a.value)
          });
          return;

        case 'setTitle':
        case 'setNotes':
          doc = docById(state, a.docId);
          if (!doc) { errors.push('מסמך לא נמצא'); return; }
          if (a.op === 'setTitle' && !String(a.value || '').trim()) {
            errors.push('כותרת ריקה'); return;
          }
          ops.push({
            op: a.op, docId: doc.id, value: String(a.value == null ? '' : a.value).trim(),
            before: a.op === 'setTitle' ? doc.title : (doc.notes || ''),
            text: doc.title + ' · ' + (a.op === 'setTitle' ? 'כותרת' : 'הערות') + ': ' +
                  String(a.value == null ? '' : a.value).trim()
          });
          return;

        case 'moveDoc':
          doc = docById(state, a.docId);
          if (!doc) { errors.push('מסמך לא נמצא'); return; }
          ent = knownEntity(a.entityId);
          if (!ent) { errors.push('ישות לא נמצאה'); return; }
          if (DT.get(doc.typeKey).entityTypes.indexOf(ent.type) === -1) {
            errors.push(DT.label(doc.typeKey) + ' אינו מתאים ל' + ent.name); return;
          }
          ops.push({
            op: 'moveDoc', docId: doc.id, entityId: ent.id,
            text: doc.title + ' · שיוך ל' + ent.name
          });
          return;

        case 'renameEntity':
          ent = knownEntity(a.entityId);
          if (!ent) { errors.push('ישות לא נמצאה'); return; }
          if (!String(a.value || '').trim()) { errors.push('שם ריק'); return; }
          ops.push({
            op: 'renameEntity', entityId: ent.id, value: String(a.value).trim(),
            before: ent.name, text: ent.name + ' ← ' + String(a.value).trim()
          });
          return;

        case 'createEntity':
          if (!String(a.name || '').trim()) { errors.push('שם ריק לישות חדשה'); return; }
          if (!C.ENTITY_TYPES.some(function (x) { return x.key === a.type; })) {
            errors.push('סוג ישות לא מוכר: ' + a.type); return;
          }
          var ne = { id: U.id(), type: a.type, name: String(a.name).trim() };
          newEntities.push(ne);
          ops.push({
            op: 'createEntity', entity: ne,
            text: 'ישות חדשה · ' + ne.name
          });
          return;

        case 'createDoc':
          ent = knownEntity(a.entityId);
          if (!ent) { errors.push('ישות לא נמצאה למסמך חדש'); return; }
          t = DT.get(a.typeKey);
          if (!t) { errors.push('סוג מסמך לא מוכר: ' + a.typeKey); return; }
          if (t.entityTypes.indexOf(ent.type) === -1) {
            errors.push(t.label + ' אינו מתאים ל' + ent.name); return;
          }
          var fields = [], missing = [];
          t.fields.forEach(function (d) {
            var raw = (a.fields || {})[d.key];
            if (raw == null || String(raw).trim() === '') {
              if (d.required) missing.push(d.label);
              return;
            }
            fields.push(buildField(d, String(raw)));
          });
          if (missing.length) { errors.push('חסר: ' + missing.join(', ')); return; }
          var exp = U.isRealDate(a.expiryDate) ? a.expiryDate : null;
          if (t.expiry === 'required' && !exp) {
            errors.push(t.label + ' חייב תאריך תפוגה'); return;
          }
          ops.push({
            op: 'createDoc',
            doc: {
              id: U.id(), entityId: ent.id, typeKey: t.key,
              title: String(a.title || '').trim() || t.label,
              fields: fields,
              issueDate: U.isRealDate(a.issueDate) ? a.issueDate : null,
              expiryDate: exp, files: [], source: 'chat', notes: '',
              supersededBy: null, deleted: 0
            },
            text: 'מסמך חדש · ' + t.label + ' ל' + ent.name
          });
          return;

        default:
          errors.push('פעולה לא מוכרת: ' + String(a.op));
      }
    });

    return { ops: ops, errors: errors };
  };

  function fieldValue(doc, key) {
    var f = (doc.fields || []).filter(function (x) { return x.key === key; })[0];
    return f ? f.value : '';
  }

  /* ---------- הכתיבה ---------- */
  /* רצה **רק** אחרי אישור. סדרתית, כדי ששתי פעולות על אותו מסמך לא ידרסו
     זו את זו — כל אחת קוראת את הרשומה מחדש. */
  Chat.apply = function (ops) {
    return (ops || []).reduce(function (chain, op) {
      return chain.then(function () { return applyOne(op); });
    }, Promise.resolve());
  };

  function withDoc(docId, mutate) {
    return DB.get('docs', docId).then(function (doc) {
      if (!doc || doc.deleted) return null;
      mutate(doc);
      return DB.saveDoc(doc, []);
    });
  }

  function applyOne(op) {
    switch (op.op) {
      case 'setField':
        return withDoc(op.docId, function (doc) {
          doc.fields = (doc.fields || []).filter(function (f) { return f.key !== op.key; });
          doc.fields.push(op.field);
        });
      case 'clearField':
        return withDoc(op.docId, function (doc) {
          doc.fields = (doc.fields || []).filter(function (f) { return f.key !== op.key; });
        });
      case 'setDate':
        return withDoc(op.docId, function (doc) { doc[op.which] = op.value; });
      case 'setTitle':
        return withDoc(op.docId, function (doc) { doc.title = op.value; });
      case 'setNotes':
        return withDoc(op.docId, function (doc) { doc.notes = op.value; });
      case 'moveDoc':
        return withDoc(op.docId, function (doc) { doc.entityId = op.entityId; });
      case 'renameEntity':
        return DB.get('entities', op.entityId).then(function (e) {
          if (!e) return null;
          e.name = op.value;
          if (!e.avatarImage) e.avatar = op.value.trim()[0] || '?';
          return DB.saveEntity(e);
        });
      case 'createEntity':
        return DB.saveEntity({
          id: op.entity.id, type: op.entity.type, name: op.entity.name,
          color: U.pick(C.ENTITY_COLORS, op.entity.name),
          avatar: op.entity.name.trim()[0] || '?'
        });
      case 'createDoc':
        return DB.saveDoc(op.doc, []);
      default:
        return Promise.resolve(null);
    }
  }

  window.Chat = Chat;
})();
