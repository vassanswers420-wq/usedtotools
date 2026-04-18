
// ─── PALETTES ──────────────────────────────────────
const PALETTES = {
  vivid:   ['#6ee7b7','#818cf8','#fb923c','#f472b6','#34d399','#60a5fa','#a78bfa','#fbbf24'],
  pastel:  ['#bfdbfe','#bbf7d0','#fde68a','#fecaca','#ddd6fe','#fbcfe8','#a7f3d0','#fed7aa'],
  neon:    ['#00ff88','#00cfff','#ff0090','#ffcc00','#7c00ff','#ff6600','#00ffcc','#ff2244'],
  earth:   ['#a16207','#6b7280','#78350f','#166534','#1e3a5f','#7c3aed','#92400e','#064e3b'],
  mono:    ['#f1f5f9','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a'],
  sunset:  ['#f97316','#ef4444','#ec4899','#a855f7','#6366f1','#f59e0b','#84cc16','#14b8a6'],
};

// ─── STATE ──────────────────────────────────────────
let chartType = 'bar';
let chartInstance = null;
let datasets = [];
let nextDatasetId = 1;

// ─── CHART TYPE BUTTONS ─────────────────────────────
document.querySelectorAll('.chart-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartType = btn.dataset.type;
  });
});

// ─── TABS ───────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const parent = btn.closest('.panel-body');
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ─── RANGE SLIDERS ──────────────────────────────────
function bindRange(id, valId, divisor) {
  const el = document.getElementById(id);
  const val = document.getElementById(valId);
  el.addEventListener('input', () => {
    val.textContent = divisor ? (el.value / divisor).toFixed(1) : el.value;
  });
}
bindRange('fontSize', 'fontSizeVal');
bindRange('borderWidth', 'borderWidthVal');
bindRange('tension', 'tensionVal', 10);
bindRange('barRadius', 'barRadiusVal');

// ─── DATASET MANAGER ────────────────────────────────
function addDataset(name, values, color) {
  const id = nextDatasetId++;
  const palette = PALETTES[document.getElementById('paletteSelect').value];
  const col = color || palette[(datasets.length) % palette.length];
  datasets.push({ id, name: name || `Dataset ${id}`, values: values || '', color: col });
  renderDatasets();
}

function removeDataset(id) {
  datasets = datasets.filter(d => d.id !== id);
  renderDatasets();
}

function renderDatasets() {
  const container = document.getElementById('datasetsContainer');
  container.innerHTML = '';
  datasets.forEach((ds, i) => {
    const card = document.createElement('div');
    card.className = 'dataset-card';
    card.innerHTML = `
      <div class="dataset-header">
        <div class="dataset-label-row">
          <div class="color-dot" style="background:${ds.color}"></div>
          <input type="text" value="${ds.name}" 
            style="background:none;border:none;color:var(--text);font-family:var(--font-mono);font-size:0.8rem;outline:none;width:120px;"
            onchange="datasets[${i}].name = this.value">
        </div>
        ${datasets.length > 1 ? `<button class="btn-icon" onclick="removeDataset(${ds.id})">✕</button>` : ''}
      </div>
      <div class="form-group" style="margin:0;">
        <label>Values</label>
        <textarea rows="2" placeholder="${chartType === 'scatter' ? '{x:1,y:2},{x:3,y:5}' : chartType === 'bubble' ? '{x:1,y:2,r:5}' : '10, 20, 30, 40'}"
          onchange="datasets[${i}].values = this.value">${ds.values}</textarea>
      </div>
      <div class="color-picker-row">
        <label style="font-size:0.7rem;color:var(--muted);font-family:var(--font-mono);text-transform:uppercase;">Color</label>
        <input type="color" value="${ds.color}" onchange="datasets[${i}].color = this.value; renderDatasets();">
      </div>
    `;
    container.appendChild(card);
  });
}

document.getElementById('addDatasetBtn').addEventListener('click', () => addDataset());

// ─── PALETTE CHANGE ─────────────────────────────────
document.getElementById('paletteSelect').addEventListener('change', () => {
  const palette = PALETTES[document.getElementById('paletteSelect').value];
  datasets.forEach((ds, i) => { ds.color = palette[i % palette.length]; });
  renderDatasets();
});

// ─── PARSE CSV ───────────────────────────────────────
function parseCSV() {
  const raw = document.getElementById('csvInput').value.trim();
  if (!raw) return showToast('Paste some CSV data first');
  const sep = raw.includes('\t') ? '\t' : ',';
  const rows = raw.split('\n').map(r => r.split(sep).map(c => c.trim()));
  const headers = rows[0];
  const labels = rows.slice(1).map(r => r[0]);
  document.getElementById('labelsInput').value = labels.join(', ');
  datasets = [];
  nextDatasetId = 1;
  const palette = PALETTES[document.getElementById('paletteSelect').value];
  for (let c = 1; c < headers.length; c++) {
    const values = rows.slice(1).map(r => r[c] || '0').join(', ');
    addDataset(headers[c], values, palette[(c - 1) % palette.length]);
  }
  showToast('CSV parsed — ' + (headers.length - 1) + ' dataset(s) loaded');
}

