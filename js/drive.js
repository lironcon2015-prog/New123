/* drive.js — גיבוי לגוגל דרייב. GIS token client, בלי Apps Script ובלי טוקן סודי.
   scopes: drive.file + drive.appdata (DEC-16).

   drive.file רואה רק קבצים שהאפליקציה יצרה, ולכן מזהה התיקייה חייב לשרוד
   מחיקת נתוני אתר. הוא נשמר ב-appDataFolder — תיקייה נסתרת ששייכת לאפליקציה
   בתוך החשבון, ואינה נותנת גישה לשום קובץ אחר של המשתמש. */
(function () {
  'use strict';

  var C = window.CONFIG, S = window.Settings;

  var API = 'https://www.googleapis.com/drive/v3';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  var GIS = 'https://accounts.google.com/gsi/client';
  var SCOPES = 'https://www.googleapis.com/auth/drive.file ' +
               'https://www.googleapis.com/auth/drive.appdata';

  var ROOT_NAME = 'DocVault';
  var FILES_NAME = 'files';
  var DB_NAME = 'docvault-db.json';
  var POINTER = 'folder.json';
  var FOLDER_MIME = 'application/vnd.google-apps.folder';

  var _token = null;
  var _expires = 0;
  var _client = null;
  var _folder = null;
  var _filesFolder = null;

  var D = {};

  D.SCOPES = SCOPES;

  /* ---------- טוקן ---------- */

  /* הטוקן חי בזיכרון בלבד. טוקן גישה ב-IndexedDB הוא התחייבות, לא נוחות. */
  D.connected = function () { return !!_token && Date.now() < _expires; };

  function loadGis() {
    if (window.google && window.google.accounts) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = GIS;
      s.async = true;
      s.onload = res;
      s.onerror = function () { rej(new Error('טעינת ההתחברות של גוגל נכשלה')); };
      document.head.appendChild(s);
    });
  }

  /* ניתן להחלפה בבדיקות — כדי לבדוק את כל שאר הקובץ בלי גוגל */
  D._requestToken = function (interactive) {
    /* המזהה נבדק לפני טעינת הסקריפט. אין טעם להוריד סקריפט מגוגל כדי לגלות
       אחר כך שחסר קלט שהמשתמש צריך לספק — וההודעה שתחזור צריכה להפנות
       להגדרות ולא לרשת. */
    var clientId = String(S.get(C.K.driveClientId) || '').trim();
    if (!clientId) return Promise.reject(new Error('לא הוגדר מזהה לקוח של גוגל'));

    return loadGis().then(function () {
      return new Promise(function (res, rej) {
        if (!_client) {
          _client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPES,
            callback: function () { /* מוחלף בכל בקשה */ }
          });
        }
        _client.callback = function (r) {
          if (r && r.access_token) res({ token: r.access_token, expiresIn: Number(r.expires_in) || 3600 });
          else rej(new Error((r && r.error_description) || 'ההתחברות בוטלה'));
        };
        _client.error_callback = function (e) { rej(new Error((e && e.message) || 'ההתחברות נכשלה')); };
        _client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
      });
    });
  };

  function token(interactive) {
    if (D.connected()) return Promise.resolve(_token);
    return D._requestToken(!!interactive).then(function (r) {
      _token = r.token;
      /* שוליים של דקה, כדי לא לגלות שהטוקן פג באמצע העלאה */
      _expires = Date.now() + (r.expiresIn - 60) * 1000;
      return _token;
    });
  }

  D.connect = function () {
    return token(true).then(function () { return D.folder(); }).then(function () { return true; });
  };

  D.disconnect = function () {
    _token = null; _expires = 0; _folder = null; _filesFolder = null;
    return S.set(C.K.driveFolderId, '').then(function () {
      return S.set(C.K.driveDbFileId, '');
    });
  };

  /* ---------- קריאות ---------- */

  function call(url, opts) {
    opts = opts || {};
    return token(false).then(function (tk) {
      var headers = opts.headers || {};
      headers.Authorization = 'Bearer ' + tk;
      return fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body
      });
    }).then(function (r) {
      if (r.status === 401) {
        _token = null;
        throw new Error('ההתחברות לגוגל פגה. התחבר שוב מההגדרות.');
      }
      if (!r.ok) throw new Error('גוגל דרייב החזיר שגיאה (' + r.status + ')');
      return opts.raw ? r : r.json();
    });
  }

  function q(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  function listOne(query, spaces) {
    var url = API + '/files?q=' + encodeURIComponent(query) +
      '&fields=files(id,name)&pageSize=10' +
      (spaces ? '&spaces=' + spaces : '');
    return call(url).then(function (j) { return (j.files || [])[0] || null; });
  }

  function createFolder(name, parent) {
    return call(API + '/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name, mimeType: FOLDER_MIME,
        parents: parent ? [parent] : undefined
      })
    }).then(function (j) { return j.id; });
  }

  /* ---------- המצביע ב-appDataFolder ---------- */

  function readPointer() {
    return listOne("name = '" + q(POINTER) + "' and trashed = false", 'appDataFolder')
      .then(function (f) {
        if (!f) return null;
        return call(API + '/files/' + f.id + '?alt=media', { raw: true })
          .then(function (r) { return r.json(); })
          .then(function (j) { return j && j.folderId ? j.folderId : null; })
          .catch(function () { return null; });
      });
  }

  function writePointer(folderId) {
    return listOne("name = '" + q(POINTER) + "' and trashed = false", 'appDataFolder')
      .then(function (f) {
        var meta = f ? {} : { name: POINTER, parents: ['appDataFolder'] };
        return multipart(
          f ? 'PATCH' : 'POST',
          UPLOAD + '/files' + (f ? '/' + f.id : '') + '?uploadType=multipart&fields=id',
          meta,
          'application/json',
          new Blob([JSON.stringify({ folderId: folderId })], { type: 'application/json' })
        );
      });
  }

  /* ---------- multipart/related, בנייה ידנית ---------- */

  function multipart(method, url, metadata, mime, blob) {
    var boundary = 'fv' + Date.now().toString(36) + Math.random().toString(36).slice(2);
    var head = '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: ' + mime + '\r\n\r\n';
    var tail = '\r\n--' + boundary + '--';
    var body = new Blob([head, blob, tail], { type: 'multipart/related; boundary=' + boundary });

    return call(url, {
      method: method,
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body: body
    }).then(function (j) { return j.id; });
  }

  /* ---------- התיקיות ---------- */

  /* שלושה מקורות למזהה, לפי סדר אמון: המצביע בחשבון, מה ש-drive.file
     עדיין רואה, ולבסוף יצירה. שמירה מקומית היא קאש בלבד. */
  D.folder = function () {
    if (_folder) return Promise.resolve(_folder);

    return readPointer().then(function (id) {
      if (id) return verify(id);
      var cached = S.get(C.K.driveFolderId);
      if (cached) return verify(cached);
      return null;
    }).then(function (id) {
      if (id) return id;
      return listOne("name = '" + q(ROOT_NAME) + "' and mimeType = '" + FOLDER_MIME +
                     "' and trashed = false");
    }).then(function (found) {
      if (found) return typeof found === 'string' ? found : found.id;
      return createFolder(ROOT_NAME, null);
    }).then(function (id) {
      _folder = id;
      return Promise.all([S.set(C.K.driveFolderId, id), writePointer(id)]).then(function () { return id; });
    });
  };

  function verify(id) {
    return call(API + '/files/' + id + '?fields=id,trashed')
      .then(function (j) { return j && !j.trashed ? j.id : null; })
      .catch(function () { return null; });
  }

  /* DEC-15: תיקייה שטוחה אחת. תיקייה לכל מסמך הופכת כל איתור לסריקה
     לינארית על אלפי ילדים. */
  function filesFolder() {
    if (_filesFolder) return Promise.resolve(_filesFolder);
    return D.folder().then(function (root) {
      return listOne("name = '" + q(FILES_NAME) + "' and mimeType = '" + FOLDER_MIME +
                     "' and '" + root + "' in parents and trashed = false")
        .then(function (f) { return f ? f.id : createFolder(FILES_NAME, root); });
    }).then(function (id) { _filesFolder = id; return id; });
  }

  /* ---------- db.json ---------- */

  function dbFile() {
    var known = S.get(C.K.driveDbFileId);
    if (known) return verify(known).then(function (id) { return id ? { id: id } : find(); });
    return find();
    function find() {
      return D.folder().then(function (root) {
        return listOne("name = '" + q(DB_NAME) + "' and '" + root + "' in parents and trashed = false");
      });
    }
  }

  D.getDb = function () {
    return dbFile().then(function (f) {
      if (!f) return null;
      return S.set(C.K.driveDbFileId, f.id).then(function () {
        return call(API + '/files/' + f.id + '?alt=media', { raw: true })
          .then(function (r) { return r.json(); });
      });
    });
  };

  D.putDb = function (db) {
    var blob = new Blob([JSON.stringify(db)], { type: 'application/json' });
    return dbFile().then(function (f) {
      if (f) {
        return multipart('PATCH', UPLOAD + '/files/' + f.id + '?uploadType=multipart&fields=id',
          {}, 'application/json', blob);
      }
      return D.folder().then(function (root) {
        return multipart('POST', UPLOAD + '/files?uploadType=multipart&fields=id',
          { name: DB_NAME, parents: [root] }, 'application/json', blob);
      });
    }).then(function (id) { return S.set(C.K.driveDbFileId, id).then(function () { return id; }); });
  };

  /* ---------- blobs ---------- */

  D.uploadBlob = function (docId, name, mime, blob) {
    return filesFolder().then(function (parent) {
      return multipart('POST', UPLOAD + '/files?uploadType=multipart&fields=id',
        { name: docId + '__' + name, parents: [parent] }, mime || 'application/octet-stream', blob);
    });
  };

  D.downloadBlob = function (fileId) {
    return call(API + '/files/' + fileId + '?alt=media', { raw: true })
      .then(function (r) { return r.blob(); });
  };

  window.Drive = D;
})();
