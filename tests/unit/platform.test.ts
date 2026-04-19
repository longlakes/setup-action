import { describe, it, expect, vi, afterEach } from "vitest";
import { resolvePlatform, resolveAssetInfo } from "../../src/installer.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolvePlatform", () => {
  it("returns linux/amd64 for linux x64", () => {
    vi.stubGlobal("process", { ...process, platform: "linux", arch: "x64" });
    expect(resolvePlatform()).toEqual({ os: "linux", arch: "amd64" });
  });

  it("returns linux/arm64 for linux arm64", () => {
    vi.stubGlobal("process", { ...process, platform: "linux", arch: "arm64" });
    expect(resolvePlatform()).toEqual({ os: "linux", arch: "arm64" });
  });

  it("returns darwin/amd64 for darwin x64", () => {
    vi.stubGlobal("process", { ...process, platform: "darwin", arch: "x64" });
    expect(resolvePlatform()).toEqual({ os: "darwin", arch: "amd64" });
  });

  it("returns darwin/arm64 for darwin arm64", () => {
    vi.stubGlobal("process", {
      ...process,
      platform: "darwin",
      arch: "arm64",
    });
    expect(resolvePlatform()).toEqual({ os: "darwin", arch: "arm64" });
  });

  it("throws on unsupported platform", () => {
    vi.stubGlobal("process", { ...process, platform: "win32", arch: "x64" });
    expect(() => resolvePlatform()).toThrow("Unsupported platform: win32");
  });
});

describe("resolveAssetInfo", () => {
  const version = "0.100.0";

  it("builds correct asset name for linux/amd64", () => {
    const info = resolveAssetInfo(version, { os: "linux", arch: "amd64" });
    expect(info.assetName).toBe(
      "otelcol-contrib_0.100.0_linux_amd64.tar.gz",
    );
  });

  it("builds correct asset name for darwin/arm64", () => {
    const info = resolveAssetInfo(version, { os: "darwin", arch: "arm64" });
    expect(info.assetName).toBe(
      "otelcol-contrib_0.100.0_darwin_arm64.tar.gz",
    );
  });

  it("builds correct checksums filename", () => {
    const info = resolveAssetInfo(version, { os: "linux", arch: "amd64" });
    expect(info.checksumsName).toBe("otelcol-contrib_0.100.0_checksums.txt");
  });

  it("builds download URL with v-prefixed version in path, no v in filename", () => {
    const info = resolveAssetInfo(version, { os: "linux", arch: "amd64" });
    expect(info.downloadUrl).toBe(
      "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.100.0/otelcol-contrib_0.100.0_linux_amd64.tar.gz",
    );
  });

  it("builds checksums URL with v-prefixed version in path", () => {
    const info = resolveAssetInfo(version, { os: "linux", arch: "amd64" });
    expect(info.checksumsUrl).toBe(
      "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.100.0/otelcol-contrib_0.100.0_checksums.txt",
    );
  });
});
