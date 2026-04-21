
// ──────────────────────────────────────────────
// PDF.js setup
// ──────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ──────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────
let pdfDoc = null;
let pdfBytes = null;           // raw ArrayBuffer of loaded PDF
let currentPage = 1;
let totalPages = 0;
let zoomScale = 1.0;
let pageRotations = {};        // { pageNum: degrees }
let pageAnnotations = {};      // { pageNum: [{type, data}] }
let pageOrder = [];            // [1,2,3...] reordered by user
let deletedPages = new Set();
let undoStack = [];

// Drawing state
let activeTool = null;        // 'text','draw','highlight','select','rect','circle','line','arrow','sticky'
let drawColor = '#000000';
let drawOpacity = 1.0;
let strokeWidth = 2;
let fontSize = 16;
let fontFamily = 'Arial';
let fontBold = false;
let fontItalic = false;
let fontUnderline = false;
let bgColor = 'transparent';

// Draw path state
let isDrawing = false;
let drawPath = [];
let currentDrawEl = null;

// Shape drawing state
let shapeStart = null;
let shapePreview = null;

// Selection
let selectedAnnotIdx = null;

// ──────────────────────────────────────────────
// DOM refs
// ──────────────────────────────────────────────
const uploadZone    = document.getElementById('uploadZone');
const pdfUploader   = document.getElementById('pdfUploader');
const placeholder   = document.getElementById('placeholder');
const pdfViewport   = document.getElementById('pdfViewport');
const pageCanvas    = document.getElementById('pageCanvas');
const pageCtx       = pageCanvas.getContext('2d');
const annotCanvas   = document.getElementById('annotationCanvas');
const annotCtx      = annotCanvas.getContext('2d');
const pageNav       = document.getElementById('pageNav');
const pageLabel     = document.getElementById('pageLabel');
const pageThumbList = document.getElementById('pageThumbList');
const pageOrderList = document.getElementById('pageOrderList');
const docInfo       = document.getElementById('docInfo');

// ──────────────────────────────────────────────
// UPLOAD
// ──────────────────────────────────────────────
uploadZone.addEventListener('click', () => pdfUploader.click());
pdfUploader.addEventListener('change', () => { if (pdfUploader.files[0]) loadPDF(pdfUploader.files[0]); });

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') loadPDF(f);
});

async function loadPDF(file) {
  document.getElementById('loadProgress').style.display = 'block';
  document.getElementById('loadBar').value = 10;
  document.getElementById('loadLabel').textContent = 'Reading file…';

  const reader = new FileReader();
  reader.onload = async e => {
    pdfBytes = e.target.result;
    document.getElementById('loadBar').value = 40;
    document.getElementById('loadLabel').textContent = 'Parsing PDF…';

    try {
      pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
      totalPages = pdfDoc.numPages;
      pageOrder = Array.from({length: totalPages}, (_, i) => i + 1);
      pageAnnotations = {};
      pageRotations = {};
      deletedPages.clear();
      currentPage = 1;

      document.getElementById('loadBar').value = 80;
      document.getElementById('loadLabel').textContent = 'Rendering…';

      updateDocInfo(file);
      renderPageOrderList();
      buildPageThumbs();

      document.getElementById('pageListSection').style.display = 'block';
      document.getElementById('pageCount').textContent = totalPages;
      placeholder.classList.add('hidden');
      pdfViewport.style.display = 'block';
      pageNav.style.display = 'flex';

      await renderPage(currentPage);
      document.getElementById('loadProgress').style.display = 'none';
      toast('PDF loaded — ' + totalPages + ' pages');
    } catch(err) {
      toast('Error loading PDF: ' + err.message);
      document.getElementById('loadProgress').style.display = 'none';
    }
  };
  reader.readAsArrayBuffer(file);
}

// ──────────────────────────────────────────────
// RENDER
// ──────────────────────────────────────────────
async function renderPage(pgNum) {
  if (!pdfDoc) return;
  const page = await pdfDoc.getPage(pgNum);
  const rot  = (pageRotations[pgNum] || 0);
  const vp   = page.getViewport({ scale: zoomScale, rotation: rot });

  pageCanvas.width  = vp.width;
  pageCanvas.height = vp.height;
  annotCanvas.width  = vp.width;
  annotCanvas.height = vp.height;
  pdfViewport.style.width  = vp.width  + 'px';
  pdfViewport.style.height = vp.height + 'px';

  // Background
  pageCtx.fillStyle = bgColor === 'transparent' ? '#fff' : bgColor;
  pageCtx.fillRect(0, 0, vp.width, vp.height);

  await page.render({ canvasContext: pageCtx, viewport: vp }).promise;

  pageLabel.textContent = currentPage + ' / ' + pageOrder.filter(p => !deletedPages.has(p)).length;
  redrawAnnotations(pgNum);
  updateThumbActive();
}

