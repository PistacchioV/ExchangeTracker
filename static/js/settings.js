/* settings.js — perfil (a pessoa do SID da máquina), avisos do sino, tema e
   dados. Os avisos e o perfil gravam em /api/settings; o tema é do navegador. */
(function () {
  'use strict';

  var WS = window.WS, $ = WS.$, $$ = WS.$$, esc = WS.esc;
  var NOTIFY = [
    ['due_dates', 'Prazos', 'Tasks em aberto que vencem hoje ou estão atrasadas', 'var(--warn)'],
    ['events_today', 'Eventos de hoje', 'Eventos avulsos e marcos das initiatives no dia', 'var(--hue-blue)'],
    ['activity', 'Atividade das initiatives', 'Quem criou, moveu, concluiu ou comentou', 'var(--accent-ink)']
  ];
  var S = null;

  function render() {
    var p = S.profile;
    $('#stMe').innerHTML = WS.avatar(p.sid, p.name, 36, p.photo) + '<span class="min-w-0"><b class="block text-sm font-medium t-fg truncate">' + esc(p.name) + '</b><small class="text-[11px] t-faint">' + esc(p.sid) + '</small></span>';
    $('#stProfileHead').innerHTML = WS.avatar(p.sid, p.name, 72, p.photo) + '<div class="min-w-0"><h3>' + esc(p.name) + '</h3><p>' + esc([p.role, p.team].filter(Boolean).join(' · ') || 'Sem cargo') + '</p><p>' + esc(p.email || 'sem e-mail') + ' · <span class="person-sid">' + esc(p.sid) + '</span></p></div>';
    var f = $('#stProfileForm');
    ['name', 'email', 'role', 'team'].forEach(function (k) { if (document.activeElement !== f[k]) f[k].value = p[k] || ''; });
    $('#stPhotoHint').innerHTML = p.photo ? '' : 'Foto: salve em <code>static/img/users/' + esc(p.sid.toLowerCase()) + '.jpg</code>';
    $('#stNotifyRows').innerHTML = NOTIFY.map(function (n) {
      var on = S.notify[n[0]];
      return '<div class="st-row"><span class="st-ico" style="--h:' + n[3] + '">' + WS.icon(n[0] === 'due_dates' ? 'clock' : n[0] === 'events_today' ? 'calendar' : 'activity', 14) + '</span>' +
        '<div class="txt"><b>' + esc(n[1]) + '</b><small>' + esc(n[2]) + '</small></div>' +
        '<button type="button" class="sw' + (on ? ' is-on' : '') + '" role="switch" aria-checked="' + on + '" aria-label="' + esc(n[1]) + '" data-n="' + n[0] + '"></button></div>';
    }).join('');
    $('#stExportSub').textContent = S.tasks_total + ' task' + (S.tasks_total === 1 ? '' : 's') + ', uma linha cada (separador ;)';
    $('#stDir').textContent = S.workspace_dir;
    $('#stUsersDb').textContent = S.users_db || 'não encontrado — defina EDG_USERS_DB (no Windows o Outlook também responde)';
    var pref = window.EDG.themePref();
    $$('#stTheme button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-theme') === pref); });
  }

  function load() {
    return WS.api('GET', '/api/settings').then(function (d) { S = d; $('#stErr').hidden = true; render(); })
      .catch(function (e) { $('#stErr').hidden = false; $('#stErr').textContent = e.message; });
  }

  $('#stProfileForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    WS.api('PATCH', '/api/settings', { profile: { name: f.name.value, email: f.email.value, role: f.role.value, team: f.team.value } })
      .then(function (d) {
        S = d; render(); window.EDG.toast('Perfil salvo.', true);
        // a sidebar mostra o cartão de quem usa
        var u = document.querySelector('.sb-user');
        if (u) { u.querySelector('b').textContent = d.profile.name; u.querySelector('small').textContent = d.profile.role || d.profile.sid; }
      }).catch(WS.fail);
  });
  $('#stNotifyRows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-n]'); if (!b) return;
    var corpo = {}; corpo[b.getAttribute('data-n')] = !S.notify[b.getAttribute('data-n')];
    WS.api('PATCH', '/api/settings', { notify: corpo }).then(function (d) { S = d; render(); WS.refreshShell(); }).catch(WS.fail);
  });
  $$('#stTheme button').forEach(function (b) {
    b.addEventListener('click', function () { window.EDG.setTheme(b.getAttribute('data-theme')); render(); });
  });
  document.getElementById('themeToggle').addEventListener('click', function () { setTimeout(render, 0); });
  $('#stReset').addEventListener('click', function () {
    WS.confirm('Restaurar preferências', 'Os avisos voltam a ficar ligados e nenhuma initiative fica fixada. Perfil, team e dados não mudam.', 'Restaurar').then(function (sim) {
      if (!sim) return;
      WS.api('POST', '/api/settings/reset').then(function (d) {
        S = d; render(); WS.refreshShell(); window.EDG.toast('Preferências restauradas.', true);
      }).catch(WS.fail);
    });
  });
  // a seção visível acende no menu
  var secoes = $$('#stNav a').map(function (a) { return document.querySelector(a.getAttribute('href')); });
  window.addEventListener('scroll', function () {
    var atual = 0;
    secoes.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < 160) atual = i; });
    $$('#stNav a').forEach(function (a, i) { a.classList.toggle('is-on', i === atual); });
  }, { passive: true });

  WS.hero();
  load();
})();
