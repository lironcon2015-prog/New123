/* db.js — IndexedDB. SPEC §2, §3. */
(function () {
  'use strict';

  var C = window.CONFIG, U = window.U;
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var req = indexedDB.open(C.DB_NAME, C.DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('entities')) {
          var en = db.createObjectStore('entities', { keyPath: 'id' });
          en.createIndex('by_updatedAt', 'updatedAt');
          en.createIndex('by_sortOrder', 'sortOrder');
        }
        if (!db.objectStoreNames.contains('docs')) {
          var d = db.createObjectStore('docs', { keyPath: 'id' });
          d.createIndex('by_entityId', 'entityId');
          d.createIndex('by_typeKey', 'typeKey');
          d.createIndex('by_updatedAt', 'updatedAt');
          d.createIndex('by_expiryDate', 'expiryDate');
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'id' })
            .createIndex('by_docId', 'docId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
    return dbp;
  }

  function tx(stores, mode) {
    return open().then(function (db) { return db.transaction(stores, mode); });
  }

  function wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }

  function done(t) {
    return new Promise(function (res, rej) {
      t.oncomplete = function () { res(); };
      t.onabort = t.onerror = function () { rej(t.error); };
    });
  }

  var DB = {};

  DB.open = open;

  DB.get = function (store, key) {
    return tx([store], 'readonly').then(function (t) {
      return wrap(t.objectStore(store).get(key));
    });
  };

  DB.all = function (store) {
    return tx([store], 'readonly').then(function (t) {
      return wrap(t.objectStore(store).getAll());
    });
  };

  DB.put = function (store, rec) {
    return tx([store], 'readwrite').then(function (t) {
      t.objectStore(store).put(rec);
      return done(t).then(function () { return rec; });
    });
  };

  /* ---------- ישויות ---------- */

  DB.listEntities = function () {
    return DB.all('entities').then(function (rows) {
      return rows.filter(function (r) { return !r.deleted; })
        .sort(function (a, b) { return (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name, 'he'); });
    });
  };

  DB.saveEntity = function (e) {
    e.updatedAt = U.now();
    if (e.deleted == null) e.deleted = 0;
    if (e.sortOrder == null) e.sortOrder = Date.now();
    return DB.put('entities', e);
  };

  /* מחיקת ישות מוחקת רכות את מסמכיה — מסמך בלי ישות אינו נגיש בשום מסך */
  DB.deleteEntity = function (id) {
    return DB.listDocs().then(function (docs) {
      var mine = docs.filter(function (d) { return d.entityId === id; });
      return Promise.all(mine.map(function (d) { return DB.deleteDoc(d.id); }));
    }).then(function () {
      return DB.get('entities', id);
    }).then(function (rec) {
      if (!rec) return null;
      return DB.put('entities', { id: rec.id, deleted: 1, updatedAt: U.now() });
    });
  };

  /* ---------- מסמכים ---------- */

  DB.listDocs = function () {
    return DB.all('docs').then(function (rows) {
      return rows.filter(function (r) { return !r.deleted; });
    });
  };

  /* טרנזקציה אחת מעל docs ו-blobs — כישלון באמצע לא משאיר מסמך בלי הקובץ.
     SPEC §7.4 */
  DB.saveDoc = function (doc, newBlobs) {
    doc.updatedAt = U.now();
    if (doc.deleted == null) doc.deleted = 0;
    return tx(['docs', 'blobs'], 'readwrite').then(function (t) {
      t.objectStore('docs').put(doc);
      var bs = t.objectStore('blobs');
      (newBlobs || []).forEach(function (b) { bs.put(b); });
      return done(t).then(function () { return doc; });
    });
  };

  /* ported from Navigo: js/db.js:remove — tombstone מצומצם, לא רשומה מופשטת.
     בדיוק המפתחות שהמיזוג ואינדקס ה-entityId צריכים. כל השאר נמחק בכוונה:
     אין סיבה שמספר תעודת זהות של רשומה מחוקה ימשיך להסתובב ב-db.json. */
  DB.deleteDoc = function (id) {
    return DB.get('docs', id).then(function (rec) {
      if (!rec) return null;
      var d = { id: rec.id, entityId: rec.entityId, deleted: 1, updatedAt: U.now() };
      return tx(['docs', 'blobs'], 'readwrite').then(function (t) {
        t.objectStore('docs').put(d);
        var idx = t.objectStore('blobs').index('by_docId');
        idx.openCursor(IDBKeyRange.only(id)).onsuccess = function (e) {
          var c = e.target.result;
          if (c) { c.delete(); c.continue(); }
        };
        return done(t).then(function () { return d; });
      });
    });
  };

  DB.removeFile = function (doc, blobId) {
    doc.files = (doc.files || []).filter(function (f) { return f.blobId !== blobId; });
    doc.updatedAt = U.now();
    return tx(['docs', 'blobs'], 'readwrite').then(function (t) {
      t.objectStore('docs').put(doc);
      t.objectStore('blobs').delete(blobId);
      return done(t).then(function () { return doc; });
    });
  };

  /* ---------- blobs ---------- */

  DB.blob = function (id) { return DB.get('blobs', id); };

  DB.blobsForDoc = function (docId) {
    return tx(['blobs'], 'readonly').then(function (t) {
      return wrap(t.objectStore('blobs').index('by_docId').getAll(IDBKeyRange.only(docId)));
    });
  };

  /* ---------- הגדרות ---------- */

  DB.allSettings = function () { return DB.all('settings'); };
  DB.setSetting = function (key, value) { return DB.put('settings', { key: key, value: value }); };

  window.DB = DB;
})();
