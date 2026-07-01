//! App Bindings
//!
use process_mining::{
    bindings::register_binding,
    core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection,
    discovery::case_centric::alphappp::full::AlphaPPPConfig, PetriNet,
};

pub mod alignments;
pub mod event_log;
pub mod ocel;
pub mod petri_net_io;
pub mod transforms;
pub mod types;

/// Health-check binding.
#[register_binding]
pub fn app_ping() -> String {
    "pong".to_string()
}

/// STUB: no-op until rust4pm feat/oc-declare-act-projection merges; replace with the real activity-projection then.
#[register_binding]
pub fn activity_projection_stub() -> Vec<String> {
    Vec::new()
}

#[register_binding]
pub fn alphappp_auto(log_proj: &EventLogActivityProjection) -> PetriNet {
    let (_config, net) = process_mining::discovery::case_centric::alphappp::auto_parameters::alphappp_discover_with_auto_parameters(log_proj);
    net
}

/// Discover a Petri net from an event log with Alpha+++.
///
/// Projects to activities internally, so no intermediate
/// `EventLogActivityProjection` is stored in the registry.
#[register_binding]
pub fn discover_petri_net(event_log: &process_mining::EventLog) -> PetriNet {
    let proj = EventLogActivityProjection::from(event_log);
    let net = process_mining::discovery::case_centric::alphappp::full::alphappp_discover_petri_net(
        &proj,
        AlphaPPPConfig {
            absolute_df_clean_thresh: 0,
            ..Default::default()
        },
    );
    net
}

#[cfg(test)]
mod tests {
    use process_mining::bindings::list_functions_meta;

    #[test]
    fn discover_petri_net_is_registered() {
        let metas = list_functions_meta();
        assert!(
            metas
                .iter()
                .any(|m| m.id == "app_bindings::discover_petri_net"),
            "discover_petri_net binding must be registered"
        );
    }
}
