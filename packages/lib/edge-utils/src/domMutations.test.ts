import { DOMMutation } from "@growthbook/growthbook";
import { parse } from "node-html-parser";
import { applyDomMutations } from "./domMutations";

// Applies the mutations, then reads #el back the way a browser would.
async function mutate(el: string, domMutations: DOMMutation[]) {
  let html = `<html><body>${el}</body></html>`;
  await applyDomMutations({
    body: html,
    setBody: (s) => (html = s),
    domChanges: [{ domMutations }],
  });
  const result = parse(html).querySelector("#el");
  if (!result) throw new Error("missing #el");
  return result;
}

describe("applyDomMutations", () => {
  it("doesn't decode existing attribute values twice", async () => {
    const el = await mutate(
      `<a id="el" href="javascript&amp;colon;alert(1)">x</a>`,
      [{ selector: "#el", action: "append", attribute: "href", value: "?a&b" }],
    );
    expect(el.getAttribute("href")).toBe("javascript&colon;alert(1)?a&b");
  });

  it("writes attribute values literally", async () => {
    const value = `"><img src=x onerror=alert(1)> &amp; \\`;
    const el = await mutate(`<div id="el"></div>`, [
      { selector: "#el", action: "set", attribute: "title", value },
    ]);
    expect(el.getAttribute("title")).toBe(value);
    expect(el.childNodes).toHaveLength(0);
  });

  it("edits multi-letter class names", async () => {
    const el = await mutate(`<div id="el" class="hero big"></div>`, [
      { selector: "#el", action: "append", attribute: "class", value: "a" },
      { selector: "#el", action: "append", attribute: "class", value: "b" },
      { selector: "#el", action: "remove", attribute: "class", value: "big" },
    ]);
    expect(el.getAttribute("class")).toBe("hero a b");
  });

  it("removes attributes", async () => {
    const el = await mutate(`<div id="el" title="t" data-x="1"></div>`, [
      { selector: "#el", action: "remove", attribute: "title" },
    ]);
    expect(el.hasAttribute("title")).toBe(false);
    expect(el.getAttribute("data-x")).toBe("1");
  });

  it("rewrites only the changed attributes, leaving the rest as written", async () => {
    // includes values node-html-parser would drop backslashes from, and names it can't parse
    let html = `<button class="q" onclick="go(&quot;a\\&quot;);x()//&quot;)" pattern="\\d+" title='say "hi"' disabled _ngcontent-ng-c1="" *ngIf="show" data-ñ='1' Data-X=x>t</button>`;
    const set = (attribute: string, value: string) =>
      ({ selector: ".q", action: "set", attribute, value }) as DOMMutation;
    await applyDomMutations({
      body: html,
      setBody: (s) => (html = s),
      domChanges: [
        {
          domMutations: [
            {
              selector: ".q",
              action: "append",
              attribute: "class",
              value: "a",
            },
            set("data-x", "y"),
            set("data-new", "&"),
          ],
        },
      ],
    });
    expect(html).toBe(
      `<button class="q a" onclick="go(&quot;a\\&quot;);x()//&quot;)" pattern="\\d+" title='say "hi"' disabled _ngcontent-ng-c1="" *ngIf="show" data-ñ='1' Data-X="y" data-new="&amp;">t</button>`,
    );
  });
});
