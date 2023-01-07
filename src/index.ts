import * as shiki from "shiki";
import { Node } from "unist";
import visit from "unist-util-visit";
import hastToString from "hast-util-to-string";
import u from "unist-builder";
import clone from "fast-copy";

interface NodeWithChildren extends Node {
  children?: Node[];
  value?: string;
}

function tokensToHast(lines: shiki.IThemedToken[][]) {
  let tree = [];

  for (const line of lines) {
    if (line.length === 0) {
      tree.push(u("text", "\n"));
    } else {
      for (const token of line) {
        tree.push(
          u(
            "element",
            {
              tagName: "span",
              properties: {
                style: `color: ${token.color};`,
              },
            },
            [u("text", token.content)]
          )
        );
      }

      tree.push(u("text", "\n"));
    }
  }

  // Remove the last \n
  tree.pop();

  return tree;
}

function addStyle(node: Node, style: string) {
  const props = (node.properties || {}) as Record<string, string>;
  props.style = props.style ? props.style + ";" + style : style;
  node.properties = props;
}

function addClass(node: Node, className: string) {
  const props = (node.properties || {}) as Record<string, string[]>;
  props.className = props.className
    ? [...props.className, className]
    : [className];
  node.properties = props;
}

function codeLanguage(node: Node) {
  const props = (node.properties || {}) as Record<string, string[]>;
  const className = props.className || [];

  let value: string;

  for (const element of className) {
    value = element;

    if (value.slice(0, 9) === "language-") {
      return value.slice(9);
    }
  }

  return null;
}

type Theme = string | shiki.IShikiTheme;

interface PluginOptions {
  theme?: Theme;
  darkTheme?: Theme;
  useBackground?: boolean;
  langs?: shiki.ILanguageRegistration[];
}

function highlightBlock(
  highlighter: shiki.Highlighter,
  node: Node,
  options: {
    useBackground?: boolean;
  }
) {
  if (options.useBackground) {
    addStyle(node, "background: " + highlighter.getBackgroundColor());
  }

  const lang = codeLanguage(node);

  if (!lang) {
    // Unknown language, fall back to a foreground colour
    addStyle(node, "color: " + highlighter.getForegroundColor());
    return;
  }

  const tokens = highlighter.codeToThemedTokens(hastToString(node), lang);
  const tree = tokensToHast(tokens);

  node.children = tree;
}

async function getTheme(theme: Theme) {
  return typeof theme === "string"
    ? shiki.BUNDLED_THEMES.includes(theme as shiki.Theme)
      ? theme
      : shiki.loadTheme(theme)
    : theme;
}

async function getHighlighter(
  theme: Theme,
  langs: shiki.ILanguageRegistration[] = []
) {
  const loadedTheme = await getTheme(theme);

  return shiki.getHighlighter({
    theme: loadedTheme,
    langs: [...shiki.BUNDLED_LANGUAGES, ...langs],
  });
}

let lightHighlighterPromise: Promise<shiki.Highlighter>;
let darkHighlighterPromise: Promise<shiki.Highlighter>;

export default function attacher(options: PluginOptions = {}) {
  const {
    theme = "github-light",
    darkTheme,
    useBackground = true,
    langs = [],
  } = options;

  lightHighlighterPromise ||= getHighlighter(theme, langs);

  if (darkTheme) {
    darkHighlighterPromise ||= getHighlighter(darkTheme, langs);
  }

  return async function transformer(tree: NodeWithChildren) {
    const lightHighlighter = await lightHighlighterPromise;
    const darkHighlighter = await darkHighlighterPromise;

    visit(tree, "element", (node, index, parent) => {
      if (
        !parent ||
        parent.tagName !== "pre" ||
        node.tagName !== "code" ||
        node.dark
      ) {
        return;
      }

      highlightBlock(lightHighlighter, node, { useBackground });
      addClass(node, "syntax-light");

      const darkNode = clone(node);
      darkNode.dark = true;
      addClass(darkNode, "syntax-dark");

      highlightBlock(darkHighlighter, darkNode, { useBackground });
      parent.children.splice(index + 1, 0, darkNode);
    });
  };
}
