(()=>{
'use strict';

// Error banner
const errBox = document.getElementById('errBox');
window.addEventListener('error', (e)=>{
  try{
    errBox.style.display='block';
    errBox.innerHTML = '<b>Script error:</b> ' + (e.message || 'Unknown') + (e.filename ? ('<br>' + e.filename + ':' + e.lineno) : '');
  }catch(_e){}
});

// Safe storage
const store = (()=>{
  const mem = {};
  let ok=false;
  try{
    const k='__chess_test__';
    localStorage.setItem(k,'1');
    localStorage.removeItem(k);
    ok=true;
  }catch(e){ ok=false; }
  return {
    get:(k)=>{ try{ return ok?localStorage.getItem(k):(Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null);}catch(e){return Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null;} },
    set:(k,v)=>{ try{ if(ok) localStorage.setItem(k,String(v)); else mem[k]=String(v);}catch(e){ mem[k]=String(v);} }
  };
})();

async function copyText(txt){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(txt);
      notice('Copied to clipboard.');
    } else throw new Error('no clipboard');
  } catch(e){
    prompt('Copy to clipboard:', txt);
  }
}

// DOM
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const historyEl = document.getElementById('history');
const thinkingEl = document.getElementById('thinking');
const noticeEl = document.getElementById('notice');
const stopBtn = document.getElementById('stopBtn');

const promoOverlay = document.getElementById('promoOverlay');
const promoBtns = Array.from(document.querySelectorAll('.promoBtn'));
const promoQ = document.getElementById('promoQ');
const promoR = document.getElementById('promoR');
const promoB = document.getElementById('promoB');
const promoN = document.getElementById('promoN');

const vsCompEl = document.getElementById('vsComp');
const humanSideEl = document.getElementById('humanSide');
const searchModeEl = document.getElementById('searchMode');
const thinkTimeEl = document.getElementById('thinkTime');
const depthEl = document.getElementById('depth');
const timeWrap = document.getElementById('timeWrap');
const depthWrap = document.getElementById('depthWrap');

const boardSizeEl = document.getElementById('boardSize');
const focusModeEl = document.getElementById('focusMode');
const showHintsEl = document.getElementById('showHints');
const showOverlaysEl = document.getElementById('showOverlays');
const showBadgesEl = document.getElementById('showBadges');
const useBookEl = document.getElementById('useBook');

const evalLabel = document.getElementById('evalLabel');
const evalMarker = document.getElementById('evalMarker');

const fenBox = document.getElementById('fenBox');
const getFenBtn = document.getElementById('getFenBtn');
const copyFenBtn = document.getElementById('copyFenBtn');
const loadFenBtn = document.getElementById('loadFenBtn');

const hintBtn = document.getElementById('hintBtn');
const clearHintBtn = document.getElementById('clearHintBtn');

