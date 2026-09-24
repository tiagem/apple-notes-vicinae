import {
  Action,
  ActionPanel,
  Color,
  confirmAlert,
  getPreferenceValues,
  Icon,
  List,
  open,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useMemo, useState } from "react";
import {
  CreateNoteForm,
  ExportFolderForm,
  MoveToFolderForm,
  NoteActions,
  NoteDetailView,
} from "./components/note-views";
import {
  AppleNote,
  deleteNote,
  duplicateNote,
  FullDiskAccessError,
  hasActiveFilters,
  listNotes,
  listTrashedNotes,
  NoteSortBy,
  NoteSortOrder,
  openNote,
  parseNoteFilters,
  restoreNote,
} from "./lib/notes";
import { useAsyncData } from "./hooks/useAsyncData";
import { commonShortcut } from "./lib/shortcuts";

function relativeDate(date: Date | null): string {
  if (!date) {
    return "";
  }
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return date.toLocaleDateString();
}

const SORT_LABELS: Record<NoteSortBy, string> = { modified: "Modified", created: "Created", title: "Title" };

export default function SearchNotes() {
  const prefs = getPreferenceValues<Preferences>();
  const maxResults = Number.parseInt(prefs.maxResults || "5000", 10) || 5000;

  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [sortBy, setSortBy] = useState<NoteSortBy>("modified");
  const [sortOrder, setSortOrder] = useState<NoteSortOrder>("desc");
  const [isShowingDetail, setIsShowingDetail] = useState(prefs.showDetailByDefault ?? false);

  const { clean: cleanSearch, filters } = useMemo(() => parseNoteFilters(debouncedSearch), [debouncedSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 250);

    return () => clearTimeout(t);
  }, [searchText]);

  const requestKey = useMemo(
    () => JSON.stringify({ search: cleanSearch, filters, limit: maxResults, sortBy, sortOrder }),
    [cleanSearch, filters, maxResults, sortBy, sortOrder],
  );
  const notesQuery = useAsyncData(
    () =>
      Promise.all([
        listNotes({ search: cleanSearch, limit: maxResults, sortBy, sortOrder, filters }),
        cleanSearch || hasActiveFilters(filters) ? Promise.resolve([] as AppleNote[]) : listTrashedNotes(50),
      ]),
    requestKey,
  );
  const notes = useMemo(() => notesQuery.data?.[0] ?? [], [notesQuery.data]);
  const trashed = useMemo(() => notesQuery.data?.[1] ?? [], [notesQuery.data]);
  const isLoading = notesQuery.isLoading;
  const error = notesQuery.error;
  const revalidate = notesQuery.revalidate;

  const folders = useMemo(() => {
    const set = new Map<string, number>();

    for (const n of notes) {
      const key = n.folder || "Notes";
      set.set(key, (set.get(key) ?? 0) + 1);
    }

    return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [notes]);

  const visible = useMemo(
    () => (folderFilter === "all" ? notes : notes.filter((n) => (n.folder || "Notes") === folderFilter)),
    [notes, folderFilter],
  );

  const pinned = visible.filter((n) => n.pinned);
  const rest = visible.filter((n) => !n.pinned);

  if (error instanceof FullDiskAccessError || error?.name === "FullDiskAccessError") {
    return (
      <List searchBarPlaceholder="Search Apple Notes…">
        <List.EmptyView
          icon={Icon.Lock}
          title="Full Disk Access required"
          description="To read on-device Apple Notes, grant Full Disk Access to your terminal, then press ↻ to reload. Writes use Notes via Automation."
          actions={
            <ActionPanel>
              <Action title="Reload" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
              <Action.Push
                title="New Note Anyway"
                icon={Icon.NewDocument}
                target={<CreateNoteForm onCreated={() => revalidate()} closeOnSuccess />}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  const renderItem = (note: AppleNote) => {
    const preview = note.locked
      ? "*Locked - open in Notes to view.*"
      : note.snippet
        ? `_${note.snippet}_`
        : "*Open “View Full Note” to load content…*";
    const accessories: List.Item.Accessory[] = [];

    if (note.shared) {
      accessories.push({ icon: Icon.Person, tooltip: "Shared" });
    }

    if (note.tags.length > 0) {
      accessories.push({
        icon: Icon.Hashtag,
        text: `${note.tags.length}`,
        tooltip: note.tags.map((t) => t.replace(/^#/, "")).join(", "),
      });
    }

    if (note.pinned) {
      accessories.push({ icon: Icon.Pin, tooltip: "Pinned" });
    }

    if (note.locked) {
      accessories.push({ icon: Icon.Lock, tooltip: "Locked - open in Notes" });
    }

    if (note.checklist) {
      accessories.push({
        icon: Icon.CheckList,
        tooltip: note.checklistInProgress ? "Checklist in progress" : "Checklist done",
      });
    }

    // Folder and date live in the detail metadata - hide them there to avoid duplication.
    if (!isShowingDetail) {
      const dateLabel = relativeDate(sortBy === "created" ? note.createdAt : note.modifiedAt);

      if (dateLabel) {
        accessories.push({ text: dateLabel });
      }

      if (note.folder) {
        accessories.push({ tag: { value: note.folder, color: Color.Blue }, tooltip: "Folder" });
      }
    }

    return (
      <List.Item
        key={note.id}
        id={note.id}
        title={note.title}
        subtitle={note.account || undefined}
        keywords={
          note.locked
            ? [note.folder, note.account]
            : [note.folder, note.account, note.snippet, ...note.tags.map((t) => t.replace(/^#/, ""))]
        }
        icon={note.locked ? Icon.Lock : Icon.BlankDocument}
        accessories={accessories}
        detail={
          <List.Item.Detail
            markdown={`# ${note.title}\n\n${preview}`}
            metadata={
              <List.Item.Detail.Metadata>
                <List.Item.Detail.Metadata.Label title="Folder" text={note.folder || "-"} />
                <List.Item.Detail.Metadata.Label title="Account" text={note.account || "-"} />
                {note.modifiedAt ? (
                  <List.Item.Detail.Metadata.Label title="Modified" text={note.modifiedAt.toLocaleString()} />
                ) : null}
                <List.Item.Detail.Metadata.Separator />
                <List.Item.Detail.Metadata.Label title="Pinned" text={note.pinned ? "Yes" : "No"} />
                <List.Item.Detail.Metadata.Label title="Locked" text={note.locked ? "Yes" : "No"} />
                {note.shared ? <List.Item.Detail.Metadata.Label title="Shared" text="Yes" /> : null}
              </List.Item.Detail.Metadata>
            }
          />
        }
        actions={
          note.locked ? (
            <LockedNoteActions note={note} onChanged={() => revalidate()} />
          ) : (
            <ActionPanel>
              <Action.Push
                title="View Full Note"
                icon={Icon.Eye}
                target={<NoteDetailView note={note} onChanged={() => revalidate()} />}
              />
              <NoteActions note={note} onChanged={() => revalidate()} />
              <ActionPanel.Section title="Organize">
                <Action.Push
                  title="Move to Folder…"
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
                  target={<MoveToFolderForm note={note} onMoved={() => revalidate()} />}
                />
                <Action
                  title="Duplicate Note"
                  icon={Icon.CopyClipboard}
                  shortcut={{ modifiers: ["cmd"], key: "d" }}
                  onAction={async () => {
                    const toast = await showToast({ style: Toast.Style.Animated, title: "Duplicating…" });

                    try {
                      await duplicateNote({ id: note.id, title: note.title, folderName: note.folder });
                      toast.style = Toast.Style.Success;
                      toast.title = "Note duplicated";
                      await toast.update();
                      revalidate();
                    } catch (caught) {
                      toast.style = Toast.Style.Failure;
                      toast.title = "Could not duplicate note";
                      toast.message = caught instanceof Error ? caught.message : undefined;
                      await toast.update();
                    }
                  }}
                />
                <Action.Push
                  title="Export Folder to Markdown…"
                  icon={Icon.Download}
                  target={<ExportFolderForm folder={note.folder || "Notes"} />}
                />
              </ActionPanel.Section>
              <ActionPanel.Section title="Manage">
                <Action
                  title={isShowingDetail ? "Hide Preview" : "Show Preview"}
                  icon={Icon.AppWindowSidebarRight}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                  onAction={() => setIsShowingDetail((v) => !v)}
                />
                <ActionPanel.Submenu
                  title="Sort By"
                  icon={Icon.ArrowUp}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
                >
                  {(Object.keys(SORT_LABELS) as NoteSortBy[]).map((key) => (
                    <Action
                      key={key}
                      title={`${SORT_LABELS[key]}${sortBy === key ? " ✓" : ""}`}
                      onAction={() => setSortBy(key)}
                    />
                  ))}
                  <Action
                    title={`${sortOrder === "desc" ? "Ascending" : "Descending"} order`}
                    icon={sortOrder === "desc" ? Icon.ArrowUp : Icon.ArrowDown}
                    onAction={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
                  />
                </ActionPanel.Submenu>
                <Action
                  title="Reload"
                  icon={Icon.ArrowClockwise}
                  shortcut={commonShortcut("Refresh")}
                  onAction={() => revalidate()}
                />
                <Action
                  title="Delete Note"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={commonShortcut("Remove")}
                  onAction={async () => {
                    if (
                      !(await confirmAlert({ title: `Delete “${note.title}”?`, message: "Moves to Recently Deleted." }))
                    ) {
                      return;
                    }
                    const toast = await showToast({ style: Toast.Style.Animated, title: "Deleting…" });

                    try {
                      await deleteNote(note.id, note.title);
                      toast.style = Toast.Style.Success;
                      toast.title = "Note deleted";
                      await toast.update();
                      revalidate();
                    } catch (caught) {
                      toast.style = Toast.Style.Failure;
                      toast.title = "Could not delete note";
                      toast.message = caught instanceof Error ? caught.message : undefined;
                      await toast.update();
                    }
                  }}
                />
              </ActionPanel.Section>
            </ActionPanel>
          )
        }
      />
    );
  };

  const renderTrashedItem = (note: AppleNote) => (
    <List.Item
      key={note.id}
      id={note.id}
      title={note.title}
      subtitle={note.account || undefined}
      icon={{ source: Icon.Trash, tintColor: Color.SecondaryText }}
      accessories={note.modifiedAt ? [{ text: relativeDate(note.modifiedAt) }] : []}
      actions={
        <ActionPanel>
          <Action
            title="Restore Note"
            icon={Icon.ArrowClockwise}
            onAction={async () => {
              const toast = await showToast({ style: Toast.Style.Animated, title: "Restoring…" });

              try {
                await restoreNote(note.id);
                toast.style = Toast.Style.Success;
                toast.title = "Note restored";
                await toast.update();
                revalidate();
              } catch (caught) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not restore note";
                toast.message = caught instanceof Error ? caught.message : undefined;
                await toast.update();
              }
            }}
          />
          <Action
            title="Open in Notes"
            icon={Icon.AppWindow}
            onAction={async () => {
              try {
                await openNote(note.id);
              } catch {
                if (note.url) {
                  await open(note.url, "com.apple.notes");
                }
              }
            }}
          />
        </ActionPanel>
      }
    />
  );

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail && visible.length > 0}
      searchBarPlaceholder="Search Apple Notes… (title, snippet, folder, checklist, locked, shared)"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      throttle
      searchBarAccessory={
        <List.Dropdown tooltip="Folder" value={folderFilter} onChange={setFolderFilter}>
          <List.Dropdown.Item title="All Folders" value="all" icon={Icon.Folder} />
          <List.Dropdown.Section title="Folders">
            {folders.map(([folder, count]) => (
              <List.Dropdown.Item key={folder} title={`${folder} (${count})`} value={folder} icon={Icon.Folder} />
            ))}
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {error && !(error instanceof FullDiskAccessError) ? (
        <List.EmptyView
          icon={Icon.Exclamationmark}
          title="Could not load notes"
          description={error.message}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      ) : !isLoading && visible.length === 0 && trashed.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title={debouncedSearch ? "No matching notes" : "No notes found"}
          description={debouncedSearch ? `Nothing matches “${debouncedSearch}”.` : "Create your first note."}
          actions={
            <ActionPanel>
              <Action.Push
                title="New Note"
                icon={Icon.NewDocument}
                target={<CreateNoteForm onCreated={() => revalidate()} closeOnSuccess />}
              />
              <Action title="Reload" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <List.Section title="Pinned" subtitle={`${pinned.length}`}>
              {pinned.map(renderItem)}
            </List.Section>
          )}
          <List.Section title={pinned.length > 0 ? "Notes" : "All Notes"} subtitle={`${rest.length}`}>
            {rest.map(renderItem)}
          </List.Section>
          {trashed.length > 0 && (
            <List.Section title="Recently Deleted" subtitle={`${trashed.length}`}>
              {trashed.map(renderTrashedItem)}
            </List.Section>
          )}
        </>
      )}
    </List>
  );
}

export function LockedNoteActions({ note, onChanged }: { note: AppleNote; onChanged?: () => void }) {
  return (
    <ActionPanel>
      <Action
        title="Open in Notes to Unlock"
        icon={Icon.AppWindow}
        onAction={async () => {
          try {
            await openNote(note.id);
          } catch {
            if (note.url) {
              await open(note.url, "com.apple.notes");
            }
          }
          onChanged?.();
        }}
      />
      {note.url ? <Action.CopyToClipboard title="Copy Note Link" content={note.url} icon={Icon.Link} /> : null}
      <Action.Push
        title="New Note"
        icon={Icon.NewDocument}
        shortcut={commonShortcut("New")}
        target={<CreateNoteForm onCreated={onChanged} closeOnSuccess />}
      />
    </ActionPanel>
  );
}
