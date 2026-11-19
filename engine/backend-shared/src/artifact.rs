//! Propel-side, engine-stored values kept outside the `process_mining` registry: OC-DECLARE
//! models, whose file also carries the editor layout, and Reflow mappings. Artifacts cross the
//! binding boundary by value, never as a handle.

use process_mining::core::io::ExtensionWithMime;

use crate::oc_declare_file::OCDeclareModelFile;
use crate::reflow_mapping_file::ReflowMappingFile;

pub enum PropelArtifact {
    OCDeclare(OCDeclareModelFile),
    ReflowMapping(ReflowMappingFile),
}

fn oc_declare_formats() -> Vec<ExtensionWithMime> {
    vec![ExtensionWithMime::new("ocdeclare", "application/json")]
}

fn reflow_formats() -> Vec<ExtensionWithMime> {
    vec![ExtensionWithMime::new("reflow", "application/json")]
}

fn is_json_format(format: &str, ext: &str) -> bool {
    format.ends_with(ext) || format.ends_with("json")
}

fn import_oc_declare(bytes: &[u8], format: &str) -> Result<OCDeclareModelFile, String> {
    if !is_json_format(format, "ocdeclare") {
        return Err(format!("Unsupported OC-DECLARE format: {format}"));
    }
    OCDeclareModelFile::from_json_bytes(bytes)
}

impl PropelArtifact {
    /// Every artifact kind, for enumeration (file filters, OS file associations, viewer wiring).
    pub const KINDS: &'static [&'static str] = &["OCDeclare", "ReflowMapping"];

    pub fn kind(&self) -> &'static str {
        match self {
            PropelArtifact::OCDeclare(_) => "OCDeclare",
            PropelArtifact::ReflowMapping(_) => "ReflowMapping",
        }
    }

    pub fn known_import_formats(kind: &str) -> Vec<ExtensionWithMime> {
        match kind {
            "OCDeclare" => oc_declare_formats(),
            "ReflowMapping" => reflow_formats(),
            _ => Vec::new(),
        }
    }

    pub fn known_export_formats(kind: &str) -> Vec<ExtensionWithMime> {
        match kind {
            "OCDeclare" => oc_declare_formats(),
            "ReflowMapping" => reflow_formats(),
            _ => Vec::new(),
        }
    }

    /// Native read: parse a file from a path. Format inferred from the extension.
    pub fn import_from_path(kind: &str, path: &str) -> Result<Self, String> {
        let bytes = std::fs::read(path).map_err(|e| format!("{e:?}"))?;
        let format = std::path::Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or_default();
        Self::import_from_bytes(kind, &bytes, format)
    }

    pub fn import_from_bytes(kind: &str, bytes: &[u8], format: &str) -> Result<Self, String> {
        match kind {
            "OCDeclare" => Ok(PropelArtifact::OCDeclare(import_oc_declare(bytes, format)?)),
            "ReflowMapping" => {
                if !is_json_format(format, "reflow") {
                    return Err(format!("Unsupported Reflow mapping format: {format}"));
                }
                Ok(PropelArtifact::ReflowMapping(
                    ReflowMappingFile::from_json_bytes(bytes)?,
                ))
            }
            other => Err(format!("Unknown artifact kind: {other}")),
        }
    }

    pub fn export_to_bytes(&self, format: &str) -> Result<Vec<u8>, String> {
        match self {
            PropelArtifact::OCDeclare(model) => {
                if !is_json_format(format, "ocdeclare") {
                    return Err(format!("Unsupported OC-DECLARE format: {format}"));
                }
                serde_json::to_vec_pretty(model).map_err(|e| e.to_string())
            }
            PropelArtifact::ReflowMapping(mapping) => {
                if !is_json_format(format, "reflow") {
                    return Err(format!("Unsupported Reflow mapping format: {format}"));
                }
                serde_json::to_vec_pretty(mapping).map_err(|e| e.to_string())
            }
        }
    }

    pub fn to_json(&self) -> Result<serde_json::Value, String> {
        match self {
            PropelArtifact::OCDeclare(model) => {
                serde_json::to_value(model).map_err(|e| e.to_string())
            }
            PropelArtifact::ReflowMapping(mapping) => {
                serde_json::to_value(mapping).map_err(|e| e.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OC_DECLARE: &str = r#"{"version":1,"arcs":[{"from":"a","to":"b","arc_type":"EF","label":{"each":[],"any":[],"all":[]},"counts":[1,null]}],"nodes":[{"name":"a","position":{"x":1,"y":2}},{"name":"b"},{"name":"c"}]}"#;

    #[test]
    fn oc_declare_round_trips_through_bytes() {
        let a = PropelArtifact::import_from_bytes("OCDeclare", OC_DECLARE.as_bytes(), "ocdeclare")
            .unwrap();
        assert_eq!(a.kind(), "OCDeclare");
        let out = a.export_to_bytes("ocdeclare").unwrap();
        let b = PropelArtifact::import_from_bytes("OCDeclare", &out, "ocdeclare").unwrap();
        assert_eq!(a.to_json().unwrap(), b.to_json().unwrap());
        assert_eq!(a.to_json().unwrap()["nodes"][0]["position"]["x"], 1.0);
        assert_eq!(a.to_json().unwrap()["nodes"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn oc_declare_rejects_other_json() {
        assert!(
            PropelArtifact::import_from_bytes("OCDeclare", br#"{"foo":1}"#, "ocdeclare").is_err()
        );
    }

    #[test]
    fn reflow_mapping_round_trips_through_bytes() {
        let a = PropelArtifact::import_from_bytes(
            "ReflowMapping",
            crate::reflow_mapping_file::tests::SUMMARY.as_bytes(),
            "reflow",
        )
        .unwrap();
        assert_eq!(a.kind(), "ReflowMapping");
        let out = a.export_to_bytes("reflow").unwrap();
        let b = PropelArtifact::import_from_bytes("ReflowMapping", &out, "reflow").unwrap();
        assert_eq!(a.to_json().unwrap(), b.to_json().unwrap());
        assert_eq!(
            b.to_json().unwrap()["summary"]["cells"][0]["state"],
            "implied"
        );
    }

    #[test]
    fn unknown_kind_errors() {
        assert!(PropelArtifact::import_from_bytes("PetriNet", b"x", "pnml").is_err());
    }
}
