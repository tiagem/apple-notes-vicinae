# Apple Notes for Vicinae (macOS only)

Create, view, edit, and render Markdown from your on-device Apple Notes.

## Commands

- **Search Notes** (`search-notes`): fuzzy search across titles/snippets, folder filter, pinned section, Recently Deleted + restore, special keywords (`checklist`, `locked`, `shared`…), sorting, side Markdown preview, full-note Detail view with tags/links/backlinks, edit/append/move/duplicate/delete, copy as Markdown/HTML/plain/link, folder export, open in Notes. Locked notes are metadata-only.
- **New Note** (`create-note`): title + Markdown body + folder picker + templates (clipboard prefill), written to Notes via AppleScript.
- **Move Note** (`move-note`): pick a note, pick the destination folder.
- **View Selected Note** (`view-selected-note`): shows the note currently selected in Notes.app.
- **Export Notes** (`export-notes`): export a whole folder to `.md` files (locked notes are skipped).
- **Manage Templates** (`manage-templates`): create, edit and delete your own note templates (stored locally via LocalStorage). Placeholders: `{{date}}`, `{{time}}`, `{{datetime}}`, `{{year}}`.

## How it works (on-device only)

- **Reads (fast):** direct SQLite queries against `~/Library/Group Containers/group.com.apple.notes/NoteStore.sqlite` via the system `sqlite3` CLI. Falls back to JXA (`osascript -l JavaScript`) when the DB is unavailable.
- **Note bodies:** fetched via Notes AppleScript (`body` HTML → converted to Markdown for preview).
- **Writes:** AppleScript only (`make new note`, `set body`, `delete`). Never writes to SQLite directly.
- **Markdown:** lightweight built-in converters - HTML→Markdown for rendering in `List.Item.Detail` / `Detail`, Markdown→HTML for saving.

No network, no sync service, no extra npm dependencies.

## Requirements (macOS)

1. macOS with Notes.app.
2. **Full Disk Access** for your terminal (to read `NoteStore.sqlite`):
   System Settings → Privacy & Security → Full Disk Access → add Terminal (or iTerm/Ghostty/etc.).
3. **Automation** permission for your terminal → Notes (prompted on first write/body fetch):
   System Settings → Privacy & Security → Automation.

If reads fail you get an EmptyView explaining FDA with a Reload action; creation still works via AppleScript.

## Preferences

- `maxResults` (default `100`): notes loaded from DB.
- `defaultFolder` (default `Notes`): target folder for new notes.
- `showDetailByDefault` (default `true`): side Markdown preview.

## Development

```bash
npm install
npm run dev    # with Vicinae running
npm run build
npm run lint   # vici manifest + tsc + eslint + prettier --check
```

Style is enforced by pre-commit (`lint-staged`: eslint --fix + prettier on staged
files), `tsconfig` strict + `noUnusedLocals`/`noUnusedParameters`, and
`.editorconfig`. Fixers: `npm run lint:js:fix`, `npm run format:fix`.