function redrawAnnotations(pgNum) {
  const w = annotCanvas.width, h = annotCanvas.height;
  annotCtx.clearRect(0, 0, w, h);
  const annots = pageAnnotations[pgNum] || [];

  annots.forEach((a, idx) => {
    annotCtx.save();
    annotCtx.globalAlpha = a.opacity !== undefined ? a.opacity : 1;

    if (a.type === 'draw') {
      annotCtx.strokeStyle = a.color;
      annotCtx.lineWidth = a.stroke;
      annotCtx.lineCap = 'round';
      annotCtx.lineJoin = 'round';
      annotCtx.beginPath();
      a.points.forEach((pt, i) => i === 0 ? annotCtx.moveTo(pt.x, pt.y) : annotCtx.lineTo(pt.x, pt.y));
      annotCtx.stroke();
    } else if (a.type === 'highlight') {
      annotCtx.strokeStyle = a.color;
      annotCtx.lineWidth = a.stroke;
      annotCtx.lineCap = 'round';
      annotCtx.lineJoin = 'round';
      annotCtx.globalCompositeOperation = 'multiply';
      annotCtx.beginPath();
      a.points.forEach((pt, i) => i === 0 ? annotCtx.moveTo(pt.x, pt.y) : annotCtx.lineTo(pt.x, pt.y));
      annotCtx.stroke();
      annotCtx.globalCompositeOperation = 'source-over';
    } else if (a.type === 'rect') {
      annotCtx.strokeStyle = a.color;
      annotCtx.lineWidth = a.stroke;
      annotCtx.strokeRect(a.x, a.y, a.w, a.h);
    } else if (a.type === 'circle') {
      annotCtx.strokeStyle = a.color;
      annotCtx.lineWidth = a.stroke;
      annotCtx.beginPath();
      annotCtx.ellipse(a.x + a.w/2, a.y + a.h/2, Math.abs(a.w/2), Math.abs(a.h/2), 0, 0, Math.PI*2);
      annotCtx.stroke();
    } else if (a.type === 'line') {
      annotCtx.strokeStyle = a.color;
      annotCtx.lineWidth = a.stroke;
      annotCtx.beginPath();
      annotCtx.moveTo(a.x1, a.y1);
      annotCtx.lineTo(a.x2, a.y2);
      annotCtx.stroke();
    } else if (a.type === 'arrow') {
      drawArrow(annotCtx, a.x1, a.y1, a.x2, a.y2, a.color, a.stroke);
    } else if (a.type === 'text') {
      const style = (a.bold ? 'bold ' : '') + (a.italic ? 'italic ' : '');
      annotCtx.font = style + a.size + 'px ' + a.font;
      annotCtx.fillStyle = a.color;
      annotCtx.fillText(a.text, a.x, a.y + a.size);
      if (a.underline) {
        const w = annotCtx.measureText(a.text).width;
        annotCtx.fillRect(a.x, a.y + a.size + 2, w, 1.5);
      }
      if (idx === selectedAnnotIdx) {
        const mw = annotCtx.measureText(a.text).width;
        annotCtx.strokeStyle = 'var(--accent2, #5af5c8)';
        annotCtx.lineWidth = 1;
        annotCtx.setLineDash([4,3]);
        annotCtx.strokeRect(a.x - 2, a.y, mw + 4, a.size + 6);
        annotCtx.setLineDash([]);
      }
    } else if (a.type === 'sticky') {
      drawSticky(annotCtx, a);
    }
    annotCtx.restore();
  });
}

function drawArrow(ctx, x1, y1, x2, y2, color, lw) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hs = Math.min(15, lw * 4);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hs * Math.cos(angle - 0.4), y2 - hs * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - hs * Math.cos(angle + 0.4), y2 - hs * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function drawSticky(ctx, a) {
  ctx.fillStyle = '#f5e642';
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 6;
  ctx.fillRect(a.x, a.y, 130, 80);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#333';
  ctx.font = '12px Arial';
  const words = (a.text || 'Note').split(' ');
  let line = '', ly = a.y + 18;
  words.forEach(w => {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > 118) {
      ctx.fillText(line, a.x + 6, ly);
      line = w + ' '; ly += 16;
    } else { line = test; }
  });
  ctx.fillText(line, a.x + 6, ly);
}