// Buttons
const newBtn = document.getElementById('newBtn');
const flipBtn = document.getElementById('flipBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

newBtn.addEventListener('click', startNewGame);
flipBtn.addEventListener('click', ()=>{ orientation = (orientation==='white')?'black':'white'; render(); });
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
stopBtn.addEventListener('click', stopSearch);

searchModeEl.addEventListener('change', ()=>{
  if(searchModeEl.value==='time'){ timeWrap.style.display='inline-flex'; depthWrap.style.display='none'; }
  else { timeWrap.style.display='none'; depthWrap.style.display='inline-flex'; }
});

function notice(msg){ noticeEl.textContent=msg; noticeEl.style.display = msg?'block':'none'; }

// UI persistence
function setSq(px){
  px = Math.max(56, Math.min(140, px|0));
  document.documentElement.style.setProperty('--sq', px+'px');
  store.set('chess_board_sq', String(px));
}
(function initUi(){
  const getBool=(k,d)=>{ const v=store.get(k); if(v==null) return d; return v==='1'; };
  const savedSq=store.get('chess_board_sq');
  const sq = savedSq?parseInt(savedSq,10):parseInt(boardSizeEl.value,10);
  boardSizeEl.value=sq; setSq(sq);
  boardSizeEl.addEventListener('input', ()=>{ setSq(parseInt(boardSizeEl.value,10)); render(); });

  showHintsEl.checked=getBool('chess_show_hints', true);
  showOverlaysEl.checked=getBool('chess_show_overlays', true);
  showBadgesEl.checked=getBool('chess_show_badges', true);
  focusModeEl.checked=getBool('chess_focus_mode', false);
  useBookEl.checked=getBool('chess_use_book', true);

  document.body.classList.toggle('focus', focusModeEl.checked);

  const saveToggles=()=>{
    store.set('chess_show_hints', showHintsEl.checked?'1':'0');
    store.set('chess_show_overlays', showOverlaysEl.checked?'1':'0');
    store.set('chess_show_badges', showBadgesEl.checked?'1':'0');
    render();
  };
  showHintsEl.addEventListener('change', saveToggles);
  showOverlaysEl.addEventListener('change', saveToggles);
  showBadgesEl.addEventListener('change', saveToggles);

  focusModeEl.addEventListener('change', ()=>{
    store.set('chess_focus_mode', focusModeEl.checked?'1':'0');
    document.body.classList.toggle('focus', focusModeEl.checked);
    render();
  });

  useBookEl.addEventListener('change', ()=> store.set('chess_use_book', useBookEl.checked?'1':'0'));
})();

// Game state
const pieceGlyph = { r:'♜', n:'♞', b:'♝', q:'♛', k:'♚', p:'♟', R:'♖', N:'♘', B:'♗', Q:'♕', K:'♔', P:'♙' };
const pieceFallback = { r:'r', n:'n', b:'b', q:'q', k:'k', p:'p', R:'R', N:'N', B:'B', Q:'Q', K:'K', P:'P' };
const isWhite = p => p===p.toUpperCase();
const cap = s => s[0].toUpperCase()+s.slice(1);

let board, turn, selected, enPassant, castling, undoStack, redoStack, moveList, gameOver;
let orientation='white';
let lastMove=null;
let hintMove=null;
let halfmoveClock=0, fullmoveNumber=1;
let timeline=[], currentPly=0;

// Promotion UI
let promotionCallback=null;
function showPromotionPicker(color, cb){
  promoQ.textContent = color==='white'?'♕':'♛';
  promoR.textContent = color==='white'?'♖':'♜';
  promoB.textContent = color==='white'?'♗':'♝';
  promoN.textContent = color==='white'?'♘':'♞';
  promotionCallback=cb;
  promoOverlay.style.display='flex';
}
function hidePromotionPicker(){ promoOverlay.style.display='none'; promotionCallback=null; }
promoBtns.forEach(btn=>btn.addEventListener('click', ()=>{
  if(!promotionCallback) return;
  const choice = btn.getAttribute('data-piece');
  const cb=promotionCallback;
  hidePromotionPicker();
  cb(choice);
}));

function initialBoard(){
  return [ 'rnbqkbnr','pppppppp','........','........','........','........','PPPPPPPP','RNBQKBNR' ].map(r=>r.split(''));
}

function resetState(){
  board=initialBoard();
  turn='white';
  selected=null;
  enPassant=null;
  castling={WK:true,WQ:true,BK:true,BQ:true};
  undoStack=[]; redoStack=[];
  moveList=[];
  gameOver=false;
  lastMove=null;
  hintMove=null;
  halfmoveClock=0;
  fullmoveNumber=1;
  timeline=[]; currentPly=0;
}

function snapshot(){
  return {
    board: board.map(r=>r.slice()),
    turn,
    enPassant: enPassant?{r:enPassant.r,c:enPassant.c}:null,
    castling: {...castling},
    moveList: moveList.slice(),
    gameOver,
    lastMove: lastMove?{...lastMove}:null,
    hintMove: hintMove?{...hintMove}:null,
    halfmoveClock,
    fullmoveNumber,
    orientation
  };
}
function restore(s){
  board=s.board.map(r=>r.slice());
  turn=s.turn;
  enPassant=s.enPassant;
  castling=s.castling;
  moveList=s.moveList;
  gameOver=s.gameOver;
  lastMove=s.lastMove;
  hintMove=s.hintMove;
  halfmoveClock=s.halfmoveClock;
  fullmoveNumber=s.fullmoveNumber;
  orientation=s.orientation||orientation;
}

function startNewGame(){
  stopSearch();
  resetState();
  orientation = humanSideEl.value;
  notice('');
  timeline=[snapshot()];
  currentPly=0;
  redrawHistory();
  render();
  updateStatus();
  updateEval();
  updateFenBox();
  maybeAiMove();
}

// FEN
function boardToFen(){
  const ranks=[];
  for(let r=0;r<8;r++){
    let row='', empt=0;
    for(let c=0;c<8;c++){
      const p=board[r][c];
      if(p==='.') empt++;
      else { if(empt){ row+=empt; empt=0; } row+=p; }
    }
    if(empt) row+=empt;
    ranks.push(row);
  }
  const side = (turn==='white')?'w':'b';
  let rights = (castling.WK?'K':'')+(castling.WQ?'Q':'')+(castling.BK?'k':'')+(castling.BQ?'q':'');
  if(!rights) rights='-';
  const ep = enPassant ? (String.fromCharCode(97+enPassant.c)+(8-enPassant.r)) : '-';
  return `${ranks.join('/')} ${side} ${rights} ${ep} ${halfmoveClock} ${fullmoveNumber}`;
}
function fenToState(fen){
  const parts = fen.trim().split(/\s+/);
  if(parts.length<4) throw new Error('FEN must have at least 4 fields.');
  const rows=parts[0].split('/');
  if(rows.length!==8) throw new Error('FEN board must have 8 ranks.');
  const b=[];
  for(const row of rows){
    const arr=[];
    for(const ch of row){
      if(ch>='1'&&ch<='8'){ for(let i=0;i<(ch.charCodeAt(0)-48);i++) arr.push('.'); }
      else if('prnbqkPRNBQK'.includes(ch)) arr.push(ch);
      else throw new Error('Invalid FEN char: '+ch);
    }
    if(arr.length!==8) throw new Error('Each rank must expand to 8 files.');
    b.push(arr);
  }
  const side = parts[1]==='b'?'black':'white';
  const rightsStr = parts[2];
  const rights={WK:false,WQ:false,BK:false,BQ:false};
  if(rightsStr!=='-'){
    rights.WK=rightsStr.includes('K');
    rights.WQ=rightsStr.includes('Q');
    rights.BK=rightsStr.includes('k');
    rights.BQ=rightsStr.includes('q');
  }
  let ep=null;
  const epStr=parts[3];
  if(epStr && epStr!=='-'){
    const file=epStr.charCodeAt(0)-97;
    const rank=8-parseInt(epStr[1],10);
    ep={r:rank,c:file};
  }
  const hm = parts[4]?Math.max(0, parseInt(parts[4],10)||0):0;
  const fm = parts[5]?Math.max(1, parseInt(parts[5],10)||1):1;
  return {b, side, rights, ep, hm, fm};
}
function updateFenBox(){ fenBox.value = boardToFen(); }
getFenBtn.addEventListener('click', updateFenBox);
copyFenBtn.addEventListener('click', ()=> copyText(boardToFen()));
loadFenBtn.addEventListener('click', ()=>{
  try{
    stopSearch();
    const st=fenToState(fenBox.value);
    resetState();
    board=st.b;
    turn=st.side;
    castling=st.rights;
    enPassant=st.ep;
    halfmoveClock=st.hm;
    fullmoveNumber=st.fm;
    moveList=[]; undoStack=[]; redoStack=[]; lastMove=null; hintMove=null; gameOver=false;
    timeline=[snapshot()]; currentPly=0;
    notice('Loaded FEN.');
    redrawHistory(); render(); updateStatus(); updateEval(); updateFenBox(); maybeAiMove();
  }catch(err){ notice('FEN error: '+err.message); }
});

// Move generation helpers
function pathClear(sr,sc,er,ec){
  let r=sr+Math.sign(er-sr), c=sc+Math.sign(ec-sc);
  while(r!==er||c!==ec){ if(board[r][c]!=='.') return false; r+=Math.sign(er-sr); c+=Math.sign(ec-sc); }
  return true;
}
function attacks(sr,sc,er,ec){
  if(sr===er&&sc===ec) return false;
  const p=board[sr][sc]; if(p==='.') return false;
  const dr=er-sr, dc=ec-sc;
  switch(p.toLowerCase()){
    case 'p':{ const d=isWhite(p)?-1:1; return dr===d && Math.abs(dc)===1; }
    case 'n': return Math.abs(dr*dc)===2;
    case 'b': return Math.abs(dr)===Math.abs(dc) && pathClear(sr,sc,er,ec);
    case 'r': return (dr===0||dc===0) && pathClear(sr,sc,er,ec);
    case 'q': return (dr===0||dc===0||Math.abs(dr)===Math.abs(dc)) && pathClear(sr,sc,er,ec);
    case 'k': return Math.abs(dr)<=1 && Math.abs(dc)<=1;
  }
  return false;
}
function isSquareAttackedBy(r,c,byColor){
  for(let i=0;i<8;i++) for(let j=0;j<8;j++){
    const p=board[i][j]; if(p==='.') continue;
    if((isWhite(p)?'white':'black')===byColor && attacks(i,j,r,c)) return true;
  }
  return false;
}
function findKing(color){
  const t=color==='white'?'K':'k';
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===t) return {r,c};
  return null;
}
function isKingInCheck(color){
  const k=findKing(color); if(!k) return false;
  return isSquareAttackedBy(k.r,k.c,color==='white'?'black':'white');
}

