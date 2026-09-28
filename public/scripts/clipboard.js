/**
 * Dedicated Paste/Copy buttons use the async Clipboard API with fallbacks for HTTP.
 */
export async function readClipboardIntoEditor(editor) {
  if (!navigator.clipboard || !navigator.clipboard.read) {
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText();
        editor.insertPlainText(text);
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error.name === 'NotAllowedError' ? 'denied' : 'failed' };
      }
    }
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const blob = await item.getType('text/html');
        editor.insertSanitisedHtml(await blob.text());
        return { ok: true };
      }
    }
    for (const item of items) {
      if (item.types.includes('text/plain')) {
        const blob = await item.getType('text/plain');
        editor.insertPlainText(await blob.text());
        return { ok: true };
      }
    }
    return { ok: false, reason: 'empty' };
  } catch (error) {
    return { ok: false, reason: error.name === 'NotAllowedError' ? 'denied' : 'failed' };
  }
}

export async function copyTextToClipboard(plainText) {
  if (!plainText) return false;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(plainText);
      return true;
    } catch {
      // Fall through to execCommand
    }
  }

  // ExecCommand fallback for non-secure HTTP contexts
  const active = document.activeElement;
  const input = document.createElement('textarea');
  input.value = plainText;
  input.className = 'visually-hidden';
  document.body.append(input);
  input.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    /* Browser denied */
  }
  input.remove();
  active?.focus();
  return ok;
}

export async function copyEditorContent(html, plainText) {
  if (navigator.clipboard && window.ClipboardItem && html) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return { ok: true, mode: 'rich' };
    } catch {
      // Fall through to plain-text copying below.
    }
  }

  const success = await copyTextToClipboard(plainText);
  if (success) return { ok: true, mode: 'plain' };
  return { ok: false, reason: 'unsupported' };
}

export async function copyImageUrl(url) {
  if (window.isSecureContext === false) {
    if (navigator.share && navigator.canShare) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Не удалось загрузить изображение');
        const rawBlob = await response.blob();
        const ext = rawBlob.type === 'image/jpeg' ? 'jpg' : rawBlob.type === 'image/webp' ? 'webp' : 'png';
        const file = new File([rawBlob], `crosspaste-${Date.now()}.${ext}`, { type: rawBlob.type || 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return { ok: true };
        }
      } catch (error) {
        if (error.name === 'AbortError') return { ok: true };
        return { ok: false, reason: error.name === 'NotAllowedError' ? 'denied' : 'failed' };
      }
    }
    return { ok: false, reason: 'unsupported' };
  }

  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      const blobPromise = (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Не удалось загрузить изображение');
        const rawBlob = await response.blob();
        if (rawBlob.type === 'image/png') return rawBlob;
        return convertToPng(rawBlob);
      })();

      const item = new ClipboardItem({ 'image/png': blobPromise });
      await navigator.clipboard.write([item]);
      return { ok: true };
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { ok: true };
      }
      // If Clipboard API failed and share is available, try share
    }
  }

  if (navigator.share && navigator.canShare) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Не удалось загрузить изображение');
      const rawBlob = await response.blob();
      const ext = rawBlob.type === 'image/jpeg' ? 'jpg' : rawBlob.type === 'image/webp' ? 'webp' : 'png';
      const file = new File([rawBlob], `crosspaste-${Date.now()}.${ext}`, { type: rawBlob.type || 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return { ok: true };
      }
    } catch (error) {
      if (error.name === 'AbortError') return { ok: true };
      return { ok: false, reason: error.name === 'NotAllowedError' ? 'denied' : 'failed' };
    }
  }

  return { ok: false, reason: 'unsupported' };
}

export async function copyImageBlob(blob) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    return { ok: false, reason: 'unsupported' };
  }

  try {
    const pngBlob = blob.type === 'image/png' ? blob : await convertToPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.name === 'NotAllowedError' ? 'denied' : 'failed' };
  }
}

async function convertToPng(blob) {
  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Conversion failed'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image failed to load'));
    image.src = url;
  });
}
