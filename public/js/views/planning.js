import { get, post, put, del } from '../api.js';
import { students, levels, program, invalidate } from '../store.js';
import {
  esc, fmtDate, todayLocal, localISO, addDaysLocal, mondayOf, daysInMonth,
  weekdayLocal, v, checkedIds, showModal, closeModal, toast, confirmDelete, selectOptions
} from '../utils.js';
import { openClassModal } from './classes.js';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const state = {
  date: sessionStorage.getItem('planDate') || todayLocal(),
  mode: sessionStorage.getItem('planMode') || 'week'
};

function range() {
  if (state.mode === 'week') {
    const start = mondayOf(state.date);
    return [start, addDaysLocal(start, 6)];
  }
  const [y, m] = state.date.split('-').map(Number);
  return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${String(daysInMonth(y, m)).padStart(2, '0')}`];
}

async function scheduleForm(sched, studentList, levelList, topicList, defaultDate) {
  const edit = !!sched?.id;
  const ids = (sched?.student_ids ? JSON.parse(sched.student_ids) : []).map(Number);
  const body = `
    <div class="field"><label>Estudiantes *</label><div class="check-list">
      ${studentList.map(s => `<label><input type="checkbox" name="student_ids" value="${s.id}" ${ids.includes(Number(s.id)) ? 'checked' : ''}> ${esc(s.full_name)}</label>`).join('') || '<span class="muted">Registra estudiantes primero.</span>'}
    </div></div>
    <div class="row">
      <div class="field"><label>Tipo de clase</label><select name="class_type">
        <option value="particular"${sched?.class_type !== 'grupal' ? ' selected' : ''}>Particular</option>
        <option value="grupal"${sched?.class_type === 'grupal' ? ' selected' : ''}>Grupal</option>
      </select></div>
      <div class="field"><label>Hora *</label><input name="time" type="time" required value="${esc(sched?.time || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Nivel</label><select name="level_id" id="plan-level">${selectOptions(levelList.map(l => ({ id: l.id, name: l.name })), sched?.level_id)}</select></div>
      <div class="field"><label>Tema a enseñar</label><select name="topic_id" id="plan-topic">${selectOptions(topicList.map(t => ({ id: t.id, name: `${t.unit} · ${t.topic}`, level: t.level_id })), sched?.topic_id)}</select></div>
    </div>
    <div class="row">
      <div class="field"><label>Duración (min)</label><input name="duration_min" type="number" min="15" value="${esc(sched?.duration_min || 60)}"></div>
      <div class="field"><label>Repetir semanalmente</label><label class="inline"><input type="checkbox" name="repeat_weekly" value="1" ${sched?.repeat_weekly ? 'checked' : ''} style="width:auto"> Sí</label></div>
    </div>
    <div class="row">
      <div class="field"><label>Día de la semana</label><select name="weekday"><option value="">—</option>${[['1','Lunes'],['2','Martes'],['3','Miércoles'],['4','Jueves'],['5','Viernes'],['6','Sábado'],['7','Domingo']].map(d => `<option value="${d[0]}"${String(sched?.weekday) === d[0] ? ' selected' : ''}>${d[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha concreta</label><input name="specific_date" type="date" value="${esc(sched?.specific_date || defaultDate)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Vigente desde</label><input name="start_date" type="date" value="${esc(sched?.start_date || '')}"></div>
      <div class="field"><label>Vigente hasta</label><input name="end_date" type="date" value="${esc(sched?.end_date || '')}"></div>
    </div>
    <div class="field"><label>Observaciones</label><textarea name="notes">${esc(sched?.notes || '')}</textarea></div>`;

  showModal(edit ? 'Editar planificación' : 'Nueva planificación', body, async fd => {
    const ids = checkedIds(fd);
    if (!ids.length) throw new Error('Selecciona al menos un estudiante');
    if (!v(fd, 'time')) throw new Error('La hora es obligatoria');
    const repeat = !!fd.get('repeat_weekly');
    if (!repeat && !v(fd, 'specific_date')) throw new Error('Indica una fecha concreta o activa la repetición semanal');
    if (repeat && !v(fd, 'weekday')) throw new Error('Selecciona el día de la semana');
    const payload = {
      student_ids: ids, class_type: v(fd, 'class_type'), time: v(fd, 'time'),
      level_id: v(fd, 'level_id') || null, topic_id: v(fd, 'topic_id') || null,
      duration_min: Number(v(fd, 'duration_min')) || 60,
      repeat_weekly: repeat, weekday: repeat ? Number(v(fd, 'weekday')) : null,
      specific_date: repeat ? null : v(fd, 'specific_date'),
      start_date: v(fd, 'start_date') || null, end_date: v(fd, 'end_date') || null,
      notes: v(fd, 'notes') || null, active: 1
    };
    if (edit) await put(`schedules/${sched.id}`, payload); else await post('schedules', payload);
    closeModal(); toast(edit ? 'Planificación actualizada' : 'Planificación creada');
    document.querySelector('#main').dispatchEvent(new Event('refresh'));
  });

  const dlg = document.querySelector('#app-modal');
  const levelSel = dlg.querySelector('#plan-level');
  const topicSel = dlg.querySelector('#plan-topic');
  const filter = () => Array.from(topicSel.options).forEach(o => {
    if (!o.value) return;
    o.hidden = !!levelSel.value && String(o.dataset.level) !== String(levelSel.value);
  });
  levelSel.onchange = () => { filter(); if (topicSel.selectedOptions[0]?.hidden) topicSel.value = ''; };
  filter();
}

function dayPanel(date, schedules, tasks, studentList) {
  const mine = schedules.filter(s => s.date === date);
  const myTasks = tasks.filter(t => t.due_date === date);
  return `<div class="card" id="day-panel" style="margin-top:16px">
    <div class="section-head"><h2>${fmtDate(date)}</h2>
      <div class="inline">
        <button class="btn sm" id="day-new">+ Planificar clase</button>
        <button class="btn sm primary" id="day-register">Registrar clase</button>
      </div></div>
    <h3>Clases programadas</h3>
    <div class="list">${mine.length ? mine.map(s => `<div class="list-item">
      <div><div class="title">${esc(s.time)} · ${esc(s.class_type)} ${s.completed ? `<span class="badge">${esc(s.recorded_status)}</span>` : ''}</div>
        ${(s.tasks || []).map(t => `<div class="meta">${esc(t.student_name)}: ${esc(t.description)}</div>`).join('')}
        <div class="meta">${(s.students || []).map(x => esc(x.full_name)).join(', ') || '—'}</div>
        <div class="meta">Tema: ${esc(s.topic_name || 'Sin asignar')} · ${esc(s.level_name || 'Sin nivel')}</div>
        ${s.topic_content ? `<div class="meta">Contenido: ${esc(s.topic_content.slice(0, 120))}</div>` : ''}
        ${s.notes ? `<div class="meta">${esc(s.notes)}</div>` : ''}
      </div>
      <div class="table-actions">
        ${s.completed ? '' : `<button class="btn sm primary" data-reg="${s.id}">Marcar impartida</button>`}
        <button class="btn sm" data-edit-s="${s.id}">Editar</button>
        <button class="btn sm danger" data-del-s="${s.id}">Eliminar</button>
      </div></div>`).join('') : '<div class="empty">No hay clases programadas para este día.</div>'}</div>
    <h3 style="margin-top:16px">Tareas para revisar</h3>
    <div class="list">${myTasks.length ? myTasks.map(t => `<div class="list-item">
      <div><div class="title">${esc(t.student_name)}</div><div class="meta">${esc(t.description)}</div></div>
      <span class="badge ${esc(t.status)}">${esc(t.status)}</span></div>`).join('') : '<div class="empty">No hay tareas para este día.</div>'}</div>
  </div>`;
}

export async function render(main) {
  if (sessionStorage.getItem('openPlanDate')) {
    state.date = sessionStorage.getItem('openPlanDate');
    sessionStorage.removeItem('openPlanDate');
  }
  sessionStorage.setItem('planDate', state.date);
  sessionStorage.setItem('planMode', state.mode);
  const [start, end] = range();
  const [rawSchedules, tasks, studentList, levelList, topicList] = await Promise.all([
    get(`schedules?from=${start}&to=${end}`),
    get(`tasks?from=${start}&to=${end}`),
    students(), levels(), program()
  ]);
  const schedules = rawSchedules;

  let days = [];
  if (state.mode === 'week') {
    days = Array.from({ length: 7 }, (_, i) => addDaysLocal(start, i));
  } else {
    const firstWd = weekdayLocal(start);
    for (let i = 1; i < firstWd; i++) days.push(null);
    const total = daysInMonth(Number(state.date.slice(0, 4)), Number(state.date.slice(5, 7)));
    for (let d = 1; d <= total; d++) days.push(`${state.date.slice(0, 7)}-${String(d).padStart(2, '0')}`);
  }

  const title = state.mode === 'week'
    ? `${fmtDate(start)} – ${fmtDate(end)}`
    : `${fmtDate(start)} – ${fmtDate(end)}`;

  main.innerHTML = `
    <div class="section-head"><div><h1>Planificación</h1><p class="subtitle">${esc(title)}</p></div>
      <div class="inline">
        <button class="btn ${state.mode === 'week' ? 'primary' : ''}" data-mode="week">Semana</button>
        <button class="btn ${state.mode === 'month' ? 'primary' : ''}" data-mode="month">Mes</button>
        <button class="btn" id="dup-week">Duplicar semana</button>
      </div></div>
    <div class="calendar-head">
      <div class="inline">
        <button class="btn sm" id="prev">← Anterior</button>
        <button class="btn sm" id="today">Hoy</button>
        <button class="btn sm" id="next">Siguiente →</button>
      </div>
      <div class="muted small">Haz clic en un día para ver clases y tareas</div>
    </div>
    <div class="cal-grid">
      ${DAYS.map(d => `<div class="cal-dow">${d}</div>`).join('')}
      ${days.map(date => {
        if (!date) return '<div class="cal-day other"></div>';
        const mine = schedules.filter(s => s.date === date);
        const myTasks = tasks.filter(t => t.due_date === date);
        const outside = date < start || date > end;
        return `<div class="cal-day ${date === todayLocal() ? 'today' : ''} ${outside ? 'other' : ''}" data-date="${date}">
          <div class="num">${Number(date.slice(8))}</div>
          ${mine.slice(0, 3).map(s => `<div class="cal-chip ${s.completed ? 'done' : ''}" title="${esc(s.students.map(x => x.full_name).join(', '))}">${esc(s.time)} ${esc(s.students.map(x => x.full_name.split(' ')[0]).join(', '))}</div>`).join('')}
          ${mine.length > 3 ? `<div class="cal-chip">+${mine.length - 3} más</div>` : ''}
          ${myTasks.slice(0, 2).map(t => `<div class="cal-chip task" title="${esc(t.description)}">Tarea: ${esc(t.student_name.split(' ')[0])}</div>`).join('')}
        </div>`;
      }).join('')}
    </div>
    <div id="day-container">${dayPanel(state.date, schedules, tasks, studentList)}</div>`;

  main.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    state.mode = b.dataset.mode; render(main);
  });
  main.querySelector('#prev').onclick = () => {
    state.date = state.mode === 'week' ? addDaysLocal(state.date, -7) : addDaysLocal(start, -1);
    render(main);
  };
  main.querySelector('#next').onclick = () => {
    state.date = state.mode === 'week' ? addDaysLocal(state.date, 7) : addDaysLocal(end, 1);
    render(main);
  };
  main.querySelector('#today').onclick = () => { state.date = todayLocal(); render(main); };
  main.querySelectorAll('[data-date]').forEach(el => el.onclick = () => {
    state.date = el.dataset.date;
    main.querySelector('#day-container').innerHTML = dayPanel(state.date, schedules, tasks, studentList);
    bindDay(main, schedules, tasks, studentList, levelList, topicList);
  });

  main.querySelector('#dup-week').onclick = async () => {
    const from = mondayOf(state.date);
    if (!confirm(`¿Duplicar la planificación de la semana del ${fmtDate(from)} en la semana siguiente?`)) return;
    const r = await post('schedules/duplicate-week', { from_date: from });
    toast(`Se copiaron ${r.copied} planificaciones`);
    render(main);
  };
  bindDay(main, schedules, tasks, studentList, levelList, topicList);
}