function doMove(sr,sc,er,ec,record, opts={}){
  const simulate=!!opts.simulate;
  const p=board[sr][sc];
  const wasCapture = (board[er][ec] !== '.') || (p.toLowerCase()==='p' && enPassant && er===enPassant.r && ec===enPassant.c);

  // castling rook move
  if(p.toLowerCase()==='k' && Math.abs(ec-sc)===2){
    if(ec===6){ board[sr][5]=board[sr][7]; board[sr][7]='.'; }
    else { board[sr][3]=board[sr][0]; board[sr][0]='.'; }
  }
  // en-passant capture removal
  if(p.toLowerCase()==='p' && enPassant && er===enPassant.r && ec===enPassant.c){
    board[sr][ec]='.';
  }

  const captured=board[er][ec];
  board[er][ec]=p;
  board[sr][sc]='.';

  // promotion
  if(p.toLowerCase()==='p' && (er===0||er===7)){
    const choice = (opts.promo||'Q').toUpperCase();
    board[er][ec]= isWhite(p)?choice:choice.toLowerCase();
  }

  // update enPassant
  enPassant=null;
  if(p.toLowerCase()==='p' && Math.abs(er-sr)===2) enPassant={r:(sr+er)/2,c:sc};

  // castling rights
  if(p==='K'){ castling.WK=false; castling.WQ=false; }
  if(p==='k'){ castling.BK=false; castling.BQ=false; }
  if(p==='R' && sr===7 && sc===0) castling.WQ=false;
  if(p==='R' && sr===7 && sc===7) castling.WK=false;
  if(p==='r' && sr===0 && sc===0) castling.BQ=false;
  if(p==='r' && sr===0 && sc===7) castling.BK=false;
  if(captured==='R' && er===7 && ec===0) castling.WQ=false;
  if(captured==='R' && er===7 && ec===7) castling.WK=false;
  if(captured==='r' && er===0 && ec===0) castling.BQ=false;
  if(captured==='r' && er===0 && ec===7) castling.BK=false;

  lastMove={sr,sc,er,ec};
  if(!simulate) hintMove=null;

  if(p.toLowerCase()==='p' || wasCapture) halfmoveClock=0;
  else halfmoveClock++;

  if(record){
    // simple notation
    const promoSuffix = (p.toLowerCase()==='p' && (er===0||er===7)) ? ('='+(opts.promo||'Q').toUpperCase()) : '';
    moveList.push(p.toUpperCase()+String.fromCharCode(97+ec)+(8-er)+promoSuffix);
  }
}

