import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, release } from "node:os";
import { join } from "node:path";

export const NOTES_DB = join(homedir(), "Library/Group Containers/group.com.apple.notes/NoteStore.sqlite");

export type AppleNote = {
  id: string;
  pk: number | null;
  uuid: string;
  title: string;
  snippet: string;
  folder: string;
  account: string;
  modifiedAt: Date | null;
  createdAt: Date | null;
  locked: boolean;
  pinned: boolean;
  checklist: boolean;
  checklistInProgress: boolean;
  shared: boolean;
  invitationLink: string | null;
  tags: string[];
  url: string;
};

export type AppleFolder = {
  account: string;
  folder: string;
};

export type NoteLink = {
  id: string;
  text: string | null;
  url: string | null;
};

export type NoteBacklink = {
  id: string;
  title: string;
  url: string;
};

export type NoteExtras = {
  tags: string[];
  links: NoteLink[];
  backlinks: NoteBacklink[];
};

export type NoteSortBy = "modified" | "created" | "title";
export type NoteSortOrder = "asc" | "desc";

export type NoteFilters = {
  checklist?: boolean;
  checklistState?: "progress" | "done";
  locked?: boolean;
  shared?: boolean;
};

export class FullDiskAccessError extends Error {
  constructor() {
    super(
      "Cannot read Apple Notes database. Grant Full Disk Access to your terminal (System Settings → Privacy & Security → Full Disk Access), then reload.",
    );
    this.name = "FullDiskAccessError";
  }
}

export class LockedNoteError extends Error {
  constructor(title = "Note") {
    super(
      `"${title}" is locked. Unlock it in Notes.app first - locked notes cannot be viewed, edited or deleted here.`,
    );
    this.name = "LockedNoteError";
  }
}

/** True when the note is password-protected. Unknown when the DB can't be read (fail-open for JXA fallback). */
export async function isNoteLocked(id: string): Promise<boolean> {
  const pk = coreDataIdToPk(id);

  if (pk == null || !existsSync(NOTES_DB)) {
    return false;
  }

  try {
    const rows = await runSqliteJson<{ locked: number | null }>(
      NOTES_DB,
      `SELECT (ZISPASSWORDPROTECTED = 1) AS locked FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK = ${pk} LIMIT 1;`,
    );

    return rows[0]?.locked === 1;
  } catch {
    return false;
  }
}

export async function assertNoteUnlocked(id: string, title = "Note"): Promise<void> {
  if (await isNoteLocked(id)) {
    throw new LockedNoteError(title);
  }
}

export function escapeDoubleQuotes(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function escapeSQLString(value: string): string {
  return value.replace(/'/g, "''");
}

function execFileAsync(
  file: string,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: options?.timeout ?? 30_000,
        maxBuffer: options?.maxBuffer ?? 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as Error & { code?: unknown; stdout?: string; stderr?: string };
          (err as { stdout?: string }).stdout = stdout;
          (err as { stderr?: string }).stderr = stderr;
          reject(error);

          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

export async function runAppleScript(script: string, timeoutMs = 30_000): Promise<string> {
  // Absolute path first: the extension host may run with a minimal PATH.
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: timeoutMs });

    return stdout.trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      const { stdout } = await execFileAsync("osascript", ["-e", script], { timeout: timeoutMs });

      return stdout.trim();
    }
    throw error;
  }
}

export async function runJXA(script: string, timeoutMs = 30_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
      timeout: timeoutMs,
    });

    return stdout.trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      const { stdout } = await execFileAsync("osascript", ["-l", "JavaScript", "-e", script], {
        timeout: timeoutMs,
      });

      return stdout.trim();
    }
    throw error;
  }
}

async function runSqliteJson<T>(dbPath: string, query: string): Promise<T[]> {
  let stdout: string;

  try {
    ({ stdout } = await execFileAsync("/usr/bin/sqlite3", ["-json", dbPath, query], { timeout: 15_000 }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      try {
        ({ stdout } = await execFileAsync("sqlite3", ["-json", dbPath, query], { timeout: 15_000 }));
      } catch (inner) {
        throw classifySqliteError(inner);
      }
    } else {
      throw classifySqliteError(error);
    }
  }

  try {
    const trimmed = stdout.trim();

    if (!trimmed) {
      return [];
    }

    return JSON.parse(trimmed) as T[];
  } catch {
    throw new Error("Could not parse Notes database output. Is `sqlite3` up to date?");
  }
}

function classifySqliteError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  const stderr = error instanceof Error && "stderr" in error ? String((error as { stderr?: string }).stderr ?? "") : "";
  const combined = `${message}\n${stderr}`;

  if (
    combined.includes("Operation not permitted") ||
    combined.includes("unable to open database") ||
    combined.includes("disk I/O error") ||
    combined.includes("not authorized")
  ) {
    return new FullDiskAccessError();
  }

  return error;
}

const APPLE_EPOCH_OFFSET = 978307200;

export function appleTimestampToDate(value: number | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);

  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }

  return new Date((num + APPLE_EPOCH_OFFSET) * 1000);
}

export function getOpenNoteURL(uuid: string): string {
  const major = parseInt(release().split(".")[0] ?? "0", 10);
  const scheme = major >= 23 ? "applenotes" : "notes";

  return `${scheme}://showNote?identifier=${uuid}`;
}

type NoteRow = {
  id: string;
  pk: number;
  title: string | null;
  folder: string | null;
  modifiedAt: number | null;
  createdAt: number | null;
  snippet: string | null;
  account: string | null;
  UUID: string | null;
  locked: number | null;
  pinned: number | null;
  checklist: number | null;
  checklistInProgress: number | null;
};

