import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
const temp = mkdtempSync(join(tmpdir(),'piano-d1-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
const port = String(probe.address().port);
await new Promise(resolve=>probe.close(resolve));
const cli = 'node_modules/wrangler/bin/wrangler.js';
let server;
try {
  const d1 = file => spawnSync(process.execPath,[cli,'d1','execute','piano-manager-db','--local','--persist-to',temp,'--file',file],{stdio:'inherit'}).status === 0;
  if (!d1('schema.sql')) throw Error('No se pudo inicializar la base de prueba');
  if (!d1('migrations/001_income.sql') || !d1('migrations/002_auth.sql'))
    throw Error('No se pudieron aplicar las migraciones de prueba');
  server = spawn(process.execPath,[cli,'pages','dev','public','--persist-to',temp,'--ip','127.0.0.1','--port',port,'--binding','LOCAL_DEV=1'],{stdio:'inherit'});
  for (let i=0;i<60;i++) {
    if (server.exitCode !== null) throw Error('Pages dev se detuvo');
    if (await fetch(`http://127.0.0.1:${port}/api/health`).then(r=>r.ok).catch(()=>false)) break;
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  process.env.PIANO_TEST_PORT = port;
  await import('./daily-work.mjs');
} finally {
  if (server?.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill',['/pid',String(server.pid),'/t','/f']);
    else server.kill();
    if (server.exitCode === null) await new Promise(resolve=>server.once('exit',resolve));
  }
  rmSync(temp,{recursive:true,force:true,maxRetries:5});
}
