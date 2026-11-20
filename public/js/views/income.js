import { get } from '../api.js';
import { esc, fmtDate, money, localISO, modalityLabel } from '../utils.js';

const COLORS = {
  particular: '#355c4d',
  grupal: '#5a4f86',
  domicilio: '#435f78',
  online: '#9a7b3f'
};

export async function render(main) {
  const today = localISO();
  const d = await get(`income?today=${today}`);
  const s = d.summary;
  const max = Math.max(...s.by_modality.map(m => Number(m.amount || 0)), 1);
  const missing = d.modalities.filter(m => m.price === null || m.price === undefined || m.price === '');

  main.innerHTML = `
    <div class="section-head"><div>
      <h1>Ingresos</h1>
      <p class="subtitle">Calculados automáticamente al marcar clases como impartidas</p>
    </div><div class="inline no-print">
      <a class="btn" href="#ingresos-historial">Ver historial</a>
      <a class="btn primary" href="#ingresos-reportes">Generar reporte</a>
    </div></div>

    ${missing.length ? `<div class="notice no-print">
      <b>Modalidades sin tarifa:</b> ${missing.map(m => esc(m.name)).join(', ')}.
      No se contabilizarán hasta configurar su precio en
      <a href="#tarifas"><b>Configuración de tarifas</b></a>.
    </div>` : ''}

    <div class="stats">
      <div class="stat accent"><div class="label">Total generado</div><div class="value">${money(s.total)}</div></div>
      <div class="stat"><div class="label">Hoy</div><div class="value">${money(s.day)}</div></div>
      <div class="stat"><div class="label">Esta semana</div><div class="value">${money(s.week)}</div></div>
      <div class="stat"><div class="label">Este mes</div><div class="value">${money(s.month)}</div></div>
      <div class="stat"><div class="label">Este año</div><div class="value">${money(s.year)}</div></div>
      <div class="stat"><div class="label">Clases impartidas</div><div class="value">${s.classes}</div></div>
      <div class="stat"><div class="label">Promedio por clase</div><div class="value">${money(s.average)}</div></div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Ingresos por modalidad</h2><a class="btn sm no-print" href="#tarifas">Configurar tarifas</a></div>
      <div class="card">
        <div class="bar-chart">
          ${s.by_modality.map(m => {
            const pct = Math.round((Number(m.amount || 0) / max) * 100);
            return `<div class="bar-row">
              <div class="bar-label">${esc(m.name || modalityLabel(m.code))}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${COLORS[m.code] || '#355c4d'}"></div></div>
              <div class="bar-value">${money(m.amount)}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="table-wrap" style="margin-top:16px"><table>
          <thead><tr><th>Modalidad</th><th>Clases</th><th>Ingresos</th><th>Participación</th></tr></thead>
          <tbody>${s.by_modality.map(m => `<tr>
            <td><span class="badge ${esc(m.code)}">${esc(m.name || modalityLabel(m.code))}</span></td>
            <td>${m.classes}</td><td>${money(m.amount)}</td>
            <td>${s.total ? Math.round((Number(m.amount || 0) / Number(s.total)) * 100) : 0}%</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
    </div>

    <p class="muted small">Fecha de referencia: ${fmtDate(today)}. Solo se contabilizan clases impartidas; cada clase se registra una sola vez.</p>`;
}
