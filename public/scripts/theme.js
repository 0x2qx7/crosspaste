(() => {
  const root = document.documentElement;
  const modes = new Set(['light', 'dark']);
  const clamp = (value) => Math.min(180, Math.max(80, Math.round(value / 10) * 10));

  let mode = 'dark';
  let size = 100;

  try {
    const savedMode =
      localStorage.getItem('crosspaste-theme-mode') ||
      localStorage.getItem('crosspaste-theme-v2') ||
      localStorage.getItem('crosspaste-theme');
    if (modes.has(savedMode)) {
      mode = savedMode;
    } else if (savedMode === 'light') {
      mode = 'light';
    } else {
      mode = 'dark';
    }
    const savedSize = Number(localStorage.getItem('crosspaste-font-size'));
    if (savedSize) size = clamp(savedSize);
  } catch {
    /* Private browsing */
  }

  function apply() {
    root.dataset.theme = mode;
    root.dataset.themeMode = mode;
    root.style.colorScheme = mode;
    root.style.setProperty('--font-scale', String(size / 100));

    const toggleBtn = document.getElementById('theme-toggle');
    const toggleText = document.getElementById('theme-toggle-text');
    if (toggleBtn) {
      const nextTitle = mode === 'dark' ? 'Переключить на светлую тему' : 'Переключить на тёмную тему';
      toggleBtn.setAttribute('title', nextTitle);
      toggleBtn.setAttribute('aria-label', nextTitle);
    }
    if (toggleText) {
      toggleText.textContent = mode === 'dark' ? 'Тёмная' : 'Светлая';
    }

    const output = document.getElementById('font-size');
    if (output) output.textContent = `${size}%`;

    const decrease = document.getElementById('font-decrease');
    const increase = document.getElementById('font-increase');
    if (decrease) decrease.disabled = size <= 80;
    if (increase) increase.disabled = size >= 180;
  }

  function save() {
    try {
      localStorage.setItem('crosspaste-theme-mode', mode);
      localStorage.setItem('crosspaste-font-size', String(size));
    } catch {
      /* Ignore */
    }
  }

  apply();

  document.addEventListener('DOMContentLoaded', () => {
    apply();

    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      mode = mode === 'dark' ? 'light' : 'dark';
      apply();
      save();
    });

    document.getElementById('font-decrease')?.addEventListener('click', () => {
      size = clamp(size - 10);
      apply();
      save();
    });

    document.getElementById('font-increase')?.addEventListener('click', () => {
      size = clamp(size + 10);
      apply();
      save();
    });
  });
})();
