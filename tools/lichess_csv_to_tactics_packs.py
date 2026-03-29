#!/usr/bin/env python3
"""Convert Lichess puzzle CSV (decompressed) into tactics JSON packs for this app.

Input: lichess_db_puzzle.csv (from https://database.lichess.org/#puzzles)
Output:
- data/tactics/<pack>.json
- data/tactics/index.json

Usage:
  python tools/lichess_csv_to_tactics_packs.py lichess_db_puzzle.csv --out data/tactics --chunk 5000

Notes:
- CSV fields: PuzzleId,FEN,Moves,Rating,...,Themes,GameUrl,... (Moves are UCI) 
- This app expects: id,title,fen,sideToMove,solutionUci,themes,rating,gameUrl
"""

import argparse, csv, json, os, math


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('csv_path')
    ap.add_argument('--out', default='data/tactics')
    ap.add_argument('--chunk', type=int, default=5000, help='puzzles per file')
    ap.add_argument('--min-rating', type=int, default=0)
    ap.add_argument('--max-rating', type=int, default=4000)
    ap.add_argument('--theme', default='', help='optional: only include puzzles containing this theme (e.g. fork)')
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)

    theme = args.theme.strip().lower()

    puzzles = []
    with open(args.csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                rating = int(row.get('Rating') or 0)
            except ValueError:
                continue
            if rating < args.min_rating or rating > args.max_rating:
                continue
            themes = (row.get('Themes') or '').split()
            if theme and theme not in [t.lower() for t in themes]:
                continue
            fen = row.get('FEN') or ''
            moves = (row.get('Moves') or '').split()
            if not fen or not moves:
                continue
            # sideToMove is the second field of FEN (w/b)
            parts = fen.split()
            stm = parts[1] if len(parts) > 1 else 'w'

            puzzles.append({
                'id': row.get('PuzzleId') or '',
                'title': 'Lichess puzzle',
                'fen': fen,
                'sideToMove': 'w' if stm == 'w' else 'b',
                'solutionUci': moves,
                'themes': themes,
                'rating': rating,
                'gameUrl': row.get('GameUrl') or ''
            })

    if not puzzles:
        raise SystemExit('No puzzles selected. Check your filters and CSV path.')

    # write chunks
    total = len(puzzles)
    files = []
    nfiles = math.ceil(total / args.chunk)
    for i in range(nfiles):
        chunk = puzzles[i*args.chunk:(i+1)*args.chunk]
        name = f'lichess_{args.min_rating}-{args.max_rating}_{i+1:03d}.json'
        out_path = os.path.join(args.out, name)
        with open(out_path, 'w', encoding='utf-8') as out:
            json.dump({'version': 1, 'pack': name, 'tactics': chunk}, out, indent=2)
        files.append(name)

    # update manifest
    idx_path = os.path.join(args.out, 'index.json')
    with open(idx_path, 'w', encoding='utf-8') as out:
        json.dump({'version': 1, 'files': files}, out, indent=2)

    print(f'Wrote {total} puzzles into {len(files)} pack files and updated {idx_path}')


if __name__ == '__main__':
    main()
