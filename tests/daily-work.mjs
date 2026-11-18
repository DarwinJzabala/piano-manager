// Run against a fresh local Pages + D1 instance only. Never uses a remote URL.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
for (const env of [{}, {LOCAL_DEV:'1'}, {ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ACCESS_AUD:'test'}]) {
  const request = new Request('https://example.pages.dev/api/backup',{headers:{'Cf-Access-Authenticated-User-Email':'irrelevante@example.com'}});
  assert.equal((await onRequest({env,request})).status,403);
}
const base = `http://127.0.0.1:${Number(process.env.PIANO_TEST_PORT)}`;
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
try {
  let page = await browser.newPage();
  const setup = async () => {
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(8000);
    await page.goto(base);
    await page.getByRole('heading',{name:'Panel',exact:true}).waitFor();
  };
  await setup();
  const nav = name => page.locator(`[data-nav="${name}"]`).click();
  let dialog = page.locator('dialog');
  const field = name => dialog.locator(`[name="${name}"]`);
  const save = async () => {
    await dialog.locator('[type=submit]').click();
    await dialog.waitFor({state:'hidden'});
  };
  const api = async path => {
    const r = await page.request.get(`${base}/api/${path}`);
    assert(r.ok(),`${path}: ${r.status()}`); return r.json();
  };
  assert.equal((await api('students')).length,0,'Se requiere una D1 local de prueba vacía');
  await nav('programa');
  await page.locator('#new-level').click(); await field('name').fill('Nivel de prueba'); await save();
  await page.locator('#new-topic').click(); await field('unit').fill('Unidad A'); await field('topic').fill('Lectura'); await save();
  await nav('estudiantes');
  for (const name of ['Prueba A','Prueba B']) {
    await page.locator('#new-student').click(); await field('full_name').fill(name); await save();
    await page.locator('tbody').getByText(name,{exact:true}).waitFor();
  }
  const [a,b] = await api('students');
  await nav('clases');
  await page.locator('#new-class').click();
  await field('class_date').fill('2026-11-02'); await field('class_time').fill('10:00');
  await dialog.locator(`[data-student="${a.id}"]`).check();
  await field('task_description').fill('Preparar lectura'); await save();
  await nav('planificacion');
  await page.locator('#day-new').click();
  await field('student_ids').nth(0).check(); await field('student_ids').nth(1).check();
  await field('class_type').selectOption('grupal'); await field('time').fill('12:00');
  await field('specific_date').fill('2026-11-04'); await save();
  const [s] = await api('schedules?from=2026-11-04&to=2026-11-04');
  assert.equal(s.tasks[0].description,'Preparar lectura');
  await nav('clases'); await page.locator('#new-class').click();
  await field('class_date').fill('2026-11-04'); await field('class_time').fill('12:00');
  await field('class_type').selectOption('grupal');
  for (const id of [a.id,b.id]) await dialog.locator(`[data-student="${id}"]`).check();
  await dialog.locator('#prior-tasks').getByText(/Preparar lectura/).waitFor();
  await field(`att_${b.id}`).selectOption('ausente'); await save();
  assert.equal((await api(`attendance?student_id=${b.id}`))[0].attendance,'ausente');
  await nav('tareas'); await page.locator('[data-review]').click();
  await field('status').selectOption('revisada'); await save();
  const [task] = await api('tasks');
  assert.equal(task.status,'revisada'); assert.equal(task.description,'Preparar lectura');
  await nav('reportes'); await page.locator('#f-year').fill('2026'); await page.locator('#f-month').selectOption('11');
  assert.deepEqual((await api('reports/monthly?year=2026&month=11')).summary,{particular:1,grupal:1,total:2,attendances:3});
  const download = page.waitForEvent('download'); await page.locator('#exp-csv').click();
  assert.match((await download).suggestedFilename(),/\.csv$/);
  await nav('historial'); await page.locator('[data-tab="asistencia"]').click();
  await page.locator('tbody').getByText('ausente').waitFor();
  await nav('respaldo'); await page.locator('#backup-status').getByText('class_students').waitFor();
  assert.equal(Object.keys((await api('backup')).data).length,8);
  const importFile = {name:'students.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([a,b]))};
  await page.locator('#import-file').setInputFiles(importFile);
  await page.getByText('2 estudiantes listos para importar').waitFor();
  page.once('dialog', d=>d.accept()); await page.locator('#import-btn').click();
  await page.getByText('Importación completada: 0 estudiantes nuevos').waitFor();
  const known = (await api('classes')).length;
  const invalid = await page.request.post(`${base}/api/classes`,{data:{class_type:'particular',class_date:'2026-11-07',class_time:'12:00',student_ids:[999999]}});
  assert(!invalid.ok()); assert.equal((await api('classes')).length,known,'Una FK inválida debe revertir la clase completa');
  // Close the entire browser context, then open a fresh one without session storage.
  await page.close(); page = await browser.newPage(); dialog = page.locator('dialog'); await setup();
  assert.equal((await api('classes?from=2026-11-01&to=2026-11-30')).length,2);
  await nav('estudiantes'); await page.locator('[data-edit]').first().click();
  await field('active').uncheck(); await save(); assert.equal((await api('students')).find(x=>x.id===a.id).active,0);
  await nav('tareas'); await page.locator('#f-status').selectOption('revisada');
  page.once('dialog', d=>d.accept()); await page.locator('[data-del]').click();
  await page.locator('[data-del]').waitFor({state:'hidden'}); assert.equal((await api('tasks')).length,0);
  assert.deepEqual(errors,[]);
  console.log('OK: diez módulos, CRUD, listas, revisión, reporte y persistencia en otro contexto.');
} finally { await browser.close(); }
