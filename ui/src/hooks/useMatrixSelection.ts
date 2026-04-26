import { useCallback, useState } from "react";
import type { Harness } from "../types/shared";

export interface CellState {
  checked: boolean;
  routeOverride?: string;
}

export function cellKey(modelName: string, harness: Harness): string {
  return `${modelName}::${harness}`;
}

export function useMatrixSelection() {
  const [models, setModels] = useState<string[]>([]);
  const [cells, setCells] = useState<Record<string, CellState>>({});

  const addModel = useCallback(
    (name: string, autoCheckHarnesses: Harness[] = []) => {
      setModels((prev) => {
        if (prev.includes(name)) return prev;
        return [...prev, name];
      });
      if (autoCheckHarnesses.length > 0) {
        setCells((prev) => {
          const next = { ...prev };
          for (const h of autoCheckHarnesses) {
            const k = cellKey(name, h);
            if (!next[k]) next[k] = { checked: true };
          }
          return next;
        });
      }
    },
    [],
  );

  const removeModel = useCallback((name: string) => {
    setModels((prev) => prev.filter((m) => m !== name));
    setCells((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${name}::`)) delete next[k];
      }
      return next;
    });
  }, []);

  const toggleCell = useCallback((modelName: string, harness: Harness) => {
    const k = cellKey(modelName, harness);
    setCells((prev) => ({
      ...prev,
      [k]: { ...prev[k], checked: !(prev[k]?.checked ?? false) },
    }));
  }, []);

  const swapRoute = useCallback(
    (modelName: string, harness: Harness, routeId: string) => {
      const k = cellKey(modelName, harness);
      setCells((prev) => ({
        ...prev,
        [k]: { ...(prev[k] ?? { checked: true }), routeOverride: routeId },
      }));
    },
    [],
  );

  const removeAll = useCallback(() => {
    setModels([]);
    setCells({});
  }, []);

  return { models, cells, addModel, removeModel, toggleCell, swapRoute, removeAll };
}
