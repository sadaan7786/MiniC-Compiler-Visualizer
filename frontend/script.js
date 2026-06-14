/**
 * script.js — MiniC Compiler Visualizer Frontend
 * ================================================
 * Handles:
 *  - Monaco editor initialisation
 *  - Phase tab navigation
 *  - API calls to Flask /compile endpoint
 *  - Rendering tokens, AST, symbol table, TAC, assembly
 *  - D3.js AST tree visualisation
 */

"use strict";

/* ── Configuration ──────────────────────────────────────── */
const API_BASE   = "http://localhost:5000";
const DEMO_URL   = `${API_BASE}/demo`;
const COMPILE_URL = `${API_BASE}/compile`;

/* ── Sample programs ─────────────────────────────────────── */
const SAMPLES = {
  basic: `// Basic arithmetic with constant folding
int a;
int b;
a = 5 + 3 * 2;
b = a - 4;
print(b);
`,
  ifelse: `// If-else statement
int x;
int y;
x = 10;
y = 3;
if(x > y){
    x = x - y;
} else {
    y = y - x;
}
print(x);
`,
  while: `// While loop
int i;
int sum;
i = 1;
sum = 0;
while(i <= 5){
    sum = sum + i;
    i = i + 1;
}
print(sum);
`,
  full: `// Full Mini-C program — all features
int a;
int b;
int result;

a = 5 + 3 * 2;
b = a - 1;

if(a > b){
    result = a * b;
} else {
    result = a + b;
}

int counter;
counter = 0;
while(counter < 3){
    result = result + counter;
    counter = counter + 1;
}

print(result);
`
};

/* ── State ───────────────────────────────────────────────── */
let monacoEditor = null;
let currentData  = null;   // Last compile response
let astZoom      = 1;

/* ═══════════════════════════════════════════════════════════
   MONACO EDITOR INIT
═══════════════════════════════════════════════════════════ */
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
  /* Register a minimal Mini-C language for syntax highlighting */
  monaco.languages.register({ id: 'minic' });
  monaco.languages.setMonarchTokensProvider('minic', {
    keywords: ['int', 'float', 'if', 'else', 'while', 'print', 'return'],
    operators: ['=', '==', '!=', '<', '>', '<=', '>=', '+', '-', '*', '/', '%'],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, { token: 'comment.block', next: '@blockComment' }],
        [/\b(int|float|if|else|while|print|return)\b/, 'keyword'],
        [/[a-zA-Z_]\w*/, 'identifier'],
        [/\d+\.\d+/, 'number.float'],
        [/\d+/, 'number'],
        [/[{}\[\]()]/, 'delimiter.bracket'],
        [/[;,]/, 'delimiter'],
        [/[+\-*\/%]|[<>!]=?|==/, 'operator'],
        [/\s+/, 'white'],
      ],
      blockComment: [
        [/[^/*]+/, 'comment.block'],
        [/\*\//, { token: 'comment.block', next: '@pop' }],
        [/[/*]/, 'comment.block'],
      ],
    }
  });

  /* Define dark theme matching our CSS */
  monaco.editor.defineTheme('minic-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword',     foreground: 'bd93f9', fontStyle: 'bold' },
      { token: 'identifier',  foreground: '50fa7b' },
      { token: 'number',      foreground: 'ffb86c' },
      { token: 'number.float',foreground: 'ffb86c' },
      { token: 'operator',    foreground: 'ff79c6' },
      { token: 'delimiter',   foreground: '8be9fd' },
      { token: 'comment',     foreground: '6272a4', fontStyle: 'italic' },
      { token: 'comment.block',foreground: '6272a4', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background':          '#12141f',
      'editor.foreground':          '#e8eaf6',
      'editorLineNumber.foreground':'#545880',
      'editor.lineHighlightBackground':'#1a1d2e',
      'editorCursor.foreground':    '#7c6ff7',
      'editor.selectionBackground': '#7c6ff733',
      'editorIndentGuide.background':'#2a2f4a',
    }
  });

  monacoEditor = monaco.editor.create(document.getElementById('monacoEditor'), {
    value: SAMPLES.full,
    language: 'minic',
    theme: 'minic-dark',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    automaticLayout: true,
    padding: { top: 16 },
  });
});

/* ═══════════════════════════════════════════════════════════
   PHASE NAVIGATION
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('.phase-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const phase = btn.dataset.phase;
    switchPhase(phase);
  });
});

function switchPhase(phase) {
  document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  const btn   = document.querySelector(`.phase-btn[data-phase="${phase}"]`);
  const panel = document.getElementById(`panel-${phase}`);
  if (btn)   btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

/* ═══════════════════════════════════════════════════════════
   SAMPLE BUTTONS
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('.sample-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const code = SAMPLES[btn.dataset.sample];
    if (monacoEditor && code) monacoEditor.setValue(code);
  });
});

/* ═══════════════════════════════════════════════════════════
   COMPILE BUTTON
═══════════════════════════════════════════════════════════ */
document.getElementById('btnCompile').addEventListener('click', async () => {
  const code = monacoEditor ? monacoEditor.getValue() : '';
  if (!code.trim()) {
    showError(['No source code to compile.']);
    return;
  }
  await runCompile(code, COMPILE_URL, 'POST', { code });
});

