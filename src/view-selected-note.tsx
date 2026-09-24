import { Icon, List } from "@vicinae/api";
import { useEffect, useState } from "react";
import { NoteDetailView } from "./components/note-views";
import { AppleNote, getNoteById, getSelectedNoteId } from "./lib/notes";

export default function ViewSelectedNote() {
  const [note, setNote] = useState<AppleNote | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const id = await getSelectedNoteId();
        const found = await getNoteById(id);

        if (!cancelled) {
          setNote(found);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught : new Error("Could not load selected note"));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <List searchBarPlaceholder="Selected note" isLoading>
        <List.EmptyView icon={Icon.BlankDocument} title="Loading…" description="Reading selection from Notes.app…" />
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
        />
      </List>
    );
  }

  return <NoteDetailView note={note} />;
}
