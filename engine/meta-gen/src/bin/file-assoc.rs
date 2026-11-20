//! Generates the desktop app's file associations from the engine's import formats:
//!
//! - `tauri.conf.json` `bundle.fileAssociations`, used on macOS (the other platforms replace it).
//! - `tauri.windows.conf.json` with `bundle/windows/nsis-hooks.nsh` and `bundle/windows/open-with.wxs`.
//! - `tauri.linux.conf.json` with `bundle/linux/propel-mime.xml`.
//!
//! Propel is the default app only for the formats in `OWN` (and `LINUX_OWN` on Linux). For the
//! formats in `GENERIC` it is only offered under "Open with". Every extension the engine imports
//! has to be listed in one of the tables, so a new import format fails here until it is placed.
//!
//! Run: `pnpm gen:file-assoc` (or `cargo run -p meta-gen --bin file-assoc [-- <app dir>]`).

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use backend_shared::{get_all_artifact_kinds, get_all_item_kinds};
use serde_json::{json, Value};

struct Own {
    ext: &'static str,
    name: &'static str,
    /// macOS type the exported type conforms to.
    uti_parent: &'static str,
    /// Linux MIME type, declared in `propel-mime.xml`.
    mime: &'static str,
    mime_parent: &'static str,
}

const OWN: &[Own] = &[
    Own {
        ext: "xes",
        name: "XES event log",
        uti_parent: "public.xml",
        mime: "application/x-xes+xml",
        mime_parent: "application/xml",
    },
    Own {
        ext: "pnml",
        name: "PNML Petri net",
        uti_parent: "public.xml",
        mime: "application/x-pnml+xml",
        mime_parent: "application/xml",
    },
    Own {
        ext: "apnml",
        name: "Accepting Petri net",
        uti_parent: "public.xml",
        mime: "application/x-apnml+xml",
        mime_parent: "application/xml",
    },
    Own {
        ext: "ocdeclare",
        name: "OC-DECLARE model",
        uti_parent: "public.json",
        mime: "application/x-ocdeclare+json",
        mime_parent: "application/json",
    },
    Own {
        ext: "reflow",
        name: "Reflow mapping",
        uti_parent: "public.json",
        mime: "application/x-propel-reflow+json",
        mime_parent: "application/json",
    },
];

/// Multi-part extensions. Windows and macOS only look at the part after the last dot, so Propel
/// owns these on Linux only, where shared-mime-info prefers the longest matching glob.
const LINUX_OWN: &[Own] = &[
    Own {
        ext: "xes.gz",
        name: "Compressed XES event log",
        uti_parent: "",
        mime: "application/x-xes+gzip",
        mime_parent: "application/gzip",
    },
    Own {
        ext: "ocel.csv",
        name: "OCEL CSV event log",
        uti_parent: "",
        mime: "application/x-ocel-csv",
        mime_parent: "text/csv",
    },
    Own {
        ext: "ocel.csv.gz",
        name: "Compressed OCEL CSV event log",
        uti_parent: "",
        mime: "application/x-ocel-csv+gzip",
        mime_parent: "application/gzip",
    },
    Own {
        ext: "ocel.zip",
        name: "OCEL bundle",
        uti_parent: "",
        mime: "application/x-ocel+zip",
        mime_parent: "application/zip",
    },
    Own {
        ext: "ocel-parquet.zip",
        name: "OCEL Parquet bundle",
        uti_parent: "",
        mime: "application/x-ocel-parquet+zip",
        mime_parent: "application/zip",
    },
];

/// Formats other apps own. On Windows and macOS Propel is listed under "Open with" for them but
/// never becomes the default. Linux gets none of them.
const GENERIC: &[(&str, &str)] = &[
    ("json", "JSON file"),
    ("xml", "XML file"),
    ("csv", "CSV file"),
    ("tsv", "TSV file"),
    ("xlsx", "Excel workbook"),
    ("parquet", "Parquet file"),
    ("db", "Database file"),
    ("sqlite", "SQLite database"),
    ("sqlite3", "SQLite database"),
    ("gz", "Gzip archive"),
    ("zip", "ZIP archive"),
];

/// Multi-part extensions of generic formats. They reach Propel through their last part only.
const GENERIC_MULTI: &[&str] = &["json.gz", "xml.gz"];

