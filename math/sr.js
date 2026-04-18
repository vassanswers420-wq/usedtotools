
/* ═══════════════════════════════════════
   THEME
═══════════════════════════════════════ */
(function() {
  const root = document.documentElement;
  const btn  = document.getElementById('themeToggle');
  const saved = localStorage.getItem('theme') || 'light';
  root.setAttribute('data-theme', saved);
  btn.textContent = saved === 'night' ? '☀️ Day' : '🌙 Night';
  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'night' ? 'light' : 'night';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    btn.textContent = next === 'night' ? '☀️ Day' : '🌙 Night';
  });
})();

/* ═══════════════════════════════════════
   STATE
═══════════════════════════════════════ */
let mode  = 'area';
let shape = 'square';

/* ═══════════════════════════════════════
   SHAPE DEFINITIONS
═══════════════════════════════════════ */
const SHAPES = {
  // 2D
  square:        { label:'Square',        inputs:[{id:'a',label:'Side (a)'}] },
  rectangle:     { label:'Rectangle',     inputs:[{id:'l',label:'Length (l)'},{id:'w',label:'Width (w)'}] },
  triangle:      { label:'Triangle',      inputs:[{id:'b',label:'Base (b)'},{id:'h',label:'Height (h)'},{id:'s1',label:'Side 1'},{id:'s2',label:'Side 2'},{id:'s3',label:'Side 3'}] },
  circle:        { label:'Circle',        inputs:[{id:'r',label:'Radius (r)'}] },
  ellipse:       { label:'Ellipse',       inputs:[{id:'a',label:'Semi-major (a)'},{id:'b',label:'Semi-minor (b)'}] },
  trapezoid:     { label:'Trapezoid',     inputs:[{id:'a',label:'Top side (a)'},{id:'b',label:'Bottom side (b)'},{id:'h',label:'Height (h)'},{id:'c',label:'Leg 1 (c)'},{id:'d',label:'Leg 2 (d)'}] },
  parallelogram: { label:'Parallelogram', inputs:[{id:'b',label:'Base (b)'},{id:'h',label:'Height (h)'},{id:'s',label:'Side (s)'}] },
  rhombus:       { label:'Rhombus',       inputs:[{id:'d1',label:'Diagonal 1'},{id:'d2',label:'Diagonal 2'},{id:'s',label:'Side (s)'}] },
  // 3D
  cube:          { label:'Cube',          inputs:[{id:'a',label:'Side (a)'}] },
  cuboid:        { label:'Cuboid',        inputs:[{id:'l',label:'Length (l)'},{id:'w',label:'Width (w)'},{id:'h',label:'Height (h)'}] },
  sphere:        { label:'Sphere',        inputs:[{id:'r',label:'Radius (r)'}] },
  cylinder:      { label:'Cylinder',      inputs:[{id:'r',label:'Radius (r)'},{id:'h',label:'Height (h)'}] },
  cone:          { label:'Cone',          inputs:[{id:'r',label:'Radius (r)'},{id:'h',label:'Height (h)'}] },
};

const SHAPES_3D = ['cube','cuboid','sphere','cylinder','cone'];

/* ═══════════════════════════════════════
   FORMULAS BY MODE + SHAPE
═══════════════════════════════════════ */
const FORMULAS = {
  area: {
    square:        'A = a²',
    rectangle:     'A = l × w',
    triangle:      'A = ½ × b × h',
    circle:        'A = π × r²',
    ellipse:       'A = π × a × b',
    trapezoid:     'A = ½ × (a + b) × h',
    parallelogram: 'A = b × h',
    rhombus:       'A = ½ × d₁ × d₂',
  },
  perimeter: {
    square:        'P = 4a',
    rectangle:     'P = 2(l + w)',
    triangle:      'P = s₁ + s₂ + s₃',
    circle:        'C = 2πr',
    ellipse:       'P ≈ π[3(a+b) − √((3a+b)(a+3b))]',
    trapezoid:     'P = a + b + c + d',
    parallelogram: 'P = 2(b + s)',
    rhombus:       'P = 4s',
  },
  volume: {
    cube:     'V = a³',
    cuboid:   'V = l × w × h',
    sphere:   'V = ⁴⁄₃ × π × r³',
    cylinder: 'V = π × r² × h',
    cone:     'V = ⅓ × π × r² × h',
  },
  surface: {
    cube:     'SA = 6a²',
    cuboid:   'SA = 2(lw + lh + wh)',
    sphere:   'SA = 4πr²',
    cylinder: 'SA = 2πr(r + h)',
    cone:     'SA = πr(r + √(r²+h²))',
  },
};

