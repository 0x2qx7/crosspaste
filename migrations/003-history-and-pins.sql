-- CrossPaste history and pinned snippets migration.
-- Adds clipboard_history and pinned_snippets tables.

CREATE TABLE IF NOT EXISTS clipboard_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_html TEXT NOT NULL,
  content_plain TEXT NOT NULL,
  character_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clipboard_history_created_at ON clipboard_history (created_at DESC);

CREATE TABLE IF NOT EXISTS pinned_snippets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  content_html TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pinned_snippets_created_at ON pinned_snippets (created_at DESC);
