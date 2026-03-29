// Stockfish-powered chess (simplified demo integration)

let stockfish;

function initStockfish() {
  stockfish = new Worker('https://cdn.jsdelivr.net/npm/stockfish@16/stockfish.js');

  stockfish.onmessage = (e) => {
    const line = e.data;
    console.log('[Stockfish]', line);

    if (line.startsWith('bestmove')) {
      const move = line.split(' ')[1];
      alert('Stockfish best move: ' + move);
    }
  };

  stockfish.postMessage('uci');
  stockfish.postMessage('isready');
}

document.getElementById('aiMoveBtn').addEventListener('click', () => {
  if (!stockfish) initStockfish();

  stockfish.postMessage('position startpos');
  stockfish.postMessage('go depth 12');
});

initStockfish();
