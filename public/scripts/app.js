import * as api from './api.js';
import { createEditor } from './editor.js';
import { readClipboardIntoEditor, copyEditorContent } from './clipboard.js';
import { createImagePanel } from './images.js';
import { createFilePanel } from './files.js';
import { startRealtime } from './realtime.js';
import { saveLocalRecovery, loadLocalRecovery, clearLocalRecovery } from './recovery.js';
import { createHistoryPinsModule } from './history-pins.js';
import {
  debounce,
  setConnectionStatus,
  setSaveStatus,
  setLastUpdated,
  announce,
  showPanel,
  hidePanel,
  showInlineMessage,
  hideInlineMessage,
} from './ui.js';

const DEFAULT_AUTOSAVE_DELAY_MS = 800;
const WARNING_THRESHOLD_RATIO = 0.9;

const editorContainerEl = document.getElementById('editor-container');
const charCounterEl = document.getElementById('char-counter');
const limitWarningEl = document.getElementById('limit-warning');
const pasteFallbackEl = document.getElementById('paste-fallback-message');
const copyFallbackEl = document.getElementById('copy-fallback-message');

const conflictPanelEl = document.getElementById('conflict-panel');
const recoveryPanelEl = document.getElementById('recovery-panel');
const clearTextPanelEl = document.getElementById('clear-text-panel');
let textCharacterLimit = 0;
let serverRevision = 0;
let isDirty = false;
let saveInFlight = false;
let pendingRemoteClipboard = null;

function updateToolbarStates() {
  const active = editor.queryActiveCommands();
  document.querySelectorAll('.toolbar-button[data-command]').forEach((button) => {
    const cmd = button.dataset.command;
    if (active[cmd] !== undefined) {
      button.classList.toggle('is-active', Boolean(active[cmd]));
      button.setAttribute('aria-pressed', String(Boolean(active[cmd])));
    }
  });
}

function updateCharCounter() {
  const plainText = editor.getPlainText();
  const count = plainText.length;
  const words = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;
  const lines = plainText ? plainText.split('\n').length : (count > 0 ? 1 : 0);

  const stats = `${count.toLocaleString()} симв. • ${words.toLocaleString()} сл. • ${lines.toLocaleString()} стр.`;
  if (textCharacterLimit > 0) {
    charCounterEl.textContent = `${count.toLocaleString()} / ${textCharacterLimit.toLocaleString()} симв. • ${words.toLocaleString()} сл. • ${lines.toLocaleString()} стр.`;
  } else {
    charCounterEl.textContent = stats;
  }

  if (textCharacterLimit > 0 && count > textCharacterLimit) {
    showInlineMessage(
      limitWarningEl,
      `Превышен лимит ${textCharacterLimit.toLocaleString()} символов. Сократите текст для сохранения.`
    );
  } else if (textCharacterLimit > 0 && count > textCharacterLimit * WARNING_THRESHOLD_RATIO) {
    showInlineMessage(limitWarningEl, `Вы приближаетесь к лимиту ${textCharacterLimit.toLocaleString()} символов.`);
  } else {
    hideInlineMessage(limitWarningEl);
  }
  return count;
}

const editor = createEditor(editorContainerEl, {
  onChange: () => {
    isDirty = true;
    setSaveStatus('unsaved');
    const count = updateCharCounter();
    updateToolbarStates();
    saveLocalRecovery({
      contentHtml: editor.getHtml(),
      contentPlain: editor.getPlainText(),
      lastKnownServerRevision: serverRevision,
    });
    if (textCharacterLimit === 0 || count <= textCharacterLimit) {
      scheduleAutosave();
    }
  },
});

const historyPins = createHistoryPinsModule({
  onRestore: ({ contentHtml, contentPlain }) => {
    editor.setHtml(contentHtml || contentPlain);
    isDirty = true;
    updateCharCounter();
    setSaveStatus('unsaved');
    scheduleAutosave();
  },
  onInsertCommand: (command) => {
    const curPlain = editor.getPlainText().trim();
    const curHtml = editor.getHtml();
    const escaped = String(command)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const codeHtml = `<pre><code>${escaped}</code></pre><p><br></p>`;
    if (!curPlain) {
      editor.setHtml(codeHtml);
    } else {
      editor.setHtml(curHtml + `<p><br></p>` + codeHtml);
    }
    isDirty = true;
    updateCharCounter();
    setSaveStatus('unsaved');
    scheduleAutosave();
  },
});

