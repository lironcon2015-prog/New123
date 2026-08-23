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

  /* אווטאר: תמונה אם יש, ואות אם אין. התמונה היא data URL על הרשומה
     ולכן היא נצבעת בפריים הראשון — בלי קריאה אסינכרונית ובלי הבהוב. */
  UI.avatar = function (entity, size) {
    var e = entity || { name: '?', color: '#8D929B' };
    var style = 'background:' + (e.color || '#8D929B');
    if (size) style += ';width:' + size + 'px;height:' + size + 'px;font-size:' +
                       Math.round(size * 0.38) + 'px';
    var box = U.el('span', { class: 'av' + (e.avatarImage ? ' av-img' : ''), style: style });
    if (e.avatarImage) box.appendChild(U.el('img', { src: e.avatarImage, alt: '' }));
    else box.appendChild(U.el('span', { text: (e.avatar || (e.name || '?').trim()[0] || '?') }));
    return box;
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

  /* גיליון עם שדה טקסט אחד. מחזיר את הערך, או `null` בביטול —
     ביטול וערך ריק אינם אותו דבר, ולכן `null` ולא מחרוזת ריקה. */
  UI.prompt = function (o) {
    return new Promise(function (res) {
      var settled = false;
      function finish(v) { if (!settled) { settled = true; res(v); } }

      var input = U.el('input', {
        class: 'f-i', type: 'text', id: 'p-in', value: o.value || '',
        placeholder: o.placeholder || '', autocomplete: 'off', maxlength: '80'
      });
      var err = U.el('div', { class: 'f-err' });

      function submit() {
        var v = input.value.trim();
        if (!v) { err.textContent = o.empty || 'צריך ערך'; return; }
        finish(v);
        s.close();
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });

      var s = UI.sheet(o.title, [
        o.body ? U.el('p', { class: 'sheet-p', text: o.body }) : null,
        U.el('div', { class: 'f-g' }, [
          o.label ? U.el('label', { class: 'f-l', for: 'p-in', text: o.label }) : null,
          input, err
        ]),
        U.el('div', { class: 'sheet-actions' }, [
          U.el('button', { class: 'btn', type: 'button', onClick: submit }, o.ok || 'שמירה'),
          U.el('button', {
            class: 'btn ghost', type: 'button',
            onClick: function () { finish(null); s.close(); }
          }, 'ביטול')
        ])
      ], { onClose: function () { finish(null); } });

      setTimeout(function () { input.focus(); input.select(); }, 80);
    });
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

  /* ---------- בורר מסגרת לתצוגה המקדימה ----------
     העוגן הוא חלון 16:10 לתוך תמונה שרובה בדרך כלל גבוהה ממנו. `50% 0`
     הוא ברירת מחדל טובה — ראש המסמך הוא מה שמזהה אותו — אבל הוא ניחוש,
     והוא שגוי בכל צילום שיש בו שוליים למעלה.

     כאן המשתמש מחליט. גרירה אנכית על התצוגה עצמה, ולצידה מחוון שמגיע
     גם למקלדת. שניהם כותבים את אותו מספר.

     כשהתמונה **רחבה** מהמסגרת, `cover` חותך לרוחב ואין שום סרך אנכי
     להזיז. במקרה הזה המחוון מושבת ואומר למה, במקום להזיז ולא לעשות כלום. */
  UI.cropper = function (blob, focusY) {
    var value = Math.max(0, Math.min(100, Number(focusY) || 0));
    var slack = 0;

    var url = URL.createObjectURL(blob);
    var img = U.el('img', { class: 'crop-img', src: url, alt: 'תצוגה מקדימה' });
    var box = U.el('div', { class: 'crop-box' }, img);
    var slider = U.el('input', {
      type: 'range', min: '0', max: '100', step: '1', value: String(value),
      class: 'crop-range', 'aria-label': 'מיקום התצוגה המקדימה'
    });
    var hint = U.el('p', { class: 'muted small', text: 'גרור את התצוגה למעלה ולמטה' });

    function paint() {
      img.style.objectPosition = '50% ' + value + '%';
      slider.value = String(value);
    }
    paint();

    img.addEventListener('load', function () {
      URL.revokeObjectURL(url);
      /* הסרך האנכי בפיקסלים: גובה התמונה כשהיא נמתחת לרוחב המסגרת,
         פחות גובה המסגרת. אפס או פחות = אין מה להזיז. */
      var w = box.clientWidth || 1;
      var shown = w * (img.naturalHeight / (img.naturalWidth || 1));
      slack = shown - box.clientHeight;
      if (slack <= 1) {
        slider.disabled = true;
        box.classList.add('crop-flat');
        hint.textContent = 'התמונה רחבה מהמסגרת ונחתכת לרוחב — אין מה להזיז לאורך.';
      }
    });

    slider.addEventListener('input', function () {
      value = Number(slider.value);
      paint();
    });

    /* גרירה: הזזת האצבע למטה מורידה את התמונה, כלומר חושפת יותר מהראש.
       ההמרה לפי הסרך האמיתי בפיקסלים, כדי שהתנועה תהיה 1:1 ולא "בערך". */
    var dragging = false, lastY = 0;

    box.addEventListener('pointerdown', function (e) {
      if (slack <= 1) return;
      dragging = true;
      lastY = e.clientY;
      box.classList.add('crop-drag');
      try { box.setPointerCapture(e.pointerId); } catch (err) { /* לא חוסם */ }
    });

    box.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      e.preventDefault();
      var dy = e.clientY - lastY;
      lastY = e.clientY;
      value = Math.max(0, Math.min(100, value - (dy / slack) * 100));
      paint();
    });

    function stop() {
      if (!dragging) return;
      dragging = false;
      box.classList.remove('crop-drag');
    }
    box.addEventListener('pointerup', stop);
    box.addEventListener('pointercancel', stop);

    return {
      element: U.el('div', { class: 'crop' }, [box, slider, hint]),
      value: function () { return Math.round(value); }
    };
  };

  /* ---------- משטח זום ----------
     האפליקציה עצמה נעולה בקנה מידה אחד (`App.Zoom`), ולכן ההגדלה חייבת
     לחיות איפשהו — כאן, על המסמך בלבד.

     הזום משנה **רוחב** ולא `transform`. ל-transform אין השפעה על הפריסה,
     ולכן גלילה לתוך תמונה מוגדלת הייתה דורשת ריפוד מחושב; שינוי רוחב
     מגדיל את התוכן באמת, והגלילה של הדפדפן מטפלת בהזזה בחינם.

     `touch-action: none` על המשטח, ולכן שתי המחוות נכתבות כאן: אצבע
     אחת גוררת, שתיים מקרבות. הדפדפן לא ייקח אף אחת מהן לעצמו. */
  UI.zoomable = function (stage, inner) {
    var MIN = 1, MAX = 5;
    var scale = 1;
    var pts = {}, lastDist = 0, lastTap = 0, moved = 0;

    function apply(next, cx, cy) {
      next = Math.max(MIN, Math.min(MAX, next));
      if (Math.abs(next - scale) < 0.001) return;
      var r = stage.getBoundingClientRect();
      var px = (cx == null ? r.width / 2 : cx - r.left);
      var py = (cy == null ? r.height / 2 : cy - r.top);
      var ax = (stage.scrollLeft + px) / scale;
      var ay = (stage.scrollTop + py) / scale;

      scale = next;
      inner.style.width = (scale * 100) + '%';
      stage.classList.toggle('zoomed', scale > 1.001);

      stage.scrollLeft = ax * scale - px;
      stage.scrollTop = ay * scale - py;
    }

    function ids() { return Object.keys(pts); }
    function dist() {
      var k = ids();
      var a = pts[k[0]], b = pts[k[1]];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function mid() {
      var k = ids();
      var a = pts[k[0]], b = pts[k[1]];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    stage.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = { x: e.clientX, y: e.clientY };
      moved = 0;
      if (ids().length === 2) lastDist = dist();
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* עכבר מחוץ למשטח */ }
    });

    stage.addEventListener('pointermove', function (e) {
      var p = pts[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);

      var n = ids().length;
      if (n >= 2) {
        var d = dist();
        if (lastDist > 0) {
          var m = mid();
          apply(scale * (d / lastDist), m.x, m.y);
        }
        lastDist = d;
        e.preventDefault();
        return;
      }
      if (scale > 1.001) {
        stage.scrollLeft -= dx;
        stage.scrollTop -= dy;
        e.preventDefault();
      }
    });

    function up(e) {
      delete pts[e.pointerId];
      if (ids().length < 2) lastDist = 0;
      if (ids().length) return;
      /* הקשה כפולה — שתי הקשות קצרות בלי תזוזה — מחליפה בין מלא למוגדל */
      if (moved < 10) {
        var now = Date.now();
        if (now - lastTap < 320) {
          apply(scale > 1.001 ? MIN : 2.5, e.clientX, e.clientY);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    }
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);

    stage.addEventListener('wheel', function (e) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      apply(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY);
    }, { passive: false });

    return {
      inc: function () { apply(scale * 1.4); },
      dec: function () { apply(scale / 1.4); },
      reset: function () { apply(MIN); },
      scale: function () { return scale; }
    };
  };

  /* ---------- גרירה לסידור ----------
     לחיצה ארוכה מפעילה, כדי שגלילה של רשימה לא תיהפך בטעות לגרירה.
     אחרי הגרירה נבלעת קליק אחד — אחרת שחרור על כרטיס היה מנווט אליו. */
  UI.reorder = function (container, opts) {
    var HOLD_MS = 320, SLOP = 10;
    var timer = null, active = null, startY = 0, dragged = false;

    function items() {
      return Array.prototype.slice.call(container.querySelectorAll(opts.itemSelector));
    }

    function begin(el, e) {
      active = el;
      dragged = true;
      el.classList.add('dragging');
      container.classList.add('reordering');
      if (navigator.vibrate) navigator.vibrate(15);
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* לא חוסם */ }
    }

    function place(y) {
      var sibs = items().filter(function (x) { return x !== active; });
      var before = null;
      for (var i = 0; i < sibs.length; i++) {
        var r = sibs[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) { before = sibs[i]; break; }
      }
      if (before) {
        if (before.previousElementSibling !== active) container.insertBefore(active, before);
      } else if (container.lastElementChild !== active) {
        container.appendChild(active);
      }
    }

    container.addEventListener('pointerdown', function (e) {
      var el = e.target.closest ? e.target.closest(opts.itemSelector) : null;
      if (!el || !container.contains(el)) return;
      startY = e.clientY;
      dragged = false;
      clearTimeout(timer);
      timer = setTimeout(function () { begin(el, e); }, HOLD_MS);
    });

    container.addEventListener('pointermove', function (e) {
      if (!active) {
        if (timer && Math.abs(e.clientY - startY) > SLOP) { clearTimeout(timer); timer = null; }
        return;
      }
      e.preventDefault();
      place(e.clientY);
    });

    function end() {
      clearTimeout(timer); timer = null;
      if (!active) return;
      active.classList.remove('dragging');
      container.classList.remove('reordering');
      active = null;
      if (opts.onDrop) opts.onDrop(items());
    }

    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', end);

    /* שלב הלכידה — הכרטיס עצמו מאזין לקליק, וצריך לעצור אותו לפניו */
    container.addEventListener('click', function (e) {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
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

    var inner = U.el('div', { class: 'zoom-inner' });
    var stage = U.el('div', { class: 'zoom-stage' }, inner);
    var body = U.el('div', { class: 'viewer' }, stage);

    var s = UI.sheet(name || 'מסמך', body, {
      onClose: function () {
        urls.forEach(function (u) { URL.revokeObjectURL(u); });
        urls = [];
      }
    });
    s.panel.classList.add('sheet-full');

    if (blobRec.mime === 'application/pdf') {
      inner.appendChild(U.el('p', { class: 'muted small', text: 'טוען…' }));
      UI.renderPdf(blobRec.data, inner);
    } else {
      inner.appendChild(U.el('img', {
        class: 'viewer-img', src: objectUrl(blobRec.data), alt: name || 'צילום המסמך'
      }));
    }

    var zoom = UI.zoomable(stage, inner);
    body.appendChild(U.el('div', { class: 'viewer-bar' }, [
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'הקטנה',
        onClick: function () { zoom.dec(); }
      }, U.icon('i-zoom-out', 22)),
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'הגדלה',
        onClick: function () { zoom.inc(); }
      }, U.icon('i-zoom-in', 22)),
      U.el('span', { class: 'viewer-hint', text: 'צביטה או הקשה כפולה' }),
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'שיתוף',
        onClick: function () {
          window.Share.file(blobRec.data, name, blobRec.mime).then(function (mode) {
            if (mode === 'download') UI.toast('הקובץ הורד');
          });
        }
      }, U.icon('i-share', 22))
    ]));

    s.zoom = zoom;
    return s;
  };

  window.UI = UI;
})();
