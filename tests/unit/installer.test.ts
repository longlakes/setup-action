import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  verifySha256,
  downloadCollector,
  writeCollectorConfig,
  startCollector,
  pollHealth,
  makeExecDetached,
  COLLECTOR_LOG_PATH,
} from "../../src/installer.js";
import type { InstallerOptions } from "../../src/types.js";

// --- verifySha256 ---

describe("verifySha256", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "setup-action-test-"));
  });

  it("resolves when hash matches", async () => {
    const filePath = join(tmpDir, "test.tar.gz");
    const content = "hello world";
    await writeFile(filePath, content);
    const hash = createHash("sha256").update(content).digest("hex");
    const checksums = `${hash}  test.tar.gz\n`;
    await expect(
      verifySha256(filePath, checksums, "test.tar.gz"),
    ).resolves.toBeUndefined();
  });

  it("rejects with SHA256 mismatch when hash is wrong", async () => {
    const filePath = join(tmpDir, "test.tar.gz");
    await writeFile(filePath, "hello world");
    const checksums = `${"0".repeat(64)}  test.tar.gz\n`;
    await expect(
      verifySha256(filePath, checksums, "test.tar.gz"),
    ).rejects.toThrow("SHA256 mismatch");
  });

  it("correctly parses two-space-separated checksums format", async () => {
    const filePath = join(tmpDir, "other.tar.gz");
    const content = "data";
    await writeFile(filePath, content);
    const correctHash = createHash("sha256").update(content).digest("hex");
    // Multiple entries — should find the right one
    const checksums = [
      `${"a".repeat(64)}  something-else.tar.gz`,
      `${correctHash}  other.tar.gz`,
      `${"b".repeat(64)}  another.tar.gz`,
    ].join("\n");
    await expect(
      verifySha256(filePath, checksums, "other.tar.gz"),
    ).resolves.toBeUndefined();

    await rm(tmpDir, { recursive: true });
  });
});

// --- downloadCollector ---

describe("downloadCollector", () => {
  const baseOpts: InstallerOptions = {
    version: "0.100.0",
    endpoint: "https://app.rewire.dev/otlp/v1",
    token: "rwt_test",
    hostmetrics: true,
    nodeOptions: true,
  };

  it("returns cached path on cache hit without downloading", async () => {
    const findInCache = vi.fn().mockReturnValue("/cached/otelcol-contrib");
    const downloadFile = vi.fn();
    const result = await downloadCollector({
      ...baseOpts,
      findInCache,
      downloadFile,
    });
    expect(findInCache).toHaveBeenCalledWith("otelcol-contrib", "0.100.0");
    expect(downloadFile).not.toHaveBeenCalled();
    expect(result).toBe("/cached/otelcol-contrib");
  });

  it("downloads from the correct asset URL on cache miss", async () => {
    vi.stubGlobal("process", { ...process, platform: "linux", arch: "x64" });
    const findInCache = vi.fn().mockReturnValue("");
    const downloadFile = vi
      .fn()
      .mockResolvedValue("/tmp/downloaded.tar.gz");
    const cacheFile = vi.fn().mockResolvedValue("/cached/otelcol-contrib");

    // Provide a fake checksums file fetch and sha256 that passes
    global.fetch = vi.fn().mockResolvedValue({
      text: async () => `${"0".repeat(64)}  otelcol-contrib_0.100.0_linux_amd64.tar.gz`,
    }) as unknown as typeof fetch;

    // We need to bypass sha256 verification for this test — inject a no-op
    const opts: InstallerOptions = {
      ...baseOpts,
      findInCache,
      downloadFile,
      cacheFile,
    };

    // The download URL should contain the asset name
    try {
      await downloadCollector(opts);
    } catch {
      // sha256 will fail since the file doesn't exist; we just want to assert the URL
    }

    expect(downloadFile).toHaveBeenCalledWith(
      expect.stringContaining(
        "otelcol-contrib_0.100.0_linux_amd64.tar.gz",
      ),
    );

    vi.restoreAllMocks();
  });
});

// --- writeCollectorConfig ---

describe("writeCollectorConfig", () => {
  it("calls writeFile with a path ending in otelcol-config.yml", async () => {
    const writeFileFn = vi.fn().mockResolvedValue(undefined);
    await writeCollectorConfig(
      "/tmp/otelcol-config.yml",
      { endpoint: "https://app.rewire.dev/otlp/v1", token: "rwt_x", hostmetrics: true },
      writeFileFn,
    );
    expect(writeFileFn).toHaveBeenCalledWith(
      expect.stringMatching(/otelcol-config\.yml$/),
      expect.any(String),
    );
  });

  it("written content is valid YAML", async () => {
    const { default: yaml } = await import("js-yaml");
    let captured = "";
    const writeFileFn = vi.fn().mockImplementation((_path, content) => {
      captured = content;
      return Promise.resolve();
    });
    await writeCollectorConfig(
      "/tmp/otelcol-config.yml",
      { endpoint: "https://app.rewire.dev/otlp/v1", token: "rwt_x", hostmetrics: true },
      writeFileFn,
    );
    expect(() => yaml.load(captured)).not.toThrow();
  });
});

