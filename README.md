# Chess — Stockfish 16 (Single-threaded, Offline)

This is your original chess app upgraded to use Stockfish 16 **single-threaded** as a Web Worker.

## Required engine files (place next to index.html)
- stockfish-nnue-16-single.js
- stockfish-nnue-16-single.wasm

These are distributed with Stockfish.js builds; once placed, the app works offline.

## GitHub Pages
Upload all files in this ZIP plus the two engine files into `/chess/`.

## Local test
Run a local server (recommended):
- Python: `python -m http.server 8000`
- Open: `http://localhost:8000`

## Notes
- Hint and AI use opening book first (optional), otherwise Stockfish.
- If the engine files are missing, you'll see a Stockfish warning in the UI.
