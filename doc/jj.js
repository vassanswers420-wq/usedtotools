
const editor = document.getElementById('editor');
const palette = document.getElementById('colorPalette');

let textColor = '#1a1a1a';
let hlColor = '#fef08a';
let paletteMode = 'text';
let autoTimer;
let zoomLevel = 1;
let findMatches = [];
let findPos = 0;

// ── RULER ─────────────────────────────────────
(function buildRuler(){
  const ri = document.getElementById('rulerInner');
  for(let mm=0;mm<=210;mm+=5){
    const px = mm * 3.78;
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:${px}px;bottom:2px;width:1px;background:#9b9b9b;opacity:.4;height:${mm%50===0?10:mm%10===0?6:3}px`;
    ri.appendChild(d);
    if(mm%50===0){
      const lbl = document.createElement('div');
      lbl.style.cssText = `position:absolute;left:${px}px;bottom:4px;font-size:8px;color:#9b9b9b;font-family:'JetBrains Mono',monospace;transform:translateX(-50%)`;
      lbl.textContent = (mm/10)+'cm';
      ri.appendChild(lbl);
    }
  }
})();

// ── FORMAT COMMANDS ────────────────────────────
function fmt(cmd,val){ document.execCommand(cmd,false,val||null); editor.focus(); updateState(); }
function align(a){ document.execCommand('justify'+a.charAt(0).toUpperCase()+a.slice(1)); editor.focus(); }

function applyStyle(tag){
  document.execCommand('formatBlock',false,'<'+tag+'>');
  editor.focus();
}

function applyFont(f){
  document.execCommand('fontName',false,f);
  editor.focus();
}

function applyFontSize(v){
  const sel = window.getSelection();
  if(!sel||sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.style.fontSize = parseInt(v)+'px';
  try{ r.surroundContents(span); }catch(e){}
  editor.focus();
}

// ── TOOLBAR STATE ──────────────────────────────
function updateState(){
  [['btnBold','bold'],['btnItalic','italic'],['btnUnderline','underline'],['btnStrike','strikeThrough']].forEach(([id,cmd])=>{
    try{ document.getElementById(id)?.classList.toggle('active', document.queryCommandState(cmd)); }catch(e){}
  });
}

// ── COLOR PALETTE ──────────────────────────────
const COLORS=[
  '#000000','#222222','#555555','#888888','#aaaaaa','#cccccc','#e8e8e8','#ffffff',
  '#dc2626','#ea580c','#d97706','#16a34a','#0891b2','#2563eb','#7c3aed','#db2777',
  '#fca5a5','#fdba74','#fde68a','#86efac','#67e8f9','#93c5fd','#c4b5fd','#f9a8d4',
  '#7f1d1d','#7c2d12','#78350f','#14532d','#164e63','#1e3a8a','#4c1d95','#831843',
  '#fef08a','#bbf7d0','#bae6fd','#e9d5ff','#fce7f3','#fed7aa','#d1fae5','#f0f9ff',
  '#f97316','#84cc16','#06b6d4','#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6',
];

function openPalette(mode,e){
  paletteMode = mode;
  palette.innerHTML='';
  const cur = mode==='text'?textColor:hlColor;
  COLORS.forEach(c=>{
    const sw = document.createElement('div');
    sw.className = 'cp-swatch'+(c===cur?' sel':'');
    sw.style.background = c;
    if(c==='#ffffff') sw.style.border='2px solid #ddd';
    sw.onclick=()=>{ applyColor(c); palette.classList.remove('show'); };
    palette.appendChild(sw);
  });
  const btn = e.target.closest('button');
  const r = btn.getBoundingClientRect();
  palette.style.top = (r.bottom+4)+'px';
  palette.style.left = r.left+'px';
  palette.classList.toggle('show');
  e.stopPropagation();
}

function applyColor(c){
  if(paletteMode==='text'){
    textColor=c;
    document.getElementById('textColorBar').style.background=c;
    document.execCommand('foreColor',false,c);
  } else {
    hlColor=c;
    document.getElementById('hlColorBar').style.background=c;
    document.execCommand('hiliteColor',false,c);
  }
  editor.focus();
}

document.addEventListener('click',e=>{
  if(!palette.contains(e.target)&&!e.target.closest('.tb-color-btn')) palette.classList.remove('show');
});

// ── INSERTS ────────────────────────────────────
function insertLink(){
  const url = prompt('Enter URL:','https://');
  if(url) fmt('createLink',url);
}
function insertImageURL(){
 const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.onchange = () => {
    const file = input.files[0];
    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(e){
      const img = document.createElement('img');
      img.src = e.target.result;

      // Optional styling
      img.style.maxWidth = '100%';
      img.style.display = 'block';
      img.style.margin = '8px 0';

      // Insert at cursor
      const sel = window.getSelection();
      if(sel.rangeCount){
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);

        // move cursor after image
        range.setStartAfter(img);
        range.setEndAfter(img);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editor.appendChild(img);
      }

      updateStats();
    };

    reader.readAsDataURL(file); // 🔥 converts to base64
  };

  input.click();
}
function insertHR(){ fmt('insertHorizontalRule'); }
function insertPageBreak(){
  fmt('insertHTML','<div style="page-break-after:always;border-top:2px dashed #ccc;margin:2em 0;padding-top:1em;color:#999;font-size:12px;text-align:center;font-family:sans-serif">— Page Break —</div>');
}
function insertDate(){
  const d = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  fmt('insertText',d);
}
function insertTable(){
  const rows = parseInt(prompt('Number of rows:','3'))||3;
  const cols = parseInt(prompt('Number of columns:','3'))||3;
  let html='<table>';
  html+='<tr>'+Array.from({length:cols},(_,i)=>`<th>Header ${i+1}</th>`).join('')+'</tr>';
  for(let r=1;r<rows;r++) html+='<tr>'+Array.from({length:cols},()=>'<td>Cell</td>').join('')+'</tr>';
  html+='</table>';
  fmt('insertHTML',html);
}

