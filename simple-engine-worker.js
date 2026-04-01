/*
  simple-engine-worker.js
  Legal, human-like engine with 2 simple-engine tiers:
  - beginner: forgiving, human-like, still makes mistakes
  - club: more solid, fewer blunders, no casual queen hangs

  Used by the main app for:
  - Beginner engine (400–699 Elo)
  - Club engine (700–1299 Elo)

  Advanced tier uses Stockfish in the main app.
*/

let stopped = false;

onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'stop') {
    stopped = true;
    return;
  }
  if (msg.type === 'search') {
    stopped = false;
    const seq = msg.seq || 0;
    const elo = typeof msg.elo === 'number' ? msg.elo : 600;
    const tier = msg.tier || 'beginner';
    const state = msg.state;
    const result = chooseMove(state, elo, tier);
    if (!stopped) {
      postMessage({ type: 'result', seq, move: result.move, score: result.score, tier });
    }
  }
};

const VAL = { p:100, n:320, b:330, r:500, q:900, k:0 };
const isWhite = p => p === p.toUpperCase();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function clone(s){
  return {
    board: s.board.map(r => r.slice()),
    turn: s.turn,
    enPassant: s.enPassant ? { r:s.enPassant.r, c:s.enPassant.c } : null,
    castling: s.castling ? { ...s.castling } : { WK:false, WQ:false, BK:false, BQ:false }
  };
}

function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }

function pathClear(b, sr, sc, er, ec){
  const dr = Math.sign(er - sr);
  const dc = Math.sign(ec - sc);
  let r = sr + dr, c = sc + dc;
  while (r !== er || c !== ec) {
    if (b[r][c] !== '.') return false;
    r += dr; c += dc;
  }
  return true;
}

function attacks(b, sr, sc, er, ec){
  if (sr===er && sc===ec) return false;
  const p = b[sr][sc];
  if (p === '.') return false;
  const dr = er - sr;
  const dc = ec - sc;
  switch (p.toLowerCase()) {
    case 'p': {
      const d = isWhite(p) ? -1 : 1;
      return dr === d && Math.abs(dc) === 1;
    }
    case 'n': return Math.abs(dr*dc) === 2;
    case 'b': return Math.abs(dr) === Math.abs(dc) && pathClear(b, sr, sc, er, ec);
    case 'r': return (dr === 0 || dc === 0) && pathClear(b, sr, sc, er, ec);
    case 'q': return (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) && pathClear(b, sr, sc, er, ec);
    case 'k': return Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
  }
  return false;
}

function squareAttackedBy(b, r, c, byColor){
  for (let i=0;i<8;i++) for (let j=0;j<8;j++) {
    const p = b[i][j];
    if (p === '.') continue;
    if ((isWhite(p)?'white':'black') === byColor && attacks(b, i, j, r, c)) return true;
  }
  return false;
}

function findKing(b, color){
  const t = color === 'white' ? 'K' : 'k';
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (b[r][c] === t) return {r,c};
  return null;
}

function kingInCheck(b, color){
  const k = findKing(b, color);
  if (!k) return false;
  const enemy = color === 'white' ? 'black' : 'white';
  return squareAttackedBy(b, k.r, k.c, enemy);
}

function countAttackersDefenders(b, r, c){
  const p = b[r][c];
  if (p === '.') return {atk:0, def:0, color:null};
  const color = isWhite(p) ? 'white' : 'black';
  let atk = 0, def = 0;
  for (let i=0;i<8;i++) for (let j=0;j<8;j++) {
    const q = b[i][j];
    if (q === '.') continue;
    if (!attacks(b, i, j, r, c)) continue;
    const qc = isWhite(q) ? 'white' : 'black';
    if (qc !== color) atk++;
    else if (!(i===r && j===c)) def++;
  }
  return {atk, def, color};
}

