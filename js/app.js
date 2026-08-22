/* app.js — אתחול, ניתוב, מסלולי הקלט הגלובליים. */
(function () {
  'use strict';

  var U = window.U, UI = window.UI, DB = window.DB, S = window.Settings,
      C = window.CONFIG, Vault = window.Vault, Screens = window.Screens,
      Files = window.Files;

  var App = {
    staged: [],
    pendingEntityId: null,
    pendingSource: 'upload'
  };

  var root, nav, fileInput, locked = false;

  var TABS = [
    { hash: '#/expiries', icon: 'i-calendar', label: 'תפוגות' },
    { hash: '#/quick',    icon: 'i-search',   label: 'העתקה' },
    { hash: null,         gap: true },
    { hash: '#/entities', icon: 'i-users',    label: 'ישויות' },
    { hash: '#/settings', icon: 'i-settings', label: 'הגדרות' }
  ];

  /* ---------- ניתוב ---------- */

  function parse() {
    var h = (location.hash || '#/expiries').replace(/^#\/?/, '');
    return h.split('/').filter(Boolean);
  }

  function screenFor(parts) {
    switch (parts[0]) {
      case 'quick':    return Screens.quick();
      case 'entities': return Screens.entities();
      case 'entity':   return Screens.entity(parts[1]);
      case 'settings': return Screens.settings();
      case 'doc':
        if (parts[1] === 'new') return Screens.docForm(null);
        if (parts[2] === 'edit') return Screens.docForm(parts[1]);
        return Screens.doc(parts[1]);
      default:         return Screens.expiries();
    }
  }

  App.render = function () {
    return Screens.reload().then(function () {
      var parts = parse();
      U.clear(root).appendChild(screenFor(parts));
      paintNav(parts);
      root.scrollTop = 0;
    });
  };

  /* ---------- סרגל ---------- */

  function paintNav(parts) {
    var active = '#/' + (parts[0] || 'expiries');
    /* מסך פנימי משאיר את הלשון הראשית מודגשת */
    if (parts[0] === 'entity' || parts[0] === 'doc') active = '#/entities';
    nav.querySelectorAll('.nav-i').forEach(function (b) {
      b.classList.toggle('on', b.dataset.hash === active);
    });
  }

  function buildNav() {
    nav = U.el('div', { class: 'nav', role: 'navigation' });
    TABS.forEach(function (t) {
      if (t.gap) { nav.appendChild(U.el('span', { class: 'nav-gap' })); return; }
      var b = U.el('button', {
        class: 'nav-i', type: 'button', dataset: { hash: t.hash }
      }, [U.icon(t.icon, 24), U.el('span', { text: t.label })]);
      b.addEventListener('click', function () { location.hash = t.hash; });
      nav.appendChild(b);
    });

    var fab = U.el('button', {
      class: 'fab', type: 'button', 'aria-label': 'הוספת מסמך'
    }, U.icon('i-plus', 28));
    fab.addEventListener('click', function () { Screens.addSheet(); });

    document.body.appendChild(nav);
    document.body.appendChild(fab);
  }

  /* ---------- מסלולי הקלט ---------- */

  App.pickFiles = function (existingDoc, useCamera) {
    fileInput.value = '';
    if (useCamera) fileInput.setAttribute('capture', 'environment');
    else fileInput.removeAttribute('capture');
    fileInput.dataset.docId = existingDoc ? existingDoc.id : '';
    fileInput.click();
  };

  function ingest(fileList, source, existingDocId) {
    if (!fileList || !fileList.length) return;
    App.pendingSource = source;
    Files.normalizeAll(fileList).then(function (r) {
      if (r.errors.length) UI.toast(r.errors[0]);
      if (!r.files.length) return;

      if (existingDocId) return attachTo(existingDocId, r.files);

      App.staged = r.files;
      var converted = r.files.filter(function (f) { return f.converted; })[0];
      if (converted) UI.toast('הומר · ' + Files.label(converted));
      location.hash = '#/doc/new';
      if (parse()[0] === 'doc' && parse()[1] === 'new') App.render();
    });
  }

  function attachTo(docId, files) {
    return DB.get('docs', docId).then(function (doc) {
      if (!doc) return;
      var blobs = files.map(function (f) {
        return { id: U.id(), docId: doc.id, data: f.blob, mime: f.mime, size: f.size };
      });
      doc.files = (doc.files || []).concat(blobs.map(function (b, i) {
        return { blobId: b.id, driveFileId: null, mime: b.mime, name: files[i].name, size: b.size };
      }));
      return DB.saveDoc(doc, blobs).then(function () {
        UI.toast(U.count(files.length, 'קובץ נוסף', 'קבצים נוספו'));
        App.render();
      });
    });
  }

  function buildFileInput() {
    fileInput = U.el('input', {
      type: 'file', accept: 'image/*,application/pdf', multiple: true,
      class: 'hidden-input', 'aria-hidden': 'true', tabindex: '-1'
    });
    fileInput.addEventListener('change', function () {
      var docId = fileInput.dataset.docId || '';
      var source = fileInput.hasAttribute('capture') ? 'camera' : 'upload';
      ingest(fileInput.files, source, docId);
    });
    document.body.appendChild(fileInput);
  }

  /* הדבקה — שני מסלולי משנה. SPEC §7.1 */
  function bindPaste() {
    document.addEventListener('paste', function (e) {
      if (locked) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      var files = Files.fromDataTransfer(e.clipboardData);
      if (files.length) {
        e.preventDefault();
        ingest(files, 'paste', '');
        return;
      }
      var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (text && text.trim()) {
        e.preventDefault();
        App.staged = [];
        App.pastedText = text.trim();
        UI.toast('טקסט נקלט · הפרסינג יגיע בשלב 4');
        location.hash = '#/doc/new';
      }
    });
  }

  function bindDrop() {
    var shell = document.body;
    var depth = 0;

    shell.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    shell.addEventListener('dragenter', function (e) {
      e.preventDefault();
      if (++depth === 1) shell.classList.add('dragging');
    });
    shell.addEventListener('dragleave', function () {
      if (--depth <= 0) { depth = 0; shell.classList.remove('dragging'); }
    });
    shell.addEventListener('drop', function (e) {
      e.preventDefault();
      depth = 0;
      shell.classList.remove('dragging');
      if (locked) return;
      ingest(Files.fromDataTransfer(e.dataTransfer), 'drop', '');
    });
  }

  /* ---------- נעילה ---------- */

  function showLock() {
    locked = true;
    document.body.classList.add('locked');
    U.clear(root).appendChild(Screens.lock(function () {
      locked = false;
      document.body.classList.remove('locked');
      App.render();
    }));
  }

  /* ---------- אתחול ---------- */

  function boot() {
    root = document.getElementById('app');
    buildNav();
    buildFileInput();
    bindPaste();
    bindDrop();

    window.addEventListener('hashchange', function () {
      if (locked) return;
      App.render();
    });

    Vault.watch(showLock);

    DB.open()
      .then(function () { return S.load(); })
      .then(function () {
        if (!location.hash) location.hash = '#/expiries';
        if (Vault.enabled() && Vault.hasPin() && !Vault.isUnlocked()) {
          showLock();
        } else {
          App.render();
        }
      })
      .catch(function (e) {
        U.clear(root).appendChild(U.el('div', { class: 'scr' }, [
          U.el('h1', { class: 'scr-title', text: 'האחסון לא נפתח' }),
          U.el('p', { class: 'muted', text:
            'הדפדפן חסם את IndexedDB. גלישה פרטית או חסימת אחסון אתרים מונעות מהאפליקציה לעבוד.' }),
          U.el('p', { class: 'muted small', text: String(e && e.message || e) })
        ]));
      });
  }

  window.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
