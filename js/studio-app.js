/**
 * DibasPixAI Studio Controller — Step 3: All Tools Popup Menu + Crop/Rotate/Flip + Before/After Slider
 */
(() => {
  const photoUpload = document.getElementById('photo-upload');
  const canvas = document.getElementById('editor-canvas');
  const emptyMsg = document.getElementById('empty-canvas-msg');
  const slBright = document.getElementById('sl-bright');
  const slContrast = document.getElementById('sl-contrast');
  const slSat = document.getElementById('sl-sat');
  const exportBtn = document.getElementById('export-btn');

  if (!canvas || !photoUpload) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  const MAX_PREVIEW_DIM = 1400;

  let originalImage = null;
  let beforeAfterEnabled = false;
  let splitRatio = 0.5;
  let rafPending = false;

  // Step 2 Transform state
  let rotationDeg = 0;   // 0, 90, 180, 270
  let flipH = false;
  let flipV = false;
  let cropMode = 'free'; // 'free' | '1:1' | '4:5' | '16:9'

  // Step 3 All Tools state
  let activeAllTool = null; // null | 'ai-removal' | 'cutout' | 'super-res' | 'collage' | 'noise-reduction'

  const ALL_TOOLS_LIST = [
    {
      id: 'ai-removal',
      name: 'AI Removal',
      badge: 'Clean',
      desc: 'Soft-blend & distraction tone smoothing',
      bright: 104,
      contrast: 96,
      sat: 102
    },
    {
      id: 'cutout',
      name: 'Cutout',
      badge: 'Pop',
      desc: 'Subject separation & crisp edge focus',
      bright: 108,
      contrast: 134,
      sat: 122
    },
    {
      id: 'super-res',
      name: 'Super Resolution',
      badge: '4K',
      desc: 'High-clarity detail & micro-contrast boost',
      bright: 107,
      contrast: 138,
      sat: 114
    },
    {
      id: 'collage',
      name: 'Collage',
      badge: 'Frame',
      desc: 'Studio frame border & gallery layout overlay',
      bright: 105,
      contrast: 112,
      sat: 110
    },
    {
      id: 'noise-reduction',
      name: 'Noise Reduction',
      badge: 'Smooth',
      desc: 'Grain reduction & smooth skin/shadow pass',
      bright: 110,
      contrast: 94,
      sat: 105
    }
  ];

  const canvasParent = canvas.parentElement;

  // Step 3 Trigger Bar: "All Tools" button & active tool pill
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

  // Step 3 Modal Popup
  const allToolsModal = document.createElement('div');
  allToolsModal.id = 'all-tools-modal';
  allToolsModal.className = 'hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
  allToolsModal.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-[#141418] border border-amber-400/35 shadow-2xl overflow-hidden">
      <div class="px-4 py-3.5 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 class="text-sm font-extrabold text-white tracking-wide">All Studio Tools</h3>
          <p class="text-[11px] text-stone-400">Select a tool to apply on your canvas</p>
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
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">${tool.badge}</span>
            </div>
            <p class="text-[11px] text-stone-400 leading-snug">${tool.desc}</p>
          </button>
        `
        ).join('')}
      </div>
      <div class="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs">
        <button id="clear-alltool-btn" type="button" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-stone-300 cursor-pointer">Clear Tool Effect</button>
        <button id="done-alltool-btn" type="button" class="px-4 py-1.5 rounded-lg bg-amber-500 text-black font-bold cursor-pointer">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(allToolsModal);

  // Step 2 Toolbar: Rotate, Flip, Crop
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

  // Step 1 Before / After Toolbar
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

  const toggleBaBtn = document.getElementById('toggle-ba-btn');
  const resetEditBtn = document.getElementById('reset-edit-btn');
  const baSliderWrap = document.getElementById('ba-slider-wrap');
  const baSplitRange = document.getElementById('ba-split-range');
  const activeToolBadge = document.getElementById('active-tool-badge');

  function updateActiveToolBadge() {
    if (!activeAllTool) {
      activeToolBadge.classList.add('hidden');
      activeToolBadge.textContent = '';
      return;
    }
    const found = ALL_TOOLS_LIST.find((t) => t.id === activeAllTool);
    activeToolBadge.textContent = `Active: ${found ? found.name : activeAllTool}`;
    activeToolBadge.classList.remove('hidden');
  }

  function getFilterString() {
    const b = slBright ? slBright.value : 100;
    const c = slContrast ? slContrast.value : 100;
    const s = slSat ? slSat.value : 100;
    return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  }

  function applyAllToolOverlay(targetCtx, w, h) {
    if (activeAllTool === 'collage') {
      const border = Math.max(12, Math.round(Math.min(w, h) * 0.04));
      targetCtx.save();
      targetCtx.strokeStyle = '#fbbf24';
      targetCtx.lineWidth = border;
      targetCtx.strokeRect(border / 2, border / 2, w - border, h - border);

      // Subtle split-frame guide lines
      targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
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

  function renderStudioCanvas(maxDim = MAX_PREVIEW_DIM) {
    if (!originalImage) return;

    if (document.getElementById('val-bright')) document.getElementById('val-bright').textContent = `${slBright.value}%`;
    if (document.getElementById('val-contrast')) document.getElementById('val-contrast').textContent = `${slContrast.value}%`;
    if (document.getElementById('val-sat')) document.getElementById('val-sat').textContent = `${slSat.value}%`;

    const baseCanvas = buildTransformedCanvas(originalImage, maxDim);
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!beforeAfterEnabled) {
      ctx.save();
      ctx.filter = getFilterString();
      ctx.drawImage(baseCanvas, 0, 0, w, h);
      ctx.restore();
      applyAllToolOverlay(ctx, w, h);
      return;
    }

    const splitX = Math.floor(w * splitRatio);

    // Before
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    ctx.filter = 'none';
    ctx.drawImage(baseCanvas, 0, 0, w, h);
    ctx.restore();

    // After
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    ctx.filter = getFilterString();
    ctx.drawImage(baseCanvas, 0, 0, w, h);
    applyAllToolOverlay(ctx, w, h);
    ctx.restore();

    // Divider line & labels
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
        rotationDeg = 0;
        flipH = false;
        flipV = false;
        cropMode = 'free';
        activeAllTool = null;
        updateCropButtons();
        updateActiveToolBadge();
        canvas.classList.remove('hidden');
        if (emptyMsg) emptyMsg.classList.add('hidden');
        transformBar.classList.remove('hidden');
        baBar.classList.remove('hidden');
        scheduleRender();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Step 3 All Tools modal controls
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
      const toolId = card.dataset.alltool;
      const toolCfg = ALL_TOOLS_LIST.find((t) => t.id === toolId);
      if (!toolCfg) return;
      activeAllTool = toolCfg.id;
      slBright.value = toolCfg.bright;
      slContrast.value = toolCfg.contrast;
      slSat.value = toolCfg.sat;
      updateActiveToolBadge();
      allToolsModal.classList.add('hidden');
      if (originalImage) scheduleRender();
    });
  });

  document.getElementById('clear-alltool-btn').addEventListener('click', () => {
    activeAllTool = null;
    slBright.value = 100;
    slContrast.value = 100;
    slSat.value = 100;
    updateActiveToolBadge();
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

  [slBright, slContrast, slSat].forEach((sl) => {
    if (sl) sl.addEventListener('input', scheduleRender);
  });

  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!originalImage) return;
      const preset = btn.dataset.preset;
      if (preset === 'hd') { slBright.value = 106; slContrast.value = 128; slSat.value = 112; }
      if (preset === 'retouch') { slBright.value = 112; slContrast.value = 104; slSat.value = 115; }
      if (preset === 'night') { slBright.value = 132; slContrast.value = 118; slSat.value = 108; }
      if (preset === 'vivid') { slBright.value = 105; slContrast.value = 120; slSat.value = 145; }
      scheduleRender();
    });
  });

  const autoRetouchBtn = document.getElementById('btn-auto-retouch');
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
    slBright.value = 100;
    slContrast.value = 100;
    slSat.value = 100;
    rotationDeg = 0;
    flipH = false;
    flipV = false;
    cropMode = 'free';
    activeAllTool = null;
    splitRatio = 0.5;
    baSplitRange.value = 50;
    updateCropButtons();
    updateActiveToolBadge();
    scheduleRender();
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!originalImage) return;
      const prevBA = beforeAfterEnabled;
      beforeAfterEnabled = false;
      renderStudioCanvas(Math.max(originalImage.width, originalImage.height));

      const link = document.createElement('a');
      link.download = `dibaspixai-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      beforeAfterEnabled = prevBA;
      renderStudioCanvas(MAX_PREVIEW_DIM);
    });
  }
})();
