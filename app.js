/* BALANZA GM — v1.0.0 Etapa 10 (Excel + Cierre + Histórico + Presupuesto + Analítica + Calendar PRO + Backup) */

const TABS = [
  { id: 'resumen',        label: 'RESUMEN',        hero: 'hero_resumen.webp' },
  { id: 'ingresos',       label: 'INGRESOS',       hero: 'hero_ingresos.webp' },
  { id: 'gastos_fijos',   label: 'GASTOS FIJOS',   hero: 'hero_gastos_fijos.webp' },
  { id: 'gastos_varios',  label: 'GASTOS VARIOS',  hero: 'hero_gastos_varios.webp' },
  { id: 'transferencias', label: 'TRANSFERENCIAS', hero: 'hero_transferencias.webp' },
  // Nota: se incluye alias si tu asset venía como hero_presupssnto.webp
  { id: 'presupuesto',    label: 'PRESUPUESTO',    hero: 'hero_presupuesto.webp', heroAlt: 'hero_presupssnto.webp' },
  { id: 'analitica',      label: 'ANALÍTICA',      hero: 'hero_analitica.webp' },
  { id: 'alertas',        label: 'ALERTAS',        hero: 'hero_alertas.webp' },
  { id: 'catalogo',       label: 'CATÁLOGO',       hero: 'hero_catalogo.webp' },
];

const CATALOG_TYPES = [
  { id: 'categorias', label: 'CATEGORÍAS' },
  { id: 'etiquetas',  label: 'ETIQUETAS' },
  { id: 'cuentas',    label: 'CUENTAS' },
  { id: 'metodos',    label: 'MÉTODOS DE PAGO' },
  { id: 'beneficios', label: 'BENEFICIOS' },
  { id: 'origenes',   label: 'ORÍGENES' },
];

const STORAGE = {
  ACTIVE_PERIOD: 'bgm_active_period_v1', // YYYY-MM
  GOOGLE_TOKEN_PREFIX: 'bgm_google_oauth_v1_', // + uid
};

const INVITE_EXP_HOURS = 24; // recomendado 24h

const MONTHS_ES_UPPER = [
  'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'
];

const MONTHS_ES_TITLE = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];


const els = {
  tabsRow: document.getElementById('tabsRow'),
  view: document.getElementById('view'),
  heroImg: document.getElementById('heroImg'),
  heroFallback: document.getElementById('heroFallback'),
  crestImg: document.getElementById('crestImg'),
};

const STATE = {
  fbOk: false,
  fbReason: null, // 'CONFIG' | 'SDK' | 'INIT'
  authReady: false,
  user: null,
  familiaId: null,
  familia: null,
  role: '—',
  resumenSubView: 'main', // 'main' | 'miembros' | 'historico'
  familiaMembers: null,
  catalogType: 'categorias',
  catalogLoaded: {},
  catalogLoading: {},
  catalogData: {},

  // Movimientos (Etapa 7)
  mov: {
    ingresos: { items: [], loading: false, unsub: null, periodId: null, q: '', moneda: 'ALL', origenId: 'ALL' },
    gastos_fijos: { items: [], loading: false, unsub: null, periodId: null, q: '', estado: 'ALL' },
    gastos_varios: { items: [], loading: false, unsub: null, periodId: null, q: '', estado: 'ALL' },
    transferencias: { items: [], loading: false, unsub: null, periodId: null, q: '' },
  },
  recurringEnsured: {}, // { [periodId]: true }

  // ALERTAS (Etapa 9)
  alerts: {
    total: 0,
    blocking: 0,
    pending: [],
    incompletes: [],
    periodId: null,
  },


// Etapa 10: meta de período + Excel
periodMeta: {},
activePeriodMetaId: null,
activePeriodMetaUnsub: null,

// Etapa 10: Presupuesto
budget: { periodId: null, items: [], moneda: 'C$', loading: false, loaded: false },

// Etapa 10: Analítica
analytics: { periodId: null, recs: [], loading: false, computedAtMs: 0 },

// Etapa 10: Histórico
historico: { items: [], loading: false, unsub: null },

// Etapa 10: Google OAuth token (Calendar)
google: { accessToken: null, expiresAt: 0 },

busy: false,

};

const FB = {
  app: null,
  auth: null,
  db: null,
  provider: null,
};

function pad2(n){ return String(n).padStart(2,'0'); }
function pad3(n){ return String(n).padStart(3,'0'); }

function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function isValidDateStr(s){
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
}

function parseDateStr(s){
  if(!isValidDateStr(s)) return null;
  const [y,m,d] = String(s).split('-').map(Number);
  if(!y || !m || !d) return null;
  const dt = new Date(y, m-1, d);
  // Valida que no “brinque” por fechas inválidas
  if(dt.getFullYear() !== y || (dt.getMonth()+1) !== m || dt.getDate() !== d) return null;
  return dt;
}

function daysInMonth(year, month1to12){
  return new Date(year, month1to12, 0).getDate();
}

function shiftDateStrToPeriod(dateStr, period){
  const dt = parseDateStr(dateStr);
  if(!dt || !period) return null;
  const day = dt.getDate();
  const max = daysInMonth(period.year, period.month);
  const d2 = Math.min(day, max);
  return `${period.year}-${pad2(period.month)}-${pad2(d2)}`;
}

function normalizeMoneyInput(raw){
  let s = String(raw || '').trim();
  if(!s) return '';
  // permite 1234.56 o 1234,56 y elimina basura
  s = s.replace(/\s+/g,'');
  s = s.replace(/,/g,'.');
  s = s.replace(/[^0-9.]/g,'');
  // deja solo 1 punto
  const parts = s.split('.');
  if(parts.length > 2){
    s = parts[0] + '.' + parts.slice(1).join('');
  }
  return s;
}

