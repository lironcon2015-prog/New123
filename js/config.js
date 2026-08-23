/* config.js — קבועים. אין תלות באיש. */
(function () {
  'use strict';

  window.CONFIG = {
    APP_NAME: 'התיק המשפחתי',

    /* מסך הבית. הניתוב, ברירת המחדל, סדר הסרגל והבאנר היומי נגזרים ממנו,
       כדי שהחלפת מסך בית תהיה שורה אחת ולא ציד אחר מופעים. */
    HOME: 'entities',
    /* מקור אחד. index.html מציב אותו, `node tools/bump.mjs` כותב אותו. */
    VERSION: window._BUNDLE_VERSION || '0.0.0',

    DB_NAME: 'DocVaultDB',
    DB_VERSION: 1,

    /* נרמול תמונות — SPEC §7.2 */
    IMAGE_MAX_EDGE: 2400,
    IMAGE_PASS_BYTES: 800 * 1024,
    JPEG_QUALITY: 0.85,

    /* אווטאר של ישות — נשמר כ-data URL על הרשומה עצמה ולא כ-blob נפרד,
       כדי שהוא יצויר בפריים הראשון ויסתנכרן עם הישות.
       **הצלע הקצרה** היא שנקבעת: התמונה נשמרת שלמה, והחיתוך לעיגול הוא
       `object-fit` בזמן תצוגה. כך אפשר להזיז את המסגרת גם אחרי הבחירה. */
    AVATAR_SHORT_EDGE: 256,
    AVATAR_QUALITY: 0.82,
    AVATAR_MAX_BYTES: 120 * 1024,

    RECENT_MAX: 6,

    GEMINI_TIMEOUT_MS: 45000,

    DEFAULT_PALETTE: 'a',
    DEFAULT_TYPEFACE: 'assistant',
    DEFAULT_AUTOLOCK_MINUTES: 5,

    /* מפתחות settings — SPEC §3.5 */
    K: {
      pinHash: 'pinHash',
      pinEnabled: 'pinEnabled',
      autoLockMinutes: 'autoLockMinutes',
      privacyMode: 'privacyMode',
      palette: 'palette',
      typeface: 'typeface',
      geminiKey: 'geminiKey',
      geminiConsentText: 'geminiConsentText',
      geminiConsentImage: 'geminiConsentImage',
      geminiConsentChat: 'geminiConsentChat',
      geminiLastModel: 'geminiLastModel',
      driveClientId: 'driveClientId',
      driveFolderId: 'driveFolderId',
      driveDbFileId: 'driveDbFileId',
      lastSync: 'lastSync',
      recentFields: 'recentFields',
      lastNoticeDay: 'lastNoticeDay',
      lastNoticeSig: 'lastNoticeSig'
    },

    /* המפתחות היחידים שממורים ל-localStorage — SPEC §3.5 */
    MIRRORED: ['palette', 'typeface'],
    LS_PREFIX: 'fv.',

    ENTITY_TYPES: [
      { key: 'person',  label: 'אדם',  icon: 'i-person' },
      { key: 'vehicle', label: 'רכב',  icon: 'i-car' },
      { key: 'home',    label: 'בית',  icon: 'i-home' },
      { key: 'other',   label: 'אחר',  icon: 'i-doc' }
    ],

    /* עמומים בכוונה: אווטאר שמתחרה באקסנט הופך את מסך הבית לרועש */
    ENTITY_COLORS: [
      '#4B6B7A', '#8B6F47', '#7A5B7E', '#4F6B4A',
      '#8A5A5A', '#5B6480', '#7E6B3F', '#5F7370'
    ],

    PALETTES: [
      { key: 'a', label: 'אינדיגו־חציל', swatch: '#4A4080' },
      { key: 'b', label: 'פטרול עמוק',   swatch: '#1F5350' },
      { key: 'c', label: 'טרקוטה חרוכה', swatch: '#A9492E' }
    ],

    TYPEFACES: [
      { key: 'assistant', label: 'Assistant' },
      { key: 'system',    label: 'מחסנית מערכת' }
    ]
  };
})();