// ─── GENERATE CHART ──────────────────────────────────
function generateChart() {
  if (datasets.length === 0) { showToast('Add at least one dataset'); return; }

  const labels = document.getElementById('labelsInput').value
    .split(',').map(l => l.trim()).filter(Boolean);
  if (labels.length === 0) { showToast('Enter some X-axis labels'); return; }

  const palette = PALETTES[document.getElementById('paletteSelect').value];
  const tension = parseInt(document.getElementById('tension').value) / 10;
  const borderWidth = parseInt(document.getElementById('borderWidth').value);
  const barRadius = parseInt(document.getElementById('barRadius').value);
  const fontSize = parseInt(document.getElementById('fontSize').value);
  const showDatalabels = document.getElementById('showDatalabels').checked;
  const fillArea = document.getElementById('fillArea').checked;
  const showLegend = document.getElementById('showLegend').checked;
  const showGrid = document.getElementById('showGrid').checked;
  const animationOn = document.getElementById('animationOn').checked;
  const title = document.getElementById('chartTitle').value || 'My Chart';
  const xLabel = document.getElementById('xLabel').value;
  const yLabel = document.getElementById('yLabel').value;

  // Determine actual chart.js type
  let cjsType = chartType;
  if (chartType === 'area') cjsType = 'line';
  if (chartType === 'horizontalBar') cjsType = 'bar';

  const chartDatasets = datasets.map((ds, i) => {
    let data;
    if (chartType === 'scatter' || chartType === 'bubble') {
      try { data = JSON.parse('[' + ds.values + ']'); } catch { data = []; }
    } else {
      data = ds.values.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n));
    }
    const col = ds.color || palette[i % palette.length];
    const base = {
      label: ds.name,
      data,
      borderColor: col,
      backgroundColor: (cjsType === 'line' && (fillArea || chartType === 'area'))
        ? hexToRgba(col, 0.18)
        : (cjsType === 'bar' || cjsType === 'pie' || cjsType === 'doughnut' || cjsType === 'polarArea' || cjsType === 'radar')
          ? datasets.length === 1 && (cjsType === 'pie' || cjsType === 'doughnut' || cjsType === 'polarArea')
            ? labels.map((_, li) => palette[li % palette.length] + 'cc')
            : hexToRgba(col, 0.75)
          : hexToRgba(col, 0.6),
      borderWidth,
      tension,
      fill: (cjsType === 'line' && (fillArea || chartType === 'area')),
      pointRadius: cjsType === 'line' ? 4 : undefined,
      borderRadius: cjsType === 'bar' ? barRadius : undefined,
    };
    return base;
  });

  // Stats
  const allVals = chartDatasets.flatMap(d => d.data.map(v => typeof v === 'object' ? v.y : v)).filter(n => !isNaN(n));
  document.getElementById('statPoints').textContent = allVals.length;
  document.getElementById('statDatasets').textContent = datasets.length;
  document.getElementById('statMin').textContent = Math.min(...allVals).toFixed(2);
  document.getElementById('statMax').textContent = Math.max(...allVals).toFixed(2);
  document.getElementById('statAvg').textContent = (allVals.reduce((a, b) => a + b, 0) / allVals.length).toFixed(2);
  document.getElementById('statSum').textContent = allVals.reduce((a, b) => a + b, 0).toFixed(2);

  // Destroy old chart
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  document.getElementById('chartEmpty').style.display = 'none';
  document.getElementById('chartCanvas').style.display = 'block';
  document.getElementById('statsBar').style.display = 'flex';

  const ctx = document.getElementById('chartCanvas').getContext('2d');

  const isIndexed = ['pie','doughnut','polarArea'].includes(cjsType);
  const isHoriz = chartType === 'horizontalBar';

  chartInstance = new Chart(ctx, {
    type: cjsType,
    data: { labels, datasets: chartDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: animationOn ? { duration: 600, easing: 'easeOutQuart' } : false,
      indexAxis: isHoriz ? 'y' : 'x',
      plugins: {
        legend: {
          display: showLegend,
          labels: { color: '#e2e8f0', font: { size: fontSize, family: 'DM Sans' }, boxWidth: 12, padding: 16 }
        },
        title: {
          display: !!title,
          text: title,
          color: '#e2e8f0',
          font: { size: fontSize + 4, family: 'Syne', weight: '700' },
          padding: { bottom: 16 }
        },
        datalabels: {
          display: showDatalabels,
          color: '#e2e8f0',
          font: { size: fontSize - 1, family: 'DM Mono' },
          formatter: (v) => typeof v === 'object' ? v.y : v,
          anchor: isIndexed ? 'center' : 'end',
          align: isIndexed ? 'center' : 'top',
        },
        tooltip: {
          backgroundColor: 'rgba(17,17,24,0.95)',
          borderColor: 'rgba(110,231,183,0.2)',
          borderWidth: 1,
          titleFont: { family: 'Syne', size: fontSize },
          bodyFont: { family: 'DM Mono', size: fontSize - 1 },
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          padding: 10,
        }
      },
      scales: !isIndexed ? {
        x: {
          display: true,
          title: { display: !!xLabel, text: xLabel, color: '#64748b', font: { size: fontSize, family: 'DM Sans' } },
          ticks: { color: '#64748b', font: { size: fontSize - 1, family: 'DM Mono' } },
          grid: { color: showGrid ? 'rgba(255,255,255,0.05)' : 'transparent' }
        },
        y: {
          display: true,
          title: { display: !!yLabel, text: yLabel, color: '#64748b', font: { size: fontSize, family: 'DM Sans' } },
          ticks: { color: '#64748b', font: { size: fontSize - 1, family: 'DM Mono' } },
          grid: { color: showGrid ? 'rgba(255,255,255,0.05)' : 'transparent' }
        }
      } : {}
    },
    plugins: [ChartDataLabels]
  });

  showToast('Chart generated ✓');
}

