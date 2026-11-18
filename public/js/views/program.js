import { post, put, del } from '../api.js';
import { levels, program, invalidate } from '../store.js';
import { esc, v, showModal, closeModal, toast, confirmDelete, selectOptions } from '../utils.js';

async function levelForm(level) {
  const edit = !!level?.id;
  showModal(edit ? 'Editar nivel' : 'Nuevo nivel', `
    <div class="field"><label>Nombre *</label><input name="name" required value="${esc(level?.name || '')}"></div>
    <div class="field"><label>Descripción</label><textarea name="description">${esc(level?.description || '')}</textarea></div>
    <div class="field"><label>Orden</label><input name="sort_order" type="number" value="${esc(level?.sort_order || 0)}"></div>`, async fd => {
    const payload = { name: v(fd, 'name'), description: v(fd, 'description') || null, sort_order: Number(v(fd, 'sort_order')) || 0 };
    if (edit) await put(`levels/${level.id}`, payload); else await post('levels', payload);
    invalidate('levels'); closeModal(); toast(edit ? 'Nivel actualizado' : 'Nivel creado');
    document.querySelector('#main').dispatchEvent(new Event('refresh'));
  });
}

async function topicForm(item, levelList, selectedLevel) {
  const edit = !!item?.id;
  showModal(edit ? 'Editar tema' : 'Nuevo tema del programa', `
    <div class="row">
      <div class="field"><label>Nivel *</label><select name="level_id" required>${selectOptions(levelList.map(l => ({ id: l.id, name: l.name })), item?.level_id || selectedLevel)}</select></div>
      <div class="field"><label>Unidad *</label><input name="unit" required value="${esc(item?.unit || '')}" placeholder="Ej. Unidad 1"></div>
    </div>
    <div class="field"><label>Tema *</label><input name="topic" required value="${esc(item?.topic || '')}" placeholder="Ej. Escalas mayores"></div>
    <div class="field"><label>Contenido a enseñar</label><textarea name="content">${esc(item?.content || '')}</textarea></div>
    <div class="row">
      <div class="field"><label>Objetivos</label><textarea name="objectives">${esc(item?.objectives || '')}</textarea></div>
      <div class="field"><label>Ejercicios prácticos</label><textarea name="exercises">${esc(item?.exercises || '')}</textarea></div>
    </div>
    <div class="row">
      <div class="field"><label>Piezas musicales</label><textarea name="pieces">${esc(item?.pieces || '')}</textarea></div>
      <div class="field"><label>Observaciones</label><textarea name="notes">${esc(item?.notes || '')}</textarea></div>
    </div>
    <div class="field"><label>Orden</label><input name="sort_order" type="number" value="${esc(item?.sort_order || 0)}"></div>`, async fd => {
    const payload = {
      level_id: v(fd, 'level_id'), unit: v(fd, 'unit'), topic: v(fd, 'topic'),
      content: v(fd, 'content') || null, objectives: v(fd, 'objectives') || null,
      exercises: v(fd, 'exercises') || null, pieces: v(fd, 'pieces') || null,
      notes: v(fd, 'notes') || null, sort_order: Number(v(fd, 'sort_order')) || 0
    };
    if (edit) await put(`program/${item.id}`, payload); else await post('program', payload);
    invalidate('program'); closeModal(); toast(edit ? 'Tema actualizado' : 'Tema agregado');
    document.querySelector('#main').dispatchEvent(new Event('refresh'));
  });
}

function detailModal(item) {
  showModal(`${item.unit} · ${item.topic}`, `
    <p><b>Nivel:</b> ${esc(item.level_name)}</p>
    <p><b>Contenido:</b><br>${esc(item.content || '—')}</p>
    <p><b>Objetivos:</b><br>${esc(item.objectives || '—')}</p>
    <p><b>Ejercicios:</b><br>${esc(item.exercises || '—')}</p>
    <p><b>Piezas:</b><br>${esc(item.pieces || '—')}</p>
    <p><b>Observaciones:</b><br>${esc(item.notes || '—')}</p>`, async () => closeModal(), { submitText: 'Cerrar' });
}

export async function render(main) {
  const [levelList, allItems] = await Promise.all([levels(true), program(true)]);
  let selected = levelList.some(l => String(l.id) === main.dataset.level) ? main.dataset.level : String(levelList[0]?.id || '');
  main.dataset.level = selected;
  const rows = allItems.filter(i => String(i.level_id) === selected);

  main.innerHTML = `
    <div class="section-head"><div><h1>Programa académico</h1><p class="subtitle">Organiza niveles, unidades y temas</p></div>
      <div class="inline"><button class="btn" id="new-level">+ Nivel</button><button class="btn primary" id="new-topic">+ Tema</button></div></div>

    <div class="card" style="margin-bottom:18px">
      <h3>Niveles</h3>
      <div class="inline">${levelList.length ? levelList.map(l => `
        <span class="inline" style="border:1px solid var(--border);border-radius:8px;padding:4px 6px">
          <button class="btn sm ${String(l.id) === selected ? 'primary' : ''}" data-level="${l.id}">${esc(l.name)}</button>
          <button class="icon-btn" data-edit-level="${l.id}" title="Editar">✎</button>
          <button class="icon-btn" data-del-level="${l.id}" title="Eliminar">×</button>
        </span>`).join('') : '<span class="muted">Aún no hay niveles.</span>'}</div>
    </div>

    <div class="table-wrap"><table>
      <thead><tr><th>Unidad</th><th>Tema</th><th>Contenido</th><th>Objetivos</th><th>Piezas</th><th></th></tr></thead>
      <tbody>${rows.length ? rows.map(i => `<tr>
        <td>${esc(i.unit)}</td><td><b>${esc(i.topic)}</b></td>
        <td class="small">${esc((i.content || '—').slice(0, 90))}</td>
        <td class="small">${esc((i.objectives || '—').slice(0, 70))}</td>
        <td class="small">${esc((i.pieces || '—').slice(0, 50))}</td>
        <td><div class="table-actions">
          <button class="btn sm" data-view="${i.id}">Ver</button>
          <button class="btn sm" data-edit="${i.id}">Editar</button>
          <button class="btn sm danger" data-del="${i.id}">Eliminar</button>
        </div></td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty">No hay temas para este nivel.</td></tr>'}</tbody>
    </table></div>`;

  main.querySelector('#new-level').onclick = () => levelForm(null);
  main.querySelector('#new-topic').onclick = () => topicForm(null, levelList, selected);
  main.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { main.dataset.level = b.dataset.level; render(main); });
  main.querySelectorAll('[data-edit-level]').forEach(b => b.onclick = () => levelForm(levelList.find(l => String(l.id) === b.dataset.editLevel)));
  main.querySelectorAll('[data-del-level]').forEach(b => b.onclick = async () => {
    if (!confirmDelete('nivel')) return;
    await del(`levels/${b.dataset.delLevel}`); invalidate('levels', 'program'); toast('Nivel eliminado'); render(main);
  });
  main.querySelectorAll('[data-view]').forEach(b => b.onclick = () => detailModal(rows.find(i => String(i.id) === b.dataset.view)));
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => topicForm(rows.find(i => String(i.id) === b.dataset.edit), levelList, selected));
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirmDelete('tema')) return;
    await del(`program/${b.dataset.del}`); invalidate('program'); toast('Tema eliminado'); render(main);
  });
}
