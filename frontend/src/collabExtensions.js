import { Mark, Node, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";

/* =========================================================
   MARQUES DE SUGGESTION (ajout / suppression)
========================================================= */

function suggestMark(name, className) {
  return Mark.create({
    name,
    inclusive: false,

    addAttributes() {
      return {
        author: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-author") || "",
          renderHTML: (attrs) => ({ "data-author": attrs.author || "" }),
        },
        authorId: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-author-id"),
          renderHTML: (attrs) =>
            attrs.authorId != null
              ? { "data-author-id": String(attrs.authorId) }
              : {},
        },
        date: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-date"),
          renderHTML: (attrs) => (attrs.date ? { "data-date": attrs.date } : {}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `span[data-suggest="${name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "span",
        mergeAttributes(
          {
            class: className,
            "data-suggest": name,
            title: HTMLAttributes["data-author"] || "",
          },
          HTMLAttributes
        ),
        0,
      ];
    },
  });
}

export const SuggestInsert = suggestMark("suggestInsert", "sg-ins");
export const SuggestDelete = suggestMark("suggestDelete", "sg-del");

/* =========================================================
   MODE SUGGESTION
========================================================= */

function sameAuthor(mark, user) {
  return String(mark.attrs.authorId) === String(user.id);
}

// Marque le texte comme supprimé (ou le supprime vraiment si c'est
// une suggestion d'ajout du même auteur)
function trackDelete(tr, from, to, schema, user) {
  const insType = schema.marks.suggestInsert;
  const delType = schema.marks.suggestDelete;

  const toMark = [];
  const toRemove = [];

  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return;

    const start = Math.max(from, pos);
    const end = Math.min(to, pos + node.nodeSize);

    if (start >= end) return;
    if (delType.isInSet(node.marks)) return;

    const ins = insType.isInSet(node.marks);

    if (ins && sameAuthor(ins, user)) {
      toRemove.push([start, end]);
    } else {
      toMark.push([start, end]);
    }
  });

  const deleteMark = delType.create({
    author: user.name,
    authorId: user.id,
    date: new Date().toISOString(),
  });

  toMark.forEach(([start, end]) => tr.addMark(start, end, deleteMark));

  toRemove
    .sort((a, b) => b[0] - a[0])
    .forEach(([start, end]) => tr.delete(start, end));

  return tr;
}

function typeTracked(view, from, to, text) {
  const { state } = view;
  const { schema } = state;
  const user = view.__collabUser();
  const tr = state.tr;

  let pos = to;

  if (from !== to) {
    trackDelete(tr, from, to, schema, user);
    pos = tr.mapping.map(to);
  }

  const base = (state.storedMarks || tr.doc.resolve(pos).marks()).filter(
    (mark) =>
      mark.type.name !== "suggestInsert" && mark.type.name !== "suggestDelete"
  );

  const insertMark = schema.marks.suggestInsert.create({
    author: user.name,
    authorId: user.id,
    date: new Date().toISOString(),
  });

  tr.insert(pos, schema.text(text, [...base, insertMark]));
  tr.setSelection(TextSelection.create(tr.doc, pos + text.length));

  view.dispatch(tr.scrollIntoView());

  return true;
}

export const Suggestions = Extension.create({
  name: "suggestions",

  addOptions() {
    return { getUser: () => ({ id: null, name: "Utilisateur" }) };
  },

  addStorage() {
    return { enabled: false };
  },

  addCommands() {
    return {
      // items : [{ from, to, type: "insert" | "delete" }]
      resolveSuggestions:
        (items, accept) =>
        ({ tr, state }) => {
          const base = tr.steps.length;

          items.forEach((item) => {
            const mapping = tr.mapping.slice(base);
            const from = mapping.map(item.from);
            const to = mapping.map(item.to, -1);

            if (from >= to) return;

            const keepText = (item.type === "insert") === accept;

            if (keepText) {
              tr.removeMark(
                from,
                to,
                state.schema.marks[
                  item.type === "insert" ? "suggestInsert" : "suggestDelete"
                ]
              );
            } else {
              tr.delete(from, to);
            }
          });

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const ext = this;

    return [
      new Plugin({
        key: new PluginKey("collabSuggestions"),

        view(view) {
          view.__collabUser = () => ext.options.getUser();
          return {};
        },

        props: {
          handleTextInput(view, from, to, text) {
            if (!ext.storage.enabled || !view.editable) return false;

            return typeTracked(view, from, to, text);
          },

          handleKeyDown(view, event) {
            if (!ext.storage.enabled || !view.editable) return false;

            if (event.key !== "Backspace" && event.key !== "Delete") {
              return false;
            }

            // Suppression par mot : non gérée en mode suggestion
            if (event.ctrlKey || event.metaKey || event.altKey) {
              event.preventDefault();
              return true;
            }

            const { state } = view;
            const { selection } = state;

            let from;
            let to;

            if (!selection.empty) {
              from = selection.from;
              to = selection.to;
            } else {
              const $pos = selection.$from;

              if (event.key === "Backspace") {
                if ($pos.parentOffset === 0) return false;
                from = $pos.pos - 1;
                to = $pos.pos;
              } else {
                if ($pos.parentOffset >= $pos.parent.content.size) return false;
                from = $pos.pos;
                to = $pos.pos + 1;
              }

              if (!state.doc.textBetween(from, to).length) return false;
            }

            event.preventDefault();

            const tr = state.tr;
            trackDelete(tr, from, to, state.schema, view.__collabUser());

            const target =
              event.key === "Backspace"
                ? tr.mapping.map(from)
                : tr.mapping.map(to);

            tr.setSelection(TextSelection.create(tr.doc, target));
            view.dispatch(tr.scrollIntoView());

            return true;
          },

          handlePaste(view, event) {
            if (!ext.storage.enabled || !view.editable) return false;

            const text = event.clipboardData?.getData("text/plain");

            if (!text) return false;

            event.preventDefault();

            const { from, to } = view.state.selection;

            return typeTracked(
              view,
              from,
              to,
              text.replace(/\s*\r?\n\s*/g, " ")
            );
          },

          handleDrop() {
            return ext.storage.enabled;
          },

          handleDOMEvents: {
            cut(view, event) {
              if (!ext.storage.enabled || !view.editable) return false;

              const { from, to, empty } = view.state.selection;

              if (empty) return false;

              event.preventDefault();

              event.clipboardData?.setData(
                "text/plain",
                view.state.doc.textBetween(from, to, "\n")
              );

              const tr = view.state.tr;
              trackDelete(tr, from, to, view.state.schema, view.__collabUser());
              tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(to)));
              view.dispatch(tr);

              return true;
            },
          },
        },
      }),
    ];
  },
});

// Liste des suggestions en attente (fusionne les morceaux contigus)
export function collectSuggestions(doc) {
  const out = [];
  const lastByType = {};

  doc.descendants((node, pos) => {
    if (!node.isText) return;

    node.marks.forEach((mark) => {
      const type =
        mark.type.name === "suggestInsert"
          ? "insert"
          : mark.type.name === "suggestDelete"
          ? "delete"
          : null;

      if (!type) return;

      const from = pos;
      const to = pos + node.nodeSize;
      const authorId = String(mark.attrs.authorId);
      const last = lastByType[type];

      if (last && last.to === from && last.authorId === authorId) {
        last.to = to;
        last.text += node.text;
        return;
      }

      const item = {
        type,
        from,
        to,
        author: mark.attrs.author || "Utilisateur",
        authorId,
        date: mark.attrs.date,
        text: node.text,
      };

      out.push(item);
      lastByType[type] = item;
    });
  });

  return out;
}

/* =========================================================
   MENTION @utilisateur
========================================================= */

export const MentionNode = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-mention"),
        renderHTML: (attrs) => ({ "data-mention": attrs.id }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") || "",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-mention]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ class: "mention" }, HTMLAttributes),
      `@${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    return `@${node.attrs.label}`;
  },
});

/* =========================================================
   TITRES (table des matières, plan du document)
========================================================= */

export function collectHeadings(doc) {
  const out = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim()) {
      out.push({
        pos,
        level: node.attrs.level,
        text: node.textContent.trim(),
      });
    }
  });

  return out;
}