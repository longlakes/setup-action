import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { buildCollectorConfig } from "../../src/config.js";
import type { CollectorConfigOptions } from "../../src/types.js";

const baseOpts: CollectorConfigOptions = {
  endpoint: "https://app.rewire.dev/otlp/v1",
  token: "rwt_testtoken123",
  hostmetrics: true,
};

function parse(opts: CollectorConfigOptions): Record<string, unknown> {
  return yaml.load(buildCollectorConfig(opts)) as Record<string, unknown>;
}

describe("buildCollectorConfig — receivers", () => {
  it("includes otlp receiver with grpc on localhost:4317", () => {
    const cfg = parse(baseOpts);
    const otlp = (cfg.receivers as Record<string, unknown>).otlp as Record<
      string,
      unknown
    >;
    const protocols = otlp.protocols as Record<string, unknown>;
    const grpc = protocols.grpc as Record<string, unknown>;
    expect(grpc.endpoint).toBe("localhost:4317");
  });

  it("includes otlp receiver with http on localhost:4318", () => {
    const cfg = parse(baseOpts);
    const otlp = (cfg.receivers as Record<string, unknown>).otlp as Record<
      string,
      unknown
    >;
    const protocols = otlp.protocols as Record<string, unknown>;
    const http = protocols.http as Record<string, unknown>;
    expect(http.endpoint).toBe("localhost:4318");
  });

  it("includes hostmetrics receiver when hostmetrics=true", () => {
    const cfg = parse({ ...baseOpts, hostmetrics: true });
    const receivers = cfg.receivers as Record<string, unknown>;
    expect(receivers.hostmetrics).toBeDefined();
  });

  it("omits hostmetrics receiver when hostmetrics=false", () => {
    const cfg = parse({ ...baseOpts, hostmetrics: false });
    const receivers = cfg.receivers as Record<string, unknown>;
    expect(receivers.hostmetrics).toBeUndefined();
  });

  it("hostmetrics scrapers include cpu, memory, disk, network", () => {
    const cfg = parse({ ...baseOpts, hostmetrics: true });
    const receivers = cfg.receivers as Record<string, unknown>;
    const hostmetrics = receivers.hostmetrics as Record<string, unknown>;
    const scrapers = hostmetrics.scrapers as Record<string, unknown>;
    expect(scrapers.cpu).toBeDefined();
    expect(scrapers.memory).toBeDefined();
    expect(scrapers.disk).toBeDefined();
    expect(scrapers.network).toBeDefined();
  });
});

describe("buildCollectorConfig — processors", () => {
  it("includes resource processor", () => {
    const cfg = parse(baseOpts);
    const processors = cfg.processors as Record<string, unknown>;
    expect(processors.resource).toBeDefined();
  });

  it("resource processor stamps run.id with ${env:GITHUB_RUN_ID}", () => {
    const cfg = parse(baseOpts);
    const processors = cfg.processors as Record<string, unknown>;
    const resource = processors.resource as Record<string, unknown>;
    const attrs = resource.attributes as Array<{
      key: string;
      value: string;
      action: string;
    }>;
    const attr = attrs.find((a) => a.key === "run.id");
    expect(attr?.value).toBe("${env:GITHUB_RUN_ID}");
    expect(attr?.action).toBe("insert");
  });

  it("resource processor stamps ci.platform with literal github_actions", () => {
    const cfg = parse(baseOpts);
    const processors = cfg.processors as Record<string, unknown>;
    const resource = processors.resource as Record<string, unknown>;
    const attrs = resource.attributes as Array<{
      key: string;
      value: string;
      action: string;
    }>;
    const attr = attrs.find((a) => a.key === "ci.platform");
    expect(attr?.value).toBe("github_actions");
    expect(attr?.action).toBe("insert");
  });

  it("resource processor stamps repo.name with ${env:GITHUB_REPOSITORY}", () => {
    const cfg = parse(baseOpts);
    const processors = cfg.processors as Record<string, unknown>;
    const resource = processors.resource as Record<string, unknown>;
    const attrs = resource.attributes as Array<{
      key: string;
      value: string;
      action: string;
    }>;
    const attr = attrs.find((a) => a.key === "repo.name");
    expect(attr?.value).toBe("${env:GITHUB_REPOSITORY}");
  });

  it("resource processor stamps git.branch with ${env:GITHUB_REF_NAME}", () => {
    const cfg = parse(baseOpts);
    const processors = cfg.processors as Record<string, unknown>;
    const resource = processors.resource as Record<string, unknown>;
    const attrs = resource.attributes as Array<{
      key: string;
      value: string;
    }>;
    const attr = attrs.find((a) => a.key === "git.branch");
    expect(attr?.value).toBe("${env:GITHUB_REF_NAME}");
  });

  it("resource processor stamps git.commit.sha with ${env:GITHUB_SHA}", () => {
    const cfg = parse(baseOpts);
    const processors = cfg.processors as Record<string, unknown>;
    const resource = processors.resource as Record<string, unknown>;
    const attrs = resource.attributes as Array<{
      key: string;
      value: string;
    }>;
    const attr = attrs.find((a) => a.key === "git.commit.sha");
    expect(attr?.value).toBe("${env:GITHUB_SHA}");
  });
});

