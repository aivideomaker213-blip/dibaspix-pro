/**
 * DibasPixAI Studio Controller — Step 1: Before / After Slider & Live Canvas Engine
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
  let splitRatio = 0.5; // 50% split by default

  // Build Before/After UI controls right below the canvas container
  const canvasParent = canvas.parentElement;
  const baBar = document.createElement('div');
  baBar.id = 'ba-controls';
  baBar.className = 'hidden w-full mt-3 pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs';
  baBar.innerHTML = `
    <div class="flex items-center gap-2">
      <button id="toggle-ba-btn" type="button" class="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-300 font-semibold cursor-pointer transition">
        ⇄ Before / After: OFF
      </button>
      <button id="reset-edit-btn" type="button" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 cursor-pointer transition">
        Reset
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

  function renderStudioCanvas() {
    if (!originalImage) return;

    if (document.getElementById('val-bright')) document.getElementById('val-bright').textContent = `${slBright.value}%`;
    if (document.getElementById('val-contrast')) document.getElementById('val-contrast').textContent = `${slContrast.value}%`;
    if (document.getElementById('val-sat')) document.getElementById('val-sat').textContent = `${slSat.value}%`;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!beforeAfterEnabled) {
      ctx.save();
      ctx.filter = getFilterString();
      ctx.drawImage(originalImage, 0, 0, w, h);
      ctx.restore();
      return;
    }

    // Left side: Before (Original image)
    const splitX = Math.floor(w * splitRatio);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, h);
    ctx.clip();
    ctx.filter = 'none';
    ctx.drawImage(originalImage, 0, 0, w, h);
    ctx.restore();

    // Right side: After (Edited image)
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    ctx.filter = getFilterString();
    ctx.drawImage(originalImage, 0, 0, w, h);
    ctx.restore();

    // Vertical divider line & labels
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
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.classList.remove('hidden');
        if (emptyMsg) emptyMsg.classList.add('hidden');
        baBar.classList.remove('hidden');
        renderStudioCanvas();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
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
    splitRatio = 0.5;
    baSplitRange.value = 50;
    renderStudioCanvas();
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!originalImage) return;
      // Export clean edited image without split bar
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