function parseMoney(raw){
  const s = normalizeMoneyInput(raw);
  if(!s) return null;
  const n = Number(s);
  if(!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function moneyLabel(n){
  if(!Number.isFinite(n)) return '0.00';
  return (Math.round(n*100)/100).toFixed(2);
}


function round2(n){
  const x = Number(n);
  if(!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

// T/C = C$ por 1 USD (formato Nicaragua). Para C$→USD se divide; para USD→C$ se multiplica.
function computeTransferDestino(montoOrigen, monedaOrigen, monedaDestino, tc){
  const mo = Number(montoOrigen);
  const mO = String(monedaOrigen || 'C$');
  const mD = String(monedaDestino || 'C$');

  if(!Number.isFinite(mo) || mo <= 0) return { valid:false, montoDestino: 0, tcUsed: null };

  if(mO === mD){
    return { valid:true, montoDestino: round2(mo), tcUsed: 1.00 };
  }

  let t = Number(tc);
  if(!Number.isFinite(t) || t <= 0) return { valid:false, montoDestino: 0, tcUsed: null };
  t = round2(t);

  let md = 0;
  if(mO === 'USD' && mD === 'C$') md = mo * t;
  else if(mO === 'C$' && mD === 'USD') md = mo / t;
  else return { valid:false, montoDestino: 0, tcUsed: null };

  return { valid:true, montoDestino: round2(md), tcUsed: t };
}

function isPaidExpense(item){
  const st = String(item && item.estado || '').toUpperCase();
  if(st === 'PAGADO') return true;
  const fp = item && item.fechaPagoStr;
  return isValidDateStr(fp);
}

/* =========================
   ALERTAS (Etapa 9)
========================= */

function startOfDay(d){
  const x = d instanceof Date ? d : new Date();
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function daysUntil(dateStr){
  const dt = parseDateStr(dateStr);
  if(!dt) return null;
  const a = startOfDay(dt).getTime();
  const b = startOfDay(new Date()).getTime();
  return Math.round((a - b) / 86400000);
}

function dueBadge(topeStr){
  if(!isValidDateStr(topeStr)) return { cls: 'pendiente', text: 'PENDIENTE', days: null };
  const d = daysUntil(topeStr);
  if(d === null) return { cls: 'pendiente', text: 'PENDIENTE', days: null };
  if(d < 0) return { cls: 'vencido', text: 'VENCIDO', days: d };
  if(d === 0) return { cls: 'hoy', text: 'HOY', days: d };
  if(d <= 3) return { cls: 'd3', text: '3 DÍAS', days: d };
  if(d <= 7) return { cls: 'd7', text: '7 DÍAS', days: d };
  return { cls: 'pendiente', text: 'PENDIENTE', days: d };
}

function computeAlertsNow(){
  const period = getActivePeriod();
  const periodId = period ? period.id : null;

  const gf = Array.isArray(STATE.mov.gastos_fijos.items) ? STATE.mov.gastos_fijos.items : [];
  const gv = Array.isArray(STATE.mov.gastos_varios.items) ? STATE.mov.gastos_varios.items : [];

  const expenses = [];
  gf.forEach(it => expenses.push({ ...it, _type: 'gastos_fijos' }));
  gv.forEach(it => expenses.push({ ...it, _type: 'gastos_varios' }));

  const incompletes = [];
  const incompleteIds = new Set();

  for(const it of expenses){
    const missing = [];
    if(!it.cuentaId) missing.push('CUENTA');
    if(!it.metodoId) missing.push('MÉTODO');
    if(!it.categoriaId) missing.push('CATEGORÍA');
    const m = Number(it.monto);
    if(!Number.isFinite(m) || !(m > 0)) missing.push('MONTO');

    if(missing.length){
      incompletes.push({ ...it, _type: String(it.tipo || it._type || 'gastos_varios'), _missing: missing });
      if(it.id) incompleteIds.add(it.id);
    }
  }

  const pending = [];
  for(const it of expenses){
    if(!it.id) continue;
    if(incompleteIds.has(it.id)) continue;
    if(!isValidDateStr(it.fechaTopeStr)) continue;
    if(isPaidExpense(it)) continue;
    pending.push({ ...it, _type: String(it.tipo || it._type || 'gastos_varios') });
  }

  // Orden: pendientes por fecha tope (más urgente arriba)
  pending.sort((a,b) => String(a.fechaTopeStr||'').localeCompare(String(b.fechaTopeStr||'')));
  // Incompletos: más reciente arriba
  incompletes.sort((a,b) => String(b.fechaStr||'').localeCompare(String(a.fechaStr||'')));

  const total = pending.length + incompletes.length;
  const blocking = total;

  return { periodId, total, blocking, pending, incompletes };
}

function refreshAlerts(){
  const a = computeAlertsNow();
  STATE.alerts.periodId = a.periodId;
  STATE.alerts.total = a.total;
  STATE.alerts.blocking = a.blocking;
  STATE.alerts.pending = a.pending;
  STATE.alerts.incompletes = a.incompletes;
  return a;
}

function updateAlertsTabText(){
  const btn = els.tabsRow ? els.tabsRow.querySelector('[data-tab="alertas"]') : null;
  if(!btn) return;
  const n = Number((STATE.alerts && STATE.alerts.total) || 0) || 0;
  btn.textContent = n > 0 ? `ALERTAS (${n})` : 'ALERTAS';
}

function isAdmin(){
  return String(STATE.role || '').toUpperCase() === 'ADMIN';
}

function currentPeriodId(){
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
}

function parsePeriodId(id){
  if(typeof id !== 'string') return null;
  const m = id.match(/^(\d{4})-(\d{2})$/);
  if(!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1..12
  if(!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { id, year, month };
}

function formatPeriodLabel(period){
  const name = MONTHS_ES_UPPER[period.month - 1] || '';
  return `${name} ${period.year}`;
}

function getActivePeriod(){
  const stored = localStorage.getItem(STORAGE.ACTIVE_PERIOD);
  const parsed = parsePeriodId(stored);
  if(parsed) return parsed;

  const fresh = currentPeriodId();
  localStorage.setItem(STORAGE.ACTIVE_PERIOD, fresh);
  return parsePeriodId(fresh);
}

function routeFromHash(){
  const raw = (location.hash || '').replace('#','').trim().toLowerCase();
  if(!raw) return 'resumen';
  if(raw === 'acceso') return 'acceso';
  const ok = TABS.some(t => t.id === raw);
  return ok ? raw : 'resumen';
}

function setHeroFor(tab){
  const base = 'assets/hero/';
  const img = els.heroImg;
  const fb = els.heroFallback;

  img.style.display = 'none';
  fb.style.display = 'block';
  img.onerror = null;

  const trySrcs = [tab.hero].concat(tab.heroAlt ? [tab.heroAlt] : []);
  let i = 0;

  const tryNext = () => {
    if(i >= trySrcs.length) return;
    img.src = base + trySrcs[i++];
  };

  img.onload = () => {
    img.style.display = 'block';
    fb.style.display = 'none';
  };
  img.onerror = () => tryNext();

  tryNext();
}

function setTabsVisible(v){
  els.tabsRow.parentElement.classList.toggle('hidden', !v);
}

function renderTabs(currentId){
  els.tabsRow.innerHTML = '';
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.type = 'button';
    btn.setAttribute('data-tab', tab.id);

    let label = tab.label;
    if(tab.id === 'alertas'){
      const n = Number((STATE.alerts && STATE.alerts.total) || 0) || 0;
      label = n > 0 ? `${tab.label} (${n})` : tab.label;
    }
    btn.textContent = label;
    const selected = tab.id === currentId;
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if(location.hash !== '#' + tab.id) location.hash = tab.id;
      else render();
    });
    els.tabsRow.appendChild(btn);
  });
}

function toast(message){
  let el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function setBusy(isBusy, label){
  STATE.busy = !!isBusy;
  const overlayId = 'busyOverlay';
  let o = document.getElementById(overlayId);
  if(!o){
    o = document.createElement('div');
    o.id = overlayId;
    o.className = 'busy-overlay hidden';
    o.innerHTML = `
      <div class="busy-card">
        <div class="spinner" aria-hidden="true"></div>
        <div class="busy-text" id="busyText"></div>
      </div>
    `;
    document.body.appendChild(o);
  }
  const t = document.getElementById('busyText');
  if(t) t.textContent = label || 'CARGANDO…';
  o.classList.toggle('hidden', !STATE.busy);
}

function openModal({ title, bodyHtml, primaryText, onPrimary, secondaryText, onSecondary }){
  closeModal();
  const wrap = document.createElement('div');
  wrap.id = 'modalWrap';
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <div class="modal-backdrop" data-close="1"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head">
        <div class="modal-title">${escapeHtml(title)}</div>
        <button class="modal-x" type="button" data-close="1" aria-label="Cerrar">×</button>
      </div>
      <div class="modal-body">${bodyHtml || ''}</div>
      <div class="modal-actions">
        ${secondaryText ? `<button class="action-btn" type="button" id="modalSecondary">${escapeHtml(secondaryText)}</button>` : ''}
        ${primaryText ? `<button class="action-btn primary" type="button" id="modalPrimary">${escapeHtml(primaryText)}</button>` : ''}
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.addEventListener('click', (e) => {
    const t = e.target;
    if(t && t.getAttribute && t.getAttribute('data-close') === '1') closeModal();
  });

  const p = document.getElementById('modalPrimary');
  const s = document.getElementById('modalSecondary');

  if(p && typeof onPrimary === 'function') p.addEventListener('click', () => onPrimary());
  if(s && typeof onSecondary === 'function') s.addEventListener('click', () => onSecondary());
}

function closeModal(){
  const wrap = document.getElementById('modalWrap');
  if(wrap) wrap.remove();
}

/* =========================
   Firebase init (CDN)
========================= */

function hasFirebaseConfig(){
  const c = window.BGM_FIREBASE_CONFIG || {};
  return !!(c.apiKey && c.projectId);
}

function initFirebaseIfPossible(){
  if(!hasFirebaseConfig()){
    STATE.fbOk = false;
    STATE.fbReason = 'CONFIG';
    return false;
  }
  if(!window.firebase){
    STATE.fbOk = false;
    STATE.fbReason = 'SDK';
    return false;
  }

  try{
    if(!firebase.apps || !firebase.apps.length){
      FB.app = firebase.initializeApp(window.BGM_FIREBASE_CONFIG);
    } else {
      FB.app = firebase.app();
    }
    FB.auth = firebase.auth();
    FB.db = firebase.firestore();
    FB.provider = new firebase.auth.GoogleAuthProvider();
    try{ FB.provider.addScope('https://www.googleapis.com/auth/calendar.events'); } catch(_){ /* ignore */ }

    STATE.fbOk = true;
    STATE.fbReason = null;
    return true;
  } catch(err){
    console.error(err);
    STATE.fbOk = false;
    STATE.fbReason = 'INIT';
    return false;
  }
}

async function ensureUserDoc(user){
  if(!STATE.fbOk || !FB.db || !user) return;
  const ref = FB.db.collection('users').doc(user.uid);
  const payload = {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    photoURL: user.photoURL || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(payload, { merge: true });
}

async function refreshUserContext(){
  STATE.familiaId = null;
  STATE.familia = null;
  STATE.role = '—';
  // Limpia listeners de movimientos si cambia el contexto
  if(STATE.mov){
    try{ Object.keys(STATE.mov).forEach(t => unsubMov(t)); } catch(_){ /* ignore */ }
  }
  STATE.recurringEnsured = {};

  if(!STATE.fbOk || !FB.db || !STATE.user) return;

  const uref = FB.db.collection('users').doc(STATE.user.uid);
  const usnap = await uref.get();
  const udata = usnap.exists ? (usnap.data() || {}) : {};

  STATE.familiaId = udata.familiaId || null;
  STATE.role = udata.role || '—';

  if(STATE.familiaId){
    const fref = FB.db.collection('familias').doc(STATE.familiaId);
    const fsnap = await fref.get();
    STATE.familia = fsnap.exists ? (fsnap.data() || {}) : { name: 'FAMILIA GM' };
  }
}

async function signInGoogle(){
  if(!STATE.fbOk || !FB.auth) return;
  try{
    // Redirect es más estable en iPad/PWA.
    await FB.auth.signInWithRedirect(FB.provider);
  } catch(err){
    console.error(err);
    toast('No se pudo iniciar sesión.');
  }
}

async function signOut(){
  if(!STATE.fbOk || !FB.auth) return;
  try{
    await FB.auth.signOut();
    toast('Sesión cerrada.');
  } catch(err){
    console.error(err);
    toast('No se pudo cerrar sesión.');
  }
}

function codeChars(){
  // sin I, O, 0, 1 (menos confusión)
  return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
}

function randomCode4(){
  const chars = codeChars();
  let out = '';
  for(let i=0;i<4;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function normalizeInviteCode(s){
  return String(s || '').trim().toUpperCase().replace(/\s+/g,'');
}

function isInviteCodeValid(code){
  return /^GM-[A-Z2-9]{4}$/.test(code);
}

async function generateUniqueInviteCode(){
  for(let i=0;i<20;i++){
    const code = `GM-${randomCode4()}`;
    const snap = await FB.db.collection('invitaciones').doc(code).get();
    if(!snap.exists) return code;
  }
  throw new Error('No se pudo generar un código único.');
}

async function createFamily(){
  if(!STATE.user) return;
  setBusy(true, 'CREANDO FAMILIA…');
  try{
    const famRef = FB.db.collection('familias').doc();
    const familiaId = famRef.id;

    const me = {
      uid: STATE.user.uid,
      nombre: STATE.user.displayName || (STATE.user.email ? String(STATE.user.email).split('@')[0] : 'USUARIO'),
      email: STATE.user.email || null,
      rol: 'ADMIN',
    };

    await famRef.set({
      name: 'FAMILIA GM',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: STATE.user.uid,
      excelSeqNext: 1,
      members: [me],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await FB.db.collection('familias').doc(familiaId)
      .collection('miembros').doc(STATE.user.uid)
      .set({
        uid: STATE.user.uid,
        email: STATE.user.email || null,
        displayName: STATE.user.displayName || null,
        role: 'ADMIN',
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

    await FB.db.collection('users').doc(STATE.user.uid)
      .set({ familiaId, role: 'ADMIN' }, { merge: true });

    await refreshUserContext();
    toast('Familia creada.');
    location.hash = 'resumen';
  } catch(err){
    console.error(err);
    toast('No se pudo crear la familia.');
  } finally {
    setBusy(false);
  }
}

async function joinFamilyWithCode(input){
  const code = normalizeInviteCode(input);
  if(!isInviteCodeValid(code)){
    toast('Código inválido. Ej: GM-ABCD');
    return;
  }
  if(!STATE.user){
    toast('Inicia sesión primero.');
    return;
  }

  setBusy(true, 'VALIDANDO CÓDIGO…');
  try{
    const invRef = FB.db.collection('invitaciones').doc(code);
    const userRef = FB.db.collection('users').doc(STATE.user.uid);

    await FB.db.runTransaction(async (tx) => {
      const invSnap = await tx.get(invRef);
      if(!invSnap.exists) throw new Error('NO_EXISTE');

      const inv = invSnap.data() || {};
      if(inv.usado) throw new Error('USADO');

      const exp = inv.expiraEn && inv.expiraEn.toDate ? inv.expiraEn.toDate() : null;
      if(exp && exp.getTime() < Date.now()) throw new Error('EXPIRADO');

      const familiaId = inv.familiaId;
      if(!familiaId) throw new Error('MALFORMADO');

      const famDocRef = FB.db.collection('familias').doc(familiaId);
      const famSnap = await tx.get(famDocRef);
      if(!famSnap.exists) throw new Error('FAM_NO_EXISTE');

      const famData = famSnap.data() || {};
      const members = Array.isArray(famData.members) ? famData.members.slice() : [];

      const newMember = {
        uid: STATE.user.uid,
        nombre: STATE.user.displayName || (STATE.user.email ? String(STATE.user.email).split('@')[0] : 'USUARIO'),
        email: STATE.user.email || null,
        rol: 'MIEMBRO',
      };

      const idx = members.findIndex(m => (m && m.uid) === STATE.user.uid);
      if(idx >= 0) members[idx] = { ...members[idx], ...newMember };
      else members.push(newMember);

      const memberRef = FB.db.collection('familias').doc(familiaId).collection('miembros').doc(STATE.user.uid);

      tx.update(invRef, {
        usado: true,
        usadoPor: STATE.user.uid,
        usadoEn: firebase.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(memberRef, {
        uid: STATE.user.uid,
        email: STATE.user.email || null,
        displayName: STATE.user.displayName || null,
        role: 'MIEMBRO',
        joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(famDocRef, {
        members,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      tx.set(userRef, { familiaId, role: 'MIEMBRO' }, { merge: true });
    });

    await refreshUserContext();
    toast('Listo: te uniste a la familia.');
    location.hash = 'resumen';
  } catch(err){
    console.error(err);
    const code = (err && err.message) ? err.message : '';
    if(code === 'NO_EXISTE') toast('Código no encontrado.');
    else if(code === 'USADO') toast('Código ya fue usado.');
    else if(code === 'EXPIRADO') toast('Código expirado.');
    else if(code === 'FAM_NO_EXISTE') toast('Familia no encontrada.');
    else toast('No se pudo unir a la familia.');
  } finally {
    setBusy(false);
  }
}

async function createInvite(){
  if(!STATE.user || !STATE.familiaId){
    toast('Primero vincula una familia.');
    return;
  }
  setBusy(true, 'GENERANDO CÓDIGO…');
  try{
    const code = await generateUniqueInviteCode();
    const expDate = new Date(Date.now() + INVITE_EXP_HOURS*60*60*1000);

    await FB.db.collection('invitaciones').doc(code).set({
      code,
      familiaId: STATE.familiaId,
      expiraEn: firebase.firestore.Timestamp.fromDate(expDate),
      usado: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: STATE.user.uid,
    });

    const expLabel = `${pad2(expDate.getDate())}/${pad2(expDate.getMonth()+1)}/${expDate.getFullYear()} ${pad2(expDate.getHours())}:${pad2(expDate.getMinutes())}`;

    openModal({
      title: 'INVITACIÓN (1 USO)',
      bodyHtml: `
        <div class="invite-box">
          <div class="invite-kicker">CÓDIGO</div>
          <div class="invite-code" id="inviteCode">${escapeHtml(code)}</div>
          <div class="invite-meta">Expira: <span class="mono">${escapeHtml(expLabel)}</span> (≈ ${INVITE_EXP_HOURS}h)</div>
          <div class="invite-actions">
            <button class="action-btn" type="button" id="btnCopy">COPIAR</button>
          </div>
          <p class="hint">Comparte este código. Al usarse una vez, se marca como usado automáticamente.</p>
        </div>
      `,
      primaryText: 'CERRAR',
      onPrimary: () => closeModal(),
    });

    const copyBtn = document.getElementById('btnCopy');
    if(copyBtn){
      copyBtn.addEventListener('click', async () => {
        try{
          await navigator.clipboard.writeText(code);
          toast('Copiado.');
        } catch(_){
          toast('No se pudo copiar.');
        }
      });
    }
  } catch(err){
    console.error(err);
    toast('No se pudo generar el código.');
  } finally {
    setBusy(false);
  }
}

/* =========================
   Views
========================= */

function memberName(m){
  return (m && (m.nombre || m.displayName || m.name)) ? String(m.nombre || m.displayName || m.name) : 'MIEMBRO';
}

function memberEmail(m){
  return (m && m.email) ? String(m.email) : '';
}

function memberRole(m){
  const r = m && (m.rol || m.role);
  return String(r || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MIEMBRO';
}

async function loadFamilyMembers({ force } = {}){
  if(!STATE.fbOk || !FB.db || !STATE.user || !STATE.familiaId) return [];
  if(!force && Array.isArray(STATE.familiaMembers)) return STATE.familiaMembers;

  try{
    const famRef = FB.db.collection('familias').doc(STATE.familiaId);
    const snap = await famRef.get();
    const data = snap.exists ? (snap.data() || {}) : {};
    let members = Array.isArray(data.members) ? data.members.slice() : null;
    let fromFallback = false;

    // Fallback: si no existe array en doc, lee subcolección.
    if(!members){
      const q = await FB.db.collection('familias').doc(STATE.familiaId).collection('miembros').get();
      members = q.docs.map(d => {
        const x = d.data() || {};
        return {
          uid: x.uid || d.id,
          nombre: x.displayName || null,
          email: x.email || null,
          rol: String(x.role || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MIEMBRO',
        };
      });
      fromFallback = true;
    }

    // Normaliza
    members = (members || []).map(m => ({
      uid: m && m.uid ? String(m.uid) : '',
      nombre: m && (m.nombre || m.displayName) ? String(m.nombre || m.displayName) : null,
      email: m && m.email ? String(m.email) : null,
      rol: memberRole(m),
    })).filter(m => !!m.uid);

    STATE.familiaMembers = members;

    // Upgrade suave al nuevo modelo: persiste members[] en el doc familia.
    if(fromFallback){
      famRef.set({
        members,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }).catch(()=>{});
    }

    return members;
  } catch(err){
    console.error(err);
    return [];
  }
}

function countAdmins(members){
  return (members || []).filter(m => memberRole(m) === 'ADMIN').length;
}

/* =========================
   CATÁLOGO (Etapa 6)
========================= */

function catalogTypeLabel(typeId){
  const t = CATALOG_TYPES.find(x => x.id === typeId);
  return t ? t.label : String(typeId || '').toUpperCase();
}

function normalizeCatalogName(name){
  return String(name || '').trim().replace(/\s+/g,' ').toUpperCase();
}

function genId(){
  try{
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  }catch(_){ /* ignore */ }
  return 'id_' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function catalogDocRef(typeId){
  return FB.db
    .collection('familias').doc(STATE.familiaId)
    .collection('catalogo').doc(typeId);
}

async function loadCatalogType(typeId, { force } = {}){
  if(!STATE.fbOk || !FB.db || !STATE.user || !STATE.familiaId) return [];
  if(!force && STATE.catalogLoaded[typeId] && Array.isArray(STATE.catalogData[typeId])){
    return STATE.catalogData[typeId];
  }

  const ref = catalogDocRef(typeId);
  const snap = await ref.get();
  let items = [];

  if(snap.exists){
    const data = snap.data() || {};
    const raw = Array.isArray(data.items) ? data.items : [];
    items = raw.map(x => {
      if(typeof x === 'string'){
        return { id: genId(), nombre: String(x).trim() };
      }
      return {
        id: x && x.id ? String(x.id) : genId(),
        nombre: x && x.nombre ? String(x.nombre).trim() : '',
        createdAtMs: x && x.createdAtMs ? Number(x.createdAtMs) : undefined,
        updatedAtMs: x && x.updatedAtMs ? Number(x.updatedAtMs) : undefined,
      };
    }).filter(it => !!it.nombre);
  } else {
    // Inicializa doc vacío para el tipo
    await ref.set({
      items: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    items = [];
  }

  // Normaliza duplicados obvios (por si venían mal)
  const seen = new Set();
  const clean = [];
  for(const it of items){
    const key = normalizeCatalogName(it.nombre);
    if(!key || seen.has(key)) continue;
    seen.add(key);
    clean.push(it);
  }

  STATE.catalogData[typeId] = clean;
  STATE.catalogLoaded[typeId] = true;
  return clean;
}

function ensureCatalogLoaded(typeId){
  if(STATE.catalogLoading[typeId]) return;
  if(STATE.catalogLoaded[typeId] && Array.isArray(STATE.catalogData[typeId])) return;

  STATE.catalogLoading[typeId] = true;
  loadCatalogType(typeId, { force: true })
    .catch((err) => {
      console.error(err);
      toast('No se pudo cargar el CATÁLOGO.');
    })
    .finally(() => {
      STATE.catalogLoading[typeId] = false;
      render();
    });
}

async function saveCatalogType(typeId, items){
  const ref = catalogDocRef(typeId);
  await ref.set({
    items,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function catalogHasDuplicate(typeId, name, exceptId){
  const key = normalizeCatalogName(name);
  const items = Array.isArray(STATE.catalogData[typeId]) ? STATE.catalogData[typeId] : [];
  return items.some(it => {
    if(exceptId && it.id === exceptId) return false;
    return normalizeCatalogName(it.nombre) === key;
  });
}

function openCatalogItemModal({ typeId, mode, item }){
  const label = catalogTypeLabel(typeId);
  const isEdit = mode === 'edit';
  const title = isEdit ? `EDITAR — ${label}` : `AGREGAR — ${label}`;
  const currentName = isEdit && item ? String(item.nombre || '') : '';

  openModal({
    title,
    bodyHtml: `
      <div class="cat-form">
        <div class="cat-form-label">NOMBRE</div>
        <input id="catName" class="text-input" inputmode="text" autocapitalize="words" autocomplete="off" value="${escapeHtml(currentName)}" placeholder="Escribe aquí…" />
        <p class="hint">Sin vacíos. Sin duplicados obvios (se compara por nombre).</p>
      </div>
    `,
    primaryText: isEdit ? 'GUARDAR' : 'AGREGAR',
    onPrimary: async () => {
      const inp = document.getElementById('catName');
      const raw = inp ? inp.value : '';
      const nombre = String(raw || '').trim().replace(/\s+/g,' ');
      if(!nombre){
        toast('Nombre requerido.');
        return;
      }
      if(catalogHasDuplicate(typeId, nombre, isEdit && item ? item.id : null)){
        toast('Ya existe uno con ese nombre.');
        return;
      }

      closeModal();
      if(!isAdmin()){
        toast('Solo ADMIN puede editar.');
        return;
      }

      setBusy(true, isEdit ? 'GUARDANDO…' : 'AGREGANDO…');
      try{
        const items = Array.isArray(STATE.catalogData[typeId]) ? STATE.catalogData[typeId].slice() : [];
        if(isEdit && item){
          const idx = items.findIndex(x => x.id === item.id);
          if(idx >= 0){
            items[idx] = { ...items[idx], nombre, updatedAtMs: Date.now() };
          }
        } else {
          items.push({ id: genId(), nombre, createdAtMs: Date.now(), updatedAtMs: Date.now() });
        }

        await saveCatalogType(typeId, items);
        STATE.catalogData[typeId] = items;
        STATE.catalogLoaded[typeId] = true;
        toast(isEdit ? 'Guardado.' : 'Agregado.');
        render();
      } catch(err){
        console.error(err);
        toast('No se pudo guardar.');
        // recarga defensiva
        STATE.catalogLoaded[typeId] = false;
        ensureCatalogLoaded(typeId);
      } finally {
        setBusy(false);
      }
    },
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
  });

  // UX: foco al input
  setTimeout(() => {
    const inp = document.getElementById('catName');
    if(inp){
      inp.focus();
      inp.select();
    }
  }, 30);
}

function confirmDeleteCatalogItem(typeId, item){
  if(!isAdmin()){
    toast('Solo ADMIN.');
    return;
  }
  openModal({
    title: 'ELIMINAR',
    bodyHtml: `
      <p class="hint" style="margin-top:0">¿Eliminar <b>${escapeHtml(item.nombre)}</b> de <span class="mono">${escapeHtml(catalogTypeLabel(typeId))}</span>?</p>
      <p class="hint">Esta acción no se puede deshacer.</p>
    `,
    primaryText: 'ELIMINAR',
    onPrimary: async () => {
      closeModal();
      setBusy(true, 'ELIMINANDO…');
      try{
        const items = Array.isArray(STATE.catalogData[typeId]) ? STATE.catalogData[typeId].slice() : [];
        const next = items.filter(x => x.id !== item.id);
        await saveCatalogType(typeId, next);
        STATE.catalogData[typeId] = next;
        STATE.catalogLoaded[typeId] = true;
        toast('Eliminado.');
        render();
      } catch(err){
        console.error(err);
        toast('No se pudo eliminar.');
        STATE.catalogLoaded[typeId] = false;
        ensureCatalogLoaded(typeId);
      } finally {
        setBusy(false);
      }
    },
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
  });
}

/* =========================
   MOVIMIENTOS (Etapa 7)
========================= */

function ensureRequiredForMovimientos(type){
  // Asegura catálogos y miembros (carga en background)
  let need = [];

  if(type === 'transferencias'){
    need = ['cuentas'];
  } else {
    need = ['cuentas','metodos','beneficios','categorias','etiquetas'];
    if(type === 'ingresos') need.push('origenes');
  }

  need.forEach(t => ensureCatalogLoaded(t));

  if(!Array.isArray(STATE.familiaMembers)){
    loadFamilyMembers({ force: false }).then(()=>render()).catch(()=>{});
  }
}

function periodDocRef(periodId){
  return FB.db
    .collection('familias').doc(STATE.familiaId)
    .collection('periodos').doc(periodId);
}


async function ensurePeriodDoc(periodId){
  if(!STATE.fbOk || !FB.db || !STATE.familiaId || !periodId) return;
  const p = parsePeriodId(periodId);
  if(!p) return;

  const famRef = FB.db.collection('familias').doc(STATE.familiaId);
  const ref = periodDocRef(periodId);

  await FB.db.runTransaction(async (tx) => {
    const famSnap = await tx.get(famRef);
    const famData = famSnap.exists ? (famSnap.data() || {}) : {};
    let nextSeq = Number(famData.excelSeqNext);
    if(!(nextSeq >= 1)) nextSeq = 1;

    const snap = await tx.get(ref);
    if(snap.exists){
      const data = snap.data() || {};
      const upd = {};
      if(!data.status) upd.status = 'ABIERTO';
      if(!(Number(data.excelSeq) >= 1)){
        upd.excelSeq = nextSeq;
        nextSeq += 1;
        tx.set(famRef, { excelSeqNext: nextSeq, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } else {
        // asegura que el contador familiar exista
        if(!(Number(famData.excelSeqNext) >= 1)){
          tx.set(famRef, { excelSeqNext: nextSeq, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      }
      if(Object.keys(upd).length){
        upd.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
        tx.set(ref, upd, { merge: true });
      }
      return;
    }

    const excelSeq = nextSeq;
    nextSeq += 1;

    tx.set(ref, {
      id: periodId,
      year: p.year,
      month: p.month,
      status: 'ABIERTO',
      excelSeq,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(famRef, { excelSeqNext: nextSeq, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

function getActivePeriodMeta(){
  const pid = getActivePeriod().id;
  return STATE.periodMeta[pid] || null;
}

function isActivePeriodClosed(){
  const meta = getActivePeriodMeta() || {};
  return String(meta.status || "ABIERTO").toUpperCase() === "CERRADO";
}

function ensureActivePeriodMetaSubscribed(){
  if(!STATE.fbOk || !FB.db || !STATE.user || !STATE.familiaId) return;
  const periodId = getActivePeriod().id;
  if(STATE.activePeriodMetaUnsub && STATE.activePeriodMetaId === periodId) return;

  if(typeof STATE.activePeriodMetaUnsub === 'function'){
    try{ STATE.activePeriodMetaUnsub(); }catch(_){ /* ignore */ }
  }

  STATE.activePeriodMetaId = periodId;
  STATE.activePeriodMetaUnsub = periodDocRef(periodId).onSnapshot((snap) => {
    STATE.periodMeta[periodId] = snap.exists ? (snap.data() || {}) : {};
    render();
  }, (err) => {
    console.error(err);
  });
}

function movCollectionRef(type, periodId){
  return periodDocRef(periodId).collection(type);
}


function budgetDocRef(periodId){
  return periodDocRef(periodId).collection('meta').doc('presupuesto');
}

function historicoDocRef(periodId){
  return FB.db
    .collection('familias').doc(STATE.familiaId)
    .collection('historico').doc(periodId);
}

function historicoMovColRef(periodId, type){
  return historicoDocRef(periodId).collection(type);
}

function historicoMetaDocRef(periodId, name){
  return historicoDocRef(periodId).collection('meta').doc(name);
}

function unsubMov(type){
  const slot = STATE.mov[type];
  if(slot && typeof slot.unsub === 'function'){
    try{ slot.unsub(); }catch(_){ /* ignore */ }
  }
  if(slot){
    slot.unsub = null;
    slot.loading = false;
    slot.items = slot.items || [];
    slot.periodId = null;
  }
}

function ensureMovSubscribed(type){
  if(!STATE.fbOk || !FB.db || !STATE.user || !STATE.familiaId) return;
  const period = getActivePeriod();
  const periodId = period.id;

  const slot = STATE.mov[type];
  if(!slot) return;
  if(slot.unsub && slot.periodId === periodId) return;

  // Cambió período: suelta listener anterior
  if(slot.unsub) unsubMov(type);

  slot.loading = true;
  slot.periodId = periodId;

  ensurePeriodDoc(periodId).catch(()=>{});

  const col = movCollectionRef(type, periodId);
  const q = col.orderBy('fechaStr','desc');
  slot.unsub = q.onSnapshot((snap) => {
    const out = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      out.push({ id: doc.id, ...data });
    });
    slot.items = out;
    slot.loading = false;

    // ALERTAS badge (Etapa 9)
    if(type === 'gastos_fijos' || type === 'gastos_varios'){
      refreshAlerts();
      updateAlertsTabText();
    }

    // Render solo si estamos en esa vista
    const r = routeFromHash();
    if(r === type || r === 'resumen') render();
  }, (err) => {
    console.error(err);
    slot.loading = false;
    toast('No se pudieron cargar movimientos.');

    if(type === 'gastos_fijos' || type === 'gastos_varios'){
      refreshAlerts();
      updateAlertsTabText();
    }
    const r = routeFromHash();
    if(r === type || r === 'resumen') render();
  });
}

function computeEstado(item){
  const cur = String(item && item.estado || '').toUpperCase();
  if(cur === 'PAGADO') return 'PAGADO';
  const tope = item && item.fechaTopeStr;
  if(isValidDateStr(tope)){
    const hoy = todayStr();
    if(String(tope) < hoy) return 'VENCIDO';
  }
  return cur === 'VENCIDO' ? 'VENCIDO' : 'PENDIENTE';
}

function recDocId(recurrentKey, periodId){
  const k = String(recurrentKey || '').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48) || 'rk';
  return `rec_${k}_${periodId}`;
}

function prevPeriodId(period){
  let y = period.year;
  let m = period.month - 1;
  if(m <= 0){ m = 12; y -= 1; }
  return `${y}-${pad2(m)}`;
}

async function ensureRecurringGastosFijosForPeriod(period){
  if(!STATE.fbOk || !FB.db || !STATE.user || !STATE.familiaId) return;
  const periodId = period.id;
  if(STATE.recurringEnsured[periodId]) return;
  STATE.recurringEnsured[periodId] = true;

  try{
    const prevId = prevPeriodId(period);
    const prevCol = movCollectionRef('gastos_fijos', prevId);
    const prevSnap = await prevCol.where('recurrente','==',true).get();
    if(prevSnap.empty) return;

    const curCol = movCollectionRef('gastos_fijos', periodId);

    for(const doc of prevSnap.docs){
      const d = doc.data() || {};
      const rk = d.recurrentKey || null;
      if(!rk) continue;
      const id = recDocId(rk, periodId);
      const curRef = curCol.doc(id);
      const curSnap = await curRef.get();
      if(curSnap.exists) continue;

      const fechaTopeStr = isValidDateStr(d.fechaTopeStr)
        ? shiftDateStrToPeriod(d.fechaTopeStr, period)
        : `${period.year}-${pad2(period.month)}-01`;
      const fechaStr = isValidDateStr(d.fechaStr)
        ? shiftDateStrToPeriod(d.fechaStr, period)
        : (fechaTopeStr || `${period.year}-${pad2(period.month)}-01`);

      const payload = {
        ...d,
        fechaStr,
        fechaTopeStr,
        fechaPagoStr: null,
        estado: 'PENDIENTE',
        clonedFromPeriodId: prevId,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };
      await curRef.set(payload, { merge: false });
    }
  } catch(err){
    console.error(err);
  }
}

function optionLabelFromCatalog(typeId, id){
  if(!id) return '—';
  const items = Array.isArray(STATE.catalogData[typeId]) ? STATE.catalogData[typeId] : [];
  const it = items.find(x => x.id === id);
  return it ? String(it.nombre || '—') : '—';
}

function memberLabel(uid){
  const ms = Array.isArray(STATE.familiaMembers) ? STATE.familiaMembers : [];
  const m = ms.find(x => x.uid === uid);
  return m ? memberName(m) : '—';
}

function renderTagsChips(tagIds){
  const ids = Array.isArray(tagIds) ? tagIds : [];
  if(!ids.length) return '';
  return `<div class="tag-row">` + ids.slice(0,12).map(id => {
    const name = optionLabelFromCatalog('etiquetas', id);
    return `<span class="tag-chip" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
  }).join('') + `</div>`;
}

function filterByText(items, q){
  const s = String(q || '').trim().toUpperCase();
  if(!s) return items;
  return (items || []).filter(it => {
    const hay = [it.concepto, it.notas].filter(Boolean).join(' ');
    return String(hay || '').toUpperCase().includes(s);
  });
}

function openMovimientoModal({ type, mode, item }){
  if(isActivePeriodClosed()){
    toast("Período cerrado (solo lectura).");
    return;
  }
  const isEdit = mode === 'edit' && item;
  const titleMap = {
    ingresos: isEdit ? 'EDITAR INGRESO' : 'AGREGAR INGRESO',
    gastos_fijos: isEdit ? 'EDITAR GASTO FIJO' : 'AGREGAR GASTO FIJO',
    gastos_varios: isEdit ? 'EDITAR GASTO VARIO' : 'AGREGAR GASTO VARIO',
  };

  const period = getActivePeriod();
  const periodId = period.id;

  // Defaults
  const concepto = isEdit ? String(item.concepto || '') : '';
  const fechaStr = isEdit ? String(item.fechaStr || '') : todayStr();
  const moneda = isEdit ? String(item.moneda || 'C$') : 'C$';
  const monto = isEdit ? (Number(item.monto) || 0) : null;
  const cuentaId = isEdit ? (item.cuentaId || '') : '';
  const metodoId = isEdit ? (item.metodoId || '') : '';
  const quienPagoUid = isEdit ? (item.quienPagoUid || '') : (STATE.user ? STATE.user.uid : '');
  const beneficioId = isEdit ? (item.beneficioId || '') : '';
  const categoriaId = isEdit ? (item.categoriaId || '') : '';
  const tagIds = isEdit ? (Array.isArray(item.tagIds) ? item.tagIds.slice() : []) : [];
  const notas = isEdit ? String(item.notas || '') : '';

  const origenId = (type === 'ingresos') ? (isEdit ? (item.origenId || '') : '') : '';

  const fechaTopeStr = (type !== 'ingresos') ? (isEdit ? String(item.fechaTopeStr || '') : '') : '';
  const fechaPagoStr = (type !== 'ingresos') ? (isEdit ? (item.fechaPagoStr ? String(item.fechaPagoStr) : '') : '') : '';
  const estado = (type !== 'ingresos') ? (isEdit ? computeEstado(item) : 'PENDIENTE') : '';

  const recurrente = (type === 'gastos_fijos') ? (isEdit ? !!item.recurrente : false) : false;
  const recurrentKey = (type === 'gastos_fijos') ? (isEdit ? (item.recurrentKey || '') : '') : '';

  const cuentas = Array.isArray(STATE.catalogData.cuentas) ? STATE.catalogData.cuentas : [];
  const metodos = Array.isArray(STATE.catalogData.metodos) ? STATE.catalogData.metodos : [];
  const beneficios = Array.isArray(STATE.catalogData.beneficios) ? STATE.catalogData.beneficios : [];
  const categorias = Array.isArray(STATE.catalogData.categorias) ? STATE.catalogData.categorias : [];
  const etiquetas = Array.isArray(STATE.catalogData.etiquetas) ? STATE.catalogData.etiquetas : [];
  const origenes = Array.isArray(STATE.catalogData.origenes) ? STATE.catalogData.origenes : [];
  const miembros = Array.isArray(STATE.familiaMembers) ? STATE.familiaMembers : [];

  const reqCatalogMissing = [];
  if(!cuentas.length) reqCatalogMissing.push('CUENTAS');
  if(!metodos.length) reqCatalogMissing.push('MÉTODOS');
  if(!beneficios.length) reqCatalogMissing.push('BENEFICIOS');
  if(!categorias.length) reqCatalogMissing.push('CATEGORÍAS');
  if(type === 'ingresos' && !origenes.length) reqCatalogMissing.push('ORÍGENES');
  if(!miembros.length) reqCatalogMissing.push('MIEMBROS');

  const missingHtml = reqCatalogMissing.length
    ? `<div class="notice">FALTA CONFIGURAR: ${escapeHtml(reqCatalogMissing.join(', '))}. Ve a <b>CATÁLOGO</b> / <b>MIEMBROS</b>.</div>`
    : '';

  function buildOptions(items, selected, placeholder){
    const opts = [`<option value="">${escapeHtml(placeholder || '—')}</option>`];
    (items || []).forEach(it => {
      const id = String(it.id);
      const name = String(it.nombre || '').trim();
      if(!name) return;
      const sel = (id === String(selected || '')) ? ' selected' : '';
      opts.push(`<option value="${escapeHtml(id)}"${sel}>${escapeHtml(name)}</option>`);
    });
    return opts.join('');
  }

  const tagChipHtml = (etiquetas || []).map(it => {
    const id = String(it.id);
    const name = String(it.nombre || '').trim();
    const on = tagIds.includes(id);
    return `<button class="tag-pick ${on ? 'on' : ''}" type="button" data-tag="${escapeHtml(id)}" aria-pressed="${on ? 'true' : 'false'}">${escapeHtml(name)}</button>`;
  }).join('') || `<div class="hint" style="margin-top:0">Agrega ETIQUETAS en CATÁLOGO para usar multi-etiquetas.</div>`;

  const bodyHtml = `
    ${missingHtml}
    <div class="mov-form">
      <div class="form-row">
        <div class="form-label">CONCEPTO</div>
        <input id="movConcepto" class="text-input" inputmode="text" autocapitalize="words" autocomplete="off" placeholder="Ej: RENTA / VENTA / LUZ…" value="${escapeHtml(concepto)}" />
      </div>

      <div class="grid-2">
        <div class="form-row">
          <div class="form-label">FECHA</div>
          <input id="movFecha" class="text-input" type="date" value="${escapeHtml(isValidDateStr(fechaStr) ? fechaStr : todayStr())}" />
        </div>
        <div class="form-row">
          <div class="form-label">MONEDA</div>
          <select id="movMoneda" class="select-input">
            <option value="C$" ${moneda === 'C$' ? 'selected' : ''}>C$</option>
            <option value="USD" ${moneda === 'USD' ? 'selected' : ''}>USD</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-label">MONTO</div>
        <input id="movMonto" class="text-input money-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${isEdit ? escapeHtml(moneyLabel(monto)) : ''}" />
        <div class="hint" style="margin-top:8px">Primer ingreso: en blanco. En edición: se auto-selecciona.</div>
      </div>

      ${type === 'ingresos' ? `
        <div class="form-row">
          <div class="form-label">ORIGEN</div>
          <select id="movOrigen" class="select-input">${buildOptions(origenes, origenId, 'Selecciona…')}</select>
        </div>
      ` : ''}

      <div class="grid-2">
        <div class="form-row">
          <div class="form-label">CUENTA</div>
          <select id="movCuenta" class="select-input">${buildOptions(cuentas, cuentaId, 'Selecciona…')}</select>
        </div>
        <div class="form-row">
          <div class="form-label">MÉTODO</div>
          <select id="movMetodo" class="select-input">${buildOptions(metodos, metodoId, 'Selecciona…')}</select>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-row">
          <div class="form-label">QUIÉN PAGÓ</div>
          <select id="movQuien" class="select-input">${buildOptions(miembros.map(m => ({ id: m.uid, nombre: memberName(m) })), quienPagoUid, 'Selecciona…')}</select>
        </div>
        <div class="form-row">
          <div class="form-label">BENEFICIO</div>
          <select id="movBeneficio" class="select-input">${buildOptions(beneficios, beneficioId, 'Selecciona…')}</select>
        </div>
      </div>

      <div class="grid-2">
        <div class="form-row">
          <div class="form-label">CATEGORÍA</div>
          <select id="movCategoria" class="select-input">${buildOptions(categorias, categoriaId, 'Selecciona…')}</select>
        </div>
        <div class="form-row">
          <div class="form-label">ETIQUETAS</div>
          <div class="tag-picks" id="tagPicks">${tagChipHtml}</div>
        </div>
      </div>

      ${type !== 'ingresos' ? `
        <div class="grid-3">
          <div class="form-row">
            <div class="form-label">FECHA TOPE</div>
            <input id="movFechaTope" class="text-input" type="date" value="${escapeHtml(isValidDateStr(fechaTopeStr) ? fechaTopeStr : '')}" />
          </div>
          <div class="form-row">
            <div class="form-label">FECHA PAGO</div>
            <input id="movFechaPago" class="text-input" type="date" value="${escapeHtml(isValidDateStr(fechaPagoStr) ? fechaPagoStr : '')}" />
          </div>
          <div class="form-row">
            <div class="form-label">ESTADO</div>
            <select id="movEstado" class="select-input">
              <option value="PENDIENTE" ${estado === 'PENDIENTE' ? 'selected' : ''}>PENDIENTE</option>
              <option value="PAGADO" ${estado === 'PAGADO' ? 'selected' : ''}>PAGADO</option>
              <option value="VENCIDO" ${estado === 'VENCIDO' ? 'selected' : ''}>VENCIDO</option>
            </select>
          </div>
        </div>
      ` : ''}

      ${type === 'gastos_fijos' ? `
        <div class="form-row">
          <label class="toggle-row">
            <input id="movRecurrente" type="checkbox" ${recurrente ? 'checked' : ''} />
            <span class="toggle-text">RECURRENTE (MENSUAL)</span>
          </label>
          <div class="hint" style="margin-top:8px">Si está activo, el sistema genera el gasto del mes al abrir el período (si no existe).</div>
        </div>
      ` : ''}

      <div class="form-row">
        <div class="form-label">NOTAS (OPCIONAL)</div>
        <textarea id="movNotas" class="text-area" rows="3" placeholder="Detalles…">${escapeHtml(notas)}</textarea>
      </div>
    </div>
  `;

  openModal({
    title: titleMap[type] || (isEdit ? 'EDITAR' : 'AGREGAR'),
    bodyHtml,
    primaryText: isEdit ? 'GUARDAR' : 'AGREGAR',
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
    onPrimary: async () => {
      // Validación
      const v = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
      };

      const concepto2 = String(v('movConcepto') || '').trim();
      const fecha2 = String(v('movFecha') || '').trim();
      const moneda2 = String(v('movMoneda') || '').trim() || 'C$';
      const monto2 = parseMoney(v('movMonto'));
      const cuenta2 = String(v('movCuenta') || '').trim();
      const metodo2 = String(v('movMetodo') || '').trim();
      const quien2 = String(v('movQuien') || '').trim();
      const beneficio2 = String(v('movBeneficio') || '').trim();
      const categoria2 = String(v('movCategoria') || '').trim();
      const notas2 = String((document.getElementById('movNotas') || {}).value || '').trim();

      const tagSel = [];
      const picks = document.getElementById('tagPicks');
      if(picks){
        picks.querySelectorAll('[data-tag]').forEach(b => {
          if(b.classList.contains('on')) tagSel.push(String(b.getAttribute('data-tag')));
        });
      }

      const origen2 = (type === 'ingresos') ? String(v('movOrigen') || '').trim() : '';
      const fechaTope2 = (type !== 'ingresos') ? String(v('movFechaTope') || '').trim() : '';
      const fechaPago2 = (type !== 'ingresos') ? String(v('movFechaPago') || '').trim() : '';
      const estado2 = (type !== 'ingresos') ? String(v('movEstado') || 'PENDIENTE').trim().toUpperCase() : '';
      const rec2 = (type === 'gastos_fijos') ? !!((document.getElementById('movRecurrente')||{}).checked) : false;

      if(reqCatalogMissing.length){
        toast('Falta configurar CATÁLOGO/MIEMBROS.');
        return;
      }
      if(!concepto2){ toast('Concepto requerido.'); return; }
      if(!isValidDateStr(fecha2)){ toast('Fecha requerida.'); return; }
      if(monto2 === null){ toast('Monto inválido.'); return; }
      if(!(monto2 > 0)){ toast('Monto debe ser > 0.'); return; }
      if(!cuenta2){ toast('Cuenta requerida.'); return; }
      if(!metodo2){ toast('Método requerido.'); return; }
      if(!quien2){ toast('Quién pagó requerido.'); return; }
      if(!beneficio2){ toast('Beneficio requerido.'); return; }
      if(!categoria2){ toast('Categoría requerida.'); return; }
      if(etiquetas.length && !tagSel.length){ toast('Selecciona al menos 1 etiqueta.'); return; }
      if(type === 'ingresos' && !origen2){ toast('Origen requerido.'); return; }

      if(type !== 'ingresos'){
        if(!isValidDateStr(fechaTope2)){ toast('Fecha tope requerida.'); return; }
      }

      let estadoFinal = estado2;
      if(type !== 'ingresos'){
        if(estadoFinal !== 'PAGADO'){
          // Vencido automático si aplica
          if(isValidDateStr(fechaTope2) && String(fechaTope2) < todayStr()) estadoFinal = 'VENCIDO';
          else if(estadoFinal !== 'VENCIDO') estadoFinal = 'PENDIENTE';
        }
        // Si hay fecha de pago y no se marcó pagado, sugiere pagado
        if(isValidDateStr(fechaPago2) && estadoFinal !== 'PAGADO'){
          estadoFinal = 'PAGADO';
        }
      }

      closeModal();
      setBusy(true, isEdit ? 'GUARDANDO…' : 'AGREGANDO…');
      try{
        await ensurePeriodDoc(periodId);
        const col = movCollectionRef(type, periodId);

        let docRef = null;
        let payloadId = isEdit ? item.id : null;

        let rkFinal = (type === 'gastos_fijos') ? (isEdit ? (item.recurrentKey || '') : '') : '';
        if(type === 'gastos_fijos' && rec2 && !rkFinal){
          rkFinal = genId();
        }

        // DocID estable para recurrentes del mes
        if(type === 'gastos_fijos' && rec2){
          const stableId = recDocId(rkFinal, periodId);
          payloadId = stableId;
          docRef = col.doc(stableId);
        } else if(payloadId){
          docRef = col.doc(payloadId);
        } else {
          docRef = col.doc();
          payloadId = docRef.id;
        }

        const payload = {
          tipo: type,
          concepto: concepto2,
          fechaStr: fecha2,
          moneda: moneda2,
          monto: monto2,
          cuentaId: cuenta2,
          metodoId: metodo2,
          quienPagoUid: quien2,
          beneficioId: beneficio2,
          categoriaId: categoria2,
          tagIds: tagSel,
          notas: notas2 || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if(!isEdit){
          payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          payload.createdBy = STATE.user.uid;
        }

        if(type === 'ingresos'){
          payload.origenId = origen2;
        } else {
          payload.fechaTopeStr = fechaTope2;
          payload.fechaPagoStr = isValidDateStr(fechaPago2) ? fechaPago2 : null;
          payload.estado = estadoFinal;
        }

        if(type === 'gastos_fijos'){
          payload.recurrente = rec2;
          payload.recurrentKey = rkFinal || null;
        }

        await docRef.set(payload, { merge: true });
        toast(isEdit ? 'Guardado.' : 'Agregado.');
      } catch(err){
        console.error(err);
        toast('No se pudo guardar.');
      } finally {
        setBusy(false);
      }
    }
  });

  // Wire tags
  setTimeout(() => {
    const picks = document.getElementById('tagPicks');
    if(picks){
      picks.querySelectorAll('[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => {
          const on = btn.classList.toggle('on');
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      });
    }

    const amount = document.getElementById('movMonto');
    if(amount){
      // limpieza suave de entrada
      amount.addEventListener('input', () => {
        const cur = amount.value;
        const norm = normalizeMoneyInput(cur);
        if(cur !== norm) amount.value = norm;
      });
    }

    // Foco UX
    if(isEdit){
      if(amount){ amount.focus(); amount.select(); }
      else {
        const c = document.getElementById('movConcepto');
        if(c){ c.focus(); c.select(); }
      }
    } else {
      const c = document.getElementById('movConcepto');
      if(c) c.focus();
    }
  }, 30);
}


function openTransferenciaModal({ mode, item }){
  if(isActivePeriodClosed()){
    toast("Período cerrado (solo lectura).");
    return;
  }
  const isEdit = mode === 'edit';

  ensureRequiredForMovimientos('transferencias');

  const cuentas = Array.isArray(STATE.catalogData.cuentas) ? STATE.catalogData.cuentas : [];
  const members = Array.isArray(STATE.familiaMembers) ? STATE.familiaMembers : [];

  const reqMissing = [];
  if(!cuentas.length) reqMissing.push('CUENTAS');
  if(!members.length) reqMissing.push('MIEMBROS');

  const fecha0 = isEdit && item ? (isValidDateStr(item.fechaStr) ? item.fechaStr : todayStr()) : todayStr();
  const cOri0 = isEdit && item ? String(item.cuentaOrigenId || '') : '';
  const cDst0 = isEdit && item ? String(item.cuentaDestinoId || '') : '';
  const monOri0 = isEdit && item ? String(item.monedaOrigen || 'C$') : 'C$';
  const monDst0 = isEdit && item ? String(item.monedaDestino || 'C$') : 'C$';
  const montoOri0 = isEdit && item ? moneyLabel(Number(item.montoOrigen)||0) : '';
  const tc0 = isEdit && item ? moneyLabel(Number(item.tc)||1) : '1.00';
  const quien0 = isEdit && item ? String(item.quienPagoUid || '') : (STATE.user ? STATE.user.uid : '');
  const notas0 = isEdit && item ? String(item.notas || '') : '';

  const buildOptions = (items, selected, placeholder) => {
    const base = [`<option value="">${escapeHtml(placeholder)}</option>`];
    for(const it of items){
      const sel = String(it.id) === String(selected) ? 'selected' : '';
      base.push(`<option value="${escapeHtml(it.id)}" ${sel}>${escapeHtml(it.nombre)}</option>`);
    }
    return base.join('');
  };

  const cuentasOriHtml = buildOptions(cuentas, cOri0, 'SELECCIONA…');
  const cuentasDstHtml = buildOptions(cuentas, cDst0, 'SELECCIONA…');
  const miembrosHtml = (members.length
    ? ['<option value="">SELECCIONA…</option>'].concat(members.map(m => {
        const sel = String(m.uid) === String(quien0) ? 'selected' : '';
        return `<option value="${escapeHtml(m.uid)}" ${sel}>${escapeHtml(memberName(m))}</option>`;
      }))
    : ['<option value="">SELECCIONA…</option>']).join('');

  openModal({
    title: isEdit ? 'EDITAR — TRANSFERENCIA' : 'AGREGAR — TRANSFERENCIA',
    bodyHtml: `
      ${reqMissing.length ? `<div class="notice">Falta configurar: ${escapeHtml(reqMissing.join(', '))}.</div>` : ''}

      <div class="mov-form">
        <div class="form-row grid-2">
          <div>
            <div class="form-label">FECHA</div>
            <input id="trFecha" class="text-input" type="date" value="${escapeHtml(fecha0)}" />
          </div>
          <div>
            <div class="form-label">QUIÉN PAGÓ</div>
            <select id="trQuien" class="select-input">${miembrosHtml}</select>
          </div>
        </div>

        <div class="form-row grid-2">
          <div>
            <div class="form-label">CUENTA ORIGEN</div>
            <select id="trCuentaOri" class="select-input">${cuentasOriHtml}</select>
          </div>
          <div>
            <div class="form-label">CUENTA DESTINO</div>
            <select id="trCuentaDst" class="select-input">${cuentasDstHtml}</select>
          </div>
        </div>

        <div class="form-row grid-2">
          <div>
            <div class="form-label">MONEDA ORIGEN</div>
            <select id="trMonOri" class="select-input">
              <option value="C$" ${monOri0==='C$'?'selected':''}>C$</option>
              <option value="USD" ${monOri0==='USD'?'selected':''}>USD</option>
            </select>
          </div>
          <div>
            <div class="form-label">MONEDA DESTINO</div>
            <select id="trMonDst" class="select-input">
              <option value="C$" ${monDst0==='C$'?'selected':''}>C$</option>
              <option value="USD" ${monDst0==='USD'?'selected':''}>USD</option>
            </select>
          </div>
        </div>

        <div class="form-row grid-2">
          <div>
            <div class="form-label">MONTO ORIGEN</div>
            <input id="trMontoOri" class="text-input money-input" inputmode="decimal" placeholder="0.00" value="${escapeHtml(montoOri0)}" />
          </div>
          <div>
            <div class="form-label">TIPO DE CAMBIO</div>
            <input id="trTC" class="text-input money-input" inputmode="decimal" placeholder="C$ por 1 USD" value="${escapeHtml(tc0)}" />
            <div class="hint" style="margin-top:8px">T/C se guarda por transacción. Si la moneda es igual, se guarda como <span class="mono">1.00</span>.</div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-label">MONTO DESTINO (calculado)</div>
          <input id="trMontoDst" class="text-input" readonly value="0.00" />
        </div>

        <div class="form-row">
          <div class="form-label">NOTA (opcional)</div>
          <textarea id="trNotas" class="text-area" rows="3" placeholder="Opcional…">${escapeHtml(String(notas0||''))}</textarea>
        </div>
      </div>
    `,
    primaryText: isEdit ? 'GUARDAR' : 'AGREGAR',
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
    onPrimary: async () => {
      const v = (id) => (document.getElementById(id) || {}).value;

      const fecha = String(v('trFecha') || '').trim();
      const cuentaOrigenId = String(v('trCuentaOri') || '').trim();
      const cuentaDestinoId = String(v('trCuentaDst') || '').trim();
      const monedaOrigen = String(v('trMonOri') || 'C$').trim();
      const monedaDestino = String(v('trMonDst') || 'C$').trim();
      const montoOrigen = parseMoney(v('trMontoOri'));
      const tcRaw = parseMoney(v('trTC'));
      const quienPagoUid = String(v('trQuien') || '').trim();
      const notas = String(v('trNotas') || '').trim();

      if(reqMissing.length){ toast('Falta configurar CATÁLOGO/MIEMBROS.'); return; }
      if(!isValidDateStr(fecha)){ toast('Fecha requerida.'); return; }
      if(!cuentaOrigenId){ toast('Cuenta origen requerida.'); return; }
      if(!cuentaDestinoId){ toast('Cuenta destino requerida.'); return; }
      if(cuentaOrigenId === cuentaDestinoId){ toast('Origen y destino no pueden ser la misma cuenta.'); return; }
      if(montoOrigen === null || !Number.isFinite(montoOrigen) || montoOrigen <= 0){ toast('Monto origen requerido.'); return; }
      if(!quienPagoUid){ toast('Quién pagó requerido.'); return; }

      const calc = computeTransferDestino(montoOrigen, monedaOrigen, monedaDestino, tcRaw);
      if(!calc.valid){ toast('Tipo de cambio requerido (C$ por 1 USD).'); return; }

      const montoDestino = calc.montoDestino;
      const tcUsed = calc.tcUsed;

      closeModal();
      setBusy(true, isEdit ? 'GUARDANDO…' : 'AGREGANDO…');
      try{
        const period = getActivePeriod();
        const periodId = period.id;
        await ensurePeriodDoc(periodId);
        const col = movCollectionRef('transferencias', periodId);

        let docRef = null;
        let payloadId = (isEdit && item && item.id) ? item.id : null;
        if(payloadId){
          docRef = col.doc(payloadId);
        } else {
          docRef = col.doc();
          payloadId = docRef.id;
        }

        const payload = {
          tipo: 'transferencias',
          fechaStr: fecha,
          cuentaOrigenId,
          cuentaDestinoId,
          monedaOrigen: monedaOrigen === 'USD' ? 'USD' : 'C$',
          montoOrigen: round2(montoOrigen),
          monedaDestino: monedaDestino === 'USD' ? 'USD' : 'C$',
          montoDestino: round2(montoDestino),
          tc: round2(tcUsed),
          quienPagoUid,
          notas: notas || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };

        if(!payloadId) payloadId = docRef.id;
        payload.id = payloadId;

        if(!isEdit){
          payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
          payload.createdBy = STATE.user.uid;
        }

        await docRef.set(payload, { merge: true });
        toast(isEdit ? 'Guardado.' : 'Agregado.');

        // fuerza re-render si estás en transferencias o resumen
        const r = routeFromHash();
        if(r === 'transferencias' || r === 'resumen') render();
      } catch(err){
        console.error(err);
        toast('No se pudo guardar la transferencia.');
      } finally {
        setBusy(false);
      }
    },
  });

  // UX + cálculo en vivo
  setTimeout(() => {
    const montoEl = document.getElementById('trMontoOri');
    const dstEl = document.getElementById('trMontoDst');
    const tcEl = document.getElementById('trTC');
    const monOEl = document.getElementById('trMonOri');
    const monDEl = document.getElementById('trMonDst');

    const recalc = () => {
      const mo = parseMoney(montoEl ? montoEl.value : '');
      const mO = monOEl ? monOEl.value : 'C$';
      const mD = monDEl ? monDEl.value : 'C$';

      if(tcEl){
        if(mO === mD){
          tcEl.value = '1.00';
          tcEl.setAttribute('disabled','disabled');
        } else {
          tcEl.removeAttribute('disabled');
        }
      }

      const t = parseMoney(tcEl ? tcEl.value : '');
      const calc = computeTransferDestino(mo || 0, mO, mD, t);
      if(dstEl){
        dstEl.value = calc.valid ? moneyLabel(calc.montoDestino) : '0.00';
      }
    };

    [montoEl, tcEl, monOEl, monDEl].forEach(el => {
      if(el) el.addEventListener('input', recalc);
      if(el) el.addEventListener('change', recalc);
    });

    recalc();

    if(montoEl){
      montoEl.focus();
      if(isEdit){
        try{ montoEl.select(); }catch(_e){}
      }
    }
  }, 10);
}

async function deleteMovimiento(type, id){
  if(isActivePeriodClosed()){
    toast("Período cerrado (solo lectura).");
    return;
  }
  const periodId = getActivePeriod().id;
  openModal({
    title: 'ELIMINAR',
    bodyHtml: `<p class="hint" style="margin-top:0">¿Eliminar este movimiento? Esta acción no se puede deshacer.</p>`,
    primaryText: 'ELIMINAR',
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
    onPrimary: async () => {
      closeModal();
      setBusy(true, 'ELIMINANDO…');
      try{
        await movCollectionRef(type, periodId).doc(id).delete();
        toast('Eliminado.');
      } catch(err){
        console.error(err);
        toast('No se pudo eliminar.');
      } finally {
        setBusy(false);
      }
    }
  });
}

async function updateMemberRole(targetUid, nextRole){
  if(!isAdmin()){
    toast('Solo ADMIN.');
    return;
  }
  if(!STATE.familiaId || !targetUid) return;

  const role = String(nextRole || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MIEMBRO';
  setBusy(true, 'ACTUALIZANDO ROL…');

  try{
    const famRef = FB.db.collection('familias').doc(STATE.familiaId);
    const userRef = FB.db.collection('users').doc(targetUid);
    const memberRef = FB.db.collection('familias').doc(STATE.familiaId).collection('miembros').doc(targetUid);

    await FB.db.runTransaction(async (tx) => {
      const famSnap = await tx.get(famRef);
      const fam = famSnap.exists ? (famSnap.data() || {}) : {};
      const members = Array.isArray(fam.members) ? fam.members.slice() : [];

      const idx = members.findIndex(m => (m && m.uid) === targetUid);
      if(idx < 0) throw new Error('NO_MEMBER');

      const admins = countAdmins(members);
      const cur = memberRole(members[idx]);
      if(cur === 'ADMIN' && role !== 'ADMIN' && admins <= 1){
        throw new Error('LAST_ADMIN');
      }

      members[idx] = { ...members[idx], rol: role };

      tx.set(famRef, { members, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      tx.set(memberRef, { role }, { merge: true });
      tx.set(userRef, { role }, { merge: true });
    });

    await refreshUserContext();
    await loadFamilyMembers({ force: true });
    toast('Rol actualizado.');
    render();
  } catch(err){
    console.error(err);
    const code = (err && err.message) ? err.message : '';
    if(code === 'LAST_ADMIN') toast('Debe quedar al menos 1 ADMIN.');
    else toast('No se pudo cambiar el rol.');
  } finally {
    setBusy(false);
  }
}

async function removeMember(targetUid){
  if(!isAdmin()){
    toast('Solo ADMIN.');
    return;
  }
  if(!STATE.familiaId || !targetUid) return;

  const members = await loadFamilyMembers({ force: true });
  const me = STATE.user ? STATE.user.uid : null;
  const tgt = members.find(m => m.uid === targetUid);
  const tgtRole = memberRole(tgt);
  const admins = countAdmins(members);
  if(tgtRole === 'ADMIN' && admins <= 1){
    toast('No puedes remover al último ADMIN.');
    return;
  }

  const label = memberName(tgt);

  openModal({
    title: 'CONFIRMAR REMOCIÓN',
    bodyHtml: `
      <p class="hint" style="margin-top:0">Vas a remover a <b>${escapeHtml(label)}</b> de la familia.</p>
      ${targetUid === me ? '<p class="hint">Esto también te sacará de la familia en este dispositivo.</p>' : ''}
    `,
    primaryText: 'REMOVER',
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
    onPrimary: async () => {
      closeModal();
      setBusy(true, 'REMOVIENDO…');
      try{
        const famRef = FB.db.collection('familias').doc(STATE.familiaId);
        const userRef = FB.db.collection('users').doc(targetUid);
        const memberRef = FB.db.collection('familias').doc(STATE.familiaId).collection('miembros').doc(targetUid);

        await FB.db.runTransaction(async (tx) => {
          const famSnap = await tx.get(famRef);
          const fam = famSnap.exists ? (famSnap.data() || {}) : {};
          const list = Array.isArray(fam.members) ? fam.members.slice() : [];

          const adminsNow = countAdmins(list);
          const cur = list.find(m => (m && m.uid) === targetUid);
          const curRole = memberRole(cur);
          if(curRole === 'ADMIN' && adminsNow <= 1) throw new Error('LAST_ADMIN');

          const next = list.filter(m => (m && m.uid) !== targetUid);
          tx.set(famRef, { members: next, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
          tx.delete(memberRef);
          tx.set(userRef, {
            familiaId: firebase.firestore.FieldValue.delete(),
            role: firebase.firestore.FieldValue.delete(),
          }, { merge: true });
        });

        await refreshUserContext();
        STATE.familiaMembers = null;
        toast('Miembro removido.');
        render();
      } catch(err){
        console.error(err);
        const code = (err && err.message) ? err.message : '';
        if(code === 'LAST_ADMIN') toast('Debe quedar al menos 1 ADMIN.');
        else toast('No se pudo remover.');
      } finally {
        setBusy(false);
      }
    }
  });
}

function renderFamilySectionHtml(){
  if(!STATE.fbOk){
    const why = STATE.fbReason === 'CONFIG'
      ? 'Firebase no está configurado. Edita /js/firebaseConfig.js.'
      : 'Firebase no está disponible (SDK/INIT).';

    return `
      <div class="section-card">
        <div class="section-head">
          <div>
            <div class="section-kicker">FAMILIA</div>
            <div class="section-title">SIN FIREBASE</div>
            <div class="section-sub">${escapeHtml(why)}</div>
          </div>
          <button id="btnIrAcceso" class="chip-btn" type="button">ACCESO</button>
        </div>
        <p class="hint">Login + invitaciones requieren Firebase Auth (Google) + Firestore.</p>
      </div>
    `;
  }

  if(!STATE.user){
    return `
      <div class="section-card">
        <div class="section-head">
          <div>
            <div class="section-kicker">FAMILIA</div>
            <div class="section-title">INICIA SESIÓN</div>
            <div class="section-sub">Necesario para compartir datos entre 2 usuarios.</div>
          </div>
          <button id="btnIrAcceso" class="chip-btn" type="button">ACCESO</button>
        </div>
      </div>
    `;
  }

  if(!STATE.familiaId){
    return `
      <div class="section-card">
        <div class="section-head">
          <div>
            <div class="section-kicker">FAMILIA</div>
            <div class="section-title">SIN VINCULAR</div>
            <div class="section-sub">Crea o únete con un código.</div>
          </div>
          <button id="btnIrAcceso" class="chip-btn" type="button">ACCESO</button>
        </div>
      </div>
    `;
  }

  const famName = (STATE.familia && STATE.familia.name) ? STATE.familia.name : 'FAMILIA GM';

  return `
    <div class="section-card">
      <div class="section-head">
        <div>
          <div class="section-kicker">FAMILIA</div>
          <div class="section-title">${escapeHtml(famName)}</div>
          <div class="section-sub">ID: <span class="mono">${escapeHtml(STATE.familiaId)}</span> • ROL: <span class="mono">${escapeHtml(STATE.role || '—')}</span></div>
        </div>
        <button id="btnIrAcceso" class="chip-btn" type="button">ACCESO</button>
      </div>

      <div class="actions family-actions">
        <button id="btnInvitar" class="action-btn" type="button">INVITAR</button>
        <button id="btnMiembros" class="action-btn" type="button">MIEMBROS</button>
      </div>

      <p class="hint">Invitar genera un código <span class="mono">GM-XXXX</span> (1 uso) con expiración.</p>
    </div>
  `;
}

function wireFamilySection(){
  const b = document.getElementById('btnIrAcceso');
  if(b) b.addEventListener('click', () => location.hash = 'acceso');

  const inv = document.getElementById('btnInvitar');
  if(inv) inv.addEventListener('click', () => createInvite());

  const mem = document.getElementById('btnMiembros');
  if(mem) mem.addEventListener('click', async () => {
    if(!STATE.user || !STATE.familiaId){
      toast('Primero vincula una familia.');
      return;
    }
    STATE.resumenSubView = 'miembros';
    STATE.familiaMembers = null;
    await loadFamilyMembers({ force: true });
    render();
  });
}



function renderResumenView(){
  if(STATE.resumenSubView === 'miembros'){
    renderMiembrosView();
    return;
  }
  if(STATE.resumenSubView === 'historico'){
    renderHistoricoSubView();
    return;
  }

  const period = getActivePeriod();
  const label = formatPeriodLabel(period);

  // Datos necesarios para RESUMEN (incluye TRANSFERENCIAS)
  ensureRequiredForMovimientos('ingresos');
  ensureRequiredForMovimientos('gastos_fijos');
  ensureRequiredForMovimientos('gastos_varios');
  ensureRequiredForMovimientos('transferencias');

  ensureMovSubscribed('ingresos');
  ensureMovSubscribed('gastos_fijos');
  ensureMovSubscribed('gastos_varios');
  ensureMovSubscribed('transferencias');

  // recurrentes (defensivo)
  ensureRecurringGastosFijosForPeriod(period).then(()=>{}).catch(()=>{});

  const ingresos = Array.isArray(STATE.mov.ingresos.items) ? STATE.mov.ingresos.items : [];
  const gf = Array.isArray(STATE.mov.gastos_fijos.items) ? STATE.mov.gastos_fijos.items : [];
  const gv = Array.isArray(STATE.mov.gastos_varios.items) ? STATE.mov.gastos_varios.items : [];
  const tr = Array.isArray(STATE.mov.transferencias.items) ? STATE.mov.transferencias.items : [];

  // ALERTAS bloqueantes (Etapa 9)
  const alerts = refreshAlerts();
  const blockingN = Number(alerts.blocking || 0) || 0;
  const hasBlocking = blockingN > 0;

  const meta = getActivePeriodMeta() || {};
  const status = String(meta.status || 'ABIERTO').toUpperCase();
  const isClosed = status === 'CERRADO';

  const excelSeq = Number(meta.excelSeq || 0) || 0;
  const excelBase = excelSeq ? formatExcelBaseName(excelSeq, period) : null;
  const exportOk = !!(meta.lastExportAt && Number(meta.lastExportSeq||0) === excelSeq);

  const loadingAny = !!(STATE.mov.ingresos.loading || STATE.mov.gastos_fijos.loading || STATE.mov.gastos_varios.loading || STATE.mov.transferencias.loading);

  const admin = isAdmin();
  const closeDisabled = !!(hasBlocking || !admin || loadingAny || isClosed);
  let cerrarTitle = '';
  if(hasBlocking) cerrarTitle = `Tienes ${blockingN} alerta(s) bloqueante(s). NO puedes cerrar.`;
  else if(!admin) cerrarTitle = 'Solo ADMIN puede cerrar.';
  else if(loadingAny) cerrarTitle = 'Espera a que termine de cargar.';
  else if(isClosed) cerrarTitle = 'Período cerrado (solo lectura).';
  else cerrarTitle = exportOk ? 'Listo para confirmar cierre.' : 'Debes EXPORTAR EXCEL antes de confirmar cierre.';

  const totIn = { 'C$': 0, 'USD': 0 };
  for(const it of ingresos){
    const cur = (String(it.moneda||'') === 'USD') ? 'USD' : 'C$';
    const amt = Number(it.monto);
    if(Number.isFinite(amt)) totIn[cur] = round2(totIn[cur] + amt);
  }

  const totOut = { 'C$': 0, 'USD': 0 };
  for(const it of gf.concat(gv)){
    if(!isPaidExpense(it)) continue;
    const cur = (String(it.moneda||'') === 'USD') ? 'USD' : 'C$';
    const amt = Number(it.monto);
    if(Number.isFinite(amt)) totOut[cur] = round2(totOut[cur] + amt);
  }

  const net = {
    'C$': round2(totIn['C$'] - totOut['C$']),
    'USD': round2(totIn['USD'] - totOut['USD']),
  };

  // Saldos por cuenta/moneda (incluye transferencias)
  const cuentas = Array.isArray(STATE.catalogData.cuentas) ? STATE.catalogData.cuentas : [];
  const bal = {}; // { [cuentaId]: { 'C$': n, 'USD': n } }

  const ensureAcc = (id) => {
    if(!id) return;
    if(!bal[id]) bal[id] = { 'C$': 0, 'USD': 0 };
  };
  const apply = (id, cur, delta) => {
    if(!id) return;
    ensureAcc(id);
    const k = (String(cur||'') === 'USD') ? 'USD' : 'C$';
    const d = Number(delta);
    if(!Number.isFinite(d)) return;
    bal[id][k] = round2(Number(bal[id][k] || 0) + d);
  };

  for(const c of cuentas){ ensureAcc(c.id); }

  for(const it of ingresos){
    apply(it.cuentaId, it.moneda, +Number(it.monto||0));
  }
  for(const it of gf.concat(gv)){
    if(!isPaidExpense(it)) continue;
    apply(it.cuentaId, it.moneda, -Number(it.monto||0));
  }
  for(const it of tr){
    apply(it.cuentaOrigenId, it.monedaOrigen, -Number(it.montoOrigen||0));
    apply(it.cuentaDestinoId, it.monedaDestino, +Number(it.montoDestino||0));
  }

  const rows = Object.keys(bal).map(id => ({
    id,
    name: optionLabelFromCatalog('cuentas', id),
    cs: Number(bal[id]['C$'] || 0),
    usd: Number(bal[id]['USD'] || 0),
  })).sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'es', { sensitivity:'base' }));

  const totalSaldo = rows.reduce((acc, r) => {
    acc.cs = round2(acc.cs + (Number(r.cs)||0));
    acc.usd = round2(acc.usd + (Number(r.usd)||0));
    return acc;
  }, { cs:0, usd:0 });

  const saldosHtml = cuentas.length ? `
    <div class="saldo-table">
      <div class="saldo-row saldo-head">
        <div class="saldo-name">CUENTA</div>
        <div class="saldo-amt">C$</div>
        <div class="saldo-amt">USD</div>
      </div>
      ${rows.map(r => `
        <div class="saldo-row">
          <div class="saldo-name" title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>
          <div class="saldo-amt mono">${escapeHtml(moneyLabel(r.cs))}</div>
          <div class="saldo-amt mono">${escapeHtml(moneyLabel(r.usd))}</div>
        </div>
      `).join('')}
      <div class="saldo-row saldo-total">
        <div class="saldo-name">TOTAL</div>
        <div class="saldo-amt mono">${escapeHtml(moneyLabel(totalSaldo.cs))}</div>
        <div class="saldo-amt mono">${escapeHtml(moneyLabel(totalSaldo.usd))}</div>
      </div>
      <div class="hint" style="margin-top:10px">Transferencias aplican a saldos. Ingresos/Gastos afectan saldos; gastos cuentan solo si están <b>PAGADO</b>.</div>
    </div>
  ` : `<div class="notice">Configura <b>CUENTAS</b> en CATÁLOGO para ver saldos.</div>`;

  const token = getGoogleAccessToken();
  const calStatus = token ? 'ACTIVO' : 'INACTIVO';
  const calHint = token ? 'Calendar PRO listo (fechas tope).' : 'Calendar PRO requiere re-login Google (scope calendar.events).';

  els.view.innerHTML = `
    <div class="resumen-head">
      <div class="period">
        <div class="period-kicker">PERÍODO</div>
        <div class="period-title">${escapeHtml(label)}</div>
        ${excelBase ? `<div class="period-sub">EXCEL: <span class="mono">${escapeHtml(excelBase)}</span> ${exportOk ? '• <b>EXPORTADO</b>' : ''}</div>` : ''}
      </div>
      <div class="status-pill" title="Estado del período">${escapeHtml(status)}</div>
    </div>

    ${loadingAny ? `<div class="notice">CARGANDO…</div>` : ''}

    <div class="cards">
      <div class="mini-card">
        <div class="mini-label">INGRESOS</div>
        <div class="mini-value">
          <div class="mini-money"><span class="mini-cur">C$</span><span class="mono">${escapeHtml(moneyLabel(totIn['C$']))}</span></div>
          <div class="mini-money"><span class="mini-cur">USD</span><span class="mono">${escapeHtml(moneyLabel(totIn['USD']))}</span></div>
        </div>
      </div>
      <div class="mini-card">
        <div class="mini-label">GASTOS (PAGADOS)</div>
        <div class="mini-value">
          <div class="mini-money"><span class="mini-cur">C$</span><span class="mono">${escapeHtml(moneyLabel(totOut['C$']))}</span></div>
          <div class="mini-money"><span class="mini-cur">USD</span><span class="mono">${escapeHtml(moneyLabel(totOut['USD']))}</span></div>
        </div>
      </div>
      <div class="mini-card">
        <div class="mini-label">NETO</div>
        <div class="mini-value">
          <div class="mini-money"><span class="mini-cur">C$</span><span class="mono">${escapeHtml(moneyLabel(net['C$']))}</span></div>
          <div class="mini-money"><span class="mini-cur">USD</span><span class="mono">${escapeHtml(moneyLabel(net['USD']))}</span></div>
        </div>
      </div>
    </div>

    <div class="actions">
      <button id="btnHistorico" class="action-btn" type="button">HISTÓRICO</button>
      <button id="btnExcel" class="action-btn" type="button">EXPORTAR EXCEL</button>
      <button id="btnCerrar" class="action-btn danger" type="button" ${closeDisabled ? 'aria-disabled="true"' : ''} title="${escapeHtml(cerrarTitle)}">CERRAR PERÍODO</button>
    </div>

    ${hasBlocking ? `<div class="notice">ALERTAS bloqueantes: <b>${blockingN}</b>. Ve a <b>ALERTAS</b> para resolver.</div>` : ''}

    <div class="section-card">
      <div class="section-head">
        <div>
          <div class="section-kicker">RESUMEN</div>
          <div class="section-title">SALDOS POR CUENTA</div>
          <div class="section-sub">Incluye TRANSFERENCIAS USD↔C$ con T/C guardado por movimiento.</div>
        </div>
      </div>
      ${saldosHtml}
    </div>

    <div class="section-card">
      <div class="section-head">
        <div>
          <div class="section-kicker">HERRAMIENTAS</div>
          <div class="section-title">CALENDAR PRO + BACKUP</div>
          <div class="section-sub">Calendar PRO: <b>${escapeHtml(calStatus)}</b> • ${escapeHtml(calHint)}</div>
        </div>
      </div>

      <div class="actions" style="margin-top:10px">
        <button id="btnBackupExport" class="action-btn" type="button">EXPORTAR BACKUP JSON</button>
        <button id="btnBackupImport" class="action-btn" type="button" ${admin ? '' : 'aria-disabled="true" title="Solo ADMIN"'}>IMPORTAR BACKUP JSON</button>
      </div>
      <input id="backupFile" type="file" accept="application/json" style="display:none" />
      <p class="hint">Importar (ADMIN) reemplaza <b>período activo</b> y <b>catálogo</b>. Haz export antes.</p>
    </div>

    ${renderFamilySectionHtml()}
  `;

  const b1 = document.getElementById('btnHistorico');
  const b2 = document.getElementById('btnExcel');
  const b3 = document.getElementById('btnCerrar');
  const bxp = document.getElementById('btnBackupExport');
  const bip = document.getElementById('btnBackupImport');
  const fin = document.getElementById('backupFile');

  if(b1) b1.addEventListener('click', () => {
    STATE.resumenSubView = 'historico';
    render();
  });

  if(b2) b2.addEventListener('click', () => exportExcelCurrentPeriod());

  if(b3) b3.addEventListener('click', () => {
    if(hasBlocking){
      location.hash = 'alertas';
      toast('Hay alertas bloqueantes.');
      return;
    }
    if(!admin){
      toast('Solo ADMIN puede cerrar.');
      return;
    }
    if(loadingAny){
      toast('Espera a que termine de cargar.');
      return;
    }
    if(isClosed){
      toast('Período cerrado (solo lectura).');
      return;
    }
    openClosePeriodModal();
  });

  if(bxp) bxp.addEventListener('click', () => exportBackupJson());

  if(bip) bip.addEventListener('click', () => {
    if(!admin){ toast('Solo ADMIN.'); return; }
    if(fin) fin.click();
  });

  if(fin) fin.addEventListener('change', async (ev) => {
    const file = ev.target && ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if(!file) return;
    await importBackupJsonFile(file);
  });

  wireFamilySection();
}

function initialsFrom(name){
  const s = String(name || '').trim();
  if(!s) return 'GM';
  const parts = s.split(/\s+/).filter(Boolean);
  const a = (parts[0] || '').slice(0,1);
  const b = (parts[1] || '').slice(0,1);
  return (a + b).toUpperCase() || 'GM';
}

function renderMiembrosView(){
  const famName = (STATE.familia && STATE.familia.name) ? STATE.familia.name : 'FAMILIA GM';
  const members = Array.isArray(STATE.familiaMembers) ? STATE.familiaMembers : [];
  const admin = isAdmin();

  const listHtml = members.length ? members.map(m => {
    const uid = m.uid;
    const name = memberName(m);
    const email = memberEmail(m);
    const rol = memberRole(m);
    const me = STATE.user && STATE.user.uid === uid;

    return `
      <div class="member-row">
        <div class="member-left">
          <div class="member-avatar" aria-hidden="true">${escapeHtml(initialsFrom(name))}</div>
          <div class="member-meta">
            <div class="member-name">${escapeHtml(name)}${me ? ' <span class="me-pill">(TÚ)</span>' : ''}</div>
            <div class="member-email">${escapeHtml(email || '—')}</div>
          </div>
        </div>
        <div class="member-right">
          <span class="role-badge ${rol === 'ADMIN' ? 'admin' : 'member'}">${rol}</span>
          ${admin ? `
            <div class="member-actions">
              <button class="chip-btn chip-mini" type="button" data-act="role" data-uid="${escapeHtml(uid)}">CAMBIAR ROL</button>
              <button class="chip-btn chip-mini danger" type="button" data-act="remove" data-uid="${escapeHtml(uid)}">REMOVER</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('') : `
    <div class="notice">No hay miembros aún (o no se pudieron cargar).</div>
  `;

  els.view.innerHTML = `
    <div class="subhead">
      <button id="btnBackResumen" class="chip-btn" type="button">VOLVER</button>
      <div>
        <div class="section-kicker">MIEMBROS</div>
        <div class="section-title">${escapeHtml(famName)}</div>
        <div class="section-sub">Solo ADMIN puede cambiar roles y remover.</div>
      </div>
      <button id="btnRefreshMembers" class="chip-btn" type="button">ACTUALIZAR</button>
    </div>

    <div class="members-list">
      ${listHtml}
    </div>
  `;

  const back = document.getElementById('btnBackResumen');
  if(back) back.addEventListener('click', () => {
    STATE.resumenSubView = 'main';
    render();
  });

  const ref = document.getElementById('btnRefreshMembers');
  if(ref) ref.addEventListener('click', async () => {
    setBusy(true, 'CARGANDO MIEMBROS…');
    try{
      await loadFamilyMembers({ force: true });
      render();
    } finally {
      setBusy(false);
    }
  });

  // Acciones ADMIN
  if(admin){
    els.view.querySelectorAll('[data-act="role"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-uid');
        const m = members.find(x => x.uid === uid);
        const cur = memberRole(m);
        openRolePicker(uid, memberName(m), cur);
      });
    });

    els.view.querySelectorAll('[data-act="remove"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-uid');
        removeMember(uid);
      });
    });
  }
}

function openRolePicker(uid, name, currentRole){
  const cur = String(currentRole || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'MIEMBRO';
  openModal({
    title: 'CAMBIAR ROL',
    bodyHtml: `
      <p class="hint" style="margin-top:0">Miembro: <b>${escapeHtml(name || 'MIEMBRO')}</b></p>
      <div class="role-picker">
        <button id="pickAdmin" class="action-btn ${cur === 'ADMIN' ? 'primary' : ''}" type="button">ADMIN</button>
        <button id="pickMember" class="action-btn ${cur !== 'ADMIN' ? 'primary' : ''}" type="button">MIEMBRO</button>
      </div>
      <p class="hint">Tip: debe quedar al menos 1 ADMIN.</p>
    `,
    primaryText: 'CERRAR',
    onPrimary: () => closeModal(),
  });

  const a = document.getElementById('pickAdmin');
  const m = document.getElementById('pickMember');
  if(a) a.addEventListener('click', async () => {
    closeModal();
    await updateMemberRole(uid, 'ADMIN');
  });
  if(m) m.addEventListener('click', async () => {
    closeModal();
    await updateMemberRole(uid, 'MIEMBRO');
  });
}

function renderPlaceholderView(tab){
  els.view.innerHTML = `
    <h2>${tab.label}</h2>
    <p>Vista base lista. Aquí irá el contenido funcional en las siguientes etapas.</p>
  `;
}

function renderMovList({ type, titleKicker, titleMain, subtitle, filtersHtml, itemsHtml, loading, onAdd }){
  const period = getActivePeriod();
  const label = formatPeriodLabel(period);
  const readOnly = isActivePeriodClosed();
  els.view.innerHTML = `
    <div class="subhead">
      <div></div>
      <div>
        <div class="section-kicker">${escapeHtml(titleKicker)}</div>
        <div class="section-title">${escapeHtml(titleMain)} • ${escapeHtml(label)}</div>
        <div class="section-sub">${escapeHtml(subtitle || '')}</div>
      </div>
      <button id="btnMovAdd" class="chip-btn" type="button" ${readOnly ? 'aria-disabled="true" title="Período cerrado (solo lectura)."' : ''}>AGREGAR</button>
    </div>

    <div class="mov-toolbar">
      ${filtersHtml || ''}
    </div>

    ${loading ? `<div class="notice">CARGANDO…</div>` : ''}

    <div class="mov-list">
      ${itemsHtml || `<div class="mov-empty">Aún no hay registros.</div>`}
    </div>
  `;

  const add = document.getElementById('btnMovAdd');
  if(add) add.addEventListener('click', () => {
    if(readOnly){
      toast('Período cerrado (solo lectura).');
      return;
    }
    if(typeof onAdd === 'function') onAdd();
    else openMovimientoModal({ type, mode: 'add' });
  });
}

function renderIngresosView(){
  ensureRequiredForMovimientos('ingresos');
  ensureMovSubscribed('ingresos');

  const slot = STATE.mov.ingresos;
  const items0 = Array.isArray(slot.items) ? slot.items.slice() : [];

  // filtros
  const q = slot.q || '';
  const moneda = slot.moneda || 'ALL';
  const origenId = slot.origenId || 'ALL';

  let items = filterByText(items0, q);
  if(moneda !== 'ALL') items = items.filter(it => String(it.moneda || '') === moneda);
  if(origenId !== 'ALL') items = items.filter(it => String(it.origenId || '') === origenId);

  const origenes = Array.isArray(STATE.catalogData.origenes) ? STATE.catalogData.origenes : [];
  const origenOpts = ['<option value="ALL">ORIGEN: TODOS</option>']
    .concat(origenes.map(o => `<option value="${escapeHtml(o.id)}" ${String(o.id)===String(origenId)?'selected':''}>ORIGEN: ${escapeHtml(o.nombre)}</option>`))
    .join('');

  const filtersHtml = `
    <input id="movSearch" class="text-input mov-search" inputmode="text" placeholder="Buscar…" value="${escapeHtml(q)}" />
    <select id="movMonFilter" class="select-input mov-filter">
      <option value="ALL">MONEDA: TODAS</option>
      <option value="C$" ${moneda==='C$'?'selected':''}>MONEDA: C$</option>
      <option value="USD" ${moneda==='USD'?'selected':''}>MONEDA: USD</option>
    </select>
    <select id="movOriFilter" class="select-input mov-filter">${origenOpts}</select>
  `;

  const itemsHtml = items.length ? items.map(it => {
    const amount = `${it.moneda === 'USD' ? 'USD' : 'C$'} ${moneyLabel(Number(it.monto)||0)}`;
    const fecha = isValidDateStr(it.fechaStr) ? it.fechaStr : '—';
    const origen = optionLabelFromCatalog('origenes', it.origenId);
    const cuenta = optionLabelFromCatalog('cuentas', it.cuentaId);
    const metodo = optionLabelFromCatalog('metodos', it.metodoId);
    const quien = memberLabel(it.quienPagoUid);
    const beneficio = optionLabelFromCatalog('beneficios', it.beneficioId);
    const categoria = optionLabelFromCatalog('categorias', it.categoriaId);
    const notas = it.notas ? `<div class="mov-notes">${escapeHtml(String(it.notas))}</div>` : '';

    return `
      <div class="mov-card">
        <div class="mov-top">
          <div class="mov-title" title="${escapeHtml(it.concepto || '')}">${escapeHtml(it.concepto || '—')}</div>
          <div class="mov-amount">${escapeHtml(amount)}</div>
        </div>
        <div class="mov-meta">FECHA: <span class="mono">${escapeHtml(fecha)}</span> • ORIGEN: <span class="mono">${escapeHtml(origen)}</span></div>
        <div class="mov-meta">CUENTA: <span class="mono">${escapeHtml(cuenta)}</span> • MÉTODO: <span class="mono">${escapeHtml(metodo)}</span></div>
        <div class="mov-meta">QUIÉN: <span class="mono">${escapeHtml(quien)}</span> • BENEFICIO: <span class="mono">${escapeHtml(beneficio)}</span></div>
        <div class="mov-meta">CATEGORÍA: <span class="mono">${escapeHtml(categoria)}</span></div>
        ${renderTagsChips(it.tagIds)}
        ${notas}
        <div class="mov-actions">
          <button class="chip-btn chip-mini" type="button" data-mov-edit="1" data-id="${escapeHtml(it.id)}">EDITAR</button>
          <button class="chip-btn chip-mini danger" type="button" data-mov-del="1" data-id="${escapeHtml(it.id)}">ELIMINAR</button>
        </div>
      </div>
    `;
  }).join('') : '';

  renderMovList({
    type: 'ingresos',
    titleKicker: 'MOVIMIENTOS',
    titleMain: 'INGRESOS',
    subtitle: 'Registros del período activo. Campos completos + filtros básicos.',
    filtersHtml,
    itemsHtml,
    loading: !!slot.loading,
  });

  // wire filtros
  const s = document.getElementById('movSearch');
  if(s) s.addEventListener('input', () => { STATE.mov.ingresos.q = s.value; renderIngresosView(); });
  const m = document.getElementById('movMonFilter');
  if(m) m.addEventListener('change', () => { STATE.mov.ingresos.moneda = m.value; renderIngresosView(); });
  const o = document.getElementById('movOriFilter');
  if(o) o.addEventListener('change', () => { STATE.mov.ingresos.origenId = o.value; renderIngresosView(); });

  // wire acciones
  els.view.querySelectorAll('[data-mov-edit="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const it = items0.find(x => x.id === id);
      if(it) openMovimientoModal({ type: 'ingresos', mode: 'edit', item: it });
    });
  });
  els.view.querySelectorAll('[data-mov-del="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteMovimiento('ingresos', id);
    });
  });
}

function renderGastosView(type){
  ensureRequiredForMovimientos(type);
  ensureMovSubscribed(type);

  const period = getActivePeriod();
  if(type === 'gastos_fijos'){
    ensureRecurringGastosFijosForPeriod(period).then(()=>{}).catch(()=>{});
  }

  const slot = STATE.mov[type];
  const items0 = Array.isArray(slot.items) ? slot.items.slice() : [];
  const q = slot.q || '';
  const estado = slot.estado || 'ALL';

  let items = filterByText(items0, q).map(it => ({ ...it, _estadoCalc: computeEstado(it) }));
  if(estado !== 'ALL') items = items.filter(it => it._estadoCalc === estado);

  const filtersHtml = `
    <input id="movSearch" class="text-input mov-search" inputmode="text" placeholder="Buscar…" value="${escapeHtml(q)}" />
    <select id="movEstFilter" class="select-input mov-filter">
      <option value="ALL">ESTADO: TODOS</option>
      <option value="PENDIENTE" ${estado==='PENDIENTE'?'selected':''}>ESTADO: PENDIENTE</option>
      <option value="PAGADO" ${estado==='PAGADO'?'selected':''}>ESTADO: PAGADO</option>
      <option value="VENCIDO" ${estado==='VENCIDO'?'selected':''}>ESTADO: VENCIDO</option>
    </select>
  `;

  const titleMain = type === 'gastos_fijos' ? 'GASTOS FIJOS' : 'GASTOS VARIOS';
  const subtitle = type === 'gastos_fijos'
    ? 'Incluye recurrentes mensuales (auto-genera el mes si falta).'
    : 'Gastos no recurrentes del período.';

  const itemsHtml = items.length ? items.map(it => {
    const amount = `${it.moneda === 'USD' ? 'USD' : 'C$'} ${moneyLabel(Number(it.monto)||0)}`;
    const fecha = isValidDateStr(it.fechaStr) ? it.fechaStr : '—';
    const tope = isValidDateStr(it.fechaTopeStr) ? it.fechaTopeStr : '—';
    const pago = isValidDateStr(it.fechaPagoStr) ? it.fechaPagoStr : '—';
    const est = it._estadoCalc || computeEstado(it);
    const cuenta = optionLabelFromCatalog('cuentas', it.cuentaId);
    const metodo = optionLabelFromCatalog('metodos', it.metodoId);
    const quien = memberLabel(it.quienPagoUid);
    const beneficio = optionLabelFromCatalog('beneficios', it.beneficioId);
    const categoria = optionLabelFromCatalog('categorias', it.categoriaId);
    const notas = it.notas ? `<div class="mov-notes">${escapeHtml(String(it.notas))}</div>` : '';
    const rec = (type === 'gastos_fijos' && it.recurrente) ? `<span class="badge rec">REC</span>` : '';

    return `
      <div class="mov-card">
        <div class="mov-top">
          <div class="mov-title" title="${escapeHtml(it.concepto || '')}">${escapeHtml(it.concepto || '—')}</div>
          <div class="mov-amount">${escapeHtml(amount)}</div>
        </div>
        <div class="mov-meta">${rec}<span class="badge status ${est.toLowerCase()}">${escapeHtml(est)}</span> • FECHA: <span class="mono">${escapeHtml(fecha)}</span></div>
        <div class="mov-meta">TOPE: <span class="mono">${escapeHtml(tope)}</span> • PAGO: <span class="mono">${escapeHtml(pago)}</span></div>
        <div class="mov-meta">CUENTA: <span class="mono">${escapeHtml(cuenta)}</span> • MÉTODO: <span class="mono">${escapeHtml(metodo)}</span></div>
        <div class="mov-meta">QUIÉN: <span class="mono">${escapeHtml(quien)}</span> • BENEFICIO: <span class="mono">${escapeHtml(beneficio)}</span></div>
        <div class="mov-meta">CATEGORÍA: <span class="mono">${escapeHtml(categoria)}</span></div>
        ${renderTagsChips(it.tagIds)}
        ${notas}
        <div class="mov-actions">
          <button class="chip-btn chip-mini" type="button" data-mov-edit="1" data-id="${escapeHtml(it.id)}">EDITAR</button>
          <button class="chip-btn chip-mini danger" type="button" data-mov-del="1" data-id="${escapeHtml(it.id)}">ELIMINAR</button>
        </div>
      </div>
    `;
  }).join('') : '';

  renderMovList({
    type,
    titleKicker: 'MOVIMIENTOS',
    titleMain,
    subtitle,
    filtersHtml,
    itemsHtml,
    loading: !!slot.loading,
  });

  const s = document.getElementById('movSearch');
  if(s) s.addEventListener('input', () => { STATE.mov[type].q = s.value; renderGastosView(type); });
  const e = document.getElementById('movEstFilter');
  if(e) e.addEventListener('change', () => { STATE.mov[type].estado = e.value; renderGastosView(type); });

  els.view.querySelectorAll('[data-mov-edit="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const it = items0.find(x => x.id === id);
      if(it) openMovimientoModal({ type, mode: 'edit', item: it });
    });
  });
  els.view.querySelectorAll('[data-mov-del="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteMovimiento(type, id);
    });
  });
}

function renderGastosFijosView(){
  renderGastosView('gastos_fijos');
}

function renderGastosVariosView(){
  renderGastosView('gastos_varios');
}


function renderTransferenciasView(){
  ensureRequiredForMovimientos('transferencias');
  ensureMovSubscribed('transferencias');

  const slot = STATE.mov.transferencias;
  const items0 = Array.isArray(slot.items) ? slot.items.slice() : [];

  const q = slot.q || '';

  const qn = String(q || '').trim().toLowerCase();
  let items = items0;
  if(qn){
    items = items0.filter(it => {
      const a = optionLabelFromCatalog('cuentas', it.cuentaOrigenId);
      const b = optionLabelFromCatalog('cuentas', it.cuentaDestinoId);
      const who = memberLabel(it.quienPagoUid);
      const notes = String(it.notas || '');
      const hay = `${a} ${b} ${who} ${notes}`.toLowerCase();
      return hay.includes(qn);
    });
  }

  const filtersHtml = `
    <input id="movSearch" class="text-input mov-search" inputmode="text" placeholder="Buscar…" value="${escapeHtml(q)}" />
  `;

  const itemsHtml = items.length ? items.map(it => {
    const fecha = isValidDateStr(it.fechaStr) ? it.fechaStr : '—';
    const a = optionLabelFromCatalog('cuentas', it.cuentaOrigenId);
    const b = optionLabelFromCatalog('cuentas', it.cuentaDestinoId);

    const amtO = `${it.monedaOrigen === 'USD' ? 'USD' : 'C$'} ${moneyLabel(Number(it.montoOrigen)||0)}`;
    const amtD = `${it.monedaDestino === 'USD' ? 'USD' : 'C$'} ${moneyLabel(Number(it.montoDestino)||0)}`;

    const who = memberLabel(it.quienPagoUid);
    const tcLine = (String(it.monedaOrigen||'') !== String(it.monedaDestino||''))
      ? `T/C: <span class="mono">C$ ${escapeHtml(moneyLabel(Number(it.tc)||0))}</span> por 1 USD`
      : `T/C: <span class="mono">1.00</span>`;

    const notas = it.notas ? `<div class="mov-notes">${escapeHtml(String(it.notas))}</div>` : '';

    return `
      <div class="mov-card">
        <div class="mov-top">
          <div class="mov-title" title="${escapeHtml(a + ' → ' + b)}">${escapeHtml(a)} → ${escapeHtml(b)}</div>
          <div class="mov-amount">${escapeHtml(amtO)} → ${escapeHtml(amtD)}</div>
        </div>
        <div class="mov-meta">FECHA: <span class="mono">${escapeHtml(fecha)}</span> • ${tcLine}</div>
        <div class="mov-meta">QUIÉN: <span class="mono">${escapeHtml(who)}</span></div>
        ${notas}
        <div class="mov-actions">
          <button class="chip-btn chip-mini" type="button" data-tr-edit="1" data-id="${escapeHtml(it.id)}">EDITAR</button>
          <button class="chip-btn chip-mini danger" type="button" data-tr-del="1" data-id="${escapeHtml(it.id)}">ELIMINAR</button>
        </div>
      </div>
    `;
  }).join('') : '';

  renderMovList({
    type: 'transferencias',
    titleKicker: 'MOVIMIENTOS',
    titleMain: 'TRANSFERENCIAS',
    subtitle: 'Movimiento entre cuentas (no ingreso/gasto). USD↔C$ con T/C por transacción.',
    filtersHtml,
    itemsHtml,
    loading: !!slot.loading,
    onAdd: () => openTransferenciaModal({ mode: 'add' }),
  });

  const s = document.getElementById('movSearch');
  if(s) s.addEventListener('input', () => { STATE.mov.transferencias.q = s.value; renderTransferenciasView(); });

  els.view.querySelectorAll('[data-tr-edit="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const it = items0.find(x => x.id === id);
      if(it) openTransferenciaModal({ mode: 'edit', item: it });
    });
  });

  els.view.querySelectorAll('[data-tr-del="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      deleteMovimiento('transferencias', id);
    });
  });
}

function openMarkPaidModal(type, item){
  if(isActivePeriodClosed()){
    toast("Período cerrado (solo lectura).");
    return;
  }
  if(!item || !item.id) return;
  const concepto = String(item.concepto || 'GASTO').trim() || 'GASTO';
  const fechaTope = isValidDateStr(item.fechaTopeStr) ? item.fechaTopeStr : '—';
  const amount = `${item.moneda === 'USD' ? 'USD' : 'C$'} ${moneyLabel(Number(item.monto)||0)}`;
  const fp0 = todayStr();

  openModal({
    title: 'MARCAR PAGADO',
    bodyHtml: `
      <div class="notice" style="margin-top:0">
        <b>${escapeHtml(concepto)}</b><br/>
        MONTO: <span class="mono">${escapeHtml(amount)}</span> • TOPE: <span class="mono">${escapeHtml(fechaTope)}</span>
      </div>
      <div class="form-row" style="margin-top:12px">
        <div class="form-label">FECHA DE PAGO</div>
        <input id="payFecha" class="text-input" type="date" value="${escapeHtml(fp0)}" />
        <div class="hint" style="margin-top:10px">Esto setea FECHA PAGO y estado <b>PAGADO</b>.</div>
      </div>
    `,
    primaryText: 'MARCAR',
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
    onPrimary: async () => {
      const el = document.getElementById('payFecha');
      const fp = el ? String(el.value || '').trim() : '';
      if(!isValidDateStr(fp)){
        toast('Fecha de pago inválida.');
        return;
      }
      closeModal();
      setBusy(true, 'ACTUALIZANDO…');
      try{
        const period = getActivePeriod();
        await ensurePeriodDoc(period.id);
        const ref = movCollectionRef(type, period.id).doc(item.id);
        await ref.set({
          fechaPagoStr: fp,
          estado: 'PAGADO',
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Calendar PRO: opcional actualizar descripción (no borrar evento)
        try{ await calendarMarkExpensePaid({ ref, fechaPagoStr: fp }); }catch(_){/* ignore */}

        toast('Marcado como pagado.');
      } catch(err){
        console.error(err);
        toast('No se pudo marcar pagado.');
      } finally {
        setBusy(false);
      }
    }
  });
}

function renderAlertasView(){
  // ALERTAS necesita gastos para bandeja + bloqueo
  ensureRequiredForMovimientos('gastos_fijos');
  ensureRequiredForMovimientos('gastos_varios');
  ensureMovSubscribed('gastos_fijos');
  ensureMovSubscribed('gastos_varios');

  const period = getActivePeriod();
  const label = formatPeriodLabel(period);
  const a = refreshAlerts();

  const loadingAny = !!(STATE.mov.gastos_fijos.loading || STATE.mov.gastos_varios.loading);

  const pendingHtml = a.pending.length ? a.pending.map(it => {
    const amount = `${it.moneda === 'USD' ? 'USD' : 'C$'} ${moneyLabel(Number(it.monto)||0)}`;
    const tope = isValidDateStr(it.fechaTopeStr) ? it.fechaTopeStr : '—';
    const who = memberLabel(it.quienPagoUid);
    const tipoLbl = (it._type === 'gastos_fijos') ? 'GASTO FIJO' : 'GASTO VARIO';
    const b = dueBadge(it.fechaTopeStr);
    const badgeHtml = `<span class="badge status ${escapeHtml(b.cls)}">${escapeHtml(b.text)}</span>`;

    return `
      <div class="mov-card">
        <div class="mov-top">
          <div class="mov-title" title="${escapeHtml(it.concepto || '')}">${escapeHtml(it.concepto || '—')}</div>
          <div class="mov-amount">${escapeHtml(amount)}</div>
        </div>
        <div class="mov-meta">${badgeHtml}TOPE: <span class="mono">${escapeHtml(tope)}</span> • ${escapeHtml(tipoLbl)}</div>
        <div class="mov-meta">QUIÉN: <span class="mono">${escapeHtml(who)}</span></div>
        <div class="mov-actions">
          <button class="chip-btn chip-mini" type="button" data-al-pay="1" data-type="${escapeHtml(it._type)}" data-id="${escapeHtml(it.id)}">MARCAR PAGADO</button>
          <button class="chip-btn chip-mini" type="button" data-al-edit="1" data-type="${escapeHtml(it._type)}" data-id="${escapeHtml(it.id)}">EDITAR</button>
        </div>
      </div>
    `;
  }).join('') : `<div class="mov-empty">No hay pagos pendientes.</div>`;

  const incHtml = a.incompletes.length ? a.incompletes.map(it => {
    const amount = `${it.moneda === 'USD' ? 'USD' : 'C$'} ${moneyLabel(Number(it.monto)||0)}`;
    const fecha = isValidDateStr(it.fechaStr) ? it.fechaStr : '—';
    const tipoLbl = (it._type === 'gastos_fijos') ? 'GASTO FIJO' : 'GASTO VARIO';
    const missing = Array.isArray(it._missing) ? it._missing : [];
    const missHtml = missing.length ? `<div class="tag-row">${missing.map(x => `<span class="tag-chip">FALTA: ${escapeHtml(x)}</span>`).join('')}</div>` : '';
    return `
      <div class="mov-card">
        <div class="mov-top">
          <div class="mov-title" title="${escapeHtml(it.concepto || '')}">${escapeHtml(it.concepto || '—')}</div>
          <div class="mov-amount">${escapeHtml(amount)}</div>
        </div>
        <div class="mov-meta"><span class="badge status vencido">INCOMPLETO</span>FECHA: <span class="mono">${escapeHtml(fecha)}</span> • ${escapeHtml(tipoLbl)}</div>
        ${missHtml}
        <div class="mov-actions">
          <button class="chip-btn chip-mini" type="button" data-al-edit="1" data-type="${escapeHtml(it._type)}" data-id="${escapeHtml(it.id)}">EDITAR</button>
        </div>
      </div>
    `;
  }).join('') : `<div class="mov-empty">No hay incompletos críticos.</div>`;

  els.view.innerHTML = `
    <div class="subhead">
      <div></div>
      <div>
        <div class="section-kicker">BANDEJA</div>
        <div class="section-title">ALERTAS • ${escapeHtml(label)}</div>
        <div class="section-sub">Acciones rápidas. Si hay bloqueantes, el cierre del período se frena.</div>
      </div>
      <button id="btnIrResumen" class="chip-btn" type="button">IR A RESUMEN</button>
    </div>

    ${loadingAny ? `<div class="notice">CARGANDO…</div>` : ''}

    <div class="section-card">
      <div class="section-head">
        <div>
          <div class="section-kicker">ALERTAS</div>
          <div class="section-title">PAGOS PENDIENTES (${escapeHtml(String(a.pending.length))})</div>
          <div class="section-sub">Gastos con FECHA TOPE y sin FECHA PAGO.</div>
        </div>
      </div>
      <div class="mov-list" style="margin-top:12px">${pendingHtml}</div>
    </div>

    <div class="section-card">
      <div class="section-head">
        <div>
          <div class="section-kicker">ALERTAS</div>
          <div class="section-title">INCOMPLETOS CRÍTICOS (${escapeHtml(String(a.incompletes.length))})</div>
          <div class="section-sub">Registros sin CUENTA / MÉTODO / CATEGORÍA / MONTO.</div>
        </div>
      </div>
      <div class="mov-list" style="margin-top:12px">${incHtml}</div>
    </div>
  `;

  const go = document.getElementById('btnIrResumen');
  if(go) go.addEventListener('click', () => location.hash = 'resumen');

  // Acciones rápidas
  els.view.querySelectorAll('[data-al-pay="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const t = btn.getAttribute('data-type');
      const src = (t === 'gastos_fijos') ? (STATE.mov.gastos_fijos.items || []) : (STATE.mov.gastos_varios.items || []);
      const it = (src || []).find(x => x.id === id);
      if(it) openMarkPaidModal(t, it);
    });
  });
  els.view.querySelectorAll('[data-al-edit="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const t = btn.getAttribute('data-type');
      const src = (t === 'gastos_fijos') ? (STATE.mov.gastos_fijos.items || []) : (STATE.mov.gastos_varios.items || []);
      const it = (src || []).find(x => x.id === id);
      if(it) openMovimientoModal({ type: t, mode: 'edit', item: it });
    });
  });
}

function renderCatalogoView(){
  const admin = isAdmin();
  const famName = (STATE.familia && STATE.familia.name) ? STATE.familia.name : 'FAMILIA GM';

  // Garantiza selección válida
  if(!CATALOG_TYPES.some(t => t.id === STATE.catalogType)) STATE.catalogType = 'categorias';
  const typeId = STATE.catalogType;
  const label = catalogTypeLabel(typeId);

  // Carga en background si hace falta
  ensureCatalogLoaded(typeId);
  const loading = !!STATE.catalogLoading[typeId];
  const items = Array.isArray(STATE.catalogData[typeId]) ? STATE.catalogData[typeId] : [];

  const msg = admin
    ? 'ADMIN: puedes agregar, editar y eliminar.'
    : 'MIEMBRO: solo lectura.';

  const subtabs = CATALOG_TYPES.map(t => {
    const selected = t.id === typeId;
    return `<button class="subtab-btn" type="button" data-cat-type="${escapeHtml(t.id)}" aria-selected="${selected ? 'true' : 'false'}">${escapeHtml(t.label)}</button>`;
  }).join('');

  const listHtml = loading
    ? `<div class="notice">CARGANDO…</div>`
    : (items.length ? items.map(it => {
        return `
          <div class="cat-row">
            <div class="cat-name" title="${escapeHtml(it.nombre)}">${escapeHtml(it.nombre)}</div>
            ${admin ? `
              <div class="cat-actions">
                <button class="chip-btn chip-mini" type="button" data-cat-edit="1" data-id="${escapeHtml(it.id)}">EDITAR</button>
                <button class="chip-btn chip-mini danger" type="button" data-cat-del="1" data-id="${escapeHtml(it.id)}">ELIMINAR</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('') : `<div class="cat-empty">Aún no hay elementos.</div>`);

  els.view.innerHTML = `
    <div class="subhead">
      <div></div>
      <div>
        <div class="section-kicker">CATÁLOGO</div>
        <div class="section-title">${escapeHtml(famName)}</div>
        <div class="section-sub">ROL: <span class="mono">${escapeHtml(STATE.role || '—')}</span> • ${escapeHtml(msg)}</div>
      </div>
      <button id="btnCatRefresh" class="chip-btn" type="button">ACTUALIZAR</button>
    </div>

    <div class="subtabs-row" aria-label="Secciones de catálogo">
      ${subtabs}
    </div>

    <div class="cat-panel">
      <div class="cat-panel-head">
        <div>
          <div class="cat-panel-kicker">SECCIÓN</div>
          <div class="cat-panel-title">${escapeHtml(label)}</div>
        </div>
        ${admin ? `<button id="btnCatAdd" class="chip-btn" type="button">AGREGAR</button>` : ''}
      </div>

      ${!admin ? `<div class="notice">Solo ADMIN puede editar.</div>` : ''}

      <div class="cat-list">
        ${listHtml}
      </div>
    </div>
  `;

  // Subtabs
  els.view.querySelectorAll('[data-cat-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const next = btn.getAttribute('data-cat-type');
      if(next && next !== STATE.catalogType){
        STATE.catalogType = next;
        render();
      }
    });
  });

  const refresh = document.getElementById('btnCatRefresh');
  if(refresh) refresh.addEventListener('click', async () => {
    if(STATE.catalogLoading[typeId]) return;
    setBusy(true, 'CARGANDO…');
    try{
      await loadCatalogType(typeId, { force: true });
      toast('Actualizado.');
      render();
    } catch(err){
      console.error(err);
      toast('No se pudo actualizar.');
    } finally {
      setBusy(false);
    }
  });

  const add = document.getElementById('btnCatAdd');
  if(add) add.addEventListener('click', () => {
    openCatalogItemModal({ typeId, mode: 'add' });
  });

  // Editar / Eliminar
  if(admin){
    els.view.querySelectorAll('[data-cat-edit="1"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const it = items.find(x => x.id === id);
        if(it) openCatalogItemModal({ typeId, mode: 'edit', item: it });
      });
    });
    els.view.querySelectorAll('[data-cat-del="1"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const it = items.find(x => x.id === id);
        if(it) confirmDeleteCatalogItem(typeId, it);
      });
    });
  }
}

function renderAccessView(){
  const fbStatus = !STATE.fbOk
    ? (STATE.fbReason === 'CONFIG'
        ? 'Firebase no configurado. Edita /js/firebaseConfig.js y pega tu firebaseConfig.'
        : 'Firebase no disponible (SDK/INIT). Revisa conexión o versión de CDN.')
    : null;

  const u = STATE.user;
  const userHtml = u ? `
    <div class="user-box">
      <div class="user-left">
        <div class="avatar">${u.photoURL ? `<img src="${escapeHtml(u.photoURL)}" alt="" />` : '<span>GM</span>'}</div>
        <div>
          <div class="user-name">${escapeHtml(u.displayName || 'USUARIO')}</div>
          <div class="user-email">${escapeHtml(u.email || '')}</div>
        </div>
      </div>
      <button id="btnLogout" class="chip-btn" type="button">SALIR</button>
    </div>
  ` : '';

  const familyLinked = !!STATE.familiaId;

  els.view.innerHTML = `
    <div class="access-wrap">
      <h2>ACCESO</h2>
      ${fbStatus ? `<div class="notice">${escapeHtml(fbStatus)}</div>` : ''}

      ${userHtml}

      ${(!STATE.fbOk) ? `
        <p class="hint">Tip: cuando la configuración esté lista, recarga la app y verás el botón de Google.</p>
      ` : (!u) ? `
        <div class="auth-card">
          <div class="auth-title">INICIA SESIÓN</div>
          <button id="btnGoogle" class="action-btn primary" type="button">INICIAR CON GOOGLE</button>
          <p class="hint">Recomendado para habilitar Calendar PRO en etapas futuras.</p>
        </div>
      ` : (familyLinked) ? `
        <div class="auth-card">
          <div class="auth-title">FAMILIA VINCULADA</div>
          <div class="auth-sub">ID: <span class="mono">${escapeHtml(STATE.familiaId)}</span> • ROL: <span class="mono">${escapeHtml(STATE.role || '—')}</span></div>
          <button id="btnIrResumen" class="action-btn" type="button">IR A RESUMEN</button>
        </div>
      ` : `
        <div class="auth-card">
          <div class="auth-title">SIN FAMILIA</div>
          <div class="auth-sub">Crea una familia o únete usando un código.</div>

          <div class="access-actions">
            <button id="btnCrearFam" class="action-btn" type="button">CREAR FAMILIA</button>
          </div>

          <div class="join-box">
            <div class="join-title">UNIRME A FAMILIA</div>
            <div class="join-row">
              <input id="joinCode" class="text-input" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="GM-XXXX" />
              <button id="btnJoin" class="action-btn" type="button">UNIRME</button>
            </div>
            <p class="hint">El código es de 1 uso y normalmente expira en ~${INVITE_EXP_HOURS}h.</p>
          </div>
        </div>
      `}
    </div>
  `;

  const btnGoogle = document.getElementById('btnGoogle');
  if(btnGoogle) btnGoogle.addEventListener('click', () => signInGoogle());

  const btnLogout = document.getElementById('btnLogout');
  if(btnLogout) btnLogout.addEventListener('click', () => signOut());

  const btnCrear = document.getElementById('btnCrearFam');
  if(btnCrear) btnCrear.addEventListener('click', () => createFamily());

  const btnJoin = document.getElementById('btnJoin');
  if(btnJoin) btnJoin.addEventListener('click', () => {
    const inp = document.getElementById('joinCode');
    joinFamilyWithCode(inp ? inp.value : '');
  });

  const inp = document.getElementById('joinCode');
  if(inp) inp.addEventListener('keydown', (e) => {
    if(e.key === 'Enter'){
      e.preventDefault();
      joinFamilyWithCode(inp.value);
    }
  });

  const btnIr = document.getElementById('btnIrResumen');
  if(btnIr) btnIr.addEventListener('click', () => location.hash = 'resumen');
}

function renderSystemLoading(){
  els.view.innerHTML = `
    <div class="access-wrap">
      <h2>CARGANDO…</h2>
      <p class="hint">Preparando ACCESO y FAMILIA.</p>
    </div>
  `;
}

function render(){
  const route = routeFromHash();

  // Hero por pestaña (Etapa 2)
  const tabForHero = TABS.find(t => t.id === route) || (TABS.find(t => t.id === 'resumen') || TABS[0]);
  setHeroFor(tabForHero);

  // Si sales de RESUMEN, vuelve a la vista principal.
  if(route !== 'resumen') STATE.resumenSubView = 'main';

  if(!STATE.authReady){
    setTabsVisible(false);
    renderSystemLoading();
    return;
  }

  // Si no hay Firebase, igual mostramos ACCESO con guía.
  if(!STATE.fbOk){
    setTabsVisible(false);
    if(route !== 'acceso') location.hash = 'acceso';
    renderAccessView();
    return;
  }

  // Auth listo
  if(!STATE.user || !STATE.familiaId){
    setTabsVisible(false);
    if(route !== 'acceso') location.hash = 'acceso';
    renderAccessView();
    return;
  }

  // Logueado + con familia
  if(route === 'acceso'){
    location.hash = 'resumen';
    return;
  }

   setTabsVisible(true);
  ensureActivePeriodMetaSubscribed();
  ensureHistoricoSubscribed();
  // ALERTAS badge (Etapa 9): mantenemos gastos suscritos para contar alertas
  ensureMovSubscribed('gastos_fijos');
  ensureMovSubscribed('gastos_varios');
  refreshAlerts();
  renderTabs(route);
  const tab = TABS.find(t => t.id === route) || TABS[0];
  if(tab.id === 'resumen') renderResumenView();
  else if(tab.id === 'ingresos') renderIngresosView();
  else if(tab.id === 'gastos_fijos') renderGastosFijosView();
  else if(tab.id === 'gastos_varios') renderGastosVariosView();
  else if(tab.id === 'alertas') renderAlertasView();
  else if(tab.id === 'catalogo') renderCatalogoView();
  else if(tab.id === 'transferencias') renderTransferenciasView();
  else if(tab.id === 'presupuesto') renderPresupuestoView();
  else if(tab.id === 'analitica') renderAnaliticaView();
  else renderPlaceholderView(tab);
}

window.addEventListener('hashchange', render);

/* PWA: SW */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}

/* Escudo: si falta, no rompas el layout */
els.crestImg.addEventListener('error', () => {
  els.crestImg.style.display = 'none';
});

/* Boot */
(function boot(){
  // UI inmediata
  render();

  // 1) Firebase init (si se puede)
  initFirebaseIfPossible();

  // 2) Si no hay Firebase, igual deja UI viva
  if(!STATE.fbOk){
    STATE.authReady = true;
    render();
    return;
  }

  // 3) Resultado de redirect (captura token OAuth para Calendar PRO)
  FB.auth.getRedirectResult().then((res) => {
    try{
      if(res && res.user){
        const token = (res.credential && res.credential.accessToken) || (res._tokenResponse && res._tokenResponse.oauthAccessToken) || null;
        const exp = (res._tokenResponse && Number(res._tokenResponse.expiresIn)) ? Number(res._tokenResponse.expiresIn) : 0;
        if(token) storeGoogleOAuthToken(res.user.uid, token, exp);
      }
    } catch(_){ /* ignore */ }
  }).catch(()=>{});

  // 4) Observa sesión
  FB.auth.onAuthStateChanged(async (user) => {
    STATE.user = user || null;
    STATE.authReady = true;

    try{
      if(user){
        loadGoogleOAuthToken(user.uid);
        await ensureUserDoc(user);
        await refreshUserContext();
      } else {
        STATE.familiaId = null;
        STATE.familia = null;
        STATE.role = '—';
      }
    } catch(err){
      console.error(err);
    }

    render();
  });
})();

/* =========================
   ETAPA 10 — Helpers: Meses/Excel
========================= */


function formatExcelBaseName(excelSeq, period){
  const n = Number(excelSeq||0);
  if(!(n >= 1)) return '';
  const p = period && period.id ? period : (typeof period === 'string' ? (parsePeriodId(period) || {}) : (period || {}));
  const y = Number(p.year || (String(p.id||'').split('-')[0]||0));
  const m = Number(p.month || (String(p.id||'').split('-')[1]||0));
  const mes = (m >= 1 && m <= 12) ? MONTHS_ES_TITLE[m-1] : 'Mes';
  return `${pad3(n)} ${mes} ${y}`.trim();
}

function nextPeriodIdFrom(periodId){
  const p = parsePeriodId(periodId);
  if(!p) return null;
  let y = p.year;
  let m = p.month + 1;
  if(m === 13){ m = 1; y += 1; }
  return `${y}-${pad2(m)}`;
}

function dateAddDaysStr(dateStr, days){
  if(!isValidDateStr(dateStr)) return null;
  const [y,m,d] = dateStr.split('-').map(x => Number(x));
  const dt = new Date(y, (m||1)-1, d||1);
  dt.setDate(dt.getDate() + Number(days||0));
  return `${dt.getFullYear()}-${pad2(dt.getMonth()+1)}-${pad2(dt.getDate())}`;
}

/* =========================
   ETAPA 10 — Google OAuth token (Calendar)
========================= */

function tokenStorageKey(uid){
  return `bgm_google_token_${String(uid||'')}`;
}

function storeGoogleOAuthToken(uid, accessToken, expiresInSeconds){
  if(!uid || !accessToken) return;
  const now = Date.now();
  const expSec = Number(expiresInSeconds||0);
  const expiresAt = now + ((expSec >= 60 ? expSec : 3600) * 1000) - 60000; // margen 1 min
  const payload = { accessToken: String(accessToken), expiresAt };
  try{ localStorage.setItem(tokenStorageKey(uid), JSON.stringify(payload)); }catch(_){ /* ignore */ }
  STATE.google.accessToken = payload.accessToken;
  STATE.google.expiresAt = payload.expiresAt;
}

function loadGoogleOAuthToken(uid){
  if(!uid) return;
  try{
    const raw = localStorage.getItem(tokenStorageKey(uid));
    if(!raw) return;
    const obj = JSON.parse(raw);
    const tok = obj && obj.accessToken ? String(obj.accessToken) : null;
    const exp = obj && Number(obj.expiresAt||0);
    if(tok && exp && exp > Date.now()){
      STATE.google.accessToken = tok;
      STATE.google.expiresAt = exp;
    }
  }catch(_){ /* ignore */ }
}

function clearGoogleOAuthToken(uid){
  try{ if(uid) localStorage.removeItem(tokenStorageKey(uid)); }catch(_){ /* ignore */ }
  STATE.google.accessToken = null;
  STATE.google.expiresAt = 0;
}

function getGoogleAccessToken(){
  const tok = STATE.google && STATE.google.accessToken ? String(STATE.google.accessToken) : null;
  const exp = Number(STATE.google && STATE.google.expiresAt || 0);
  if(tok && exp && exp > Date.now()) return tok;
  // venció
  if(tok && exp && exp <= Date.now()){
    clearGoogleOAuthToken(STATE.user ? STATE.user.uid : null);
  }
  return null;
}

async function calendarApiFetch(path, { method='GET', body=null }={}){
  const token = getGoogleAccessToken();
  if(!token) throw new Error('NO_TOKEN');
  const url = `https://www.googleapis.com/calendar/v3/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if(res.status === 401 || res.status === 403){
    clearGoogleOAuthToken(STATE.user ? STATE.user.uid : null);
  }
  if(!res.ok){
    const t = await res.text().catch(()=> '');
    throw new Error(`CAL_${res.status}:${t.slice(0,120)}`);
  }
  return res.json();
}

function calendarEventBodyFromExpense(exp){
  const concepto = String(exp.concepto || 'GASTO').trim() || 'GASTO';
  const cur = (String(exp.moneda||'') === 'USD') ? 'USD' : 'C$';
  const monto = moneyLabel(Number(exp.monto)||0);
  const title = `Vence: ${concepto} — ${cur} ${monto}`;

  const tope = isValidDateStr(exp.fechaTopeStr) ? exp.fechaTopeStr : null;
  const end = tope ? dateAddDaysStr(tope, 1) : null;

  const lines = [];
  lines.push(`Concepto: ${concepto}`);
  lines.push(`Monto: ${cur} ${monto}`);
  const cuenta = optionLabelFromCatalog('cuentas', exp.cuentaId);
  const quien = memberLabel(exp.quienPagoUid);
  if(cuenta) lines.push(`Cuenta: ${cuenta}`);
  if(quien) lines.push(`Quién pagó: ${quien}`);
  if(exp.fechaPagoStr) lines.push(`Pagado: ${String(exp.fechaPagoStr)}`);
  lines.push('Fuente: BALANZA GM');

  const body = {
    summary: title,
    description: lines.join('\n'),
  };

  if(tope && end){
    body.start = { date: tope };
    body.end = { date: end };
  }
  return body;
}

async function calendarSyncExpenseAfterSave({ type, periodId, docId, after, before }){
  // Solo gastos con fecha tope
  try{
    const token = getGoogleAccessToken();
    if(!token) return;
    if(!STATE.fbOk || !FB.db || !STATE.familiaId || !periodId || !docId) return;

    const ref = movCollectionRef(type, periodId).doc(docId);
    const snap = await ref.get();
    const exp = snap.exists ? (snap.data() || {}) : (after || {});

    const tope = isValidDateStr(exp.fechaTopeStr) ? exp.fechaTopeStr : null;
    if(!tope) return;

    const eventBody = calendarEventBodyFromExpense(exp);

    const eventId = exp.calendarEventId ? String(exp.calendarEventId) : '';
    if(eventId){
      await calendarApiFetch(`calendars/primary/events/${encodeURIComponent(eventId)}`, { method:'PATCH', body: eventBody });
      return;
    }

    const created = await calendarApiFetch('calendars/primary/events', { method:'POST', body: eventBody });
    const newId = created && created.id ? String(created.id) : '';
    if(newId){
      await ref.set({ calendarEventId: newId, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
  }catch(err){
    // Silencioso (no bloquea guardar gasto)
    console.warn('Calendar PRO error:', err);
  }
}

async function calendarMarkExpensePaid({ ref, fechaPagoStr }){
  try{
    const token = getGoogleAccessToken();
    if(!token) return;
    if(!ref) return;
    const snap = await ref.get();
    if(!snap.exists) return;
    const exp = snap.data() || {};
    const eventId = exp.calendarEventId ? String(exp.calendarEventId) : '';
    if(!eventId) return;

    const cur = (String(exp.moneda||'') === 'USD') ? 'USD' : 'C$';
    const monto = moneyLabel(Number(exp.monto)||0);
    const concepto = String(exp.concepto||'GASTO').trim()||'GASTO';

    const patch = {
      description: `${String(exp.notas||'').trim()}\n\nPAGADO: ${String(fechaPagoStr||'')}`.trim(),
      summary: `Vence: ${concepto} — ${cur} ${monto}`,
    };

    await calendarApiFetch(`calendars/primary/events/${encodeURIComponent(eventId)}`, { method:'PATCH', body: patch });
  }catch(err){
    console.warn('Calendar mark paid error:', err);
  }
}

/* =========================
   ETAPA 10 — HISTÓRICO (suscripción + snapshot)
========================= */

function ensureHistoricoSubscribed(){
  if(!STATE.fbOk || !FB.db || !STATE.user || !STATE.familiaId) return;
  if(STATE.historico.unsub) return;

  STATE.historico.loading = true;
  const q = FB.db.collection('familias').doc(STATE.familiaId)
    .collection('historico')
    .orderBy('closedAtMs','desc')
    .limit(48);

  STATE.historico.unsub = q.onSnapshot((snap) => {
    const items = [];
    snap.forEach(d => {
      const data = d.data() || {};
      items.push({ id: d.id, ...data });
    });
    STATE.historico.items = items;
    STATE.historico.loading = false;
    render();
  }, (err) => {
    console.error(err);
    STATE.historico.loading = false;
  });
}

async function writeHistoricoSnapshot(periodId, snapshot){
  if(!STATE.fbOk || !FB.db || !STATE.familiaId || !periodId) throw new Error('NO_FB');

  const histRef = historicoDocRef(periodId);
  const metaRef = histRef.collection('meta');

  const p = parsePeriodId(periodId);
  const excelSeq = Number(snapshot.excelSeq||0) || 0;

  await histRef.set({
    periodId,
    year: p ? p.year : null,
    month: p ? p.month : null,
    excelSeq,
    excelBase: snapshot.excelBase || (excelSeq ? formatExcelBaseName(excelSeq, periodId) : null),
    closedAtMs: Date.now(),
    closedAt: firebase.firestore.FieldValue.serverTimestamp(),
    totals: snapshot.resumen && snapshot.resumen.totals ? snapshot.resumen.totals : null,
    net: snapshot.resumen && snapshot.resumen.net ? snapshot.resumen.net : null,
    totalSaldo: snapshot.resumen && snapshot.resumen.totalSaldo ? snapshot.resumen.totalSaldo : null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // meta docs
  await metaRef.doc('resumen').set(snapshot.resumen || {}, { merge: true });
  await metaRef.doc('alertas').set(snapshot.alertas || {}, { merge: true });
  await metaRef.doc('presupuesto').set({ items: snapshot.presupuesto || [] }, { merge: true });
  await metaRef.doc('analitica').set({ recs: snapshot.analitica || [], computedAtMs: Date.now() }, { merge: true });
  await metaRef.doc('catalogo').set({ catalogo: snapshot.catalogo || {} }, { merge: true });

  // movimientos: reemplaza colección (borrado + escritura) en batches
  const types = ['ingresos','gastos_fijos','gastos_varios','transferencias'];
  for(const t of types){
    const col = historicoMovColRef(periodId, t);
    const existing = await col.get();
    // delete
    let batch = FB.db.batch();
    let ops = 0;
    existing.forEach(doc => {
      batch.delete(doc.ref);
      ops += 1;
      if(ops >= 450){
        batch.commit();
        batch = FB.db.batch();
        ops = 0;
      }
    });
    if(ops) await batch.commit();

    // write
    const items = Array.isArray(snapshot[t]) ? snapshot[t] : [];
    let batch2 = FB.db.batch();
    let ops2 = 0;
    for(const it of items){
      const id = it && it.id ? String(it.id) : null;
      const ref = id ? col.doc(id) : col.doc();
      batch2.set(ref, { ...it, id: ref.id }, { merge: true });
      ops2 += 1;
      if(ops2 >= 450){
        await batch2.commit();
        batch2 = FB.db.batch();
        ops2 = 0;
      }
    }
    if(ops2) await batch2.commit();
  }
}

async function loadHistoricoSnapshot(periodId){
  const hist = await historicoDocRef(periodId).get();
  if(!hist.exists) throw new Error('NO_HIST');
  const metaCol = historicoDocRef(periodId).collection('meta');
  const [resumenSnap, alertSnap, presSnap, anaSnap, catSnap] = await Promise.all([
    metaCol.doc('resumen').get(),
    metaCol.doc('alertas').get(),
    metaCol.doc('presupuesto').get(),
    metaCol.doc('analitica').get(),
    metaCol.doc('catalogo').get(),
  ]);

  const resumen = resumenSnap.exists ? (resumenSnap.data()||{}) : {};
  const alertas = alertSnap.exists ? (alertSnap.data()||{}) : {};
  const presupuesto = presSnap.exists ? ((presSnap.data()||{}).items || []) : [];
  const analitica = anaSnap.exists ? ((anaSnap.data()||{}).recs || []) : [];
  const catalogo = catSnap.exists ? ((catSnap.data()||{}).catalogo || {}) : {};

  async function loadCol(t){
    const snap = await historicoMovColRef(periodId, t).get();
    const items = [];
    snap.forEach(d => items.push(d.data() || {}));
    return items;
  }

  const [ingresos, gf, gv, tr] = await Promise.all([
    loadCol('ingresos'),
    loadCol('gastos_fijos'),
    loadCol('gastos_varios'),
    loadCol('transferencias'),
  ]);

  const meta = hist.data() || {};
  const excelSeq = Number(meta.excelSeq||0) || 0;
  const period = parsePeriodId(periodId) || { id: periodId };

  return {
    periodId,
    period,
    excelSeq,
    excelBase: meta.excelBase || (excelSeq ? formatExcelBaseName(excelSeq, period) : null),
    resumen,
    alertas,
    presupuesto,
    analitica,
    catalogo,
    ingresos,
    gastos_fijos: gf,
    gastos_varios: gv,
    transferencias: tr,
  };
}

function renderHistoricoSubView(){
  ensureHistoricoSubscribed();

  const items = Array.isArray(STATE.historico.items) ? STATE.historico.items : [];
  const loading = !!STATE.historico.loading;

  const listHtml = items.length ? items.map(it => {
    const seq = Number(it.excelSeq||0) || 0;
    const base = it.excelBase || (seq ? formatExcelBaseName(seq, it.periodId || it.id) : (it.periodId||it.id||''));
    const closedAtMs = Number(it.closedAtMs||0) || 0;
    const closed = closedAtMs ? new Date(closedAtMs).toLocaleString('es-NI') : '—';
    const tot = it.totals || {};
    const net = it.net || {};
    return `
      <div class="mov-card">
        <div class="mov-top">
          <div class="mov-title">${escapeHtml(base)}</div>
          <div class="mov-amount"><span class="mono">C$ ${escapeHtml(moneyLabel(Number(net.cs||0)))}</span> • <span class="mono">USD ${escapeHtml(moneyLabel(Number(net.usd||0)))}</span></div>
        </div>
        <div class="mov-meta">CIERRE: <span class="mono">${escapeHtml(closed)}</span></div>
        <div class="mov-meta">ING: <span class="mono">C$ ${escapeHtml(moneyLabel(Number(tot.inCS||0)))}</span> • <span class="mono">USD ${escapeHtml(moneyLabel(Number(tot.inUSD||0)))}</span> | GAS: <span class="mono">C$ ${escapeHtml(moneyLabel(Number(tot.outCS||0)))}</span> • <span class="mono">USD ${escapeHtml(moneyLabel(Number(tot.outUSD||0)))}</span></div>
        <div class="mov-actions">
          <button class="chip-btn chip-mini" type="button" data-hx="1" data-id="${escapeHtml(it.periodId||it.id)}">DESCARGAR EXCEL</button>
        </div>
      </div>
    `;
  }).join('') : `<div class="mov-empty">Aún no hay períodos cerrados.</div>`;

  els.view.innerHTML = `
    <div class="subhead">
      <div></div>
      <div>
        <div class="section-kicker">RESUMEN</div>
        <div class="section-title">HISTÓRICO</div>
        <div class="section-sub">Meses cerrados (más reciente arriba). Descargar re-genera desde snapshot.</div>
      </div>
      <button id="btnBackResumen" class="chip-btn" type="button">VOLVER</button>
    </div>

    ${loading ? `<div class="notice">CARGANDO…</div>` : ''}

    <div class="section-card" style="margin-top:12px">
      <div class="section-head">
        <div>
          <div class="section-kicker">PERÍODOS</div>
          <div class="section-title">CERRADOS</div>
        </div>
      </div>
      ${listHtml}
    </div>
  `;

  const back = document.getElementById('btnBackResumen');
  if(back) back.addEventListener('click', () => { STATE.resumenSubView = 'main'; render(); });

  els.view.querySelectorAll('[data-hx="1"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.getAttribute('data-id');
      if(!pid) return;
      await exportExcelFromHistorico(pid);
    });
  });
}

/* =========================
   ETAPA 10 — PRESUPUESTO
========================= */

async function loadBudgetForPeriod(periodId){
  if(!STATE.fbOk || !FB.db || !STATE.familiaId || !periodId) return [];
  try{
    const snap = await budgetDocRef(periodId).get();
    if(!snap.exists) return [];
    const data = snap.data() || {};
    const items = Array.isArray(data.items) ? data.items : [];
    return items;
  }catch(err){
    console.error(err);
    return [];
  }
}

function ensureBudgetLoaded(){
  if(!STATE.fbOk || !FB.db || !STATE.familiaId) return;
  const pid = getActivePeriod().id;
  if(STATE.budget.loaded && STATE.budget.periodId === pid) return;
  if(STATE.budget.loading && STATE.budget.periodId === pid) return;

  STATE.budget.loading = true;
  STATE.budget.periodId = pid;

  loadBudgetForPeriod(pid).then(items => {
    STATE.budget.items = items;
    STATE.budget.loaded = true;
    STATE.budget.loading = false;
    render();
  }).catch(() => {
    STATE.budget.items = [];
    STATE.budget.loaded = true;
    STATE.budget.loading = false;
    render();
  });
}

async function saveBudgetItems(periodId, items){
  if(!STATE.fbOk || !FB.db || !STATE.familiaId || !periodId) throw new Error('NO_FB');
  await budgetDocRef(periodId).set({
    items: Array.isArray(items) ? items : [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

function budgetLineForCat(items, catId){
  const arr = Array.isArray(items) ? items : [];
  return arr.find(x => String(x.categoriaId||'') === String(catId||'')) || null;
}

function computeSpentByCategory(gf, gv){
  const out = {}; // {catId: {cs, usd}}
  const all = (gf||[]).concat(gv||[]);
  for(const it of all){
    if(!isPaidExpense(it)) continue;
    const cat = String(it.categoriaId || '');
    if(!cat) continue;
    if(!out[cat]) out[cat] = { cs:0, usd:0 };
    const cur = (String(it.moneda||'') === 'USD') ? 'usd' : 'cs';
    const amt = Number(it.monto||0);
    if(Number.isFinite(amt)) out[cat][cur] = round2(out[cat][cur] + amt);
  }
  return out;
}

function budgetStatus(spent, budget){
  const b = Number(budget||0);
  const s = Number(spent||0);
  if(!(b > 0)) return { cls:'ok', text:'—', pct: null };
  const pct = (s / b) * 100;
  if(pct > 100) return { cls:'vencido', text:`EXCEDIDO ${Math.round(pct)}%`, pct };
  if(pct >= 80) return { cls:'porvencer', text:`CERCA ${Math.round(pct)}%`, pct };
  return { cls:'ok', text:`OK ${Math.round(pct)}%`, pct };
}

function renderPresupuestoView(){
  const period = getActivePeriod();
  const label = formatPeriodLabel(period);

  ensureRequiredForMovimientos('gastos_fijos');
  ensureRequiredForMovimientos('gastos_varios');
  ensureMovSubscribed('gastos_fijos');
  ensureMovSubscribed('gastos_varios');
  ensureBudgetLoaded();

  const gf = Array.isArray(STATE.mov.gastos_fijos.items) ? STATE.mov.gastos_fijos.items : [];
  const gv = Array.isArray(STATE.mov.gastos_varios.items) ? STATE.mov.gastos_varios.items : [];
  const spent = computeSpentByCategory(gf, gv);

  const cats = Array.isArray(STATE.catalogData.categorias) ? STATE.catalogData.categorias : [];
  const admin = isAdmin();

  const rows = cats.map(c => {
    const catId = String(c.id);
    const name = String(c.nombre||'').trim() || '—';
    const line = budgetLineForCat(STATE.budget.items, catId);
    const bcs = line ? Number(line.montoCS||0) : 0;
    const busd = line ? Number(line.montoUSD||0) : 0;
    const scs = spent[catId] ? Number(spent[catId].cs||0) : 0;
    const susd = spent[catId] ? Number(spent[catId].usd||0) : 0;
    const stCS = budgetStatus(scs, bcs);
    const stUSD = budgetStatus(susd, busd);

    return `
      <div class="mov-card">
        <div class="mov-top">
          <div class="mov-title">${escapeHtml(name)}</div>
          <div class="mov-amount"><span class="mono">C$ ${escapeHtml(moneyLabel(scs))}</span> • <span class="mono">USD ${escapeHtml(moneyLabel(susd))}</span></div>
        </div>
        <div class="mov-meta">
          <span class="badge status ${escapeHtml(stCS.cls)}">C$ ${escapeHtml(stCS.text)}</span>
          <span class="badge status ${escapeHtml(stUSD.cls)}">USD ${escapeHtml(stUSD.text)}</span>
        </div>
        <div class="mov-meta">PRESUPUESTO: <span class="mono">C$ ${escapeHtml(moneyLabel(bcs))}</span> • <span class="mono">USD ${escapeHtml(moneyLabel(busd))}</span></div>
        <div class="mov-actions">
          <button class="chip-btn chip-mini" type="button" data-bud-edit="1" data-id="${escapeHtml(catId)}" ${admin ? '' : 'aria-disabled="true" title="Solo ADMIN"'}>EDITAR</button>
        </div>
      </div>
    `;
  }).join('') || `<div class="notice">Agrega CATEGORÍAS en CATÁLOGO para usar presupuesto.</div>`;

  els.view.innerHTML = `
    <div class="subhead">
      <div></div>
      <div>
        <div class="section-kicker">CONTROL</div>
        <div class="section-title">PRESUPUESTO • ${escapeHtml(label)}</div>
        <div class="section-sub">Por categoría. Semáforo basado en gastos <b>PAGADOS</b>.</div>
      </div>
      <button id="btnIrResumen" class="chip-btn" type="button">IR A RESUMEN</button>
    </div>

    ${STATE.budget.loading ? `<div class="notice">CARGANDO PRESUPUESTO…</div>` : ''}

    <div class="section-card">
      <div class="section-head">
        <div>
          <div class="section-kicker">CATEGORÍAS</div>
          <div class="section-title">PRESUPUESTO MENSUAL</div>
        </div>
      </div>
      ${rows}
    </div>
  `;

  const b = document.getElementById('btnIrResumen');
  if(b) b.addEventListener('click', () => location.hash = 'resumen');

  els.view.querySelectorAll('[data-bud-edit="1"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const catId = btn.getAttribute('data-id');
      if(!catId) return;
      if(!isAdmin()){
        toast('Solo ADMIN puede editar presupuesto.');
        return;
      }
      if(isActivePeriodClosed()){
        toast('Período cerrado (solo lectura).');
        return;
      }
      const catName = optionLabelFromCatalog('categorias', catId);
      const line = budgetLineForCat(STATE.budget.items, catId) || { categoriaId: catId, montoCS: 0, montoUSD: 0 };
      openModal({
        title: 'EDITAR PRESUPUESTO',
        bodyHtml: `
          <div class="notice" style="margin-top:0"><b>${escapeHtml(catName || 'CATEGORÍA')}</b></div>
          <div class="form-row">
            <div class="form-label">PRESUPUESTO C$</div>
            <input id="budCS" class="text-input" inputmode="decimal" value="${escapeHtml(String(Number(line.montoCS||0)))}" />
          </div>
          <div class="form-row" style="margin-top:10px">
            <div class="form-label">PRESUPUESTO USD</div>
            <input id="budUSD" class="text-input" inputmode="decimal" value="${escapeHtml(String(Number(line.montoUSD||0)))}" />
          </div>
          <div class="hint" style="margin-top:10px">Usa 0 para desactivar el semáforo en esa moneda.</div>
        `,
        primaryText: 'GUARDAR',
        secondaryText: 'CANCELAR',
        onSecondary: () => closeModal(),
        onPrimary: async () => {
          const v1 = document.getElementById('budCS');
          const v2 = document.getElementById('budUSD');
          const cs = parseMoney(v1 ? v1.value : '0');
          const usd = parseMoney(v2 ? v2.value : '0');
          closeModal();
          setBusy(true, 'GUARDANDO…');
          try{
            const pid = getActivePeriod().id;
            const next = Array.isArray(STATE.budget.items) ? STATE.budget.items.slice() : [];
            const idx = next.findIndex(x => String(x.categoriaId||'') === String(catId));
            const obj = { categoriaId: String(catId), montoCS: round2(cs), montoUSD: round2(usd) };
            if(idx >= 0) next[idx] = obj; else next.push(obj);
            await saveBudgetItems(pid, next);
            STATE.budget.items = next;
            toast('Presupuesto guardado.');
            render();
          }catch(err){
            console.error(err);
            toast('No se pudo guardar.');
          } finally {
            setBusy(false);
          }
        }
      });
    });
  });
}

/* =========================
   ETAPA 10 — ANALÍTICA
========================= */

function normalizeConcept(s){
  return String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
}

function topNFromMap(mapObj, n){
  const arr = Object.entries(mapObj||{}).map(([k,v]) => ({ k, v: Number(v||0) }))
    .filter(x => x.k && x.v)
    .sort((a,b) => b.v - a.v);
  return arr.slice(0, n);
}

function computeWhoPaidCuts(items){
  const out = {}; // uid -> {cs,usd}
  for(const it of items||[]){
    if(!isPaidExpense(it)) continue;
    const uid = String(it.quienPagoUid||'');
    if(!uid) continue;
    if(!out[uid]) out[uid] = { cs:0, usd:0 };
    const cur = (String(it.moneda||'') === 'USD') ? 'usd' : 'cs';
    const amt = Number(it.monto||0);
    if(Number.isFinite(amt)) out[uid][cur] = round2(out[uid][cur] + amt);
  }
  return out;
}

async function computeAnalyticsForPeriod(periodId){
  // depende de gastos + presupuesto + historico
  const gf = Array.isArray(STATE.mov.gastos_fijos.items) ? STATE.mov.gastos_fijos.items : [];
  const gv = Array.isArray(STATE.mov.gastos_varios.items) ? STATE.mov.gastos_varios.items : [];
  const spent = computeSpentByCategory(gf, gv);

  const cats = Array.isArray(STATE.catalogData.categorias) ? STATE.catalogData.categorias : [];
  const catNameById = {};
  cats.forEach(c => { catNameById[String(c.id)] = String(c.nombre||'').trim(); });

  // presupuesto
  const budItems = (STATE.budget.periodId === periodId && STATE.budget.loaded) ? (STATE.budget.items||[]) : await loadBudgetForPeriod(periodId);

  const recs = [];

  // 1) Excedidos por presupuesto
  for(const line of (budItems||[])){
    const cid = String(line.categoriaId||'');
    if(!cid) continue;
    const name = catNameById[cid] || 'Categoría';
    const scs = spent[cid] ? Number(spent[cid].cs||0) : 0;
    const susd = spent[cid] ? Number(spent[cid].usd||0) : 0;
    const bcs = Number(line.montoCS||0) || 0;
    const busd = Number(line.montoUSD||0) || 0;

    if(bcs > 0 && scs > bcs){
      const pct = Math.round((scs/bcs)*100);
      recs.push({ tipo:'PRESUPUESTO', texto:`${name} excedido en C$ (${pct}%).`, detalle:`C$ ${moneyLabel(scs)} / C$ ${moneyLabel(bcs)}` });
    }
    if(busd > 0 && susd > busd){
      const pct = Math.round((susd/busd)*100);
      recs.push({ tipo:'PRESUPUESTO', texto:`${name} excedido en USD (${pct}%).`, detalle:`USD ${moneyLabel(susd)} / USD ${moneyLabel(busd)}` });
    }
  }

  // 2) Delivery aparece N veces
  const allExp = gf.concat(gv);
  const deliveryN = allExp.filter(it => {
    const c = normalizeConcept(it.concepto);
    return c.includes('delivery');
  }).length;
  if(deliveryN > 0){
    recs.push({ tipo:'PATRÓN', texto:`“Delivery” aparece ${deliveryN} vez/veces este mes.`, detalle:'Revisa si puedes consolidar pedidos o cambiar proveedor.' });
  }

  // 3) Gasto hormiga (top 5 conceptos repetidos)
  const counts = {};
  for(const it of gv){
    if(!isPaidExpense(it)) continue;
    const key = normalizeConcept(it.concepto);
    if(!key) continue;
    counts[key] = (counts[key]||0) + 1;
  }
  const top = topNFromMap(counts, 5).filter(x => x.v >= 2);
  if(top.length){
    recs.push({ tipo:'GASTO HORMIGA', texto:'Top conceptos repetidos (≥2):', detalle: top.map(x => `${x.k} (${x.v})`).join(' • ') });
  }

  // 4) Cortes por QUIÉN PAGÓ
  const whoCuts = computeWhoPaidCuts(allExp);
  const whoArr = Object.entries(whoCuts).map(([uid, v]) => ({ uid, cs:Number(v.cs||0), usd:Number(v.usd||0) }));
  const totCS = whoArr.reduce((a,x)=>a+x.cs,0);
  const totUSD = whoArr.reduce((a,x)=>a+x.usd,0);
  const topWho = whoArr.sort((a,b)=>(b.cs+b.usd)-(a.cs+a.usd))[0];
  if(topWho && (totCS>0 || totUSD>0)){
    const name = memberLabel(topWho.uid);
    const pctCS = (totCS>0) ? Math.round((topWho.cs/totCS)*100) : null;
    const pctUSD = (totUSD>0) ? Math.round((topWho.usd/totUSD)*100) : null;
    const parts = [];
    if(pctCS !== null) parts.push(`C$ ${pctCS}%`);
    if(pctUSD !== null) parts.push(`USD ${pctUSD}%`);
    recs.push({ tipo:'QUIÉN PAGÓ', texto:`${name} cubrió la mayor parte de gastos (${parts.join(' • ')}).`, detalle:`C$ ${moneyLabel(topWho.cs)} • USD ${moneyLabel(topWho.usd)}` });
  }

  // 5) Variaciones vs mes anterior (por categoría) usando histórico (si existe)
  const prev = (STATE.historico.items||[]).find(h => h && h.periodId && String(h.periodId) === String(dateAddDaysStr(periodId+'-01', -1) ? '' : ''));
  // arriba no sirve; mejor: busca el cierre inmediatamente anterior por fecha (1er item de historico es el más reciente cerrado; puede ser este mismo mes si ya se cerró)
  let prevId = null;
  if(Array.isArray(STATE.historico.items) && STATE.historico.items.length){
    const cur = parsePeriodId(periodId);
    const prevGuess = cur ? `${cur.month===1?cur.year-1:cur.year}-${pad2(cur.month===1?12:cur.month-1)}` : null;
    const hit = prevGuess ? STATE.historico.items.find(x => String(x.periodId||x.id) === prevGuess) : null;
    prevId = hit ? String(hit.periodId||hit.id) : null;
  }

  if(prevId){
    try{
      const prevResumen = await historicoDocRef(prevId).collection('meta').doc('resumen').get();
      const prevData = prevResumen.exists ? (prevResumen.data()||{}) : {};
      const prevSpent = prevData.spentByCategory || {};
      // arma aumentos top 5 C$
      const changes = [];
      for(const cid of Object.keys(spent)){
        const curCS = Number(spent[cid].cs||0);
        const prevCS = prevSpent[cid] ? Number(prevSpent[cid].cs||0) : 0;
        if(curCS > 0 && prevCS > 0){
          const pct = ((curCS - prevCS) / prevCS) * 100;
          changes.push({ cid, pct, curCS, prevCS });
        }
      }
      changes.sort((a,b)=> b.pct - a.pct);
      changes.slice(0,5).forEach(ch => {
        const name = catNameById[ch.cid] || 'Categoría';
        recs.push({ tipo:'VARIACIÓN', texto:`${name} subió ${Math.round(ch.pct)}% vs mes anterior (C$).`, detalle:`C$ ${moneyLabel(ch.prevCS)} → C$ ${moneyLabel(ch.curCS)}` });
      });
    }catch(err){ /* ignore */ }
  }

  // Orden: severidad simple (presupuesto/variación primero)
  const weight = (r) => {
    const t = String(r.tipo||'');
    if(t === 'PRESUPUESTO') return 1;
    if(t === 'VARIACIÓN') return 2;
    if(t === 'GASTO HORMIGA') return 3;
    if(t === 'PATRÓN') return 4;
    if(t === 'QUIÉN PAGÓ') return 5;
    return 9;
  };
  recs.sort((a,b)=> weight(a)-weight(b));

  return recs;
}

function ensureAnalyticsComputed(){
  const pid = getActivePeriod().id;
  if(STATE.analytics.loading) return;
  if(STATE.analytics.periodId === pid && STATE.analytics.computedAtMs) return;

  STATE.analytics.loading = true;
  STATE.analytics.periodId = pid;

  computeAnalyticsForPeriod(pid).then(recs => {
    STATE.analytics.recs = Array.isArray(recs) ? recs : [];
    STATE.analytics.loading = false;
    STATE.analytics.computedAtMs = Date.now();
    render();
  }).catch(err => {
    console.error(err);
    STATE.analytics.recs = [];
    STATE.analytics.loading = false;
    STATE.analytics.computedAtMs = Date.now();
    render();
  });
}

function renderAnaliticaView(){
  const period = getActivePeriod();
  const label = formatPeriodLabel(period);

  ensureRequiredForMovimientos('gastos_fijos');
  ensureRequiredForMovimientos('gastos_varios');
  ensureMovSubscribed('gastos_fijos');
  ensureMovSubscribed('gastos_varios');

  ensureBudgetLoaded();
  ensureHistoricoSubscribed();
  ensureAnalyticsComputed();

  const recs = Array.isArray(STATE.analytics.recs) ? STATE.analytics.recs : [];
  const loading = !!STATE.analytics.loading;

  const listHtml = recs.length ? recs.map(r => `
    <div class="mov-card">
      <div class="mov-top">
        <div class="mov-title">${escapeHtml(String(r.tipo||'RECOMENDACIÓN'))}</div>
      </div>
      <div class="mov-meta">${escapeHtml(String(r.texto||''))}</div>
      ${r.detalle ? `<div class="mov-meta"><span class="mono">${escapeHtml(String(r.detalle))}</span></div>` : ''}
    </div>
  `).join('') : `<div class="mov-empty">No hay recomendaciones aún. Agrega movimientos y presupuesto para mejores señales.</div>`;

  els.view.innerHTML = `
    <div class="subhead">
      <div></div>
      <div>
        <div class="section-kicker">RECOMENDACIONES</div>
        <div class="section-title">ANALÍTICA • ${escapeHtml(label)}</div>
        <div class="section-sub">Accionables, basadas en gastos pagados y comparación con mes anterior (si existe).</div>
      </div>
      <button id="btnIrResumen" class="chip-btn" type="button">IR A RESUMEN</button>
    </div>

    ${loading ? `<div class="notice">CALCULANDO…</div>` : ''}

    <div class="section-card" style="margin-top:12px">
      <div class="section-head">
        <div>
          <div class="section-kicker">ANALÍTICA</div>
          <div class="section-title">RECOMENDACIONES (${escapeHtml(String(recs.length))})</div>
        </div>
      </div>
      ${listHtml}
    </div>
  `;

  const b = document.getElementById('btnIrResumen');
  if(b) b.addEventListener('click', () => location.hash = 'resumen');
}

/* =========================
   ETAPA 10 — EXCEL (SheetJS)
========================= */

function catalogSnapshot(){
  const out = {};
  ['categorias','etiquetas','cuentas','metodos','beneficios','origenes'].forEach(t => {
    out[t] = Array.isArray(STATE.catalogData[t]) ? STATE.catalogData[t].map(x => ({ id:x.id, nombre:x.nombre })) : [];
  });
  out.miembros = Array.isArray(STATE.familiaMembers) ? STATE.familiaMembers.map(m => ({ uid:m.uid, nombre:m.nombre, email:m.email, rol:m.rol })) : [];
  return out;
}

function buildResumenSnapshot(period, ingresos, gf, gv, tr){
  const totIn = { inCS:0, inUSD:0 };
  for(const it of ingresos||[]){
    const cur = (String(it.moneda||'') === 'USD') ? 'inUSD' : 'inCS';
    const amt = Number(it.monto||0);
    if(Number.isFinite(amt)) totIn[cur] = round2(totIn[cur] + amt);
  }

  const totOut = { outCS:0, outUSD:0 };
  for(const it of (gf||[]).concat(gv||[])){
    if(!isPaidExpense(it)) continue;
    const cur = (String(it.moneda||'') === 'USD') ? 'outUSD' : 'outCS';
    const amt = Number(it.monto||0);
    if(Number.isFinite(amt)) totOut[cur] = round2(totOut[cur] + amt);
  }

  const net = { cs: round2(totIn.inCS - totOut.outCS), usd: round2(totIn.inUSD - totOut.outUSD) };

  // saldos por cuenta
  const cuentas = Array.isArray(STATE.catalogData.cuentas) ? STATE.catalogData.cuentas : [];
  const bal = {};
  const ensureAcc = (id) => { if(id && !bal[id]) bal[id] = { cs:0, usd:0 }; };
  const apply = (id, cur, delta) => {
    if(!id) return;
    ensureAcc(id);
    const k = (String(cur||'') === 'USD') ? 'usd' : 'cs';
    const d = Number(delta);
    if(!Number.isFinite(d)) return;
    bal[id][k] = round2(bal[id][k] + d);
  };

  for(const c of cuentas){ ensureAcc(c.id); }
  for(const it of ingresos||[]){ apply(it.cuentaId, it.moneda, +Number(it.monto||0)); }
  for(const it of (gf||[]).concat(gv||[])){
    if(!isPaidExpense(it)) continue;
    apply(it.cuentaId, it.moneda, -Number(it.monto||0));
  }
  for(const it of tr||[]){
    apply(it.cuentaOrigenId, it.monedaOrigen, -Number(it.montoOrigen||0));
    apply(it.cuentaDestinoId, it.monedaDestino, +Number(it.montoDestino||0));
  }

  const saldos = Object.keys(bal).map(id => ({
    cuentaId: id,
    cuenta: optionLabelFromCatalog('cuentas', id),
    cs: Number(bal[id].cs||0),
    usd: Number(bal[id].usd||0),
  })).sort((a,b)=> String(a.cuenta||'').localeCompare(String(b.cuenta||''),'es',{sensitivity:'base'}));

  const totalSaldo = saldos.reduce((acc,r)=>({ cs:round2(acc.cs+r.cs), usd:round2(acc.usd+r.usd) }), {cs:0, usd:0});

  const spentByCategory = computeSpentByCategory(gf||[], gv||[]);

  return {
    periodId: period.id,
    label: formatPeriodLabel(period),
    totals: { ...totIn, ...totOut },
    net,
    saldos,
    totalSaldo,
    spentByCategory,
  };
}

function aoaSheet(wb, name, aoa){
  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  window.XLSX.utils.book_append_sheet(wb, ws, name);
}

function movementsToRows(items, type){
  const rows = [];
  if(type === 'transferencias'){
    for(const it of items||[]){
      rows.push([
        it.fechaStr || '',
        optionLabelFromCatalog('cuentas', it.cuentaOrigenId),
        optionLabelFromCatalog('cuentas', it.cuentaDestinoId),
        Number(it.montoOrigen||0),
        String(it.monedaOrigen||''),
        Number(it.tc||0),
        Number(it.montoDestino||0),
        String(it.monedaDestino||''),
        memberLabel(it.quienPagoUid),
        String(it.notas||''),
      ]);
    }
  } else {
    for(const it of items||[]){
      rows.push([
        it.fechaStr || '',
        String(it.concepto||''),
        Number(it.monto||0),
        String(it.moneda||''),
        optionLabelFromCatalog('cuentas', it.cuentaId),
        optionLabelFromCatalog('metodos', it.metodoId),
        memberLabel(it.quienPagoUid),
        optionLabelFromCatalog('beneficios', it.beneficioId),
        optionLabelFromCatalog('categorias', it.categoriaId),
        Array.isArray(it.tagIds) ? it.tagIds.map(id => optionLabelFromCatalog('etiquetas', id)).filter(Boolean).join(', ') : '',
        (type === 'ingresos') ? optionLabelFromCatalog('origenes', it.origenId) : '',
        (type !== 'ingresos') ? (it.fechaTopeStr || '') : '',
        (type !== 'ingresos') ? (it.fechaPagoStr || '') : '',
        (type === 'gastos_fijos') ? (it.recurrente ? 'SI' : 'NO') : '',
        String(it.notas||''),
      ]);
    }
  }
  return rows;
}

function buildExcelWorkbookFromSnapshot(snap){
  if(!window.XLSX) throw new Error('XLSX_NOT_LOADED');

  const wb = window.XLSX.utils.book_new();

  // 1) RESUMEN
  const r = snap.resumen || {};
  const aoaResumen = [
    ['PERÍODO', r.label || ''],
    ['EXCEL', snap.excelBase || ''],
    [''],
    ['INGRESOS C$', Number((r.totals||{}).inCS||0)],
    ['INGRESOS USD', Number((r.totals||{}).inUSD||0)],
    ['GASTOS C$ (PAGADOS)', Number((r.totals||{}).outCS||0)],
    ['GASTOS USD (PAGADOS)', Number((r.totals||{}).outUSD||0)],
    ['NETO C$', Number((r.net||{}).cs||0)],
    ['NETO USD', Number((r.net||{}).usd||0)],
    [''],
    ['SALDOS POR CUENTA'],
    ['CUENTA','C$','USD'],
    ...(Array.isArray(r.saldos) ? r.saldos.map(x => [String(x.cuenta||''), Number(x.cs||0), Number(x.usd||0)]) : []),
    ['TOTAL', Number((r.totalSaldo||{}).cs||0), Number((r.totalSaldo||{}).usd||0)],
  ];
  aoaSheet(wb, 'RESUMEN', aoaResumen);

  // 2-5 movimientos
  aoaSheet(wb, 'INGRESOS', [
    ['FECHA','CONCEPTO','MONTO','MONEDA','CUENTA','MÉTODO','QUIÉN','BENEFICIO','CATEGORÍA','ETIQUETAS','ORIGEN','FECHA TOPE','FECHA PAGO','RECURRENTE','NOTAS'],
    ...movementsToRows(snap.ingresos||[], 'ingresos'),
  ]);

  aoaSheet(wb, 'GASTOS FIJOS', [
    ['FECHA','CONCEPTO','MONTO','MONEDA','CUENTA','MÉTODO','QUIÉN','BENEFICIO','CATEGORÍA','ETIQUETAS','ORIGEN','FECHA TOPE','FECHA PAGO','RECURRENTE','NOTAS'],
    ...movementsToRows(snap.gastos_fijos||[], 'gastos_fijos'),
  ]);

  aoaSheet(wb, 'GASTOS VARIOS', [
    ['FECHA','CONCEPTO','MONTO','MONEDA','CUENTA','MÉTODO','QUIÉN','BENEFICIO','CATEGORÍA','ETIQUETAS','ORIGEN','FECHA TOPE','FECHA PAGO','RECURRENTE','NOTAS'],
    ...movementsToRows(snap.gastos_varios||[], 'gastos_varios'),
  ]);

  aoaSheet(wb, 'TRANSFERENCIAS', [
    ['FECHA','CUENTA ORIGEN','CUENTA DESTINO','MONTO ORIGEN','MONEDA ORIGEN','T/C','MONTO DESTINO','MONEDA DESTINO','QUIÉN','NOTA'],
    ...movementsToRows(snap.transferencias||[], 'transferencias'),
  ]);

  // 6) PRESUPUESTO
  const pres = Array.isArray(snap.presupuesto) ? snap.presupuesto : [];
  const spent = (r && r.spentByCategory) ? r.spentByCategory : {};
  const aoaPres = [['CATEGORÍA','PRESUPUESTO C$','GASTADO C$','% C$','PRESUPUESTO USD','GASTADO USD','% USD']];
  pres.forEach(line => {
    const cid = String(line.categoriaId||'');
    const name = optionLabelFromCatalog('categorias', cid);
    const bcs = Number(line.montoCS||0);
    const busd = Number(line.montoUSD||0);
    const scs = spent[cid] ? Number(spent[cid].cs||0) : 0;
    const susd = spent[cid] ? Number(spent[cid].usd||0) : 0;
    const p1 = (bcs>0) ? round2((scs/bcs)*100) : '';
    const p2 = (busd>0) ? round2((susd/busd)*100) : '';
    aoaPres.push([name, bcs, scs, p1, busd, susd, p2]);
  });
  aoaSheet(wb, 'PRESUPUESTO', aoaPres);

  // 7) ANALÍTICA
  const recs = Array.isArray(snap.analitica) ? snap.analitica : [];
  const aoaAna = [['TIPO','RECOMENDACIÓN','DETALLE']];
  recs.forEach(r0 => aoaAna.push([String(r0.tipo||''), String(r0.texto||''), String(r0.detalle||'')]));
  aoaSheet(wb, 'ANALÍTICA (RECOMENDACIONES)', aoaAna);

  // 8) ALERTAS
  const a = snap.alertas || {};
  const aoaAl = [
    ['TOTAL', Number(a.total||0)],
    ['BLOQUEANTES', Number(a.blocking||0)],
    [''],
    ['TIPO','CONCEPTO','MONTO','MONEDA','TOPE','QUIÉN','FALTANTES'],
  ];
  const pend = Array.isArray(a.pending) ? a.pending : [];
  pend.forEach(it => aoaAl.push([
    'PENDIENTE',
    String(it.concepto||''),
    Number(it.monto||0),
    String(it.moneda||''),
    String(it.fechaTopeStr||''),
    memberLabel(it.quienPagoUid),
    '',
  ]));
  const inc = Array.isArray(a.incompletes) ? a.incompletes : [];
  inc.forEach(it => aoaAl.push([
    'INCOMPLETO',
    String(it.concepto||''),
    Number(it.monto||0),
    String(it.moneda||''),
    String(it.fechaTopeStr||''),
    memberLabel(it.quienPagoUid),
    Array.isArray(it._missing) ? it._missing.join(', ') : '',
  ]));
  aoaSheet(wb, 'ALERTAS (snapshot al export)', aoaAl);

  // 9) CATÁLOGO
  const cat = snap.catalogo || {};
  const aoaCat = [['TIPO','ID','NOMBRE']];
  ['categorias','etiquetas','cuentas','metodos','beneficios','origenes'].forEach(t => {
    (Array.isArray(cat[t]) ? cat[t] : []).forEach(it => aoaCat.push([t, String(it.id||''), String(it.nombre||'')]));
  });
  aoaSheet(wb, 'CATÁLOGO', aoaCat);

  return wb;
}

async function buildCurrentPeriodExcelSnapshot(){
  const period = getActivePeriod();
  const periodId = period.id;

  await ensurePeriodDoc(periodId);

  const meta = getActivePeriodMeta() || {};
  const excelSeq = Number(meta.excelSeq||0) || 0;
  const excelBase = excelSeq ? formatExcelBaseName(excelSeq, period) : null;

  const ingresos = Array.isArray(STATE.mov.ingresos.items) ? STATE.mov.ingresos.items : [];
  const gf = Array.isArray(STATE.mov.gastos_fijos.items) ? STATE.mov.gastos_fijos.items : [];
  const gv = Array.isArray(STATE.mov.gastos_varios.items) ? STATE.mov.gastos_varios.items : [];
  const tr = Array.isArray(STATE.mov.transferencias.items) ? STATE.mov.transferencias.items : [];

  const presupuesto = (STATE.budget.periodId === periodId && STATE.budget.loaded) ? (STATE.budget.items||[]) : await loadBudgetForPeriod(periodId);

  // Analítica (best-effort)
  let analitica = [];
  try{ analitica = await computeAnalyticsForPeriod(periodId); }catch(_){ analitica = []; }

  const alertas = refreshAlerts();
  const resumen = buildResumenSnapshot(period, ingresos, gf, gv, tr);

  return {
    periodId,
    period,
    excelSeq,
    excelBase,
    resumen,
    alertas,
    presupuesto,
    analitica,
    catalogo: catalogSnapshot(),
    ingresos,
    gastos_fijos: gf,
    gastos_varios: gv,
    transferencias: tr,
  };
}

async function exportExcelCurrentPeriod(){
  if(!window.XLSX){
    toast('No se cargó XLSX. Revisa conexión e intenta de nuevo.');
    return;
  }

  const loadingAny = !!(STATE.mov.ingresos.loading || STATE.mov.gastos_fijos.loading || STATE.mov.gastos_varios.loading || STATE.mov.transferencias.loading);
  if(loadingAny){
    toast('Espera a que termine de cargar.');
    return;
  }

  setBusy(true, 'EXPORTANDO…');
  try{
    const snap = await buildCurrentPeriodExcelSnapshot();
    if(!snap.excelSeq){
      toast('No se pudo obtener consecutivo de Excel.');
      return;
    }
    const wb = buildExcelWorkbookFromSnapshot(snap);
    const filename = `${snap.excelBase}.xlsx`;
    window.XLSX.writeFile(wb, filename);

    // marca export en meta del período
    await periodDocRef(snap.periodId).set({
      lastExportSeq: snap.excelSeq,
      lastExportAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // cache local para cierre inmediato
    STATE.analytics.recs = snap.analitica || [];
    STATE.analytics.periodId = snap.periodId;
    STATE.analytics.computedAtMs = Date.now();

    toast('Excel exportado.');
  } catch(err){
    console.error(err);
    toast('No se pudo exportar Excel.');
  } finally {
    setBusy(false);
  }
}

async function exportExcelFromHistorico(periodId){
  if(!window.XLSX){
    toast('No se cargó XLSX. Revisa conexión e intenta de nuevo.');
    return;
  }
  setBusy(true, 'GENERANDO…');
  try{
    const snap = await loadHistoricoSnapshot(periodId);
    // aplicar catálogo del snapshot para labels consistentes
    if(snap.catalogo){
      // temporal: no pisa state global, solo se usa en builders vía optionLabelFromCatalog,
      // así que inyectamos arrays mínimos en STATE.catalogData para el armado.
      const prevCatalog = { ...STATE.catalogData };
      try{
        ['categorias','etiquetas','cuentas','metodos','beneficios','origenes'].forEach(t => {
          if(Array.isArray(snap.catalogo[t])) STATE.catalogData[t] = snap.catalogo[t];
        });
        const wb = buildExcelWorkbookFromSnapshot({
          ...snap,
          excelBase: snap.excelBase || (snap.excelSeq ? formatExcelBaseName(snap.excelSeq, snap.period) : `Historico_${periodId}`),
        });
        window.XLSX.writeFile(wb, `${snap.excelBase || 'Historico'}.xlsx`);
      } finally {
        STATE.catalogData = prevCatalog;
      }
    } else {
      const wb = buildExcelWorkbookFromSnapshot(snap);
      window.XLSX.writeFile(wb, `${snap.excelBase || 'Historico'}.xlsx`);
    }
    toast('Excel generado.');
  } catch(err){
    console.error(err);
    toast('No se pudo generar Excel.');
  } finally {
    setBusy(false);
  }
}

/* =========================
   ETAPA 10 — CIERRE DE PERÍODO
========================= */

function openClosePeriodModal(){
  const admin = isAdmin();
  if(!admin){
    toast('Solo ADMIN puede cerrar.');
    return;
  }

  const period = getActivePeriod();
  const label = formatPeriodLabel(period);
  const alerts = refreshAlerts();
  const blockingN = Number(alerts.blocking||0) || 0;
  if(blockingN > 0){
    toast('Tienes alertas bloqueantes. No puedes cerrar.');
    return;
  }

  const meta = getActivePeriodMeta() || {};
  const status = String(meta.status||'ABIERTO').toUpperCase();
  if(status === 'CERRADO'){
    toast('Período ya está cerrado.');
    return;
  }

  const excelSeq = Number(meta.excelSeq||0) || 0;
  const exportOk = !!(meta.lastExportAt && Number(meta.lastExportSeq||0) === excelSeq);

  openModal({
    title: 'CERRAR PERÍODO',
    bodyHtml: `
      <div class="notice" style="margin-top:0">
        PERÍODO: <b>${escapeHtml(label)}</b><br/>
        REGLA: Exportar Excel antes de confirmar.
      </div>

      <div class="section-card" style="margin-top:12px">
        <div class="section-head">
          <div>
            <div class="section-kicker">PASO 1</div>
            <div class="section-title">EXPORTAR EXCEL</div>
            <div class="section-sub">${exportOk ? '<b>OK</b> • ya exportado.' : 'Pendiente • debes exportar antes de cerrar.'}</div>
          </div>
        </div>
        <div class="actions" style="margin-top:10px">
          <button id="btnExportNow" class="action-btn" type="button">EXPORTAR AHORA</button>
        </div>
      </div>

      <div class="section-card" style="margin-top:12px">
        <div class="section-head">
          <div>
            <div class="section-kicker">PASO 2</div>
            <div class="section-title">CONFIRMACIÓN DURA</div>
            <div class="section-sub">Marca checkbox y escribe <b>CERRAR</b>.</div>
          </div>
        </div>

        <div class="form-row" style="margin-top:10px">
          <label class="hint" style="display:flex; gap:10px; align-items:center">
            <input id="closeChk" type="checkbox" />
            Confirmo que entiendo que el período quedará <b>solo lectura</b>.
          </label>
        </div>

        <div class="form-row" style="margin-top:10px">
          <div class="form-label">ESCRIBE “CERRAR”</div>
          <input id="closeTxt" class="text-input" placeholder="CERRAR" />
        </div>
      </div>

      <div class="hint" style="margin-top:10px">Al cerrar se guarda snapshot en HISTÓRICO y se crea un nuevo período ABIERTO.</div>
    `,
    primaryText: 'CONFIRMAR CIERRE',
    secondaryText: 'CANCELAR',
    onSecondary: () => closeModal(),
    onPrimary: async () => {
      const chk = document.getElementById('closeChk');
      const txt = document.getElementById('closeTxt');
      const okChk = !!(chk && chk.checked);
      const okTxt = (txt ? String(txt.value||'').trim().toUpperCase() : '') === 'CERRAR';
      const meta2 = getActivePeriodMeta() || {};
      const excelSeq2 = Number(meta2.excelSeq||0) || 0;
      const exportOk2 = !!(meta2.lastExportAt && Number(meta2.lastExportSeq||0) === excelSeq2);

      if(!exportOk2){
        toast('Primero EXPORTA EXCEL.');
        return;
      }
      if(!okChk){ toast('Debes marcar el checkbox.'); return; }
      if(!okTxt){ toast('Debes escribir CERRAR.'); return; }

      closeModal();
      await closeCurrentPeriod();
    }
  });

  // Wire export button inside modal
  setTimeout(() => {
    const b = document.getElementById('btnExportNow');
    if(b) b.addEventListener('click', async () => {
      await exportExcelCurrentPeriod();
      closeModal();
      openClosePeriodModal();
    });
  }, 0);
}

async function closeCurrentPeriod(){
  const period = getActivePeriod();
  const periodId = period.id;

  const alerts = refreshAlerts();
  if(Number(alerts.blocking||0) > 0){
    toast('Hay alertas bloqueantes.');
    return;
  }

  setBusy(true, 'CERRANDO…');
  try{
    await ensurePeriodDoc(periodId);

    // refresca meta desde Firestore (defensivo)
    const metaSnap = await periodDocRef(periodId).get();
    const meta = metaSnap.exists ? (metaSnap.data()||{}) : {};
    const excelSeq = Number(meta.excelSeq||0) || 0;
    const exportOk = !!(meta.lastExportAt && Number(meta.lastExportSeq||0) === excelSeq);
    if(!exportOk){
      toast('Debes exportar Excel antes de cerrar.');
      return;
    }

    const snap = await buildCurrentPeriodExcelSnapshot();

    // guarda snapshot en HISTÓRICO
    await writeHistoricoSnapshot(periodId, {
      ...snap,
      excelSeq,
      excelBase: formatExcelBaseName(excelSeq, period),
    });

    // marca período cerrado
    await periodDocRef(periodId).set({
      status: 'CERRADO',
      closedAtMs: Date.now(),
      closedAt: firebase.firestore.FieldValue.serverTimestamp(),
      closedByUid: STATE.user ? STATE.user.uid : null,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // nuevo período
    const nextId = nextPeriodIdFrom(periodId);
    if(nextId){
      setActivePeriod(nextId);
      // reset estados
      STATE.budget.loaded = false;
      STATE.budget.loading = false;
      STATE.analytics.computedAtMs = 0;
      STATE.analytics.loading = false;
      STATE.analytics.recs = [];

      // limpia listeners movimientos para resuscribir en el nuevo
      ['ingresos','gastos_fijos','gastos_varios','transferencias'].forEach(unsubMov);
      if(typeof STATE.activePeriodMetaUnsub === 'function'){
        try{ STATE.activePeriodMetaUnsub(); }catch(_){ /* ignore */ }
      }
      STATE.activePeriodMetaUnsub = null;
      STATE.activePeriodMetaId = null;

      await ensurePeriodDoc(nextId);
      STATE.resumenSubView = 'main';
      toast('Período cerrado. Nuevo período abierto.');
      render();
    } else {
      toast('Período cerrado.');
      render();
    }

  } catch(err){
    console.error(err);
    toast('No se pudo cerrar período.');
  } finally {
    setBusy(false);
  }
}

/* =========================
   ETAPA 10 — BACKUP JSON
========================= */

function downloadJson(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportBackupJson(){
  const loadingAny = !!(STATE.mov.ingresos.loading || STATE.mov.gastos_fijos.loading || STATE.mov.gastos_varios.loading || STATE.mov.transferencias.loading);
  if(loadingAny){ toast('Espera a que termine de cargar.'); return; }

  setBusy(true, 'EXPORTANDO BACKUP…');
  try{
    const snap = await buildCurrentPeriodExcelSnapshot();
    const payload = {
      version: 'BalanzaGM_Backup_v1',
      exportedAtMs: Date.now(),
      familyId: STATE.familiaId,
      periodId: snap.periodId,
      excelSeq: snap.excelSeq,
      catalogo: snap.catalogo,
      presupuesto: snap.presupuesto,
      analitica: snap.analitica,
      alertas: { total: snap.alertas.total, blocking: snap.alertas.blocking },
      movimientos: {
        ingresos: snap.ingresos,
        gastos_fijos: snap.gastos_fijos,
        gastos_varios: snap.gastos_varios,
        transferencias: snap.transferencias,
      }
    };
    const fname = `Backup_${snap.periodId}_${todayStr().replace(/-/g,'')}.json`;
    downloadJson(payload, fname);
    toast('Backup exportado.');
  } catch(err){
    console.error(err);
    toast('No se pudo exportar backup.');
  } finally {
    setBusy(false);
  }
}

async function replaceCollectionWithItems(colRef, items){
  const existing = await colRef.get();
  let batch = FB.db.batch();
  let ops = 0;
  existing.forEach(doc => {
    batch.delete(doc.ref);
    ops += 1;
    if(ops >= 450){ batch.commit(); batch = FB.db.batch(); ops = 0; }
  });
  if(ops) await batch.commit();

  let batch2 = FB.db.batch();
  let ops2 = 0;
  for(const it of (items||[])){
    const id = it && it.id ? String(it.id) : null;
    const ref = id ? colRef.doc(id) : colRef.doc();
    batch2.set(ref, { ...it, id: ref.id, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    ops2 += 1;
    if(ops2 >= 450){ await batch2.commit(); batch2 = FB.db.batch(); ops2 = 0; }
  }
  if(ops2) await batch2.commit();
}

function importBackupJsonFile(file){
  if(!file) return;
  if(!isAdmin()){
    toast('Solo ADMIN puede importar.');
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const obj = JSON.parse(String(reader.result||''));
      if(!obj || !obj.periodId || !obj.movimientos){
        toast('Backup inválido.');
        return;
      }

      openModal({
        title: 'IMPORTAR BACKUP',
        bodyHtml: `
          <div class="notice" style="margin-top:0">Esto reemplaza <b>período activo</b> y <b>catálogo</b> con lo del backup.</div>
          <div class="hint">Período del backup: <span class="mono">${escapeHtml(String(obj.periodId))}</span></div>
          <div class="form-row" style="margin-top:10px">
            <label class="hint" style="display:flex; gap:10px; align-items:center"><input id="impChk" type="checkbox" /> Confirmo que quiero reemplazar datos</label>
          </div>
          <div class="form-row" style="margin-top:10px">
            <div class="form-label">ESCRIBE “IMPORTAR”</div>
            <input id="impTxt" class="text-input" placeholder="IMPORTAR" />
          </div>
        `,
        primaryText: 'IMPORTAR',
        secondaryText: 'CANCELAR',
        onSecondary: () => closeModal(),
        onPrimary: async () => {
          const chk = document.getElementById('impChk');
          const txt = document.getElementById('impTxt');
          const okChk = !!(chk && chk.checked);
          const okTxt = (txt ? String(txt.value||'').trim().toUpperCase() : '') === 'IMPORTAR';
          if(!okChk){ toast('Marca el checkbox.'); return; }
          if(!okTxt){ toast('Escribe IMPORTAR.'); return; }
          closeModal();

          setBusy(true, 'IMPORTANDO…');
          try{
            const pid = String(obj.periodId);
            setActivePeriod(pid);
            await ensurePeriodDoc(pid);

            // catálogo
            const cat = obj.catalogo || {};
            for(const t of ['categorias','etiquetas','cuentas','metodos','beneficios','origenes']){
              if(Array.isArray(cat[t])){
                await saveCatalogType(t, cat[t].map(x => ({ id:x.id || uid('c_'), nombre:x.nombre||'' })));
                STATE.catalogData[t] = cat[t];
                STATE.catalogLoaded[t] = true;
              }
            }

            // miembros no se importan (seguridad)

            // presupuesto
            if(Array.isArray(obj.presupuesto)){
              await saveBudgetItems(pid, obj.presupuesto);
              STATE.budget.items = obj.presupuesto;
              STATE.budget.loaded = true;
              STATE.budget.periodId = pid;
            }

            // movimientos
            const mv = obj.movimientos || {};
            await replaceCollectionWithItems(movCollectionRef('ingresos', pid), mv.ingresos || []);
            await replaceCollectionWithItems(movCollectionRef('gastos_fijos', pid), mv.gastos_fijos || []);
            await replaceCollectionWithItems(movCollectionRef('gastos_varios', pid), mv.gastos_varios || []);
            await replaceCollectionWithItems(movCollectionRef('transferencias', pid), mv.transferencias || []);

            // resuscribe
            ['ingresos','gastos_fijos','gastos_varios','transferencias'].forEach(unsubMov);

            toast('Backup importado.');
            render();
          }catch(err){
            console.error(err);
            toast('No se pudo importar.');
          } finally {
            setBusy(false);
          }
        }
      });

    }catch(err){
      console.error(err);
      toast('No se pudo leer backup.');
    }
  };
  reader.readAsText(file);
}

