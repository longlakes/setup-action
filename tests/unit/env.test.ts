import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildEnvVars } from "../../src/installer.js";

describe("buildEnvVars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GITHUB_REPOSITORY = "acme/my-app";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318", () => {
    const vars = buildEnvVars({ nodeOptions: false });
    expect(vars["OTEL_EXPORTER_OTLP_ENDPOINT"]).toBe("http://localhost:4318");
  });

  it("returns OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf", () => {
    const vars = buildEnvVars({ nodeOptions: false });
    expect(vars["OTEL_EXPORTER_OTLP_PROTOCOL"]).toBe("http/protobuf");
  });

  it("returns OTEL_SERVICE_NAME equal to GITHUB_REPOSITORY", () => {
    const vars = buildEnvVars({ nodeOptions: false });
    expect(vars["OTEL_SERVICE_NAME"]).toBe("acme/my-app");
  });

  it("sets NODE_OPTIONS when nodeOptions=true and no existing value", () => {
    delete process.env.NODE_OPTIONS;
    const vars = buildEnvVars({ nodeOptions: true });
    expect(vars["NODE_OPTIONS"]).toBe("--require @rewire/node/register");
  });

  it("appends to existing NODE_OPTIONS", () => {
    process.env.NODE_OPTIONS = "--max-old-space-size=4096";
    const vars = buildEnvVars({ nodeOptions: true });
    expect(vars["NODE_OPTIONS"]).toBe(
      "--max-old-space-size=4096 --require @rewire/node/register",
    );
  });

  it("does not duplicate @rewire/node/register if already present", () => {
    process.env.NODE_OPTIONS = "--require @rewire/node/register";
    const vars = buildEnvVars({ nodeOptions: true });
    expect(vars["NODE_OPTIONS"]).toBe("--require @rewire/node/register");
  });

  it("does not include NODE_OPTIONS when nodeOptions=false", () => {
    const vars = buildEnvVars({ nodeOptions: false });
    expect(vars).not.toHaveProperty("NODE_OPTIONS");
  });
});