document.addEventListener('selectionchange', updateToolbarStates);

let scheduleAutosave = debounce(() => {
  autosave();
}, DEFAULT_AUTOSAVE_DELAY_MS);

async function autosave() {
  if (saveInFlight || !isDirty) return;
  const html = editor.getHtml();
  const plainText = editor.getPlainText();
  if (textCharacterLimit > 0 && plainText.length > textCharacterLimit) {
    setSaveStatus('error');
    return;
  }

  saveInFlight = true;
  setSaveStatus('saving');
  try {
    const { clipboard } = await api.saveClipboard(html, serverRevision);
    serverRevision = clipboard.revision;
    isDirty = editor.getHtml() !== html;
    setLastUpdated(clipboard.updatedAt);
    setSaveStatus(isDirty ? 'unsaved' : 'saved');
    if (isDirty) scheduleAutosave();
    else clearLocalRecovery();
  } catch (error) {
    if (error.code === 'REVISION_CONFLICT') {
      pendingRemoteClipboard = error.details?.current;
      setSaveStatus('conflict');
      showPanel(conflictPanelEl);
      return;
    }
    if (error.code === 'TEXT_TOO_LARGE') {
      setSaveStatus('error');
      showInlineMessage(limitWarningEl, 'Текст слишком большой для сохранения. Сократите его.');
      return;
    }
    if (error.code === 'NETWORK_ERROR') {
      setSaveStatus('offline');
      return;
    }
    setSaveStatus('error');
  } finally {
    saveInFlight = false;
  }
}

function applyServerClipboard(clipboard) {
  editor.setHtml(clipboard.contentHtml);
  serverRevision = clipboard.revision;
  isDirty = false;
  updateCharCounter();
  setLastUpdated(clipboard.updatedAt);
  setSaveStatus('saved');
  clearLocalRecovery();
}

// Toolbar wiring
document.querySelectorAll('.toolbar-button[data-command]').forEach((button) => {
  button.addEventListener('click', () => editor.execToolbarCommand(button.dataset.command));
});

document.querySelector('[data-action="paste-text"]').addEventListener('click', async () => {
  hideInlineMessage(pasteFallbackEl);
  const result = await readClipboardIntoEditor(editor);
  if (!result.ok) {
    showInlineMessage(
      pasteFallbackEl,
      'Браузер не разрешил прямое чтение буфера. Нажмите в поле ввода и используйте Ctrl+V или меню браузера.'
    );
  }
});

document.querySelector('[data-action="copy-text"]').addEventListener('click', async () => {
  hideInlineMessage(copyFallbackEl);
  const result = await copyEditorContent(editor.getHtml(), editor.getPlainText());
  if (result.ok) {
    const btn = document.querySelector('[data-action="copy-text"]');
    const label = btn ? btn.querySelector('.toolbar-button__label') : null;
    const origText = label ? label.textContent : '';
    if (btn) btn.classList.add('is-success');
    if (label) label.textContent = '✓ Скопировано!';
    setTimeout(() => {
      if (btn) btn.classList.remove('is-success');
      if (label) label.textContent = origText;
    }, 1500);
    announce('Текст скопирован');
  } else {
    showInlineMessage(copyFallbackEl, 'Не удалось скопировать автоматически. Выделите текст и нажмите Ctrl+C.');
    editor.selectAll();
  }
});

document.querySelector('[data-action="clear-text"]').addEventListener('click', () => {
  showPanel(clearTextPanelEl);
});

document.getElementById('clear-text-confirm').addEventListener('click', async () => {
  hidePanel(clearTextPanelEl);
  try {
    const { clipboard } = await api.clearClipboard();
    applyServerClipboard(clipboard);
    announce('Текст очищен');
  } catch {
    setSaveStatus('error');
  }
});

document.getElementById('clear-text-cancel').addEventListener('click', () => hidePanel(clearTextPanelEl));

