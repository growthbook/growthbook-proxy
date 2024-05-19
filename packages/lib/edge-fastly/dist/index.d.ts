import { ConfigEnv } from "@growthbook/edge-utils";
import { FastlyConfig } from "./init";
export declare function gbHandleRequest(request: Request, env?: ConfigEnv, config?: Partial<FastlyConfig>): Promise<Response>;
export { getConfigEnvFromStore, getKVLocalStoragePolyfill, getPayloadFromKV } from "./init";
export type { FastlyConfig } from "./init";
