import { get } from './api.js';
import { qs, qsa, esc, toast, localISO } from './utils.js';
import {
  refreshAuth, currentUser, isAdmin, showAuthScreen, hideAuthScreen, logout
} from './auth.js';
import { openClassModal } from './views/classes.js';
import * as dashboard from './views/dashboard.js';
import * as students from './views/students.js';
import * as program from './views/program.js';
import * as planning from './views/planning.js';
import * as classes from './views/classes.js';
import * as tasks from './views/tasks.js';
import * as reports from './views/reports.js';
import * as history from './views/history.js';
import * as backup from './views/backup.js';
import * as income from './views/income.js';
import * as incomeHistory from './views/income-history.js';
import * as incomeReports from './views/income-reports.js';
import * as rates from './views/rates.js';
import * as users from './views/users.js';
import * as profile from './views/profile.js';

const routes = {
  dashboard, estudiantes: students, programa: program, planificacion: planning,
  clases: classes, tareas: tasks, reportes: reports, historial: history, respaldo: backup,
  ingresos: income, 'ingresos-historial': incomeHistory,
  'ingresos-reportes': incomeReports, tarifas: rates,
  usuarios: users, perfil: profile
};

let main = qs('#main');
let activeRoute;
let ready = false;

function routeName() {
  const raw = (location.hash || '#dashboard').slice(1).split('?')[0];
  return routes[raw] ? raw : 'dashboard';
}

// Etiquetas automáticas para convertir tablas en tarjetas en pantallas pequeñas.
function enhanceTables(root = document) {
  root.querySelectorAll?.('table').forEach(table => {
    const heads = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    if (!heads.length) return;
    table.querySelectorAll('tbody tr').forEach(tr => {
      Array.from(tr.children).forEach((td, i) => {
        if (!td.dataset.label && heads[i]) td.dataset.label = heads[i];
      });
    });
  });
}
new MutationObserver(mutations => {
  if (!ready) return;
  for (const m of mutations) {
    m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.tagName === 'TABLE') enhanceTables(node.parentElement || document);
      else enhanceTables(node);
    });
  }
}).observe(document.body, { childList: true, subtree: true });

async function render() {
  if (!currentUser()) return;
  const name = routeName();
  if (activeRoute !== name) {
    const fresh = document.createElement('main');
    fresh.id = 'main'; fresh.className = 'main';
    main.replaceWith(fresh); main = fresh;
    main.addEventListener('refresh', render);
    activeRoute = name;
  }
  qsa('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  qs('#sidebar').classList.remove('open');
  qs('#nav-overlay').hidden = true;
  const target = main;
  try {
    await routes[name].render(main);
    enhanceTables(main);
  } catch (e) {
    target.innerHTML = `<div class="empty"><b>No se pudo cargar esta sección.</b><br>${esc(e.message)}</div>`;
  }
}

function applyUser() {
  const u = currentUser();
  const box = qs('#user-info');
  box.innerHTML = `
    <div class="user-card">
      <span class="user-avatar">${esc((u.name || u.email || 'U').slice(0, 1).toUpperCase())}</span>
      <span class="user-meta"><b>${esc(u.name || u.email)}</b><small>${esc(u.role)}</small></span>
    </div>
    <div class="user-actions">
      <a class="user-link" href="#perfil">Mi perfil</a>
      <button type="button" class="user-link" id="logout-btn">Cerrar sesión</button>
    </div>`;
  qs('#logout-btn').onclick = () => logout();
  qsa('#nav a[data-nav="usuarios"], #nav a[data-nav="tarifas"], #nav a[data-nav="respaldo"]')
    .forEach(link => { link.hidden = !isAdmin(); });
}

async function enterApp() {
  hideAuthScreen();
  applyUser();
  ready = true;
  await render();
}

function guardRoute() {
  const hash = location.hash || '';
  if (hash.startsWith('#restablecer')) {
    const token = new URLSearchParams(hash.split('?')[1] || '').get('token') || '';
    showAuthScreen('reset', token, enterApp);
    return true;
  }
  return false;
}

async function bootstrap() {
  const today = localISO();
  const pretty = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  qs('#topbar-date').textContent = pretty.charAt(0).toUpperCase() + pretty.slice(1);

  qs('#quick-register').onclick = () => openClassModal({ class_date: localISO(), status: 'impartida' }, render);
  qs('#menu-btn').onclick = () => {
    const open = qs('#sidebar').classList.toggle('open');
    qs('#nav-overlay').hidden = !open;
  };
  qs('#nav-overlay').onclick = () => {
    qs('#sidebar').classList.remove('open');
    qs('#nav-overlay').hidden = true;
  };
  qsa('[data-close-modal]').forEach(b => b.onclick = () => qs('#app-modal').close());

  window.addEventListener('unhandledrejection', e => toast(e.reason?.message || 'No se pudo completar la acción', 'error'));
  window.addEventListener('hashchange', () => {
    if (!currentUser()) { guardRoute(); return; }
    render();
  });
  window.addEventListener('pm:unauthorized', async () => {
    await refreshAuth();
    showAuthScreen('login', '', enterApp);
  });

  await refreshAuth();
  if (guardRoute()) return;
  if (!currentUser()) {
    showAuthScreen('login', '', enterApp);
    return;
  }
  await enterApp();
}

bootstrap();
