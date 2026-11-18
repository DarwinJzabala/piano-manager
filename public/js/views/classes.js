import { get, post, put, del } from '../api.js';
import { students, levels, program, invalidate } from '../store.js';
import {
  esc, fmtDate, localISO, addDaysLocal, v, checkedIds, showModal, closeModal,
  toast, confirmDelete, selectOptions
} from '../utils.js';

const ATT = [['presente', 'Presente'], ['ausente', 'Ausente'], ['justificada', 'Ausencia justificada']];
const STATUS = [['impartida', 'Impartida'], ['cancelada', 'Cancelada'], ['reprogramada', 'Reprogramada']];

export async function openClassModal(prefill = {}, onDone) {
  const [studentList, levelList, topicList, pending] = await Promise.all([students(), levels(), program(), get('tasks?status=pendiente')]);
  const edit = !!prefill.id;
  const selectedIds = (prefill.student_ids || []).map(Number);
  const att = prefill.attendance || {};

  const body = `
    <div class="row three">
      <div class="field"><label>Fecha *</label><input name="class_date" type="date" required value="${esc(prefill.class_date || localISO())}"></div>
      <div class="field"><label>Hora *</label><input name="class_time" type="time" required value="${esc(prefill.class_time || '')}"></div>
      <div class="field"><label>Duración (min)</label><input name="duration_min" type="number" min="15" value="${esc(prefill.duration_min || 60)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Tipo de clase *</label><select name="class_type">
        <option value="particular"${prefill.class_type !== 'grupal' ? ' selected' : ''}>Particular (cuenta como 1 clase)</option>
        <option value="grupal"${prefill.class_type === 'grupal' ? ' selected' : ''}>Grupal (cuenta como 1 clase)</option>
      </select></div>
      <div class="field"><label>Estado *</label><select name="status">${STATUS.map(([val, label]) => `<option value="${val}"${(prefill.status || 'impartida') === val ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
    </div>

    <div class="field"><label>Estudiantes participantes *</label>
      <div class="check-list" id="student-checks">
        ${studentList.length ? studentList.map(s => {
          const on = selectedIds.includes(Number(s.id));
          return `<label class="inline" style="justify-content:space-between">
            <span class="inline"><input type="checkbox" name="student_ids" value="${s.id}" ${on ? 'checked' : ''} data-student="${s.id}"> ${esc(s.full_name)}</span>
            <select name="att_${s.id}" ${on ? '' : 'disabled'} class="att-select" style="width:auto;padding:3px 6px">
              ${ATT.map(([val, label]) => `<option value="${val}"${(att[s.id] || 'presente') === val ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>`;
        }).join('') : '<span class="muted">Registra estudiantes primero.</span>'}
      </div>
    </div>

    <div class="row">
      <div class="field"><label>Nivel</label><select name="level_id" id="class-level">${selectOptions(levelList.map(l => ({ id: l.id, name: l.name })), prefill.level_id)}</select></div>
      <div class="field"><label>Tema del programa</label><select name="topic_id" id="class-topic">${selectOptions(topicList.map(t => ({ id: t.id, name: `${t.unit} · ${t.topic}`, level: t.level_id })), prefill.topic_id, 'id', 'name')}</select></div>
    </div>
    <div class="field"><label>Contenido impartido</label><textarea name="content">${esc(prefill.content || '')}</textarea></div>
    <div class="field"><label>Observaciones</label><textarea name="notes">${esc(prefill.notes || '')}</textarea></div>

    <div id="prior-tasks"></div>
    <div class="card" style="background:#fafaf8">
      <h3>Tarea para la próxima clase</h3>
      <input type="hidden" name="task_id" value="${esc(prefill.task_id || '')}">
      <div class="field"><label>Descripción de la tarea</label><textarea name="task_description" placeholder="Ej. Practicar escala de Do mayor con ambas manos">${esc(prefill.task_description || '')}</textarea></div>
      <div class="row">
        <div class="field"><label>Estudiante</label><select name="task_student">${selectOptions(studentList.map(s => ({ id: s.id, name: s.full_name })), prefill.task_student_id || selectedIds[0])}</select></div>
        <div class="field"><label>Fecha de revisión</label><input name="task_due_date" type="date" value="${esc(prefill.task_due_date || addDaysLocal(prefill.class_date || localISO(), 7))}"></div>
      </div>
    </div>`;

  showModal(edit ? 'Editar clase' : 'Registrar clase', body, async fd => {
    const ids = checkedIds(fd);
    if (!ids.length) throw new Error('Selecciona al menos un estudiante');
    const attendance = {};
    ids.forEach(id => { attendance[id] = fd.get(`att_${id}`) || 'presente'; });
    const payload = {
      class_date: v(fd, 'class_date'), class_time: v(fd, 'class_time'),
      class_type: v(fd, 'class_type'), status: v(fd, 'status'),
      duration_min: Number(v(fd, 'duration_min')) || 60,
      level_id: v(fd, 'level_id') || null, topic_id: v(fd, 'topic_id') || null,
      schedule_id: prefill.schedule_id || null,
      content: v(fd, 'content') || null, notes: v(fd, 'notes') || null,
      student_ids: ids, attendance,
      task_id: v(fd, 'task_id') || null,
      task: {
        description: v(fd, 'task_description'),
        due_date: v(fd, 'task_due_date'),
        student_id: Number(v(fd, 'task_student')) || ids[0]
      }
    };
    if (edit) await put(`classes/${prefill.id}`, payload);
    else await post('classes', payload);
    invalidate('students', 'program');
    closeModal();
    toast(edit ? 'Clase actualizada' : 'Clase guardada correctamente');
    if (onDone) await onDone();
    else document.querySelector('#main').dispatchEvent(new Event('refresh'));
  }, { submitText: edit ? 'Guardar cambios' : 'Guardar clase' });

  const dlg = document.querySelector('#app-modal');
  const showPending = () => {
    const ids = checkedIds(new FormData(dlg.querySelector('form')));
    const date = dlg.querySelector('[name="class_date"]').value;
    const rows = pending.filter(t => ids.includes(t.student_id) && t.assigned_date <= date && (!edit || t.class_id !== prefill.id));
    dlg.querySelector('#prior-tasks').innerHTML = rows.length ? `<h3>Tareas pendientes de los participantes</h3>${rows.map(t => `<p>${esc(t.student_name)}: ${esc(t.description)} · Revisar: ${fmtDate(t.due_date)}</p>`).join('')}` : '';
  };
  showPending();
  dlg.querySelector('[name="class_date"]').onchange = showPending;
  dlg.querySelectorAll('[data-student]').forEach(chk => {
    chk.onchange = () => {
      const sel = dlg.querySelector(`[name="att_${chk.dataset.student}"]`);
      if (sel) sel.disabled = !chk.checked;
      showPending();
    };
  });
  const levelSel = dlg.querySelector('#class-level');
  const topicSel = dlg.querySelector('#class-topic');
  const filterTopics = () => {
    Array.from(topicSel.options).forEach(opt => {
      if (!opt.value) return;
      opt.hidden = !!levelSel.value && String(opt.dataset.level) !== String(levelSel.value);
    });
    if (topicSel.selectedOptions[0]?.hidden) topicSel.value = '';
  };
  levelSel.onchange = filterTopics;
  filterTopics();
}

function detailModal(c) {
  const body = `
    <p class="muted">${fmtDate(c.class_date)} · ${esc(c.class_time)} · ${esc(c.class_type)} · ${esc(c.status)}</p>
    <p><b>Estudiantes:</b> ${esc(c.student_names || '—')}</p>
    <p><b>Asistencia:</b> ${esc(c.attendance_summary || '—')}</p>
    <p><b>Nivel / tema:</b> ${esc(c.level_name || '—')} / ${esc(c.topic_name || '—')}</p>
    <p><b>Contenido:</b><br>${esc(c.content || '—')}</p>
    <p><b>Observaciones:</b><br>${esc(c.notes || '—')}</p>
    ${c.task_description ? `<div class="card"><h3>Tarea asignada</h3><p>${esc(c.task_description)}</p><p class="muted">Revisar: ${fmtDate(c.task_due_date)} · ${esc(c.task_status)}</p></div>` : ''}`;
  showModal('Detalle de la clase', body, async () => closeModal(), { submitText: 'Cerrar' });
}

export async function render(main) {
  const [list, studentList, levelList] = await Promise.all([
    get('classes'), students(), levels()
  ]);
  const q = {
    from: main.dataset.from || '', to: main.dataset.to || '',
    type: main.dataset.type || '', status: main.dataset.status || '',
    student_id: main.dataset.student || ''
  };
  const filtered = list.filter(c =>
    (!q.from || c.class_date >= q.from) && (!q.to || c.class_date <= q.to) &&
    (!q.type || c.class_type === q.type) && (!q.status || c.status === q.status) &&
    (!q.student_id || (c.student_ids_csv || '').split(',').includes(q.student_id)));

  main.innerHTML = `
    <div class="section-head"><div><h1>Clases</h1><p class="subtitle">${filtered.length} registros · Las grupales cuentan como una sola clase</p></div>
      <button class="btn primary" id="new-class">+ Registrar clase</button></div>
    <div class="filters">
      <div class="field"><label>Desde</label><input id="f-from" type="date" value="${q.from}"></div>
      <div class="field"><label>Hasta</label><input id="f-to" type="date" value="${q.to}"></div>
      <div class="field"><label>Tipo</label><select id="f-type"><option value="">Todos</option><option value="particular"${q.type === 'particular' ? ' selected' : ''}>Particular</option><option value="grupal"${q.type === 'grupal' ? ' selected' : ''}>Grupal</option></select></div>
      <div class="field"><label>Estado</label><select id="f-status"><option value="">Todos</option>${STATUS.map(([val, label]) => `<option value="${val}"${q.status === val ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label>Estudiante</label><select id="f-student"><option value="">Todos</option>${selectOptions(studentList.map(s => ({ id: s.id, name: s.full_name })), q.student_id)}</select></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Tipo</th><th>Estudiantes</th><th>Tema</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filtered.length ? filtered.map(c => `<tr>
        <td>${fmtDate(c.class_date)}</td><td>${esc(c.class_time)}</td>
        <td><span class="badge ${esc(c.class_type)}">${c.class_type === 'grupal' ? 'Grupal' : 'Particular'}</span></td>
        <td>${esc(c.student_names || '—')}</td><td>${esc(c.topic_name || '—')}</td>
        <td><span class="badge ${esc(c.status)}">${esc(c.status)}</span></td>
        <td><div class="table-actions">
          <button class="btn sm" data-view="${c.id}">Ver</button>
          <button class="btn sm" data-edit="${c.id}">Editar</button>
          <button class="btn sm danger" data-del="${c.id}">Eliminar</button>
        </div></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No hay clases con estos filtros.</td></tr>'}</tbody>
    </table></div>`;

  main.querySelector('#new-class').onclick = () => openClassModal({}, () => render(main));
  const apply = () => {
    main.dataset.from = main.querySelector('#f-from').value;
    main.dataset.to = main.querySelector('#f-to').value;
    main.dataset.type = main.querySelector('#f-type').value;
    main.dataset.status = main.querySelector('#f-status').value;
    main.dataset.student = main.querySelector('#f-student').value;
    render(main);
  };
  ['f-from', 'f-to', 'f-type', 'f-status', 'f-student'].forEach(id => main.querySelector('#' + id).onchange = apply);
  main.querySelectorAll('[data-view]').forEach(b => b.onclick = () => detailModal(filtered.find(c => String(c.id) === b.dataset.view)));
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => {
    const c = filtered.find(x => String(x.id) === b.dataset.edit);
    const ids = (c.student_ids_csv || '').split(',').filter(Boolean).map(Number);
    openClassModal({
      ...c,
      student_ids: ids,
      attendance: JSON.parse(c.attendance_json || '{}')
    }, () => render(main));
  });
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirmDelete('clase')) return;
    await del(`classes/${b.dataset.del}`);
    toast('Clase eliminada'); render(main);
  });
}
