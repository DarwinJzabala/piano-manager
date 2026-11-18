import { get, post, put, del } from '../api.js';
import { students, levels, invalidate } from '../store.js';
import { esc, fmtDate, v, checkedIds, showModal, closeModal, toast, confirmDelete, selectOptions } from '../utils.js';

const DAYS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado'], [7, 'Domingo']];
const dayLabel = n => (DAYS.find(d => d[0] === Number(n)) || [null, '—'])[1];

async function openForm(st, levelList) {
  const isEdit = !!(st && st.id);
  const body = `
    <div class="row">
      <div class="field"><label>Nombre completo *</label><input name="full_name" required value="${esc(st?.full_name || '')}"></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${esc(st?.phone || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Nivel</label><select name="level_id">${selectOptions(levelList.map(l => ({ id: l.id, name: l.name })), st?.level_id, 'id', 'name')}</select></div>
      <div class="field"><label>Tipo de clase habitual</label><select name="class_type">
        <option value="particular"${st?.class_type === 'particular' ? ' selected' : ''}>Particular</option>
        <option value="grupal"${st?.class_type === 'grupal' ? ' selected' : ''}>Grupal</option>
      </select></div>
    </div>
    <div class="row">
      <div class="field"><label>Día habitual</label><select name="usual_day"><option value="">—</option>${DAYS.map(d => `<option value="${d[0]}"${Number(st?.usual_day) === d[0] ? ' selected' : ''}>${d[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Horario habitual</label><input name="usual_time" type="time" value="${esc(st?.usual_time || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Fecha de inicio</label><input name="start_date" type="date" value="${esc(st?.start_date || '')}"></div>
      <div class="field"><label>Estado</label><label class="inline"><input name="active" type="checkbox" value="1" ${st?.active !== 0 ? 'checked' : ''} style="width:auto"> Activo</label></div>
    </div>
    <div class="field"><label>Observaciones</label><textarea name="notes">${esc(st?.notes || '')}</textarea></div>`;

  showModal(isEdit ? 'Editar estudiante' : 'Nuevo estudiante', body, async fd => {
    const payload = {
      full_name: v(fd, 'full_name'), phone: v(fd, 'phone') || null,
      level_id: v(fd, 'level_id') || null, class_type: v(fd, 'class_type'),
      usual_day: v(fd, 'usual_day') || null, usual_time: v(fd, 'usual_time') || null,
      start_date: v(fd, 'start_date') || null, notes: v(fd, 'notes') || null,
      active: fd.get('active') ? 1 : 0
    };
    if (isEdit) await put(`students/${st.id}`, payload);
    else await post('students', payload);
    invalidate('students');
    closeModal();
    toast(isEdit ? 'Estudiante actualizado' : 'Estudiante registrado');
    document.querySelector('#main').dispatchEvent(new Event('refresh'));
  });
}

async function openDetail(id) {
  const [allStudents, allLevels, history, attendance] = await Promise.all([
    students(), levels(), get(`history?student_id=${id}`), get(`attendance?student_id=${id}`)
  ]);
  const st = allStudents.find(x => String(x.id) === String(id));
  if (!st) return;
  const level = allLevels.find(l => String(l.id) === String(st.level_id));
  const body = `
    <p class="muted">${esc(st.phone || 'Sin teléfono')} · ${esc(level?.name || 'Sin nivel')} · ${esc(st.class_type)}</p>
    <h3>Clases registradas (${history.classes.length})</h3>
    <div class="table-wrap" style="max-height:200px;overflow:auto"><table><thead><tr><th>Fecha</th><th>Tema</th><th>Contenido</th></tr></thead><tbody>
      ${history.classes.length ? history.classes.map(c => `<tr><td>${fmtDate(c.class_date)}</td><td>${esc(c.topic_name || '—')}</td><td>${esc(c.content || '—')}</td></tr>`).join('') : '<tr><td colspan="3" class="empty">Sin clases</td></tr>'}
    </tbody></table></div>
    <h3>Asistencia (${attendance.length})</h3>
    <div class="table-wrap" style="max-height:200px;overflow:auto"><table><thead><tr><th>Fecha</th><th>Estado</th></tr></thead><tbody>
      ${attendance.length ? attendance.map(a => `<tr><td>${fmtDate(a.class_date)}</td><td><span class="badge ${esc(a.attendance)}">${esc(a.attendance)}</span></td></tr>`).join('') : '<tr><td colspan="2" class="empty">Sin registros</td></tr>'}
    </tbody></table></div>`;
  showModal(`Detalle de ${st.full_name}`, body, async () => closeModal(), { submitText: 'Cerrar' });
}

export async function render(main) {
  const [list, levelList] = await Promise.all([students(true), levels()]);
  const renderTable = (rows) => {
    main.innerHTML = `
      <div class="section-head"><div><h1>Estudiantes</h1><p class="subtitle">${rows.length} registros</p></div>
        <button class="btn primary" id="new-student">+ Nuevo estudiante</button></div>
      <div class="filters">
        <div class="field"><label>Buscar</label><input id="f-search" placeholder="Nombre o teléfono" value="${esc(main.dataset.search || '')}"></div>
        <div class="field"><label>Estado</label><select id="f-status"><option value="">Todos</option><option value="1">Activos</option><option value="0">Inactivos</option></select></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Nombre</th><th>Nivel</th><th>Tipo</th><th>Día / hora</th><th>Clases</th><th>Tareas</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.map(s => `<tr>
          <td><b>${esc(s.full_name)}</b><div class="small muted">${esc(s.phone || '')}</div></td>
          <td>${esc(s.level_name || '—')}</td>
          <td><span class="badge ${esc(s.class_type)}">${s.class_type === 'grupal' ? 'Grupal' : 'Particular'}</span></td>
          <td>${dayLabel(s.usual_day)}${s.usual_time ? ' · ' + esc(s.usual_time) : ''}</td>
          <td>${s.classes_count}</td><td>${s.pending_tasks}</td>
          <td><span class="badge ${s.active ? 'impartida' : 'cancelada'}">${s.active ? 'Activo' : 'Inactivo'}</span></td>
          <td><div class="table-actions">
            <button class="btn sm" data-detail="${s.id}">Detalle</button>
            <button class="btn sm" data-edit="${s.id}">Editar</button>
            <button class="btn sm danger" data-del="${s.id}">Eliminar</button>
          </div></td>
        </tr>`).join('') : '<tr><td colspan="8" class="empty">No hay estudiantes que coincidan.</td></tr>'}</tbody>
      </table></div>`;

    main.querySelector('#new-student').onclick = () => openForm(null, levelList);
    main.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => openDetail(b.dataset.detail));
    main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openForm(list.find(x => String(x.id) === b.dataset.edit), levelList));
    main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if (!confirmDelete('estudiante')) return;
      await del(`students/${b.dataset.del}`);
      invalidate('students');
      toast('Estudiante eliminado');
      render(main);
    });
    const apply = () => {
      const q = main.querySelector('#f-search').value.toLowerCase();
      const status = main.querySelector('#f-status').value;
      main.dataset.search = q;
      const focused = document.activeElement.id;
      renderTable(list.filter(s => (!q || s.full_name.toLowerCase().includes(q) || (s.phone || '').includes(q))
        && (!status || String(s.active) === status)));
      main.querySelector('#f-status').value = status;
      if (focused === 'f-search') main.querySelector('#f-search').focus();
    };
    main.querySelector('#f-search').oninput = apply;
    main.querySelector('#f-status').onchange = apply;
  };
  renderTable(list);
}
