export function DiffView({ diff }: { diff: string | null }) {
  if (!diff) {
    return (
      <div className="placeholder" style={{ padding: 12 }}>
        no diff captured
      </div>
    );
  }
  const lines = diff.split("\n");
  return (
    <pre className="diff-view">
      {lines.map((l, i) => {
        let cls = "";
        if (l.startsWith("+") && !l.startsWith("+++")) cls = "add";
        else if (l.startsWith("-") && !l.startsWith("---")) cls = "del";
        else if (l.startsWith("@@")) cls = "hunk";
        return (
          <span key={i} className={cls}>
            {l}
            {"\n"}
          </span>
        );
      })}
    </pre>
  );
}
