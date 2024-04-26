import {
  Context as GbContext,
  Attributes,
  TrackingData,
  AutoExperiment,
  GrowthBook,
  StickyBucketService,
} from "@growthbook/growthbook";
import { sdkWrapper } from "./generated/sdkWrapper";
import { Context } from "./types";
import { EdgeStickyBucketService } from "./stickyBucketService";

export function injectScript({
  context,
  body,
  nonce,
  growthbook,
  stickyBucketService,
  attributes,
  preRedirectTrackedExperimentIds,
  url,
  oldUrl,
}: {
  context: Context;
  body: string;
  nonce?: string;
  growthbook: GrowthBook;
  stickyBucketService?: EdgeStickyBucketService | StickyBucketService;
  attributes: Attributes;
  preRedirectTrackedExperimentIds: string[];
  url: string;
  oldUrl: string;
}) {
  if (context.config.disableInjections) return body;

  const sdkPayload = growthbook.getPayload();
  const experiments = growthbook.getExperiments();
  const deferredTrackingCalls = growthbook.getDeferredTrackingCalls();
  const ranExperimentIds = growthbook.getRanExperimentIds();

  const uuidCookieName = context.config.uuidCookieName || "gbuuid";
  const uuidKey = context.config.attributeKeys.uuid || "id";
  const uuid = attributes[uuidKey];
  const attributeKeys = context.config.attributeKeys;
  const trackingCallback = context.config.growthbook.trackingCallback;
  const blockedExperimentIds = getBlockedExperiments({
    context,
    experiments,
    ranExperimentIds,
    preRedirectTrackedExperimentIds,
  });
  const injectRedirectUrlScript = context.config.injectRedirectUrlScript;
  const enableStreaming = context.config.enableStreaming;
  const enableStickyBucketing = context.config.enableStickyBucketing;
  const stickyAssignments = enableStickyBucketing
    ? stickyBucketService instanceof EdgeStickyBucketService
      ? stickyBucketService?.exportAssignmentDocs()
      : undefined
    : undefined;

  const gbContext: Omit<GbContext, "trackingCallback"> & {
    uuidCookieName?: string;
    uuidKey?: string;
    uuid?: string;
    attributeKeys?: Record<string, string>;
    persistUuidOnLoad?: boolean;
    useStickyBucketService?: "cookie" | "localStorage";
    trackingCallback: string; // replaced by macro
  } = {
    uuidCookieName,
    uuidKey,
    uuid,
    persistUuidOnLoad: true,
    attributes,
    attributeKeys,
    trackingCallback: "__TRACKING_CALLBACK__",
    payload: sdkPayload,
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
    blockedExperimentIds,
    backgroundSync: enableStreaming,
    useStickyBucketService: enableStickyBucketing ? "cookie" : undefined,
    stickyBucketAssignmentDocs: stickyAssignments,
  };

  let scriptTag = `
<script
  data-api-host="${context.config.growthbook.apiHost}"
  data-client-key="${context.config.growthbook.clientKey}"${
    context.config.growthbook.decryptionKey
      ? `\n  data-decryption-key="${context.config.growthbook.decryptionKey}"`
      : ""
  }${nonce ? `\n  nonce="${nonce}"` : ""}
>
  window.growthbook_config = ${JSON.stringify(gbContext)};
${
  deferredTrackingCalls?.length
    ? `
  window.growthbook_queue = [
    (gb) => {
      gb.setDeferredTrackingCalls(${JSON.stringify(
        scrubInvalidTrackingCalls(
          deferredTrackingCalls,
          preRedirectTrackedExperimentIds,
        ),
      )});
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

export function getCspInfo(context: Context): {
  csp?: string;
  nonce?: string;
} {
  // get nonce from CSP
  let csp = context.config.contentSecurityPolicy;
  let nonce: string | undefined = undefined;
  if (csp) {
    if (
      (csp.indexOf("__NONCE__") || -1) >= 0 &&
      context.config?.crypto?.getRandomValues
    ) {
      // Generate nonce
      nonce = btoa(context.config.crypto.getRandomValues(new Uint32Array(2)));
      csp = csp?.replace(/__NONCE__/g, nonce);
    } else if (context.config?.nonce) {
      // Use passed-in nonce
      nonce = context.config.nonce;
    }
  }
  // todo: support reading csp from meta tag?

  return { csp, nonce };
}

function getBlockedExperiments({
  context,
  experiments,
  ranExperimentIds,
  preRedirectTrackedExperimentIds,
}: {
  context: Context;
  experiments: AutoExperiment[];
  ranExperimentIds: string[];
  preRedirectTrackedExperimentIds: string[];
}): string[] | undefined {
  const runUrlRedirectExperimentsEverywhere =
    context.config.runUrlRedirectExperiments === "everywhere";
  const runVisualEditorExperimentsEverywhere =
    context.config.runVisualEditorExperiments === "everywhere";

  const blockedExperimentIds: string[] = [];

  if (runUrlRedirectExperimentsEverywhere) {
    blockedExperimentIds.concat(
      ...ranExperimentIds.filter((uid) => {
        // only block hybrid redirect experiments if they've already been run on edge
        const exp = experiments.find(
          (exp) => exp.changeType === "redirect" && exp.uid === uid,
        );
        return !!(exp?.uid && ranExperimentIds.includes(exp.uid));
      }),
    );
  }

  if (runVisualEditorExperimentsEverywhere) {
    blockedExperimentIds.concat(
      ...preRedirectTrackedExperimentIds.filter((uid) => {
        // only block hybrid visual experiments if they've already been run on edge as part of the pre-redirect loop
        const exp = experiments.find(
          (exp) => exp.changeType === "visual" && exp.uid === uid,
        );
        return !!(exp?.uid && ranExperimentIds.includes(exp.uid));
      }),
    );
  }

  return blockedExperimentIds.length ? blockedExperimentIds : undefined;
}

function scrubInvalidTrackingCalls(
  deferredTrackingCalls: TrackingData[],
  preRedirectTrackedExperimentIds: string[],
): TrackingData[] {
  return deferredTrackingCalls.filter((data) => {
    const exp = data.experiment as AutoExperiment;
    // remove tracking for any visual experiments that ran during the redirect loop
    if (
      exp.changeType === "visual" &&
      exp?.uid &&
      preRedirectTrackedExperimentIds.includes(exp.uid)
    ) {
      return false;
    }
    return true;
  });
}