function legalPseudoMove(s, sr, sc, er, ec){
  const b = s.board;
  if (!inBounds(er, ec)) return false;
  const p = b[sr][sc];
  if (p === '.') return false;
  const t = b[er][ec];
  if (t !== '.' && isWhite(p) === isWhite(t)) return false;
  const dr = er - sr;
  const dc = ec - sc;

  switch (p.toLowerCase()) {
    case 'p': {
      const d = isWhite(p) ? -1 : 1;
      if (dc === 0 && dr === d && t === '.') return true;
      if (dc === 0 && dr === 2*d && t === '.') {
        const startRow = isWhite(p) ? 6 : 1;
        if (sr !== startRow) return false;
        if (b[sr + d][sc] !== '.') return false;
        return true;
      }
      if (Math.abs(dc) === 1 && dr === d) {
        if (t !== '.') return true;
        if (s.enPassant && er === s.enPassant.r && ec === s.enPassant.c) return true;
      }
      return false;
    }
    case 'n': return Math.abs(dr*dc) === 2;
    case 'b': return Math.abs(dr) === Math.abs(dc) && pathClear(b, sr, sc, er, ec);
    case 'r': return (dr === 0 || dc === 0) && pathClear(b, sr, sc, er, ec);
    case 'q': return (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) && pathClear(b, sr, sc, er, ec);
    case 'k': {
      if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) return true;
      if (dr === 0 && Math.abs(dc) === 2) {
        const side = dc > 0 ? 'K' : 'Q';
        const rightsKey = (isWhite(p) ? 'W' : 'B') + side;
        if (!s.castling || !s.castling[rightsKey]) return false;
        const rookCol = side === 'K' ? 7 : 0;
        const rook = b[sr][rookCol];
        if (rook === '.' || rook.toLowerCase() !== 'r' || isWhite(rook) !== isWhite(p)) return false;
        const step = dc > 0 ? 1 : -1;
        for (let cc = sc + step; cc !== rookCol; cc += step) if (b[sr][cc] !== '.') return false;
        const enemy = isWhite(p) ? 'black' : 'white';
        if (squareAttackedBy(b, sr, sc, enemy)) return false;
        if (squareAttackedBy(b, sr, sc + step, enemy)) return false;
        if (squareAttackedBy(b, er, ec, enemy)) return false;
        return true;
      }
      return false;
    }
  }
  return false;
}

function makeMove(s, m){
  const b = s.board;
  const p = b[m.sr][m.sc];
  const t = b[m.er][m.ec];

  if (p.toLowerCase() === 'p' && s.enPassant && m.er === s.enPassant.r && m.ec === s.enPassant.c && t === '.') {
    b[m.sr][m.ec] = '.';
  }

  if (p.toLowerCase() === 'k' && Math.abs(m.ec - m.sc) === 2) {
    if (m.ec === 6) { b[m.sr][5] = b[m.sr][7]; b[m.sr][7] = '.'; }
    else { b[m.sr][3] = b[m.sr][0]; b[m.sr][0] = '.'; }
  }

  b[m.er][m.ec] = p;
  b[m.sr][m.sc] = '.';

  if (p.toLowerCase() === 'p' && (m.er === 0 || m.er === 7)) {
    const choice = (m.promo || 'Q').toUpperCase();
    b[m.er][m.ec] = isWhite(p) ? choice : choice.toLowerCase();
  }

  s.enPassant = null;
  if (p.toLowerCase() === 'p' && Math.abs(m.er - m.sr) === 2) {
    s.enPassant = { r: (m.sr + m.er) / 2, c: m.sc };
  }

  if (s.castling) {
    if (p === 'K') { s.castling.WK = false; s.castling.WQ = false; }
    if (p === 'k') { s.castling.BK = false; s.castling.BQ = false; }
    if (p.toLowerCase() === 'r') {
      if (m.sr === 7 && m.sc === 0) s.castling.WQ = false;
      if (m.sr === 7 && m.sc === 7) s.castling.WK = false;
      if (m.sr === 0 && m.sc === 0) s.castling.BQ = false;
      if (m.sr === 0 && m.sc === 7) s.castling.BK = false;
    }
    if (t.toLowerCase && t.toLowerCase() === 'r') {
      if (m.er === 7 && m.ec === 0) s.castling.WQ = false;
      if (m.er === 7 && m.ec === 7) s.castling.WK = false;
      if (m.er === 0 && m.ec === 0) s.castling.BQ = false;
      if (m.er === 0 && m.ec === 7) s.castling.BK = false;
    }
  }

  s.turn = s.turn === 'white' ? 'black' : 'white';
}