/* ── Demo button: load pre-computed demo from /demo ─────── */
document.getElementById('btnDemo').addEventListener('click', async () => {
  await runCompile(null, DEMO_URL, 'GET', null);
});

/* ── Core compile runner ─────────────────────────────────── */
async function runCompile(code, url, method, body) {
  setStatus('compiling', 'Compiling…');
  showLoading(true);
  hideError();

  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(url, opts);
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error || 'Server error');

    currentData = data;

    /* Populate demo code if returned */
    if (data.demo_code && monacoEditor) monacoEditor.setValue(data.demo_code);

    /* Render all phases */
    renderTokens(data.tokens || []);
    renderAST(data.ast || {});
    renderSymbolTable(data.symbol_table || []);
    renderCodeViewer('tacViewer',  data.tac       || '', 'tac');
    renderCodeViewer('optViewer',  data.optimized || '', 'opt');
    renderCodeViewer('asmViewer',  data.assembly  || '', 'asm');

    /* Mark all phase buttons done */
    document.querySelectorAll('.phase-btn:not([data-phase="editor"])').forEach(b =>
      b.classList.add('done')
    );

    if (data.errors && data.errors.length > 0) {
      showError(data.errors);
      setStatus('error', 'Errors found');
    } else {
      setStatus('ok', 'Compiled ✓');
    }

    /* Auto-switch to tokens tab */
    switchPhase('tokens');

  } catch (err) {
    showError([err.message]);
    setStatus('error', 'Failed');
  } finally {
    showLoading(false);
  }
}

