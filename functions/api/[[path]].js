// Piano Class Manager — API REST (Cloudflare Pages Function + D1)

import { identity } from '../../lib/access.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}
function fail(message, status = 400) {
  return json({ error: message }, status);
}
async function body(request) {
  try { return await request.json(); } catch { return {}; }
}
function segments(url) {
  return url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
}
function pad(n) { return String(n).padStart(2, '0'); }
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(dateStr) {
  const w = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}
function monthBounds(year, month) {
  const start = `${year}-${pad(month)}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return [start, end];
}
function placeholders(list) {
  return list.length ? `(${list.map(() => '?').join(',')})` : '(0)';
}

const MODALITIES = ['particular', 'grupal', 'domicilio', 'online'];
const MODALITY_NAMES = {
  particular: 'Particular', grupal: 'Grupal',
  domicilio: 'A domicilio', online: 'Online'
};
function modalityLabel(code) { return MODALITY_NAMES[code] || String(code || ''); }
function weekBounds(dateStr) {
  const w = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  const start = addDays(dateStr, -(w === 0 ? 6 : w - 1));
  return [start, addDays(start, 6)];
}
function yearBounds(year) { return [`${year}-01-01`, `${year}-12-31`]; }

async function all(db, sql, binds = []) {
  const st = db.prepare(sql);
  return (await (binds.length ? st.bind(...binds) : st).all()).results;
}
async function first(db, sql, binds = []) {
  const st = db.prepare(sql);
  return (binds.length ? st.bind(...binds) : st).first();
}
async function run(db, sql, binds = []) {
  const st = db.prepare(sql);
  return (binds.length ? st.bind(...binds) : st).run();
}
async function insert(db, sql, binds = []) {
  return (await run(db, sql, binds)).meta.last_row_id;
}

async function incomeSummary(db, today) {
  const rows = await all(db, 'SELECT * FROM income_entries');
  const [wFrom, wTo] = weekBounds(today);
  const [mFrom, mTo] = monthBounds(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  const [yFrom, yTo] = yearBounds(Number(today.slice(0, 4)));
  const inRange = (r, from, to) => r.class_date >= from && r.class_date <= to;
  const sum = list => list.reduce((n, r) => n + Number(r.amount || 0), 0);
  const total = sum(rows);
  return {
    total,
    day: sum(rows.filter(r => r.class_date === today)),
    week: sum(rows.filter(r => inRange(r, wFrom, wTo))),
    month: sum(rows.filter(r => inRange(r, mFrom, mTo))),
    year: sum(rows.filter(r => inRange(r, yFrom, yTo))),
    classes: rows.length,
    average: rows.length ? total / rows.length : 0,
    by_modality: MODALITIES.map(code => {
      const mine = rows.filter(r => r.modality_code === code);
      return {
        code, name: modalityLabel(code),
        amount: sum(mine), classes: mine.length
      };
    })
  };
}

const CLASS_SELECT = `
  SELECT c.*,
    l.name AS level_name,
    pi.topic AS topic_name,
    pi.unit AS topic_unit,
    (SELECT GROUP_CONCAT(s.full_name, ' | ') FROM class_students cs
       JOIN students s ON s.id = cs.student_id WHERE cs.class_id = c.id) AS student_names,
    (SELECT GROUP_CONCAT(s.id) FROM class_students cs
       JOIN students s ON s.id = cs.student_id WHERE cs.class_id = c.id) AS student_ids_csv,
    (SELECT json_group_object(cs.student_id,cs.attendance) FROM class_students cs WHERE cs.class_id=c.id) AS attendance_json,
    (SELECT GROUP_CONCAT(s.full_name || ':' || cs.attendance, ' | ') FROM class_students cs
       JOIN students s ON s.id = cs.student_id WHERE cs.class_id = c.id) AS attendance_summary,
    (SELECT t.id FROM tasks t WHERE t.class_id = c.id LIMIT 1) AS task_id,
    (SELECT t.description FROM tasks t WHERE t.class_id = c.id LIMIT 1) AS task_description,
    (SELECT t.due_date FROM tasks t WHERE t.class_id = c.id LIMIT 1) AS task_due_date,
    (SELECT t.status FROM tasks t WHERE t.class_id = c.id LIMIT 1) AS task_status,
    (SELECT t.student_id FROM tasks t WHERE t.class_id = c.id LIMIT 1) AS task_student_id
  FROM classes c
  LEFT JOIN levels l ON l.id = c.level_id
  LEFT JOIN program_items pi ON pi.id = c.topic_id`;

/* ------------------------------ Estudiantes ------------------------------ */
async function studentsHandler(method, p, url, env, request) {
  const db = env.DB;
  if (method === 'GET') {
    return json(await all(db, `
      SELECT s.*, l.name AS level_name,
        (SELECT COUNT(*) FROM class_students cs JOIN classes c ON c.id = cs.class_id
          WHERE cs.student_id = s.id AND c.status = 'impartida') AS classes_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.student_id = s.id AND t.status = 'pendiente') AS pending_tasks
      FROM students s LEFT JOIN levels l ON l.id = s.level_id
      ORDER BY s.active DESC, s.full_name`));
  }
  if (method === 'POST') {
    const b = await body(request);
    if (!String(b.full_name || '').trim()) return fail('El nombre completo es obligatorio');
    try {
      const id = await insert(db, `INSERT INTO students
        (full_name, phone, level_id, class_type, usual_day, usual_time, start_date, notes, active)
        VALUES (?,?,?,?,?,?,?,?,?)`, [
        String(b.full_name).trim(), b.phone || null, b.level_id || null,
        b.class_type || 'particular', b.usual_day || null, b.usual_time || null,
        b.start_date || null, b.notes || null, [false,0].includes(b.active) ? 0 : 1
      ]);
      return json({ ok: true, id }, 201);
    } catch (e) {
      if (String(e).toLowerCase().includes('unique')) return fail('Ya existe un estudiante con ese nombre y teléfono', 409);
      throw e;
    }
  }
  if (method === 'PUT' && p[1]) {
    const b = await body(request);
    if (!String(b.full_name || '').trim()) return fail('El nombre completo es obligatorio');
    try {
      await run(db, `UPDATE students SET full_name=?, phone=?, level_id=?, class_type=?,
        usual_day=?, usual_time=?, start_date=?, notes=?, active=? WHERE id=?`, [
        String(b.full_name).trim(), b.phone || null, b.level_id || null,
        b.class_type || 'particular', b.usual_day || null, b.usual_time || null,
        b.start_date || null, b.notes || null, [false,0].includes(b.active) ? 0 : 1, p[1]
      ]);
      return json({ ok: true });
    } catch (e) {
      if (String(e).toLowerCase().includes('unique')) return fail('Ya existe un estudiante con ese nombre y teléfono', 409);
      throw e;
    }
  }
  if (method === 'DELETE' && p[1]) {
    await run(db, 'DELETE FROM students WHERE id=?', [p[1]]);
    return json({ ok: true });
  }
  return fail('Método no permitido', 405);
}

/* -------------------------------- Niveles -------------------------------- */
async function levelsHandler(method, p, env, request) {
  const db = env.DB;
  if (method === 'GET') return json(await all(db, 'SELECT * FROM levels ORDER BY sort_order, name'));
  if (method === 'POST') {
    const b = await body(request);
    if (!String(b.name || '').trim()) return fail('El nombre del nivel es obligatorio');
    try {
      const id = await insert(db, 'INSERT INTO levels(name, description, sort_order) VALUES (?,?,?)',
        [String(b.name).trim(), b.description || null, Number(b.sort_order) || 0]);
      return json({ ok: true, id }, 201);
    } catch (e) {
      if (String(e).toLowerCase().includes('unique')) return fail('Ese nivel ya existe', 409);
      throw e;
    }
  }
  if (method === 'PUT' && p[1]) {
    const b = await body(request);
    await run(db, 'UPDATE levels SET name=?, description=?, sort_order=? WHERE id=?',
      [String(b.name || '').trim(), b.description || null, Number(b.sort_order) || 0, p[1]]);
    return json({ ok: true });
  }
  if (method === 'DELETE' && p[1]) {
    await run(db, 'DELETE FROM levels WHERE id=?', [p[1]]);
    return json({ ok: true });
  }
  return fail('Método no permitido', 405);
}

/* --------------------------- Programa académico --------------------------- */
async function programHandler(method, p, url, env, request) {
  const db = env.DB;
  if (method === 'GET') {
    const levelId = url.searchParams.get('level_id');
    const sql = `SELECT pi.*, l.name AS level_name FROM program_items pi
      JOIN levels l ON l.id = pi.level_id
      ${levelId ? 'WHERE pi.level_id=?' : ''} ORDER BY l.sort_order, pi.sort_order, pi.unit, pi.topic`;
    return json(await all(db, sql, levelId ? [levelId] : []));
  }
  if (method === 'POST') {
    const b = await body(request);
    if (!b.level_id || !String(b.unit || '').trim() || !String(b.topic || '').trim())
      return fail('Nivel, unidad y tema son obligatorios');
    try {
      const id = await insert(db, `INSERT INTO program_items
        (level_id, unit, topic, content, objectives, exercises, pieces, notes, sort_order)
        VALUES (?,?,?,?,?,?,?,?,?)`, [
        b.level_id, String(b.unit).trim(), String(b.topic).trim(), b.content || null,
        b.objectives || null, b.exercises || null, b.pieces || null, b.notes || null,
        Number(b.sort_order) || 0
      ]);
      return json({ ok: true, id }, 201);
    } catch (e) {
      if (String(e).toLowerCase().includes('unique')) return fail('Ya existe ese tema en la unidad para ese nivel', 409);
      throw e;
    }
  }
  if (method === 'PUT' && p[1]) {
    const b = await body(request);
    await run(db, `UPDATE program_items SET level_id=?, unit=?, topic=?, content=?, objectives=?,
      exercises=?, pieces=?, notes=?, sort_order=? WHERE id=?`, [
      b.level_id, String(b.unit || '').trim(), String(b.topic || '').trim(), b.content || null,
      b.objectives || null, b.exercises || null, b.pieces || null, b.notes || null,
      Number(b.sort_order) || 0, p[1]
    ]);
    return json({ ok: true });
  }
  if (method === 'DELETE' && p[1]) {
    await run(db, 'DELETE FROM program_items WHERE id=?', [p[1]]);
    return json({ ok: true });
  }
  return fail('Método no permitido', 405);
}

/* ----------------------------- Planificación ------------------------------ */
async function scheduleOccurrences(db, from, to) {
  const schedules = await all(db, `SELECT s.*, l.name AS level_name, pi.topic AS topic_name,
    pi.content AS topic_content, pi.unit AS topic_unit
    FROM schedules s
    LEFT JOIN levels l ON l.id = s.level_id
    LEFT JOIN program_items pi ON pi.id = s.topic_id
    WHERE s.active = 1`);

  const out = [];
  for (const s of schedules) {
    if (s.specific_date) {
      if (s.specific_date >= from && s.specific_date <= to) out.push({ ...s, date: s.specific_date });
    } else if (s.repeat_weekly) {
      let cur = from;
      let guard = 0;
      while (cur <= to && guard++ < 400) {
        if (weekdayOf(cur) === Number(s.weekday) &&
            (!s.start_date || cur >= s.start_date) && (!s.end_date || cur <= s.end_date)) {
          out.push({ ...s, date: cur });
        }
        cur = addDays(cur, 1);
      }
    }
  }

  const people = new Map((await all(db, 'SELECT id,full_name FROM students')).map(s => [s.id,s]));
  const completed = new Map((await all(db, 'SELECT sc.*, c.status FROM schedule_completions sc JOIN classes c ON c.id=sc.class_id WHERE sc.class_date BETWEEN ? AND ?', [from,to])).map(c => [`${c.schedule_id}/${c.class_date}`,c]));
  const pending = await all(db, `SELECT t.*, s.full_name AS student_name FROM tasks t JOIN students s ON s.id=t.student_id WHERE t.status='pendiente' AND t.assigned_date<=?`, [to]);
  for (const o of out) {
    const ids = JSON.parse(o.student_ids || '[]').map(Number).filter(Boolean);
    o.students = ids.map(id => people.get(id)).filter(Boolean);
    const comp = completed.get(`${o.id}/${o.date}`);
    o.recorded_status = comp?.status;
    o.completed = !!comp;
    o.class_id = comp ? comp.class_id : null;
    o.tasks = pending.filter(t => ids.includes(t.student_id) && (!comp || comp.class_id !== t.class_id) && t.assigned_date <= o.date);
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
  return out;
}

async function schedulesHandler(method, p, url, env, request) {
  const db = env.DB;
  if (method === 'GET') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (from && to) return json(await scheduleOccurrences(db, from, to));
    return json(await all(db, `SELECT s.*, l.name AS level_name, pi.topic AS topic_name
      FROM schedules s LEFT JOIN levels l ON l.id=s.level_id
      LEFT JOIN program_items pi ON pi.id=s.topic_id ORDER BY s.id DESC`));
  }
  if (method === 'POST' && p[1] === 'duplicate-week') {
    const b = await body(request);
    const from = b.from_date;
    if (!from) return fail('Falta la fecha de la semana origen');
    const to = addDays(from, 6);
    const target = addDays(from, 7);
    const source = await scheduleOccurrences(db, from, to);
    let copied = 0;
    const existing = await scheduleOccurrences(db,target,addDays(target,6));
    for (const s of source) {
      const newDate = addDays(s.date, 7);
      if (existing.some(o => o.date === newDate && (o.id === s.id || o.copied_from === s.id))) continue;
      await insert(db, `INSERT INTO schedules
        (student_ids, level_id, topic_id, class_type, weekday, time, duration_min,
         specific_date, repeat_weekly, start_date, end_date, notes, active, copied_from)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
        s.student_ids, s.level_id, s.topic_id, s.class_type, s.weekday, s.time,
        s.duration_min, newDate, 0, null, null, s.notes, 1, s.id
      ]);
      copied++;
    }
    return json({ ok: true, copied, target_date: target });
  }
  if (method === 'POST') {
    const b = await body(request);
    const ids = Array.isArray(b.student_ids) ? b.student_ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return fail('Selecciona al menos un estudiante');
    if (!String(b.time || '').trim()) return fail('La hora es obligatoria');
    if ((b.class_type || 'particular') === 'particular' && ids.length !== 1) return fail('Selecciona solo un estudiante para la clase particular');
    if (!b.specific_date && (!b.weekday || !b.repeat_weekly)) return fail('Indica una fecha o activa la repetición semanal');
    const id = await insert(db, `INSERT INTO schedules
      (student_ids, level_id, topic_id, class_type, weekday, time, duration_min,
       specific_date, repeat_weekly, start_date, end_date, notes, active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      JSON.stringify(ids), b.level_id || null, b.topic_id || null, b.class_type || 'particular',
      b.weekday || null, String(b.time), Number(b.duration_min) || 60,
      b.specific_date || null, b.repeat_weekly ? 1 : 0,
      b.start_date || null, b.end_date || null, b.notes || null, b.active === false ? 0 : 1
    ]);
    return json({ ok: true, id }, 201);
  }
  if (method === 'PUT' && p[1]) {
    const b = await body(request);
    const ids = Array.isArray(b.student_ids) ? b.student_ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return fail('Selecciona al menos un estudiante');
    if ((b.class_type || 'particular') === 'particular' && ids.length !== 1) return fail('Selecciona solo un estudiante para la clase particular');
    if (!b.time || (!b.specific_date && (!b.weekday || !b.repeat_weekly))) return fail('Faltan datos de la planificación');
    await run(db, `UPDATE schedules SET student_ids=?, level_id=?, topic_id=?, class_type=?,
      weekday=?, time=?, duration_min=?, specific_date=?, repeat_weekly=?, start_date=?,
      end_date=?, notes=?, active=? WHERE id=?`, [
      JSON.stringify(ids), b.level_id || null, b.topic_id || null, b.class_type || 'particular',
      b.weekday || null, String(b.time || ''), Number(b.duration_min) || 60,
      b.specific_date || null, b.repeat_weekly ? 1 : 0, b.start_date || null,
      b.end_date || null, b.notes || null, b.active === false ? 0 : 1, p[1]
    ]);
    return json({ ok: true });
  }
  if (method === 'DELETE' && p[1]) {
    await run(db, 'DELETE FROM schedules WHERE id=?', [p[1]]);
    return json({ ok: true });
  }
  return fail('Método no permitido', 405);
}

/* -------------------------------- Clases --------------------------------- */
function validateClass(b) {
  if (!String(b.class_date || '').match(/^\d{4}-\d{2}-\d{2}$/)) return 'La fecha no es válida';
  if (!String(b.class_time || '').trim()) return 'La hora es obligatoria';
  if (!MODALITIES.includes(b.class_type)) return 'El tipo de clase no es válido';
  if (!['impartida', 'cancelada', 'reprogramada'].includes(b.status || 'impartida')) return 'El estado no es válido';
  const ids = Array.isArray(b.student_ids) ? b.student_ids.map(Number).filter(Boolean) : [];
  if (!ids.length) return 'Selecciona al menos un estudiante';
  if (b.class_type === 'particular' && ids.length > 1) return 'Una clase particular solo puede tener un estudiante';
  return null;
}

async function writeClass(db, id, b) {
  const err = validateClass(b);
  if (err) return fail(err);
  if (id && !await first(db,'SELECT id FROM classes WHERE id=?',[id])) return fail('Clase no encontrada',404);

  const ids = b.student_ids.map(Number);
  const status = b.status || 'impartida';
  const prior = id ? await first(db,'SELECT * FROM income_entries WHERE class_id=?',[id]) : null;
  const modality = await first(db,'SELECT code,name,price FROM modalities WHERE code=?',[b.class_type]);
  const rawPrice = modality?.price;
  const price = rawPrice === null || rawPrice === undefined || rawPrice === '' ? null : Number(rawPrice);
  // Si la clase ya tenía ingreso y no cambió de modalidad, se conserva la tarifa histórica.
  const rate = prior && prior.modality_code === b.class_type && prior.rate !== null
    ? Number(prior.rate)
    : (price !== null && Number.isFinite(price) ? price : null);
  const recordIncome = status === 'impartida' && rate !== null;
  const warnings = [];
  if (status === 'impartida' && rate === null)
    warnings.push(`La modalidad "${modalityLabel(b.class_type)}" no tiene tarifa configurada. No se registró ningún ingreso.`);

  const people = new Map((await all(db,
    `SELECT id,full_name FROM students WHERE id IN ${placeholders(ids)}`, ids)).map(s => [Number(s.id), s.full_name]));
  const names = ids.map(sid => people.get(sid)).filter(Boolean).join(' | ');

  const args = [b.class_date,b.class_time,b.class_type,b.level_id || null,b.topic_id || null,
    b.schedule_id || null,Number(b.duration_min) || 60,b.content || null,b.notes || null,status];
  const batch = [];
  const add = (sql,...params) => batch.push(db.prepare(sql).bind(...params));
  if (id) {
    add('UPDATE classes SET class_date=?,class_time=?,class_type=?,level_id=?,topic_id=?,schedule_id=?,duration_min=?,content=?,notes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',...args,id);
    add('DELETE FROM class_students WHERE class_id=?',id);
    add('DELETE FROM schedule_completions WHERE class_id=?',id);
  } else {
    add('INSERT INTO classes(class_date,class_time,class_type,level_id,topic_id,schedule_id,duration_min,content,notes,status) VALUES(?,?,?,?,?,?,?,?,?,?)',...args);
  }
  // Inside this atomic batch no other writer can insert a class.
  const ref = 'COALESCE(?,(SELECT MAX(id) FROM classes))';
  for (const sid of ids) {
    add(`INSERT INTO class_students(class_id,student_id,attendance) VALUES(${ref},?,?)`,id,sid,b.attendance?.[sid] || 'presente');
  }
  if (recordIncome) {
    add(`INSERT INTO income_entries
      (class_id,class_date,class_time,modality_code,modality_name,student_names,student_ids_csv,rate,amount,status,created_at,updated_at)
      VALUES(${ref},?,?,?,?,?,?,?,?,'impartida',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(class_id) DO UPDATE SET
        class_date=excluded.class_date, class_time=excluded.class_time,
        modality_code=excluded.modality_code, modality_name=excluded.modality_name,
        student_names=excluded.student_names, student_ids_csv=excluded.student_ids_csv,
        rate=excluded.rate, amount=excluded.amount, status=excluded.status,
        updated_at=CURRENT_TIMESTAMP`,
      id, b.class_date, b.class_time, b.class_type, modalityLabel(b.class_type),
      names, ids.join(','), rate, rate);
  } else if (id) {
    add('DELETE FROM income_entries WHERE class_id=?',id);
  }
  const desc = String(b.task?.description || '').trim();
  if (desc) {
    const sid = Number(b.task.student_id || b.student_ids[0]);
    if (!ids.includes(sid)) return fail('La tarea debe corresponder a un participante');
    const values = [sid,b.class_date,desc,b.task.due_date || addDays(b.class_date,7)];
    if (id && b.task_id) add('UPDATE tasks SET student_id=?,assigned_date=?,description=?,due_date=? WHERE id=? AND class_id=?',...values,b.task_id,id);
    else add(`INSERT INTO tasks(class_id,student_id,assigned_date,description,due_date) VALUES(${ref},?,?,?,?)`,id,...values);
  } else if (id && b.task_id) add('DELETE FROM tasks WHERE id=? AND class_id=?',b.task_id,id);
  if (b.schedule_id) {
    add('DELETE FROM schedule_completions WHERE schedule_id=? AND class_date=? AND class_id IS NULL',b.schedule_id,b.class_date);
    add(`INSERT INTO schedule_completions(schedule_id,class_date,class_id) VALUES(?,?,${ref})`,b.schedule_id,b.class_date,id);
  }
  const result = await db.batch(batch);
  return json({ok:true,id:id || result[0].meta.last_row_id,warnings},id ? 200 : 201);
}

async function classesHandler(method, p, url, env, request) {
  const db = env.DB;
  if (method === 'GET') {
    const q = url.searchParams;
    let sql = CLASS_SELECT + ' WHERE 1=1';
    const binds = [];
    for (const [param, col] of [['from', 'c.class_date >= ?'], ['to', 'c.class_date <= ?'],
      ['student_id', 'c.id IN (SELECT cs.class_id FROM class_students cs WHERE cs.student_id = ?)'],
      ['level_id', 'c.level_id = ?'], ['type', 'c.class_type = ?'], ['status', 'c.status = ?']]) {
      const v = q.get(param);
      if (v) { sql += ` AND ${col}`; binds.push(v); }
    }
    sql += ' ORDER BY c.class_date DESC, c.class_time DESC';
    return json(await all(db, sql, binds));
  }
  if (method === 'POST' || (method === 'PUT' && p[1]))
    return writeClass(db,method === 'PUT' ? p[1] : null,await body(request));
  if (method === 'DELETE' && p[1]) {
    const batch = [
      db.prepare('DELETE FROM income_entries WHERE class_id=?').bind(p[1]),
      db.prepare('DELETE FROM classes WHERE id=?').bind(p[1])
    ];
    await db.batch(batch);
    return json({ ok: true });
  }
  return fail('Método no permitido', 405);
}

/* ------------------------------- Asistencia ------------------------------- */
async function attendanceHandler(url, env) {
  const db = env.DB;
  const q = url.searchParams;
  let sql = `SELECT cs.attendance, s.full_name AS student_name, s.id AS student_id,
    c.id AS class_id, c.class_date, c.class_time, c.class_type, c.status, c.content
    FROM class_students cs JOIN students s ON s.id=cs.student_id
    JOIN classes c ON c.id=cs.class_id WHERE 1=1`;
  const binds = [];
  if (q.get('student_id')) { sql += ' AND cs.student_id=?'; binds.push(q.get('student_id')); }
  if (q.get('from')) { sql += ' AND c.class_date>=?'; binds.push(q.get('from')); }
  if (q.get('to')) { sql += ' AND c.class_date<=?'; binds.push(q.get('to')); }
  if (q.get('type')) { sql += ' AND c.class_type=?'; binds.push(q.get('type')); }
  if (q.get('level_id')) { sql += ' AND c.level_id=?'; binds.push(q.get('level_id')); }
  sql += ' ORDER BY c.class_date DESC';
  return json(await all(db, sql, binds));
}

/* --------------------------------- Tareas -------------------------------- */
async function tasksHandler(method, p, url, env, request) {
  const db = env.DB;
  if (method === 'GET') {
    const q = url.searchParams;
    let sql = `SELECT t.*, s.full_name AS student_name, c.class_date AS class_date,
      c.class_time AS class_time FROM tasks t
      JOIN students s ON s.id=t.student_id
      LEFT JOIN classes c ON c.id=t.class_id WHERE 1=1`;
    const binds = [];
    if (q.get('status')) { sql += ' AND t.status=?'; binds.push(q.get('status')); }
    if (q.get('student_id')) { sql += ' AND t.student_id=?'; binds.push(q.get('student_id')); }
    if (q.get('due_date')) { sql += ' AND t.due_date=?'; binds.push(q.get('due_date')); }
    if (q.get('from')) { sql += ' AND t.due_date>=?'; binds.push(q.get('from')); }
    if (q.get('to')) { sql += ' AND t.due_date<=?'; binds.push(q.get('to')); }
    sql += ' ORDER BY t.due_date, t.status';
    return json(await all(db, sql, binds));
  }
  if (method === 'POST') {
    const b = await body(request);
    if (!b.student_id || !String(b.description || '').trim() || !b.due_date) return fail('Faltan datos de la tarea');
    const id = await insert(db, `INSERT INTO tasks(class_id, student_id, assigned_date, description, due_date, status, review_notes)
      VALUES (?,?,?,?,?,?,?)`, [b.class_id || null, b.student_id, b.assigned_date || b.due_date,
      String(b.description).trim(), b.due_date, 'pendiente', null]);
    return json({ ok: true, id }, 201);
  }
  if (method === 'PUT' && p[1]) {
    const b = await body(request);
    await run(db, `UPDATE tasks SET student_id=COALESCE(?,student_id), assigned_date=COALESCE(?,assigned_date), description=COALESCE(?,description), due_date=COALESCE(?,due_date), status=COALESCE(?,status), review_notes=CASE WHEN ? THEN ? ELSE review_notes END WHERE id=?`, [
      b.student_id ?? null, b.assigned_date ?? null,
      b.description ?? null, b.due_date ?? null, b.status ?? null,
      Number('review_notes' in b), b.review_notes || null, p[1]
    ]);
    return json({ ok: true });
  }
  if (method === 'DELETE' && p[1]) {
    await run(db, 'DELETE FROM tasks WHERE id=?', [p[1]]);
    return json({ ok: true });
  }
  return fail('Método no permitido', 405);
}

/* ------------------------------- Dashboard -------------------------------- */
async function dashboardHandler(url, env) {
  const db = env.DB;
  const today = url.searchParams.get('today') || new Date().toISOString().slice(0, 10);
  const year = Number(url.searchParams.get('year')) || Number(today.slice(0, 4));
  const month = Number(url.searchParams.get('month')) || Number(today.slice(5, 7));
  const [mStart, mEnd] = monthBounds(year, month);

  const monthRows = await all(db, `SELECT class_type, COUNT(*) AS n FROM classes
    WHERE status='impartida' AND class_date BETWEEN ? AND ? GROUP BY class_type`, [mStart, mEnd]);
  const counts = Object.fromEntries(MODALITIES.map(code => [code, 0]));
  monthRows.forEach(r => { if (r.class_type in counts) counts[r.class_type] = r.n; });

  const todaySchedules = await scheduleOccurrences(db, today, today);
  const upcoming = await scheduleOccurrences(db, addDays(today, 1), addDays(today, 8));

  const pendingTasks = await all(db, `SELECT t.*, s.full_name AS student_name FROM tasks t
    JOIN students s ON s.id=t.student_id WHERE t.status='pendiente'
    ORDER BY t.due_date LIMIT 12`);

  const recent = await all(db, CLASS_SELECT + ` ORDER BY c.class_date DESC, c.class_time DESC LIMIT 8`);

  const monthTotal = await first(db, `SELECT COUNT(*) AS n FROM classes
    WHERE status='impartida' AND class_date BETWEEN ? AND ?`, [mStart, mEnd]);

  return json({
    today, year, month,
    income: await incomeSummary(db, today),
    stats: {
      month_total: monthTotal ? monthTotal.n : 0,
      particular: counts.particular || 0,
      grupal: counts.grupal || 0,
      domicilio: counts.domicilio || 0,
      online: counts.online || 0,
      upcoming: upcoming.length,
      pending_tasks: (await first(db, "SELECT COUNT(*) AS n FROM tasks WHERE status='pendiente'")).n
    },
    today_schedules: todaySchedules,
    upcoming: upcoming.slice(0, 8),
    pending_tasks: pendingTasks,
    recent_classes: recent
  });
}

/* -------------------------------- Reportes -------------------------------- */
async function reportHandler(url, env) {
  const db = env.DB;
  const q = url.searchParams;
  const year = Number(q.get('year')) || new Date().getUTCFullYear();
  const month = Number(q.get('month')) || new Date().getUTCMonth() + 1;
  const type = q.get('type');
  const [start, end] = monthBounds(year, month);
  let sql = CLASS_SELECT + ` WHERE c.status='impartida' AND c.class_date BETWEEN ? AND ?`;
  const binds = [start, end];
  if (type) { sql += ' AND c.class_type=?'; binds.push(type); }
  sql += ' ORDER BY c.class_date, c.class_time';
  const rows = await all(db, sql, binds);
  const summary = {
    total: rows.length,
    attendances: rows.reduce((n, r) => n + (r.student_ids_csv ? r.student_ids_csv.split(',').length : 0), 0)
  };
  MODALITIES.forEach(code => { summary[code] = rows.filter(r => r.class_type === code).length; });
  return json({ year, month, from: start, to: end, summary, rows });
}

/* -------------------------------- Historial ------------------------------- */
async function historyHandler(url, env) {
  const db = env.DB;
  const q = url.searchParams;
  let sql = CLASS_SELECT + ' WHERE 1=1';
  const binds = [];
  if (q.get('from')) { sql += ' AND c.class_date>=?'; binds.push(q.get('from')); }
  if (q.get('to')) { sql += ' AND c.class_date<=?'; binds.push(q.get('to')); }
  if (q.get('type')) { sql += ' AND c.class_type=?'; binds.push(q.get('type')); }
  if (q.get('level_id')) { sql += ' AND c.level_id=?'; binds.push(q.get('level_id')); }
  if (q.get('student_id')) {
    sql += ' AND c.id IN (SELECT cs.class_id FROM class_students cs WHERE cs.student_id=?)';
    binds.push(q.get('student_id'));
  }
  sql += ' ORDER BY c.class_date DESC LIMIT 500';
  const classes = await all(db, sql, binds);

  let tsql = `SELECT t.*, s.full_name AS student_name, c.class_date FROM tasks t
    JOIN students s ON s.id=t.student_id LEFT JOIN classes c ON c.id=t.class_id WHERE 1=1`;
  const tbinds = [];
  if (q.get('from')) { tsql += ' AND t.assigned_date>=?'; tbinds.push(q.get('from')); }
  if (q.get('to')) { tsql += ' AND t.assigned_date<=?'; tbinds.push(q.get('to')); }
  if (q.get('student_id')) { tsql += ' AND t.student_id=?'; tbinds.push(q.get('student_id')); }
  if (q.get('type')) { tsql += ' AND c.class_type=?'; tbinds.push(q.get('type')); }
  if (q.get('level_id')) { tsql += ' AND c.level_id=?'; tbinds.push(q.get('level_id')); }
  tsql += ' ORDER BY t.assigned_date DESC LIMIT 500';
  const tasks = await all(db, tsql, tbinds);
  return json({ classes, tasks });
}

/* --------------------------- Respaldo / import ----------------------------- */
async function backupHandler(method, env, request) {
  const db = env.DB;
  if (method === 'GET') {
    const tables = ['levels', 'students', 'program_items', 'schedules', 'classes',
      'class_students', 'schedule_completions', 'tasks', 'modalities', 'income_entries'];
    const snapshot = await db.batch(tables.map(t => db.prepare(`SELECT * FROM ${t}`)));
    const entries = tables.map((t,i) => [t,snapshot[i].results]);
    return json({ version: 1, exported_at: new Date().toISOString(), data: Object.fromEntries(entries) });
  }
  if (method === 'POST') {
    const b = await body(request);
    const list = Array.isArray(b) ? b : (Array.isArray(b.students) ? b.students : []);
    if (!list.length) return fail('No hay estudiantes para importar');
    const statements = [];
    for (const s of list) {
      if (!String(s?.full_name || '').trim()) return fail('Hay un estudiante sin nombre; no se importó el archivo');
      statements.push(db.prepare(`INSERT INTO students
        (full_name, phone, level_id, class_type, usual_day, usual_time, start_date, notes, active)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(
        String(s.full_name).trim(), s.phone || null, s.level_id || null,
        s.class_type || 'particular', s.usual_day || null, s.usual_time || null,
        s.start_date || null, s.notes || null, s.active === 0 ? 0 : 1
      ));
    }
    const results = await db.batch(statements);
    return json({ ok: true, processed: results.reduce((n,r) => n+r.meta.changes,0) });
  }
  return fail('Método no permitido', 405);
}

