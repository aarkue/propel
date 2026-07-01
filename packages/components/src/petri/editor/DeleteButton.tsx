import { useReactFlow } from "@xyflow/react";
type DeleteButtonProps = { nodeID: string } | { edgeID: string };
export default function DeleteButton(props: DeleteButtonProps) {
  const { setNodes, setEdges } = useReactFlow();

  return (
    <button
      type="button"
      className="delete-button"
      title="Delete"
      onClick={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if ("nodeID" in props) {
          setNodes((ns) => {
            const newNodes = ns.filter((n) => n.id !== props.nodeID);
            return newNodes;
          });
          setEdges((es) => {
            const newEdges = es.filter((e) => e.source !== props.nodeID && e.target !== props.nodeID);
            return newEdges;
          });
        } else {
          setEdges((es) => {
            const newEdges = es.filter((n) => n.id !== props.edgeID);
            return newEdges;
          });
        }
      }}
    >
      <svg
        aria-hidden="true"
        style={{
          width: "80%",
          height: "80%",
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translateX(-50%) translateY(-50%)",
        }}
        viewBox="0 0 24 24"
        data-name="Flat Line"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          id="primary"
          d="M19,19,5,5M19,5,5,19"
          style={{ fill: "none", stroke: "inherit", strokeWidth: "2" }}
        ></path>
      </svg>
    </button>
  );
}
