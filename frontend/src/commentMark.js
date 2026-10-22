import { Mark, mergeAttributes } from "@tiptap/core";

export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) =>
          attrs.commentId ? { "data-comment-id": attrs.commentId } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ class: "comment-mark" }, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setComment:
        (commentId) =>
        ({ commands }) =>
          commands.setMark("comment", { commentId }),

      removeComment:
        (commentId) =>
        ({ tr, state }) => {
          const type = state.schema.marks.comment;

          tr.doc.descendants((node, pos) => {
            if (!node.isText) return;

            node.marks.forEach((mark) => {
              if (mark.type === type && mark.attrs.commentId === commentId) {
                tr.removeMark(pos, pos + node.nodeSize, mark);
              }
            });
          });

          return true;
        },
    };
  },
});