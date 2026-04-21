/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const canvas = document.getElementById('previewCanvas');
const ctx = canvas.getContext('2d');
 
let image = new Image();
let imageLoaded = false;
let originalSrc = null;   // NEVER overwritten after first upload — used by Reset
let baseImageSrc = null;  // updated after crop — used for redraws
let history = [];
let zoomScale = 1;
 
let filters = defaultFilters();
let transform = { rotate: 0, flip_x: 1, flip_y: 1 };
 
function defaultFilters() {
  return {
    brightness: 100, contrast: 100, saturate: 100, invert: 0,
    blur: 0, grayscale: 0, sepia: 0, hue: 0,
    vignette: 0, grain: 0, pixelate: 0,
    temperature: 0, tint: 0, vibrance: 0,
    highlights: 0, shadows: 0, fade: 0, clarity: 0,
    sharpen: 0, glamour: 0,
  };
}
 
/* ═══════════════════════════════════════════
   UPLOAD
═══════════════════════════════════════════ */
const uploadZone = document.getElementById('uploadZone');
const uploader = document.getElementById('imageUploader');
 
uploadZone.addEventListener('click', () => uploader.click());
uploader.addEventListener('change', () => loadFile(uploader.files[0]));
 
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});
 
function loadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    originalSrc = e.target.result;   // permanent original — never changes
    baseImageSrc = e.target.result;
    image = new Image();
    image.onload = onImageLoaded;
    image.src = baseImageSrc;
  };
  reader.readAsDataURL(file);
}
 
function onImageLoaded() {
  imageLoaded = true;
  document.getElementById('placeholder').classList.add('hidden');
  canvas.classList.remove('hidden');
  fitCanvasToContainer();
  pushHistory();
  drawImage();
  drawHistogram();
}
 
function fitCanvasToContainer() {
  const wrap = document.getElementById('canvasWrap');
  const maxW = wrap.clientWidth * 0.92 * zoomScale;
  const maxH = wrap.clientHeight * 0.92 * zoomScale;
  const ratio = Math.min(maxW / image.width, maxH / image.height);
  canvas.width = image.width * ratio;
  canvas.height = image.height * ratio;
}
 
