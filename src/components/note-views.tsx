import {
  Action,
  ActionPanel,
  Clipboard,
  confirmAlert,
  Detail,
  Form,
  getPreferenceValues,
  Icon,
  List,
  open,
  showToast,
  Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
  appendToNote,
  AppleFolder,
  AppleNote,
  applyTemplatePlaceholders,
  createNote,
  exportFolderToMarkdown,
  getNoteExtras,
  getNoteHtml,
  getNoteMarkdown,
  getNotePlaintext,
  htmlToMarkdown,
  listFolders,
  moveNoteToFolder,
  NOTE_TEMPLATES,
  NoteExtras,
  NoteTemplate,
  openNote,
  updateNote,
} from "../lib/notes";
import {
  BUILTIN_TEMPLATE_IDS,
  deleteCustomTemplate,
  getAllTemplates,
  getCustomTemplates,
  newTemplateId,
  saveCustomTemplate,
} from "../lib/templates";
import { useAsyncData } from "../hooks/useAsyncData";

export function NoteActions({ note, onChanged }: { note: AppleNote; onChanged?: () => void }) {
  // NOTE: must return a fragment (sections), NOT an <ActionPanel>.
  // Nesting <ActionPanel> inside another <ActionPanel> breaks the renderer (blank view).
  return (
    <>
      <ActionPanel.Section title="Note">
        <Action.Push
          title="Edit Note"
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd"], key: "e" }}
          target={<EditNoteView note={note} onSaved={onChanged} />}
        />
        <Action.Push
          title="Append to Note"
          icon={Icon.Plus}
          shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
          target={<AppendNoteView note={note} onSaved={onChanged} />}
        />
        <Action
          title="Open in Notes"
          icon={Icon.AppWindow}
          shortcut={{ modifiers: ["cmd"], key: "o" }}
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
      </ActionPanel.Section>
      <ActionPanel.Section title="Copy">
        <Action
          title="Copy as Markdown"
          icon={Icon.CopyClipboard}
          shortcut={{ modifiers: ["cmd", "shift"], key: "m" }}
          onAction={async () => {
            const toast = await showToast({ style: Toast.Style.Animated, title: "Loading note…" });

            try {
              const { markdown } = await getNoteMarkdown(note.id);
              await Clipboard.copy(markdown);
              toast.style = Toast.Style.Success;
              toast.title = "Copied as Markdown";
              await toast.update();
            } catch (error) {
              toast.style = Toast.Style.Failure;
              toast.title = "Could not copy note";
              toast.message = error instanceof Error ? error.message : undefined;
              await toast.update();
            }
          }}
        />
        <Action
          title="Copy as Plain Text"
          icon={Icon.Text}
          onAction={async () => {
            try {
              const text = await getNotePlaintext(note.id);
              await Clipboard.copy(text);
              await showToast({ style: Toast.Style.Success, title: "Copied plain text" });
            } catch (error) {
              await showToast({
                style: Toast.Style.Failure,
                title: "Could not copy note",
                message: error instanceof Error ? error.message : undefined,
              });
            }
          }}
        />
        {note.url ? <Action.CopyToClipboard title="Copy Note Link" content={note.url} icon={Icon.Link} /> : null}
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action.Push
          title="New Note"
          icon={Icon.NewDocument}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
          target={<CreateNoteForm onCreated={onChanged} />}
        />
      </ActionPanel.Section>
    </>
  );
}

