import * as api from './api.js';
import { copyTextToClipboard } from './clipboard.js';
import { announce } from './ui.js';
import { highlightSnippet } from './editor.js';

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  try {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (isToday) {
      return `Сегодня, ${timeStr}`;
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}.${month}, ${timeStr}`;
  } catch {
    return '';
  }
}

function truncateText(text, maxChars = 350) {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return trimmed.slice(0, maxChars) + '…';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  if (!str.includes('&')) return String(str);
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function declOfNum(n, titles) {
  const cases = [2, 0, 1, 1, 1, 2];
  return titles[n % 100 > 4 && n % 100 < 20 ? 2 : cases[n % 10 < 5 ? n % 10 : 5]];
}

function getCategorySlug(category) {
  const cat = String(category || '').toLowerCase().trim();
  if (cat.includes('docker')) return 'docker';
  if (cat.includes('powershell') || cat.includes('ps') || cat.includes('windows')) return 'powershell';
  if (cat.includes('linux') || cat.includes('bash') || cat.includes('ubuntu')) return 'linux';
  if (cat.includes('git')) return 'git';
  if (cat.includes('сеть') || cat.includes('net') || cat.includes('caddy')) return 'network';
  return 'custom';
}

const BUILT_IN_COMMANDS = [
  {
    id: 'b-ps-debloat',
    title: 'PowerShell: Удаление лишних UWP-приложений Windows (Debloat)',
    category: 'PowerShell',
    command: `# Удаление предустановленных UWP-приложений Windows для всех пользователей
$apps = @(
  "*3dbuilder*", "*bingfinance*", "*bingnews*", "*bingsports*",
  "*bingweather*", "*solitairecollection*", "*getstarted*",
  "*skypeapp*", "*zunevideo*", "*zunemusic*", "*people*",
  "*windowscommunicationsapps*", "*yourphone*", "*xboxapp*"
)
foreach ($app in $apps) {
  Get-AppxPackage -AllUsers $app -ErrorAction SilentlyContinue | Remove-AppxPackage -ErrorAction SilentlyContinue
  Get-AppxProvisionedPackage -Online | Where-Object DisplayName -like $app | Remove-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
}`,
    isBuiltIn: true,
  },
  {
    id: 'b-ps-uninstall-app',
    title: 'PowerShell: Поиск и удаление установленной программы',
    category: 'PowerShell',
    command: `# Поиск установленных программ и удаление через winget:
winget list
winget uninstall --name "НазваниеПрограммы"`,
    isBuiltIn: true,
  },
  {
    id: 'b-ps-flushdns',
    title: 'Windows: Сброс сетевого стека, DNS и Winsock',
    category: 'PowerShell',
    command: `ipconfig /flushdns
ipconfig /release
ipconfig /renew
netsh winsock reset
netsh int ip reset`,
    isBuiltIn: true,
  },
  {
    id: 'b-ps-winget-upgrade',
    title: 'PowerShell: Обновление всех программ через Winget',
    category: 'PowerShell',
    command: `winget upgrade --all --include-unknown --silent`,
    isBuiltIn: true,
  },
  {
    id: 'b-ps-check-port',
    title: 'PowerShell: Поиск процесса, занимающего TCP-порт',
    category: 'PowerShell',
    command: `Get-NetTCPConnection -LocalPort 8089 | Select-Object LocalAddress, LocalPort, OwningProcess, State | ForEach-Object { $_; Get-Process -Id $_.OwningProcess }
# Завершить процесс принудительно: Stop-Process -Id <PID> -Force`,
    isBuiltIn: true,
  },
  {
    id: 'b-ps-sfc-dism',
    title: 'PowerShell: Проверка и восстановление файлов Windows (SFC / DISM)',
    category: 'PowerShell',
    command: `DISM.exe /Online /Cleanup-image /Restorehealth; sfc /scannow`,
    isBuiltIn: true,
  },
  {
    id: 'b-docker-prune',
    title: 'Docker: Полная очистка неиспользуемых контейнеров, образов и томов',
    category: 'Docker',
    command: `docker system prune -a --volumes -f`,
    isBuiltIn: true,
  },
  {
    id: 'b-docker-stats',
    title: 'Docker: Мониторинг потребления ресурсов (CPU, RAM, Сеть)',
    category: 'Docker',
    command: `docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"`,
    isBuiltIn: true,
  },
  {
    id: 'b-linux-update',
    title: 'Linux: Полное обновление пакетов и очистка кэша apt',
    category: 'Linux',
    command: `sudo apt update && sudo apt upgrade -y && sudo apt autoremove -y && sudo apt clean`,
    isBuiltIn: true,
  },
  {
    id: 'b-linux-disk-space',
    title: 'Linux: Анализ свободного места на диске и тяжелых папок',
    category: 'Linux',
    command: `df -h
# Топ 10 самых объемных каталогов:
sudo du -ahx / 2>/dev/null | sort -rh | head -n 10`,
    isBuiltIn: true,
  },
  {
    id: 'b-linux-port-kill',
    title: 'Linux: Найти и завершить процесс по порту',
    category: 'Linux',
    command: `sudo lsof -i :8089 || sudo ss -tulpn | grep 8089
# Завершить процесс: sudo kill -9 <PID>`,
    isBuiltIn: true,
  },
  {
    id: 'b-net-myip',
    title: 'Сеть: Узнать внешний IP-адрес через консоль',
    category: 'Сеть',
    command: `curl -s https://ifconfig.me/all`,
    isBuiltIn: true,
  },
  {
    id: 'b-net-caddy-reload',
    title: 'Caddy: Перезагрузка конфигурации Caddyfile на лету',
    category: 'Сеть',
    command: `caddy reload --config /etc/caddy/Caddyfile`,
    isBuiltIn: true,
  },
  {
    id: 'b-git-reset-clean',
    title: 'Git: Жесткий сброс всех локальных изменений к ветке origin/main',
    category: 'Git',
    command: `git fetch origin && git reset --hard origin/main && git clean -fd`,
    isBuiltIn: true,
  },
];

