import yaml from "js-yaml";
import type { CollectorConfigOptions } from "./types.js";

export function buildCollectorConfig(opts: CollectorConfigOptions): string {
  const receivers: Record<string, unknown> = {
    otlp: {
      protocols: {
        grpc: { endpoint: "localhost:4317" },
        http: { endpoint: "localhost:4318" },
      },
    },
  };

  if (opts.hostmetrics) {
    receivers.hostmetrics = {
      collection_interval: "10s",
      scrapers: { cpu: {}, memory: {}, disk: {}, network: {} },
    };
  }

  const processors = {
    resource: {
      attributes: [
        { key: "run.id", value: "${env:GITHUB_RUN_ID}", action: "insert" },
        { key: "ci.platform", value: "github_actions", action: "insert" },
        { key: "repo.name", value: "${env:GITHUB_REPOSITORY}", action: "insert" },
        { key: "git.branch", value: "${env:GITHUB_REF_NAME}", action: "insert" },
        { key: "git.commit.sha", value: "${env:GITHUB_SHA}", action: "insert" },
      ],
    },
    // Short timeout so spans are flushed before the job container exits.
    batch: { timeout: "200ms" },
  };

  const exporters = {
    otlphttp: {
      endpoint: opts.endpoint,
      headers: { Authorization: `Bearer ${opts.token}` },
    },
  };

  const extensions = {
    health_check: { endpoint: "localhost:13133" },
  };

  const metricsReceivers = opts.hostmetrics
    ? ["otlp", "hostmetrics"]
    : ["otlp"];

  const service = {
    extensions: ["health_check"],
    pipelines: {
      traces: {
        receivers: ["otlp"],
        processors: ["resource", "batch"],
        exporters: ["otlphttp"],
      },
      metrics: {
        receivers: metricsReceivers,
        processors: ["resource", "batch"],
        exporters: ["otlphttp"],
      },
    },
  };

  return yaml.dump(
    { receivers, processors, exporters, extensions, service },
    { lineWidth: 120 },
  );
}
