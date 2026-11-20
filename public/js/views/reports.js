import { get } from '../api.js';
import { esc, fmtDate, fmtMonth, pad, toast, downloadFile, MODALITIES, modalityLabel } from '../utils.js';

function reportHTML(d) {
  const s = d.summary;
  return `
    <div style="font-family:Inter,system-ui,sans-serif;color:#1b1b19;padding:10px 20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #355c4d;padding-bottom:10px">
        <div><h1 style="margin:0;font-size:22px">Informe mensual de clases</h1>
          <div style="color:#71716c;font-size:13px">Piano · Manager</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:600">${fmtMonth(d.year, d.month)}</div>
          <div style="color:#71716c;font-size:12px">Del ${fmtDate(d.from)} al ${fmtDate(d.to)}</div></div>
      </div>
      <div style="display:flex;gap:10px;margin:18px 0">
        <div style="flex:1;border:1px solid #e4e4e0;border-radius:8px;padding:12px"><div style="font-size:11px;color:#71716c">Particulares</div><div style="font-size:24px;font-weight:650">${s.particular}</div></div>
        <div style="flex:1;border:1px solid #e4e4e0;border-radius:8px;padding:12px"><div style="font-size:11px;color:#71716c">Grupales</div><div style="font-size:24px;font-weight:650">${s.grupal}</div></div>
        <div style="flex:1;border:1px solid #355c4d;border-radius:8px;padding:12px;background:#eaf1ed"><div style="font-size:11px;color:#355c4d">Total de clases</div><div style="font-size:24px;font-weight:650">${s.total}</div></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f6f6f4;text-align:left">
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Fecha</th><th style="padding:8px;border-bottom:1px solid #e4e4e0">Hora</th>
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Modalidad</th><th style="padding:8px;border-bottom:1px solid #e4e4e0">Estudiantes</th>
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Tema</th><th style="padding:8px;border-bottom:1px solid #e4e4e0">Estado</th>
        </tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td style="padding:7px;border-bottom:1px solid #eee">${fmtDate(r.class_date)}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(r.class_time)}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(modalityLabel(r.class_type))}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(r.student_names || '—')}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(r.topic_name || '—')}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(r.status)}</td>
        </tr>`).join('')}</tbody>
      </table>
      <p style="margin-top:16px;font-size:11px;color:#71716c">Solo se contabilizan clases impartidas. Las clases grupales cuentan como una sola clase.</p>
    </div>`;
}

function csv(rows) {
  const head = ['Fecha', 'Hora', 'Modalidad', 'Estudiantes', 'Tema', 'Contenido', 'Estado'];
  const escCsv = x => `"${String(x ?? '').replace(/^(\s*[=+\-@]|\t|\r)/, "'$1").replace(/"/g, '""')}"`;
  const lines = [head.map(escCsv).join(',')];
  rows.forEach(r => lines.push([r.class_date, r.class_time, modalityLabel(r.class_type),
    r.student_names, r.topic_name, r.content, r.status].map(escCsv).join(',')));
  return '\uFEFF' + lines.join('\r\n');
}

export async function render(main) {
  const now = new Date();
  const y = Number(main.dataset.year) || now.getFullYear();
  const m = Number(main.dataset.month) || now.getMonth() + 1;
  const type = main.dataset.type || '';
  const url = `reports/monthly?year=${y}&month=${m}${type ? `&type=${type}` : ''}`;
  const d = await get(url);
  let current = d;

  main.innerHTML = `
    <div class="section-head"><div><h1>Reportes mensuales</h1><p class="subtitle">Informe listo para pago</p></div>
      <div class="inline no-print">
        <button class="btn" id="exp-xlsx">Excel (.xlsx)</button>
        <button class="btn" id="exp-csv">Excel (.csv)</button>
        <button class="btn primary" id="exp-pdf">PDF</button>
      </div></div>
    <div class="filters no-print">
      <div class="field"><label>Año</label><input id="f-year" type="number" min="2020" max="2100" value="${y}"></div>
      <div class="field"><label>Mes</label><select id="f-month">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${m === i + 1 ? ' selected' : ''}>${fmtMonth(y, i + 1)}</option>`).join('')}</select></div>
      <div class="field"><label>Modalidad</label><select id="f-type"><option value="">Todas</option>${MODALITIES.map(m => `<option value="${m.code}"${type === m.code ? ' selected' : ''}>${m.name}</option>`).join('')}</select></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="label">Particulares</div><div class="value">${d.summary.particular || 0}</div></div>
      <div class="stat"><div class="label">Grupales</div><div class="value">${d.summary.grupal || 0}</div></div>
      <div class="stat"><div class="label">A domicilio</div><div class="value">${d.summary.domicilio || 0}</div></div>
      <div class="stat"><div class="label">Online</div><div class="value">${d.summary.online || 0}</div></div>
      <div class="stat accent"><div class="label">Total impartidas</div><div class="value">${d.summary.total}</div></div>
      <div class="stat"><div class="label">Asistencias registradas</div><div class="value">${d.summary.attendances}</div></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Modalidad</th><th>Estudiantes</th><th>Tema</th><th>Estado</th></tr></thead>
      <tbody>${d.rows.length ? d.rows.map(r => `<tr>
        <td>${fmtDate(r.class_date)}</td><td>${esc(r.class_time)}</td>
        <td><span class="badge ${esc(r.class_type)}">${esc(modalityLabel(r.class_type))}</span></td>
        <td>${esc(r.student_names || '—')}</td><td>${esc(r.topic_name || '—')}</td>
        <td><span class="badge ${esc(r.status)}">${esc(r.status)}</span></td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty">No hay clases impartidas en este período.</td></tr>'}</tbody>
    </table></div>`;

  const apply = () => {
    main.dataset.year = main.querySelector('#f-year').value;
    main.dataset.month = main.querySelector('#f-month').value;
    main.dataset.type = main.querySelector('#f-type').value;
    render(main);
  };
  ['f-year', 'f-month', 'f-type'].forEach(id => main.querySelector('#' + id).onchange = apply);

  main.querySelector('#exp-xlsx').onclick = () => {
    const rows = current.rows.map(r => ({
      Fecha: r.class_date, Hora: r.class_time, Modalidad: modalityLabel(r.class_type),
      Estudiantes: r.student_names || '', Tema: r.topic_name || '',
      Contenido: r.content || '', Estado: r.status
    }));
    if (window.XLSX) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
      XLSX.writeFile(wb, `reporte_clases_${current.year}_${pad(current.month)}.xlsx`);
      toast('Reporte Excel descargado');
    } else {
      downloadFile(`reporte_clases_${current.year}_${pad(current.month)}.csv`, csv(current.rows), 'text/csv;charset=utf-8');
      toast('CDN no disponible: se descargó CSV compatible con Excel');
    }
  };
  main.querySelector('#exp-csv').onclick = () => {
    downloadFile(`reporte_clases_${current.year}_${pad(current.month)}.csv`, csv(current.rows), 'text/csv;charset=utf-8');
    toast('CSV descargado');
  };
  main.querySelector('#exp-pdf').onclick = () => {
    document.querySelector('#print-area').innerHTML = reportHTML(current);
    window.print();
  };
}