// Conflict resolution
document.getElementById('conflict-keep-local').addEventListener('click', async () => {
  hidePanel(conflictPanelEl);
  try {
    const { clipboard } = await api.forceSaveClipboard(editor.getHtml());
    serverRevision = clipboard.revision;
    isDirty = false;
    setLastUpdated(clipboard.updatedAt);
    setSaveStatus('saved');
    clearLocalRecovery();
    pendingRemoteClipboard = null;
  } catch {
    setSaveStatus('error');
  }
});

document.getElementById('conflict-load-server').addEventListener('click', () => {
  hidePanel(conflictPanelEl);
  if (pendingRemoteClipboard) {
    applyServerClipboard(pendingRemoteClipboard);
    pendingRemoteClipboard = null;
  }
});

document.getElementById('conflict-copy-local').addEventListener('click', async () => {
  const result = await copyEditorContent(editor.getHtml(), editor.getPlainText());
  announce(result.ok ? 'Ваша версия скопирована' : 'Выделите текст и скопируйте через Ctrl+C.');
});

// Local recovery
let recoveredContent = null;
document.getElementById('recovery-restore').addEventListener('click', () => {
  if (recoveredContent) {
    editor.setHtml(recoveredContent.contentHtml);
    isDirty = true;
    updateCharCounter();
    setSaveStatus('unsaved');
    scheduleAutosave();
  }
  hidePanel(recoveryPanelEl);
});
document.getElementById('recovery-discard').addEventListener('click', () => {
  clearLocalRecovery();
  hidePanel(recoveryPanelEl);
});

// Image panel
const imagePanel = createImagePanel({
  pasteImageButton: document.getElementById('paste-image-button'),
  fileInput: document.getElementById('image-file-input'),
  copyButton: document.getElementById('copy-image-button'),
  downloadButton: document.getElementById('download-image-button'),
  deleteButton: document.getElementById('delete-image-button'),
  countStatus: document.getElementById('image-count-status'),
  limitMessage: document.getElementById('image-limit-message'),
  errorMessage: document.getElementById('image-error-message'),
  dropzone: document.getElementById('image-dropzone'),
  grid: document.getElementById('image-grid'),
  emptyState: document.getElementById('image-empty-state'),
  deletePanel: document.getElementById('delete-image-panel'),
  deleteConfirm: document.getElementById('delete-image-confirm'),
  deleteCancel: document.getElementById('delete-image-cancel'),
});