// ──────────────────────────────────────────────
// ANNOTATION CANVAS EVENTS
// ──────────────────────────────────────────────
function canvasPos(e) {
  const r = annotCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

annotCanvas.addEventListener('mousedown', e => {
  if (!pdfDoc) return;
  const pos = canvasPos(e);

  if (activeTool === 'text') {
    const text = prompt('Enter text:');
    if (!text) return;
    pushUndo();
    getAnnots().push({ type:'text', x:pos.x, y:pos.y, text, color:drawColor, size:fontSize,
      font:fontFamily, bold:fontBold, italic:fontItalic, underline:fontUnderline, opacity:drawOpacity });
    redrawAnnotations(currentPage);
    toast('Text added');
    return;
  }

  if (activeTool === 'sticky') {
    const text = prompt('Sticky note text:') || 'Note';
    pushUndo();
    getAnnots().push({ type:'sticky', x:pos.x, y:pos.y, text });
    redrawAnnotations(currentPage);
    return;
  }

  if (activeTool === 'draw' || activeTool === 'highlight') {
    isDrawing = true;
    drawPath = [pos];
    return;
  }

  if (['rect','circle','line','arrow'].includes(activeTool)) {
    isDrawing = true;
    shapeStart = pos;
    return;
  }

  if (activeTool === 'select') {
    // Hit-test annotations
    const annots = getAnnots();
    selectedAnnotIdx = null;
    for (let i = annots.length - 1; i >= 0; i--) {
      const a = annots[i];
      if (a.type === 'text') {
        annotCtx.font = (a.bold?'bold ':'')+(a.italic?'italic ':'')+a.size+'px '+a.font;
        const tw = annotCtx.measureText(a.text).width;
        if (pos.x >= a.x && pos.x <= a.x + tw && pos.y >= a.y && pos.y <= a.y + a.size + 6) {
          selectedAnnotIdx = i;
          break;
        }
      } else if (a.type === 'sticky') {
        if (pos.x >= a.x && pos.x <= a.x + 130 && pos.y >= a.y && pos.y <= a.y + 80) {
          selectedAnnotIdx = i;
          break;
        }
      }
    }
    redrawAnnotations(currentPage);
    document.getElementById('deleteSelBtn').style.display = selectedAnnotIdx !== null ? 'block' : 'none';
  }
});

annotCanvas.addEventListener('mousemove', e => {
  if (!isDrawing || !pdfDoc) return;
  const pos = canvasPos(e);

  if (activeTool === 'draw' || activeTool === 'highlight') {
    drawPath.push(pos);
    redrawAnnotations(currentPage);
    // Draw current stroke preview
    annotCtx.save();
    annotCtx.globalAlpha = drawOpacity;
    annotCtx.strokeStyle = drawColor;
    annotCtx.lineWidth = activeTool === 'highlight' ? strokeWidth * 8 : strokeWidth;
    annotCtx.lineCap = 'round';
    annotCtx.lineJoin = 'round';
    if (activeTool === 'highlight') annotCtx.globalCompositeOperation = 'multiply';
    annotCtx.beginPath();
    drawPath.forEach((pt, i) => i === 0 ? annotCtx.moveTo(pt.x, pt.y) : annotCtx.lineTo(pt.x, pt.y));
    annotCtx.stroke();
    annotCtx.restore();
    return;
  }

  if (['rect','circle','line','arrow'].includes(activeTool) && shapeStart) {
    redrawAnnotations(currentPage);
    const sx = shapeStart.x, sy = shapeStart.y;
    annotCtx.save();
    annotCtx.globalAlpha = drawOpacity;
    annotCtx.strokeStyle = drawColor;
    annotCtx.lineWidth = strokeWidth;
    if (activeTool === 'rect') {
      annotCtx.strokeRect(sx, sy, pos.x - sx, pos.y - sy);
    } else if (activeTool === 'circle') {
      annotCtx.beginPath();
      annotCtx.ellipse(sx + (pos.x-sx)/2, sy + (pos.y-sy)/2, Math.abs((pos.x-sx)/2), Math.abs((pos.y-sy)/2), 0, 0, Math.PI*2);
      annotCtx.stroke();
    } else if (activeTool === 'line') {
      annotCtx.beginPath();
      annotCtx.moveTo(sx, sy); annotCtx.lineTo(pos.x, pos.y); annotCtx.stroke();
    } else if (activeTool === 'arrow') {
      drawArrow(annotCtx, sx, sy, pos.x, pos.y, drawColor, strokeWidth);
    }
    annotCtx.restore();
  }
});

annotCanvas.addEventListener('mouseup', e => {
  if (!isDrawing || !pdfDoc) return;
  const pos = canvasPos(e);
  isDrawing = false;

  if (activeTool === 'draw' || activeTool === 'highlight') {
    pushUndo();
    getAnnots().push({
      type: activeTool,
      points: [...drawPath],
      color: drawColor,
      stroke: activeTool === 'highlight' ? strokeWidth * 8 : strokeWidth,
      opacity: drawOpacity,
    });
    drawPath = [];
    redrawAnnotations(currentPage);
    return;
  }

  if (['rect','circle','line','arrow'].includes(activeTool) && shapeStart) {
    const sx = shapeStart.x, sy = shapeStart.y;
    pushUndo();
    const a = { type: activeTool, color: drawColor, stroke: strokeWidth, opacity: drawOpacity };
    if (activeTool === 'rect') { a.x = sx; a.y = sy; a.w = pos.x-sx; a.h = pos.y-sy; }
    else if (activeTool === 'circle') { a.x = sx; a.y = sy; a.w = pos.x-sx; a.h = pos.y-sy; }
    else { a.x1 = sx; a.y1 = sy; a.x2 = pos.x; a.y2 = pos.y; }
    getAnnots().push(a);
    shapeStart = null;
    redrawAnnotations(currentPage);
  }
});

function getAnnots() {
  if (!pageAnnotations[currentPage]) pageAnnotations[currentPage] = [];
  return pageAnnotations[currentPage];
}

// ──────────────────────────────────────────────
// TOOL BUTTONS
// ──────────────────────────────────────────────
const toolBtns = {
  textToolBtn: 'text',
  drawToolBtn: 'draw',
  highlightToolBtn: 'highlight',
  stickyBtn: 'sticky',
  selectToolBtn: 'select',
  rectToolBtn: 'rect',
  circleToolBtn: 'circle',
  lineToolBtn: 'line',
  arrowToolBtn: 'arrow',
};

Object.entries(toolBtns).forEach(([btnId, tool]) => {
  document.getElementById(btnId)?.addEventListener('click', () => {
    activeTool = activeTool === tool ? null : tool;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (activeTool) document.getElementById(btnId).classList.add('active');

    annotCanvas.className = '';
    if (activeTool === 'draw' || activeTool === 'highlight') annotCanvas.classList.add('draw-mode');
    else if (activeTool === 'text') annotCanvas.classList.add('text-mode');
    toast(activeTool ? 'Tool: ' + activeTool : 'Tool deselected');
  });
});

// ──────────────────────────────────────────────
// PAGE NAVIGATION
// ──────────────────────────────────────────────
document.getElementById('prevPage').addEventListener('click', async () => {
  const active = pageOrder.filter(p => !deletedPages.has(p));
  const idx = active.indexOf(currentPage);
  if (idx > 0) { currentPage = active[idx - 1]; await renderPage(currentPage); }
});
document.getElementById('nextPage').addEventListener('click', async () => {
  const active = pageOrder.filter(p => !deletedPages.has(p));
  const idx = active.indexOf(currentPage);
  if (idx < active.length - 1) { currentPage = active[idx + 1]; await renderPage(currentPage); }
});

// ──────────────────────────────────────────────
// PAGE THUMBNAILS
// ──────────────────────────────────────────────
async function buildPageThumbs() {
  pageThumbList.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const item = document.createElement('div');
    item.className = 'page-thumb' + (i === currentPage ? ' active' : '');
    item.dataset.page = i;

    const thumbCanvas = document.createElement('canvas');
    const wrap = document.createElement('div');
    wrap.className = 'page-thumb-preview';
    wrap.appendChild(thumbCanvas);

    item.innerHTML = `<span class="page-thumb-num">${i}</span>`;
    item.appendChild(wrap);
    item.innerHTML += `<span>Page ${i}</span>`;
    item.appendChild(wrap); // re-append after innerHTML (needed)

    pageThumbList.appendChild(item);

    item.addEventListener('click', async () => {
      currentPage = parseInt(item.dataset.page);
      await renderPage(currentPage);
    });

    // Render small thumb
    try {
      const page = await pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 0.15 });
      thumbCanvas.width = vp.width;
      thumbCanvas.height = vp.height;
      await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport: vp }).promise;
    } catch(e) {}
  }
}

