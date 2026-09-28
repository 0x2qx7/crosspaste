import { sanitiseHtmlForEditor, extractPlainText } from './sanitize.js';
import { copyTextToClipboard } from './clipboard.js';

const HEADING_TAG = 'H2';

/**
 * Caret offset helpers to restore caret position after debounced code re-highlighting
 */
function getCaretCharacterOffsetWithin(element) {
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

function setCaretCharacterOffsetWithin(element, offset) {
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
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Converts URLs in plain text into clickable HTML anchor tags
 */
export function autoLinkText(plainText) {
  const escaped = escapeHtml(plainText);
  const urlPattern = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;
  return escaped.replace(urlPattern, (matched) => {
    const href = matched.startsWith('http') ? matched : `https://${matched}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer nofollow">${matched}</a>`;
  });
}

/**
 * Scans container for bare text URLs (excluding PRE, CODE, A, and BUTTON)
 * and replaces them with active <a> links.
 */
export function autoLinkBareUrls(container) {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        let parent = node.parentNode;
        while (parent && parent !== container) {
          if (
            parent.nodeName === 'A' ||
            parent.nodeName === 'PRE' ||
            parent.nodeName === 'CODE' ||
            parent.nodeName === 'BUTTON'
          ) {
            return NodeFilter.FILTER_REJECT;
          }
          parent = parent.parentNode;
        }
        return /(https?:\/\/[^\s<]+|www\.[^\s<]+)/i.test(node.nodeValue)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    }
  );

  const nodesToReplace = [];
  while (walker.nextNode()) {
    nodesToReplace.push(walker.currentNode);
  }

  for (const node of nodesToReplace) {
    const text = node.nodeValue;
    const temp = document.createElement('span');
    temp.innerHTML = autoLinkText(text);
    node.replaceWith(...temp.childNodes);
  }
}

/**
 * Register enhanced bash/shell keywords and commands with highlight.js
 * so that common terminal commands (sudo, apt, docker, git, etc.) are
 * properly recognized and colorized instead of misdetected as SQL.
 */
export function registerEnhancedLanguages() {
  if (typeof window === 'undefined' || !window.hljs || window.hljs.__enhancedBashRegistered) return;
  window.hljs.__enhancedBashRegistered = true;

  const COMMANDS = 'sudo apt apt-get dpkg yum dnf pacman brew docker docker-compose podman kubectl helm git curl wget ssh scp rsync systemctl journalctl service ufw npm npx yarn pnpm bun pip pip3 python python3 node cd ls pwd mkdir rm rmdir cp mv touch cat less tail head grep sed awk find xargs tar gzip unzip chmod chown ln df du free top htop kill pkill ps echo export source alias which whoami uname bash sh zsh nano vim crontab ip ping netstat ss caddy nginx clear screen tmux nohup';
  const SUBCOMMANDS = 'update upgrade install remove purge build run exec push pull status commit checkout branch merge clone log diff add init start stop restart reload enable disable list show get set config test up down';

  window.hljs.registerLanguage('bash', function(hljs) {
    return {
      name: 'Bash',
      aliases: ['sh', 'bash', 'zsh', 'shell'],
      keywords: {
        $pattern: /[a-zA-Z0-9._-]+/,
        keyword: 'if then else elif fi for while until in do done case esac function return exit ' + SUBCOMMANDS,
        built_in: COMMANDS + ' break cd continue eval exec export getopts hash pwd readonly shift test trap umask unset alias builtin declare echo help let local logout printf read source type',
        literal: 'true false yes no'
      },
      contains: [
        hljs.HASH_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,
        {
          className: 'variable',
          begin: /\$[a-zA-Z_0-9]+/
        },
        {
          className: 'attr',
          begin: /(?<=\s|^)--?[a-zA-Z0-9_-]+/
        }
      ]
    };
  });

  window.hljs.registerLanguage('powershell', function(hljs) {
    return {
      name: 'PowerShell',
      aliases: ['ps', 'pwsh', 'ps1'],
      case_insensitive: true,
      keywords: {
        keyword: 'if else elseif for foreach in while do until switch default break continue return function filter workflow param try catch finally throw trap exit using module data parallel sequence',
        built_in: 'Get-AppxPackage Remove-AppxPackage Get-AppxProvisionedPackage Remove-AppxProvisionedPackage Write-Host Write-Output Write-Warning Write-Error Write-Verbose Write-Debug Get-Process Stop-Process Start-Process Get-Service Set-Service Stop-Service Start-Service Restart-Service Get-NetTCPConnection New-Item Remove-Item Copy-Item Move-Item Get-Item Set-Item Get-ChildItem Clear-Item Test-Path Select-Object Where-Object ForEach-Object Sort-Object Measure-Object Group-Object Invoke-WebRequest Invoke-RestMethod Invoke-Command Invoke-Expression Get-Command Get-Help Out-Null Out-File Out-String Export-Csv Import-Csv Set-ExecutionPolicy Get-ExecutionPolicy Unregister-Package Uninstall-Package Install-Package Find-Package winget ipconfig netsh sfc dism DISM.exe reg regsvr32 wmic tasklist taskkill',
        literal: 'true false null'
      },
      contains: [
        hljs.COMMENT(/<#/, /#>/),
        hljs.HASH_COMMENT_MODE,
        hljs.QUOTE_STRING_MODE,
        hljs.APOS_STRING_MODE,
        hljs.NUMBER_MODE,
        { className: 'variable', begin: /\$[a-zA-Z0-9_:]+/ },
        { className: 'attr', begin: /(?<=\s|^)-[a-zA-Z0-9_-]+/ },
        { className: 'built_in', begin: /\b[A-Za-z0-9]+-[A-Za-z0-9]+\b/ }
      ]
    };
  });
}

/**
 * Heuristic detector for snippet language to prevent common misdetections (e.g. bash being flagged as SQL)
 */
export function detectLanguage(text) {
  const trimmed = text.trim();
  if (!trimmed) return 'plaintext';

  // 1. Shebang
  if (/^#!\s*\/(usr\/)?bin\/(env\s+)?(bash|sh|zsh)/m.test(trimmed)) {
    return 'bash';
  }

  // 2. PowerShell cmdlets or variables
  if (/^\s*(Get-|Set-|New-|Remove-|Start-|Stop-|Restart-|Test-|Invoke-|Write-|Update-|Install-|Uninstall-|Export-|Import-|Select-Object|Where-Object|ForEach-Object|\$[a-zA-Z_]|winget\b|ipconfig\b|netsh\b|sfc\b|dism\b|DISM\.exe)/im.test(trimmed)) {
    return 'powershell';
  }

  // 3. Shell prompt ($ or # followed by command)
  if (/^[$#]\s+[a-z]/im.test(trimmed)) {
    return 'bash';
  }

  // 4. Common CLI commands at line start
  const commonCliPattern = /^\s*(sudo|apt|apt-get|dpkg|yum|dnf|pacman|brew|docker|docker-compose|podman|kubectl|helm|git|curl|wget|ssh|scp|rsync|systemctl|journalctl|service|ufw|npm|npx|yarn|pnpm|bun|pip|pip3|python|python3|node|cd|ls|pwd|mkdir|rm|chmod|chown|cat|grep|tar|nano|vim|echo|export|caddy|nginx)\b/im;
  if (commonCliPattern.test(trimmed)) {
    return 'bash';
  }

  // 5. Strict JSON check
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      /* Not strict JSON */
    }
  }

  // 6. Strict HTML detection (avoids php-template/xml/sql misdetection)
  if (
    /^<!DOCTYPE\s+html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /<\/(html|head|body|div|p|span|table|form|script|style)>/i.test(trimmed) ||
    /^<(!|html|head|body|div|section|article|header|footer|nav|main|table|form|ul|ol|script|style|svg|template|p|h[1-6])[\s>]/i.test(trimmed)
  ) {
    return 'html';
  }

  // 7. Highlight.js auto-detection with false-positive guard
  if (window.hljs) {
    const autoResult = window.hljs.highlightAuto(trimmed);
    let lang = autoResult.language;

    // Reject false-positive SQL when snippet has no actual SQL query structure
    if (lang === 'sql') {
      const isRealSql = /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+[a-zA-Z0-9_]+\s+SET)\b/i.test(trimmed);
      if (!isRealSql) {
        if (/(-[a-zA-Z]|--[a-zA-Z]|\s*\|\s*|\s*&&\s*)/.test(trimmed)) {
          return 'bash';
        }
        return 'plaintext';
      }
    }

    if (lang === 'php-template' || lang === 'xml') {
      if (/<!DOCTYPE\s+html|<html|<\/html>|<head>|<body>/i.test(trimmed)) {
        return 'html';
      }
    }

    return lang || 'plaintext';
  }

  return 'plaintext';
}

