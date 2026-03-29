# Chess — Stockfish 16 Offline + Elo Slider (400–3190)

## UI
- Shows Elo all the way down to **400**.
- Below **1320**, the displayed Elo is an approximation (Stockfish itself usually limits UCI_Elo to ~1320–3190).
- Under the hood, the app uses Stockfish `Skill Level` for those lower Elo values.

## Required engine files
Keep these next to `index.html`:
- stockfish-nnue-16-single.js
- stockfish-nnue-16-single.wasm

## Deploy
Upload `index.html`, `style.css`, `chess.js` and keep the engine files alongside.
