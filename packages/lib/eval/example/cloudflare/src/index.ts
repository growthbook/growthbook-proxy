import {
  evaluateFeatures,
  type Attributes,
  type FeatureApiResponse,
} from "@growthbook/proxy-eval";
import { KVStickyBucketService } from "./KVStickyBucketService";

interface Env {
  ENVIRONMENT: string;

  KV_GB_PAYLOAD: KVNamespace;
  // NOTE: Be sure to connect a GrowthBook SDK Webhook to your KV store.
  // Use the webhook type "Cloudflare KV" in the SDK webhook settings.

  // Optional: bind a KV namespace to enable sticky bucketing
  KV_STICKY_BUCKETS?: KVNamespace;
  STICKY_BUCKET_TTL?: string; // seconds, min 60 (KV expirationTtl floor)
}

interface PostBody {
  attributes: Attributes;
  forcedVariations?: Record<string, number>;
  // Map entries, as serialized by the JS SDK's remote eval fetch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forcedFeatures?: [string, any][];
  url?: string;
  ctx?: { verboseDebugging?: boolean };
}

const KV_KEY = "gb_payload";
const CACHE_TTL = 60 * 1000; // 1 min

// Cache payload from KV
let cachedPayload: FeatureApiResponse | null = null;
let lastFetch = 0;

export default {
  fetch: async function (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: getCORSHeaders(),
      });
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response(null, {
        status: 405,
        headers: {
          Allow: "POST",
          ...getCORSHeaders(),
        },
      });
    }

    try {
      const body = await request.json<PostBody>().catch(() => null);
      if (!body || typeof body !== "object") {
        return handleInvalidRequest();
      }

      if (!cachedPayload || Date.now() - lastFetch > CACHE_TTL) {
        cachedPayload = await env.KV_GB_PAYLOAD.get<FeatureApiResponse>(
          KV_KEY,
          "json",
        );
        lastFetch = Date.now();
      }

      const {
        attributes = {},
        forcedVariations = {},
        forcedFeatures = [],
        url = "",
      } = body;
      const forcedFeaturesMap = new Map(forcedFeatures);

      // Per-request instance; workers handle concurrent requests per isolate,
      // so a shared write buffer would race
      const stickyBucketService = env.KV_STICKY_BUCKETS
        ? new KVStickyBucketService({
            kv: env.KV_STICKY_BUCKETS,
            ttl: env.STICKY_BUCKET_TTL
              ? parseInt(env.STICKY_BUCKET_TTL)
              : undefined,
          })
        : null;

      const evalResponse = await evaluateFeatures({
        payload: cachedPayload,
        attributes,
        forcedVariations,
        forcedFeatures: forcedFeaturesMap,
        url,
        stickyBucketService,
      });

      // Flush after responding; un-awaited writes are canceled without waitUntil
      if (stickyBucketService) {
        ctx.waitUntil(stickyBucketService.flushWrites());
      }

      // Return success response
      return new Response(JSON.stringify(evalResponse), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...getCORSHeaders(),
        },
      });
    } catch (error) {
      console.error(error);
      return handleInvalidRequest();
    }
  },
};

function getCORSHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*", // Configure this appropriately for production
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function handleInvalidRequest(): Response {
  return new Response(null, {
    status: 500,
    headers: getCORSHeaders(),
  });
}
