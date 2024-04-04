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
  // todo: write edge-computed attributes on top of auto-attributes

  const scriptTag = `
<script
  data-api-host="${context.config.growthbook.apiHost}"
  data-client-key="${context.config.growthbook.clientKey}"
  data-uuid="${attributes.uuid}"
>
  window.growthbook_queue = [
    (gb) => {
      gb.setAttributes(${JSON.stringify(attributes)});
      ${deferredTrackingCalls ? `
        gb.setDeferredTrackingCalls(${JSON.stringify(deferredTrackingCalls)});
        gb.fireDeferredTrackingCalls();
      ` : ""}
    }
  ];  
  
  ${sdkWrapper}
</script>
`;
  const pattern = context.config.scriptInjectionPattern || "</body>";
  body = body.replace(pattern, scriptTag + pattern);

  return body;
}