/* ═══════════════════════════════════════
   COMPUTE
═══════════════════════════════════════ */
function compute(mode, shape, v) {
  const π = Math.PI;
  const results = {};

  if (mode === 'area') {
    switch(shape) {
      case 'square':        results['Area'] = [v.a**2, 2]; break;
      case 'rectangle':     results['Area'] = [v.l*v.w, 2]; break;
      case 'triangle':      results['Area'] = [0.5*v.b*v.h, 2]; break;
      case 'circle':        results['Area'] = [π*v.r**2, 2]; break;
      case 'ellipse':       results['Area'] = [π*v.a*v.b, 2]; break;
      case 'trapezoid':     results['Area'] = [0.5*(v.a+v.b)*v.h, 2]; break;
      case 'parallelogram': results['Area'] = [v.b*v.h, 2]; break;
      case 'rhombus':       results['Area'] = [0.5*v.d1*v.d2, 2]; break;
    }
  }

  if (mode === 'perimeter') {
    switch(shape) {
      case 'square':        results['Perimeter'] = [4*v.a, 1]; break;
      case 'rectangle':     results['Perimeter'] = [2*(v.l+v.w), 1]; break;
      case 'triangle':      results['Perimeter'] = [v.s1+v.s2+v.s3, 1]; break;
      case 'circle':        results['Circumference'] = [2*π*v.r, 1]; results['Diameter'] = [2*v.r, 1]; break;
      case 'ellipse':       results['Perimeter'] = [π*(3*(v.a+v.b)-Math.sqrt((3*v.a+v.b)*(v.a+3*v.b))), 1]; break;
      case 'trapezoid':     results['Perimeter'] = [v.a+v.b+v.c+v.d, 1]; break;
      case 'parallelogram': results['Perimeter'] = [2*(v.b+v.s), 1]; break;
      case 'rhombus':       results['Perimeter'] = [4*v.s, 1]; break;
    }
  }

  if (mode === 'volume') {
    switch(shape) {
      case 'cube':     results['Volume'] = [v.a**3, 3]; break;
      case 'cuboid':   results['Volume'] = [v.l*v.w*v.h, 3]; break;
      case 'sphere':   results['Volume'] = [(4/3)*π*v.r**3, 3]; break;
      case 'cylinder': results['Volume'] = [π*v.r**2*v.h, 3]; break;
      case 'cone':     results['Volume'] = [(1/3)*π*v.r**2*v.h, 3]; break;
    }
  }

  if (mode === 'surface') {
    switch(shape) {
      case 'cube':     results['Surface Area'] = [6*v.a**2, 2]; break;
      case 'cuboid':   results['Surface Area'] = [2*(v.l*v.w+v.l*v.h+v.w*v.h), 2]; break;
      case 'sphere':   results['Surface Area'] = [4*π*v.r**2, 2]; break;
      case 'cylinder':
        results['Surface Area'] = [2*π*v.r*(v.r+v.h), 2];
        results['Lateral Area'] = [2*π*v.r*v.h, 2];
        results['Base Area']    = [π*v.r**2, 2];
        break;
      case 'cone':
        const sl = Math.sqrt(v.r**2+v.h**2);
        results['Surface Area'] = [π*v.r*(v.r+sl), 2];
        results['Slant Height'] = [sl, 1];
        break;
    }
  }

  return results;
}

/* ═══════════════════════════════════════
   UNIT SUPERSCRIPTS
═══════════════════════════════════════ */
function unitStr(u, exp) {
  const sup = {1:'', 2:'²', 3:'³'};
  return u + (sup[exp] || '');
}