function rowToNote(row: NoteRow): AppleNote {
  const uuid = row.UUID ?? "";

  return {
    id: row.id,
    pk: typeof row.pk === "number" ? row.pk : null,
    uuid,
    title: row.title ?? "Untitled",
    snippet: row.snippet ?? "",
    folder: row.folder ?? "",
    account: row.account ?? "",
    modifiedAt: appleTimestampToDate(row.modifiedAt),
    createdAt: appleTimestampToDate(row.createdAt),
    locked: row.locked === 1,
    pinned: row.pinned === 1,
    checklist: row.checklist === 1,
    checklistInProgress: row.checklistInProgress === 1,
    shared: false,
    invitationLink: null,
    tags: [],
    url: uuid ? getOpenNoteURL(uuid) : "",
  };
}

function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function listNotes(options?: {
  search?: string;
  limit?: number;
  sortBy?: NoteSortBy;
  sortOrder?: NoteSortOrder;
  filters?: NoteFilters;
  includeTrashed?: boolean;
}): Promise<AppleNote[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 5000, 10000));
  const search = options?.search?.trim() ?? "";

  if (!existsSync(NOTES_DB)) {
    return listNotesViaJXA(search, limit);
  }

  try {
    return await listNotesViaSQLite(search, limit, options);
  } catch (error) {
    if (error instanceof FullDiskAccessError) {
      throw error;
    }

    return listNotesViaJXA(search, limit);
  }
}

function orderByClause(sortBy: NoteSortBy = "modified", sortOrder: NoteSortOrder = "desc"): string {
  const dir = sortOrder === "asc" ? "ASC" : "DESC";

  if (sortBy === "title") {
    return `ORDER BY note.ZTITLE1 COLLATE NOCASE ${dir}`;
  }

  if (sortBy === "created") {
    return `ORDER BY COALESCE(note.ZCREATIONDATE1, note.ZCREATIONDATE, 0) ${dir}`;
  }

  return `ORDER BY note.ZMODIFICATIONDATE1 ${dir}`;
}

function filterClause(filters?: NoteFilters): string {
  if (!filters) {
    return "";
  }
  let out = "";

  if (filters.checklist) {
    out += " AND note.ZHASCHECKLIST = 1";
  }

  if (filters.checklistState === "progress") {
    out += " AND note.ZHASCHECKLISTINPROGRESS = 1";
  }

  if (filters.checklistState === "done") {
    out += " AND note.ZHASCHECKLIST = 1 AND COALESCE(note.ZHASCHECKLISTINPROGRESS, 0) != 1";
  }

  if (filters.locked) {
    out += " AND note.ZISPASSWORDPROTECTED = 1";
  }

  return out;
}

async function listNotesViaSQLite(
  search: string,
  limit: number,
  options?: { sortBy?: NoteSortBy; sortOrder?: NoteSortOrder; filters?: NoteFilters; includeTrashed?: boolean },
): Promise<AppleNote[]> {
  const hasSearch = search.length > 0;
  const escaped = escapeSQLString(normalizeForSearch(search));
  const searchFilter = hasSearch
    ? ` AND (LOWER(note.ZTITLE1) LIKE '%${escaped}%' OR LOWER(note.ZSNIPPET) LIKE '%${escaped}%')`
    : "";
  const trashed = options?.includeTrashed
    ? "COALESCE(folder.ZFOLDERTYPE, 0) = 1"
    : "COALESCE(folder.ZFOLDERTYPE, 0) != 1";

  const query = `
    SELECT
      'x-coredata://' || zmd.Z_UUID || '/ICNote/p' || note.Z_PK AS id,
      note.Z_PK AS pk,
      note.ZTITLE1 AS title,
      folder.ZTITLE2 AS folder,
      note.ZMODIFICATIONDATE1 AS modifiedAt,
      COALESCE(note.ZCREATIONDATE1, note.ZCREATIONDATE, 0) AS createdAt,
      note.ZSNIPPET AS snippet,
      acc.ZNAME AS account,
      note.ZIDENTIFIER AS UUID,
      (note.ZISPASSWORDPROTECTED = 1) AS locked,
      (note.ZISPINNED = 1) AS pinned,
      (note.ZHASCHECKLIST = 1) AS checklist,
      (note.ZHASCHECKLISTINPROGRESS = 1) AS checklistInProgress
    FROM ZICCLOUDSYNCINGOBJECT AS note
    INNER JOIN ZICCLOUDSYNCINGOBJECT AS folder ON note.ZFOLDER = folder.Z_PK
    LEFT JOIN ZICCLOUDSYNCINGOBJECT AS acc ON note.ZACCOUNT4 = acc.Z_PK
    LEFT JOIN Z_METADATA AS zmd ON 1=1
    WHERE note.ZTITLE1 IS NOT NULL
      AND note.ZMODIFICATIONDATE1 IS NOT NULL
      AND COALESCE(note.ZMARKEDFORDELETION, 0) != 1
      AND COALESCE(note.ZISRECOVERINGFROMTRASH, 0) != 1
      AND COALESCE(folder.ZMARKEDFORDELETION, 0) != 1
      AND ${trashed}
      ${searchFilter}
      ${filterClause(options?.filters)}
    ${orderByClause(options?.sortBy, options?.sortOrder)}
    LIMIT ${limit};
  `;

  try {
    const rows = await runSqliteJson<NoteRow>(NOTES_DB, query);
    const notes = rows.map(rowToNote);
    await attachSharingAndTags(notes);

    return postFilter(notes, search, options?.filters);
  } catch (error) {
    if (error instanceof FullDiskAccessError) {
      throw error;
    }

    return listNotesViaSQLiteLegacy(search, limit, options);
  }
}

