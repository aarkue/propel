function fileUriToPath(uri: string): string | null {
  if (!uri.startsWith("file://")) return null;
  try {
    const u = new URL(uri);
    let p = decodeURIComponent(u.pathname);
    // Windows: `file:///C:/x` -> pathname `/C:/x`; strip the leading slash.
    if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
    return p;
  } catch {
    return null;
  }
}

/** Tauri's WebKit may strip dropped `File` bytes; the real paths arrive as text/uri-list, file:// anchors in text/html, or plain text. */
export function extractPathsFromDataTransfer(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const out: string[] = [];
  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const p = fileUriToPath(trimmed);
      if (p) out.push(p);
    }
  }
  if (out.length === 0) {
    const html = dt.getData("text/html");
    if (html) {
      // WebKitGTK wraps a dropped file as `<a ...>file:///path</a>` (URL as anchor text), so the
      // match must stop at `<` and `>`, not only `>`.
      for (const m of html.matchAll(/file:\/\/[^\s"'<>]+/gi)) {
        const p = fileUriToPath(m[0]);
        if (p) out.push(p);
      }
    }
  }
  if (out.length === 0) {
    // Some WebKitGTK builds expose the dropped path only as text/plain.
    const plain = dt.getData("text/plain").trim();
    if (plain.startsWith("file://")) {
      const p = fileUriToPath(plain);
      if (p) out.push(p);
    } else if (plain.startsWith("/") && !plain.includes("\n")) {
      out.push(plain);
    }
  }
  return out;
}

/** Empty on Tauri's WebKit, where paths are used instead. */
export function filesOf(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  if (dt.files && dt.files.length > 0) return Array.from(dt.files);
  if (dt.items)
    return Array.from(dt.items)
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
  return [];
}
