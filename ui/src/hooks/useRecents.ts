import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

export function useRecents() {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    void api.listRecents().then((r) => setRecents(r.models));
  }, []);

  const recordUse = useCallback((modelName: string) => {
    setRecents((prev) => [
      modelName,
      ...prev.filter((m) => m !== modelName),
    ]);
    void api.recordRecent(modelName);
  }, []);

  return { recents, recordUse };
}
