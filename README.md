# Chess — Stockfish (GitHub Pages fix)

Your site is hosted on GitHub Pages. Browsers often block constructing a Worker directly from a different origin (e.g., jsDelivr).

This build fixes that by creating the worker from **sf-loader.js** (same origin) and then loading Stockfish inside the worker using `importScripts()`.

## Deploy
Upload these files into your `/chess/` folder in the repo:
- index.html
- style.css
- chess.js
- sf-loader.js

## Test
Open your GitHub Pages URL. Try:
- Enable "Play vs Computer"
- Click "Hint ✨" after a couple moves

If it still fails, check DevTools → Console.
