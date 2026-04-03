// Move source helper (training / engine / user)
let MOVE_SOURCE = 'user';
function withMoveSource(src, fn){ const prev = MOVE_SOURCE; MOVE_SOURCE = src; try{ return fn(); } finally { MOVE_SOURCE = prev; } } 

(()=>{
'use strict';
// Global flag avoids TDZ issues (trainingActive is declared later in the file)
globalThis.__TRAINING_ACTIVE__ = false;

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

const reviewPanel = document.getElementById('reviewPanel');
const runReviewBtn = document.getElementById('runReviewBtn');
const reviewSummaryEl = document.getElementById('reviewSummary');
const reviewListEl = document.getElementById('reviewList');
const reviewChartEl = document.getElementById('reviewChart');

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

  // live review
  let liveReviewMark = null;

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
  liveReviewMark = null;
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
  liveReviewMark = null;
  if(!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  selected=null;
  currentPly=moveList.length;
  render(); updateStatus(); updateEval(); redrawHistory(); updateFenBox();
}

function redo(){
  liveReviewMark = null;
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


// ===============================
// 🎓 Automatic lesson feedback (lightweight heuristics)
// Shows short coaching messages after USER moves (not during training mode).
// ===============================
function pieceValue(p){
  if(!p || p==='.') return 0;
  const map={p:1,n:3,b:3,r:5,q:9,k:0};
  return map[p.toLowerCase()]||0;
}

function findQueen(color){
  const q = color==='white'?'Q':'q';
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(board[r][c]===q) return {r,c};
  return null;
}

function maxImmediateCaptureValue(byColor){
  // scans legal captures for side to move byColor in current position
  let best = 0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=board[r][c];
    if(p==='.' || (isWhite(p)?'white':'black')!==byColor) continue;
    for(let er=0;er<8;er++) for(let ec=0;ec<8;ec++){
      if(!validMove(r,c,er,ec,true)) continue;
      const t=board[er][ec];
      if(t!=='.') best = Math.max(best, pieceValue(t));
      // en-passant capture (t=='.' but pawn diagonal to ep square)
      if(t==='.' && p.toLowerCase()==='p' && enPassant && er===enPassant.r && ec===enPassant.c){
        best = Math.max(best, 1);
      }
    }
  }
  return best;
}

function lessonFeedback(move, beforeSnap){
  try{
    const mover = isWhite(beforeSnap.board[move.sr][move.sc]) ? 'white' : 'black';
    const enemy = mover==='white'?'black':'white';
    const movedPiece = beforeSnap.board[move.sr][move.sc];
    const captured = beforeSnap.board[move.er][move.ec] !== '.';

    // Positive: check or castle
    const gaveCheck = isKingInCheck(enemy);
    const castled = (movedPiece.toLowerCase()==='k' && Math.abs(move.ec-move.sc)===2);

    // Hanging detection for moved piece
    const destPiece = board[move.er][move.ec];
    let hangWarn = '';
    if(destPiece && destPiece!=='.'){
      const {atk,def} = countAttackersDefenders(move.er, move.ec);
      if(atk>0 && def===0){
        const v = pieceValue(destPiece);
        if(v>=9) hangWarn = '⚠️ Your queen is hanging (can be captured).';
        else if(v>=5) hangWarn = '⚠️ That piece is hanging (no defenders).';
        else hangWarn = '⚠️ That piece can be captured and is undefended.';
      }
    }

    // Queen safety (global)
    let queenWarn = '';
    const q = findQueen(mover);
    if(q){
      const {atk,def} = countAttackersDefenders(q.r, q.c);
      if(atk>0 && def===0) queenWarn = '⚠️ Your queen is en prise — consider moving/defending it.';
    }

    // Tactical danger: can opponent win big material immediately?
    const danger = maxImmediateCaptureValue(enemy);
    let tacticWarn = '';
    if(danger>=9) tacticWarn = '❌ Blunder alert: opponent can win a queen next move.';
    else if(danger>=5) tacticWarn = '⚠️ Careful: opponent can win a rook or better next move.';

    // Development tip (very simple)
    let devTip = '';
    const ply = beforeSnap.moveList ? beforeSnap.moveList.length : 0;
    if(ply<6 && movedPiece.toLowerCase()==='q') devTip = 'Tip: early queen adventures often get chased — develop knights/bishops first.';
    if(ply<10 && !castled){
      // if king/rook moved already we won't nag too much
      // but a gentle reminder helps beginners
      if(movedPiece.toLowerCase()!=='k') devTip = devTip || 'Tip: consider castling soon to improve king safety.';
    }

    // Build final message (short)
    const parts=[];
    if(gaveCheck) parts.push('✅ Nice! You gave check.');
    if(castled) parts.push('✅ Good habit: castling improves king safety.');jj
    if(captured) parts.push('🎯 Capture made — always ask: “what can my opponent do now?”');
    if(tacticWarn) parts.push(tacticWarn);
    if(hangWarn) parts.push(hangWarn);
    if(!tacticWarn && queenWarn) parts.push(queenWarn);
    if(devTip) parts.push('🎓 ' + devTip);

    if(parts.length){
      notice(parts.slice(0,3).join(' '));
    }
  }catch(_e){ /* keep silent */ }
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
if(liveReviewMark && r === liveReviewMark.r && c === liveReviewMark.c){
  const mark = document.createElement('div');
  mark.className = 'liveReviewMark ' + ('review-' + liveReviewMark.label.toLowerCase());
  mark.textContent = liveReviewMark.icon;

  if(liveReviewMark.bestMove){
    mark.title = `${liveReviewMark.label} • Best: ${liveReviewMark.bestMove}`;
  } else {
    mark.title = liveReviewMark.label;
  }

  sq.appendChild(mark);

  // fade after delay
  setTimeout(() => {
    mark.classList.add('fade');
  }, 1500);   // stays visible longer

  // remove after fade
  setTimeout(() => {
    mark.remove();
  }, 2200);
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

    // === Candidate-move gating (TACTICS ONLY) ===
    if(tacticState && trainingActive && tacticState.candidateMode){

      // prevent duplicate candidate
      const exists = tacticState.candidates.some(
        m => m.sr===selected.r && m.sc===selected.c && m.er===r && m.ec===c
      );

      if(!exists){
        // record candidate
        tacticState.candidates.push({
          sr: selected.r,
          sc: selected.c,
          er: r,
          ec: c
        });

        // mark square
        const sq = boardEl.children[
          (orientation==='white')
            ? r*8 + c
            : (7-r)*8 + (7-c)
        ];
        sq.classList.add('candidate');
        sq.dataset.candidate = String(tacticState.candidates.length);

        notice(
          tacticState.candidates.length < REQUIRED_CANDIDATES
            ? `🧠 Select ${REQUIRED_CANDIDATES - tacticState.candidates.length} more candidate move`
            : '✅ Candidates locked. Play your move.'
        );

        if(tacticState.candidates.length >= REQUIRED_CANDIDATES){
          tacticState.candidateMode = false;
          lockCandidates();
        }

        selected = null;
        render();
        return;
      }
    }

    // === Actual move execution ===
    if(tacticState && trainingActive){
      // if candidates required but not selected yet
      if(tacticState.candidateMode){
        notice('⛔ Choose your candidate moves first.');
        selected = null;
        render();
        return;
      }
    }

    // Normal execution (with promotion picker restored)
stopSearch();

const moving = board[selected.r][selected.c];
const isPromo = (moving && moving.toLowerCase() === 'p' && (r === 0 || r === 7));

if(isPromo){
  const color = isWhite(moving) ? 'white' : 'black';
  const sr = selected.r, sc = selected.c, er = r, ec = c;

  // Clear selection before showing modal (prevents extra clicks)
  selected = null;
  render();

  showPromotionPicker(color, (choice) => {
    // choice is 'Q','R','B','N'
    applyMove(sr, sc, er, ec, choice);
  });

  return;
}

applyMove(selected.r, selected.c, r, c);
return;
  }

  selected=null;
  render();
  return;
}


  if(p!=='.' && (isWhite(p)?'white':'black')===turn){
    selected={r,c};
    render();
  }
}

// Opening book
const BOOK_LINES = [
  // Italian / Ruy Lopez / simple e4 e5
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5',
  'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6',
  'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6',
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4',

  // Scotch / Four Knights
  'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4',
  'e2e4 e7e5 g1f3 b8c6 b1c3 g8f6',

  // Sicilian
  'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4',
  'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4',

  // French
  'e2e4 e7e6 d2d4 d7d5 b1c3',
  'e2e4 e7e6 d2d4 d7d5 b1d2',

  // Caro-Kann
  'e2e4 c7c6 d2d4 d7d5 b1c3',
  'e2e4 c7c6 d2d4 d7d5 e4d5 c6d5',

  // Queen pawn / QGD / London
  'd2d4 d7d5 c2c4 e7e6 b1c3',
  'd2d4 d7d5 g1f3 g8f6 c1f4',
  'd2d4 g8f6 g1f3 e7e6 c1f4',

  // English / Réti
  'c2c4 e7e5 b1c3 g8f6 g2g3',
  'g1f3 d7d5 c2c4',

  // Scholar-style ideas / traps
  'e2e4 e7e5 d1h5 b8c6 f1c4 g8f6',
  'e2e4 e7e5 f1c4 b8c6 d1h5 g8f6',
  'e2e4 e7e5 d1f3 b8c6 f1c4 g8f6',
  'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 d2d3',

  // Trap / tactic-flavoured branches
  'f2f3 e7e5 g2g4 d8h4',
  'e2e4 e7e5 g1f3 d7d6 d2d4'
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
// Simple learning engine (used at low Elo)
// File required next to index.html:
// - simple-engine-worker.js
// This engine is used only when the Elo slider is set below SIMPLE_ENGINE_SWITCH_ELO.
// ===============================

const SIMPLE_ENGINE_WORKER_URL = 'simple-engine-worker.js';
const ENGINE_BEGINNER_MAX_ELO = 699;
const ENGINE_CLUB_MAX_ELO = 1299;
let simpleWorker = null;
let simpleSeq = 0;
let simpleSearching = false;
let pendingHintSimple = false;
let awaitingAIMoveSimple = false;
let simpleFallbackTimer = null;

function getDisplayElo(){
  if(!strengthSliderEl) return 0;
  const raw = parseInt(strengthSliderEl.value,10)||0;
  if(raw<=0) return 0; // unlimited
  try{ return (typeof displayEloForRaw==='function' ? displayEloForRaw(raw) : raw) || raw; }catch(_e){ return raw; }
}

function getEngineTier(){
  const elo = getDisplayElo();
  if(elo <= 0) return { key:'stockfish', label:'Stockfish', help:'Full engine strength' };
  if(elo <= ENGINE_BEGINNER_MAX_ELO) return { key:'beginner', label:'Beginner engine', help:'Forgiving, human-like, good for new players' };
  if(elo <= ENGINE_CLUB_MAX_ELO) return { key:'club', label:'Club engine', help:'More solid, fewer blunders, still beatable' };
  return { key:'stockfish', label:'Stockfish', help:'Advanced engine with Elo limiting' };
}

function usesSimpleEngineTier(){
  const tier = getEngineTier();
  return tier.key === 'beginner' || tier.key === 'club';
}

function initSimpleWorker(){
  if(simpleWorker) return;
  simpleWorker = new Worker(SIMPLE_ENGINE_WORKER_URL);
  simpleWorker.onerror = (e)=>{
    notice('⚠️ Simple engine: ' + ((e && e.message) ? e.message : 'Worker error'));
    simpleStopSearch();
  };
  simpleWorker.onmessage = (e)=>{
    const msg = e.data || {};
    if(msg.type !== 'result' || msg.seq !== simpleSeq) return;

    const wasHint = pendingHintSimple;
    const wasAiMove = awaitingAIMoveSimple;

    simpleSearching=false;
    pendingHintSimple=false;
    awaitingAIMoveSimple=false;
    if(thinkingEl) thinkingEl.style.display='none';
    if(stopBtn) stopBtn.style.display='none';
    if(simpleFallbackTimer){ clearTimeout(simpleFallbackTimer); simpleFallbackTimer=null; }

    const mv = msg.move;
    if(!mv) return;

    if(wasHint){
      hintMove={sr:mv.sr,sc:mv.sc,er:mv.er,ec:mv.ec,source:'simple'};
      notice('✨ Hint (learning engine): '+sqLabel(mv.sr,mv.sc)+' → '+sqLabel(mv.er,mv.ec));
      render();
      return;
    }

    if(wasAiMove){
      withMoveSource('engine', ()=> applyMove(mv.sr,mv.sc,mv.er,mv.ec,mv.promo||null));
      return;
    }

    withMoveSource('engine', ()=> applyMove(mv.sr,mv.sc,mv.er,mv.ec,mv.promo||null));
  };
}

function simpleStopSearch(){
  try{ if(simpleWorker) simpleWorker.postMessage({type:'stop'}); }catch(_e){}
  simpleSearching=false;
  pendingHintSimple=false;
  awaitingAIMoveSimple=false;
  if(simpleFallbackTimer){ clearTimeout(simpleFallbackTimer); simpleFallbackTimer=null; }
}

function requestSimpleBestMove({forHint=false, tier='beginner'}={}){
  if(gameOver) return;
  initSimpleWorker();
  simpleStopSearch();
  simpleSearching=true;
  pendingHintSimple=!!forHint;
  awaitingAIMoveSimple=!forHint;
  simpleSeq++;
  if(thinkingEl) thinkingEl.style.display='inline';
  if(stopBtn) stopBtn.style.display='inline';
  const elo = getDisplayElo() || 600;
  simpleFallbackTimer=setTimeout(()=>{
    if(!simpleSearching) return;
    notice('Learning engine is taking longer than expected — press Stop.');
    simpleStopSearch();
  }, 2500);
  simpleWorker.postMessage({
    type:'search',
    seq: simpleSeq,
    elo,
    tier,
    state: { board, turn, enPassant, castling }
  });
}

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

const sqLabel = (r,c)=> String.fromCharCode(97+c) + (8-r);

let stockfish=null;
let stockfishReady=false;
let sfQueue=[];
let pendingHintSF=false;
let awaitingAIMoveSF=false;
let sfSearching=false;
let sfFallbackTimer=null;
let reviewStockfish = null;
let reviewStockfishReady = false;
let reviewQueue = [];

function initReviewStockfish(){
  if(reviewStockfish) return;

  reviewStockfish = new Worker(STOCKFISH_WORKER_URL);

  reviewStockfish.onerror = (e)=>{
    console.error('Review Stockfish error:', e);
  };

  reviewStockfish.onmessage = (e)=>{
    const line = (typeof e.data === 'string') ? e.data : '';
    if(line === 'uciok'){
      reviewStockfish.postMessage('isready');
      return;
    }
    if(line === 'readyok'){
      reviewStockfishReady = true;
      for(const cmd of reviewQueue) reviewStockfish.postMessage(cmd);
      reviewQueue = [];
      return;
    }
  };

  reviewStockfish.postMessage('uci');
}

function reviewSfSend(cmd){
  initReviewStockfish();
  if(reviewStockfishReady) reviewStockfish.postMessage(cmd);
  else reviewQueue.push(cmd);
}
  
function sfStopSearch(){
  try{ if(stockfish) stockfish.postMessage('stop'); }catch(_e){}
  sfSearching=false;
  pendingHintSF=false;
  awaitingAIMoveSF=false;
  if(typeof thinkingEl!=='undefined' && thinkingEl) thinkingEl.style.display='none';
  if(typeof stopBtn!=='undefined' && stopBtn) stopBtn.style.display='none';
  if(sfFallbackTimer){ clearTimeout(sfFallbackTimer); sfFallbackTimer=null; }
}

function stopSearch(){
  // stop any engine search (Stockfish or learning engine)
  sfStopSearch();
  simpleStopSearch();
}

function analyzeFenWithStockfish(fen, movetime = 250){
  return new Promise((resolve, reject) => {
    initReviewStockfish();

    let resolved = false;
    let bestMove = null;
    let evalCp = 0;

    const previousHandler = reviewStockfish.onmessage;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Review timeout'));
    }, movetime + 2500);

    function cleanup(){
      clearTimeout(timeout);
      reviewStockfish.onmessage = previousHandler;
    }

    reviewStockfish.onmessage = (e)=>{
      const line = typeof e.data === 'string' ? e.data : '';

      if(line === 'uciok'){
        reviewStockfish.postMessage('isready');
        return;
      }

      if(line === 'readyok'){
        reviewStockfishReady = true;
        for(const cmd of reviewQueue) reviewStockfish.postMessage(cmd);
        reviewQueue = [];
        return;
      }

      if(line.startsWith('info ') && line.includes(' score cp ')){
        const m = line.match(/score cp (-?\d+)/);
        if(m) evalCp = parseInt(m[1], 10);
      }

      if(line.startsWith('info ') && line.includes(' score mate ')){
        const m = line.match(/score mate (-?\d+)/);
        if(m){
          const mate = parseInt(m[1], 10);
          evalCp = mate > 0 ? 10000 : -10000;
        }
      }

      if(line.startsWith('bestmove')){
        const parts = line.split(/\s+/);
        bestMove = parts[1] || null;

        if(!resolved){
          resolved = true;
          cleanup();
          resolve({ bestMove, evalCp });
        }
      }
    };

    reviewSfSend('ucinewgame');
    reviewSfSend('position fen ' + fen);
    reviewSfSend('go movetime ' + movetime);
  });
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
  const tier = getEngineTier();

  if(raw <= 0){
    setStrengthReadout('Unlimited — Stockfish');
    if(strengthHelpEl) {
      strengthHelpEl.textContent = 'Full Stockfish strength. Hints use Stockfish.';
    }
    return;
  }

  const elo = displayEloForRaw(raw);
  setStrengthReadout(`Elo ${elo} — ${tier.label}`);

  if(strengthHelpEl) {
    strengthHelpEl.textContent = tier.help + '. Hints use Stockfish when available.';
  }
}