async function listNotesViaSQLiteLegacy(
  search: string,
  limit: number,
  options?: { filters?: NoteFilters; includeTrashed?: boolean },
): Promise<AppleNote[]> {
  const hasSearch = search.length > 0;
  const escaped = escapeSQLString(normalizeForSearch(search));
  const searchFilter = hasSearch
    ? ` AND (LOWER(note.ZTITLE1) LIKE '%${escaped}%' OR LOWER(note.ZSNIPPET) LIKE '%${escaped}%')`
    : "";

  const query = `
    SELECT
      'x-coredata://' || zmd.Z_UUID || '/ICNote/p' || note.Z_PK AS id,
      note.Z_PK AS pk,
      note.ZTITLE1 AS title,
      folder.ZTITLE2 AS folder,
      note.ZMODIFICATIONDATE1 AS modifiedAt,
      note.ZCREATIONDATE1 AS createdAt,
      note.ZSNIPPET AS snippet,
      acc.ZNAME AS account,
      note.ZIDENTIFIER AS UUID,
      0 AS locked,
      0 AS pinned,
      0 AS checklist
    FROM ZICCLOUDSYNCINGOBJECT AS note
    INNER JOIN ZICCLOUDSYNCINGOBJECT AS folder ON note.ZFOLDER = folder.Z_PK
    LEFT JOIN ZICCLOUDSYNCINGOBJECT AS acc ON note.ZACCOUNT2 = acc.Z_PK
    LEFT JOIN Z_METADATA AS zmd ON 1=1
    WHERE note.ZTITLE1 IS NOT NULL
      AND COALESCE(folder.ZFOLDERTYPE, 0) ${options?.includeTrashed ? "= 1" : "!= 1"}
      ${searchFilter}
    ORDER BY note.ZMODIFICATIONDATE1 DESC
    LIMIT ${limit};
  `;

  const rows = await runSqliteJson<NoteRow>(NOTES_DB, query);
  const notes = rows.map(rowToNote);
  await attachSharingAndTags(notes);

  return postFilter(notes, search, options?.filters);
}

function postFilter(notes: AppleNote[], search: string, filters?: NoteFilters): AppleNote[] {
  let out = notes;

  if (filters?.shared) {
    out = out.filter((n) => n.shared);
  }
  const q = normalizeForSearch(search.trim());

  if (!q) {
    return out;
  }

  return out.filter((n) => normalizeForSearch(n.title).includes(q) || normalizeForSearch(n.snippet).includes(q));
}

/** One batched query for share links + one for hashtags; failures degrade to defaults. */
async function attachSharingAndTags(notes: AppleNote[]): Promise<void> {
  const pks = notes.map((n) => n.pk).filter((pk): pk is number => typeof pk === "number");

  if (pks.length === 0) {
    return;
  }
  const inList = pks.join(",");

  try {
    const invites = await runSqliteJson<{ notePk: number; invitationLink: string | null }>(
      NOTES_DB,
      `SELECT note.Z_PK AS notePk, inv.ZSHAREURL AS invitationLink
       FROM ZICCLOUDSYNCINGOBJECT AS note
       LEFT JOIN ZICINVITATION AS inv ON note.ZINVITATION = inv.Z_PK
       WHERE note.Z_PK IN (${inList});`,
    );
    const byPk = new Map(invites.map((r) => [r.notePk, r.invitationLink ?? null]));

    for (const n of notes) {
      if (n.pk == null) {
        continue;
      }
      const link = byPk.get(n.pk) ?? null;
      n.invitationLink = link;
      n.shared = link != null;
    }
  } catch {
    // table/column may not exist on older stores - shared stays false
  }

  try {
    const tags = await runSqliteJson<{ notePk: number; text: string | null }>(
      NOTES_DB,
      `SELECT link.ZNOTE1 AS notePk, link.ZALTTEXT AS text
       FROM ZICCLOUDSYNCINGOBJECT AS link
       WHERE link.ZNOTE1 IN (${inList})
         AND link.ZTYPEUTI1 = 'com.apple.notes.inlinetextattachment.hashtag';`,
    );
    const byPk = new Map<number, string[]>();

    for (const t of tags) {
      if (!t.text) {
        continue;
      }
      const arr = byPk.get(t.notePk) ?? [];
      arr.push(t.text);
      byPk.set(t.notePk, arr);
    }

    for (const n of notes) {
      if (n.pk != null) {
        n.tags = byPk.get(n.pk) ?? [];
      }
    }
  } catch {
    // ignore - tags stay empty
  }
}