// --- startCollector ---

describe("startCollector", () => {
  it("calls execDetached with correct args and detached option", async () => {
    const execDetached = vi.fn().mockResolvedValue(undefined);
    await startCollector(
      "/usr/local/bin/otelcol-contrib",
      "/tmp/otelcol-config.yml",
      execDetached,
    );
    expect(execDetached).toHaveBeenCalledWith(
      "/usr/local/bin/otelcol-contrib",
      ["--config", "/tmp/otelcol-config.yml"],
      COLLECTOR_LOG_PATH,
    );
  });
});

// --- makeExecDetached ---

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, openSync: vi.fn().mockReturnValue(3) };
});

describe("makeExecDetached", async () => {
  const { spawn: mockSpawn } = await import("node:child_process") as { spawn: ReturnType<typeof vi.fn> };
  const sleep = vi.fn<[number], Promise<void>>();
  const cmd = "/bin/otelcol-contrib";
  const args = ["--config", "/tmp/config.yml"];
  const logPath = "/tmp/otelcol.log";
  const mockChild = { unref: vi.fn() };
  const etxtbsy = Object.assign(new Error("spawn ETXTBSY"), { code: "ETXTBSY" });

  beforeEach(() => {
    vi.clearAllMocks();
    sleep.mockResolvedValue(undefined);
  });

  it("spawns successfully on first attempt", async () => {
    mockSpawn.mockReturnValue(mockChild);

    const execDetached = makeExecDetached(sleep);
    await execDetached(cmd, args, logPath);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockChild.unref).toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on ETXTBSY and succeeds on the next attempt", async () => {
    mockSpawn.mockImplementationOnce(() => { throw etxtbsy; }).mockReturnValue(mockChild);

    const execDetached = makeExecDetached(sleep);
    await execDetached(cmd, args, logPath);

    expect(mockSpawn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it("uses increasing backoff delays across retries", async () => {
    mockSpawn
      .mockImplementationOnce(() => { throw etxtbsy; })
      .mockImplementationOnce(() => { throw etxtbsy; })
      .mockImplementationOnce(() => { throw etxtbsy; })
      .mockReturnValue(mockChild);

    const execDetached = makeExecDetached(sleep);
    await execDetached(cmd, args, logPath);

    expect(sleep).toHaveBeenNthCalledWith(1, 200);
    expect(sleep).toHaveBeenNthCalledWith(2, 400);
    expect(sleep).toHaveBeenNthCalledWith(3, 600);
  });

  it("throws after 5 failed ETXTBSY attempts", async () => {
    mockSpawn.mockImplementation(() => { throw etxtbsy; });

    const execDetached = makeExecDetached(sleep);
    await expect(execDetached(cmd, args, logPath)).rejects.toThrow("ETXTBSY");
    expect(mockSpawn).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(5);
  });

  it("throws immediately on non-ETXTBSY errors without retrying", async () => {
    const enoent = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
    mockSpawn.mockImplementation(() => { throw enoent; });

    const execDetached = makeExecDetached(sleep);
    await expect(execDetached(cmd, args, logPath)).rejects.toThrow("ENOENT");
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

// --- pollHealth ---

describe("pollHealth", () => {
  it("resolves immediately when first poll returns 200", async () => {
    const httpGet = vi.fn().mockResolvedValue({ status: 200 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      pollHealth("http://localhost:13133", 5000, httpGet, sleep),
    ).resolves.toBeUndefined();
    expect(httpGet).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on non-200 and resolves when 200 arrives", async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 200 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      pollHealth("http://localhost:13133", 30000, httpGet, sleep),
    ).resolves.toBeUndefined();
    expect(httpGet).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("uses exponential backoff capped at 2000ms", async () => {
    const httpGet = vi
      .fn()
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ status: 503 })
      .mockResolvedValue({ status: 200 });
    const sleepDelays: number[] = [];
    const sleep = vi.fn().mockImplementation((ms: number) => {
      sleepDelays.push(ms);
      return Promise.resolve();
    });
    await pollHealth("http://localhost:13133", 30000, httpGet, sleep);
    expect(sleepDelays[0]).toBe(250);
    expect(sleepDelays[1]).toBe(500);
    expect(sleepDelays[2]).toBe(1000);
    expect(sleepDelays[3]).toBe(2000);
  });

  it("rejects with timeout error when deadline exceeded", async () => {
    const httpGet = vi.fn().mockResolvedValue({ status: 503 });
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      pollHealth("http://localhost:13133", 0, httpGet, sleep),
    ).rejects.toThrow("Collector health check timed out");
  });
});
