#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const inside = (root, candidate) => {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
};

const assertManagedTarget = (home, target, label) => {
  const absolute = path.isAbsolute(target) ? path.resolve(target) : path.resolve(home, target);
  const suffix = [];
  let probe = absolute;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    suffix.unshift(path.basename(probe));
    probe = parent;
  }
  const canonical = path.join(fs.realpathSync(probe), ...suffix);
  if (!inside(home, canonical)) throw new Error(`${label} escaped the explicit home`);
  let current = home;
  for (const segment of path.relative(home, canonical).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} crosses a symbolic link: ${path.relative(home, current)}`);
    }
  }
  return canonical;
};

const removePath = (target) => {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(target)) removePath(path.join(target, entry));
    fs.rmdirSync(target);
  } else fs.unlinkSync(target);
};

const copyPath = (source, destination) => {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing rollback from symbolic link: ${source}`);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
    for (const entry of fs.readdirSync(source)) copyPath(path.join(source, entry), path.join(destination, entry));
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
  }
};

const atomicJson = (filename, value) => {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
};

export const rollbackInstallation = ({ home, transactionFile } = {}) => {
  if (!home) throw new Error("rollback requires an explicit home");
  const selectedHome = path.resolve(home);
  if (!fs.existsSync(selectedHome)) throw new Error("Rollback home does not exist");
  if (fs.lstatSync(selectedHome).isSymbolicLink()) throw new Error("Explicit rollback home cannot be a symbolic link");
  const absoluteHome = fs.realpathSync(selectedHome);
  if (absoluteHome === fs.realpathSync(os.homedir()) && process.env.SUPER_OUTER_ALLOW_USER_HOME !== "1") {
    throw new Error("Refusing to change the real user home without SUPER_OUTER_ALLOW_USER_HOME=1");
  }
  const activeFile = assertManagedTarget(
    absoluteHome,
    transactionFile ? path.resolve(transactionFile) : ".super-outer/active-transaction.json",
    "Rollback transaction record",
  );
  if (!fs.existsSync(activeFile)) return {
    schema_version: "1.0.0",
    status: "NO_ACTIVE_TRANSACTION",
    rolled_back: false,
    idempotent: true,
    transaction_id: null,
    restored_targets: 0,
    v3_restored: null,
    v4_active: null,
    reason: "No Super-outer installation transaction was found.",
    migration_record: null,
  };
  const record = JSON.parse(fs.readFileSync(activeFile, "utf8"));
  const transactionDirectory = assertManagedTarget(absoluteHome, record.directory, "Rollback transaction directory");
  if (record.status === "ROLLED_BACK") return {
    schema_version: "1.0.0",
    status: "ALREADY_ROLLED_BACK",
    rolled_back: true,
    idempotent: true,
    transaction_id: record.id,
    restored_targets: Number(record.targets?.length || 0),
    v3_restored: null,
    v4_active: false,
    reason: "This transaction had already been rolled back.",
    migration_record: null,
  };
  const migrationFile = path.join(absoluteHome, ".super-outer", "migration-record.json");
  const installedMigration = fs.existsSync(migrationFile) ? JSON.parse(fs.readFileSync(migrationFile, "utf8")) : null;
  for (const target of [...record.targets].reverse()) {
    const absoluteTarget = assertManagedTarget(absoluteHome, target.relative, "Rollback target");
    removePath(absoluteTarget);
    if (target.existed) copyPath(path.join(transactionDirectory, "backups", target.backup), absoluteTarget);
  }
  const rolledBack = { ...record, status: "ROLLED_BACK", rolledBackAt: new Date().toISOString() };
  atomicJson(activeFile, rolledBack);
  atomicJson(path.join(transactionDirectory, "record.json"), rolledBack);
  let migrationRecord = null;
  if (installedMigration) {
    migrationRecord = {
      schema_version: "1.0.0",
      v3_detected: Boolean(installedMigration.v3_detected),
      v3_snapshot: installedMigration.v3_snapshot || null,
      outer_21_detected: Boolean(installedMigration.outer_21_detected),
      outer_21_snapshot: installedMigration.outer_21_snapshot || null,
      legacy_versions_deactivated: [],
      legacy_versions_retained: Boolean(installedMigration.legacy_versions_retained),
      v4_isolated_verified: Boolean(installedMigration.v4_isolated_verified),
      v4_installed: false,
      promoted: false,
      active_enforcement_owner: installedMigration.v3_detected ? "outer-v3" : "none",
      rollback_snapshot: transactionDirectory,
      status: "ROLLED BACK"
    };
    atomicJson(path.join(transactionDirectory, "migration-record-rolled-back.json"), migrationRecord);
  }
  return {
    schema_version: "1.0.0",
    status: "ROLLED_BACK",
    rolled_back: true,
    idempotent: false,
    transaction_id: record.id,
    restored_targets: record.targets.length,
    v3_restored: installedMigration ? Boolean(installedMigration.v3_detected) : null,
    v4_active: false,
    reason: null,
    migration_record: migrationRecord,
  };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(rollbackInstallation({ home: process.argv[2] }), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
