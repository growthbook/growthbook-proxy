import {
  Context as GbContext,
  Attributes,
  StoredPayload,
  TrackingData,
  AutoExperiment,
} from "@growthbook/growthbook";
import { sdkWrapper } from "./generated/sdkWrapper";
import { Config, Context } from "./types";

export function injectScript({
  context,
  res,
  body,
  sdkPayload,
  attributes,
  deferredTrackingCalls,
  experiments,
  trackedExperimentHashes,
  preRedirectTrackedExperimentHashes,
  url,
  oldUrl,
}: {
  context: Context;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res: any;
  body: string;
  sdkPayload?: StoredPayload;
  attributes: Attributes;
  deferredTrackingCalls?: TrackingData[];
  experiments: AutoExperiment[];
  trackedExperimentHashes: string[];
  preRedirectTrackedExperimentHashes: string[];
  url: string;
  oldUrl: string;
}) {
  // get nonce from CSP
  let csp = context.config.contentSecurityPolicy;
  let nonce : string | undefined = undefined;
  if (csp) {
    if ((csp.indexOf("__NONCE__") || -1) >= 0 && context.config?.crypto?.getRandomValues) {
      // Generate nonce
      nonce = btoa(context.config.crypto.getRandomValues(new Uint32Array(2)));
      csp = csp?.replace(/__NONCE__/g, nonce);
    } else if (context.config?.nonce) {
      // Use passed-in nonce
      nonce = context.config.nonce;
    }
    context.helpers?.setResponseHeader?.(res, "Content-Security-Policy", csp);
  }
  // todo: support reading csp from meta tag?

  // todo: determine if we should allow streaming

  const uuidCookieName = context.config.uuidCookieName || "gbuuid";
  const uuidKey = context.config.attributeKeys.uuid || "id";
  const uuid = attributes[uuidKey];
  const attributeKeys = context.config.attributeKeys;
  const trackingCallback = context.config.growthbook.trackingCallback;
  const blockedExperimentHashes = getBlockedExperiments({
    context,
    experiments,
    trackedExperimentHashes,
    preRedirectTrackedExperimentHashes,
  });
  const injectRedirectUrlScript = context.config.injectRedirectUrlScript;

  const gbContext: Omit<GbContext, "trackingCallback"> & {
    uuidCookieName?: string;
    uuidKey?: string;
    uuid?: string;
    attributeKeys?: Record<string, string>;
    persistUuidOnLoad?: boolean;
    trackingCallback: string;
  } = {
    uuidCookieName,
    uuidKey,
    uuid,
    persistUuidOnLoad: true,
    attributes,
    attributeKeys,
    trackingCallback: "__TRACKING_CALLBACK__",
    payload: sdkPayload,
    loadStoredPayload: !!sdkPayload,
    disableVisualExperiments: ["skip", "edge"].includes(
      context.config.runVisualEditorExperiments,
    ),
    disableJsInjection: context.config.disableJsInjection,
    disableUrlRedirectExperiments: ["skip", "edge"].includes(
      context.config.runUrlRedirectExperiments,
    ),
    disableCrossOriginUrlRedirectExperiments: ["skip", "edge"].includes(
      context.config.runCrossOriginUrlRedirectExperiments,
    ),
    jsInjectionNonce: nonce,
    blockedExperimentHashes,
  };

  let scriptTag = `
<script
  data-api-host="${context.config.growthbook.apiHost}"
  data-client-key="${context.config.growthbook.clientKey}"${
    context.config.growthbook.decryptionKey
      ? `\n  data-decryption-key="${context.config.growthbook.decryptionKey}"`
      : ""
  }${
    nonce
    ? `\n  nonce="${nonce}"`
    : ""
  }
>
  window.growthbook_config = ${JSON.stringify(gbContext)};
${
  deferredTrackingCalls?.length
    ? `
  window.growthbook_queue = [
    (gb) => {
      gb.setDeferredTrackingCalls(${JSON.stringify(deferredTrackingCalls)});
      gb.fireDeferredTrackingCalls();
    }
  ];
`
    : ""
}
  ${sdkWrapper}
  ${
    url !== oldUrl && injectRedirectUrlScript
      ? `window.history.replaceState(undefined, undefined, ${JSON.stringify(
          url,
        )})`
      : ""
  }
</script>
`;
  scriptTag = scriptTag.replace(
    `"__TRACKING_CALLBACK__"`,
    trackingCallback || "undefined",
  );

  const pattern = context.config.scriptInjectionPattern || "</body>";

  const index = body.indexOf(pattern);
  if (index >= 0) {
    body = body.slice(0, index) + scriptTag + body.slice(index);
  } else {
    body += scriptTag;
  }

  return body;
}

function getBlockedExperiments({
  context,
  experiments,
  trackedExperimentHashes,
  preRedirectTrackedExperimentHashes,
}: {
  context: Context;
  experiments: AutoExperiment[];
  trackedExperimentHashes: string[];
  preRedirectTrackedExperimentHashes: string[];
}): string[] | undefined {
  const runUrlRedirectExperimentsEverywhere =
    context.config.runUrlRedirectExperiments === "everywhere";
  const runVisualEditorExperimentsEverywhere =
    context.config.runVisualEditorExperiments === "everywhere";

  const blockedExperimentHashes: string[] = [];

  if (runUrlRedirectExperimentsEverywhere) {
    blockedExperimentHashes.concat(
      ...trackedExperimentHashes.filter((hash) => {
        // only block hybrid redirect experiments if they've already been run on edge
        const exp = experiments.find(
          (exp) => exp.changeType === "redirect" && exp.expHash === hash,
        );
        return !!(
          exp?.expHash && trackedExperimentHashes.includes(exp.expHash)
        );
      }),
    );
  }

  if (runVisualEditorExperimentsEverywhere) {
    blockedExperimentHashes.concat(
      ...preRedirectTrackedExperimentHashes.filter((hash) => {
        // only block hybrid visual experiments if they've already been run on edge as part of the pre-redirect loop
        const exp = experiments.find(
          (exp) => exp.changeType === "visual" && exp.expHash === hash,
        );
        return !!(
          exp?.expHash && trackedExperimentHashes.includes(exp.expHash)
        );
      }),
    );
  }

  return blockedExperimentHashes.length ? blockedExperimentHashes : undefined;
}
