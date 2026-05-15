const KNOWN_EFFORTS = new Set(["low", "medium", "high", "xhigh"]);

export function encodeModelKey(modelId: string, effort: string): string {
  return effort ? `${modelId}::${effort}` : modelId;
}

export function parseModelKey(key: string): { modelId: string; effort: string } {
  const sep = key.lastIndexOf("::");
  if (sep !== -1) {
    const possibleEffort = key.slice(sep + 2);
    if (KNOWN_EFFORTS.has(possibleEffort)) {
      return { modelId: key.slice(0, sep), effort: possibleEffort };
    }
  }
  return { modelId: key, effort: "" };
}

export function modelKeyLabel(key: string): string {
  const { modelId, effort } = parseModelKey(key);
  return effort ? `${modelId} · ${effort}` : modelId;
}