function applyStrengthFromSlider(){
  if(!strengthSliderEl) return;

  const raw = parseInt(strengthSliderEl.value, 10) || 0;
  const tier = getEngineTier();

  try{ store.set('chess_strength_slider', String(raw)); }catch(_e){}

  updateStrengthReadoutOnly();

  if(raw <= 0){
    sfSend('setoption name UCI_LimitStrength value false');
    sfSend('setoption name Skill Level value 20');
    return;
  }

  const elo = displayEloForRaw(raw);

  if(tier.key === 'beginner' || tier.key === 'club'){
    const hintTarget = Math.max(1400, elo + 500);
    sfSend('setoption name UCI_LimitStrength value true');
    sfSend('setoption name UCI_Elo value ' + clamp(hintTarget, UCI_ELO_MIN, UCI_ELO_MAX));
    return;
  }

  if(elo < UCI_ELO_MIN){
    const skill = skillFromDisplayElo(elo);
    sfSend('setoption name UCI_LimitStrength value false');
    sfSend('setoption name Skill Level value ' + skill);
    return;
  }

  const target = clamp(elo, UCI_ELO_MIN, UCI_ELO_MAX);
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

function sendPositionToStockfish(){
  sfSend('ucinewgame');
  const fen=boardToFen();
  sfSend('position fen ' + fen);
}

function stockfishTimeForElo(elo, forHint=false){
  if(!elo || elo<=0) return forHint ? 900 : 1200;

  if(elo <= 700) return forHint ? 250 : 350;
  if(elo <= 1200) return forHint ? 350 : 500;
  if(elo <= 1600) return forHint ? 500 : 700;
  if(elo <= 2000) return forHint ? 700 : 900;
  if(elo <= 2600) return forHint ? 900 : 1200;
  return forHint ? 1100 : 1500;
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
    withMoveSource('engine', ()=> applyMove(m.sr,m.sc,m.er,m.ec,m.promo));
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

  const elo = getDisplayElo();
  const ms = stockfishTimeForElo(elo, forHint);

  sfSend('go movetime ' + ms);
  sfFallbackTimer=setTimeout(()=>{
    if(!sfSearching) return;
    notice('Stockfish is taking longer than expected — press Stop.');
    sfStopSearch();
  }, ms + 3000);
}


// Hint button (book first, then engine)

hintBtn.addEventListener('click', ()=>{
  if(gameOver) return;
  const bm=pickFromBook();
  if(bm){
    hintMove={sr:bm.sr,sc:bm.sc,er:bm.er,ec:bm.ec,source:'book'};
    notice('✨ Hint (book): '+sqLabel(bm.sr,bm.sc)+' → '+sqLabel(bm.er,bm.ec));
    render();
    return;
  }

  try{
    requestStockfishBestMove({forHint:true});
  }catch(_e){
    const tier = getEngineTier();
    if(tier.key === 'beginner' || tier.key === 'club'){
      requestSimpleBestMove({forHint:true, tier:tier.key});
    }else{
      notice('⚠️ Stockfish hint unavailable.');
    }
  }
});




clearHintBtn.addEventListener('click', ()=>{ hintMove=null; notice(''); render(); });



function maybeAiMove(){
  // Only block engine moves during strict trainer mode
  if(globalThis.__TRAINING_ACTIVE__ && openingState && openingState.mode === 'trainer') return;
  if(globalThis.__TRAINING_ACTIVE__ && !openingState) return;

  if(!vsCompEl.checked || gameOver) return;
  const human=humanSideEl.value;
  const aiColor=(human==='white')?'black':'white';
  if(turn!==aiColor) return;
  if(currentPly!==timeline.length-1) return;

  const bm=pickFromBook();
  if(bm){
    withMoveSource('engine', ()=> applyMove(bm.sr,bm.sc,bm.er,bm.ec));
    return;
  }

  const tier = getEngineTier();
  if(tier.key === 'beginner' || tier.key === 'club'){
    requestSimpleBestMove({forHint:false, tier:tier.key});
    return;
  }

  requestStockfishBestMove({forHint:false});
}


vsCompEl.addEventListener('change', ()=> maybeAiMove());



// ===============================
// Training: Openings + Tactics (load from repo OR uploaded JSON)
// ===============================
let trainingData = { openings: [], tactics: [] };
let trainingMode = 'openings'; // 'openings'|'tactics'
let trainingActive = false;
function enterTrainingMode(){ globalThis.__TRAINING_ACTIVE__ = true; }
function exitTrainingMode(){ globalThis.__TRAINING_ACTIVE__ = false; }


// Training runtime state
let openingState = null;
let tacticState = null;
let openingPlaybackTimer = null;

let reviewData = null;
let reviewRunning = false;

// ===============================
// Candidate-move training (TACTICS ONLY)
// ===============================
const REQUIRED_CANDIDATES = 0;// was 2



const trainTabOpenings = document.getElementById('trainTabOpenings');
const trainTabTactics = document.getElementById('trainTabTactics');
const trainOpeningsSec = document.getElementById('trainOpenings');
const trainTacticsSec = document.getElementById('trainTactics');
const trainingStatusEl = document.getElementById('trainingStatus');

const trainLoadRepoBtn = document.getElementById('trainLoadRepo');
const trainUseFilesBtn = document.getElementById('trainUseFiles');
const openingsFileEl = document.getElementById('trainOpeningsFile');
const tacticsFileEl = document.getElementById('trainTacticsFile');

const openingSelect = document.getElementById('openingSelect');
const openingLineSelect = document.getElementById('openingLineSelect');
const openingSideSelect = document.getElementById('openingSideSelect');
const openingModeSelect = document.getElementById('openingModeSelect');
const startOpeningBtn = document.getElementById('startOpening');
const stopTrainingBtn = document.getElementById('stopTraining');
const stopTrainingBtn2 = document.getElementById('stopTraining2');
const openingIdeasEl = document.getElementById('openingIdeas');

const tacMinEl = document.getElementById('tacMin');
const tacMaxEl = document.getElementById('tacMax');
const tacThemesEl = document.getElementById('tacThemes');
const nextTacticBtn = document.getElementById('nextTactic');
const tacInfoEl = document.getElementById('tacInfo');

function clearOpeningPlaybackTimer(){
  if(openingPlaybackTimer){
    clearTimeout(openingPlaybackTimer);
    openingPlaybackTimer = null;
  }
}

function getOpeningMode(){
  return openingModeSelect ? openingModeSelect.value : 'trainer';
}

function setTrainingStatus(msg){ if(trainingStatusEl) trainingStatusEl.textContent = msg; }

function setTab(mode){
  trainingMode = mode;
  if(trainTabOpenings) trainTabOpenings.classList.toggle('active', mode==='openings');
  if(trainTabTactics) trainTabTactics.classList.toggle('active', mode==='tactics');
  if(trainOpeningsSec) trainOpeningsSec.style.display = (mode==='openings') ? '' : 'none';
  if(trainTacticsSec) trainTacticsSec.style.display = (mode==='tactics') ? '' : 'none';
}

if(trainTabOpenings) trainTabOpenings.addEventListener('click', ()=> setTab('openings'));
if(trainTabTactics) trainTabTactics.addEventListener('click', ()=> setTab('tactics'));
setTab('openings');

async function loadJsonFromUrl(url){
  const res = await fetch(url, {cache:'no-store'});
  if(!res.ok) throw new Error('HTTP '+res.status);
  return await res.json();
}

async function runGameReview(){
  if(reviewRunning) return;
  if(!timeline || timeline.length < 2){
    notice('No game to review yet.');
    return;
  }

  reviewRunning = true;
  reviewPanel.style.display = 'block';
  reviewSummaryEl.textContent = 'Reviewing game…';
  reviewListEl.innerHTML = '';

  const original = snapshot();
  const results = [];

  try{
    for(let i = 0; i < timeline.length - 1; i++){
      restore(timeline[i]);
      const beforeFen = boardToFen();
      const sideToMove = turn;
      const playedMove = moveList[i] || '';

      restore(timeline[i + 1]);
      const afterFen = boardToFen();

      const before = await analyzeFenWithStockfish(beforeFen, 250);
      const after = await analyzeFenWithStockfish(afterFen, 250);

      const beforeScore = sideToMove === 'white' ? before.evalCp : -before.evalCp;
      const afterScore  = sideToMove === 'white' ? after.evalCp  : -after.evalCp;

      const loss = beforeScore - afterScore;

      let label = 'Good';

      if (before.bestMove && playedMove && before.bestMove === playedMove.toLowerCase()) {
        label = 'Best';
      } else if (Math.abs(after.evalCp) >= 9000) {
        label = 'Best';
      } else if (loss < 0) {
        label = 'Best';
      } else if (loss <= 20) {
        label = 'Best';
      } else if (loss <= 60) {
        label = 'Good';
      } else if (loss <= 120) {
        label = 'Inaccuracy';
      } else if (loss <= 300) {
        label = 'Mistake';
      } else {
        label = 'Blunder';
      }

      results.push({
        ply: i + 1,
        side: sideToMove,
        playedMove,
        bestMove: before.bestMove,
        evalCp: before.evalCp,
        afterEval: after.evalCp,
        loss,
        label
      });

      reviewSummaryEl.textContent = `Reviewing move ${i + 1} of ${timeline.length - 1}…`;
    }

    reviewData = results;
    renderReviewSummary(results);
    renderReviewList(results);
    renderReviewChart(results);
  } catch(err){
    console.error(err);
    reviewSummaryEl.textContent = 'Review failed.';
  } finally {
    restore(original);
    render();
    updateStatus();
    updateEval();
    reviewRunning = false;
  }
}
function renderReviewSummary(results){
  const counts = {
    Best: 0,
    Good: 0,
    Inaccuracy: 0,
    Mistake: 0,
    Blunder: 0
  };

  for(const r of results){
    counts[r.label] = (counts[r.label] || 0) + 1;
  }

  reviewSummaryEl.textContent =
    `Best: ${counts.Best} · Good: ${counts.Good} · Inaccuracies: ${counts.Inaccuracy} · Mistakes: ${counts.Mistake} · Blunders: ${counts.Blunder}`;
}

 function sideIcon(side){
  return side === 'white' ? '⚪' : '⚫';
}

function reviewIcon(label){
  switch(label){
    case 'Best': return '✅';
    case 'Good': return '👍';
    case 'Inaccuracy': return '⚠️';
    case 'Mistake': return '❗';
    case 'Blunder': return '❌';
    default: return '';
  }
}

async function classifyMoveWithStockfish(beforeFen, afterFen, moverColor, playedMove){
  const before = await analyzeFenWithStockfish(beforeFen, 180);
  const after = await analyzeFenWithStockfish(afterFen, 180);

  const beforeScore = moverColor === 'white' ? before.evalCp : -before.evalCp;
  const afterScore  = moverColor === 'white' ? after.evalCp  : -after.evalCp;

  const loss = beforeScore - afterScore;

  let label = 'Good';

  if (before.bestMove && playedMove && before.bestMove === playedMove.toLowerCase()) {
    label = 'Best';
  } else if (Math.abs(after.evalCp) >= 9000) {
    label = 'Best';
  } else if (loss < 0) {
    label = 'Best';
  } else if (loss <= 20) {
    label = 'Best';
  } else if (loss <= 60) {
    label = 'Good';
  } else if (loss <= 120) {
    label = 'Inaccuracy';
  } else if (loss <= 300) {
    label = 'Mistake';
  } else {
    label = 'Blunder';
  }

  return {
    label,
    loss,
    bestMove: before.bestMove
  };
}
  
function renderReviewList(results){
  reviewListEl.innerHTML = '';

  for(const r of results){
    const row = document.createElement('div');
    row.className = 'histLine';
    row.style.justifyContent = 'space-between';

    const left = document.createElement('div');
    const side = sideIcon(r.side);
    const icon = reviewIcon(r.label);

    left.textContent = `${side} ${r.ply}. ${r.playedMove} — ${icon} ${r.label}`;

    const right = document.createElement('div');
    right.className = 'small';
    right.textContent = `Best: ${r.bestMove || '-'} | Loss: ${Math.max(0, Math.round(r.loss || 0))}`;

    row.appendChild(left);
    row.appendChild(right);

    row.addEventListener('click', () => gotoPly(r.ply));
    reviewListEl.appendChild(row);
  }
}

function renderReviewChart(results){
  if(!reviewChartEl) return;

  const ctx = reviewChartEl.getContext('2d');
  const w = reviewChartEl.width;
  const h = reviewChartEl.height;

  ctx.clearRect(0, 0, w, h);

  const pad = 20;
  const maxLoss = Math.max(50, ...results.map(r => Math.min(500, Math.max(0, r.loss || 0))));
  const stepX = results.length > 1 ? (w - pad * 2) / (results.length - 1) : 0;

  function xAt(i){
    return pad + i * stepX;
  }

  function yAt(loss){
    const clamped = Math.min(500, Math.max(0, loss || 0));
    return h - pad - (clamped / maxLoss) * (h - pad * 2);
  }

  // axes
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  // horizontal guide lines
  [0, 100, 300, 500].forEach(v => {
    const y = yAt(v);
    ctx.strokeStyle = '#eee';
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(v), 2, y + 3);
  });

  // line segments colored by side
  for(let i = 0; i < results.length; i++){
    const r = results[i];
    const x = xAt(i);
    const y = yAt(r.loss || 0);

    ctx.beginPath();
    ctx.fillStyle = r.side === 'white' ? '#888' : '#222';
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    if(i > 0){
      const prev = results[i - 1];
      ctx.beginPath();
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 2;
      ctx.moveTo(xAt(i - 1), yAt(prev.loss || 0));
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  // legend
  ctx.fillStyle = '#888';
  ctx.beginPath();
  ctx.arc(w - 90, 12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#333';
  ctx.font = '11px sans-serif';
  ctx.fillText('White move', w - 80, 16);

  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(w - 20, 12, 4, 0, Math.PI * 2);
  ctx.fill();
}

// Multi-pack helpers (manifest + merge)
async function fetchJson(url){
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error('HTTP '+res.status+' for '+url);
  return await res.json();
}

function mergeUniqueById(list){
  const map = new Map();
  for(const item of (list || [])){
    const key = item.id || item.name || JSON.stringify(item);
    if(!map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}
function readJsonFile(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>{
      try{ resolve(JSON.parse(reader.result)); }catch(e){ reject(e); }
    };
    reader.onerror = ()=> reject(reader.error);
    reader.readAsText(file);
  });
}
function clearCandidates(){
  if(!tacticState) return;
  tacticState.candidates = [];
  tacticState.candidateMode = true;
  document.querySelectorAll('.square.candidate').forEach(sq=>{
    sq.classList.remove('candidate','locked');
    delete sq.dataset.candidate;
  });
}

function lockCandidates(){
  document.querySelectorAll('.square.candidate').forEach(sq=>{
    sq.classList.add('locked');
  });
}


async function loadTrainingFromRepo(){
  try{
    setTrainingStatus('Loading training data…');

    // --- OPENINGS ---
    let openingsAll = [];
    try{
      const oIndex = await fetchJson('data/openings/index.json');
      const oFiles = Array.isArray(oIndex.files) ? oIndex.files : [];
      if(!oFiles.length) throw new Error('No opening packs listed');
      const packs = await Promise.all(oFiles.map(f => fetchJson('data/openings/' + f)));
      openingsAll = packs.flatMap(p => p.openings || []);
    }catch(_e){
      // Fallbacks (older layouts)
      try{ const oj = await fetchJson('data/openings.json'); openingsAll = oj.openings || []; }
      catch(_e2){ const oj2 = await fetchJson('openings.json'); openingsAll = oj2.openings || []; }
    }

    // --- TACTICS ---
    let tacticsAll = [];
    try{
      const tIndex = await fetchJson('data/tactics/index.json');
      const tFiles = Array.isArray(tIndex.files) ? tIndex.files : [];
      if(!tFiles.length) throw new Error('No tactics packs listed');
      const packs = await Promise.all(tFiles.map(f => fetchJson('data/tactics/' + f)));
      tacticsAll = packs.flatMap(p => p.tactics || []);
    }catch(_e){
      // Fallbacks (older layouts)
      try{ const tj = await fetchJson('data/tactics.json'); tacticsAll = tj.tactics || []; }
      catch(_e2){ const tj2 = await fetchJson('tactics.json'); tacticsAll = tj2.tactics || []; }
    }

    trainingData.openings = mergeUniqueById(openingsAll);
    trainingData.tactics  = mergeUniqueById(tacticsAll);

    populateOpeningDropdowns();
    setTrainingStatus(`Loaded ${trainingData.openings.length} openings and ${trainingData.tactics.length} tactics.`);
  }catch(e){
    console.error(e);
    setTrainingStatus('Failed to load training data from repo.');
  }
}


async function loadTrainingFromFiles(){
  try{
    const ofiles = Array.from((openingsFileEl && openingsFileEl.files) ? openingsFileEl.files : []);
    const tfiles = Array.from((tacticsFileEl && tacticsFileEl.files) ? tacticsFileEl.files : []);

    if(!ofiles.length || !tfiles.length){
      setTrainingStatus('Please choose at least 1 Openings JSON file and 1 Tactics JSON file.');
      return;
    }

    setTrainingStatus('Loading uploaded JSON…');

    const openingJsons = await Promise.all(ofiles.map(readJsonFile));
    const tacticJsons  = await Promise.all(tfiles.map(readJsonFile));

    const openingsAll = openingJsons.flatMap(j => j.openings || []);
    const tacticsAll  = tacticJsons.flatMap(j => j.tactics || []);

    trainingData.openings = mergeUniqueById(openingsAll);
    trainingData.tactics  = mergeUniqueById(tacticsAll);

    populateOpeningDropdowns();
    setTrainingStatus(`Loaded ${trainingData.openings.length} openings and ${trainingData.tactics.length} tactics (uploaded).`);
  }catch(e){
    console.error(e);
    setTrainingStatus('Failed to parse uploaded JSON.');
  }
}

if(runReviewBtn){
  runReviewBtn.addEventListener('click', runGameReview);
}
  
if(trainLoadRepoBtn) trainLoadRepoBtn.addEventListener('click', loadTrainingFromRepo);
if(trainUseFilesBtn) trainUseFilesBtn.addEventListener('click', loadTrainingFromFiles);

function populateOpeningDropdowns(){
  if(!openingSelect || !openingLineSelect) return;
  openingSelect.innerHTML = '';
  for(const o of trainingData.openings){
    const opt = document.createElement('option');
    opt.value = o.id || o.name;
    opt.textContent = o.name || o.id;
    openingSelect.appendChild(opt);
  }
  updateLineDropdown();
}

function getSelectedOpening(){
  const key = openingSelect ? openingSelect.value : null;
  return trainingData.openings.find(o => (o.id||o.name) === key) || trainingData.openings[0] || null;
}

function updateLineDropdown(){
  const o = getSelectedOpening();
  if(!o || !openingLineSelect) return;
  openingLineSelect.innerHTML='';
  (o.lines||[]).forEach((ln, idx)=>{
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = ln.name || ('Line '+(idx+1));
    openingLineSelect.appendChild(opt);
  });
  if(openingSideSelect && o.side){
    // default side from file
    openingSideSelect.value = o.side;
  }
  if(openingIdeasEl){
    openingIdeasEl.textContent = (o.ideas && o.ideas.length) ? ('Ideas: ' + o.ideas.join(' • ')) : '';
  }
}

if(openingSelect) openingSelect.addEventListener('change', updateLineDropdown);

function uciToMove(uci){
  const sc=uci.charCodeAt(0)-97;
  const sr=8-parseInt(uci[1],10);
  const ec=uci.charCodeAt(2)-97;
  const er=8-parseInt(uci[3],10);
  const promo = uci.length>4 ? uci[4].toUpperCase() : null;
  return {sr,sc,er,ec,promo};
}

function setPositionFromFenOrStart(fen){
  if(fen==='startpos'){
    if(typeof newBtn!=='undefined' && newBtn) newBtn.click();
    return;
  }
  if(typeof fenBox!=='undefined' && fenBox && typeof loadFenBtn!=='undefined' && loadFenBtn){
    fenBox.value = fen;
    loadFenBtn.click();
  }
}

function autoPlayUciMove(uci){
  const m = uciToMove(uci);
  withMoveSource('trainer', ()=> applyMove(m.sr,m.sc,m.er,m.ec,m.promo));
}

function openingAutoAdvance(){
  if(!openingState) return;
  // play book/opponent moves until it's student's turn or line ends
  while(openingState.idx < openingState.moves.length){
    const expected = openingState.moves[openingState.idx];
    const colorToPlay = (typeof turn!=='undefined') ? turn : null;
    if(colorToPlay === openingState.studentColor){
      setTrainingStatus(`Opening: Your move (${openingState.studentColor}). Step ${openingState.idx+1}/${openingState.moves.length}`);
      return;
    }
    // opponent move
    autoPlayUciMove(expected);
    openingState.idx++;
  }
  trainingActive = false;
  openingState = null;
  setTrainingStatus('Opening line complete ✅');
}

function startOpeningTraining(){
  const o = getSelectedOpening();
  if(!o){
    setTrainingStatus('No openings loaded.');
    return;
  }

  const lineIdx = parseInt(openingLineSelect.value, 10) || 0;
  const ln = (o.lines || [])[lineIdx];
  if(!ln || !(ln.movesUci || []).length){
    setTrainingStatus('Selected line has no moves.');
    return;
  }

  clearOpeningPlaybackTimer();
  stopSearch();

  const mode = getOpeningMode();
  const studentColor = openingSideSelect ? openingSideSelect.value : (o.side || 'white');

  // Reset board to opening start
  setPositionFromFenOrStart(o.startFen || 'startpos');

  openingState = {
    openingId: o.id || o.name,
    lineName: ln.name || ('Line ' + (lineIdx + 1)),
    studentColor,
    moves: ln.movesUci.slice(),
    idx: 0,
    mode
  };

  if(mode === 'trainer'){
    enterTrainingMode();
    trainingActive = true;
    setTrainingStatus(`Opening Trainer: ${openingState.lineName}`);
    setTimeout(openingAutoAdvance, 30);
    return;
  }

  if(mode === 'demo'){
    // no strict training lock; we are just watching
    trainingActive = false;
    exitTrainingMode();
    setTrainingStatus(`Opening Demo: ${openingState.lineName}`);
    setTimeout(playOpeningDemoStep, 250);
    return;
  }

  if(mode === 'sparring'){
    // autoplay the opening line, then hand off to the normal engine
    trainingActive = false;
    exitTrainingMode();
    setTrainingStatus(`Opening Sparring: ${openingState.lineName}`);
    setTimeout(playOpeningSparringStep, 250);
    return;
  }
}

function playOpeningDemoStep(){
  if(!openingState || openingState.mode !== 'demo') return;

  if(openingState.idx >= openingState.moves.length){
    setTrainingStatus('Opening demo complete ✅');
    openingState = null;
    clearOpeningPlaybackTimer();
    return;
  }

  const uci = openingState.moves[openingState.idx];
  autoPlayUciMove(uci);
  openingState.idx++;

  setTrainingStatus(`Demo: move ${openingState.idx}/${openingState.moves.length}`);

  clearOpeningPlaybackTimer();
  openingPlaybackTimer = setTimeout(playOpeningDemoStep, 700);
}

function playOpeningSparringStep(){
  if(!openingState || openingState.mode !== 'sparring') return;

  if(openingState.idx >= openingState.moves.length){
    setTrainingStatus('Opening complete — continue against engine.');
    const studentColor = openingState.studentColor;
    openingState = null;
    clearOpeningPlaybackTimer();

    // Ensure the main game side matches the opening side choice
    if(humanSideEl){
      humanSideEl.value = studentColor;
      humanSideEl.dispatchEvent(new Event('change', { bubbles:true }));
    }

    // If you have the pretty segmented side UI, sync it too
    const sidePicker = document.getElementById('sidePicker');
    if(sidePicker){
      const buttons = Array.from(sidePicker.querySelectorAll('.seg-btn'));
      buttons.forEach(btn => {
        const active = btn.dataset.side === studentColor;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
    }

    // Turn on vs computer if not already enabled
    if(vsCompEl && !vsCompEl.checked){
      vsCompEl.checked = true;
      vsCompEl.dispatchEvent(new Event('change', { bubbles:true }));
    }

    maybeAiMove();
    return;
  }

  const uci = openingState.moves[openingState.idx];
  autoPlayUciMove(uci);
  openingState.idx++;

  setTrainingStatus(`Opening: move ${openingState.idx}/${openingState.moves.length}`);

  clearOpeningPlaybackTimer();
  openingPlaybackTimer = setTimeout(playOpeningSparringStep, 700);
}
  
function stopTraining(){
  clearOpeningPlaybackTimer();
  trainingActive = false;
  openingState = null;
  tacticState = null;
  setTrainingStatus('Training stopped.');
  exitTrainingMode();
}
  
if(startOpeningBtn) startOpeningBtn.addEventListener('click', startOpeningTraining);
if(stopTrainingBtn) stopTrainingBtn.addEventListener('click', stopTraining);
if(stopTrainingBtn2) stopTrainingBtn2.addEventListener('click', stopTraining);

function pickNextTactic(){
  const min = parseInt(tacMinEl.value,10) || 0;
  const max = parseInt(tacMaxEl.value,10) || 4000;
  const themes = (tacThemesEl.value||'').split(',').map(s=>s.trim()).filter(Boolean);

  let pool = trainingData.tactics.filter(t => (t.rating==null || (t.rating>=min && t.rating<=max)));
  if(themes.length){
    pool = pool.filter(t => {
      const th = (t.themes||[]).map(x=>String(x).toLowerCase());
      return themes.every(req => th.includes(req.toLowerCase()));
    });
  }
  if(!pool.length) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

function startTactic(t){
  enterTrainingMode();
  setPositionFromFenOrStart(t.fen);
  trainingActive = true;

tacticState = {
  id: t.id,
  fen: t.fen,
  solution: t.solutionUci.slice(),
  idx: 0,
  studentColor: (t.sideToMove==='b') ? 'black' : 'white',
  meta: t,

  // Candidate-move training
  candidateMode: true,
  candidates: [],
  attempts: 0
};


  if(tacInfoEl){
    tacInfoEl.textContent = `${t.title||'Puzzle'} • Rating ${t.rating||'?'} • Themes: ${(t.themes||[]).join(', ')}`;
  }

  setTimeout(()=>{
    setTrainingStatus('Tactic: find the best move.');
  }, 30);
}

function nextTactic(){
  if(!trainingData.tactics.length){ setTrainingStatus('No tactics loaded.'); return; }
  const t = pickNextTactic();
  if(!t){ setTrainingStatus('No tactics match your filters.'); return; }
  startTactic(t);
}

if(nextTacticBtn) nextTacticBtn.addEventListener('click', nextTactic);

// Hook into user moves by wrapping applyMove after it exists
(function hookUserMoves(){
  const tryHook = ()=>{
    if(typeof applyMove !== 'function') return setTimeout(tryHook, 20);
    if(applyMove.__trainingWrapped) return;

    const orig = applyMove;
    const uciFromCoords = (sr,sc,er,ec,promo)=>{
      const u = String.fromCharCode(97+sc) + (8-sr) + String.fromCharCode(97+ec) + (8-er);
      return promo ? (u + promo.toLowerCase()) : u;
    };

const wrapped = function(sr,sc,er,ec,promo){
  const uci = uciFromCoords(sr,sc,er,ec,promo);
  const source = (typeof MOVE_SOURCE==='string') ? MOVE_SOURCE : 'user';

  const before = snapshot();
  const res = orig(sr,sc,er,ec,promo);
  const after = snapshot();

  if(source === 'user'){
    trainingOnUserMove(uci);
  }

  if(!globalThis.__TRAINING_ACTIVE__){
    const moverColor = isWhite(before.board[sr][sc]) ? 'white' : 'black';

    restore(before);
    const beforeFen = boardToFen();

    restore(after);
    const afterFen = boardToFen();

    liveReviewMark = {
      r: er,
      c: ec,
      label: 'Good',
      icon: '⏳',
      side: moverColor,
      bestMove: null,
      loss: null
    };
    render();

    classifyMoveWithStockfish(beforeFen, afterFen, moverColor, uci) 
      .then(resolved => {
        if(lastMove && lastMove.er === er && lastMove.ec === ec){
          liveReviewMark = {
            r: er,
            c: ec,
            label: resolved.label,
            icon: reviewIcon(resolved.label),
            side: moverColor,
            bestMove: resolved.bestMove,
            loss: resolved.loss
          };
          render();
        }
      })
      .catch(err => {
        console.error('Live review failed:', err);
        if(lastMove && lastMove.er === er && lastMove.ec === ec){
          liveReviewMark = {
            r: er,
            c: ec,
            label: 'Good',
            icon: '👍',
            side: moverColor,
            bestMove: null,
            loss: null
          };
          render();
        }
      });

    restore(after);

    if(source === 'user'){
      lessonFeedback({sr,sc,er,ec,promo,uci}, before);
    }
  } else {
    liveReviewMark = null;
  }

  return res;
};
    wrapped.__trainingWrapped = true;
    // preserve other properties
    Object.assign(wrapped, orig);
    applyMove = wrapped;
  };
  tryHook();
})();

function trainingOnUserMove(uci){
  if(!trainingActive) return;

  // OPENINGS
  if(openingState){
    const expected = openingState.moves[openingState.idx];
    if(!expected){
      trainingActive=false; openingState=null; setTrainingStatus('Opening complete ✅'); return;
    }
    if(uci !== expected){
      setTrainingStatus(`❌ Not quite. Expected ${expected}. Try again.`);
      // Undo the wrong move
      if(typeof undoBtn!=='undefined' && undoBtn) undoBtn.click();
      // Show hint arrow
      try{
        const m = uciToMove(expected);
        hintMove = {sr:m.sr,sc:m.sc,er:m.er,ec:m.ec,source:'trainer'};
        render();
      }catch(_e){}
      

      return;
    }
    // correct
    openingState.idx++;
    setTrainingStatus('✅ Correct!');
    // clear hint
    hintMove = null;
    // auto-advance opponent moves
    setTimeout(openingAutoAdvance, 20);
    return;
  }

  // TACTICS
  if(tacticState){
    const expected = tacticState.solution[tacticState.idx];
    if(!expected){
     
trainingActive=false;
tacticState=null;
setTrainingStatus('Puzzle solved ✅');
 return;
    }
    if(uci !== expected){
      setTrainingStatus(`❌ Try again. Expected ${expected}.`);
      if(typeof undoBtn!=='undefined' && undoBtn) undoBtn.click();
      // hint arrow
      try{
        const m = uciToMove(expected);
        hintMove = {sr:m.sr,sc:m.sc,er:m.er,ec:m.ec,source:'trainer'};
        render();
      }catch(_e){}
      return;
    }

    // correct move
    tacticState.idx++;
    hintMove = null;

    // auto-play opponent reply if present and if it's not student's color
    while(tacticState.idx < tacticState.solution.length){
      const next = tacticState.solution[tacticState.idx];
      const colorToPlay = (typeof turn!=='undefined') ? turn : null;
      if(colorToPlay === tacticState.studentColor){
        setTrainingStatus('✅ Good. Next move?');
        return;
      }
      autoPlayUciMove(next);
      tacticState.idx++;
    }

    trainingActive=false;
    tacticState=null;
    setTrainingStatus('Puzzle solved ✅');
  }

}


// Start
startNewGame();
})();

