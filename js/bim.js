/* bim case study: the before and after comparison, and the video reels.

   BEFORE / AFTER  One phone holds both screens. The after screen is clipped
                   from the line to the right edge, and the line follows the
                   pointer 1:1, from where it was grabbed. The knob is a
                   role="slider", so arrow keys move it too. The tabs swap
                   which pair of screens is loaded and keep the line where
                   the reader left it.
   REELS           Recordings load nothing until asked. Playing one pauses
                   the others. */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------- compare */
  var root = document.querySelector('[data-ba]');
  if (root) {
    var compare = root.querySelector('.bim-ba__compare');
    var handle = root.querySelector('.bim-ba__handle');
    var imgBefore = root.querySelector('.bim-ba__img--before');
    var imgAfter = root.querySelector('.bim-ba__img--after');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('.bim-ba__tab'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });

    var pos = 50;
    var touched = false; // once the reader has moved it, the hint never runs again

    function setPos(p) {
      pos = Math.max(0, Math.min(100, p));
      compare.style.setProperty('--pos', pos + '%');
      var r = Math.round(pos);
      handle.setAttribute('aria-valuenow', r);
      handle.setAttribute('aria-valuetext', r + '%');
      compare.classList.toggle('is-near-left', pos < 22);
      compare.classList.toggle('is-near-right', pos > 78);
    }

    function fromEvent(e) {
      var rect = compare.getBoundingClientRect();
      return ((e.clientX - rect.left) / rect.width) * 100;
    }

    /* Drag. Grabbing the knob keeps the offset between finger and line, so
       the line does not jump to the finger; pressing anywhere else moves the
       line there first. touch-action: pan-y on the screen leaves vertical
       swipes to the page, so scrolling past the phone still works. */
    var dragging = false, grabOffset = 0, anim = 0;

    compare.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      cancelAnimationFrame(anim);
      touched = true;
      dragging = true;
      var onHandle = handle.contains(e.target);
      grabOffset = onHandle ? fromEvent(e) - pos : 0;
      if (!onHandle) setPos(fromEvent(e));
      compare.classList.add('is-dragging');
      try { compare.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    });
    compare.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      setPos(fromEvent(e) - grabOffset);
    });
    function end() {
      dragging = false;
      compare.classList.remove('is-dragging');
    }
    compare.addEventListener('pointerup', end);
    compare.addEventListener('pointercancel', end);
    compare.addEventListener('lostpointercapture', end);

    handle.addEventListener('keydown', function (e) {
      var step = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -20, PageUp: 20 }[e.key];
      if (e.key === 'Home') { setPos(0); }
      else if (e.key === 'End') { setPos(100); }
      else if (step) { setPos(pos + step); }
      else return;
      e.preventDefault();
      cancelAnimationFrame(anim);
      touched = true;
    });

    /* A one-time hint when the phone first comes into view: the line moves a
       little towards the after screen and settles back, so it reads as
       something to drag. Skipped for reduced motion, or once touched. */
    function nudge() {
      if (reduce || touched) return;
      var start = null, from = pos, dur = 1400;
      function frame(now) {
        if (touched) return;
        if (start === null) start = now;
        var k = Math.min(1, (now - start) / dur);
        setPos(from + 18 * Math.sin(Math.PI * k) * (1 - k * 0.15));
        if (k < 1) anim = requestAnimationFrame(frame); else setPos(from);
      }
      anim = requestAnimationFrame(frame);
    }
    if ('IntersectionObserver' in window) {
      var seen = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        seen.disconnect();
        setTimeout(nudge, 500);
      }, { threshold: 0.6 });
      seen.observe(compare);
    }

    /* Tabs. The new pair is loaded before anything fades, so the swap never
       shows a half-loaded screen. */
    var swapId = 0;
    function select(index, focus) {
      tabs.forEach(function (tab, i) {
        var on = i === index;
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
        tab.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      var panel = panels[index];
      panel.classList.remove('is-entering');
      void panel.offsetWidth;
      panel.classList.add('is-entering');
      if (focus) tabs[index].focus();
      tabs[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });

      var before = panel.getAttribute('data-before');
      var after = panel.getAttribute('data-after');
      var id = ++swapId;
      compare.classList.add('is-swapping');
      Promise.all([before, after].map(function (src) {
        return new Promise(function (resolve) {
          var im = new Image();
          im.onload = im.onerror = resolve;
          im.src = src;
        });
      })).then(function () {
        if (id !== swapId) return;
        setTimeout(function () {
          if (id !== swapId) return;
          imgBefore.src = before; imgBefore.alt = panel.getAttribute('data-before-alt');
          imgAfter.src = after; imgAfter.alt = panel.getAttribute('data-after-alt');
          compare.classList.remove('is-swapping');
        }, reduce ? 0 : 180);
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(i); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next === null) return;
        e.preventDefault();
        select(next, true);
      });
    });

    setPos(50);
  }

  /* ---------------------------------------------------------- reels */
  var reels = Array.prototype.slice.call(document.querySelectorAll('.bim-reel'));
  var videos = reels.map(function (r) { return r.querySelector('video'); });

  reels.forEach(function (reel, i) {
    var video = videos[i];
    var play = reel.querySelector('.bim-reel__play');
    if (!video || !play) return;

    play.addEventListener('click', function () {
      video.controls = true;
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* blocked: the controls are there now */ });
    });
    video.addEventListener('play', function () {
      reel.classList.add('is-playing');
      videos.forEach(function (other) { if (other !== video && !other.paused) other.pause(); });
    });
    video.addEventListener('ended', function () {
      reel.classList.remove('is-playing');
      video.controls = false;
      video.currentTime = 0;
    });
  });
}());
