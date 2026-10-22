/* tasks.js — toda task de toda initiative: quadro (arrastar entre colunas
   muda o status pela mesma API do botão) ou lista. Filtra por initiative,
   "só as minhas", prioridade e texto, no navegador. */
(function () {
  'use strict';

  var WS = window.WS, $ = WS.$, $$ = WS.$$, esc = WS.esc, icon = WS.icon;
  var DONE_LIMIT = 8;
  var state = { tasks: [], inis: [], meta: null, proj: '', mine: false, prio: '', q: '', view: 'board', sort: 'due', allDone: false };
  try {
    var salvo = JSON.parse(localStorage.getItem('edg-tasks') || '{}');
    state.view = salvo.view || 'board'; state.mine = !!salvo.mine;
  } catch (e) {}
  function lembrar() { try { localStorage.setItem('edg-tasks', JSON.stringify({ view: state.view, mine: state.mine })); } catch (e) {} }
  var PRIO = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

  function filtradas() {
    var q = state.q.toLowerCase();
    return state.tasks.filter(function (t) {
      if (state.proj && t.project_id !== state.proj) return false;
      if (state.mine && t.assignee_sid !== state.meta.me) return false;
      if (state.prio && t.priority !== state.prio) return false;
      if (q && (t.title + ' ' + t.project_name + ' ' + (t.assignee_name || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
  }

  function kpis() {
    var hoje = WS.today(), fimSemana = WS.addDays(hoje, 7 - (WS.parse(hoje).getDay() || 7)), iniSemana = WS.addDays(fimSemana, -6);
    var abertas = state.tasks.filter(function (t) { return t.status !== 'Done'; });
    $('#kOpen').textContent = abertas.length;
    $('#kWeek').textContent = abertas.filter(function (t) { return t.due && t.due >= hoje && t.due <= fimSemana; }).length;
    var late = abertas.filter(function (t) { return t.due && t.due < hoje; }).length;
    $('#kLate').textContent = late; $('#kLate').className = 'kpi-val ' + (late ? 't-danger' : 't-fg');
    $('#kDoneWeek').textContent = state.tasks.filter(function (t) { return t.status === 'Done' && (t.done_at || '').slice(0, 10) >= iniSemana; }).length;
    var ativos = state.inis.filter(function (i) { return i.open; }).length;
    $('#tkSub').textContent = abertas.length + ' em aberto em ' + ativos + ' initiative' + (ativos === 1 ? '' : 's');
  }

  function dueHtml(t) {
    if (!t.due) return '';
    var n = WS.diffDays(t.due), cls = t.status === 'Done' ? '' : n < 0 ? 'is-late' : n === 0 ? 'is-today' : '';
    return '<span class="tk-due ' + cls + '">' + icon('calendar', 11) + ' ' + esc(WS.dueText(t.due)) + '</span>';
  }

  function cardHtml(t) {
    var subs = t.subtasks || [], feitas = subs.filter(function (s) { return s.done; }).length;
    return '<div class="tk-card' + (t.status === 'Done' ? ' is-done' : '') + '" data-p="' + esc(t.project_id) + '" data-t="' + esc(t.id) + '">' +
      '<div class="flex items-center gap-2"><span class="tk-proj" style="--h:' + WS.hue(t.project_color) + '"><i></i><span>' + esc(t.project_name) + '</span></span><span class="grow"></span>' + WS.prTag(t.priority) + '</div>' +
      '<b>' + esc(t.title) + '</b>' +
      (subs.length ? '<div class="flex items-center gap-2"><div class="tk-bar flex-1"><span style="width:' + Math.round(100 * feitas / subs.length) + '%"></span></div><span class="text-[10.5px] t-faint">' + feitas + '/' + subs.length + '</span></div>' : '') +
      '<div class="tk-meta">' + dueHtml(t) + ((t.comments || []).length ? '<span>' + icon('message', 11) + ' ' + t.comments.length + '</span>' : '') +
      '<span class="grow"></span>' + (t.assignee_sid ? WS.avatar(t.assignee_sid, t.assignee_name, 22) : '') + '</div></div>';
  }

  function board(lista) {
    var cols = state.meta.task_statuses;
    $('#tkBoard').innerHTML = cols.map(function (s) {
      var dela = lista.filter(function (t) { return t.status === s; });
      if (s === 'Done') dela.sort(function (a, b) { return (b.done_at || '').localeCompare(a.done_at || ''); });
      var mostrar = s === 'Done' && !state.allDone ? dela.slice(0, DONE_LIMIT) : dela;
      return '<div class="tk-col" data-col="' + esc(s) + '">' +
        '<div class="tk-col-head"><span class="st no-dot" style="--h:' + WS.TASK_HUE[s] + '">' + esc(s) + '</span><span class="n">' + dela.length + '</span>' +
        '<button type="button" data-add="' + esc(s) + '" aria-label="Nova task em ' + esc(s) + '">' + icon('plus', 14) + '</button></div>' +
        mostrar.map(cardHtml).join('') +
        (dela.length > mostrar.length ? '<button type="button" class="tk-more" data-all-done>Mostrar todas as ' + dela.length + '</button>' : '') +
        '</div>';
    }).join('');
  }

  function list(lista) {
    var ord = lista.slice().sort(function (a, b) {
      if ((a.status === 'Done') !== (b.status === 'Done')) return a.status === 'Done' ? 1 : -1;
      if (state.sort === 'priority' && PRIO[a.priority] !== PRIO[b.priority]) return PRIO[a.priority] - PRIO[b.priority];
      return (a.due || '9999').localeCompare(b.due || '9999');
    });
    $('#tkListSub').textContent = ord.length + ' task' + (ord.length === 1 ? '' : 's');
    $('#tkListBody').innerHTML = '<div class="tk-row head"><span></span><span>Task</span><span>Initiative</span><span>Status</span><span>Prioridade</span><span>Prazo</span><span></span></div>' +
      ord.map(function (t) {
        return '<div class="tk-row" data-p="' + esc(t.project_id) + '" data-t="' + esc(t.id) + '">' +
          '<button type="button" class="chk' + (t.status === 'Done' ? ' is-on' : '') + '" data-check aria-label="Concluir">' + icon('check', 11, 3) + '</button>' +
          '<span class="cut ' + (t.status === 'Done' ? 't-faint line-through' : 't-fg') + '">' + esc(t.title) + '</span>' +
          '<span class="tk-proj cut" style="--h:' + WS.hue(t.project_color) + '"><i></i><span>' + esc(t.project_name) + '</span></span>' +
          '<span>' + WS.tsTag(t.status) + '</span><span>' + (WS.prTag(t.priority, true)) + '</span><span class="text-xs">' + dueHtml(t) + '</span>' +
          '<span>' + (t.assignee_sid ? WS.avatar(t.assignee_sid, t.assignee_name, 22) : '') + '</span></div>';
      }).join('') + (ord.length ? '' : '<div class="ws-empty">Nenhuma task neste filtro.</div>');
  }

  function filtros() {
    var p = state.inis.filter(function (i) { return i.id === state.proj; })[0];
    $('#fProj').innerHTML = icon('folder', 13) + '<span>' + esc(p ? p.name : 'Todas as initiatives') + '</span>' + icon('chev-down', 13);
    $('#fProj').classList.toggle('is-on', !!p);
    $('#fProjMenu').innerHTML = '<button type="button" class="menu-item' + (!state.proj ? ' is-on' : '') + '" data-proj="">Todas as initiatives</button>' +
      state.inis.map(function (i) {
        return '<button type="button" class="menu-item' + (i.id === state.proj ? ' is-on' : '') + '" data-proj="' + esc(i.id) + '" style="--h:' + WS.hue(i.color) + '"><i class="dot"></i>' + esc(i.name) + '<small>' + i.open + '</small></button>';
      }).join('');
    var me = (state.meta.people || []).filter(function (x) { return x.sid === state.meta.me; })[0] || { sid: state.meta.me, name: '' };
    $('#fMine').innerHTML = WS.avatar(me.sid, me.name, 18) + '<span>Só as minhas</span>';
    $('#fMine').classList.toggle('is-on', state.mine);
    $('#fMine').setAttribute('aria-pressed', state.mine ? 'true' : 'false');
    $('#fPrio').innerHTML = icon('flag', 13) + '<span>' + esc(state.prio || 'Qualquer prioridade') + '</span>' + icon('chev-down', 13);
    $('#fPrio').classList.toggle('is-on', !!state.prio);
    $('#fPrioMenu').innerHTML = [''].concat(state.meta.priorities.slice().reverse()).map(function (pr) {
      return '<button type="button" class="menu-item' + (pr === state.prio ? ' is-on' : '') + '" data-prio="' + esc(pr) + '">' + esc(pr || 'Qualquer prioridade') + '</button>';
    }).join('');
  }

  function render() {
    kpis(); filtros();
    var semIni = !state.inis.length;
    $('#tkNoIni').hidden = !semIni;
    var lista = filtradas();
    $('#tkBoard').hidden = semIni || state.view !== 'board';
    $('#tkList').hidden = semIni || state.view !== 'list';
    $$('#tkView button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === state.view); });
    if (state.view === 'board') board(lista); else list(lista);
  }

  function load() {
    return WS.api('GET', '/api/tasks').then(function (d) {
      state.tasks = d.tasks; state.inis = d.initiatives; state.meta = d.meta; WS.setMeta(d.meta);
      $('#tkErr').hidden = true; render();
    }).catch(function (e) { $('#tkErr').hidden = false; $('#tkErr').textContent = e.message; });
  }

  function mover(pid, tid, status) {
    var t = state.tasks.filter(function (x) { return x.id === tid && x.project_id === pid; })[0];
    if (!t || t.status === status) { render(); return; }
    var antes = t.status;
    t.status = status; if (status === 'Done') t.done_at = new Date().toISOString(); render();
    WS.api('PATCH', '/api/initiatives/' + pid + '/tasks/' + tid, { status: status }).then(function () {
      window.EDG.toast(status === 'Done' ? 'Concluída: ' + t.title : t.title + ' → ' + status, true);
      WS.refreshShell(); load();
    }).catch(function (e) { t.status = antes; render(); WS.fail(e); });
  }

  // arrastar e soltar com o mouse (pointer events): o cartão segue o cursor e
  // a coluna sob ele acende; soltar grava pela mesma API do drawer
  var drag = null;
  $('#tkBoard').addEventListener('pointerdown', function (e) {
    var c = e.target.closest('.tk-card');
    if (!c || e.button !== 0 || e.target.closest('button,a')) return;
    drag = { card: c, x0: e.clientX, y0: e.clientY, on: false };
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.on) {
      if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 6) return;
      drag.on = true;
      var r = drag.card.getBoundingClientRect();
      drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
      drag.ghost = drag.card.cloneNode(true);
      drag.ghost.classList.add('is-ghost'); drag.ghost.style.width = r.width + 'px';
      document.body.appendChild(drag.ghost);
      drag.card.classList.add('is-dragging');
    }
    drag.ghost.style.left = (e.clientX - drag.dx) + 'px';
    drag.ghost.style.top = (e.clientY - drag.dy) + 'px';
    var col = document.elementFromPoint(e.clientX, e.clientY);
    col = col && col.closest('.tk-col');
    $$('.tk-col').forEach(function (k) { k.classList.toggle('is-over', k === col); });
    drag.col = col;
  });
  function fimDrag(cancel) {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.on) return;
    d.ghost.remove(); d.card.classList.remove('is-dragging');
    $$('.tk-col').forEach(function (k) { k.classList.remove('is-over'); });
    fimDrag.ultimo = Date.now();   // o click que vem depois do soltar não abre a gaveta
    if (!cancel && d.col) mover(d.card.getAttribute('data-p'), d.card.getAttribute('data-t'), d.col.getAttribute('data-col'));
  }
  document.addEventListener('pointerup', function () { fimDrag(false); });
  document.addEventListener('pointercancel', function () { fimDrag(true); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fimDrag(true); });

  function abrir(el) {
    WS.openTaskDrawer(el.getAttribute('data-p'), el.getAttribute('data-t'), { onChange: function () { load(); } });
  }
  $('#tkBoard').addEventListener('click', function (e) {
    if (fimDrag.ultimo && Date.now() - fimDrag.ultimo < 250) return;
    var add = e.target.closest('[data-add]');
    if (add) { WS.openTask({ project_id: state.proj || '', status: add.getAttribute('data-add') }); return; }
    if (e.target.closest('[data-all-done]')) { state.allDone = true; render(); return; }
    var c = e.target.closest('.tk-card'); if (c) abrir(c);
  });
  $('#tkListBody').addEventListener('click', function (e) {
    var row = e.target.closest('.tk-row[data-t]'); if (!row) return;
    if (e.target.closest('[data-check]')) {
      var t = state.tasks.filter(function (x) { return x.id === row.getAttribute('data-t') && x.project_id === row.getAttribute('data-p'); })[0];
      mover(t.project_id, t.id, t.status === 'Done' ? 'To do' : 'Done');
      return;
    }
    abrir(row);
  });

  $('#tkNew').addEventListener('click', function () { WS.openTask({ project_id: state.proj || '' }); });
  $$('#tkView button').forEach(function (b) {
    b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); lembrar(); render(); });
  });
  $$('#tkSort button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.sort = b.getAttribute('data-sort');
      $$('#tkSort button').forEach(function (o) { o.classList.toggle('active', o === b); }); render();
    });
  });
  [['#fProj', '#fProjMenu'], ['#fPrio', '#fPrioMenu']].forEach(function (par) {
    $(par[0]).addEventListener('click', function () {
      var m = $(par[1]), abrir_ = m.hidden;
      $$('.tk-filters .menu').forEach(function (x) { x.hidden = true; });
      m.hidden = !abrir_;
    });
  });
  $('#fProjMenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-proj]'); if (!b) return;
    state.proj = b.getAttribute('data-proj'); $('#fProjMenu').hidden = true; render();
  });
  $('#fPrioMenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-prio]'); if (!b) return;
    state.prio = b.getAttribute('data-prio'); $('#fPrioMenu').hidden = true; render();
  });
  $('#fMine').addEventListener('click', function () { state.mine = !state.mine; lembrar(); render(); });
  var tq;
  $('#fQ').addEventListener('input', function (e) { clearTimeout(tq); tq = setTimeout(function () { state.q = e.target.value.trim(); render(); }, 120); });
  WS.onChange(function () { load(); });

  WS.hero();
  load();
})();
