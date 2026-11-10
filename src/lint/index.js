// The Grove fleet's lint rules. An app turns them on in .oxlintrc.json:
//   "jsPlugins": ["@frc1678/grove-sdk/lint"],
//   "rules": { "grove/labelled-control": "error" }
//
// grove/labelled-control: every button and link has a name a screen reader
// can say. An icon on its own is not a name, so an icon-only control needs
// `aria-label` (or visually hidden text inside it).
//
// The stock jsx-a11y rule does not fit this codebase. Base UI composes with
// `render={<Button />}`, where the text sits in the wrapping element, so the
// stock rule flags labelled controls; and it never looks inside our own
// `<Button>`, so it misses the unlabelled ones.

const NATIVE = new Set(["button", "a", "summary"]);
const LABEL_PROPS = new Set(["aria-label", "aria-labelledby", "title"]);

function nameOf(node) {
  const n = node.openingElement.name;
  if (n.type === "JSXIdentifier") return n.name;
  if (n.type === "JSXMemberExpression") return n.property.name;
  return "";
}

// <button>, <a>, our <Button>, and Base UI's parts that render a button.
function isControlName(name) {
  return NATIVE.has(name) || name === "Button" || /(Trigger|Close)$/.test(name);
}

function attributes(node) {
  return node.openingElement.attributes;
}

function renderedElement(node) {
  for (const attr of attributes(node)) {
    if (attr.type !== "JSXAttribute" || attr.name.name !== "render") continue;
    if (attr.value?.type !== "JSXExpressionContainer") continue;
    // render={wide ? <Link /> : <a />}: either branch is the same control.
    let value = attr.value.expression;
    while (value.type === "ConditionalExpression") value = value.consequent;
    if (value.type === "JSXElement") return value;
  }
  return null;
}

// Named by a prop, or possibly by props we cannot see ({...props}).
function namedByProps(node) {
  return attributes(node).some(
    (attr) =>
      attr.type === "JSXSpreadAttribute" ||
      (attr.type === "JSXAttribute" && LABEL_PROPS.has(String(attr.name.name))),
  );
}

function hiddenFromReaders(node) {
  return attributes(node).some(
    (attr) =>
      attr.type === "JSXAttribute" &&
      attr.name.name === "aria-hidden" &&
      (attr.value === null || attr.value.value === "true" || attr.value.expression?.value === true),
  );
}

// Does anything inside read as text? Literal text does; so does any
// expression ({label}, {children}), since it may hold text. A childless
// element (<X />, <img alt="" />) does not, unless it is an <img> with alt
// text or carries its own label.
function hasText(children) {
  for (const child of children) {
    if (child.type === "JSXText") {
      if (child.value.trim() !== "") return true;
    } else if (child.type === "JSXExpressionContainer") {
      const e = child.expression;
      if (e.type === "JSXEmptyExpression") continue;
      if (e.type === "JSXElement" || e.type === "JSXFragment") {
        if (elementHasText(e)) return true;
      } else if (e.type === "LogicalExpression" || e.type === "ConditionalExpression") {
        const sides = e.type === "LogicalExpression" ? [e.right] : [e.consequent, e.alternate];
        if (sides.some((s) => (s.type === "JSXElement" || s.type === "JSXFragment" ? elementHasText(s) : true))) {
          return true;
        }
      } else {
        return true;
      }
    } else if (child.type === "JSXElement" || child.type === "JSXFragment") {
      if (elementHasText(child)) return true;
    }
  }
  return false;
}

function elementHasText(node) {
  if (node.type === "JSXFragment") return hasText(node.children);
  if (hiddenFromReaders(node)) return false;
  const name = nameOf(node);
  if (name === "img") {
    return attributes(node).some(
      (attr) =>
        attr.type === "JSXAttribute" &&
        attr.name.name === "alt" &&
        !(attr.value?.type === "Literal" && attr.value.value === ""),
    );
  }
  if (attributes(node).some((a) => a.type === "JSXAttribute" && a.name.name === "aria-label")) return true;
  return hasText(node.children);
}

const labelledControl = {
  meta: {
    type: "problem",
    docs: { description: "Buttons and links need a name a screen reader can say." },
    messages: {
      unlabelled:
        "This {{name}} has no name: a screen reader says only “button”. Add aria-label (or visually hidden text) saying what it does.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        // The element inside render={...} is judged with its wrapper.
        let parent = node.parent;
        while (parent?.type === "ConditionalExpression") parent = parent.parent;
        if (
          parent?.type === "JSXExpressionContainer" &&
          parent.parent?.type === "JSXAttribute" &&
          parent.parent.name.name === "render"
        ) {
          return;
        }
        const rendered = renderedElement(node);
        const name = nameOf(node);
        if (!isControlName(name) && !(rendered && isControlName(nameOf(rendered)))) return;
        if (namedByProps(node) || (rendered && namedByProps(rendered))) return;
        // <Toolbar.Close /> or a local <Button /> with nothing inside draws
        // its own content, which this file cannot see.
        if (!rendered && !NATIVE.has(name) && node.children.length === 0) return;
        if (hasText(node.children) || (rendered && hasText(rendered.children))) return;
        context.report({ node: node.openingElement, messageId: "unlabelled", data: { name } });
      },
    };
  },
};

export default {
  meta: { name: "grove" },
  rules: { "labelled-control": labelledControl },
};