function validMove(sr,sc,er,ec,checkTest){
  const p=board[sr][sc]; if(p==='.') return false;
  const t=board[er][ec]; if(t!=='.' && isWhite(p)===isWhite(t)) return false;
  const dr=er-sr, dc=ec-sc;

  switch(p.toLowerCase()){
    case 'p':{
      const d=isWhite(p)?-1:1;
      if(dc===0 && dr===d && t==='.') break;
      if(dc===0 && dr===2*d && t==='.' && ((sr===6&&d===-1)||(sr===1&&d===1)) && board[sr+d][sc]==='.') break;
      if(Math.abs(dc)===1 && dr===d && (t!=='.' || (enPassant && er===enPassant.r && ec===enPassant.c))) break;
      return false;
    }
    case 'n': if(Math.abs(dr*dc)!==2) return false; break;
    case 'b': if(Math.abs(dr)!==Math.abs(dc) || !pathClear(sr,sc,er,ec)) return false; break;
    case 'r': if(!(dr===0||dc===0) || !pathClear(sr,sc,er,ec)) return false; break;
    case 'q': if(!(dr===0||dc===0||Math.abs(dr)===Math.abs(dc)) || !pathClear(sr,sc,er,ec)) return false; break;
    case 'k':{
      if(Math.abs(dc)===2 && dr===0){
        const side = dc>0?'K':'Q';
        const rights = isWhite(p) ? (side==='K'?castling.WK:castling.WQ) : (side==='K'?castling.BK:castling.BQ);
        const rookCol = (side==='K')?7:0;
        const step = dc>0?1:-1;
        if(!rights) return false;
        if(board[sr][rookCol].toLowerCase()!=='r') return false;
        for(let c2=sc+step;c2!==rookCol;c2+=step) if(board[sr][c2]!=='.') return false;
        const enemy=isWhite(p)?'black':'white';
        if(isSquareAttackedBy(sr,sc,enemy)) return false;
        if(isSquareAttackedBy(sr,sc+step,enemy)) return false;
        if(isSquareAttackedBy(er,ec,enemy)) return false;
        break;
      }
      if(Math.abs(dr)>1||Math.abs(dc)>1) return false;
      break;
    }
  }

  if(checkTest){
    const save=snapshot();
    doMove(sr,sc,er,ec,false,{simulate:true});
    const bad=isKingInCheck(isWhite(p)?'white':'black');
    restore(save);
    return !bad;
  }
  return true;
}

function hasMove(color){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p==='.' || (isWhite(p)?'white':'black')!==color) continue;
    for(let er=0;er<8;er++) for(let ec=0;ec<8;ec++) if(validMove(r,c,er,ec,true)) return true;
  }
  return false;
}

function squareIsDangerous(sr,sc,er,ec){
  const save=snapshot();
  doMove(sr,sc,er,ec,false,{simulate:true});
  const color=isWhite(save.board[sr][sc])?'white':'black';
  const enemy=color==='white'?'black':'white';
  const danger=isSquareAttackedBy(er,ec,enemy);
  restore(save);
  return danger;
}

function pushUndo(){ undoStack.push(snapshot()); redoStack=[]; }

function applyMove(sr,sc,er,ec,promoChoice){
  if(currentPly < timeline.length-1){
    timeline = timeline.slice(0, currentPly+1);
    moveList = moveList.slice(0, currentPly);
    notice('Timeline truncated (branched).');
  }
  pushUndo();
  doMove(sr,sc,er,ec,true, promoChoice?{promo:promoChoice}:undefined);
  turn = (turn==='white')?'black':'white';
  if(turn==='white') fullmoveNumber++;
  selected=null;
  timeline.push(snapshot());
  currentPly=timeline.length-1;
  redrawHistory();
  updateStatus();
  render();
  updateEval();
  updateFenBox();
  maybeAiMove();
}