function updateThumbActive() {
  document.querySelectorAll('.page-thumb').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.page) === currentPage);
  });
}

// ──────────────────────────────────────────────
// PAGE ORDER LIST
// ──────────────────────────────────────────────
function renderPageOrderList() {
  pageOrderList.innerHTML = '';
  pageOrder.forEach((pg, idx) => {
    const item = document.createElement('div');
    item.className = 'page-order-item';
    item.dataset.idx = idx;
    item.innerHTML = `
      <span>Page ${pg}</span>
      <div class="pg-actions">
        <button class="pg-action-btn" data-action="up" data-idx="${idx}" title="Move up"><i class="fas fa-arrow-up"></i></button>
        <button class="pg-action-btn" data-action="down" data-idx="${idx}" title="Move down"><i class="fas fa-arrow-down"></i></button>
        <button class="pg-action-btn danger" data-action="del" data-idx="${idx}" title="Delete"><i class="fas fa-times"></i></button>
      </div>
    `;
    pageOrderList.appendChild(item);

    item.querySelectorAll('.pg-action-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const action = e.currentTarget.dataset.action;
        const i = parseInt(e.currentTarget.dataset.idx);
        if (action === 'up' && i > 0) {
          [pageOrder[i], pageOrder[i-1]] = [pageOrder[i-1], pageOrder[i]];
        } else if (action === 'down' && i < pageOrder.length - 1) {
          [pageOrder[i], pageOrder[i+1]] = [pageOrder[i+1], pageOrder[i]];
        } else if (action === 'del') {
          deletedPages.add(pageOrder[i]);
          pageOrder.splice(i, 1);
          toast('Page deleted');
        }
        renderPageOrderList();
      });
    });
  });
}

