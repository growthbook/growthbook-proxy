import { AutoExperimentVariation, DOMMutation } from "@growthbook/growthbook";
import { HTMLElement, parse } from "node-html-parser";

export async function applyDomMutations({
  body,
  setBody,
  root,
  nonce,
  domChanges,
}: {
  body: string;
  setBody: (s: string) => void;
  root?: HTMLElement;
  nonce?: string;
  domChanges: AutoExperimentVariation[];
}) {
  if (!domChanges.length) return;
  root = root ?? parse(body, { comment: true });
  if (!root) return;

  const headEl = root.querySelector("head");

  domChanges.forEach(({ domMutations, css, js }) => {
    if (css) {
      const parentEl = headEl || root;
      if (!parentEl) return;
      const el = parse(`<style>${css}</style>`);
      parentEl.appendChild(el);
    }
    if (js) {
      const parentEl = headEl || root;
      const el = parse(
        `<script>${js}</script>`,
      ) as unknown as HTMLScriptElement;
      if (nonce) {
        el.nonce = nonce;
      }
      // @ts-ignore
      parentEl.appendChild(el);
    }

    domMutations?.forEach((mutation: DOMMutation) => {
      const {
        attribute: attr,
        action,
        selector,
        value,
        parentSelector,
        insertBeforeSelector,
      } = mutation;

      if (attr === "html") {
        if (action === "append") {
          return html(selector, (val) => val + (value ?? ""));
        } else if (action === "set") {
          return html(selector, () => value ?? "");
        }
      } else if (attr === "class") {
        if (action === "append") {
          return classes(selector, (val) => {
            if (value) val.add(value);
          });
        } else if (action === "remove") {
          return classes(selector, (val) => {
            if (value) val.delete(value);
          });
        } else if (action === "set") {
          return classes(selector, (val) => {
            val.clear();
            if (value) val.add(value);
          });
        }
      } else if (attr === "position") {
        if (action === "set" && parentSelector) {
          return position(selector, () => ({
            insertBeforeSelector,
            parentSelector,
          }));
        }
      } else {
        if (action === "append") {
          return attribute(selector, attr, (val) =>
            val !== null ? val + (value ?? "") : (value ?? ""),
          );
        } else if (action === "set") {
          return attribute(selector, attr, () => value ?? "");
        } else if (action === "remove") {
          return attribute(selector, attr, () => null);
        }
      }
    });
  });

  body = root.toString();
  setBody(body);
  return;

  function html(selector: string, cb: (val: string) => string) {
    if (!root) return;
    const els = root.querySelectorAll(selector);
    els.map((el) => {
      el.innerHTML = cb(el.innerHTML);
    });
  }

  function classes(selector: string, cb: (val: Set<string>) => void) {
    if (!root) return;
    const els = root.querySelectorAll(selector);
    els.map((el) => {
      const classList = new Set(
        (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean),
      );
      cb(classList);
      setAttr(el, "class", Array.from(classList).join(" "));
    });
  }

  function attribute(
    selector: string,
    attr: string,
    cb: (val: string | null) => string | null,
  ) {
    if (!root) return;
    const validAttributeName = /^[a-zA-Z:_][a-zA-Z0-9:_.-]*$/;
    if (!validAttributeName.test(attr)) {
      return;
    }
    if (attr === "class" || attr === "className") {
      return classes(selector, (classnames) => {
        const mutatedClassnames = cb(Array.from(classnames).join(" "));
        classnames.clear();
        if (!mutatedClassnames) return;
        mutatedClassnames
          .split(/\s+/g)
          .filter(Boolean)
          .forEach((c) => classnames.add(c));
      });
    }
    const els = root.querySelectorAll(selector);
    els.map((el) => {
      setAttr(el, attr, cb(el.getAttribute(attr) || ""));
    });
  }

  function position(
    selector: string,
    cb: () => { insertBeforeSelector?: string; parentSelector: string },
  ) {
    if (!root) return;
    const els = root.querySelectorAll(selector);
    els.map((el) => {
      if (!root) return;
      const { insertBeforeSelector, parentSelector } = cb();
      const parent = root.querySelector(parentSelector);
      const insertBefore = insertBeforeSelector
        ? parent?.querySelector(insertBeforeSelector)
        : null;
      if (parent && insertBefore) {
        insertBefore.insertAdjacentHTML("beforebegin", el.toString());
        el.remove();
      } else if (parent) {
        parent.appendChild(el);
      }
    });
  }
}

// node-html-parser decodes on read but doesn't encode `&` on write, and rebuilding the
// tag strips backslashes and mangles names like `_ngcontent-x`, so only the changed
// attribute is rewritten in the raw tag; the rest stay as the origin wrote them.
function setAttr(el: HTMLElement, name: string, value: string | null) {
  const attrs: { name: string; text: string }[] = [];
  const re = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;
  for (let m = re.exec(el.rawAttrs); m; m = re.exec(el.rawAttrs)) {
    attrs.push({ name: m[1], text: m[0] });
  }
  const escaped = value?.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const i = attrs.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
  if (escaped === undefined) {
    if (i >= 0) attrs.splice(i, 1);
    el.removeAttribute(name);
  } else {
    const text = `${i >= 0 ? attrs[i].name : name}="${escaped}"`;
    if (i >= 0) attrs[i].text = text;
    else attrs.push({ name, text });
    el.setAttribute(name, escaped);
  }
  // set last: the calls above keep node-html-parser's lookups current but rewrite rawAttrs
  el.rawAttrs = attrs.map((a) => a.text).join(" ");
}
