/*
  simple-engine-worker.js
  Simple chess engine for Elo < 600
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
    const move = search(state);
    if (!stopped) postMessage({ type: 'result', move });
  }
};

const VAL = { p:100, n:320, b:330, r:500, q:900, k:0 };
const isWhite = p => p === p.toUpperCase();

function clone(s){
  return { board: s.board.map(r=>r.slice()), turn: s.turn };
}

function evalCp(s){
  let sum = 0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p=s.board[r][c];
    if(p!=='.') sum += isWhite(p)?VAL[p.toLowerCase()]:-VAL[p.toLowerCase()];
  }
  return sum;
}

function genMoves(s){
  const out=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=s.board[r][c];
    if(p==='.'||(isWhite(p)?'white':'black')!==s.turn) continue;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
      const er=r+dr, ec=c+dc;
      if(er>=0&&er<8&&ec>=0&&ec<8) out.push({sr:r,sc:c,er,ec});
    }
  }
  return out;
}

function make(s,m){
  s.board[m.er][m.ec]=s.board[m.sr][m.sc];
  s.board[m.sr][m.sc]='.';
  s.turn = s.turn==='white'?'black':'white';
}

function search(state){
  let best=null;
  let bestScore = state.turn==='white'?-1e9:1e9;
  for(const m of genMoves(state)){
    const s=clone(state);
    make(s,m);
    const sc=evalCp(s);
    if(state.turn==='white'?sc>bestScore:sc<bestScore){
      bestScore=sc; best=m;
    }
  }
  return best;
}
