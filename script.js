(function () {
  'use strict';

  /* ─────────────────────────────────────────
     Constants
  ───────────────────────────────────────── */
  const ADMIN_KEY     = 'ga-admin-data';
  const FS_COLLECTION = 'site';
  const FS_DOC        = 'data';
  const TOTAL_DOSSIER = 24;

  /* ─────────────────────────────────────────
     Firebase init (graceful if not configured)
  ───────────────────────────────────────── */
  let db = null;
  let firebaseReady = false;

  try {
    if (typeof firebaseConfig !== 'undefined' &&
        !firebaseConfig.apiKey.startsWith('COLE_AQUI') &&
        !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      firebaseReady = true;
    } else if (typeof firebaseConfig !== 'undefined' &&
               !firebaseConfig.apiKey.startsWith('COLE_AQUI') &&
               firebase.apps.length) {
      db = firebase.firestore();
      firebaseReady = true;
    }
  } catch (e) {
    console.warn('Firebase não disponível — usando dados locais.', e);
  }

  /* ─────────────────────────────────────────
     Admin data (starts from localStorage cache)
  ───────────────────────────────────────── */
  let adminData = { tags: [], projects: {}, dossier: {} };
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    if (raw) adminData = JSON.parse(raw);
  } catch (_) {}

  /* ─────────────────────────────────────────
     Load from Firestore (async, re-renders on success)
  ───────────────────────────────────────── */
  async function loadFromFirestore() {
    if (!firebaseReady || !db) return;
    try {
      const snap = await db.collection(FS_COLLECTION).doc(FS_DOC).get();
      if (snap.exists) {
        const data = snap.data();
        if (!Array.isArray(data.tags)) data.tags = [];
        if (!data.dossier)  data.dossier  = {};
        adminData = data;
        // Cache locally for offline
        try { localStorage.setItem(ADMIN_KEY, JSON.stringify(data)); } catch (_) {}
        // Re-render with Firestore data
        const lang = document.documentElement.lang || 'en';
        if (translations && translations[lang]) {
          renderDossierCards(translations[lang]);
        }
      }
    } catch (e) {
      console.warn('Falha ao carregar Firestore, usando cache local.', e);
    }
  }

  /* ─────────────────────────────────────────
     IntersectionObserver (declared early)
  ───────────────────────────────────────── */
  const animateOnScroll = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        animateOnScroll.unobserve(entry.target);
      }
    });
  }, { root: null, rootMargin: '0px 0px -80px 0px', threshold: 0.08 });

  /* ─────────────────────────────────────────
     Build a manga-panel figure
  ───────────────────────────────────────── */
  function buildMangaPanel(imageSrc, placeholderText) {
    const fig = document.createElement('figure');
    fig.className = 'manga-panel';
    ['tl', 'tr', 'bl', 'br'].forEach(p => {
      const s = document.createElement('span');
      s.className = `manga-corner manga-corner-${p}`;
      fig.appendChild(s);
    });
    if (imageSrc) {
      const img = document.createElement('img');
      img.src = imageSrc;
      img.alt = '';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      fig.appendChild(img);
    } else {
      const lbl = document.createElement('div');
      lbl.className = 'manga-panel-label';
      lbl.textContent = placeholderText;
      fig.appendChild(lbl);
    }
    return fig;
  }

  /* ─────────────────────────────────────────
     Build one dossier card
  ───────────────────────────────────────── */
  function buildDossierCard(n, dict) {
    const ov = (adminData.dossier && adminData.dossier[n]) || {};

    const year  = ov.year  || dict[`dossier_${n}_year`]  || '';
    const title = ov.title || dict[`dossier_${n}_title`] || '';
    const desc  = ov.desc  || dict[`dossier_${n}_desc`]  || '';
    const tag   = ov.tag   || dict[`dossier_${n}_tag`]   || '';
    const image = ov.image || null;

    const card = document.createElement('div');
    card.className = 'dossier-card animate-on-scroll';

    const imgDiv = document.createElement('div');
    imgDiv.className = 'dossier-card-image';
    imgDiv.appendChild(buildMangaPanel(image, dict['img_placeholder'] || 'photo / illustration'));

    const body = document.createElement('div');
    body.className = 'dossier-card-body';
    body.innerHTML =
      `<div class="dossier-year-badge">${year}</div>` +
      `<h4 class="dossier-card-title">${title}</h4>` +
      `<p class="dossier-card-desc">${desc}</p>` +
      `<span class="dossier-tag">${tag}</span>`;

    card.appendChild(imgDiv);
    card.appendChild(body);
    return card;
  }

  /* ─────────────────────────────────────────
     Render all dossier cards
  ───────────────────────────────────────── */
  function renderDossierCards(dict) {
    const container = document.getElementById('dossierCards');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= TOTAL_DOSSIER; i++) {
      const el = buildDossierCard(i, dict);
      container.appendChild(el);
      animateOnScroll.observe(el);
    }
  }

  /* ─────────────────────────────────────────
     i18n
  ───────────────────────────────────────── */
  function setLanguage(lang) {
    if (!translations[lang]) return;
    const dict = translations[lang];

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key] != null) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (dict[key] != null) el.innerHTML = dict[key];
    });

    document.documentElement.lang = lang;
    if (dict.page_title) document.title = dict.page_title;

    document.querySelectorAll('.lang-btn').forEach(btn =>
      btn.classList.toggle('active', btn.getAttribute('data-lang') === lang)
    );

    renderDossierCards(dict);

    try { localStorage.setItem('site-lang', lang); } catch (_) {}
  }

  /* ─────────────────────────────────────────
     Navigation toggle (mobile)
  ───────────────────────────────────────── */
  const navToggle = document.getElementById('navToggle');
  const navLinks  = document.getElementById('navLinks');
  const nav       = document.getElementById('nav');

  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    navToggle.classList.toggle('active');
  });
  document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.classList.remove('active');
    });
  });

  /* ─────────────────────────────────────────
     Sticky nav
  ───────────────────────────────────────── */
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 60);
  }, { passive: true });

  /* ─────────────────────────────────────────
     Smooth scroll
  ───────────────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const target = document.querySelector(this.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - (nav.offsetHeight + 20);
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ─────────────────────────────────────────
     Observe static animated elements
  ───────────────────────────────────────── */
  document.querySelectorAll('.identity-card, .writing-card, .contact-card, .section-header').forEach(el => {
    el.classList.add('animate-on-scroll');
    animateOnScroll.observe(el);
  });

  /* ─────────────────────────────────────────
     Tilt on identity cards
  ───────────────────────────────────────── */
  if (window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.identity-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top)  / r.height - 0.5) * -8;
        const ry = ((e.clientX - r.left) / r.width  - 0.5) *  8;
        card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ─────────────────────────────────────────
     Hero subtitle flicker
  ───────────────────────────────────────── */
  const subtitleEm = document.querySelector('.hero-subtitle em');
  if (subtitleEm) {
    setInterval(() => {
      subtitleEm.style.opacity = '0.5';
      setTimeout(() => { subtitleEm.style.opacity = '1'; }, 120);
    }, 3200);
  }

  /* ─────────────────────────────────────────
     Language switcher
  ───────────────────────────────────────── */
  document.getElementById('langSwitcher').addEventListener('click', e => {
    const btn = e.target.closest('.lang-btn');
    if (!btn) return;
    setLanguage(btn.getAttribute('data-lang'));
  });

  /* ─────────────────────────────────────────
     Init — render immediately with local/cache data,
     then silently refresh from Firestore
  ───────────────────────────────────────── */
  const savedLang = (() => { try { return localStorage.getItem('site-lang'); } catch (_) { return null; } })();
  setLanguage(savedLang || 'en');

  // Load Firestore data in background (no spinner shown to visitor)
  loadFromFirestore();

})();
