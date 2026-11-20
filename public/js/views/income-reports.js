import { get } from '../api.js';
import { esc, fmtDate, fmtMonth, money, localISO, modalityLabel, downloadFile, toast } from '../utils.js';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const PERIODS = [
  ['day', 'Día'], ['week', 'Semana'], ['month', 'Mes'],
  ['year', 'Año'], ['modality', 'Modalidad'], ['custom', 'Período personalizado']
];

function periodLabel(d) {
  if (d.period === 'day') return fmtDate(d.from || d.today);
  if (d.period === 'week') return `Semana del ${fmtDate(d.from)} al ${fmtDate(d.to)}`;
  if (d.period === 'month') return fmtMonth(d.year, d.month);
  if (d.period === 'year') return String(d.year);
  if (d.period === 'custom') return `${fmtDate(d.from)} al ${fmtDate(d.to)}`;
  return 'Todos los ingresos';
}

function breakdown(rows) {
  const map = new Map();
  rows.forEach(r => {
    const key = r.modality_code;
    const cur = map.get(key) || { name: r.modality_name || modalityLabel(key), amount: 0, classes: 0 };
    cur.amount += Number(r.amount || 0);
    cur.classes += 1;
    map.set(key, cur);
  });
  return [...map.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => b.amount - a.amount);
}

function reportHTML(d) {
  const total = d.summary.filtered_total;
  return `
    <div style="font-family:Inter,system-ui,sans-serif;color:#1b1b19;padding:10px 20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #355c4d;padding-bottom:10px">
        <div><h1 style="margin:0;font-size:22px">Informe de ingresos</h1>
          <div style="color:#71716c;font-size:13px">Piano · Manager</div></div>
        <div style="text-align:right"><div style="font-size:18px;font-weight:600">${esc(periodLabel(d))}</div>
          <div style="color:#71716c;font-size:12px">${d.from && d.to ? `Del ${fmtDate(d.from)} al ${fmtDate(d.to)}` : 'Período completo'}</div></div>
      </div>
      <div style="display:flex;gap:10px;margin:18px 0">
        <div style="flex:1;border:1px solid #355c4d;border-radius:8px;padding:12px;background:#eaf1ed">
          <div style="font-size:11px;color:#355c4d">Total de ingresos</div>
          <div style="font-size:24px;font-weight:650">${money(total)}</div></div>
        <div style="flex:1;border:1px solid #e4e4e0;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#71716c">Clases impartidas</div>
          <div style="font-size:24px;font-weight:650">${d.summary.filtered_classes}</div></div>
        <div style="flex:1;border:1px solid #e4e4e0;border-radius:8px;padding:12px">
          <div style="font-size:11px;color:#71716c">Promedio por clase</div>
          <div style="font-size:24px;font-weight:650">${money(d.summary.filtered_classes ? total / d.summary.filtered_classes : 0)}</div></div>
      </div>
      <h2 style="font-size:14px">Desglose por modalidad</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px">
        <thead><tr style="background:#f6f6f4;text-align:left">
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Modalidad</th>
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Clases</th>
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Ingresos</th>
        </tr></thead>
        <tbody>${breakdown(d.rows).map(m => `<tr>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(m.name)}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${m.classes}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${money(m.amount)}</td>
        </tr>`).join('')}</tbody>
      </table>
      <h2 style="font-size:14px">Detalle</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f6f6f4;text-align:left">
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Fecha</th><th style="padding:8px;border-bottom:1px solid #e4e4e0">Hora</th>
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Estudiantes</th><th style="padding:8px;border-bottom:1px solid #e4e4e0">Modalidad</th>
          <th style="padding:8px;border-bottom:1px solid #e4e4e0">Tarifa</th><th style="padding:8px;border-bottom:1px solid #e4e4e0">Importe</th>
        </tr></thead>
        <tbody>${d.rows.map(r => `<tr>
          <td style="padding:7px;border-bottom:1px solid #eee">${fmtDate(r.class_date)}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(r.class_time)}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(r.student_names || '—')}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${esc(r.modality_name || modalityLabel(r.modality_code))}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${money(r.rate)}</td>
          <td style="padding:7px;border-bottom:1px solid #eee">${money(r.amount)}</td>
        </tr>`).join('')}</tbody>
      </table>
      <p style="margin-top:16px;font-size:11px;color:#71716c">Los importes históricos se conservan aunque las tarifas cambien.</p>
    </div>`;
}

function csv(rows) {
  const head = ['Fecha', 'Hora', 'Estudiantes', 'Modalidad', 'Estado', 'Tarifa', 'Importe'];
  const escCsv = x => `"${String(x ?? '').replace(/^(\s*[=+\-@]|\t|\r)/, "'$1").replace(/"/g, '""')}"`;
  const lines = [head.map(escCsv).join(',')];
  rows.forEach(r => lines.push([r.class_date, r.class_time, r.student_names,
    r.modality_name || modalityLabel(r.modality_code), r.status, r.rate, r.amount].map(escCsv).join(',')));
  return '\uFEFF' + lines.join('\r\n');
}

