//! Propel-side, engine-stored values not in the upstream `process_mining` registry (a closed
//! enum). Artifacts cross the binding boundary by value, never as a handle.

use process_mining::core::io::{Exportable, ExtensionWithMime, Importable};
use process_mining::core::process_models::case_centric::petri_net::pnml::import_pnml_reader;
use process_mining::AcceptingPetriNet;

use crate::oc_declare_file::OCDeclareModelFile;

pub enum PropelArtifact {
    PetriNet(AcceptingPetriNet),
    OCDeclare(OCDeclareModelFile),
}

fn oc_declare_formats() -> Vec<ExtensionWithMime> {
    vec![ExtensionWithMime::new("ocdeclare", "application/json")]
}

fn import_oc_declare(bytes: &[u8], format: &str) -> Result<OCDeclareModelFile, String> {
    if !(format.ends_with("ocdeclare") || format.ends_with("json")) {
        return Err(format!("Unsupported OC-DECLARE format: {format}"));
    }
    OCDeclareModelFile::from_json_bytes(bytes)
}

/// `AcceptingPetriNet`'s own importer rejects a PNML without a final marking, which many files
/// lack. Missing markings load as empty instead.
fn import_pnml_lenient(bytes: &[u8], format: &str) -> Result<AcceptingPetriNet, String> {
    if !format.ends_with("pnml") {
        return Err(format!("Unsupported Petri net format: {format}"));
    }
    let (net, initial, final_) =
        import_pnml_reader(&mut std::io::BufReader::new(bytes)).map_err(|e| format!("{e:?}"))?;
    Ok(AcceptingPetriNet::new(
        net,
        initial.unwrap_or_default(),
        final_.unwrap_or_default(),
    ))
}

impl PropelArtifact {
    /// Every artifact kind, for enumeration (file filters, OS file associations, viewer wiring).
    pub const KINDS: &'static [&'static str] = &["PetriNet", "OCDeclare"];

    pub fn kind(&self) -> &'static str {
        match self {
            PropelArtifact::PetriNet(_) => "PetriNet",
            PropelArtifact::OCDeclare(_) => "OCDeclare",
        }
    }

    /// Known import formats for a kind. Delegates to the value type's `Importable` impl, so the
    /// extension/MIME set stays in lockstep with the engine's actual parsers (no hardcoding).
    pub fn known_import_formats(kind: &str) -> Vec<ExtensionWithMime> {
        match kind {
            "PetriNet" => <AcceptingPetriNet as Importable>::known_import_formats(),
            "OCDeclare" => oc_declare_formats(),
            _ => Vec::new(),
        }
    }

    /// Known export formats for a kind (mirrors [`Self::known_import_formats`]).
    pub fn known_export_formats(kind: &str) -> Vec<ExtensionWithMime> {
        match kind {
            "PetriNet" => <AcceptingPetriNet as Exportable>::known_export_formats(),
            "OCDeclare" => oc_declare_formats(),
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
            "PetriNet" => Ok(PropelArtifact::PetriNet(import_pnml_lenient(
                bytes, format,
            )?)),
            "OCDeclare" => Ok(PropelArtifact::OCDeclare(import_oc_declare(bytes, format)?)),
            other => Err(format!("Unknown artifact kind: {other}")),
        }
    }

    pub fn export_to_bytes(&self, format: &str) -> Result<Vec<u8>, String> {
        match self {
            PropelArtifact::PetriNet(net) => {
                net.export_to_bytes(format).map_err(|e| format!("{e:?}"))
            }
            PropelArtifact::OCDeclare(model) => {
                serde_json::to_vec_pretty(model).map_err(|e| e.to_string())
            }
        }
    }

    pub fn to_json(&self) -> Result<serde_json::Value, String> {
        match self {
            PropelArtifact::PetriNet(net) => serde_json::to_value(net).map_err(|e| e.to_string()),
            PropelArtifact::OCDeclare(model) => {
                serde_json::to_value(model).map_err(|e| e.to_string())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Minimal valid PNML: one place, one transition, one arc.
    const PNML: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<pnml><net id="n" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel"><page id="p0">
<place id="p1"><name><text>p1</text></name></place>
<transition id="t1"><name><text>t1</text></name></transition>
<arc id="a1" source="p1" target="t1"/>
</page></net></pnml>"#;

    #[test]
    fn petrinet_round_trips_through_bytes() {
        let a = PropelArtifact::import_from_bytes("PetriNet", PNML.as_bytes(), "pnml").unwrap();
        assert_eq!(a.kind(), "PetriNet");
        let out = a.export_to_bytes("pnml").unwrap();
        let b = PropelArtifact::import_from_bytes("PetriNet", &out, "pnml").unwrap();
        assert_eq!(b.kind(), "PetriNet");
        assert!(a.to_json().unwrap().get("places").is_some());
    }

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
    fn unknown_kind_errors() {
        assert!(PropelArtifact::import_from_bytes("Nope", b"x", "pnml").is_err());
    }
}