/// Classes the NSIS installers up to v0.5.0 registered with Tauri's `APP_ASSOCIATE`, newest
/// first. Each made Propel the default app and kept the previous default in `<class>_backup`.
const LEGACY_CLASSES: &[&str] = &[
    "Table file",
    "Petri net file",
    "OC-DECLARE model file",
    "Reflow mapping file",
    "OCEL file",
    "OCDeclare file",
    "TabularSource file",
    "PetriNet file",
    "EventLog file",
];

/// Every extension those installers registered.
const LEGACY_EXTS: &[&str] = &[
    "json",
    "json.gz",
    "xml",
    "xml.gz",
    "ocel.csv",
    "ocel.csv.gz",
    "ocel.zip",
    "ocel-parquet.zip",
    "sqlite",
    "xes",
    "xes.gz",
    "sqlite3",
    "db",
    "csv",
    "tsv",
    "parquet",
    "xlsx",
    "pnml",
    "apnml",
    "ocdeclare",
    "reflow",
];

/// The open command those installers wrote (Tauri CLI <= 2.12.3 left the path unquoted).
const LEGACY_COMMAND: &str = r#"$INSTDIR\propel-tauri.exe "%1""#;

const HOOKS_PATH: &str = "bundle/windows/nsis-hooks.nsh";
const WXS_PATH: &str = "bundle/windows/open-with.wxs";
const MIME_XML_PATH: &str = "bundle/linux/propel-mime.xml";
const DESKTOP_TEMPLATE_PATH: &str = "bundle/linux/propel.desktop";
const GENERATED_NOTE: &str =
    "Generated by engine/meta-gen/src/bin/file-assoc.rs (pnpm gen:file-assoc). Do not edit.";

fn own_class(ext: &str) -> String {
    format!("propel.{ext}")
}

fn open_with_class(ext: &str) -> String {
    format!("propel.openwith.{ext}")
}

fn wix_component(ext: &str) -> String {
    format!("PropelOpenWith_{ext}")
}

/// Every extension the engine imports.
fn engine_extensions() -> BTreeSet<String> {
    let mut exts = BTreeSet::new();
    let item_formats = get_all_item_kinds()
        .expect("get_all_item_kinds")
        .into_iter()
        .flat_map(|info| info.import_formats);
    let artifact_formats = get_all_artifact_kinds()
        .into_iter()
        .flat_map(|info| info.import_formats);
    for f in item_formats.chain(artifact_formats) {
        let ext = f.extension.trim_start_matches('.').to_string();
        if !ext.is_empty() {
            exts.insert(ext);
        }
    }
    exts
}

/// Panics unless the tables above cover exactly the engine's extensions.
fn check_tables(engine_exts: &BTreeSet<String>) {
    let mut listed: BTreeSet<&str> = BTreeSet::new();
    for ext in OWN
        .iter()
        .chain(LINUX_OWN)
        .map(|o| o.ext)
        .chain(GENERIC.iter().map(|(e, _)| *e))
        .chain(GENERIC_MULTI.iter().copied())
    {
        assert!(listed.insert(ext), "file-assoc: {ext} is listed twice");
    }
    for o in OWN {
        assert!(
            !o.ext.contains('.'),
            "file-assoc: {} in OWN has several parts, Windows and macOS only match the last one",
            o.ext
        );
    }
    let last_parts: BTreeSet<&str> = engine_exts
        .iter()
        .filter_map(|e| e.rsplit_once('.').map(|(_, last)| last))
        .collect();

    let unlisted: Vec<&String> = engine_exts
        .iter()
        .filter(|e| !listed.contains(e.as_str()))
        .collect();
    assert!(
        unlisted.is_empty(),
        "file-assoc: the engine imports {unlisted:?}, which no table in file-assoc.rs lists"
    );
    let stale: Vec<&&str> = listed
        .iter()
        .filter(|e| !engine_exts.contains(**e) && !last_parts.contains(**e))
        .collect();
    assert!(
        stale.is_empty(),
        "file-assoc: {stale:?} are listed but the engine no longer imports them"
    );
    for multi in LINUX_OWN
        .iter()
        .map(|o| o.ext)
        .chain(GENERIC_MULTI.iter().copied())
    {
        let last = multi.rsplit_once('.').map_or(multi, |(_, last)| last);
        assert!(
            GENERIC.iter().any(|(e, _)| *e == last),
            "file-assoc: {multi} needs its last part {last} in GENERIC to open on Windows and macOS"
        );
    }
}

