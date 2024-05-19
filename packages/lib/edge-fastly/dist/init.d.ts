import { Context, Config, ConfigEnv } from "@growthbook/edge-utils";
import { FeatureApiResponse } from "@growthbook/growthbook";
export interface FastlyConfig extends Config {
    apiHostBackend?: string;
    backends?: Record<string, string>;
    gbCacheStore?: any;
    gbPayloadStore?: any;
}
export declare function init(env?: ConfigEnv, config?: Partial<FastlyConfig>): Promise<Context<Request, Response>>;
export declare function getKVLocalStoragePolyfill(store: any): {
    getItem: (key: string) => Promise<any>;
    setItem: (key: string, value: string) => Promise<any>;
};
export declare function getPayloadFromKV(store: any, key?: string): Promise<FeatureApiResponse | undefined>;
export declare function getConfigEnvFromStore(store: any): ConfigEnv;
