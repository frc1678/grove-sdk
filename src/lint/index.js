// The Grove fleet's lint rules. An app turns them on in .oxlintrc.json:
//   "jsPlugins": ["@frc1678/grove-sdk/lint"],
//   "rules": { "grove/labelled-control": "error" }
//
// grove/labelled-control: every button and link has a name a screen reader
// can say. An icon on its own is not a name, so an icon-only control needs
// `aria-label` (or visually hidden text inside it).
//
// grove/hover-only-hint: a `title` tooltip shows on hover, and a phone never
// hovers. Text that explains something has to be on the page (or behind a
// tap). A `title` that names an icon-only control is that control's name,
// not a hint, and is left alone; so is one on truncated text, which only
// repeats what is already there.
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

function staticClassName(node) {
  for (const attr of attributes(node)) {
    if (attr.type !== "JSXAttribute" || attr.name.name !== "className") continue;
    if (attr.value?.type === "Literal") return String(attr.value.value);
    // cn("truncate", …) and template strings: read the literal parts.
    const parts = [];
    const visit = (n) => {
      if (!n) return;
      if (n.type === "Literal" && typeof n.value === "string") parts.push(n.value);
      else if (n.type === "TemplateLiteral") n.quasis.forEach((q) => parts.push(q.value.raw));
      else if (n.type === "CallExpression") n.arguments.forEach(visit);
      else if (n.type === "JSXExpressionContainer") visit(n.expression);
    };
    visit(attr.value);
    return parts.join(" ");
  }
  return "";
}

// "Close", {label}: an attribute's value as written, to compare two of them.
function valueSource(attr, sourceCode) {
  if (!attr.value) return "";
  if (attr.value.type === "Literal") return String(attr.value.value).trim();
  if (attr.value.type === "JSXExpressionContainer") return sourceCode.getText(attr.value.expression).trim();
  return sourceCode.getText(attr.value).trim();
}

// Everything that names a control, as written: aria-label, and each piece of
// text or expression inside it.
function namesInside(node, sourceCode) {
  const said = new Set();
  for (const attr of attributes(node)) {
    if (attr.type === "JSXAttribute" && attr.name.name === "aria-label") said.add(valueSource(attr, sourceCode));
  }
  const visit = (children) => {
    for (const child of children) {
      if (child.type === "JSXText") {
        if (child.value.trim() !== "") said.add(child.value.trim());
      } else if (child.type === "JSXExpressionContainer") {
        if (child.expression.type !== "JSXEmptyExpression") said.add(sourceCode.getText(child.expression).trim());
      } else if (child.type === "JSXElement" || child.type === "JSXFragment") {
        visit(child.children);
      }
    }
  };
  visit(node.children);
  return said;
}

// Elements whose `title` is not a tooltip over text.
const TITLE_IS_NOT_A_HINT = new Set(["iframe", "svg", "title", "abbr", "link", "style", "input", "textarea", "select"]);

const hoverOnlyHint = {
  meta: {
    type: "suggestion",
    docs: { description: "An explanation must not live only in a title tooltip." },
    messages: {
      hoverOnly:
        "This title only shows on hover, and a phone never hovers. Put the explanation in visible text, or behind something a person can tap.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        const titleAttr = attributes(node).find(
          (attr) => attr.type === "JSXAttribute" && attr.name.name === "title",
        );
        if (!titleAttr) return;
        const name = nameOf(node);
        const host = /^[a-z]/.test(name);
        const control = isControlName(name);
        // <Card title="…">, <PageTitle title="…">: a prop, not a tooltip.
        if (!host && !control) return;
        if (TITLE_IS_NOT_A_HINT.has(name)) return;
        if (/\b(truncate|line-clamp-\S+)\b/.test(staticClassName(node))) return;
        if (control) {
          // A title that only repeats the control's name is its name, not a
          // hint: an icon-only button, or title={label} beside the label.
          const said = namesInside(node, context.sourceCode);
          if (said.size === 0 || said.has(valueSource(titleAttr, context.sourceCode))) return;
        }
        context.report({ node: titleAttr, messageId: "hoverOnly" });
      },
    };
  },
};

export default {
  meta: { name: "grove" },
  rules: { "labelled-control": labelledControl, "hover-only-hint": hoverOnlyHint },
};