struct Rendered {
    /// `bundle.fileAssociations` of `tauri.conf.json`.
    base_associations: Value,
    /// Path relative to the app dir -> full content.
    files: Vec<(&'static str, String)>,
}

fn render(engine_exts: &BTreeSet<String>, identifier: &str) -> Rendered {
    check_tables(engine_exts);

    // macOS. An exported type keeps `LSItemContentTypes` to Propel's own type; Tauri otherwise
    // derives it from the MIME type (e.g. public.json), and macOS then ignores the extensions.
    let mut base = Vec::new();
    for o in OWN {
        base.push(json!({
            "ext": [o.ext],
            "name": o.name,
            "description": o.name,
            "role": "Editor",
            "exportedType": {
                "identifier": format!("{identifier}.{}", o.ext),
                "conformsTo": [o.uti_parent],
            },
        }));
    }
    for (ext, name) in GENERIC {
        base.push(json!({ "ext": [ext], "name": name, "role": "Viewer", "rank": "Alternate" }));
    }

    let windows_conf = json!({
        "bundle": {
            "fileAssociations": OWN.iter().map(|o| json!({
                "ext": [o.ext],
                "name": own_class(o.ext),
                "description": o.name,
                "role": "Editor",
            })).collect::<Vec<_>>(),
            "windows": {
                "nsis": { "installerHooks": HOOKS_PATH },
                "wix": {
                    "fragmentPaths": [WXS_PATH],
                    "componentRefs": GENERIC.iter().map(|(e, _)| wix_component(e)).collect::<Vec<_>>(),
                },
            },
        },
    });

    let linux_package = json!({
        "desktopTemplate": DESKTOP_TEMPLATE_PATH,
        "files": { "/usr/share/mime/packages/propel.xml": MIME_XML_PATH },
    });
    let linux_conf = json!({
        "bundle": {
            "fileAssociations": OWN.iter().chain(LINUX_OWN).map(|o| json!({
                "ext": [o.ext],
                "name": o.name,
                "mimeType": o.mime,
                "role": "Editor",
            })).collect::<Vec<_>>(),
            "linux": { "deb": linux_package.clone(), "rpm": linux_package },
        },
    });

    Rendered {
        base_associations: Value::Array(base),
        files: vec![
            ("tauri.windows.conf.json", pretty(&windows_conf)),
            ("tauri.linux.conf.json", pretty(&linux_conf)),
            (HOOKS_PATH, nsis_hooks()),
            (WXS_PATH, open_with_wxs()),
            (MIME_XML_PATH, mime_xml()),
        ],
    }
}

fn pretty(v: &Value) -> String {
    let mut s = serde_json::to_string_pretty(v).expect("serialize");
    s.push('\n');
    s
}

fn nsis_hooks() -> String {
    let mut s = String::new();
    let mut line = |l: &str| {
        s.push_str(l);
        s.push('\n');
    };
    line(&format!("; {GENERATED_NOTE}"));
    line(";");
    line("; Tauri's APP_ASSOCIATE makes Propel the default app for the formats in");
    line("; tauri.windows.conf.json. These hooks list it under \"Open with\" for generic formats and");
    line("; undo what the installers up to v0.5.0 registered: they made Propel the default for every");
    line("; format it reads and lost the previous default whenever an update ran over an install.");
    line("");

    line("; Puts back the default the user had before an old installer took the extension over.");
    line("; Only where the extension points at an old class that is missing or still opens this");
    line("; install's executable, or where an old uninstaller left an empty default next to the");
    line("; old backups.");
    line("!macro PropelRemoveLegacyExt EXT");
    line("  ReadRegStr $R0 SHCTX \"Software\\Classes\\.${EXT}\" \"\"");
    line("  StrCpy $R1 0");
    line("  ${If} $R0 == \"\"");
    for class in LEGACY_CLASSES {
        line("    ClearErrors");
        line(&format!(
            "    ReadRegStr $R2 SHCTX \"Software\\Classes\\.${{EXT}}\" \"{class}_backup\""
        ));
        line("    ${IfNot} ${Errors}");
        line("      StrCpy $R1 1");
        line("    ${EndIf}");
    }
    line("  ${EndIf}");
    if_any_class(&mut line, "  ", "$R0", "==");
    line("    ReadRegStr $R2 SHCTX \"Software\\Classes\\$R0\\shell\\open\\command\" \"\"");
    line(&format!("    ${{If}} $R2 == '{LEGACY_COMMAND}'"));
    line("    ${OrIf} $R2 == \"\"");
    line("      StrCpy $R1 1");
    line("    ${EndIf}");
    line("  ${EndIf}");
    line("  ${If} $R1 = 1");
    line(
        "    ; Newer installers overwrote the backup with their own class name, so take the newest",
    );
    line("    ; backup that is not a Propel class. An empty one means there was no default.");
    line("    StrCpy $R2 \"\"");
    for class in LEGACY_CLASSES {
        line("    ${If} $R1 = 1");
        line("      ClearErrors");
        line(&format!(
            "      ReadRegStr $R3 SHCTX \"Software\\Classes\\.${{EXT}}\" \"{class}_backup\""
        ));
        line("      ${IfNot} ${Errors}");
        if_any_class(&mut line, "        ", "$R3", "!=");
        line("          StrCpy $R2 $R3");
        line("          StrCpy $R1 2");
        line("        ${EndIf}");
        line("      ${EndIf}");
        line("    ${EndIf}");
    }
    line("    ${If} $R2 == \"\"");
    line("      DeleteRegValue SHCTX \"Software\\Classes\\.${EXT}\" \"\"");
    line("    ${Else}");
    line("      WriteRegStr SHCTX \"Software\\Classes\\.${EXT}\" \"\" $R2");
    line("    ${EndIf}");
    line("  ${EndIf}");
    line("  ; An old uninstaller may have put the default back but kept the backups.");
    for class in LEGACY_CLASSES {
        line(&format!(
            "  ReadRegStr $R2 SHCTX \"Software\\Classes\\{class}\\shell\\open\\command\" \"\""
        ));
        line(&format!("  ${{If}} $R2 == '{LEGACY_COMMAND}'"));
        line("  ${OrIf} $R2 == \"\"");
        line(&format!(
            "    DeleteRegValue SHCTX \"Software\\Classes\\.${{EXT}}\" \"{class}_backup\""
        ));
        line("  ${EndIf}");
    }
    line("  DeleteRegKey /ifempty SHCTX \"Software\\Classes\\.${EXT}\"");
    line("!macroend");
    line("");

    line("!macro PropelRemoveLegacyClass CLASS");
    line("  ReadRegStr $R0 SHCTX \"Software\\Classes\\${CLASS}\\shell\\open\\command\" \"\"");
    line(&format!("  ${{If}} $R0 == '{LEGACY_COMMAND}'"));
    line("    DeleteRegKey SHCTX \"Software\\Classes\\${CLASS}\"");
    line("  ${EndIf}");
    line("!macroend");
    line("");

    line("; APP_ASSOCIATE backs up the current default. When that is already Propel's class (an update");
    line(
        "; over an install), put the real previous default back first so the backup stays correct.",
    );
    line("!macro PropelRestoreOwnDefault EXT CLASS");
    line("  ReadRegStr $R0 SHCTX \"Software\\Classes\\.${EXT}\" \"\"");
    line("  ${If} $R0 == \"${CLASS}\"");
    line("    ReadRegStr $R1 SHCTX \"Software\\Classes\\.${EXT}\" \"${CLASS}_backup\"");
    line("    ${If} $R1 == \"${CLASS}\"");
    line("    ${OrIf} $R1 == \"\"");
    line("      DeleteRegValue SHCTX \"Software\\Classes\\.${EXT}\" \"\"");
    line("    ${Else}");
    line("      WriteRegStr SHCTX \"Software\\Classes\\.${EXT}\" \"\" $R1");
    line("    ${EndIf}");
    line("  ${EndIf}");
    line("!macroend");
    line("");

    line(
        "; APP_UNASSOCIATE writes the backup back unconditionally. Keep a default the user picked",
    );
    line("; after installing Propel.");
    line("!macro PropelKeepOtherDefault EXT CLASS");
    line("  ReadRegStr $R0 SHCTX \"Software\\Classes\\.${EXT}\" \"\"");
    line("  ${If} $R0 != \"${CLASS}\"");
    line("    WriteRegStr SHCTX \"Software\\Classes\\.${EXT}\" \"${CLASS}_backup\" $R0");
    line("  ${EndIf}");
    line("!macroend");
    line("");

    line("!macro PropelTidyOwn EXT CLASS");
    line("  ReadRegStr $R0 SHCTX \"Software\\Classes\\.${EXT}\" \"\"");
    line("  ${If} $R0 == \"\"");
    line("    DeleteRegValue SHCTX \"Software\\Classes\\.${EXT}\" \"\"");
    line("  ${EndIf}");
    line("  DeleteRegValue SHCTX \"Software\\Classes\\.${EXT}\" \"${CLASS}_backup\"");
    line("  DeleteRegKey /ifempty SHCTX \"Software\\Classes\\.${EXT}\"");
    line("!macroend");
    line("");

    let command = r#"'"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'"#;
    line("!macro PropelRegisterOpenWith EXT DESCRIPTION");
    line(
        "  WriteRegStr SHCTX \"Software\\Classes\\propel.openwith.${EXT}\" \"\" \"${DESCRIPTION}\"",
    );
    line("  WriteRegStr SHCTX \"Software\\Classes\\propel.openwith.${EXT}\\DefaultIcon\" \"\" '\"$INSTDIR\\${MAINBINARYNAME}.exe\",0'");
    line(&format!(
        "  WriteRegStr SHCTX \"Software\\Classes\\propel.openwith.${{EXT}}\\shell\\open\\command\" \"\" {command}"
    ));
    line("  WriteRegStr SHCTX \"Software\\Classes\\.${EXT}\\OpenWithProgids\" \"propel.openwith.${EXT}\" \"\"");
    line("!macroend");
    line("");

    line("!macro PropelUnregisterOpenWith EXT");
    line("  ReadRegStr $R0 SHCTX \"Software\\Classes\\propel.openwith.${EXT}\\shell\\open\\command\" \"\"");
    line(&format!("  ${{If}} $R0 == {command}"));
    line("    DeleteRegKey SHCTX \"Software\\Classes\\propel.openwith.${EXT}\"");
    line("    DeleteRegValue SHCTX \"Software\\Classes\\.${EXT}\\OpenWithProgids\" \"propel.openwith.${EXT}\"");
    line("    DeleteRegKey /ifempty SHCTX \"Software\\Classes\\.${EXT}\\OpenWithProgids\"");
    line("    DeleteRegKey /ifempty SHCTX \"Software\\Classes\\.${EXT}\"");
    line("  ${EndIf}");
    line("!macroend");
    line("");

    let push = |line: &mut dyn FnMut(&str)| {
        for r in ["$R0", "$R1", "$R2", "$R3"] {
            line(&format!("  Push {r}"));
        }
    };
    let pop = |line: &mut dyn FnMut(&str)| {
        for r in ["$R3", "$R2", "$R1", "$R0"] {
            line(&format!("  Pop {r}"));
        }
    };
    let notify = "  System::Call \"shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)\"";

    line("!macro PropelRemoveLegacy");
    for ext in LEGACY_EXTS {
        line(&format!("  !insertmacro PropelRemoveLegacyExt \"{ext}\""));
    }
    for class in LEGACY_CLASSES {
        line(&format!(
            "  !insertmacro PropelRemoveLegacyClass \"{class}\""
        ));
    }
    line("!macroend");
    line("");

    line("!macro NSIS_HOOK_PREINSTALL");
    push(&mut line);
    line("  !insertmacro PropelRemoveLegacy");
    for o in OWN {
        line(&format!(
            "  !insertmacro PropelRestoreOwnDefault \"{}\" \"{}\"",
            o.ext,
            own_class(o.ext)
        ));
    }
    pop(&mut line);
    line("!macroend");
    line("");

    line("!macro NSIS_HOOK_POSTINSTALL");
    for (ext, name) in GENERIC {
        line(&format!(
            "  !insertmacro PropelRegisterOpenWith \"{ext}\" \"{name}\""
        ));
    }
    line(notify);
    line("!macroend");
    line("");

    line("!macro NSIS_HOOK_PREUNINSTALL");
    push(&mut line);
    line("  !insertmacro PropelRemoveLegacy");
    for (ext, _) in GENERIC {
        line(&format!(
            "  !insertmacro PropelUnregisterOpenWith \"{ext}\""
        ));
    }
    for o in OWN {
        line(&format!(
            "  !insertmacro PropelKeepOtherDefault \"{}\" \"{}\"",
            o.ext,
            own_class(o.ext)
        ));
    }
    pop(&mut line);
    line("!macroend");
    line("");

    line("!macro NSIS_HOOK_POSTUNINSTALL");
    line("  Push $R0");
    for o in OWN {
        line(&format!(
            "  !insertmacro PropelTidyOwn \"{}\" \"{}\"",
            o.ext,
            own_class(o.ext)
        ));
    }
    line("  Pop $R0");
    line(notify);
    line("!macroend");
    s
}

/// `${If} VAR OP "class1"` followed by `${OrIf}`/`${AndIf}` for the other legacy classes.
fn if_any_class(line: &mut impl FnMut(&str), indent: &str, var: &str, op: &str) {
    let join = if op == "==" { "${OrIf}" } else { "${AndIf}" };
    for (i, class) in LEGACY_CLASSES.iter().enumerate() {
        let keyword = if i == 0 { "${If}" } else { join };
        line(&format!("{indent}{keyword} {var} {op} \"{class}\""));
    }
}

fn open_with_wxs() -> String {
    // Stable component GUIDs, so upgrades recognize the components.
    let namespace = uuid::Uuid::new_v5(
        &uuid::Uuid::NAMESPACE_URL,
        b"https://github.com/aarkue/propel/open-with",
    );
    let mut s = format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<!-- {GENERATED_NOTE} -->
<!-- Lists Propel under "Open with" for generic formats without making it their default. -->
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <?if $(sys.BUILDARCH) = x86 ?>
  <?define PropelWin64 = "no" ?>
  <?else ?>
  <?define PropelWin64 = "yes" ?>
  <?endif ?>
  <Fragment>
    <DirectoryRef Id="INSTALLDIR">
"#
    );
    for (ext, name) in GENERIC {
        let class = open_with_class(ext);
        let guid = uuid::Uuid::new_v5(&namespace, ext.as_bytes());
        s.push_str(&format!(
            r#"      <Component Id="{component}" Guid="{guid}" Win64="$(var.PropelWin64)">
        <RegistryValue Root="HKLM" Key="Software\Classes\{class}" Type="string" Value="{name}" KeyPath="yes"/>
        <RegistryValue Root="HKLM" Key="Software\Classes\{class}\DefaultIcon" Type="string" Value="&quot;[!Path]&quot;,0"/>
        <RegistryValue Root="HKLM" Key="Software\Classes\{class}\shell\open\command" Type="string" Value="&quot;[!Path]&quot; &quot;%1&quot;"/>
        <RegistryValue Root="HKLM" Key="Software\Classes\.{ext}\OpenWithProgids" Name="{class}" Type="string" Value=""/>
      </Component>
"#,
            component = wix_component(ext),
        ));
    }
    s.push_str("    </DirectoryRef>\n  </Fragment>\n</Wix>\n");
    s
}

