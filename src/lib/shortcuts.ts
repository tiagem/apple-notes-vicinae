import { Keyboard } from "@vicinae/api";

// @vicinae/api declares Common members as loose `string`, which the
// `shortcut` prop rejects - narrow once here, reuse everywhere.
export function commonShortcut(name: keyof typeof Keyboard.Shortcut.Common): Keyboard.Shortcut.Common {
  return Keyboard.Shortcut.Common[name] as Keyboard.Shortcut.Common;
}
