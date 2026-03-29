# Packs included

This zip adds starter packs so Training loads immediately.

## Openings
- data/openings/starter.json

## Tactics
- data/tactics/starter.json (4 example puzzles)

## Make tactics extensive
Download the Lichess puzzle database (CC0) and convert it to packs:

1) Download: https://database.lichess.org/#puzzles
2) Decompress .zst to .csv (requires zstd)
3) Run:
   python tools/lichess_csv_to_tactics_packs.py lichess_db_puzzle.csv --out data/tactics --chunk 5000

Then commit the generated files and update `data/tactics/index.json`.