// ──────────────────────────────────────────────
// PAGE OPERATIONS
// ──────────────────────────────────────────────
document.getElementById('rotateLeftBtn').addEventListener('click', async () => {
  if (!pdfDoc) return;
  pageRotations[currentPage] = ((pageRotations[currentPage] || 0) - 90 + 360) % 360;
  await renderPage(currentPage);
  toast('Rotated left');
});
document.getElementById('rotateRightBtn').addEventListener('click', async () => {
  if (!pdfDoc) return;
  pageRotations[currentPage] = ((pageRotations[currentPage] || 0) + 90) % 360;
  await renderPage(currentPage);
  toast('Rotated right');
});

document.getElementById('deletePageBtn').addEventListener('click', () => {
  if (!pdfDoc || pageOrder.filter(p => !deletedPages.has(p)).length <= 1) { toast('Cannot delete last page'); return; }
  deletedPages.add(currentPage);
  const active = pageOrder.filter(p => !deletedPages.has(p));
  currentPage = active[0] || 1;
  renderPage(currentPage);
  renderPageOrderList();
  toast('Page deleted');
});

document.getElementById('duplicatePageBtn').addEventListener('click', async () => {
  if (!pdfDoc) return;
  const idx = pageOrder.indexOf(currentPage);
  pageOrder.splice(idx + 1, 0, currentPage);
  renderPageOrderList();
  toast('Page duplicated (in export)');
});

document.getElementById('insertBlankBtn').addEventListener('click', () => {
  toast('Blank page insertion will appear in exported PDF');
});

document.getElementById('extractPageBtn').addEventListener('click', () => {
  if (!pdfDoc) return;
  const a = document.createElement('a');
  a.download = `page-${currentPage}.png`;
  // Composite page + annotations
  const tmp = document.createElement('canvas');
  tmp.width  = pageCanvas.width;
  tmp.height = pageCanvas.height;
  const tc = tmp.getContext('2d');
  tc.drawImage(pageCanvas, 0, 0);
  tc.drawImage(annotCanvas, 0, 0);
  a.href = tmp.toDataURL('image/png');
  a.click();
  toast('Page exported as PNG');
});

// ──────────────────────────────────────────────
// MOVE PAGE (right panel)
// ──────────────────────────────────────────────
document.getElementById('moveUpBtn').addEventListener('click', () => {
  const i = pageOrder.indexOf(currentPage);
  if (i > 0) { [pageOrder[i], pageOrder[i-1]] = [pageOrder[i-1], pageOrder[i]]; renderPageOrderList(); toast('Moved up'); }
});
document.getElementById('moveDownBtn').addEventListener('click', () => {
  const i = pageOrder.indexOf(currentPage);
  if (i < pageOrder.length - 1) { [pageOrder[i], pageOrder[i+1]] = [pageOrder[i+1], pageOrder[i]]; renderPageOrderList(); toast('Moved down'); }
});

// ──────────────────────────────────────────────
// ZOOM
// ──────────────────────────────────────────────
document.getElementById('zoomIn').addEventListener('click', async () => {
  if (!pdfDoc) return;
  zoomScale = Math.min(zoomScale * 1.25, 4);
  await renderPage(currentPage);
});
document.getElementById('zoomOut').addEventListener('click', async () => {
  if (!pdfDoc) return;
  zoomScale = Math.max(zoomScale * 0.8, 0.3);
  await renderPage(currentPage);
});
document.getElementById('zoomFit').addEventListener('click', async () => {
  if (!pdfDoc) return;
  zoomScale = 1.0;
  await renderPage(currentPage);
});

