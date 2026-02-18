/* BALANZA GM — v0.1.0 Etapa 2 */
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

const els = {
  tabsRow: document.getElementById('tabsRow'),
  view: document.getElementById('view'),
  heroImg: document.getElementById('heroImg'),
  heroFallback: document.getElementById('heroFallback'),
  crestImg: document.getElementById('crestImg'),
};

function safeTabIdFromHash(){
  const raw = (location.hash || '').replace('#','').trim().toLowerCase();
  if(!raw) return 'resumen';
  const ok = TABS.some(t => t.id === raw);
  return ok ? raw : 'resumen';
}

function setHeroFor(tab){
  const base = 'assets/hero/';
  const img = els.heroImg;
  const fb = els.heroFallback;

  // reset
  img.style.display = 'none';
  fb.style.display = 'block';
  img.onerror = null;

  const trySrcs = [tab.hero].concat(tab.heroAlt ? [tab.heroAlt] : []);
  let i = 0;

  const tryNext = () => {
    if(i >= trySrcs.length) return; // fallback stays visible
    const src = base + trySrcs[i++];
    img.src = src;
  };

  img.onload = () => {
    img.style.display = 'block';
    fb.style.display = 'none';
  };
  img.onerror = () => tryNext();

  tryNext();
}

function renderTabs(currentId){
  els.tabsRow.innerHTML = '';
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.type = 'button';
    btn.textContent = tab.label;
    const selected = tab.id === currentId;
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    btn.addEventListener('click', () => {
      if(location.hash !== '#' + tab.id) location.hash = tab.id;
      else render(); // por si ya está igual
    });
    els.tabsRow.appendChild(btn);
  });
}

function renderView(tab){
  // Placeholder por ahora — cada pestaña renderiza su vista
  els.view.innerHTML = `
    <h2>${tab.label}</h2>
    <p>Vista base lista. Aquí irá el contenido funcional en las siguientes etapas.</p>
  `;
}

function render(){
  const id = safeTabIdFromHash();
  const tab = TABS.find(t => t.id === id) || TABS[0];

  renderTabs(tab.id);
  setHeroFor(tab);
  renderView(tab);
}

window.addEventListener('hashchange', render);
render();

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
