/* ui.js — toast, גיליונות, שורת שדה, צופה. */
(function () {
  'use strict';

  var U = window.U, KINDS = window.KINDS, C = window.CONFIG;
  var toastEl = null, toastTimer = null;

  var UI = {};

  /* ---------- toast ---------- */
  /* "הועתק" בלבד. "מספר תעודת הזהות הועתק" מכריז בקול את מה שמיסכת. */
  UI.toast = function (msg) {
    if (!toastEl) {
      toastEl = U.el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' },
        U.el('span'));
      document.body.appendChild(toastEl);
    }
    toastEl.firstChild.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1600);
  };

  /* ---------- לוח ---------- */
  /* חייב לרוץ בתוך ה-gesture — iOS Safari מסרב אחרת */
  UI.copy = function (text) {
    var s = String(text == null ? '' : text);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).catch(function () { legacy(s); });
    } else {
      legacy(s);
    }
    function legacy(v) {
      var ta = U.el('textarea', { readonly: true });
      ta.value = v;
      ta.style.cssText = 'position:fixed;top:0;inset-inline-start:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* אין מסלול שלישי */ }
      document.body.removeChild(ta);
    }
  };

  /* ---------- שורת שדה — הרכיב החשוב באפליקציה ---------- */
  /* כל השורה היא יעד המגע. אין כפתור "העתק" נפרד.
     העתקה עובדת גם במצב ממוסך ומעתיקה את הערך המלא. */
  UI.fieldRow = function (field, opts) {
    opts = opts || {};
    var shown = KINDS.display(field);
    var sensitive = KINDS.isSensitive(field);
    var revealed = false;

    var valueBox = U.el('span', { class: 'row-v' });

    function paint() {
      U.clear(valueBox);
      var txt = (sensitive && !revealed) ? KINDS.mask(shown) : shown;
      valueBox.appendChild(U.bidi(txt, sensitive ? 'sens' : null));
    }
    paint();

    var labelBox = U.el('span', { class: 'row-l' }, [
      U.el('span', { text: field.label })
    ]);
    if (field.verified === false) {
      labelBox.appendChild(U.el('span', { class: 'chip verify', text: 'לאימות' }));
    }

    var body = U.el('span', { class: 'row-b' }, [labelBox, valueBox]);
    if (opts.sub) body.appendChild(U.el('span', { class: 'row-sub', text: opts.sub }));

    var row = U.el('div', {
      class: 'row' + (field.multiline ? ' row-multi' : ''),
      role: 'button',
      tabindex: '0',
      'aria-label': 'העתקת ' + field.label
    }, body);

    if (sensitive) {
      var eye = U.el('button', {
        class: 'eye', type: 'button',
        'aria-label': 'הצג ערך', 'aria-pressed': 'false'
      }, U.icon('i-eye'));
      eye.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        revealed = !revealed;
        paint();
        U.clear(eye).appendChild(U.icon(revealed ? 'i-eye-off' : 'i-eye'));
        eye.setAttribute('aria-label', revealed ? 'הסתר ערך' : 'הצג ערך');
        eye.setAttribute('aria-pressed', String(revealed));
      });
      row.appendChild(eye);
    }

    function doCopy() {
      UI.copy(KINDS.copyValue(field));
      UI.toast('הועתק');
      if (opts.onCopy) opts.onCopy();
    }

    row.addEventListener('click', doCopy);
    row.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); doCopy(); }
    });

    return row;
  };

  UI.rowsCard = function (rows) {
    return U.el('div', { class: 'rows' }, rows);
  };

  /* ---------- צ׳יפ תפוגה ---------- */
  /* צבע לעולם לא לבדו — הצ׳יפ נושא גם טקסט */
  UI.chip = function (bucket, text) {
    return U.el('span', { class: 'chip ' + bucket, text: text });
  };

  UI.avatar = function (entity) {
    var e = entity || { name: '?', color: '#8D929B' };
    return U.el('span', {
      class: 'av',
      style: 'background:' + (e.color || '#8D929B')
    }, U.el('span', { text: (e.avatar || (e.name || '?').trim()[0] || '?') }));
  };

  /* ---------- מצב ריק — הפעולה בתוך המסגרת ----------
     ported from Navigo: js/app.js:renderHero — **כל המסגרת היא <button> אחד**,
     לא div עם כפתור בתוכו. זה מה שנותן ל"הפעולה בתוך המסגרת" משמעות אמיתית:
     כל השטח לחיץ, ו-scale(.97) מגיב על המסגרת כולה ולא על הפיל הפנימי. */
  UI.empty = function (o) {
    var kids = [
      U.icon(o.icon || 'i-file', 48),
      U.el('div', { class: 'empty-t', text: o.title }),
      o.sub ? U.el('div', { class: 'empty-s', text: o.sub }) : null
    ];
    if (!o.action) return U.el('div', { class: 'empty' }, kids);

    kids.push(U.el('span', { class: 'btn', text: o.action }));
    return U.el('button', {
      class: 'empty empty-act', type: 'button', onClick: o.onAction
    }, kids);
  };

  /* ---------- גיליון תחתון ---------- */
  UI.sheet = function (title, content, opts) {
    opts = opts || {};
    var panel = U.el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      U.el('div', { class: 'sheet-h' }, [
        U.el('h2', { text: title }),
        U.el('button', {
          class: 'iconbtn', type: 'button', 'aria-label': 'סגירה',
          onClick: function () { close(); }
        }, U.icon('i-x', 22))
      ]),
      U.el('div', { class: 'sheet-b' }, content)
    ]);
    var back = U.el('div', { class: 'backdrop' }, panel);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    requestAnimationFrame(function () { back.classList.add('in'); });

    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    function close() {
      document.removeEventListener('keydown', onKey);
      back.classList.remove('in');
      setTimeout(function () { back.remove(); }, 200);
      if (opts.onClose) opts.onClose();
    }
    return { close: close, panel: panel };
  };

  UI.confirm = function (o) {
    return new Promise(function (res) {
      var settled = false;
      function finish(v) { if (!settled) { settled = true; res(v); } }
      var s = UI.sheet(o.title, [
        U.el('p', { class: 'sheet-p', text: o.body }),
        U.el('div', { class: 'sheet-actions' }, [
          U.el('button', {
            class: 'btn' + (o.danger ? ' danger' : ''), type: 'button',
            onClick: function () { finish(true); s.close(); }
          }, o.ok || 'אישור'),
          U.el('button', {
            class: 'btn ghost', type: 'button',
            onClick: function () { finish(false); s.close(); }
          }, 'ביטול')
        ])
      ], { onClose: function () { finish(false); } });
    });
  };

  /* ---------- צופה מסמכים ---------- */
  /* ported from Navigo: js/ui.js:viewer + renderPdf.
     PDF מרונדר ל-<canvas> דרך pdf.js מקומי, לא ב-iframe. `blob:` ב-iframe
     אינו אמין ב-iOS Safari, ו-<embed> מציג צופה מערכתי שאין עליו שליטה.
     canvas עובד זהה בכל פלטפורמה וגם אופליין — וזה מה שמצדיק את המשקל. */

  var PDF_OPTS = {
    standardFontDataUrl: 'lib/pdfjs/standard_fonts/',
    cMapUrl: 'lib/pdfjs/cmaps/',
    cMapPacked: true
  };

  var _pdfP = null;

  function loadPdfjs() {
    if (_pdfP) return _pdfP;
    _pdfP = new Promise(function (res, rej) {
      if (window.pdfjsLib) return res();
      var s = document.createElement('script');
      s.src = 'lib/pdfjs/pdf.min.js';
      s.onload = res;
      s.onerror = function () { rej(new Error('צופה ה-PDF לא נטען')); };
      document.head.appendChild(s);
    }).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdfjs/pdf.worker.min.js';
      return window.pdfjsLib;
    });
    _pdfP.catch(function () { _pdfP = null; });
    return _pdfP;
  }

  UI.renderPdf = function (blob, container) {
    return loadPdfjs().then(function (lib) {
      return blob.arrayBuffer().then(function (data) {
        var opts = { data: data };
        Object.keys(PDF_OPTS).forEach(function (k) { opts[k] = PDF_OPTS[k]; });
        return lib.getDocument(opts).promise;
      });
    }).then(function (pdf) {
      U.clear(container);
      var pages = Math.min(pdf.numPages, 20);
      var i = 1;

      function page() {
        if (i > pages) {
          if (pdf.numPages > pages) {
            container.appendChild(U.el('p', { class: 'muted small', text:
              'מוצגים ' + pages + ' העמודים הראשונים מתוך ' + pdf.numPages }));
          }
          return null;
        }
        return pdf.getPage(i++).then(function (pg) {
          var base = pg.getViewport({ scale: 1 });
          var scale = Math.min(2, (container.clientWidth || 360) / base.width) *
                      (window.devicePixelRatio || 1);
          var vp = pg.getViewport({ scale: scale });
          var canvas = U.el('canvas', { class: 'pdf-page' });
          canvas.width = vp.width;
          canvas.height = vp.height;
          container.appendChild(canvas);
          var ctx = canvas.getContext('2d');
          /* ported from Navigo — והשורה הזאת עלתה להם שעות: ההקשר יורש RTL
             מה-DOM, `fillText` מתעגן לצד ההפוך, ו-clip rects של ה-PDF חותכים
             אותיות. הסימפטום נראה כמו PDF פגום ולא כמו באג RTL. */
          ctx.direction = 'ltr';
          return pg.render({ canvasContext: ctx, viewport: vp }).promise.then(page);
        });
      }
      return page();
    }).catch(function (e) {
      U.clear(container).appendChild(UI.empty({
        icon: 'i-file', title: 'לא הצלחתי לפתוח את ה-PDF',
        sub: (e && e.message) || ''
      }));
    });
  };

  /* כל blob: URL שנוצר נרשם ומבוטל בסגירה. בנאביגו זו דליפה מוכרת —
     `close()` מנקה את ה-DOM ולא מבטל את ה-URL, והזיכרון נשאר תפוס. */
  UI.viewer = function (blobRec, name) {
    var urls = [];
    function objectUrl(b) { var u = URL.createObjectURL(b); urls.push(u); return u; }

    var body = U.el('div', { class: 'viewer' });

    var s = UI.sheet(name || 'מסמך', body, {
      onClose: function () {
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        urls = [];
      }
    });
    s.panel.classList.add('sheet-full');

    if (blobRec.mime === 'application/pdf') {
      body.appendChild(U.el('p', { class: 'muted small', text: 'טוען…' }));
      UI.renderPdf(blobRec.data, body);
    } else {
      body.appendChild(U.el('img', {
        class: 'viewer-img', src: objectUrl(blobRec.data), alt: name || 'צילום המסמך'
      }));
    }

    return s;
  };

  window.UI = UI;
})();
