const connectionStatusEl = document.getElementById('connection-status');
const connectionStatusTextEl = document.getElementById('connection-status-text');
const saveStatusEl = document.getElementById('save-status');
const saveStatusTextEl = document.getElementById('save-status-text');
const lastUpdatedEl = document.getElementById('last-updated');
const announcerEl = document.getElementById('announcer');
const modalBackdropEl = document.getElementById('modal-backdrop');

const CONNECTION_LABELS = {
  connecting: 'Подключение…',
  connected: 'Подключено',
  offline: 'Офлайн',
};

const SAVE_LABELS = {
  idle: 'Загрузка…',
  unsaved: 'Не сохранён',
  saving: 'Сохранение…',
  saved: 'Сохранено',
  offline: 'Офлайн — сохранено локально',
  error: 'Ошибка сохранения',
  'remote-update': 'Доступно обновление',
  conflict: 'Конфликт версий',
};

export function debounce(fn, delayMs) {
  let timer = null;
  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  }
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export function setConnectionStatus(state) {
  connectionStatusEl.dataset.state = state;
  connectionStatusTextEl.textContent = CONNECTION_LABELS[state] || state;
}

export function setSaveStatus(state, { announce = false } = {}) {
  saveStatusEl.dataset.state = state;
  saveStatusTextEl.textContent = SAVE_LABELS[state] || state;
  if (announce) announce_(SAVE_LABELS[state] || state);
}

export function setLastUpdated(isoTimestamp) {
  if (!isoTimestamp) {
    lastUpdatedEl.textContent = 'Обновлено: —';
    return;
  }
  const date = new Date(isoTimestamp);
  lastUpdatedEl.textContent = `Обновлено: ${date.toLocaleString()}`;
}

function announce_(message) {
  announcerEl.textContent = '';
  requestAnimationFrame(() => {
    announcerEl.textContent = message;
  });
}

export function announce(message) {
  announce_(message);
}

export function showPanel(panelEl) {
  modalBackdropEl.hidden = false;
  panelEl.hidden = false;
  const focusable = panelEl.querySelector('button');
  if (focusable) focusable.focus();
}

export function hidePanel(panelEl) {
  panelEl.hidden = true;
  const anyOpen = Array.from(document.querySelectorAll('.conflict-panel')).some((el) => !el.hidden);
  modalBackdropEl.hidden = !anyOpen;
}

export function showInlineMessage(element, message) {
  element.textContent = message;
  element.hidden = false;
}

export function hideInlineMessage(element) {
  element.hidden = true;
  element.textContent = '';
}

// Dismiss open modal panel on backdrop click or Escape key
modalBackdropEl?.addEventListener('click', () => {
  const openPanels = document.querySelectorAll('.conflict-panel:not([hidden])');
  for (const panel of openPanels) {
    const cancelBtn = panel.querySelector('[id$="-cancel"], .button--ghost, .button--secondary');
    if (cancelBtn) {
      cancelBtn.click();
    } else {
      hidePanel(panel);
    }
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modalBackdropEl && !modalBackdropEl.hidden) {
    const openPanels = document.querySelectorAll('.conflict-panel:not([hidden])');
    for (const panel of openPanels) {
      const cancelBtn = panel.querySelector('[id$="-cancel"], .button--ghost, .button--secondary');
      if (cancelBtn) {
        cancelBtn.click();
      } else {
        hidePanel(panel);
      }
    }
  }
});