export function createHistoryPinsModule({
  onRestore,
  onInsertCommand,
}) {
  let historyItems = [];
  let customCommands = [];
  let currentView = 'clipboard'; // 'clipboard' | 'history' | 'commands'
  let selectedCategory = 'all';
  let historySearchQuery = '';
  let commandsSearchQuery = '';
  let editingCommandId = null;
  let commandsInitialized = false;

  // Top Navigation Tabs
  const navTabClipboard = document.getElementById('nav-tab-clipboard');
  const navTabHistory = document.getElementById('nav-tab-history');
  const navTabCommands = document.getElementById('nav-tab-commands');
  const navHistoryBadge = document.getElementById('nav-history-badge');
  const navCommandsBadge = document.getElementById('nav-commands-badge');

  // Toolbar elements in editor
  const toolbarHistoryBtn = document.getElementById('toggle-history-btn');
  const toolbarCommandsBtn = document.getElementById('toggle-commands-btn');
  const toolbarHistoryBadge = document.getElementById('history-badge');
  const toolbarCommandsBadge = document.getElementById('commands-badge');

  // Main Views
  const viewClipboard = document.getElementById('view-clipboard');
  const viewHistory = document.getElementById('view-history');
  const viewCommands = document.getElementById('view-commands');

  // History View elements
  const historyCardsList = document.getElementById('history-cards-list');
  const historyEmptyState = document.getElementById('history-empty-state');
  const historySearchInput = document.getElementById('history-search-input');
  const historyClearAllBtn = document.getElementById('history-clear-all-btn');
  const historyTotalCount = document.getElementById('history-total-count');

  // Commands View elements
  const commandsCardsList = document.getElementById('commands-cards-list');
  const commandsEmptyState = document.getElementById('commands-empty-state');
  const commandsSearchInput = document.getElementById('commands-search-input');
  const commandsCatBar = document.getElementById('commands-cat-bar');
  const commandsAddBtn = document.getElementById('commands-add-btn');
  const commandsTotalCount = document.getElementById('commands-total-count');

  // Add Custom Command Form
  const commandAddDialog = document.getElementById('command-add-dialog');
  const cmdDialogHeading = document.getElementById('cmd-dialog-heading');
  const cmdDialogSubtitle = document.getElementById('cmd-dialog-subtitle');
  const cmdNewTitle = document.getElementById('cmd-new-title');
  const cmdNewCategory = document.getElementById('cmd-new-category');
  const cmdNewBody = document.getElementById('cmd-new-body');
  const cmdNewCode = document.getElementById('cmd-new-code');
  const cmdNewLangHint = document.getElementById('cmd-new-lang-hint');
  const cmdNewSaveBtn = document.getElementById('cmd-new-save-btn');
  const cmdNewCancelBtn = document.getElementById('cmd-new-cancel-btn');
  const cmdNewCloseBtn = document.getElementById('cmd-new-close-btn');

  function updateBadges() {
    const hCount = historyItems.length;
    const cCount = commandsInitialized ? customCommands.length : (customCommands.length || BUILT_IN_COMMANDS.length);

    if (navHistoryBadge) navHistoryBadge.textContent = String(hCount);
    if (toolbarHistoryBadge) toolbarHistoryBadge.textContent = String(hCount);
    if (historyTotalCount) historyTotalCount.textContent = `${hCount} ${declOfNum(hCount, ['сохранение', 'сохранения', 'сохранений'])}`;

    if (navCommandsBadge) navCommandsBadge.textContent = String(cCount);
    if (toolbarCommandsBadge) toolbarCommandsBadge.textContent = String(cCount);
    if (commandsTotalCount) commandsTotalCount.textContent = `${cCount} ${declOfNum(cCount, ['команда', 'команды', 'команд'])}`;
  }

  function switchView(viewName) {
    currentView = viewName;

    // Update nav tab active states
    navTabClipboard?.classList.toggle('is-active', viewName === 'clipboard');
    navTabClipboard?.setAttribute('aria-selected', String(viewName === 'clipboard'));
    navTabHistory?.classList.toggle('is-active', viewName === 'history');
    navTabHistory?.setAttribute('aria-selected', String(viewName === 'history'));
    navTabCommands?.classList.toggle('is-active', viewName === 'commands');
    navTabCommands?.setAttribute('aria-selected', String(viewName === 'commands'));

    // Toggle view elements
    if (viewClipboard) viewClipboard.hidden = viewName !== 'clipboard';
    if (viewHistory) viewHistory.hidden = viewName !== 'history';
    if (viewCommands) viewCommands.hidden = viewName !== 'commands';

    // Update toolbar active states
    toolbarHistoryBtn?.classList.toggle('is-active', viewName === 'history');
    toolbarCommandsBtn?.classList.toggle('is-active', viewName === 'commands');

    if (viewName === 'history') {
      renderHistory();
      historySearchInput?.focus();
    } else if (viewName === 'commands') {
      renderCommands();
      commandsSearchInput?.focus();
    }
  }

  function renderHistory() {
    if (!historyCardsList) return;
    historyCardsList.innerHTML = '';

    const filtered = historySearchQuery
      ? historyItems.filter((item) => decodeHtmlEntities(item.contentPlain || '').toLowerCase().includes(historySearchQuery))
      : historyItems;

    if (filtered.length === 0) {
      if (historyEmptyState) {
        historyEmptyState.textContent = historySearchQuery
          ? `Ничего не найдено по запросу «${historySearchQuery}»`
          : 'История пуста. Изменения текста сохраняются автоматически при работе в редакторе.';
        historyEmptyState.hidden = false;
      }
      return;
    }
    if (historyEmptyState) historyEmptyState.hidden = true;

    const frag = document.createDocumentFragment();
    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'card-item card-item--history';
      card.dataset.id = String(item.id);

      const timeText = formatTimestamp(item.createdAt);
      const charCount = (item.characterCount || 0).toLocaleString();
      const rawPlain = decodeHtmlEntities(item.contentPlain || '');
      const linesCount = (rawPlain.split('\n').length || 1).toLocaleString();
      const previewRaw = truncateText(rawPlain, 400);

      const highlighted = highlightSnippet(previewRaw);
      const isCode = highlighted.language && highlighted.language !== 'plaintext';

      const rawLines = rawPlain.split(/\r?\n/);
      const codeSnippet = isCode ? (rawLines.length > 30 ? rawLines.slice(0, 30).join('\n') : rawPlain) : previewRaw;
      const finalHighlighted = isCode ? highlightSnippet(codeSnippet, highlighted.language) : highlighted;
      let historyGutter = '';
      if (isCode) {
        const cnt = codeSnippet.split(/\r?\n/).length;
        for (let i = 1; i <= cnt; i++) {
          historyGutter += `<span>${i}</span>`;
        }
      }

      card.innerHTML = `
        <div class="card-item__header">
          <div class="card-item__meta">
            <span class="card-time">${timeText}</span>
            <span class="card-meta-dot">•</span>
            <span class="card-chars">${charCount} симв.</span>
            <span class="card-meta-dot">•</span>
            <span class="card-lines">${linesCount} стр.</span>
          </div>
          <div class="card-item__actions">
            <button type="button" class="card-btn card-btn--copy" data-action="copy" title="Скопировать в буфер">
              Скопировать
            </button>
            <button type="button" class="card-btn card-btn--restore" data-action="restore" title="Загрузить в редактор и открыть буфер">
              Восстановить
            </button>
            <button type="button" class="card-btn card-btn--delete" data-action="delete" title="Удалить запись">
              Удалить
            </button>
          </div>
        </div>
        <div class="card-item__preview ${isCode ? 'card-item__preview--code' : ''}">
          ${
            isCode
              ? `<pre class="command-code-box"><div class="code-gutter" aria-hidden="true">${historyGutter}</div><code class="hljs hljs-highlighted language-${finalHighlighted.language}">${finalHighlighted.value}</code></pre>`
              : `<div class="card-item__text-preview"></div>`
          }
        </div>
      `;

      if (!isCode) {
        const textDiv = card.querySelector('.card-item__text-preview');
        if (textDiv) textDiv.textContent = previewRaw;
      }

      const copyBtn = card.querySelector('[data-action="copy"]');
      const restoreBtn = card.querySelector('[data-action="restore"]');
      const deleteBtn = card.querySelector('[data-action="delete"]');

      copyBtn.addEventListener('click', async () => {
        const ok = await copyTextToClipboard(rawPlain);
        if (ok) {
          copyBtn.textContent = '✓ Скопировано!';
          copyBtn.classList.add('is-success');
          const codeBox = card.querySelector('.command-code-box, .card-item__text-preview');
          if (codeBox) {
            codeBox.classList.remove('command-code-box--copied');
            void codeBox.offsetWidth;
            codeBox.classList.add('command-code-box--copied');
          }
          announce('Текст скопирован в буфер');
          setTimeout(() => {
            copyBtn.textContent = 'Скопировать';
            copyBtn.classList.remove('is-success');
            if (codeBox) codeBox.classList.remove('command-code-box--copied');
          }, 1500);
        }
      });

      restoreBtn.addEventListener('click', () => {
        if (onRestore) {
          onRestore({
            contentHtml: item.contentHtml && !item.contentHtml.startsWith('&lt;') ? item.contentHtml : rawPlain,
            contentPlain: rawPlain,
          });
          announce('Текст восстановлен в редакторе');
          switchView('clipboard');
        }
      });

      deleteBtn.addEventListener('click', async () => {
        try {
          const res = await api.deleteHistoryItem(item.id);
          historyItems = res.history || [];
          updateBadges();
          renderHistory();
          announce('Запись удалена');
        } catch {
          alert('Не удалось удалить запись');
        }
      });

      frag.appendChild(card);
    });

    historyCardsList.appendChild(frag);
  }

  let draggedCard = null;
  let touchDraggedCard = null;

  async function saveCurrentCommandsOrder() {
    if (!commandsCardsList) return;
    const currentCards = Array.from(commandsCardsList.querySelectorAll('.card-item--command'));
    const visibleIds = currentCards.map((c) => Number(c.dataset.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (visibleIds.length <= 1) return;

    // Preserve items that may be hidden due to category filter or search
    const visibleSet = new Set(visibleIds);
    const fullOrder = [];
    let visibleIdx = 0;

    for (const cmd of customCommands) {
      if (visibleSet.has(cmd.id)) {
        fullOrder.push(visibleIds[visibleIdx++]);
      } else {
        fullOrder.push(cmd.id);
      }
    }

    // Optimistically reorder customCommands array in memory
    const cmdMap = new Map(customCommands.map((c) => [c.id, c]));
    customCommands = fullOrder.map((id) => cmdMap.get(id)).filter(Boolean);

    try {
      const res = await api.reorderCommands(fullOrder);
      if (res && res.commands) {
        customCommands = res.commands;
      }
      announce('Порядок команд сохранён');
    } catch (err) {
      console.error('Failed to save command order:', err);
    }
  }

  function handleTouchDragStart(e) {
    const handle = e.currentTarget;
    const card = handle.closest('.card-item--command');
    if (!card) return;

    touchDraggedCard = card;
    card.classList.add('is-dragging');

    function onTouchMove(ev) {
      ev.preventDefault();
      const t = ev.touches[0];
      const elem = document.elementFromPoint(t.clientX, t.clientY);
      const targetCard = elem ? elem.closest('.card-item--command') : null;
      if (targetCard && targetCard !== touchDraggedCard && targetCard.parentNode === commandsCardsList) {
        const rect = targetCard.getBoundingClientRect();
        if (t.clientY > rect.top + rect.height / 2) {
          commandsCardsList.insertBefore(touchDraggedCard, targetCard.nextSibling);
        } else {
          commandsCardsList.insertBefore(touchDraggedCard, targetCard);
        }
      }
    }

    function onTouchEnd() {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      if (touchDraggedCard) {
        touchDraggedCard.classList.remove('is-dragging');
        touchDraggedCard = null;
        saveCurrentCommandsOrder();
      }
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }

  function renderCommands() {
    if (!commandsCardsList) return;
    commandsCardsList.innerHTML = '';
    const all = commandsInitialized ? customCommands : (customCommands.length > 0 ? customCommands : BUILT_IN_COMMANDS);

    const filtered = all.filter((item) => {
      const catSlug = getCategorySlug(item.category);
      if (selectedCategory === 'custom') {
        if (catSlug !== 'custom') return false;
      } else if (selectedCategory === 'PowerShell') {
        if (catSlug !== 'powershell') return false;
      } else if (selectedCategory === 'Linux') {
        if (catSlug !== 'linux') return false;
      } else if (selectedCategory === 'Docker') {
        if (catSlug !== 'docker') return false;
      } else if (selectedCategory === 'Сеть') {
        if (catSlug !== 'network') return false;
      } else if (selectedCategory === 'Git') {
        if (catSlug !== 'git') return false;
      } else if (selectedCategory !== 'all') {
        if (item.category !== selectedCategory) return false;
      }

      if (commandsSearchQuery) {
        const inTitle = (item.title || '').toLowerCase().includes(commandsSearchQuery);
        const inCat = (item.category || '').toLowerCase().includes(commandsSearchQuery);
        const inBody = (item.command || '').toLowerCase().includes(commandsSearchQuery);
        return inTitle || inCat || inBody;
      }
      return true;
    });

    if (filtered.length === 0) {
      if (commandsEmptyState) {
        commandsEmptyState.textContent = commandsSearchQuery
          ? `Команды не найдены по запросу «${commandsSearchQuery}»`
          : 'В этой категории пока нет команд.';
        commandsEmptyState.hidden = false;
      }
      return;
    }
    if (commandsEmptyState) commandsEmptyState.hidden = true;

    const frag = document.createDocumentFragment();
    filtered.forEach((item) => {
      const card = document.createElement('div');
      const catSlug = getCategorySlug(item.category);
      card.className = `card-item card-item--command card-item--cat-${catSlug}`;
      card.dataset.id = String(item.id);

      const title = escapeHtml(item.title || 'Без названия');
      const cat = escapeHtml(item.category || (catSlug === 'custom' ? 'Моя команда' : item.category));
      const commandText = item.command || '';

      let preferredLang = null;
      if (catSlug === 'powershell') preferredLang = 'powershell';
      else if (['linux', 'docker', 'git', 'network'].includes(catSlug)) preferredLang = 'bash';

      const highlighted = highlightSnippet(commandText, preferredLang);
      const langClass = highlighted.language ? ` language-${highlighted.language}` : '';

      const lines = commandText.split(/\r?\n/);
      const lineCount = lines.length;
      const isFoldable = lineCount >= 6;

      let gutterHtml = '';
      for (let i = 1; i <= lineCount; i++) {
        gutterHtml += `<span>${i}</span>`;
      }

      card.innerHTML = `
        <div class="card-item__header">
          <div class="card-item__meta card-item__meta--command">
            <span class="card-title">${title}</span>
            <span class="command-cat-badge command-cat-badge--${catSlug}">${cat}</span>
          </div>
          <div class="card-item__actions">
            <button type="button" class="card-btn card-btn--copy" data-action="copy" title="Скопировать команду в буфер">
              Скопировать
            </button>
            <button type="button" class="card-btn card-btn--edit" data-action="edit" title="Редактировать команду">
              Изменить
            </button>
            <button type="button" class="card-btn card-btn--delete" data-action="delete" title="Удалить команду">
              Удалить
            </button>
          </div>
        </div>
        <div class="card-item__code-wrapper ${isFoldable ? 'is-foldable is-folded' : ''}">
          <pre class="command-code-box"><div class="code-gutter" aria-hidden="true">${gutterHtml}</div><code class="hljs hljs-highlighted${langClass}">${highlighted.value}</code></pre>
          ${isFoldable ? `<button type="button" class="command-fold-btn" aria-expanded="false">Развернуть (${lineCount} строк) ▾</button>` : ''}
        </div>
      `;

      // Dragging by card body/header, but preserving text selection inside code box & action buttons
      card.addEventListener('mousedown', (e) => {
        if (e.target.closest('.command-code-box, button, .command-fold-btn, a')) {
          card.draggable = false;
          return;
        }
        card.draggable = true;
      });

      card.addEventListener('mouseup', () => {
        card.draggable = false;
      });

      card.addEventListener('mouseleave', () => {
        if (!card.classList.contains('is-dragging')) {
          card.draggable = false;
        }
      });

      // Touch drag on card header (outside action buttons)
      const headerEl = card.querySelector('.card-item__header');
      if (headerEl) {
        headerEl.addEventListener('touchstart', (e) => {
          if (e.target.closest('button, a, .command-fold-btn')) return;
          handleTouchDragStart(e);
        }, { passive: false });
      }

      card.addEventListener('dragstart', (e) => {
        draggedCard = card;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(item.id));
      });

      card.addEventListener('dragend', () => {
        card.draggable = false;
        card.classList.remove('is-dragging');
        commandsCardsList.querySelectorAll('.card-item--command').forEach((c) => {
          c.classList.remove('is-drag-over');
        });
        draggedCard = null;
        saveCurrentCommandsOrder();
      });

      card.addEventListener('dragover', (e) => {
        if (!draggedCard || draggedCard === card) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const rect = card.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY > midY) {
          if (card.nextSibling !== draggedCard) {
            commandsCardsList.insertBefore(draggedCard, card.nextSibling);
          }
        } else {
          if (card !== draggedCard.nextSibling) {
            commandsCardsList.insertBefore(draggedCard, card);
          }
        }
      });

      card.addEventListener('dragenter', (e) => {
        if (!draggedCard || draggedCard === card) return;
        card.classList.add('is-drag-over');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('is-drag-over');
      });

      const copyBtn = card.querySelector('[data-action="copy"]');
      const editBtn = card.querySelector('[data-action="edit"]');
      const deleteBtn = card.querySelector('[data-action="delete"]');

      copyBtn.addEventListener('click', async () => {
        const ok = await copyTextToClipboard(commandText);
        if (ok) {
          copyBtn.textContent = '✓ Скопировано!';
          copyBtn.classList.add('is-success');

          const codeBox = card.querySelector('.command-code-box');
          if (codeBox) {
            codeBox.classList.remove('command-code-box--copied');
            void codeBox.offsetWidth;
            codeBox.classList.add('command-code-box--copied');
          }

          announce(`Команда «${item.title}» скопирована в буфер`);
          setTimeout(() => {
            copyBtn.textContent = 'Скопировать';
            copyBtn.classList.remove('is-success');
            if (codeBox) codeBox.classList.remove('command-code-box--copied');
          }, 1500);
        }
      });

      const foldBtn = card.querySelector('.command-fold-btn');
      if (foldBtn) {
        foldBtn.addEventListener('click', () => {
          const wrapper = card.querySelector('.card-item__code-wrapper');
          if (!wrapper) return;
          const isCurrentlyFolded = wrapper.classList.contains('is-folded');
          if (isCurrentlyFolded) {
            wrapper.classList.remove('is-folded');
            foldBtn.setAttribute('aria-expanded', 'true');
            foldBtn.textContent = 'Свернуть ▴';
          } else {
            wrapper.classList.add('is-folded');
            foldBtn.setAttribute('aria-expanded', 'false');
            foldBtn.textContent = `Развернуть (${lineCount} строк) ▾`;
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      }

      editBtn.addEventListener('click', () => {
        openEditCommand(item);
      });

      deleteBtn.addEventListener('click', async () => {
        if (!window.confirm(`Удалить команду «${item.title || 'Без названия'}»?`)) return;
        try {
          if (typeof item.id === 'number') {
            const res = await api.deleteCommand(item.id);
            customCommands = res.commands || [];
          } else {
            customCommands = customCommands.filter((c) => c.id !== item.id);
          }
          updateBadges();
          renderCommands();
          announce('Команда удалена');
        } catch {
          alert('Не удалось удалить команду');
        }
      });

      frag.appendChild(card);
    });

    commandsCardsList.appendChild(frag);
  }

  // Category filter chips
  commandsCatBar?.addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    commandsCatBar.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    selectedCategory = chip.dataset.cat || 'all';
    renderCommands();
  });

  // Search input listeners
  historySearchInput?.addEventListener('input', () => {
    historySearchQuery = historySearchInput.value.trim().toLowerCase();
    renderHistory();
  });

  commandsSearchInput?.addEventListener('input', () => {
    commandsSearchQuery = commandsSearchInput.value.trim().toLowerCase();
    renderCommands();
  });

  function getCaretOffset(element) {
    let caretOffset = 0;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(element);
      try {
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        caretOffset = preCaretRange.toString().length;
      } catch {
        return 0;
      }
    }
    return caretOffset;
  }

  function setCaretOffset(element, offset) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    let currentOffset = 0;
    let found = false;

    function walk(node) {
      if (found) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const nextOffset = currentOffset + node.nodeValue.length;
        if (offset >= currentOffset && offset <= nextOffset) {
          range.setStart(node, offset - currentOffset);
          range.setEnd(node, offset - currentOffset);
          found = true;
          return;
        }
        currentOffset = nextOffset;
      } else {
        for (const child of node.childNodes) {
          walk(child);
          if (found) return;
        }
      }
    }

    walk(element);
    if (found) {
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      try {
        const lastRange = document.createRange();
        lastRange.selectNodeContents(element);
        lastRange.collapse(false);
        sel.removeAllRanges();
        sel.addRange(lastRange);
      } catch {}
    }
  }

  // Custom Undo / Redo history stack for the command code editor (cmdNewCode).
  // Native browser DOM undo is wiped whenever syntax highlighting replaces innerHTML.
  // This maintains history snapshots across both English and Russian keyboard layouts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z).
  let cmdUndoStack = [];
  let cmdRedoStack = [];
  let lastRecordedSnapshot = null;
  let undoBurstTimer = null;
  const MAX_UNDO_STACK = 150;

  function getEditorSnapshot() {
    if (!cmdNewCode) return { text: '', caret: 0 };
    const raw = cmdNewCode.innerText || cmdNewCode.textContent || '';
    const text = raw.replace(/\r\n/g, '\n');
    const caret = getCaretOffset(cmdNewCode);
    return { text, caret };
  }

  function resetUndoHistory(initialText = '') {
    cmdUndoStack = [];
    cmdRedoStack = [];
    if (undoBurstTimer) {
      clearTimeout(undoBurstTimer);
      undoBurstTimer = null;
    }
    lastRecordedSnapshot = { text: initialText, caret: initialText.length };
  }

  function pushExplicitUndoSnapshot() {
    if (!cmdNewCode) return;
    if (undoBurstTimer) {
      clearTimeout(undoBurstTimer);
      undoBurstTimer = null;
    }
    const current = getEditorSnapshot();
    const top = cmdUndoStack[cmdUndoStack.length - 1];
    if (!top || top.text !== current.text) {
      cmdUndoStack.push(current);
      if (cmdUndoStack.length > MAX_UNDO_STACK) cmdUndoStack.shift();
    }
    cmdRedoStack = [];
    lastRecordedSnapshot = current;
  }

  function applyEditorSnapshot(snapshot) {
    if (!cmdNewCode || !snapshot) return;
    clearTimeout(cmdHighlightTimeout);
    if (undoBurstTimer) {
      clearTimeout(undoBurstTimer);
      undoBurstTimer = null;
    }

    const text = snapshot.text || '';
    if (!text.trim()) {
      cmdNewCode.innerHTML = '';
      if (cmdNewLangHint) cmdNewLangHint.textContent = 'КОД';
    } else {
      const cat = cmdNewCategory ? cmdNewCategory.value : '';
      const catSlug = getCategorySlug(cat);
      let preferredLang = null;
      if (catSlug === 'powershell') preferredLang = 'powershell';
      else if (['linux', 'docker', 'git', 'network'].includes(catSlug)) preferredLang = 'bash';

      const highlighted = highlightSnippet(text, preferredLang);
      const langClass = highlighted.language ? ` language-${highlighted.language}` : '';
      cmdNewCode.innerHTML = highlighted.value;
      cmdNewCode.className = `hljs hljs-highlighted${langClass}`;

      if (cmdNewLangHint) {
        cmdNewLangHint.textContent = (highlighted.language || preferredLang || 'код').toUpperCase();
      }
    }

    cmdNewCode.focus();
    setCaretOffset(cmdNewCode, Math.min(snapshot.caret, (cmdNewCode.innerText || '').length));
  }

  function handleUndo() {
    if (!cmdNewCode) return;
    if (undoBurstTimer) {
      clearTimeout(undoBurstTimer);
      undoBurstTimer = null;
    }

    const current = getEditorSnapshot();

    if (cmdUndoStack.length === 0) {
      if (lastRecordedSnapshot && lastRecordedSnapshot.text !== current.text) {
        cmdRedoStack.push(current);
        applyEditorSnapshot(lastRecordedSnapshot);
        lastRecordedSnapshot = getEditorSnapshot();
      }
      return;
    }

    cmdRedoStack.push(current);
    if (cmdRedoStack.length > MAX_UNDO_STACK) cmdRedoStack.shift();

    const prev = cmdUndoStack.pop();
    applyEditorSnapshot(prev);
    lastRecordedSnapshot = prev;
  }

  function handleRedo() {
    if (!cmdNewCode || cmdRedoStack.length === 0) return;
    if (undoBurstTimer) {
      clearTimeout(undoBurstTimer);
      undoBurstTimer = null;
    }

    const current = getEditorSnapshot();
    cmdUndoStack.push(current);
    if (cmdUndoStack.length > MAX_UNDO_STACK) cmdUndoStack.shift();

    const next = cmdRedoStack.pop();
    applyEditorSnapshot(next);
    lastRecordedSnapshot = next;
  }

  let cmdHighlightTimeout = null;
  function rehighlightCommandEditor(immediate = false) {
    if (!cmdNewCode) return;

    const run = () => {
      const raw = cmdNewCode.innerText || cmdNewCode.textContent || '';
      const trimmed = raw.replace(/\r\n/g, '\n');
      if (!trimmed.trim()) {
        cmdNewCode.innerHTML = '';
        if (cmdNewLangHint) cmdNewLangHint.textContent = 'КОД';
        return;
      }

      const cat = cmdNewCategory ? cmdNewCategory.value : '';
      const catSlug = getCategorySlug(cat);
      let preferredLang = null;
      if (catSlug === 'powershell') preferredLang = 'powershell';
      else if (['linux', 'docker', 'git', 'network'].includes(catSlug)) preferredLang = 'bash';

      const highlighted = highlightSnippet(trimmed, preferredLang);
      const langClass = highlighted.language ? ` language-${highlighted.language}` : '';

      // Skip innerHTML replacement if highlighted output hasn't changed
      if (cmdNewCode.innerHTML === highlighted.value) {
        return;
      }

      const isFocused = document.activeElement === cmdNewCode;
      const offset = isFocused ? getCaretOffset(cmdNewCode) : 0;

      cmdNewCode.innerHTML = highlighted.value;
      cmdNewCode.className = `hljs hljs-highlighted${langClass}`;

      if (cmdNewLangHint) {
        cmdNewLangHint.textContent = (highlighted.language || preferredLang || 'код').toUpperCase();
      }

      if (isFocused) {
        setCaretOffset(cmdNewCode, offset);
      }
    };

    if (immediate) {
      clearTimeout(cmdHighlightTimeout);
      run();
    } else {
      clearTimeout(cmdHighlightTimeout);
      cmdHighlightTimeout = setTimeout(run, 180);
    }
  }

  if (cmdNewCode) {
    cmdNewCode.addEventListener('input', (e) => {
      const isWordBoundary = e.data === ' ' || e.data === '\n';
      if (!undoBurstTimer) {
        if (lastRecordedSnapshot) {
          const top = cmdUndoStack[cmdUndoStack.length - 1];
          if (!top || top.text !== lastRecordedSnapshot.text) {
            cmdUndoStack.push(lastRecordedSnapshot);
            if (cmdUndoStack.length > MAX_UNDO_STACK) cmdUndoStack.shift();
          }
        }
        cmdRedoStack = [];
      }

      clearTimeout(undoBurstTimer);
      if (isWordBoundary) {
        lastRecordedSnapshot = getEditorSnapshot();
        undoBurstTimer = null;
      } else {
        undoBurstTimer = setTimeout(() => {
          lastRecordedSnapshot = getEditorSnapshot();
          undoBurstTimer = null;
        }, 350);
      }

      rehighlightCommandEditor(false);
    });

    cmdNewCode.addEventListener('paste', (e) => {
      e.preventDefault();
      pushExplicitUndoSnapshot();
      const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
      document.execCommand('insertText', false, text);
      lastRecordedSnapshot = getEditorSnapshot();
      rehighlightCommandEditor(true);
    });

    cmdNewCode.addEventListener('keydown', (e) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isZ = e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я';
      const isY = e.code === 'KeyY' || e.key === 'y' || e.key === 'Y' || e.key === 'н' || e.key === 'Н';

      // Layout-independent Undo: Ctrl+Z (EN or RU layout)
      if (isCtrlOrCmd && isZ && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Layout-independent Redo: Ctrl+Y or Ctrl+Shift+Z (EN or RU layout)
      if (isCtrlOrCmd && ((isZ && e.shiftKey) || isY)) {
        e.preventDefault();
        handleRedo();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        pushExplicitUndoSnapshot();
        document.execCommand('insertText', false, '  ');
        lastRecordedSnapshot = getEditorSnapshot();
        rehighlightCommandEditor(false);
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        pushExplicitUndoSnapshot();
        document.execCommand('insertText', false, '\n');
        lastRecordedSnapshot = getEditorSnapshot();
        rehighlightCommandEditor(false);
        return;
      }

      if (e.key === 'Escape') {
        resetCommandDialog();
        return;
      }
    });
  }

  cmdNewCategory?.addEventListener('change', () => {
    rehighlightCommandEditor(true);
  });

  function openEditCommand(cmd) {
    editingCommandId = cmd.id;
    cmdNewTitle.value = cmd.title || '';
    cmdNewCategory.value = cmd.category || 'Мои команды';
    if (cmdNewCode) {
      cmdNewCode.textContent = cmd.command || '';
      rehighlightCommandEditor(true);
      resetUndoHistory(cmd.command || '');
    } else if (cmdNewBody) {
      cmdNewBody.value = cmd.command || '';
    }
    if (cmdDialogHeading) cmdDialogHeading.textContent = 'Редактировать команду';
    if (cmdDialogSubtitle) cmdDialogSubtitle.textContent = 'Измените параметры команды и сохраните изменения';
    if (cmdNewSaveBtn) cmdNewSaveBtn.textContent = 'Сохранить изменения';
    if (commandAddDialog) {
      commandAddDialog.hidden = false;
      commandAddDialog.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      cmdNewTitle.focus();
    }
  }

  function resetCommandDialog() {
    editingCommandId = null;
    cmdNewTitle.value = '';
    cmdNewCategory.value = 'Мои команды';
    if (cmdNewCode) {
      cmdNewCode.textContent = '';
      cmdNewCode.innerHTML = '';
      if (cmdNewLangHint) cmdNewLangHint.textContent = 'КОД';
      resetUndoHistory('');
    }
    if (cmdNewBody) cmdNewBody.value = '';
    if (cmdDialogHeading) cmdDialogHeading.textContent = 'Новая команда или скрипт';
    if (cmdDialogSubtitle) cmdDialogSubtitle.textContent = 'Добавьте часто используемую команду или сниппет для быстрого копирования';
    if (cmdNewSaveBtn) cmdNewSaveBtn.textContent = 'Сохранить команду';
    if (commandAddDialog) commandAddDialog.hidden = true;
  }

  // Add custom command dialog
  commandsAddBtn?.addEventListener('click', () => {
    if (commandAddDialog) {
      if (!commandAddDialog.hidden && !editingCommandId) {
        commandAddDialog.hidden = true;
      } else {
        resetCommandDialog();
        commandAddDialog.hidden = false;
        cmdNewTitle.focus();
      }
    }
  });

  cmdNewCancelBtn?.addEventListener('click', resetCommandDialog);
  cmdNewCloseBtn?.addEventListener('click', resetCommandDialog);

  async function saveCommandForm() {
    const title = cmdNewTitle.value.trim();
    const category = cmdNewCategory.value;
    const command = (cmdNewCode ? (cmdNewCode.innerText || cmdNewCode.textContent || '') : (cmdNewBody ? cmdNewBody.value : '')).replace(/\r\n/g, '\n').trim();

    if (!title) {
      alert('Укажите название команды');
      cmdNewTitle.focus();
      return;
    }
    if (!command) {
      alert('Укажите текст команды или скрипт');
      if (cmdNewCode) cmdNewCode.focus();
      else if (cmdNewBody) cmdNewBody.focus();
      return;
    }

    try {
      let res;
      if (editingCommandId && typeof editingCommandId === 'number') {
        res = await api.updateCommand(editingCommandId, { title, category, command });
        announce('Команда обновлена');
      } else {
        res = await api.addCommand({ title, category, command });
        announce('Команда сохранена');
      }
      customCommands = res.commands || [];
      resetCommandDialog();
      updateBadges();
      renderCommands();
    } catch {
      alert('Не удалось сохранить команду');
    }
  }

  cmdNewSaveBtn?.addEventListener('click', saveCommandForm);

  cmdNewTitle?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (cmdNewCode) cmdNewCode.focus();
      else if (cmdNewBody) cmdNewBody.focus();
    } else if (e.key === 'Escape') {
      resetCommandDialog();
    }
  });

  // Navigation tab event listeners
  navTabClipboard?.addEventListener('click', () => switchView('clipboard'));
  navTabHistory?.addEventListener('click', () => switchView('history'));
  navTabCommands?.addEventListener('click', () => switchView('commands'));

  toolbarHistoryBtn?.addEventListener('click', () => switchView('history'));
  toolbarCommandsBtn?.addEventListener('click', () => switchView('commands'));

  // Clear history
  historyClearAllBtn?.addEventListener('click', async () => {
    if (historyItems.length === 0) return;
    if (!window.confirm('Очистить всю историю буфера обмена?')) return;
    try {
      const res = await api.clearHistory();
      historyItems = res.history || [];
      updateBadges();
      renderHistory();
      announce('История буфера очищена');
    } catch {
      alert('Не удалось очистить историю');
    }
  });

  return {
    setHistory(items) {
      historyItems = Array.isArray(items) ? items : [];
      updateBadges();
      if (currentView === 'history') {
        renderHistory();
      }
    },
    setPins(_pins) {
      // Safe no-op stub for backwards compatibility
    },
    setCommands(customCmds) {
      commandsInitialized = true;
      customCommands = Array.isArray(customCmds) ? customCmds : [];
      updateBadges();
      if (currentView === 'commands') {
        renderCommands();
      }
    },
    openHistory() {
      switchView('history');
    },
    openCommands() {
      switchView('commands');
    },
    openClipboard() {
      switchView('clipboard');
    },
  };
}