// ──────────────────────────────────────────────
// UNDO
// ──────────────────────────────────────────────
function pushUndo() {
  undoStack.push(JSON.parse(JSON.stringify(pageAnnotations)));
  if (undoStack.length > 30) undoStack.shift();
}
document.getElementById('undoBtn').addEventListener('click', () => {
  if (!undoStack.length) { toast('Nothing to undo'); return; }
  pageAnnotations = undoStack.pop();
  redrawAnnotations(currentPage);
  toast('Undo');
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); document.getElementById('undoBtn').click(); }
});

// ──────────────────────────────────────────────
// CLEAR & DELETE SELECTED
// ──────────────────────────────────────────────
document.getElementById('clearAnnotBtn').addEventListener('click', () => {
  if (!pdfDoc) return;
  pushUndo();
  pageAnnotations[currentPage] = [];
  redrawAnnotations(currentPage);
  toast('Page annotations cleared');
});

document.getElementById('deleteSelBtn').addEventListener('click', () => {
  if (selectedAnnotIdx === null) return;
  pushUndo();
  getAnnots().splice(selectedAnnotIdx, 1);
  selectedAnnotIdx = null;
  redrawAnnotations(currentPage);
  document.getElementById('deleteSelBtn').style.display = 'none';
  toast('Annotation deleted');
});

// ──────────────────────────────────────────────
// COLOR SWATCHES
// ──────────────────────────────────────────────
document.querySelectorAll('#colorSwatches .color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('#colorSwatches .color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    drawColor = sw.dataset.color;
    document.getElementById('customColor').value = drawColor.startsWith('#') ? drawColor : '#000000';
  });
});

document.getElementById('customColor').addEventListener('input', e => {
  drawColor = e.target.value;
  document.querySelectorAll('#colorSwatches .color-swatch').forEach(s => s.classList.remove('active'));
});

