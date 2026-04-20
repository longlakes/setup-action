import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { buildCollectorConfig } from "./config.js";
import type {
  AssetInfo,
  CollectorConfigOptions,
  ExecDetachedFn,
  HttpGetFn,
  InstallerOptions,
  Platform,
  SleepFn,
  WriteFn,
} from "./types.js";

export const COLLECTOR_LOG_PATH = "/tmp/otelcol.log";
export const HEALTH_URL = "http://localhost:13133";
export const DEFAULT_VERSION = "0.114.0";

export function resolvePlatform(): Platform {
  const { platform, arch } = process;
  if (platform !== "linux" && platform !== "darwin") {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  const os = platform;
  const resolvedArch = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : null;
  if (!resolvedArch) {
    throw new Error(`Unsupported arch: ${arch}`);
  }
  return { os, arch: resolvedArch };
}

export function resolveAssetInfo(
  version: string,
  platform: Platform,
): AssetInfo {
  const assetName = `otelcol-contrib_${version}_${platform.os}_${platform.arch}.tar.gz`;
  const checksumsName = `opentelemetry-collector-releases_otelcol-contrib_checksums.txt`;
  const base = `https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v${version}`;
  return {
    assetName,
    checksumsName,
    downloadUrl: `${base}/${assetName}`,
    checksumsUrl: `${base}/${checksumsName}`,
  };
}

export async function verifySha256(
  filePath: string,
  checksumsContent: string,
  assetName: string,
): Promise<void> {
  const expected = checksumsContent
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.endsWith(`  ${assetName}`))
    ?.split(/\s+/)[0];

  if (!expected) {
    throw new Error(`SHA256 hash not found in checksums for ${assetName}`);
  }

  const actual = await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });

  if (actual !== expected) {
    throw new Error(`SHA256 mismatch for ${assetName}: expected ${expected}, got ${actual}`);
  }
}

export async function downloadCollector(opts: InstallerOptions): Promise<string> {
  const {
    version,
    findInCache = () => "",
    downloadFile = async () => { throw new Error("downloadFile not provided"); },
    cacheFile = async (src) => src,
  } = opts;

  const platform = resolvePlatform();
  const asset = resolveAssetInfo(version, platform);

  const cached = findInCache("otelcol-contrib", version);
  if (cached) return cached;

  const tarPath = await downloadFile(asset.downloadUrl);
  const checksumsText = await fetch(asset.checksumsUrl).then((r) => r.text());
  await verifySha256(tarPath, checksumsText, asset.assetName);
  const binaryPath = await cacheFile(tarPath, "otelcol-contrib", version);
  return binaryPath;
}

export async function writeCollectorConfig(
  configPath: string,
  opts: CollectorConfigOptions,
  writeFile: WriteFn,
): Promise<void> {
  const content = buildCollectorConfig(opts);
  await writeFile(configPath, content);
}

export function startCollector(
  binaryPath: string,
  configPath: string,
  execDetached: ExecDetachedFn,
): void {
  execDetached(binaryPath, ["--config", configPath], COLLECTOR_LOG_PATH);
}

export async function pollHealth(
  url: string,
  timeoutMs: number,
  httpGet: HttpGetFn,
  sleep: SleepFn,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let delay = 250;

  while (true) {
    try {
      const res = await httpGet(url);
      if (res.status === 200) return;
    } catch {
      // connection refused — not ready yet
    }

    if (Date.now() >= deadline) {
      throw new Error("Collector health check timed out");
    }

    await sleep(delay);
    delay = Math.min(delay * 2, 2000);
  }
}

export function buildEnvVars(opts: {
  nodeOptions: boolean;
}): Record<string, string> {
  const vars: Record<string, string> = {
    OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
    OTEL_SERVICE_NAME: process.env.GITHUB_REPOSITORY ?? "",
  };

  if (opts.nodeOptions) {
    const register = "--require @rewire/node/register";
    const existing = process.env.NODE_OPTIONS ?? "";
    vars.NODE_OPTIONS = existing.includes(register)
      ? existing
      : existing
        ? `${existing} ${register}`
        : register;
  }

  return vars;
}

export async function run(opts: InstallerOptions): Promise<Record<string, string>> {
  const {
    writeFile = async () => { throw new Error("writeFile not provided"); },
    execDetached = () => { throw new Error("execDetached not provided"); },
    httpGet = async (url) => { const r = await fetch(url); return { status: r.status }; },
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = opts;

  const configPath = "/tmp/otelcol-config.yml";

  const binaryPath = await downloadCollector(opts);
  await writeCollectorConfig(configPath, opts, writeFile);
  startCollector(binaryPath, configPath, execDetached);
  await pollHealth(HEALTH_URL, 30_000, httpGet, sleep);

  return buildEnvVars({ nodeOptions: opts.nodeOptions });
}

// Real execDetached implementation — used by main.ts
export function makeExecDetached(): ExecDetachedFn {
  return (cmd, args, logPath) => {
    const out = openSync(logPath, "a");
    const child = spawn(cmd, args, {
      detached: true,
      stdio: ["ignore", out, out],
    });
    child.unref();
  };
}
