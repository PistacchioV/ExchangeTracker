/* calendar.js — o Calendar do Workspace. Junta os eventos avulsos com as
   datas das initiatives (marcos, data-alvo e prazo das tasks em aberto),
   lidas ao vivo da API: o calendário nunca guarda cópia. Mês ou semana; o
   dia escolhido abre a agenda ao lado. */
(function () {
  'use strict';

  var WS = window.WS, $ = WS.$, $$ = WS.$$, esc = WS.esc, icon = WS.icon;
  var MAX_CHIPS = 3;
  var state = { events: [], inis: [], view: 'month', cursor: WS.today(), sel: WS.today() };
  var qd = new URLSearchParams(location.search).get('d');
  if (qd && WS.parse(qd)) { state.cursor = qd; state.sel = qd; }
  try { state.view = localStorage.getItem('edg-cal-view') || 'month'; } catch (e) {}

  function doDia(iso) { return state.events.filter(function (e) { return e.date === iso; }); }
  function corDe(e) { return e.kind === 'event' ? 'var(--hue-lime)' : WS.hue(e.color); }
  function ordem(a, b) {
    var k = { project: 0, milestone: 1, event: 1, task: 2 };
    return (a.time || '').localeCompare(b.time || '') || k[a.kind] - k[b.kind];
  }

  function chip(e, i) {
    var cls = e.kind === 'task' ? ' is-task' : e.kind === 'project' ? ' is-project' : '';
    if (e.done) cls += ' is-done';
    return '<span class="cal-chip' + cls + '" data-ev="' + i + '" style="--h:' + corDe(e) + '" title="' + esc(e.title + (e.project_name && e.kind !== 'project' ? ' · ' + e.project_name : '')) + '">' +
      '<i></i><span>' + (e.time ? esc(e.time) + ' ' : '') + esc(e.kind === 'project' ? '◎ ' + e.title : e.title) + '</span></span>';
  }

  function inicioSemana(iso) { var d = WS.parse(iso); var dow = (d.getDay() + 6) % 7; return WS.addDays(iso, -dow); }

  function grid() {
    var c = WS.parse(state.cursor), hoje = WS.today();
    var dias = [];
    var ini, n;
    if (state.view === 'month') {
      ini = inicioSemana(WS.isoOf(new Date(c.getFullYear(), c.getMonth(), 1)));
      var fimMes = WS.isoOf(new Date(c.getFullYear(), c.getMonth() + 1, 0));
      n = Math.ceil((WS.parse(fimMes) - WS.parse(ini)) / 86400000 / 7 + 0.0001) * 7;
      if (n < 35) n = 35;
    } else { ini = inicioSemana(state.cursor); n = 7; }
    for (var i = 0; i < n; i++) dias.push(WS.addDays(ini, i));
    var idx = 0; state.mapa = [];
    var html = '<div class="cal-grid' + (state.view === 'week' ? ' cal-week' : '') + '">' +
      ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'].map(function (d, k) {
        return '<div class="cal-dow">' + d + (state.view === 'week' ? ' ' + WS.parse(dias[k]).getDate() : '') + '</div>';
      }).join('');
    dias.forEach(function (iso) {
      var evs = doDia(iso).sort(ordem);
      var d = WS.parse(iso), fora = state.view === 'month' && d.getMonth() !== c.getMonth();
      var lim = state.view === 'week' ? 99 : MAX_CHIPS;
      var chips = evs.slice(0, lim).map(function (e) { state.mapa[idx] = e; return chip(e, idx++); }).join('');
      html += '<div class="cal-day' + (fora ? ' is-out' : '') + (iso === hoje ? ' is-today' : '') + (iso === state.sel ? ' is-sel' : '') + '" data-day="' + iso + '">' +
        '<span class="cal-n">' + d.getDate() + '</span>' + chips + (evs.length > lim ? '<span class="cal-more">+' + (evs.length - lim) + ' mais</span>' : '') + '</div>';
    });
    $('#calGrid').innerHTML = html + '</div>';

    var titulo = state.view === 'month' ? WS.MESES_LONGOS[c.getMonth()] + ' ' + c.getFullYear()
      : 'Semana de ' + WS.short(dias[0]) + ' a ' + WS.short(dias[6]);
    $('#calTitle').textContent = titulo;
    var semIni = inicioSemana(hoje), semFim = WS.addDays(semIni, 6);
    var naSemana = state.events.filter(function (e) { return e.date >= semIni && e.date <= semFim && e.kind !== 'task'; }).length;
    $('#calSub').textContent = naSemana + ' evento' + (naSemana === 1 ? '' : 's') + ' e marco' + (naSemana === 1 ? '' : 's') + ' nesta semana';
    $$('#calView button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === state.view); });
  }

  function agenda() {
    var iso = state.sel, hoje = WS.today(), d = WS.parse(iso);
    var evs = doDia(iso).filter(function (e) { return e.kind !== 'task'; }).sort(ordem);
    $('#agTitle').textContent = iso === hoje ? 'Hoje' : WS.DIAS[d.getDay()] + ', ' + WS.short(iso);
    $('#agSub').textContent = WS.br(iso) + ' · ' + evs.length + ' evento' + (evs.length === 1 ? '' : 's');
    var agora = new Date(), hhmm = WS.pad(agora.getHours()) + ':' + WS.pad(agora.getMinutes()), linhaFeita = iso !== hoje;
    var html = '';
    evs.forEach(function (e) {
      if (!linhaFeita && e.time && e.time > hhmm) { html += '<div class="now-line">' + hhmm + '</div>'; linhaFeita = true; }
      var i = state.mapa.indexOf(e); if (i === -1) { state.mapa.push(e); i = state.mapa.length - 1; }
      var sub = [];
      if (e.kind === 'project') sub.push('Data-alvo · ' + e.status);
      else {
        if (e.where) sub.push(e.where);
        if (e.project_name) sub.push(e.project_name);
        sub.push(e.type || (e.kind === 'milestone' ? 'Milestone' : 'Evento'));
      }
      html += '<div class="ag-item" data-ev="' + i + '"><div class="ag-time">' + (e.time ? esc(e.time) + (e.length ? '<small>' + esc(WS.lengthLabel(e.length)) + '</small>' : '') : '<small>dia todo</small>') + '</div>' +
        '<div class="ag-body" style="--h:' + corDe(e) + '"><b' + (e.done ? ' class="line-through t-faint"' : '') + '>' + esc(e.title) + '</b><small>' + esc(sub.join(' · ')) + '</small></div></div>';
    });
    if (!linhaFeita && evs.length) html += '<div class="now-line">' + hhmm + '</div>';
    $('#agList').innerHTML = html || '<div class="text-xs t-faint py-2">Nenhum evento neste dia.</div>';

    // vence no dia (e, hoje, também as atrasadas)
    var tasks = state.events.filter(function (e) { return e.kind === 'task' && (e.date === iso || (iso === hoje && e.date < hoje)); })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
    $('#dueTitle').textContent = iso === hoje ? 'hoje' : 'em ' + WS.short(iso);
    $('#dueN').textContent = tasks.length;
    $('#dueList').innerHTML = tasks.slice(0, 8).map(function (e) {
      var i = state.mapa.indexOf(e); if (i === -1) { state.mapa.push(e); i = state.mapa.length - 1; }
      var late = e.date < hoje;
      return '<div class="t-line" data-ev="' + i + '"><span class="tk-proj" style="--h:' + WS.hue(e.color) + '"><i></i></span><span class="cut">' + esc(e.title) +
        '<small class="block text-[11px] t-faint">' + esc(e.project_name) + (late ? ' · <span class="t-danger">' + esc(WS.inDays(e.date)) + '</span>' : '') + '</small></span>' + WS.prTag(e.priority) + '</div>';
    }).join('') + (tasks.length > 8 ? '<a class="ws-link" href="/tasks">Mais ' + (tasks.length - 8) + ' em Tasks</a>' : '') +
      (tasks.length ? '' : '<div class="text-xs t-faint py-2">Nenhuma task vencendo.</div>');
  }

  function render() { grid(); agenda(); }

  function load() {
    return WS.api('GET', '/api/calendar').then(function (d) {
      state.events = d.events; state.inis = d.initiatives; WS.setMeta(d.meta);
      $('#calErr').hidden = true; render();
    }).catch(function (e) { $('#calErr').hidden = false; $('#calErr').textContent = e.message; });
  }

  function abrirEvento(e) {
    if (e.kind === 'event') WS.openEvent({ event: e, initiatives: state.inis });
    else if (e.kind === 'milestone') {
      WS.openEvent({ milestone: e, project_id: e.project_id, project_name: e.project_name, initiatives: state.inis });
    } else if (e.kind === 'task') WS.openTaskDrawer(e.project_id, e.id);
    else location.href = '/initiatives/' + e.project_id;
  }

  function mover(n) {
    var c = WS.parse(state.cursor);
    if (state.view === 'month') state.cursor = WS.isoOf(new Date(c.getFullYear(), c.getMonth() + n, 1));
    else state.cursor = WS.addDays(state.cursor, 7 * n);
    render();
  }
  $('#calPrev').addEventListener('click', function () { mover(-1); });
  $('#calNext').addEventListener('click', function () { mover(1); });
  $('#calToday').addEventListener('click', function () { state.cursor = state.sel = WS.today(); render(); });
  $$('#calView button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.view = b.getAttribute('data-view'); state.cursor = state.sel;
      try { localStorage.setItem('edg-cal-view', state.view); } catch (e) {}
      render();
    });
  });
  $('#calNew').addEventListener('click', function () { WS.openEvent({ date: state.sel, initiatives: state.inis }); });
  $('#agAdd').addEventListener('click', function () { WS.openEvent({ date: state.sel, initiatives: state.inis }); });
  document.addEventListener('click', function (e) {
    var ev = e.target.closest('[data-ev]');
    if (ev && e.target.closest('#calGrid, #agList, #dueList')) { abrirEvento(state.mapa[+ev.getAttribute('data-ev')]); return; }
    var day = e.target.closest('[data-day]');
    if (day) { state.sel = day.getAttribute('data-day'); render(); }
  });
  $('#calGrid').addEventListener('dblclick', function (e) {
    var day = e.target.closest('[data-day]');
    if (day && !e.target.closest('[data-ev]')) WS.openEvent({ date: day.getAttribute('data-day'), initiatives: state.inis });
  });
  document.addEventListener('keydown', function (e) {
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if ($('.md-back, .drawer, .pal-back')) return;
    if (e.key === 'ArrowLeft') mover(-1);
    else if (e.key === 'ArrowRight') mover(1);
    else if (e.key === 't' || e.key === 'T') { state.cursor = state.sel = WS.today(); render(); }
  });
  WS.onChange(function () { load(); });

  WS.hero();
  load();
})();
