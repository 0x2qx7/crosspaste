import { getDatabase } from '../database.js';
import { config } from '../config.js';
import { sanitiseHtml, extractPlainText, countCharacters } from '../utilities/sanitise.js';

export class TextTooLargeError extends Error {
  constructor(characterCount) {
    super('Превышен лимит длины текста');
    this.name = 'TextTooLargeError';
    this.characterCount = characterCount;
  }
}

export class RevisionConflictError extends Error {
  constructor(current) {
    super('На сервере уже есть более новая версия');
    this.name = 'RevisionConflictError';
    this.current = current;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function readRow(db) {
  return db.prepare('SELECT * FROM clipboard WHERE id = 1').get();
}

export function getClipboardState() {
  const db = getDatabase();
  const row = readRow(db);
  return toPublicShape(row);
}

function toPublicShape(row) {
  return {
    contentHtml: row.content_html,
    contentPlain: row.content_plain,
    characterCount: row.character_count,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

/**
 * Saves the clipboard when the caller's baseRevision matches the server's current
 * revision. A stale baseRevision means another device saved in the meantime, so the
 * write is rejected with a RevisionConflictError instead of silently overwriting it.
 */
export function saveClipboard({ html, baseRevision, force = false }) {
  const db = getDatabase();
  const clean = sanitiseHtml(html);
  const plainText = extractPlainText(clean);
  const characterCount = countCharacters(plainText);

  if (config.textCharacterLimit > 0 && characterCount > config.textCharacterLimit) {
    throw new TextTooLargeError(characterCount);
  }

  const transaction = db.transaction(() => {
    const current = readRow(db);

    if (!force && baseRevision !== current.revision) {
      throw new RevisionConflictError(toPublicShape(current));
    }

    const nextRevision = current.revision + 1;
    const timestamp = nowIso();

    db.prepare(
      `UPDATE clipboard
       SET content_html = ?, content_plain = ?, character_count = ?, revision = ?, updated_at = ?
       WHERE id = 1`
    ).run(clean, plainText, characterCount, nextRevision, timestamp);

    if (plainText.trim().length > 0) {
      addHistoryEntryInternal(db, { html: clean, plainText, characterCount, timestamp });
    }

    return toPublicShape(readRow(db));
  });

  return transaction();
}

function addHistoryEntryInternal(db, { html, plainText, characterCount, timestamp }) {
  const currentIso = timestamp || nowIso();
  const last = db.prepare('SELECT id, content_plain, created_at FROM clipboard_history ORDER BY id DESC LIMIT 1').get();

  if (!last) {
    db.prepare(
      'INSERT INTO clipboard_history (content_html, content_plain, character_count, created_at) VALUES (?, ?, ?, ?)'
    ).run(html, plainText, characterCount, currentIso);
    return;
  }

  // Exact same content: ignore
  if (last.content_plain === plainText) {
    return;
  }

  const lastTime = new Date(last.created_at).getTime();
  const nowTime = new Date(currentIso).getTime();
  const timeDiffSec = isNaN(lastTime) ? 999 : (nowTime - lastTime) / 1000;

  // If edited within 45 seconds as part of a continuous typing session:
  // Update the latest history record with the latest content instead of cluttering history!
  const isContinuousSession = timeDiffSec >= 0 && timeDiffSec < 45;

  if (isContinuousSession) {
    db.prepare(
      'UPDATE clipboard_history SET content_html = ?, content_plain = ?, character_count = ?, created_at = ? WHERE id = ?'
    ).run(html, plainText, characterCount, currentIso, last.id);
  } else {
    db.prepare(
      'INSERT INTO clipboard_history (content_html, content_plain, character_count, created_at) VALUES (?, ?, ?, ?)'
    ).run(html, plainText, characterCount, currentIso);

    db.prepare(
      'DELETE FROM clipboard_history WHERE id NOT IN (SELECT id FROM clipboard_history ORDER BY id DESC LIMIT 30)'
    ).run();
  }
}

export function getClipboardHistory() {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM clipboard_history ORDER BY id DESC LIMIT 30').all();
  return rows.map((r) => ({
    id: r.id,
    contentHtml: r.content_html,
    contentPlain: r.content_plain,
    characterCount: r.character_count,
    createdAt: r.created_at,
  }));
}

export function deleteHistoryEntry(id) {
  const db = getDatabase();
  db.prepare('DELETE FROM clipboard_history WHERE id = ?').run(id);
  return getClipboardHistory();
}

export function clearClipboardHistory() {
  const db = getDatabase();
  db.prepare('DELETE FROM clipboard_history').run();
  return [];
}

export function getPinnedSnippets() {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM pinned_snippets ORDER BY id DESC').all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    contentText: r.content_text,
    contentHtml: r.content_html,
    createdAt: r.created_at,
  }));
}

export function addPinnedSnippet({ title, text, html }) {
  const db = getDatabase();
  const clean = sanitiseHtml(html || text || '');
  const plainText = text || extractPlainText(clean);
  const snippetTitle = (title || plainText.split('\n')[0] || 'Заметка').trim().slice(0, 100);
  const timestamp = nowIso();

  const info = db.prepare(
    'INSERT INTO pinned_snippets (title, content_text, content_html, created_at) VALUES (?, ?, ?, ?)'
  ).run(snippetTitle, plainText, clean, timestamp);

  return {
    id: info.lastInsertRowid,
    title: snippetTitle,
    contentText: plainText,
    contentHtml: clean,
    createdAt: timestamp,
  };
}

export function deletePinnedSnippet(id) {
  const db = getDatabase();
  db.prepare('DELETE FROM pinned_snippets WHERE id = ?').run(id);
  return getPinnedSnippets();
}

export function getCustomCommands() {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM custom_commands ORDER BY sort_order DESC, id DESC').all();
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    command: r.command,
    createdAt: r.created_at,
    sortOrder: r.sort_order,
    isCustom: true,
  }));
}