/* ═══════════════════════════════════════
   RENDER INPUTS
═══════════════════════════════════════ */
function renderInputs() {
  const def = SHAPES[shape];
  const grid = document.getElementById('inputGrid');
  // decide which inputs to show based on mode
  let inputs = def.inputs;
  if (mode === 'area') {
    // for triangle area we only need b and h
    if (shape === 'triangle') inputs = inputs.filter(i => ['b','h'].includes(i.id));
    // for trapezoid area: a, b, h only
    if (shape === 'trapezoid') inputs = inputs.filter(i => ['a','b','h'].includes(i.id));
    if (shape === 'parallelogram') inputs = inputs.filter(i => ['b','h'].includes(i.id));
    if (shape === 'rhombus') inputs = inputs.filter(i => ['d1','d2'].includes(i.id));
  } else if (mode === 'perimeter') {
    if (shape === 'triangle') inputs = inputs.filter(i => ['s1','s2','s3'].includes(i.id));
    if (shape === 'trapezoid') inputs = inputs.filter(i => ['a','b','c','d'].includes(i.id));
    if (shape === 'parallelogram') inputs = inputs.filter(i => ['b','s'].includes(i.id));
    if (shape === 'rhombus') inputs = inputs.filter(i => ['s'].includes(i.id));
  }

  grid.innerHTML = inputs.map(inp => `
    <div class="field">
      <label>${inp.label}</label>
      <input type="number" id="inp_${inp.id}" placeholder="0" min="0" step="any">
    </div>
  `).join('');

  // formula preview
  const formula = (FORMULAS[mode] || {})[shape] || '—';
  document.getElementById('formulaText').textContent = formula;

  // clear results
  document.getElementById('resultEmpty').style.display = 'block';
  document.getElementById('resultCards').style.display = 'none';
  document.getElementById('resultFormula').style.display = 'none';
  document.getElementById('shapePreview').innerHTML = '';
}

/* ═══════════════════════════════════════
   CALCULATE
═══════════════════════════════════════ */
function calculate() {
  const def = SHAPES[shape];
  const v = {};
  let valid = true;

  def.inputs.forEach(inp => {
    const el = document.getElementById('inp_' + inp.id);
    if (!el) return;
    const val = parseFloat(el.value);
    if (isNaN(val) || val < 0) { valid = false; }
    v[inp.id] = val;
  });

  if (!valid) {
    alert('Please enter valid positive numbers for all fields.');
    return;
  }

  const results = compute(mode, shape, v);
  const unit = document.getElementById('unitSelect').value;
  const entries = Object.entries(results);

  if (!entries.length) {
    alert('This calculation is not supported for the selected shape and mode.');
    return;
  }

  // Render result cards
  const classes = ['primary','secondary','tertiary'];
  const cardsEl = document.getElementById('resultCards');
  cardsEl.innerHTML = entries.map(([label, [val, exp]], i) => `
    <div class="result-card ${classes[i] || ''}">
      <div class="rc-label">${label}</div>
      <div class="rc-value">${fmt(val)}</div>
      <div class="rc-unit">${unitStr(unit, exp)}</div>
    </div>
  `).join('');

  // Formula line
  const formulaEl = document.getElementById('resultFormula');
  const formula = (FORMULAS[mode] || {})[shape] || '';
  formulaEl.textContent = `Formula: ${formula}  →  ${entries.map(([l,[v2,e]]) => `${l} = ${fmt(v2)} ${unitStr(unit,e)}`).join('  |  ')}`;

  document.getElementById('resultEmpty').style.display = 'none';
  cardsEl.style.display = 'grid';
  formulaEl.style.display = 'block';

  renderShapePreview(v);
}

function fmt(n) {
  if (isNaN(n) || !isFinite(n)) return 'Error';
  if (n === 0) return '0';
  if (Math.abs(n) > 1e9 || (Math.abs(n) < 1e-4 && n !== 0)) return n.toExponential(4);
  return parseFloat(n.toPrecision(8)).toString();
}

