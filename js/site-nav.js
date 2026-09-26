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

  var dropdown = nav.querySelector('[data-nav-toggle="dropdown"]');
  var menu = dropdown && dropdown.parentElement.querySelector('.dropdown-menu');
  var burger = nav.querySelector('[data-nav-toggle="collapse"]');
  var collapse = burger && document.getElementById(burger.getAttribute('data-nav-target'));

  function setDropdown(open) {
    if (!menu) return;
    menu.classList.toggle('show', open);
    dropdown.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (dropdown && menu) {
    dropdown.addEventListener('click', function (e) {
      e.preventDefault();
      setDropdown(menu.classList.contains('show') === false);
    });

    // A click anywhere else closes it, including on one of its own links,
    // which is about to navigate anyway.
    document.addEventListener('click', function (e) {
      if (dropdown.contains(e.target)) return;
      if (menu.contains(e.target)) { setDropdown(false); return; }
      setDropdown(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !menu.classList.contains('show')) return;
      setDropdown(false);
      dropdown.focus();
    });
  }

  if (burger && collapse) {
    burger.addEventListener('click', function () {
      var open = collapse.classList.toggle('show');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) setDropdown(false);
    });
  }
}());
