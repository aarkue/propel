//! The saved form of a Reflow result: which participations of a log flow, and from which flowing
//! type the others follow. Views draw it on top of the flow log (e.g., `items <- orders`).

use process_mining::bindings::ReflowSummary;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflowMappingFile {
    #[serde(default = "first_version")]
    pub version: u32,
    /// Label of the log Reflow ran on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    /// Id of the flow log made alongside, so views on that log pick this mapping.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flow_log: Option<String>,
    pub summary: ReflowSummary,
}

fn first_version() -> u32 {
    1
}

#[derive(Deserialize)]
#[serde(untagged)]
enum FileOrSummary {
    File(ReflowMappingFile),
    Summary(ReflowSummary),
}

impl ReflowMappingFile {
    /// Reads a saved mapping, or a bare summary as `reflow_cells` returns it.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, String> {
        match serde_json::from_slice::<FileOrSummary>(bytes) {
            Ok(FileOrSummary::File(file)) => Ok(file),
            Ok(FileOrSummary::Summary(summary)) => Ok(Self {
                version: first_version(),
                source: None,
                flow_log: None,
                summary,
            }),
            Err(_) => Err("Not a Reflow mapping".to_string()),
        }
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub const SUMMARY: &str = r#"{"activities":["confirm order"],"objectTypes":["items","orders"],"cells":[{"activity":"confirm order","objectType":"items","state":"implied","recorded":true,"participations":7659,"minObjects":1,"maxObjects":4,"determinedBy":{"from":"orders","reconstruction":{"via":{"kind":"recorded","relations":[{"qualifier":"comprises","reversed":false}]},"share":1.0}}},{"activity":"confirm order","objectType":"orders","state":"flow","recorded":true,"participations":2000,"minObjects":1,"maxObjects":1,"determinedBy":null}],"stats":{"facts":1,"flow":1,"implied":1,"involved":0,"added":0,"arcsRecorded":3,"arcsFlow":1,"seed":"handoff","repaired":0,"work":10,"limitReached":false,"expansionCandidates":0}}"#;

    #[test]
    fn reads_a_bare_summary_and_a_saved_file() {
        let bare = ReflowMappingFile::from_json_bytes(SUMMARY.as_bytes()).unwrap();
        assert_eq!(bare.summary.cells.len(), 2);
        assert!(bare.flow_log.is_none());
        let saved =
            format!(r#"{{"version":1,"source":"OM","flowLog":"om-flow","summary":{SUMMARY}}}"#);
        let file = ReflowMappingFile::from_json_bytes(saved.as_bytes()).unwrap();
        assert_eq!(file.flow_log.as_deref(), Some("om-flow"));
        assert_eq!(file.summary.cells[0].max_objects, 4);
        assert!(ReflowMappingFile::from_json_bytes(br#"{"arcs":[]}"#).is_err());
    }
}
