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
    growthbook: {
      apiHost: "",
      clientKey: "",
    },
    persistUuid: false,
    uuidCookieName: "gbuuid",
    uuidKey: "id",
    skipAutoAttributes: false,
  },
  helpers: {},
};

export function getConfig(env: Record<string, string>): Config {
  const config = defaultContext.config;

  config.proxyTarget =
    process.env.PROXY_TARGET ?? defaultContext.config.proxyTarget;
  config.forwardProxyHeaders = ["true", "1"].includes(
    process.env.FORWARD_PROXY_HEADERS ??
    "" + defaultContext.config.forwardProxyHeaders,
  );
  config.environment =
    process.env.NODE_ENV ?? defaultContext.config.environment;
  config.maxPayloadSize =
    process.env.MAX_PAYLOAD_SIZE ?? defaultContext.config.maxPayloadSize;

  try {
    config.routes = JSON.parse(process.env.ROUTES || "[]");
  } catch (e) {
    console.error("Error parsing ROUTES", e);
    config.routes = [];
  }

  config.runVisualEditorExperiments = (process.env
      .RUN_VISUAL_EDITOR_EXPERIMENTS ??
    defaultContext.config
      .runVisualEditorExperiments) as ExperimentRunEnvironment;
  config.disableJsInjection = ["true", "1"].includes(
    process.env.DISABLE_JS_INJECTION ??
    "" + defaultContext.config.disableJsInjection,
  );

  config.runUrlRedirectExperiments = (process.env
      .RUN_URL_REDIRECT_EXPERIMENTS ??
    defaultContext.config
      .runUrlRedirectExperiments) as ExperimentRunEnvironment;
  config.runCrossOriginUrlRedirectExperiments = (process.env
      .RUN_CROSS_ORIGIN_URL_REDIRECT_EXPERIMENTS ??
    defaultContext.config
      .runCrossOriginUrlRedirectExperiments) as ExperimentRunEnvironment;
  config.injectRedirectUrlScript = ["true", "1"].includes(
    process.env.INJECT_REDIRECT_URL_SCRIPT ??
    "" + defaultContext.config.injectRedirectUrlScript,
  );
  config.maxRedirects = parseInt(
    process.env.MAX_REDIRECTS || "" + defaultContext.config.maxRedirects,
  );

  config.scriptInjectionPattern =
    process.env.SCRIPT_INJECTION_PATTERN ||
    defaultContext.config.scriptInjectionPattern;
  config.disableInjections = ["true", "1"].includes(
    process.env.DISABLE_INJECTIONS ??
    "" + defaultContext.config.disableInjections,
  );

  config.enableStreaming = ["true", "1"].includes(
    process.env.ENABLE_STREAMING ?? "" + defaultContext.config.enableStreaming,
  );
  config.enableStickyBucketing = ["true", "1"].includes(
    process.env.ENABLE_STICKY_BUCKETING ??
    "" + defaultContext.config.enableStickyBucketing,
  );
  "STICKY_BUCKET_PREFIX" in process.env &&
  (config.stickyBucketPrefix = process.env.STICKY_BUCKET_PREFIX);

  config.contentSecurityPolicy =
    process.env.CONTENT_SECURITY_POLICY || "";
  // warning: for testing only; nonce should be unique per request
  config.nonce = process.env.NONCE || undefined;

  config.crypto = crypto;

  // config.growthbook
  config.growthbook.apiHost = (process.env.GROWTHBOOK_API_HOST ?? "")
    .replace(/\/*$/, "");
  config.growthbook.clientKey = process.env.GROWTHBOOK_CLIENT_KEY ?? "";
  "GROWTHBOOK_DECRYPTION_KEY" in process.env &&
  (config.growthbook.decryptionKey =
    process.env.GROWTHBOOK_DECRYPTION_KEY);
  "GROWTHBOOK_TRACKING_CALLBACK" in process.env &&
  (config.growthbook.trackingCallback =
    process.env.GROWTHBOOK_TRACKING_CALLBACK);
  try {
    "GROWTHBOOK_PAYLOAD" in process.env &&
    (config.growthbook.payload = JSON.parse(
      process.env.GROWTHBOOK_PAYLOAD || "",
    ));
  } catch (e) {
    console.error("Error parsing GROWTHBOOK_PAYLOAD", e);
  }

  config.persistUuid = ["true", "1"].includes(
    process.env.PERSIST_UUID ?? "" + defaultContext.config.persistUuid,
  );
  config.uuidCookieName =
    process.env.UUID_COOKIE_NAME || defaultContext.config.uuidCookieName;
  config.uuidKey =
    process.env.UUID_KEY || defaultContext.config.uuidKey;

  config.skipAutoAttributes = ["true", "1"].includes(
    process.env.SKIP_AUTO_ATTRIBUTES ??
    "" + defaultContext.config.skipAutoAttributes,
  );

  return config;
}
