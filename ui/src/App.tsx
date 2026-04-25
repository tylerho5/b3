import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { Tasks } from "./pages/Tasks";
import { Runs } from "./pages/Runs";
import { RunDetail } from "./pages/RunDetail";
import { Providers } from "./pages/Providers";
import { Skills } from "./pages/Skills";
import "./styles/shell.css";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/runs" replace />} />
          <Route path="/runs" element={<Runs />} />
          <Route
            path="/runs/:matrixId/:runId"
            element={<RunDetail />}
          />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/skills" element={<Skills />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
