# Training packs (multi-file)

This build supports loading **multiple openings/tactics JSON files**.

## Repo loading (automatic merge)

Preferred layout:

- `data/openings/index.json`
- `data/tactics/index.json`

Each index contains a `files` list of pack JSON filenames.

Example:

```json
{ "version": 1, "files": ["italian.json", "ruy_lopez.json"] }
```

Each pack file contains:

- `{ "openings": [ ... ] }`  (openings packs)
- `{ "tactics":  [ ... ] }`  (tactics packs)

### Important
If an index exists but `files` is empty, the app will fall back to legacy files:
- `data/openings.json` or `openings.json`
- `data/tactics.json` or `tactics.json`

## Upload loading (automatic merge)

The file pickers accept **multiple files**. Select one or more openings files and one or more tactics files, then click **Use uploaded**.
