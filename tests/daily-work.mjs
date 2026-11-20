// Run against a fresh local Pages + D1 instance only. Never uses a remote URL.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/[[path]].js';
import { makeCookie, hashPassword, verifyPassword } from '../lib/auth.js';

// Las cookies y el hash se comprueban también fuera del navegador.
const httpsCookie = makeCookie('pm_session', `r.${'a'.repeat(64)}`, {
  maxAge: 60, request: new Request('https://example.pages.dev/')
});
assert.match(httpsCookie, /HttpOnly/);
assert.match(httpsCookie, /Secure/);
assert.match(httpsCookie, /SameSite=Lax/);
const testHash = await hashPassword('Prueba1234!', { AUTH_PBKDF2_ITERATIONS: 10000 });
assert.match(testHash, /^pbkdf2\$10000\$/);
assert(!testHash.includes('Prueba1234!'), 'El hash no debe contener la contraseña');
assert(await verifyPassword('Prueba1234!', testHash, {}));
assert(!(await verifyPassword('otra', testHash, {})));

for (const env of [{}, {LOCAL_DEV:'1'}, {ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ACCESS_AUD:'test'}]) {
  const request = new Request('https://example.pages.dev/api/backup',{headers:{'Cf-Access-Authenticated-User-Email':'irrelevante@example.com'}});
  assert.equal((await onRequest({env,request})).status,403);
}
const base = `http://127.0.0.1:${Number(process.env.PIANO_TEST_PORT)}`;
const ADMIN = { email: 'admin@prueba.local', password: 'Prueba1234!', name: 'Admin' };
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
try {
  let context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await context.newPage();
  const boot = await page.request.post(`${base}/api/auth/bootstrap`, { data: ADMIN });
  assert(boot.ok(), `No se pudo crear el administrador de prueba: ${await boot.text()}`);

  const login = async (keep = false, remember = true) => {
    await page.goto(base);
    if (await page.locator('#login-form').count()) {
      await page.locator('#login-user').fill(ADMIN.email);
      await page.locator('#login-pass').fill(ADMIN.password);
      if (remember) await page.locator('[name="remember_user"]').check();
      else await page.locator('[name="remember_user"]').uncheck();
      if (keep) await page.locator('[name="keep_signed_in"]').check();
      await page.locator('#login-form button[type="submit"]').click();
    }
    await page.getByRole('heading',{name:'Panel',exact:true}).waitFor();
  };
  const setup = async () => {
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(8000);
    await login();
  };
  await setup();

  // --- Autenticación ---
  const anonymous = await fetch(`${base}/api/students`);
  assert.equal(anonymous.status, 401, 'La API debe rechazar peticiones sin sesión');
  const bad = await page.request.post(`${base}/api/auth/login`, { data: { username: 'nadie@prueba.local', password: 'incorrecta' } });
  assert.equal(bad.status(), 401);
  for (let i = 0; i < 5; i++)
    await page.request.post(`${base}/api/auth/login`, { data: { username: 'bloqueado@prueba.local', password: 'incorrecta' } });
  const locked = await page.request.post(`${base}/api/auth/login`, { data: { username: 'bloqueado@prueba.local', password: 'incorrecta' } });
  assert.equal(locked.status(), 429, 'Debe bloquear intentos excesivos');
  assert.equal((await page.request.get(`${base}/api/auth/me`)).ok(), true);
  const me = await (await page.request.get(`${base}/api/auth/me`)).json();
  assert.equal(me.user.role, 'owner');

  // Cookies: la sesión y el usuario recordado nunca son legibles por JavaScript.
  const cookies = await context.cookies(base);
  const sessionCookie = cookies.find(c => c.name === 'pm_session');
  const rememberCookie = cookies.find(c => c.name === 'pm_remember');
  assert(sessionCookie?.httpOnly && rememberCookie?.httpOnly, 'Las cookies de auth deben ser HttpOnly');
  assert.equal(sessionCookie.sameSite, 'Lax');
  assert.equal(sessionCookie.expires, -1, 'La sesión de navegador no debe ser persistente');

  // Recordar usuario: otro contexto (sin sesión) precarga el correo desde la cookie HttpOnly.
  const rememberedContext = await browser.newContext();
  await rememberedContext.addCookies([rememberCookie]);
  const rememberedPage = await rememberedContext.newPage();
  await rememberedPage.goto(base);
  await rememberedPage.locator('#login-form').waitFor();
  assert.equal(await rememberedPage.locator('#login-user').inputValue(), ADMIN.email);
  await rememberedContext.close();

  // Sin sesión, ni una URL hash directa muestra datos de la app.
  const directContext = await browser.newContext();
  const directPage = await directContext.newPage();
  await directPage.goto(`${base}/#estudiantes`);
  await directPage.locator('#login-form').waitFor();
  assert.equal(await directPage.locator('.app').evaluate(el => el.hidden), true);
  for (const route of ['students', 'dashboard', 'backup', 'income', 'classes', 'reports/monthly']) {
    const r = await fetch(`${base}/api/${route}`);
    assert.equal(r.status, 401, `/api/${route} debe exigir sesión`);
  }
  await directContext.close();

  // Logout: revoca en servidor, borra la cookie y mantiene el usuario recordado.
  const oldToken = sessionCookie.value;
  await page.locator('#logout-btn').click();
  await page.locator('#login-form').waitFor();
  assert.equal((await page.request.get(`${base}/api/students`)).status(), 401);
  const reused = await fetch(`${base}/api/students`, { headers: { Cookie: `pm_session=${oldToken}` } });
  assert.equal(reused.status, 401, 'Un token usado antes del logout no debe reingresar');
  assert.equal(await page.locator('#login-user').inputValue(), ADMIN.email);

  const signIn = async (p, { keep = false, password = ADMIN.password } = {}) => {
    await p.locator('#login-user').fill(ADMIN.email);
    await p.locator('#login-pass').fill(password);
    if (keep) await p.locator('[name="keep_signed_in"]').check();
    await p.locator('#login-form button[type="submit"]').click();
    await p.getByRole('heading', { name: 'Panel', exact: true }).waitFor();
  };
  await signIn(page);

  // Mantener sesión: cookie con expiración larga y válida en un navegador nuevo.
  await page.locator('#logout-btn').click();
  await page.locator('#login-form').waitFor();
  await signIn(page, { keep: true });
  const persistentCookies = await context.cookies(base);
  const persistent = persistentCookies.find(c => c.name === 'pm_session');
  assert(persistent.expires > Date.now() / 1000 + 20 * 86400, 'La sesión persistente debe durar semanas');
  const persistentContext = await browser.newContext();
  await persistentContext.addCookies(persistentCookies);
  const persistentPage = await persistentContext.newPage();
  await persistentPage.goto(base);
  await persistentPage.getByRole('heading', { name: 'Panel', exact: true }).waitFor();
  await persistentContext.close();

  // No hay registro público; sólo un administrador puede crear usuarios.
  const publicCreate = await fetch(`${base}/api/auth/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'publico@prueba.local', password: 'Publico123!', role: 'owner' })
  });
  assert.equal(publicCreate.status, 403, 'El registro público debe estar prohibido');
  const created = await page.request.post(`${base}/api/auth/users`, {
    data: { email: 'prof@prueba.local', password: 'Prof1234!', name: 'Profesora', role: 'profesor' }
  });
  const createdText = await created.text();
  assert(created.ok(), createdText);
  const profId = JSON.parse(createdText).user.id;
  const profContext = await browser.newContext();
  const profPage = await profContext.newPage();
  await profPage.goto(base);
  await profPage.locator('#login-user').fill('prof@prueba.local');
  await profPage.locator('#login-pass').fill('Prof1234!');
  await profPage.locator('#login-form button[type="submit"]').click();
  await profPage.getByRole('heading', { name: 'Panel', exact: true }).waitFor();
  assert.equal(await profPage.locator('[data-nav="usuarios"]').isHidden(), true);
  assert.equal((await profPage.request.get(`${base}/api/auth/users`)).status(), 403);
  await profContext.close();

  const changed = await page.request.put(`${base}/api/auth/users/${profId}`, {
    data: { password: 'ProfNuevo123!' }
  });
  assert(changed.ok(), await changed.text());
  const oldPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'prof@prueba.local', password: 'Prof1234!' })
  });
  assert.equal(oldPassword.status, 401, 'La contraseña anterior debe dejar de funcionar');
  const newPassword = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'prof@prueba.local', password: 'ProfNuevo123!' })
  });
  assert.equal(newPassword.status, 200);

  // La recuperación está preparada pero requiere configuración explícita de correo.
  assert.equal((await fetch(`${base}/api/auth/forgot`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN.email })
  })).status, 503);
  assert.equal((await fetch(`${base}/api/auth/reset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'x'.repeat(48), password: 'Nueva1234!' })
  })).status, 400);

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
  let income = await api('income?today=2026-11-02');
  assert.equal(income.summary.total,600,'La clase particular debe generar RD$600');
  assert.equal(income.rows.length,1);
  assert.equal(income.rows[0].amount,600);
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
  income = await api('income?today=2026-11-04');
  assert.equal(income.summary.total,1400,'600 + 800 = 1400');
  assert.equal(income.summary.day,800,'El ingreso del día debe ser solo la clase grupal');
  assert.equal(income.summary.week,1400);
  assert.equal(income.summary.month,1400);
  assert.equal(income.summary.classes,2);
  assert.equal(income.summary.average,700);
  assert.deepEqual(income.summary.by_modality.map(m => [m.code,m.amount,m.classes]),
    [['particular',600,1],['grupal',800,1],['domicilio',0,0],['online',0,0]]);
  await nav('tareas'); await page.locator('[data-review]').click();
  await field('status').selectOption('revisada'); await save();
  const [task] = await api('tasks');
  assert.equal(task.status,'revisada'); assert.equal(task.description,'Preparar lectura');
  await nav('reportes'); await page.locator('#f-year').fill('2026'); await page.locator('#f-month').selectOption('11');
  assert.deepEqual((await api('reports/monthly?year=2026&month=11')).summary,
    {particular:1,grupal:1,domicilio:0,online:0,total:2,attendances:3});
  const download = page.waitForEvent('download'); await page.locator('#exp-csv').click();
  assert.match((await download).suggestedFilename(),/\.csv$/);

  // Reglas del módulo de ingresos.
  const classPayload = (date, type, status, student = a.id) => ({
    class_type: type, class_date: date, class_time: '15:00', student_ids: [student], status
  });
  const totalOn = async date => (await api(`income?from=${date}&to=${date}`)).summary.filtered_total;
  const requestClass = (method, data, id = '') => page.request[method](`${base}/api/classes${id ? '/' + id : ''}`,{data});
  const postClass = async data => {
    const r = await requestClass('post',data);
    if (!r.ok()) throw new Error(`${r.status()} ${await r.text()}`);
    return (await r.json()).id;
  };
  const putClass = async (id,data) => {
    const r = await requestClass('put',data,id);
    if (!r.ok()) throw new Error(`${r.status()} ${await r.text()}`);
  };
  const delClass = async id => {
    const r = await page.request.delete(`${base}/api/classes/${id}`);
    assert(r.ok(),`No se pudo eliminar la clase ${id}`);
  };

  const cancelledId = await postClass(classPayload('2026-11-05','particular','cancelada'));
  assert.equal(await totalOn('2026-11-05'),0,'Una clase cancelada no genera ingresos');
  await putClass(cancelledId,classPayload('2026-11-05','particular','impartida'));
  assert.equal(await totalOn('2026-11-05'),600,'Al marcarla impartida se contabiliza');
  await putClass(cancelledId,classPayload('2026-11-05','particular','cancelada'));
  assert.equal(await totalOn('2026-11-05'),0,'Al cancelarla se descuenta');
  await delClass(cancelledId);
  assert.equal(await totalOn('2026-11-05'),0);

  const duplicateId = await postClass(classPayload('2026-11-06','particular','impartida'));
  assert.equal(await totalOn('2026-11-06'),600);
  await putClass(duplicateId,classPayload('2026-11-06','particular','impartida'));
  const duplicateRows = (await api('income?from=2026-11-06&to=2026-11-06')).rows;
  assert.equal(duplicateRows.length,1,'Una clase impartida se contabiliza una sola vez');
  await delClass(duplicateId);
  assert.equal((await api('income?from=2026-11-06&to=2026-11-06')).rows.length,0,'Al eliminar la clase no queda ingreso huérfano');

  const noRateRes = await requestClass('post',classPayload('2026-11-07','domicilio','impartida'));
  const noRate = await noRateRes.json();
  assert(noRateRes.ok());
  assert.match(noRate.warnings.join(' '),/sin tarifa|tarifa configurada/i,'Debe avisar si la modalidad no tiene tarifa');
  assert.equal(await totalOn('2026-11-07'),0,'Sin tarifa no se registra un importe');
  await delClass(noRate.id);

  await nav('tarifas');
  await page.getByRole('heading',{name:'Configuración de tarifas'}).waitFor();
  const rateSaved = page.waitForResponse(r => r.url().includes('/api/modalities/particular') && r.request().method() === 'PUT');
  await page.locator('#rate-particular').fill('700');
  await page.locator('#save-particular').click();
  await rateSaved;
  assert.equal((await api('modalities')).find(m => m.code === 'particular').price,700);
  const [firstClass] = await api('classes?from=2026-11-02&to=2026-11-02');
  await putClass(firstClass.id,classPayload('2026-11-02','particular','impartida'));
  assert.equal((await api('income?from=2026-11-02&to=2026-11-02')).rows[0].amount,600,
    'Cambiar la tarifa no debe alterar un ingreso histórico');
  const premiumId = await postClass(classPayload('2026-11-08','particular','impartida'));
  assert.equal((await api('income?from=2026-11-08&to=2026-11-08')).rows[0].amount,700,
    'La tarifa nueva sí aplica a clases nuevas');
  await delClass(premiumId);
  const restore = await page.request.put(`${base}/api/modalities/particular`,
    {data:{name:'Particular',price:600,active:1}});
  assert(restore.ok());

  await nav('ingresos'); await page.getByRole('heading',{name:'Ingresos',exact:true}).waitFor();
  await nav('ingresos-historial'); await page.getByRole('heading',{name:'Historial de ingresos'}).waitFor();
  const filteredResp = page.waitForResponse(r => r.url().includes('/api/income?') && r.url().includes('modality=grupal'));
  await page.locator('#f-modality').selectOption('grupal');
  await filteredResp;
  assert.equal((await api('income?modality=grupal')).summary.filtered_total,800);
  await nav('ingresos-reportes'); await page.getByRole('heading',{name:'Reportes de ingresos'}).waitFor();
  const incomeDownload = page.waitForEvent('download'); await page.locator('#exp-csv').click();
  assert.match((await incomeDownload).suggestedFilename(),/^ingresos_/);

  await nav('historial'); await page.locator('[data-tab="asistencia"]').click();
  await page.locator('tbody').getByText('ausente').waitFor();
  await nav('respaldo'); await page.locator('#backup-status').getByText('class_students').waitFor();
  assert.equal(Object.keys((await api('backup')).data).length,10);
  const importFile = {name:'students.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([a,b]))};
  await page.locator('#import-file').setInputFiles(importFile);
  await page.getByText('2 estudiantes listos para importar').waitFor();
  page.once('dialog', d=>d.accept()); await page.locator('#import-btn').click();
  await page.getByText('Importación completada: 0 estudiantes nuevos').waitFor();
  const known = (await api('classes')).length;
  const invalid = await page.request.post(`${base}/api/classes`,{data:{class_type:'particular',class_date:'2026-11-07',class_time:'12:00',student_ids:[999999]}});
  assert(!invalid.ok()); assert.equal((await api('classes')).length,known,'Una FK inválida debe revertir la clase completa');
  // Cerrar el navegador y abrir uno nuevo sin cookies: los datos siguen intactos.
  await context.close();
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage(); dialog = page.locator('dialog'); await setup();
  assert.equal((await api('classes?from=2026-11-01&to=2026-11-30')).length,2);
  await nav('estudiantes'); await page.locator('[data-edit]').first().click();
  await field('active').uncheck(); await save(); assert.equal((await api('students')).find(x=>x.id===a.id).active,0);
  await nav('tareas'); await page.locator('#f-status').selectOption('revisada');
  page.once('dialog', d=>d.accept()); await page.locator('[data-del]').click();
  await page.locator('[data-del]').waitFor({state:'hidden'}); assert.equal((await api('tasks')).length,0);

  // --- Diseño responsive real: escritorio, tablet y móvil ---
  const noOverflow = async label => {
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth, inner: window.innerWidth
    }));
    assert(m.scroll <= m.inner + 1, `${label}: hay scroll horizontal (${m.scroll} > ${m.inner})`);
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.locator('#menu-btn').isVisible(), false);
  assert.equal(await page.locator('#sidebar').isVisible(), true);
  await noOverflow('escritorio');

  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(await page.locator('#menu-btn').isVisible(), true);
  await noOverflow('tablet');

  await page.setViewportSize({ width: 375, height: 667 });
  await page.locator('#menu-btn').click();
  assert(await page.locator('#sidebar').evaluate(el => el.classList.contains('open')));
  assert(await page.locator('#nav-overlay').isVisible());
  await page.locator('#nav-overlay').click();
  assert(!(await page.locator('#sidebar').evaluate(el => el.classList.contains('open'))));

  const responsiveRoutes = ['dashboard', 'estudiantes', 'programa', 'planificacion', 'clases',
    'tareas', 'reportes', 'historial', 'ingresos', 'ingresos-historial',
    'ingresos-reportes', 'tarifas', 'usuarios', 'perfil', 'respaldo'];
  for (const route of responsiveRoutes) {
    await page.evaluate(r => { location.hash = `#${r}`; }, route);
    await page.waitForTimeout(120);
    await page.locator('#main h1').waitFor();
    await noOverflow(`móvil/${route}`);
    if (await page.locator('#main table thead').count()) {
      const td = page.locator('#main td').first();
      assert.equal(await td.evaluate(el => getComputedStyle(el).display), 'flex',
        `móvil/${route}: la tabla debe convertirse en tarjetas`);
      assert.notEqual(await td.getAttribute('data-label'), null,
        `móvil/${route}: falta la etiqueta de la celda`);
    }
    const btn = page.locator('#main .btn').first();
    if (await btn.count()) {
      const minHeight = await btn.evaluate(el => parseFloat(getComputedStyle(el).minHeight) || 0);
      assert(minHeight >= 34, `móvil/${route}: botón táctil demasiado pequeño (${minHeight}px)`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // La pantalla de acceso también debe caber en un teléfono pequeño.
  const loginContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const loginPage = await loginContext.newPage();
  loginPage.on('pageerror', e => errors.push(e.message));
  await loginPage.goto(base);
  await loginPage.locator('#login-form').waitFor();
  const loginMetrics = await loginPage.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, inner: window.innerWidth,
    input: parseFloat(getComputedStyle(document.querySelector('#login-user')).minHeight),
    button: parseFloat(getComputedStyle(document.querySelector('.auth-submit')).minHeight)
  }));
  assert(loginMetrics.scroll <= loginMetrics.inner + 1, 'El login desborda en móvil');
  assert(loginMetrics.input >= 44 && loginMetrics.button >= 44, 'Controles del login muy pequeños');
  await loginContext.close();

  assert.deepEqual(errors,[]);
  console.log('OK: autenticación privada, roles, cookies seguras, diseño responsive, módulos académicos e ingresos, CRUD, acumulación automática, tarifas históricas, reportes y persistencia.');
} finally { await browser.close(); }
