import { AutoExperimentVariation, DOMMutation } from "@growthbook/growthbook";
import { parse } from "node-html-parser";

export async function applyDomMutations({
  body,
  nonce,
  domChanges,
}: {
  body: string;
  nonce?: string;
  domChanges: AutoExperimentVariation[];
}) {
  if (!domChanges.length) return body;

  const root = parse(body);
  const headEl = root.querySelector("head");

  domChanges.forEach(({ domMutations, css, js }) => {
    if (css) {
      const parentEl = headEl || root;
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
            val !== null ? val + (value ?? "") : value ?? "",
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
  return body;

  function html(selector: string, cb: (val: string) => string) {
    const els = root.querySelectorAll(selector);
    els.map((el) => {
      el.innerHTML = cb(el.innerHTML);
    });
  }

  function classes(selector: string, cb: (val: Set<string>) => void) {
    const els = root.querySelectorAll(selector);
    els.map((el) => {
      const classList = new Set(el.classNames);
      cb(classList);
      el.setAttribute("class", Array.from(classList).join(" "));
    });
  }

  function attribute(
    selector: string,
    attr: string,
    cb: (val: string | null) => string | null,
  ) {
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
      const val = cb(el.getAttribute(attr) || "");
      if (val === null) {
        el.removeAttribute(attr);
      } else {
        el.setAttribute(attr, val);
      }
    });
  }

  function position(
    selector: string,
    cb: () => { insertBeforeSelector?: string; parentSelector: string },
  ) {
    const els = root.querySelectorAll(selector);
    els.map((el) => {
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
