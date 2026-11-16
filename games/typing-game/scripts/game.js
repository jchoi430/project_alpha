(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var GAME_SECONDS = 60;
  // seconds a word takes to fall, and seconds between spawns, per level (higher level = a bit faster)
  var FALL = { 1: 10, 2: 9, 3: 11 };
  var SPAWN = { 1: 1.7, 2: 2.0, 3: 3.2 };
  var STORE = 'typing-game:';

  var state = { lang: 'en', level: 1, langs: [], text: {}, cfg: {}, words: {}, loaded: {} };
  var game = null;

  /* ---------- safe storage ---------- */
  function sGet(k) { try { return window.localStorage.getItem(STORE + k); } catch (e) { return null; } }
  function sSet(k, v) { try { window.localStorage.setItem(STORE + k, v); } catch (e) { /* ignore */ } }
  function bestKey(l, lv) { return 'best:' + l + ':' + lv; }
  function getBest(l, lv) { var n = parseInt(sGet(bestKey(l, lv)), 10); return isNaN(n) ? 0 : n; }

  /* ---------- tiny YAML parser: "key: value" and "key:" + "- item" lists ---------- */
  function unquote(s) {
    s = s.trim();
    if (s.length > 1 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) return s.slice(1, -1);
    return s;
  }
  function parseYaml(src) {
    var out = {}, cur = null, lines = src.replace(/\r/g, '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || line.trim()[0] === '#') continue;
      var item = /^\s+-\s+(.*)$/.exec(line);
      if (item && cur) { out[cur].push(unquote(item[1])); continue; }
      var kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
      if (kv) {
        if (kv[2] === '') { cur = kv[1]; out[cur] = []; } else { out[kv[1]] = unquote(kv[2]); cur = null; }
      }
    }
    return out;
  }

  /* ---------- loading ---------- */
  function getJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); }); }
  function getText(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url); return r.text(); }); }
  function loadLang(l) {
    if (state.loaded[l]) return Promise.resolve();
    return Promise.all([getJSON('i18n/' + l + '.json'), getText('config/' + l + '.yaml'), getJSON('words/' + l + '.json')])
      .then(function (r) { state.text[l] = r[0]; state.cfg[l] = parseYaml(r[1]); state.words[l] = r[2]; state.loaded[l] = true; });
  }
  function T(key) { var t = state.text[state.lang]; return (t && t[key]) || ''; }

  /* ---------- start screen ---------- */
  function show(id) { ['start', 'play', 'result'].forEach(function (s) { $(s).hidden = (s !== id); }); }
  function fillList(ul, arr) {
    ul.textContent = '';
    (arr || []).forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
  }
  function renderStart() {
    var l = state.lang, c = state.cfg[l] || {};
    document.documentElement.lang = T('htmlLang') || l;
    document.title = T('title');
    $('t-title').textContent = T('title');
    $('t-lang').textContent = T('chooseLanguage');
    $('t-level').textContent = T('chooseLevel');
    $('t-howto').textContent = T('howTo');
    $('t-parent').textContent = T('parentGuide');
    $('intro').textContent = c.intro || '';
    fillList($('howto'), c.how_to);
    fillList($('parent'), c.parent_guide);
    $('startBtn').textContent = T('start');
    var langBox = $('langs'); langBox.textContent = '';
    state.langs.forEach(function (code) {
      var b = document.createElement('button');
      b.className = 'choice'; b.type = 'button';
      b.textContent = (state.text[code] && state.text[code].langName) || code;
      b.setAttribute('aria-pressed', String(code === l));
      b.addEventListener('click', function () { setLang(code); });
      langBox.appendChild(b);
    });
    var lvBox = $('levels'); lvBox.textContent = '';
    [1, 2, 3].forEach(function (n) {
      var b = document.createElement('button');
      b.className = 'choice'; b.type = 'button';
      b.setAttribute('aria-pressed', String(n === state.level));
      b.appendChild(document.createTextNode(n + '. ' + T('level' + n)));
      var sm = document.createElement('small');
      sm.textContent = T('best') + ' ' + getBest(l, n);
      b.appendChild(sm);
      b.addEventListener('click', function () { state.level = n; renderStart(); });
      lvBox.appendChild(b);
    });
  }
  function setLang(code) {
    loadLang(code).then(function () { state.lang = code; sSet('lang', code); renderStart(); })
      .catch(showLoadError);
  }
  function showLoadError() {
    var e = $('loaderr');
    var t = state.text[state.lang];
    // Fallback text only used when i18n files themselves cannot be loaded (e.g. opened via file://)
    e.textContent = (t && t.loadError) || 'Could not load game files. Please open via a web server (GitHub Pages). / 웹 서버(GitHub Pages)로 열어 주세요.';
    e.hidden = false;
    ['start', 'play', 'result'].forEach(function (s) { $(s).hidden = true; });
  }

  /* ---------- game ---------- */
  var field = $('field'), box = $('typebox');

  function norm(s) { return s.replace(/\s+/g, ' ').trim().toLowerCase(); }

  function viewportFit() {
    var vv = window.visualViewport, app = $('app');
    if (vv) {
      app.style.height = vv.height + 'px';
      app.style.transform = 'translateY(' + vv.offsetTop + 'px)';
    }
    window.scrollTo(0, 0);
  }

  function startGame() {
    var list = (state.words[state.lang] || {})[String(state.level)] || [];
    if (!list.length) return;
    game = { list: list, words: [], score: 0, combo: 0, hit: 0, missed: 0, left: GAME_SECONDS,
             spawnIn: 0.2, last: 0, raf: 0, over: false, composing: false, pendingSubmit: false, lastX: -1 };
    field.textContent = '';
    box.value = ''; box.placeholder = T('inputPlaceholder');
    $('submit').textContent = T('submit');
    $('h-time').textContent = T('time'); $('h-score').textContent = T('score'); $('h-combo').textContent = T('combo');
    show('play'); viewportFit(); updateHud();
    box.focus();
    game.last = performance.now();
    game.raf = requestAnimationFrame(tick);
  }

  function updateHud() {
    $('time').textContent = Math.ceil(game.left);
    $('score').textContent = game.score;
    $('combo').textContent = game.combo;
  }

  function spawn() {
    var text = game.list[Math.floor(Math.random() * game.list.length)];
    // avoid duplicates already on screen
    for (var t = 0; t < 6 && game.words.some(function (w) { return w.text === text; }); t++) {
      text = game.list[Math.floor(Math.random() * game.list.length)];
    }
    var el = document.createElement('div');
    el.className = 'word' + (state.level === 3 ? ' long' : '');
    el.textContent = text;
    field.appendChild(el);
    var xf = Math.random();
    for (var i = 0; i < 5 && Math.abs(xf - game.lastX) < 0.25; i++) xf = Math.random();
    game.lastX = xf;
    game.words.push({ text: text, key: norm(text), el: el, p: 0, xf: xf });
  }

  function layoutWord(w, fh, fw) {
    var x = w.xf * Math.max(0, fw - w.el.offsetWidth);
    var y = w.p * Math.max(0, fh - w.el.offsetHeight);
    w.el.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  function tick(now) {
    if (game.over) return;
    var dt = Math.min(0.1, (now - game.last) / 1000);
    game.last = now;
    game.left -= dt;
    game.spawnIn -= dt;
    if (game.spawnIn <= 0) { spawn(); game.spawnIn = SPAWN[state.level]; }
    var fh = field.clientHeight, fw = field.clientWidth, rate = 1 / FALL[state.level];
    for (var i = game.words.length - 1; i >= 0; i--) {
      var w = game.words[i];
      w.p += rate * dt;
      if (w.p >= 1) {
        game.words.splice(i, 1);
        game.missed++; game.combo = 0;
        w.el.classList.add('miss'); removeLater(w.el);
        continue;
      }
      layoutWord(w, fh, fw);
    }
    updateHud();
    if (game.left <= 0) { game.left = 0; updateHud(); endGame(); return; }
    game.raf = requestAnimationFrame(tick);
  }

  function removeLater(el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450); }

  function renderTyped() {
    var v = norm(box.value);
    game.words.forEach(function (w) {
      var n = 0;
      while (n < v.length && n < w.key.length && v[n] === w.key[n]) n++;
      var el = w.el; el.textContent = '';
      if (n > 0) { var s = document.createElement('span'); s.className = 'typed'; s.textContent = w.text.slice(0, n); el.appendChild(s); }
      el.appendChild(document.createTextNode(w.text.slice(n)));
    });
  }

  function popWord(w) {
    game.words.splice(game.words.indexOf(w), 1);
    game.combo++;
    game.hit++;
    var mult = Math.min(4, 1 + 0.5 * Math.floor((game.combo - 1) / 3));
    game.score += Math.round([].concat(Array.from(w.text)).length * 10 * mult);
    w.el.classList.add('pop'); removeLater(w.el);
    box.value = '';
    renderTyped(); updateHud();
  }

  // returns true if a word was popped
  function judge(explicit) {
    var v = norm(box.value);
    if (!v) return false;
    var found = null;
    for (var i = 0; i < game.words.length; i++) if (game.words[i].key === v) { if (!found || game.words[i].p > found.p) found = game.words[i]; }
    if (found) {
      // while typing, wait if a longer word on screen still starts with what was typed
      var longer = !explicit && game.words.some(function (w) { return w !== found && w.key.length > v.length && w.key.indexOf(v) === 0; });
      if (!longer) { popWord(found); return true; }
      return false;
    }
    if (explicit) { game.combo = 0; box.value = ''; renderTyped(); updateHud(); shake(); }
    return false;
  }

  function shake() {
    box.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 200 });
  }

  box.addEventListener('compositionstart', function () { if (game) game.composing = true; });
  box.addEventListener('compositionend', function () {
    if (!game) return;
    game.composing = false;
    var explicit = game.pendingSubmit; game.pendingSubmit = false;
    judge(explicit); renderTyped();
  });
  box.addEventListener('input', function (e) {
    if (!game || game.over) return;
    if (game.composing || e.isComposing) return; // never judge while composing (Korean IME)
    renderTyped();
    judge(false);
  });
  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!game || game.over) return;
    if (game.composing) { game.pendingSubmit = true; return; } // judged when composition ends
    judge(true);
    box.focus();
  });
  // Enter during IME composition: remember it so the committed text is judged explicitly
  box.addEventListener('keydown', function (e) {
    if (game && (e.key === 'Enter') && (e.isComposing || e.keyCode === 229)) game.pendingSubmit = true;
  });
  field.addEventListener('pointerdown', function () { if (game && !game.over) box.focus(); });

  function endGame() {
    game.over = true;
    cancelAnimationFrame(game.raf);
    box.blur();
    var l = state.lang, lv = state.level, prev = getBest(l, lv), isNew = game.score > prev;
    if (isNew) sSet(bestKey(l, lv), String(game.score));
    $('r-title').textContent = T('resultTitle');
    $('r-score-l').textContent = T('score'); $('r-score').textContent = game.score;
    $('r-hit-l').textContent = T('hit'); $('r-hit').textContent = game.hit;
    $('r-miss-l').textContent = T('missed'); $('r-miss').textContent = game.missed;
    $('r-best-l').textContent = T('bestScore'); $('r-best').textContent = Math.max(prev, game.score);
    $('r-new').textContent = T('newBest'); $('r-new').hidden = !isNew;
    $('again').textContent = T('playAgain'); $('homeBtn').textContent = T('home');
    game = null;
    show('result'); window.scrollTo(0, 0);
  }

  $('startBtn').addEventListener('click', startGame);
  $('again').addEventListener('click', startGame);
  $('homeBtn').addEventListener('click', function () { renderStart(); show('start'); });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', viewportFit);
    window.visualViewport.addEventListener('scroll', viewportFit);
  }
  window.addEventListener('resize', viewportFit);

  /* ---------- boot ---------- */
  getJSON('i18n/languages.json').then(function (codes) {
    state.langs = codes;
    var saved = sGet('lang'), nav = (navigator.language || 'en').slice(0, 2);
    var first = codes.indexOf(saved) >= 0 ? saved : (codes.indexOf(nav) >= 0 ? nav : codes[0]);
    state.lang = first;
    // load all languages so the language buttons can show their names
    return Promise.all(codes.map(loadLang));
  }).then(function () { renderStart(); show('start'); }).catch(showLoadError);
})();