async function listNotesViaJXA(search: string, limit: number): Promise<AppleNote[]> {
  const script = `
    (function() {
      const Notes = Application('Notes');
      Notes.includeStandardAdditions = true;
      const searchText = ${JSON.stringify(search)};
      const limit = ${JSON.stringify(limit)};
      let notes = Notes.notes();
      let out = [];
      for (let i = 0; i < notes.length; i++) {
        try {
          const n = notes[i];
          const name = n.name();
          let body = '';
          try { body = (n.plaintext() || '').slice(0, 300); } catch (e) {}
          if (searchText) {
            const q = searchText.toLowerCase();
            if (name.toLowerCase().indexOf(q) === -1 && body.toLowerCase().indexOf(q) === -1) continue;
          }
          let folderName = '';
          try { folderName = n.container().name(); } catch (e) {}
          let accountName = '';
          try { accountName = n.account().name(); } catch (e) {}
          let mod = null, created = null;
          try { mod = n.modificationDate(); } catch (e) {}
          try { created = n.creationDate(); } catch (e) {}
          out.push({
            id: n.id(),
            pk: null,
            uuid: '',
            title: name,
            snippet: body.slice(0, 200),
            folder: folderName,
            account: accountName,
            modifiedAt: mod ? mod.getTime() : null,
            createdAt: created ? created.getTime() : null,
            locked: false,
            pinned: false,
            checklist: false,
            checklistInProgress: false,
            shared: false,
            invitationLink: null,
            tags: [],
            url: ''
          });
          if (out.length >= limit) break;
        } catch (e) {}
      }
      out.sort(function(a, b) { return (b.modifiedAt || 0) - (a.modifiedAt || 0); });
      return JSON.stringify(out);
    })();
  `;
  const raw = await runJXA(script, 30_000);

  try {
    const parsed = JSON.parse(raw) as (Omit<AppleNote, "modifiedAt" | "createdAt"> & {
      modifiedAt: number | null;
      createdAt: number | null;
    })[];

    return parsed.map((n) => ({
      ...n,
      modifiedAt: typeof n.modifiedAt === "number" ? new Date(n.modifiedAt) : null,
      createdAt: typeof n.createdAt === "number" ? new Date(n.createdAt) : null,
    }));
  } catch {
    return [];
  }
}

export async function listFolders(): Promise<AppleFolder[]> {
  const script = `
    tell application "Notes"
      set output to {}
      repeat with acc in accounts
        repeat with fld in folders of acc
          copy ((name of acc) & "|" & (name of fld)) to end of output
        end repeat
      end repeat
      set AppleScript's text item delimiters to linefeed
      set resultText to output as text
      set AppleScript's text item delimiters to ""
      return resultText
    end tell
  `;
  const raw = await runAppleScript(script);

  if (!raw) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("|");

      if (idx === -1) {
        return { account: "", folder: line };
      }

      return { account: line.slice(0, idx), folder: line.slice(idx + 1) };
    });
}

export async function getNoteHtml(id: string, title = "Note"): Promise<string> {
  await assertNoteUnlocked(id, title);

  return runAppleScript(`
    tell application "Notes"
      set theNote to note id "${escapeDoubleQuotes(id)}"
      return body of theNote
    end tell
  `);
}

export async function getNotePlaintext(id: string, title = "Note"): Promise<string> {
  await assertNoteUnlocked(id, title);

  return runAppleScript(`
    tell application "Notes"
      set theNote to note id "${escapeDoubleQuotes(id)}"
      return plaintext of theNote
    end tell
  `);
}

export async function getNoteMarkdown(id: string, title = "Note"): Promise<{ markdown: string; html: string }> {
  const html = await getNoteHtml(id, title);

  return { html, markdown: htmlToMarkdown(html) };
}

export async function openNote(id: string, separately = false): Promise<void> {
  const extra = separately ? " with separately" : "";
  await runAppleScript(`
    tell application "Notes"
      set theNote to note id "${escapeDoubleQuotes(id)}"
      show theNote${extra}
      activate
    end tell
  `);
}

export async function createNote(options: {
  title: string;
  bodyMarkdown?: string;
  folderName?: string;
  accountName?: string;
}): Promise<void> {
  const title = options.title.trim() || "New Note";
  const bodyHtml = markdownToHtml(options.bodyMarkdown ?? "");
  const fullBody = `<h1>${escapeHtml(title)}</h1>${bodyHtml || "<div><br></div>"}`;

  const folderClause = await buildFolderClause(options.folderName, options.accountName);

  await runAppleScript(`
    tell application "Notes"
      ${folderClause}
      make new note at targetFolder with properties {name:"${escapeDoubleQuotes(title)}", body:"${escapeDoubleQuotes(fullBody)}"}
    end tell
  `);
}

async function buildFolderClause(folderName?: string, accountName?: string): Promise<string> {
  const folder = (folderName ?? "").trim();

  if (!folder) {
    return "set targetFolder to default folder of account 1";
  }

  if (accountName?.trim()) {
    return `set targetFolder to folder "${escapeDoubleQuotes(folder)}" of account "${escapeDoubleQuotes(accountName.trim())}"`;
  }

  return `set targetFolder to missing value
      repeat with acc in accounts
        try
          set targetFolder to folder "${escapeDoubleQuotes(folder)}" of acc
          exit repeat
        end try
      end repeat
      if targetFolder is missing value then
        set targetFolder to default folder of account 1
      end if`;
}

export async function updateNote(options: { id: string; title: string; bodyMarkdown: string }): Promise<void> {
  await assertNoteUnlocked(options.id, options.title);
  const title = options.title.trim() || "Untitled";
  const bodyHtml = markdownToHtml(options.bodyMarkdown ?? "");
  const fullBody = `<h1>${escapeHtml(title)}</h1>${bodyHtml || "<div><br></div>"}`;
  await runAppleScript(
    `
    tell application "Notes"
      set theNote to note id "${escapeDoubleQuotes(options.id)}"
      set body of theNote to "${escapeDoubleQuotes(fullBody)}"
    end tell
    `,
  );
}

export async function appendToNote(id: string, markdown: string, title = "Note"): Promise<void> {
  await assertNoteUnlocked(id, title);
  const html = markdownToHtml(markdown);
  await runAppleScript(
    `
    tell application "Notes"
      set theNote to note id "${escapeDoubleQuotes(id)}"
      set body of theNote to (body of theNote) & "${escapeDoubleQuotes(html)}"
    end tell
    `,
  );
}

