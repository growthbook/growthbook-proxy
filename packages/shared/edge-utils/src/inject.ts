import {
  Context as GbContext,
  Attributes,
  StoredPayload,
  TrackingData,
} from "@growthbook/growthbook";
import { sdkWrapper } from "./generated/sdkWrapper";
import { Config, Context } from "./types";

export function injectScript({
  context,
  body,
  sdkPayload,
  attributes,
  deferredTrackingCalls,
}: {
  context: Context;
  body: string;
  sdkPayload?: StoredPayload;
  attributes: Attributes;
  deferredTrackingCalls?: TrackingData[];
}) {
  // todo: handle remote eval (skip payload injection, pass flag)
  const uuidCookieName = context.config.uuidCookieName || "gbuuid";
  const uuidKey = context.config.attributeKeys.uuid || "id";
  const uuid = attributes[uuidKey];
  const attributeKeys = context.config.attributeKeys;
  const trackingCallback = context.config.growthbook.trackingCallback;

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
    persistUuidOnLoad: true, // todo?: wire
    attributes,
    attributeKeys,
    trackingCallback: "__TRACKING_CALLBACK__",
    payload: sdkPayload,
    loadStoredPayload: !!sdkPayload,
    disableVisualExperiments: ["skip", "edge"].includes(context.config.runVisualEditorExperiments),
    disableJsInjection: context.config.disableJsInjection,
    disableUrlRedirectExperiments: ["skip", "edge"].includes(context.config.runUrlRedirectExperiments),
    disableCrossOriginUrlRedirectExperiments: ["skip", "edge"].includes(context.config.runCrossOriginUrlRedirectExperiments),
  };

  let scriptTag = `
<script
  data-api-host="${context.config.growthbook.apiHost}"
  data-client-key="${context.config.growthbook.clientKey}"${
    context.config.growthbook.decryptionKey
      ? `\n  data-decryption-key="${context.config.growthbook.decryptionKey}"`
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
</script>
`;
  scriptTag = scriptTag.replace(`"__TRACKING_CALLBACK__"`, trackingCallback || "undefined");

  const pattern = context.config.scriptInjectionPattern || "</body>";

  const index = body.indexOf(pattern);
  if (index >= 0) {
    body = body.slice(0, index) + scriptTag + body.slice(index+1);
  } else {
    body += scriptTag;
  }

  return body;
}
