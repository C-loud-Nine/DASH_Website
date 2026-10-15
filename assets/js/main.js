/* DASH project page. Vanilla JS, no build step.
   Every number shown in a table, chart or widget is read from data/results.json. */
(function () {
  'use strict';

  var doc = document.documentElement;
  doc.classList.add('js');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  // Screen-reader summary for a chart container; visual labels inside the SVG are hidden from AT.
  function describe(box, text) {
    subify(box);
    $$('svg text', box).forEach(function (t) { t.setAttribute('aria-hidden', 'true'); });
    var p = $('.sr-desc', box) || box.appendChild(h('p', { class: 'sr-only sr-desc' }));
    p.textContent = text;
  }
  // Render "X_sub" in SVG labels as a real subscript.
  function subify(root) {
    $$('text', root).forEach(function (t) {
      if (t.childElementCount || t.textContent.indexOf('_') < 0) return;
      var parts = t.textContent.split(/_([A-Za-z]+)/);
      t.textContent = '';
      parts.forEach(function (part, i) {
        if (!part) return;
        var ts = svg('tspan', i % 2 ? { 'baseline-shift': 'sub', 'font-size': '78%' } : {}, t);
        ts.textContent = part;
      });
    });
  }
  function fx(v, d) { return v === null || v === undefined ? '—' : Number(v).toFixed(d); }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

  /* ---------------- theme ---------------- */
  function initTheme() {
    var btn = $('#theme-btn');
    function current() {
      var t = doc.dataset.theme;
      if (t) return t;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function sync() {
      var dark = current() === 'dark';
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      doc.dataset.theme = next;
      try { localStorage.setItem('dash-theme', next); } catch (e) {}
      sync();
    });
    sync();
  }

  /* ---------------- nav ---------------- */
  function initNav() {
    var bar = $('#progress');
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var max = doc.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var toggle = $('#nav-toggle'), links = $('#nav-links');
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) { links.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('is-open')) { links.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
    });

    if (!('IntersectionObserver' in window)) return;
    var map = {};
    $$('a', links).forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          $$('a', links).forEach(function (a) { a.removeAttribute('aria-current'); });
          map[en.target.id].setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  // Sections use content-visibility for a fast first load. Before jumping to an in-page anchor, render
  // everything so the target's position is exact, then scroll and correct once if anything moved.
  var forceWidgets = null; // set once data has loaded; builds every remaining widget synchronously
  function initAnchors() {
    var pinTimers = [];
    function unpin() { pinTimers.forEach(clearTimeout); pinTimers = []; }
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) { window.addEventListener(ev, unpin, { passive: true }); });
    function go(id, smooth) {
      var el = document.getElementById(id);
      if (!el) return false;
      unpin();
      doc.classList.add('cv-off');
      if (forceWidgets) forceWidgets();
      smooth = smooth && !reduceMotion;
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      // Late content (fonts, math, images) can still shift the page; re-align a few times unless the reader scrolls.
      (smooth ? [1000, 1600, 2400] : [80, 500, 1200, 2200]).forEach(function (t) {
        pinTimers.push(setTimeout(function () {
          var top = el.getBoundingClientRect().top, want = parseFloat(getComputedStyle(doc).scrollPaddingTop) || 0;
          if (Math.abs(top - want) > 4) el.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, t));
      });
      return true;
    }
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var id = a.getAttribute('href').slice(1);
      if (id && go(id, true)) { e.preventDefault(); history.pushState(null, '', '#' + id); }
    });
    var hashId = location.hash.length > 1 ? decodeURIComponent(location.hash.slice(1)) : '';
    initAnchors.onData = function () { if (hashId) go(hashId, false); };
  }

  function initReveal() {
    var els = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  function initAbstract() {
    var box = $('#abstract-text'), btn = $('#abstract-more');
    box.classList.add('is-clamped');
    btn.addEventListener('click', function () {
      var clamped = box.classList.toggle('is-clamped');
      btn.setAttribute('aria-expanded', String(!clamped));
      btn.textContent = clamped ? 'Read full abstract' : 'Show less';
    });
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.classList.remove('is-on'); }, 1800);
  }

  function initBib() {
    $('#bib-copy').addEventListener('click', function () {
      var text = $('#bib-text').textContent;
      function done() { toast('BibTeX copied'); }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else fallback();
      function fallback() {
        var ta = h('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('Select the text and copy it manually'); }
        document.body.removeChild(ta);
      }
    });
  }

  /* ---------------- tooltip ---------------- */
  var tip = null;
  function showTip(html, x, y) {
    tip = tip || $('#tip');
    tip.innerHTML = html;
    tip.hidden = false;
    var w = tip.offsetWidth, hh = tip.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14));
    var top = y - hh - 12 < 8 ? y + 16 : y - hh - 12;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }
  function bindTip(node, html) {
    node.setAttribute('tabindex', '0');
    node.setAttribute('role', 'img');
    if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', html().replace(/<br>/g, '. ').replace(/<[^>]+>/g, ''));
    node.addEventListener('pointerenter', function (e) { showTip(html(), e.clientX, e.clientY); });
    node.addEventListener('pointermove', function (e) { showTip(html(), e.clientX, e.clientY); });
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', function () { var r = node.getBoundingClientRect(); showTip(html(), r.left + r.width / 2, r.top); });
    node.addEventListener('blur', hideTip);
  }
  window.addEventListener('scroll', hideTip, { passive: true });

  /* ---------------- data access ---------------- */
  function rowsToObjects(t) {
    return t.rows.map(function (r) { var o = {}; t.columns.forEach(function (c, i) { o[c] = r[i]; }); return o; });
  }

  function buildIndex(D) {
    var I = {
      t1: rowsToObjects(D.table1_main),
      t2: rowsToObjects(D.table2_imagenet64),
      t3: rowsToObjects(D.table3_ablation),
      nl: rowsToObjects(D.null_line),
      sd1: rowsToObjects(D.std_table1),
      sd3: rowsToObjects(D.std_table3)
    };
    function find(rows, key, name) { return rows.filter(function (r) { return r[key] === name; })[0]; }
    I.t1by = function (n) { return find(I.t1, 'model', n); };
    I.t2by = function (n) { return find(I.t2, 'model', n); };
    I.t3by = function (n) { return find(I.t3, 'config', n); };
    I.nlby = function (n) { return find(I.nl, 'dataset', n); };
    var dash = I.t3by('DASH (ours)');
    var minsnr = I.t3by('No transfer: frozen Min-SNR');
    var relearn = I.t3by('TIRT relearned from λ=0');
    I.derived = {
      minsnr_c10: minsnr.c10_fid - dash.c10_fid,
      minsnr_c100: minsnr.c100_fid - dash.c100_fid,
      relearn_c10: relearn.c10_fid - dash.c10_fid,
      relearn_c100: relearn.c100_fid - dash.c100_fid,
      dash_1mrho: 1 - I.t1by('DASH (ours)').rho_c10
    };
    return I;
  }

  // Resolve a data-k key such as "t1.DASH (ours).c10_fid" to a value.
  function resolve(D, I, key) {
    var p = key.split('.');
    var head = p[0], last = p[p.length - 1], mid = p.slice(1, -1).join('.');
    switch (head) {
      case 'headline': return D.headline[p[1]];
      case 't1': var r1 = I.t1by(mid); return r1 && r1[last];
      case 't2': var r2 = I.t2by(mid); return r2 && r2[last];
      case 'null':
        if (p.length === 2) return D.null_line[p[1]];
        var r3 = I.nlby(mid); return r3 && r3[last];
      case 'eff': return D.efficiency_t4_bs64[p[1]];
      case 'tag': return D.tag[p[1]];
      case 'ws': return D.width_scaling_rho[p[1]][Number(p[2])];
      case 'd': return I.derived[p[1]];
    }
    return undefined;
  }

  function bindValues(D, I) {
    $$('[data-k]').forEach(function (n) {
      var key = n.getAttribute('data-k');
      var v = resolve(D, I, key);
      var suffix = n.getAttribute('data-suffix') || '';
      if (v === undefined || v === null) { n.classList.add('unbound'); console.warn('Unbound data key', key); return; }
      var fallback = n.textContent.replace(suffix, '').trim();
      var text;
      if (typeof v === 'number') {
        // Keep the precision the paper reports (taken from the static fallback text).
        var m = fallback.match(/\.(\d+)/);
        text = v.toFixed(m ? m[1].length : 0);
      } else text = String(v);
      n.textContent = text + suffix;
      n.dataset.value = text;
    });
  }

  function countUp() {
    if (reduceMotion) return;
    $$('.stat__num').forEach(function (n) {
      var final = n.textContent, suffix = n.getAttribute('data-suffix') || '';
      var target = parseFloat(final);
      if (!isFinite(target)) return;
      var dec = (final.replace(suffix, '').split('.')[1] || '').length;
      var t0 = null, dur = 1100;
      n.setAttribute('aria-label', final);
      function step(ts) {
        if (!t0) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        n.textContent = (target * e).toFixed(dec) + suffix;
        if (k < 1) requestAnimationFrame(step); else { n.textContent = final; n.removeAttribute('aria-label'); }
      }
      requestAnimationFrame(step);
    });
  }

  /* ---------------- Table 1 ---------------- */
  function initTable1(D, I) {
    var table = $('#t1'), ds = 'c10', sortKey = null, sortDir = 1, showStd = false;
    $('#t1-std').addEventListener('change', function (e) { showStd = e.target.checked; render(); });
    var notes = D.table1_main.notes;
    var COLS = [
      { k: 'model', label: 'Model', num: false },
      { k: 'params', label: 'Params', num: false },
      { k: 'fid', label: 'FID ↓', d: 2, better: -1 },
      { k: 'is', label: 'IS ↑', d: 2, better: 1 },
      { k: 'rho', label: 'ρ ↑', d: 2, better: 1 },
      { k: 'cos', label: 'cos(Δ) ↑', d: 2, better: 1 },
      { k: 'mse', label: 'MSE<sub>Δ</sub> ↓', d: 3, better: -1 }
    ];
    var GROUPS = { teacher: 'Teacher', loss: 'Loss-formulation baselines (6.1M, 5.9×)', compression: 'Alternative compression strategies', ours: 'Ours' };
    function val(r, k) {
      if (k === 'model' || k === 'params') return r[k];
      return k === 'fid' || k === 'is' ? r[ds + '_' + k] : r[k + '_' + ds];
    }
    function fn(r, k) {
      if (r.model === 'Cond-only' && k === 'cos') return '<span class="fn" title="' + notes.cond_only_cos + '">∗</span>';
      if (/Single-head/.test(r.model) && (k === 'rho' || k === 'cos' || k === 'mse')) return '<span class="fn" title="' + notes.single_head + '">†</span>';
      if (/Multi-w/.test(r.model) && k === 'model') return '<span class="fn" title="' + notes.multi_w + '">‡</span>';
      return '';
    }
    function best(k, better) {
      var vals = I.t1.filter(function (r) { return r.group !== 'teacher'; }).map(function (r) { return val(r, k); }).filter(function (v) { return v !== null; });
      return better < 0 ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
    }
    function render() {
      var thead = '<thead><tr>' + COLS.map(function (c) {
        var s = sortKey === c.k ? (sortDir > 0 ? 'ascending' : 'descending') : 'none';
        return '<th scope="col" aria-sort="' + s + '"><button type="button" data-sort="' + c.k + '">' + c.label + '</button></th>';
      }).join('') + '</tr></thead>';
      var rows = I.t1.slice();
      if (sortKey) {
        rows.sort(function (a, b) {
          var va = val(a, sortKey), vb = val(b, sortKey);
          if (va === null) return 1; if (vb === null) return -1;
          if (typeof va === 'string') return sortDir * va.localeCompare(vb, undefined, { numeric: true });
          return sortDir * (va - vb);
        });
      }
      var bests = {};
      COLS.forEach(function (c) { if (c.better) bests[c.k] = best(c.k, c.better); });
      var body = '', lastGroup = null;
      rows.forEach(function (r) {
        if (!sortKey && r.group !== lastGroup && r.group !== 'ours') {
          body += '<tr class="grp"><td colspan="' + COLS.length + '">' + GROUPS[r.group] + '</td></tr>';
        }
        lastGroup = r.group;
        body += '<tr class="' + (r.group === 'ours' ? 'is-ours' : '') + '">' + COLS.map(function (c, i) {
          var v = val(r, c.k);
          var cell = c.d === undefined ? v : (v === null ? '<span class="na">—</span>' : fx(v, c.d));
          if (showStd && (c.k === 'fid' || c.k === 'is')) {
            var sd = I.sd1.filter(function (x) { return x.model === r.model; })[0];
            if (sd) cell += '<span class="std">±' + fx(sd[ds + '_' + c.k], 2) + '</span>';
          }
          var isBest = c.better && v !== null && r.group !== 'teacher' && v === bests[c.k];
          var tag = i === 0 ? 'th scope="row"' : 'td';
          return '<' + tag + (isBest ? ' class="best"' : '') + '>' + cell + fn(r, c.k) + '</' + tag.split(' ')[0] + '>';
        }).join('') + '</tr>';
      });
      table.innerHTML = '<caption class="sr-only">Table 1 on ' + (ds === 'c10' ? 'CIFAR-10' : 'CIFAR-100') + '. Lower FID and MSE are better; higher IS, ρ and cos(Δ) are better. Dots mark the best student value per column.</caption>' + thead + '<tbody>' + body + '</tbody>';
      $$('th[scope="row"]', table).forEach(function (th) { th.style.textAlign = 'left'; th.style.fontWeight = 'inherit'; });
    }
    table.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sort]');
      if (!b) return;
      var k = b.getAttribute('data-sort');
      if (sortKey === k) { if (sortDir === 1) sortDir = -1; else { sortKey = null; sortDir = 1; } }
      else { sortKey = k; sortDir = 1; }
      render();
      var nb = $('button[data-sort="' + k + '"]', table); if (nb) nb.focus();
    });
    $$('[data-ds]').forEach(function (b) {
      b.addEventListener('click', function () {
        ds = b.getAttribute('data-ds');
        $$('[data-ds]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        render();
      });
    });
    $('#t1-notes').innerHTML =
      '<li><span class="fn">∗</span>' + notes.cond_only_cos + '.</li>' +
      '<li><span class="fn">†</span>Single-head ' + notes.single_head + '.</li>' +
      '<li><span class="fn">‡</span>' + notes.multi_w + '.</li>' +
      '<li>Protocol: ' + notes.protocol + '. Columns are sortable; select a header again to reverse, a third time to restore paper order.</li>';
    var pend = D.table1_main.pending_camera_ready || [];
    $('#t1-pending').textContent = pend.length ? 'To be added with the camera-ready: ' + pend.join('; ') + '.' : '';
    render();
  }

  /* ---------------- Responsive drawing ---------------- */
  // Charts are drawn at the container's real pixel width so text stays at its CSS size on every screen.
  function responsive(el, draw) {
    var last = 0, t;
    function run() { var w = Math.round(el.clientWidth); if (w && w !== last) { last = w; draw(w); } }
    run();
    if ('ResizeObserver' in window) new ResizeObserver(function () { clearTimeout(t); t = setTimeout(run, 120); }).observe(el);
    return function () { last = 0; run(); };
  }
  // Place point labels without overlaps: try right, then left, then nudge down.
  function placeLabels(items, minX, maxX) {
    // Every point is an obstacle too, so a label never sits on top of another marker.
    var placed = items.map(function (p) { return { x0: p.cx - 8, x1: p.cx + 8, y0: p.cy - 8, y1: p.cy + 8 }; });
    function hit(b) { return placed.some(function (q) { return b.x0 < q.x1 && b.x1 > q.x0 && b.y0 < q.y1 && b.y1 > q.y0; }); }
    items.sort(function (a, b) { return a.cy - b.cy; }).forEach(function (p) {
      var w = p.text.length * 6.6 + 4, best = null;
      for (var k = 0; k < 6 && !best; k++) {
        var dy = k * 14;
        var right = { x0: p.cx + 10, x1: p.cx + 10 + w, y0: p.cy - 9 + dy, y1: p.cy + 5 + dy, anchor: 'start', lx: p.cx + 10 };
        var left = { x0: p.cx - 10 - w, x1: p.cx - 10, y0: right.y0, y1: right.y1, anchor: 'end', lx: p.cx - 10 };
        [right, left].forEach(function (b) { if (!best && b.x1 <= maxX && b.x0 >= minX && !hit(b)) best = b; });
      }
      best = best || { x0: p.cx + 10, x1: p.cx + 10 + w, y0: p.cy - 9, y1: p.cy + 5, anchor: 'start', lx: p.cx + 10 };
      placed.push(best);
      p.lx = best.lx; p.ly = best.y1 - 2; p.anchor = best.anchor;
    });
    return items;
  }

  /* ---------------- Native diagrams: shared helpers ---------------- */
  var gradSeq = 0;
  // Text with inline math markup: "ε^{y}_{T}" style tokens rendered as tspans.
  function mtext(parent, x, y, src, attrs) {
    var t = svg('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
    var re = /([\^_])\{([^}]*)\}/g, last = 0, m;
    while ((m = re.exec(src))) {
      if (m.index > last) svg('tspan', {}, t).textContent = src.slice(last, m.index);
      var up = m[1] === '^';
      var ts = svg('tspan', { 'baseline-shift': up ? 'super' : 'sub', 'font-size': '72%' }, t);
      ts.textContent = m[2];
      last = re.lastIndex;
    }
    if (last < src.length) svg('tspan', {}, t).textContent = src.slice(last);
    return t;
  }
  function lgrad(defs, x1, y1, x2, y2, stops) {
    var id = 'lg' + (++gradSeq);
    var g = svg('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: x1, y1: y1, x2: x2, y2: y2 }, defs);
    stops.forEach(function (st) { svg('stop', { offset: st[0], style: 'stop-color:' + st[1] + ';stop-opacity:' + (st[2] === undefined ? 1 : st[2]) }, g); });
    return 'url(#' + id + ')';
  }
  function arrowMarker(defs, name, color) {
    var m = svg('marker', { id: 'mk-' + name, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    svg('path', { d: 'M0 0 L10 5 L0 10 z', style: 'fill:' + color }, m);
    return 'url(#mk-' + name + ')';
  }

  /* ---------------- Fig. 1: pipeline ---------------- */
  function initPipeline(D) {
    var box = $('#pipe-svg'), fig = $('#pipeline');
    var H = D.headline, lam = D.losses.lambda_an;
    var W = 1000, Hh = 480;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + Hh, class: 'pipe mode-fwd', role: 'group',
      'aria-label': 'DASH training pipeline. A noised input goes to a frozen ' + H.teacher_params + ' teacher and a trainable ' + H.student_params +
        ' student, each run twice, with the class label and with the null token. The imitation loss matches the conditional outputs, the unconditional loss matches the unconditional outputs, and the anchor loss pulls the student conditional output toward the ground-truth noise. The teacher timestep weights are copied to the student and frozen. Gradients update only the student.' }, box);
    var defs = svg('defs', {}, s);
    var C = { cond: 'var(--cond)', unc: 'var(--uncond)', gap: 'var(--gap)', ink: 'var(--ink-2)', gold: '#c99a1a', anc: 'var(--good)' };
    var mk = { cond: arrowMarker(defs, 'cond', C.cond), unc: arrowMarker(defs, 'unc', C.unc), ink: arrowMarker(defs, 'ink', C.ink), gold: arrowMarker(defs, 'gold', C.gold), gap: arrowMarker(defs, 'gap', C.gap), anc: arrowMarker(defs, 'anc', C.anc) };
    // noise texture for the noisy-input thumbnail
    var flt = svg('filter', { id: 'noisy', x: 0, y: 0, width: 1, height: 1 }, defs);
    svg('feTurbulence', { type: 'fractalNoise', baseFrequency: 1.4, numOctaves: 2, seed: 4, result: 'n' }, flt);
    svg('feColorMatrix', { in: 'n', type: 'saturate', values: 0, result: 'g' }, flt);
    svg('feBlend', { in: 'SourceGraphic', in2: 'g', mode: 'overlay' }, flt);
    var clip = svg('clipPath', { id: 'thumbclip' }, defs);
    svg('rect', { x: 0, y: 0, width: 64, height: 64, rx: 8 }, clip);

    var layer = { edges: svg('g', { class: 'pipe__edges' }, s), nodes: svg('g', { class: 'pipe__nodes' }, s) };

    function thumb(x, y, noisy) {
      var g = svg('g', { transform: 'translate(' + x + ' ' + y + ')' }, layer.nodes);
      var clipped = svg('g', { 'clip-path': 'url(#thumbclip)' }, g);
      var inner = svg('svg', { x: 0, y: 0, width: 64, height: 64, viewBox: '516 0 129 129' }, clipped);
      svg('image', { href: 'assets/img/teaser-in64-teacher-1290.webp', width: 1290, height: 129, filter: noisy ? 'url(#noisy)' : null, preserveAspectRatio: 'none' }, inner);
      if (noisy) svg('rect', { x: 0, y: 0, width: 64, height: 64, rx: 8, fill: 'var(--surface)', opacity: .35 }, g);
      svg('rect', { x: .5, y: .5, width: 63, height: 63, rx: 8, fill: 'none', stroke: 'var(--line-2)' }, g);
      return g;
    }
    function chip(x, y, w, h, label, color, cls, data) {
      var g = svg('g', { class: 'pnode ' + (cls || ''), 'data-loss': data || null }, layer.nodes);
      var fill = lgrad(defs, x, y, x, y + h, [[0, color, .16], [1, color, .05]]);
      svg('rect', { x: x, y: y, width: w, height: h, rx: 9, style: 'fill:' + fill + ';stroke:' + color, 'stroke-width': 1.5 }, g);
      mtext(g, x + w / 2, y + h / 2 + 5, label, { 'text-anchor': 'middle', class: 'pnode__t' });
      return g;
    }
    function netBox(x, y, w, h, title, sub, fillStops, stroke, cls) {
      var g = svg('g', { class: 'pbox ' + cls }, layer.nodes);
      svg('rect', { x: x, y: y, width: w, height: h, rx: 14, style: 'fill:' + lgrad(defs, x, y, x + w, y + h, fillStops) + ';stroke:' + stroke, 'stroke-width': 1.5 }, g);
      mtext(g, x + 16, y + 28, title, { class: 'pbox__t' });
      svg('text', { x: x + 16, y: y + 47, class: 'pbox__s' }, g).textContent = sub;
      // a stylised U-Net: encoder / bottleneck / decoder bars
      var ux = x + 18, uy = y + 64, bw = [56, 44, 32, 44, 56];
      bw.forEach(function (b, i) {
        svg('rect', { x: ux + i * 30, y: uy + (56 - b) / 2 + 4, width: 18, height: b, rx: 4, style: 'fill:' + stroke, opacity: .14 + (i === 2 ? .2 : 0) }, g);
      });
      svg('text', { x: ux + 66, y: uy + 80, 'text-anchor': 'middle', class: 'pbox__u' }, g).textContent = 'U-Net';
      return g;
    }
    function edge(d, color, marker, cls, data, x1, y1, x2, y2, dashed) {
      var stroke = x1 === undefined ? color : lgrad(defs, x1, y1, x2, y2, [[0, color, .55], [1, color, 1]]);
      var p = svg('path', { d: d, fill: 'none', style: 'stroke:' + stroke, 'stroke-width': 2, 'marker-end': marker, class: 'pedge ' + (cls || '') + (dashed ? ' pedge--dash' : ''), 'data-loss': data || null }, layer.edges);
      return p;
    }

    // --- inputs
    thumb(36, 52, false);
    svg('text', { x: 68, y: 136, 'text-anchor': 'middle', class: 'plbl' }, layer.nodes).textContent = 'clean image';
    mtext(layer.nodes, 68, 34, 'x_{0}', { 'text-anchor': 'middle', class: 'plbl plbl--m' });
    chip(18, 300, 100, 38, 'ε ∼ N(0, I)', C.anc, 'pnode--noise', 'an');
    svg('text', { x: 68, y: 356, 'text-anchor': 'middle', class: 'plbl' }, layer.nodes).textContent = 'ground-truth noise';
    thumb(180, 186, true);
    mtext(layer.nodes, 212, 176, 'x_{t}', { 'text-anchor': 'middle', class: 'plbl plbl--m' });
    svg('text', { x: 212, y: 270, 'text-anchor': 'middle', class: 'plbl' }, layer.nodes).textContent = 'noisy input, t, y';
    edge('M104 84 C150 84 140 204 176 204', C.ink, mk.ink, 'flow-fwd', null);
    edge('M118 319 C150 319 140 236 176 236', C.anc, mk.anc, 'flow-fwd', 'an');

    // --- networks
    netBox(320, 30, 236, 176, 'Teacher ε_{T}', H.teacher_params + ' · frozen · 2 passes: y and ∅', [[0, 'var(--tint)'], [1, 'var(--surface)']], 'var(--ink-2)', 'pbox--teacher');
    netBox(320, 274, 236, 176, 'Student ε_{S}', H.student_params + ' · trainable · 2 passes: y and ∅', [[0, 'color-mix(in srgb, var(--gap) 12%, var(--surface))'], [1, 'color-mix(in srgb, var(--cond) 8%, var(--surface))']], 'var(--gap)', 'pbox--student');
    // lock and "stop-gradient" on the teacher
    var lock = svg('g', { transform: 'translate(522 44)', class: 'plock' }, layer.nodes);
    svg('rect', { x: 0, y: 8, width: 16, height: 12, rx: 2.5, fill: 'var(--ink-2)' }, lock);
    svg('path', { d: 'M3.5 8 V5 a4.5 4.5 0 0 1 9 0 V8', fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 2 }, lock);
    svg('text', { x: 438, y: 196, 'text-anchor': 'middle', class: 'plbl plbl--stop' }, layer.nodes).textContent = 'stop-gradient: never updated';
    edge('M246 206 C280 206 286 118 316 118', C.ink, mk.ink, 'flow-fwd', null);
    edge('M246 232 C280 232 286 362 316 362', C.ink, mk.ink, 'flow-fwd', null);

    // --- TIRT transfer
    edge('M470 206 L470 268', C.gold, mk.gold, 'flow-fwd pedge--gold', null, 470, 206, 470, 268, true);
    svg('text', { x: 460, y: 234, 'text-anchor': 'end', class: 'plbl plbl--gold' }, layer.nodes).textContent = 'TIRT Transfer';
    mtext(layer.nodes, 460, 250, 'ω̂^{T} copied, frozen', { 'text-anchor': 'end', class: 'plbl plbl--gold' });

    // --- outputs
    var out = {
      yT: chip(590, 64, 82, 34, 'ε^{y}_{T}', C.cond, 'pnode--out', 'im'),
      nT: chip(590, 140, 82, 34, 'ε^{∅}_{T}', C.unc, 'pnode--out', 'un'),
      yS: chip(590, 308, 82, 34, 'ε^{y}_{S}', C.cond, 'pnode--out', 'im an'),
      nS: chip(590, 384, 82, 34, 'ε^{∅}_{S}', C.unc, 'pnode--out', 'un')
    };
    edge('M556 96 L586 81', C.cond, mk.cond, 'flow-fwd', 'im', 556, 96, 586, 81);
    edge('M556 140 L586 157', C.unc, mk.unc, 'flow-fwd', 'un', 556, 140, 586, 157);
    edge('M556 340 L586 325', C.cond, mk.cond, 'flow-fwd', 'im an', 556, 340, 586, 325);
    edge('M556 384 L586 401', C.unc, mk.unc, 'flow-fwd', 'un', 556, 384, 586, 401);

    // --- guidance-gap monitor
    var mon = svg('g', { class: 'pnode pnode--mon' }, layer.nodes);
    svg('rect', { x: 586, y: 206, width: 132, height: 60, rx: 9, fill: 'var(--surface)', style: 'stroke:' + C.gap, 'stroke-dasharray': '4 3', 'stroke-width': 1.3 }, mon);
    mtext(mon, 652, 230, 'ρ = E‖Δ_{S}‖ / E‖Δ_{T}‖', { 'text-anchor': 'middle', class: 'pnode__t pnode__t--sm' });
    svg('text', { x: 652, y: 252, 'text-anchor': 'middle', class: 'plbl' }, mon).textContent = 'monitored, not a loss';
    edge('M631 174 L631 202', C.gap, mk.gap, '', null, 631, 174, 631, 202, true);
    edge('M631 308 L631 270', C.gap, mk.gap, '', null, 631, 308, 631, 270, true);
    mtext(layer.nodes, 640, 194, 'Δ_{T}', { class: 'plbl plbl--m' });
    mtext(layer.nodes, 640, 294, 'Δ_{S}', { class: 'plbl plbl--m' });

    // --- losses
    var Lx = 760, Lw = 110, Lh = 46;
    function loss(y, label, sub, color, k) {
      var g = chip(Lx, y, Lw, Lh, label, color, 'pnode--loss', k);
      svg('text', { x: Lx + Lw / 2, y: y + Lh + 15, 'text-anchor': 'middle', class: 'plbl' }, layer.nodes).textContent = sub;
      return g;
    }
    loss(96, 'L_{im}', 'imitation: conditional', C.cond, 'im');
    loss(236, 'L_{un}', 'unconditional', C.unc, 'un');
    loss(376, 'L_{an}', 'anchor to ε', C.anc, 'an');
    edge('M672 81 C716 81 716 108 756 108', C.cond, mk.cond, 'flow-fwd', 'im', 672, 81, 756, 108);
    edge('M672 325 C744 325 730 132 756 132', C.cond, mk.cond, 'flow-fwd', 'im', 672, 325, 756, 132);
    edge('M672 157 C740 157 730 248 756 248', C.unc, mk.unc, 'flow-fwd', 'un', 672, 157, 756, 248);
    edge('M672 401 C724 401 712 272 756 272', C.unc, mk.unc, 'flow-fwd', 'un', 672, 401, 756, 272);
    edge('M672 330 C716 330 716 392 756 392', C.anc, mk.anc, 'flow-fwd', 'an', 672, 330, 756, 392);
    edge('M18 319 L8 319 L8 470 L858 470 L858 426', C.anc, mk.anc, 'flow-fwd', 'an', 8, 470, 858, 426, true);

    // --- total objective
    var tot = svg('g', { class: 'pnode pnode--total' }, layer.nodes);
    svg('rect', { x: 896, y: 196, width: 96, height: 104, rx: 12, style: 'fill:' + lgrad(defs, 896, 196, 992, 300, [[0, C.cond, .14], [.5, C.gap, .14], [1, C.unc, .14]]) + ';stroke:' + lgrad(defs, 896, 196, 992, 300, [[0, C.cond], [.5, C.gap], [1, C.unc]]), 'stroke-width': 1.8 }, tot);
    mtext(tot, 944, 226, 'L_{DASH}', { 'text-anchor': 'middle', class: 'pnode__t' });
    mtext(tot, 944, 252, 'L_{im} + L_{un}', { 'text-anchor': 'middle', class: 'plbl plbl--m' });
    mtext(tot, 944, 272, '+ ' + lam + ' · L_{an}', { 'text-anchor': 'middle', class: 'plbl plbl--m' });
    edge('M870 119 C886 119 874 216 892 216', C.cond, mk.cond, 'flow-fwd', 'im', 870, 119, 892, 216);
    edge('M870 259 C881 259 881 248 892 248', C.unc, mk.unc, 'flow-fwd', 'un', 870, 259, 892, 248);
    edge('M870 399 C886 399 874 280 892 280', C.anc, mk.anc, 'flow-fwd', 'an', 870, 399, 892, 280);

    // --- backward: gradients flow from the loss into the student only
    edge('M944 300 L944 452 C944 458 940 458 934 458 L560 458 C452 458 446 456 446 454', C.gap, mk.gap, 'flow-bwd', null, 944, 300, 446, 454, true);
    svg('text', { x: 700, y: 452, 'text-anchor': 'middle', class: 'plbl plbl--bwd' }, layer.nodes).textContent = '∇ gradients update the student only';

    // interactions
    function setMode(m) {
      s.classList.toggle('mode-fwd', m === 'fwd'); s.classList.toggle('mode-bwd', m === 'bwd');
      $$('[data-flow]', fig).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-flow') === m)); });
      $('#pipe-hint').textContent = m === 'fwd' ? 'Hover or focus a loss to see which branches it connects.' : 'Only the student receives gradients; the teacher and its timestep weights stay frozen.';
    }
    $$('[data-flow]', fig).forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-flow')); }); });
    $$('.pnode--loss', s).forEach(function (n) {
      var k = n.getAttribute('data-loss');
      n.setAttribute('tabindex', '0');
      n.setAttribute('role', 'button');
      n.setAttribute('aria-label', { im: 'Imitation loss: matches the conditional outputs', un: 'Unconditional loss: matches the unconditional outputs', an: 'Anchor loss: student conditional output toward ground-truth noise' }[k]);
      function on() { s.classList.add('is-focus'); $$('[data-loss]', s).forEach(function (e) { e.classList.toggle('is-hot', (' ' + e.getAttribute('data-loss') + ' ').indexOf(' ' + k + ' ') >= 0); }); }
      function off() { s.classList.remove('is-focus'); $$('.is-hot', s).forEach(function (e) { e.classList.remove('is-hot'); }); }
      n.addEventListener('pointerenter', on); n.addEventListener('pointerleave', off);
      n.addEventListener('focus', on); n.addEventListener('blur', off);
    });
    $$('text', s).forEach(function (t) { t.setAttribute('aria-hidden', 'true'); });
  }

  /* ---------------- Fig. 2: solution geometry ---------------- */
  function initGeometry() {
    var box = $('#geom-svg');
    // Illustrative values for one output coordinate: teacher branches (yT, nT), guidance weight w.
    var yT = 2.0, nT = 0.8, w = 4, slope = w / (w - 1);
    var collapse = (nT - slope * yT) / (1 - slope); // where the zero-loss line meets the diagonal εy = ε∅
    var shiftX = 3.8;
    var anim = null;
    responsive(box, function (Wt) {
      box.innerHTML = '';
      if (anim) cancelAnimationFrame(anim);
      var two = Wt >= 640, gap = 24;
      var pw = two ? (Wt - gap) / 2 : Wt, ph = Math.min(380, Math.round(pw * 0.86));
      var H = two ? ph : ph * 2 + gap;
      var s = svg('svg', { viewBox: '0 0 ' + Wt + ' ' + H, width: Wt, height: H, role: 'group' }, box);
      var defs = svg('defs', {}, s);
      var glow = svg('radialGradient', { id: 'geo-glow' }, defs);
      svg('stop', { offset: 0, style: 'stop-color:var(--good);stop-opacity:.45' }, glow);
      svg('stop', { offset: 1, style: 'stop-color:var(--good);stop-opacity:0' }, glow);
      function panel(ox, oy, title, sub) {
        var g = svg('g', { transform: 'translate(' + ox + ' ' + oy + ')' }, s);
        svg('rect', { x: .5, y: .5, width: pw - 1, height: ph - 1, rx: 14, fill: 'var(--surface)', stroke: 'var(--line)' }, g);
        var M = { l: 40, r: 18, t: 78, b: 40 };
        var x = lin(-1, 7, M.l, pw - M.r), y = lin(-1, 7, ph - M.b, M.t);
        svg('text', { x: 18, y: 26, class: 'geo__title' }, g).textContent = title;
        svg('text', { x: 18, y: 43, class: 'lbl' }, g).textContent = sub;
        for (var v = 0; v <= 6; v += 2) {
          svg('line', { x1: x(v), x2: x(v), y1: M.t, y2: ph - M.b, class: 'gridline' }, g);
          svg('line', { x1: M.l, x2: pw - M.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
        }
        svg('line', { x1: x(-1), x2: x(7), y1: y(0), y2: y(0), stroke: 'var(--line-2)', 'stroke-width': 1.4 }, g);
        svg('line', { x1: x(0), x2: x(0), y1: y(-1), y2: y(7), stroke: 'var(--line-2)', 'stroke-width': 1.4 }, g);
        mtext(g, pw - M.r, ph - 12, 'ε^{y}_{S}  (conditional output)', { 'text-anchor': 'end', class: 'axis-title' });
        mtext(g, M.l + 8, M.t + 12, 'ε^{∅}_{S}', { class: 'axis-title' });
        return { g: g, x: x, y: y, M: M };
      }
      var A = panel(0, 0, 'Composite objective', 'one constraint, a line of solutions');
      var B = panel(two ? pw + gap : 0, two ? 0 : ph + gap, 'Dual-branch DASH', 'two constraints, one solution');

      // ---- left: composite
      var g = A.g, x = A.x, y = A.y;
      var fy = function (vx) { return nT + slope * (vx - yT); };
      var xa = yT + (-1 - nT) / slope, xb = Math.min(6.6, yT + (7 - nT) / slope);
      svg('line', { x1: x(-1), y1: y(-1), x2: x(7), y2: y(7), stroke: 'var(--muted)', 'stroke-dasharray': '4 5', 'stroke-width': 1.2 }, g);
      // legend for the dashed diagonal
      svg('line', { x1: 18, x2: 40, y1: 60, y2: 60, stroke: 'var(--muted)', 'stroke-dasharray': '4 5', 'stroke-width': 1.2 }, g);
      mtext(g, 46, 64, 'diagonal ε^{y}_{S} = ε^{∅}_{S}: guidance gap is zero', { class: 'lbl' });
      var bandG = lgrad(defs, x(xa), y(fy(xa)), x(xb), y(fy(xb)), [[0, 'var(--cond)'], [.5, 'var(--gap)'], [1, 'var(--uncond)']]);
      svg('line', { x1: x(xa), y1: y(fy(xa)), x2: x(xb), y2: y(fy(xb)), style: 'stroke:' + bandG, 'stroke-width': 16, 'stroke-linecap': 'round', opacity: .16 }, g);
      svg('line', { x1: x(xa), y1: y(fy(xa)), x2: x(xb), y2: y(fy(xb)), style: 'stroke:' + bandG, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      mtext(g, x(4.6) + 14, y(fy(4.6)) + 16, pw < 440 ? 'L_{comp} = 0' : 'L_{comp} = 0 on the whole line', { class: 'lbl lbl--ink' });
      function pt(gp, vx, vy, color, r, label, dx, dy, anchor) {
        svg('circle', { cx: x(vx), cy: y(vy), r: r, fill: color, stroke: 'var(--surface)', 'stroke-width': 2.5 }, gp);
        if (label) mtext(gp, x(vx) + dx, y(vy) + dy, label, { 'text-anchor': anchor || 'start', class: 'lbl lbl--ink' });
      }
      pt(g, yT, nT, 'var(--good)', 7, '(i) ideal recovery', 12, 16);
      pt(g, shiftX, fy(shiftX), 'var(--muted)', 6, '(ii) shift', 12, 14);
      pt(g, collapse, collapse, '#d64545', 7.5, '(iii) collapse', -12, -10, 'end');
      var mover = svg('circle', { r: 6, fill: 'var(--surface)', stroke: 'var(--gap)', 'stroke-width': 3 }, g);
      var tag = svg('text', { class: 'lbl', 'text-anchor': 'end' }, g);
      function place(t) {
        var vx = yT + (collapse - yT) * t;
        mover.setAttribute('cx', x(vx)); mover.setAttribute('cy', y(fy(vx)));
        tag.setAttribute('x', x(vx) - 12); tag.setAttribute('y', y(fy(vx)) - 10);
      }
      tag.textContent = 'loss stays 0';
      if (reduceMotion) { place(0.55); }
      else {
        var t0 = null;
        var step = function (ts) {
          if (!t0) t0 = ts;
          var k = ((ts - t0) / 5200) % 1, t = 0.5 - 0.5 * Math.cos(k * 2 * Math.PI);
          place(t);
          anim = requestAnimationFrame(step);
        };
        anim = requestAnimationFrame(step);
      }

      // ---- right: DASH
      g = B.g; x = B.x; y = B.y;
      var vb = lgrad(defs, x(yT), y(-1), x(yT), y(7), [[0, 'var(--cond)', .02], [.5, 'var(--cond)', .22], [1, 'var(--cond)', .02]]);
      var hb = lgrad(defs, x(-1), y(nT), x(7), y(nT), [[0, 'var(--uncond)', .02], [.5, 'var(--uncond)', .22], [1, 'var(--uncond)', .02]]);
      svg('rect', { x: x(yT) - 10, y: y(7), width: 20, height: y(-1) - y(7), style: 'fill:' + vb }, g);
      svg('rect', { x: x(-1), y: y(nT) - 10, width: x(7) - x(-1), height: 20, style: 'fill:' + hb }, g);
      svg('line', { x1: x(yT), x2: x(yT), y1: y(-1), y2: y(7), stroke: 'var(--cond)', 'stroke-width': 2.5, 'stroke-dasharray': '7 5' }, g);
      svg('line', { x1: x(-1), x2: x(7), y1: y(nT), y2: y(nT), stroke: 'var(--uncond)', 'stroke-width': 2.5, 'stroke-dasharray': '7 5' }, g);
      mtext(g, x(yT) + 14, y(6.6), 'L_{im} = 0: ε^{y}_{S} = ε^{y}_{T}', { class: 'lbl lbl--ink' });
      mtext(g, x(6.9), y(nT) - 14, 'L_{un} = 0: ε^{∅}_{S} = ε^{∅}_{T}', { 'text-anchor': 'end', class: 'lbl lbl--ink' });
      svg('circle', { cx: x(yT), cy: y(nT), r: 26, fill: 'url(#geo-glow)' }, g);
      pt(g, yT, nT, 'var(--good)', 8, 'one solution: ideal recovery', 14, 24);
      describe(box, 'Left: the composite loss is zero along a line containing ideal recovery, a shift and collapse. Right: the two DASH constraints cross at one point.');
    });
  }

  /* ---------------- Calibration scatter ---------------- */
  function initCalibration(D, I) {
    var box = $('#cal-chart'), ds = 'c10';
    var SHORT = { 'Composite (two-branch adaptation of Meng et al.)': 'Composite', 'Multi-w composite': 'Multi-w', 'Gap Δ match': 'Gap match',
      'Label-dropout': 'Label-drop.', 'Magnitude pruning': 'Pruning', 'DASH (ours)': 'DASH', 'DASH-Teacher': 'Teacher' };
    var LONG = { 'Composite (two-branch adaptation of Meng et al.)': 'Composite', 'DASH-Teacher': 'Teacher' };
    var redraw = responsive(box, draw);
    function draw(W) {
      box.innerHTML = '';
      var narrow = W < 560;
      var H = narrow ? Math.round(W * 0.95) : Math.min(460, Math.round(W * 0.56));
      var M = { l: 50, r: narrow ? 8 : 24, t: 14, b: 46 };
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group' }, box);
      var x = lin(0.55, 1.03, M.l, W - M.r), y = lin(0.4, 1.04, H - M.b, M.t);
      var g = svg('g', { class: 'ax' }, s);
      [0.6, 0.7, 0.8, 0.9, 1.0].forEach(function (v) {
        svg('line', { x1: x(v), x2: x(v), y1: M.t, y2: H - M.b, class: 'gridline' }, g);
        svg('text', { x: x(v), y: H - M.b + 18, 'text-anchor': 'middle' }, g).textContent = v.toFixed(1);
      });
      [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach(function (v) {
        svg('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
        svg('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v.toFixed(1);
      });
      svg('text', { x: (M.l + W - M.r) / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis-title' }, s).textContent = 'Gap magnitude ρ  (teacher = 1)';
      svg('text', { x: 14, y: (M.t + H - M.b) / 2, 'text-anchor': 'middle', class: 'axis-title', transform: 'rotate(-90 14 ' + (M.t + H - M.b) / 2 + ')' }, s).textContent = 'Gap direction cos(Δ)';
      var pts = I.t1.filter(function (r) { return r['rho_' + ds] !== null && r['cos_' + ds] !== null; }).map(function (r) {
        return { r: r, cx: x(r['rho_' + ds]), cy: y(r['cos_' + ds]), text: (narrow ? SHORT : LONG)[r.model] || r.model };
      });
      placeLabels(pts, M.l + 2, W - 2);
      pts.forEach(function (p) {
        var r = p.r, ours = r.group === 'ours', teacher = r.group === 'teacher';
        var c = svg('circle', {
          cx: p.cx, cy: p.cy, r: ours ? 8 : 6.5,
          fill: ours ? 'var(--gap)' : teacher ? 'var(--surface)' : r.model === 'Scratch' ? 'var(--uncond)' : 'var(--muted)',
          stroke: teacher ? 'var(--ink)' : 'var(--surface)', 'stroke-width': teacher ? 2.5 : 2
        }, s);
        var name = LONG[r.model] || r.model;
        bindTip(c, function () { return '<b>' + name + '</b><br>ρ = ' + fx(r['rho_' + ds], 2) + ' · cos(Δ) = ' + fx(r['cos_' + ds], 2) + '<br>FID ' + fx(r[ds + '_fid'], 2) + ' · MSE<sub>Δ</sub> ' + fx(r['mse_' + ds], 3); });
        svg('text', { x: p.lx, y: p.ly, 'text-anchor': p.anchor, class: ours || teacher || r.model === 'Scratch' ? 'lbl lbl--ink' : 'lbl' }, s).textContent = p.text;
      });
      var tbl = I.t1.filter(function (r) { return r['rho_' + ds] !== null; }).map(function (r) {
        return r.model + ': ρ ' + fx(r['rho_' + ds], 2) + ', cos(Δ) ' + fx(r['cos_' + ds], 2);
      }).join('; ');
      describe(box, 'Scatter of ρ against cos(Δ), ' + (ds === 'c10' ? 'CIFAR-10' : 'CIFAR-100') + '. ' + tbl);
    }
    $$('[data-cal]').forEach(function (b) {
      b.addEventListener('click', function () {
        ds = b.getAttribute('data-cal');
        $$('[data-cal]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        redraw();
      });
    });
  }

  /* ---------------- Table 2 ---------------- */
  function initTable2(D, I) {
    var cols = [['model', 'Model'], ['fid', 'FID ↓', 2], ['is', 'IS ↑', 2], ['rho', 'ρ', 2], ['cos', 'cos(Δ)', 2], ['mse', 'MSE<sub>Δ</sub>', 3]];
    var html = '<caption class="sr-only">Table 2, class-conditional ImageNet-64</caption><thead><tr>' + cols.map(function (c) { return '<th scope="col">' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>';
    I.t2.forEach(function (r) {
      var ours = /^DASH/.test(r.model);
      html += '<tr class="' + (ours ? 'is-ours' : '') + '">' + cols.map(function (c, i) {
        var v = i === 0 ? r.model.replace('w/o L_un', 'w/o L<sub>un</sub>') : fx(r[c[0]], c[2]);
        return i === 0 ? '<th scope="row" style="text-align:left;font-weight:inherit">' + v + '</th>' : '<td>' + v + '</td>';
      }).join('') + '</tr>';
    });
    $('#t2').innerHTML = html + '</tbody>';
  }

  /* ---------------- Null-line chart ---------------- */
  function initNullChart(D, I) {
    var box = $('#null-chart'), pred = D.null_line.predicted_ratio;
    responsive(box, function (W) {
      box.innerHTML = '';
      var H = 450;
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group' }, box);
      // Top: measured ratio per dataset against the predicted line.
      var L = { l: 46, r: W - 14, t: 26, b: 190 };
      svg('text', { x: 0, y: 12, class: 'axis-title' }, s).textContent = 'Residual ratio ‖δʸ‖ / ‖δ∅‖';
      var y = lin(0.6, 0.9, L.b, L.t);
      var xs = I.nl.map(function (_, i) { return L.l + (i + 0.5) * (L.r - L.l) / I.nl.length; });
      var g = svg('g', { class: 'ax' }, s);
      [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9].forEach(function (v) {
        svg('line', { x1: L.l, x2: L.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
        svg('text', { x: L.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v.toFixed(2);
      });
      svg('line', { x1: L.l, x2: L.r, y1: y(pred), y2: y(pred), stroke: 'var(--gap)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, s);
      // Legend for the dashed line, in the empty band at the bottom of the plot.
      svg('line', { x1: L.l + 10, x2: L.l + 34, y1: y(0.62), y2: y(0.62), stroke: 'var(--gap)', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, s);
      svg('text', { x: L.l + 40, y: y(0.62) + 4, class: 'lbl lbl--ink2' }, s).textContent = 'predicted (w−1)/w = ' + pred.toFixed(2) + ' at w = ' + fx(D.null_line.w, 0);
      I.nl.forEach(function (r, i) {
        svg('line', { x1: xs[i], x2: xs[i], y1: y(pred), y2: y(r.measured_ratio), stroke: 'var(--line-2)', 'stroke-width': 2 }, s);
        var c = svg('circle', { cx: xs[i], cy: y(r.measured_ratio), r: 7.5, fill: 'var(--gap)', stroke: 'var(--surface)', 'stroke-width': 2 }, s);
        bindTip(c, function () { return '<b>' + r.dataset + '</b><br>measured ‖δ<sup>y</sup>‖/‖δ<sup>∅</sup>‖ = ' + fx(r.measured_ratio, 2) + '<br>predicted ' + fx(pred, 2); });
        svg('text', { x: xs[i], y: y(r.measured_ratio) + (r.measured_ratio >= pred ? -13 : 22), 'text-anchor': 'middle', class: 'lbl lbl--ink' }, s).textContent = fx(r.measured_ratio, 2);
        svg('text', { x: xs[i], y: L.b + 20, 'text-anchor': 'middle', class: 'lbl' }, s).textContent = r.dataset;
      });

      // Bottom: drift toward collapse, 1 − ρ (hollow) to f (filled).
      var R = { l: W < 420 ? 92 : 104, r: W - 18, t: 278, b: 410 };
      svg('text', { x: 0, y: R.t - 30, class: 'axis-title' }, s).textContent = 'Drift toward collapse: f ≥ 1 − ρ';
      var x = lin(0.25, 0.45, R.l, R.r);
      var g2 = svg('g', { class: 'ax' }, s);
      [0.25, 0.3, 0.35, 0.4, 0.45].forEach(function (v) {
        svg('line', { x1: x(v), x2: x(v), y1: R.t - 10, y2: R.b, class: 'gridline' }, g2);
        svg('text', { x: x(v), y: R.b + 18, 'text-anchor': 'middle' }, g2).textContent = v.toFixed(2);
      });
      I.nl.forEach(function (r, i) {
        var yy = R.t + 14 + i * 44;
        svg('text', { x: R.l - 10, y: yy + 4, 'text-anchor': 'end', class: 'lbl' }, s).textContent = r.dataset;
        svg('line', { x1: x(r.one_minus_rho), x2: x(r.f_toward_collapse), y1: yy, y2: yy, stroke: 'var(--line-2)', 'stroke-width': 3, 'stroke-linecap': 'round' }, s);
        var a = svg('circle', { cx: x(r.one_minus_rho), cy: yy, r: 6, fill: 'var(--surface)', stroke: 'var(--ink-2)', 'stroke-width': 2 }, s);
        var b = svg('circle', { cx: x(r.f_toward_collapse), cy: yy, r: 6.5, fill: 'var(--uncond)', stroke: 'var(--surface)', 'stroke-width': 2 }, s);
        var tipf = function () { return '<b>' + r.dataset + '</b><br>f = ' + fx(r.f_toward_collapse, 2) + ' ≥ 1 − ρ = ' + fx(r.one_minus_rho, 2); };
        bindTip(a, tipf); bindTip(b, tipf);
        if (i === 0) {
          svg('text', { x: x(r.one_minus_rho) - 6, y: yy - 12, 'text-anchor': 'end', class: 'lbl' }, s).textContent = '1 − ρ';
          svg('text', { x: x(r.f_toward_collapse) + 6, y: yy - 12, 'text-anchor': 'start', class: 'lbl lbl--ink' }, s).textContent = 'f';
        }
      });
      describe(box, 'Measured residual ratios ' + I.nl.map(function (r) { return r.dataset + ' ' + fx(r.measured_ratio, 2); }).join(', ') + ' against the predicted ' + fx(pred, 2) + '. Drift f: ' + I.nl.map(function (r) { return r.dataset + ' ' + fx(r.f_toward_collapse, 2) + ' versus 1 − ρ ' + fx(r.one_minus_rho, 2); }).join(', ') + '.');
    });
  }

  /* ---------------- Width scaling ---------------- */
  function initWidthChart(D) {
    var box = $('#width-chart'), ws = D.width_scaling_rho;
    function fx2(v) { return fx(v, 2); }
    responsive(box, function (W) {
      box.innerHTML = '';
      var narrow = W < 560;
      var H = narrow ? 320 : 320, M = { l: 52, r: narrow ? 66 : 96, t: 18, b: narrow ? 58 : 48 };
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group' }, box);
      var x = lin(42, 102, M.l, W - M.r), y = lin(0.75, 1.0, H - M.b, M.t);
      var g = svg('g', { class: 'ax' }, s);
      [0.75, 0.8, 0.85, 0.9, 0.95, 1.0].forEach(function (v) {
        svg('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
        svg('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v.toFixed(2);
      });
      ws.channels.forEach(function (c, i) {
        if (narrow) {
          svg('text', { x: x(c), y: H - M.b + 18, 'text-anchor': 'middle' }, g).textContent = c + ' ch';
          svg('text', { x: x(c), y: H - M.b + 33, 'text-anchor': 'middle' }, g).textContent = ws.params[i];
        } else {
          svg('text', { x: x(c), y: H - M.b + 18, 'text-anchor': 'middle' }, g).textContent = c + ' ch · ' + ws.params[i] + ' · ' + ws.compression[i];
        }
      });
      svg('text', { x: 14, y: (M.t + H - M.b) / 2, 'text-anchor': 'middle', class: 'axis-title', transform: 'rotate(-90 14 ' + (M.t + H - M.b) / 2 + ')' }, s).textContent = 'ρ (CIFAR-10)';
      function series(key, color, dash, label, cosKey, fid10, fid100) {
        var d = ws[key].map(function (v, i) { return (i ? 'L' : 'M') + x(ws.channels[i]) + ' ' + y(v); }).join(' ');
        svg('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-dasharray': dash || null, 'stroke-linejoin': 'round' }, s);
        ws[key].forEach(function (v, i) {
          var c = svg('circle', { cx: x(ws.channels[i]), cy: y(v), r: 6.5, fill: color, stroke: 'var(--surface)', 'stroke-width': 2 }, s);
          bindTip(c, function () {
            return '<b>' + label + ', ' + ws.channels[i] + ' ch</b><br>' + ws.params[i] + ' params · ' + ws.compression[i] + '<br>ρ = ' + fx(v, 2) + ' · cos(Δ) = ' + fx(ws[cosKey][i], 2) +
              '<br>FID C10 ' + fx(ws[fid10][i], 2) + ' · C100 ' + fx(ws[fid100][i], 2);
          });
          svg('text', { x: x(ws.channels[i]), y: y(v) + (key === 'dash' ? -13 : 21), 'text-anchor': 'middle', class: 'lbl lbl--ink2' }, s).textContent = fx(v, 2);
        });
        var last = ws[key].length - 1;
        svg('text', { x: x(ws.channels[last]) + 14, y: y(ws[key][last]) + 4, class: 'lbl lbl--ink' }, s).textContent = label;
      }
      series('scratch', 'var(--muted)', '6 5', 'Scratch', 'scratch_cos', 'scratch_c10_fid', 'scratch_c100_fid');
      var wdefs = svg('defs', {}, s);
      var wfill = lgrad(wdefs, 0, y(1.0), 0, y(0.75), [[0, 'var(--gap)', .22], [1, 'var(--gap)', 0]]);
      svg('path', { d: ws.dash.map(function (v, i) { return (i ? 'L' : 'M') + x(ws.channels[i]) + ' ' + y(v); }).join(' ') + 'L' + x(ws.channels[2]) + ' ' + y(0.75) + 'L' + x(ws.channels[0]) + ' ' + y(0.75) + 'Z', style: 'fill:' + wfill }, s);
      series('dash', 'var(--gap)', null, 'DASH', 'dash_cos', 'dash_c10_fid', 'dash_c100_fid');
      // Composite was measured at 64 channels only; its rho (0.68) sits below this axis, so mark it at the floor and say so.
      var cx = x(64), cy = y(Math.max(0.755, ws.composite_rho_ch64));
      var dmd = svg('path', { d: 'M' + cx + ' ' + (cy - 7) + 'L' + (cx + 7) + ' ' + cy + 'L' + cx + ' ' + (cy + 7) + 'L' + (cx - 7) + ' ' + cy + 'Z', fill: 'var(--surface)', stroke: 'var(--ink-2)', 'stroke-width': 2 }, s);
      bindTip(dmd, function () { return '<b>Composite, 64 ch</b><br>ρ = ' + fx(ws.composite_rho_ch64, 2) + ' (measured at 64 channels only)'; });
      svg('text', { x: cx + 12, y: cy + 4, class: 'lbl' }, s).textContent = (ws.composite_rho_ch64 < 0.75 ? '↓ ' : '') + 'Composite ' + fx(ws.composite_rho_ch64, 2) + (narrow ? '' : ' (below axis)');
      describe(box, 'ρ against width. DASH: ' + ws.dash.map(fx2).join(', ') + '. Scratch: ' + ws.scratch.map(fx2).join(', ') + ' at ' + ws.channels.join(', ') + ' channels. Composite at 64 channels: ' + fx2(ws.composite_rho_ch64) + '.');
    });
  }

  /* ---------------- Null-space explorer ---------------- */
  function initExplorer(D, I) {
    var s = $('#ex-svg'), fIn = $('#ex-f'), wIn = $('#ex-w'), holder = s.parentNode;
    var nl = I.nl, wPaper = D.null_line.w;
    var fs = nl.map(function (r) { return r.f_toward_collapse; });
    var fmin = Math.min.apply(null, fs), fmax = Math.max.apply(null, fs);
    var X0 = -0.8, X1 = 6.6, Y0 = -0.8, Y1 = 5.6;
    var x, y, W, H, M, narrow, dyn = {};

    // f strip under the slider: measured composite drifts, plus DASH's 1 - rho for reference.
    var strip = $('#ex-fstrip');
    nl.forEach(function (r) { strip.appendChild(h('span', { class: 'fstrip__tick', style: 'left:' + (r.f_toward_collapse * 100) + '%', title: r.dataset + ': f = ' + fx(r.f_toward_collapse, 2) })); });
    var grp = h('span', { class: 'fstrip__tick fstrip__grp', style: 'left:' + ((fmin + fmax) / 2 * 100) + '%;top:10px' }, 'composite ' + fx(fmin, 2) + '–' + fx(fmax, 2));
    strip.appendChild(grp);
    strip.appendChild(h('span', { class: 'fstrip__tick fstrip__tick--dash', style: 'left:' + (I.derived.dash_1mrho * 100) + '%' }, 'DASH 1−ρ'));

    function draw(width) {
      W = width; narrow = W < 480;
      H = Math.round(Math.max(300, Math.min(440, W * 0.82)));
      M = { l: 44, r: 12, t: 14, b: 46 };
      x = lin(X0, X1, M.l, W - M.r); y = lin(Y0, Y1, H - M.b, M.t);
      s.setAttribute('viewBox', '0 0 ' + W + ' ' + H); s.setAttribute('width', W); s.setAttribute('height', H);
      $$(':scope > :not(title):not(desc)', s).forEach(function (n) { n.remove(); });
      var g = svg('g', { class: 'ax' }, s);
      for (var v = 0; v <= 6; v++) {
        svg('line', { x1: x(v), x2: x(v), y1: M.t, y2: H - M.b, class: 'gridline' }, g);
        svg('text', { x: x(v), y: H - M.b + 16, 'text-anchor': 'middle' }, g).textContent = v;
      }
      for (var u = 0; u <= 5; u++) {
        svg('line', { x1: M.l, x2: W - M.r, y1: y(u), y2: y(u), class: 'gridline' }, g);
        svg('text', { x: M.l - 8, y: y(u) + 4, 'text-anchor': 'end' }, g).textContent = u;
      }
      svg('line', { x1: x(0), x2: x(0), y1: M.t, y2: H - M.b, stroke: 'var(--line-2)', 'stroke-width': 1.5 }, s);
      svg('line', { x1: M.l, x2: W - M.r, y1: y(0), y2: y(0), stroke: 'var(--line-2)', 'stroke-width': 1.5 }, s);
      svg('text', { x: W - M.r, y: H - 8, 'text-anchor': 'end', class: 'axis-title' }, s).textContent = narrow ? 'δ∅ (units of ‖Δ_T‖)' : 'δ∅ along Δ_T  (unconditional residual, units of ‖Δ_T‖)';
      svg('text', { x: 12, y: M.t + 4, class: 'axis-title', transform: 'rotate(-90 12 ' + (M.t + 4) + ')', 'text-anchor': 'end' }, s).textContent = narrow ? 'δʸ' : 'δʸ  (conditional residual)';
      var edefs = svg('defs', {}, s);
      var eg = svg('linearGradient', { id: 'ex-grad', x1: 0, y1: 1, x2: 1, y2: 0 }, edefs);
      [[0, 'var(--cond)'], [.5, 'var(--gap)'], [1, 'var(--uncond)']].forEach(function (st) { svg('stop', { offset: st[0], style: 'stop-color:' + st[1] }, eg); });
      dyn.band = svg('line', { stroke: 'url(#ex-grad)', 'stroke-opacity': .16, 'stroke-width': 18, 'stroke-linecap': 'round' }, s);
      dyn.line = svg('line', { stroke: 'url(#ex-grad)', 'stroke-width': 3 }, s);
      dyn.lineLbl = svg('text', { class: 'lbl lbl--ink', 'text-anchor': 'end' }, s);
      dyn.seg = svg('line', { stroke: 'var(--uncond)', 'stroke-width': 3, 'stroke-linecap': 'round' }, s);
      svg('circle', { cx: x(0), cy: y(0), r: 8, fill: 'var(--surface)', stroke: 'var(--cond)', 'stroke-width': 3 }, s);
      svg('text', { x: x(0) + 12, y: y(0) + 20, class: 'lbl lbl--ink' }, s).textContent = narrow ? 'ideal (DASH target)' : 'ideal recovery (DASH target)';
      dyn.col = svg('circle', { r: 9, fill: 'none', stroke: 'var(--uncond)', 'stroke-width': 2.5, 'stroke-dasharray': '3 3' }, s);
      dyn.colLbl = svg('text', { class: 'lbl lbl--ink' }, s);
      dyn.meas = svg('g', {}, s);
      dyn.measLbl = svg('text', { class: 'lbl' }, s);
      dyn.pt = svg('circle', { r: 8, fill: 'var(--uncond)', stroke: 'var(--surface)', 'stroke-width': 2.5 }, s);
      update();
    }

    function update() {
      var f = Number(fIn.value), w = Number(wIn.value);
      var slope = (w - 1) / w;
      var x1 = Math.min(X1, Y1 / slope);
      ['line', 'band'].forEach(function (k) {
        dyn[k].setAttribute('x1', x(X0)); dyn[k].setAttribute('y1', y(X0 * slope));
        dyn[k].setAttribute('x2', x(x1)); dyn[k].setAttribute('y2', y(x1 * slope));
      });
      dyn.lineLbl.setAttribute('x', x(x1) - 18); dyn.lineLbl.setAttribute('y', y(x1 * slope) + 4);
      dyn.lineLbl.textContent = 'composite loss = 0';
      dyn.col.setAttribute('cx', x(w)); dyn.col.setAttribute('cy', y(w - 1));
      // Right of the point (below the line) when there is room; otherwise above-left, which is also clear of the line.
      var colRight = x(w) + 14 + 110 < W;
      dyn.colLbl.setAttribute('x', colRight ? x(w) + 14 : x(w) - 14); dyn.colLbl.setAttribute('y', colRight ? y(w - 1) + 20 : y(w - 1) - 14);
      dyn.colLbl.setAttribute('text-anchor', colRight ? 'start' : 'end');
      dyn.colLbl.textContent = 'collapse (Δ_S = 0)';
      var px = f * w, py = f * (w - 1);
      dyn.pt.setAttribute('cx', x(px)); dyn.pt.setAttribute('cy', y(py));
      dyn.seg.setAttribute('x1', x(0)); dyn.seg.setAttribute('y1', y(0)); dyn.seg.setAttribute('x2', x(px)); dyn.seg.setAttribute('y2', y(py));
      dyn.meas.innerHTML = '';
      if (Math.abs(w - wPaper) < 1e-9) {
        nl.forEach(function (r) {
          svg('circle', { cx: x(r.f_toward_collapse * w), cy: y(r.f_toward_collapse * (w - 1)), r: 4.5, fill: 'var(--surface)', stroke: 'var(--ink-2)', 'stroke-width': 1.8 }, dyn.meas);
        });
        dyn.measLbl.setAttribute('x', narrow ? W - M.r : x(fmax * w) + 8); dyn.measLbl.setAttribute('y', y(fmax * (w - 1)) + 30);
        dyn.measLbl.setAttribute('text-anchor', narrow ? 'end' : 'start');
        dyn.measLbl.textContent = 'measured composite, f = ' + fx(fmin, 2) + '–' + fx(fmax, 2);
      } else {
        dyn.measLbl.setAttribute('x', x(0.2)); dyn.measLbl.setAttribute('y', y(5.2)); dyn.measLbl.setAttribute('text-anchor', 'start');
        dyn.measLbl.textContent = 'measured students shown at w = ' + fx(wPaper, 1);
      }
      $('#ex-f-out').textContent = f.toFixed(2);
      $('#ex-w-out').textContent = w.toFixed(1);
      $('#ro-ratio').textContent = slope.toFixed(2);
      $('#ro-rho').textContent = (1 - f).toFixed(2);
      $('#ro-gap').style.width = ((1 - f) * 100) + '%';
      subify(s);
      fIn.setAttribute('aria-valuetext', 'f ' + f.toFixed(2) + ', rho ' + (1 - f).toFixed(2));
      wIn.setAttribute('aria-valuetext', 'w ' + w.toFixed(1) + ', residual ratio ' + slope.toFixed(2));
    }
    fIn.addEventListener('input', update);
    wIn.addEventListener('input', update);
    responsive(holder, function (w) { draw(w - 24); });
  }

  /* ---------------- TAG curve ---------------- */
  function initTag(D) {
    var box = $('#tag-chart'), p = D.tag;
    var wt = function (t) { return p.w_min + (p.w_max - p.w_min) * sigmoid(p.kappa * (0.5 - t / p.T)); };
    $('#tag-range').textContent = wt(p.T).toFixed(2) + ' to ' + wt(0).toFixed(2);
    responsive(box, function (W) {
      box.innerHTML = '';
      var H = 280, M = { l: 40, r: 10, t: 26, b: 46 };
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'TAG guidance weight w(t) falls from ' + wt(0).toFixed(2) + ' at t = 0 to ' + wt(p.T).toFixed(2) + ' at t = ' + p.T + '.' }, box);
      var x = lin(0, p.T, M.l, W - M.r), y = lin(0.6, 4.4, H - M.b, M.t);
      var g = svg('g', { class: 'ax' }, s);
      [1, 2, 3, 4].forEach(function (v) {
        svg('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
        svg('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v.toFixed(1);
      });
      [0, 250, 500, 750, 1000].forEach(function (v) {
        svg('text', { x: x(v), y: H - M.b + 16, 'text-anchor': 'middle' }, g).textContent = v;
      });
      svg('text', { x: (M.l + W - M.r) / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis-title' }, s).textContent = W < 400 ? 'Timestep t (T = high noise)' : 'Timestep t  (0 = low noise, T = high noise)';
      svg('text', { x: 0, y: 12, class: 'axis-title' }, s).textContent = 'Guidance weight w(t)';
      [p.w_min, p.w_max].forEach(function (v) {
        svg('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), stroke: 'var(--muted)', 'stroke-dasharray': '3 4', 'stroke-width': 1 }, s);
      });
      svg('text', { x: W - M.r, y: y(p.w_max) - 6, 'text-anchor': 'end', class: 'lbl' }, s).textContent = 'nominal w_max = ' + p.w_max.toFixed(1);
      svg('text', { x: W - M.r, y: y(p.w_min) + 16, 'text-anchor': 'end', class: 'lbl' }, s).textContent = 'nominal w_min = ' + p.w_min.toFixed(1);
      var d = '';
      for (var t = 0; t <= p.T; t += 10) d += (t ? 'L' : 'M') + x(t).toFixed(1) + ' ' + y(wt(t)).toFixed(1);
      var tdefs = svg('defs', {}, s);
      var tfill = lgrad(tdefs, 0, y(4), 0, y(0.6), [[0, 'var(--gap)', .28], [1, 'var(--cond)', .02]]);
      svg('path', { d: d + 'L' + x(p.T) + ' ' + y(0.6) + 'L' + x(0) + ' ' + y(0.6) + 'Z', style: 'fill:' + tfill, stroke: 'none' }, s);
      svg('path', { d: d, fill: 'none', stroke: 'var(--gap)', 'stroke-width': 2.5 }, s);
      [[0, 'start'], [p.T, 'end']].forEach(function (e) {
        svg('circle', { cx: x(e[0]), cy: y(wt(e[0])), r: 5, fill: 'var(--gap)', stroke: 'var(--surface)', 'stroke-width': 2 }, s);
        svg('text', { x: x(e[0]) + (e[1] === 'start' ? 8 : -8), y: y(wt(e[0])) + (e[1] === 'start' ? 18 : -10), 'text-anchor': e[1], class: 'lbl lbl--ink' }, s).textContent = 'w = ' + wt(e[0]).toFixed(2);
      });
      subify(s);
      var cross = svg('line', { y1: M.t, y2: H - M.b, stroke: 'var(--ink-2)', 'stroke-width': 1, opacity: 0 }, s);
      var dot = svg('circle', { r: 5, fill: 'var(--surface)', stroke: 'var(--gap)', 'stroke-width': 2.5, opacity: 0 }, s);
      var hit = svg('rect', { x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b, fill: 'transparent' }, s);
      hit.addEventListener('pointermove', function (e) {
        var r = s.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width * W;
        var tt = Math.max(0, Math.min(p.T, Math.round((px - M.l) / (W - M.l - M.r) * p.T)));
        cross.setAttribute('x1', x(tt)); cross.setAttribute('x2', x(tt)); cross.setAttribute('opacity', .5);
        dot.setAttribute('cx', x(tt)); dot.setAttribute('cy', y(wt(tt))); dot.setAttribute('opacity', 1);
        showTip('t = ' + tt + '<br>w(t) = <b>' + wt(tt).toFixed(2) + '</b>', e.clientX, e.clientY);
      });
      hit.addEventListener('pointerleave', function () { cross.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); hideTip(); });
    });
  }

  /* ---------------- KaTeX (deferred) ---------------- */
  // Display equations (.eq) and inline math (.tm) keep a readable fallback until KaTeX arrives.
  // KaTeX loads after the page has loaded, and each formula renders only as it approaches the viewport.
  function initMath() {
    var eqs = $$('.eq[data-tex]'), all = $$('.eq[data-tex], .tm[data-tex]');
    eqs.forEach(function (e) { e.textContent = e.getAttribute('data-tex'); });
    var pending = [], scheduled = false;
    function flush() {
      scheduled = false;
      var batch = pending.splice(0);
      batch.forEach(function (e) {
        try { window.katex.render(e.getAttribute('data-tex'), e, { displayMode: e.classList.contains('eq'), throwOnError: false }); e.classList.add('is-rendered'); } catch (err) { /* keep fallback */ }
      });
      requestAnimationFrame(focusOverflowing);
    }
    function queue(e) { pending.push(e); if (!scheduled) { scheduled = true; requestAnimationFrame(flush); } }
    // Equations that scroll sideways on narrow screens must be reachable by keyboard. Read all, then write all.
    function focusOverflowing() {
      var over = eqs.map(function (e) { return e.scrollWidth > e.clientWidth + 1; });
      eqs.forEach(function (e, i) {
        if (over[i]) { e.setAttribute('tabindex', '0'); e.setAttribute('role', 'group'); e.setAttribute('aria-label', 'Equation' + (e.getAttribute('data-tag') ? ' ' + e.getAttribute('data-tag') : '')); }
        else { e.removeAttribute('tabindex'); e.removeAttribute('role'); e.removeAttribute('aria-label'); }
      });
    }
    function start() {
      if (!('IntersectionObserver' in window)) { all.forEach(queue); return; }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); queue(en.target); } });
      }, { rootMargin: '500px 0px' });
      all.forEach(function (e) { io.observe(e); });
      var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(focusOverflowing, 200); });
    }
    function load() {
      document.head.appendChild(h('link', { rel: 'stylesheet', href: 'assets/vendor/katex/katex.min.css' }));
      var sc = h('script', { src: 'assets/vendor/katex/katex.min.js' });
      sc.onload = start;
      document.head.appendChild(sc);
    }
    function soon() { (window.requestIdleCallback || function (f) { setTimeout(f, 300); })(load, { timeout: 2000 }); }
    if (document.readyState === 'complete') soon(); else window.addEventListener('load', soon);
  }

  /* ---------------- Sample comparison ---------------- */
  function initCompare(D, I) {
    var teacher = I.t1by('DASH-Teacher'), dash = I.t1by('DASH (ours)');
    var t2t = I.t2.filter(function (r) { return /^Teacher/.test(r.model); })[0], t2d = I.t2.filter(function (r) { return /^DASH/.test(r.model); })[0];
    var H = D.headline;
    var SETS = {
      c10: { name: 'CIFAR-10', fig: 'Figure 3', labels: ['Plane', 'Car', 'Bird', 'Cat', 'Deer', 'Dog', 'Frog', 'Horse', 'Ship', 'Truck'],
        cap: 'Figure 3 (main paper). CIFAR-10, 5×10 grids, matched seeds. Teacher ' + H.teacher_params + ', FID ' + fx(teacher.c10_fid, 2) + '; DASH student ' + H.student_params + ', FID ' + fx(dash.c10_fid, 2) + '.' },
      c100: { name: 'CIFAR-100', fig: 'Supp. Figure E6', labels: ['Bed', 'Bicycle', 'Bottle', 'Dinosaur', 'Sunflower', 'Tiger', 'Elephant', 'Castle', 'Butterfly', 'Crab'],
        cap: 'Supp. Figure E6. CIFAR-100, matched seeds. Teacher ' + H.teacher_params + ', FID ' + fx(teacher.c100_fid, 2) + '; DASH student ' + H.student_params + ', FID ' + fx(dash.c100_fid, 2) + '.' },
      in64: { name: 'ImageNet-64', fig: 'Supp. Figure E7', labels: ['Aeroplane', 'Bird', 'Ambulance', 'Bedroom', 'Dog', 'Orange', 'Sports Car', 'Tiger', 'Turtle', 'Van'],
        cap: 'Supp. Figure E7. ImageNet-64, matched seeds. Teacher ' + H.in64_teacher_params + ', FID ' + fx(t2t.fid, 2) + '; DASH student ' + H.in64_student_params + ', FID ' + fx(t2d.fid, 2) + '.' }
    };
    var stage = $('#cmp-stage'), range = $('#cmp-range'), cur = 'c10';
    function srcset(stem, ext) { return 'assets/img/' + stem + '-1290.' + ext + ' 1290w, assets/img/' + stem + '.' + ext + ' 2580w'; }
    var SIZES = '(max-width: 1100px) 100vw, 1060px';
    function setImg(side, stem, alt) {
      $('#cmp-' + side + '-avif').setAttribute('srcset', srcset(stem, 'avif'));
      $('#cmp-' + side + '-webp').setAttribute('srcset', srcset(stem, 'webp'));
      $('#cmp-' + side + '-avif').setAttribute('sizes', SIZES);
      $('#cmp-' + side + '-webp').setAttribute('sizes', SIZES);
      var img = $('#cmp-' + side);
      img.setAttribute('sizes', SIZES);
      img.setAttribute('srcset', srcset(stem, 'png'));
      img.src = 'assets/img/' + stem + '-1290.png';
      img.alt = alt;
    }
    function show(k) {
      cur = k;
      var S = SETS[k];
      setImg('a', k + '-teacher', S.name + ' teacher samples, 5 rows by 10 classes: ' + S.labels.join(', ') + '.');
      setImg('b', k + '-student', S.name + ' DASH student samples on the same seeds and classes.');
      $('#cmp-labels').innerHTML = S.labels.map(function (l) { return '<li>' + l + '</li>'; }).join('');
      $('#cmp-cap').textContent = S.cap + ' Left of the divider: DASH student. Right: teacher.';
      $$('[data-cmp]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-cmp') === k)); });
    }
    function setPos(v) { stage.style.setProperty('--pos', v + '%'); range.setAttribute('aria-valuetext', v + '% student'); }
    range.addEventListener('input', function () { setPos(range.value); });
    $$('[data-cmp]').forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-cmp')); }); });
    setPos(50);
    show('c10');

    var dlg = $('#lightbox');
    $('#cmp-open').addEventListener('click', function () {
      var S = SETS[cur];
      $('#lb-title').textContent = S.fig + ': ' + S.name;
      function fig(stem, label) {
        return '<figure><picture><source type="image/avif" srcset="assets/img/' + stem + '.avif"><source type="image/webp" srcset="assets/img/' + stem + '.webp">' +
          '<img src="assets/img/' + stem + '.png" width="2580" height="1290" alt="' + label + ' samples, ' + S.name + ', columns ' + S.labels.join(', ') + '."></picture>' +
          '<figcaption class="cap">' + label + '</figcaption></figure>';
      }
      $('#lb-body').innerHTML = fig(cur + '-teacher', 'Teacher') + fig(cur + '-student', 'DASH student') + '<p class="cap">' + S.cap + '</p>';
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    });
    $('#lb-close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  /* ---------------- Ablation explorer ---------------- */
  function initAblation(D, I) {
    var W = D.table3_ablation.weighting;
    var state = { L_im: true, L_un: true, L_an: true, wt: 'transfer' };
    var dash = I.t3by('DASH (ours)');
    var table = $('#t3');
    var TERMS = { L_im: 'L<sub>im</sub>', L_un: 'L<sub>un</sub>', L_an: 'L<sub>an</sub>' };
    function label(n) { return n.replace(/L_(im|un|an)/g, function (_, t) { return 'L<sub>' + t + '</sub>'; }); }

    function match() {
      var all = !state.L_im && !state.L_un && !state.L_an;
      if (all) return { row: I.t3by('Scratch'), msg: 'Scratch is the teacher-free reference: no distillation terms, trained under fixed Min-SNR weighting regardless of the weighting selected here.' };
      var hit = I.t3.filter(function (r) {
        return r.config !== 'Scratch' && r.L_im === state.L_im && r.L_un === state.L_un && r.L_an === state.L_an && W[r.config] === state.wt;
      })[0];
      if (hit) return { row: hit, msg: '' };
      return { row: null, msg: 'This combination was not run in the paper, so there is no result to show. Table 3 removes one term at a time with TIRT Transfer, and varies the weighting only for the full objective.' };
    }
    var bars = [
      { k: 'c10_fid', lbl: 'FID, CIFAR-10', max: 30, d: 2, grp: 'Sample quality (lower is better)' },
      { k: 'c100_fid', lbl: 'FID, CIFAR-100', max: 30, d: 2 },
      { k: 'rho_c10', lbl: 'ρ, CIFAR-10', max: 1, d: 2, grp: 'Gap magnitude (teacher = 1)' },
      { k: 'rho_c100', lbl: 'ρ, CIFAR-100', max: 1, d: 2 }
    ];
    var box = $('#abl-bars');
    box.innerHTML = bars.map(function (b) {
      return (b.grp ? '<p class="bar__group">' + b.grp + '</p>' : '') +
        '<div class="bar"><span class="bar__lbl">' + b.lbl + '</span><span class="bar__track"><span class="bar__fill" data-bar="' + b.k + '" style="width:0;background:var(--gap)"></span>' +
        '<span class="bar__ref" style="left:' + (dash[b.k] / b.max * 100) + '%" title="DASH (ours)"></span></span><span class="bar__val" data-val="' + b.k + '">—</span></div>';
    }).join('') + '<p class="small muted" style="margin:2px 0 0">The tick on each bar marks the full DASH model.</p>';

    function render() {
      var m = match();
      $$('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(state[c.getAttribute('data-term')])); });
      $('#abl-name').innerHTML = m.row ? label(m.row.config) : 'Not reported';
      $('#abl-msg').textContent = m.msg;
      bars.forEach(function (b) {
        var fill = $('[data-bar="' + b.k + '"]', box), out = $('[data-val="' + b.k + '"]', box);
        if (m.row) { fill.style.width = Math.min(100, m.row[b.k] / b.max * 100) + '%'; out.textContent = fx(m.row[b.k], b.d); }
        else { fill.style.width = '0'; out.textContent = '—'; }
      });
      $$('tbody tr', table).forEach(function (tr) { tr.classList.toggle('is-sel', !!m.row && tr.getAttribute('data-config') === m.row.config); });
    }
    $$('.chip').forEach(function (c) {
      c.addEventListener('click', function () { var t = c.getAttribute('data-term'); state[t] = !state[t]; render(); });
    });
    $$('input[name="wt"]').forEach(function (r) { r.addEventListener('change', function () { state.wt = r.value; render(); }); });

    var cols = '<thead><tr><th scope="col">Configuration</th><th scope="col">L<sub>im</sub></th><th scope="col">L<sub>un</sub></th><th scope="col">L<sub>an</sub></th>' +
      '<th scope="col">C10 FID ↓</th><th scope="col">C10 IS ↑</th><th scope="col">C100 FID ↓</th><th scope="col">C100 IS ↑</th><th scope="col">ρ <span class="dim">C10 / C100</span></th><th scope="col">cos(Δ) <span class="dim">C10 / C100</span></th><th scope="col">MSE<sub>Δ</sub> <span class="dim">C10 / C100</span></th></tr></thead>';
    function sd3(r, k) {
      if (!$('#t3-std').checked) return '';
      var sd = I.sd3.filter(function (x) { return x.config === r.config; })[0];
      return sd ? '<span class="std">±' + fx(sd[k], 2) + '</span>' : '';
    }
    function body3() { return I.t3.map(function (r) {
      var ck = function (b) { return r.config === 'Scratch' ? '<span class="x">–</span>' : b ? '<span class="ck" aria-label="used">✓</span>' : '<span class="x" aria-label="removed">✗</span>'; };
      return '<tr data-config="' + r.config + '" class="' + (r.config === 'DASH (ours)' ? 'is-ours' : '') + '"><th scope="row" style="text-align:left;font-weight:inherit">' + label(r.config) + '</th>' +
        '<td>' + ck(r.L_im) + '</td><td>' + ck(r.L_un) + '</td><td>' + ck(r.L_an) + '</td>' +
        '<td>' + fx(r.c10_fid, 2) + sd3(r, 'c10_fid') + '</td><td>' + fx(r.c10_is, 2) + sd3(r, 'c10_is') + '</td><td>' + fx(r.c100_fid, 2) + sd3(r, 'c100_fid') + '</td><td>' + fx(r.c100_is, 2) + sd3(r, 'c100_is') + '</td>' +
        '<td>' + fx(r.rho_c10, 2) + ' / ' + fx(r.rho_c100, 2) + '</td><td>' + fx(r.cos_c10, 2) + ' / ' + fx(r.cos_c100, 2) + '</td><td>' + fx(r.mse_c10, 3) + ' / ' + fx(r.mse_c100, 3) + '</td></tr>';
    }).join(''); }
    function build3() { table.innerHTML = '<caption class="sr-only">Table 3, component ablation on the 6.1M student</caption>' + cols + '<tbody>' + body3() + '</tbody>'; render(); }
    $('#t3-std').addEventListener('change', build3);
    build3();
  }


  /* ---------------- From the supplementary ---------------- */
  // A small line chart used by the step-count and guidance-scale panels.
  function lineChart(box, cfg) {
    responsive(box, function (W) {
      box.innerHTML = '';
      var narrow = W < 520, H = cfg.height || 300, M = { l: 50, r: narrow ? 74 : 96, t: 22, b: 46 };
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'group' }, box);
      var defs = svg('defs', {}, s);
      var x = cfg.xScale(M.l, W - M.r), y = lin(cfg.yMin, cfg.yMax, H - M.b, M.t);
      var g = svg('g', { class: 'ax' }, s);
      cfg.yTicks.forEach(function (v) {
        svg('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'gridline' }, g);
        svg('text', { x: M.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, g).textContent = v;
      });
      cfg.xs.forEach(function (v) { svg('text', { x: x(v), y: H - M.b + 18, 'text-anchor': 'middle' }, g).textContent = cfg.xLabel(v); });
      svg('text', { x: (M.l + W - M.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title' }, s).textContent = cfg.xTitle;
      svg('text', { x: 14, y: (M.t + H - M.b) / 2, 'text-anchor': 'middle', class: 'axis-title', transform: 'rotate(-90 14 ' + (M.t + H - M.b) / 2 + ')' }, s).textContent = cfg.yTitle;
      if (cfg.mark !== undefined) {
        svg('rect', { x: x(cfg.mark) - 14, y: M.t, width: 28, height: H - M.t - M.b, rx: 6, fill: 'var(--hl-2)' }, s);
        svg('text', { x: x(cfg.mark), y: M.t - 6, 'text-anchor': 'middle', class: 'lbl lbl--ink' }, s).textContent = cfg.markLabel;
      }
      cfg.series.forEach(function (se) {
        var d = se.ys.map(function (v, i) { return (i ? 'L' : 'M') + x(cfg.xs[i]) + ' ' + y(v); }).join(' ');
        if (se.fill) {
          var f = lgrad(defs, 0, y(cfg.yMin), 0, y(cfg.yMax), [[0, se.color, 0], [1, se.color, .22]]);
          svg('path', { d: d + 'L' + x(cfg.xs[cfg.xs.length - 1]) + ' ' + y(cfg.yMin) + 'L' + x(cfg.xs[0]) + ' ' + y(cfg.yMin) + 'Z', style: 'fill:' + f }, s);
        }
        svg('path', { d: d, fill: 'none', stroke: se.color, 'stroke-width': 2.5, 'stroke-dasharray': se.dash || null, 'stroke-linejoin': 'round' }, s);
        se.ys.forEach(function (v, i) {
          var c = svg('circle', { cx: x(cfg.xs[i]), cy: y(v), r: 5.5, fill: se.color, stroke: 'var(--surface)', 'stroke-width': 2 }, s);
          bindTip(c, function () { return '<b>' + se.name + '</b><br>' + cfg.xLabel(cfg.xs[i]) + ': FID ' + fx(v, 2); });
          if (se.labels) svg('text', { x: x(cfg.xs[i]), y: y(v) + (se.below ? 18 : -10), 'text-anchor': 'middle', class: 'lbl lbl--ink2' }, s).textContent = fx(v, 2);
        });
        var last = se.ys.length - 1;
        svg('text', { x: x(cfg.xs[last]) + 12, y: y(se.ys[last]) + 4, class: 'lbl lbl--ink' }, s).textContent = se.name;
      });
      describe(box, cfg.describe());
    });
  }

  function initSteps(D) {
    var S = D.step_count, ds = 'c10', box = $('#steps-chart');
    var NAMES = { c10: 'CIFAR-10', c100: 'CIFAR-100', in64: 'ImageNet-64' };
    var cfg = {
      xs: S.steps, height: 300,
      xScale: function (a, b) { var idx = function (v) { return S.steps.indexOf(v); }; return function (v) { return a + idx(v) * (b - a) / (S.steps.length - 1); }; },
      xLabel: function (v) { return v + ' steps'; }, xTitle: 'DDIM sampling steps (trained at 50)', yTitle: 'FID ↓',
      yMin: 3, yMax: 17, yTicks: [3, 7, 11, 15], series: [],
      describe: function () { return NAMES[ds] + ' FID at ' + S.steps.join(', ') + ' steps. Teacher: ' + S[ds].teacher.join(', ') + '. DASH: ' + S[ds].dash.join(', ') + '.'; }
    };
    function update() {
      cfg.series = [
        { name: 'Teacher', ys: S[ds].teacher, color: 'var(--muted)', dash: '6 5', labels: true, below: true },
        { name: 'DASH', ys: S[ds].dash, color: 'var(--gap)', labels: true, fill: true }
      ];
      box.innerHTML = '';
      lineChart(box, cfg);
      $('#steps-grid').innerHTML = S.steps.map(function (st, i) {
        var stem = 'assets/img/e8-' + ds + '-' + st;
        return '<figure><picture><source type="image/avif" srcset="' + stem + '.avif"><source type="image/webp" srcset="' + stem + '.webp">' +
          '<img src="' + stem + '.png" width="532" height="532" loading="lazy" decoding="async" alt="DASH student samples on ' + NAMES[ds] + ' at ' + st + ' DDIM steps"></picture>' +
          '<figcaption><b>' + st + ' steps</b> · FID ' + fx(S[ds].dash[i], 2) + '</figcaption></figure>';
      }).join('');
      $$('[data-steps]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-steps') === ds)); });
    }
    $$('[data-steps]').forEach(function (b) { b.addEventListener('click', function () { ds = b.getAttribute('data-steps'); update(); }); });
    update();
  }

  function initSweep(D) {
    var G = D.guidance_sweep;
    lineChart($('#sweep-chart'), {
      xs: G.w_max, height: 300,
      xScale: function (a, b) { return lin(G.w_max[0], G.w_max[G.w_max.length - 1], a, b); },
      xLabel: function (v) { return v.toFixed(1); }, xTitle: 'TAG maximum guidance weight w_max (w_min = 1.0)', yTitle: 'FID ↓ (CIFAR-10)',
      yMin: 4, yMax: 15, yTicks: [5, 7, 9, 11, 13, 15], mark: 4.0, markLabel: 'paper setting',
      series: [
        { name: 'Teacher', ys: G.teacher, color: 'var(--muted)', dash: '6 5' },
        { name: 'DASH', ys: G.dash, color: 'var(--gap)', fill: true }
      ],
      describe: function () { return 'FID against w_max ' + G.w_max.join(', ') + '. Teacher: ' + G.teacher.join(', ') + '. DASH: ' + G.dash.join(', ') + '.'; }
    });
    var tMin = Math.min.apply(null, G.teacher), dMin = Math.min.apply(null, G.dash);
    $('#sweep-cap').innerHTML = 'FID on CIFAR-10 as the TAG maximum weight varies; neither model is trained at a fixed guidance weight. Both curves bottom out at w<sub>max</sub> = ' +
      fx(G.w_max[G.dash.indexOf(dMin)], 1) + ' (teacher ' + fx(tMin, 2) + ', DASH ' + fx(dMin, 2) + '), the setting used throughout the paper. ' + G.note.replace(/w_max/g, 'w<sub>max</sub>');
    subify($('#sweep-chart'));
  }

  function initSuppTables(D) {
    var F = rowsToObjects(D.fixed_vs_tag);
    $('#t-fixed').innerHTML = '<caption class="sr-only">Fixed guidance weight against the TAG schedule, CIFAR-10 FID</caption><thead><tr><th scope="col">Model</th><th scope="col">Fixed w = 4.0</th><th scope="col">TAG w<sub>max</sub> = 4.0</th><th scope="col">Cost of fixed w</th></tr></thead><tbody>' +
      F.map(function (r) {
        return '<tr class="' + (/^DASH/.test(r.model) ? 'is-ours' : '') + '"><th scope="row" style="text-align:left;font-weight:inherit">' + r.model.replace('L_un', 'L<sub>un</sub>') + '</th><td>' + fx(r.fixed_w4, 2) + '</td><td>' + fx(r.tag_wmax4, 2) + '</td><td>+' + fx(r.fixed_w4 - r.tag_wmax4, 2) + '</td></tr>';
      }).join('') + '</tbody>';
    var Mn = rowsToObjects(D.minsnr_teacher);
    $('#t-minsnr').innerHTML = '<caption class="sr-only">Standard Min-SNR teacher comparison, CIFAR-10</caption><thead><tr><th scope="col">Model</th><th scope="col">Params</th><th scope="col">FID ↓</th><th scope="col">IS ↑</th><th scope="col">ρ</th><th scope="col">cos(Δ)</th><th scope="col">MSE<sub>Δ</sub></th></tr></thead><tbody>' +
      Mn.map(function (r) {
        return '<tr class="' + (/^DASH/.test(r.model) ? 'is-ours' : '') + '"><th scope="row" style="text-align:left;font-weight:inherit">' + r.model + '</th><td>' + r.params + '</td><td>' + fx(r.fid, 2) + '</td><td>' + fx(r.is, 2) + '</td><td>' + fx(r.rho, 2) + '</td><td>' + fx(r.cos, 2) + '</td><td>' + fx(r.mse, 3) + '</td></tr>';
      }).join('') + '</tbody>';
    var T = rowsToObjects(D.teacher_ablation), last = null;
    $('#t-teach').innerHTML = '<caption class="sr-only">Teacher component ablation</caption><thead><tr><th scope="col">Method</th><th scope="col">Params</th><th scope="col">Steps</th><th scope="col">C10 FID ↓</th><th scope="col">C10 IS ↑</th><th scope="col">C100 FID ↓</th><th scope="col">C100 IS ↑</th></tr></thead><tbody>' +
      T.map(function (r) {
        var head = '';
        if (r.group !== last) head = '<tr class="grp"><td colspan="7">' + (r.group === 'published' ? 'Published models, for scale only (not controlled comparisons)' : 'DASH teacher, same architecture and budget') + '</td></tr>';
        last = r.group;
        return head + '<tr class="' + (/^Full/.test(r.method) ? 'is-ours' : '') + '"><th scope="row" style="text-align:left;font-weight:inherit">' + r.method + '</th><td>' + r.params + '</td><td>' + r.steps + '</td><td>' + fx(r.c10_fid, 2) + '</td><td>' + fx(r.c10_is, 2) + '</td><td>' + fx(r.c100_fid, 2) + '</td><td>' + fx(r.c100_is, 2) + '</td></tr>';
      }).join('') + '</tbody>';
    $('#teach-cap').textContent = 'Starting from a Min-SNR teacher, TAG (the inference-time guidance schedule) and TIRT (the learned timestep weighting) each improve FID, and together they give the teacher used throughout. † fixed w = 1.5; ‡ fixed w = 4.0. Published rows use their own architectures, sampling budgets and evaluation code, so they are shown for scale only.';
  }

  /* ---------------- Efficiency ---------------- */
  function initEfficiency(D) {
    var E = D.efficiency_t4_bs64;
    var names = ['Teacher', 'DASH student', 'Single-head'];
    function rows(obj, unit, d) {
      var max = Math.max.apply(null, names.map(function (n) { return obj[n]; }));
      return '<div class="eff__rows">' + names.map(function (n) {
        var cls = n === 'Teacher' ? 't' : n === 'Single-head' ? 's' : '';
        return '<div class="eff__row"><span>' + n + '</span><span><span class="eff__bar"><span class="' + cls + '" style="width:' + (obj[n] / max * 100) + '%"></span></span><span class="eff__num">' + fx(obj[n], d) + ' ' + unit + '</span></span></div>';
      }).join('') + '</div>';
    }
    var cards = [
      { k: 'FLOPs, 50 sampling steps', v: fx(E.flops_reduction, 2) + '× fewer', body: rows(E.flops_50step_g, 'GFLOPs', 1) },
      { k: 'Throughput (samples / s)', v: fx(E.throughput_gain, 2) + '× higher', body: rows(E.samples_per_sec, '/s', 2) },
      { k: 'Latency, batch 64', v: fx(E.latency_ms['DASH student'], 1) + ' ms', body: rows(E.latency_ms, 'ms', 1) },
      { k: 'Peak memory, batch 64', v: fx(E.peak_memory_mb['DASH student'], 1) + ' MB', body: rows(E.peak_memory_mb, 'MB', 1) }
    ];
    $('#eff').innerHTML = cards.map(function (c) {
      return '<article class="eff reveal is-in"><p class="eff__k">' + c.k + '</p><p class="eff__v">' + c.v + '</p>' + c.body + '</article>';
    }).join('');
    $('#eff-note').textContent = 'A fair caveat. ' + E.note + ' DASH and composite distillation share an architecture and therefore an inference cost; the calibration advantage is orthogonal to speed.';
  }

  function initVideo() {
    var sec = $('#video'), tpl = $('#video-tpl');
    if (!sec || sec.hidden || !tpl) return;
    $('#video-box').appendChild(tpl.content.cloneNode(true));
    $$('[data-video-only]').forEach(function (n) { n.hidden = false; });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    initVideo(); initTheme(); initNav(); initAnchors(); initReveal(); initAbstract(); initBib(); initMath();
    fetch('data/results.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (D) {
      var I = buildIndex(D);
      bindValues(D, I);
      countUp();
      // Build each widget only when it approaches the viewport, to keep first load light.
      var widgets = [
        ['#t1', initTable1], ['#cal-chart', initCalibration], ['#t2', initTable2], ['#null-chart', initNullChart],
        ['#width-chart', initWidthChart], ['#explorer', initExplorer], ['#tag-chart', initTag], ['#compare', initCompare],
        ['#t3', initAblation], ['#eff', initEfficiency], ['#pipe-svg', initPipeline], ['#geom-svg', initGeometry],
        ['#steps-chart', initSteps], ['#sweep-chart', initSweep], ['#t-fixed', initSuppTables]
      ];
      function run(fn) { try { fn(D, I); } catch (e) { console.error(fn.name, e); } }
      if (!('IntersectionObserver' in window)) { widgets.forEach(function (w) { run(w[1]); }); return; }
      // Observe each widget's enclosing block: empty placeholders (an unfilled <table>) have no area to intersect.
      function anchor(w) { return $(w[0]).closest('.block, figure, .abl, .tablewrap, section'); }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          io.unobserve(en.target);
          widgets.filter(function (w) { return !w.done && anchor(w) === en.target; }).forEach(function (w) { w.done = true; run(w[1]); });
        });
      }, { rootMargin: '600px 0px' });
      widgets.forEach(function (w) { io.observe(anchor(w)); });
      forceWidgets = function () { widgets.forEach(function (w) { if (!w.done) { w.done = true; io.unobserve(anchor(w)); run(w[1]); } }); };
      if (initAnchors.onData) initAnchors.onData();
    }).catch(function (e) {
      console.error('Could not load data/results.json', e);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
