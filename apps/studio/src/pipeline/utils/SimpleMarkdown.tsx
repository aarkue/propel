export default function SimpleMarkdown({ text }: { text: string }) {
  // Basic markdown parsing for bold, italic, and code
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[.*?\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="bg-gray-100 px-1 rounded font-mono text-indigo-600">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("[") && part.endsWith("]")) {
          const content = part.slice(1, -1);
          if (content.startsWith("`") && content.endsWith("`")) {
            return (
              <code key={i} className="bg-gray-100 px-1 rounded font-mono text-indigo-600">
                {content.slice(1, -1)}
              </code>
            );
          }
          return (
            <span key={i} className="text-indigo-600 font-medium">
              {content}
            </span>
          );
        }
        return part;
      })}
      <br />
    </span>
  );
}
