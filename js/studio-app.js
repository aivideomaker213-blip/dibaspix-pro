/**
 * DibasPixAI Studio Controller — Step 2: Crop, Rotate, Flip + Before/After Slider
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
  const ctx = canvas.getContext('2d');

  let originalImage = null;
  let beforeAfterEnabled = false;
  let splitRatio = 0.5;

  // Transform state (Step 2)
  let rotationDeg = 0;       // 0, 90, 180, 270
  let flipH = false;         // Horizontal mirror
  let flipV = false;         // Vertical flip
  let cropMode = 'free';     // 'free' | '1:1' | '4:5' | '16:9'

  const canvasParent = canvas.parentElement;

  // Step 2 Toolbar: Rotate, Flip, Crop
  const transformBar = document.createElement('div');
  transformBar.id = 'transform-controls';
  transformBar.className = 'hidden w-full mt-3 pt-3 border-t border-white/10 space-y-2.5 text-xs';
  transformBar.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-amber-400 font-bold uppercase tracking-wider text-[11px]">Transform & Crop</span>
      <div class="flex flex-wrap items-center gap-1.5">
        <button id="btn-rotate-left" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">↺ -90°</button>
        <button id="btn-rotate-right" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">↻ +90°</button>
        <button id="btn-flip-h" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">⇄ Flip H</button>
        <button id="btn-flip-v" type="button" class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 border border-white/10 text-stone-200 cursor-pointer transition">⇅ Flip V</button>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-stone-400 text-[11px]">Aspect Ratio:</span>
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
        ⇄ Before / After: ${beforeAfterEnabled ? 'ON' : 'OFF'}
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

  function getFilterString() {
    const b = slBright ? slBright.value : 100;
    const c = slContrast ? slContrast.value : 100;
    const s = slSat ? slSat.value : 100;
    return `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  }

  // Create transformed base image (Rotate + Flip + Crop) in an offscreen canvas
  function buildTransformedBaseCanvas() {
    const rotated = rotationDeg % 180 !== 0;
    const rotW = rotated ? originalImage.height : originalImage.width;
    const rotH = rotated ? originalImage.width : originalImage.height;

    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rotW;
    rotCanvas.height = rotH;
    const rCtx = rotCanvas.getContext('2d');

    rCtx.save();
    rCtx.translate(rotW / 2, rotH / 2);
    rCtx.rotate((rotationDeg * Math.PI) / 180);
    rCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    rCtx.drawImage(originalImage, -originalImage.width / 2, -originalImage.height / 2);
    rCtx.restore();

    // Apply Aspect Ratio Crop
    let cropW = rotW;
    let cropH = rotH;

    if (cropMode !== 'free') {
      const ratios = { '1:1': 1 / 1, '4:5': 4 / 5, '16:9': 16 / 9 };
      const targetRatio = ratios[cropMode];
      const currentRatio = rotW / rotH;

      if (currentRatio > targetRatio) {
        cropW = Math.round(rotH * targetRatio);
        cropH = rotH;
      } else {
        cropW = rotW;
        cropH = Math.round(rotW / targetRatio);
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

  function renderStudioCanvas() {
    if (!originalImage) return;

    if (document.getElementById('val-bright')) document.getElementById('val-bright').textContent = `${slBright.value}%`;
    if (document.getElementById('val-contrast')) document.getElementById('val-contrast').textContent = `${slContrast.value}%`;
    if (document.getElementById('val-sat')) document.getElementById('val-sat').textContent = `${slSat.value}%`;

    const baseCanvas = buildTransformedBaseCanvas();
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
      return;
    }

    // Before (Transformed original without filter)
    const splitX = Math.floor(w * splitRatio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    ctx.filter = 'none';
    ctx.drawImage(baseCanvas, 0, 0, w, h);
    ctx.restore();

    // After (Transformed + Edited)
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    ctx.filter = getFilterString();
    ctx.drawImage(baseCanvas, 0, 0, w, h);
    ctx.restore();

    // Divider line + labels
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
        updateCropButtons();
        canvas.classList.remove('hidden');
        if (emptyMsg) emptyMsg.classList.add('hidden');
        transformBar.classList.remove('hidden');
        baBar.classList.remove('hidden');
        renderStudioCanvas();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Rotate & Flip handlers
  document.getElementById('btn-rotate-left').addEventListener('click', () => {
    if (!originalImage) return;
    rotationDeg = (rotationDeg + 270) % 360;
    renderStudioCanvas();
  });

  document.getElementById('btn-rotate-right').addEventListener('click', () => {
    if (!originalImage) return;
    rotationDeg = (rotationDeg + 90) % 360;
    renderStudioCanvas();
  });

  document.getElementById('btn-flip-h').addEventListener('click', () => {
    if (!originalImage) return;
    flipH = !flipH;
    renderStudioCanvas();
  });

  document.getElementById('btn-flip-v').addEventListener('click', () => {
    if (!originalImage) return;
    flipV = !flipV;
    renderStudioCanvas();
  });

  // Crop ratio handlers
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
      renderStudioCanvas();
    });
  });

  [slBright, slContrast, slSat].forEach((sl) => {
    if (sl) sl.addEventListener('input', renderStudioCanvas);
  });

  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!originalImage) return;
      const preset = btn.dataset.preset;
      if (preset === 'hd') { slBright.value = 106; slContrast.value = 128; slSat.value = 112; }
      if (preset === 'retouch') { slBright.value = 112; slContrast.value = 104; slSat.value = 115; }
      if (preset === 'night') { slBright.value = 132; slContrast.value = 118; slSat.value = 108; }
      if (preset === 'vivid') { slBright.value = 105; slContrast.value = 120; slSat.value = 145; }
      renderStudioCanvas();
    });
  });

  const autoRetouchBtn = document.getElementById('btn-auto-retouch');
  if (autoRetouchBtn) {
    autoRetouchBtn.addEventListener('click', () => {
      if (!originalImage) return;
      slBright.value = 112;
      slContrast.value = 108;
      slSat.value = 116;
      renderStudioCanvas();
    });
  }

  toggleBaBtn.addEventListener('click', () => {
    beforeAfterEnabled = !beforeAfterEnabled;
    toggleBaBtn.textContent = `⇄ Before / After: ${beforeAfterEnabled ? 'ON' : 'OFF'}`;
    baSliderWrap.classList.toggle('hidden', !beforeAfterEnabled);
    renderStudioCanvas();
  });

  baSplitRange.addEventListener('input', (e) => {
    splitRatio = Number(e.target.value) / 100;
    renderStudioCanvas();
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
    splitRatio = 0.5;
    baSplitRange.value = 50;
    updateCropButtons();
    renderStudioCanvas();
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!originalImage) return;
      const prevBA = beforeAfterEnabled;
      beforeAfterEnabled = false;
      renderStudioCanvas();

      const link = document.createElement('a');
      link.download = `dibaspixai-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      beforeAfterEnabled = prevBA;
      renderStudioCanvas();
    });
  }
})();
