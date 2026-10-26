/** Longest leaf label rust4pm keeps on one line. */
const WRAP_CHARS = 22;

/** The one or two lines rust4pm draws a leaf label on (its `leaf_lines`), so the label fits the box
 *  the layout sized for it: split at the whitespace that makes the longer line shortest, or in the
 *  middle when there is none. */
export function leafLines(label: string): string[] {
  const chars = Array.from(label);
  if (chars.length <= WRAP_CHARS) return [label];
  let best: { longest: number; at: number; end: number } | undefined;
  for (let i = 1; i < chars.length; i++) {
    if (!/\s/.test(chars[i])) continue;
    let end = i + 1;
    while (end < chars.length && /\s/.test(chars[end])) end++;
    if (end >= chars.length) continue;
    const longest = Math.max(i, chars.length - end);
    if (!best || longest < best.longest) best = { longest, at: i, end };
  }
  if (!best) {
    const half = Math.ceil(chars.length / 2);
    return [chars.slice(0, half).join(""), chars.slice(half).join("")];
  }
  return [chars.slice(0, best.at).join(""), chars.slice(best.end).join("")];
}
