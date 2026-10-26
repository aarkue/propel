/** Whether the graph offers content editing (toolbar, connecting, rename, delete): only when it is
 *  editable, the host wants the tools, and no projected overlay is shown. */
export function editingContent(editable: boolean, editTools: boolean, projected: boolean): boolean {
  return editable && editTools && !projected;
}

/** What changes the space the arcs need, so an editable graph lays out again when it changes. */
export function relayoutKey(view: { textLabels: boolean; combineEfEp: boolean; direction: string }): string {
  return `${view.textLabels}|${view.combineEfEp}|${view.direction}`;
}
