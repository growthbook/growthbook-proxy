import { edgeApp } from "@growthbook/edge-utils";
import { init } from "./init";
export async function gbHandleRequest(request, env, config) {
    const context = await init(env, config);
    return (await edgeApp(context, request));
}
export { getConfigEnvFromStore } from "./init";
//# sourceMappingURL=index.js.map