/* ═══════════════════════════════════════════
   DRAW PIPELINE
═══════════════════════════════════════════ */
function drawImage() {
  if (!imageLoaded) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(transform.rotate * Math.PI / 180);
  ctx.scale(transform.flip_x, transform.flip_y);
 
  // CSS filters (fast GPU path)
  ctx.filter = `
    brightness(${filters.brightness}%)
    contrast(${filters.contrast}%)
    saturate(${filters.saturate}%)
    invert(${filters.invert}%)
    blur(${filters.blur}px)
    grayscale(${filters.grayscale}%)
    sepia(${filters.sepia}%)
    hue-rotate(${filters.hue}deg)
  `;
 
  ctx.drawImage(image, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  ctx.restore();
  ctx.filter = 'none';
 
  // Pixel-level effects
  if (filters.temperature !== 0 || filters.tint !== 0 || filters.vibrance !== 0
      || filters.highlights !== 0 || filters.shadows !== 0 || filters.fade !== 0
      || filters.clarity !== 0 || filters.sharpen > 0) {
    applyPixelAdjustments();
  }
  if (filters.glamour > 0) applyGlamour();
  if (filters.pixelate > 0) applyPixelate();
  if (filters.grain > 0) applyGrain();
  if (filters.vignette > 0) applyVignette();
 
  drawHistogram();
}
 
/* ─── Pixel-level colour grading ─── */
function applyPixelAdjustments() {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const temp = filters.temperature / 100;
  const tnt  = filters.tint / 100;
  const vib  = filters.vibrance / 100;
  const hl   = filters.highlights / 100;
  const sh   = filters.shadows / 100;
  const fade = filters.fade / 100;
 
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
 
    // Temperature: warm=+R+G-B, cool=-R-G+B
    r = clamp(r + temp * 30);
    b = clamp(b - temp * 30);
 
    // Tint: green↔magenta
    g = clamp(g + tnt * 20);
    r = clamp(r - tnt * 10);
 
    // Vibrance (smart saturation - boosts less-saturated colours more)
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const vibBoost = vib * (1 - sat);
    const grey = lum * 255;
    r = clamp(r + (r - grey) * vibBoost);
    g = clamp(g + (g - grey) * vibBoost);
    b = clamp(b + (b - grey) * vibBoost);
 
    // Highlights (only bright pixels)
    if (lum > 0.5) {
      const t = (lum - 0.5) * 2;
      r = clamp(r + hl * t * 40);
      g = clamp(g + hl * t * 40);
      b = clamp(b + hl * t * 40);
    }
 
    // Shadows (only dark pixels)
    if (lum < 0.5) {
      const t = (0.5 - lum) * 2;
      r = clamp(r + sh * t * 40);
      g = clamp(g + sh * t * 40);
      b = clamp(b + sh * t * 40);
    }
 
    // Fade (lift blacks)
    r = clamp(r + fade * 40);
    g = clamp(g + fade * 40);
    b = clamp(b + fade * 40);
 
    // Clarity (local contrast / mid-tone contrast)
    if (filters.clarity !== 0) {
      const cl = filters.clarity / 100;
      const midBoost = cl * (lum - 0.5) * 60;
      r = clamp(r + midBoost);
      g = clamp(g + midBoost);
      b = clamp(b + midBoost);
    }
 
    d[i] = r; d[i+1] = g; d[i+2] = b;
  }
 
  // Sharpen using unsharp mask
  if (filters.sharpen > 0) {
    ctx.putImageData(imgData, 0, 0);
    applyUnsharpMask(filters.sharpen);
    return;
  }
 
  ctx.putImageData(imgData, 0, 0);
}
 
function applyUnsharpMask(amount) {
  const w = canvas.width, h = canvas.height;
  const orig = ctx.getImageData(0, 0, w, h);
 
  // Create blurred version
  const offCanvas = document.createElement('canvas');
  offCanvas.width = w; offCanvas.height = h;
  const offCtx = offCanvas.getContext('2d');
  offCtx.filter = 'blur(1px)';
  offCtx.drawImage(canvas, 0, 0);
  const blurred = offCtx.getImageData(0, 0, w, h);
 
  const out = ctx.createImageData(w, h);
  const str = amount / 100 * 1.5;
  for (let i = 0; i < orig.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = orig.data[i+c] - blurred.data[i+c];
      out.data[i+c] = clamp(orig.data[i+c] + str * diff);
    }
    out.data[i+3] = orig.data[i+3];
  }
  ctx.putImageData(out, 0, 0);
}
 
