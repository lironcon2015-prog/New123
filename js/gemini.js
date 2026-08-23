/* gemini.js — פרסינג אופציונלי בענן.
   ⚠️ אינו הקנון. §6 באפיון מפנה ל-`_geminiRequest` ב-GymPro Elite, שאין אליו
   גישה מהסשן הזה; נכתב כאן מחדש באישור מפורש. החלפה עתידית דורסת את הקובץ הזה
   כולו — שאר האפליקציה נוגעת בו רק דרך `Gemini.parse`. רשום ב-PORTED.md.

   האפליקציה עובדת מלאה בלעדיו. כל שדה שהוא ממלא אפשר למלא ידנית. */
(function () {
  'use strict';

  var C = window.CONFIG, S = window.Settings, DT = window.DOC_TYPES;
  var HOST = 'https://generativelanguage.googleapis.com/v1beta';

  /* שמות מודלים מתיישנים. הרשימה כאן היא העדפה, לא אמת — הלקוח שואל את
     ה-API אילו מודלים קיימים בפועל ומדרג אותם לפי ההעדפה. קידוד קשיח של
     שם מודל הוא תקלה עתידית מובטחת. */
  var PREFER = [/flash-lite/i, /flash/i, /pro/i];

  var _models = null;

  function key() { return String(S.get(C.K.geminiKey) || '').trim(); }

  var G = {};

  G.configured = function () { return !!key(); };

  G.consented = function (kind) {
    return !!S.get(kind === 'image' ? C.K.geminiConsentImage : C.K.geminiConsentText);
  };

  G.ready = function (kind) { return G.configured() && G.consented(kind); };

  /* ---------- גילוי מודלים ---------- */

  function discover(signal) {
    if (_models) return Promise.resolve(_models);
    return fetch(HOST + '/models?key=' + encodeURIComponent(key()), { signal: signal })
      .then(function (r) {
        if (!r.ok) throw httpError(r.status);
        return r.json();
      })
      .then(function (j) {
        var names = (j.models || [])
          .filter(function (m) {
            return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1;
          })
          .map(function (m) { return String(m.name).replace(/^models\//, ''); });

        names.sort(function (a, b) { return rank(a) - rank(b); });
        _models = names;
        return names;
      });
  }

  function rank(name) {
    for (var i = 0; i < PREFER.length; i++) if (PREFER[i].test(name)) return i;
    return PREFER.length;
  }

  function httpError(status) {
    var e = new Error(
      status === 400 ? 'המפתח נדחה. בדוק אותו בהגדרות.' :
      status === 403 ? 'אין הרשאה למפתח הזה.' :
      status === 429 ? 'חריגה ממכסת הבקשות.' :
      status >= 500  ? 'שירות הפרסינג לא זמין כרגע.' :
      'הבקשה נכשלה (' + status + ')');
    e.status = status;
    return e;
  }

  /* ---------- בקשה אחת, עם מפל מודלים ---------- */

  function callModel(model, parts, signal) {
    var body = {
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    };
    return fetch(HOST + '/models/' + model + ':generateContent?key=' + encodeURIComponent(key()), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal
    }).then(function (r) {
      if (!r.ok) throw httpError(r.status);
      return r.json();
    }).then(function (j) {
      var cand = (j.candidates || [])[0];
      var text = cand && cand.content && (cand.content.parts || [])
        .map(function (p) { return p.text || ''; }).join('');
      if (!text) throw new Error('התשובה חזרה ריקה');
      return text;
    });
  }

  /* המודל האחרון שהצליח נשמר ומנוסה ראשון. מודל שנפל על 429 או על 5xx
     מפנה מקום לבא אחריו; מפתח פסול עוצר את המפל כולו — אין טעם לנסות
     חמישה מודלים עם אותו מפתח שגוי. */
  function request(parts, onStatus) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, C.GEMINI_TIMEOUT_MS);

    return discover(ctrl.signal).then(function (names) {
      if (!names.length) throw new Error('לא נמצאו מודלים זמינים למפתח הזה');
      var last = S.get(C.K.geminiLastModel);
      var order = names.slice();
      if (last && order.indexOf(last) > 0) {
        order = [last].concat(order.filter(function (n) { return n !== last; }));
      }

      var i = 0;
      function next(err) {
        if (i >= order.length) throw err || new Error('כל המודלים נכשלו');
        var model = order[i++];
        if (onStatus) onStatus(model);
        return callModel(model, parts, ctrl.signal).then(function (text) {
          S.set(C.K.geminiLastModel, model);
          return text;
        }, function (e) {
          if (e.name === 'AbortError') throw new Error('הבקשה ארכה זמן רב מדי');
          if (e.status === 400 || e.status === 403) throw e;
          return next(e);
        });
      }
      return next(null);
    }).then(function (text) {
      clearTimeout(timer);
      return text;
    }, function (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') throw new Error('הבקשה ארכה זמן רב מדי');
      throw e;
    });
  }

  /* ---------- הפרומפט נבנה מהטבלה ---------- */
  /* אין כאן רשימת שדות משלו. סוג מסמך חדש = שורה בטבלה, והפרומפט גדל איתה. */

  G.schemaText = function () {
    return DT.all().map(function (t) {
      var fields = t.fields.map(function (f) {
        return '    ' + f.key + ' — ' + f.label + ' (' + f.kind + ')' +
               (f.required ? ' [חובה]' : '');
      }).join('\n');
      return '  ' + t.key + ' — ' + t.label +
             (t.expiry === 'none' ? ' (אין תפוגה)' : '') + '\n' + fields;
    }).join('\n');
  };

  G.prompt = function () {
    return [
      'אתה מחלץ שדות ממסמך ישראלי. החזר JSON נקי בלבד, בלי הסברים ובלי גדרות קוד.',
      '',
      'סוגי המסמכים והשדות שלהם:',
      G.schemaText(),
      '',
      'מבנה התשובה:',
      '{"typeKey":"<אחד המפתחות למעלה>","fields":{"<key>":"<ערך>"},' +
        '"issueDate":"YYYY-MM-DD|null","expiryDate":"YYYY-MM-DD|null"}',
      '',
      'כללים:',
      '- העתק ערכים בדיוק כפי שהם מודפסים. אל תשלים, אל תתקן ואל תנחש.',
      '- שדה שאינך מוצא — השמט אותו לגמרי. אל תמציא ערך ואל תחזיר מחרוזת ריקה.',
      '- תאריכים תמיד YYYY-MM-DD.',
      '- מספרים ללא רווחים ומקפים, למעט אם הם מודפסים כך.',
      '- **אל תשנה את סדר הספרות.** העתק אותן משמאל לימין כפי שהן מודפסות,',
      '  גם כשהמסמך כולו בעברית.',
      '- מספר תעודת זהות ישראלי הוא תשע ספרות, וספרת הביקורת היא האחרונה.',
      '  אם מודפסות שמונה ספרות, הוסף אפס מוביל — לעולם לא בסוף.',
      '- אם המסמך אינו מתאים לאף סוג, השתמש ב-generic.'
    ].join('\n');
  };

  /* ---------- החוצה ---------- */

  function blobToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }

  function extractJson(text) {
    var s = String(text).trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '');
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a === -1 || b === -1) throw new Error('התשובה לא הייתה JSON');
    return JSON.parse(s.slice(a, b + 1));
  }

  /* input: { blob, mime } לתמונה, או { text } לטקסט חופשי */
  G.parse = function (input, onStatus) {
    var kind = input.blob ? 'image' : 'text';
    if (!G.configured()) return Promise.reject(new Error('לא הוגדר מפתח'));
    if (!G.consented(kind)) return Promise.reject(new Error('לא ניתנה הסכמה לשליחה'));

    var head = { text: G.prompt() };

    var partsP = input.blob
      ? blobToB64(input.blob).then(function (b64) {
          return [head, { inline_data: { mime_type: input.mime || 'image/jpeg', data: b64 } }];
        })
      : Promise.resolve([head, { text: '\nהמסמך:\n' + input.text }]);

    return partsP
      .then(function (parts) { return request(parts, onStatus); })
      .then(extractJson);
  };

  window.Gemini = G;
})();
