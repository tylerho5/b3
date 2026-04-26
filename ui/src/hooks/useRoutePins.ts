import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

export function useRoutePins() {
  const [pins, setPins] = useState<Record<string, string>>({});

  useEffect(() => {
    void api.listRoutePins().then((r) => setPins(r.pins));
  }, []);

  const setPin = useCallback((modelName: string, routeId: string) => {
    setPins((prev) => ({ ...prev, [modelName]: routeId }));
    void api.setRoutePin(modelName, routeId);
  }, []);

  const clearPin = useCallback((modelName: string) => {
    setPins((prev) => {
      const next = { ...prev };
      delete next[modelName];
      return next;
    });
    void api.deleteRoutePin(modelName);
  }, []);

  return { pins, setPin, clearPin };
}