function undo(){
  if(!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  selected=null;
  currentPly=moveList.length;
  render(); updateStatus(); updateEval(); redrawHistory(); updateFenBox();
}

function redo(){
  if(!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  selected=null;
  currentPly=moveList.length;
  render(); updateStatus(); updateEval(); redrawHistory(); updateFenBox();
}

function gotoPly(ply){
  ply=Math.max(0, Math.min(timeline.length-1, ply|0));
  restore(timeline[ply]);
  currentPly=ply;
  selected=null;
  stopSearch();
  render(); updateStatus(); updateEval(); redrawHistory(); updateFenBox();
}

function redrawHistory(){
  historyEl.innerHTML='';
  for(let i=0;i<moveList.length;i+=2){
    const n=(i/2)+1;
    const w=moveList[i]||'';
    const b=moveList[i+1]||'';
    const line=document.createElement('div'); line.className='histLine';
    const num=document.createElement('div'); num.className='histNum'; num.textContent=n+'.';
    line.appendChild(num);
    const wEl=document.createElement('div'); wEl.className='histMove'; wEl.textContent=w; wEl.addEventListener('click', ()=>gotoPly(i+1));
    if(i+1===currentPly) wEl.classList.add('active');
    line.appendChild(wEl);
    if(b){
      const bEl=document.createElement('div'); bEl.className='histMove'; bEl.textContent=b; bEl.addEventListener('click', ()=>gotoPly(i+2));
      if(i+2===currentPly) bEl.classList.add('active');
      line.appendChild(bEl);
    }
    historyEl.appendChild(line);
  }
  historyEl.scrollTop=historyEl.scrollHeight;
}

// ✅ Stalemate detection (Option C)
function updateStatus(){
  const inCheck = isKingInCheck(turn);
  const canMove = hasMove(turn);

  if(inCheck){
    if(!canMove){
      statusEl.textContent = 'Checkmate — ' + (turn==='white'?'Black':'White') + ' wins';
      gameOver = true;
      return;
    }
    statusEl.textContent = 'Turn: ' + cap(turn) + ' (Check)';
    return;
  }

  if(!canMove){
    statusEl.textContent = 'Draw — Stalemate';
    gameOver = true;
    return;
  }

  statusEl.textContent = 'Turn: ' + cap(turn);
}

// Eval
const VAL_UI={p:100,n:320,b:330,r:500,q:900,k:0};
function quickEvalCp(){
  let s=0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c]; if(p==='.') continue;
    const v=VAL_UI[p.toLowerCase()]||0;
    s += isWhite(p)?v:-v;
  }
  return s;
}
function updateEval(){
  const cp=quickEvalCp();
  evalLabel.textContent=(cp/100).toFixed(2);
  const sat=Math.max(-1000, Math.min(1000, cp));
  const pct=50+sat/20;
  evalMarker.style.left=Math.max(0, Math.min(100, pct))+'%';
}

// Render
function render(){
  boardEl.innerHTML='';
  const rows = orientation==='white' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const cols = orientation==='white' ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const checkSq = isKingInCheck(turn) ? findKing(turn) : null;

  for(const r of rows){
    for(const c of cols){
      const sq=document.createElement('div');
      sq.className='square '+((r+c)%2?'dark':'light');

      const p=board[r][c];
      const span=document.createElement('span');
      span.className='piece';
      span.textContent = pieceGlyph[p] || pieceFallback[p] || '';
      sq.appendChild(span);

      sq.addEventListener('click', (ev)=>{ ev.preventDefault(); ev.stopPropagation(); handleSquareClick(r,c); });

      if(lastMove){
        if(r===lastMove.sr && c===lastMove.sc) sq.classList.add('lastFrom');
        if(r===lastMove.er && c===lastMove.ec) sq.classList.add('lastTo');
      }
      if(hintMove){
        if(r===hintMove.sr && c===hintMove.sc) sq.classList.add('hintFrom');
        if(r===hintMove.er && c===hintMove.ec) sq.classList.add('hintTo');
      }
      if(checkSq && r===checkSq.r && c===checkSq.c) sq.classList.add('inCheck');

      if(p!=='.' && showOverlaysEl.checked){
        const {atk,def}=countAttackersDefenders(r,c);
        if(atk>0){ if(def>0) sq.classList.add('guarded'); else sq.classList.add('threat'); }
        if(showBadgesEl.checked && (atk>0||def>0)){
          const badge=document.createElement('div'); badge.className='badge';
          if(atk>0){ const a=document.createElement('span'); a.className='atk'; a.textContent=String(atk); badge.appendChild(a);} 
          if(def>0){ const d=document.createElement('span'); d.className='def'; d.textContent=String(def); badge.appendChild(d);} 
          sq.appendChild(badge);
        }
      }

      if(selected){
        if(r===selected.r && c===selected.c) sq.classList.add('selected');
        else if(showHintsEl.checked && validMove(selected.r,selected.c,r,c,true)){
          if(board[r][c]!=='.' || (enPassant && r===enPassant.r && c===enPassant.c)) sq.classList.add('capture');
          else if(squareIsDangerous(selected.r,selected.c,r,c)) sq.classList.add('danger');
          else sq.classList.add('move');
        }
      }

      boardEl.appendChild(sq);
    }
  }
}