export async function deleteNote(id: string, title = "Note"): Promise<void> {
  await assertNoteUnlocked(id, title);
  await runAppleScript(`
    tell application "Notes"
      delete note id "${escapeDoubleQuotes(id)}"
    end tell
  `);
}

export async function listTrashedNotes(limit = 50): Promise<AppleNote[]> {
  return listNotes({ limit, includeTrashed: true });
}

export async function restoreNote(id: string): Promise<void> {
  await runAppleScript(
    `
    tell application "Notes"
      set theNote to note id "${escapeDoubleQuotes(id)}"
      set theFolder to default folder of account 1
      move theNote to theFolder
    end tell
    `,
  );
}

export async function moveNoteToFolder(
  id: string,
  folderName: string,
  accountName?: string,
  title = "Note",
): Promise<void> {
  await assertNoteUnlocked(id, title);
  const escapedFolder = escapeDoubleQuotes(folderName);
  const findFolder = accountName?.trim()
    ? `set theFolder to folder "${escapedFolder}" of account "${escapeDoubleQuotes(accountName.trim())}"`
    : `
      set theFolder to missing value
      set matchingAccountNames to {}
      repeat with acc in accounts
        try
          set candidateFolder to folder "${escapedFolder}" of acc
          copy (name of acc) to end of matchingAccountNames
          if theFolder is missing value then
            set theFolder to candidateFolder
          end if
        end try
      end repeat
      if (count of matchingAccountNames) is 0 then
        error "Folder \\"${escapedFolder}\\" not found"
      end if
      if (count of matchingAccountNames) > 1 then
        set AppleScript's text item delimiters to ", "
        set matchingAccountsText to matchingAccountNames as text
        set AppleScript's text item delimiters to ""
        error "Folder \\"${escapedFolder}\\" exists in multiple accounts (" & matchingAccountsText & "). Pick the account explicitly."
      end if
    `;
  await runAppleScript(
    `
    tell application "Notes"
      set theNote to note id "${escapeDoubleQuotes(id)}"
      ${findFolder}
      move theNote to theFolder
    end tell
    `,
  );
}

export async function getSelectedNoteId(): Promise<string> {
  const raw = await runAppleScript(`
    tell application "Notes"
      set selectedNotes to selection
      if (count of selectedNotes) is 0 then
        error "No note is currently selected in Notes.app"
      else
        return id of item 1 of selectedNotes
      end if
    end tell
  `);

  if (!raw) {
    throw new Error("No note is currently selected in Notes.app");
  }

  return raw;
}

function coreDataIdToPk(id: string): number | null {
  const match = id.match(/\/ICNote\/p(\d+)\s*$/);

  return match ? Number(match[1]) : null;
}

export async function getNoteById(id: string): Promise<AppleNote> {
  const pk = coreDataIdToPk(id);

  if (pk == null || !existsSync(NOTES_DB)) {
    // Fall back to selection-independent minimal record via JXA lookup
    const notes = await listNotesViaJXA("", 1000);
    const found = notes.find((n) => n.id === id);

    if (!found) {
      throw new Error("Note not found");
    }

    return found;
  }
  const rows = await runSqliteJson<NoteRow>(
    NOTES_DB,
    `SELECT
       'x-coredata://' || zmd.Z_UUID || '/ICNote/p' || note.Z_PK AS id,
       note.Z_PK AS pk,
       note.ZTITLE1 AS title,
       folder.ZTITLE2 AS folder,
       note.ZMODIFICATIONDATE1 AS modifiedAt,
       COALESCE(note.ZCREATIONDATE1, note.ZCREATIONDATE, 0) AS createdAt,
       note.ZSNIPPET AS snippet,
       acc.ZNAME AS account,
       note.ZIDENTIFIER AS UUID,
       (note.ZISPASSWORDPROTECTED = 1) AS locked,
       (note.ZISPINNED = 1) AS pinned,
       (note.ZHASCHECKLIST = 1) AS checklist,
       (note.ZHASCHECKLISTINPROGRESS = 1) AS checklistInProgress
     FROM ZICCLOUDSYNCINGOBJECT AS note
     INNER JOIN ZICCLOUDSYNCINGOBJECT AS folder ON note.ZFOLDER = folder.Z_PK
     LEFT JOIN ZICCLOUDSYNCINGOBJECT AS acc ON note.ZACCOUNT4 = acc.Z_PK
     LEFT JOIN Z_METADATA AS zmd ON 1=1
     WHERE note.Z_PK = ${pk}
     LIMIT 1;`,
  );

  if (rows.length === 0) {
    throw new Error("Note not found");
  }
  const note = rowToNote(rows[0]);
  await attachSharingAndTags([note]);

  return note;
}

