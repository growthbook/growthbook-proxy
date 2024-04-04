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
    trackingCallback: (experiment, result) => {
      console.log("Deferred tracking callback", { experiment, result });
    }
  };
  window.growthbook_queue = [
    (gb) => {
      // // todo: merge attributes with auto-attributes
      // console.log("attributes before", gb.getAttributes());
      //
      // gb.setAttributes(${JSON.stringify(attributes)});
      ${deferredTrackingCalls ? `
        gb.setDeferredTrackingCalls(${JSON.stringify(deferredTrackingCalls)});
        gb.fireDeferredTrackingCalls();
      ` : ""}
      
      console.log("attributes after", gb.getAttributes());
    }
  ];  
  
  ${sdkWrapper}
</script>
`;
  const pattern = context.config.scriptInjectionPattern || "</body>";
  body = body.replace(pattern, scriptTag + pattern);

  return body;
}