// ── ZOOM ───────────────────────────────────────
function setZoom(v){
  zoomLevel=v;
  const pw = document.getElementById('pageWrap');
  pw.style.transform=`scale(${v})`;
  pw.style.transformOrigin='top center';
  document.getElementById('editor-area').style.paddingBottom = v>1?(300*v)+'px':'80px';
  document.getElementById('zoomSelect').value=v;
}

// ── FIND ───────────────────────────────────────
function toggleFind(){
  const fb=document.getElementById('findBar');
  fb.classList.toggle('show');
  if(fb.classList.contains('show')) document.getElementById('findInput').focus();
  else{ clearHighlights(); findMatches=[]; }
}

function clearHighlights(){
  editor.querySelectorAll('mark.find-hl').forEach(m=>{
    m.replaceWith(document.createTextNode(m.textContent));
  });
  editor.normalize();
}

function doFind(q){
  clearHighlights();
  findMatches=[];
  findPos=0;
  if(!q.trim()){ document.getElementById('findCount').textContent=''; return; }
  const walk=(node)=>{
    if(node.nodeType===3){
      const idx=node.textContent.toLowerCase().indexOf(q.toLowerCase());
      if(idx>=0){
        const range=document.createRange();
        range.setStart(node,idx);
        range.setEnd(node,idx+q.length);
        const mark=document.createElement('mark');
        mark.className='find-hl';
        mark.style.cssText='background:#fef08a;border-radius:2px';
        range.surroundContents(mark);
        findMatches.push(mark);
        walk(mark.nextSibling||mark.parentNode.nextSibling);
        return;
      }
    } else {
      node.childNodes.forEach(walk);
    }
  };
  walk(editor);
  document.getElementById('findCount').textContent = findMatches.length?`${1}/${findMatches.length}`:'0';
  if(findMatches.length) highlightCurrent();
}

function highlightCurrent(){
  findMatches.forEach((m,i)=>m.style.background=i===findPos?'#ff9632':'#fef08a');
  if(findMatches[findPos]) findMatches[findPos].scrollIntoView({block:'center'});
  document.getElementById('findCount').textContent=`${findPos+1}/${findMatches.length}`;
}

function findStep(dir){
  if(!findMatches.length) return;
  findPos=(findPos+dir+findMatches.length)%findMatches.length;
  highlightCurrent();
}

// ── STATS ──────────────────────────────────────
function updateStats(){
  const text = editor.innerText||'';
  const words = text.trim()?text.trim().split(/\s+/).filter(Boolean).length:0;
  const chars = text.length;
  const paras = editor.querySelectorAll('p,h1,h2,h3,h4,pre,blockquote,li').length || Math.max(1,text.split(/\n+/).filter(Boolean).length);
  document.getElementById('wordcount').textContent=words+' words';
  document.getElementById('sbWords').textContent='Words: '+words;
  document.getElementById('sbChars').textContent='Chars: '+chars;
  document.getElementById('sbParas').textContent='Paragraphs: '+paras;
  markDirty();
}

function markDirty(){
  document.getElementById('sbSaved').textContent='● Unsaved';
  clearTimeout(autoTimer);
  autoTimer=setTimeout(autoSave,3000);
}