/** Tags, inline links and backlinks for the detail view. */
export async function getNoteExtras(input: { pk: AppleNote["pk"]; uuid: string; tags: string[] }): Promise<NoteExtras> {
  const extras: NoteExtras = { tags: [...input.tags], links: [], backlinks: [] };
  const pk = input.pk;
  const uuid = input.uuid;

  if (pk == null) {
    return extras;
  }

  try {
    const rows = await runSqliteJson<{ notePk: number; id: string; text: string | null; url: string | null }>(
      NOTES_DB,
      `SELECT link.ZNOTE1 AS notePk, link.ZIDENTIFIER AS id, link.ZALTTEXT AS text,
              link.ZTOKENCONTENTIDENTIFIER AS url
       FROM ZICCLOUDSYNCINGOBJECT AS link
       WHERE link.ZTYPEUTI1 = 'com.apple.notes.inlinetextattachment.link';`,
    );
    const ownLinks = rows.filter((r) => r.notePk === pk);
    extras.links = ownLinks.map((r) => ({ id: r.id, text: r.text, url: r.url }));

    if (uuid) {
      const uuidLower = uuid.toLowerCase();
      const incoming = rows.filter((r) => (r.url ?? "").toLowerCase().includes(uuidLower));

      if (incoming.length > 0) {
        const parentPks = [...new Set(incoming.map((r) => r.notePk))].join(",");
        const parents = await runSqliteJson<{ pk: number; title: string | null; UUID: string | null }>(
          NOTES_DB,
          `SELECT Z_PK AS pk, ZTITLE1 AS title, ZIDENTIFIER AS UUID
           FROM ZICCLOUDSYNCINGOBJECT WHERE Z_PK IN (${parentPks});`,
        );
        const byPk = new Map(parents.map((p) => [p.pk, p]));
        extras.backlinks = incoming.map((r) => {
          const parent = byPk.get(r.notePk);

          return {
            id: r.id,
            title: parent?.title ?? "Untitled",
            url: parent?.UUID ? getOpenNoteURL(parent.UUID) : (r.url ?? ""),
          };
        });
      }
    }
  } catch {
    // extras stay as-is on schema mismatch
  }

  return extras;
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/:\\<>|?*\u0000-\u001f]/g, "-")
    .replace(/\.+$/g, "")
    .trim();

  return cleaned || "Untitled";
}

export async function exportFolderToMarkdown(
  folder: string,
  destDir: string,
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<{ count: number; skipped: number; dir: string }> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join: joinPath } = await import("node:path");
  await mkdir(destDir, { recursive: true });
  const all = await listNotes({ limit: 10000 });
  const notes = all.filter((n) => (n.folder || "Notes") === folder);
  let done = 0;
  let skipped = 0;

  for (const note of notes) {
    if (note.locked) {
      skipped += 1;
      continue;
    }
    const { markdown } = await getNoteMarkdown(note.id, note.title);
    const file = joinPath(destDir, `${sanitizeFilename(note.title).slice(0, 120)}.md`);
    await writeFile(file, `# ${note.title}\n\n${markdown}\n`, "utf8");
    done += 1;
    onProgress?.(done, notes.length, note.title);
  }

  return { count: done, skipped, dir: destDir };
}

export async function duplicateNote(options: { id: string; title: string; folderName?: string }): Promise<void> {
  await assertNoteUnlocked(options.id, options.title);
  const html = await getNoteHtml(options.id, options.title);
  // Drop the first top-level heading (the old title) so the copy gets the new one
  const bodyWithoutTitle = html
    .replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "")
    .replace(/^\s*(<div[^>]*>\s*(<br\s*\/?>)?\s*<\/div>\s*)+/i, "");
  const newTitle = `${options.title} (copy)`;
  const fullBody = `<h1>${escapeHtml(newTitle)}</h1>${bodyWithoutTitle || "<div><br></div>"}`;
  const folderClause = await buildFolderClause(options.folderName, undefined);
  await runAppleScript(`
    tell application "Notes"
      ${folderClause}
      make new note at targetFolder with properties {name:"${escapeDoubleQuotes(newTitle)}", body:"${escapeDoubleQuotes(fullBody)}"}
    end tell
  `);
}

export type NoteTemplate = {
  id: string;
  label: string;
  title: string;
  body: string;
};

export const NOTE_TEMPLATES: NoteTemplate[] = [
  { id: "blank", label: "Blank", title: "", body: "" },
  {
    id: "meeting",
    label: "Meeting",
    title: "Meeting - {{date}}",
    body: "## Attendees\n- \n\n## Agenda\n- \n\n## Notes\n\n## Actions\n- [ ] ",
  },
  {
    id: "daily",
    label: "Daily Note",
    title: "{{date}}",
    body: "## Priorities\n- [ ] \n\n## Notes\n\n## Log\n",
  },
];

export function applyTemplatePlaceholders(text: string, now = new Date()): string {
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return text
    .replace(/\{\{\s*datetime\s*\}\}/g, `${date} ${time}`)
    .replace(/\{\{\s*date\s*\}\}/g, date)
    .replace(/\{\{\s*time\s*\}\}/g, time)
    .replace(/\{\{\s*year\s*\}\}/g, String(now.getFullYear()));
}

/** Parse Raycast-style special keywords out of the search text. */
export function parseNoteFilters(searchText: string): { clean: string; filters: NoteFilters } {
  const words = searchText.split(/\s+/).filter(Boolean);
  const filters: NoteFilters = {};
  const rest: string[] = [];

  for (const w of words) {
    const lower = w.toLowerCase();

    if (["checklist", "todo", "task", "to-do"].includes(lower)) {
      filters.checklist = true;
    } else if (["progress", "active"].includes(lower)) {
      filters.checklist = true;
      filters.checklistState = "progress";
    } else if (["done", "completed"].includes(lower)) {
      filters.checklist = true;
      filters.checklistState = "done";
    } else if (["locked", "password", "protected"].includes(lower)) {
      filters.locked = true;
    } else if (["shared"].includes(lower)) {
      filters.shared = true;
    } else {
      rest.push(w);
    }
  }

  return { clean: rest.join(" "), filters: Object.keys(filters).length > 0 ? filters : {} };
}

