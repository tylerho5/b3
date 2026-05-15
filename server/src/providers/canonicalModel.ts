import type { DB } from "../db";
import { listCatalog } from "../db/openrouterCatalog";

const MODIFIER_SUFFIXES = ["-latest", "-instruct", "-chat", "-it", "-base"];
const FUZZY_THRESHOLD = 0.85;

function normalize(s: string): string {
  let n = s.toLowerCase().replace(/[-_.]+/g, "-");
  for (const suf of MODIFIER_SUFFIXES) {
    if (n.endsWith(suf)) {
      n = n.slice(0, -suf.length);
      break;
    }
  }
  return n;
}

function tokenSetSimilarity(a: string, b: string): number {
  const aTok = new Set(a.split("-").filter(Boolean));
  const bTok = new Set(b.split("-").filter(Boolean));
  const inter = [...aTok].filter((t) => bTok.has(t)).length;
  const union = new Set([...aTok, ...bTok]).size;
  return union === 0 ? 0 : inter / union;
}

export function resolveCanonicalId(db: DB, modelId: string): string | null {
  const all = listCatalog(db);
  if (all.length === 0) return null;

  // 1. Exact id match
  if (all.some((r) => r.id === modelId)) return modelId;

  const idLower = modelId.toLowerCase();

  // 2. Suffix exact (case-insensitive)
  for (const r of all) {
    const slash = r.id.indexOf("/");
    const suffix = slash >= 0 ? r.id.slice(slash + 1) : r.id;
    if (suffix.toLowerCase() === idLower) return r.id;
  }

  // 3. Normalized fuzzy
  const target = normalize(modelId);
  let best: { id: string; score: number } | null = null;
  for (const r of all) {
    const slash = r.id.indexOf("/");
    const suffix = slash >= 0 ? r.id.slice(slash + 1) : r.id;
    const candidate = normalize(suffix);
    const score = tokenSetSimilarity(target, candidate);
    if (score >= FUZZY_THRESHOLD && (!best || score > best.score)) {
      best = { id: r.id, score };
    }
  }
  return best?.id ?? null;
}