export async function render(main) {
  const now = new Date();
  const today = localISO(now);
  const f = main.dataset;
  const period = f.period || 'month';
  const anchor = f.anchor || today;
  const year = Number(f.year) || now.getFullYear();
  const month = Number(f.month) || (now.getMonth() + 1);
  const params = new URLSearchParams({ today: period === 'day' || period === 'week' ? anchor : today, period });
  if (period === 'day') params.set('date', anchor);
  if (period === 'month') { params.set('year', year); params.set('month', month); }
  if (period === 'year') params.set('year', year);
  if (period === 'custom') { params.set('from', f.from || today); params.set('to', f.to || today); }
  if (f.modality) params.set('modality', f.modality);
  const d = await get(`income?${params}`);
  let current = d;
  const parts = breakdown(d.rows);
  const max = Math.max(...parts.map(p => p.amount), 1);

  main.innerHTML = `
    <div class="section-head"><div>
      <h1>Reportes de ingresos</h1>
      <p class="subtitle">Día, semana, mes, año, modalidad o período personalizado</p>
    </div><div class="inline no-print">
      <a class="btn" href="#ingresos">Ver resumen</a>
      <button class="btn" id="exp-xlsx">Excel (.xlsx)</button>
      <button class="btn" id="exp-csv">Excel (.csv)</button>
      <button class="btn primary" id="exp-pdf">PDF</button>
    </div></div>

    <div class="filters no-print">
      <div class="field"><label>Período</label><select id="f-period">${PERIODS.map(([k, n]) =>
        `<option value="${k}"${period === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Fecha de referencia</label><input id="f-anchor" type="date" value="${esc(anchor)}"></div>
      <div class="field"><label>Año</label><input id="f-year" type="number" min="2020" max="2100" value="${year}"></div>
      <div class="field"><label>Mes</label><select id="f-month">${MONTHS.map((n, i) =>
        `<option value="${i + 1}"${month === i + 1 ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Desde</label><input id="f-from" type="date" value="${esc(f.from || today)}"></div>
      <div class="field"><label>Hasta</label><input id="f-to" type="date" value="${esc(f.to || today)}"></div>
      <div class="field"><label>Modalidad</label><select id="f-modality"><option value="">Todas</option>
        ${d.modalities.map(m => `<option value="${esc(m.code)}"${f.modality === m.code ? ' selected' : ''}>${esc(m.name || modalityLabel(m.code))}</option>`).join('')}
      </select></div>
    </div>

    <div class="stats">
      <div class="stat accent"><div class="label">Ingresos del período</div><div class="value">${money(d.summary.filtered_total)}</div></div>
      <div class="stat"><div class="label">Clases impartidas</div><div class="value">${d.summary.filtered_classes}</div></div>
      <div class="stat"><div class="label">Promedio por clase</div><div class="value">${money(d.summary.filtered_classes ? d.summary.filtered_total / d.summary.filtered_classes : 0)}</div></div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Desglose por modalidad</h2><span class="muted small">${esc(periodLabel(d))}</span></div>
      <div class="card">${parts.length ? `<div class="bar-chart">${parts.map(p => `
        <div class="bar-row"><div class="bar-label">${esc(p.name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((p.amount / max) * 100)}%"></div></div>
          <div class="bar-value">${money(p.amount)}</div></div>`).join('')}</div>`
        : '<div class="empty">No hay ingresos en este período.</div>'}</div>
    </div>

    <div class="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Hora</th><th>Estudiantes</th><th>Modalidad</th><th>Estado</th><th>Tarifa</th><th>Importe</th></tr></thead>
      <tbody>${d.rows.length ? d.rows.map(r => `<tr>
        <td>${fmtDate(r.class_date)}</td><td>${esc(r.class_time)}</td>
        <td>${esc(r.student_names || '—')}</td>
        <td><span class="badge ${esc(r.modality_code)}">${esc(r.modality_name || modalityLabel(r.modality_code))}</span></td>
        <td><span class="badge ${esc(r.status)}">${esc(r.status)}</span></td>
        <td>${money(r.rate)}</td><td><b>${money(r.amount)}</b></td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">No hay clases con ingresos en este período.</td></tr>'}</tbody>
    </table></div>`;

  const apply = () => {
    main.dataset.period = main.querySelector('#f-period').value;
    main.dataset.anchor = main.querySelector('#f-anchor').value;
    main.dataset.year = main.querySelector('#f-year').value;
    main.dataset.month = main.querySelector('#f-month').value;
    main.dataset.from = main.querySelector('#f-from').value;
    main.dataset.to = main.querySelector('#f-to').value;
    main.dataset.modality = main.querySelector('#f-modality').value;
    render(main);
  };
  ['f-period', 'f-anchor', 'f-year', 'f-month', 'f-from', 'f-to', 'f-modality'].forEach(id => {
    main.querySelector('#' + id).onchange = apply;
  });

  const filename = `ingresos_${period}_${today}`;
  main.querySelector('#exp-xlsx').onclick = () => {
    const rows = current.rows.map(r => ({
      Fecha: r.class_date, Hora: r.class_time, Estudiantes: r.student_names || '',
      Modalidad: r.modality_name || modalityLabel(r.modality_code), Estado: r.status,
      Tarifa: r.rate, Importe: r.amount
    }));
    if (window.XLSX) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Ingresos');
      XLSX.writeFile(wb, `${filename}.xlsx`);
      toast('Reporte Excel descargado');
    } else {
      downloadFile(`${filename}.csv`, csv(current.rows), 'text/csv;charset=utf-8');
      toast('CDN no disponible: se descargó CSV compatible con Excel');
    }
  };
  main.querySelector('#exp-csv').onclick = () => {
    downloadFile(`${filename}.csv`, csv(current.rows), 'text/csv;charset=utf-8');
    toast('CSV descargado');
  };
  main.querySelector('#exp-pdf').onclick = () => {
    document.querySelector('#print-area').innerHTML = reportHTML(current);
    window.print();
  };
}
