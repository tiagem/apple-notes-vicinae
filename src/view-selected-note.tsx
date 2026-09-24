import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { NoteDetailView } from "./components/note-views";
import { getNoteById, getSelectedNoteId, runAppleScript } from "./lib/notes";
import { useAsyncData } from "./hooks/useAsyncData";

export default function ViewSelectedNote() {
  const selectionQuery = useAsyncData(async () => {
    const id = await getSelectedNoteId();

    return getNoteById(id);
  }, "selected-note");
  const note = selectionQuery.data ?? null;
  const isLoading = selectionQuery.isLoading;
  const error = selectionQuery.error;
  const revalidate = selectionQuery.revalidate;

  if (isLoading) {
    return (
      <List searchBarPlaceholder="Selected note" isLoading>
        <List.EmptyView
          icon={Icon.BlankDocument}
          title="Reading selection…"
          description="Asking Notes.app which note is selected…"
        />
      </List>
    );
  }

  if (error || !note) {
    return (
      <List searchBarPlaceholder="Selected note">
        <List.EmptyView
          icon={Icon.BlankDocument}
          title="No note selected"
          description={error?.message ?? "Select a note in Notes.app first, then run this command."}
          actions={
            <ActionPanel>
              <Action title="Retry" icon={Icon.ArrowClockwise} onAction={() => revalidate()} />
              <Action
                title="Open Notes"
                icon={Icon.AppWindow}
                onAction={() => runAppleScript('tell application "Notes" to activate')}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  return <NoteDetailView note={note} />;
}
