/**
 * DibasPixAI Studio Controller — Full Sync: Bottom Tools + Sliders + All Tools + Crop/Rotate/Flip + Before/After + Credits/History
 */
(() => {
  const photoUpload = document.getElementById('photo-upload');
  const canvas = document.getElementById('editor-canvas');
  const emptyMsg = document.getElementById('empty-canvas-msg');
  const slBright = document.getElementById('sl-bright');
  const slContrast = document.getElementById('sl-contrast');
  const slSat = document.getElementById('sl-sat');
  const exportBtn = document.getElementById('export-btn');
  const userCreditsEl = document.getElementById('user-credits');
  const autoRetouchBtn = document.getElementById('btn-auto-retouch');

  if (!canvas || !photoUpload) return;
  const ctx = canvas.getContext('2d');

  const MAX_PREVIEW_DIM = 1400;

  let originalImage = null;
  let committedBaseImage = null;
  let beforeAfterEnabled = false;
  let splitRatio = 0.5;
  let rafPending = false;

  // Step 2 Transform state
  let rotationDeg = 0;   // 0, 90, 180, 270
  let flipH = false;
  let flipV = false;
  let cropMode = 'free'; // 'free' | '1:1' | '4:5' | '16:9'

  // Step 3 All Tools state
  let activeAllTool = null;
  let toolStrength = 80; // 0 to 100%

  // Step 4 History & Layer Stack state
  let historyStack = []; // { label, cost, prevSrc }

  const ALL_TOOLS_LIST = [
    {
      id: 'ai-removal',
      name: 'AI Removal',
      badge: 'Clean',
      cost: 2,
      desc: 'Soft-blend & distraction tone smoothing',
      bright: 104,
      contrast: 96,
      sat: 102
    },
    {
      id: 'cutout',
      name: 'Cutout',
      badge: 'Pop',
      cost: 2,
      desc: 'Subject separation & crisp edge focus',
      bright: 108,
      contrast: 134,
      sat: 122
    },
    {
      id: 'super-res',
      name: 'Super Resolution',
      badge: '4K',
      cost: 3,
      desc: 'High-clarity detail & micro-contrast boost',
      bright: 107,
      contrast: 138,
      sat: 114
    },
    {
      id: 'collage',
      name: 'Collage',
      badge: 'Frame',
      cost: 1,
      desc: 'Studio frame border & gallery layout overlay',
      bright: 105,
      contrast: 112,
      sat: 110
    },
    {
      id: 'noise-reduction',
      name: 'Noise Reduction',
      badge: 'Smooth',
      cost: 2,
      desc: 'Grain reduction & smooth skin/shadow pass',
      bright: 110,
      contrast: 94,
      sat: 105
    }
  ];

  const BOTTOM_PRESETS = {
    hd: { bright: 106, contrast: 128, sat: 112 },
    retouch: { bright: 112, contrast: 104, sat: 115 },
    night: { bright: 132, contrast: 118, sat: 108 },
    vivid: { bright: 105, contrast: 120, sat: 145 }
  };

  window.DibasPixAI_Hooks = {
    onBeforeApplyTool: async ({ toolId, strength, canvasDataUrl }) => {
      return { ok: true, dataUrl: canvasDataUrl, toolId, strength };
    }
  };

  function syncCreditsDisplay() {
    if (!userCreditsEl || typeof StudioSecurity === 'undefined') return;
    const session = StudioSecurity.getActiveSession();
    if (session && typeof session.credits === 'number') {
      userCreditsEl.textContent = session.credits;
    }
  }

  function spendCredits(amount) {
    if (typeof StudioSecurity === 'undefined') return true;
    const session = StudioSecurity.getActiveSession();
    if (!session) return false;
    const current = typeof session.credits === 'number' ? session.credits : 25;
    if (current < amount) return false;
    StudioSecurity.updateCredits(current - amount);
    syncCreditsDisplay();
    return true;
  }

  const canvasParent = canvas.parentElement;

  // Top All Tools Bar
  const allToolsBar = document.createElement('div');
  allToolsBar.id = 'all-tools-bar';
  allToolsBar.className = 'w-full mb-3 flex flex-wrap items-center justify-between gap-2 text-xs';
  allToolsBar.innerHTML = `
    <div class="flex items-center gap-2">
      <button id="open-all-tools-btn" type="button" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/25 to-purple-500/20 hover:from-amber-500/35 hover:to-purple-500/30 border border-amber-400/45 text-amber-200 font-bold cursor-pointer transition flex items-center gap-1.5">
        <span>🧰 All Tools</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-400 text-black font-extrabold">5</span>
      </button>
      <span id="active-tool-badge" class="hidden px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-400/35 text-purple-200 text-[11px] font-semibold"></span>
    </div>
    <span class="text-[11px] text-stone-400">Wink Studio Suite</span>
  `;
  canvasParent.insertBefore(allToolsBar, canvasParent.firstChild);

  // All Tools Modal
  const allToolsModal = document.createElement('div');
  allToolsModal.id = 'all-tools-modal';
  allToolsModal.className = 'hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
  allToolsModal.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-[#141418] border border-amber-400/35 shadow-2xl overflow-hidden">
      <div class="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-extrabold text-white tracking-wide">All Studio Tools</h3>
          <p class="text-[11px] text-stone-400">Pick a tool, adjust strength, and Apply & Save Layer</p>
        </div>
        <button id="close-all-tools-btn" type="button" class="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 text-sm font-bold cursor-pointer">✕</button>
      </div>
      <div id="all-tools-grid" class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[65vh] overflow-y-auto">
        ${ALL_TOOLS_LIST.map(
          (tool) => `
          <button
            type="button"
            data-alltool="${tool.id}"
            class="alltool-card text-left p-3 rounded-xl bg-white/[0.04] hover:bg-amber-500/15 border border-white/10 hover:border-amber-400/50 transition cursor-pointer space-y-1"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-white">${tool.name}</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">${tool.badge} · ${tool.cost}✦</span>
            </div>
            <p class="text-[11px] text-stone-400 leading-snug">${tool.desc}</p>
          </button>
        `
        ).join('')}
      </div>
      <div class="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs">
        <button id="clear-alltool-btn" type="button" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 cursor-pointer">Clear Tool</button>
        <button id="done-alltool-btn" type="button" class="px-4 py-1.5 rounded-lg bg-amber-500 text-black font-bold cursor-pointer">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(allToolsModal);

  // Dedicated Bottom Tool Adjustment Bar
  const toolAdjustBar = document.createElement('div');
  toolAdjustBar.id = 'tool-adjust-bar';
  toolAdjustBar.className = 'hidden w-full mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-400/30 space-y-2 text-xs';
  toolAdjustBar.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <span id="tool-adjust-title" class="font-bold text-amber-300 text-[11px] uppercase tracking-wider">Tool Adjustment</span>
      <span id="tool-strength-val" class="font-bold text-amber-200">80%</span>
    </div>
    <input id="sl-tool-strength" type="range" min="0" max="100" value="80" class="w-full accent-amber-400 cursor-pointer" />
    <div class="flex items-center justify-between gap-2 pt-1">
      <button id="btn-cancel-tool" type="button" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 cursor-pointer">
        Cancel
      </button>
      <button id="btn-apply-tool-layer" type="button" class="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold cursor-pointer transition">
        ✓ Apply & Save Layer
      </button>
    </div>
  `;
  canvasParent.appendChild(toolAdjustBar);

  // Step 2 Transform Bar
  const transformBar = document.createElement('div');
  transformBar.id = 'transform-controls';
  transformBar.className = 'hidden w-full mt-3 pt-3 border-t border-white/10 space-y-2.5 text-xs';
  transformBar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-amber-400 font-bold uppercase tracking-wider text-[11px]">Step 2 · Crop, Rotate & Flip</span>
      <div class="flex flex-wrap items-center gap-1.5">
        <button id="btn-rotate-left" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">↺ -90°</button>
        <button id="btn-rotate-right" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">↻ +90°</button>
        <button id="btn-flip-h" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">⇄ Flip H</button>
        <button id="btn-flip-v" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">⇅ Flip V</button>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-stone-400 text-[11px]">Crop Ratio:</span>
      <div class="flex flex-wrap items-center gap-1.5">
        <button type="button" data-crop="free" class="crop-btn px-2.5 py-1 rounded-lg bg-amber-500 text-black font-semibold cursor-pointer">Original</button>
        <button type="button" data-crop="1:1" class="crop-btn px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 cursor-pointer">1:1</button>
        <button type="button" data-crop="4:5" class="crop-btn px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 cursor-pointer">4:5</button>
        <button type="button" data-crop="16:9" class="crop-btn px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 cursor-pointer">16:9</button>
      </div>
    </div>
  `;
  canvasParent.appendChild(transformBar);

  // Step 1 Before/After Bar
  const baBar = document.createElement('div');
  baBar.id = 'ba-controls';
  baBar.className = 'hidden w-full mt-3 pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs';
  baBar.innerHTML = `
    <div class="flex items-center gap-2">
      <button id="toggle-ba-btn" type="button" class="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 font-semibold cursor-pointer transition">
        ⇄ Before / After: OFF
      </button>
      <button id="reset-edit-btn" type="button" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 cursor-pointer transition">
        Reset All
      </button>
    </div>
    <div id="ba-slider-wrap" class="hidden flex items-center gap-2 w-full sm:w-64">
      <span class="text-stone-400">Before</span>
      <input id="ba-split-range" type="range" min="0" max="100" value="50" class="w-full accent-amber-400 cursor-pointer" />
      <span class="text-amber-300 font-medium">After</span>
    </div>
  `;
  canvasParent.appendChild(baBar);

  // Step 4 Edit History Panel
  const historyPanel = document.createElement('div');
  historyPanel.id = 'edit-history-panel';
  historyPanel.className = 'hidden w-full mt-3 pt-3 border-t border-white/10 space-y-2 text-xs';
  historyPanel.innerHTML = `
    <div class="flex items-center justify-between">
      <span class="text-amber-400 font-bold uppercase tracking-wider text-[11px]">Step 4 · Edit History (<span id="history-count">0</span>)</span>
      <button id="btn-undo-history" type="button" class="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-500/20 border border-white/10 text-stone-300 hover:text-red-200 cursor-pointer transition">
        ↶ Undo Last
      </button>
    </div>
    <div id="history-list" class="flex flex-wrap gap-1.5"></div>
  `;
  canvasParent.appendChild(historyPanel);

  const toggleBaBtn = document.getElementById('toggle-ba-btn');
  const resetEditBtn = document.getElementById('reset-edit-btn');
  const baSliderWrap = document.getElementById('ba-slider-wrap');
  const baSplitRange = document.getElementById('ba-split-range');
  const activeToolBadge = document.getElementById('active-tool-badge');
  const slToolStrength = document.getElementById('sl-tool-strength');
  const toolStrengthVal = document.getElementById('tool-strength-val');
  const toolAdjustTitle = document.getElementById('tool-adjust-title');
  const historyCountEl = document.getElementById('history-count');
  const historyListEl = document.getElementById('history-list');

  function renderHistoryUI() {
    historyCountEl.textContent = String(historyStack.length);
    if (historyStack.length === 0) {
      historyListEl.innerHTML = `<span class="text-[11px] text-stone-500">No saved layers yet</span>`;
      return;
    }
    historyListEl.innerHTML = historyStack
      .map(
        (item, idx) => `
        <span class="px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-stone-200 text-[11px]">
          ${idx + 1}. ${item.label} <span class="text-amber-300">(-${item.cost}✦)</span>
        </span>
      `
      )
      .join('');
  }

  function updateToolUI() {
    const found = ALL_TOOLS_LIST.find((t) => t.id === activeAllTool);
    if (!found) {
      activeToolBadge.classList.add('hidden');
      activeToolBadge.textContent = '';
      toolAdjustBar.classList.add('hidden');
      return;
    }
    activeToolBadge.textContent = `Active: ${found.name} (${found.cost}✦)`;
    activeToolBadge.classList.remove('hidden');
    toolAdjustTitle.textContent = `${found.name} · Adjust Strength (${found.cost} Credits)`;
    toolStrengthVal.textContent = `${toolStrength}%`;
    slToolStrength.value = toolStrength;
    toolAdjustBar.classList.remove('hidden');
  }

  function getScaledToolFilter() {
    const found = ALL_TOOLS_LIST.find((t) => t.id === activeAllTool);
    if (!found) return '';
    const ratio = toolStrength / 100;
    const b = Math.round(100 + (found.bright - 100) * ratio);
    const c = Math.round(100 + (found.contrast - 100) * ratio);
    const s = Math.round(100 + (found.sat - 100) * ratio);
    return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  }

  function getManualFilterString() {
    const b = slBright ? slBright.value : 100;
    const c = slContrast ? slContrast.value : 100;
    const s = slSat ? slSat.value : 100;
    return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  }

  function applyAllToolOverlay(targetCtx, w, h) {
    if (activeAllTool === 'collage') {
      const alpha = Math.max(0.15, toolStrength / 100);
      const border = Math.max(10, Math.round(Math.min(w, h) * 0.04));
      targetCtx.save();
      targetCtx.globalAlpha = alpha;
      targetCtx.strokeStyle = '#fbbf24';
      targetCtx.lineWidth = border;
      targetCtx.strokeRect(border / 2, border / 2, w - border, h - border);

      targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      targetCtx.lineWidth = Math.max(1, Math.round(border * 0.15));
      targetCtx.beginPath();
      targetCtx.moveTo(w / 2, border);
      targetCtx.lineTo(w / 2, h - border);
      targetCtx.stroke();
      targetCtx.restore();
    }
  }

  function buildTransformedCanvas(sourceImg, maxDim) {
    const scale = Math.min(1, maxDim / Math.max(sourceImg.width, sourceImg.height));
    const srcW = Math.max(1, Math.round(sourceImg.width * scale));
    const srcH = Math.max(1, Math.round(sourceImg.height * scale));

    const rotated = rotationDeg % 180 !== 0;
    const rotW = rotated ? srcH : srcW;
    const rotH = rotated ? srcW : srcH;

    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rotW;
    rotCanvas.height = rotH;
    const rCtx = rotCanvas.getContext('2d');

    rCtx.save();
    rCtx.translate(rotW / 2, rotH / 2);
    rCtx.rotate((rotationDeg * Math.PI) / 180);
    rCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    rCtx.drawImage(sourceImg, -srcW / 2, -srcH / 2, srcW, srcH);
    rCtx.restore();

    let cropW = rotW;
    let cropH = rotH;

    if (cropMode !== 'free') {
      const ratios = { '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9 };
      const targetRatio = ratios[cropMode];
      const currentRatio = rotW / rotH;

      if (currentRatio > targetRatio) {
        cropW = Math.max(1, Math.round(rotH * targetRatio));
        cropH = rotH;
      } else {
        cropW = rotW;
        cropH = Math.max(1, Math.round(rotW / targetRatio));
      }
    }

    const cropX = Math.floor((rotW - cropW) / 2);
    const cropY = Math.floor((rotH - cropH) / 2);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = cropW;
    outCanvas.height = cropH;
    const oCtx = outCanvas.getContext('2d');
    oCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return outCanvas;
  }

  function buildCurrentEditedCanvas(maxDim) {
    const workingSource = committedBaseImage || originalImage;
    const baseCanvas = buildTransformedCanvas(workingSource, maxDim);

    const out = document.createElement('canvas');
    out.width = baseCanvas.width;
    out.height = baseCanvas.height;
    const oCtx = out.getContext('2d');

    const combinedFilter = `${getScaledToolFilter()} ${getManualFilterString()}`.trim();
    oCtx.save();
    if (combinedFilter) oCtx.filter = combinedFilter;
    oCtx.drawImage(baseCanvas, 0, 0, out.width, out.height);
    oCtx.restore();

    applyAllToolOverlay(oCtx, out.width, out.height);
    return out;
  }

  function renderStudioCanvas(maxDim = MAX_PREVIEW_DIM) {
    if (!originalImage) return;

    if (document.getElementById('val-bright')) document.getElementById('val-bright').textContent = `${slBright.value}%`;
    if (document.getElementById('val-contrast')) document.getElementById('val-contrast').textContent = `${slContrast.value}%`;
    if (document.getElementById('val-sat')) document.getElementById('val-sat').textContent = `${slSat.value}%`;

    const workingSource = committedBaseImage || originalImage;
    const beforeCanvas = buildTransformedCanvas(workingSource, maxDim);
    const afterCanvas = buildCurrentEditedCanvas(maxDim);

    canvas.width = afterCanvas.width;
    canvas.height = afterCanvas.height;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!beforeAfterEnabled) {
      ctx.drawImage(afterCanvas, 0, 0, w, h);
      return;
    }

    const splitX = Math.floor(w * splitRatio);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    ctx.drawImage(beforeCanvas, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    ctx.drawImage(afterCanvas, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = Math.max(2, Math.round(w / 320));
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, h);
    ctx.stroke();

    const fontSize = Math.max(12, Math.round(w / 42));
    ctx.font = `700 ${fontSize}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(10, 10, 74, fontSize + 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('BEFORE', 16, 10 + fontSize + 2);

    if (w - splitX > 90) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(splitX + 10, 10, 68, fontSize + 10);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('AFTER', splitX + 16, 10 + fontSize + 2);
    }
    ctx.restore();
  }

  function scheduleRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      renderStudioCanvas(MAX_PREVIEW_DIM);
    });
  }

  photoUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        originalImage = img;
        committedBaseImage = null;
        historyStack = [];
        rotationDeg = 0;
        flipH = false;
        flipV = false;
        cropMode = 'free';
        activeAllTool = null;
        toolStrength = 80;
        slBright.value = 100;
        slContrast.value = 100;
        slSat.value = 100;
        updateCropButtons();
        updateToolUI();
        renderHistoryUI();
        syncCreditsDisplay();
        canvas.classList.remove('hidden');
        if (emptyMsg) emptyMsg.classList.add('hidden');
        transformBar.classList.remove('hidden');
        baBar.classList.remove('hidden');
        historyPanel.classList.remove('hidden');
        scheduleRender();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // All Tools Modal & Multi-Apply Controls
  document.getElementById('open-all-tools-btn').addEventListener('click', () => {
    allToolsModal.classList.remove('hidden');
  });

  document.getElementById('close-all-tools-btn').addEventListener('click', () => {
    allToolsModal.classList.add('hidden');
  });

  document.getElementById('done-alltool-btn').addEventListener('click', () => {
    allToolsModal.classList.add('hidden');
  });

  allToolsModal.addEventListener('click', (e) => {
    if (e.target === allToolsModal) allToolsModal.classList.add('hidden');
  });

  document.querySelectorAll('.alltool-card').forEach((card) => {
    card.addEventListener('click', () => {
      if (!originalImage) {
        allToolsModal.classList.add('hidden');
        return;
      }
      activeAllTool = card.dataset.alltool;
      toolStrength = 80;
      updateToolUI();
      allToolsModal.classList.add('hidden');
      scheduleRender();
    });
  });

  slToolStrength.addEventListener('input', (e) => {
    toolStrength = Number(e.target.value);
    toolStrengthVal.textContent = `${toolStrength}%`;
    scheduleRender();
  });

  document.getElementById('btn-apply-tool-layer').addEventListener('click', async () => {
    if (!originalImage) return;
    const found = ALL_TOOLS_LIST.find((t) => t.id === activeAllTool);
    const cost = found ? found.cost : 1;
    const label = found ? `${found.name} (${toolStrength}%)` : 'Studio Edit';

    if (!spendCredits(cost)) {
      alert('Not enough credits! Please logout and sign in again to reset demo credits.');
      return;
    }

    const flattened = buildCurrentEditedCanvas(Math.max(originalImage.width, originalImage.height));
    let finalDataUrl = flattened.toDataURL('image/png');

    if (window.DibasPixAI_Hooks && typeof window.DibasPixAI_Hooks.onBeforeApplyTool === 'function') {
      const hookRes = await window.DibasPixAI_Hooks.onBeforeApplyTool({
        toolId: activeAllTool,
        strength: toolStrength,
        canvasDataUrl: finalDataUrl
      });
      if (hookRes && hookRes.dataUrl) finalDataUrl = hookRes.dataUrl;
    }

    const prevSource = committedBaseImage || originalImage;
    historyStack.push({
      label,
      cost,
      prevSrc: prevSource.src
    });

    const savedImg = new Image();
    savedImg.onload = () => {
      committedBaseImage = savedImg;
      rotationDeg = 0;
      flipH = false;
      flipV = false;
      cropMode = 'free';
      activeAllTool = null;
      toolStrength = 80;
      slBright.value = 100;
      slContrast.value = 100;
      slSat.value = 100;
      updateCropButtons();
      updateToolUI();
      renderHistoryUI();
      scheduleRender();
    };
    savedImg.src = finalDataUrl;
  });

  document.getElementById('btn-undo-history').addEventListener('click', () => {
    if (!originalImage || historyStack.length === 0) return;
    const last = historyStack.pop();
    if (historyStack.length === 0) {
      committedBaseImage = null;
      renderHistoryUI();
      scheduleRender();
      return;
    }
    const restoreImg = new Image();
    restoreImg.onload = () => {
      committedBaseImage = restoreImg;
      renderHistoryUI();
      scheduleRender();
    };
    restoreImg.src = last.prevSrc;
  });

  document.getElementById('btn-cancel-tool').addEventListener('click', () => {
    activeAllTool = null;
    toolStrength = 80;
    updateToolUI();
    scheduleRender();
  });

  document.getElementById('clear-alltool-btn').addEventListener('click', () => {
    activeAllTool = null;
    toolStrength = 80;
    updateToolUI();
    allToolsModal.classList.add('hidden');
    if (originalImage) scheduleRender();
  });

  // Step 2 Rotate & Flip handlers
  document.getElementById('btn-rotate-left').addEventListener('click', () => {
    if (!originalImage) return;
    rotationDeg = (rotationDeg + 270) % 360;
    scheduleRender();
  });

  document.getElementById('btn-rotate-right').addEventListener('click', () => {
    if (!originalImage) return;
    rotationDeg = (rotationDeg + 90) % 360;
    scheduleRender();
  });

  document.getElementById('btn-flip-h').addEventListener('click', () => {
    if (!originalImage) return;
    flipH = !flipH;
    scheduleRender();
  });

  document.getElementById('btn-flip-v').addEventListener('click', () => {
    if (!originalImage) return;
    flipV = !flipV;
    scheduleRender();
  });

  function updateCropButtons() {
    document.querySelectorAll('.crop-btn').forEach((btn) => {
      const active = btn.dataset.crop === cropMode;
      btn.className = active
        ? 'crop-btn px-2.5 py-1 rounded-lg bg-amber-500 text-black font-semibold cursor-pointer'
        : 'crop-btn px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 cursor-pointer';
    });
  }

  document.querySelectorAll('.crop-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!originalImage) return;
      cropMode = btn.dataset.crop;
      updateCropButtons();
      scheduleRender();
    });
  });

  // Sliders (Brightness, Contrast, Saturation)
  [slBright, slContrast, slSat].forEach((sl) => {
    if (!sl) return;
    sl.addEventListener('input', scheduleRender);
    sl.addEventListener('change', scheduleRender);
  });

  // Bottom Photo Repair & AI Tools (HD Quality, AI Retouch, Night View, AI Color)
  function applyBottomPreset(presetKey) {
    if (!originalImage) return;
    const cfg = BOTTOM_PRESETS[presetKey];
    if (!cfg) return;
    slBright.value = cfg.bright;
    slContrast.value = cfg.contrast;
    slSat.value = cfg.sat;
    scheduleRender();
  }

  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      applyBottomPreset(btn.dataset.preset);
    });
  });

  if (autoRetouchBtn) {
    autoRetouchBtn.addEventListener('click', () => {
      if (!originalImage) return;
      slBright.value = 112;
      slContrast.value = 108;
      slSat.value = 116;
      scheduleRender();
    });
  }

  toggleBaBtn.addEventListener('click', () => {
    beforeAfterEnabled = !beforeAfterEnabled;
    toggleBaBtn.textContent = `⇄ Before / After: ${beforeAfterEnabled ? 'ON' : 'OFF'}`;
    baSliderWrap.classList.toggle('hidden', !beforeAfterEnabled);
    scheduleRender();
  });

  baSplitRange.addEventListener('input', (e) => {
    splitRatio = Number(e.target.value) / 100;
    scheduleRender();
  });

  resetEditBtn.addEventListener('click', () => {
    if (!originalImage) return;
    committedBaseImage = null;
    historyStack = [];
    slBright.value = 100;
    slContrast.value = 100;
    slSat.value = 100;
    rotationDeg = 0;
    flipH = false;
    flipV = false;
    cropMode = 'free';
    activeAllTool = null;
    toolStrength = 80;
    splitRatio = 0.5;
    baSplitRange.value = 50;
    updateCropButtons();
    updateToolUI();
    renderHistoryUI();
    scheduleRender();
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!originalImage) return;
      const fullCanvas = buildCurrentEditedCanvas(Math.max(originalImage.width, originalImage.height));
      const link = document.createElement('a');
      link.download = `dibaspixai-${Date.now()}.png`;
      link.href = fullCanvas.toDataURL('image/png');
      link.click();
    });
  }

  syncCreditsDisplay();
})();
