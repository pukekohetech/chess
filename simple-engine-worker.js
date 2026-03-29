/*
  simple-engine-worker.js
  Legal chess engine for Elo < 600
*/

let stopped = false;

onmessage = (e) => {
  const { type, state } = e.data;
  if (type === 'stop') {
    stopped = true;
    return;
  }
  if (type === 'search') {
    stopped = false;
    const move = findBestMove(state);
    if (!stopped) postMessage({ type: 'result', move });
  }
};

const VAL = { p:100, n:320, b:330, r:500, q:900, k:0 };
const isWhite = p => p === p.toUpperCase();

/* ======================
   Utilities
====================== */

function clone(s){
  return { board: s.board.map(r=>r.slice()), turn: s.turn };
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

/* ======================
   Move legality
====================== */

function isLegalMove(b, sr, sc, er, ec){
  if (!inBounds(er,ec)) return false;
  const p = b[sr][sc];
  const t = b[er][ec];
  if (p === '.') return false;
  if (t !== '.' && isWhite(p) === isWhite(t)) return false;

  const dr = er - sr;
  const dc = ec - sc;

  switch (p.toLowerCase()) {
    case 'p': {
      const dir = isWhite(p) ? -1 : 1;
      if (dc === 0 && dr === dir && t === '.') return true;
      if (Math.abs(dc) === 1 && dr === dir && t !== '.') return true;
      return false;
    }
    case 'n':
      return Math.abs(dr*dc) === 2;
    case 'b':
      return Math.abs(dr) === Math.abs(dc) && pathClear(b, sr, sc, er, ec);
    case 'r':
      return (dr === 0 || dc === 0) && pathClear(b, sr, sc, er, ec);
    case 'q':
      return (
        (dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc)) &&
        pathClear(b, sr, sc, er, ec)
      );
    case 'k':
      return Math.abs(dr) <= 1 && Math.abs(dc) <= 1;
  }
  return false;
}

/* ======================
   Move generation
====================== */

function generateMoves(s){
  const moves = [];
  const b = s.board;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const p = b[r][c];
    if (p==='.' || (isWhite(p)?'white':'black') !== s.turn) continue;
    for (let er=0;er<8;er++) for (let ec=0;ec<8;ec++){
      if (isLegalMove(b,r,c,er,ec)) {
        moves.push({ sr:r, sc:c, er, ec });
      }
    }
  }
  return moves;
}

function makeMove(s,m){
  s.board[m.er][m.ec] = s.board[m.sr][m.sc];
  s.board[m.sr][m.sc] = '.';
  s.turn = s.turn === 'white' ? 'black' : 'white';
}

/* ======================
   Evaluation + search
====================== */

function evalCp(s){
  let score = 0;
  for (let r=0;r<8;r++) for (let c=0;c<8;c++){
    const p = s.board[r][c];
    if (p !== '.') score += isWhite(p) ? VAL[p.toLowerCase()] : -VAL[p.toLowerCase()];
  }
  return score;
}

function findBestMove(state){
  let best = null;
  let bestScore = state.turn === 'white' ? -1e9 : 1e9;

  for (const m of generateMoves(state)){
    const s = clone(state);
    makeMove(s,m);
    const sc = evalCp(s);
    if (state.turn === 'white' ? sc > bestScore : sc < bestScore){
      bestScore = sc;
      best = m;
    }
  }
  return best;
}
