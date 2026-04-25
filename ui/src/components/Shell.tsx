import type { ReactNode } from "react";
import { NavRail } from "./NavRail";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app">
      <header className="app-header">
        <span className="wordmark">b3</span>
      </header>
      <div className="app-body">
        <NavRail />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