// ─── HELPERS ─────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

// ─── EXPORT ──────────────────────────────────────────
function downloadAs(format) {
  if (!chartInstance) { showToast('Generate a chart first'); return; }
  const canvas = document.getElementById('chartCanvas');
  const title = (document.getElementById('chartTitle').value || 'chart').replace(/\s+/g,'_');
  const bgColor = document.getElementById('bgColor').value;

  if (format === 'png') {
    const offscreen = flattenCanvas(canvas, bgColor === 'transparent' ? null : bgColor);
    triggerDownload(offscreen.toDataURL('image/png'), title + '.png');

  } else if (format === 'jpeg') {
    const offscreen = flattenCanvas(canvas, bgColor === 'transparent' ? '#ffffff' : bgColor);
    triggerDownload(offscreen.toDataURL('image/jpeg', 0.95), title + '.jpg');

  } else if (format === 'pdf') {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const offscreen = flattenCanvas(canvas, '#ffffff');
    const imgData = offscreen.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 10, 10, 277, 150);
    const titleText = document.getElementById('chartTitle').value || 'Chart';
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    pdf.text('Generated by ChartForge · UsedToTools.com', 10, 200);
    pdf.save(title + '.pdf');

  } else if (format === 'svg') {
    // SVG via serializing canvas as embedded image in SVG
    const offscreen = flattenCanvas(canvas, bgColor === 'transparent' ? null : bgColor);
    const dataUrl = offscreen.toDataURL('image/png');
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${canvas.width}" height="${canvas.height}">
  <image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}"/>
</svg>`;
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, title + '.svg');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  showToast(format.toUpperCase() + ' downloaded ✓');
}

function flattenCanvas(canvas, bg) {
  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const ctx = offscreen.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, offscreen.width, offscreen.height); }
  ctx.drawImage(canvas, 0, 0);
  return offscreen;
}

function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

async function copyChartImage() {
  if (!chartInstance) { showToast('Generate a chart first'); return; }
  const canvas = document.getElementById('chartCanvas');
  const offscreen = flattenCanvas(canvas, '#0a0a0f');
  offscreen.toBlob(async (blob) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Copied to clipboard ✓');
    } catch { showToast('Copy failed — try a download instead'); }
  });
}

// ─── CLEAR ───────────────────────────────────────────
function clearChart() {
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  document.getElementById('chartCanvas').style.display = 'none';
  document.getElementById('chartEmpty').style.display = 'block';
  document.getElementById('statsBar').style.display = 'none';
}

// ─── SAMPLE DATA ─────────────────────────────────────
function loadSampleData() {
  document.getElementById('labelsInput').value = 'Jan, Feb, Mar, Apr, May, Jun, Jul, Aug';
  document.getElementById('xLabel').value = 'Month';
  document.getElementById('yLabel').value = 'Revenue (₹ Lakhs)';
  document.getElementById('chartTitle').value = 'Monthly Revenue vs Target';
  datasets = [];
  nextDatasetId = 1;
  const p = PALETTES.vivid;
  addDataset('Actual Revenue', '42, 58, 51, 74, 68, 90, 84, 95', p[0]);
  addDataset('Target', '50, 55, 60, 65, 70, 75, 80, 85', p[1]);
  showToast('Sample data loaded');
}

// ─── FAQ ACCORDION ────────────────────────────────────
document.querySelectorAll('.faq-item').forEach(item => {
  item.querySelector('.faq-q').addEventListener('click', () => {
    item.classList.toggle('open');
  });
});

// ─── INIT ────────────────────────────────────────────
(function init() {
  addDataset('Dataset 1', '', PALETTES.vivid[0]);
})();
document.body.style.zoom = "0.9";