/* ═══════════════════════════════════════
   SVG SHAPE PREVIEW
═══════════════════════════════════════ */
function renderShapePreview(v) {
  const el = document.getElementById('shapePreview');
  const c = getComputedStyle(document.documentElement);
  const stroke = c.getPropertyValue('--accent').trim();
  const fill   = c.getPropertyValue('--accent-lt').trim();
  const text   = c.getPropertyValue('--muted').trim();

  const svgs = {
    square: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="100" height="100" fill="${fill}" stroke="${stroke}" stroke-width="2.5" rx="2"/>
      <text x="60" y="65" text-anchor="middle" font-size="11" fill="${text}" font-family="Fira Code">a</text>
    </svg>`,
    rectangle: `<svg viewBox="0 0 160 100" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="140" height="80" fill="${fill}" stroke="${stroke}" stroke-width="2.5" rx="2"/>
      <text x="80" y="56" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">l × w</text>
    </svg>`,
    triangle: `<svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg">
      <polygon points="60,8 110,102 10,102" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <text x="60" y="80" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">b, h</text>
    </svg>`,
    circle: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="50" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <line x1="60" y1="60" x2="110" y2="60" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="4"/>
      <text x="85" y="55" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">r</text>
    </svg>`,
    ellipse: `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="80" cy="55" rx="70" ry="40" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <text x="80" y="60" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">a × b</text>
    </svg>`,
    trapezoid: `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <polygon points="30,10 130,10 150,100 10,100" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <text x="80" y="62" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">trap</text>
    </svg>`,
    parallelogram: `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg">
      <polygon points="30,10 150,10 130,100 10,100" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <text x="80" y="62" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">b × h</text>
    </svg>`,
    rhombus: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <polygon points="60,5 115,60 60,115 5,60" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <text x="60" y="65" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">d₁×d₂</text>
    </svg>`,
    cube: `<svg viewBox="0 0 130 120" xmlns="http://www.w3.org/2000/svg">
      <polygon points="30,30 90,30 90,90 30,90" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <polygon points="90,30 120,10 120,70 90,90" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="0.7"/>
      <polygon points="30,30 60,10 120,10 90,30" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>
      <text x="60" y="65" text-anchor="middle" font-size="10" fill="${text}" font-family="Fira Code">a³</text>
    </svg>`,
    sphere: `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="50" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      <ellipse cx="60" cy="60" rx="50" ry="18" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="5,3"/>
    </svg>`,
    cylinder: `<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="25" rx="45" ry="15" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <rect x="15" y="25" width="90" height="90" fill="${fill}" stroke="none"/>
      <line x1="15" y1="25" x2="15" y2="115" stroke="${stroke}" stroke-width="2"/>
      <line x1="105" y1="25" x2="105" y2="115" stroke="${stroke}" stroke-width="2"/>
      <ellipse cx="60" cy="115" rx="45" ry="15" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    </svg>`,
    cone: `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg">
      <polygon points="60,10 110,115 10,115" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <ellipse cx="60" cy="115" rx="50" ry="14" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
    </svg>`,
    cuboid: `<svg viewBox="0 0 140 130" xmlns="http://www.w3.org/2000/svg">
      <polygon points="20,40 90,40 90,110 20,110" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <polygon points="90,40 120,15 120,85 90,110" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="0.7"/>
      <polygon points="20,40 50,15 120,15 90,40" fill="${fill}" stroke="${stroke}" stroke-width="2" opacity="0.5"/>
    </svg>`,
  };

  el.innerHTML = svgs[shape] || '';
}

/* ═══════════════════════════════════════
   EVENT WIRING
═══════════════════════════════════════ */
// Mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;

    const is3D = mode === 'volume' || mode === 'surface';
    document.getElementById('shapes2d').style.display = is3D ? 'none' : 'block';
    document.getElementById('shapes3d').style.display = is3D ? 'block' : 'none';

    // reset shape selection
    const firstBtn = document.querySelector(`#${is3D ? 'shapes3d' : 'shapes2d'} .shape-btn`);
    if (firstBtn) {
      document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
      firstBtn.classList.add('active');
      shape = firstBtn.dataset.shape;
    }
    renderInputs();
  });
});

// Shape buttons
document.querySelectorAll('.shape-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    shape = btn.dataset.shape;
    renderInputs();
  });
});

// FAQ
document.querySelectorAll('.faq-item').forEach(item => {
  item.querySelector('.faq-q').addEventListener('click', () => item.classList.toggle('open'));
});

// Init
renderInputs();
document.body.style.zoom = "0.9";
