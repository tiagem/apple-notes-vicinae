import { Action, ActionPanel, Form, Icon, showToast, Toast } from "@vicinae/api";
import { useEffect, useState } from "react";
import { exportFolderToMarkdown, listFolders } from "./lib/notes";

export default function ExportNotes() {
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState("Notes");

  useEffect(() => {
    let cancelled = false;
    listFolders()
      .then((all) => {
        if (cancelled) {
          return;
        }
        const names = [...new Set(all.map((f) => f.folder))].sort();
        setFolders(names);

        if (names.length > 0 && !names.includes(folder)) {
          setFolder(names[0]);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Form
      navigationTitle="Export Notes"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Export as Markdown"
            icon={Icon.Download}
            onSubmit={async (values) => {
              const targetFolder = String(values.folder ?? folder).trim() || "Notes";
              const dest = String(values.dest ?? "").trim();

              if (!dest) {
                await showToast({ style: Toast.Style.Failure, title: "Choose a destination folder" });

                return;
              }
              const toast = await showToast({ style: Toast.Style.Animated, title: `Exporting ${targetFolder}…` });

              try {
                const { count, skipped } = await exportFolderToMarkdown(targetFolder, dest, (done, total, title) => {
                  toast.title = `Exporting ${done}/${total}…`;
                  toast.message = title;
                  void toast.update();
                });
                toast.style = Toast.Style.Success;
                toast.title = `Exported ${count} note${count === 1 ? "" : "s"}`;
                toast.message = skipped > 0 ? `${dest} (${skipped} locked skipped)` : dest;
                await toast.update();
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
      {folders.length > 0 ? (
        <Form.Dropdown id="folder" title="Folder" value={folder} onChange={setFolder}>
          {folders.map((f) => (
            <Form.Dropdown.Item key={f} title={f} value={f} icon={Icon.Folder} />
          ))}
        </Form.Dropdown>
      ) : (
        <Form.TextField id="folder" title="Folder" placeholder="Notes" defaultValue={folder} />
      )}
      <Form.FilePicker
        id="dest"
        title="Destination"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
      />
      <Form.Description text="Exports one .md file per note. Locked notes are skipped." />
    </Form>
  );
}
