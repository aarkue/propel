//! App Bindings
//!
use process_mining::{
    bindings::register_binding,
    core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection,
    discovery::case_centric::alphappp::full::AlphaPPPConfig, AcceptingPetriNet,
};

pub mod alignments;
pub mod animation;
mod control;
pub mod dfg_compare;
pub mod event_log;
pub mod execution_graph;
pub mod log_overview;
pub mod object_lifecycles;
pub mod oc_declare_explorer;
pub mod ocel;
pub mod ocel_overview;
pub mod ocpn_replay;
pub mod performance_spectrum;
pub mod petri_net_io;
pub mod prefix_tree;
pub mod repairs;
pub mod slim_project;
pub mod transforms;
pub mod types;
pub mod variant_timing;
pub mod workload;
mod xes_event;

/// Health-check binding.
#[register_binding]
pub fn app_ping() -> String {
    "pong".to_string()
}

#[register_binding]
pub fn alphappp_auto(log_proj: &EventLogActivityProjection) -> AcceptingPetriNet {
    let (_config, net) = process_mining::discovery::case_centric::alphappp::auto_parameters::alphappp_discover_with_auto_parameters(log_proj);
    net
}

/// Discover a Petri net from an event log with Alpha+++. Projects to activities internally, so
/// no intermediate `EventLogActivityProjection` is stored in the registry.
#[register_binding]
pub fn discover_petri_net(event_log: &process_mining::EventLog) -> AcceptingPetriNet {
    let proj = EventLogActivityProjection::from(event_log);

    process_mining::discovery::case_centric::alphappp::full::discover_alphappp_net(
        &proj,
        AlphaPPPConfig {
            absolute_df_clean_thresh: 0,
            ..Default::default()
        },
    )
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
