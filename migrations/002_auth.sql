-- Piano Class Manager — migración 002: autenticación propia
-- Aditiva y reversible: solo CREA tablas nuevas, no altera ni elimina datos existentes.
-- La tabla users y sessions ya existen en el esquema base y se reutilizan tal cual.
-- Aplicar en local: npm run db:migrate
-- La D1 remota NO se modifica automáticamente.

-- Intentos de inicio de sesión: control de fuerza bruta por IP + identificador.
CREATE TABLE IF NOT EXISTS login_attempts (
  key          TEXT PRIMARY KEY,
  attempts     INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tokens de un solo uso para restablecer contraseña (siempre guardados con hash).
CREATE TABLE IF NOT EXISTS password_resets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, expires_at);

-- Dueño de cada registro privado. Preparado para varios usuarios/roles.
-- entity_type: student | schedule | class | task | level | program_item
CREATE TABLE IF NOT EXISTS record_owners (
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_record_owners_owner ON record_owners(owner_id, entity_type);

INSERT OR IGNORE INTO schema_migrations(version) VALUES ('002_auth');