function countAttackersDefenders(r,c){
  const p=board[r][c];
  if(p==='.') return {atk:0,def:0};
  const color=isWhite(p)?'white':'black';
  let atk=0,def=0;
  for(let i=0;i<8;i++) for(let j=0;j<8;j++){
    const q=board[i][j]; if(q==='.') continue;
    const qc=isWhite(q)?'white':'black';
    if(attacks(i,j,r,c)){
      if(qc!==color) atk++;
      else if(!(i===r && j===c)) def++;
    }
  }
  return {atk,def};
}

function handleSquareClick(r,c){
  if(gameOver) return;
  if(promoOverlay.style.display==='flex') return;

  if(vsCompEl.checked){
    const human=humanSideEl.value;
    if(turn!==human) return;
  }

  const p=board[r][c];

  if(selected){
    if(validMove(selected.r,selected.c,r,c,true)){
      stopSearch();
      const moving=board[selected.r][selected.c];
      const isPromo=(moving.toLowerCase()==='p' && (r===0||r===7));
      if(isPromo){
        const color=isWhite(moving)?'white':'black';
        const sr=selected.r, sc=selected.c, er=r, ec=c;
        selected=null; render();
        showPromotionPicker(color, (choice)=> applyMove(sr,sc,er,ec,choice));
        return;
      }
      applyMove(selected.r,selected.c,r,c);
      return;
    }
    selected=null; render();
    return;
  }

  if(p!=='.' && (isWhite(p)?'white':'black')===turn){
    selected={r,c};
    render();
  }
}

// Opening book
const BOOK_LINES=[
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6',
  'd2d4 d7d5 c2c4 e7e6 b1c3',
  'c2c4 e7e5 b1c3 g8f6 g2g3'
];
function algToRC(alg){ return {c:alg.charCodeAt(0)-97, r:8-parseInt(alg[1],10)}; }
function uciToMove(uci){ const a=algToRC(uci.slice(0,2)); const b=algToRC(uci.slice(2,4)); return {sr:a.r,sc:a.c,er:b.r,ec:b.c}; }
let OPENING_BOOK=null;
function positionKey(){
  const ranks=[];
  for(let r=0;r<8;r++){
    let row='',empt=0;
    for(let c=0;c<8;c++){
      const p=board[r][c];
      if(p==='.') empt++;
      else { if(empt){ row+=empt; empt=0; } row+=p; }
    }
    if(empt) row+=empt;
    ranks.push(row);
  }
  const side=(turn==='white')?'w':'b';
  let rights=(castling.WK?'K':'')+(castling.WQ?'Q':'')+(castling.BK?'k':'')+(castling.BQ?'q':'');
  if(!rights) rights='-';
  const ep=enPassant?(String.fromCharCode(97+enPassant.c)+(8-enPassant.r)):'-';
  return ranks.join('/')+' '+side+' '+rights+' '+ep;
}
function buildBook(){
  const map={};
  const add=(k,uci)=>{ if(!map[k]) map[k]=[]; const arr=map[k]; const f=arr.find(x=>x.uci===uci); if(f) f.w++; else arr.push({uci,w:1}); };
  const saved=snapshot();
  for(const line of BOOK_LINES){
    restore(saved);
    board=initialBoard(); turn='white'; enPassant=null; castling={WK:true,WQ:true,BK:true,BQ:true};
    halfmoveClock=0; fullmoveNumber=1; hintMove=null; lastMove=null; moveList=[];
    for(const uci of line.split(/\s+/)){
      add(positionKey(), uci);
      const m=uciToMove(uci);
      if(!validMove(m.sr,m.sc,m.er,m.ec,true)) break;
      doMove(m.sr,m.sc,m.er,m.ec,false,{simulate:true});
      turn = (turn==='white')?'black':'white';
      if(turn==='white') fullmoveNumber++;
    }
  }
  restore(saved);
  return map;
}
function pickFromBook(){
  if(!useBookEl.checked) return null;
  if(moveList.length>16) return null;
  if(!OPENING_BOOK) OPENING_BOOK=buildBook();
  const key=positionKey();
  const choices=OPENING_BOOK[key];
  if(!choices||!choices.length) return null;
  const legal=[]; let total=0;
  for(const ch of choices){
    const mv=uciToMove(ch.uci);
    if(validMove(mv.sr,mv.sc,mv.er,mv.ec,true)){ legal.push({mv,w:ch.w}); total+=ch.w; }
  }
  if(!legal.length) return null;
  let r=Math.random()*total;
  for(const it of legal){ r-=it.w; if(r<=0) return it.mv; }
  return legal[legal.length-1].mv;
}


