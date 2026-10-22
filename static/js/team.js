/* team.js — as pessoas do Workspace, agrupadas por equipe. Adicionar é
   direto (sem convite): o SID busca nome, e-mail, cargo, equipe e foto no
   cadastro interno. Só quem está ATIVO pode liderar e receber task. */
(function () {
  'use strict';

  var WS = window.WS, $ = WS.$, $$ = WS.$$, esc = WS.esc, icon = WS.icon;
  var state = { people: [], filtro: '', users_db: false };

  function card(p) {
    var inis = p.initiatives || [];
    return '<article class="person' + (p.active === false ? ' is-off' : '') + '" id="' + esc(p.sid) + '">' +
      '<div class="person-top">' + WS.avatar(p.sid, p.name, 46, p.photo) +
      '<div class="min-w-0 flex-1"><b>' + esc(p.name) + (p.is_me ? ' <span class="st st-ongoing no-dot" style="vertical-align:middle">você</span>' : '') + '</b>' +
      '<small>' + esc(p.role || '—') + '</small><span class="person-sid">' + esc(p.sid) + '</span>' +
      (p.active === false ? ' <span class="st no-dot" style="--h:var(--faint)">inativo</span>' : '') + '</div>' +
      '<button type="button" class="icon-btn" data-edit="' + esc(p.sid) + '" aria-label="Editar ' + esc(p.name) + '">' + icon('pencil', 13) + '</button></div>' +
      (p.email ? '<a class="text-xs t-muted truncate hover:opacity-80" href="mailto:' + esc(p.email) + '">' + esc(p.email) + '</a>' : '<span class="text-xs t-faint">sem e-mail</span>') +
      '<div class="person-stats"><div><small>Tasks em aberto</small><b>' + p.open_tasks + '</b></div><div><small>Lidera</small><b>' + p.leads + '</b></div></div>' +
      (inis.length ? '<div class="person-inis">' + inis.slice(0, 4).map(function (i) {
        return '<a class="tk-proj cat" href="/initiatives/' + esc(i.id) + '" style="--h:' + WS.hue(i.color) + '"><i></i><span>' + esc(i.name) + '</span></a>';
      }).join('') + (inis.length > 4 ? '<span class="cat">+' + (inis.length - 4) + '</span>' : '') + '</div>' : '') +
      '</article>';
  }

  function render() {
    var ativos = state.people.filter(function (p) { return p.active !== false; });
    var equipes = {};
    state.people.forEach(function (p) { if (p.team) equipes[p.team] = 1; });
    $('#kPeople').textContent = ativos.length;
    $('#kTeams').textContent = Object.keys(equipes).length;
    $('#kLeads').textContent = state.people.filter(function (p) { return p.leads; }).length;
    $('#kOpen').textContent = state.people.reduce(function (s, p) { return s + p.open_tasks; }, 0);
    $('#tmSub').textContent = ativos.length + ' pessoa' + (ativos.length === 1 ? '' : 's') + ' · ' + Object.keys(equipes).length + ' equipe' + (Object.keys(equipes).length === 1 ? '' : 's');
    $('#tmSource').className = 'lookup mb-5' + (state.users_db ? ' is-ok' : '');
    $('#tmSource').innerHTML = icon('search', 15) + '<span>' + (state.users_db
      ? 'Adicionar pelo SID: nome, e-mail, cargo e equipe vêm do cadastro de usuários do OTC Tracker (e do Outlook no Windows). Fotos em <code>static/img/users/&lt;sid&gt;.jpg</code>.'
      : 'Cadastro do OTC Tracker não encontrado — a busca pelo SID usa o Outlook (Windows). Para apontar o banco: <code>set EDG_USERS_DB=…\\Users_OTCTracker.db</code>. Fotos em <code>static/img/users/&lt;sid&gt;.jpg</code>.') + '</span>';

    var lista = state.people.filter(function (p) {
      return !state.filtro || (state.filtro === 'on' ? p.active !== false : p.active === false);
    });
    var grupos = {};
    lista.forEach(function (p) { (grupos[p.team || 'Sem equipe'] = grupos[p.team || 'Sem equipe'] || []).push(p); });
    var nomes = Object.keys(grupos).sort(function (a, b) { return a === 'Sem equipe' ? 1 : b === 'Sem equipe' ? -1 : a.localeCompare(b); });
    $('#tmGroups').innerHTML = nomes.map(function (g) {
      return '<div class="grp-head mb-1"><span class="ws-title">' + esc(g) + '</span><span class="n">' + grupos[g].length + '</span></div>' +
        '<div class="team-grid mb-6">' + grupos[g].map(card).join('') + '</div>';
    }).join('') || '<div class="ws-empty"><b>Ninguém neste filtro</b></div>';
    if (location.hash) { var alvo = document.getElementById(location.hash.slice(1)); if (alvo) alvo.scrollIntoView({ block: 'center' }); }
  }

  function aplicar(d) { state.people = d.people; state.users_db = d.users_db; render(); }
  function load() {
    return WS.api('GET', '/api/team').then(function (d) { $('#tmErr').hidden = true; aplicar(d); })
      .catch(function (e) { $('#tmErr').hidden = false; $('#tmErr').textContent = e.message; });
  }
  function equipes() {
    var e = {}; state.people.forEach(function (p) { if (p.team) e[p.team] = 1; }); return Object.keys(e).sort();
  }

  $('#tmAdd').addEventListener('click', function () { WS.openPerson({ teams: equipes(), onDone: aplicar }); });
  $('#tmGroups').addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit]'); if (!b) return;
    var p = state.people.filter(function (x) { return x.sid === b.getAttribute('data-edit'); })[0];
    WS.openPerson({ person: p, teams: equipes(), onDone: aplicar });
  });
  $$('#tmFilter button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.filtro = b.getAttribute('data-f');
      $$('#tmFilter button').forEach(function (o) { o.classList.toggle('active', o === b); }); render();
    });
  });
  WS.onChange(function () { load(); });

  WS.hero();
  load();
})();
