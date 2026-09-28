import {
  fetchFiles,
  uploadFile,
  deleteFileRequest,
  fileDownloadUrl,
  ApiError,
} from './api.js';
import { showInlineMessage, hideInlineMessage, showPanel, hidePanel, announce } from './ui.js';

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Размер неизвестен';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function extensionFor(filename) {
  const match = String(filename || '').match(/\.([^.]+)$/);
  return (match?.[1] || 'FILE').slice(0, 5).toUpperCase();
}

function typeLabel(mimeType) {
  const [group] = String(mimeType || '').split('/');
  return ({ image: 'Изображение', video: 'Видео', audio: 'Аудио', text: 'Текст' })[group] || 'Файл';
}

export function createFilePanel(elements, { onImageFiles, onChanged } = {}) {
  let files = [];
  let selectedFileId = null;
  let pendingDeleteId = null;
  let fileCountLimit = 0;
  let fileSizeLimitBytes = 0;
  let busy = false;

  function findSelected() {
    return files.find((file) => file.id === selectedFileId) || null;
  }

  function updateActions() {
    const selected = findSelected();
    elements.downloadButton.disabled = !selected || busy;
    elements.deleteButton.disabled = !selected || busy;
  }

  function updateCapacity() {
    const atLimit = fileCountLimit > 0 && files.length >= fileCountLimit;
    if (fileCountLimit > 0) {
      elements.countStatus.textContent = `Файлы: ${files.length} из ${fileCountLimit}`;
    } else {
      elements.countStatus.textContent = `Файлы: ${files.length}`;
    }

    elements.fileInput.disabled = atLimit || busy;
    elements.fileInput.closest('label')?.classList.toggle('toolbar-button--disabled', atLimit || busy);

    if (atLimit) {
      showInlineMessage(
        elements.limitMessage,
        `Достигнут лимит ${fileCountLimit} файлов. Удалите ненужный файл для загрузки нового.`
      );
    } else {
      hideInlineMessage(elements.limitMessage);
    }
  }

  function render() {
    elements.list.innerHTML = '';
    elements.emptyState.hidden = files.length > 0;

    for (const file of files) {
      const item = document.createElement('li');
      item.className = 'file-card';

      const selector = document.createElement('button');
      selector.type = 'button';
      selector.className = 'file-card__selector';
      selector.setAttribute('aria-pressed', String(file.id === selectedFileId));
      selector.setAttribute('aria-label', `Выбрать файл ${file.originalFilename}`);
      selector.addEventListener('click', () => {
        selectedFileId = selectedFileId === file.id ? null : file.id;
        render();
        updateActions();
      });

      const icon = document.createElement('span');
      icon.className = 'file-card__badge';
      icon.textContent = extensionFor(file.originalFilename);

      const meta = document.createElement('div');
      meta.className = 'file-card__meta';
      const name = document.createElement('span');
      name.className = 'file-card__filename';
      name.textContent = file.originalFilename;
      const details = document.createElement('span');
      details.className = 'file-card__details';
      details.textContent = `${typeLabel(file.mimeType)} · ${formatBytes(file.sizeBytes)} · ${formatTimestamp(file.createdAt)}`;
      meta.append(name, details);
      selector.append(icon, meta);

      const actions = document.createElement('div');
      actions.className = 'file-card__actions';
      actions.append(
        createAction('Скачать', `Скачать ${file.originalFilename}`, () => download(file.id)),
        createAction('Удалить', `Удалить ${file.originalFilename}`, () => requestDelete(file.id), true)
      );
      item.append(selector, actions);
      elements.list.appendChild(item);
    }
  }

  function createAction(label, ariaLabel, handler, isDanger = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `file-card__action${isDanger ? ' file-card__action--danger' : ''}`;
    button.setAttribute('aria-label', ariaLabel);
    button.textContent = label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      handler();
    });
    return button;
  }

  async function refresh() {
    try {
      const result = await fetchFiles();
      setFiles(result.files, { fileCountLimit, fileSizeLimitBytes });
    } catch (error) {
      showInlineMessage(elements.errorMessage, error instanceof ApiError ? error.message : 'Не удалось обновить файлы.');
    }
  }

  async function uploadSelected(fileList) {
    hideInlineMessage(elements.errorMessage);
    hideInlineMessage(elements.limitMessage);
    const incoming = Array.from(fileList || []);
    const imageFiles = incoming.filter((file) => IMAGE_MIME_TYPES.has(file.type));
    const otherFiles = incoming.filter((file) => !IMAGE_MIME_TYPES.has(file.type));

    if (imageFiles.length > 0 && onImageFiles) {
      await onImageFiles(imageFiles);
    }

    if (otherFiles.length === 0) return;

    busy = true;
    updateActions();
    updateCapacity();

    for (const file of otherFiles) {
      if (fileCountLimit > 0 && files.length >= fileCountLimit) {
        showInlineMessage(
          elements.limitMessage,
          `Достигнут лимит ${fileCountLimit} файлов. Удалите ненужный файл для загрузки нового.`
        );
        break;
      }
      if (fileSizeLimitBytes > 0 && file.size > fileSizeLimitBytes) {
        showInlineMessage(
          elements.errorMessage,
          `«${file.name}» (${formatBytes(file.size)}) превышает лимит ${formatBytes(fileSizeLimitBytes)}.`
        );
        continue;
      }
      try {
        const result = await uploadFile(file);
        files = [...files.filter((entry) => entry.id !== result.file.id), result.file];
        render();
        updateCapacity();
        announce(`Загружен файл: ${file.name}`);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Ошибка загрузки.';
        showInlineMessage(elements.errorMessage, `«${file.name}» не загружен: ${message}`);
        if (error?.code === 'FILE_LIMIT_REACHED') break;
      }
    }

    busy = false;
    updateActions();
    updateCapacity();
    onChanged?.();
  }

  function download(id) {
    const file = files.find((entry) => entry.id === id);
    const link = document.createElement('a');
    link.href = fileDownloadUrl(id);
    document.body.appendChild(link);
    link.click();
    link.remove();
    announce(file ? `Скачивание: ${file.originalFilename}` : 'Скачивание файла');
  }

  function requestDelete(id) {
    pendingDeleteId = id;
    const file = files.find((entry) => entry.id === id);
    elements.deleteFilename.textContent = file?.originalFilename || 'этот файл';
    showPanel(elements.deletePanel);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    pendingDeleteId = null;
    hidePanel(elements.deletePanel);

    try {
      await deleteFileRequest(id);
      files = files.filter((entry) => entry.id !== id);
      if (selectedFileId === id) selectedFileId = null;
      render();
      updateActions();
      updateCapacity();
      announce('Файл удалён');
      onChanged?.();
    } catch (error) {
      showInlineMessage(elements.errorMessage, error instanceof ApiError ? error.message : 'Не удалось удалить файл.');
    }
  }

  function cancelDelete() {
    pendingDeleteId = null;
    hidePanel(elements.deletePanel);
  }

  // Event wiring
  elements.downloadButton.addEventListener('click', () => {
    if (selectedFileId) download(selectedFileId);
  });

  elements.deleteButton.addEventListener('click', () => {
    if (selectedFileId) requestDelete(selectedFileId);
  });

  elements.deleteConfirm.addEventListener('click', confirmDelete);
  elements.deleteCancel.addEventListener('click', cancelDelete);

  elements.fileInput.addEventListener('change', async (event) => {
    if (event.target.files?.length) {
      await uploadSelected(event.target.files);
      event.target.value = '';
    }
  });

  elements.dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.dropzone.classList.add('image-dropzone--active');
  });

  elements.dropzone.addEventListener('dragleave', (event) => {
    if (!elements.dropzone.contains(event.relatedTarget)) {
      elements.dropzone.classList.remove('image-dropzone--active');
    }
  });

  elements.dropzone.addEventListener('drop', async (event) => {
    event.preventDefault();
    elements.dropzone.classList.remove('image-dropzone--active');
    if (event.dataTransfer?.files?.length) {
      await uploadSelected(event.dataTransfer.files);
    }
  });

  function setFiles(nextFiles, limits) {
    files = nextFiles || [];
    if (Number.isFinite(limits?.fileCountLimit)) {
      fileCountLimit = limits.fileCountLimit;
    }
    if (Number.isFinite(limits?.fileSizeLimitBytes)) {
      fileSizeLimitBytes = limits.fileSizeLimitBytes;
    }
    if (selectedFileId && !files.some((entry) => entry.id === selectedFileId)) {
      selectedFileId = null;
    }
    render();
    updateActions();
    updateCapacity();
  }

  return {
    setFiles,
    uploadFiles: uploadSelected,
    refresh,
  };
}