// Worker engine (used for hint + AI)
// ===============================
// Stockfish 16 (single-threaded) — OFFLINE + Elo slider
// Required files next to index.html:
//   - stockfish-nnue-16-single.js
//   - stockfish-nnue-16-single.wasm
// Notes: UCI_Elo is commonly 1320–3190. Below 1320 we approximate with Skill Level.
// ===============================
const STOCKFISH_WORKER_URL = 'stockfish-nnue-16-single.js';

const strengthSliderEl  = document.getElementById('strengthSlider');
const strengthReadoutEl = document.getElementById('strengthReadout');
const strengthHelpEl    = document.getElementById('strengthHelp');
const strengthResetEl   = document.getElementById('strengthReset');

const UCI_ELO_MIN = 1320;
const UCI_ELO_MAX = 3190;
const DISPLAY_ELO_MIN = 400;

// Local square label helper (avoid dependency on other globals)
const sqLabel = (r,c)=> String.fromCharCode(97+c) + (8-r);

let stockfish=null;
let stockfishReady=false;
let sfQueue=[];
let pendingHintSF=false;
let awaitingAIMoveSF=false;
let sfSearching=false;
let sfFallbackTimer=null;

function sfStopSearch(){
  try{ if(stockfish) stockfish.postMessage('stop'); }catch(_e){}
  sfSearching=false;
  pendingHintSF=false;
  awaitingAIMoveSF=false;
  if(typeof thinkingEl!=='undefined' && thinkingEl) thinkingEl.style.display='none';
  if(typeof stopBtn!=='undefined' && stopBtn) stopBtn.style.display='none';
  if(sfFallbackTimer){ clearTimeout(sfFallbackTimer); sfFallbackTimer=null; }
}

function sfNoticeError(msg){
  notice('⚠️ Stockfish: '+msg);
  console.error('Stockfish:', msg);
}

function initStockfish(){
  if(stockfish) return;
  try{
    stockfish = new Worker(STOCKFISH_WORKER_URL);
  }catch(err){
    sfNoticeError('Cannot start engine worker. Ensure Stockfish files exist next to this page.');
    throw err;
  }

  stockfish.onerror = (e)=>{
    sfNoticeError((e && e.message) ? e.message : 'Worker error / engine failed to load.');
    sfStopSearch();
  };

  stockfish.onmessage = (e)=>{
    const line = (typeof e.data==='string') ? e.data : '';
    if(line==='uciok'){
      stockfish.postMessage('isready');
      return;
    }
    if(line==='readyok'){
      stockfishReady=true;
      for(const cmd of sfQueue) stockfish.postMessage(cmd);
      sfQueue=[];
      applyStrengthFromSlider();
      return;
    }
    if(line.startsWith('bestmove')){
      const uci=line.split(/\s+/)[1];
      handleStockfishBestmove(uci);
      return;
    }
  };

  stockfish.postMessage('uci');
}

function sfSend(cmd){
  initStockfish();
  if(stockfishReady) stockfish.postMessage(cmd);
  else sfQueue.push(cmd);
}

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

function setStrengthReadout(text){
  if(strengthReadoutEl) strengthReadoutEl.textContent = text;
}

function displayEloForRaw(raw){
  if(raw <= 0) return null;
  return clamp(raw, DISPLAY_ELO_MIN, UCI_ELO_MAX);
}

function skillFromDisplayElo(elo){
  const t = (clamp(elo, DISPLAY_ELO_MIN, UCI_ELO_MIN-1) - DISPLAY_ELO_MIN) / ((UCI_ELO_MIN-1) - DISPLAY_ELO_MIN);
  return clamp(Math.round(t * 20), 0, 20);
}

function updateStrengthReadoutOnly(){
  if(!strengthSliderEl) return;
  const raw = parseInt(strengthSliderEl.value, 10) || 0;
  if(raw <= 0){
    setStrengthReadout('Unlimited');
    return;
  }
  const elo = displayEloForRaw(raw);
  setStrengthReadout('Elo ' + elo);
}

function applyStrengthFromSlider(){
  if(!strengthSliderEl) return;
  const raw = parseInt(strengthSliderEl.value, 10) || 0;
  try{ store.set('chess_strength_slider', String(raw)); }catch(_e){}

  if(raw <= 0){
    setStrengthReadout('Unlimited');
    if(strengthHelpEl) strengthHelpEl.textContent = 'Unlimited: full strength (Time/Depth settings apply).';
    sfSend('setoption name UCI_LimitStrength value false');
    sfSend('setoption name Skill Level value 20');
    return;
  }

  const elo = displayEloForRaw(raw);
  setStrengthReadout('Elo ' + elo);

  if(elo < UCI_ELO_MIN){
    const skill = skillFromDisplayElo(elo);
    if(strengthHelpEl) strengthHelpEl.textContent = 'Approx Elo (uses Skill Level ' + skill + '/20 internally).';
    sfSend('setoption name UCI_LimitStrength value false');
    sfSend('setoption name Skill Level value ' + skill);
    return;
  }

  const target = clamp(elo, UCI_ELO_MIN, UCI_ELO_MAX);
  if(strengthHelpEl) strengthHelpEl.textContent = 'Elo limiter active.';
  sfSend('setoption name UCI_LimitStrength value true');
  sfSend('setoption name UCI_Elo value ' + target);
}