function applyGlamour() {
  const amt = filters.glamour / 100;
  const off = document.createElement('canvas');
  off.width = canvas.width; off.height = canvas.height;
  const octx = off.getContext('2d');
  octx.filter = `blur(${8 * amt}px) brightness(${100 + 20*amt}%)`;
  octx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = amt * 0.35;
  ctx.drawImage(off, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
 
function applyPixelate() {
  const size = Math.max(2, Math.floor(filters.pixelate / 8));
  const tmp = document.createElement('canvas');
  const sc = Math.ceil(canvas.width / size);
  const sh = Math.ceil(canvas.height / size);
  tmp.width = sc; tmp.height = sh;
  const tc = tmp.getContext('2d');
  tc.drawImage(canvas, 0, 0, sc, sh);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, 0, 0, sc, sh, 0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
}
 
function applyGrain() {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const intensity = filters.grain * 0.8;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * intensity;
    d[i]   = clamp(d[i] + n);
    d[i+1] = clamp(d[i+1] + n);
    d[i+2] = clamp(d[i+2] + n);
  }
  ctx.putImageData(imgData, 0, 0);
}
 
function applyVignette() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r = Math.max(canvas.width, canvas.height) * 0.75;
  const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, `rgba(0,0,0,${filters.vignette / 100})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
 
function clamp(v) { return Math.max(0, Math.min(255, v)); }
 
/* ═══════════════════════════════════════════
   HISTOGRAM
═══════════════════════════════════════════ */
function drawHistogram() {
  if (!imageLoaded) return;
  const hc = document.getElementById('histCanvas');
  const hctx = hc.getContext('2d');
  const w = hc.width, h = hc.height;
  hctx.clearRect(0, 0, w, h);
 
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  const rBins = new Uint32Array(256);
  const gBins = new Uint32Array(256);
  const bBins = new Uint32Array(256);
  const lumBins = new Uint32Array(256);
 
  for (let i = 0; i < d.length; i += 4) {
    rBins[d[i]]++;
    gBins[d[i+1]]++;
    bBins[d[i+2]]++;
    lumBins[Math.round(d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114)]++;
  }
 
  let peak = 0;
  for (let i = 0; i < 256; i++) peak = Math.max(peak, rBins[i], gBins[i], bBins[i]);
 
  function drawChannel(bins, color) {
    hctx.beginPath();
    hctx.strokeStyle = color;
    hctx.lineWidth = 1;
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w;
      const y = h - (bins[i] / peak) * h;
      i === 0 ? hctx.moveTo(x, y) : hctx.lineTo(x, y);
    }
    hctx.stroke();
  }
 
  hctx.globalAlpha = 0.6;
  drawChannel(rBins, '#f55a5a');
  drawChannel(gBins, '#5af55a');
  drawChannel(bBins, '#5a9af5');
  hctx.globalAlpha = 0.9;
  drawChannel(lumBins, '#ffffff');
  hctx.globalAlpha = 1;
}
 
/* ═══════════════════════════════════════════
   SLIDERS (RIGHT PANEL)
═══════════════════════════════════════════ */
document.querySelectorAll('.adj-item').forEach(item => {
  const input = item.querySelector('input');
  const valEl = item.querySelector('.adj-value');
  const filterKey = item.dataset.filter;
  const def = parseInt(item.dataset.default);
 
  function updateLabel() {
    const raw = parseInt(input.value);
    const display = raw - def;
    valEl.textContent = (display >= 0 ? '+' : '') + display;
    // Highlight changed values
    valEl.style.color = display !== 0 ? 'var(--accent)' : 'var(--muted)';
  }
 
  updateLabel();
 
  input.addEventListener('input', () => {
    pushHistory();
    filters[filterKey] = parseInt(input.value);
    updateLabel();
    drawImage();
  });
 
  // Double-click to reset slider
  item.querySelector('.adj-name').addEventListener('dblclick', () => {
    input.value = def;
    filters[filterKey] = def;
    updateLabel();
    drawImage();
  });
});
 
/* ═══════════════════════════════════════════
   PRESETS (LOOKS)
═══════════════════════════════════════════ */
const presets = {
  none:      {},
  vivid:     { saturate: 160, contrast: 115, brightness: 105 },
  matte:     { contrast: 85, brightness: 105, fade: 30, shadows: 15 },
  chrome:    { contrast: 130, saturate: 50, brightness: 110, highlights: -20 },
  fade:      { fade: 60, contrast: 85, saturate: 80 },
  noir:      { grayscale: 100, contrast: 140, brightness: 95 },
  warm:      { temperature: 55, saturate: 115, brightness: 103 },
  cool:      { temperature: -55, saturate: 110, brightness: 103 },
  portrait:  { clarity: -20, glamour: 30, brightness: 108, saturate: 95 },
  landscape: { saturate: 140, clarity: 40, vibrance: 50, highlights: -15 },
};
 
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const key = btn.dataset.preset;
    const p = presets[key];
 
    pushHistory();
    filters = defaultFilters();
    if (p) Object.assign(filters, p);
 
    // Sync all sliders
    syncSlidersToFilters();
    drawImage();
  });
});
 
function syncSlidersToFilters() {
  document.querySelectorAll('.adj-item').forEach(item => {
    const input = item.querySelector('input');
    const valEl = item.querySelector('.adj-value');
    const filterKey = item.dataset.filter;
    const def = parseInt(item.dataset.default);
    input.value = filters[filterKey] !== undefined ? filters[filterKey] : def;
    const display = parseInt(input.value) - def;
    valEl.textContent = (display >= 0 ? '+' : '') + display;
    valEl.style.color = display !== 0 ? 'var(--accent)' : 'var(--muted)';
  });
}
 
/* ═══════════════════════════════════════════
   TRANSFORMS
═══════════════════════════════════════════ */
document.getElementById('rotate_left').addEventListener('click', () => {
  transform.rotate -= 90; drawImage();
});
document.getElementById('rotate_right').addEventListener('click', () => {
  transform.rotate += 90; drawImage();
});
document.getElementById('flip_x').addEventListener('click', () => {
  transform.flip_x *= -1; drawImage();
});
document.getElementById('flip_y').addEventListener('click', () => {
  transform.flip_y *= -1; drawImage();
});
 
/* ═══════════════════════════════════════════
   CROP — coordinates are always in CANVAS pixels.
   The overlay is positioned relative to the canvas-wrap
   using the CSS display scale factor.
═══════════════════════════════════════════ */
let cropMode = false, cropDragging = false;
// These are in CANVAS pixel space (not display pixels)
let cropSX = 0, cropSY = 0, cropEX = 0, cropEY = 0;
const cropOverlay = document.getElementById('cropOverlay');
const applyCropBtn = document.getElementById('applyCropBtn');
const cropToolBtn = document.getElementById('cropBtn');
 
cropToolBtn.addEventListener('click', () => {
  if (!imageLoaded) return;
  cropMode = true;
  cropToolBtn.classList.add('active');
  applyCropBtn.classList.add('visible');
  canvas.classList.add('crop-mode');
  cropOverlay.style.display = 'none';
  toast('Draw a selection on the image to crop');
});
 
// Convert a mouse event to canvas-pixel coordinates.
// canvas.getBoundingClientRect() gives the CSS display rect.
// canvas.width/height are the actual pixel dimensions.
// The ratio between them is the CSS scale factor.
function eventToCanvasCoords(e) {
  const r = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / r.width;
  const scaleY = canvas.height / r.height;
  return {
    x: Math.max(0, Math.min((e.clientX - r.left) * scaleX, canvas.width)),
    y: Math.max(0, Math.min((e.clientY - r.top)  * scaleY, canvas.height)),
    // also return display-space coords for the overlay
    dx: Math.max(0, Math.min(e.clientX - r.left, r.width)),
    dy: Math.max(0, Math.min(e.clientY - r.top,  r.height)),
  };
}
 
// Display-space start/end (for overlay positioning only)
let cropDSX = 0, cropDSY = 0, cropDEX = 0, cropDEY = 0;
 
canvas.addEventListener('mousedown', e => {
  if (!cropMode) return;
  const c = eventToCanvasCoords(e);
  cropSX = c.x; cropSY = c.y;
  cropEX = c.x; cropEY = c.y;
  cropDSX = c.dx; cropDSY = c.dy;
  cropDEX = c.dx; cropDEY = c.dy;
  cropDragging = true;
  cropOverlay.style.display = 'block';
  updateCropOverlay();
});
 
canvas.addEventListener('mousemove', e => {
  if (!cropMode || !cropDragging) return;
  const c = eventToCanvasCoords(e);
  cropEX = c.x; cropEY = c.y;
  cropDEX = c.dx; cropDEY = c.dy;
  updateCropOverlay();
});
 
canvas.addEventListener('mouseup', () => { if (cropMode) cropDragging = false; });
 
function updateCropOverlay() {
  // Position the overlay div relative to the canvas element itself.
  // canvas-wrap is position:relative; canvas sits inside it centered.
  // We need the canvas's offset relative to the wrap.
  const wrapRect   = canvas.parentElement.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const canvasOffsetLeft = canvasRect.left - wrapRect.left;
  const canvasOffsetTop  = canvasRect.top  - wrapRect.top;
 
  const x = Math.min(cropDSX, cropDEX);
  const y = Math.min(cropDSY, cropDEY);
  const w = Math.abs(cropDEX - cropDSX);
  const h = Math.abs(cropDEY - cropDSY);
 
  cropOverlay.style.left   = (canvasOffsetLeft + x) + 'px';
  cropOverlay.style.top    = (canvasOffsetTop  + y) + 'px';
  cropOverlay.style.width  = w + 'px';
  cropOverlay.style.height = h + 'px';
}
 
applyCropBtn.addEventListener('click', () => {
  const x = Math.round(Math.min(cropSX, cropEX));
  const y = Math.round(Math.min(cropSY, cropEY));
  const w = Math.round(Math.abs(cropEX - cropSX));
  const h = Math.round(Math.abs(cropEY - cropSY));
  if (w < 10 || h < 10) { exitCropMode(); return; }
 
  // Redraw clean image first to ensure pixel data is correct
  drawImage();
 
  const pixels = ctx.getImageData(x, y, w, h);
 
  // Resize canvas to cropped dimensions
  canvas.width  = w;
  canvas.height = h;
  ctx.putImageData(pixels, 0, 0);
 
  // Bake cropped result into a new source image.
  // Only baseImageSrc is updated — originalSrc stays as the true original.
  const tmp = new Image();
  tmp.onload = () => {
    image = tmp;
    baseImageSrc = tmp.src;
    // Reset transform (crop bakes rotation/flip into the new source)
    transform = { rotate: 0, flip_x: 1, flip_y: 1 };
    drawImage();
    toast('Crop applied');
  };
  tmp.src = canvas.toDataURL();
 
  exitCropMode();
});
 
function exitCropMode() {
  cropMode = false;
  cropDragging = false;
  cropOverlay.style.display = 'none';
  applyCropBtn.classList.remove('visible');
  cropToolBtn.classList.remove('active');
  canvas.classList.remove('crop-mode');
}
 
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') exitCropMode();
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
});
 
/* ═══════════════════════════════════════════
   STRAIGHTEN (simple rotate slider)
═══════════════════════════════════════════ */
document.getElementById('straightenBtn').addEventListener('click', () => {
  const deg = prompt('Enter degrees to straighten (e.g. -2, 1.5):', '0');
  if (deg === null) return;
  const n = parseFloat(deg);
  if (!isNaN(n)) { transform.rotate += n; drawImage(); }
});
 
/* ═══════════════════════════════════════════
   TOOL BUTTONS → SCROLL TO SLIDER
═══════════════════════════════════════════ */
const toolToFilter = {
  vignetteToolBtn: 'vignette',
  grainToolBtn: 'grain',
  pixelateToolBtn: 'pixelate',
  glamToolBtn: 'glamour',
  sharpBtn: 'sharpen',
};
Object.entries(toolToFilter).forEach(([btnId, filterKey]) => {
  document.getElementById(btnId)?.addEventListener('click', () => {
    const item = document.querySelector(`[data-filter="${filterKey}"]`);
    if (item) {
      item.scrollIntoView({ behavior: 'smooth', block: 'center' });
      item.querySelector('input').focus();
    }
  });
});
 
/* Perspective Fix placeholder */
document.getElementById('perspectiveBtn').addEventListener('click', () => {
  toast('Perspective fix: use Rotate to straighten horizontal/vertical lines');
});
 
/* ═══════════════════════════════════════════
   ZOOM
═══════════════════════════════════════════ */
document.getElementById('zoomIn').addEventListener('click', () => {
  if (!imageLoaded) return;
  zoomScale = Math.min(zoomScale * 1.25, 5);
  fitCanvasToContainer();
  drawImage();
});
document.getElementById('zoomOut').addEventListener('click', () => {
  if (!imageLoaded) return;
  zoomScale = Math.max(zoomScale * 0.8, 0.2);
  fitCanvasToContainer();
  drawImage();
});
document.getElementById('zoomFit').addEventListener('click', () => {
  if (!imageLoaded) return;
  zoomScale = 1;
  fitCanvasToContainer();
  drawImage();
});
 
/* ═══════════════════════════════════════════
   UNDO
═══════════════════════════════════════════ */
function pushHistory() {
  history.push({ filters: JSON.parse(JSON.stringify(filters)), transform: JSON.parse(JSON.stringify(transform)) });
  if (history.length > 30) history.shift();
}
 
function undo() {
  if (history.length < 2) { toast('Nothing to undo'); return; }
  history.pop();
  const prev = history[history.length - 1];
  filters = JSON.parse(JSON.stringify(prev.filters));
  transform = JSON.parse(JSON.stringify(prev.transform));
  syncSlidersToFilters();
  drawImage();
  toast('Undo');
}
 
document.getElementById('undoBtn').addEventListener('click', undo);
 
/* ═══════════════════════════════════════════
   RESET
═══════════════════════════════════════════ */
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!imageLoaded || !originalSrc) return;
  // Reload the true original (never overwritten by crop)
  const orig = new Image();
  orig.onload = () => {
    image = orig;
    baseImageSrc = originalSrc;  // resync baseImageSrc too
    filters = defaultFilters();
    transform = { rotate: 0, flip_x: 1, flip_y: 1 };
    zoomScale = 1;
    syncSlidersToFilters();
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    exitCropMode();
    fitCanvasToContainer();
    drawImage();
    toast('Reset to original');
  };
  orig.src = originalSrc;
});
 
/* ═══════════════════════════════════════════
   SAVE
═══════════════════════════════════════════ */
document.getElementById('saveBtn').addEventListener('click', () => {
  if (!imageLoaded) return;
  const a = document.createElement('a');
  a.download = 'edited-image.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
  toast('Saved as PNG');
});
 
document.getElementById('saveJpgBtn').addEventListener('click', () => {
  if (!imageLoaded) return;
  const a = document.createElement('a');
  a.download = 'edited-image.jpg';
  a.href = canvas.toDataURL('image/jpeg', 0.92);
  a.click();
  toast('Saved as JPG');
});
 /* ══════════════════════════════════════════
   mobile.js — Mobile bottom-sheet panel logic
   Include AFTER ss.js in the HTML:
   <script src="ss.js"></script>
   <script src="mobile.js"></script>
══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Panel open / close ── */
  const mobileToggle  = document.getElementById('mobileToolbarToggle');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const mobilePanel   = document.getElementById('mobilePanel');

  function openMobilePanel() {
    mobileOverlay.style.display = 'block';
    mobilePanel.style.display   = 'block';
    requestAnimationFrame(() => {
      mobileOverlay.classList.add('open');
      mobilePanel.classList.add('open');
    });
  }

  function closeMobilePanel() {
    mobileOverlay.classList.remove('open');
    mobilePanel.classList.remove('open');
    setTimeout(() => {
      mobileOverlay.style.display = 'none';
      mobilePanel.style.display   = 'none';
    }, 320);
  }

  if (mobileToggle)  mobileToggle.addEventListener('click', openMobilePanel);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobilePanel);

  /* ── Tab switching ── */
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mobile-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.querySelector(`[data-panel="${tab.dataset.tab}"]`);
      if (panel) panel.classList.add('active');
    });
  });

  /* ── Upload zone ── */
  const mobileUploadZone    = document.getElementById('mobileUploadZone');
  const mobileImageUploader = document.getElementById('mobileImageUploader');

  if (mobileUploadZone) {
    mobileUploadZone.addEventListener('click', () => {
      if (mobileImageUploader) mobileImageUploader.click();
    });
  }

  if (mobileImageUploader) {
    mobileImageUploader.addEventListener('change', function () {
      if (!this.files[0]) return;
      // Inject into desktop uploader and trigger its change handler
      const dt = new DataTransfer();
      dt.items.add(this.files[0]);
      const desktopInput = document.getElementById('imageUploader');
      if (desktopInput) {
        desktopInput.files = dt.files;
        desktopInput.dispatchEvent(new Event('change'));
      }
      closeMobilePanel();
    });
  }

  /* ── Action buttons → desktop button delegates ── */
  const actionMap = {
    mobileUndoBtn:   'undoBtn',
    mobileResetBtn:  'resetBtn',
    mobileSavePng:   'saveBtn',
    mobileSaveJpg:   'saveJpgBtn',
    mobileRotateL:   'rotate_left',
    mobileRotateR:   'rotate_right',
    mobileFlipH:     'flip_x',
    mobileFlipV:     'flip_y',
    mobileCrop:      'cropBtn',
    mobileStraighten:'straightenBtn',
  };

  Object.entries(actionMap).forEach(([mId, dId]) => {
    const mBtn = document.getElementById(mId);
    if (!mBtn) return;
    mBtn.addEventListener('click', () => {
      const dBtn = document.getElementById(dId);
      if (dBtn) dBtn.click();
      // Keep panel open for crop/straighten (user needs to interact with canvas)
      if (mId !== 'mobileCrop' && mId !== 'mobileStraighten') {
        closeMobilePanel();
      }
    });
  });

  /* ── Preset buttons inside mobile panel ── */
  // The mobile preset-btn elements share the same data-preset attributes,
  // so they automatically trigger via ss.js's querySelectorAll('.preset-btn') loop.
  // We just close the panel after selection.
  document.querySelectorAll('#mobilePanel .preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(closeMobilePanel, 150);
    });
  });

  /* ── Adjustment sliders → sync to desktop .adj-item sliders ── */
  const sliderMap = {
    mob_brightness:  'brightness',
    mob_contrast:    'contrast',
    mob_saturate:    'saturate',
    mob_temperature: 'temperature',
    mob_highlights:  'highlights',
    mob_shadows:     'shadows',
    mob_vignette:    'vignette',
    mob_grain:       'grain',
    mob_blur:        'blur',
    mob_sharpen:     'sharpen',
    mob_grayscale:   'grayscale',
    mob_sepia:       'sepia',
  };

  Object.entries(sliderMap).forEach(([mobId, filterKey]) => {
    const mobSlider = document.getElementById(mobId);
    if (!mobSlider) return;

    mobSlider.addEventListener('input', function () {
      // Find matching desktop adj-item and fire its input event
      const desktopInput = document.querySelector(`[data-filter="${filterKey}"] input[type=range]`);
      if (desktopInput) {
        desktopInput.value = this.value;
        desktopInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  });

  /* ── Sync mobile sliders when desktop sliders change (preset applied etc.) ── */
  // Listen on adj-item inputs and update corresponding mobile slider
  Object.entries(sliderMap).forEach(([mobId, filterKey]) => {
    const desktopInput = document.querySelector(`[data-filter="${filterKey}"] input[type=range]`);
    const mobSlider    = document.getElementById(mobId);
    if (!desktopInput || !mobSlider) return;

    desktopInput.addEventListener('input', function () {
      // Only update if value differs (avoid infinite loop)
      if (mobSlider.value !== this.value) {
        mobSlider.value = this.value;
      }
    });
  });

  /* ── FAQ accordion ── */
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item    = btn.closest('.faq-item');
      const wasOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
  });

})();
/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}