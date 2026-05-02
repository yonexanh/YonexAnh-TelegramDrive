#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appDir = path.resolve(__dirname, "..");
const tauriConfigPath = path.join(appDir, "src-tauri", "tauri.conf.json");

const argv = process.argv.slice(2);
const command = argv[0];

if (!command) {
  process.exit(runTauri(argv));
}

if (process.platform !== "darwin" || !["build", "bundle"].includes(command)) {
  process.exit(runTauri(argv));
}

const [primaryArgs, passthroughArgs] = splitPassthroughArgs(argv);

if (command === "build" && hasFlag(primaryArgs, ["--no-bundle"])) {
  process.exit(runTauri(argv));
}

const requestedBundles = readBundleSelection(primaryArgs);
const wantsDmg = requestedBundles === null || requestedBundles.includes("dmg");

if (!wantsDmg) {
  process.exit(runTauri(argv));
}

const tauriArgs = rewriteBundles(primaryArgs, ["app"]).concat(passthroughArgs);
const tauriExitCode = runTauri(tauriArgs);
if (tauriExitCode !== 0) {
  process.exit(tauriExitCode);
}

const buildMeta = await resolveBuildMetadata(primaryArgs);
const verifyResult = runCommand("codesign", [
  "--verify",
  "--deep",
  "--strict",
  "--verbose=2",
  buildMeta.appBundlePath,
], { captureOutput: true });

if (verifyResult.status !== 0) {
  if (hasExplicitAppleSigning()) {
    if (verifyResult.stderr) {
      process.stderr.write(verifyResult.stderr);
    }
    if (verifyResult.stdout) {
      process.stdout.write(verifyResult.stdout);
    }
    console.error(
      "The macOS bundle was not signed correctly. Refusing to replace a developer signature with an ad-hoc signature."
    );
    process.exit(verifyResult.status || 1);
  }

  runCommandOrThrow("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--timestamp=none",
    buildMeta.appBundlePath,
  ]);
}

await mkdir(buildMeta.dmgDir, { recursive: true });
await rm(buildMeta.zipPath, { force: true });
await rm(buildMeta.dmgPath, { force: true });

runCommandOrThrow("ditto", [
  "-c",
  "-k",
  "--sequesterRsrc",
  "--keepParent",
  buildMeta.appBundlePath,
  buildMeta.zipPath,
]);

const stageDir = await mkdtemp(path.join(os.tmpdir(), "telegram-drive-"));
try {
  const stagedAppPath = path.join(stageDir, path.basename(buildMeta.appBundlePath));
  await cp(buildMeta.appBundlePath, stagedAppPath, { recursive: true });
  await symlink("/Applications", path.join(stageDir, "Applications"));

  runCommandOrThrow("hdiutil", [
    "create",
    "-volname",
    buildMeta.productName,
    "-srcfolder",
    stageDir,
    "-ov",
    "-format",
    "UDZO",
    buildMeta.dmgPath,
  ]);
} finally {
  await rm(stageDir, { recursive: true, force: true });
}

console.log(`Created macOS app bundle: ${buildMeta.appBundlePath}`);
console.log(`Created macOS zip archive: ${buildMeta.zipPath}`);
console.log(`Created macOS dmg archive: ${buildMeta.dmgPath}`);

function runTauri(args) {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(npxCommand, ["--no-install", "tauri", ...args], {
    cwd: appDir,
    stdio: "inherit",
    env: process.env,
  });

  return result.status ?? 1;
}

function runCommand(commandName, args, options = {}) {
  return spawnSync(commandName, args, {
    cwd: appDir,
    env: process.env,
    encoding: "utf8",
    stdio: options.captureOutput ? "pipe" : "inherit",
  });
}

function runCommandOrThrow(commandName, args) {
  const result = runCommand(commandName, args);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function splitPassthroughArgs(args) {
  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1) {
    return [args, []];
  }

  return [args.slice(0, separatorIndex), args.slice(separatorIndex)];
}

function hasFlag(args, flags) {
  return args.some((arg) => flags.includes(arg));
}

function readBundleSelection(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "-b" || arg === "--bundles") {
      const values = [];
      for (let cursor = index + 1; cursor < args.length; cursor += 1) {
        const value = args[cursor];
        if (value.startsWith("-")) {
          break;
        }
        values.push(...splitCsvValues(value));
      }
      return values;
    }

    if (arg.startsWith("--bundles=")) {
      return splitCsvValues(arg.slice("--bundles=".length));
    }
  }

  return null;
}

function rewriteBundles(args, bundles) {
  const nextArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "-b" || arg === "--bundles") {
      index += 1;
      while (index < args.length && !args[index].startsWith("-")) {
        index += 1;
      }
      index -= 1;
      continue;
    }

    if (arg.startsWith("--bundles=")) {
      continue;
    }

    nextArgs.push(arg);
  }

  return [
    nextArgs[0],
    "--bundles",
    bundles.join(","),
    ...nextArgs.slice(1),
  ];
}

function splitCsvValues(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readOptionValue(args, optionNames) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (optionNames.includes(arg)) {
      return args[index + 1];
    }

    for (const optionName of optionNames) {
      const prefix = `${optionName}=`;
      if (arg.startsWith(prefix)) {
        return arg.slice(prefix.length);
      }
    }
  }

  return null;
}

async function resolveBuildMetadata(args) {
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));
  const profile = hasFlag(args, ["-d", "--debug"]) ? "debug" : "release";
  const target = readOptionValue(args, ["-t", "--target"]);
  const arch = resolveArchSuffix(target);

  const bundleRoot = target
    ? path.join(appDir, "src-tauri", "target", target, profile, "bundle")
    : path.join(appDir, "src-tauri", "target", profile, "bundle");

  const macosDir = path.join(bundleRoot, "macos");
  const dmgDir = path.join(bundleRoot, "dmg");
  const appBundlePath = await findAppBundle(
    macosDir,
    `${config.productName}.app`
  );

  return {
    appBundlePath,
    dmgDir,
    dmgPath: path.join(
      dmgDir,
      `${config.productName}_${config.version}_${arch}.dmg`
    ),
    productName: config.productName,
    zipPath: path.join(macosDir, `${path.basename(appBundlePath)}.zip`),
  };
}

async function findAppBundle(macosDir, expectedBundleName) {
  const preferredPath = path.join(macosDir, expectedBundleName);
  if (await pathExists(preferredPath)) {
    return preferredPath;
  }

  const entries = await readdir(macosDir, { withFileTypes: true });
  const appEntry = entries.find(
    (entry) => entry.isDirectory() && entry.name.endsWith(".app")
  );

  if (!appEntry) {
    throw new Error(`Unable to locate a macOS app bundle under ${macosDir}`);
  }

  return path.join(macosDir, appEntry.name);
}

function resolveArchSuffix(target) {
  if (target?.startsWith("aarch64-")) {
    return "aarch64";
  }
  if (target?.startsWith("x86_64-")) {
    return "x64";
  }
  if (target === "universal-apple-darwin") {
    return "universal";
  }
  if (process.arch === "arm64") {
    return "aarch64";
  }
  if (process.arch === "x64") {
    return "x64";
  }

  return process.arch;
}

function hasExplicitAppleSigning() {
  return Boolean(
    process.env.APPLE_SIGNING_IDENTITY?.trim() ||
      process.env.APPLE_CERTIFICATE?.trim()
  );
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
