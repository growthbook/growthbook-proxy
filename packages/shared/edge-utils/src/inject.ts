import { Attributes, StoredPayload, TrackingData } from "@growthbook/growthbook";
import { sdkWrapper } from "./generated/sdkWrapper";
import { Context } from "./types";

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
  const trackingCallback = context.config.growthbook.trackingCallback;

  const scriptTag = `
<script
  data-api-host="${context.config.growthbook.apiHost}"
  data-client-key="${context.config.growthbook.clientKey}"${
    context.config.growthbook.decryptionKey ? `\n  data-decryption-key="${context.config.growthbook.decryptionKey}"` : "" }
>
  window.growthbook_config = {
    uuidCookieName: ${JSON.stringify(uuidCookieName)},
    uuidKey: ${JSON.stringify(uuidKey)},
    uuid: ${JSON.stringify(uuid)},
    persistUuidOnLoad: true, // todo: wire
    attributes: ${JSON.stringify(attributes)},
    attributeKeys: ${JSON.stringify(context.config.attributeKeys)},${
    trackingCallback ? `\n    trackingCallback: ${trackingCallback},` : ""}${
    sdkPayload ? `\n    payload: ${JSON.stringify(sdkPayload)},` : ""}${
    sdkPayload ? `\n    loadStoredPayload: true,` : ""}
  };
${ deferredTrackingCalls?.length ? `
  window.growthbook_queue = [
    (gb) => {
      gb.setDeferredTrackingCalls(${JSON.stringify(deferredTrackingCalls)});
      gb.fireDeferredTrackingCalls();
    }
  ];
` : "" }
  ${sdkWrapper}
</script>
`;
  const pattern = context.config.scriptInjectionPattern || "</body>";
  body = body.replace(pattern, scriptTag + pattern);

  return body;
}