describe("buildCollectorConfig — exporters", () => {
  it("includes otlphttp exporter with correct endpoint", () => {
    const cfg = parse({ ...baseOpts, endpoint: "https://example.com/otlp/v1" });
    const exporters = cfg.exporters as Record<string, unknown>;
    const otlphttp = exporters.otlphttp as Record<string, unknown>;
    expect(otlphttp.endpoint).toBe("https://example.com/otlp/v1");
  });

  it("otlphttp exporter has Authorization Bearer header with token", () => {
    const cfg = parse({ ...baseOpts, token: "rwt_abc123" });
    const exporters = cfg.exporters as Record<string, unknown>;
    const otlphttp = exporters.otlphttp as Record<string, unknown>;
    const headers = otlphttp.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer rwt_abc123");
  });
});

describe("buildCollectorConfig — extensions", () => {
  it("includes health_check extension on localhost:13133", () => {
    const cfg = parse(baseOpts);
    const extensions = cfg.extensions as Record<string, unknown>;
    const health = extensions.health_check as Record<string, unknown>;
    expect(health.endpoint).toBe("localhost:13133");
  });
});

describe("buildCollectorConfig — service pipelines", () => {
  it("traces pipeline receives from otlp", () => {
    const cfg = parse(baseOpts);
    const service = cfg.service as Record<string, unknown>;
    const pipelines = service.pipelines as Record<string, unknown>;
    const traces = pipelines.traces as Record<string, string[]>;
    expect(traces.receivers).toContain("otlp");
  });

  it("metrics pipeline receives from otlp and hostmetrics when enabled", () => {
    const cfg = parse({ ...baseOpts, hostmetrics: true });
    const service = cfg.service as Record<string, unknown>;
    const pipelines = service.pipelines as Record<string, unknown>;
    const metrics = pipelines.metrics as Record<string, string[]>;
    expect(metrics.receivers).toContain("otlp");
    expect(metrics.receivers).toContain("hostmetrics");
  });

  it("metrics pipeline receives only from otlp when hostmetrics disabled", () => {
    const cfg = parse({ ...baseOpts, hostmetrics: false });
    const service = cfg.service as Record<string, unknown>;
    const pipelines = service.pipelines as Record<string, unknown>;
    const metrics = pipelines.metrics as Record<string, string[]>;
    expect(metrics.receivers).toContain("otlp");
    expect(metrics.receivers).not.toContain("hostmetrics");
  });

  it("all pipelines include resource processor", () => {
    const cfg = parse(baseOpts);
    const service = cfg.service as Record<string, unknown>;
    const pipelines = service.pipelines as Record<
      string,
      Record<string, string[]>
    >;
    for (const pipeline of Object.values(pipelines)) {
      expect(pipeline.processors).toContain("resource");
    }
  });

  it("all pipelines export via otlphttp", () => {
    const cfg = parse(baseOpts);
    const service = cfg.service as Record<string, unknown>;
    const pipelines = service.pipelines as Record<
      string,
      Record<string, string[]>
    >;
    for (const pipeline of Object.values(pipelines)) {
      expect(pipeline.exporters).toContain("otlphttp");
    }
  });

  it("service extensions list includes health_check", () => {
    const cfg = parse(baseOpts);
    const service = cfg.service as Record<string, unknown>;
    expect(service.extensions).toContain("health_check");
  });
});
