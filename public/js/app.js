import { get } from './api.js';
import { qs, qsa, esc, toast, localISO } from './utils.js';
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

const routes = {
  dashboard, estudiantes: students, programa: program, planificacion: planning,
  clases: classes, tareas: tasks, reportes: reports, historial: history, respaldo: backup,
  ingresos: income, 'ingresos-historial': incomeHistory,
  'ingresos-reportes': incomeReports, tarifas: rates
};

let main = qs('#main');
let activeRoute;

function routeName() {
  const raw = (location.hash || '#dashboard').slice(1).split('?')[0];
  return routes[raw] ? raw : 'dashboard';
}

async function render() {
  const name = routeName();
  if (activeRoute !== name) {
    const fresh = document.createElement('main');
    fresh.id = 'main'; fresh.className = 'main';
    main.replaceWith(fresh); main = fresh;
    main.addEventListener('refresh', render);
    activeRoute = name;
  }
  const target = main;
  qsa('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
  qs('#sidebar').classList.remove('open');
  try {
    await routes[name].render(main);
  } catch (e) {
    target.innerHTML = `<div class="empty"><b>No se pudo cargar esta sección.</b><br>${esc(e.message)}</div>`;
  }
}

async function bootstrap() {
  const today = localISO();
  const pretty = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  qs('#topbar-date').textContent = pretty.charAt(0).toUpperCase() + pretty.slice(1);

  try {
    const me = await get('me');
    qs('#user-info').textContent = me.authenticated
      ? `Acceso: ${me.email || 'verificado'}`
      : 'Acceso local (sin Cloudflare Access)';
  } catch (_) { qs('#user-info').textContent = 'Acceso no verificado'; }

  qs('#quick-register').onclick = () => openClassModal({ class_date: localISO(), status: 'impartida' }, render);
  qs('#menu-btn').onclick = () => qs('#sidebar').classList.toggle('open');
  qsa('[data-close-modal]').forEach(b => b.onclick = () => qs('#app-modal').close());

  window.addEventListener('unhandledrejection', e => toast(e.reason?.message || 'No se pudo completar la acción', 'error'));
  window.addEventListener('hashchange', render);
  await render();
}

bootstrap();