/* ------------------------------- Modalidades ------------------------------- */
async function modalitiesHandler(method, p, env, request) {
  const db = env.DB;
  if (method === 'GET')
    return json(await all(db, 'SELECT * FROM modalities ORDER BY sort_order, code'));
  if (method === 'PUT' && p[1]) {
    if (!MODALITIES.includes(p[1])) return fail('Modalidad no válida', 404);
    const b = await body(request);
    const hasPrice = Object.prototype.hasOwnProperty.call(b, 'price');
    const price = hasPrice && b.price !== null && b.price !== '' ? Number(b.price) : null;
    if (hasPrice && price !== null && (!Number.isFinite(price) || price < 0))
      return fail('La tarifa debe ser un número mayor o igual a cero');
    const active = [false, 0].includes(b.active) ? 0 : 1;
    const name = String(b.name || '').trim() || modalityLabel(p[1]);
    await run(db, `UPDATE modalities SET name=?, price=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE code=?`,
      [name, price, active, p[1]]);
    return json({ ok: true });
  }
  return fail('Método no permitido', 405);
}

/* -------------------------------- Ingresos -------------------------------- */
async function incomeHandler(url, env) {
  const db = env.DB;
  const q = url.searchParams;
  const today = q.get('today') || new Date().toISOString().slice(0, 10);
  const period = q.get('period') || 'all';
  const year = Number(q.get('year')) || Number(today.slice(0, 4));
  const month = Number(q.get('month')) || Number(today.slice(5, 7));
  let from = q.get('from') || '';
  let to = q.get('to') || '';
  if (!from && !to) {
    if (period === 'day') { from = to = q.get('date') || today; }
    else if (period === 'week') { [from, to] = weekBounds(today); }
    else if (period === 'month') { [from, to] = monthBounds(year, month); }
    else if (period === 'year') { [from, to] = yearBounds(year); }
  }
  let sql = 'SELECT * FROM income_entries WHERE 1=1';
  const binds = [];
  if (from) { sql += ' AND class_date>=?'; binds.push(from); }
  if (to) { sql += ' AND class_date<=?'; binds.push(to); }
  if (q.get('modality')) { sql += ' AND modality_code=?'; binds.push(q.get('modality')); }
  if (q.get('student_id')) {
    sql += " AND (',' || student_ids_csv || ',') LIKE ?";
    binds.push(`%,${q.get('student_id')},%`);
  }
  sql += ' ORDER BY class_date DESC, class_time DESC';
  const rows = await all(db, sql, binds);
  const total = rows.reduce((n, r) => n + Number(r.amount || 0), 0);
  return json({
    today, period, from, to, year, month,
    summary: { ...await incomeSummary(db, today), filtered_total: total, filtered_classes: rows.length },
    rows,
    modalities: await all(db, 'SELECT * FROM modalities ORDER BY sort_order, code')
  });
}