export function hasActiveFilters(filters: NoteFilters): boolean {
  return Object.keys(filters).length > 0;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function decodeEntities(value: string): string {
  return (
    value
      .replace(/&nbsp;/g, " ")
      // Repair bare entities missing their semicolon (Notes stores them that
      // way) so they render instead of showing literally.
      .replace(/&lt(?![a-zA-Z0-9#]*;)/g, "&lt;")
      .replace(/&gt(?![a-zA-Z0-9#]*;)/g, "&gt;")
      .replace(/&amp(?![a-zA-Z0-9#]*;)/g, "&amp;")
      .replace(/&quot(?![a-zA-Z0-9#]*;)/g, "&quot;")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      // NOTE: &lt; &gt; (and numeric &#60; &#62;) are intentionally KEPT so
      // literal < > render instead of being swallowed as HTML tags.
      .replace(/&#(\d+);/g, (m, code: string) => {
        const n = Number(code);

        if (n === 60 || n === 62) {
          return m;
        }

        return String.fromCharCode(n);
      })
  );
}

/** Convert Apple Notes HTML body into readable Markdown for Detail/list preview. */
export function htmlToMarkdown(html: string): string {
  if (!html) {
    return "";
  }
  let out = html;

  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/div>\s*<div[^>]*>/gi, "\n\n");
  out = out.replace(/<div[^>]*>/gi, "");
  out = out.replace(/<\/div>/gi, "\n");
  out = out.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  out = out.replace(/<\/?p[^>]*>/gi, "\n\n");

  out = out.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
      .map((row) =>
        [...row[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
          convertInline(cell[1].replace(/<\/?(?:div|p|br)[^>]*>/gi, " "))
            .trim()
            .replace(/\|/g, "\\|"),
        ),
      )
      .filter((r) => r.length > 0);

    if (rows.length === 0) {
      return "";
    }
    const cols = Math.max(...rows.map((r) => r.length));
    const pad = (r: string[]): string[] => [...r, ...Array<string>(cols - r.length).fill("")];
    const head = `| ${pad(rows[0]).join(" | ")} |`;
    const sep = `|${Array<string>(cols).fill(" --- ").join("|")}|`;

    return `\n\n${[head, sep, ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`)].join("\n")}\n\n`;
  });

  // Unwrap inline tags directly around a heading: <b><h1>T</h1></b> → <h1>T</h1>.
  // Otherwise the heading converts first and the stray <b> wraps it in broken `**`.
  let prev = "";
  let guard = 0;

  while (out !== prev && guard++ < 5) {
    prev = out;
    out = out.replace(/<(strong|b|i|em|u|span|font)[^>]*>\s*(<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>)\s*<\/\1>/gi, "$2");
  }

  out = out.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, inner: string) => `# ${convertInline(inner).trim()}\n\n`);
  out = out.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, inner: string) => `## ${convertInline(inner).trim()}\n\n`);
  out = out.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, inner: string) => `### ${convertInline(inner).trim()}\n\n`);
  // Empty headings from hollow styled divs (e.g. <h1><br></h1>) carry no content
  out = out.replace(/^#{1,3}\s*$/gm, "");

  // Depth-aware lists: sibling <ul>/<ol> (how Notes nests) keep indentation
  // so structure survives the edit round-trip. Ordered markers are 3 cols
  // wide (`1. `), so ol levels indent by 3 and ul levels by 2 (CommonMark).
  const listKindStack: Array<"ul" | "ol"> = [];
  const listIndentStack: string[] = [];

  out = out.replace(/<\/?(?:ul|ol)[^>]*>|<li[^>]*>([\s\S]*?)<\/li>/gi, (match, liInner?: string) => {
    if (liInner === undefined) {
      if (match.startsWith("</")) {
        listKindStack.pop();
        listIndentStack.pop();
      } else {
        const kind = match.startsWith("<ol") ? ("ol" as const) : ("ul" as const);
        listKindStack.push(kind);
        listIndentStack.push(kind === "ol" ? "   " : "  ");
      }

      return "";
    }
    const indent = listIndentStack.slice(0, -1).join("");
    const marker = listKindStack[listKindStack.length - 1] === "ol" ? "1." : "-";
    const text = convertInline(liInner).trim().replace(/\n+/g, " ");

    return `${indent}${marker} ${text}\n`;
  });

  out = out.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner: string) => {
    const text = convertInline(inner).trim().replace(/\n/g, "\n> ");

    return `> ${text}\n\n`;
  });
  out = out.replace(
    /<pre[^>]*>([\s\S]*?)<\/pre>/gi,
    (_, inner: string) => `\`\`\`\n${stripTags(inner).trim()}\n\`\`\`\n\n`,
  );
  // Checklist spans must convert before convertInline strips every tag.
  out = out.replace(/<span[^>]*apple-rich-text-checklist[^>]*>([\s\S]*?)<\/span>/gi, (_, inner: string) => {
    const done = /checked/i.test(inner) || /☑|✓/.test(inner);

    return `\n- [${done ? "x" : " "}] ${convertInline(inner).trim()}\n`;
  });
  out = convertInline(out);

  out = stripTags(out);
  out = decodeEntities(out);
  out = out.replace(/[ \t]+\n/g, "\n");
  // Notes often marks titles as bold large text instead of <h1>: unwrap `**# Title**` → `# Title`
  out = out.replace(/^\*\*\s*(#{1,3}\s+.*?)\s*\*\*$/gm, "$1");
  // …including when the closing markers ended up on another line: `**# Title` → `# Title`
  out = out.replace(/^\*\*\s*(#{1,3}\s+)/gm, "$1");
  // Drop lines that are only leftover markers from empty styled divs (`**`, `**#`)
  out = out.replace(/^\s*\*{1,3}\s*#?\s*\*{0,3}\s*$/gm, "");
  out = out.replace(/\*\*[ \t]*\*\*/g, "");
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

/**
 * Convert inline HTML (bold, italic, strikethrough, code, links, highlight)
 * to markdown. Handles nesting by looping innermost-first and never emits
 * emphasis spanning blank lines (invalid CommonMark, renders literally).
 */
function convertInline(html: string): string {
  let out = html;
  // Underline has no markdown equivalent - keep the content unformatted
  out = out.replace(/<\/?u[^>]*>/gi, "");
  // Highlight (background / <mark>) → bold so it still stands out
  let prevMark = "";
  let markGuard = 0;

  while (out !== prevMark && markGuard++ < 5) {
    prevMark = out;
    out = out.replace(/<span[^>]*background[^>]*>([\s\S]*?)<\/span>/gi, (_, inner: string) => `**${inner}**`);
    out = out.replace(/<mark[^>]*>([\s\S]*?)<\/mark>/gi, (_, inner: string) => `**${inner}**`);
  }
  out = out.replace(/<(code|tt)[^>]*>([\s\S]*?)<\/\1>/gi, (_, __: string, inner: string) => {
    const text = stripTags(inner);

    // Hollow monospace divs (<tt><br></tt>) carry no code - emitting lone
    // backticks would pair up across lines and corrupt the render.
    if (!text.trim()) {
      return "";
    }

    return `\`${text}\``;
  });
  out = out.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
    const label = convertInline(text).trim() || href;

    if (!href || href === label) {
      return label;
    }

    return `[${label}](${href})`;
  });
  // Innermost-first so <b><i>x</i></b> becomes valid ***x*** instead of broken **x**
  let prev = "";
  let guard = 0;

  while (out !== prev && guard++ < 10) {
    prev = out;
    out = out.replace(/<(s|strike|del)[^>]*>([^<>]*?)<\/\1>/gi, (_, __: string, inner: string) => `~~${inner}~~`);
    out = out.replace(
      /<(em|i)[^>]*>([^<>]*?)<\/\1>/gi,
      (_, __: string, inner: string) => `*${splitEmphasis(inner, "*")}*`,
    );
    out = out.replace(
      /<(strong|b)[^>]*>([^<>]*?)<\/\1>/gi,
      (_, __: string, inner: string) => `**${splitEmphasis(inner, "**")}**`,
    );
  }

  return stripTags(out);
}

/** Split multi-paragraph emphasis into per-paragraph markers (valid CommonMark). */
function splitEmphasis(inner: string, marker: "**" | "*" | "~~"): string {
  return inner
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(`\n\n${marker}`);
}

/** Minimal Markdown → HTML for writing back to Apple Notes. */
export function markdownToHtml(markdown: string): string {
  const lines = (markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];
  // Open list kinds per depth level - nesting survives the edit round-trip.
  const listStack: Array<"ul" | "ol"> = [];
  // Ancestor indent widths for relative level computation.
  const indentStack: number[] = [];

  const closeListsTo = (depth: number): void => {
    while (listStack.length > depth) {
      const kind = listStack.pop();
      html.push(kind === "ul" ? "</ul>" : "</ol>");
    }
  };

  const closeAllLists = (): void => {
    closeListsTo(0);
    indentStack.length = 0;
  };

  const setListLevel = (level: number, kind: "ul" | "ol"): void => {
    closeListsTo(level + 1);

    if (listStack[level] !== kind) {
      closeListsTo(level);
      html.push(kind === "ul" ? "<ul>" : "<ol>");
      listStack.push(kind);
    }
  };

  const listLevel = (rawLine: string): number => {
    // Relative levels: any indent deeper than the parent opens a sublist.
    // Handles mixed widths (ul nests at +2, ol at +3 per CommonMark).
    const indent = (rawLine.match(/^(\s*)/)?.[1] ?? "").replace(/\t/g, "  ").length;

    while (indentStack.length > 0 && indentStack[indentStack.length - 1] >= indent) {
      indentStack.pop();
    }
    const level = indentStack.length;
    indentStack.push(indent);

    return level;
  };

  const inline = (text: string): string => {
    let t = escapeHtml(text);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    t = t.replace(/__([^_]+)__/g, "<b>$1</b>");
    t = t.replace(/(^|\W)\*([^*\n]+)\*/g, "$1<i>$2</i>");
    t = t.replace(/(^|\W)_([^_\n]+)_/g, "$1<i>$2</i>");

    return t;
  };

  for (const rawLine of lines) {
    const line = rawLine;

    if (line.trim().startsWith("```")) {
      if (!inCode) {
        closeAllLists();
        inCode = true;
        codeBuffer = [];
      } else {
        inCode = false;
        html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      closeAllLists();
      html.push("<div><br></div>");
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);

    if (heading) {
      closeAllLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);

    if (quote) {
      closeAllLists();
      html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    const task = trimmed.match(/^-\s*\[( |x|X)\]\s+(.*)$/);

    if (task) {
      setListLevel(listLevel(line), "ul");
      const mark = task[1].toLowerCase() === "x" ? "☑" : "☐";
      html.push(`<li>${mark} ${inline(task[2])}</li>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/);

    if (bullet) {
      setListLevel(listLevel(line), "ul");
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.*)$/);

    if (ordered) {
      setListLevel(listLevel(line), "ol");
      html.push(`<li>${inline(ordered[1])}</li>`);
      continue;
    }

    closeAllLists();
    html.push(`<div>${inline(trimmed)}</div>`);
  }

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }
  closeAllLists();

  return html.join("");
}