export function addCustomCommand({ title, category, command }) {
  const db = getDatabase();
  const cmdTitle = (title || 'Команда').trim().slice(0, 100);
  const cmdCategory = (category || 'Пользовательские').trim().slice(0, 50);
  const cmdBody = (command || '').trim();
  const timestamp = nowIso();

  // New commands get the highest sort_order so they appear first
  const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM custom_commands').get();
  const nextOrder = maxRow.next_order;

  const info = db.prepare(
    'INSERT INTO custom_commands (title, category, command, created_at, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(cmdTitle, cmdCategory, cmdBody, timestamp, nextOrder);

  return {
    id: info.lastInsertRowid,
    title: cmdTitle,
    category: cmdCategory,
    command: cmdBody,
    createdAt: timestamp,
    sortOrder: nextOrder,
    isCustom: true,
  };
}

export function deleteCustomCommand(id) {
  const db = getDatabase();
  db.prepare('DELETE FROM custom_commands WHERE id = ?').run(id);
  return getCustomCommands();
}

export function updateCustomCommand(id, { title, category, command }) {
  const db = getDatabase();
  const cmdTitle = (title || 'Команда').trim().slice(0, 100);
  const cmdCategory = (category || 'Пользовательские').trim().slice(0, 50);
  const cmdBody = (command || '').trim();

  db.prepare(
    'UPDATE custom_commands SET title = ?, category = ?, command = ? WHERE id = ?'
  ).run(cmdTitle, cmdCategory, cmdBody, id);

  return getCustomCommands();
}

export function reorderCommands(orderedIds) {
  const db = getDatabase();
  const stmt = db.prepare('UPDATE custom_commands SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => {
    // First id in the array = topmost card = highest sort_order
    const total = ids.length;
    for (let i = 0; i < total; i++) {
      stmt.run(total - i, ids[i]);
    }
  });
  tx(orderedIds);
  return getCustomCommands();
}

export function clearClipboard() {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const current = readRow(db);
    const nextRevision = current.revision + 1;
    const timestamp = nowIso();
    db.prepare(
      `UPDATE clipboard
       SET content_html = '', content_plain = '', character_count = 0, revision = ?, updated_at = ?
       WHERE id = 1`
    ).run(nextRevision, timestamp);
    return toPublicShape(readRow(db));
  });
  return transaction();
}

export function expireClipboardIfOlderThan(cutoffIso) {
  const db = getDatabase();
  const transaction = db.transaction(() => {
    const current = readRow(db);
    if (current.character_count === 0) return null;
    if (current.updated_at >= cutoffIso) return null;

    const nextRevision = current.revision + 1;
    const timestamp = nowIso();
    db.prepare(
      `UPDATE clipboard
       SET content_html = '', content_plain = '', character_count = 0, revision = ?, updated_at = ?
       WHERE id = 1`
    ).run(nextRevision, timestamp);
    return toPublicShape(readRow(db));
  });
  return transaction();
}