function autoSave(){
  try{
    localStorage.setItem('doceditor_content',editor.innerHTML);
    localStorage.setItem('doceditor_title',document.getElementById('doc-title').value);
    document.getElementById('sbSaved').textContent='✓ Auto-saved';
  }catch(e){}
}

// ── SELECTION STATUS ───────────────────────────
document.addEventListener('selectionchange',()=>{
  const sel=window.getSelection();
  if(sel&&!sel.isCollapsed){
    document.getElementById('sbSel').textContent='Selected: '+sel.toString().length+' chars';
  } else {
    document.getElementById('sbSel').textContent='No selection';
  }
  updateState();
});

// ── EXPORT ────────────────────────────────────
function exportHTML(){
  const title=document.getElementById('doc-title').value||'document';
  const html=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Sora:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  body{font-family:'Crimson Pro',serif;max-width:800px;margin:60px auto;padding:40px;font-size:16px;line-height:1.8;color:#1a1a1a;background:#fff}
  h1,h2,h3,h4{font-family:'Sora',sans-serif}
  h1{font-size:30px;font-weight:600;margin:1.4em 0 .5em}
  h2{font-size:24px;font-weight:600;margin:1.3em 0 .4em}
  h3{font-size:19px;font-weight:500;margin:1.2em 0 .35em}
  h4{font-size:14px;font-weight:600;margin:1em 0 .3em;text-transform:uppercase;letter-spacing:.08em;color:#6b6b6b}
  blockquote{border-left:3px solid #2563eb;margin:1.2em 0;padding:.6em 1.2em;color:#555;font-style:italic;background:#eff6ff;border-radius:0 6px 6px 0}
  table{border-collapse:collapse;width:100%;margin:1em 0;font-family:'Sora',sans-serif;font-size:15px}
  td,th{border:1px solid #e2ddd8;padding:8px 14px}
  th{background:#f5f3f0;font-weight:600;font-size:13px}
  code{font-family:'JetBrains Mono',monospace;font-size:.85em;background:#f5f3f0;padding:2px 6px;border-radius:3px}
  pre{background:#1e1c1a;color:#f0ede8;border-radius:6px;padding:1.2em;font-family:'JetBrains Mono',monospace;font-size:13px;overflow-x:auto;line-height:1.6}
  hr{border:none;border-top:2px solid #e2ddd8;margin:1.8em 0}
  a{color:#2563eb}
  img{max-width:100%;border-radius:4px}
  @media print{body{margin:0;padding:20px}}
</style>
</head>
<body>
${editor.innerHTML}
</body>
</html>`;
  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=title.replace(/\s+/g,'-')+'.html';
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById('sbSaved').textContent='✓ Exported';
}
function exportDocx(){
  const { Document, Packer, Paragraph, TextRun } = window.docx;

  const text = editor.innerText;

  const doc = new Document({
    sections: [{
      children: text.split("\n").map(line =>
        new Paragraph({
          children: [new TextRun(line)]
        })
      )
    }]
  });

  Packer.toBlob(doc).then(blob => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "document.docx";
    a.click();
  });
}
function exportTxt(){
  const title=document.getElementById('doc-title').value||'document';
  const blob=new Blob([editor.innerText||''],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=title.replace(/\s+/g,'-')+'.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

function newDoc(){
  if((editor.innerText||'').trim()&&!confirm('Start a new document? Unsaved changes will be lost.')) return;
  editor.innerHTML='';
  document.getElementById('doc-title').value='Untitled Document';
  updateStats();
  editor.focus();
}

function printDoc(){
  window.print();
}

// ── KEYBOARD SHORTCUTS ─────────────────────────
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();toggleFind();}
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();autoSave();document.getElementById('sbSaved').textContent='✓ Saved';}
  if((e.ctrlKey||e.metaKey)&&e.key==='p'){e.preventDefault();printDoc();}
  if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();newDoc();}
  if(e.key==='Escape') document.getElementById('findBar').classList.remove('show');
  if(e.key==='F3'){ e.preventDefault(); findStep(e.shiftKey?-1:1); }
});

// ── LOAD SAVED ─────────────────────────────────
(function loadSaved(){
  try{
    const c=localStorage.getItem('doceditor_content');
    const t=localStorage.getItem('doceditor_title');
    if(c){ editor.innerHTML=c; }
    if(t){ document.getElementById('doc-title').value=t; }
  }catch(e){}
  updateStats();
  editor.focus();
})();

editor.addEventListener('input',updateStats);
document.getElementById('doc-title').addEventListener('input',markDirty);