/* ═══════════════════════════════════════════════════════════
   RENDER: TOKEN TABLE
═══════════════════════════════════════════════════════════ */
function renderTokens(tokens) {
  const tbody = document.getElementById('tokenBody');
  tbody.innerHTML = '';

  /* Count by category */
  let keywords = 0, ids = 0, consts = 0, ops = 0;
  tokens.forEach(tok => {
    if (tok.type === 'KEYWORD')                          keywords++;
    else if (tok.type === 'IDENTIFIER')                  ids++;
    else if (tok.type === 'INT_CONST' || tok.type === 'FLOAT_CONST') consts++;
    else if (tok.type === 'ARITH_OP' || tok.type === 'REL_OP' || tok.type === 'ASSIGN') ops++;
  });

  /* Stats bar */
  document.getElementById('tokenStats').innerHTML = `
    <div class="stat-chip total">${tokens.length} tokens</div>
    <div class="stat-chip keyword">${keywords} keywords</div>
    <div class="stat-chip id">${ids} identifiers</div>
    <div class="stat-chip const">${consts} constants</div>
    <div class="stat-chip operator">${ops} operators</div>
  `;

  /* Table rows */
  tokens.forEach((tok, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td class="tok-${tok.type}">${tok.type}</td>
      <td style="color:var(--text-primary);font-weight:600">${escapeHtml(tok.lexeme)}</td>
      <td style="color:var(--text-muted)">${tok.line}</td>
    `;
    tbody.appendChild(tr);
  });

  if (!tokens.length) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><span class="empty-icon">◌</span>No tokens yet — compile first</div></td></tr>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   RENDER: SYMBOL TABLE
═══════════════════════════════════════════════════════════ */
function renderSymbolTable(symbols) {
  const tbody = document.getElementById('symBody');
  tbody.innerHTML = '';

  symbols.forEach(sym => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--tok-id);font-weight:600">${escapeHtml(sym.name)}</td>
      <td style="color:var(--tok-keyword)">${sym.type}</td>
      <td style="color:var(--text-secondary)">${sym.scope}</td>
      <td style="color:var(--text-muted)">${sym.line}</td>
      <td><span class="badge-init badge-${sym.initialized}">${sym.initialized}</span></td>
    `;
    tbody.appendChild(tr);
  });

  if (!symbols.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">◌</span>No symbols — compile first</div></td></tr>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   RENDER: CODE VIEWER (TAC / OPT / ASM)
═══════════════════════════════════════════════════════════ */
function renderCodeViewer(id, text, mode) {
  const container = document.getElementById(id);
  if (!text.trim()) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">◌</span>Compile first to see ${mode.toUpperCase()}</div>`;
    return;
  }

  const lines = text.split('\n');
  container.innerHTML = lines.map((line, i) => {
    const num = String(i + 1).padStart(3, ' ');
    return `<div class="code-line">
      <span class="line-num">${num}</span>
      <span class="line-text">${highlightLine(line, mode)}</span>
    </div>`;
  }).join('');
}

/* ── Syntax highlight a single code line ─────────────────── */
function highlightLine(line, mode) {
  const esc = escapeHtml(line);

  if (mode === 'tac' || mode === 'opt') {
    if (esc.trim().startsWith(';')) {
      if (esc.includes('[DEAD]'))   return `<span class="tac-dead">${esc}</span>`;
      if (esc.includes('[folded]')) return `<span class="tac-folded">${esc}</span>`;
      return `<span class="tac-comment">${esc}</span>`;
    }
    if (/^[A-Z]\d+:/.test(esc.trim())) return `<span class="tac-label">${esc}</span>`;
    if (/\bifFalse\b|\bgoto\b|\bprint\b/.test(esc))
      return esc.replace(/\b(ifFalse|goto|print)\b/g, '<span class="tac-keyword">$1</span>');
    return esc.replace(/\bt\d+\b/g, '<span class="tac-temp">$&</span>');
  }

  if (mode === 'asm') {
    if (esc.trim().startsWith(';')) return `<span class="asm-comment">${esc}</span>`;
    if (/^\s*\w+:\s*$/.test(esc))   return `<span class="asm-label">${esc}</span>`;
    if (/^\.(data|code)/.test(esc.trim())) return `<span class="asm-directive">${esc}</span>`;
    return esc.replace(/\b(MOV|ADD|SUB|MUL|DIV|CMP|JE|JNE|JMP|PUSH|POP|CALL|NEG|HALT)\b/g,
      '<span class="asm-mnemonic">$1</span>');
  }

  return esc;
}

/* ═══════════════════════════════════════════════════════════
   RENDER: AST TREE  (D3.js)
═══════════════════════════════════════════════════════════ */
function renderAST(treeData) {
  const container = document.getElementById('astContainer');
  const svg = d3.select('#astSvg');
  svg.selectAll('*').remove();

  if (!treeData || !treeData.name) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">◌</span>No AST data</div>`;
    return;
  }

  const W = container.clientWidth  || 800;
  const H = container.clientHeight || 500;

  const g = svg.append('g').attr('class', 'ast-root');

  /* Pan/zoom support */
  const zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  /* Expose zoom controls to buttons */
  document.getElementById('btnZoomIn').onclick  = () => svg.transition().call(zoom.scaleBy, 1.3);
  document.getElementById('btnZoomOut').onclick = () => svg.transition().call(zoom.scaleBy, 0.77);
  document.getElementById('btnReset').onclick   = () => svg.transition().call(zoom.transform, d3.zoomIdentity);

  /* Build D3 hierarchy */
  const root = d3.hierarchy(treeData);
  const treeLayout = d3.tree().nodeSize([90, 70]);
  treeLayout(root);

  /* ── Draw links ─────────────────────────────────────── */
  g.selectAll('.ast-link')
    .data(root.links())
    .enter().append('path')
    .attr('class', 'ast-link')
    .attr('d', d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y)
    );

  /* ── Draw nodes ─────────────────────────────────────── */
  const node = g.selectAll('.ast-node')
    .data(root.descendants())
    .enter().append('g')
    .attr('class', d => `ast-node ${d.children ? '' : 'leaf'}`)
    .attr('transform', d => `translate(${d.x},${d.y})`);

  node.append('circle').attr('r', 26);

  /* Truncate long node labels */
  node.append('text')
    .text(d => {
      const name = d.data.name || '';
      return name.length > 10 ? name.slice(0, 9) + '…' : name;
    });

  /* Full tooltip on hover */
  node.append('title').text(d => d.data.name);

  /* Centre the tree in the viewport */
  const bounds = g.node().getBBox();
  const tx = W / 2 - (bounds.x + bounds.width  / 2);
  const ty = 40    - bounds.y;
  g.attr('transform', `translate(${tx},${ty})`);
}

/* ═══════════════════════════════════════════════════════════
   UI HELPERS
═══════════════════════════════════════════════════════════ */
function showLoading(on) {
  document.getElementById('loadingOverlay').style.display = on ? 'flex' : 'none';
}

function setStatus(state, text) {
  const badge = document.getElementById('statusBadge');
  badge.className = `status-badge ${state}`;
  document.getElementById('statusText').textContent = text;
}

function showError(errors) {
  if (!errors || !errors.length) return;
  const banner = document.getElementById('errorBanner');
  const list   = document.getElementById('errorList');
  list.innerHTML = errors.map(e => `<div>⚠ ${escapeHtml(e)}</div>`).join('');
  banner.style.display = 'flex';
}

function hideError() {
  document.getElementById('errorBanner').style.display = 'none';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════
   INIT: load empty states on page load
═══════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  renderTokens([]);
  renderSymbolTable([]);
  renderCodeViewer('tacViewer', '', 'tac');
  renderCodeViewer('optViewer', '', 'opt');
  renderCodeViewer('asmViewer', '', 'asm');
});
