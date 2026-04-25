import type { ReactNode } from "react";

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={"chip" + (active ? " active" : "")}
    >
      {children}
    </button>
  );
}
