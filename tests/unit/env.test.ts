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
    const vars = buildEnvVars();
    expect(vars["OTEL_EXPORTER_OTLP_ENDPOINT"]).toBe("http://localhost:4318");
  });

  it("returns OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf", () => {
    const vars = buildEnvVars();
    expect(vars["OTEL_EXPORTER_OTLP_PROTOCOL"]).toBe("http/protobuf");
  });

  it("returns OTEL_SERVICE_NAME equal to GITHUB_REPOSITORY", () => {
    const vars = buildEnvVars();
    expect(vars["OTEL_SERVICE_NAME"]).toBe("acme/my-app");
  });

  it("does not include NODE_OPTIONS", () => {
    const vars = buildEnvVars();
    expect(vars).not.toHaveProperty("NODE_OPTIONS");
  });
});
