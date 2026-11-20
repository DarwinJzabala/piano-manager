import { get } from '../api.js';
import { students, levels } from '../store.js';
import { esc, fmtDate, v, MODALITIES, modalityLabel } from '../utils.js';

export async function render(main) {
  const q = {
    from: main.dataset.from || '', to: main.dataset.to || '',
    type: main.dataset.type || '', level_id: main.dataset.level || '',
    student_id: main.dataset.student || ''
  };
  const params = new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, val]) => val)));
  const [data, studentList, levelList] = await Promise.all([
    get(`history${params.size ? '?' + params.toString() : ''}`), students(), levels()
  ]);
  const tab = main.dataset.tab || 'clases';

  const classRows = data.classes.map(c => `<tr>
    <td>${fmtDate(c.class_date)}</td><td>${esc(c.class_time)}</td>
    <td><span class="badge ${esc(c.class_type)}">${esc(modalityLabel(c.class_type))}</span></td>
    <td>${esc(c.student_names || '—')}</td><td>${esc(c.level_name || '—')}</td>
    <td>${esc(c.topic_name || '—')}</td><td><span class="badge ${esc(c.status)}">${esc(c.status)}</span></td>
  </tr>`).join('');

  const att = await get(`attendance?${params}`);
  const attRows = att.map(a => `<tr>
    <td>${fmtDate(a.class_date)}</td><td>${esc(a.student_name)}</td>
    <td><span class="badge ${esc(a.attendance)}">${esc(a.attendance)}</span></td>
    <td>${esc(modalityLabel(a.class_type))}</td><td>${esc(a.content || '—')}</td>
  </tr>`).join('');

  const taskRows = data.tasks.map(t => `<tr>
    <td>${fmtDate(t.assigned_date)}</td><td>${esc(t.student_name)}</td>
    <td>${esc(t.description)}</td><td>${fmtDate(t.due_date)}</td>
    <td><span class="badge ${esc(t.status)}">${esc(t.status)}</span></td>
  </tr>`).join('');

  const byStudent = Object.create(null);
  data.classes.filter(c => c.status === 'impartida').forEach(c => {
    (c.student_names || '').split(' | ').filter(Boolean).forEach(name => {
      (byStudent[name] ||= []).push({ date: c.class_date, topic: c.topic_name, content: c.content });
    });
  });
  const contentRows = Object.entries(byStudent).map(([name, items]) => `<tr>
    <td><b>${esc(name)}</b></td>
    <td>${items.map(i => `${fmtDate(i.date)}: ${esc(i.topic || '—')}${i.content ? ' — ' + esc(i.content.slice(0, 70)) : ''}`).join('<br>')}</td>
  </tr>`).join('');

  main.innerHTML = `
    <h1>Historial y búsqueda</h1>
    <p class="subtitle">Consulta clases, asistencia, tareas y contenido impartido</p>
    <div class="filters">
      <div class="field"><label>Desde</label><input id="f-from" type="date" value="${q.from}"></div>
      <div class="field"><label>Hasta</label><input id="f-to" type="date" value="${q.to}"></div>
      <div class="field"><label>Estudiante</label><select id="f-student"><option value="">Todos</option>${studentList.map(s => `<option value="${s.id}"${String(q.student_id) === String(s.id) ? ' selected' : ''}>${esc(s.full_name)}</option>`).join('')}</select></div>
      <div class="field"><label>Nivel</label><select id="f-level"><option value="">Todos</option>${levelList.map(l => `<option value="${l.id}"${String(q.level_id) === String(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Modalidad</label><select id="f-type"><option value="">Todas</option>${MODALITIES.map(m => `<option value="${m.code}"${q.type === m.code ? ' selected' : ''}>${m.name}</option>`).join('')}</select></div>
    </div>
    <div class="inline" style="margin-bottom:14px">
      ${[['clases', 'Clases'], ['asistencia', 'Asistencia'], ['tareas', 'Tareas'], ['contenido', 'Contenido por estudiante']].map(([k, label]) => `<button class="btn sm ${tab === k ? 'primary' : ''}" data-tab="${k}">${label}</button>`).join('')}
    </div>
    <div class="table-wrap"><table>${tab === 'clases' ? `
      <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Estudiantes</th><th>Nivel</th><th>Tema</th><th>Estado</th></tr></thead>
      <tbody>${classRows || '<tr><td colspan="7" class="empty">Sin resultados</td></tr>'}</tbody>` : tab === 'asistencia' ? `
      <thead><tr><th>Fecha</th><th>Estudiante</th><th>Asistencia</th><th>Tipo</th><th>Contenido</th></tr></thead>
      <tbody>${attRows || '<tr><td colspan="5" class="empty">Sin resultados</td></tr>'}</tbody>` : tab === 'tareas' ? `
      <thead><tr><th>Asignada</th><th>Estudiante</th><th>Tarea</th><th>Revisar</th><th>Estado</th></tr></thead>
      <tbody>${taskRows || '<tr><td colspan="5" class="empty">Sin resultados</td></tr>'}</tbody>` : `
      <thead><tr><th>Estudiante</th><th>Contenido impartido</th></tr></thead>
      <tbody>${contentRows || '<tr><td colspan="2" class="empty">Sin resultados</td></tr>'}</tbody>`}</table></div>`;

  const apply = () => {
    main.dataset.from = main.querySelector('#f-from').value;
    main.dataset.to = main.querySelector('#f-to').value;
    main.dataset.student = main.querySelector('#f-student').value;
    main.dataset.level = main.querySelector('#f-level').value;
    main.dataset.type = main.querySelector('#f-type').value;
    render(main);
  };
  ['f-from', 'f-to', 'f-student', 'f-level', 'f-type'].forEach(id => main.querySelector('#' + id).onchange = apply);
  main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { main.dataset.tab = b.dataset.tab; render(main); });
}
