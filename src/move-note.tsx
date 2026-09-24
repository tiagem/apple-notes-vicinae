import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { MoveToFolderForm } from "./components/note-views";
import { FullDiskAccessError, listNotes } from "./lib/notes";
import { useAsyncData } from "./hooks/useAsyncData";

export default function MoveNote() {
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), 250);

    return () => clearTimeout(t);
  }, [searchText]);

  const notesQuery = useAsyncData(
    () => listNotes({ search: debouncedSearch, limit: 100 }).then((result) => result.filter((n) => !n.locked)),
    debouncedSearch,
  );
  const notes = notesQuery.data ?? [];
  const isLoading = notesQuery.isLoading;
  const error = notesQuery.error;
  const revalidate = notesQuery.revalidate;

  if (error instanceof FullDiskAccessError || error?.name === "FullDiskAccessError") {
    return (
      <List searchBarPlaceholder="Pick a note to move…">
        <List.EmptyView
          icon={Icon.Lock}
          title="Full Disk Access required"
          description="Grant Full Disk Access to your terminal, then reload."
          actions={
            <ActionPanel>
              <Action title="Reload" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Pick a note to move…"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      throttle
    >
      {!isLoading && notes.length === 0 ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No notes found"
          description={debouncedSearch ? `Nothing matches “${debouncedSearch}”.` : "No movable notes."}
        />
      ) : (
        <List.Section title="Notes" subtitle={`${notes.length}`}>
          {notes.map((note) => (
            <List.Item
              key={note.id}
              id={note.id}
              title={note.title}
              subtitle={note.folder || undefined}
              icon={Icon.BlankDocument}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Choose Destination Folder…"
                    icon={Icon.Folder}
                    target={<MoveToFolderForm note={note} onMoved={() => revalidate()} />}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
