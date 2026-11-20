-- Piano Class Manager — migración 001: control de ingresos por clase
-- Segura para aplicar sobre una base existente: copia todas las filas, no borra datos.
-- Aplicar en local: npm run db:migrate
-- La D1 remota NO se modifica automáticamente.

-- D1 ejecuta el archivo completo en una sola transacción; no incluir PRAGMA ni BEGIN.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Catálogo de modalidades. price = NULL significa "sin tarifa configurada".
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

-- Ingresos: una fila por clase impartida. El importe se congela al impartir la clase.
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

-- Ampliar class_type a cuatro modalidades reconstruyendo las tablas y copiando los datos.
DROP TABLE IF EXISTS students_new;
CREATE TABLE students_new (
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
INSERT INTO students_new SELECT * FROM students;
DROP TABLE students;
ALTER TABLE students_new RENAME TO students;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_unique ON students(full_name, COALESCE(phone, ''));
CREATE INDEX IF NOT EXISTS idx_students_active ON students(active);

DROP TABLE IF EXISTS schedules_new;
CREATE TABLE schedules_new (
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
INSERT INTO schedules_new SELECT * FROM schedules;
DROP TABLE schedules;
ALTER TABLE schedules_new RENAME TO schedules;
CREATE INDEX IF NOT EXISTS idx_schedules_active ON schedules(active);

DROP TABLE IF EXISTS classes_new;
CREATE TABLE classes_new (
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
INSERT INTO classes_new SELECT * FROM classes;
DROP TABLE classes;
ALTER TABLE classes_new RENAME TO classes;
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(class_date);
CREATE INDEX IF NOT EXISTS idx_classes_status ON classes(status, class_date);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('001_income');
