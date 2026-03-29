# Training packs (multi-file)

This build supports loading **multiple openings/tactics JSON files**.

## Repo loading (automatic merge)

Create these files in your repo:

- `data/openings/index.json`
- `data/tactics/index.json`

Each index contains a `files` list of pack JSON filenames.

Example:

```json
{ "version": 1, "files": ["italian.json", "ruy_lopez.json"] }
```

Each pack file can contain either:

- `{ "openings": [ ... ] }`  (for openings packs)
- `{ "tactics":  [ ... ] }`  (for tactics packs)

The app merges all packs into one list.

## Backward compatibility

If the index files are missing, the app will fall back to:

- `openings.json`
- `tactics.json`

## Upload loading (automatic merge)

The file pickers now accept **multiple files**. Select one or more openings JSON files and one or more tactics JSON files, then click **Use uploaded**.
