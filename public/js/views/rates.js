import { get, put } from '../api.js';
import { esc, toast } from '../utils.js';

export async function render(main) {
  const rows = await get('modalities');
  const missing = rows.filter(m => m.price === null || m.price === undefined || m.price === '');

  main.innerHTML = `
    <div class="section-head"><div>
      <h1>Configuración de tarifas</h1>
      <p class="subtitle">Precios por modalidad · los cambios no afectan ingresos ya registrados</p>
    </div><a class="btn" href="#ingresos">Ver ingresos</a></div>

    ${missing.length ? `<div class="notice">
      <b>Modalidades sin tarifa:</b> ${missing.map(m => esc(m.name)).join(', ')}.
      Una clase de estas modalidades se registrará normalmente, pero <b>no generará ingreso</b> hasta que configures su precio.
    </div>` : ''}

    <div class="section">
      <div class="section-head"><h2>Modalidades</h2><span class="muted small">Las tarifas se aplican a clases nuevas o corregidas</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Modalidad</th><th>Nombre</th><th>Tarifa por clase</th><th>Activa</th><th>Actualizada</th><th></th></tr></thead>
        <tbody>${rows.map(m => `<tr>
          <td><span class="badge ${esc(m.code)}">${esc(m.code)}</span></td>
          <td><input id="name-${esc(m.code)}" value="${esc(m.name)}" aria-label="Nombre de ${esc(m.name)}"></td>
          <td><input id="rate-${esc(m.code)}" type="number" min="0" step="0.01"
            value="${m.price === null || m.price === undefined ? '' : esc(m.price)}"
            placeholder="Sin tarifa" aria-label="Tarifa de ${esc(m.name)}"></td>
          <td><input id="active-${esc(m.code)}" type="checkbox" ${Number(m.active) ? 'checked' : ''}
            style="width:auto" aria-label="Activar ${esc(m.name)}"></td>
          <td class="muted small">${m.updated_at ? esc(m.updated_at).slice(0, 16).replace('T', ' ') : '—'}</td>
          <td><button class="btn sm primary" id="save-${esc(m.code)}" data-code="${esc(m.code)}">Guardar</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>Reglas de cálculo</h3>
      <ul class="muted small">
        <li>Solo las clases marcadas como <b>impartidas</b> generan ingresos.</li>
        <li>Cada clase se contabiliza una sola vez; al cambiar su estado se ajusta el acumulado.</li>
        <li>El importe queda congelado al impartir la clase: cambiar una tarifa no modifica ingresos anteriores.</li>
        <li>Si una modalidad no tiene tarifa, el sistema avisa y no registra un monto incorrecto.</li>
      </ul>
    </div>`;

  main.querySelectorAll('[data-code]').forEach(btn => {
    btn.onclick = async () => {
      const code = btn.dataset.code;
      const raw = main.querySelector(`#rate-${code}`).value.trim();
      const payload = {
        name: main.querySelector(`#name-${code}`).value,
        price: raw === '' ? null : Number(raw),
        active: main.querySelector(`#active-${code}`).checked
      };
      btn.disabled = true;
      try {
        await put(`modalities/${code}`, payload);
        toast('Tarifa guardada');
        render(main);
      } catch (e) {
        toast(e.message || 'No se pudo guardar la tarifa', 'error');
        btn.disabled = false;
      }
    };
  });
}