/**
 * Highlights a code snippet using detected language and enhanced grammar
 */
export function highlightSnippet(text, forcedLanguage = null) {
  registerEnhancedLanguages();
  if (!window.hljs) return { language: '', value: escapeHtml(text) };

  let lang = forcedLanguage || detectLanguage(text);
  if (lang === 'ps' || lang === 'pwsh') lang = 'powershell';
  if (lang === 'sh') lang = 'bash';

  if (lang === 'php-template' || lang === 'xml') {
    if (/<!DOCTYPE\s+html|<html|<\/html>|<head>|<body>/i.test(text)) {
      lang = 'html';
    }
  }

  if (lang === 'plaintext') {
    try {
      return { language: '', value: window.hljs.highlight(text, { language: 'plaintext' }).value };
    } catch {
      return { language: '', value: escapeHtml(text) };
    }
  }

  try {
    const res = window.hljs.highlight(text, { language: lang, ignoreIllegals: true });
    return { language: lang, value: res.value };
  } catch {
    try {
      const autoRes = window.hljs.highlightAuto(text);
      return { language: autoRes.language || '', value: autoRes.value };
    } catch {
      return { language: '', value: escapeHtml(text) };
    }
  }
}

/**
 * Places caret at the beginning of an element
 */
export function placeCaretAtStartOf(element) {
  if (!element) return;
  element.focus?.();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (element.firstChild) {
    range.setStart(element.firstChild, 0);
  } else {
    range.selectNodeContents(element);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Places caret at the end of an element
 */
export function placeCaretAtEndOf(element) {
  if (!element) return;
  element.focus?.();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Ensures there is always a regular paragraph after trailing block elements (PRE, BLOCKQUOTE)
 * so the user can never be trapped at the bottom of the editor.
 */
export function ensureTrailingParagraph(editor) {
  if (!editor) return null;
  const last = editor.lastElementChild;
  if (last && (last.tagName === 'PRE' || last.tagName === 'BLOCKQUOTE' || last.tagName === 'TABLE')) {
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    editor.appendChild(p);
    return p;
  }
  return null;
}

export const POPULAR_LANGUAGES = [
  { id: 'plaintext', label: 'Plaintext' },
  { id: 'bash', label: 'Bash / Shell' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'json', label: 'JSON' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'yaml', label: 'YAML' },
  { id: 'cpp', label: 'C++' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
];

let activeLangMenu = null;

export function closeLanguageMenu() {
  if (activeLangMenu) {
    activeLangMenu.remove();
    activeLangMenu = null;
  }
}

export function openLanguageMenu(pre, langBtn, onSelect) {
  closeLanguageMenu();

  const menu = document.createElement('div');
  menu.className = 'code-lang-menu';
  menu.contentEditable = 'false';
  menu.setAttribute('role', 'listbox');

  const currentLang = (pre.dataset.language || 'plaintext').toLowerCase();

  for (const item of POPULAR_LANGUAGES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-lang-option' + (item.id === currentLang ? ' is-selected' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeLanguageMenu();
      onSelect(item.id);
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeLangMenu = menu;

  const btnRect = langBtn.getBoundingClientRect();
  const menuWidth = 140;
  const menuHeight = 280;

  let top = btnRect.bottom + 4;
  if (top + menuHeight > window.innerHeight) {
    top = Math.max(10, btnRect.top - menuHeight - 4);
  }

  let left = btnRect.right - menuWidth;
  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10) {
    left = window.innerWidth - menuWidth - 10;
  }

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

/**
 * Normalizes a code block so that any stray children of <pre> (e.g. from browser splitting)
 * are cleanly gathered back into the single <code> element.
 */
export function normalizeCodeBlock(pre) {
  if (!pre) return null;
  let code = pre.querySelector('code');
  if (!code) {
    code = document.createElement('code');
    pre.appendChild(code);
  }

  // Merge any duplicate <code> elements into the first one
  const allCodes = Array.from(pre.querySelectorAll('code'));
  for (let i = 1; i < allCodes.length; i++) {
    while (allCodes[i].firstChild) {
      code.appendChild(allCodes[i].firstChild);
    }
    allCodes[i].remove();
  }

  // Move any stray direct child nodes of pre (except .code-actions) into code
  const strayNodes = [];
  for (const child of Array.from(pre.childNodes)) {
    if (child === code) continue;
    if (child.nodeType === Node.ELEMENT_NODE && child.classList.contains('code-actions')) continue;
    strayNodes.push(child);
  }
  for (const stray of strayNodes) {
    code.appendChild(stray);
  }

  return code;
}

/**
 * Returns the true, complete raw text of a code block,
 * ignoring any UI buttons or menus, and preserving newlines.
 */
export function getCodeBlockRawText(pre) {
  if (!pre) return '';
  const clone = pre.cloneNode(true);
  clone.querySelectorAll('.code-actions, .code-copy-btn, .code-fold-btn, .code-lang-btn, .code-lang-menu').forEach((el) => el.remove());

  // Convert <br> to \n
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));

  // Prepend \n to block-level elements inside pre
  clone.querySelectorAll('div, p').forEach((block) => {
    block.before('\n');
  });

  const raw = clone.textContent || '';
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Detects whether pasted text represents HTML source code (rather than formatted article text)
 */
export function isHtmlSourceCode(text) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 4) return false;

  // 1. Explicit DOCTYPE, <html> tag, or XML declaration
  if (/^<!DOCTYPE\s+html/i.test(trimmed)) return true;
  if (/^<html[\s>]/i.test(trimmed)) return true;
  if (/^<\?xml/i.test(trimmed)) return true;

  // 2. Multi-line HTML snippet starting and ending with markup tags
  if (trimmed.includes('\n')) {
    const startsWithHtmlTag = /^<(!|div|section|article|header|footer|nav|main|table|thead|tbody|tr|th|td|form|ul|ol|li|head|body|script|style|svg|template|p|h[1-6]|pre|code)[\s>]/i.test(trimmed);
    const hasClosingTag = /<\/(div|section|article|header|footer|nav|main|table|thead|tbody|tr|th|td|form|ul|ol|li|head|body|script|style|svg|template|p|h[1-6]|html|pre|code)>/i.test(trimmed);
    if (startsWithHtmlTag && hasClosingTag) {
      return true;
    }

    // 3. Multi-line text with multiple HTML elements
    const commonHtmlTags = /<\/?(html|head|body|meta|link|script|style|div|span|p|a|table|tr|td|th|ul|ol|li|form|input|button|header|footer|section|article|nav|main|h[1-6])\b[^>]*>/gi;
    const matches = trimmed.match(commonHtmlTags);
    if (matches && matches.length >= 3 && /<\/[a-z0-9]+>/i.test(trimmed)) {
      return true;
    }
  }

  return false;
}

export function setCodeLanguage(pre, langId) {
  pre.dataset.language = langId;
  pre.dataset.manualLanguage = 'true';
  const langBtn = pre.querySelector('.code-lang-btn');
  if (langBtn) langBtn.textContent = `${langId.toUpperCase()} ▾`;

  const code = normalizeCodeBlock(pre);
  const rawText = getCodeBlockRawText(pre);
  if (rawText.trim() && window.hljs) {
    try {
      if (langId === 'plaintext') {
        code.innerHTML = escapeHtml(rawText);
        code.className = 'hljs hljs-highlighted';
      } else {
        const res = window.hljs.highlight(rawText, { language: langId, ignoreIllegals: true });
        code.innerHTML = res.value;
        code.className = `hljs hljs-highlighted language-${langId}`;
      }
    } catch {
      code.innerHTML = escapeHtml(rawText);
    }
  }
}

/**
 * Enhances all code blocks inside a container:
 * - Normalizes any stray elements into <code>
 * - Adds a unified actions bar (.code-actions) with fold, lang, copy buttons
 * - Applies Highlight.js syntax highlighting with smart language detection
 */
export function enhanceCodeBlocks(container) {
  registerEnhancedLanguages();
  const preElements = container.querySelectorAll('pre');
  for (const pre of preElements) {
    const code = normalizeCodeBlock(pre);
    const rawText = getCodeBlockRawText(pre);

    if (window.hljs && !code.classList.contains('hljs-highlighted')) {
      if (rawText.trim()) {
        try {
          const explicit = pre.dataset.language;
          const { language, value } =
            explicit && explicit !== 'plaintext'
              ? {
                  language: explicit,
                  value: window.hljs.highlight(rawText, { language: explicit, ignoreIllegals: true }).value,
                }
              : highlightSnippet(rawText);
          code.innerHTML = value;
          code.className = 'hljs hljs-highlighted' + (language ? ` language-${language}` : '');
          if (language) {
            pre.dataset.language = language;
          } else {
            pre.dataset.language = 'plaintext';
          }
        } catch {
          /* Fallback gracefully */
        }
      }
    }

    // Unified code-actions bar in top right
    let actions = pre.querySelector(':scope > .code-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'code-actions';
      actions.contentEditable = 'false';
      pre.prepend(actions);
    }

    // 1. Fold button (for blocks with >= 8 lines)
    const lineCount = rawText.split('\n').length;
    let foldBtn = actions.querySelector('.code-fold-btn');
    if (lineCount >= 8) {
      if (!foldBtn) {
        foldBtn = document.createElement('button');
        foldBtn.type = 'button';
        foldBtn.className = 'code-fold-btn';
        foldBtn.contentEditable = 'false';
        foldBtn.tabIndex = -1;
        foldBtn.setAttribute('aria-label', 'Свернуть или развернуть блок кода');
        foldBtn.setAttribute('title', 'Свернуть или развернуть код');
        actions.appendChild(foldBtn);
      }
      const isFolded = pre.classList.contains('is-folded');
      foldBtn.textContent = isFolded ? `Развернуть (${lineCount})` : 'Свернуть';
    } else if (foldBtn) {
      foldBtn.remove();
      pre.classList.remove('is-folded');
    }

    // 2. Language Selector Button
    let langBtn = actions.querySelector('.code-lang-btn');
    if (!langBtn) {
      langBtn = document.createElement('button');
      langBtn.type = 'button';
      langBtn.className = 'code-lang-btn';
      langBtn.contentEditable = 'false';
      langBtn.tabIndex = -1;
      langBtn.setAttribute('aria-label', 'Выбрать язык подсветки кода');
      langBtn.setAttribute('title', 'Кликните для выбора языка подсветки');
      actions.appendChild(langBtn);
    }
    const currentLang = pre.dataset.language || 'plaintext';
    langBtn.textContent = `${currentLang.toUpperCase()} ▾`;

    // 3. Copy button
    let copyBtn = actions.querySelector('.code-copy-btn');
    if (!copyBtn) {
      copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'code-copy-btn';
      copyBtn.contentEditable = 'false';
      copyBtn.tabIndex = -1;
      copyBtn.setAttribute('aria-label', 'Скопировать блок кода');
      copyBtn.setAttribute('title', 'Скопировать весь код');
      copyBtn.innerHTML = '<span class="code-copy-text">Скопировать</span>';
      actions.appendChild(copyBtn);
    }
  }
}

export function createEditor(containerEl, { onChange }) {
  containerEl.replaceChildren();

  const richEditor = document.createElement('div');
  richEditor.id = 'rich-editor';
  richEditor.className = 'editor editor--rich';
  richEditor.contentEditable = 'true';
  richEditor.setAttribute('role', 'textbox');
  richEditor.setAttribute('aria-multiline', 'true');
  richEditor.setAttribute('aria-label', 'Общий текст');
  richEditor.setAttribute('spellcheck', 'false');

  containerEl.append(richEditor);

  // Floating Selection Copy Bubble
  let selectionBubble = document.getElementById('selection-copy-bubble');
  let selectionBtn = document.getElementById('selection-copy-btn');
  let selectionCodeBtn = document.getElementById('selection-code-btn');
  if (!selectionBubble) {
    selectionBubble = document.createElement('div');
    selectionBubble.id = 'selection-copy-bubble';
    selectionBubble.className = 'selection-copy-bubble';
    selectionBubble.hidden = true;

    selectionBtn = document.createElement('button');
    selectionBtn.type = 'button';
    selectionBtn.id = 'selection-copy-btn';
    selectionBtn.className = 'selection-copy-btn';
    selectionBtn.innerHTML = '<span>Скопировать</span>';
    selectionBubble.appendChild(selectionBtn);

    const sep = document.createElement('span');
    sep.className = 'selection-bubble-separator';
    selectionBubble.appendChild(sep);

    selectionCodeBtn = document.createElement('button');
    selectionCodeBtn.type = 'button';
    selectionCodeBtn.id = 'selection-code-btn';
    selectionCodeBtn.className = 'selection-copy-btn';
    selectionCodeBtn.innerHTML = '<span>&lt;/&gt; Код</span>';
    selectionBubble.appendChild(selectionCodeBtn);

    document.body.appendChild(selectionBubble);
  }

  // Prevent mousedown inside the bubble from collapsing the user's text selection in contenteditable
  selectionBubble?.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  let activeSelectedText = '';

  function updateSelectionBubble() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hideSelectionBubble();
      return;
    }

    const range = sel.getRangeAt(0);
    if (!richEditor.contains(range.commonAncestorContainer)) {
      hideSelectionBubble();
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      hideSelectionBubble();
      return;
    }

    activeSelectedText = sel.toString();
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideSelectionBubble();
      return;
    }

    const bubbleWidth = 200;
    let left = rect.left + rect.width / 2;
    let top = rect.top - 8;

    left = Math.max(bubbleWidth / 2 + 10, Math.min(window.innerWidth - bubbleWidth / 2 - 10, left));
    if (top < 45) {
      top = rect.bottom + 8;
      selectionBubble.classList.add('is-bottom');
    } else {
      selectionBubble.classList.remove('is-bottom');
    }

    selectionBubble.style.left = `${left}px`;
    selectionBubble.style.top = `${top}px`;
    selectionBubble.hidden = false;
  }

  function hideSelectionBubble() {
    if (selectionBubble && !selectionBubble.hidden) {
      selectionBubble.hidden = true;
      if (selectionBtn) {
        selectionBtn.classList.remove('copied');
        selectionBtn.innerHTML = '<span>Скопировать</span>';
      }
    }
  }

  selectionBtn?.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeSelectedText) return;

    const ok = await copyTextToClipboard(activeSelectedText);
    if (ok) {
      selectionBtn.classList.add('copied');
      selectionBtn.innerHTML = '<span>Скопировано</span>';
      setTimeout(hideSelectionBubble, 900);
    }
  });

  selectionCodeBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideSelectionBubble();
    toggleCode();
  });

  const onSelectionChange = () => {
    requestAnimationFrame(updateSelectionBubble);
  };
  document.addEventListener('selectionchange', onSelectionChange);
  window.addEventListener('scroll', () => {
    hideSelectionBubble();
    closeLanguageMenu();
  }, { passive: true });
  window.addEventListener('resize', () => {
    hideSelectionBubble();
    closeLanguageMenu();
  }, { passive: true });

  const onDocMouseDown = (event) => {
    if (selectionBubble && !selectionBubble.contains(event.target) && !richEditor.contains(event.target)) {
      hideSelectionBubble();
    }
    if (activeLangMenu && !activeLangMenu.contains(event.target) && !event.target.closest('.code-lang-btn')) {
      closeLanguageMenu();
    }
  };
  document.addEventListener('mousedown', onDocMouseDown);

  // Delegated Code Block Buttons (Copy, Fold, Language)
  richEditor.addEventListener('click', async (event) => {
    // 1. Copy button
    const copyBtn = event.target.closest('.code-copy-btn');
    if (copyBtn) {
      event.preventDefault();
      event.stopPropagation();

      const pre = copyBtn.closest('pre');
      if (!pre) return;
      const textToCopy = getCodeBlockRawText(pre);

      const ok = await copyTextToClipboard(textToCopy);
      if (ok) {
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = '<span class="code-copy-text">Скопировано</span>';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = '<span class="code-copy-text">Скопировать</span>';
        }, 2000);
      }
      return;
    }

    // 2. Fold / Unfold button
    const foldBtn = event.target.closest('.code-fold-btn');
    if (foldBtn) {
      event.preventDefault();
      event.stopPropagation();

      const pre = foldBtn.closest('pre');
      if (!pre) return;
      const rawText = getCodeBlockRawText(pre);
      const lines = rawText.split('\n').length;
      pre.classList.toggle('is-folded');
      const isFolded = pre.classList.contains('is-folded');
      foldBtn.textContent = isFolded ? `Развернуть (${lines})` : 'Свернуть';
      return;
    }

    // 3. Language Selector button
    const langBtn = event.target.closest('.code-lang-btn');
    if (langBtn) {
      event.preventDefault();
      event.stopPropagation();

      const pre = langBtn.closest('pre');
      if (!pre) return;
      openLanguageMenu(pre, langBtn, (selectedLang) => {
        setCodeLanguage(pre, selectedLang);
        notifyChange();
      });
      return;
    }
  });

  // Make links clickable in contenteditable
  richEditor.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;

    // Do not open if user was highlighting text
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim().length > 0) return;

    const href = link.getAttribute('href');
    if (!href) return;

    event.preventDefault();
    event.stopPropagation();
    window.open(href, '_blank', 'noopener,noreferrer');
  });

  // Clicking below all content in the editor or container ensures focus is on a trailing paragraph
  richEditor.addEventListener('mousedown', (event) => {
    if (!event.target.closest('pre')) {
      clearTimeout(codeHighlightTimeout);
    }
  });

  richEditor.addEventListener('click', (event) => {
    if (event.target === richEditor) {
      clearTimeout(codeHighlightTimeout);
      const p = ensureTrailingParagraph(richEditor);
      const targetP = p || (richEditor.lastElementChild?.tagName === 'P' ? richEditor.lastElementChild : null);
      if (targetP) {
        placeCaretAtEndOf(targetP);
        notifyChange();
      }
    }
  });

  containerEl.addEventListener('click', (event) => {
    if (event.target === containerEl) {
      clearTimeout(codeHighlightTimeout);
      richEditor.focus();
      const p = ensureTrailingParagraph(richEditor);
      const targetP = p || (richEditor.lastElementChild?.tagName === 'P' ? richEditor.lastElementChild : null);
      if (targetP) {
        placeCaretAtEndOf(targetP);
        notifyChange();
      }
    }
  });

  function isInsideCodeBlock() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.anchorNode;
    while (node && node !== richEditor) {
      if (node.nodeName === 'CODE' || node.nodeName === 'PRE') return true;
      node = node.parentNode;
    }
    return false;
  }

  function notifyChange() {
    onChange();
  }

  // Debounced live re-highlighting when typing inside code blocks
  let codeHighlightTimeout = null;

  function rehighlightCodeBlock(pre, immediate = false) {
    if (!pre || !window.hljs) return;

    const doHighlight = () => {
      if (!richEditor.contains(pre)) return;
      const code = normalizeCodeBlock(pre);
      const rawText = getCodeBlockRawText(pre);
      if (!rawText.trim()) return;

      // Check if user manually chose a language
      const isManual = pre.dataset.manualLanguage === 'true';
      const manualLang = isManual ? pre.dataset.language : null;

      let language = manualLang;
      let value = '';
      if (manualLang && manualLang !== 'plaintext') {
        try {
          value = window.hljs.highlight(rawText, { language: manualLang, ignoreIllegals: true }).value;
        } catch {
          value = escapeHtml(rawText);
        }
      } else if (manualLang === 'plaintext') {
        value = escapeHtml(rawText);
      } else {
        const auto = highlightSnippet(rawText);
        language = auto.language || 'plaintext';
        value = auto.value;
      }

      // Update lang button text
      const langBtn = pre.querySelector('.code-lang-btn');
      if (langBtn) langBtn.textContent = `${(language || 'plaintext').toUpperCase()} ▾`;

      // Update fold button if lines changed
      const lineCount = rawText.split('\n').length;
      let actions = pre.querySelector(':scope > .code-actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'code-actions';
        actions.contentEditable = 'false';
        pre.prepend(actions);
      }
      let foldBtn = actions.querySelector('.code-fold-btn');
      if (lineCount >= 8) {
        if (!foldBtn) {
          foldBtn = document.createElement('button');
          foldBtn.type = 'button';
          foldBtn.className = 'code-fold-btn';
          foldBtn.contentEditable = 'false';
          foldBtn.tabIndex = -1;
          foldBtn.setAttribute('title', 'Свернуть или развернуть код');
          actions.prepend(foldBtn);
        }
        const isFolded = pre.classList.contains('is-folded');
        foldBtn.textContent = isFolded ? `Развернуть (${lineCount})` : 'Свернуть';
      } else if (foldBtn) {
        foldBtn.remove();
        pre.classList.remove('is-folded');
      }

      // Caret management:
      // If the user already clicked outside or pressed Shift+Enter, DO NOT hijack their caret!
      const curSel = window.getSelection();
      const isStillInside = curSel && curSel.rangeCount > 0 && pre.contains(curSel.anchorNode);
      if (!isStillInside) {
        try {
          code.innerHTML = value;
          code.className = 'hljs hljs-highlighted' + (language ? ` language-${language}` : '');
          if (language) pre.dataset.language = language;
          else pre.dataset.language = 'plaintext';
        } catch {
          /* Ignore highlight error */
        }
        return;
      }

      const offset = getCaretCharacterOffsetWithin(code);
      try {
        if (code.innerHTML !== value) {
          code.innerHTML = value;
        }
        code.className = 'hljs hljs-highlighted' + (language ? ` language-${language}` : '');
        if (language) pre.dataset.language = language;
        else pre.dataset.language = 'plaintext';

        // Verify again that user is still inside before restoring offset
        const afterSel = window.getSelection();
        if (afterSel && afterSel.rangeCount > 0 && pre.contains(afterSel.anchorNode)) {
          setCaretCharacterOffsetWithin(code, offset);
        }
      } catch {
        /* Ignore highlight error */
      }
    };

    if (immediate) {
      clearTimeout(codeHighlightTimeout);
      doHighlight();
    } else {
      clearTimeout(codeHighlightTimeout);
      codeHighlightTimeout = setTimeout(doHighlight, 600);
    }
  }

  function handleCodeBlockTyping() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const node = sel.anchorNode;
    const pre = node?.nodeType === Node.ELEMENT_NODE ? node.closest('pre') : node?.parentElement?.closest('pre');
    if (!pre) return;
    rehighlightCodeBlock(pre, false);
  }

  function insertTextIntoCodeBlock(text) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    let node = sel.anchorNode;
    let pre = null;
    while (node && node !== richEditor) {
      if (node.nodeName === 'PRE') {
        pre = node;
        break;
      }
      node = node.parentNode;
    }
    if (!pre) return;

    const code = normalizeCodeBlock(pre);
    const rawBefore = getCodeBlockRawText(pre);
    const currentOffset = getCaretCharacterOffsetWithin(code);
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let targetOffset = 0;

    if (!rawBefore.trim()) {
      code.textContent = cleanText;
      targetOffset = cleanText.length;
    } else {
      const range = sel.getRangeAt(0);
      const selectedLength = range.toString().length;
      const textBefore = rawBefore.slice(0, currentOffset);
      const textAfter = rawBefore.slice(currentOffset + selectedLength);
      code.textContent = textBefore + cleanText + textAfter;
      targetOffset = currentOffset + cleanText.length;
    }

    normalizeCodeBlock(pre);
    rehighlightCodeBlock(pre, true);

    const afterSel = window.getSelection();
    if (afterSel) {
      setCaretCharacterOffsetWithin(code, targetOffset);
    }

    notifyChange();
  }

  function insertCodeBlockWithText(text, explicitLang = null) {
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = cleanText;
    pre.appendChild(code);

    if (explicitLang) {
      pre.dataset.language = explicitLang;
      pre.dataset.manualLanguage = 'true';
    }

    richEditor.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);

      // If caret is in an empty paragraph, replace that paragraph
      let containerBlock = range.startContainer;
      while (containerBlock && containerBlock.parentNode !== richEditor) {
        containerBlock = containerBlock.parentNode;
      }
      if (
        containerBlock &&
        containerBlock.nodeName === 'P' &&
        (!containerBlock.textContent || containerBlock.textContent === '\n')
      ) {
        containerBlock.replaceWith(pre);
      } else {
        range.deleteContents();
        range.insertNode(pre);
      }
    } else {
      richEditor.appendChild(pre);
    }

    enhanceCodeBlocks(richEditor);
    ensureTrailingParagraph(richEditor);

    const targetP = pre.nextElementSibling;
    if (targetP && targetP.tagName === 'P') {
      placeCaretAtStartOf(targetP);
    } else {
      placeCaretAtEndOf(code);
    }

    notifyChange();
  }

  function insertSanitisedHtml(rawHtml) {
    const clean = sanitiseHtmlForEditor(rawHtml);
    if (!clean) return;
    richEditor.focus();
    document.execCommand('insertHTML', false, clean);
    enhanceCodeBlocks(richEditor);
    autoLinkBareUrls(richEditor);
    ensureTrailingParagraph(richEditor);
    notifyChange();
  }

  function insertPlainText(text) {
    if (!isInsideCodeBlock() && /(https?:\/\/[^\s<]+|www\.[^\s<]+)/i.test(text)) {
      const linkedHtml = autoLinkText(text).replace(/\n/g, '<br>');
      insertSanitisedHtml(linkedHtml);
      return;
    }

    richEditor.focus();
    document.execCommand('insertText', false, text);
    notifyChange();
  }

  function handlePaste(event) {
    event.preventDefault();
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    if (isInsideCodeBlock()) {
      const text = clipboardData.getData('text/plain') || '';
      if (text) {
        insertTextIntoCodeBlock(text);
      }
      return;
    }

    const plainText = clipboardData.getData('text/plain') || '';
    const html = clipboardData.getData('text/html') || '';

    // Check if pasted content is HTML source code (so it is not collapsed into a single line)
    if (isHtmlSourceCode(plainText) || (!plainText && isHtmlSourceCode(html))) {
      const codeText = plainText || html;
      insertCodeBlockWithText(codeText, 'html');
      return;
    }

    if (html) {
      insertSanitisedHtml(html);
      return;
    }

    if (plainText) {
      insertPlainText(plainText);
    }
  }

  function handleKeydown(event) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const isCtrlOrCmd = event.ctrlKey || event.metaKey;
    const isZ = event.code === 'KeyZ' || event.key === 'z' || event.key === 'Z' || event.key === 'я' || event.key === 'Я';
    const isY = event.code === 'KeyY' || event.key === 'y' || event.key === 'Y' || event.key === 'н' || event.key === 'Н';

    // Layout-independent Undo/Redo fallback for Russian keyboard layout
    if (isCtrlOrCmd && isZ && !event.shiftKey && (event.key === 'я' || event.key === 'Я')) {
      event.preventDefault();
      document.execCommand('undo', false, null);
      notifyChange();
      return;
    }

    if (isCtrlOrCmd && ((isZ && event.shiftKey) || isY) && (event.key === 'н' || event.key === 'Н' || event.key === 'я' || event.key === 'Я')) {
      event.preventDefault();
      document.execCommand('redo', false, null);
      notifyChange();
      return;
    }

    // Hotkey to format selection as code: Ctrl+E, Ctrl+`, Alt+C
    if (
      ((event.ctrlKey || event.metaKey) && (event.key === 'e' || event.key === 'E' || event.key === '`' || event.key === '~')) ||
      (event.altKey && (event.key === 'c' || event.key === 'C'))
    ) {
      event.preventDefault();
      hideSelectionBubble();
      toggleCode();
      return;
    }

    const node = sel.anchorNode;
    const pre = node?.nodeType === Node.ELEMENT_NODE ? node.closest('pre') : node?.parentElement?.closest('pre');

    // Markdown shortcut: typing ``` or ```lang and pressing Enter/Space
    if (!pre && (event.key === 'Enter' || event.key === ' ')) {
      const lineText = (node?.nodeType === Node.TEXT_NODE ? node.nodeValue : node?.textContent) || '';
      const match = lineText.trim().match(/^```([a-z0-9_-]*)$/i);
      if (match) {
        event.preventDefault();
        const lang = match[1] || '';
        let block = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        while (block && block.parentNode !== richEditor) {
          block = block.parentNode;
        }
        if (block) {
          const newPre = document.createElement('pre');
          if (lang) {
            newPre.dataset.language = lang;
            newPre.dataset.manualLanguage = 'true';
          }
          const newCode = document.createElement('code');
          newCode.textContent = '\n';
          newPre.appendChild(newCode);
          block.replaceWith(newPre);
          enhanceCodeBlocks(richEditor);
          ensureTrailingParagraph(richEditor);
          placeCaretAtStartOf(newCode);
          notifyChange();
          return;
        }
      }
    }

    if (pre) {
      const code = pre.querySelector('code') || pre;

      if (event.key === 'Tab') {
        event.preventDefault();
        document.execCommand('insertText', false, '  ');
        notifyChange();
        return;
      }

      // Escape code block downwards: Shift+Enter or Ctrl+Enter
      if (event.key === 'Enter' && (event.shiftKey || event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        clearTimeout(codeHighlightTimeout);
        let targetP = pre.nextElementSibling;
        if (!targetP || targetP.tagName !== 'P') {
          targetP = document.createElement('p');
          targetP.innerHTML = '<br>';
          pre.after(targetP);
        }
        placeCaretAtStartOf(targetP);
        notifyChange();
        return;
      }

      // Escape code block: Double Enter or Enter on blank line
      if (event.key === 'Enter') {
        const text = code.textContent;
        const offset = getCaretCharacterOffsetWithin(code);

        // Blank code block: convert back to normal paragraph
        if (!text.trim()) {
          event.preventDefault();
          clearTimeout(codeHighlightTimeout);
          const p = document.createElement('p');
          p.innerHTML = '<br>';
          pre.replaceWith(p);
          placeCaretAtStartOf(p);
          notifyChange();
          return;
        }

        // Caret is at the end of block and previous character is already newline (double enter)
        if (offset === text.length && text.endsWith('\n')) {
          event.preventDefault();
          clearTimeout(codeHighlightTimeout);
          code.textContent = text.slice(0, -1);
          let targetP = pre.nextElementSibling;
          if (!targetP || targetP.tagName !== 'P') {
            targetP = document.createElement('p');
            targetP.innerHTML = '<br>';
            pre.after(targetP);
          }
          placeCaretAtStartOf(targetP);
          notifyChange();
          return;
        }

        // Normal Enter: insert newline in code block
        event.preventDefault();
        document.execCommand('insertText', false, '\n');
        notifyChange();
        return;
      }

      // Natural ArrowDown navigation within code blocks:
      // Do NOT prevent default so the browser naturally moves down line by line!
      // Only if the caret was already at the very end of the code and cannot move down,
      // step into the paragraph below.
      if (event.key === 'ArrowDown') {
        const offsetBefore = getCaretCharacterOffsetWithin(code);
        setTimeout(() => {
          const selAfter = window.getSelection();
          if (!selAfter || selAfter.rangeCount === 0) return;
          if (pre.contains(selAfter.anchorNode)) {
            const offsetAfter = getCaretCharacterOffsetWithin(code);
            if (offsetBefore === offsetAfter && offsetBefore === code.textContent.length) {
              clearTimeout(codeHighlightTimeout);
              let target = pre.nextElementSibling;
              if (!target || target.tagName !== 'P') {
                target = document.createElement('p');
                target.innerHTML = '<br>';
                pre.after(target);
              }
              placeCaretAtStartOf(target);
              notifyChange();
            }
          }
        }, 0);
        return;
      }

      // Natural ArrowUp navigation within code blocks:
      // Do NOT prevent default so the browser naturally moves up line by line!
      if (event.key === 'ArrowUp') {
        const offsetBefore = getCaretCharacterOffsetWithin(code);
        setTimeout(() => {
          const selAfter = window.getSelection();
          if (!selAfter || selAfter.rangeCount === 0) return;
          if (pre.contains(selAfter.anchorNode)) {
            const offsetAfter = getCaretCharacterOffsetWithin(code);
            if (offsetBefore === 0 && offsetAfter === 0 && !pre.previousElementSibling) {
              clearTimeout(codeHighlightTimeout);
              const target = document.createElement('p');
              target.innerHTML = '<br>';
              pre.before(target);
              placeCaretAtStartOf(target);
              notifyChange();
            }
          }
        }, 0);
        return;
      }
    }
  }

  function toggleHeading() {
    const currentBlock = document.queryCommandValue('formatBlock');
    if (currentBlock?.toLowerCase() === HEADING_TAG.toLowerCase()) {
      document.execCommand('formatBlock', false, 'p');
    } else {
      document.execCommand('formatBlock', false, HEADING_TAG);
    }
    notifyChange();
  }

  function toggleCode() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    let parentNode = selection.anchorNode;
    while (parentNode && parentNode !== richEditor) {
      if (parentNode.nodeName === 'CODE' || parentNode.nodeName === 'PRE') {
        const pre = parentNode.nodeName === 'PRE' ? parentNode : parentNode.closest('pre') || parentNode;
        const text = getCodeBlockRawText(pre);
        const p = document.createElement('p');
        p.textContent = text;
        pre.replaceWith(p);
        notifyChange();
        return;
      }
      parentNode = parentNode.parentNode;
    }

    const selectedText = range.toString();

    if (selectedText.length > 0) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = selectedText;
      pre.appendChild(code);
      range.deleteContents();
      range.insertNode(pre);
      enhanceCodeBlocks(richEditor);
      ensureTrailingParagraph(richEditor);

      const newRange = document.createRange();
      newRange.selectNodeContents(code);
      selection.removeAllRanges();
      selection.addRange(newRange);
    } else {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = '\n';
      pre.appendChild(code);
      range.insertNode(pre);
      enhanceCodeBlocks(richEditor);
      ensureTrailingParagraph(richEditor);

      const newRange = document.createRange();
      newRange.setStart(code, 0);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
    notifyChange();
  }

  function insertLink() {
    const url = window.prompt('Введите URL ссылки (https://…):');
    if (!url) return;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !/^mailto:/i.test(trimmed)) {
      window.alert('Ссылка должна начинаться с http://, https:// или mailto:.');
      return;
    }
    document.execCommand('createLink', false, trimmed);
    // Ensure created links have target="_blank"
    richEditor.querySelectorAll('a:not([target])').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer nofollow');
    });
    notifyChange();
  }

  function execToolbarCommand(command) {
    richEditor.focus();
    switch (command) {
      case 'heading':
        toggleHeading();
        return;
      case 'code':
        toggleCode();
        return;
      case 'createLink':
        insertLink();
        return;
      default:
        document.execCommand(command, false, null);
        notifyChange();
    }
  }

  function getHtml() {
    const clone = richEditor.cloneNode(true);
    clone.querySelectorAll('.code-actions, .code-copy-btn, .code-fold-btn, .code-lang-btn, .code-lang-menu').forEach((el) => el.remove());
    clone.querySelectorAll('pre.is-folded').forEach((p) => p.classList.remove('is-folded'));
    return clone.innerHTML;
  }

  function setHtml(html) {
    const clean = sanitiseHtmlForEditor(html || '');
    if (richEditor.innerHTML !== clean) {
      richEditor.innerHTML = clean;
      enhanceCodeBlocks(richEditor);
      autoLinkBareUrls(richEditor);
      ensureTrailingParagraph(richEditor);
    }
  }

  function getPlainText() {
    return extractPlainText(getHtml());
  }

  function isEmpty() {
    return getPlainText().trim().length === 0;
  }

  function clear() {
    richEditor.innerHTML = '';
    notifyChange();
  }

  function focus() {
    richEditor.focus();
  }

  function selectAll() {
    focus();
    const range = document.createRange();
    range.selectNodeContents(richEditor);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function queryActiveCommands() {
    const selection = window.getSelection();
    let inCode = false;
    if (selection && selection.rangeCount > 0) {
      let node = selection.anchorNode;
      while (node && node !== richEditor) {
        if (node.nodeName === 'CODE' || node.nodeName === 'PRE') {
          inCode = true;
          break;
        }
        node = node.parentNode;
      }
    }
    return {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      heading: document.queryCommandValue('formatBlock')?.toLowerCase() === HEADING_TAG.toLowerCase(),
      code: inCode,
    };
  }

  // Event listeners
  richEditor.addEventListener('paste', handlePaste);
  richEditor.addEventListener('input', () => {
    handleCodeBlockTyping();
    notifyChange();
  });
  richEditor.addEventListener('keydown', handleKeydown);

  function destroy() {
    richEditor.removeEventListener('paste', handlePaste);
    richEditor.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('selectionchange', onSelectionChange);
    document.removeEventListener('mousedown', onDocMouseDown);
    window.removeEventListener('scroll', hideSelectionBubble);
    window.removeEventListener('resize', hideSelectionBubble);
    selectionBubble?.remove();
  }

  return {
    getHtml,
    setHtml,
    getPlainText,
    isEmpty,
    clear,
    focus,
    selectAll,
    execToolbarCommand,
    insertSanitisedHtml,
    insertPlainText,
    queryActiveCommands,
    enhanceCodeBlocks: () => enhanceCodeBlocks(richEditor),
    autoLinkBareUrls: () => autoLinkBareUrls(richEditor),
    destroy,
  };
}
