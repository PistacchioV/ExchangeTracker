/* workspace.js — a parte comum do Workspace (Initiatives, Tasks, Calendar,
   Team, Settings) e da casca: busca Ctrl+K, o botão "+" e o sino do topo, os
   modais de iniciativa, tarefa, evento e pessoa e a gaveta da tarefa.
   Exposto em window.WS; as telas assinam WS.onChange para se redesenhar
   depois de qualquer escrita (inclusive a feita pelo "+" do topo). */
(function () {
  'use strict';

  var toast = window.EDG.toast;
  var WS = window.WS = {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  WS.$ = $; WS.$$ = $$;

  // a entrada do hero, a mesma do recon e dos fatos
  WS.hero = function () {
    if (!window.gsap || !$('.hero-anim-item')) return;
    gsap.set('.hero-anim-item', { opacity: 0, y: 30, filter: 'blur(10px)' });
    gsap.to('.hero-anim-item', { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, stagger: 0.12, ease: 'power3.out', delay: 0.05 });
  };

  // ------------------------------------------------------------------ util
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  WS.esc = esc;

  function api(method, url, body) {
    var opt = { method: method, headers: {} };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(url, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || ('Falha ' + r.status)); e.code = d.code; throw e; }
        return d;
      });
    });
  }
  WS.api = api;
  WS.fail = function (e) { toast(e && e.message ? e.message : 'Falha inesperada.'); };

  var subs = [];
  WS.onChange = function (fn) { subs.push(fn); };
  WS.changed = function (what) {
    subs.forEach(function (fn) { try { fn(what); } catch (e) { console.error(e); } });
    WS.refreshShell();
  };

  // ----------------------------------------------------------------- datas
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  WS.MESES = MESES; WS.MESES_LONGOS = MESES_LONGOS; WS.DIAS = DIAS;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function today() { return isoOf(new Date()); }
  function diffDays(iso) {
    var d = parse(iso); if (!d) return null;
    var t = parse(today());
    return Math.round((d - t) / 86400000);
  }
  function br(iso) { var d = parse(iso); return d ? pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() : ''; }
  function short(iso) { var d = parse(iso); return d ? d.getDate() + ' ' + MESES[d.getMonth()] : ''; }
  // prazo como a gente fala: hoje, amanhã, ontem, o dia da semana na semana, senão a data
  function dueText(iso) {
    var n = diffDays(iso); if (n === null) return '';
    if (n === 0) return 'Hoje';
    if (n === 1) return 'Amanhã';
    if (n === -1) return 'Ontem';
    if (n > 1 && n < 7) { var d = parse(iso); return DIAS[d.getDay()]; }
    return short(iso);
  }
  function inDays(iso) {
    var n = diffDays(iso); if (n === null) return '';
    if (n === 0) return 'hoje';
    if (n > 0) return n === 1 ? 'amanhã' : 'em ' + n + ' dias';
    return n === -1 ? 'ontem' : 'há ' + (-n) + ' dias';
  }
  function ago(stamp) {
    var d = new Date(String(stamp || '').replace(' ', 'T'));
    if (isNaN(d)) return '';
    var s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.floor(s / 3600) + ' h';
    if (s < 86400 * 7) return 'há ' + Math.floor(s / 86400) + ' d';
    return short(isoOf(d));
  }
  function addDays(iso, n) { var d = parse(iso); d.setDate(d.getDate() + n); return isoOf(d); }
  WS.isoOf = isoOf; WS.parse = parse; WS.today = today; WS.diffDays = diffDays; WS.br = br;
  WS.short = short; WS.dueText = dueText; WS.inDays = inDays; WS.ago = ago; WS.addDays = addDays; WS.pad = pad;

  // dd/mm/aaaa digitado -> AAAA-MM-DD ('' se invalida)
  function paraIso(v) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim());
    if (!m) return '';
    var d = new Date(+m[3], +m[2] - 1, +m[1]);
    if (d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) return '';
    return m[3] + '-' + m[2] + '-' + m[1];
  }
  WS.paraIso = paraIso;
  function mascaraData(el) {
    el.addEventListener('input', function () {
      var dig = el.value.replace(/\D/g, '').slice(0, 8);
      var out = dig.slice(0, 2);
      if (dig.length > 2) out += '/' + dig.slice(2, 4);
      if (dig.length > 4) out += '/' + dig.slice(4, 8);
      el.value = out;
      el.classList.remove('is-invalid');
    });
    el.addEventListener('blur', function () { el.classList.toggle('is-invalid', !!el.value && !paraIso(el.value)); });
  }
  function mascaraHora(el) {
    el.addEventListener('input', function () {
      var dig = el.value.replace(/\D/g, '').slice(0, 4);
      el.value = dig.length > 2 ? dig.slice(0, 2) + ':' + dig.slice(2) : dig;
      el.classList.remove('is-invalid');
    });
  }
  WS.mascaraData = mascaraData;

  // ----------------------------------------------------------------- ícones
  var P = {
    'folder': '<path d="M4 20h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-7.9a1 1 0 0 1-.83-.45l-.81-1.2A1 1 0 0 0 8.63 5H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1Z"/>',
    'rocket': '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    'leaf': '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    'layout-grid': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    'chart-column': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    'sparkles': '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    'workflow': '<rect x="3" y="3" width="8" height="8" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
    'star': '<path d="M11.52 2.3a.53.53 0 0 1 .95 0l2.31 4.68a2.12 2.12 0 0 0 1.6 1.16l5.16.76a.53.53 0 0 1 .3.9l-3.74 3.64a2.12 2.12 0 0 0-.61 1.88l.88 5.14a.53.53 0 0 1-.77.56l-4.62-2.43a2.12 2.12 0 0 0-1.97 0L6.4 21.01a.53.53 0 0 1-.77-.56l.88-5.14a2.12 2.12 0 0 0-.61-1.88L2.16 9.8a.53.53 0 0 1 .3-.9l5.16-.76a2.12 2.12 0 0 0 1.6-1.16z"/>',
    'plus': '<path d="M12 5v14M5 12h14"/>',
    'x': '<path d="M18 6 6 18M6 6l12 12"/>',
    'check': '<path d="M20 6 9 17l-5-5"/>',
    'calendar': '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    'alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
    'activity': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    'chev-left': '<path d="m15 18-6-6 6-6"/>',
    'chev-right': '<path d="m9 18 6-6-6-6"/>',
    'chev-down': '<path d="m6 9 6 6 6-6"/>',
    'pencil': '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    'trash': '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    'user': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'search': '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    'tag': '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    'flag': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    'kanban': '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    'list': '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    'message': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    'external': '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    'file': '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/>',
    'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'
  };
  function icon(name, size, sw) {
    return '<svg width="' + (size || 16) + '" height="' + (size || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.folder) + '</svg>';
  }
  WS.icon = icon;

  // ---------------------------------------------------- tags e classificações
  var META = null;
  WS.setMeta = function (m) { if (m) META = m; };
  WS.meta = function () {
    if (META) return Promise.resolve(META);
    return api('GET', '/api/initiatives').then(function (d) { META = d.meta; return META; });
  };
  function hue(c) { return 'var(--hue-' + (/^[a-z]+$/.test(c || '') ? c : 'blue') + ')'; }
  function slug(v) { return String(v || '').toLowerCase().replace(/[^a-z]/g, ''); }
  WS.hue = hue;
  WS.stTag = function (s) { return '<span class="st st-' + slug(s) + '">' + esc(s) + '</span>'; };
  WS.prTag = function (p, todas) {
    if (!p || (!todas && (p === 'Medium' || p === 'Low'))) return '';
    return '<span class="st no-dot pr-' + slug(p) + '">' + (p === 'Urgent' ? icon('flag', 10, 2.2) + ' ' : '') + esc(p) + '</span>';
  };
  WS.tsTag = function (s) { return '<span class="st ts-' + slug(s) + '">' + esc(s) + '</span>'; };
  WS.catTag = function (c) { return c ? '<span class="cat">' + icon('tag', 10) + esc(c) + '</span>' : '<span class="cat t-faint">sem categoria</span>'; };
  WS.TASK_HUE = { 'To do': 'var(--faint)', 'In progress': 'var(--hue-blue)', 'In review': 'var(--hue-purple)', 'Done': 'var(--hue-lime)' };

  // anel de progresso dos cartões
  function ring(pct, h, size) {
    size = size || 46;
    var r = (size - 6) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return '<svg class="pring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" style="--h:' + h + '">' +
      '<circle class="bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="4"/>' +
      '<circle class="fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central">' + pct + '%</text></svg>';
  }
  WS.ring = ring;

  // ---------------------------------------------------------------- avatar
  var AV_HUES = ['blue', 'purple', 'pink', 'orange', 'green', 'teal', 'indigo', 'yellow'];
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function avHue(sid) {
    var h = 0; String(sid || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
    return AV_HUES[h % AV_HUES.length];
  }
  function photoOf(sid) {
    var pp = (META && META.people) || [];
    for (var i = 0; i < pp.length; i++) if (pp[i].sid === sid) return pp[i].photo || '';
    return '';
  }
  function avatar(sid, name, size, photo) {
    var foto = photo === undefined ? photoOf(sid) : photo;
    return '<span class="av" title="' + esc(name || sid) + '" style="--s:' + (size || 28) + 'px;--h:' + hue(avHue(sid || name)) + '">' +
      (foto ? '<img src="' + esc(foto) + '" alt="" loading="lazy"/>' : esc(initials(name || sid))) + '</span>';
  }
  function avatars(list, max) {
    max = max || 4;
    var out = (list || []).slice(0, max).map(function (p) { return avatar(p.sid, p.name, 24); }).join('');
    var extra = (list || []).length - max;
    return '<span class="av-stack">' + out + '</span>' + (extra > 0 ? '<span class="av-more">+' + extra + '</span>' : '');
  }
  WS.avatar = avatar; WS.avatars = avatars; WS.initials = initials;
  // avatares desenhados pelo servidor (sidebar): data-av / data-name / data-photo
  function hydrateAvatars(root) {
    $$('[data-av]', root).forEach(function (el) {
      var sid = el.getAttribute('data-av'), nome = el.getAttribute('data-name'), foto = el.getAttribute('data-photo');
      el.style.setProperty('--h', hue(avHue(sid || nome)));
      el.innerHTML = foto ? '<img src="' + esc(foto) + '" alt=""/>' : esc(initials(nome || sid));
    });
  }
  hydrateAvatars();

  // ----------------------------------------------------------- atividade
  var ACT = {
    created: 'criou a iniciativa',
    status: 'mudou o status para {status}',
    members_added: 'incluiu {names} no time',
    edited: 'editou a iniciativa',
    task_added: 'criou a tarefa “{task}”',
    task_done: 'concluiu “{task}”',
    task_moved: 'moveu “{task}” para {status}',
    task_deleted: 'apagou a tarefa “{task}”',
    commented: 'comentou em “{task}”',
    milestone_added: 'criou o marco “{milestone}”',
    milestone_done: 'atingiu o marco “{milestone}”',
    milestone_reopened: 'reabriu o marco “{milestone}”',
    person_removed: 'tirou {name} da initiative'
  };
  WS.activityText = function (a) {
    var t = ACT[a.kind] || a.kind;
    var p = a.params || {};
    return esc(t).replace(/\{(\w+)\}/g, function (_m, k) { return '<b class="t-fg2 font-medium">' + esc(p[k] || '') + '</b>'; });
  };

  // ------------------------------------------------------------- modal base
  var abertos = [];
  function modal(opts) {
    var back = document.createElement('div');
    back.className = 'md-back';
    back.innerHTML = '<div class="md" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '" style="' + (opts.width ? 'width:min(' + opts.width + ',100%)' : '') + '">' +
      '<div class="md-head"><div><h3>' + esc(opts.title) + '</h3>' + (opts.sub ? '<p>' + esc(opts.sub) + '</p>' : '') + '</div>' +
      '<button type="button" class="icon-btn" data-close aria-label="Fechar">' + icon('x', 15) + '</button></div>' +
      '<form class="md-body" novalidate>' + opts.body + '<button type="submit" hidden></button></form>' +
      '<div class="md-foot">' + (opts.left || '') + '<span class="grow md-err" data-err></span>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-close>Cancelar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-ok>' + esc(opts.ok || 'Salvar') + '</button></div></div>';
    document.body.appendChild(back);
    var el = back.firstChild;
    var api_ = {
      el: el,
      close: function () { back.remove(); abertos = abertos.filter(function (x) { return x !== api_; }); },
      err: function (m) { $('[data-err]', el).textContent = m || ''; },
      busy: function (on) { $('[data-ok]', el).disabled = !!on; }
    };
    abertos.push(api_);
    back.addEventListener('mousedown', function (e) { if (e.target === back) api_.close(); });
    $$('[data-close]', el).forEach(function (b) { b.addEventListener('click', api_.close); });
    function ok() { if (opts.onOk) opts.onOk(api_); }
    $('[data-ok]', el).addEventListener('click', ok);
    $('form', el).addEventListener('submit', function (e) { e.preventDefault(); ok(); });
    $$('.data-br', el).forEach(mascaraData);
    $$('.hora', el).forEach(mascaraHora);
    setTimeout(function () { var f = $('input:not([type=hidden]),textarea,select', el); if (f) f.focus(); }, 30);
    return api_;
  }
  WS.modal = modal;
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && abertos.length) { abertos[abertos.length - 1].close(); e.stopPropagation(); }
  }, true);

  WS.confirm = function (title, text, ok) {
    return new Promise(function (resolve) {
      var m = modal({ title: title, body: '<p class="text-sm t-muted leading-relaxed">' + esc(text) + '</p>', ok: ok || 'Excluir',
        onOk: function (x) { x.close(); resolve(true); } });
      var b = $('[data-ok]', m.el); b.classList.remove('btn-primary'); b.classList.add('btn-danger');
      var fechar = m.close; m.close = function () { fechar(); resolve(false); };
    });
  };

  function options(items, value, vazio) {
    return (vazio !== undefined ? '<option value="">' + esc(vazio) + '</option>' : '') + items.map(function (it) {
      var v = typeof it === 'object' ? it.value : it, l = typeof it === 'object' ? it.label : it;
      return '<option value="' + esc(v) + '"' + (String(v) === String(value == null ? '' : value) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
  }
  WS.options = options;
  function peopleItems(list) { return (list || []).map(function (p) { return { value: p.sid, label: p.name }; }); }
  function lengthLabel(n) { return n < 60 ? n + ' min' : (n % 60 ? (n / 60).toString().replace('.', ',') + ' h' : (n / 60) + ' h'); }
  WS.lengthLabel = lengthLabel;

  // ------------------------------------------------------- modal iniciativa
  // Lead e time saem das pessoas ATIVAS do Team; categoria é obrigatória.
  WS.openInitiative = function (opts) {
    opts = opts || {};
    WS.meta().then(function (meta) {
      var p = opts.project || null;
      var membros = (p && p.members || []).map(function (m) { return m.sid; });
      var cor = (p && p.color) || meta.colors[0], ico = (p && p.icon) || meta.icons[0];
      var semGente = !meta.people.length;
      var body =
        '<label class="fld"><span>Nome</span><input class="input" name="name" maxlength="120" value="' + esc(p ? p.name : '') + '" placeholder="Ex.: Automação do batimento"/></label>' +
        '<label class="fld"><span>Descrição</span><textarea class="input" name="description" maxlength="600" placeholder="O que esta iniciativa entrega">' + esc(p ? p.description : '') + '</textarea></label>' +
        '<div class="fld-row"><label class="fld"><span>Categoria</span><select class="input" name="category">' + options(meta.categories, p ? p.category : '', '— escolha —') + '</select></label>' +
        '<label class="fld"><span>Status</span><select class="input" name="status">' + options(meta.statuses, p ? p.status : meta.statuses[0]) + '</select></label></div>' +
        '<label class="fld"><span>Lead</span><select class="input" name="lead_sid">' + options(peopleItems(meta.people), p ? p.lead_sid : meta.me, '— escolha —') + '</select>' +
        (semGente ? '<small class="fld-hint">Cadastre as pessoas em <a class="ws-link" href="/team">Team</a>.</small>' : '') + '</label>' +
        '<div class="fld"><span>Time</span><div class="chips" data-team></div><small class="fld-hint">Os envolvidos além do Lead — é deles que sai o responsável de cada tarefa.</small></div>' +
        '<div class="fld-row"><label class="fld"><span>Início</span><input class="input data-br" name="start_date" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="' + esc(p ? br(p.start_date) : br(today())) + '"/></label>' +
        '<label class="fld"><span>Data-alvo</span><input class="input data-br" name="due_date" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="' + esc(p ? br(p.due_date) : '') + '"/></label></div>' +
        '<div class="fld-row"><div class="fld"><span>Cor</span><div class="swatches" data-colors>' + meta.colors.map(function (c) {
          return '<button type="button" class="swatch' + (c === cor ? ' is-on' : '') + '" data-color="' + c + '" style="--h:' + hue(c) + '" aria-label="' + c + '"></button>';
        }).join('') + '</div></div>' +
        '<div class="fld"><span>Ícone</span><div class="icon-pick" data-icons style="--h:' + hue(cor) + '">' + meta.icons.map(function (i) {
          return '<button type="button" class="' + (i === ico ? 'is-on' : '') + '" data-icon="' + i + '" aria-label="' + i + '">' + icon(i, 15) + '</button>';
        }).join('') + '</div></div></div>';
      var m = modal({
        title: p ? 'Editar initiative' : 'Nova initiative', sub: p ? p.id : 'Categoria, Lead e time definem quem pode receber as tarefas.',
        body: body, ok: p ? 'Salvar' : 'Criar initiative',
        left: p ? '<button type="button" class="btn btn-danger btn-sm" data-del>' + icon('trash', 13) + ' Excluir</button>' : '',
        onOk: function (x) {
          var f = $('form', x.el);
          var de = f.start_date.value.trim(), ate = f.due_date.value.trim();
          if ((de && !paraIso(de)) || (ate && !paraIso(ate))) { x.err('Datas em dd/mm/aaaa.'); return; }
          var corpo = {
            name: f.name.value, description: f.description.value, category: f.category.value, status: f.status.value,
            lead_sid: f.lead_sid.value, member_sids: membros.filter(function (s) { return s !== f.lead_sid.value; }),
            start_date: paraIso(de), due_date: paraIso(ate), color: cor, icon: ico
          };
          x.busy(true); x.err('');
          api(p ? 'PATCH' : 'POST', p ? '/api/initiatives/' + p.id : '/api/initiatives', corpo).then(function (d) {
            x.close(); toast(p ? 'Initiative salva.' : 'Initiative criada.', true);
            if (opts.onDone) opts.onDone(d); WS.changed('initiative');
          }).catch(function (e) { x.busy(false); x.err(e.message); });
        }
      });
      function team() {
        var lead = $('[name=lead_sid]', m.el).value;
        $('[data-team]', m.el).innerHTML = meta.people.filter(function (pp) { return pp.sid !== lead; }).map(function (pp) {
          return '<button type="button" class="chip-pick' + (membros.indexOf(pp.sid) !== -1 ? ' is-on' : '') + '" data-sid="' + esc(pp.sid) + '">' + avatar(pp.sid, pp.name, 20, pp.photo) + esc(pp.name) + '</button>';
        }).join('') || '<span class="fld-hint">Ninguém além do Lead no Team.</span>';
      }
      team();
      $('[name=lead_sid]', m.el).addEventListener('change', team);
      $('[data-team]', m.el).addEventListener('click', function (e) {
        var b = e.target.closest('[data-sid]'); if (!b) return;
        var sid = b.getAttribute('data-sid'), i = membros.indexOf(sid);
        if (i === -1) membros.push(sid); else membros.splice(i, 1);
        b.classList.toggle('is-on', i === -1);
      });
      $('[data-colors]', m.el).addEventListener('click', function (e) {
        var b = e.target.closest('[data-color]'); if (!b) return;
        cor = b.getAttribute('data-color');
        $$('[data-color]', m.el).forEach(function (o) { o.classList.toggle('is-on', o === b); });
        $('[data-icons]', m.el).style.setProperty('--h', hue(cor));
      });
      $('[data-icons]', m.el).addEventListener('click', function (e) {
        var b = e.target.closest('[data-icon]'); if (!b) return;
        ico = b.getAttribute('data-icon');
        $$('[data-icon]', m.el).forEach(function (o) { o.classList.toggle('is-on', o === b); });
      });
      var del = $('[data-del]', m.el);
      if (del) del.addEventListener('click', function () {
        WS.confirm('Excluir initiative', 'Excluir “' + p.name + '” com todas as tarefas e marcos? Não tem volta.').then(function (sim) {
          if (!sim) return;
          api('DELETE', '/api/initiatives/' + p.id).then(function () {
            m.close(); toast('Initiative excluída.', true);
            if (opts.onDeleted) opts.onDeleted(); else location.href = '/initiatives';
          }).catch(WS.fail);
        });
      });
    }).catch(WS.fail);
  };

  // ------------------------------------------------------------ modal tarefa
  // Tarefa mora numa iniciativa; o responsável sai dos envolvidos nela.
  function involvedOf(project, meta) {
    if (!project) return meta.people;
    var ids = project.involved || (project.people || []).map(function (x) { return x.sid; });
    return meta.people.filter(function (pp) { return ids.indexOf(pp.sid) !== -1; });
  }
  WS.openTask = function (opts) {
    opts = opts || {};
    var lista = opts.initiatives ? Promise.resolve({ initiatives: opts.initiatives, meta: META })
      : api('GET', '/api/tasks');
    lista.then(function (d) {
      if (d.meta) WS.setMeta(d.meta);
      var meta = META;
      var inis = (d.initiatives || []).filter(function (i) { return i.status !== 'Concluded' || i.id === opts.project_id; });
      if (!inis.length) {
        toast('Tarefas moram dentro de initiatives — crie uma initiative primeiro.');
        return;
      }
      var pid = opts.project_id || (inis[0] && inis[0].id);
      function proj() { return inis.filter(function (i) { return i.id === pid; })[0]; }
      var body =
        '<label class="fld"><span>Título</span><input class="input" name="title" maxlength="200" placeholder="O que precisa ser feito"/></label>' +
        '<label class="fld"><span>Initiative</span><select class="input" name="project"' + (opts.project_id ? ' disabled' : '') + '>' +
        options(inis.map(function (i) { return { value: i.id, label: i.name }; }), pid) + '</select></label>' +
        '<div class="fld-row"><label class="fld"><span>Responsável</span><select class="input" name="assignee_sid"></select></label>' +
        '<label class="fld"><span>Prazo</span><input class="input data-br" name="due" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="' + esc(opts.due ? br(opts.due) : '') + '"/></label></div>' +
        '<div class="fld-row three"><label class="fld"><span>Status</span><select class="input" name="status">' + options(meta.task_statuses, opts.status || meta.task_statuses[0]) + '</select></label>' +
        '<label class="fld"><span>Prioridade</span><select class="input" name="priority">' + options(meta.priorities, 'Medium') + '</select></label>' +
        '<label class="fld"><span>Estimativa (h)</span><input class="input" name="estimate" inputmode="decimal" placeholder="—"/></label></div>';
      var m = modal({
        title: 'Nova task', sub: 'O responsável é escolhido entre os envolvidos na initiative.', body: body, ok: 'Criar task',
        onOk: function (x) {
          var f = $('form', x.el);
          if (f.due.value && !paraIso(f.due.value)) { x.err('Prazo em dd/mm/aaaa.'); return; }
          x.busy(true); x.err('');
          api('POST', '/api/initiatives/' + pid + '/tasks', {
            title: f.title.value, assignee_sid: f.assignee_sid.value, due: paraIso(f.due.value),
            status: f.status.value, priority: f.priority.value, estimate: f.estimate.value
          }).then(function (p) {
            x.close(); toast('Task criada.', true);
            if (opts.onDone) opts.onDone(p); WS.changed('task');
          }).catch(function (e) { x.busy(false); x.err(e.message); });
        }
      });
      function quem() {
        var gente = involvedOf(proj(), meta);
        $('[name=assignee_sid]', m.el).innerHTML = options(peopleItems(gente), gente.some(function (g) { return g.sid === meta.me; }) ? meta.me : '', '— sem responsável —');
      }
      quem();
      $('[name=project]', m.el).addEventListener('change', function (e) { pid = e.target.value; quem(); });
    }).catch(WS.fail);
  };

  // ------------------------------------------------------------ modal evento
  // Com initiative o evento é um MARCO dela (aparece no card Milestones, no
  // Coming up e no Calendar); sem, é um evento avulso do Calendar.
  WS.openEvent = function (opts) {
    opts = opts || {};
    Promise.all([WS.meta(), opts.initiatives ? Promise.resolve(opts.initiatives) :
      api('GET', '/api/tasks').then(function (d) { return d.initiatives; })]).then(function (r) {
      var meta = r[0], inis = r[1] || [];
      var ev = opts.event || null;                 // avulso existente
      var ms = opts.milestone || null;             // marco existente
      var atual = ev || ms || {};
      var pid = opts.project_id || '';
      var editando = !!(ev || ms);
      var body =
        '<label class="fld"><span>Título</span><input class="input" name="title" maxlength="200" value="' + esc(atual.title || '') + '" placeholder="Ex.: Review com a mesa"/></label>' +
        '<label class="fld"><span>Initiative</span><select class="input" name="project"' + (editando || opts.project_id ? ' disabled' : '') + '>' +
        options(inis.map(function (i) { return { value: i.id, label: i.name }; }), pid, '— evento avulso do Calendar —') + '</select>' +
        '<small class="fld-hint">Com initiative, o evento vira um marco dela.</small></label>' +
        '<div class="fld-row three"><label class="fld"><span>Data</span><input class="input data-br" name="date" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="' + esc(br(atual.date || opts.date || '')) + '"/></label>' +
        '<label class="fld"><span>Hora</span><input class="input hora" name="time" inputmode="numeric" maxlength="5" placeholder="dia todo" value="' + esc(atual.time || '') + '"/></label>' +
        '<label class="fld"><span>Duração</span><select class="input" name="length">' + options(meta.event_lengths.map(function (n) { return { value: n, label: lengthLabel(n) }; }), atual.length || 30) + '</select></label></div>' +
        '<div class="fld-row"><label class="fld"><span>Tipo</span><select class="input" name="type">' + options(meta.event_types, atual.type || (pid ? 'Milestone' : 'Meeting')) + '</select></label>' +
        '<label class="fld"><span>Local</span><input class="input" name="where" maxlength="200" value="' + esc(atual.where || '') + '" placeholder="Sala, Zoom, Teams…"/></label></div>' +
        '<label class="fld" data-notes><span>Notas</span><textarea class="input" name="notes" maxlength="1000">' + esc(atual.notes || '') + '</textarea></label>';
      var left = '';
      if (ms) left += '<button type="button" class="btn btn-ghost btn-sm" data-done>' + icon('check', 13) + (ms.done ? ' Reabrir' : ' Atingido') + '</button>';
      if (editando) left += '<button type="button" class="btn btn-danger btn-sm" data-del>' + icon('trash', 13) + '</button>';
      var m = modal({
        title: editando ? (ms ? 'Marco da initiative' : 'Evento') : 'Novo evento', sub: ms ? opts.project_name || '' : (ev ? br(ev.date) : ''),
        body: body, left: left, ok: editando ? 'Salvar' : 'Criar evento',
        onOk: function (x) {
          var f = $('form', x.el);
          if (f.date.value && !paraIso(f.date.value)) { x.err('Data em dd/mm/aaaa.'); return; }
          if (!pid && !paraIso(f.date.value)) { x.err('Informe a data do evento.'); return; }
          var corpo = { title: f.title.value, date: paraIso(f.date.value), time: f.time.value, length: f.time.value ? f.length.value : '',
            type: f.type.value, where: f.where.value };
          if (!pid) corpo.notes = f.notes.value;
          var url, metodo;
          if (ms) { url = '/api/initiatives/' + pid + '/milestones/' + ms.id; metodo = 'PATCH'; }
          else if (ev) { url = '/api/calendar/events/' + ev.id; metodo = 'PATCH'; }
          else if (pid) { url = '/api/initiatives/' + pid + '/milestones'; metodo = 'POST'; }
          else { url = '/api/calendar/events'; metodo = 'POST'; }
          x.busy(true); x.err('');
          api(metodo, url, corpo).then(function (d) {
            x.close(); toast(editando ? 'Evento salvo.' : 'Evento criado.', true);
            if (opts.onDone) opts.onDone(d); WS.changed('event');
          }).catch(function (e) { x.busy(false); x.err(e.message); });
        }
      });
      function estado() {
        var f = $('form', m.el);
        f.length.disabled = !f.time.value;
        $('[data-notes]', m.el).hidden = !!pid;
      }
      estado();
      $('[name=time]', m.el).addEventListener('input', estado);
      $('[name=project]', m.el).addEventListener('change', function (e) {
        pid = e.target.value;
        var t = $('[name=type]', m.el);
        if (pid && t.value === 'Meeting') t.value = 'Milestone';
        estado();
      });
      var done = $('[data-done]', m.el);
      if (done) done.addEventListener('click', function () {
        api('PATCH', '/api/initiatives/' + pid + '/milestones/' + ms.id, { done: !ms.done }).then(function (d) {
          m.close(); toast(ms.done ? 'Marco reaberto.' : 'Marco atingido.', true);
          if (opts.onDone) opts.onDone(d); WS.changed('event');
        }).catch(WS.fail);
      });
      var del = $('[data-del]', m.el);
      if (del) del.addEventListener('click', function () {
        WS.confirm('Excluir evento', 'Excluir “' + atual.title + '”?').then(function (sim) {
          if (!sim) return;
          var url = ms ? '/api/initiatives/' + pid + '/milestones/' + ms.id : '/api/calendar/events/' + ev.id;
          api('DELETE', url).then(function (d) {
            m.close(); toast('Evento excluído.', true);
            if (opts.onDone) opts.onDone(d); WS.changed('event');
          }).catch(WS.fail);
        });
      });
    }).catch(WS.fail);
  };

  // ------------------------------------------------------------ modal pessoa
  // Adicionar ao Team (sem convite): o SID busca nome, e-mail, cargo, equipe e
  // foto no diretório interno; o que não vier se preenche à mão.
  WS.openPerson = function (opts) {
    opts = opts || {};
    var p = opts.person || null;
    var achado = null, timer = null, ultimo = '';
    var body =
      (p ? '' : '<label class="fld"><span>SID</span><input class="input" name="sid" maxlength="20" autocomplete="off" placeholder="Ex.: R123456" style="text-transform:uppercase"/></label>' +
        '<div class="lookup" data-lookup>' + icon('search', 15) + '<span>Digite o SID: nome, e-mail, cargo e equipe vêm do cadastro interno.</span></div>') +
      '<label class="fld"><span>Nome</span><input class="input" name="name" maxlength="80" value="' + esc(p ? p.name : '') + '"/></label>' +
      '<label class="fld"><span>E-mail</span><input class="input" name="email" maxlength="120" value="' + esc(p ? p.email : '') + '"/></label>' +
      '<div class="fld-row"><label class="fld"><span>Cargo</span><input class="input" name="role" maxlength="80" value="' + esc(p ? p.role : '') + '"/></label>' +
      '<label class="fld"><span>Equipe</span><input class="input" name="team" maxlength="80" list="wsTeams" value="' + esc(p ? p.team : '') + '"/></label></div>' +
      '<datalist id="wsTeams">' + (opts.teams || []).map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>';
    var left = (p ? '<button type="button" class="btn btn-ghost btn-sm" data-refresh title="Buscar o SID de novo no cadastro interno">' + icon('search', 13) + ' Atualizar do cadastro</button>' : '') +
      (p && !p.is_me ? '<button type="button" class="btn btn-ghost btn-sm" data-active>' + (p.active === false ? 'Reativar' : 'Desativar') + '</button>' +
      '<button type="button" class="btn btn-danger btn-sm" data-del>' + icon('trash', 13) + ' Excluir</button>' : '');
    var m = modal({
      title: p ? p.name : 'Adicionar ao team', sub: p ? p.sid : 'Entra direto — sem convite.', body: body, left: left, ok: p ? 'Salvar' : 'Adicionar',
      onOk: function (x) {
        var f = $('form', x.el);
        var corpo = { name: f.name.value, email: f.email.value, role: f.role.value, team: f.team.value };
        if (!p) corpo.sid = f.sid.value;
        x.busy(true); x.err('');
        api(p ? 'PATCH' : 'POST', p ? '/api/team/' + p.sid : '/api/team', corpo).then(function (d) {
          x.close(); toast(p ? 'Pessoa atualizada.' : (corpo.name || corpo.sid) + ' entrou no team.', true);
          WS.meta && (META = null);
          if (opts.onDone) opts.onDone(d); WS.changed('team');
        }).catch(function (e) { x.busy(false); x.err(e.message); });
      }
    });
    if (!p) {
      var f = $('form', m.el), box = $('[data-lookup]', m.el);
      var buscar = function () {
        var sid = f.sid.value.replace(/\s+/g, '').toUpperCase();
        if (sid === ultimo) return;
        ultimo = sid;
        if (sid.length < 2) { box.className = 'lookup'; box.innerHTML = icon('search', 15) + '<span>Digite o SID.</span>'; return; }
        box.className = 'lookup scanline'; box.innerHTML = icon('search', 15) + '<span>Buscando ' + esc(sid) + '…</span>';
        api('GET', '/api/team/lookup?sid=' + encodeURIComponent(sid)).then(function (d) {
          if (sid !== ultimo) return;
          achado = d.person;
          if (d.exists) {
            box.className = 'lookup is-miss'; box.innerHTML = icon('alert', 15) + '<span>' + esc(sid) + ' já está no team.</span>';
          } else if (!d.found) {
            box.className = 'lookup is-miss';
            box.innerHTML = icon('alert', 15) + '<span>' + esc(sid) + ' não foi encontrado no cadastro interno — preencha os dados à mão.</span>';
          } else {
            box.className = 'lookup is-ok';
            box.innerHTML = avatar(sid, achado.name, 40, achado.photo) +
              '<span class="min-w-0"><b class="t-fg block text-sm font-medium">' + esc(achado.name || sid) + '</b>' +
              '<small class="t-muted">' + esc([achado.role, achado.team].filter(Boolean).join(' · ') || '—') + '</small><br/>' +
              '<small class="t-faint">' + esc(achado.email || 'sem e-mail') + ' · fonte: ' + esc(achado.source || '') + '</small></span>';
            ['name', 'email', 'role', 'team'].forEach(function (k) { if (achado[k]) f[k].value = achado[k]; });
          }
        }).catch(function (e) { box.className = 'lookup is-miss'; box.innerHTML = icon('alert', 15) + '<span>' + esc(e.message) + '</span>'; });
      };
      f.sid.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(buscar, 450); });
      f.sid.addEventListener('blur', buscar);
    } else {
      $('[data-refresh]', m.el).addEventListener('click', function () {
        WS.refreshPerson(p.sid).then(function (d) {
          if (!d) return;
          m.close(); META = null;
          if (opts.onDone) opts.onDone(d); WS.changed('team');
        });
      });
      var at = $('[data-active]', m.el);
      if (at) at.addEventListener('click', function () {
        api('PATCH', '/api/team/' + p.sid, { active: p.active === false }).then(function (d) {
          m.close(); META = null; toast(p.active === false ? 'Reativado.' : 'Desativado — não aparece mais para Lead e tarefas.', true);
          if (opts.onDone) opts.onDone(d); WS.changed('team');
        }).catch(WS.fail);
      });
      var del = $('[data-del]', m.el);
      if (del) del.addEventListener('click', function () {
        WS.deletePerson(p).then(function (d) { if (d) { m.close(); if (opts.onDone) opts.onDone(d); } });
      });
    }
  };

  // exclui do Team: sai dos times e as tasks em aberto ficam sem responsável
  WS.deletePerson = function (p) {
    return WS.confirm('Excluir usuário', 'Excluir ' + p.name + ' (' + p.sid + ') do team? Ele sai do time das initiatives e as tasks em aberto dele ficam sem responsável. Quem é Lead precisa ser trocado antes.', 'Excluir').then(function (sim) {
      if (!sim) return null;
      return api('DELETE', '/api/team/' + encodeURIComponent(p.sid)).then(function (d) {
        META = null; toast(p.name + ' foi excluído do team.', true); WS.changed('team'); return d;
      }).catch(function (e) { WS.fail(e); return null; });
    });
  };

  // busca o SID de novo no cadastro interno e grava o que vier
  WS.refreshPerson = function (sid) {
    return api('POST', '/api/team/' + encodeURIComponent(sid) + '/refresh').then(function (d) {
      if (d.found) toast('Dados atualizados · fonte: ' + d.source + '.', true);
      else toast(sid + ' não foi encontrado no cadastro interno (phonebook, Active Directory, Outlook). Preencha à mão.');
      return d.found ? d : null;
    }).catch(function (e) { WS.fail(e); return null; });
  };

  // ---------------------------------------------------------- gaveta tarefa
  // Cada mudança grava na hora e devolve a iniciativa inteira; a gaveta e a
  // tela se redesenham dela.
  WS.openTaskDrawer = function (projectId, taskId, opts) {
    opts = opts || {};
    var back = document.createElement('div'); back.className = 'drawer-back';
    var el = document.createElement('aside'); el.className = 'drawer'; el.setAttribute('role', 'dialog');
    document.body.appendChild(back); document.body.appendChild(el);
    var proj = null, meta = null;
    var handle = { close: function () { back.remove(); el.remove(); abertos = abertos.filter(function (x) { return x !== handle; }); } };
    abertos.push(handle);
    back.addEventListener('click', handle.close);

    function task() { return (proj.tasks || []).filter(function (t) { return t.id === taskId; })[0]; }
    function send(method, url, body) {
      return api(method, '/api/initiatives/' + projectId + '/tasks/' + taskId + url, body).then(function (p) {
        proj = p; render(); if (opts.onChange) opts.onChange(p); WS.changed('task');
      }).catch(function (e) { WS.fail(e); render(); });
    }
    function render() {
      var t = task();
      if (!t) { handle.close(); return; }
      var gente = involvedOf(proj, meta);
      var subs = t.subtasks || [], feitas = subs.filter(function (s) { return s.done; }).length;
      el.style.setProperty('--h', hue(proj.color));
      el.innerHTML =
        '<div class="md-head"><div class="min-w-0"><a class="tk-proj" href="/initiatives/' + esc(proj.id) + '"><i></i><span>' + esc(proj.name) + '</span></a>' +
        '<input class="input mt-2 text-base" data-f="title" maxlength="200" value="' + esc(t.title) + '" style="padding-left:.6rem"/></div>' +
        '<button type="button" class="icon-btn" data-x aria-label="Fechar">' + icon('x', 15) + '</button></div>' +
        '<div class="md-body">' +
        '<div class="fld-row"><label class="fld"><span>Status</span><select class="input" data-f="status">' + options(meta.task_statuses, t.status) + '</select></label>' +
        '<label class="fld"><span>Prioridade</span><select class="input" data-f="priority">' + options(meta.priorities, t.priority) + '</select></label></div>' +
        '<label class="fld"><span>Responsável</span><select class="input" data-f="assignee_sid">' +
        options(peopleItems(gente.some(function (g) { return g.sid === t.assignee_sid; }) || !t.assignee_sid ? gente : gente.concat([{ sid: t.assignee_sid, name: t.assignee_name }])), t.assignee_sid, '— sem responsável —') + '</select></label>' +
        '<div class="fld-row"><label class="fld"><span>Prazo</span><input class="input data-br" data-f="due" inputmode="numeric" maxlength="10" placeholder="dd/mm/aaaa" value="' + esc(br(t.due)) + '"/></label>' +
        '<label class="fld"><span>Estimativa (h)</span><input class="input" data-f="estimate" inputmode="decimal" value="' + esc(t.estimate == null ? '' : String(t.estimate).replace('.', ',')) + '"/></label></div>' +
        '<div class="fld"><span>Subtarefas · ' + feitas + '/' + subs.length + '</span>' +
        (subs.length ? '<div class="tk-bar"><span style="width:' + Math.round(100 * feitas / subs.length) + '%"></span></div>' : '') +
        '<div>' + subs.map(function (s) {
          return '<div class="sub-row' + (s.done ? ' is-done' : '') + '"><button type="button" class="chk' + (s.done ? ' is-on' : '') + '" data-sub="' + esc(s.id) + '" aria-label="Concluir">' + icon('check', 11, 3) + '</button>' +
            '<span>' + esc(s.title) + '</span><button type="button" class="x" data-subdel="' + esc(s.id) + '" aria-label="Excluir">' + icon('x', 13) + '</button></div>';
        }).join('') + '</div>' +
        '<form data-subadd class="flex gap-2"><input class="input" name="t" maxlength="200" placeholder="Nova subtarefa" style="padding-left:.6rem"/><button class="btn btn-ghost btn-sm">' + icon('plus', 13) + '</button></form></div>' +
        '<div class="fld"><span>Comentários · ' + (t.comments || []).length + '</span>' +
        (t.comments || []).map(function (c) {
          return '<div class="cmt">' + avatar(c.sid, c.name, 26) + '<div class="min-w-0"><small><b class="t-fg2 font-medium">' + esc(c.name) + '</b> · ' + esc(ago(c.at)) + '</small><p>' + esc(c.text) + '</p></div></div>';
        }).join('') +
        '<form data-cmt class="flex flex-col gap-2"><textarea class="input" name="t" maxlength="2000" placeholder="Escreva um comentário" style="padding-left:.6rem;min-height:3.5rem"></textarea>' +
        '<button class="btn btn-ghost btn-sm self-end">Comentar</button></form></div>' +
        '<p class="text-[11px] t-faint">Criada ' + esc(ago(t.created_at)) + (t.created_by_name ? ' por ' + esc(t.created_by_name) : '') + (t.done_at ? ' · concluída ' + esc(ago(t.done_at)) : '') + '</p>' +
        '</div>' +
        '<div class="md-foot"><button type="button" class="btn btn-danger btn-sm" data-del>' + icon('trash', 13) + ' Excluir task</button><span class="grow"></span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-x>Fechar</button></div>';
      $$('.data-br', el).forEach(mascaraData);
      $$('[data-x]', el).forEach(function (b) { b.addEventListener('click', handle.close); });
      $$('[data-f]', el).forEach(function (inp) {
        inp.addEventListener('change', function () {
          var k = inp.getAttribute('data-f'), v = inp.value;
          if (k === 'due') { if (v && !paraIso(v)) { inp.classList.add('is-invalid'); return; } v = paraIso(v); }
          var corpo = {}; corpo[k] = v;
          send('PATCH', '', corpo);
        });
      });
      $$('[data-sub]', el).forEach(function (b) {
        b.addEventListener('click', function () {
          var s = subs.filter(function (x) { return x.id === b.getAttribute('data-sub'); })[0];
          send('PATCH', '/subtasks/' + s.id, { done: !s.done });
        });
      });
      $$('[data-subdel]', el).forEach(function (b) {
        b.addEventListener('click', function () { send('DELETE', '/subtasks/' + b.getAttribute('data-subdel')); });
      });
      $('[data-subadd]', el).addEventListener('submit', function (e) {
        e.preventDefault(); var v = e.target.t.value.trim(); if (v) send('POST', '/subtasks', { title: v });
      });
      $('[data-cmt]', el).addEventListener('submit', function (e) {
        e.preventDefault(); var v = e.target.t.value.trim(); if (v) send('POST', '/comments', { text: v });
      });
      $('[data-del]', el).addEventListener('click', function () {
        WS.confirm('Excluir task', 'Excluir “' + t.title + '”?').then(function (sim) {
          if (!sim) return;
          api('DELETE', '/api/initiatives/' + projectId + '/tasks/' + taskId).then(function (p) {
            handle.close(); toast('Task excluída.', true);
            if (opts.onChange) opts.onChange(p); WS.changed('task');
          }).catch(WS.fail);
        });
      });
    }
    el.innerHTML = '<div class="ws-empty">Carregando…</div>';
    api('GET', '/api/initiatives/' + projectId).then(function (p) {
      proj = p; meta = p.meta; WS.setMeta(p.meta); render();
    }).catch(function (e) { handle.close(); WS.fail(e); });
  };

  // ---------------------------------------------------------------- casca
  function closeMenus(exceto) {
    $$('.tb-wrap .menu').forEach(function (m) { if (m !== exceto) m.hidden = true; });
    $$('#tbNew,#tbBell').forEach(function (b) { if (!exceto || b.nextElementSibling !== exceto) b.setAttribute('aria-expanded', 'false'); });
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('.tb-wrap')) closeMenus(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenus(); });

  var btnNew = $('#tbNew'), menuNew = $('#tbNewMenu');
  if (btnNew) {
    btnNew.addEventListener('click', function () {
      var abrir = menuNew.hidden; closeMenus(menuNew); menuNew.hidden = !abrir;
      btnNew.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    });
    menuNew.addEventListener('click', function (e) {
      var b = e.target.closest('[data-create]'); if (!b) return;
      closeMenus(); WS.create(b.getAttribute('data-create'));
    });
  }
  WS.create = function (o) {
    if (o === 'initiative') WS.openInitiative({ onDone: function (p) { location.href = '/initiatives/' + p.id; } });
    else if (o === 'task') WS.openTask({ project_id: WS.currentProject || '' });
    else if (o === 'event') WS.openEvent({ date: today(), project_id: WS.currentProject || '' });
    else if (o === 'person') WS.openPerson();
  };

  // sino: prazos, eventos de hoje e atividade — "lidas" ficam no navegador
  var bell = $('#tbBell'), panel = $('#tbBellPanel'), dot = $('#tbBellDot');
  var avisos = [];
  function chave(n) { return n.kind + '|' + (n.url || '') + '|' + (n.at || '') + '|' + n.title; }
  function lidas() { try { return JSON.parse(localStorage.getItem('edg-bell-lidas') || '[]'); } catch (e) { return []; } }
  function marcarLidas() {
    try { localStorage.setItem('edg-bell-lidas', JSON.stringify(avisos.map(chave).slice(0, 300))); } catch (e) {}
    dot.hidden = true; renderBell();
  }
  var BELL = {
    overdue: { ico: 'alert', h: 'var(--danger)', t: 'Atrasada' },
    due_today: { ico: 'clock', h: 'var(--warn)', t: 'Vence hoje' },
    event: { ico: 'calendar', h: 'var(--hue-blue)', t: 'Hoje' },
    activity: { ico: 'activity', h: 'var(--accent-ink)', t: '' }
  };
  function renderBell() {
    var vistas = lidas();
    panel.innerHTML = '<div class="bell-head"><span>Avisos</span>' + (avisos.length ? '<button type="button" data-lidas>Marcar todas como lidas</button>' : '') + '</div>' +
      (avisos.length ? avisos.map(function (n) {
        var cfg = BELL[n.kind] || BELL.activity, nova = vistas.indexOf(chave(n)) === -1;
        var titulo = n.kind === 'activity' ? '<span class="t-fg2">' + esc(n.name) + '</span> ' + WS.activityText(n) : esc(n.title);
        var det = n.kind === 'activity' ? esc(n.project_name) + ' · ' + esc(ago(n.at)) : cfg.t + (n.detail ? ' · ' + esc(n.detail) : '') + (n.kind === 'overdue' ? ' · ' + esc(inDays(n.date)) : '');
        var url = n.kind === 'activity' ? '/initiatives/' + n.project_id : n.url;
        return '<a class="bell-item' + (nova ? ' is-new' : '') + '" href="' + esc(url) + '" style="--h:' + cfg.h + '"><span class="ico">' + icon(cfg.ico, 14) + '</span><span class="min-w-0"><b>' + titulo + '</b><small>' + det + '</small></span></a>';
      }).join('') : '<div class="bell-empty">Nada por aqui. Prazos, eventos de hoje e a atividade das initiatives aparecem neste sino.</div>');
    var b = $('[data-lidas]', panel); if (b) b.addEventListener('click', marcarLidas);
  }
  if (bell) bell.addEventListener('click', function () {
    var abrir = panel.hidden; closeMenus(panel); panel.hidden = !abrir;
    bell.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    if (abrir) renderBell();
  });

  WS.refreshShell = function () {
    return api('GET', '/api/shell').then(function (d) {
      avisos = d.notifications || [];
      var vistas = lidas();
      if (dot) dot.hidden = !avisos.some(function (n) { return vistas.indexOf(chave(n)) === -1; });
      var badge = $('#sbDue');
      if (badge) { badge.textContent = d.due; badge.hidden = !d.due; }
      var wrap = $('#sbPinnedWrap'), nav = $('#sbPinned');
      if (wrap && nav) {
        wrap.hidden = !(d.pinned || []).length;
        nav.innerHTML = (d.pinned || []).map(function (p) {
          return '<a class="sb-pin' + (WS.currentProject === p.id ? ' is-active' : '') + '" href="/initiatives/' + esc(p.id) + '" style="--h:' + hue(p.color) + '"><i></i><span>' + esc(p.name) + '</span></a>';
        }).join('');
      }
      if (panel && !panel.hidden) renderBell();
    }).catch(function () {});
  };
  WS.refreshShell();

  // ----------------------------------------------------- busca (Ctrl+K)
  var PAGES = [
    { t: 'e-Financeira Recon', d: 'Módulo', url: '/', ico: 'layout-grid' },
    { t: 'Fatos Relevantes', d: 'Módulo', url: '/fatos', ico: 'file' },
    { t: 'Initiatives', d: 'Workspace', url: '/initiatives', ico: 'folder' },
    { t: 'Tasks', d: 'Workspace', url: '/tasks', ico: 'check' },
    { t: 'Calendar', d: 'Workspace', url: '/calendar', ico: 'calendar' },
    { t: 'Team', d: 'Workspace', url: '/team', ico: 'users' },
    { t: 'Settings', d: 'Workspace', url: '/settings', ico: 'user' }
  ];
  var ACTIONS = [
    { t: 'Nova initiative', d: 'Criar', act: 'initiative', ico: 'plus' },
    { t: 'Nova task', d: 'Criar', act: 'task', ico: 'plus' },
    { t: 'Novo evento', d: 'Criar', act: 'event', ico: 'plus' },
    { t: 'Adicionar ao team', d: 'Criar', act: 'person', ico: 'plus' }
  ];
  var KIND = { initiative: ['folder', 'Initiative'], task: ['check', 'Task'], event: ['calendar', 'Evento'], person: ['user', 'Team'], fato: ['file', 'Fato relevante'] };
  function openPalette() {
    if ($('.pal-back')) return;
    var back = document.createElement('div'); back.className = 'pal-back';
    back.innerHTML = '<div class="pal" role="dialog" aria-label="Buscar"><div class="pal-in">' + icon('search', 16) +
      '<input type="text" placeholder="Buscar initiatives, tasks, pessoas, fatos…" autocomplete="off"/><span class="kbd">Esc</span></div><div class="pal-list"></div></div>';
    document.body.appendChild(back);
    var inp = $('input', back), list = $('.pal-list', back), itens = [], sel = 0, timer = null, seq = 0;
    var handle = { close: function () { back.remove(); abertos = abertos.filter(function (x) { return x !== handle; }); } };
    abertos.push(handle);
    back.addEventListener('mousedown', function (e) { if (e.target === back) handle.close(); });
    function draw(grupos) {
      itens = []; var html = '';
      grupos.forEach(function (g) {
        if (!g.items.length) return;
        html += '<div class="menu-label">' + esc(g.label) + '</div>';
        g.items.forEach(function (it) {
          var i = itens.length; itens.push(it);
          html += '<button type="button" class="menu-item' + (i === sel ? ' is-hover' : '') + '" data-i="' + i + '"' + (it.color ? ' style="--h:' + hue(it.color) + '"' : '') + '>' +
            (it.color ? '<i class="dot"></i>' : icon(it.ico, 14)) + '<span class="truncate">' + esc(it.t) + '</span><small>' + esc(it.d) + '</small></button>';
        });
      });
      list.innerHTML = html || '<div class="bell-empty">Nada encontrado.</div>';
    }
    function local(q) {
      q = q.toLowerCase();
      var f = function (x) { return !q || x.t.toLowerCase().indexOf(q) !== -1; };
      return [{ label: 'Páginas', items: PAGES.filter(f) }, { label: 'Ações', items: ACTIONS.filter(f) }];
    }
    function update() {
      var q = inp.value.trim(); sel = 0;
      var base = local(q); draw(base);
      clearTimeout(timer);
      if (q.length < 2) return;
      var meu = ++seq;
      timer = setTimeout(function () {
        api('GET', '/api/search?q=' + encodeURIComponent(q)).then(function (d) {
          if (meu !== seq) return;
          var res = (d.results || []).map(function (r) { var k = KIND[r.kind] || KIND.task; return { t: r.title, d: k[1] + (r.detail ? ' · ' + r.detail : ''), url: r.url, ico: k[0], color: r.color }; });
          draw([{ label: 'Resultados', items: res }].concat(base));
        }).catch(function () {});
      }, 180);
    }
    function go(it) {
      if (!it) return;
      handle.close();
      if (it.act) WS.create(it.act); else location.href = it.url;
    }
    inp.addEventListener('input', update);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % Math.max(itens.length, 1);
        $$('.menu-item', list).forEach(function (b, i) { b.classList.toggle('is-hover', i === sel); if (i === sel) b.scrollIntoView({ block: 'nearest' }); });
      } else if (e.key === 'Enter') { e.preventDefault(); go(itens[sel]); }
    });
    list.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) go(itens[+b.getAttribute('data-i')]); });
    update(); inp.focus();
  }
  WS.openPalette = openPalette;
  var mac = /Mac|iPhone|iPad/.test(navigator.platform);
  if ($('#tbKbd')) $('#tbKbd').textContent = mac ? '⌘K' : 'Ctrl K';
  ['#tbSearch', '#tbSearchSm'].forEach(function (s) { var b = $(s); if (b) b.addEventListener('click', openPalette); });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); }
  });
})();