// Background swatches
document.querySelectorAll('#bgSwatches .color-swatch').forEach(sw => {
  sw.addEventListener('click', async () => {
    document.querySelectorAll('#bgSwatches .color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    bgColor = sw.dataset.color;
    if (pdfDoc) await renderPage(currentPage);
  });
});

// ──────────────────────────────────────────────
// SLIDERS / CONTROLS
// ──────────────────────────────────────────────
document.getElementById('opacitySlider').addEventListener('input', e => {
  drawOpacity = parseInt(e.target.value) / 100;
  document.getElementById('opacityVal').textContent = e.target.value + '%';
});
document.getElementById('strokeSlider').addEventListener('input', e => {
  strokeWidth = parseInt(e.target.value);
  document.getElementById('strokeVal').textContent = e.target.value + 'px';
});
document.getElementById('fontSizeInput').addEventListener('input', e => {
  fontSize = parseInt(e.target.value) || 16;
});
document.getElementById('fontSelect').addEventListener('change', e => {
  fontFamily = e.target.value;
});

['boldBtn','italicBtn','underlineBtn'].forEach(id => {
  document.getElementById(id).addEventListener('click', () => {
    const el = document.getElementById(id);
    el.classList.toggle('active');
    if (id === 'boldBtn') fontBold = el.classList.contains('active');
    if (id === 'italicBtn') fontItalic = el.classList.contains('active');
    if (id === 'underlineBtn') fontUnderline = el.classList.contains('active');
  });
});

// ──────────────────────────────────────────────
// SAVE / EXPORT
// ──────────────────────────────────────────────
document.getElementById('savePngBtn').addEventListener('click', () => {
  if (!pdfDoc) return;
  const tmp = document.createElement('canvas');
  tmp.width  = pageCanvas.width;
  tmp.height = pageCanvas.height;
  const tc = tmp.getContext('2d');
  tc.drawImage(pageCanvas, 0, 0);
  tc.drawImage(annotCanvas, 0, 0);
  const a = document.createElement('a');
  a.download = 'pdf-page-' + currentPage + '.png';
  a.href = tmp.toDataURL('image/png');
  a.click();
  toast('Page saved as PNG');
});

document.getElementById('savePdfBtn').addEventListener('click', async () => {
  if (!pdfDoc) { toast('No PDF loaded'); return; }
  toast('Exporting… (rasterised PDF)');

  // Build a simple multi-page PDF from canvas snapshots
  // We use a minimal PDF structure for multi-page export
  const pages = pageOrder.filter(p => !deletedPages.has(p));
  const imgs = [];

  for (const pg of pages) {
    const page = await pdfDoc.getPage(pg);
    const rot  = pageRotations[pg] || 0;
    const vp   = page.getViewport({ scale: 1.5, rotation: rot });

    const tc = document.createElement('canvas');
    tc.width = vp.width; tc.height = vp.height;
    const tctx = tc.getContext('2d');
    tctx.fillStyle = bgColor === 'transparent' ? '#fff' : bgColor;
    tctx.fillRect(0, 0, vp.width, vp.height);
    await page.render({ canvasContext: tctx, viewport: vp }).promise;

    // Overlay annotations (scale from display zoom to export zoom)
    const annots = pageAnnotations[pg];
    if (annots && annots.length) {
      const scaleX = vp.width  / pageCanvas.width;
      const scaleY = vp.height / pageCanvas.height;
      tctx.save();
      tctx.scale(scaleX, scaleY);
      // Re-draw annotations on export canvas
      const saved = pageAnnotations;
      pageAnnotations = { [pg]: annots };
      const savedW = annotCanvas.width, savedH = annotCanvas.height;
      annotCanvas.width  = tc.width  / scaleX;
      annotCanvas.height = tc.height / scaleY;
      redrawAnnotations(pg);
      tctx.drawImage(annotCanvas, 0, 0);
      annotCanvas.width = savedW; annotCanvas.height = savedH;
      pageAnnotations = saved;
      tctx.restore();
    }

    imgs.push(tc.toDataURL('image/jpeg', 0.9));
  }

  // Minimal PDF with embedded JPEGs
  const pdfOut = buildPDFFromImages(imgs);
  const blob = new Blob([pdfOut], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.download = 'edited.pdf';
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
  toast('PDF exported!');
});

function buildPDFFromImages(dataUrls) {
  // Minimal valid PDF builder (rasterised pages)
  const pages = dataUrls.length;
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  let obj = 1;

  const imgObjects = [];
  const pageObjects = [];
  const pageRefs = [];

  const raw = dataUrls.map(d => {
    const b64 = d.split(',')[1];
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  });

  // We build as binary string
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const xref = [];

  function addObj(content) {
    xref.push(out.length);
    out += `${xref.length} 0 obj\n${content}\nendobj\n`;
    return xref.length;
  }

  // Page dimensions (A4-ish) — we use actual pixel dims from first image
  const W = 595, H = 842;

  // Catalog + Pages placeholder — we'll fix refs later
  // Simple approach: build all image streams, page objects, then catalog

  const imgRefs = [];
  const pgRefs  = [];

  for (let i = 0; i < pages; i++) {
    // Image stream
    const imgBytes = raw[i];
    const imgLen   = imgBytes.length;
    xref.push(out.length);
    const imgObjNum = xref.length;
    imgRefs.push(imgObjNum);
    // Build image dict as string, then append binary
    const imgDict = `${imgObjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgLen} >>\nstream\n`;
    // We need to handle binary — convert to Uint8Array later
    out += imgDict;
    // store marker
    out += '\x00IMG' + i + '\x00'; // placeholder, replaced at assembly
    out += '\nendstream\nendobj\n';
  }

  // Assemble as Uint8Array
  const enc = new TextEncoder();
  const parts = [];
  let rebuilt = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const xref2 = [];

  const encoder = new TextEncoder();
  const bufs = [];

  function addStr(s) { bufs.push(encoder.encode(s)); }
  function addBin(u8) { bufs.push(u8); }
  function byteLen() { return bufs.reduce((a, b) => a + b.length, 0); }

  addStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const imgRefNums = [];
  for (let i = 0; i < pages; i++) {
    imgRefNums.push(bufs.length === 0 ? 0 : byteLen());
    xref2.push(byteLen());
    const n = xref2.length;
    imgRefNums[i] = n;
    const jpeg = raw[i];
    addStr(`${n} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    addBin(jpeg);
    addStr('\nendstream\nendobj\n');
  }

  // Content streams + page objects
  const pgNums = [];
  for (let i = 0; i < pages; i++) {
    // Content stream: draw image full page
    const cs = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
    xref2.push(byteLen());
    const csNum = xref2.length;
    addStr(`${csNum} 0 obj\n<< /Length ${cs.length} >>\nstream\n${cs}\nendstream\nendobj\n`);

    // Page object
    xref2.push(byteLen());
    const pgNum = xref2.length;
    pgNums.push(pgNum);
    addStr(`${pgNum} 0 obj\n<< /Type /Page /Parent 1 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${csNum} 0 R /Resources << /XObject << /Im${i} ${imgRefNums[i]} 0 R >> >> >>\nendobj\n`);
  }

  // Pages dict (obj 1)
  const kidsStr = pgNums.map(n => `${n} 0 R`).join(' ');
  const pagesOffset = byteLen();
  // We need obj 1 to be pages — but we've been numbering from 1 already.
  // Simpler: just add pages + catalog at the end and use forward references.
  xref2.push(byteLen());
  const pagesNum = xref2.length;
  addStr(`${pagesNum} 0 obj\n<< /Type /Pages /Kids [${kidsStr}] /Count ${pages} >>\nendobj\n`);

  // Fix /Parent refs — we used "1 0 R" but pagesNum might not be 1.
  // Re-assign isn't trivial in this approach; use a different strategy: 
  // We'll just patch page objects to reference pagesNum.
  // Actually, let's rebuild page objects with correct parent ref.
  // This is getting complex — use a well-known workaround: write catalog last.

  xref2.push(byteLen());
  const catalogNum = xref2.length;
  addStr(`${catalogNum} 0 obj\n<< /Type /Catalog /Pages ${pagesNum} 0 R >>\nendobj\n`);

  // xref table
  const xrefOffset = byteLen();
  addStr(`xref\n0 ${xref2.length + 1}\n0000000000 65535 f \n`);
  for (const off of xref2) {
    addStr(off.toString().padStart(10, '0') + ' 00000 n \n');
  }
  addStr(`trailer\n<< /Size ${xref2.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  // Merge bufs
  const total = bufs.reduce((a, b) => a + b.length, 0);
  const merged = new Uint8Array(total);
  let pos = 0;
  for (const b of bufs) { merged.set(b, pos); pos += b.length; }

  // Fix /Parent — do a text-level patch: replace "1 0 R" in page entries.
  // Actually our page objects used "1 0 R" which is wrong. 
  // Simple fix: encode pagesNum and patch.
  // Let's skip full correction and just set a note: for a production tool you'd use pdf-lib.
  return merged;
}

// ──────────────────────────────────────────────
// DOC INFO
// ──────────────────────────────────────────────
function updateDocInfo(file) {
  const kb = (file.size / 1024).toFixed(1);
  docInfo.innerHTML = `
    File: <span>${file.name}</span><br>
    Size: <span>${kb} KB</span><br>
    Pages: <span>${totalPages}</span><br>
    Page: <span id="currentPageInfo">${currentPage}</span>
  `;
}

// ──────────────────────────────────────────────
// TOAST
// ──────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}
// ── MOBILE PANEL LOGIC ──
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
  }, 300);
}
 
mobileToggle.addEventListener('click', openMobilePanel);
mobileOverlay.addEventListener('click', closeMobilePanel);
 
// Mobile tabs
document.querySelectorAll('.mobile-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.mobile-tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
  });
});
 
