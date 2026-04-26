import { NavLink } from "react-router-dom";

export function NavRail() {
  return (
    <nav className="nav-rail">
      <div className="nav-section">Workspace</div>
      <NavLink to="/runs" className="sb-item">
        runs
      </NavLink>
      <NavLink to="/tasks" className="sb-item">
        tasks
      </NavLink>
      <div className="nav-section">Inventory</div>
      <NavLink to="/providers" className="sb-item">
        providers
      </NavLink>
    </nav>
  );
}
