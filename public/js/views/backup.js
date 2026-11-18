import { get, post } from '../api.js';
import { esc, toast, downloadFile } from '../utils.js';

export async function render(main) {
  main.innerHTML = `
    <h1>Respaldo e importación</h1>
    <p class="subtitle">Toda tu información permanece en Cloudflare D1, incluso al cerrar el navegador.</p>
    <div class="grid-2">
      <div class="card">
        <h2>Exportar respaldo completo</h2>
        <p class="muted small">Descarga todas las tablas académicas en un archivo JSON. Guárdalo en un lugar seguro.</p>
        <button class="btn primary" id="export-all">Descargar respaldo JSON</button>
      </div>
      <div class="card">
        <h2>Importar estudiantes</h2>
        <p class="muted small">Selecciona un JSON con un array de estudiantes (o un respaldo completo). Los duplicados se ignoran.</p>
        <input type="file" id="import-file" accept="application/json,.json">
        <button class="btn" id="import-btn" style="margin-top:10px">Importar</button>
      </div>
    </div>
    <div class="section" style="margin-top:20px">
      <h2>Estado de la base de datos</h2>
      <div class="table-wrap"><table id="backup-status"><tbody><tr><td class="empty">Cargando…</td></tr></tbody></table></div>
    </div>`;

  main.querySelector('#export-all').onclick = async () => {
    const data = await get('backup');
    downloadFile(`piano_manager_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
    toast('Respaldo descargado');
  };

  let parsed = null;
  main.querySelector('#import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      parsed = Array.isArray(json) ? json : (json.data?.students || json.students || []);
      toast(`${parsed.length} estudiantes listos para importar`);
    } catch (err) {
      toast('El archivo no es un JSON válido', 'error');
      parsed = null;
    }
  };
  main.querySelector('#import-btn').onclick = async () => {
    if (!parsed || !parsed.length) return toast('Selecciona primero un JSON válido', 'error');
    if (!confirm(`¿Importar ${parsed.length} estudiantes? Los duplicados se ignorarán.`)) return;
    const r = await post('backup', { students: parsed });
    toast(`Importación completada: ${r.processed} estudiantes nuevos`);
    await render(main);
  };

  try {
    const data = await get('backup');
    const tbody = main.querySelector('#backup-status tbody');
    tbody.innerHTML = Object.entries(data.data).map(([table, rows]) => `<tr>
      <td>${esc(table)}</td><td>${rows.length} registros</td></tr>`).join('');
  } catch (e) {
    main.querySelector('#backup-status tbody').innerHTML = `<tr><td class="empty">${esc(e.message)}</td></tr>`;
  }
}
