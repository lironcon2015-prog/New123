/* gemini.js — פרסינג אופציונלי בענן.
   ⚠️ אינו הקנון. §6 באפיון מפנה ל-`_geminiRequest` ב-GymPro Elite, שאין אליו
   גישה מהסשן הזה; נכתב כאן מחדש באישור מפורש. החלפה עתידית דורסת את הקובץ הזה
   כולו — שאר האפליקציה נוגעת בו רק דרך `Gemini.parse`. רשום ב-PORTED.md.

   האפליקציה עובדת מלאה בלעדיו. כל שדה שהוא ממלא אפשר למלא ידנית. */
(function () {
  'use strict';

  var C = window.CONFIG, S = window.Settings, DT = window.DOC_TYPES;
  var HOST = 'https://generativelanguage.googleapis.com/v1beta';

  /* ---------- מפל המודלים ----------
     שמות מודלים מתיישנים, ולכן **אין כאן רשימה קשיחה**: הלקוח שואל את
     ה-API אילו מודלים קיימים בפועל ומדרג אותם. כך "המודל העדכני" הוא
     תוצאה של שאילתה ולא של קבוע שמישהו יצטרך לזכור לעדכן.

     הדירוג, והסדר הזה הוא הכרעה ולא נוחות:

       1. **שכבה**: pro לפני flash לפני flash-lite.
       2. **דור**: בתוך שכבה, המספר הגבוה קודם.
       3. **יציב לפני preview**, בתוך אותו דור.

     השכבה גוברת על הדור מפני ש-pro של דור קודם קורא תעודת זהות מצולמת
     טוב יותר מ-flash-lite של הדור הבא, והמשימה כאן היא קריאת מסמכים ולא
     שיחה. עד 0.9.4 הסדר היה הפוך — flash-lite ראשון — וזו הייתה בחירת
     מהירות ומחיר שהפכה בשקט לבחירת דיוק. DEC-28.

     המשתמש יכול לדרוס את הכל ברשימה משלו (`geminiModels`). */
  var _models = null;

  function key() { return String(S.get(C.K.geminiKey) || '').trim(); }

  var G = {};

  function tierOf(name) {
    if (/flash-lite/i.test(name)) return 1;
    if (/flash/i.test(name)) return 2;
    if (/pro/i.test(name)) return 3;
    return 0;
  }

  /* מפתח מיון לקסיקוגרפי. קטן יותר = מנוסה מוקדם יותר. */
  G.rank = function (name) {
    var n = String(name || '');
    var gen = Number((n.match(/gemini-(\d+(?:\.\d+)?)/i) || [])[1] || 0);
    return [-tierOf(n), -gen, /preview|exp\b|experimental/i.test(n) ? 1 : 0, n];
  };

  G.cmpRank = function (a, b) {
    var ra = G.rank(a), rb = G.rank(b);
    for (var i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  };

  G.configured = function () { return !!key(); };

  /* הסכמה לכל סוג שליחה בנפרד. שליחת מחרוזת פוליסה, שליחת צילום תעודת זהות
     ושליחת מפת הכספת כולה הן שלושה ויתורים שונים, ולכן שלושה מפתחות. */
  var CONSENT = {};
  CONSENT.image = C.K.geminiConsentImage;
  CONSENT.chat = C.K.geminiConsentChat;
  CONSENT.text = C.K.geminiConsentText;

  G.consented = function (kind) {
    return !!S.get(CONSENT[kind] || CONSENT.text);
  };

  G.ready = function (kind) { return G.configured() && G.consented(kind); };

  /* ---------- גילוי מודלים ---------- */

  function discover(signal, force) {
    if (_models && !force) return Promise.resolve(_models);
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

        names.sort(G.cmpRank);
        _models = names;
        return names;
      });
  }

  /* מה שמסך ההגדרות קורא לו: שאילתה טרייה, בלי קאש. זו הדרך של המשתמש
     לראות מה קיים היום למפתח שלו ולבחור מתוכו. */
  G.available = function () { return discover(null, true); };

  /* המפל שירוץ בפועל. רשימה שהמשתמש הגדיר גוברת ואינה נשאלת מול ה-API —
     היא הסדר שלו, כולל מודל שאינו ברשימת הגילוי. שם שאינו קיים נופל
     ב-404 ומפנה מקום לבא אחריו, כמו כל כישלון אחר. */
  G.cascade = function (signal) {
    var chosen = (S.get(C.K.geminiModels) || [])
      .map(function (n) { return String(n || '').trim(); })
      .filter(Boolean);
    if (chosen.length) return Promise.resolve(chosen);
    return discover(signal);
  };

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

  function callModel(model, contents, signal) {
    var body = {
      contents: contents,
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

  /* מודל שנפל על 429 או על 5xx מפנה מקום לבא אחריו; 404 על שם שהתיישן
     עושה אותו דבר. מפתח פסול עוצר את המפל כולו — אין טעם לנסות חמישה
     מודלים עם אותו מפתח שגוי, וזה רק מסתיר תקלת קונפיגורציה מאחורי
     שלוש קריאות איטיות.

     **המפל רץ תמיד מלמעלה.** קודם המודל שהצליח לאחרונה הוקפץ לראש, וזה
     נשמע כמו אופטימיזציה עד שהוא נועל 429 חד-פעמי על flash-lite ומשאיר
     שם את כל הקריאות הבאות — כלומר הופך את הסדר שהמשתמש בחר להמלצה.
     המחיר הוא קריאה כושלת אחת כשהמודל הראשון עמוס. `geminiLastModel`
     עדיין נכתב, לתצוגה בלבד. */
  function request(parts, onStatus) {
    return send([{ role: 'user', parts: parts }], onStatus);
  }

  function send(contents, onStatus) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, C.GEMINI_TIMEOUT_MS);

    return G.cascade(ctrl.signal).then(function (names) {
      if (!names.length) throw new Error('לא נמצאו מודלים זמינים למפתח הזה');
      var order = names.slice();

      var i = 0;
      function next(err) {
        if (i >= order.length) throw err || new Error('כל המודלים נכשלו');
        var model = order[i++];
        if (onStatus) onStatus(model);
        return callModel(model, contents, ctrl.signal).then(function (text) {
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
             (t.expiry === 'none' ? ' (אין תפוגה)' : '') +
             (t.openFields ? ' [סוג פתוח — מקבל שדות נוספים ב-extra]' : '') +
             '\n' + fields;
    }).join('\n');
  };

  /* המפתחות שהטבלה מסמנת כפתוחים. הפרומפט אינו מזכיר שם של סוג — הוא
     שואל את הטבלה מי פתוח, וסוג פתוח נוסף ייכנס למשפט לבדו. */
  G.openKeys = function () {
    return DT.all().filter(function (t) { return t.openFields; })
      .map(function (t) { return t.key; });
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
        '"extra":{"<תווית כפי שמודפסת>":"<ערך>"},' +
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
      '- אם המסמך אינו מתאים לאף סוג, בחר סוג פתוח: ' + G.openKeys().join(' או ') + '.',
      '',
      'על extra, ורק בסוג פתוח:',
      '- שם את כל מה שקראת מהמסמך ואין לו key ברשימת השדות של הסוג שבחרת.',
      '  תעודה שאינה מוכרת היא בדיוק המקרה שבשבילו זה קיים — אל תסתפק',
      '  בכותרת ובגורם המנפיק ותשליך את השאר.',
      '- המפתח ב-extra הוא **התווית כפי שהיא מודפסת במסמך**, בעברית אם כך',
      '  היא מודפסת. לא שם באנגלית ולא מפתח שהמצאת.',
      '- שדה שכבר יש לו key ברשימה של הסוג שבחרת נכנס ל-fields ולא ל-extra.',
      '- עד 20 שדות ב-extra. אם יש יותר, בחר את המזהים ביותר.',
      '- בסוג סגור החזר extra ריק.'
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

  /* ---------- שיחה ---------- */
  /* `system` הוא ההנחיה ומפת הכספת. `turns` הוא ההיסטוריה, ומגיע מהקורא —
     ל-gemini.js אין זיכרון משלו, בדיוק כמו שאין לו רשימת שדות משלו.
     אותו מפל מודלים ואותו טיימאאוט. */
  G.chat = function (system, turns, onStatus) {
    if (!G.configured()) return Promise.reject(new Error('לא הוגדר מפתח'));
    if (!G.consented('chat')) return Promise.reject(new Error('לא ניתנה הסכמה לשליחה'));

    var contents = [{ role: 'user', parts: [{ text: system }] },
                    { role: 'model', parts: [{ text: '{"reply":"מוכן.","actions":[]}' }] }];
    (turns || []).forEach(function (t) {
      contents.push({ role: t.role === 'model' ? 'model' : 'user', parts: [{ text: t.text }] });
    });
    return send(contents, onStatus).then(extractJson);
  };

  window.Gemini = G;
})();
