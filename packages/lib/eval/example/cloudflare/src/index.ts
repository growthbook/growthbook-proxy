import { evaluateFeatures } from "@growthbook/proxy-eval";
import { StickyBucketService } from "@growthbook/growthbook";

interface Env {
  ENVIRONMENT: string;
  // KV Binding
  KV_GB_PAYLOAD: KVNamespace;
}

interface PostBody {
  payload: any;
  attributes: Record<string, any>;
  forcedVariations?: Record<string, number>;
  forcedFeatures?: Map<string, any>;
  url?: string;
  // note: For advanced experimentation, you may want to connect a KV or cookie Sticky Bucket service
  stickyBucketService?:
    | (StickyBucketService & {
    connect: () => Promise<void>;
    onEvaluate?: () => Promise<void>;
  })
    | null;
  ctx?: any;
}

const KV_KEY = "gb_payload";
const CACHE_TTL = 60 * 1000; // 1 min

// Cache payload from KV
let cachedPayload: any = null;
let lastFetch = 0;


export default {
  fetch: async function (
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: getCORSHeaders(),
      });
    }

    // Only allow POST requests
    if (request.method !== 'POST') {
      return new Response(null, {
        status: 405,
        headers: {
          'Allow': 'POST',
          ...getCORSHeaders(),
        }
      });
    }

    try {
      const body = await request.json<PostBody>().catch(() => null);
      if (!body || typeof body !== "object") {
        return handleInvalidRequest();
      }

      if (!cachedPayload || Date.now() - lastFetch > CACHE_TTL) {
        cachedPayload = await env.KV_GB_PAYLOAD.get(KV_KEY, 'json');
        lastFetch = Date.now();
      }

      const { attributes = {}, forcedVariations = {}, forcedFeatures = [], url = "" } = body;
      const forcedFeaturesMap = new Map(forcedFeatures);

      const evalResponse = await evaluateFeatures({
        payload: cachedPayload,
        attributes,
        forcedVariations,
        forcedFeatures: forcedFeaturesMap,
        url,
      });

      // Return success response
      return new Response(
        JSON.stringify(evalResponse),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...getCORSHeaders(),
          }
        }
      );

    } catch (error) {
      console.error(error);
      return handleInvalidRequest();
    }
  }
}

function getCORSHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*', // Configure this appropriately for production
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function handleInvalidRequest(): Response {
  return new Response(null, {
    status: 500,
    headers: getCORSHeaders(),
  });
}
