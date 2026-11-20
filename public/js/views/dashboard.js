import { get, put } from '../api.js';
import { esc, fmtDate, todayLocal, toast, localISO, money, modalityLabel } from '../utils.js';
import { openClassModal } from './classes.js';

function goPlanning(date) {
  sessionStorage.setItem('openPlanDate', date);
  location.hash = 'planificacion';
}

function scheduleRow(s, showDate) {
  const names = (s.students || []).map(x => esc(x.full_name)).join(', ') || '—';
  const topic = s.topic_name ? esc(s.topic_name) : 'Sin tema asignado';
  const button = s.completed
    ? `<a class="btn sm" href="#clases">Ver clase</a>`
    : `<button class="btn sm primary" data-open-schedule="${s.id}" data-date="${esc(s.date)}">Registrar</button>`;
  return `<div class="list-item">
    <div>
      <div class="title">${showDate ? fmtDate(s.date) + ' · ' : ''}${esc(s.time)} <span class="badge ${esc(s.class_type)}">${esc(modalityLabel(s.class_type))}</span></div>
      <div class="meta">${names} · ${topic}${s.completed ? ' · ' + esc(s.recorded_status) : ''}</div>
      ${(s.tasks || []).map(t => `<div class="meta">${esc(t.student_name)}: ${esc(t.description)}</div>`).join('')}
    </div>
    <div class="table-actions">${button}</div>
  </div>`;
}

export async function render(main) {
  const today = todayLocal();
  const d = await get(`dashboard?today=${today}`);
  const s = d.stats;

  main.innerHTML = `
    <h1>Panel</h1>
    <p class="subtitle">${esc(d.today)} · Resumen de tu actividad</p>

    <div class="stats">
      <div class="stat accent"><div class="label">Clases este mes</div><div class="value">${s.month_total}</div></div>
      <div class="stat"><div class="label">Particulares</div><div class="value">${s.particular}</div></div>
      <div class="stat"><div class="label">Grupales</div><div class="value">${s.grupal}</div></div>
      <div class="stat"><div class="label">Próximas clases</div><div class="value">${s.upcoming}</div></div>
      <div class="stat"><div class="label">Tareas pendientes</div><div class="value">${s.pending_tasks}</div></div>
      <div class="stat accent"><div class="label">Ingresos del mes</div><div class="value">${money(d.income?.month || 0)}</div></div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Hoy</h2><button class="btn sm" id="open-today">Ver planificación</button></div>
      <div class="card list">
        ${d.today_schedules.length
          ? d.today_schedules.map(x => scheduleRow(x, false)).join('')
          : '<div class="empty">No tienes clases programadas para hoy.</div>'}
      </div>
    </div>

    <div class="grid-2">
      <div class="section">
        <div class="section-head"><h2>Próximas clases</h2></div>
        <div class="card list">
          ${d.upcoming.length
            ? d.upcoming.map(x => scheduleRow(x, true)).join('')
            : '<div class="empty">No hay clases próximas.</div>'}
        </div>
      </div>
      <div class="section">
        <div class="section-head"><h2>Tareas pendientes</h2><a class="btn sm" href="#tareas">Ver todas</a></div>
        <div class="card list">
          ${d.pending_tasks.length
            ? d.pending_tasks.map(t => `<div class="list-item">
                <div><div class="title">${esc(t.student_name)}</div>
                  <div class="meta">${esc(t.description)}</div>
                  <div class="meta">Revisar: ${fmtDate(t.due_date)}</div></div>
                <button class="btn sm" data-review="${t.id}">Revisada</button>
              </div>`).join('')
            : '<div class="empty">No hay tareas pendientes.</div>'}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Últimas clases registradas</h2><a class="btn sm" href="#historial">Ver historial</a></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Estudiantes</th><th>Tema</th><th>Estado</th></tr></thead>
        <tbody>${d.recent_classes.length ? d.recent_classes.map(c => `<tr>
          <td>${fmtDate(c.class_date)}</td><td>${esc(c.class_time)}</td>
          <td><span class="badge ${esc(c.class_type)}">${esc(modalityLabel(c.class_type))}</span></td>
          <td>${esc(c.student_names || '—')}</td><td>${esc(c.topic_name || '—')}</td>
          <td><span class="badge ${esc(c.status)}">${esc(c.status)}</span></td>
        </tr>`).join('') : '<tr><td colspan="6" class="empty">Aún no hay clases registradas.</td></tr>'}</tbody>
      </table></div>
    </div>`;

  main.querySelector('#open-today').onclick = () => goPlanning(today);

  main.querySelectorAll('[data-open-schedule]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.openSchedule;
      const sched = [...d.today_schedules,...d.upcoming].find(x => String(x.id) === id && x.date === btn.dataset.date);
      if (!sched) return toast('No se encontró la planificación', 'error');
      openClassModal({
        class_date: sched.date,
        class_time: sched.time,
        class_type: sched.class_type,
        level_id: sched.level_id,
        topic_id: sched.topic_id,
        schedule_id: sched.id,
        duration_min: sched.duration_min,
        content: sched.topic_content || '',
        student_ids: (sched.students || []).map(x => x.id),
        status: 'impartida'
      }, () => render(main));
    };
  });

  main.querySelectorAll('[data-review]').forEach(btn => {
    btn.onclick = async () => {
      await put(`tasks/${btn.dataset.review}`, { status: 'revisada' });
      toast('Tarea marcada como revisada');
      render(main);
    };
  });
}
