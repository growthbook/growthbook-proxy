import { Attributes, TrackingData } from "@growthbook/growthbook";
import { sdkWrapper } from "./generated/sdkWrapper";
import { Context } from "./types";

export function injectScript({
  context,
  body,
  attributes,
  deferredTrackingCalls,
}: {
  context: Context;
  body: string;
  attributes: Attributes;
  deferredTrackingCalls?: TrackingData[];
}) {
  const uuidKey = context.config.attributeKeys.uuid || "id";
  const uuid = attributes[uuidKey];
  const trackingCallback = context.config.growthbook.trackingCallback;

  const scriptTag = `
<script
  data-api-host="${context.config.growthbook.apiHost}"
  data-client-key="${context.config.growthbook.clientKey}"
>
  window.growthbook_config = {
    uuidKey: ${JSON.stringify(uuidKey)},
    uuid: ${JSON.stringify(uuid)},
    persistUuidOnLoad: true, // todo: wire
    attributes: ${JSON.stringify(attributes)},
    attributeKeys: ${JSON.stringify(context.config.attributeKeys)},
${ trackingCallback ? `
    trackingCallback: ${trackingCallback}
`: "" }
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