function bindDay(main, schedules, tasks, studentList, levelList, topicList) {
  const panel = main.querySelector('#day-panel');
  if (!panel) return;
  panel.querySelector('#day-new').onclick = () => scheduleForm(null, studentList, levelList, topicList, state.date);
  panel.querySelector('#day-register').onclick = () => openClassModal({ class_date: state.date, status: 'impartida' }, () => render(main));
  panel.querySelectorAll('[data-reg]').forEach(b => b.onclick = async () => {
    const s = schedules.find(x => String(x.id) === b.dataset.reg && x.date === state.date);
    openClassModal({
      class_date: s.date, class_time: s.time, class_type: s.class_type,
      level_id: s.level_id, topic_id: s.topic_id, schedule_id: s.id,
      duration_min: s.duration_min, content: s.topic_content || '',
      student_ids: (s.students || []).map(x => x.id), status: 'impartida'
    }, () => render(main));
  });
  panel.querySelectorAll('[data-edit-s]').forEach(b => b.onclick = () => {
    const s = schedules.find(x => String(x.id) === b.dataset.editS);
    scheduleForm(s, studentList, levelList, topicList, state.date);
  });
  panel.querySelectorAll('[data-del-s]').forEach(b => b.onclick = async () => {
    if (!confirmDelete('planificación')) return;
    await del(`schedules/${b.dataset.delS}`);
    toast('Planificación eliminada'); render(main);
  });
}
