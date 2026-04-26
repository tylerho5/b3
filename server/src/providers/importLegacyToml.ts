import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { DB } from "../db";
import { listProviders } from "../db/providers";
import {
  applyImportPlan,
  buildImportPlan,
  parseTomlPayload,
} from "./tomlSerde";

export interface ImportOnceResult {
  imported: boolean;
  reason?: string;
  providersAdded?: number;
  modelsAdded?: number;
}

export function importLegacyTomlOnce(opts: {
  db: DB;
  home?: string;
  configPath?: string;
}): ImportOnceResult {
  const home = opts.home ?? homedir();
  const tomlPath = opts.configPath ?? join(home, ".config", "b3", "config.toml");

  if (listProviders(opts.db).length > 0) {
    return { imported: false, reason: "providers table not empty" };
  }
  if (!existsSync(tomlPath)) {
    return { imported: false, reason: "no legacy config.toml" };
  }

  const raw = readFileSync(tomlPath, "utf-8");
  const parsed = parseTomlPayload(raw);
  const plan = buildImportPlan(parsed);
  const result = applyImportPlan(opts.db, plan, { replace: false });
  renameSync(tomlPath, `${tomlPath}.imported`);
  return {
    imported: true,
    providersAdded: result.providersAdded,
    modelsAdded: result.modelsAdded,
  };
}
