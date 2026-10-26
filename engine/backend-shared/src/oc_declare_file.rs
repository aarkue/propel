//! The saved form of an OC-DECLARE model: rust4pm's arcs plus every node and its position, so a
//! model reopens as it was arranged. `@r4pm/components` reads and writes the same JSON
//! (`OCDeclareModelFile`).

use process_mining::core::process_models::object_centric::oc_declare::OCDeclareArc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCDeclareModelFile {
    #[serde(default = "first_version")]
    pub version: u32,
    pub arcs: Vec<OCDeclareArc>,
    /// Every node by display name (`<init> `/`<exit> ` prefixed for object nodes).
    #[serde(default)]
    pub nodes: Vec<OCDeclareModelNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OCDeclareModelNode {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Point>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

fn first_version() -> u32 {
    1
}

#[derive(Deserialize)]
#[serde(untagged)]
enum FileOrArcs {
    File(OCDeclareModelFile),
    Arcs(Vec<OCDeclareArc>),
}

impl OCDeclareModelFile {
    /// Reads a saved model, or a plain arc list as the discovery bindings return it.
    pub fn from_json_bytes(bytes: &[u8]) -> Result<Self, String> {
        match serde_json::from_slice::<FileOrArcs>(bytes) {
            Ok(FileOrArcs::File(file)) => Ok(file),
            Ok(FileOrArcs::Arcs(arcs)) => Ok(Self {
                version: first_version(),
                arcs,
                nodes: Vec::new(),
            }),
            Err(_) => Err("Not an OC-DECLARE model".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn oc_declare_file_accepts_a_plain_arc_list() {
        let arcs = br#"[{"from":"a","to":"b","arc_type":"EF","label":{"each":[],"any":[],"all":[]},"counts":[1,null]}]"#;
        let file = OCDeclareModelFile::from_json_bytes(arcs).unwrap();
        assert_eq!(file.arcs.len(), 1);
        assert!(file.nodes.is_empty());
        assert_eq!(file.version, 1);
    }
}
