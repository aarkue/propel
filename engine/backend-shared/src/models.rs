//! Process models stored as library registry items (`AcceptingPetriNet`, `ProcessTree`, ...),
//! with the import leniency propel needs on top of the library's loaders.

use process_mining::bindings::{CallError, RegistryItem, RegistryItemKind};
use process_mining::core::io::ExtensionWithMime;
use process_mining::core::process_models::case_centric::petri_net::pnml::import_pnml;
use process_mining::{AcceptingPetriNet, Control};

use crate::jobs::CANCELLED;

/// Library kinds propel does not offer: `PetriNet` drops markings (propel's nets are
/// `AcceptingPetriNet`s), OC-DECLARE models stay a propel artifact, whose file keeps the layout,
/// and Reflow results live only inside the Reflow panel (its saved form is a `ReflowMapping`).
const HIDDEN_KINDS: &[&str] = &[
    "PetriNet",
    "OCDeclareModel",
    "ReflowResult",
    "AnnotatedOcpn",
];

pub fn is_hidden_kind(kind: &RegistryItemKind) -> bool {
    HIDDEN_KINDS.contains(&kind.name())
}

fn is_accepting_petri_net(kind: &RegistryItemKind) -> bool {
    kind.name() == "AcceptingPetriNet"
}

/// ProM writes accepting Petri nets as `.apnml`, which is PNML.
pub fn extra_import_formats(kind: &RegistryItemKind) -> Vec<ExtensionWithMime> {
    if is_accepting_petri_net(kind) {
        vec![ExtensionWithMime::new("apnml", "text/plain")]
    } else {
        Vec::new()
    }
}

/// The library's `AcceptingPetriNet` importer rejects a PNML without both markings, which many
/// files lack. Missing markings load as empty instead.
fn import_pnml_lenient(bytes: &[u8]) -> Result<AcceptingPetriNet, String> {
    let (net, initial, final_) = import_pnml(bytes).map_err(|e| e.to_string())?;
    Ok(AcceptingPetriNet::new(
        net,
        initial.unwrap_or_default(),
        final_.unwrap_or_default(),
    ))
}

fn is_pnml(format: &str) -> bool {
    format.to_ascii_lowercase().ends_with("pnml")
}

pub fn load_from_bytes(
    kind: &RegistryItemKind,
    bytes: &[u8],
    format: &str,
) -> Result<RegistryItem, String> {
    load_from_bytes_with(kind, bytes, format, &Control::new())
}

/// [`load_from_bytes`], reporting the import of an object-centric log to `ctl` and failing with
/// [`CANCELLED`] once it is cancelled.
pub fn load_from_bytes_with(
    kind: &RegistryItemKind,
    bytes: &[u8],
    format: &str,
    ctl: &Control<'_>,
) -> Result<RegistryItem, String> {
    if is_accepting_petri_net(kind) && is_pnml(format) {
        return import_pnml_lenient(bytes).map(RegistryItem::custom);
    }
    RegistryItem::load_from_bytes_with(kind, bytes, format, ctl).map_err(call_error)
}

pub fn load_from_path(kind: &RegistryItemKind, path: &str) -> Result<RegistryItem, String> {
    load_from_path_with(kind, path, &Control::new())
}

/// [`load_from_path`], reporting as [`load_from_bytes_with`] does.
pub fn load_from_path_with(
    kind: &RegistryItemKind,
    path: &str,
    ctl: &Control<'_>,
) -> Result<RegistryItem, String> {
    if is_accepting_petri_net(kind) && is_pnml(path) {
        let bytes = std::fs::read(path).map_err(|e| format!("{path}: {e}"))?;
        return import_pnml_lenient(&bytes).map(RegistryItem::custom);
    }
    RegistryItem::load_from_path_with(kind, path, ctl).map_err(call_error)
}

fn call_error(e: CallError) -> String {
    match e {
        CallError::Cancelled => CANCELLED.to_string(),
        CallError::Failed(msg) => msg,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    const NO_MARKINGS: &str = r#"<?xml version="1.0"?><pnml><net id="n" type="http://www.pnml.org/version-2009/grammar/pnmlcoremodel"><page id="p0"><place id="p1"/><transition id="t1"/><arc id="a1" source="p1" target="t1"/></page></net></pnml>"#;

    fn apn() -> RegistryItemKind {
        RegistryItemKind::from_str("AcceptingPetriNet").unwrap()
    }

    #[test]
    fn pnml_without_markings_loads_as_accepting_net() {
        let item = load_from_bytes(&apn(), NO_MARKINGS.as_bytes(), "pnml").unwrap();
        let net = item.as_custom::<AcceptingPetriNet>().unwrap();
        assert_eq!(net.net.places().len(), 1);
        assert!(net.initial_marking.is_empty());
    }

    #[test]
    fn apnml_and_json_round_trip() {
        let item = load_from_bytes(&apn(), NO_MARKINGS.as_bytes(), "apnml").unwrap();
        let json = item.export_to_bytes("json").unwrap();
        let back = load_from_bytes(&apn(), &json, "json").unwrap();
        assert_eq!(back.kind(), apn());
    }

    #[test]
    fn hides_structure_only_net_and_oc_declare_kinds() {
        let hidden: Vec<_> = RegistryItemKind::all_registered_kinds()
            .into_iter()
            .filter(is_hidden_kind)
            .map(|k| k.name().to_string())
            .collect();
        assert_eq!(hidden.len(), HIDDEN_KINDS.len(), "{hidden:?}");
    }
}
