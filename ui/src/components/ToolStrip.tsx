export function ToolStrip({ tools }: { tools: string[] }) {
  if (tools.length === 0) {
    return <div className="tool-strip" />;
  }
  return (
    <div className="tool-strip">
      {tools.map((t, i) => (
        <span className="tool-badge" key={i}>
          {t}
        </span>
      ))}
    </div>
  );
}
