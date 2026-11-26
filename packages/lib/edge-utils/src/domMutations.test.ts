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

  it("keeps the element's other attributes intact", async () => {
    const el = await mutate(
      `<button id="el" class="q" onclick="go(&quot;a\\&quot;);x()//&quot;)" pattern="\\d+" title='say "hi"' disabled>x</button>`,
      [{ selector: "#el", action: "append", attribute: "class", value: "exp" }],
    );
    expect(el.getAttribute("onclick")).toBe(`go("a\\");x()//")`);
    expect(el.getAttribute("pattern")).toBe("\\d+");
    expect(el.getAttribute("title")).toBe(`say "hi"`);
    expect(el.hasAttribute("disabled")).toBe(true);
    expect(el.getAttribute("class")).toBe("q exp");
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

  it("leaves attributes node-html-parser can't parse untouched", async () => {
    let html = `<div class="q" _ngcontent-ng-c1="" *ngIf="show" data-ñ='1' Title=x>t</div>`;
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
            { selector: ".q", action: "set", attribute: "title", value: "y" },
            {
              selector: ".q",
              action: "set",
              attribute: "data-new",
              value: "&",
            },
          ],
        },
      ],
    });
    expect(html).toBe(
      `<div class="q a" _ngcontent-ng-c1="" *ngIf="show" data-ñ='1' Title="y" data-new="&amp;">t</div>`,
    );
  });
});
