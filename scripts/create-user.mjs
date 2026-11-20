// Crea un usuario de Piano Manager directamente en D1 con contraseña hasheada.
// Uso: npm run user:create            (base local)
//      npm run user:create:remote     (D1 remota, requiere wrangler autenticado)
// No existe registro público: ésta es la forma de crear el primer administrador.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { hashPassword } from '../lib/auth.js';

const remote = process.argv.includes('--remote');
const roles = ['owner', 'admin', 'profesor', 'monitor'];
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const dir = mkdtempSync(join(tmpdir(), 'piano-user-'));
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(resolve => rl.question(q, resolve));

async function hidden(prompt) {
  process.stdout.write(prompt);
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  if (stdin.setRawMode) stdin.setRawMode(true);
  stdin.resume();
  let value = '';
  await new Promise(resolve => {
    const onData = chunk => {
      const s = chunk.toString();
      if (s === '\n' || s === '\r' || s === '\u0003') {
        stdin.removeListener('data', onData);
        if (stdin.setRawMode) stdin.setRawMode(!!wasRaw);
        process.stdout.write('\n');
        resolve();
        return;
      }
      if (s === '\u007f') { value = value.slice(0, -1); return; }
      if (/^[\x20-\x7e]$/.test(s)) { value += s; process.stdout.write('*'); }
    };
    stdin.on('data', onData);
  });
  return value;
}

const sqlQuote = value => `'${String(value).replace(/'/g, "''")}'`;

// Modo no interactivo para automatización autorizada. No guardar estas variables en archivos.
const automated = Boolean(process.env.PM_USER_EMAIL && process.env.PM_USER_PASSWORD);

try {
  console.log(`Base de datos: ${remote ? 'REMOTA (producción)' : 'local'}`);
  const email = (automated ? process.env.PM_USER_EMAIL : await ask('Correo electrónico: ')).trim().toLowerCase();
  if (!emailRe.test(email)) throw new Error('El correo no es válido');
  const name = (automated ? (process.env.PM_USER_NAME || '') : await ask('Nombre (opcional): ')).trim();
  let role = (automated
    ? (process.env.PM_USER_ROLE || 'profesor')
    : await ask(`Rol (${roles.join(', ')}) [profesor]: `)).trim().toLowerCase() || 'profesor';
  if (!roles.includes(role)) throw new Error(`Rol no válido. Usa uno de: ${roles.join(', ')}`);
  const password = automated ? process.env.PM_USER_PASSWORD : await hidden('Contraseña (mínimo 8 caracteres): ');
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
  if (!automated) {
    const confirm = await hidden('Repite la contraseña: ');
    if (password !== confirm) throw new Error('Las contraseñas no coinciden');
  }

  const hash = await hashPassword(password, process.env);
  const safeName = name || email.split('@')[0];
  const file = join(dir, 'create-user.sql');
  writeFileSync(file, `INSERT INTO users (email, name, password_hash, role, active)
    VALUES (${sqlQuote(email)}, ${sqlQuote(safeName)}, ${sqlQuote(hash)}, ${sqlQuote(role)}, 1);\n`);

  const args = ['d1', 'execute', 'piano-manager-db', remote ? '--remote' : '--local', `--file=${file}`];
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('No se pudo crear el usuario en D1');
  console.log(`\nUsuario ${email} creado con rol ${role}.`);
} catch (e) {
  console.error(`\nError: ${e.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  rmSync(dir, { recursive: true, force: true });
}
