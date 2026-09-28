/* The header's behaviour, so it does not depend on jQuery and Bootstrap's JS.
   Only three of the eight pages loaded those, which left the Works dropdown
   and the mobile menu button dead on the other five.

   The markup uses data-nav-toggle rather than Bootstrap's data-toggle, so on
   the pages that do load Bootstrap the two do not both bind to the same
   click. The .show class is Bootstrap's, and its CSS is loaded everywhere,
   so toggling that is all either menu needs. */
(function () {
  'use strict';

  var nav = document.querySelector('nav.navbar');
  if (!nav) return;

  // There is more than one of these now, Works and the language menu, so
  // opening either has to close the other rather than leaving two menus down
  // the page at once.
  var dropdowns = [].slice.call(nav.querySelectorAll('[data-nav-toggle="dropdown"]'))
    .map(function (toggle) {
      return { toggle: toggle, menu: toggle.parentElement.querySelector('.dropdown-menu') };
    })
    .filter(function (d) { return d.menu; });

  var burger = nav.querySelector('[data-nav-toggle="collapse"]');
  var collapse = burger && document.getElementById(burger.getAttribute('data-nav-target'));

  function setOpen(entry, open) {
    entry.menu.classList.toggle('show', open);
    entry.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function closeAll(except) {
    dropdowns.forEach(function (d) { if (d !== except) setOpen(d, false); });
  }

  dropdowns.forEach(function (d) {
    d.toggle.addEventListener('click', function (e) {
      e.preventDefault();
      var willOpen = !d.menu.classList.contains('show');
      closeAll(d);
      setOpen(d, willOpen);
    });
  });

  if (dropdowns.length) {
    // A click anywhere else closes them, including on one of their own links,
    // which is about to navigate anyway.
    document.addEventListener('click', function (e) {
      var inside = dropdowns.some(function (d) { return d.toggle.contains(e.target); });
      if (inside) return;
      closeAll(null);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = dropdowns.filter(function (d) { return d.menu.classList.contains('show'); });
      if (!open.length) return;
      closeAll(null);
      open[0].toggle.focus();
    });
  }

  if (burger && collapse) {
    function setCollapsed(open) {
      collapse.classList.toggle('show', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) closeAll(null);
    }

    burger.addEventListener('click', function () {
      setCollapsed(!collapse.classList.contains('show'));
    });

    // Tapping the page behind the open menu closes it, which is what the rest
    // of the page looks like it should do. Taps on the button itself are left
    // alone: its own handler is about to run and would reopen what this shut.
    // Above the breakpoint the menu is never given .show, so this does
    // nothing there and needs no width check of its own.
    document.addEventListener('click', function (e) {
      if (!collapse.classList.contains('show')) return;
      if (burger.contains(e.target) || collapse.contains(e.target)) return;
      setCollapsed(false);
    });
  }
}());