/* --------------------------------- Router --------------------------------- */
export async function onRequest(context) {
  const { request } = context;
  const env = { DB: context.env.piano_manager_db };

  const url = new URL(request.url);
  const p = segments(url);
  const method = request.method;
  try {
    const user = await identity(request, context.env);
    if (!user) return fail('Se requiere acceso autorizado mediante Cloudflare Access.', 403);
    if (method !== 'GET' && request.headers.has('Origin') && request.headers.get('Origin') !== url.origin) return fail('Origen no permitido', 403);
    if (!p.length) return fail('Ruta API no encontrada', 404);

    switch (p[0]) {
      case 'health':
        await first(env.DB, 'SELECT id FROM students LIMIT 1');
        return json({ ok: true, database: 'piano_manager_db' });
      case 'me': return json(user);
      case 'students': return await studentsHandler(method, p, url, env, request);
      case 'levels': return await levelsHandler(method, p, env, request);
      case 'program': return await programHandler(method, p, url, env, request);
      case 'schedules': return await schedulesHandler(method, p, url, env, request);
      case 'classes': return await classesHandler(method, p, url, env, request);
      case 'attendance': return await attendanceHandler(url, env);
      case 'tasks': return await tasksHandler(method, p, url, env, request);
      case 'dashboard': return await dashboardHandler(url, env);
      case 'reports':
        if (p[1] === 'monthly') return await reportHandler(url, env);
        return fail('Ruta no encontrada', 404);
      case 'history': return await historyHandler(url, env);
      case 'modalities': return await modalitiesHandler(method, p, env, request);
      case 'income': return await incomeHandler(url, env);
      case 'backup': return await backupHandler(method, env, request);
      default: return fail('Ruta no encontrada', 404);
    }
  } catch (e) {
    if (/unique constraint/i.test(String(e))) return fail('Este registro ya existe',409);
    if (/constraint/i.test(String(e))) return fail('Revisa los valores y las referencias del registro');
    return fail('No se pudo completar la operación en D1', 503);
  }
}
