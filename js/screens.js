/* screens.js — ששת המסכים. */
(function () {
  'use strict';

  var U = window.U, UI = window.UI, DB = window.DB, DT = window.DOC_TYPES,
      KINDS = window.KINDS, E = window.Expiry, S = window.Settings,
      C = window.CONFIG, Search = window.Search, Forms = window.Forms,
      Files = window.Files, Vault = window.Vault;

  var Screens = {};
  var state = { entities: [], docs: [], byId: {} };

  Screens.state = state;

  Screens.reload = function () {
    return Promise.all([DB.listEntities(), DB.listDocs()]).then(function (r) {
      state.entities = r[0];
      state.docs = r[1];
      state.byId = {};
      state.entities.forEach(function (e) { state.byId[e.id] = e; });
      return state;
    });
  };

  function head(title, actions) {
    return U.el('div', { class: 'scr-head' }, [
      U.el('h1', { class: 'scr-title', text: title }),
      actions ? U.el('div', { class: 'scr-actions' }, actions) : null
    ]);
  }

  function backHead(title, actions) {
    return U.el('div', { class: 'scr-head' }, [
      U.el('button', {
        class: 'iconbtn i-flip', type: 'button', 'aria-label': 'חזרה',
        onClick: function () { history.back(); }
      }, U.icon('i-back', 22)),
      U.el('h1', { class: 'scr-title', text: title }),
      actions ? U.el('div', { class: 'scr-actions' }, actions) : null
    ]);
  }

  function docSub(doc) {
    var e = state.byId[doc.entityId];
    return (e ? e.name : 'ללא ישות') + ' · ' + DT.label(doc.typeKey);
  }

  function docCard(item) {
    var doc = item.doc;
    var ent = state.byId[doc.entityId];
    var card = U.el('button', { class: 'card', type: 'button' }, [
      UI.avatar(ent),
      U.el('span', { class: 'card-b' }, [
        U.el('span', { class: 'card-t', text: doc.title }),
        U.el('span', { class: 'card-s', text: ent ? ent.name : '' })
      ]),
      UI.chip(item.bucket, E.label(item.days, doc.expiryDate))
    ]);
    card.addEventListener('click', function () { location.hash = '#/doc/' + doc.id; });
    return card;
  }

  /* ---------- מסך הבית: תפוגות ---------- */

  Screens.expiries = function () {
    var wrap = U.el('div', { class: 'scr' }, head(C.APP_NAME));
    var grouped = E.group(state.docs);
    var total = grouped.past.length + grouped.d30.length + grouped.d90.length + grouped.ok.length;

    var notice = Screens.noticeBanner(grouped);
    if (notice) wrap.appendChild(notice);

    if (!state.docs.length) {
      wrap.appendChild(UI.empty({
        icon: 'i-folder',
        title: 'עוד אין כאן מסמכים',
        sub: 'צלם תעודה, הדבק מהלוח, או גרור קובץ לכאן',
        action: 'הוספת מסמך',
        onAction: function () { Screens.addSheet(); }
      }));
      return wrap;
    }

    if (!total) {
      wrap.appendChild(UI.empty({
        icon: 'i-calendar',
        title: 'אין מסמכים עם תאריך תפוגה',
        sub: 'מסמך מקבל מקום כאן ברגע שיש לו תאריך',
        action: 'למסמכים',
        onAction: function () { location.hash = '#/entities'; }
      }));
      return wrap;
    }

    ['past', 'd30', 'd90'].forEach(function (key) {
      var items = grouped[key];
      if (!items.length) return;
      var meta = E.BUCKETS.filter(function (b) { return b.key === key; })[0];
      wrap.appendChild(U.el('div', { class: 'bucket-h', text: meta.label }));
      items.forEach(function (it) { wrap.appendChild(docCard(it)); });
    });

    /* "תקין" מקופל. מסך הבית מציג בעיות. DEC-05 */
    if (grouped.ok.length) {
      var open = false;
      var list = U.el('div');
      var fold = U.el('button', { class: 'fold', type: 'button', 'aria-expanded': 'false' }, [
        U.el('span', { text: 'תקין · ' + U.count(grouped.ok.length, 'מסמך אחד', 'מסמכים') }),
        U.icon('i-chevron', 18)
      ]);
      fold.addEventListener('click', function () {
        open = !open;
        fold.setAttribute('aria-expanded', String(open));
        fold.classList.toggle('open', open);
        U.clear(list);
        if (open) grouped.ok.forEach(function (it) { list.appendChild(docCard(it)); });
      });
      wrap.appendChild(fold);
      wrap.appendChild(list);
    }

    return wrap;
  };

  /* באנר פעם ביום למכשיר. אין push, ואין הבטחה שיש. SPEC §6.5 */
  Screens.noticeBanner = function (grouped) {
    if (!E.needsNotice(grouped)) return null;
    var today = U.todayYmd();
    if (S.get(C.K.lastNoticeDay) === today) return null;

    var n = E.notifiable(grouped).length;
    var bar = U.el('div', { class: 'notice' }, [
      U.icon('i-bell', 20),
      U.el('span', { text: U.count(n, 'מסמך אחד דורש טיפול', 'מסמכים דורשים טיפול') }),
      U.el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'סגירה' }, U.icon('i-x', 18))
    ]);
    bar.querySelector('button').addEventListener('click', function () {
      S.set(C.K.lastNoticeDay, today);
      bar.remove();
    });
    return bar;
  };

  /* ---------- העתקה מהירה ---------- */

  Screens.quick = function () {
    var wrap = U.el('div', { class: 'scr' }, head('העתקה מהירה'));
    var rows = Search.rows(state.docs, state.byId);

    var input = U.el('input', {
      class: 'search-i', type: 'search', inputmode: 'search',
      placeholder: 'חיפוש בכל השדות', 'aria-label': 'חיפוש בכל השדות'
    });
    wrap.appendChild(U.el('div', { class: 'search' }, [U.icon('i-search'), input]));

    var results = U.el('div');
    wrap.appendChild(results);

    function renderRows(list, heading) {
      U.clear(results);
      if (heading) results.appendChild(U.el('div', { class: 'bucket-h', text: heading }));
      if (!list.length) {
        results.appendChild(U.el('p', { class: 'muted', text: 'אין תוצאות' }));
        return;
      }
      results.appendChild(UI.rowsCard(list.map(function (r) {
        return UI.fieldRow(r.field, {
          sub: docSub(r.doc),
          onCopy: function () { S.pushRecent(r.doc.id, r.field.key); }
        });
      })));
    }

    /* מסך ריק בפתיחה הוא כישלון — הוא נפתח כשמישהו מחכה. SPEC §8.2 */
    function showRecent() {
      var rec = Search.recent(rows, S.get(C.K.recentFields));
      if (rec.length) { renderRows(rec, 'אחרונים'); return; }
      U.clear(results);
      results.appendChild(UI.empty({
        icon: 'i-search',
        title: state.docs.length ? 'הקלד כדי לחפש' : 'עוד אין מה להעתיק',
        sub: state.docs.length
          ? 'החיפוש עובר על כל השדות של כל המסמכים'
          : 'הוסף מסמך ראשון והשדות שלו יופיעו כאן',
        action: state.docs.length ? null : 'הוספת מסמך',
        onAction: function () { Screens.addSheet(); }
      }));
    }

    showRecent();
    input.addEventListener('input', U.debounce(function () {
      var q = input.value.trim();
      if (!q) { showRecent(); return; }
      renderRows(Search.query(rows, q));
    }, 90));

    setTimeout(function () { input.focus(); }, 60);
    return wrap;
  };

  /* ---------- ישויות ---------- */

  Screens.entities = function () {
    var wrap = U.el('div', { class: 'scr' }, head('ישויות', [
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'ישות חדשה',
        onClick: function () { Screens.entitySheet(null); }
      }, U.icon('i-plus', 22))
    ]));

    if (!state.entities.length) {
      wrap.appendChild(UI.empty({
        icon: 'i-users',
        title: 'עוד אין ישויות',
        sub: 'ישות היא אדם, רכב או בית שהמסמכים נתלים עליו',
        action: 'יצירת ישות',
        onAction: function () { Screens.entitySheet(null); }
      }));
      return wrap;
    }

    state.entities.forEach(function (e) {
      var n = state.docs.filter(function (d) { return d.entityId === e.id; }).length;
      var meta = C.ENTITY_TYPES.filter(function (t) { return t.key === e.type; })[0];
      var card = U.el('button', { class: 'card', type: 'button' }, [
        UI.avatar(e),
        U.el('span', { class: 'card-b' }, [
          U.el('span', { class: 'card-t', text: e.name }),
          U.el('span', { class: 'card-s', text: (meta ? meta.label : '') + ' · ' + U.count(n, 'מסמך אחד', 'מסמכים') })
        ]),
        U.icon('i-chevron', 18)
      ]);
      card.addEventListener('click', function () { location.hash = '#/entity/' + e.id; });
      wrap.appendChild(card);
    });

    return wrap;
  };

  Screens.entity = function (id) {
    var e = state.byId[id];
    if (!e) return Screens.missing('הישות לא נמצאה');

    var wrap = U.el('div', { class: 'scr' }, backHead(e.name, [
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'עריכת ישות',
        onClick: function () { Screens.entitySheet(e); }
      }, U.icon('i-edit', 22))
    ]));

    var mine = state.docs.filter(function (d) { return d.entityId === id; });
    if (!mine.length) {
      wrap.appendChild(UI.empty({
        icon: 'i-folder',
        title: 'אין מסמכים ל' + e.name,
        sub: 'צלם תעודה, הדבק מהלוח, או גרור קובץ לכאן',
        action: 'הוספת מסמך',
        onAction: function () { Screens.addSheet(id); }
      }));
      return wrap;
    }

    mine.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    mine.forEach(function (doc) {
      var days = doc.expiryDate ? E.daysLeft(doc.expiryDate) : null;
      var bucket = E.bucket(days);
      var card = U.el('button', { class: 'card', type: 'button' }, [
        U.el('span', { class: 'card-ic' }, U.icon(DT.icon(doc.typeKey), 22)),
        U.el('span', { class: 'card-b' }, [
          U.el('span', { class: 'card-t', text: doc.title }),
          U.el('span', { class: 'card-s', text: DT.label(doc.typeKey) })
        ]),
        bucket ? UI.chip(bucket, E.label(days, doc.expiryDate)) : null
      ]);
      card.addEventListener('click', function () { location.hash = '#/doc/' + doc.id; });
      wrap.appendChild(card);
    });

    return wrap;
  };

  /* ---------- כרטיס מסמך ---------- */

  Screens.doc = function (id) {
    var doc = state.docs.filter(function (d) { return d.id === id; })[0];
    if (!doc) return Screens.missing('המסמך לא נמצא');

    var t = DT.get(doc.typeKey);
    var wrap = U.el('div', { class: 'scr scr-flush' }, backHead(doc.title, [
      U.el('button', {
        class: 'iconbtn', type: 'button', 'aria-label': 'עריכת מסמך',
        onClick: function () { location.hash = '#/doc/' + id + '/edit'; }
      }, U.icon('i-edit', 22))
    ]));

    var body = U.el('div', { class: 'scr-body' });
    wrap.appendChild(body);

    /* עוגן ויזואלי. מסמך ללא קובץ מקבל פס אקסנט-רך, לא placeholder אפור */
    var headCard = U.el('div', { class: 'doc-head' });
    body.appendChild(headCard);

    if (doc.files && doc.files.length) {
      var first = doc.files[0];
      DB.blob(first.blobId).then(function (rec) {
        if (!rec) return;
        if (rec.mime === 'application/pdf') {
          var ph = U.el('button', { class: 'anchor anchor-pdf', type: 'button' }, [
            U.icon('i-file', 40),
            U.el('span', { text: first.name })
          ]);
          ph.addEventListener('click', function () { UI.viewer(rec, first.name); });
          headCard.insertBefore(ph, headCard.firstChild);
        } else {
          var url = URL.createObjectURL(rec.data);
          var img = U.el('img', { class: 'anchor', src: url, alt: 'צילום המסמך' });
          img.addEventListener('click', function () { UI.viewer(rec, first.name); });
          img.addEventListener('load', function () { URL.revokeObjectURL(url); });
          headCard.insertBefore(img, headCard.firstChild);
        }
      });
    } else {
      headCard.appendChild(U.el('div', { class: 'anchor-none' }));
    }

    var days = doc.expiryDate ? E.daysLeft(doc.expiryDate) : null;
    headCard.appendChild(U.el('div', { class: 'doc-meta' }, [
      U.el('div', {}, [
        U.el('div', { class: 'card-t', text: DT.label(doc.typeKey) }),
        U.el('div', { class: 'card-s', text: (state.byId[doc.entityId] || {}).name || '' })
      ]),
      days != null ? UI.chip(E.bucket(days), E.label(days, doc.expiryDate)) : null
    ]));

    /* שורות שדה + שורות התאריך הסינתטיות */
    var rows = (doc.fields || []).map(function (f) {
      return UI.fieldRow(f, { onCopy: function () { S.pushRecent(doc.id, f.key); } });
    });
    if (doc.issueDate) {
      rows.push(UI.fieldRow(
        { key: '__issue', label: 'תאריך הנפקה', value: doc.issueDate, kind: 'date', verified: true },
        { onCopy: function () { S.pushRecent(doc.id, '__issue'); } }));
    }
    if (doc.expiryDate) {
      rows.push(UI.fieldRow(
        { key: '__expiry', label: 'בתוקף עד', value: doc.expiryDate, kind: 'date', verified: true },
        { onCopy: function () { S.pushRecent(doc.id, '__expiry'); } }));
    }
    if (rows.length) body.appendChild(UI.rowsCard(rows));

    if (doc.notes) {
      body.appendChild(U.el('div', { class: 'notes' }, [
        U.el('div', { class: 'notes-l', text: 'הערות' }),
        U.el('div', { text: doc.notes })
      ]));
    }

    /* קבצים */
    if (t && t.allowFiles) {
      body.appendChild(Screens.filesBlock(doc));
    } else {
      body.appendChild(U.el('p', { class: 'muted small', text:
        'לסוג הזה לא נשמרות סריקות. מקור האמת לצילום נמצא בנאביגו.' }));
    }

    body.appendChild(U.el('button', {
      class: 'btn ghost danger wide', type: 'button',
      onClick: function () {
        UI.confirm({
          title: 'מחיקת מסמך',
          body: 'המסמך והקבצים שלו יימחקו. אי אפשר לבטל.',
          ok: 'מחיקה', danger: true
        }).then(function (yes) {
          if (!yes) return;
          DB.deleteDoc(doc.id).then(function () {
            UI.toast('המסמך נמחק');
            location.hash = '#/entity/' + doc.entityId;
          });
        });
      }
    }, 'מחיקת מסמך'));

    return wrap;
  };

  Screens.filesBlock = function (doc) {
    var box = U.el('div', { class: 'files' }, U.el('div', { class: 'files-h', text: 'קבצים' }));
    (doc.files || []).forEach(function (f) {
      var row = U.el('div', { class: 'file-row' }, [
        U.icon(f.mime === 'application/pdf' ? 'i-file' : 'i-image', 20),
        U.el('span', { class: 'file-n', text: f.name }),
        U.el('span', { class: 'file-s' }, U.bidi(U.bytes(f.size)))
      ]);
      row.addEventListener('click', function () {
        DB.blob(f.blobId).then(function (rec) { if (rec) UI.viewer(rec, f.name); });
      });
      var del = U.el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'הסרת קובץ' },
        U.icon('i-trash', 18));
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        UI.confirm({ title: 'הסרת קובץ', body: f.name, ok: 'הסרה', danger: true })
          .then(function (yes) {
            if (!yes) return;
            DB.removeFile(doc, f.blobId).then(function () {
              UI.toast('הקובץ הוסר');
              window.App.render();
            });
          });
      });
      row.appendChild(del);
      box.appendChild(row);
    });

    var add = U.el('button', { class: 'btn ghost wide', type: 'button' }, 'הוספת קובץ');
    add.addEventListener('click', function () { window.App.pickFiles(doc); });
    box.appendChild(add);
    return box;
  };

  /* ---------- טופס מסמך ---------- */

  Screens.docForm = function (docId) {
    var doc = docId ? state.docs.filter(function (d) { return d.id === docId; })[0] : null;
    if (docId && !doc) return Screens.missing('המסמך לא נמצא');

    if (!state.entities.length) {
      var w = U.el('div', { class: 'scr' }, backHead('מסמך חדש'));
      w.appendChild(UI.empty({
        icon: 'i-users',
        title: 'צריך ישות אחת לפחות',
        sub: 'מסמך נתלה על אדם, רכב או בית',
        action: 'יצירת ישות',
        onAction: function () { Screens.entitySheet(null); }
      }));
      return w;
    }

    var proposal = doc ? null : window.App.proposal;
    var staged = (proposal && proposal.dropFiles) ? [] : window.App.staged;
    var wrap = U.el('div', { class: 'scr' }, backHead(doc ? 'עריכת מסמך' : 'מסמך חדש'));

    if (proposal && proposal.notice) {
      wrap.appendChild(U.el('div', { class: 'notice notice-' + proposal.notice.level }, [
        U.icon(proposal.notice.level === 'ok' ? 'i-check' : 'i-bell', 20),
        U.el('span', { text: proposal.notice.text })
      ]));
    }

    if (proposal && proposal.dropFiles && window.App.staged.length) {
      wrap.appendChild(U.el('p', { class: 'muted small', text:
        'הצילום שימש לקריאה בלבד ולא נשמר.' }));
    }

    if (staged.length) {
      wrap.appendChild(U.el('div', { class: 'staged' }, [
        U.el('div', { class: 'files-h', text: U.count(staged.length, 'קובץ אחד מצורף', 'קבצים מצורפים') })
      ].concat(staged.map(function (f) {
        return U.el('div', { class: 'file-row' }, [
          U.icon(f.mime === 'application/pdf' ? 'i-file' : 'i-image', 20),
          U.el('span', { class: 'file-n', text: f.name }),
          U.el('span', { class: 'file-s' }, U.bidi(Files.label(f)))
        ]);
      }))));
    }

    var form = Forms.doc({
      doc: doc,
      proposal: proposal,
      entities: state.entities,
      entityId: window.App.pendingEntityId
    });
    wrap.appendChild(form.element);

    var err = U.el('p', { class: 'form-err', role: 'alert' });
    wrap.appendChild(err);

    var save = U.el('button', { class: 'btn wide', type: 'button' }, 'שמירה');
    save.addEventListener('click', function () {
      err.textContent = '';
      var r = form.read();
      if (r.error) { err.textContent = r.error; return; }

      /* DEC-04: ילדים שנמצאו בספח מוצעים לפני השמירה, ברירת מחדל לא מסומן */
      var people = doc ? [] : window.Parse.peopleIn(r.value.typeKey, form.values());
      if (people.length) {
        Screens.peopleSheet(people, function (chosen) { commit(r, chosen); });
        return;
      }
      commit(r, []);
    });

    function commit(r, people) {
      var t = DT.get(r.value.typeKey);
      var files = (t && t.allowFiles) ? staged : [];
      var blobs = files.map(function (f) {
        return { id: U.id(), docId: r.value.id, data: f.blob, mime: f.mime, size: f.size };
      });
      r.value.files = (r.value.files || []).concat(blobs.map(function (b, i) {
        return {
          blobId: b.id, driveFileId: null, mime: b.mime,
          name: files[i].name, size: b.size
        };
      }));
      if (!doc && files.length) r.value.source = window.App.pendingSource || 'upload';

      DB.saveDoc(r.value, blobs).then(function () {
        return Promise.all(people.map(function (p) {
          return DB.saveEntity({
            id: U.id(), type: 'person', name: p.name,
            color: U.pick(C.ENTITY_COLORS, p.name), avatar: p.name.trim()[0]
          });
        }));
      }).then(function () {
        window.App.staged = [];
        window.App.proposal = null;
        window.App.pendingEntityId = null;
        var msg = r.unverified
          ? U.count(r.unverified, 'נשמר · שדה אחד לאימות', 'נשמר · שדות לאימות')
          : 'נשמר';
        if (people.length) msg += ' · ' + U.count(people.length, 'ישות נוצרה', 'ישויות נוצרו');
        UI.toast(msg);
        location.hash = '#/doc/' + r.value.id;
      });
    }
    wrap.appendChild(save);

    if (!doc && staged.length) {
      wrap.appendChild(U.el('p', { class: 'muted small', text:
        'הקבצים נשמרים רק בשמירה. יציאה מהמסך משחררת אותם.' }));
    }

    return wrap;
  };

  /* ---------- גיליון ישות ---------- */

  Screens.entitySheet = function (entity) {
    var form = Forms.entity(entity);
    var err = U.el('p', { class: 'form-err', role: 'alert' });

    var actions = [
      U.el('button', { class: 'btn wide', type: 'button' }, entity ? 'שמירה' : 'יצירה')
    ];
    if (entity) {
      actions.push(U.el('button', { class: 'btn ghost danger wide', type: 'button' }, 'מחיקת ישות'));
    }

    var sheet = UI.sheet(entity ? 'עריכת ישות' : 'ישות חדשה',
      [form.element, err, U.el('div', { class: 'sheet-actions col' }, actions)]);

    actions[0].addEventListener('click', function () {
      var r = form.read();
      if (r.error) { err.textContent = r.error; return; }
      DB.saveEntity(r.value).then(function () {
        sheet.close();
        UI.toast(entity ? 'נשמר' : 'הישות נוצרה');
        window.App.render();
      });
    });

    if (entity) {
      actions[1].addEventListener('click', function () {
        UI.confirm({
          title: 'מחיקת ' + entity.name,
          body: 'כל המסמכים של הישות יימחקו יחד איתה.',
          ok: 'מחיקה', danger: true
        }).then(function (yes) {
          if (!yes) return;
          DB.deleteEntity(entity.id).then(function () {
            sheet.close();
            UI.toast('הישות נמחקה');
            location.hash = '#/entities';
          });
        });
      });
    }
  };

  /* ---------- גיליון הצעת ישויות ---------- */
  /* מציע, לא יוצר. הצ׳קבוקסים פתוחים ולא מסומנים — פלט פרסינג לא נשמר בשקט. */
  Screens.peopleSheet = function (people, done) {
    var boxes = people.map(function (p) {
      var box = U.el('span', { class: 'box' });
      var row = U.el('button', { class: 'chk', type: 'button', 'aria-pressed': 'false' }, [
        box,
        U.el('span', {}, [
          U.el('span', { text: p.name }),
          p.year ? U.el('span', { class: 'chk-y' }, U.bidi(p.year)) : null
        ])
      ]);
      row.addEventListener('click', function () {
        var on = row.getAttribute('aria-pressed') !== 'true';
        row.setAttribute('aria-pressed', String(on));
        row.classList.toggle('on', on);
      });
      return { row: row, person: p };
    });

    var sheet = UI.sheet('נמצאו אנשים במסמך', [
      U.el('p', { class: 'sheet-p', text:
        'יצירת ישות מאפשרת לתלות עליהם דרכון או ביטוח. אפשר גם לדלג ולעשות את זה אחר כך.' }),
      U.el('div', { class: 'checks' }, boxes.map(function (b) { return b.row; })),
      U.el('div', { class: 'sheet-actions col' }, [
        U.el('button', {
          class: 'btn wide', type: 'button',
          onClick: function () {
            var chosen = boxes.filter(function (b) {
              return b.row.getAttribute('aria-pressed') === 'true';
            }).map(function (b) { return b.person; });
            sheet.close();
            done(chosen);
          }
        }, 'שמירה'),
        U.el('button', {
          class: 'btn ghost wide', type: 'button',
          onClick: function () { sheet.close(); done([]); }
        }, 'שמירה בלי ליצור ישויות')
      ])
    ]);
  };

  /* ---------- גיליון הוספה ---------- */

  Screens.addSheet = function (entityId) {
    window.App.pendingEntityId = entityId || null;

    function route(kind) {
      sheet.close();
      window.App.pendingSource = (kind === 'camera' || kind === 'mrz') ? 'camera' : 'upload';
      if (kind === 'manual') {
        window.App.staged = [];
        window.App.proposal = null;
        location.hash = '#/doc/new';
      } else if (kind === 'mrz') {
        window.App.pickFiles(null, true, 'mrz');
      } else {
        window.App.pickFiles(null, kind === 'camera');
      }
    }

    var items = [
      { icon: 'i-passport', t: 'סריקת דרכון או ת״ז', k: 'mrz',
        s: 'קריאה על המכשיר · הורדה חד-פעמית של ' +
           String(window.Parse.ASSET_MB).replace('.', '.') + 'MB' },
      { icon: 'i-camera', t: 'צילום', s: 'מצלמת המכשיר', k: 'camera' },
      { icon: 'i-upload', t: 'בחירת קובץ', s: 'תמונה או PDF', k: 'file' },
      { icon: 'i-edit', t: 'הזנה ידנית', s: 'בלי קובץ', k: 'manual' }
    ];

    var sheet = UI.sheet('הוספת מסמך', [
      U.el('div', { class: 'routes' }, items.map(function (it) {
        var b = U.el('button', { class: 'route', type: 'button' }, [
          U.icon(it.icon, 24),
          U.el('span', {}, [
            U.el('span', { class: 'route-t', text: it.t }),
            U.el('span', { class: 'route-s', text: it.s })
          ])
        ]);
        b.addEventListener('click', function () { route(it.k); });
        return b;
      })),
      U.el('p', { class: 'muted small', text:
        'אפשר גם להדביק תמונה או טקסט מהלוח, או לגרור קובץ לחלון.' })
    ]);
  };

  /* ---------- הגדרות ---------- */

  Screens.settings = function () {
    var wrap = U.el('div', { class: 'scr' }, head('הגדרות'));

    function section(title, kids) {
      return U.el('div', { class: 'sect' },
        [U.el('div', { class: 'sect-h', text: title })].concat(kids));
    }

    function segRow(labelText, options, value, onPick) {
      var seg = U.el('div', { class: 'seg', role: 'group', 'aria-label': labelText });
      options.forEach(function (o) {
        var b = U.el('button', {
          class: 'seg-b', type: 'button', 'aria-pressed': String(o.key === value)
        }, [
          o.swatch ? U.el('i', { class: 'seg-sw', style: 'background:' + o.swatch }) : null,
          U.el('span', { text: o.label })
        ]);
        b.addEventListener('click', function () {
          seg.querySelectorAll('.seg-b').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          b.setAttribute('aria-pressed', 'true');
          onPick(o.key);
        });
        seg.appendChild(b);
      });
      return U.el('div', { class: 'set-row col' }, [
        U.el('span', { class: 'set-l', text: labelText }), seg
      ]);
    }

    function toggleRow(labelText, sub, value, onChange) {
      var btn = U.el('button', {
        class: 'switch', type: 'button', role: 'switch',
        'aria-checked': String(!!value), 'aria-label': labelText
      }, U.el('i'));
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(next));
        onChange(next, btn);
      });
      return U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-b' }, [
          U.el('span', { class: 'set-l', text: labelText }),
          sub ? U.el('span', { class: 'set-s', text: sub }) : null
        ]),
        btn
      ]);
    }

    wrap.appendChild(section('תצוגה', [
      segRow('פלטה', C.PALETTES.map(function (p) {
        return { key: p.key, label: p.label, swatch: p.swatch };
      }), S.get(C.K.palette), function (k) { S.set(C.K.palette, k); }),

      segRow('כתב', C.TYPEFACES.map(function (t) {
        return { key: t.key, label: t.label };
      }), S.get(C.K.typeface), function (k) { S.set(C.K.typeface, k); }),

      toggleRow('מצב פרטיות', 'טשטוש כל הערכים הרגישים על המסך',
        S.get(C.K.privacyMode), function (v) {
          S.set(C.K.privacyMode, v).then(function () { S.applyTheme(); });
        })
    ]));

    /* ---- PIN — DEC-03 ---- */
    var pinKids = [];
    if (Vault.hasPin() && Vault.enabled()) {
      pinKids.push(U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-b' }, [
          U.el('span', { class: 'set-l', text: 'שער PIN' }),
          U.el('span', { class: 'set-s', text: 'דלוק. נדרש בכל פתיחה.' })
        ])
      ]));
      pinKids.push(U.el('button', {
        class: 'btn ghost wide', type: 'button',
        onClick: function () { Screens.pinSheet('change'); }
      }, 'שינוי קוד'));
      pinKids.push(U.el('button', {
        class: 'btn ghost danger wide', type: 'button',
        onClick: function () {
          UI.confirm({
            title: 'כיבוי שער ה-PIN',
            body: 'אחרי הכיבוי, כל מי שמחזיק את המכשיר הפתוח יראה את תעודות הזהות, ' +
                  'הפוליסות והמספרים של כל המשפחה, בלי שום שלב נוסף.',
            ok: 'כיבוי', danger: true
          }).then(function (yes) {
            if (!yes) return;
            Vault.disable().then(function () {
              UI.toast('שער ה-PIN כובה');
              window.App.render();
            });
          });
        }
      }, 'כיבוי שער ה-PIN'));

      var mins = [1, 5, 15, 0];
      pinKids.push(segRow('נעילה אוטומטית', mins.map(function (m) {
        return { key: String(m), label: m === 0 ? 'כבוי' : m + ' דקות' };
      }), String(S.get(C.K.autoLockMinutes)), function (k) {
        S.set(C.K.autoLockMinutes, Number(k));
      }));
    } else {
      pinKids.push(U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-b' }, [
          U.el('span', { class: 'set-l', text: 'שער PIN' }),
          U.el('span', { class: 'set-s', text: 'כבוי. האפליקציה נפתחת ישירות.' })
        ])
      ]));
      pinKids.push(U.el('button', {
        class: 'btn wide', type: 'button',
        onClick: function () { Screens.pinSheet('set'); }
      }, 'הפעלת שער PIN'));
    }
    wrap.appendChild(section('פרטיות', pinKids));

    /* ---- פרסינג בענן ---- */
    var keyInput = U.el('input', {
      class: 'f-i', type: 'password', id: 'g-key', dir: 'ltr',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'מפתח Gemini', value: S.get(C.K.geminiKey) || ''
    });
    var keyMsg = U.el('div', { class: 'f-err', role: 'status' });

    var gemKids = [
      U.el('p', { class: 'muted small', text:
        'אופציונלי לגמרי. בלי מפתח, כל השדות ממולאים ידנית והאפליקציה עובדת במלואה. ' +
        'סריקת דרכון ותעודת זהות רצה על המכשיר ואינה נוגעת בזה.' }),
      U.el('div', { class: 'f-g' }, [
        U.el('label', { class: 'f-l', for: 'g-key', text: 'מפתח' }),
        keyInput, keyMsg
      ]),
      U.el('button', {
        class: 'btn ghost wide', type: 'button',
        onClick: function () {
          var v = keyInput.value.trim();
          S.set(C.K.geminiKey, v).then(function () {
            keyMsg.textContent = v ? 'נשמר במכשיר הזה בלבד' : 'המפתח הוסר';
            window.App.render();
          });
        }
      }, 'שמירת המפתח')
    ];

    /* שתי הסכמות נפרדות. שליחת מחרוזת פוליסה היא ויתור אחר לגמרי
       משליחת צילום של תעודת זהות, ולכן הן לא חולקות מתג. */
    gemKids.push(toggleRow('שליחת טקסט מודבק',
        'טקסט שהדבקת נשלח לגוגל לפרסינג',
      S.get(C.K.geminiConsentText), function (v) { S.set(C.K.geminiConsentText, v); }));

    gemKids.push(toggleRow('שליחת צילומי מסמכים',
        'הצילום עצמו נשלח לגוגל — כולל תעודות זהות',
      S.get(C.K.geminiConsentImage), function (v, btn) {
        if (!v) { S.set(C.K.geminiConsentImage, false); return; }
        UI.confirm({
          title: 'שליחת צילומים לגוגל',
          body: 'הצילום של המסמך — כולל תעודת זהות, רישיון או פוליסה — יישלח ' +
                'לשרתי גוגל לצורך הפרסינג. סריקת דרכון ות״ז לא צריכה את זה: ' +
                'היא רצה על המכשיר.',
          ok: 'מאשר'
        }).then(function (yes) {
          if (yes) S.set(C.K.geminiConsentImage, true);
          else btn.setAttribute('aria-checked', 'false');
        });
      }));

    wrap.appendChild(section('פרסינג בענן', gemKids));

    wrap.appendChild(section('אודות', [
      U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-l', text: 'גרסה' }),
        U.el('span', { class: 'set-s' }, U.bidi(C.VERSION))
      ]),
      U.el('div', { class: 'set-row' }, [
        U.el('span', { class: 'set-l', text: 'מסמכים' }),
        U.el('span', { class: 'set-s', text: U.count(state.docs.length, 'מסמך אחד', 'מסמכים') })
      ]),
      U.el('p', { class: 'muted small', text:
        'הכל נשמר על המכשיר הזה בלבד. גיבוי לדרייב עדיין לא קיים.' })
    ]));

    return wrap;
  };

  Screens.pinSheet = function (mode) {
    var first = '', stage = 'first';
    var title = U.el('p', { class: 'sheet-p', text: 'בחר קוד בן ארבע ספרות' });
    var dots = U.el('div', { class: 'dots' });
    var err = U.el('p', { class: 'form-err', role: 'alert' });
    var buf = '';

    function paint() {
      U.clear(dots);
      for (var i = 0; i < 4; i++) {
        dots.appendChild(U.el('i', { class: 'dot' + (i < buf.length ? ' on' : '') }));
      }
    }

    function press(d) {
      err.textContent = '';
      if (d === 'del') { buf = buf.slice(0, -1); paint(); return; }
      if (buf.length >= 4) return;
      buf += d;
      paint();
      if (buf.length < 4) return;
      /* מסגרת אחת כדי שהנקודה הרביעית תיצבע, ואז מיד — השהיה ארוכה יותר
         מפילה ספרה שהוקלדה מהר אחרי הרביעית */
      requestAnimationFrame(function () {
        if (stage === 'first') {
          first = buf; buf = ''; stage = 'confirm';
          title.textContent = 'הקלד שוב לאישור';
          paint();
        } else {
          if (buf !== first) {
            buf = ''; stage = 'first'; first = '';
            title.textContent = 'בחר קוד בן ארבע ספרות';
            err.textContent = 'הקודים לא תאמו. נסה שוב.';
            paint();
            return;
          }
          Vault.setPin(first).then(function () {
            sheet.close();
            UI.toast(mode === 'change' ? 'הקוד שונה' : 'שער ה-PIN הופעל');
            window.App.render();
          });
        }
      });
    }

    paint();
    var sheet = UI.sheet(mode === 'change' ? 'שינוי קוד' : 'הפעלת שער PIN',
      [title, dots, err, Screens.keypad(press)]);
  };

  Screens.keypad = function (press) {
    var pad = U.el('div', { class: 'pad' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {
      pad.appendChild(U.el('button', {
        class: 'key', type: 'button', onClick: function () { press(d); }
      }, d));
    });
    pad.appendChild(U.el('button', { class: 'key blank', type: 'button', disabled: true, 'aria-hidden': 'true' }));
    pad.appendChild(U.el('button', {
      class: 'key', type: 'button', onClick: function () { press('0'); }
    }, '0'));
    pad.appendChild(U.el('button', {
      class: 'key', type: 'button', 'aria-label': 'מחיקה',
      onClick: function () { press('del'); }
    }, U.icon('i-backspace', 22)));
    return pad;
  };

  /* ---------- מסך נעילה ---------- */
  /* מקלדת משלנו ולא input type=number — כדי שלא תוקפץ מקלדת מערכת
     ולא תתאפשר הדבקה. אין כאן קישור לכיבוי השער. */
  Screens.lock = function (onOk) {
    var buf = '';
    var dots = U.el('div', { class: 'dots' });

    function paint() {
      U.clear(dots);
      for (var i = 0; i < 4; i++) {
        dots.appendChild(U.el('i', { class: 'dot' + (i < buf.length ? ' on' : '') }));
      }
    }

    function fail() {
      buf = ''; paint();
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      if (navigator.vibrate) navigator.vibrate(60);
    }

    function press(d) {
      if (d === 'del') { buf = buf.slice(0, -1); paint(); return; }
      if (buf.length >= 4) return;
      buf += d; paint();
      if (buf.length < 4) return;
      Vault.verify(buf).then(function (okay) {
        if (okay) onOk(); else fail();
      });
    }

    paint();
    return U.el('div', { class: 'lock' }, [
      U.el('div', { class: 'lock-mark' }, U.icon('i-lock', 42)),
      U.el('div', { class: 'lock-t', text: C.APP_NAME }),
      U.el('div', { class: 'lock-s', text: 'הזן קוד כדי להיכנס' }),
      dots,
      Screens.keypad(press)
    ]);
  };

  Screens.missing = function (msg) {
    var wrap = U.el('div', { class: 'scr' }, backHead('לא נמצא'));
    wrap.appendChild(UI.empty({
      icon: 'i-file', title: msg,
      sub: 'ייתכן שהוא נמחק', action: 'למסך הבית',
      onAction: function () { location.hash = '#/expiries'; }
    }));
    return wrap;
  };

  window.Screens = Screens;
})();
