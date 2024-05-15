import { Config, Context, ExperimentRunEnvironment } from "./types";

export const defaultContext: Context = {
  config: {
    proxyTarget: "/",
    forwardProxyHeaders: true,
    environment: "production",
    maxPayloadSize: "2mb",
    runVisualEditorExperiments: "everywhere",
    disableJsInjection: false,
    runUrlRedirectExperiments: "browser",
    runCrossOriginUrlRedirectExperiments: "browser",
    injectRedirectUrlScript: true,
    maxRedirects: 5,
    scriptInjectionPattern: "</head>",
    disableInjections: false,
    enableStreaming: false,
    enableStickyBucketing: false,
    apiHost: "",
    clientKey: "",
    persistUuid: false,
    noAutoCookies: false,
    uuidCookieName: "gbuuid",
    uuidKey: "id",
    skipAutoAttributes: false,
  },
  helpers: {},
};

export interface ConfigEnv {
  PROXY_TARGET?: string;
  FORWARD_PROXY_HEADERS?: string;
  NODE_ENV?: string;
  MAX_PAYLOAD_SIZE?: string;

  ROUTES?: string;

  RUN_VISUAL_EDITOR_EXPERIMENTS?: ExperimentRunEnvironment;
  DISABLE_JS_INJECTION?: string;

  RUN_URL_REDIRECT_EXPERIMENTS?: ExperimentRunEnvironment;
  RUN_CROSS_ORIGIN_URL_REDIRECT_EXPERIMENTS?: ExperimentRunEnvironment;
  INJECT_REDIRECT_URL_SCRIPT?: string;
  MAX_REDIRECTS?: string;

  SCRIPT_INJECTION_PATTERN?: string;
  DISABLE_INJECTIONS?: string;

  ENABLE_STREAMING?: string;
  ENABLE_STICKY_BUCKETING?: string;
  STICKY_BUCKET_PREFIX?: string;

  CONTENT_SECURITY_POLICY?: string;
  NONCE?: string;

  GROWTHBOOK_API_HOST?: string;
  GROWTHBOOK_CLIENT_KEY?: string;
  GROWTHBOOK_DECRYPTION_KEY?: string;
  GROWTHBOOK_TRACKING_CALLBACK?: string;
  GROWTHBOOK_PAYLOAD?: string;
  STALE_TTL?: string;

  PERSIST_UUID?: string;
  NO_AUTO_COOKIES?: string;
  UUID_COOKIE_NAME?: string;
  UUID_KEY?: string;

  SKIP_AUTO_ATTRIBUTES?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getConfig(env: ConfigEnv): Config {
  const config = defaultContext.config;

  config.proxyTarget = env.PROXY_TARGET ?? defaultContext.config.proxyTarget;
  config.forwardProxyHeaders = ["true", "1"].includes(
    env.FORWARD_PROXY_HEADERS ?? "" + defaultContext.config.forwardProxyHeaders,
  );
  config.environment = env.NODE_ENV ?? defaultContext.config.environment;
  config.maxPayloadSize =
    env.MAX_PAYLOAD_SIZE ?? defaultContext.config.maxPayloadSize;

  try {
    config.routes = JSON.parse(env.ROUTES || "[]");
  } catch (e) {
    console.error("Error parsing ROUTES", e);
    config.routes = [];
  }

  config.runVisualEditorExperiments = (env.RUN_VISUAL_EDITOR_EXPERIMENTS ??
    defaultContext.config
      .runVisualEditorExperiments) as ExperimentRunEnvironment;
  config.disableJsInjection = ["true", "1"].includes(
    env.DISABLE_JS_INJECTION ?? "" + defaultContext.config.disableJsInjection,
  );

  config.runUrlRedirectExperiments = (env.RUN_URL_REDIRECT_EXPERIMENTS ??
    defaultContext.config
      .runUrlRedirectExperiments) as ExperimentRunEnvironment;
  config.runCrossOriginUrlRedirectExperiments =
    (env.RUN_CROSS_ORIGIN_URL_REDIRECT_EXPERIMENTS ??
      defaultContext.config
        .runCrossOriginUrlRedirectExperiments) as ExperimentRunEnvironment;
  config.injectRedirectUrlScript = ["true", "1"].includes(
    env.INJECT_REDIRECT_URL_SCRIPT ??
      "" + defaultContext.config.injectRedirectUrlScript,
  );
  config.maxRedirects = parseInt(
    env.MAX_REDIRECTS || "" + defaultContext.config.maxRedirects,
  );

  config.scriptInjectionPattern =
    env.SCRIPT_INJECTION_PATTERN ||
    defaultContext.config.scriptInjectionPattern;
  config.disableInjections = ["true", "1"].includes(
    env.DISABLE_INJECTIONS ?? "" + defaultContext.config.disableInjections,
  );

  config.enableStreaming = ["true", "1"].includes(
    env.ENABLE_STREAMING ?? "" + defaultContext.config.enableStreaming,
  );
  config.enableStickyBucketing = ["true", "1"].includes(
    env.ENABLE_STICKY_BUCKETING ??
      "" + defaultContext.config.enableStickyBucketing,
  );
  "STICKY_BUCKET_PREFIX" in env &&
    (config.stickyBucketPrefix = env.STICKY_BUCKET_PREFIX);

  config.contentSecurityPolicy = env.CONTENT_SECURITY_POLICY || "";
  // warning: for testing only; nonce should be unique per request
  config.nonce = env.NONCE || undefined;

  config.crypto = crypto;

  // growthbook
  config.apiHost = (env.GROWTHBOOK_API_HOST ?? "").replace(/\/*$/, "");
  config.clientKey = env.GROWTHBOOK_CLIENT_KEY ?? "";
  "GROWTHBOOK_DECRYPTION_KEY" in env &&
    (config.decryptionKey = env.GROWTHBOOK_DECRYPTION_KEY);
  "GROWTHBOOK_TRACKING_CALLBACK" in env &&
    (config.trackingCallback = env.GROWTHBOOK_TRACKING_CALLBACK);
  try {
    "GROWTHBOOK_PAYLOAD" in env &&
      (config.payload = JSON.parse(env.GROWTHBOOK_PAYLOAD || ""));
  } catch (e) {
    console.error("Error parsing GROWTHBOOK_PAYLOAD", e);
  }

  "STALE_TTL" in env && (config.staleTTL = parseInt(env.STALE_TTL || (1000 * 60)+""))
  config.persistUuid = ["true", "1"].includes(
    env.PERSIST_UUID ?? "" + defaultContext.config.persistUuid,
  );
  config.noAutoCookies = ["true", "1"].includes(
    env.NO_AUTO_COOKIES ?? "" + defaultContext.config.noAutoCookies,
  );
  config.uuidCookieName =
    env.UUID_COOKIE_NAME || defaultContext.config.uuidCookieName;
  config.uuidKey = env.UUID_KEY || defaultContext.config.uuidKey;

  config.skipAutoAttributes = ["true", "1"].includes(
    env.SKIP_AUTO_ATTRIBUTES ?? "" + defaultContext.config.skipAutoAttributes,
  );

  return config;
}
