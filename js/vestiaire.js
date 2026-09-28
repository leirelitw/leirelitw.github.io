/* Vestiaire Collective case study.
   Tabs, the before/after platform switch, scroll reveals, and the
   password-gated sections. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The gate's messages are written by this script rather than sitting in the
  // markup, so the translator never walks over them. They look themselves up.
  function t(text) {
    return (window.i18n && window.i18n.t(text)) || text;
  }

  /* ---------------------------------------------------------------- reveals */
  function observeReveals(root) {
    var items = (root || document).querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window) || reduceMotion) {
      Array.prototype.forEach.call(items, function (el) { el.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }

  /* ------------------------------------------------------------------- tabs */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.vc-tab'));
  var panels = tabs.map(function (tab) { return document.getElementById(tab.getAttribute('aria-controls')); });
  // Deep-link slug per tab. A tab missing from here cannot be linked to and
  // will not update the hash, so add an entry whenever a tab is added.
  var SLUGS = {
    'tab-smart-listing': 'smart-listing',
    'tab-homepage': 'homepage',
    'tab-design-system': 'design-system',
    'tab-other-work': 'other-work'
  };

  function pauseVideosIn(el) {
    if (!el) return;
    Array.prototype.forEach.call(el.querySelectorAll('video'), function (v) {
      if (!v.paused) v.pause();
    });
  }

  function selectTab(index, opts) {
    opts = opts || {};
    tabs.forEach(function (tab, i) {
      var selected = i === index;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      if (panels[i]) {
        panels[i].hidden = !selected;
        if (!selected) pauseVideosIn(panels[i]);
      }
    });

    if (opts.focus) tabs[index].focus();
    if (opts.updateHash !== false) {
      var slug = SLUGS[tabs[index].id];
      if (slug && window.history && history.replaceState) history.replaceState(null, '', '#' + slug);
    }
    observeReveals(panels[index]);

    // Bring the tab bar back into view when switching from further down the page.
    if (opts.scroll) {
      var bar = document.querySelector('.vc-tabbar');
      if (bar && bar.getBoundingClientRect().top < 0) {
        bar.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(i, { scroll: true }); });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      selectTab(next, { focus: true });
    });
  });

  // Deep links: #smart-listing, #design-system, #other-work.
  // Also runs on hashchange, since editing only the hash does not reload the page.
  function applyHash() {
    var slug = (window.location.hash || '').replace('#', '');
    if (!slug) return;
    for (var i = 0; i < tabs.length; i++) {
      if (SLUGS[tabs[i].id] === slug) { selectTab(i, { updateHash: false }); return; }
    }
  }
  applyHash();
  window.addEventListener('hashchange', applyHash);

  /* --------------------------------------------------- web / mobile switch */
  var switchButtons = document.querySelectorAll('[data-vc-view]');
  Array.prototype.forEach.call(switchButtons, function (btn) {
    btn.addEventListener('click', function () {
      var view = btn.getAttribute('data-vc-view');
      Array.prototype.forEach.call(switchButtons, function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-vc-view-panel]'), function (panel) {
        var active = panel.getAttribute('data-vc-view-panel') === view;
        panel.hidden = !active;
        if (!active) pauseVideosIn(panel);
      });
      observeReveals(document.querySelector('[data-vc-view-panel="' + view + '"]'));
    });
  });

  /* ------------------------------------------------------ password-gated bits */
  // One gate per project, each with its own password and its own encrypted
  // blob, so unlocking one case study does not unlock the others. A gate owns
  // the locked blocks inside the same tab panel and nothing outside it.
  var GATES = {
    'smart-listing': { blob: 'data/vc-smart-listing.enc.json', key: 'data/vc-smart-listing.local-key.json' },
    'homepage':      { blob: 'data/vc-homepage.enc.json',      key: 'data/vc-homepage.local-key.json' },
    'other-work':    { blob: 'data/vc-other-work.enc.json',    key: 'data/vc-other-work.local-key.json' }
  };
  var STORE_PREFIX = 'vc-unlocked-';

  var LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', ''];
  var isLocalHost = LOCAL_HOSTS.indexOf(location.hostname) !== -1;
  var servedOverHttp = location.protocol === 'http:' || location.protocol === 'https:';
  var hasCrypto = !!(window.crypto && window.crypto.subtle);

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Every failure carries an explicit code. Without this, any unexpected error
  // (a file:// fetch, a stopped server, bad JSON) would be reported to the
  // reader as a wrong password, which sends them looking in the wrong place.
  function fail(code) { var e = new Error(code); e.code = code; return e; }

  // Wrong password fails the AES-GCM authentication tag, so there is no
  // password stored or compared anywhere: it either decrypts or it does not.
  function decrypt(payload, password) {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.reject(fail('insecure-context'));

    return subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (material) {
        return subtle.deriveKey(
          { name: 'PBKDF2', salt: b64ToBytes(payload.salt), iterations: payload.iterations, hash: 'SHA-256' },
          material,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
      })
      .then(function (key) {
        // The only place a genuinely wrong password can surface.
        return subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.data))
          .catch(function () { throw fail('bad-password'); });
      })
      .then(function (buf) { return new TextDecoder().decode(buf); });
  }

  function loadBlob(gate) {
    if (!gate.blobPromise) {
      // No force-cache: the blob is rebuilt whenever the private source
      // changes, and a permanently cached copy would mask that.
      gate.blobPromise = fetch(gate.blob)
        .catch(function () { throw fail('unreachable'); })
        .then(function (res) {
          if (!res.ok) throw fail(res.status === 404 ? 'missing' : 'unreachable');
          return res.json().catch(function () { throw fail('corrupt'); });
        })
        .catch(function (err) { gate.blobPromise = null; throw err; });
    }
    return gate.blobPromise;
  }

  var MESSAGES = {
    'insecure-context': 'This page has to be opened over http or https, not straight from a file, before it can unlock.',
    'unreachable': 'Could not reach the protected content. If you opened this file directly, serve the folder over http instead.',
    'missing': 'The protected content file is missing. Run: node tools/build-private.mjs',
    'corrupt': 'The protected content file could not be read. Try rebuilding it with: node tools/build-private.mjs'
  };

  function setUpGate(panel, slug, config) {
    var gate = {
      blob: config.blob,
      key: config.key,
      blobPromise: null,
      panel: panel,
      form: panel.querySelector('.vc-unlock__form'),
      input: panel.querySelector('input[type="password"]'),
      button: panel.querySelector('.vc-unlock__form button'),
      message: panel.querySelector('.vc-unlock__msg'),
      // A gate only ever fills locked blocks inside its own tab panel.
      targets: panel.closest('.vc-panel').querySelectorAll('.vc-locked[data-vc-slot]')
    };

    // Kept so a language change can refill the slots without asking for the
    // password again. It never leaves this closure.
    var lastHtml = null, lastOpts = null;

    document.addEventListener('i18n:applied', function () {
      if (!lastHtml) return;
      Array.prototype.forEach.call(gate.targets, function (target) {
        target.innerHTML = '';
        target.removeAttribute('data-state');
      });
      reveal(lastHtml, lastOpts);
    });

    function reveal(html, opts) {
      opts = opts || {};
      lastHtml = html; lastOpts = opts;
      var doc = new DOMParser().parseFromString(html, 'text/html');

      // Images are carried once as a map rather than inlined into each
      // language's template, so the tags are filled in after import.
      var assets = {};
      var bag = doc.querySelector('script[data-vc-assets]');
      if (bag) { try { assets = JSON.parse(bag.textContent); } catch (e) {} }
      Array.prototype.forEach.call(gate.targets, function (target) {
        // Idempotent: a second successful unlock must not append twice.
        if (target.getAttribute('data-state') === 'open') return;
        // The blob holds every language. Take the one being read, and fall
          // back to English for anything not translated yet.
          var slot = target.getAttribute('data-vc-slot');
          var lang = (window.i18n && window.i18n.lang) || 'en';
          var tpl = doc.querySelector('template[lang="' + lang + '"][data-vc-slot="' + slot + '"]')
                 || doc.querySelector('template[lang="en"][data-vc-slot="' + slot + '"]')
                 || doc.querySelector('template[data-vc-slot="' + slot + '"]');
        if (!tpl) return;
        target.appendChild(document.importNode(tpl.content, true));
        Array.prototype.forEach.call(target.querySelectorAll('img[data-vc-asset]'), function (img) {
          var src = assets[img.getAttribute('data-vc-asset')];
          if (src) { img.src = src; img.removeAttribute('data-vc-asset'); }
        });
        target.setAttribute('data-state', 'open');
      });

      panel.classList.add('vc-unlock--done');
      if (opts.local) {
        // Nobody typed anything here, so there is nothing to confirm. Left in,
        // the panel is a banner on every tab explaining its own presence.
        panel.classList.add('vc-unlock--local');
        hideSectionAround(panel);
      } else {
        panel.querySelector('.vc-unlock__copy strong').textContent = t('Unlocked');
        panel.querySelector('.vc-unlock__copy p').textContent =
          t('The locked sections in this tab are now filled in.');
      }
      observeReveals(document);
    }

    // The other-work gate has a section to itself. Hiding the panel there would
    // leave an empty band of paper with its padding intact, so the section goes
    // with it. The other two gates share their section with the case study's
    // own content, which is why this asks rather than assumes.
    function hideSectionAround(el) {
      var section = el.closest('.vc-section');
      if (!section) return;
      var strip = function (n) { return n.textContent.replace(/\s+/g, ''); };
      if (strip(section) !== strip(el)) return;            // other words in it
      if (section.querySelector('img, video, svg, canvas, iframe')) return;
      section.classList.add('vc-section--empty');
    }

    function setBusy(busy) {
      if (!gate.button) return;
      gate.button.disabled = busy;
      gate.button.textContent = busy ? t('Unlocking') : t('Unlock');
    }

    function attempt(password, opts) {
      opts = opts || {};
      if (!password) { gate.message.textContent = t('Enter the password to continue.'); return; }

      setBusy(true);
      gate.message.textContent = '';

      loadBlob(gate)
        .then(function (payload) { return decrypt(payload, password); })
        .then(function (html) {
          // The local key is re-read on every load, so it is not worth storing.
          if (opts.remember !== false) {
            try { sessionStorage.setItem(STORE_PREFIX + slug, password); } catch (e) { /* private mode */ }
          }
          reveal(html, { local: opts.local });
        })
        .catch(function (err) {
          setBusy(false);
          try { sessionStorage.removeItem(STORE_PREFIX + slug); } catch (e) { /* ignore */ }
          if (opts.silent) return;

          var code = (err && err.code) || 'unknown';
          if (code === 'bad-password') {
            gate.message.textContent = t('That password is not right.');
            if (gate.input) { gate.input.value = ''; gate.input.focus(); }
            return;
          }
          gate.message.textContent = MESSAGES[code] || 'Something went wrong unlocking the page. Check the browser console for details.';
          if (window.console) console.error('[vestiaire] unlock failed:', slug, code, err);
        });
    }

    // Opened as a file rather than served? Say so up front instead of letting
    // someone type a correct password and get a failure they cannot interpret.
    if (gate.form && (!servedOverHttp || !hasCrypto)) {
      gate.form.innerHTML = '';
      var warn = document.createElement('p');
      warn.className = 'vc-unlock__blocked';
      warn.textContent = !servedOverHttp
        ? 'This page is open as a local file, so the protected section cannot load. Serve the folder over http and reopen it there.'
        : 'This browser cannot unlock the page because it is not in a secure context. Open the page over https.';
      gate.form.appendChild(warn);
    } else if (gate.form) {
      gate.form.addEventListener('submit', function (e) {
        e.preventDefault();
        attempt(gate.input.value.trim());
      });
      gate.input.addEventListener('input', function () { gate.message.textContent = ''; });
    }

    // The locked placeholders in this panel all point at this panel's form.
    Array.prototype.forEach.call(panel.closest('.vc-panel').querySelectorAll('[data-vc-unlock]'), function (stub) {
      stub.addEventListener('click', function () {
        panel.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        if (gate.input) window.setTimeout(function () { gate.input.focus(); }, reduceMotion ? 0 : 420);
      });
    });

    // Stay unlocked for the rest of the session, and on localhost unlock
    // straight away from the git-ignored key file if one has been built.
    var saved = null;
    try { saved = sessionStorage.getItem(STORE_PREFIX + slug); } catch (e) { /* ignore */ }
    if (saved) { attempt(saved, { silent: true }); return; }

    if (!isLocalHost || !servedOverHttp || !hasCrypto) return;
    fetch(gate.key)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!data || !data.password) return;   // not built yet: the form stays
        attempt(data.password, { silent: true, remember: false, local: true });
      })
      .catch(function () { /* no local key: the password form stays */ });
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-vc-gate]'), function (panel) {
    var slug = panel.getAttribute('data-vc-gate');
    if (GATES[slug]) setUpGate(panel, slug, GATES[slug]);
  });

  /* ------------------------------------------------------------------- init */
  observeReveals(document);
})();
