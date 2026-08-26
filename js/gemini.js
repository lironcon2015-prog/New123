/* gemini.js — פרסינג אופציונלי בענן.
   ⚠️ אינו הקנון. §6 באפיון מפנה ל-`_geminiRequest` ב-GymPro Elite, שאין אליו
   גישה מהסשן הזה; נכתב כאן מחדש באישור מפורש. החלפה עתידית דורסת את הקובץ הזה
   כולו — שאר האפליקציה נוגעת בו רק דרך `Gemini.parse`. רשום ב-PORTED.md.

   האפליקציה עובדת מלאה בלעדיו. כל שדה שהוא ממלא אפשר למלא ידנית. */
(function () {
  'use strict';

  var C = window.CONFIG, S = window.Settings, DT = window.DOC_TYPES, U = window.U;
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
  var _refreshed = false;

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
        if (!r.ok) return r.text().then(function (t) { throw httpError(r.status, t); },
                                        function () { throw httpError(r.status, ''); });
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
        /* נשמר כדי שהפרסינג הבא לא יתחיל בשאלה. הרשימה משתנה פעם
           בכמה חודשים, והמחיר של רשימה מיושנת הוא 404 על שם שהתיישן —
           שכבר מטופל, מפנה מקום לבא בתור. */
        S.set(C.K.geminiModelsSeen, names);
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
    if (_models) return Promise.resolve(_models);

    /* **הרשימה שנשמרה מרגע קודם מוציאה את הגילוי מהמסלול הקריטי.**
       עד כאן כל פרסינג בטעינה חדשה שילם סיבוב רשת שלם רק כדי לשאול
       אילו מודלים קיימים — לפני שבייט אחד של המסמך יצא. הרענון עדיין
       קורה, ברקע, ומשפיע על הפרסינג הבא. */
    var warm = (S.get(C.K.geminiModelsSeen) || [])
      .map(function (n) { return String(n || '').trim(); })
      .filter(Boolean);
    if (warm.length) {
      _models = warm;
      /* הרענון קורה **אחרי** הבקשה של המסמך ולא לפניה: `setTimeout` דוחה
         אותו אל מעבר לתור המיקרו-משימות, ולכן הוא אינו מתחרה איתה על
         הרוחב פס דווקא ברגע שבו המשתמש מחכה. פעם אחת בטעינה מספיקה —
         רשימת המודלים של גוגל משתנה פעם בכמה חודשים. */
      if (!_refreshed) {
        _refreshed = true;
        setTimeout(function () {
          discover(null, true).catch(function () { /* החמה מספיקה */ });
        }, 1500);
      }
      return Promise.resolve(warm);
    }

    /* אין רשימה חמה, וזו הפעם הראשונה. גילוי שנכשל ברשת אינו מפיל
       את הפרסינג אם יש ממה ליפול אחורה. */
    return discover(signal);
  };

  /* 400 אינו שם נרדף ל"מפתח פסול" — DEC-44. הוא גם מה שחוזר ממודל
     שדחה את הפורמט, את הגודל או שדה שאינו מכיר. עד כאן כל 400 עצר את
     המפל כולו והאשים את המפתח, כלומר שלח את המשתמש לבדוק מפתח תקין
     במקום לתת למודל הבא לענות. מה שקטלני באמת הוא מה שגוגל אומרת
     עליו במפורש שהוא המפתח, ורק הוא. */
  function httpError(status, body) {
    var reason = '';
    try {
      var j = typeof body === 'string' ? JSON.parse(body) : body;
      reason = (j && j.error && j.error.message) || '';
    } catch (e) { reason = String(body || ''); }

    var badKey = status === 401 ||
      (status === 400 && /api[\s_-]*key|API_KEY_INVALID/i.test(reason));

    var e = new Error(
      badKey         ? 'המפתח נדחה. בדוק אותו בהגדרות.' :
      status === 403 ? 'אין הרשאה למפתח הזה.' :
      status === 429 ? 'חריגה ממכסת הבקשות. נסה שוב בעוד דקה.' :
      status === 404 ? 'המודל הזה לא קיים יותר.' :
      status === 400 ? 'המודל דחה את הבקשה.' :
      status >= 500  ? 'שירות הפרסינג לא זמין כרגע.' :
      'הבקשה נכשלה (' + status + ')');
    e.status = status;
    /* קטלני = אין טעם לנסות מודל אחר עם אותו מפתח */
    e.fatal = badKey || status === 403;
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
      if (!r.ok) {
        return r.text().then(function (t) { throw httpError(r.status, t); },
                             function () { throw httpError(r.status, ''); });
      }
      return r.json();
    }).then(function (j) {
      var cand = (j.candidates || [])[0];
      var text = cand && cand.content && (cand.content.parts || [])
        .map(function (p) { return p.text || ''; }).join('');
      if (!text) {
        /* "התשובה חזרה ריקה" הוא שלושה מצבים שונים שנראים אותו דבר,
           ואחד מהם נפוץ דווקא כאן: מודל שמסרב לקרוא תעודת זהות. מי
           שרואה "ריקה" מנסה שוב ושוב; מי שרואה "סירב" יודע למלא ידנית. */
        var fin = (cand && cand.finishReason) || '';
        throw new Error(
          fin === 'MAX_TOKENS' ? 'התשובה נקטעה באמצע' :
          /SAFETY|PROHIBITED|BLOCK|RECITATION/i.test(fin) ? 'המודל סירב לקרוא את המסמך' :
          'התשובה חזרה ריקה');
      }
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
  function request(parts, onStatus, signal) {
    return send([{ role: 'user', parts: parts }], onStatus, signal);
  }

  /* **תקרת זמן לניסיון, ולא רק למפל — DEC-44.**

     עד כאן היה מונה אחד בן 45 שניות על הכל: הגילוי, המודל הראשון, וכל
     מי שאחריו. מודל שנתקע בלע את התקציב כולו, ה-abort הפיל את הבקשה
     שרצה, והמפל **לא רץ מעולם** — המשתמש חיכה 45 שניות וקיבל "הבקשה
     ארכה זמן רב מדי" בזמן ששני מודלים מהירים יותר עמדו בתור ולא נשאלו.
     זה בדיוק הדפוס שדווח: "נכשל, או לוקח זמן ארוך".

     היום: כל ניסיון מקבל את התקרה שלו, ניסיון איטי הוא כישלון של אותו
     מודל בלבד, ומעליהם תקרה אחת לכל הפרסינג כדי שהנפילה תמיד תיגמר.

     `signal` הוא הדילוג של המשתמש (DEC-43). שלושת המצבים — דילוג, תקרת
     הכל, ומודל שלא ענה — הם AbortError מאותו `fetch`, ולכן מי שקטע נזכר
     ומקבל הודעה משלו. */
  function send(contents, onStatus, signal) {
    var all = new AbortController();
    var total = setTimeout(function () { all.abort(); }, C.GEMINI_TOTAL_MS);
    var canceled = false;

    function onAbort() { canceled = true; all.abort(); }
    if (signal) {
      if (signal.aborted) onAbort();
      else if (signal.addEventListener) signal.addEventListener('abort', onAbort);
    }
    function stop() {
      clearTimeout(total);
      if (signal && signal.removeEventListener) signal.removeEventListener('abort', onAbort);
    }
    function why(e) {
      if (!e || (e.name !== 'AbortError' && !e.slow)) return e;
      if (e.slow) return e;
      var out = new Error(canceled ? 'הפרסינג דולג' : 'הפרסינג לא הסתיים בזמן');
      out.canceled = canceled;
      return out;
    }

    /* ניסיון אחד, עם השעון שלו. קטיעה שמקורה בשעון הזה היא כישלון של
       המודל ולא של הפרסינג — ולכן היא חוזרת מסומנת, והמפל ממשיך. */
    function attempt(model) {
      var one = new AbortController();
      var timer = setTimeout(function () { one.abort(); }, C.GEMINI_TIMEOUT_MS);
      function relay() { one.abort(); }
      all.signal.addEventListener('abort', relay);

      function release() {
        clearTimeout(timer);
        all.signal.removeEventListener('abort', relay);
      }

      return callModel(model, contents, one.signal).then(function (text) {
        release();
        return text;
      }, function (e) {
        release();
        if (e && e.name === 'AbortError' && !all.signal.aborted) {
          var slow = new Error('המודל לא ענה בזמן');
          slow.slow = true;
          throw slow;
        }
        throw e;
      });
    }

    return G.cascade(all.signal).then(function (names) {
      if (!names.length) throw new Error('לא נמצאו מודלים זמינים למפתח הזה');
      /* הרשימה שגוגל מחזירה היא עשרות שמות. בלי תקרה, מפתח שחרג ממכסה
         היה מהלך על כולם — עשרות סיבובים לפני שנאמר משהו למשתמש. */
      var order = names.slice(0, Math.max(1, C.GEMINI_TRIES));

      var i = 0;
      function next(err) {
        if (all.signal.aborted) throw why({ name: 'AbortError' });
        if (i >= order.length) throw err || new Error('כל המודלים נכשלו');
        var model = order[i++];
        if (onStatus) onStatus(model, i);
        return attempt(model).then(function (text) {
          S.set(C.K.geminiLastModel, model);
          return text;
        }, function (e) {
          if (e && e.name === 'AbortError') throw why(e);
          if (e && e.fatal) throw e;
          return next(e);
        });
      }
      return next(null);
    }).then(function (text) {
      stop();
      return text;
    }, function (e) {
      stop();
      throw why(e);
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
  G.parse = function (input, onStatus, signal) {
    var kind = input.blob ? 'image' : 'text';
    if (!G.configured()) return Promise.reject(new Error('לא הוגדר מפתח'));
    if (!G.consented(kind)) return Promise.reject(new Error('לא ניתנה הסכמה לשליחה'));

    var head = { text: G.prompt() };

    /* מוקטן לפני השליחה — DEC-44. ההעלאה היא רוב ההמתנה במכשיר סלולרי,
       והפיקסלים שמעבר לזה נזרקים אצל גוגל ממילא. */
    var partsP = input.blob
      ? window.Files.forParse(input.blob, input.mime).then(function (small) {
          if (small.blob.size > C.GEMINI_MAX_BYTES) {
            /* נעצר כאן ולא אחרי דקה של העלאה שתיפול בצד השני */
            throw new Error('הקובץ גדול מדי לפרסינג (' + U.bytes(small.blob.size) +
              '). צלם אותו במקום לצרף את הקובץ המקורי.');
          }
          return blobToB64(small.blob).then(function (b64) {
            return [head, { inline_data: {
              mime_type: small.mime || input.mime || 'image/jpeg', data: b64
            } }];
          });
        })
      : Promise.resolve([head, { text: '\nהמסמך:\n' + input.text }]);

    return partsP
      .then(function (parts) {
        /* דילוג בזמן ההמרה ל-base64 עוצר **לפני** השליחה ולא אחריה.
           קובץ של כמה מגה-בייט הוא מאות מילישניות שבהן הכפתור כבר על
           המסך, ובלי הבדיקה הזאת הלחיצה עליו הייתה שולחת בכל זאת. */
        if (signal && signal.aborted) {
          var e = new Error('הפרסינג דולג');
          e.canceled = true;
          throw e;
        }
        return request(parts, onStatus, signal);
      })
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
