import { Extension, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/* =========================================================
   SAUT DE PAGE
========================================================= */

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },

  renderHTML() {
    return [
      "div",
      {
        "data-type": "page-break",
        class: "document-page-break",
        contenteditable: "false",
      },
    ];
  },
});

/* =========================================================
   INTERLIGNE (au niveau du paragraphe, comme dans Word)
========================================================= */

export const LineSpacing = Extension.create({
  name: "lineSpacing",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineSpacing: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) =>
              attributes.lineSpacing
                ? { style: `line-height: ${attributes.lineSpacing}` }
                : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineSpacing:
        (value) =>
        ({ commands }) => {
          commands.updateAttributes("paragraph", { lineSpacing: value });
          commands.updateAttributes("heading", { lineSpacing: value });
          return true;
        },

      unsetLineSpacing:
        () =>
        ({ commands }) => {
          commands.updateAttributes("paragraph", { lineSpacing: null });
          commands.updateAttributes("heading", { lineSpacing: null });
          return true;
        },
    };
  },
});

/* =========================================================
   RECHERCHER / REMPLACER
   (recherche dans chaque bloc de texte de même mise en forme)
========================================================= */

export const searchKey = new PluginKey("collabSearch");

function findMatches(doc, term, caseSensitive) {
  const results = [];

  if (!term) {
    return results;
  }

  const needle = caseSensitive ? term : term.toLowerCase();

  doc.descendants((node, pos) => {
    if (!node.isText) {
      return;
    }

    const text = caseSensitive ? node.text : node.text.toLowerCase();

    let index = text.indexOf(needle);

    while (index !== -1) {
      results.push({
        from: pos + index,
        to: pos + index + needle.length,
      });

      index = text.indexOf(needle, index + needle.length);
    }
  });

  return results;
}

export const SearchReplace = Extension.create({
  name: "searchReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,

        state: {
          init: () => ({
            term: "",
            caseSensitive: false,
            current: 0,
            results: [],
          }),

          apply(tr, old) {
            const meta = tr.getMeta(searchKey);

            let next = old;

            if (meta) {
              next = { ...old, ...meta };
            }

            const paramsChanged =
              meta &&
              (meta.term !== undefined || meta.caseSensitive !== undefined);

            if (paramsChanged || tr.docChanged) {
              const results = findMatches(
                tr.doc,
                next.term,
                next.caseSensitive
              );

              next = {
                ...next,
                results,
                current: paramsChanged
                  ? 0
                  : results.length
                  ? Math.min(next.current, results.length - 1)
                  : 0,
              };
            }

            return next;
          },
        },

        props: {
          decorations(state) {
            const data = searchKey.getState(state);

            if (!data || data.results.length === 0) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(
              state.doc,
              data.results.map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class:
                    index === data.current
                      ? "search-match current"
                      : "search-match",
                })
              )
            );
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      setSearchTerm:
        (term, caseSensitive = false) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(searchKey, { term, caseSensitive });
          }

          return true;
        },

      searchStep:
        (direction) =>
        ({ tr, dispatch }) => {
          const data = searchKey.getState(this.editor.state);

          if (!data || data.results.length === 0) {
            return false;
          }

          const count = data.results.length;

          if (dispatch) {
            tr.setMeta(searchKey, {
              current: (data.current + direction + count) % count,
            });
          }

          return true;
        },

      replaceCurrent:
        (text) =>
        ({ tr, dispatch }) => {
          const data = searchKey.getState(this.editor.state);
          const match = data?.results[data.current];

          if (!match) {
            return false;
          }

          if (dispatch) {
            tr.insertText(text, match.from, match.to);
          }

          return true;
        },

      replaceAllMatches:
        (text) =>
        ({ tr, dispatch }) => {
          const data = searchKey.getState(this.editor.state);

          if (!data || data.results.length === 0) {
            return false;
          }

          if (dispatch) {
            [...data.results].reverse().forEach((match) => {
              tr.insertText(text, match.from, match.to);
            });
          }

          return true;
        },
    };
  },
});