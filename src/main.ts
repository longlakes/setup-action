// main.ts is the only file that imports @actions/core.
// All logic lives in installer.ts and config.ts.
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { run, makeExecDetached, DEFAULT_VERSION } from "./installer.js";
import { promises as fs } from "node:fs";

async function main() {
  const opts = {
    version: core.getInput("collector-version") || DEFAULT_VERSION,
    endpoint:
      core.getInput("endpoint") || "https://app.rewire.dev/otlp/v1",
    token: core.getInput("token", { required: true }),
    hostmetrics: core.getBooleanInput("hostmetrics"),
    nodeOptions: core.getBooleanInput("node-options"),
    downloadFile: (url: string) => tc.downloadTool(url),
    cacheFile: (src: string, name: string, version: string) =>
      tc.cacheFile(src, name, name, version),
    findInCache: (name: string, version: string) => tc.find(name, version),
    writeFile: (path: string, content: string) =>
      fs.writeFile(path, content, "utf8"),
    execDetached: makeExecDetached(),
    httpGet: async (url: string) => {
      const res = await fetch(url);
      return { status: res.status };
    },
    sleep: (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  };

  const envVars = await run(opts);

  for (const [key, value] of Object.entries(envVars)) {
    core.exportVariable(key, value);
  }
}

main().catch(core.setFailed);
