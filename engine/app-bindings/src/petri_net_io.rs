//! PNML (XML text) import/export codec bindings for Petri nets.
//!
//! PNML is XML text, so these use `String` I/O rather than bytes to avoid the JSON int-array
//! bloat a `Vec<u8>` return would serialize to. `stringify_error` lets the binding return a
//! `Result`; the error is propagated as the handler's error string.

use process_mining::bindings::register_binding;
use process_mining::core::process_models::case_centric::petri_net::pnml::export_petri_net_to_pnml;
use process_mining::PetriNet;

/// Serialize a `PetriNet` to PNML (XML text).
#[register_binding(stringify_error)]
pub fn export_petri_net_pnml(net: PetriNet) -> Result<String, String> {
    let mut buf: Vec<u8> = Vec::new();
    export_petri_net_to_pnml(&net, &mut buf).map_err(|e| format!("{e:?}"))?;
    String::from_utf8(buf).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use process_mining::bindings::list_functions_meta;
    #[test]
    fn pnml_export_binding_registered() {
        let m = list_functions_meta();
        assert!(m
            .iter()
            .any(|b| b.id == "app_bindings::petri_net_io::export_petri_net_pnml"));
    }
}
