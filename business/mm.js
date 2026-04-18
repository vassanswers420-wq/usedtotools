
/* ═══════════════════════════════
   STATE
═══════════════════════════════ */
let gstMode = 'cgst-sgst'; // 'cgst-sgst' | 'igst' | 'exempt'
let invoiceType = 'tax';
let logoB64 = '';
let sigB64 = '';
let itemRowId = 0;

/* ═══════════════════════════════
   INIT
═══════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('invoiceDate').value = today();
  autoInvoiceNumber();
  addItemRow(); // start with one empty row
  loadRecentInvoices();
  loadHistoryTab();
});

function today() {
  return new Date().toISOString().split('T')[0];
}

function autoInvoiceNumber() {
  const last = parseInt(localStorage.getItem('lastInvNum') || '1000');
  document.getElementById('invoiceNumber').value = 'INV-' + (last + 1);
}

/* ═══════════════════════════════
   TAB SWITCHING
═══════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  event.currentTarget.classList.add('active');
  if (tab === 'history') loadHistoryTab();
}

/* ═══════════════════════════════
   INVOICE TYPE
═══════════════════════════════ */
function setInvType(t) {
  invoiceType = t;
  document.querySelectorAll('.inv-type-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('type-' + t).classList.add('active');
}

/* ═══════════════════════════════
   GST MODE
═══════════════════════════════ */
function setGstMode(mode) {
  gstMode = mode;
  document.querySelectorAll('.gst-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('chip-' + mode).classList.add('active');
  recalcTotals();
}

function checkIGST() {
  const shopS  = document.getElementById('shopState').value;
  const clientS = document.getElementById('clientState').value;
  if (shopS && clientS && shopS !== clientS) {
    setGstMode('igst');
    toast('IGST applied — inter-state supply detected', 'info');
  } else if (shopS && clientS) {
    setGstMode('cgst-sgst');
  }
}

/* ═══════════════════════════════
   LOGO / SIGNATURE UPLOAD
═══════════════════════════════ */
document.getElementById('logoUpload').addEventListener('change', function() {
  const f = this.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => { logoB64 = e.target.result; toast('Logo uploaded'); };
  r.readAsDataURL(f);
});

document.getElementById('signatureUpload').addEventListener('change', function() {
  const f = this.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => { sigB64 = e.target.result; toast('Signature uploaded'); };
  r.readAsDataURL(f);
});

/* ═══════════════════════════════
   ITEM ROWS
═══════════════════════════════ */
function addItemRow(desc='', hsn='', qty=1, unit='Nos', price=0, disc=0, gst=18) {
  const id = ++itemRowId;
  const units = ['Nos','Kgs','Ltrs','Mtrs','Pcs','Box','Bag','Set','Hr','Day','Month'];
  const gstOpts = [0,5,12,18,28].map(r => `<option value="${r}" ${r===gst?'selected':''}>${r}%</option>`).join('');
  const unitOpts = units.map(u => `<option ${u===unit?'selected':''}>${u}</option>`).join('');

  const tr = document.createElement('tr');
  tr.id = 'row-' + id;
  tr.innerHTML = `
    <td><input type="text" value="${desc}" placeholder="Item or service description" oninput="recalcRow(${id})"></td>
    <td><input type="text" value="${hsn}" placeholder="HSN" style="width:72px;"></td>
    <td><input type="number" value="${qty}" min="0.01" step="0.01" style="width:60px;" oninput="recalcRow(${id})"></td>
    <td><select style="width:65px;">${unitOpts}</select></td>
    <td><input type="number" value="${price}" min="0" step="0.01" style="width:80px;" oninput="recalcRow(${id})"></td>
    <td><input type="number" value="${disc}" min="0" max="100" step="0.1" style="width:58px;" oninput="recalcRow(${id})"></td>
    <td><select oninput="recalcRow(${id})" style="width:64px;">${gstOpts}</select></td>
    <td style="font-family:'JetBrains Mono',monospace;font-weight:600;" id="amt-${id}">₹0.00</td>
    <td><button class="del-btn" onclick="removeRow(${id})" title="Remove"><i class="fas fa-times"></i></button></td>
  `;
  document.getElementById('itemsTbody').appendChild(tr);
  recalcRow(id);
}

function removeRow(id) {
  document.getElementById('row-' + id)?.remove();
  recalcTotals();
}

function recalcRow(id) {
  const row = document.getElementById('row-' + id);
  if (!row) return;
  const inputs = row.querySelectorAll('input,select');
  const qty   = parseFloat(inputs[2].value) || 0;
  const price = parseFloat(inputs[4].value) || 0;
  const disc  = parseFloat(inputs[5].value) || 0;
  const gst   = parseFloat(inputs[6].value) || 0;
  const base  = qty * price * (1 - disc / 100);
  const total = base + (gstMode === 'exempt' ? 0 : base * gst / 100);
  const amtEl = document.getElementById('amt-' + id);
  if (amtEl) amtEl.textContent = '₹' + total.toFixed(2);
  recalcTotals();
}

function getItemsData() {
  const rows = document.querySelectorAll('#itemsTbody tr');
  return Array.from(rows).map(row => {
    const inputs = row.querySelectorAll('input,select');
    const qty   = parseFloat(inputs[2].value) || 0;
    const unit  = inputs[3].value;
    const price = parseFloat(inputs[4].value) || 0;
    const disc  = parseFloat(inputs[5].value) || 0;
    const gstR  = parseFloat(inputs[6].value) || 0;
    const base  = qty * price * (1 - disc / 100);
    const taxAmt = gstMode === 'exempt' ? 0 : base * gstR / 100;
    return {
      desc: inputs[0].value,
      hsn: inputs[1].value,
      qty, unit, price, disc, gstR, base,
      taxAmt, total: base + taxAmt
    };
  }).filter(i => i.desc || i.price > 0);
}

/* ═══════════════════════════════
   TOTALS
═══════════════════════════════ */
function recalcTotals() {
  const items = getItemsData();
  const subtotal = items.reduce((s, i) => s + i.base, 0);
  const totalTax = items.reduce((s, i) => s + i.taxAmt, 0);
  const discount = parseFloat(document.getElementById('discountAmt').value) || 0;
  const shipping = parseFloat(document.getElementById('shippingAmt').value) || 0;
  const adjust   = parseFloat(document.getElementById('adjustAmt').value) || 0;
  const grand = subtotal - discount + totalTax + shipping + adjust;

  document.getElementById('t-subtotal').textContent = '₹' + subtotal.toFixed(2);
  document.getElementById('t-discount').textContent = '- ₹' + discount.toFixed(2);
  document.getElementById('t-shipping').textContent = '+ ₹' + shipping.toFixed(2);
  document.getElementById('t-grand').textContent = '₹' + grand.toFixed(2);

  if (gstMode === 'igst') {
    document.getElementById('t-tax-lbl').textContent = 'IGST';
    document.getElementById('t-tax').textContent = '₹' + totalTax.toFixed(2);
    document.getElementById('sb-tax-lbl').textContent = 'IGST';
    document.getElementById('sb-tax-lbl2').textContent = '';
    document.getElementById('sb-cgst').textContent = '₹' + totalTax.toFixed(2);
    document.getElementById('sb-sgst').textContent = '—';
  } else if (gstMode === 'exempt') {
    document.getElementById('t-tax-lbl').textContent = 'GST (Exempt)';
    document.getElementById('t-tax').textContent = '₹0.00';
    document.getElementById('sb-cgst').textContent = '₹0.00';
    document.getElementById('sb-sgst').textContent = '₹0.00';
  } else {
    document.getElementById('t-tax-lbl').textContent = 'CGST + SGST';
    document.getElementById('t-tax').textContent = '₹' + totalTax.toFixed(2);
    document.getElementById('sb-tax-lbl').textContent = 'CGST';
    document.getElementById('sb-tax-lbl2').textContent = 'SGST';
    document.getElementById('sb-cgst').textContent = '₹' + (totalTax / 2).toFixed(2);
    document.getElementById('sb-sgst').textContent = '₹' + (totalTax / 2).toFixed(2);
  }

  document.getElementById('sb-grand').textContent = '₹' + grand.toFixed(2);
  document.getElementById('sb-sub').textContent = '₹' + subtotal.toFixed(2);
  document.getElementById('sb-items').textContent = items.length;
  document.getElementById('sb-words').textContent = numberToWords(Math.round(grand)) + ' only';
}

/* ═══════════════════════════════
   INVOICE PREVIEW / PRINT AREA
═══════════════════════════════ */
function buildInvoiceHTML() {
  const items = getItemsData();
  if (items.length === 0) { toast('Add at least one item', 'error'); return null; }

  const shop    = v('shopName') || 'Business Name';
  const gst     = v('gstin');
  const addr    = v('shopAddress');
  const contact = v('shopContact');
  const invNo   = v('invoiceNumber') || 'INV-' + Date.now();
  const invDate = v('invoiceDate') || today();
  const dueDate = v('dueDate');
  const client  = v('clientName') || 'Client';
  const cAddr   = v('clientAddress');
  const cGstin  = v('clientGstin');
  const supply  = v('supplyState') || v('shopState');
  const notes   = v('invoiceNotes');
  const terms   = v('invoiceTerms');
  const bankName= v('bankName');
  const bankAcc = v('bankAccount');
  const bankIfs = v('bankIfsc');
  const upi     = v('upiId');

  const subtotal = items.reduce((s, i) => s + i.base, 0);
  const totalTax = items.reduce((s, i) => s + i.taxAmt, 0);
  const discount = parseFloat(document.getElementById('discountAmt').value) || 0;
  const shipping = parseFloat(document.getElementById('shippingAmt').value) || 0;
  const adjust   = parseFloat(document.getElementById('adjustAmt').value) || 0;
  const grand = subtotal - discount + totalTax + shipping + adjust;

  const invTypeLbl = { tax:'Tax Invoice', proforma:'Proforma Invoice', debit:'Debit Note', credit:'Credit Note', receipt:'Receipt' }[invoiceType];

  const itemRows = items.map((it, i) => {
    const cgst = gstMode === 'igst' ? '' : `<td style="text-align:right;">₹${(it.taxAmt/2).toFixed(2)}</td><td style="text-align:right;">₹${(it.taxAmt/2).toFixed(2)}</td>`;
    const igst = gstMode === 'igst' ? `<td style="text-align:right;">₹${it.taxAmt.toFixed(2)}</td>` : '';
    return `<tr>
      <td style="text-align:center;">${i+1}</td>
      <td>${it.desc}</td>
      <td>${it.hsn}</td>
      <td style="text-align:center;">${it.qty} ${it.unit}</td>
      <td style="text-align:right;">₹${it.price.toFixed(2)}</td>
      ${it.disc > 0 ? `<td style="text-align:right;">${it.disc}%</td>` : '<td>—</td>'}
      <td style="text-align:center;">${it.gstR}%</td>
      ${cgst}${igst}
      <td style="text-align:right;font-weight:600;">₹${it.total.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const taxHeader = gstMode === 'igst'
    ? '<th style="text-align:right;">IGST</th>'
    : '<th style="text-align:right;">CGST</th><th style="text-align:right;">SGST</th>';

  const taxRows = gstMode === 'igst'
    ? `<div class="inv-total-row"><span>IGST</span><span>₹${totalTax.toFixed(2)}</span></div>`
    : `<div class="inv-total-row"><span>CGST</span><span>₹${(totalTax/2).toFixed(2)}</span></div>
       <div class="inv-total-row"><span>SGST</span><span>₹${(totalTax/2).toFixed(2)}</span></div>`;

  const bankHTML = (bankName || bankAcc) ? `
    <div style="font-size:0.8rem;color:#444;margin-top:16px;">
      <strong style="display:block;margin-bottom:4px;">Bank Details</strong>
      ${bankName ? `Bank: ${bankName}<br>` : ''}
      ${bankAcc ? `A/C: ${bankAcc}<br>` : ''}
      ${bankIfs ? `IFSC: ${bankIfs}<br>` : ''}
      ${upi ? `UPI: ${upi}` : ''}
    </div>` : '';

  return `
  <div class="inv-doc" id="invoiceDocRoot">
    <div class="inv-top-bar">
      <div>
        ${logoB64 ? `<img src="${logoB64}" style="max-height:60px;margin-bottom:8px;display:block;">` : ''}
        <div style="font-size:1.3rem;font-weight:700;">${shop}</div>
        <div style="font-size:0.8rem;opacity:0.85;margin-top:4px;">${addr}</div>
        ${gst ? `<div style="font-size:0.78rem;opacity:0.8;margin-top:2px;">GSTIN: ${gst}</div>` : ''}
        ${contact ? `<div style="font-size:0.78rem;opacity:0.8;">${contact}</div>` : ''}
      </div>
      <div class="inv-meta">
        <strong>${invTypeLbl}</strong><br>
        <span style="font-size:1.2rem;font-family:'JetBrains Mono',monospace;">${invNo}</span><br>
        Date: ${invDate}
        ${dueDate ? `<br>Due: ${dueDate}` : ''}
        ${supply ? `<br>Place of Supply: ${supply}` : ''}
      </div>
    </div>
    <div class="inv-body">
      <div class="inv-parties">
        <div class="inv-party">
          <h4>Bill To</h4>
          <div class="party-name">${client}</div>
          <p>${cAddr}<br>${cGstin ? `GSTIN: ${cGstin}` : ''}</p>
        </div>
        <div class="inv-party">
          <h4>Invoice Summary</h4>
          <p>Items: ${items.length}<br>
          GST Mode: ${gstMode === 'igst' ? 'IGST (Inter-state)' : gstMode === 'exempt' ? 'Exempt' : 'CGST+SGST (Intra-state)'}</p>
        </div>
      </div>

      <table class="inv-items-table">
        <thead>
          <tr>
            <th>#</th><th>Description</th><th>HSN/SAC</th><th style="text-align:center;">Qty</th>
            <th style="text-align:right;">Rate</th><th>Disc</th><th style="text-align:center;">GST</th>
            ${taxHeader}
            <th style="text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="inv-totals">
        <div class="inv-totals-inner">
          <div class="inv-total-row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
          ${discount > 0 ? `<div class="inv-total-row"><span>Discount</span><span style="color:#c0392b;">- ₹${discount.toFixed(2)}</span></div>` : ''}
          ${taxRows}
          ${shipping > 0 ? `<div class="inv-total-row"><span>Shipping</span><span>+ ₹${shipping.toFixed(2)}</span></div>` : ''}
          ${adjust !== 0 ? `<div class="inv-total-row"><span>Adjustment</span><span>${adjust > 0 ? '+ ' : ''}₹${adjust.toFixed(2)}</span></div>` : ''}
          <div class="inv-grand-row"><span>Grand Total</span><span>₹${grand.toFixed(2)}</span></div>
        </div>
      </div>

      <div class="inv-words">Amount in Words: <strong>Rupees ${numberToWords(Math.round(grand))} Only</strong></div>

      ${bankHTML}
      ${notes ? `<div style="margin-top:14px;font-size:0.82rem;"><strong>Notes:</strong><br>${notes}</div>` : ''}
      ${terms ? `<div style="margin-top:10px;font-size:0.8rem;color:#666;"><strong>Terms & Conditions:</strong><br>${terms}</div>` : ''}

      <div class="inv-footer-row">
        <div class="inv-sig">
          ${sigB64 ? `<img src="${sigB64}">` : '<div style="width:120px;height:40px;border-bottom:1.5px solid #aaa;margin-bottom:6px;"></div>'}
          <strong>${shop}</strong><br>Authorized Signatory
        </div>
        <div class="inv-brand" style="text-align:right;font-size:0.7rem;color:#bbb;">
          Generated by usedtotools.com<br>
          <span style="font-size:0.65rem;">This is a computer-generated invoice</span>
        </div>
      </div>
    </div>
  </div>`;
}

function v(id) { return document.getElementById(id)?.value?.trim() || ''; }

/* ═══════════════════════════════
   ACTIONS
═══════════════════════════════ */
function generatePreview() {
  const html = buildInvoiceHTML();
  if (!html) return;
  document.getElementById('invoicePrintArea').innerHTML = html;
  document.getElementById('previewModal').classList.add('open');
}

function closeModal() {
  document.getElementById('previewModal').classList.remove('open');
}

function printInvoice() {
  const html = buildInvoiceHTML();
  if (!html) return;
  document.getElementById('invoicePrintArea').innerHTML = html;
  setTimeout(() => window.print(), 100);
}

function downloadPDF() {
  const html = buildInvoiceHTML();
  if (!html) return;

  const el = document.createElement('div');
  el.innerHTML = html;
  el.style.fontFamily = 'Arial, sans-serif';
  el.style.background = '#fff';
  document.body.appendChild(el);

  const opt = {
    margin: [8, 8, 8, 8],
    filename: `${v('invoiceNumber') || 'invoice'}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all'] }
  };

  toast('Generating PDF…');
  html2pdf().set(opt).from(el).save().then(() => {
    document.body.removeChild(el);
    toast('PDF downloaded!');
  });
}

function exportExcel() {
  const items = getItemsData();
  if (items.length === 0) { toast('Add items first', 'error'); return; }

  const shop   = v('shopName');
  const client = v('clientName');
  const invNo  = v('invoiceNumber');
  const date   = v('invoiceDate');
  const subtotal = items.reduce((s, i) => s + i.base, 0);
  const totalTax = items.reduce((s, i) => s + i.taxAmt, 0);
  const grand = subtotal + totalTax;

  const data = [
    ['GST TAX INVOICE'],
    ['Business:', shop, '', 'Invoice No:', invNo],
    ['Client:', client, '', 'Date:', date],
    [],
    ['#','Description','HSN/SAC','Qty','Unit','Rate (₹)','Disc %','GST %','Base Amount','GST Amount','Total'],
    ...items.map((it, i) => [i+1, it.desc, it.hsn, it.qty, it.unit, it.price, it.disc, it.gstR, it.base.toFixed(2), it.taxAmt.toFixed(2), it.total.toFixed(2)]),
    [],
    ['','','','','','','','','Subtotal', '', subtotal.toFixed(2)],
    ['','','','','','','','','Tax Total', '', totalTax.toFixed(2)],
    ['','','','','','','','','GRAND TOTAL', '', grand.toFixed(2)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [40,14,10,8,8,12,8,8,14,14,14].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Invoice');
  XLSX.writeFile(wb, `${invNo || 'invoice'}.xlsx`);
  toast('Excel exported!');
}

function saveInvoice() {
  const items = getItemsData();
  if (items.length === 0) { toast('Add items first', 'error'); return; }

  const invNo = v('invoiceNumber') || 'INV-' + Date.now();
  const data = {
    id: Date.now(),
    invNo, type: invoiceType, gstMode,
    shopName: v('shopName'), gstin: v('gstin'), shopAddress: v('shopAddress'),
    shopContact: v('shopContact'), shopState: v('shopState'),
    clientName: v('clientName'), clientAddress: v('clientAddress'),
    clientGstin: v('clientGstin'), clientState: v('clientState'),
    invoiceDate: v('invoiceDate'), dueDate: v('dueDate'), supplyState: v('supplyState'),
    notes: v('invoiceNotes'), terms: v('invoiceTerms'),
    bankName: v('bankName'), bankAccount: v('bankAccount'), bankIfsc: v('bankIfsc'), upiId: v('upiId'),
    discount: v('discountAmt'), shipping: v('shippingAmt'), adjust: v('adjustAmt'),
    items,
    grand: items.reduce((s, i) => s + i.total, 0)
  };

  const saved = JSON.parse(localStorage.getItem('gstInvoices') || '[]');
  saved.unshift(data);
  if (saved.length > 50) saved.pop();
  localStorage.setItem('gstInvoices', JSON.stringify(saved));
  localStorage.setItem('lastInvNum', String(parseInt(invNo.replace(/\D/g,'') || 1000)));

  loadRecentInvoices();
  loadHistoryTab();
  toast('Invoice saved!');
  autoInvoiceNumber();
}

function clearAll() {
  if (!confirm('Clear all fields?')) return;
  document.querySelectorAll('#tab-create input[type=text], #tab-create input[type=number], #tab-create input[type=email], #tab-create input[type=tel], #tab-create textarea').forEach(el => el.value = '');
  document.getElementById('itemsTbody').innerHTML = '';
  itemRowId = 0;
  addItemRow();
  logoB64 = ''; sigB64 = '';
  document.getElementById('invoiceDate').value = today();
  autoInvoiceNumber();
  recalcTotals();
  toast('Cleared');
}

/* ═══════════════════════════════
   SAVED / HISTORY
═══════════════════════════════ */
function loadRecentInvoices() {
  const saved = JSON.parse(localStorage.getItem('gstInvoices') || '[]').slice(0, 5);
  const el = document.getElementById('recentList');
  if (saved.length === 0) { el.innerHTML = '<p style="color:var(--muted);font-size:0.82rem;">No recent invoices.</p>'; return; }
  el.innerHTML = saved.map(inv => `
    <div class="saved-item" onclick="loadInvoice(${inv.id})">
      <div>
        <div class="inv-no">${inv.invNo}</div>
        <div class="inv-client">${inv.clientName || '—'}</div>
      </div>
      <div class="inv-amt">₹${Number(inv.grand).toFixed(0)}</div>
    </div>`).join('');
}

function loadHistoryTab() {
  const saved = JSON.parse(localStorage.getItem('gstInvoices') || '[]');
  document.getElementById('histCount').textContent = saved.length;
  const el = document.getElementById('historyList');
  if (saved.length === 0) { el.innerHTML = '<p style="color:var(--muted);font-size:0.88rem;">No saved invoices yet.</p>'; return; }
  el.innerHTML = saved.map(inv => `
    <div class="saved-item" style="cursor:pointer;">
      <div onclick="loadInvoice(${inv.id})" style="flex:1;">
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="inv-no">${inv.invNo}</span>
          <span class="status-badge status-final">${inv.type}</span>
        </div>
        <div class="inv-client">${inv.clientName || '—'} · ${inv.invoiceDate}</div>
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span class="inv-amt">₹${Number(inv.grand).toFixed(0)}</span>
        <button class="del-btn" onclick="deleteSaved(${inv.id},event)" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
}

function loadInvoice(id) {
  const saved = JSON.parse(localStorage.getItem('gstInvoices') || '[]');
  const inv = saved.find(i => i.id === id);
  if (!inv) return;

  // fill fields
  const fields = ['shopName','gstin','shopAddress','shopContact','clientName','clientAddress',
    'clientGstin','invoiceDate','dueDate','supplyState','invoiceNotes','invoiceTerms',
    'bankName','bankAccount','bankIfsc','upiId','discountAmt','shippingAmt','adjustAmt','invoiceNumber'];
  const map = {
    shopName: inv.shopName, gstin: inv.gstin, shopAddress: inv.shopAddress,
    shopContact: inv.shopContact, clientName: inv.clientName, clientAddress: inv.clientAddress,
    clientGstin: inv.clientGstin, invoiceDate: inv.invoiceDate, dueDate: inv.dueDate,
    supplyState: inv.supplyState, invoiceNotes: inv.notes, invoiceTerms: inv.terms,
    bankName: inv.bankName, bankAccount: inv.bankAccount, bankIfsc: inv.bankIfsc,
    upiId: inv.upiId, discountAmt: inv.discount || 0, shippingAmt: inv.shipping || 0,
    adjustAmt: inv.adjust || 0, invoiceNumber: inv.invNo
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  });

  setGstMode(inv.gstMode || 'cgst-sgst');
  setInvType(inv.type || 'tax');

  // restore items
  document.getElementById('itemsTbody').innerHTML = '';
  itemRowId = 0;
  (inv.items || []).forEach(it => addItemRow(it.desc, it.hsn, it.qty, it.unit, it.price, it.disc, it.gstR));

  // switch to create tab
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-create').classList.add('active');
  document.querySelector('.tab-btn').classList.add('active');

  toast('Invoice loaded: ' + inv.invNo);
}

function deleteSaved(id, e) {
  e.stopPropagation();
  if (!confirm('Delete this invoice?')) return;
  let saved = JSON.parse(localStorage.getItem('gstInvoices') || '[]');
  saved = saved.filter(i => i.id !== id);
  localStorage.setItem('gstInvoices', JSON.stringify(saved));
  loadHistoryTab();
  loadRecentInvoices();
  toast('Deleted');
}

function clearAllSaved() {
  if (!confirm('Delete ALL saved invoices?')) return;
  localStorage.removeItem('gstInvoices');
  loadHistoryTab();
  loadRecentInvoices();
  toast('All saved invoices cleared');
}

/* ═══════════════════════════════
   QUICK TEMPLATES
═══════════════════════════════ */
function applyTemplate(type) {
  document.getElementById('itemsTbody').innerHTML = '';
  itemRowId = 0;
  const templates = {
    retail: [
      { desc:'Product A', hsn:'1234', qty:2, unit:'Pcs', price:500, disc:5, gst:18 },
      { desc:'Product B', hsn:'1235', qty:1, unit:'Pcs', price:1200, disc:0, gst:12 },
    ],
    service: [
      { desc:'Web Development Services', hsn:'998314', qty:1, unit:'Month', price:25000, disc:0, gst:18 },
      { desc:'Domain & Hosting', hsn:'998316', qty:1, unit:'Year', price:3000, disc:0, gst:18 },
    ],
    consulting: [
      { desc:'Business Consulting (10 hrs)', hsn:'998311', qty:10, unit:'Hr', price:2000, disc:0, gst:18 },
      { desc:'Report & Documentation', hsn:'998399', qty:1, unit:'Set', price:5000, disc:0, gst:18 },
    ],
    restaurant: [
      { desc:'Food & Beverages', hsn:'9963', qty:1, unit:'Set', price:3000, disc:0, gst:5 },
      { desc:'Service Charge', hsn:'9963', qty:1, unit:'Set', price:300, disc:0, gst:0 },
    ],
    ecommerce: [
      { desc:'Electronics Item', hsn:'8471', qty:1, unit:'Pcs', price:8500, disc:10, gst:18 },
      { desc:'Shipping & Handling', hsn:'9965', qty:1, unit:'Set', price:200, disc:0, gst:18 },
    ],
  };
  (templates[type] || []).forEach(it => addItemRow(it.desc, it.hsn, it.qty, it.unit, it.price, it.disc, it.gst));
  toast('Template applied: ' + type);
}

/* ═══════════════════════════════
   BULK CSV
═══════════════════════════════ */
document.getElementById('bulkCsvUpload').addEventListener('change', function() {
  const f = this.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = e => {
    const lines = e.target.result.split('\n').filter(l => l.trim());
    document.getElementById('bulkResult').innerHTML =
      `<p style="color:var(--accent);font-size:0.88rem;"><i class="fas fa-check-circle"></i> ${lines.length - 1} rows loaded. Click "Generate All Invoices".</p>`;
    window._bulkLines = lines;
  };
  r.readAsText(f);
});

function processBulkCSV() {
  const lines = window._bulkLines;
  if (!lines || lines.length < 2) { toast('Upload a CSV first', 'error'); return; }
  document.getElementById('bulkResult').innerHTML =
    `<p style="color:var(--accent);font-size:0.88rem;"><i class="fas fa-spinner fa-spin"></i> Processing ${lines.length-1} invoices...</p>`;
  toast(`Bulk: ${lines.length-1} invoices would be generated (demo mode)`);
}

/* ═══════════════════════════════
   NUMBER TO WORDS
═══════════════════════════════ */
function numberToWords(n) {
  if (n === 0) return 'Zero';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (n < 20) return a[n];
  if (n < 100) return b[Math.floor(n/10)] + (n%10 ? ' ' + a[n%10] : '');
  if (n < 1000) return a[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' ' + numberToWords(n%100) : '');
  if (n < 100000) return numberToWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' ' + numberToWords(n%1000) : '');
  if (n < 10000000) return numberToWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' ' + numberToWords(n%100000) : '');
  return numberToWords(Math.floor(n/10000000)) + ' Crore' + (n%10000000 ? ' ' + numberToWords(n%10000000) : '');
}

/* ═══════════════════════════════
   TOAST
═══════════════════════════════ */
let toastT;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'info' ? 'info-circle' : 'check-circle'}"></i> ${msg}`;
  el.style.background = type === 'error' ? '#c0392b' : type === 'info' ? '#1a4565' : 'var(--accent)';
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 2600);
}

/* close modal on overlay click */
document.getElementById('previewModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.body.style.zoom = "0.9";
