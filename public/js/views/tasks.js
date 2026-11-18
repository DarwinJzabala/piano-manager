import { get, post, put, del } from '../api.js';
import { students, invalidate } from '../store.js';
import { esc, fmtDate, localISO, addDaysLocal, v, showModal, closeModal, toast, confirmDelete, selectOptions } from '../utils.js';

function taskForm(task, studentList) {
  const edit = !!task?.id;
  showModal(edit ? 'Editar tarea' : 'Nueva tarea', `
    <div class="field"><label>Estudiante *</label><select name="student_id" required>${selectOptions(studentList.map(s => ({ id: s.id, name: s.full_name })), task?.student_id)}</select></div>
    <div class="field"><label>Descripción *</label><textarea name="description" required>${esc(task?.description || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>Asignada el</label><input name="assigned_date" type="date" value="${esc(task?.assigned_date || localISO())}"></div>
      <div class="field"><label>Fecha de revisión *</label><input name="due_date" type="date" required value="${esc(task?.due_date || addDaysLocal(localISO(), 7))}"></div>
    </div>`, async fd => {
    const payload = {
      student_id: v(fd, 'student_id'), description: v(fd, 'description'),
      assigned_date: v(fd, 'assigned_date') || localISO(), due_date: v(fd, 'due_date')
    };
    if (edit) {
      await put(`tasks/${task.id}`, {
        ...payload, status: task.status, review_notes: task.review_notes || null
      });
    } else {
      await post('tasks', payload);
    }
    closeModal(); toast(edit ? 'Tarea actualizada' : 'Tarea creada');
    document.querySelector('#main').dispatchEvent(new Event('refresh'));
  });
}

function reviewModal(task, onDone) {
  showModal('Revisión de tarea', `
    <p><b>${esc(task.student_name)}</b> · ${fmtDate(task.due_date)}</p>
    <p>${esc(task.description)}</p>
    <div class="field"><label>Estado</label><select name="status">
      <option value="pendiente"${task.status === 'pendiente' ? ' selected' : ''}>Pendiente</option>
      <option value="revisada"${task.status === 'revisada' ? ' selected' : ''}>Revisada</option>
      <option value="completada"${task.status === 'completada' ? ' selected' : ''}>Completada</option>
    </select></div>
    <div class="field"><label>Observaciones de revisión</label><textarea name="review_notes">${esc(task.review_notes || '')}</textarea></div>`, async fd => {
    await put(`tasks/${task.id}`, { status: v(fd, 'status'), review_notes: v(fd, 'review_notes') || null });
    closeModal(); toast('Tarea actualizada'); onDone();
  });
}

export async function render(main) {
  const q = {
    status: main.dataset.status ?? 'pendiente',
    student_id: main.dataset.student || '',
    from: main.dataset.from || '', to: main.dataset.to || ''
  };
  const [all, studentList] = await Promise.all([
    get(`tasks${q.status || q.student_id || q.from || q.to ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v))).toString() : ''}`),
    students()
  ]);

  main.innerHTML = `
    <div class="section-head"><div><h1>Tareas</h1><p class="subtitle">${all.length} tareas · Se muestran automáticamente en la próxima clase</p></div>
      <button class="btn primary" id="new-task">+ Nueva tarea</button></div>
    <div class="filters">
      <div class="field"><label>Estado</label><select id="f-status"><option value="">Todas</option>${['pendiente', 'revisada', 'completada'].map(s => `<option value="${s}"${q.status === s ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="field"><label>Estudiante</label><select id="f-student"><option value="">Todos</option>${selectOptions(studentList.map(s => ({ id: s.id, name: s.full_name })), q.student_id)}</select></div>
      <div class="field"><label>Desde</label><input id="f-from" type="date" value="${q.from}"></div>
      <div class="field"><label>Hasta</label><input id="f-to" type="date" value="${q.to}"></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Revisar</th><th>Estudiante</th><th>Tarea</th><th>Asignada</th><th>Estado</th><th>Revisión</th><th></th></tr></thead>
      <tbody>${all.length ? all.map(t => `<tr>
        <td>${fmtDate(t.due_date)}</td><td>${esc(t.student_name)}</td><td>${esc(t.description)}</td>
        <td>${fmtDate(t.assigned_date)}</td><td><span class="badge ${esc(t.status)}">${esc(t.status)}</span></td>
        <td class="small">${esc(t.review_notes || '—')}</td>
        <td><div class="table-actions">
          <button class="btn sm" data-review="${t.id}">Revisar</button>
          <button class="btn sm" data-edit="${t.id}">Editar</button>
          <button class="btn sm danger" data-del="${t.id}">Eliminar</button>
        </div></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No hay tareas con estos filtros.</td></tr>'}</tbody>
    </table></div>`;

  main.querySelector('#new-task').onclick = () => taskForm(null, studentList);
  const apply = () => {
    main.dataset.status = main.querySelector('#f-status').value;
    main.dataset.student = main.querySelector('#f-student').value;
    main.dataset.from = main.querySelector('#f-from').value;
    main.dataset.to = main.querySelector('#f-to').value;
    render(main);
  };
  ['f-status', 'f-student', 'f-from', 'f-to'].forEach(id => main.querySelector('#' + id).onchange = apply);
  main.querySelectorAll('[data-review]').forEach(b => b.onclick = () => reviewModal(all.find(t => String(t.id) === b.dataset.review), () => render(main)));
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => taskForm(all.find(t => String(t.id) === b.dataset.edit), studentList));
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirmDelete('tarea')) return;
    await del(`tasks/${b.dataset.del}`); toast('Tarea eliminada'); render(main);
  });
}
