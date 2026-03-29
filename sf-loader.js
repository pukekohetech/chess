// sf-loader.js (same-origin)
// This worker exists to avoid cross-origin Worker restrictions on some hosts.
// It loads Stockfish inside the worker via importScripts.
importScripts('https://cdn.jsdelivr.net/npm/stockfish@16/stockfish.js');
