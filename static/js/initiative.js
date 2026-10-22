/* initiative.js — a página de uma iniciativa. Toda escrita devolve a
   iniciativa inteira e a página se redesenha dela. Os marcos SÓ SE MOSTRAM
   no card Milestones: criar é o "Novo evento" do topo; o clique num marco
   abre o mesmo modal, onde ele se edita, se dá por atingido ou se apaga. */
(function () {
  'use strict';

  var WS = window.WS, $ = WS.$, esc = WS.esc, icon = WS.icon;
  var root = $('#iniPage'), id = root.getAttribute('data-id');
  var P = null, showDone = false;
  WS.currentProject = id;

  function carregada(fn) {
    // botão clicado antes da carga espera por ela (senão o modal abria vazio)
    return function () { if (P) fn(); };
  }

  function render() {
    var h = WS.hue(P.color);
    root.style.setProperty('--h', h);
    document.title = P.name + ' · Exchange Tracker';
    $('#dIcon').innerHTML = icon(P.icon, 22);
    $('#dName').textContent = P.name;
    $('#dDesc').textContent = P.description || 'Sem descrição.';
    $('#dPin').innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="' + (P.pinned ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M11.52 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.9l5.16-.76a2.12 2.12 0 0 0 1.6-1.16z"/></svg>' + (P.pinned ? 'Fixada' : 'Fixar');
    $('#dPin').classList.toggle('t-warn', !!P.pinned);

    $('#kProg').textContent = P.progress + '%';
    $('#kProgBar').style.width = P.progress + '%';
    $('#kOpen').textContent = P.open_tasks;
    $('#kDone').textContent = P.tasks_done;
    var dl = P.days_left;
    $('#kDaysL').textContent = dl !== null && dl < 0 && P.status !== 'Concluded' ? 'Dias de atraso' : 'Dias restantes';
    $('#kDays').textContent = dl === null ? '—' : (P.status === 'Concluded' ? '—' : Math.abs(dl));
    $('#kDays').className = 'kpi-val ' + (dl !== null && dl < 0 && P.status !== 'Concluded' ? 't-danger' : 't-fg');

    // visão geral
    $('#dLead').innerHTML = P.lead_sid ? '<span class="flex items-center gap-2 text-sm t-fg2">' + WS.avatar(P.lead_sid, P.lead_name, 22) + esc(P.lead_name) + '</span>' : '<span class="t-faint text-sm">—</span>';
    $('#dStatus').innerHTML = WS.stTag(P.status);
    $('#dCat').innerHTML = WS.catTag(P.category);
    timeline();
    $('#dPplN').textContent = P.people.length;
    $('#dPpl').innerHTML = P.people.map(function (p) {
      var sub = (p.is_lead ? 'Lead' : (p.position || 'Time')) + ' · ' + p.open_tasks + ' em aberto';
      return '<div class="ppl-item">' + WS.avatar(p.sid, p.name, 32) + '<span class="min-w-0"><b>' + esc(p.name) + '</b><small>' + esc(sub) + '</small></span></div>';
    }).join('') || '<span class="text-xs t-faint">Ninguém ainda.</span>';

    // marcos
    var ms = P.milestones || [];
    $('#dMsSub').textContent = ms.filter(function (m) { return m.done; }).length + ' de ' + ms.length + ' atingidos';
    $('#dMs').innerHTML = ms.map(function (m) {
      var quando = m.date ? WS.short(m.date) + (m.time ? ' · ' + m.time : '') + (m.done ? ' · atingido' : ' · ' + WS.inDays(m.date)) : 'sem data';
      return '<li class="ms-item' + (m.done ? ' is-done' : '') + '" data-ms="' + esc(m.id) + '"><span class="mk">' + icon('check', 12, 3) + '</span>' +
        '<span class="min-w-0 flex-1"><b>' + esc(m.title) + '</b><small>' + esc(quando) + ' · ' + esc(m.type || 'Milestone') + '</small></span>' +
        (m.id === P.next_milestone_id ? '<span class="st st-ongoing no-dot">Próximo</span>' : '') + '</li>';
    }).join('') || '<li class="text-xs t-faint py-2">Nenhum marco. Crie com Novo evento.</li>';

    // coming up: os marcos em aberto pela data e a data-alvo no fim
    var up = ms.filter(function (m) { return !m.done && m.date && WS.diffDays(m.date) >= 0; }).slice(0, 4).map(function (m) {
      return { date: m.date, title: m.title, sub: (m.time || 'Dia todo') + (m.where ? ' · ' + m.where : ''), ms: m.id };
    });
    if (P.due_date && WS.diffDays(P.due_date) >= 0 && P.status !== 'Concluded') up.push({ date: P.due_date, title: 'Data-alvo da initiative', sub: WS.inDays(P.due_date) });
    $('#dUp').innerHTML = up.map(function (u) {
      var d = WS.parse(u.date);
      return '<div class="up-item"' + (u.ms ? ' data-ms="' + esc(u.ms) + '" style="cursor:pointer"' : '') + '><span class="up-date"><small>' + WS.MESES[d.getMonth()] + '</small><b>' + d.getDate() + '</b></span>' +
        '<span class="min-w-0"><b class="block text-sm font-medium t-fg2">' + esc(u.title) + '</b><small class="text-[11px] t-faint">' + esc(WS.dueText(u.date)) + ' · ' + esc(u.sub) + '</small></span></div>';
    }).join('') || '<div class="text-xs t-faint py-2">Nada pela frente.</div>';

    // atividade
    $('#dAct').innerHTML = (P.activity || []).slice(0, 12).map(function (a) {
      return '<div class="act-item">' + WS.avatar(a.sid, a.name, 24) + '<span class="min-w-0"><span class="t-fg2">' + esc(a.name) + '</span> ' + WS.activityText(a) + '<small>' + esc(WS.ago(a.at)) + '</small></span></div>';
    }).join('') || '<div class="text-xs t-faint py-2">Sem atividade.</div>';

    burn();
    tasks();
  }

  function timeline() {
    var ini = P.start_date, fim = P.due_date;
    if (!ini || !fim) {
      $('#dTimeline').innerHTML = '<div class="tl-ends mt-4"><div>Início<b>' + esc(WS.br(ini) || '—') + '</b></div><div class="text-right">Data-alvo<b>' + esc(WS.br(fim) || '—') + '</b></div></div>';
      return;
    }
    var a = WS.parse(ini).getTime(), b = WS.parse(fim).getTime(), span = Math.max(b - a, 1);
    var pos = function (iso) { return Math.min(100, Math.max(0, (WS.parse(iso).getTime() - a) / span * 100)); };
    var hoje = pos(WS.today());
    var pontos = (P.milestones || []).filter(function (m) { return m.date; }).map(function (m) {
      return '<span class="ms' + (m.done ? ' is-done' : '') + '" style="left:' + pos(m.date).toFixed(1) + '%" title="' + esc(m.title) + '"></span>';
    }).join('');
    $('#dTimeline').innerHTML = '<div class="timeline"><span class="fill" style="width:' + hoje.toFixed(1) + '%"></span>' + pontos +
      '<span class="today" style="left:' + hoje.toFixed(1) + '%">Hoje</span></div>' +
      '<div class="tl-ends"><div>Início<b>' + esc(WS.br(ini)) + '</b></div><div class="text-right">Data-alvo<b>' + esc(WS.br(fim)) + '</b></div></div>';
  }

  function burn() {
    var b = P.burnup, n = b.labels.length;
    var W = 560, H = 220, L = 34, R = 10, T = 12, B = 26;
    var max = Math.max(4, Math.max.apply(null, b.total.concat([0])));
    var x = function (i) { return L + (n <= 1 ? 0 : i / (n - 1)) * (W - L - R); };
    var y = function (v) { return T + (1 - v / max) * (H - T - B); };
    var linha = function (arr) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(''); };
    var grade = '', rot = '';
    [0, .5, 1].forEach(function (f) {
      var v = Math.round(max * f);
      grade += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      rot += '<text x="' + (L - 6) + '" y="' + (y(v) + 3) + '" text-anchor="end">' + v + '</text>';
    });
    var passo = Math.max(1, Math.ceil(n / 6));
    for (var i = 0; i < n; i += passo) rot += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(WS.short(b.labels[i])) + '</text>';
    var area = n ? linha(b.done) + 'L' + x(n - 1) + ' ' + y(0) + 'L' + x(0) + ' ' + y(0) + 'Z' : '';
    $('#dBurn').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Burn-up">' +
      '<g class="gl">' + grade + '</g>' + rot + '<path class="area" d="' + area + '"/>' +
      '<path class="total" d="' + linha(b.total) + '"/><path class="done" d="' + linha(b.done) + '"/></svg>';
  }

  function tasks() {
    var porStatus = {};
    (P.tasks || []).forEach(function (t) { (porStatus[t.status] = porStatus[t.status] || []).push(t); });
    var feitas = (porStatus.Done || []).length;
    $('#dTasksSub').textContent = P.open_tasks + ' em aberto · ' + feitas + ' concluída' + (feitas === 1 ? '' : 's');
    var meta = P.meta;
    $('#dTasks').innerHTML = meta.task_statuses.map(function (s) {
      var lista = porStatus[s] || [];
      if (!lista.length && s !== 'To do') return '';
      var corpo = (s === 'Done' && !showDone) ? '' : lista.map(function (t) {
        var late = t.status !== 'Done' && t.due && WS.diffDays(t.due) < 0, hoje = t.due && WS.diffDays(t.due) === 0;
        return '<div class="t-line' + (t.status === 'Done' ? ' is-done' : '') + '" data-task="' + esc(t.id) + '">' +
          '<span class="cut">' + esc(t.title) + '</span>' + WS.prTag(t.priority) +
          (t.due ? '<span class="tk-due text-[11px] ' + (late ? 'is-late' : hoje ? 'is-today' : 't-faint') + '">' + esc(WS.dueText(t.due)) + '</span>' : '') +
          (t.assignee_sid ? WS.avatar(t.assignee_sid, t.assignee_name, 22) : '') + '</div>';
      }).join('');
      return '<div class="grp-head"><span class="st no-dot" style="--h:' + WS.TASK_HUE[s] + '">' + esc(s) + '</span><span class="n">' + lista.length + '</span>' +
        (s === 'Done' && lista.length ? '<button type="button" class="ws-link ml-auto" data-show-done>' + (showDone ? 'Ocultar' : 'Mostrar') + '</button>' : '') + '</div>' +
        (corpo || (lista.length ? '' : '<div class="text-xs t-faint pb-2">Nada a fazer.</div>'));
    }).join('');
  }

  function aplicar(p) { var meta = P && P.meta; P = p; if (!P.meta) P.meta = meta; render(); }

  function load() {
    return WS.api('GET', '/api/initiatives/' + id).then(function (p) {
      WS.setMeta(p.meta); P = p; $('#dErr').hidden = true; render();
      var tq = new URLSearchParams(location.search).get('task');
      if (tq && !load.abriu) { load.abriu = true; WS.openTaskDrawer(id, tq, { onChange: aplicar }); }
    }).catch(function (e) { $('#dErr').hidden = false; $('#dErr').textContent = e.message; });
  }

  $('#dEdit').addEventListener('click', carregada(function () { WS.openInitiative({ project: P, onDone: aplicar }); }));
  $('#dEvent').addEventListener('click', carregada(function () {
    WS.openEvent({ project_id: id, initiatives: [{ id: P.id, name: P.name }], date: WS.today(), onDone: aplicar });
  }));
  $('#dAddTask').addEventListener('click', carregada(function () {
    WS.openTask({ project_id: id, initiatives: [{ id: P.id, name: P.name, status: P.status, involved: P.people.map(function (p) { return p.sid; }) }], onDone: aplicar });
  }));
  $('#dPin').addEventListener('click', carregada(function () {
    WS.api('POST', '/api/initiatives/' + id + '/pin').then(function (d) { P.pinned = d.on; render(); WS.refreshShell(); }).catch(WS.fail);
  }));
  function abrirMarco(msId) {
    var m = (P.milestones || []).filter(function (x) { return x.id === msId; })[0];
    if (m) WS.openEvent({ milestone: m, project_id: id, project_name: P.name, initiatives: [{ id: P.id, name: P.name }], onDone: aplicar });
  }
  root.addEventListener('click', function (e) {
    var ms = e.target.closest('[data-ms]'); if (ms) { abrirMarco(ms.getAttribute('data-ms')); return; }
    var t = e.target.closest('[data-task]'); if (t) { WS.openTaskDrawer(id, t.getAttribute('data-task'), { onChange: aplicar }); return; }
    if (e.target.closest('[data-show-done]')) { showDone = !showDone; tasks(); }
  });
  WS.onChange(function (o) { if (o === 'team' || o === 'event' || o === 'task' || o === 'initiative') load(); });

  WS.hero();
  load();
})();
