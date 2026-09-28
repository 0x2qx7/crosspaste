-- CrossPaste custom commands migration.
-- Adds custom_commands table.

CREATE TABLE IF NOT EXISTS custom_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Общее',
  command TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_commands_created_at ON custom_commands (created_at DESC);
