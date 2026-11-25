import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSchema } from "../src/schema-validation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const schemaDirectory = resolve(root, "schemas");
const schemas = new Map();

for (const name of readdirSync(schemaDirectory).filter((item) => item.endsWith(".json"))) {
  const schema = JSON.parse(readFileSync(resolve(schemaDirectory, name), "utf8"));
  if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
    throw new Error(`${name}: unsupported or missing JSON Schema dialect`);
  }
  if (!schema.$id || schema.type !== "object") {
    throw new Error(`${name}: missing $id or object root type`);
  }
  schemas.set(name, schema);
}

const taskFile = resolve(root, ".engineering/super-outer/task.json");
if (existsSync(taskFile)) {
  const task = JSON.parse(readFileSync(taskFile, "utf8"));
  assertSchema(schemas.get("task-record.schema.json"), task, "repository task record");
}

console.log(`Validated ${schemas.size} schemas${existsSync(taskFile) ? " and the repository task record" : ""}.`);
