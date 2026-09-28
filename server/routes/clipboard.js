import { Router } from 'express';
import {
  saveClipboard,
  clearClipboard,
  getClipboardHistory,
  deleteHistoryEntry,
  clearClipboardHistory,
  getPinnedSnippets,
  addPinnedSnippet,
  deletePinnedSnippet,
  getCustomCommands,
  addCustomCommand,
  deleteCustomCommand,
  updateCustomCommand,
  reorderCommands,
} from '../services/clipboard-service.js';
import { validateClipboardPayload, validateForceClipboardPayload } from '../middleware/validation.js';
import { writeRateLimiter } from '../middleware/rate-limits.js';
import { noCacheForMutableData } from '../middleware/security.js';
import { broadcast } from '../services/realtime-service.js';
import { logger } from '../utilities/logger.js';

export const clipboardRouter = Router();

clipboardRouter.put('/clipboard', writeRateLimiter, noCacheForMutableData, (req, res, next) => {
  try {
    const { html, baseRevision } = validateClipboardPayload(req.body);
    const saved = saveClipboard({ html, baseRevision, force: false });
    broadcast('text-updated', saved);
    broadcast('history-updated', { history: getClipboardHistory() });
    logger.info('Clipboard text saved', { revision: saved.revision });
    res.json({ clipboard: saved });
  } catch (error) {
    next(error);
  }
});

clipboardRouter.post('/clipboard/force', writeRateLimiter, noCacheForMutableData, (req, res, next) => {
  try {
    const { html } = validateForceClipboardPayload(req.body);
    const saved = saveClipboard({ html, baseRevision: null, force: true });
    broadcast('text-updated', saved);
    broadcast('history-updated', { history: getClipboardHistory() });
    logger.info('Clipboard text force-saved', { revision: saved.revision });
    res.json({ clipboard: saved });
  } catch (error) {
    next(error);
  }
});

clipboardRouter.post('/clipboard/clear', writeRateLimiter, noCacheForMutableData, (_req, res, next) => {
  try {
    const cleared = clearClipboard();
    broadcast('text-updated', cleared);
    logger.info('Clipboard text cleared', { revision: cleared.revision });
    res.json({ clipboard: cleared });
  } catch (error) {
    next(error);
  }
});

clipboardRouter.get('/history', noCacheForMutableData, (_req, res) => {
  res.json({ history: getClipboardHistory() });
});

clipboardRouter.delete('/history/:id', writeRateLimiter, noCacheForMutableData, (req, res) => {
  const id = Number(req.params.id);
  const history = deleteHistoryEntry(id);
  broadcast('history-updated', { history });
  res.json({ history });
});

clipboardRouter.delete('/history', writeRateLimiter, noCacheForMutableData, (_req, res) => {
  const history = clearClipboardHistory();
  broadcast('history-updated', { history });
  res.json({ history });
});

clipboardRouter.get('/pins', noCacheForMutableData, (_req, res) => {
  res.json({ pins: getPinnedSnippets() });
});

clipboardRouter.post('/pins', writeRateLimiter, noCacheForMutableData, (req, res, next) => {
  try {
    const { title, text, html } = req.body || {};
    if (!text && !html) {
      return res.status(400).json({ error: 'Текст заметки не может быть пустым' });
    }
    const snippet = addPinnedSnippet({ title, text, html });
    const pins = getPinnedSnippets();
    broadcast('pins-updated', { pins });
    res.status(201).json({ snippet, pins });
  } catch (err) {
    next(err);
  }
});

clipboardRouter.delete('/pins/:id', writeRateLimiter, noCacheForMutableData, (req, res) => {
  const id = Number(req.params.id);
  const pins = deletePinnedSnippet(id);
  broadcast('pins-updated', { pins });
  res.json({ pins });
});

clipboardRouter.get('/commands', noCacheForMutableData, (_req, res) => {
  res.json({ commands: getCustomCommands() });
});

clipboardRouter.post('/commands', writeRateLimiter, noCacheForMutableData, (req, res, next) => {
  try {
    const { title, category, command } = req.body || {};
    if (!command || !command.trim()) {
      return res.status(400).json({ error: 'Текст команды не может быть пустым' });
    }
    const item = addCustomCommand({ title, category, command });
    const commands = getCustomCommands();
    broadcast('commands-updated', { commands });
    res.status(201).json({ item, commands });
  } catch (err) {
    next(err);
  }
});

clipboardRouter.put('/commands/reorder', writeRateLimiter, noCacheForMutableData, (req, res, next) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return res.status(400).json({ error: 'orderedIds must be a non-empty array' });
    }
    const ids = orderedIds.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'orderedIds contains no valid IDs' });
    }
    const commands = reorderCommands(ids);
    broadcast('commands-updated', { commands });
    res.json({ commands });
  } catch (err) {
    next(err);
  }
});

clipboardRouter.put('/commands/:id', writeRateLimiter, noCacheForMutableData, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { title, category, command } = req.body || {};
    if (!command || !command.trim()) {
      return res.status(400).json({ error: 'Текст команды не может быть пустым' });
    }
    const commands = updateCustomCommand(id, { title, category, command });
    broadcast('commands-updated', { commands });
    res.json({ commands });
  } catch (err) {
    next(err);
  }
});

clipboardRouter.delete('/commands/:id', writeRateLimiter, noCacheForMutableData, (req, res) => {
  const id = Number(req.params.id);
  const commands = deleteCustomCommand(id);
  broadcast('commands-updated', { commands });
  res.json({ commands });
});

