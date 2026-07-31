// Building and reading back the connection strings `dbcon` accepts, so the editor can offer a form
// per source kind instead of one free-text box. The string stays the single source of truth --
// these functions only project it into fields and back -- which keeps a hand-typed or pasted string
// (an exotic Postgres URL with query parameters, say) working untouched.
export type ConnectionKind = "csv" | "sqlite" | "duckdb" | "postgres" | "custom";

export interface ConnectionDraft {
  kind: ConnectionKind;
  /** File-backed kinds: the path. */
  path: string;
  /** CSV only. Empty means the default (comma). */
  delimiter: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  /** `custom`: the verbatim string. */
  raw: string;
}

export const EMPTY_DRAFT: ConnectionDraft = {
  kind: "csv",
  path: "",
  delimiter: "",
  host: "localhost",
  port: "5432",
  user: "",
  password: "",
  database: "",
  raw: "",
};

export const CONNECTION_KIND_LABEL: Record<ConnectionKind, string> = {
  csv: "CSV file",
  sqlite: "SQLite",
  duckdb: "DuckDB",
  postgres: "PostgreSQL",
  custom: "Custom",
};

/** The connection string a draft denotes. */
export function buildConnectionString(d: ConnectionDraft): string {
  switch (d.kind) {
    case "custom":
      return d.raw;
    case "csv": {
      const base = d.path.startsWith("csv://") ? d.path : `csv://${d.path}`;
      return d.delimiter ? `${base}?delimiter=${encodeURIComponent(d.delimiter)}` : base;
    }
    case "sqlite":
      return d.path.startsWith("sqlite://") ? d.path : `sqlite://${d.path}`;
    case "duckdb":
      return d.path.startsWith("duckdb://") ? d.path : `duckdb://${d.path}`;
    case "postgres": {
      const auth = d.user ? (d.password ? `${d.user}:${d.password}@` : `${d.user}@`) : "";
      const port = d.port ? `:${d.port}` : "";
      return `postgres://${auth}${d.host || "localhost"}${port}/${d.database}`;
    }
  }
}

/** Best-effort projection of a connection string back into form fields. Anything this cannot read
 *  confidently comes back as `custom` holding the original text, so editing never mangles a string
 *  the form does not fully understand. */
export function parseConnectionString(s: string): ConnectionDraft {
  const base = { ...EMPTY_DRAFT, raw: s };
  if (!s) return base;

  if (s.startsWith("csv://") || s.toLowerCase().endsWith(".csv")) {
    const [pathPart, query] = s.split("?", 2);
    const delimiter = query?.startsWith("delimiter=")
      ? decodeURIComponent(query.slice("delimiter=".length))
      : "";
    return { ...base, kind: "csv", path: pathPart.replace(/^csv:\/\//, ""), delimiter };
  }
  if (s.startsWith("sqlite://") || /\.(sqlite|sqlite3|db)$/i.test(s)) {
    return { ...base, kind: "sqlite", path: s.replace(/^sqlite:\/\//, "") };
  }
  if (s.startsWith("duckdb://") || /\.duckdb$/i.test(s)) {
    return { ...base, kind: "duckdb", path: s.replace(/^duckdb:\/\//, "") };
  }
  if (s.startsWith("postgres://") || s.startsWith("postgresql://")) {
    try {
      // `URL` handles the percent-decoding of a password containing "@" or ":", which a hand-rolled
      // split would get wrong.
      const u = new URL(s);
      return {
        ...base,
        kind: "postgres",
        host: u.hostname || "localhost",
        port: u.port || "5432",
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ""),
      };
    } catch {
      return { ...base, kind: "custom" };
    }
  }
  return { ...base, kind: "custom" };
}

/** A one-line description of what a connection points at, with any password masked -- shown in the
 *  connection list so a source is identifiable without exposing a secret on screen. */
export function describeConnection(s: string): string {
  if (!s) return "not configured";
  const d = parseConnectionString(s);
  switch (d.kind) {
    case "csv":
    case "sqlite":
    case "duckdb":
      return `${CONNECTION_KIND_LABEL[d.kind]} · ${d.path || "no path"}`;
    case "postgres":
      return `PostgreSQL · ${d.user ? `${d.user}@` : ""}${d.host}${d.port ? `:${d.port}` : ""}/${d.database}`;
    case "custom":
      return maskSecrets(s);
  }
}

/** The name a connection suggests for its source id: a file's stem, a Postgres database name.
 *  Empty when the string says nothing usable, so the caller keeps the id it has. */
export function suggestedSourceId(s: string): string {
  const d = parseConnectionString(s);
  const raw =
    d.kind === "postgres" ? d.database : (d.path.split(/[\\/]/).pop() ?? "").replace(/\.[^.]*$/, "");
  return raw.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

/** Whether `id` is still a placeholder this editor minted, and so may be replaced by a name
 *  derived from the connection rather than one the user chose. */
export function isAutoSourceId(id: string): boolean {
  return /^source(-\d+)?$/.test(id);
}

/** Replace the password in a URL-shaped string with dots. */
export function maskSecrets(s: string): string {
  return s.replace(/\/\/([^:/@]+):([^@]+)@/, (_m, user) => `//${user}:****@`);
}
