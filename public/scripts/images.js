import {
  uploadImage,
  deleteImageRequest,
  imageFileUrl,
  imageThumbnailUrl,
  imageDownloadUrl,
  ApiError,
} from './api.js';
import { copyImageUrl } from './clipboard.js';
import { showInlineMessage, hideInlineMessage, showPanel, hidePanel, announce } from './ui.js';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'Размер неизвестен';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function formatTimestamp(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleString();
}

export function createImagePanel(elements) {
  let images = [];
  let selectedImageId = null;
  let imageCountLimit = 0;

  // Modal Viewer
  const viewer = document.getElementById('image-viewer');
  const viewerImage = document.getElementById('image-viewer-photo');
  const viewerTitle = document.getElementById('image-viewer-title');
  const viewerDownload = document.getElementById('image-viewer-download');
  const viewerClose = document.getElementById('image-viewer-close');

  if (viewerClose && viewer) {
    viewerClose.addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', (event) => {
      if (event.target === viewer) viewer.close();
    });
  }

  function openImage(id) {
    const selected = images.find((image) => image.id === id);
    if (!selected || !viewer) return;
    viewerImage.src = imageFileUrl(id);
    viewerImage.alt = selected.originalFilename || 'Изображение';
    viewerTitle.textContent = selected.originalFilename || 'Изображение';
    viewerDownload.href = imageDownloadUrl(id);
    viewerDownload.download = selected.originalFilename || 'image';
    if (!viewer.open) viewer.showModal();
  }

  function findSelected() {
    return images.find((image) => image.id === selectedImageId) || null;
  }

  function updateActionButtons() {
    const selected = findSelected();
    elements.copyButton.disabled = !selected;
    elements.downloadButton.disabled = !selected;
    elements.deleteButton.disabled = !selected;
  }

  function updateCapacityUi() {
    const atLimit = imageCountLimit > 0 && images.length >= imageCountLimit;
    if (imageCountLimit > 0) {
      elements.countStatus.textContent = `Фото: ${images.length} из ${imageCountLimit}`;
    } else {
      elements.countStatus.textContent = `Фото: ${images.length}`;
    }

    elements.pasteImageButton.disabled = atLimit;
    elements.fileInput.disabled = atLimit;
    elements.fileInput.closest('label')?.classList.toggle('toolbar-button--disabled', atLimit);

    if (atLimit) {
      showInlineMessage(
        elements.limitMessage,
        `Достигнут лимит ${imageCountLimit} фото. Удалите ненужное фото для загрузки нового.`
      );
    } else {
      hideInlineMessage(elements.limitMessage);
    }
  }

  function selectImage(id) {
    selectedImageId = selectedImageId === id ? null : id;
    renderCards();
    updateActionButtons();
  }

  function renderCards() {
    elements.grid.innerHTML = '';
    elements.emptyState.hidden = images.length > 0;

    for (const image of images) {
      const li = document.createElement('li');

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'image-card';
      card.setAttribute('aria-pressed', String(image.id === selectedImageId));
      card.setAttribute('aria-label', `Выбрать фото ${image.originalFilename}`);
      card.addEventListener('click', () => selectImage(image.id));

      const img = document.createElement('img');
      img.src = imageThumbnailUrl(image.id);
      img.alt = image.originalFilename ? `Превью ${image.originalFilename}` : 'Превью фотографии';
      img.loading = 'lazy';
      card.appendChild(img);

      const meta = document.createElement('div');
      meta.className = 'image-card__meta';
      const filenameEl = document.createElement('span');
      filenameEl.className = 'image-card__filename';
      filenameEl.textContent = image.originalFilename;
      const detailsEl = document.createElement('span');
      detailsEl.textContent = `${image.mimeType.replace('image/', '').toUpperCase()} · ${formatBytes(image.sizeBytes)}`;
      const timeEl = document.createElement('span');
      timeEl.textContent = formatTimestamp(image.createdAt);
      meta.append(filenameEl, detailsEl, timeEl);
      card.appendChild(meta);

      li.appendChild(card);

      const actions = document.createElement('div');
      actions.className = 'image-card__actions';
      actions.appendChild(createCardActionButton('Открыть', `Открыть ${image.originalFilename}`, () => openImage(image.id)));
      actions.appendChild(createCardActionButton('Копировать', `Копировать ${image.originalFilename}`, (btn) => copySelected(image.id, btn)));
      actions.appendChild(createCardActionButton('Скачать', `Скачать ${image.originalFilename}`, () => downloadImage(image.id)));
      actions.appendChild(createCardActionButton('Удалить', `Удалить ${image.originalFilename}`, () => requestDelete(image.id)));
      li.appendChild(actions);

      elements.grid.appendChild(li);
    }
  }

  function createCardActionButton(label, ariaLabel, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-card__action';
    button.setAttribute('aria-label', ariaLabel);
    button.textContent = label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      handler(button);
    });
    return button;
  }

  function setImages(nextImages, limits) {
    images = nextImages;
    if (Number.isFinite(limits?.imageCountLimit)) {
      imageCountLimit = limits.imageCountLimit;
    }
    if (selectedImageId && !images.some((image) => image.id === selectedImageId)) {
      selectedImageId = null;
    }
    renderCards();
    updateActionButtons();
    updateCapacityUi();
  }

  async function uploadFiles(fileList) {
    hideInlineMessage(elements.errorMessage);
    hideInlineMessage(elements.limitMessage);

    const files = Array.from(fileList);

    for (const file of files) {
      if (imageCountLimit > 0 && images.length >= imageCountLimit) {
        showInlineMessage(
          elements.limitMessage,
          `Достигнут лимит ${imageCountLimit} фото. Удалите ненужное фото для загрузки нового.`
        );
        break;
      }

      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        showInlineMessage(
          elements.errorMessage,
          `«${file.name}» не загружен: поддерживаются только PNG, JPEG, WebP и GIF.`
        );
        continue;
      }

      try {
        await uploadImage(file);
        announce(`Загружено фото: ${file.name}`);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Ошибка загрузки.';
        showInlineMessage(elements.errorMessage, `«${file.name}» не загружен: ${message}`);
      }
    }
  }

  function downloadImage(id) {
    const link = document.createElement('a');
    link.href = imageDownloadUrl(id);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function copySelected(id, buttonEl = null) {
    hideInlineMessage(elements.errorMessage);
    const originalText = buttonEl ? buttonEl.textContent : '';
    if (buttonEl) {
      buttonEl.textContent = 'Копирование…';
      buttonEl.disabled = true;
    }

    try {
      const result = await copyImageUrl(imageFileUrl(id));
      if (result.ok) {
        if (buttonEl) {
          buttonEl.textContent = 'Скопировано';
          buttonEl.classList.add('copied');
          setTimeout(() => {
            buttonEl.textContent = originalText;
            buttonEl.classList.remove('copied');
            buttonEl.disabled = false;
          }, 2000);
        }
        announce('Фото скопировано в буфер обмена');
      } else {
        if (buttonEl) {
          buttonEl.textContent = originalText;
          buttonEl.disabled = false;
        }
        openImage(id);
      }
    } catch {
      if (buttonEl) {
        buttonEl.textContent = originalText;
        buttonEl.disabled = false;
      }
      openImage(id);
    }
  }

  let pendingDeleteId = null;

  function requestDelete(id) {
    pendingDeleteId = id;
    showPanel(elements.deletePanel);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    pendingDeleteId = null;
    hidePanel(elements.deletePanel);

    try {
      await deleteImageRequest(id);
      if (selectedImageId === id) selectedImageId = null;
      announce('Фото удалено');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Не удалось удалить фото.';
      showInlineMessage(elements.errorMessage, message);
    }
  }

  function cancelDelete() {
    pendingDeleteId = null;
    hidePanel(elements.deletePanel);
  }

  // Wire up action buttons
  elements.copyButton.addEventListener('click', () => {
    if (selectedImageId) copySelected(selectedImageId, elements.copyButton);
  });

  elements.downloadButton.addEventListener('click', () => {
    if (selectedImageId) downloadImage(selectedImageId);
  });

  elements.deleteButton.addEventListener('click', () => {
    if (selectedImageId) requestDelete(selectedImageId);
  });

  elements.deleteConfirm.addEventListener('click', confirmDelete);
  elements.deleteCancel.addEventListener('click', cancelDelete);

  elements.fileInput.addEventListener('change', async (event) => {
    if (event.target.files?.length) {
      await uploadFiles(event.target.files);
      event.target.value = '';
    }
  });

  // Drag-and-drop
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
      await uploadFiles(event.dataTransfer.files);
    }
  });

  // Paste image from system clipboard
  elements.pasteImageButton.addEventListener('click', async () => {
    hideInlineMessage(elements.errorMessage);

    if (!navigator.clipboard || !navigator.clipboard.read) {
      showInlineMessage(
        elements.errorMessage,
        'Браузер не разрешает автоматическое чтение фото из буфера. Используйте кнопку «Загрузить фото» или Ctrl+V на ПК.'
      );
      return;
    }

    try {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const imageType = item.types.find((type) => ALLOWED_MIME_TYPES.has(type));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        files.push(new File([blob], `pasted-image.${imageType.split('/')[1]}`, { type: imageType }));
      }
      if (files.length === 0) {
        showInlineMessage(elements.errorMessage, 'В буфере обмена не найдено поддерживаемых изображений.');
        return;
      }
      await uploadFiles(files);
    } catch (error) {
      const reason =
        error?.name === 'NotAllowedError' ? 'Доступ к буферу запрещён.' : 'Не удалось прочитать буфер обмена.';
      showInlineMessage(elements.errorMessage, `${reason} Используйте кнопку «Загрузить фото» или Ctrl+V на ПК.`);
    }
  });

  return {
    setImages,
    uploadFiles,
  };
}