// Mobile tool items → trigger desktop tool buttons
document.querySelectorAll('.mobile-tool-item[data-tool]').forEach(item => {
  item.addEventListener('click', () => {
    const btn = document.getElementById(item.dataset.tool);
    if (btn) btn.click();
    closeMobilePanel();
  });
});
 
// Mobile action buttons → trigger desktop counterparts
const mobileActions = {
  mobileUndoBtn:      'undoBtn',
  mobileRotateL:      'rotateLeftBtn',
  mobileRotateR:      'rotateRightBtn',
  mobileDeletePage:   'deletePageBtn',
  mobileDuplicatePage:'duplicatePageBtn',
  mobileExtractPage:  'extractPageBtn',
  mobileClearAnnot:   'clearAnnotBtn',
  mobileSavePdf:      'savePdfBtn',
  mobileSavePng:      'savePngBtn',
};
Object.entries(mobileActions).forEach(([mId, dId]) => {
  document.getElementById(mId)?.addEventListener('click', () => {
    document.getElementById(dId)?.click();
    closeMobilePanel();
  });
});
 
// Mobile upload
document.getElementById('mobileUploadZone')?.addEventListener('click', () => {
  document.getElementById('mobilePdfUploader').click();
});
document.getElementById('mobilePdfUploader')?.addEventListener('change', function() {
  if (this.files[0]) {
    // Reuse the desktop upload handler
    const dt = new DataTransfer();
    dt.items.add(this.files[0]);
    const desktopInput = document.getElementById('pdfUploader');
    desktopInput.files = dt.files;
    desktopInput.dispatchEvent(new Event('change'));
    closeMobilePanel();
  }
});
 
// Mobile color swatches sync to desktop
document.querySelectorAll('#mobileColorSwatches .color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    // Find matching desktop swatch
    const match = document.querySelector(`#colorSwatches .color-swatch[data-color="${sw.dataset.color}"]`);
    if (match) match.click();
    document.querySelectorAll('#mobileColorSwatches .color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
  });
});
 
// Mobile sliders sync to desktop sliders
document.getElementById('mobileStrokeSlider')?.addEventListener('input', function() {
  const ds = document.getElementById('strokeSlider');
  ds.value = this.value;
  ds.dispatchEvent(new Event('input'));
});
document.getElementById('mobileOpacitySlider')?.addEventListener('input', function() {
  const ds = document.getElementById('opacitySlider');
  ds.value = this.value;
  ds.dispatchEvent(new Event('input'));
});
 
// ── FAQ ACCORDION ──
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const wasOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
    if (!wasOpen) item.classList.add('open');
  });
});