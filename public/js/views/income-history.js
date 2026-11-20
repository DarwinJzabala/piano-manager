import { get } from '../api.js';
import { esc, fmtDate, money, localISO, modalityLabel } from '../utils.js';

export async function render(main) {
  const [students, base] = await Promise.all([get('students'), get(`income?today=${localISO()}`)]);
  const f = main.dataset;
  const params = new URLSearchParams({ today: localISO() });
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  if (!f.from && !f.to && (f.month || f.year)) {
    params.set('period', 'month');
    params.set('year', f.year || new Date().getFullYear());
    params.set('month', f.month || (new Date().getMonth() + 1));
  }
  if (f.modality) params.set('modality', f.modality);
  if (f.studentId) params.set('student_id', f.studentId);
  const d = Object.keys(f).filter(k => ['from', 'to', 'month', 'year', 'modality', 'studentId'].includes(k)).length
    ? await get(`income?${params}`) : base;
  const s = d.summary;
  const modalityOpts = base.modalities.map(m =>
    `<option value="${esc(m.code)}"${f.modality === m.code ? ' selected' : ''}>${esc(m.name || modalityLabel(m.code))}</option>`).join('');
  const studentOpts = students.map(st =>
    `<option value="${st.id}"${String(f.studentId) === String(st.id) ? ' selected' : ''}>${esc(st.full_name)}</option>`).join('');

  main.innerHTML = `
    <div class="section-head"><div>
      <h1>Historial de ingresos</h1>
      <p class="subtitle">Cada fila corresponde a una clase impartida y su ingreso calculado</p>
    </div><div class="inline no-print">
      <a class="btn" href="#ingresos">Ver resumen</a>
      <a class="btn primary" href="#ingresos-reportes">Generar reporte</a>
    </div></div>

    <div class="filters no-print">
      <div class="field"><label>Desde</label><input id="f-from" type="date" value="${esc(f.from || '')}"></div>
      <div class="field"><label>Hasta</label><input id="f-to" type="date" value="${esc(f.to || '')}"></div>
      <div class="field"><label>Mes</label><select id="f-month"><option value="">Todos</option>
        ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${String(f.month) === String(i + 1) ? ' selected' : ''}>${['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][i]}</option>`).join('')}
      </select></div>
      <div class="field"><label>Año</label><input id="f-year" type="number" min="2020" max="2100" value="${esc(f.year || '')}"></div>
      <div class="field"><label>Modalidad</label><select id="f-modality"><option value="">Todas</option>${modalityOpts}</select></div>
      <div class="field"><label>Estudiante o grupo</label><select id="f-student"><option value="">Todos</option>${studentOpts}</select></div>
      <button class="btn" id="f-clear">Limpiar</button>
    </div>

    <div class="stats">
      <div class="stat accent"><div class="label">Ingresos filtrados</div><div class="value">${money(s.filtered_total)}</div></div>
      <div class="stat"><div class="label">Clases filtradas</div><div class="value">${s.filtered_classes}</div></div>
      <div class="stat"><div class="label">Acumulado general</div><div class="value">${money(s.total)}</div></div>
    </div>

    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Estudiante o grupo</th><th>Modalidad</th><th>Estado</th><th>Tarifa</th><th>Importe</th></tr></thead>
      <tbody>${d.rows.length ? d.rows.map(r => `<tr>
        <td>${fmtDate(r.class_date)}</td><td>${esc(r.class_time)}</td>
        <td>${esc(r.student_names || '—')}</td>
        <td><span class="badge ${esc(r.modality_code)}">${esc(r.modality_name || modalityLabel(r.modality_code))}</span></td>
        <td><span class="badge ${esc(r.status)}">${esc(r.status)}</span></td>
        <td>${money(r.rate)}</td><td><b>${money(r.amount)}</b></td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">No hay ingresos en este período.</td></tr>'}</tbody>
    </table></div>`;

  const apply = () => {
    main.dataset.from = main.querySelector('#f-from').value;
    main.dataset.to = main.querySelector('#f-to').value;
    main.dataset.month = main.querySelector('#f-month').value;
    main.dataset.year = main.querySelector('#f-year').value;
    main.dataset.modality = main.querySelector('#f-modality').value;
    main.dataset.studentId = main.querySelector('#f-student').value;
    render(main);
  };
  ['f-from', 'f-to', 'f-month', 'f-year', 'f-modality', 'f-student'].forEach(id => {
    main.querySelector('#' + id).onchange = apply;
  });
  main.querySelector('#f-clear').onclick = () => {
    ['from', 'to', 'month', 'year', 'modality', 'studentId'].forEach(k => delete main.dataset[k]);
    render(main);
  };
}
