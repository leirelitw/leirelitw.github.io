/* Translate the page in place, from i18n/<lang>.json.
 *
 * There is one copy of every page. The English in the markup is the source,
 * and the dictionaries are keyed by that English, so nothing here needs
 * data-i18n attributes on a thousand elements and a phrase used twice is
 * translated once.
 *
 * The English is snapshotted on first run, and every switch is applied to that
 * snapshot rather than to whatever is on screen. Translating a translation
 * would compound any mistake and could never get back to English.
 *
 * Worth knowing: one URL serves all three languages, so a search engine indexes
 * the English. Real /es/ and /fr/ pages would be indexed separately; this is
 * the trade for keeping a single set of files.
 */
(function () {
  'use strict';

  var STORE = 'll-lang';
  var DEFAULT = 'en';
  var root = document.documentElement.getAttribute('data-i18n-root') || '';

  function saved() {
    try { return localStorage.getItem(STORE); } catch (e) { return null; }
  }
  function remember(lang) {
    try { localStorage.setItem(STORE, lang); } catch (e) { /* private window */ }
  }

  // Text nodes worth touching: everything that is not markup or script.
  function textNodes() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var out = [], n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  // The English as it was before anything was swapped. Kept on the node so it
  // survives re-renders of everything except the node itself.
  var ORIGINAL = new WeakMap();
  function original(node) {
    if (!ORIGINAL.has(node)) ORIGINAL.set(node, node.nodeValue);
    return ORIGINAL.get(node);
  }

  var pageMeta = { title: document.title };
  var descTag = document.querySelector('meta[name="description"]');
  if (descTag) pageMeta.description = descTag.getAttribute('content');

  function applyDict(dict) {
    var strings = (dict && dict.strings) || {};
    textNodes().forEach(function (node) {
      var src = original(node);
      var key = src.trim();
      var hit = strings[key];
      if (!hit) return;
      // keep whatever spacing surrounded the words
      node.nodeValue = src.replace(key, hit);
    });

    var file = location.pathname.split('/').pop() || 'index.html';
    var meta = dict && dict.pages && dict.pages[file];
    document.title = (meta && meta.title) || pageMeta.title;
    if (descTag) descTag.setAttribute('content', (meta && meta.description) || pageMeta.description);
  }

  function reset() {
    textNodes().forEach(function (node) {
      if (ORIGINAL.has(node)) node.nodeValue = ORIGINAL.get(node);
    });
    document.title = pageMeta.title;
    if (descTag) descTag.setAttribute('content', pageMeta.description);
  }

  // Dictionaries are small and change rarely, so the last copy is kept in
  // localStorage. The first visit fetches; every page after it reads from
  // there and applies before the browser has painted anything.
  var CACHE = 'll-i18n:';
  function cached(lang) {
    try {
      var raw = localStorage.getItem(CACHE + lang);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function keep(lang, dict) {
    try { localStorage.setItem(CACHE + lang, JSON.stringify(dict)); } catch (e) { /* full or blocked */ }
  }

  var cache = {};
  function complain(lang, why) {
    // Failing quietly here looks exactly like a broken translation, so say what
    // happened. The usual cause is opening the page from Finder: fetch is not
    // allowed on file:// URLs, so the dictionary can never be read and the page
    // stays in English with nothing to show for it.
    var hint = location.protocol === 'file:'
      ? 'The page was opened as a file:// URL, and browsers block fetch there. ' +
        'Serve the folder over http instead: ./tools/preview.sh'
      : why;
    if (window.console && console.warn) {
      console.warn('[i18n] could not load i18n/' + lang + '.json — staying in English. ' + hint);
    }
  }

  function load(lang, force) {
    if (!force && cache[lang]) return Promise.resolve(cache[lang]);
    return fetch(root + 'i18n/' + lang + '.json')
      .then(function (r) {
        if (!r.ok) { complain(lang, 'The server answered ' + r.status + '.'); return null; }
        return r.json();
      })
      .then(function (j) { if (j) { cache[lang] = j; keep(lang, j); } return j; })
      .catch(function (e) { complain(lang, String(e)); return null; });
  }

  var current = DEFAULT;

  // For text that JavaScript writes rather than markup: the galaxy's canvas
  // labels, the unlock panel's messages. Those never exist as a text node the
  // walker could find, so they ask for the translation directly. Text the
  // dictionary does not know comes back as it went in, which is what should
  // happen to a brand name.
  function t(text) {
    if (current === DEFAULT) return text;
    var dict = cache[current] || cached(current);
    var hit = dict && dict.strings && dict.strings[text];
    return hit || text;
  }

  function markSwitch(lang) {
    document.querySelectorAll('[data-lang]').forEach(function (el) {
      var on = el.getAttribute('data-lang') === lang;
      el.classList.toggle('is-on', on);
      if (on) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
    });
    var code = document.querySelector('.lang-code');
    if (code) code.textContent = lang.toUpperCase();
  }

  function set(lang, persist) {
    current = lang;
    document.documentElement.lang = lang;
    markSwitch(lang);
    if (persist) remember(lang);
    if (lang === DEFAULT) { reset(); announce(); reveal(); return Promise.resolve(); }
    var known = cache[lang] || cached(lang);
    if (known) {
      cache[lang] = known;
      reset();
      applyDict(known);
      announce();
      reveal();
      // Still ask the server, so an edit to the json reaches a reader who has
      // the old one stored. Only redraw if it actually differs.
      load(lang, true).then(function (fresh) {
        if (!fresh || JSON.stringify(fresh) === JSON.stringify(known)) return;
        if (current !== lang) return;
        reset(); applyDict(fresh); announce();
      });
      return Promise.resolve();
    }

    return load(lang).then(function (dict) {
      if (!dict) { reset(); reveal(); return; }
      reset();
      applyDict(dict);
      announce();
      reveal();
    });
  }

  // The head script hides the page while a non-English language is pending.
  // Whatever happens after, it has to be let go.
  function reveal() {
    document.documentElement.classList.remove('i18n-pending');
  }

  // Anything drawn after load, such as the galaxy's project cards, asks for a
  // pass of its own once it is in the DOM.
  function announce() {
    document.dispatchEvent(new CustomEvent('i18n:applied', { detail: { lang: current } }));
  }
  window.i18n = {
    get lang() { return current; },
    t: t,
    set: function (l) { return set(l, true); },
    // re-run over newly inserted nodes, keeping the language that is showing
    refresh: function () { return current === DEFAULT ? Promise.resolve() : set(current, false); }
  };

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-lang]') : null;
    if (!el) return;
    e.preventDefault();
    set(el.getAttribute('data-lang'), true);
  });

  var start = saved() || DEFAULT;
  if (document.body) set(start, false);
  else document.addEventListener('DOMContentLoaded', function () { set(start, false); });
}());