fn mime_xml() -> String {
    let mut s = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!-- {GENERATED_NOTE} -->
<!-- Installed to /usr/share/mime/packages by the .deb and .rpm. Each format Propel owns gets a
     type of its own, so the desktop entry does not claim every XML, JSON, CSV or archive. -->
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
"#
    );
    for o in OWN.iter().chain(LINUX_OWN) {
        s.push_str(&format!(
            r#"  <mime-type type="{mime}">
    <comment>{name}</comment>
    <sub-class-of type="{parent}"/>
    <glob pattern="*.{ext}"/>
  </mime-type>
"#,
            mime = o.mime,
            name = o.name,
            parent = o.mime_parent,
            ext = o.ext,
        ));
    }
    s.push_str("</mime-info>\n");
    s
}

fn default_app_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../app")
}

fn read_conf(dir: &Path) -> (String, Value) {
    let path = dir.join("tauri.conf.json");
    let src =
        std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    // serde_json has `preserve_order` here (see Cargo.toml), so untouched keys keep their order.
    let conf = serde_json::from_str(&src).expect("parse tauri.conf.json");
    (src, conf)
}

/// Every generated file with its new content, `tauri.conf.json` included.
fn outputs(dir: &Path) -> Vec<(PathBuf, String)> {
    let (_, mut conf) = read_conf(dir);
    let identifier = conf["identifier"].as_str().expect("identifier").to_string();
    let engine_exts = engine_extensions();
    let rendered = render(&engine_exts, &identifier);
    conf["bundle"]["fileAssociations"] = rendered.base_associations;
    let mut out = vec![(dir.join("tauri.conf.json"), pretty(&conf))];
    out.extend(
        rendered
            .files
            .into_iter()
            .map(|(rel, content)| (dir.join(rel), content)),
    );
    out
}

