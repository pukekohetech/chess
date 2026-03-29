# Chess — Stockfish 16 Offline + Strength Slider

## What you get
- A clearer strength slider with a big readout.
- Slider supports **very low** levels using Stockfish `Skill Level` (0–20).
- For higher values it switches to Elo limiter (`UCI_LimitStrength` + `UCI_Elo`).

## Notes
Stockfish `UCI_Elo` typically supports **1320–3190**. Below that, the app uses `Skill Level` instead.

## Required engine files
Keep these next to `index.html`:
- stockfish-nnue-16-single.js
- stockfish-nnue-16-single.wasm

## Deploy
Upload `index.html`, `style.css`, `chess.js` and keep the engine files alongside.
