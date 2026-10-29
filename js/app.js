(function () {
  const W = window.WEDDING;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canAnimate = !!(window.gsap && window.ScrollTrigger) && !reduceMotion;
  if (!canAnimate) document.documentElement.classList.add('static');

  // ---------- which invite: language + one guest or many, fixed per link ----------
  // set by each published page (e.g. 'solo-ru'); ?invite=many-en works for local testing
  const [who, l] = (window.INVITE || new URLSearchParams(location.search).get('invite') || 'many-ru').split('-');
  const lang = l === 'en' ? 'en' : 'ru';
  const strings = { ...W.strings[lang], ...(who === 'many' ? W.many[lang] : null) };
  const t = () => strings;

  function applyLang() {
    const s = t();
    document.documentElement.lang = lang;
    document.title = s.title;
    $$('[data-i18n]').forEach((el) => { el.innerHTML = s[el.dataset.i18n]; });
    $$('[data-i18n-aria]').forEach((el) => el.setAttribute('aria-label', s[el.dataset.i18nAria]));
    $('#playBtn').setAttribute('aria-label', document.body.classList.contains('playing') ? s.aPause : s.aPlay);
    if ($('#env').classList.contains('open')) $('#hint').innerHTML = s.envHintOpen;
    const d = new Date(W.date);
    // shown in venue time, so guests abroad see the same 16:00 as everyone in Yerevan
    const tz = W.timeZone;
    $('#dateText').textContent = new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(d);
    $('#timeText').textContent = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(d);
    $('#mapBtn').href = W.mapUrl;
    tick();
  }

  // ---------- tap reactions on sprites ----------
  $$('.tap').forEach((el) => {
    el.addEventListener('click', (e) => {
      el.classList.remove('boing');
      void el.offsetWidth;
      el.classList.add('boing');
      const p = document.createElement('div');
      p.className = 'pop';
      p.textContent = t().pop[el.dataset.pop];
      p.style.left = e.clientX + 'px';
      p.style.top = e.clientY + 'px';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 900);
    });
  });

  // ---------- procedural street backgrounds (no extra image files) ----------
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  function skyline(w, h, colors, minH, maxH, seed) {
    const r = rng(seed);
    let x = 0, out = '';
    while (x < w) {
      const bw = Math.min(w - x, 60 + Math.floor(r() * 70));
      const bh = h * (minH + r() * (maxH - minH));
      const c = colors[Math.floor(r() * colors.length)];
      out += `<rect x="${x}" y="${h - bh}" width="${bw}" height="${bh}" fill="${c}" stroke="#2A1B2D" stroke-width="4"/>`;
      for (let wy = h - bh + 16; wy < h - 20; wy += 28)
        for (let wx = x + 12; wx < x + bw - 16; wx += 24)
          out += `<rect x="${wx}" y="${wy}" width="10" height="14" rx="2" fill="#FFF1D6" opacity=".7"/>`;
      x += bw;
    }
    return out;
  }
  function clouds(w, h) {
    const r = rng(7);
    let out = '';
    for (let i = 0; i < 5; i++) {
      const cx = (i + 0.5) * (w / 5), cy = 56 + r() * (h - 112), s = 0.8 + r() * 0.35;
      out += `<g transform="translate(${cx} ${cy}) scale(${s})" fill="#fff" stroke="#2A1B2D" stroke-width="4"><ellipse cx="0" cy="0" rx="46" ry="20"/><ellipse cx="-26" cy="8" rx="30" ry="16"/><ellipse cx="28" cy="8" rx="32" ry="16"/></g>`;
    }
    return out;
  }
  function paintBg(el, inner) {
    const w = +el.dataset.w, h = +el.dataset.h;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner(w, h)}</svg>`;
    el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    el.style.backgroundSize = `${w}px ${h}px`;
  }
  paintBg($('.bg.clouds'), (w, h) => clouds(w, h));
  paintBg($('.bg.far'), (w, h) => skyline(w, h, ['#B9A6FF', '#FF9EC4', '#8fd6ff'], 0.45, 0.95, 11));
  paintBg($('.bg.near'), (w, h) => skyline(w, h, ['#FFC93C', '#FF8FB8', '#BDE8D6', '#FF5A45'], 0.35, 0.8, 29));

  // ---------- scroll-driven story ----------
  // bubble helper: pops in at `at`, pops out `len` later (timeline units)
  const say = (tl, el, at, len = 1.5) => {
    tl.fromTo(el, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.25, ease: 'back.out(2.2)' }, at)
      .to(el, { autoAlpha: 0, scale: 0.85, duration: 0.2 }, at + len);
    // whoever is talking steps in front, so nobody walks over their bubble
    const actor = el.closest('.actor');
    if (actor) tl.set(actor, { zIndex: 20 }, at).set(actor, { zIndex: getComputedStyle(actor).zIndex }, at + len + 0.2);
  };
  // name tag / caption: fades in at `at`, out `len` later
  const label = (tl, el, at, len) => {
    tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, at).to(el, { autoAlpha: 0, duration: 0.2 }, at + len);
  };
  const bub = (root, key) => $(`[data-i18n="${key}"]`, root).closest('.bubble') || $(`[data-i18n="${key}"]`, root);

  function buildStory() {
    gsap.registerPlugin(ScrollTrigger);
    // in-app browsers resize on every address-bar change and fight native touch scrolling
    ScrollTrigger.config({ ignoreMobileResize: true });
    // (taps on the controls must stay plain clicks, or the normalizer treats them as a drag and stops updating)
    if (matchMedia('(pointer: coarse)').matches) ScrollTrigger.normalizeScroll({ ignore: '.ctrl, .play-big' });
    const pinTL = (sel, length) =>
      gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: sel, start: 'top top', end: `+=${length}%`, pin: true, scrub: 0.7, anticipatePin: 1, invalidateOnRefresh: true } });

    // chapter title card: slams in mid-stage, holds, docks to the top (time-based, not scrubbed)
    const titleCard = (section, dock) => {
      const card = $('.chapter', section);
      const play = () => {
        gsap.killTweensOf(card);
        // phones: no room for a mid-stage slam without covering the bubbles, so it just pops in where it docks
        if (!dock || innerWidth < 600) { gsap.fromTo(card, { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }); return; }
        gsap.timeline()
          .fromTo(card, { autoAlpha: 0, scale: 1.5, y: '-36svh', rotation: -4 }, { autoAlpha: 1, scale: 1.5, rotation: 0, duration: 0.35, ease: 'back.out(2)' })
          .to(card, { scale: 1, y: 0, duration: 0.5, ease: 'power3.inOut' }, '+=0.9');
      };
      ScrollTrigger.create({ trigger: section, start: 'top 30%', onEnter: play, onEnterBack: play });
    };
    $$('.pinned').forEach((sec) => titleCard(sec, true));
    titleCard($('#drop'), false);

    // whip-pan: a cream strip sweeps across as the next chapter arrives
    ['#chase', '#drop'].forEach((sel) => {
      gsap.fromTo('.whip', { xPercent: -110 }, {
        xPercent: 110, ease: 'none', immediateRender: false,
        scrollTrigger: { trigger: sel, start: 'top bottom', end: 'top 55%', scrub: true, refreshPriority: -1, onToggle: (self) => gsap.set('.whip', { autoAlpha: self.isActive ? 1 : 0 }) },
      });
    });

    // CH1 — infiltration: Mira sneaks in, clears two lasers, trips the third and freezes mid-room
    {
      const root = $('#infil'), tl = pinTL('#infil', 470);
      const gabi = $('.gabi', root), mira = $('.mira', root), bed = $('.bed', root);
      const lasers = $$('.lasers i', root);
      // Gabi tiptoes in, then stands up to give orders
      tl.fromTo(gabi, { x: '-14vw' }, { x: 0, duration: 0.5 }, 0)
        .set($('img.a', gabi), { opacity: 0 }, 3.9).set($('img.b', gabi), { opacity: 1 }, 3.9);
      tl.fromTo(mira, { x: '-26vw' }, { x: '30vw', duration: 5.0 }, 0.5); // laser spots in the HTML are her x at each hop apex
      label(tl, $('.cap', root), 0.5, 1.9);
      // one label beat at a time: Gabi's line, the lasers, then the cast
      label(tl, $('.tag.free', root), 2.0, 0.85);
      label(tl, $('.tag', gabi), 3.0, 0.8);
      label(tl, $('.tag.tv', bed), 3.0, 0.8);
      label(tl, $('.tag.ta', bed), 3.0, 0.8);
      say(tl, bub(root, 'i1'), 0.5, 1.4);
      say(tl, bub(root, 'i2'), 2.8, 1.0);
      say(tl, bub(root, 'i8'), 4.0, 1.0);
      // lasers pulse like a metronome; Mira hops two of them and squashes on each landing
      tl.to(lasers, { opacity: 0.45, duration: 0.2, yoyo: true, repeat: 1, stagger: 0.5 }, 1);
      [4.5, 5.0].forEach((t0) => {
        tl.set($('img.a', mira), { opacity: 0 }, t0).set($('img.b', mira), { opacity: 1 }, t0)
          .set($('img.a', mira), { opacity: 1 }, t0 + 0.4).set($('img.b', mira), { opacity: 0 }, t0 + 0.4)
          .to(mira, { y: '-9svh', duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1 }, t0)
          .to(mira, { scaleY: 0.9, scaleX: 1.06, transformOrigin: '50% 100%', duration: 0.08, yoyo: true, repeat: 1 }, t0 + 0.4);
      });
      // a proud half-beat, then the alarm: lasers flare, screen flashes, the bed jolts, Anna sits up, Gabi winces
      tl.to(lasers, { scaleY: 3, duration: 0.15, yoyo: true, repeat: 3 }, 5.7)
        .to($('.alarm', root), { opacity: 0.55, duration: 0.1, yoyo: true, repeat: 5 }, 5.7)
        .to(mira, { y: '-2svh', duration: 0.1, yoyo: true, repeat: 1 }, 5.7)
        .to(bed, { x: '+=7', duration: 0.05, yoyo: true, repeat: 7 }, 5.8)
        .to(bed, { y: -14, duration: 0.15, yoyo: true, repeat: 1 }, 5.8)
        .to($('img.a', bed), { opacity: 0, duration: 0.15 }, 5.9).to($('img.b', bed), { opacity: 1, duration: 0.15 }, 5.9)
        .to(gabi, { rotation: -10, transformOrigin: '50% 100%', duration: 0.15, yoyo: true, repeat: 1 }, 5.9);
      say(tl, bub(root, 'i9'), 6.1, 1.1);
      say(tl, bub(root, 'i3'), 7.3, 1.1);
      say(tl, bub(root, 'i4'), 8.6, 1.1);
      say(tl, bub(root, 'i5'), 9.9, 1.0);
      say(tl, bub(root, 'i6'), 11.1, 1.1);
      // slow push-in on the bed; Anna's line lands on a still frame, then Mira bolts
      tl.to($('.stage', root), { scale: 1.12, transformOrigin: '78% 68%', ease: 'power1.inOut', duration: 1.6 }, 10.9);
      say(tl, bub(root, 'i7'), 12.4, 1.3);
      tl.to(mira, { x: '108vw', duration: 0.6, ease: 'power2.in' }, 13.5)
        .to({}, { duration: 0.3 }, 14.1);
    }

    // CH2 — heist: Mira sniffs the ring, gets told off, hops the table, swaps the envelope into her mouth
    {
      const root = $('#heist'), tl = pinTL('#heist', 480);
      const mira = $('.mira', root), a = $('img.a', mira), b = $('img.b', mira);
      const env = $('#envprop', root), puff = $('.puff', root), ring = $('#ringbox', root), stage = $('.stage', root);
      const gA = $('img.a', $('.gabi', root)), gB = $('img.b', $('.gabi', root));
      const pose = (t, show, hide) => tl.set(hide, { opacity: 0 }, t).set(show, { opacity: 1 }, t);
      tl.fromTo(mira, { x: '-26vw' }, { x: '15vw', duration: 3.2 }, 0);
      // Gabi points at the table for her orders, relaxes in between
      pose(1.1, gB, gA); pose(2.5, gA, gB); pose(8.7, gB, gA); pose(9.9, gA, gB);
      // nose down on the ring box, head back up for the double-take
      pose(3.3, $('img.c', mira), a); pose(4.7, a, $('img.c', mira));
      // push-in on the ring box while she sniffs it, cut back wide for Gabi's line, then a double-take
      tl.to(stage, { scale: 1.3, transformOrigin: '65% 78%', ease: 'power1.inOut', duration: 1.1 }, 3.3)
        .to(mira, { rotation: -6, transformOrigin: '50% 100%', duration: 0.2, yoyo: true, repeat: 1 }, 3.7)
        .to(ring, { scale: 1.06, transformOrigin: '50% 100%', duration: 0.2, yoyo: true, repeat: 1 }, 3.7)
        .to(stage, { scale: 1, ease: 'power1.inOut', duration: 0.5 }, 4.6)
        .to(mira, { rotation: 5, duration: 0.12, yoyo: true, repeat: 1 }, 5.4)
        .to(mira, { rotation: -5, duration: 0.12, yoyo: true, repeat: 1 }, 5.7);
      // the jump: swap mid-air, squash on landing, hold for the muffled reply, then run
      tl.to(mira, { x: '64vw', duration: 1.6, ease: 'none' }, 7.4)
        .to(mira, { y: '-26svh', duration: 0.8, ease: 'power2.out' }, 7.4)
        .to(mira, { y: 0, duration: 0.8, ease: 'power2.in' }, 8.2)
        .set(a, { opacity: 0 }, 7.4).set($('img.d', mira), { opacity: 1 }, 7.4)
        .set($('img.d', mira), { opacity: 0 }, 8.1).set(b, { opacity: 1 }, 8.1)
        .to(env, { scale: 0, rotate: 40, transformOrigin: '50% 100%', duration: 0.25 }, 8.1)
        .fromTo(puff, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1.6, duration: 0.3 }, 8.1)
        .to(puff, { opacity: 0, duration: 0.3 }, 8.5)
        .to(mira, { scaleY: 0.88, scaleX: 1.08, transformOrigin: '50% 100%', duration: 0.1, yoyo: true, repeat: 1 }, 9.0)
        .to(mira, { x: '112vw', duration: 1.4, ease: 'power1.in' }, 11.0);
      label(tl, $('.cap', root), 0.5, 1.9);
      label(tl, $$('.tag', $('.props', root))[1], 0.2, 0.8);
      label(tl, $('.tag', mira), 2.5, 0.8);
      label(tl, $$('.tag', $('.props', root))[0], 4.65, 0.55);
      say(tl, bub(root, 'h1'), 1.1, 1.3);
      say(tl, bub(root, 'h2'), 3.4, 1.2);
      say(tl, bub(root, 'h3'), 5.0, 1.1);
      say(tl, bub(root, 'h8'), 6.3, 1.0);
      say(tl, bub(root, 'h4'), 8.7, 1.1);
      say(tl, bub(root, 'h5'), 10.0, 0.9);
      say(tl, bub(root, 'h6'), 11.3, 1.4);
      say(tl, bub(root, 'h7'), 12.9, 1.4);
      tl.to({}, { duration: 0.3 }, 14.3);
    }

    // CH3 — chase: parallax street, humans gain, Gabi calls it, they fade, the street stops, they collapse
    {
      const LEN = 520;
      const root = $('#chase'), tl = pinTL('#chase', LEN);
      const vlad = $('.vlad', root), anna = $('.anna', root), gabi = $('.gabi', root), mira = $('.mira', root);
      const humans = [vlad, anna];
      // [element, total scroll distance]; leg one runs fast, then a long deadpan stall, then the dogs leave
      [[$('.bg.clouds', root), 1200], [$('.bg.far', root), 2400], [$('.bg.near', root), 5200], [$('.dash', root), 7000]].forEach(([el, d]) => {
        tl.to(el, { '--bx': `-${d * 0.97}px`, duration: 8.6 }, 0)
          .to(el, { '--bx': `-${d}px`, duration: 1 }, 12.6);
      });
      tl.to(anna, { x: '12vw', duration: 5.5, ease: 'power1.out' }, 0)
        .to(vlad, { x: '6vw', duration: 5.5, ease: 'power1.out' }, 0)
        .to(anna, { x: '-4vw', duration: 3.1, ease: 'power1.in' }, 5.5)
        .to(vlad, { x: '-6vw', duration: 3.1, ease: 'power1.in' }, 5.5)
        .to(gabi, { x: '6vw', duration: 5 }, 0)
        .to(mira, { x: '8vw', duration: 5 }, 0)
        .to(humans, { scaleY: 0.88, transformOrigin: '50% 100%', duration: 0.4 }, 8.6)
        .to(vlad, { rotation: -10, duration: 0.6 }, 8.6)
        .to(anna, { rotation: 8, duration: 0.6 }, 8.6)
        .to([gabi, mira], { x: '64vw', duration: 1, ease: 'power2.in' }, 12.6);
      label(tl, $('.cap', root), 0.5, 1.9);
      say(tl, bub(root, 'c1'), 0.3, 1.3);
      say(tl, bub(root, 'c6'), 1.8, 1.2);
      say(tl, bub(root, 'c2'), 3.2, 1.3);
      say(tl, bub(root, 'c3'), 4.7, 1.3);
      label(tl, $('.tag', anna), 5.0, 1.4);
      say(tl, bub(root, 'c4'), 6.6, 1.3);
      say(tl, bub(root, 'c5'), 8.9, 1.2);
      say(tl, bub(root, 'c7'), 10.3, 0.9);
      say(tl, bub(root, 'c8'), 11.3, 1.1);
      tl.to({}, { duration: 0.3 }, 13.6);
      // class states follow scroll progress so scrubbing back up undoes them
      const total = tl.duration();
      ScrollTrigger.create({ trigger: root, start: 'top top', end: `+=${LEN}%`, onUpdate: (self) => {
        const at = (u) => u / total, p = self.progress;
        humans.forEach((h) => h.classList.toggle('spent', p >= at(8.6)));
        root.classList.toggle('stall', p >= at(8.6) && p < at(12.6));
        mira.classList.toggle('look', p >= at(11.0) && p < at(12.4));
      } });
    }

    // CH4 — the drop: dogs arrive, envelope falls, tap to open, humans limp in
    {
      const root = $('#drop');
      const gabi = $('.dogbox.gabi', root), mira = $('.dogbox.mira', root), envWrap = $('.env-wrap', root);
      gsap.set(envWrap, { autoAlpha: 0 });
      gsap.set([gabi, mira], { x: '-120vw' });
      ScrollTrigger.create({
        trigger: root, start: 'top 55%', once: true,
        onEnter: () => {
          gabi.classList.add('hop'); mira.classList.add('hop');
          const tl = gsap.timeline();
          tl.to([gabi, mira], { x: 0, duration: 2.2, ease: 'power3.out', stagger: 0.25 })
            .add(() => {
              gabi.classList.remove('hop'); mira.classList.remove('hop');
              gabi.classList.add('landed'); mira.classList.add('landed');
            })
            .fromTo(envWrap, { autoAlpha: 0, y: -260, rotation: -25 }, { autoAlpha: 1, y: 0, rotation: 0, duration: 1.3, ease: 'bounce.out' })
            .add(() => say(gsap.timeline(), bub(root, 'd1'), 0, 3.2), '-=0.6')
            .add(() => label(gsap.timeline(), $('.tag.corner', root), 0, 3), '-=0.2')
            // Gabi says her bit, then Mira gets the last word while they wait
            .add(() => { if (!opened) say(gsap.timeline(), bub(root, 'd4'), 0, 600); }, '+=3.4');
        },
      });
    }
  }

  // humans limp in once the envelope is opened (works with or without GSAP)
  function humansArrive() {
    const box = $('.humans');
    box.classList.add('show');
    if (!canAnimate) { $$('.humans .bubble:is([data-i18n=d2],[data-i18n=d3])').forEach((b) => { b.style.opacity = 1; b.style.visibility = 'visible'; }); return; }
    const l = $('.hum.left'), r = $('.hum.right');
    gsap.from(l, { x: '-70vw', duration: 1.6, ease: 'power3.out' });
    gsap.from(r, { x: '70vw', duration: 1.6, ease: 'power3.out' });
    const tl = gsap.timeline();
    // one line at a time; a breath before Anna's line so the sincere bit gets its own moment
    say(tl, bub(l, 'd2'), 1.4, 2.2);
    say(tl, bub(r, 'd3'), 4.2, 3.8);
    say(tl, bub(l, 'd5'), 8.3, 3.4);
    say(tl, bub($('.dogbox.gabi'), 'd7'), 12.0, 600);
  }

  // ---------- envelope + confetti ----------
  const env = $('#env');
  let opened = false;
  env.addEventListener('click', () => {
    const open = env.classList.toggle('open');
    env.setAttribute('aria-expanded', open);
    $('#hint').innerHTML = open ? t().envHintOpen : t().envHint;
    if (open) {
      burst();
      if (canAnimate) gsap.to([bub($('#drop'), 'd1'), bub($('#drop'), 'd4')], { autoAlpha: 0, duration: 0.2, overwrite: true });
      // let the confetti hang in the air for a deadpan beat before the couple walks in
      if (!opened) { opened = true; setTimeout(humansArrive, 1800); }
    }
  });

  const cv = $('#confetti');
  const ctx = cv.getContext('2d');
  let parts = [];
  const fit = () => { cv.width = innerWidth; cv.height = innerHeight; };
  fit();
  addEventListener('resize', fit);
  const COLORS = ['#FF5A45', '#FF8FB8', '#FFC93C', '#3DBE8B', '#B9A6FF', '#fff'];
  function burst() {
    if (reduceMotion) return;
    const r = env.getBoundingClientRect();
    const was = parts.length;
    for (let i = 0; i < 140; i++) {
      parts.push({
        x: r.left + r.width / 2, y: r.top,
        vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 4,
        s: 6 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        c: COLORS[i % COLORS.length], life: 120 + Math.random() * 60,
      });
    }
    if (!was) loop();
  }
  function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter((p) => p.life > 0 && p.y < cv.height + 20);
    parts.forEach((p) => {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    });
    if (parts.length) requestAnimationFrame(loop);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  }

  // ---------- countdown + calendar ----------
  const cd = $('#countdown');
  function tick() {
    const left = new Date(W.date) - Date.now();
    if (left <= 0) { cd.className = 'countdown done'; cd.textContent = t().cdDone; return; }
    cd.className = 'countdown';
    const v = [Math.floor(left / 864e5), Math.floor(left / 36e5) % 24, Math.floor(left / 6e4) % 60, Math.floor(left / 1e3) % 60];
    cd.innerHTML = ['d', 'h', 'm', 's'].map((k, i) => `<div>${String(v[i]).padStart(2, '0')}<small>${t().units[k]}</small></div>`).join('');
  }
  setInterval(tick, 1000);

  $('#calBtn').addEventListener('click', () => {
    // UTC ("Z") so every calendar app lands on the same moment, whatever the guest's time zone
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const start = new Date(W.date);
    const end = new Date(start.getTime() + 6 * 36e5);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//wedding invite//EN', 'BEGIN:VEVENT',
      'UID:wedding-' + start.getTime() + '@invite', 'DTSTAMP:' + fmt(new Date()),
      'DTSTART:' + fmt(start), 'DTEND:' + fmt(end), 'SUMMARY:' + t().calTitle,
      'LOCATION:' + t().venueName + ', ' + t().venueAddress, 'URL:' + W.mapUrl, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'wedding.ics';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------- autoplay, chapter jumps, idle hint, per-scene music ----------
  function buildControls() {
    const SPEED = 0.12; // autoscroll, in screen heights per second: slow enough to read every bubble
    // chapter positions come from ScrollTrigger (DOM rects drift while a section is pinned on touch devices)
    const marks = ['.cover', '#infil', '#heist', '#chase', '#drop', '.info'].map((q) =>
      ScrollTrigger.create({ trigger: q, start: 'top top', refreshPriority: -1 }));
    const dropMark = marks[4];
    const stops = () => marks.map((m) => Math.round(m.start));
    const maxY = () => document.documentElement.scrollHeight - innerHeight;
    // scroll through ScrollTrigger so its cached position stays in sync on touch devices (normalizeScroll)
    const scrollTo = ScrollTrigger.getScrollFunc(window);
    let playing = false, last = 0, acc = 0, lastSet = 0, stopAt = Infinity;

    const setPlaying = (on) => {
      playing = on;
      document.body.classList.toggle('playing', on);
      $('#playBtn').setAttribute('aria-label', on ? t().aPause : t().aPlay);
      if (on) { acc = lastSet = scrollY; last = performance.now(); requestAnimationFrame(step); }
    };
    function step(now) {
      if (!playing) return;
      acc += SPEED * innerHeight * Math.min(0.05, (now - last) / 1000);
      last = now;
      // hold at the envelope until it's opened, and at the very end
      // someone dragged the scrollbar: hand control back
      if (Math.abs(scrollY - lastSet) > 40) { setPlaying(false); return; }
      const target = Math.min(acc, opened ? maxY() : stopAt, maxY());
      lastSet = Math.round(target);
      scrollTo(lastSet);
      ScrollTrigger.update();
      if (target < acc) { setPlaying(false); return; }
      requestAnimationFrame(step);
    }
    const play = () => {
      stopAt = dropMark.start;
      if (scrollY >= maxY() - 2) scrollTo(0);
      setPlaying(true);
    };
    const jump = (dir) => {
      setPlaying(false);
      const y = scrollY, list = stops();
      const to = dir > 0 ? list.find((s) => s > y + 5) : [...list].reverse().find((s) => s < y - 5);
      if (to !== undefined) scrollTo(Math.min(to, maxY()));
    };
    const sound = () => {
      const on = Music.toggle();
      $('#soundBtn').setAttribute('aria-pressed', on);
    };

    $('#playBtn').addEventListener('click', () => (playing ? setPlaying(false) : play()));
    $('#prevBtn').addEventListener('click', () => jump(-1));
    $('#nextBtn').addEventListener('click', () => jump(1));
    $('#soundBtn').addEventListener('click', sound);
    $('#playBig').addEventListener('click', () => { if (!Music.on) sound(); play(); });
    // the guest grabbing the wheel always wins
    ['wheel', 'touchstart'].forEach((ev) => addEventListener(ev, (e) => {
      if (playing && !e.target.closest('.ctrl, .play-big')) setPlaying(false);
    }, { passive: true }));
    addEventListener('keydown', (e) => { if (playing && /Arrow|Page|Home|End|^ $/.test(e.key)) setPlaying(false); });
    // the drop scene: resume the ride once the envelope is open
    env.addEventListener('click', () => { if (env.classList.contains('open') && stopAt !== Infinity && !playing && scrollY >= stopAt - 2) setTimeout(play, 12000); });

    // idle hint: nudge if the page sits still mid-story
    const hint = $('#idleHint');
    let idle;
    const resetIdle = () => {
      hint.classList.remove('show');
      clearTimeout(idle);
      idle = setTimeout(() => {
        const atDrop = scrollY >= dropMark.start - innerHeight / 2;
        if (!playing && !atDrop) hint.classList.add('show');
      }, 5000);
    };
    addEventListener('scroll', resetIdle, { passive: true });
    resetIdle();

    // music follows the scene in the middle of the screen
    [['.cover', 'sneak'], ['#infil', 'sneak'], ['#heist', 'heist'], ['#chase', 'chase'], ['#drop', 'love'], ['.info', 'love']].forEach(([q, name]) => {
      if ($(q)) ScrollTrigger.create({ trigger: q, start: 'top center', end: 'bottom center', refreshPriority: -1, onToggle: (self) => self.isActive && Music.scene(name) });
    });
  }

  applyLang();
  if (canAnimate) {
    buildStory();
    buildControls();
    addEventListener('load', () => ScrollTrigger.refresh());
  } else {
    $('.dogbox.gabi').classList.add('landed');
    $('.dogbox.mira').classList.add('landed');
    $('#drop .bubble[data-i18n="d1"]').style.cssText = 'opacity:1;visibility:visible';
  }
})();
