import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Harness } from "../types/shared";

export function useRoutePins() {
  const [pins, setPins] = useState<Record<string, Partial<Record<Harness, string>>>>({});

  useEffect(() => {
    void api.listRoutePins().then((r) => setPins(r.pins));
  }, []);

  const setPin = useCallback((modelName: string, harness: Harness, routeId: string) => {
    setPins((prev) => ({
      ...prev,
      [modelName]: { ...prev[modelName], [harness]: routeId },
    }));
    void api.setRoutePin(modelName, harness, routeId);
  }, []);

  const clearPin = useCallback((modelName: string, harness: Harness) => {
    setPins((prev) => {
      const next = { ...prev };
      const modelPins = { ...next[modelName] };
      delete modelPins[harness];
      if (Object.keys(modelPins).length === 0) {
        delete next[modelName];
      } else {
        next[modelName] = modelPins;
      }
      return next;
    });
    void api.deleteRoutePin(modelName, harness);
  }, []);

  return { pins, setPin, clearPin };
}