export function NoteDetailView({ note, onChanged }: { note: AppleNote; onChanged?: () => void }) {
  const [markdown, setMarkdown] = useState<string>(note.snippet ? `_${note.snippet}_` : "Loading…");
  const [html, setHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [extras, setExtras] = useState<NoteExtras>({ tags: [...note.tags], links: [], backlinks: [] });

  const noteId = note.id;
  const noteSnippet = note.snippet;
  const noteTitle = note.title;
  const notePk = note.pk;
  const noteUuid = note.uuid;
  const noteTags = note.tags;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { markdown: md, html: bodyHtml } = await getNoteMarkdown(noteId, noteTitle);

        if (!cancelled) {
          setMarkdown(stripLeadingTitle(md, noteTitle) || "*Empty note*");
          setHtml(bodyHtml);
        }
      } catch (error) {
        if (!cancelled) {
          setMarkdown(
            `> Could not load full content: ${error instanceof Error ? error.message : "unknown error"}\n\n_${noteSnippet}_`,
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    getNoteExtras({ pk: notePk, uuid: noteUuid, tags: noteTags })
      .then((ex) => {
        if (!cancelled) {
          setExtras(ex);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [noteId, noteSnippet, noteTitle, notePk, noteUuid, noteTags]);

  if (note.locked) {
    return (
      <Detail
        navigationTitle={note.title}
        markdown={`# ${note.title}\n\n> 🔒 This note is locked. Open it in Notes.app to unlock and view it.`}
        actions={
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
              }}
            />
            {note.url ? <Action.CopyToClipboard title="Copy Note Link" content={note.url} icon={Icon.Link} /> : null}
          </ActionPanel>
        }
      />
    );
  }

  return (
    <Detail
      navigationTitle={note.title}
      markdown={`# ${note.title}\n\n${isLoading ? "_Loading full content…_\n\n" : ""}${markdown}`}
      metadata={
        showMetadata ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title="Folder" text={note.folder || "-"} />
            <Detail.Metadata.Label title="Account" text={note.account || "-"} />
            {note.modifiedAt ? (
              <Detail.Metadata.Label title="Modified" text={note.modifiedAt.toLocaleString()} />
            ) : null}
            {note.createdAt ? <Detail.Metadata.Label title="Created" text={note.createdAt.toLocaleString()} /> : null}
            <Detail.Metadata.Separator />
            <Detail.Metadata.Label title="Pinned" text={note.pinned ? "Yes" : "No"} />
            <Detail.Metadata.Label title="Locked" text={note.locked ? "Yes" : "No"} />
            <Detail.Metadata.Label title="Checklist" text={note.checklist ? "Yes" : "No"} />
            {note.shared ? <Detail.Metadata.Label title="Shared" text="Yes" /> : null}
            {extras.tags.length > 0 ? (
              <Detail.Metadata.TagList title="Tags">
                {extras.tags.map((tag) => (
                  <Detail.Metadata.TagList.Item key={tag} text={tag} />
                ))}
              </Detail.Metadata.TagList>
            ) : null}
            {extras.links.length > 0 ? (
              <Detail.Metadata.TagList title="Links">
                {extras.links.map((link) =>
                  link.url && link.text ? (
                    <Detail.Metadata.TagList.Item
                      key={link.id}
                      text={link.text.slice(0, 30)}
                      onAction={() => open(link.url as string)}
                    />
                  ) : null,
                )}
              </Detail.Metadata.TagList>
            ) : null}
            {extras.backlinks.length > 0 ? (
              <Detail.Metadata.TagList title="Backlinks">
                {extras.backlinks.map((backlink) => (
                  <Detail.Metadata.TagList.Item
                    key={backlink.id}
                    text={backlink.title.slice(0, 30)}
                    onAction={() => open(backlink.url)}
                  />
                ))}
              </Detail.Metadata.TagList>
            ) : null}
          </Detail.Metadata>
        ) : undefined
      }
      actions={
        <ActionPanel>
          <Action.Push
            title="Edit Note"
            icon={Icon.Pencil}
            target={<EditNoteView note={note} initialMarkdown={markdown} onSaved={onChanged} />}
          />
          <Action.Push
            title="Append to Note"
            icon={Icon.Plus}
            target={<AppendNoteView note={note} onSaved={onChanged} />}
          />
          <Action
            title={showMetadata ? "Hide Details" : "Show Details"}
            icon={Icon.AppWindowSidebarRight}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={() => setShowMetadata((v) => !v)}
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
          <Action
            title="Copy as Markdown"
            icon={Icon.CopyClipboard}
            onAction={() => Clipboard.copy(`# ${note.title}\n\n${markdown}`)}
          />
          <Action title="Copy as HTML" icon={Icon.CodeBlock} onAction={() => Clipboard.copy(html || "")} />
        </ActionPanel>
      }
    />
  );
}

function splitTitleAndBody(fullMarkdown: string, fallbackTitle: string): { title: string; body: string } {
  const lines = fullMarkdown.split("\n");
  const first = (lines[0] ?? "").trim();
  const heading = first.match(/^#{1,3}\s+(.*)$/);

  if (heading && heading[1].trim()) {
    return { title: heading[1].trim(), body: lines.slice(1).join("\n").trim() };
  }

  if (first && fallbackTitle !== first && lines.length > 1) {
    return { title: fallbackTitle, body: fullMarkdown };
  }

  return { title: fallbackTitle, body: fullMarkdown };
}

/** The Notes body already starts with the title as a heading - drop it so the view doesn't show it twice. */
function stripLeadingTitle(markdown: string, title: string): string {
  const lines = markdown.split("\n");
  const firstIdx = lines.findIndex((line) => line.trim().length > 0);

  if (firstIdx === -1) {
    return markdown;
  }
  const heading = lines[firstIdx].trim().match(/^#{1,3}\s+(.*)$/);

  if (heading && heading[1].trim() === title.trim()) {
    return lines
      .slice(firstIdx + 1)
      .join("\n")
      .trim();
  }

  return markdown;
}

export function EditNoteView({
  note,
  initialMarkdown,
  onSaved,
}: {
  note: AppleNote;
  initialMarkdown?: string;
  onSaved?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ title: string; body: string } | null>(
    initialMarkdown ? splitTitleAndBody(initialMarkdown, note.title) : null,
  );
  const [isLoading, setIsLoading] = useState(!initialMarkdown);

  useEffect(() => {
    if (initialMarkdown) {
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const html = await getNoteHtml(note.id);
        const md = htmlToMarkdown(html);

        if (!cancelled) {
          setLoaded(splitTitleAndBody(md, note.title));
        }
      } catch {
        if (!cancelled) {
          setLoaded({ title: note.title, body: "" });
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
  }, [initialMarkdown, note.id, note.title]);

  return (
    <Form
      isLoading={isLoading}
      navigationTitle={`Edit “${note.title}”`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Changes"
            icon={Icon.CheckCircle}
            onSubmit={async (values) => {
              const title = String(values.title ?? "").trim() || note.title;
              const body = String(values.body ?? "");
              const toast = await showToast({ style: Toast.Style.Animated, title: "Saving…" });

              try {
                await updateNote({ id: note.id, title, bodyMarkdown: body });
                toast.style = Toast.Style.Success;
                toast.title = "Note saved";
                await toast.update();
                onSaved?.();
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not save note";
                toast.message = error instanceof Error ? error.message : undefined;
                await toast.update();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="title" title="Title" defaultValue={loaded?.title ?? note.title} />
      <Form.TextArea
        id="body"
        title="Body (Markdown)"
        placeholder="Write in Markdown - headings, lists, tasks, links…"
        defaultValue={loaded?.body ?? ""}
      />
      <Form.Description text="Saved back to Apple Notes. The first line becomes the note title in Notes." />
    </Form>
  );
}

export function AppendNoteView({ note, onSaved }: { note: AppleNote; onSaved?: () => void }) {
  return (
    <Form
      navigationTitle={`Append to “${note.title}”`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Append"
            icon={Icon.Plus}
            onSubmit={async (values) => {
              const text = String(values.text ?? "").trim();

              if (!text) {
                await showToast({ style: Toast.Style.Failure, title: "Nothing to append" });

                return;
              }
              const toast = await showToast({ style: Toast.Style.Animated, title: "Appending…" });

              try {
                await appendToNote(note.id, text);
                toast.style = Toast.Style.Success;
                toast.title = "Appended to note";
                await toast.update();
                onSaved?.();
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not append";
                toast.message = error instanceof Error ? error.message : undefined;
                await toast.update();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextArea id="text" title="Text (Markdown)" placeholder="Text to add at the end…" />
    </Form>
  );
}

export function CreateNoteForm({
  onCreated,
  prefillFromClipboard,
}: {
  onCreated?: () => void;
  prefillFromClipboard?: boolean;
}) {
  const [folders, setFolders] = useState<string[]>([]);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [templateId, setTemplateId] = useState("blank");
  const [title, setTitle] = useState("");
  // `undefined` doubles as the clipboard-loading flag (Form shows its loader).
  const [body, setBody] = useState<string | undefined>(prefillFromClipboard ? undefined : "");
  const [templateVersion, setTemplateVersion] = useState(0);
  let defaultFolder = "Notes";

  try {
    defaultFolder = getPreferenceValues<Preferences>().defaultFolder || "Notes";
  } catch {
    defaultFolder = "Notes";
  }

  useEffect(() => {
    let cancelled = false;
    listFolders()
      .then((all) => {
        if (cancelled) {
          return;
        }
        setFolders([...new Set(all.map((f) => f.folder))]);
      })
      .catch(() => undefined);
    getAllTemplates()
      .then((all) => {
        if (cancelled) {
          return;
        }
        setTemplates(all);
      })
      .catch(() => undefined);

    if (prefillFromClipboard) {
      Clipboard.readText().then(
        (text) => {
          if (cancelled) {
            return;
          }

          setBody(text.trim() ? text : "");
        },
        () => {
          if (cancelled) {
            return;
          }

          setBody("");
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [prefillFromClipboard, templateVersion]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);

    if (!template) {
      return;
    }

    if (template.id === "blank") {
      setTitle("");
      setBody("");
    } else {
      setTitle(template.title);
      setBody(template.body);
    }
  };

  return (
    <Form
      navigationTitle="New Note"
      isLoading={body === undefined}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="New Note"
            icon={Icon.NewDocument}
            onSubmit={async (values) => {
              const rawTitle = String(values.title ?? title ?? "").trim();
              const rawBody = String(values.body ?? body ?? "");
              const folder = String(values.folder ?? defaultFolder).trim() || "Notes";
              const finalTitle = applyTemplatePlaceholders(rawTitle).trim();
              const finalBody = applyTemplatePlaceholders(rawBody);

              if (!finalTitle && !finalBody.trim()) {
                await showToast({ style: Toast.Style.Failure, title: "Give the note a title or body" });

                return;
              }
              const toast = await showToast({ style: Toast.Style.Animated, title: "Creating note…" });

              try {
                await createNote({ title: finalTitle || "New Note", bodyMarkdown: finalBody, folderName: folder });
                toast.style = Toast.Style.Success;
                toast.title = "Note created";
                await toast.update();
                onCreated?.();
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not create note";
                toast.message = error instanceof Error ? error.message : undefined;
                await toast.update();
              }
            }}
          />
          <Action.Push
            title="Manage Templates…"
            icon={Icon.Cog}
            shortcut={{ modifiers: ["cmd", "shift"], key: "t" }}
            target={<ManageTemplatesView onChanged={() => setTemplateVersion((v) => v + 1)} />}
          />
          <Action
            title="Reload Templates"
            icon={Icon.ArrowClockwise}
            shortcut={{ modifiers: ["cmd"], key: "r" }}
            onAction={() => setTemplateVersion((v) => v + 1)}
          />
        </ActionPanel>
      }
    >
      <Form.Dropdown id="template" title="Template" value={templateId} onChange={applyTemplate}>
        {templates.map((t) => (
          <Form.Dropdown.Item key={t.id} title={t.label} value={t.id} icon={Icon.BlankDocument} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="title" title="Title" placeholder="Note title" value={title} onChange={setTitle} />
      <Form.TextArea
        id="body"
        title="Body (Markdown)"
        placeholder="# Heading&#10;&#10;- list item&#10;- [ ] task"
        value={body ?? ""}
        onChange={setBody}
      />
      {folders.length > 0 ? (
        <Form.Dropdown id="folder" title="Folder" defaultValue={defaultFolder || folders[0]}>
          {[...new Set([defaultFolder, ...folders].filter(Boolean))].map((f) => (
            <Form.Dropdown.Item key={f} title={f} value={f} icon={Icon.Folder} />
          ))}
        </Form.Dropdown>
      ) : (
        <Form.TextField id="folder" title="Folder" placeholder="Notes" defaultValue={defaultFolder} />
      )}
    </Form>
  );
}

export function MoveToFolderForm({ note, onMoved }: { note: AppleNote; onMoved?: () => void }) {
  const [folders, setFolders] = useState<AppleFolder[]>([]);
  const [folder, setFolder] = useState(note.folder);

  useEffect(() => {
    let cancelled = false;
    listFolders()
      .then((all) => {
        if (!cancelled) {
          setFolders(all);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const folderNames = [...new Set(folders.map((f) => f.folder))].sort();

  return (
    <Form
      navigationTitle={`Move “${note.title}”`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Move Note"
            icon={Icon.Folder}
            onSubmit={async (values) => {
              const target = String(values.folder ?? folder).trim();

              if (!target || target === note.folder) {
                await showToast({ style: Toast.Style.Failure, title: "Pick a different folder" });

                return;
              }
              const account = folders.find((f) => f.folder === target)?.account || undefined;
              const toast = await showToast({ style: Toast.Style.Animated, title: `Moving to ${target}…` });

              try {
                await moveNoteToFolder(note.id, target, account);
                toast.style = Toast.Style.Success;
                toast.title = `Moved to ${target}`;
                await toast.update();
                onMoved?.();
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not move note";
                toast.message = error instanceof Error ? error.message : undefined;
                await toast.update();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Note" text={`${note.title} (now in ${note.folder || "Notes"})`} />
      {folderNames.length > 0 ? (
        <Form.Dropdown id="folder" title="Destination folder" value={folder} onChange={setFolder}>
          {folderNames.map((f) => (
            <Form.Dropdown.Item key={f} title={f} value={f} icon={Icon.Folder} />
          ))}
        </Form.Dropdown>
      ) : (
        <Form.TextField id="folder" title="Destination folder" placeholder="Notes" defaultValue={folder} />
      )}
    </Form>
  );
}

export function ExportFolderForm({ folder, onExported }: { folder: string; onExported?: (count: number) => void }) {
  return (
    <Form
      navigationTitle={`Export “${folder}”`}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Export as Markdown"
            icon={Icon.Download}
            onSubmit={async (values) => {
              const dest = String(values.dest ?? "").trim();

              if (!dest) {
                await showToast({ style: Toast.Style.Failure, title: "Choose a destination folder" });

                return;
              }
              const toast = await showToast({ style: Toast.Style.Animated, title: `Exporting ${folder}…` });

              try {
                const { count, skipped } = await exportFolderToMarkdown(folder, dest, (done, total, title) => {
                  toast.title = `Exporting ${done}/${total}…`;
                  toast.message = title;
                  void toast.update();
                });
                toast.style = Toast.Style.Success;
                toast.title = `Exported ${count} note${count === 1 ? "" : "s"}`;
                toast.message = skipped > 0 ? `${dest} (${skipped} locked skipped)` : dest;
                await toast.update();
                onExported?.(count);
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Export failed";
                toast.message = error instanceof Error ? error.message : undefined;
                await toast.update();
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description title="Folder" text={`${folder} → .md files (one per note)`} />
      <Form.FilePicker
        id="dest"
        title="Destination"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
      />
    </Form>
  );
}

export function TemplateForm({ initial, onSaved }: { initial?: NoteTemplate; onSaved?: () => void }) {
  const isBuiltin = initial ? BUILTIN_TEMPLATE_IDS.has(initial.id) : false;

  return (
    <Form
      navigationTitle={initial && !isBuiltin ? `Edit “${initial.label}”` : "New Template"}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Template"
            icon={Icon.CheckCircle}
            onSubmit={async (values) => {
              const label = String(values.label ?? "").trim();
              const title = String(values.title ?? "");
              const body = String(values.body ?? "");

              if (!label) {
                await showToast({ style: Toast.Style.Failure, title: "Give the template a name" });

                return;
              }
              const toast = await showToast({ style: Toast.Style.Animated, title: "Saving template…" });

              try {
                const id = initial && !isBuiltin ? initial.id : newTemplateId(label);
                await saveCustomTemplate({ id, label, title, body });
                toast.style = Toast.Style.Success;
                toast.title = isBuiltin ? "Saved as a custom copy" : "Template saved";
                await toast.update();
                onSaved?.();
              } catch (error) {
                toast.style = Toast.Style.Failure;
                toast.title = "Could not save template";
                toast.message = error instanceof Error ? error.message : undefined;
                await toast.update();
              }
            }}
          />
        </ActionPanel>
      }
    >
      {isBuiltin ? (
        <Form.Description
          title="Built-in template"
          text="Built-ins can't be edited directly - saving creates your own editable copy."
        />
      ) : null}
      <Form.TextField id="label" title="Name" placeholder="e.g. Weekly Review" defaultValue={initial?.label ?? ""} />
      <Form.TextField
        id="title"
        title="Note title"
        placeholder="Supports {{date}}, {{time}}, {{datetime}}"
        defaultValue={initial?.title ?? ""}
      />
      <Form.TextArea
        id="body"
        title="Body (Markdown)"
        placeholder="Supports {{date}}, {{time}}, {{datetime}}"
        defaultValue={initial?.body ?? ""}
      />
    </Form>
  );
}

export function ManageTemplatesView({ onChanged }: { onChanged?: () => void }) {
  const templatesQuery = useAsyncData(() => getCustomTemplates(), "custom-templates");
  const templates = templatesQuery.data ?? [];
  const isLoading = templatesQuery.isLoading;

  const refresh = () => {
    templatesQuery.revalidate();
    onChanged?.();
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search templates…">
      <List.Section title="New">
        <List.Item
          title="New Template"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action.Push title="Create Template" icon={Icon.Plus} target={<TemplateForm onSaved={refresh} />} />
            </ActionPanel>
          }
        />
      </List.Section>
      {templates.length > 0 ? (
        <List.Section title="My Templates" subtitle={`${templates.length}`}>
          {templates.map((template) => (
            <List.Item
              key={template.id}
              title={template.label}
              subtitle={(template.title || "No title").slice(0, 60)}
              icon={Icon.BlankDocument}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Edit Template"
                    icon={Icon.Pencil}
                    target={<TemplateForm initial={template} onSaved={refresh} />}
                  />
                  <Action
                    title="Delete Template"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    onAction={async () => {
                      if (
                        !(await confirmAlert({
                          title: `Delete “${template.label}”?`,
                          message: "This cannot be undone.",
                        }))
                      ) {
                        return;
                      }
                      await deleteCustomTemplate(template.id);
                      await showToast({ style: Toast.Style.Success, title: "Template deleted" });
                      refresh();
                    }}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : null}
      <List.Section title="Built-in" subtitle="Read-only">
        {NOTE_TEMPLATES.map((template) => (
          <List.Item
            key={template.id}
            title={template.label}
            subtitle={(template.title || "No title").slice(0, 60)}
            icon={Icon.BlankDocument}
            actions={
              <ActionPanel>
                <Action.Push
                  title="View / Save as Copy…"
                  icon={Icon.Eye}
                  target={<TemplateForm initial={template} onSaved={refresh} />}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
