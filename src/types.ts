export interface Platform {
  os: "linux" | "darwin";
  arch: "amd64" | "arm64";
}

export interface AssetInfo {
  assetName: string;
  checksumsName: string;
  downloadUrl: string;
  checksumsUrl: string;
}

export interface CollectorConfigOptions {
  endpoint: string;
  token: string;
  hostmetrics: boolean;
}

export type WriteFn = (path: string, content: string) => Promise<void>;
export type HttpGetFn = (url: string) => Promise<{ status: number }>;
export type SleepFn = (ms: number) => Promise<void>;
export type ExecDetachedFn = (
  cmd: string,
  args: string[],
  logPath: string,
) => void;
export type DownloadFn = (url: string) => Promise<string>;
export type CacheFn = (
  src: string,
  name: string,
  version: string,
) => Promise<string>;
export type FindInCacheFn = (name: string, version: string) => string;

export interface InstallerOptions {
  version: string;
  endpoint: string;
  token: string;
  hostmetrics: boolean;
  nodeOptions: boolean;
  // Injected I/O dependencies — defaults to real implementations in main.ts
  downloadFile?: DownloadFn;
  cacheFile?: CacheFn;
  findInCache?: FindInCacheFn;
  writeFile?: WriteFn;
  execDetached?: ExecDetachedFn;
  httpGet?: HttpGetFn;
  sleep?: SleepFn;
}
