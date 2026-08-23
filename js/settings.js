/* settings.js — הגדרות + מראת localStorage. SPEC §3.5. */
(function () {
  'use strict';

  var C = window.CONFIG, DB = window.DB;
  var cache = {};

  var DEFAULTS = {};
  DEFAULTS[C.K.pinEnabled] = true;
  DEFAULTS[C.K.autoLockMinutes] = C.DEFAULT_AUTOLOCK_MINUTES;
  DEFAULTS[C.K.privacyMode] = false;
  DEFAULTS[C.K.palette] = C.DEFAULT_PALETTE;
  DEFAULTS[C.K.typeface] = C.DEFAULT_TYPEFACE;
  DEFAULTS[C.K.geminiKey] = '';
    DEFAULTS[C.K.geminiConsentText] = false;
  DEFAULTS[C.K.geminiConsentImage] = false;
  DEFAULTS[C.K.geminiLastModel] = '';
  DEFAULTS[C.K.driveFolderId] = '';
  DEFAULTS[C.K.driveDbFileId] = '';
  DEFAULTS[C.K.lastSync] = 0;
  DEFAULTS[C.K.recentFields] = [];
  DEFAULTS[C.K.lastNoticeDay] = '';
  DEFAULTS[C.K.pinHash] = '';

  var S = {};

  S.load = function () {
    return DB.allSettings().then(function (rows) {
      cache = {};
      rows.forEach(function (r) { cache[r.key] = r.value; });
      S.applyTheme();
      return cache;
    });
  };

  S.get = function (key) {
    return cache[key] !== undefined ? cache[key] : DEFAULTS[key];
  };

  S.set = function (key, value) {
    cache[key] = value;
    if (C.MIRRORED.indexOf(key) !== -1) {
      try { localStorage.setItem(C.LS_PREFIX + key, String(value)); } catch (e) { /* מצב פרטי */ }
      S.applyTheme();
    }
    return DB.setSetting(key, value);
  };

  S.applyTheme = function () {
    var r = document.documentElement;
    r.setAttribute('data-pal', S.get(C.K.palette));
    r.setAttribute('data-font', S.get(C.K.typeface));
    document.body.classList.toggle('privacy', !!S.get(C.K.privacyMode));
  };

  /* אחרונים — מקומי, לא מסונכרן. SPEC §8.2 */
  S.pushRecent = function (docId, fieldKey) {
    var list = (S.get(C.K.recentFields) || []).filter(function (r) {
      return !(r.docId === docId && r.fieldKey === fieldKey);
    });
    list.unshift({ docId: docId, fieldKey: fieldKey });
    return S.set(C.K.recentFields, list.slice(0, C.RECENT_MAX));
  };

  window.Settings = S;
})();
