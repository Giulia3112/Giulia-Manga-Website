(function () {
  'use strict';

  /* ─────────────────────────────────────────
     Config
  ───────────────────────────────────────── */
  const STORAGE_KEY    = 'ga-admin-data';
  const FS_COLLECTION  = 'site';
  const FS_DOC         = 'data';
  const TOTAL_DOSSIER  = 24;

  /* ─────────────────────────────────────────
     Firebase init (graceful if not configured)
  ───────────────────────────────────────── */
  let db = null, storage = null, auth = null;
  let firebaseReady = false;
  let storageReady  = false;

  try {
    if (typeof firebaseConfig !== 'undefined' &&
        !firebaseConfig.apiKey.startsWith('COLE_AQUI')) {
      // Avoid duplicate initialization across page reloads
      const app = firebase.apps.length
        ? firebase.app()
        : firebase.initializeApp(firebaseConfig);
      db   = firebase.firestore();
      auth = firebase.auth();
      firebaseReady = true;

      // Storage is optional — only needed for image uploads
      try {
        // Pass bucket URL explicitly to support new .firebasestorage.app format
        const bucket = firebaseConfig.storageBucket
          ? `gs://${firebaseConfig.storageBucket}`
          : undefined;
        storage = bucket ? firebase.storage(bucket) : firebase.storage();
        storageReady = true;
        console.log('[Admin] Firebase Storage inicializado:', firebaseConfig.storageBucket);
      } catch (se) {
        console.warn('Firebase Storage não disponível — imagens serão salvas sem Storage.', se);
      }
    }
  } catch (e) {
    console.error('Erro ao inicializar Firebase:', e);
  }

  /* ─────────────────────────────────────────
     Default tags & project defs
  ───────────────────────────────────────── */
  const DEFAULT_TAGS = [
    'venture', 'empreendimento', 'acadêmico', 'impacto', 'artista',
    'inventora', 'liderança', 'reconhecimento', 'ecossistema', 'medalha',
    'competição', 'pesquisa', 'design', 'social'
  ];

  const t = (typeof translations !== 'undefined') ? translations.en : {};

  /* ─────────────────────────────────────────
     localStorage helpers
  ───────────────────────────────────────── */
  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (!Array.isArray(d.tags)) d.tags = [...DEFAULT_TAGS];
        if (!d.projects) d.projects = {};
        if (!d.dossier)  d.dossier  = {};
        return d;
      }
    } catch (_) {}
    return { tags: [...DEFAULT_TAGS], projects: {}, dossier: {} };
  }

  function cacheLocal(data) {
    try {
      // Strip base64 images before caching (Storage handles those)
      const slim = JSON.parse(JSON.stringify(data));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (_) {}
  }

  let appData = loadLocal();

  /* ─────────────────────────────────────────
     Firebase helpers
  ───────────────────────────────────────── */

  // Upload a base64 image to Firebase Storage with timeout
  async function uploadImageToStorage(path, base64) {
    const ref = storage.ref(path);
    const upload = ref.putString(base64, 'data_url').then(() => ref.getDownloadURL());
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 12000)
    );
    return Promise.race([upload, timeout]);
  }

  // Prepare data for Firestore: upload images to Storage; strip base64 if Storage fails
  async function prepareForFirestore(data) {
    const out = JSON.parse(JSON.stringify(data));

    for (let n = 1; n <= TOTAL_DOSSIER; n++) {
      const entry = out.dossier && out.dossier[n];
      if (entry && entry.image && entry.image.startsWith('data:')) {
        if (storageReady) {
          setStatus(`⟳ Enviando imagem ${n}/${TOTAL_DOSSIER} para o Storage…`);
          try {
            const url = await uploadImageToStorage(`images/dossier/${n}`, entry.image);
            out.dossier[n].image = url;
            appData.dossier[n].image = url;
          } catch (e) {
            console.warn(`Storage falhou para imagem #${n} (${e.message}) — imagem removida do Firestore`);
            delete out.dossier[n].image; // Remove base64 to avoid Firestore size limit
          }
        } else {
          delete out.dossier[n].image; // No Storage = no images in Firestore
        }
      }
    }

    return out;
  }

  // Save to Firestore
  async function saveToFirestore(data) {
    const user = auth.currentUser;
    console.log('[Admin] Auth user:', user ? user.email : 'NÃO LOGADO');

    if (!user) {
      throw Object.assign(new Error('Usuário não autenticado. Faça login novamente.'), { code: 'unauthenticated' });
    }

    // Force token refresh so Firestore receives a valid auth header
    await user.getIdToken(true);

    console.log('[Admin] Token atualizado. Salvando no Firestore…');
    console.log('[Admin] Tamanho dos dados (chars):', JSON.stringify(data).length);
    await db.collection(FS_COLLECTION).doc(FS_DOC).set(data);
    console.log('[Admin] ✓ Salvo com sucesso!');
  }

  // Load from Firestore
  async function loadFromFirestore() {
    const snap = await db.collection(FS_COLLECTION).doc(FS_DOC).get();
    return snap.exists ? snap.data() : null;
  }

  /* ─────────────────────────────────────────
     Image compression
  ───────────────────────────────────────── */
  function compressImage(file, cb) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 900;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ─────────────────────────────────────────
     Status message helper — sidebar + toast
  ───────────────────────────────────────── */
  let toastTimer = null;

  function setStatus(msg, color) {
    // Sidebar message
    const el = document.getElementById('saveMsg');
    if (el) { el.textContent = msg; el.style.color = color || '#888'; }

    // Toast notification at top of screen
    let toast = document.getElementById('adminToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'adminToast';
      toast.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        padding: 0.75rem 1.5rem;
        font-family: monospace; font-size: 0.8rem; font-weight: 600;
        text-align: center; letter-spacing: 0.04em;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(toast);
    }

    clearTimeout(toastTimer);

    if (!msg) {
      toast.style.opacity = '0';
      setTimeout(() => { toast.style.display = 'none'; }, 350);
      return;
    }

    const bg = color === '#1a7a4a' ? '#d4edda'
             : color === '#b92b27' ? '#f8d7da'
             : color === '#e08a00' ? '#fff3cd'
             : '#e9ecef';
    const tc = color || '#333';
    toast.style.background = bg;
    toast.style.color = tc;
    toast.style.borderBottom = `2px solid ${tc}`;
    toast.style.display = 'block';
    toast.style.opacity = '1';
    toast.textContent = msg;

    // Errors stay until dismissed; success/info auto-clear
    if (color !== '#b92b27') {
      toastTimer = setTimeout(() => setStatus(''), 8000);
    }
  }

  /* ─────────────────────────────────────────
     Image upload widget
  ───────────────────────────────────────── */
  function buildImageWidget(initialSrc, onChange) {
    const container = document.createElement('div');
    container.className = 'img-widget' + (initialSrc ? ' has-image' : '');

    const placeholder = document.createElement('div');
    placeholder.className = 'img-widget-placeholder';
    placeholder.innerHTML =
      '<span class="img-widget-icon">⊕</span>' +
      '<span class="img-widget-label">Arraste uma imagem aqui<br>ou clique para selecionar</span>';

    const preview = document.createElement('img');
    preview.className = 'img-widget-preview';
    preview.alt = 'preview';
    if (initialSrc) preview.src = initialSrc;

    const overlay = document.createElement('div');
    overlay.className = 'img-widget-overlay';
    const oChange = document.createElement('button');
    oChange.className = 'img-overlay-btn'; oChange.type = 'button';
    oChange.textContent = '⟳ Trocar imagem';
    const oRemove = document.createElement('button');
    oRemove.className = 'img-overlay-btn remove'; oRemove.type = 'button';
    oRemove.textContent = '✕ Remover';
    overlay.appendChild(oChange); overlay.appendChild(oRemove);

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*';
    fileInput.className = 'img-file-input';

    container.appendChild(placeholder);
    container.appendChild(preview);
    container.appendChild(overlay);
    container.appendChild(fileInput);

    const actionsBar = document.createElement('div');
    actionsBar.className = 'img-widget-actions';
    const browseBtn = document.createElement('button');
    browseBtn.type = 'button'; browseBtn.className = 'img-action-btn';
    browseBtn.textContent = 'Browse...';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button'; removeBtn.className = 'img-action-btn remove';
    removeBtn.textContent = 'Remover imagem';
    actionsBar.appendChild(browseBtn); actionsBar.appendChild(removeBtn);

    const setImage = (src) => {
      preview.src = src || '';
      container.classList.toggle('has-image', !!src);
      onChange(src || null);
    };

    const handleFile = (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      compressImage(file, (b64) => setImage(b64));
    };

    fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
    container.addEventListener('click', (e) => {
      if (!e.target.closest('.img-widget-overlay')) fileInput.click();
    });
    oChange.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    oRemove.addEventListener('click', (e) => { e.stopPropagation(); setImage(null); });
    browseBtn.addEventListener('click', () => fileInput.click());
    removeBtn.addEventListener('click', () => setImage(null));

    container.addEventListener('dragenter', (e) => { e.preventDefault(); container.classList.add('dragging'); });
    container.addEventListener('dragover', (e) => { e.preventDefault(); });
    container.addEventListener('dragleave', () => container.classList.remove('dragging'));
    container.addEventListener('drop', (e) => {
      e.preventDefault(); container.classList.remove('dragging');
      handleFile(e.dataTransfer.files[0]);
    });

    const wrapper = document.createElement('div');
    wrapper.appendChild(container); wrapper.appendChild(actionsBar);
    return wrapper;
  }

  /* ─────────────────────────────────────────
     Tag picker
  ───────────────────────────────────────── */
  const tagPickerRefreshers = [];

  function buildTagPicker(currentTag, onChange) {
    const state = { current: currentTag };
    const el = document.createElement('div');
    el.className = 'tag-picker';

    const render = () => {
      el.innerHTML = '';
      appData.tags.forEach(tag => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag-chip' + (tag === state.current ? ' active' : '');
        chip.textContent = tag;
        chip.addEventListener('click', () => {
          state.current = tag; onChange(tag); render();
        });
        el.appendChild(chip);
      });
    };
    render();
    return { el, refresh: render };
  }

  function refreshAllTagPickers() {
    tagPickerRefreshers.forEach(fn => fn());
  }

  /* ─────────────────────────────────────────
     Form field helper
  ───────────────────────────────────────── */
  function mkField(labelText, inputType, initialValue, onInput) {
    const wrap = document.createElement('div');
    wrap.className = 'adm-field';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    let input;
    if (inputType === 'textarea') {
      input = document.createElement('textarea');
    } else {
      input = document.createElement('input');
      input.type = inputType;
    }
    input.value = initialValue || '';
    input.addEventListener('input', () => onInput(input.value));
    wrap.appendChild(input);
    return wrap;
  }

  /* ─────────────────────────────────────────
     Dossier card editor
  ───────────────────────────────────────── */
  function buildDossierEditor(n) {
    const saved = appData.dossier[n] || {};
    const cur = {
      year:  saved.year  ?? (t[`dossier_${n}_year`]  || ''),
      title: saved.title ?? (t[`dossier_${n}_title`] || ''),
      desc:  saved.desc  ?? (t[`dossier_${n}_desc`]  || ''),
      tag:   saved.tag   ?? (t[`dossier_${n}_tag`]   || ''),
      image: saved.image ?? null
    };
    const ensure = () => { if (!appData.dossier[n]) appData.dossier[n] = {}; };

    const card = document.createElement('div');
    card.className = 'adm-card adm-dossier-card';

    const imgCol = document.createElement('div');
    imgCol.className = 'adm-dossier-img-col';
    const imgHdr = document.createElement('div');
    imgHdr.className = 'adm-card-header';
    imgHdr.innerHTML = `<span class="adm-card-id">#${n}</span><span class="adm-card-year" id="year-badge-${n}">${cur.year}</span>`;
    imgCol.appendChild(imgHdr);
    imgCol.appendChild(buildImageWidget(cur.image, (src) => { ensure(); appData.dossier[n].image = src; }));
    card.appendChild(imgCol);

    const fieldsCol = document.createElement('div');
    fieldsCol.className = 'adm-dossier-fields-col';

    const row1 = document.createElement('div'); row1.className = 'adm-row';
    row1.appendChild(mkField('Ano', 'text', cur.year, v => {
      ensure(); appData.dossier[n].year = v;
      const badge = document.getElementById(`year-badge-${n}`);
      if (badge) badge.textContent = v;
    }));
    row1.appendChild(mkField('Título', 'text', cur.title, v => { ensure(); appData.dossier[n].title = v; }));
    fieldsCol.appendChild(row1);
    fieldsCol.appendChild(mkField('Descrição', 'textarea', cur.desc, v => { ensure(); appData.dossier[n].desc = v; }));

    const tagField = document.createElement('div');
    tagField.className = 'adm-field';
    const tagLbl = document.createElement('label'); tagLbl.textContent = 'Tag';
    tagField.appendChild(tagLbl);
    const { el: tagEl, refresh } = buildTagPicker(cur.tag, (val) => { ensure(); appData.dossier[n].tag = val; });
    tagField.appendChild(tagEl);
    fieldsCol.appendChild(tagField);
    tagPickerRefreshers.push(refresh);

    card.appendChild(fieldsCol);
    return card;
  }

  /* ─────────────────────────────────────────
     Tags manager
  ───────────────────────────────────────── */
  function renderTagsManager() {
    const mgr = document.getElementById('tagsManager');
    mgr.innerHTML = '';
    document.getElementById('tagsCount').textContent = `${appData.tags.length} tags`;

    const box = document.createElement('div');
    box.className = 'tags-mgr-box';

    const h3 = document.createElement('h3');
    h3.textContent = 'Tags disponíveis';
    box.appendChild(h3);

    const list = document.createElement('div');
    list.className = 'tags-current';
    box.appendChild(list);

    const renderPills = () => {
      list.innerHTML = '';
      document.getElementById('tagsCount').textContent = `${appData.tags.length} tags`;
      appData.tags.forEach(tag => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        const span = document.createElement('span'); span.textContent = tag;
        const del = document.createElement('button');
        del.className = 'tag-pill-del'; del.type = 'button';
        del.title = 'Remover tag'; del.innerHTML = '&times;';
        del.addEventListener('click', () => {
          appData.tags = appData.tags.filter(t => t !== tag);
          renderPills(); refreshAllTagPickers();
        });
        pill.appendChild(span); pill.appendChild(del);
        list.appendChild(pill);
      });
    };
    renderPills();

    const addRow = document.createElement('div');
    addRow.className = 'tags-add-row';
    const tagInput = document.createElement('input');
    tagInput.type = 'text'; tagInput.placeholder = 'Nova tag — ex: liderança';
    const addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.textContent = '+ Adicionar';
    const doAdd = () => {
      const v = tagInput.value.trim().toLowerCase();
      if (v && !appData.tags.includes(v)) {
        appData.tags.push(v); tagInput.value = '';
        renderPills(); refreshAllTagPickers();
      }
    };
    addBtn.addEventListener('click', doAdd);
    tagInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    addRow.appendChild(tagInput); addRow.appendChild(addBtn);
    box.appendChild(addRow);

    const tip = document.createElement('p');
    tip.className = 'tags-tip';
    tip.innerHTML = '💡 As tags aparecem como opções de seleção em todos os cards de <strong>Achievements</strong>. Ao remover uma tag, cards que já a usavam continuam com o valor salvo.';
    box.appendChild(tip);

    mgr.appendChild(box);
  }

  /* ─────────────────────────────────────────
     Firebase badge in header
  ───────────────────────────────────────── */
  function showFirebaseStatus() {
    const existing = document.getElementById('fbStatus');
    if (existing) existing.remove();
    const badge = document.createElement('span');
    badge.id = 'fbStatus';
    let label, color;
    if (firebaseReady && storageReady) {
      label = '● Firebase + Storage'; color = '#27ae60';
    } else if (firebaseReady) {
      label = '● Firebase (sem Storage)'; color = '#2980b9';
    } else {
      label = '● Modo local (Firebase não conectado)'; color = '#e08a00';
    }
    badge.style.cssText = `
      font-family: var(--font-mono);
      font-size: 0.58rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 0.2rem 0.6rem;
      border: 1px solid ${color};
      color: ${color};
    `;
    badge.textContent = label;
    const headerRight = document.querySelector('.adm-header-right');
    if (headerRight) headerRight.prepend(badge);
  }

  /* ─────────────────────────────────────────
     Render all editors
  ───────────────────────────────────────── */
  function renderAll() {
    tagPickerRefreshers.length = 0;

    const dGrid = document.getElementById('dossierGrid');
    dGrid.innerHTML = '';
    for (let i = 1; i <= TOTAL_DOSSIER; i++) {
      dGrid.appendChild(buildDossierEditor(i));
    }

    renderTagsManager();
    showFirebaseStatus();
  }

  /* ─────────────────────────────────────────
     LOGIN — Firebase Auth or local fallback
  ───────────────────────────────────────── */
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPass').value;
    const errEl = document.getElementById('loginError');
    const btn   = e.target.querySelector('button[type=submit]');

    btn.textContent = 'Entrando…';
    btn.disabled = true;
    errEl.hidden = true;

    if (firebaseReady) {
      // Firebase Auth login
      try {
        await auth.signInWithEmailAndPassword(email, pass);
        // Auth state change will handle the rest
      } catch (err) {
        errEl.textContent = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
          ? 'Email ou senha incorretos.'
          : `Erro: ${err.message}`;
        errEl.hidden = false;
        btn.textContent = 'Entrar →';
        btn.disabled = false;
      }
    } else {
      // Local fallback (no Firebase configured)
      btn.textContent = 'Entrar →';
      btn.disabled = false;
      enterDashboard();
    }
  });

  /* ─────────────────────────────────────────
     Auth state change
  ───────────────────────────────────────── */
  if (firebaseReady) {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Load from Firestore on login
        setStatus('⟳ Carregando dados do Firebase…');
        try {
          const remote = await loadFromFirestore();
          if (remote) {
            appData = remote;
            if (!Array.isArray(appData.tags)) appData.tags = [...DEFAULT_TAGS];
            if (!appData.projects) appData.projects = {};
            if (!appData.dossier)  appData.dossier  = {};
            cacheLocal(appData);
          }
        } catch (err) {
          console.warn('Falha ao carregar Firestore, usando cache local.', err);
        }
        enterDashboard();
      }
    });
  }

  /* ─────────────────────────────────────────
     Enter / leave dashboard
  ───────────────────────────────────────── */
  async function testFirestoreWrite() {
    try {
      await db.collection(FS_COLLECTION).doc('write-test').set({ ok: true });
      await db.collection(FS_COLLECTION).doc('write-test').delete();
      console.log('[Admin] ✓ Permissão de escrita no Firestore OK');
    } catch (e) {
      console.error('[Admin] ✗ Firestore write test FALHOU:', e.code, e.message);
      if (e.code !== 'invalid-argument') {
        setStatus(`✗ Erro Firestore [${e.code || 'desconhecido'}]: ${e.message}`, '#b92b27');
      }
    }
  }

  function enterDashboard() {
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('dashboard').hidden = false;
    renderAll();
    if (firebaseReady) testFirestoreWrite();
  }

  document.getElementById('btnLogout').addEventListener('click', async () => {
    if (firebaseReady) await auth.signOut();
    document.getElementById('dashboard').hidden = true;
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').hidden = true;
  });

  /* ─────────────────────────────────────────
     Tab switching
  ───────────────────────────────────────── */
  document.querySelectorAll('.adm-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.adm-nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  /* ─────────────────────────────────────────
     Save all
  ───────────────────────────────────────── */
  document.getElementById('btnSaveAll').addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveAll');
    btn.disabled = true;
    btn.textContent = '⟳ Salvando…';

    const resetBtn = () => {
      btn.disabled = false;
      btn.textContent = 'Salvar alterações';
    };

    // Global safety timeout — button never stays stuck
    const safetyTimer = setTimeout(() => {
      resetBtn();
      setStatus('✗ Timeout: o salvamento demorou demais. Verifique a conexão com o Firebase.', '#b92b27');
    }, 30000);

    if (firebaseReady) {
      try {
        setStatus('⟳ Preparando dados…');
        const prepared = await prepareForFirestore(appData);
        setStatus('⟳ Gravando no Firestore…');
        await saveToFirestore(prepared);
        cacheLocal(prepared);
        clearTimeout(safetyTimer);
        resetBtn();
        setStatus('✓ Salvo! Alterações já visíveis no site.', '#1a7a4a');
        setTimeout(() => setStatus(''), 8000);
      } catch (err) {
        clearTimeout(safetyTimer);
        console.error('Erro ao salvar no Firebase:', err);
        resetBtn();
        const msg = err.code === 'permission-denied'
          ? '✗ Permissão negada — verifique as Rules do Firestore'
          : `✗ Erro [${err.code || 'desconhecido'}]: ${err.message}`;
        setStatus(msg, '#b92b27');
      }
    } else {
      clearTimeout(safetyTimer);
      try {
        cacheLocal(appData);
        resetBtn();
        setStatus('✓ Salvo localmente. Firebase não conectado — dados não aparecem para outros visitantes.', '#e08a00');
        setTimeout(() => setStatus(''), 10000);
      } catch (err) {
        resetBtn();
        setStatus('✗ Erro ao salvar: ' + err.message, '#b92b27');
      }
    }
  });

})();