document.addEventListener('paste', (event) => {
  if (editorContainerEl.contains(document.activeElement) || document.activeElement === editorContainerEl) return;
  imagePanel.uploadFiles(
    Array.from(event.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
  );
});

async function refreshImages() {
  try {
    const state = await api.fetchState();
    imagePanel.setImages(state.images, state.limits);
  } catch {
    // Ignore transient error
  }
}

// File panel
const filePanel = createFilePanel(
  {
    list: document.getElementById('file-list'),
    emptyState: document.getElementById('file-empty-state'),
    downloadButton: document.getElementById('download-file-button'),
    deleteButton: document.getElementById('delete-file-button'),
    countStatus: document.getElementById('file-count-status'),
    limitMessage: document.getElementById('file-limit-message'),
    errorMessage: document.getElementById('file-error-message'),
    fileInput: document.getElementById('file-file-input'),
    dropzone: document.getElementById('file-dropzone'),
    deletePanel: document.getElementById('delete-file-panel'),
    deleteFilename: document.getElementById('delete-file-name'),
    deleteConfirm: document.getElementById('delete-file-confirm'),
    deleteCancel: document.getElementById('delete-file-cancel'),
  },
  {
    onImageFiles: (images) => imagePanel.uploadFiles(images),
  }
);

async function refreshFiles() {
  try {
    const state = await api.fetchState();
    filePanel.setFiles(state.files, state.limits);
  } catch {
    // Ignore transient error
  }
}

// Realtime sync
startRealtime({
  onConnected: async () => {
    setConnectionStatus('connected');
    try {
      const state = await api.fetchState();
      if (state.clipboard.revision !== serverRevision) {
        if (!isDirty) {
          applyServerClipboard(state.clipboard);
        } else {
          pendingRemoteClipboard = state.clipboard;
          setSaveStatus('remote-update');
        }
      }
      historyPins.setHistory(state.history);
      historyPins.setCommands(state.commands);
      imagePanel.setImages(state.images, state.limits);
      filePanel.setFiles(state.files, state.limits);
    } catch {
      // Reconnect reconciliation retry next time
    }
  },
  onDisconnected: () => setConnectionStatus('offline'),
  onTextUpdated: (clipboard) => {
    if (clipboard.revision <= serverRevision) return;
    if (!isDirty) {
      applyServerClipboard(clipboard);
    } else {
      pendingRemoteClipboard = clipboard;
      setSaveStatus('remote-update');
    }
  },
  onHistoryUpdated: ({ history }) => {
    historyPins.setHistory(history);
  },
  onCommandsUpdated: ({ commands }) => {
    historyPins.setCommands(commands);
  },
  onImagesChanged: () => {
    refreshImages();
  },
  onFilesChanged: () => {
    refreshFiles();
  },
});

window.addEventListener('online', () => {
  if (isDirty) autosave();
});

document.getElementById('refresh-button').addEventListener('click', async () => {
  try {
    const state = await api.fetchState();
    if (!isDirty) {
      applyServerClipboard(state.clipboard);
    } else {
      pendingRemoteClipboard = state.clipboard;
      setSaveStatus('remote-update');
    }
    historyPins.setHistory(state.history);
    historyPins.setCommands(state.commands);
    imagePanel.setImages(state.images, state.limits);
    filePanel.setFiles(state.files, state.limits);
    announce('Обновлено');
  } catch {
    setSaveStatus('offline');
  }
});

async function init() {
  setConnectionStatus('connecting');
  setSaveStatus('idle');

  try {
    const state = await api.fetchState();
    textCharacterLimit = state.limits.textCharacterLimit;
    if (state.settings?.autosaveDelayMs) {
      scheduleAutosave = debounce(() => autosave(), state.settings.autosaveDelayMs);
    }

    const localRecovery = loadLocalRecovery();
    if (localRecovery && localRecovery.contentPlain?.trim().length > 0) {
      editor.setHtml(state.clipboard.contentHtml);
      serverRevision = state.clipboard.revision;
      setLastUpdated(state.clipboard.updatedAt);
      setSaveStatus('saved');
      recoveredContent = localRecovery;
      showPanel(recoveryPanelEl);
    } else {
      applyServerClipboard(state.clipboard);
    }

    updateCharCounter();
    historyPins.setHistory(state.history);
    historyPins.setCommands(state.commands);
    imagePanel.setImages(state.images, state.limits);
    filePanel.setFiles(state.files, state.limits);
  } catch {
    setConnectionStatus('offline');
    setSaveStatus('offline');
  }
}

init();

// Fullscreen Drag-and-Drop file/image upload
const fullscreenDragOverlay = document.getElementById('fullscreen-drag-overlay');
let dragCounter = 0;

function hasFiles(event) {
  if (!event.dataTransfer || !event.dataTransfer.types) return false;
  return Array.from(event.dataTransfer.types).includes('Files');
}

window.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  dragCounter++;
  if (fullscreenDragOverlay) {
    fullscreenDragOverlay.hidden = false;
    requestAnimationFrame(() => {
      fullscreenDragOverlay.classList.add('is-active');
    });
  }
});

window.addEventListener('dragleave', (event) => {
  if (!hasFiles(event)) return;
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    if (fullscreenDragOverlay) {
      fullscreenDragOverlay.classList.remove('is-active');
      setTimeout(() => {
        if (dragCounter === 0) fullscreenDragOverlay.hidden = true;
      }, 200);
    }
  }
});

window.addEventListener('dragover', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

window.addEventListener('drop', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragCounter = 0;
  if (fullscreenDragOverlay) {
    fullscreenDragOverlay.classList.remove('is-active');
    fullscreenDragOverlay.hidden = true;
  }

  const files = Array.from(event.dataTransfer.files || []);
  if (files.length === 0) return;

  const images = files.filter((f) => f.type.startsWith('image/'));
  const otherFiles = files.filter((f) => !f.type.startsWith('image/'));

  if (images.length > 0) {
    imagePanel.uploadFiles(images);
  }
  if (otherFiles.length > 0) {
    filePanel.uploadFiles(otherFiles);
  }

  historyPins.openClipboard();
  announce(`Загрузка ${files.length} файл(ов)...`);
});
