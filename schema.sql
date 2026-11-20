-- Piano Class Manager — esquema D1 / SQLite
-- Ejecutar: npm run db:init (local) o npm run db:init:remote (producción)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS levels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  level_id    INTEGER REFERENCES levels(id) ON DELETE SET NULL,
  class_type  TEXT NOT NULL CHECK (class_type IN ('particular', 'grupal', 'domicilio', 'online')),
  usual_day   INTEGER CHECK (usual_day BETWEEN 1 AND 7),
  usual_time  TEXT,
  start_date  TEXT,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_unique
  ON students(full_name, COALESCE(phone, ''));
CREATE INDEX IF NOT EXISTS idx_students_active ON students(active);

CREATE TABLE IF NOT EXISTS program_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level_id    INTEGER NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  unit        TEXT NOT NULL,
  topic       TEXT NOT NULL,
  content     TEXT,
  objectives  TEXT,
  exercises   TEXT,
  pieces      TEXT,
  notes       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (level_id, unit, topic)
);
CREATE INDEX IF NOT EXISTS idx_program_level ON program_items(level_id, unit);

CREATE TABLE IF NOT EXISTS schedules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_ids   TEXT NOT NULL DEFAULT '[]',
  level_id      INTEGER REFERENCES levels(id) ON DELETE SET NULL,
  topic_id      INTEGER REFERENCES program_items(id) ON DELETE SET NULL,
  class_type    TEXT NOT NULL CHECK (class_type IN ('particular', 'grupal', 'domicilio', 'online')),
  weekday       INTEGER CHECK (weekday BETWEEN 1 AND 7),
  time          TEXT NOT NULL,
  duration_min  INTEGER NOT NULL DEFAULT 60,
  specific_date TEXT,
  repeat_weekly INTEGER NOT NULL DEFAULT 0,
  start_date    TEXT,
  end_date      TEXT,
  notes         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  copied_from   INTEGER,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(active);

CREATE TABLE IF NOT EXISTS classes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  class_date   TEXT NOT NULL,
  class_time   TEXT NOT NULL,
  class_type   TEXT NOT NULL CHECK (class_type IN ('particular', 'grupal', 'domicilio', 'online')),
  level_id     INTEGER REFERENCES levels(id) ON DELETE SET NULL,
  topic_id     INTEGER REFERENCES program_items(id) ON DELETE SET NULL,
  schedule_id  INTEGER REFERENCES schedules(id) ON DELETE SET NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  content      TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'impartida'
               CHECK (status IN ('impartida', 'cancelada', 'reprogramada')),
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(class_date);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status, class_date);

CREATE TABLE IF NOT EXISTS class_students (
  class_id   INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance TEXT NOT NULL DEFAULT 'presente'
             CHECK (attendance IN ('presente', 'ausente', 'justificada')),
  PRIMARY KEY (class_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_class_students_student ON class_students(student_id);

CREATE TABLE IF NOT EXISTS schedule_completions (
  schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  class_date  TEXT NOT NULL,
  class_id    INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  PRIMARY KEY (schedule_id, class_date)
);

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id      INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  assigned_date TEXT NOT NULL,
  description   TEXT NOT NULL,
  due_date      TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (status IN ('pendiente', 'revisada', 'completada')),
  review_notes  TEXT,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status);
CREATE INDEX IF NOT EXISTS idx_tasks_student ON tasks(student_id);

-- Preparado para acceso con usuario/contraseña en el futuro.
-- Hoy la autenticación la gestiona Cloudflare Access.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'owner',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Control de ingresos (migración 001)
-- ---------------------------------------------------------------------------

-- Tarifas configurables. price = NULL significa "sin tarifa configurada".
CREATE TABLE IF NOT EXISTS modalities (
  code        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price       REAL,
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO modalities(code, name, price, active, sort_order) VALUES
  ('particular', 'Particular', 600, 1, 1),
  ('grupal', 'Grupal', 800, 1, 2),
  ('domicilio', 'A domicilio', NULL, 1, 3),
  ('online', 'Online', NULL, 1, 4);

-- Un ingreso por clase impartida. rate/amount se congelan al impartir la clase.
CREATE TABLE IF NOT EXISTS income_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id       INTEGER NOT NULL UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
  class_date     TEXT NOT NULL,
  class_time     TEXT NOT NULL,
  modality_code  TEXT NOT NULL,
  modality_name  TEXT NOT NULL,
  student_names  TEXT,
  student_ids_csv TEXT NOT NULL DEFAULT '',
  rate           REAL NOT NULL,
  amount         REAL NOT NULL,
  status         TEXT NOT NULL DEFAULT 'impartida',
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_income_date ON income_entries(class_date);
CREATE INDEX IF NOT EXISTS idx_income_modality ON income_entries(modality_code, class_date);
