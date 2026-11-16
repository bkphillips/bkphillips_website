import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { OrgModel, type RawOrg } from "./model";

const cache = process.env.NODE_ENV === "production";
let raw: Promise<string> | null = null;
let model: Promise<OrgModel> | null = null;

/** The generated data file, as text. Read once per server process (every time in development). */
export function orgJson(): Promise<string> {
  if (!cache || !raw) raw = readFile(path.join(process.cwd(), "src", "data", "org.json"), "utf8");
  return raw;
}

export function orgModel(): Promise<OrgModel> {
  if (!cache || !model) {
    model = orgJson().then((text) => new OrgModel(JSON.parse(text) as RawOrg));
  }
  return model;
}
