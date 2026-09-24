import { LocalStorage } from "@vicinae/api";
import { applyTemplatePlaceholders, NOTE_TEMPLATES, NoteTemplate } from "./notes";

const STORAGE_KEY = "custom-templates-v1";
export const BUILTIN_TEMPLATE_IDS = new Set(NOTE_TEMPLATES.map((t) => t.id));

function isValidTemplate(value: unknown): value is NoteTemplate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const t = value as Record<string, unknown>;

  return (
    typeof t.id === "string" && typeof t.label === "string" && typeof t.title === "string" && typeof t.body === "string"
  );
}

export async function getCustomTemplates(): Promise<NoteTemplate[]> {
  try {
    const raw = await LocalStorage.getItem<string>(STORAGE_KEY);

    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isValidTemplate).filter((t) => !BUILTIN_TEMPLATE_IDS.has(t.id));
  } catch {
    return [];
  }
}

export async function getAllTemplates(): Promise<NoteTemplate[]> {
  return [...NOTE_TEMPLATES, ...(await getCustomTemplates())];
}

export function newTemplateId(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `custom-${slug || "template"}-${Date.now().toString(36)}`;
}

export async function saveCustomTemplate(template: NoteTemplate): Promise<void> {
  if (BUILTIN_TEMPLATE_IDS.has(template.id)) {
    throw new Error("Built-in templates cannot be edited - save it as a copy instead.");
  }
  const existing = await getCustomTemplates();
  const idx = existing.findIndex((t) => t.id === template.id);
  const next = idx === -1 ? [...existing, template] : existing.map((t) => (t.id === template.id ? template : t));
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  const existing = await getCustomTemplates();
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(existing.filter((t) => t.id !== id)));
}

export { applyTemplatePlaceholders };
export type { NoteTemplate };