fn main() {
    let dir = std::env::args()
        .nth(1)
        .map_or_else(default_app_dir, PathBuf::from);
    for (path, content) in outputs(&dir) {
        if std::fs::read_to_string(&path).is_ok_and(|old| old == content) {
            continue;
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create dir");
        }
        std::fs::write(&path, content).unwrap_or_else(|e| panic!("write {}: {e}", path.display()));
        eprintln!("file-assoc: updated {}", path.display());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn exts(list: &[&str]) -> BTreeSet<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn generated_files_are_up_to_date() {
        for (path, content) in outputs(&default_app_dir()) {
            let on_disk = std::fs::read_to_string(&path).unwrap_or_default();
            assert!(
                on_disk == content,
                "{} is out of date, run `pnpm gen:file-assoc`",
                path.display()
            );
        }
    }

    #[test]
    fn no_generic_format_is_owned() {
        let rendered = render(&engine_extensions(), "eu.aarkue.propel");
        let generic: BTreeSet<&str> = GENERIC.iter().map(|(e, _)| *e).collect();
        for a in rendered.base_associations.as_array().unwrap() {
            let ext = a["ext"][0].as_str().unwrap();
            if generic.contains(ext) {
                assert_eq!(a["rank"], "Alternate", "{ext}");
                assert!(a.get("exportedType").is_none() && a.get("mimeType").is_none());
            } else {
                assert!(a["exportedType"]["identifier"].is_string(), "{ext}");
            }
        }
        for (rel, content) in &rendered.files {
            if rel.ends_with(".json") {
                let conf: Value = serde_json::from_str(content).unwrap();
                for a in conf["bundle"]["fileAssociations"].as_array().unwrap() {
                    for ext in a["ext"].as_array().unwrap() {
                        assert!(!generic.contains(ext.as_str().unwrap()), "{rel}: {ext}");
                    }
                    if let Some(mime) = a["mimeType"].as_str() {
                        assert!(mime.starts_with("application/x-"), "{rel}: {mime}");
                    }
                }
            }
        }
    }

    #[test]
    fn hooks_cover_every_legacy_and_generic_format() {
        let hooks = nsis_hooks();
        for ext in LEGACY_EXTS {
            assert!(
                hooks.contains(&format!("PropelRemoveLegacyExt \"{ext}\"")),
                "{ext}"
            );
        }
        for class in LEGACY_CLASSES {
            assert!(
                hooks.contains(&format!("PropelRemoveLegacyClass \"{class}\"")),
                "{class}"
            );
        }
        let wxs = open_with_wxs();
        for (ext, _) in GENERIC {
            assert!(
                hooks.contains(&format!("PropelRegisterOpenWith \"{ext}\"")),
                "{ext}"
            );
            assert!(
                hooks.contains(&format!("PropelUnregisterOpenWith \"{ext}\"")),
                "{ext}"
            );
            assert!(wxs.contains(&format!(
                "Key=\"Software\\Classes\\.{ext}\\OpenWithProgids\""
            )));
        }
        for o in OWN {
            assert!(!LEGACY_CLASSES.contains(&own_class(o.ext).as_str()));
            assert!(hooks.contains(&format!(
                "PropelRestoreOwnDefault \"{}\" \"{}\"",
                o.ext,
                own_class(o.ext)
            )));
        }
    }

    #[test]
    #[should_panic(expected = "no table in file-assoc.rs lists")]
    fn unknown_engine_extension_fails() {
        let mut e = engine_extensions();
        e.insert("foo".to_string());
        check_tables(&e);
    }

    #[test]
    #[should_panic(expected = "no longer imports")]
    fn stale_table_entry_fails() {
        check_tables(&exts(&["xes", "pnml"]));
    }
}