function validMove(s, sr, sc, er, ec, promo){
  if (!legalPseudoMove(s, sr, sc, er, ec)) return false;
  const p = s.board[sr][sc];
  const me = isWhite(p) ? 'white' : 'black';
  const snap = clone(s);
  makeMove(s, {sr,sc,er,ec,promo});
  const bad = kingInCheck(s.board, me);
  s.board = snap.board;
  s.turn = snap.turn;
  s.enPassant = snap.enPassant;
  s.castling = snap.castling;
  return !bad;
}

function listMoves(s, allowPromo=true){
  const moves = [];
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = s.board[r][c];
    if (p === '.') continue;
    if ((isWhite(p)?'white':'black') !== s.turn) continue;
    for (let er=0;er<8;er++) for (let ec=0;ec<8;ec++) {
      if (!legalPseudoMove(s, r, c, er, ec)) continue;
      if (allowPromo && p.toLowerCase()==='p' && (er===0 || er===7)) {
        for (const promo of ['Q','N']) {
          if (validMove(s, r, c, er, ec, promo)) moves.push({sr:r,sc:c,er,ec,promo});
        }
      } else {
        if (validMove(s, r, c, er, ec, null)) moves.push({sr:r,sc:c,er,ec});
      }
    }
  }
  return moves;
}

function evalCp(s){
  let score = 0;
  const b = s.board;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    const p = b[r][c];
    if (p === '.') continue;
    const v = VAL[p.toLowerCase()] || 0;
    score += isWhite(p) ? v : -v;
  }

  for (const color of ['white','black']) {
    const k = findKing(b, color);
    if (!k) continue;
    const enemy = color==='white'?'black':'white';
    let danger = 0;
    for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
      if (dr===0 && dc===0) continue;
      const rr=k.r+dr, cc=k.c+dc;
      if (!inBounds(rr,cc)) continue;
      if (squareAttackedBy(b, rr, cc, enemy)) danger++;
    }
    if (kingInCheck(b, color)) danger += 3;
    const pen = danger * 18;
    score += (color==='white') ? -pen : pen;
  }

  return score;
}

function depthForTier(elo, tier){
  if (tier === 'beginner') {
    return elo < 550 ? 2 : 3;
  }
  if (tier === 'club') {
    return elo < 950 ? 3 : 4;
  }
  return 4;
}

function ratesForTier(elo, tier){
  if (tier === 'beginner') {
    return {
      blunder: 0.18,
      greedyCapture: 0.35,
      queenHang: 0.06,
      noise: 70
    };
  }

if (tier === 'club') {
  // clamp Elo into expected range just in case
  const e = Math.max(699, Math.min(1200, elo));
  const t = (e - 699) / 500; // 0 → 1

  return {
    blunder: 0.10 - (0.06 * t),        // 0.10 → 0.04
    greedyCapture: 0.22 - (0.08 * t),  // 0.22 → 0.14
    queenHang: 0.00,
    noise: 34 - (16 * t)               // 34 → 18
  };
}

return {
  blunder: 0.08,
  greedyCapture: 0.12,
  queenHang: 0.00,
  noise: 18
};

}

