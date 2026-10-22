/* initiatives.js — a lista de Initiatives: contadores, filtro por categoria
   (lembrado no navegador) e por status, e um cartão por iniciativa. Os
   contadores do topo acompanham a categoria escolhida, como no OTC Tracker. */
(function () {
  'use strict';

  var WS = window.WS, $ = WS.$, $$ = WS.$$, esc = WS.esc, icon = WS.icon;
  var state = { cards: [], meta: null, pinned: [], status: '', cat: '' };
  try { state.cat = localStorage.getItem('edg-ini-cat') || ''; } catch (e) {}

  var ring = WS.ring;

  function card(c) {
    var h = WS.hue(c.color), pin = state.pinned.indexOf(c.id) !== -1;
    var nx = c.next_milestone;
    var prox = c.status === 'Concluded'
      ? '<small>Concluída</small><b>' + c.milestones_done + ' de ' + c.milestones_total + ' marcos atingidos</b>'
      : nx ? '<small>Próximo marco</small><b>' + esc(nx.title) + '</b><span>' + (nx.date ? esc(WS.short(nx.date)) + ' · ' + esc(WS.inDays(nx.date)) : 'sem data') + '</span>'
        : '<small>Próximo marco</small><b class="t-faint">Nenhum marco em aberto</b>';
    var due = c.due_date ? WS.short(c.due_date) : 'sem data-alvo';
    var atrasada = c.due_date && c.status !== 'Concluded' && WS.diffDays(c.due_date) < 0;
    return '<article class="ini" data-id="' + esc(c.id) + '" style="--h:' + h + '" tabindex="0">' +
      '<div class="ini-top"><span class="tile">' + icon(c.icon, 18) + '</span>' +
      '<div class="min-w-0"><div class="ini-name truncate">' + esc(c.name) + '</div>' +
      '<div class="flex flex-wrap gap-1.5 mt-1.5">' + WS.stTag(c.status) + WS.catTag(c.category) + '</div></div>' +
      '<button type="button" class="pin-btn' + (pin ? ' is-on' : '') + '" data-pin aria-label="' + (pin ? 'Desafixar' : 'Fixar na sidebar') + '" title="' + (pin ? 'Desafixar' : 'Fixar na sidebar') + '">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (pin ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M11.52 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.9l5.16-.76a2.12 2.12 0 0 0 1.6-1.16z"/></svg></button></div>' +
      '<p class="ini-desc">' + (c.description ? esc(c.description) : '<span class="t-faint">Sem descrição.</span>') + '</p>' +
      '<div class="ini-next">' + ring(c.progress, h) + '<div class="min-w-0">' + prox + '</div></div>' +
      '<div class="ini-foot">' + WS.avatars(c.people, 4) + '<span class="grow"></span>' +
      '<span>' + c.tasks_done + '/' + c.tasks_total + ' tasks</span>' +
      '<span class="' + (atrasada ? 't-danger' : '') + '">' + icon('calendar', 12) + ' ' + esc(due) + '</span></div>' +
      '</article>';
  }

  function render() {
    var porCat = state.cards.filter(function (c) { return !state.cat || c.category === state.cat; });
    var lista = porCat.filter(function (c) { return !state.status || c.status === state.status; });
    var mes = WS.today().slice(0, 7);
    var n = function (s) { return porCat.filter(function (c) { return c.status === s; }).length; };
    $('#kOngoing').textContent = n('On going');
    $('#kOnhold').textContent = n('On hold');
    $('#kConcluded').textContent = n('Concluded');
    $('#kMonth').textContent = porCat.filter(function (c) { return c.status !== 'Concluded' && (c.due_date || '').slice(0, 7) === mes; }).length;
    $('#iniSub').textContent = n('On going') + ' em andamento · ' + n('Concluded') + ' concluída' + (n('Concluded') === 1 ? '' : 's') + (state.cat ? ' · ' + state.cat : '');

    $('#iniGrid').innerHTML = lista.map(card).join('');
    var vazio = !lista.length;
    $('#iniEmpty').hidden = !vazio;
    if (vazio) {
      var filtrado = state.cards.length > 0;
      $('#iniEmptyT').textContent = filtrado ? 'Nenhuma initiative neste filtro' : 'Nenhuma initiative ainda';
      $('#iniEmptyS').textContent = filtrado ? 'Troque a categoria ou o status.' : 'Crie a primeira em Nova initiative.';
    }
    $('#fCat').innerHTML = icon('tag', 13) + '<span>' + esc(state.cat || 'Todas as categorias') + '</span>' + icon('chev-down', 13);
    $('#fCat').classList.toggle('is-on', !!state.cat);
    $('#fCatMenu').innerHTML = ['' ].concat(state.meta ? state.meta.categories : []).map(function (c) {
      var qtd = state.cards.filter(function (x) { return !c || x.category === c; }).length;
      return '<button type="button" class="menu-item' + (c === state.cat ? ' is-on' : '') + '" data-cat="' + esc(c) + '">' + esc(c || 'Todas as categorias') + '<small>' + qtd + '</small></button>';
    }).join('');
  }

  function load() {
    return WS.api('GET', '/api/initiatives').then(function (d) {
      state.cards = d.cards; state.meta = d.meta; state.pinned = d.pinned || [];
      WS.setMeta(d.meta);
      $('#iniErr').hidden = true;
      render();
    }).catch(function (e) { $('#iniErr').hidden = false; $('#iniErr').textContent = e.message; });
  }

  $('#iniNew').addEventListener('click', function () {
    WS.openInitiative({ onDone: function (p) { location.href = '/initiatives/' + p.id; } });
  });
  $$('#fStatus button').forEach(function (b) {
    b.addEventListener('click', function () {
      state.status = b.getAttribute('data-status');
      $$('#fStatus button').forEach(function (o) { o.classList.toggle('active', o === b); });
      render();
    });
  });
  $('#fCat').addEventListener('click', function () {
    var m = $('#fCatMenu'); m.hidden = !m.hidden;
    $('#fCat').setAttribute('aria-expanded', m.hidden ? 'false' : 'true');
  });
  $('#fCatMenu').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]'); if (!b) return;
    state.cat = b.getAttribute('data-cat');
    try { localStorage.setItem('edg-ini-cat', state.cat); } catch (err) {}
    $('#fCatMenu').hidden = true; render();
  });
  $('#iniGrid').addEventListener('click', function (e) {
    var art = e.target.closest('.ini'); if (!art) return;
    var id = art.getAttribute('data-id');
    if (e.target.closest('[data-pin]')) {
      WS.api('POST', '/api/initiatives/' + id + '/pin').then(function (d) {
        state.pinned = d.pinned; render(); WS.refreshShell();
      }).catch(WS.fail);
      return;
    }
    location.href = '/initiatives/' + id;
  });
  $('#iniGrid').addEventListener('keydown', function (e) {
    var art = e.target.closest('.ini');
    if (art && e.key === 'Enter') location.href = '/initiatives/' + art.getAttribute('data-id');
  });
  WS.onChange(load);

  WS.hero();
  load();
})();