(function initStrengthUi(){
  if(!strengthSliderEl) return;
  try{
    const saved = store.get('chess_strength_slider');
    if(saved != null && saved !== '') strengthSliderEl.value = String(saved);
  }catch(_e){}

  updateStrengthReadoutOnly();
  strengthSliderEl.addEventListener('input', updateStrengthReadoutOnly);
  strengthSliderEl.addEventListener('change', applyStrengthFromSlider);
  if(strengthResetEl){
    strengthResetEl.addEventListener('click', ()=>{
      strengthSliderEl.value = '0';
      updateStrengthReadoutOnly();
      applyStrengthFromSlider();
    });
  }
})();

function stopSearch(){
  // Keep compatibility for other callers in the app.
  sfStopSearch();
}

function sendPositionToStockfish(){
  sfSend('ucinewgame');
  const fen=boardToFen();
  sfSend('position fen ' + fen);
}

function uciToAppMove(uci){
  const sc=uci.charCodeAt(0)-97;
  const sr=8-parseInt(uci[1],10);
  const ec=uci.charCodeAt(2)-97;
  const er=8-parseInt(uci[3],10);
  const promo = uci.length>4 ? uci[4].toUpperCase() : null;
  return {sr,sc,er,ec,promo};
}

function handleStockfishBestmove(uci){
  sfSearching=false;
  if(typeof thinkingEl!=='undefined' && thinkingEl) thinkingEl.style.display='none';
  if(typeof stopBtn!=='undefined' && stopBtn) stopBtn.style.display='none';
  if(sfFallbackTimer){ clearTimeout(sfFallbackTimer); sfFallbackTimer=null; }

  if(!uci || uci==='(none)'){
    notice('No legal moves.');
    return;
  }

  const m=uciToAppMove(uci);

  if(pendingHintSF){
    pendingHintSF=false;
    hintMove={sr:m.sr,sc:m.sc,er:m.er,ec:m.ec,source:'stockfish'};
    notice('✨ Hint (Stockfish): '+sqLabel(m.sr,m.sc)+' → '+sqLabel(m.er,m.ec));
    render();
    return;
  }

  if(awaitingAIMoveSF){
    awaitingAIMoveSF=false;
    applyMove(m.sr,m.sc,m.er,m.ec,m.promo);
  }
}

function requestStockfishBestMove({forHint=false}={}){
  if(gameOver) return;
  sfStopSearch();
  if(forHint) pendingHintSF=true; else awaitingAIMoveSF=true;

  sfSearching=true;
  if(typeof thinkingEl!=='undefined' && thinkingEl) thinkingEl.style.display='inline';
  if(typeof stopBtn!=='undefined' && stopBtn) stopBtn.style.display='inline';

  sendPositionToStockfish();

  const mode=searchModeEl.value;
  if(mode==='time'){
    const ms=Math.max(100, parseInt(thinkTimeEl.value,10)||800);
    sfSend('go movetime '+ms);
    sfFallbackTimer=setTimeout(()=>{ if(!sfSearching) return; notice('Stockfish is taking longer than expected — press Stop or reduce think time.'); sfStopSearch(); }, ms+3000);
  }else{
    const d=Math.max(2, Math.min(30, parseInt(depthEl.value,10)||12));
    sfSend('go depth '+d);
    sfFallbackTimer=setTimeout(()=>{ if(!sfSearching) return; notice('Stockfish is taking longer than expected — press Stop or reduce depth.'); sfStopSearch(); }, 8000);
  }
}

// Hint button (book first, then Stockfish)
hintBtn.addEventListener('click', ()=>{
  if(gameOver) return;
  const bm=pickFromBook();
  if(bm){
    hintMove={sr:bm.sr,sc:bm.sc,er:bm.er,ec:bm.ec,source:'book'};
    notice('✨ Hint (book): '+sqLabel(bm.sr,bm.sc)+' → '+sqLabel(bm.er,bm.ec));
    render();
    return;
  }
  requestStockfishBestMove({forHint:true});
});

clearHintBtn.addEventListener('click', ()=>{ hintMove=null; notice(''); render(); });

function maybeAiMove(){
  if(!vsCompEl.checked || gameOver) return;
  const human=humanSideEl.value;
  const aiColor=(human==='white')?'black':'white';
  if(turn!==aiColor) return;
  if(currentPly!==timeline.length-1) return;

  const bm=pickFromBook();
  if(bm){ applyMove(bm.sr,bm.sc,bm.er,bm.ec); return; }

  requestStockfishBestMove({forHint:false});
}

vsCompEl.addEventListener('change', ()=> maybeAiMove());

// Start
startNewGame();
})();