function minimax(s, depth, alpha, beta){
  if (stopped) return {score: evalCp(s)};
  const moves = listMoves(s, true);
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0 && kingInCheck(s.board, s.turn)) {
      return {score: (s.turn === 'white') ? -99999 : 99999};
    }
    return {score: evalCp(s)};
  }

  const maximizing = (s.turn === 'white');
  let bestMove = null;

  if (maximizing) {
    let best = -1e9;
    for (const m of moves) {
      const snap = clone(s);
      makeMove(s, m);
      const res = minimax(s, depth-1, alpha, beta);
      s.board = snap.board;
      s.turn = snap.turn;
      s.enPassant = snap.enPassant;
      s.castling = snap.castling;
      if (res.score > best) { best = res.score; bestMove = m; }
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
      if (stopped) break;
    }
    return {score: best, move: bestMove};
  } else {
    let best = 1e9;
    for (const m of moves) {
      const snap = clone(s);
      makeMove(s, m);
      const res = minimax(s, depth-1, alpha, beta);
      s.board = snap.board;
      s.turn = snap.turn;
      s.enPassant = snap.enPassant;
      s.castling = snap.castling;
      if (res.score < best) { best = res.score; bestMove = m; }
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
      if (stopped) break;
    }
    return {score: best, move: bestMove};
  }
}

function findQueenSquare(b, color){
  const q = color==='white'?'Q':'q';
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (b[r][c]===q) return {r,c};
  return null;
}

function moveCaptures(b, m){
  const t = b[m.er][m.ec];
  if (t !== '.') return t;
  const p = b[m.sr][m.sc];
  if (p.toLowerCase()==='p' && m.sc !== m.ec) return 'p';
  return '.';
}

function moveHangsOwnQueen(s0, m){
  const me = s0.turn;
  const s = clone(s0);
  makeMove(s, m);

  const q = findQueenSquare(s.board, me);
  if (!q) return false;

  const {atk, def} = countAttackersDefenders(s.board, q.r, q.c);
  return atk > 0 && def === 0;
}

function chooseMove(stateIn, elo, tier = 'beginner'){
  const s0 = clone(stateIn);
  const depth = depthForTier(elo, tier);
  const rates = ratesForTier(elo, tier);
  let moves = listMoves(s0, true);
  if (!moves.length) return {move:null, score:0};

  if (tier === 'club') {
    const safer = moves.filter(m => !moveHangsOwnQueen(s0, m));
    if (safer.length) moves = safer;
  }

  if (tier === 'beginner' && Math.random() < rates.greedyCapture) {
    const caps = moves
      .map(m => ({m, cap: moveCaptures(s0.board, m)}))
      .filter(x => x.cap !== '.')
      .map(x => ({m:x.m, v: VAL[x.cap.toLowerCase()] || 0}))
      .sort((a,b)=>b.v-a.v);
    if (caps.length) {
      const pick = caps[Math.floor(Math.random() * Math.min(3, caps.length))].m;
      return {move: pick, score: 0};
    }
  }

  const res = minimax(s0, depth, -1e9, 1e9);
  let bestMove = res.move || moves[0];
  let bestScore = res.score;
  bestScore += (Math.random()*2-1) * rates.noise;

  if (tier === 'beginner' && Math.random() < rates.queenHang) {
    const hangMoves = moves.filter(m => moveHangsOwnQueen(s0, m));
    if (hangMoves.length) {
      return {move: hangMoves[Math.floor(Math.random()*hangMoves.length)], score: 0};
    }
  }

  if (Math.random() < rates.blunder) {
    const scored = [];
    for (const m of moves) {
      const s = clone(s0);
      makeMove(s, m);
      const sc = evalCp(s);
      scored.push({m, sc});
    }
    scored.sort((a,b)=> (s0.turn==='white' ? b.sc-a.sc : a.sc-b.sc));

    if (tier === 'beginner') {
      const start = Math.floor(scored.length * 0.70);
      const pool = scored.slice(start);
      if (pool.length) {
        return {move: pool[Math.floor(Math.random()*pool.length)].m, score: 0};
      }
    }

    if (tier === 'club') {
      const start = Math.floor(scored.length * 0.50);
      const end = Math.max(start + 1, Math.floor(scored.length * 0.80));
      const pool = scored.slice(start, end);
      if (pool.length) {
        return {move: pool[Math.floor(Math.random()*pool.length)].m, score: 0};
      }
    }
  }

  return {move: bestMove, score: bestScore};
}

