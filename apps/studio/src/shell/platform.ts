/** True on macOS; picks the right modifier glyph for keyboard hints. */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    "";
  if (/mac/i.test(platform)) return true;
  return /macintosh|mac os x/i.test(navigator.userAgent ?? "");
}

/** Render a single-letter shortcut like "⌘K" / "Ctrl K". */
export function shortcutLabel(key: string): string {
  return isMac() ? `⌘${key.toUpperCase()}` : `Ctrl ${key.toUpperCase()}`;
}
