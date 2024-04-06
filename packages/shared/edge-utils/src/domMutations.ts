import { AutoExperimentVariation, DOMMutation } from "@growthbook/growthbook";
import { Context } from "./types";
import { parse } from "node-html-parser";

export async function applyDomMutations({
  context,
  body,
  domChanges
}: {
  context: Context;
  body: string;
  domChanges: AutoExperimentVariation[];
}) {
  const root = parse(body);
  const headEl = root.querySelector('head');
  const bodyEl = root.querySelector('body');

  domChanges.forEach(({ domMutations, js, css }) => {
    if (js) {
      const el = bodyEl || root;
      el.appendChild(parse(`<script>${js}</script>`));
    }

    if (css) {
      const el = headEl || root;
      el.appendChild(parse(`<style>${css}</style>`));
    }

    domMutations?.forEach((mutation) => {
/*      export type DOMMutation = {
        selector: string;
        action: string;  //'append' | 'set' | 'remove'
        attribute: string;
        value?: string;
        parentSelector?: string;
        insertBeforeSelector?: string;
      };
*/

      const { attribute: attr, action, selector, value, parentSelector, insertBeforeSelector } = mutation;

      if (attr === 'html') {
        if (action === 'append') {
          return html(selector, val => val + (value ?? ''));
        } else if (action === 'set') {
          return html(selector, () => value ?? '');
        }
      } else if (attr === 'class') {
        if (action === 'append') {
          return classes(selector, val => {
            if (value) val.add(value);
          });
        } else if (action === 'remove') {
          return classes(selector, val => {
            if (value) val.delete(value);
          });
        } else if (action === 'set') {
          return classes(selector, val => {
            val.clear();
            if (value) val.add(value);
          });
        }
      } else if (attr === 'position') {
        if (action === 'set' && parentSelector) {
          return position(selector, () => ({
            insertBeforeSelector,
            parentSelector,
          }));
        }
      } else {
        if (action === 'append') {
          return attribute(selector, attr, val =>
            val !== null ? val + (value ?? '') : value ?? ''
          );
        } else if (action === 'set') {
          return attribute(selector, attr, () => value ?? '');
        } else if (action === 'remove') {
          return attribute(selector, attr, () => null);
        }
      }
    });
  });

  // convert to string
  body = root.toString();

  return body;


  function html(selector: string, cb: (val: string) => string) {
    const el = root.querySelector(selector);
    if (el) el.innerHTML = cb(el.innerHTML);
  }

  function classes(selector: string, cb: (val: Set<string>) => void) {
    const el = root.querySelector(selector);
    if (el) {
      const classList = new Set(el.classNames);
      cb(classList);
      el.setAttribute('class', Array.from(classList).join(' '));
    }
  }

  function attribute(selector: string, attr: string, cb: (val: string | null) => string | null) {
    const validAttributeName = /^[a-zA-Z:_][a-zA-Z0-9:_.-]*$/;
    if (!validAttributeName.test(attr)) {
      return;
    }
    if (attr === 'class' || attr === 'className') {
      return classes(selector, classnames => {
        const mutatedClassnames = cb(Array.from(classnames).join(' '));
        classnames.clear();
        if (!mutatedClassnames) return;
        mutatedClassnames
          .split(/\s+/g)
          .filter(Boolean)
          .forEach(c => classnames.add(c));
      });
    }
    // todo: not sure if correct
    const el = root.querySelector(selector);
    if (el) {
      const val = cb(el.getAttribute(attr) || "");
      if (val === null) {
        el.removeAttribute(attr);
      } else {
        el.setAttribute(attr, val);
      }
    }
  }

  function position(selector: string, cb: () => { insertBeforeSelector?: string; parentSelector: string }) {
    const el = root.querySelector(selector);
    if (el) {
      const { insertBeforeSelector, parentSelector } = cb();
      const parent = root.querySelector(parentSelector);
      const insertBefore = insertBeforeSelector ? parent?.querySelector(insertBeforeSelector) : null;
      if (parent && insertBefore) {
        insertBefore.insertAdjacentHTML("beforebegin", el.toString());
        el.remove();
      } else if (parent) {
        parent.appendChild(el);
      }
    }
  }

}
