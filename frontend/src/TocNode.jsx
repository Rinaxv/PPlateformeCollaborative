import React, { useCallback, useEffect, useState } from "react";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { collectHeadings } from "./collabExtensions";

function TocView({ editor }) {
  const [items, setItems] = useState([]);

  const compute = useCallback(() => {
    if (!editor || editor.isDestroyed) return;

    const storage = editor.storage.tableOfContents || {};
    const rootTop = editor.view.dom.getBoundingClientRect().top;

    const list = collectHeadings(editor.state.doc).map((heading) => {
      let page = 1;

      try {
        const element = editor.view.nodeDOM(heading.pos);

        if (element && element.getBoundingClientRect) {
          const y =
            (element.getBoundingClientRect().top - rootTop) /
            (storage.zoom || 1);

          page =
            Math.floor(((storage.margin || 0) + y) / (storage.pageH || 1123)) +
            1;
        }
      } catch {
        page = 1;
      }

      return { ...heading, page: Math.max(1, page) };
    });

    setItems((previous) =>
      JSON.stringify(previous) === JSON.stringify(list) ? previous : list
    );
  }, [editor]);

  useEffect(() => {
    const run = () => setTimeout(compute, 60);

    run();
    editor.on("update", run);

    const observer = new ResizeObserver(run);
    observer.observe(editor.view.dom);

    return () => {
      editor.off("update", run);
      observer.disconnect();
    };
  }, [editor, compute]);

  const jump = (heading) => {
    editor.chain().focus().setTextSelection(heading.pos + 1).run();

    const element = editor.view.nodeDOM(heading.pos);
    element?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  };

  return (
    <NodeViewWrapper className="toc-block" contentEditable={false}>
      <div className="toc-title">Table des matières</div>

      {items.length === 0 ? (
        <div className="toc-empty">
          Ajoutez des titres (Titre 1, 2 ou 3) : ils apparaîtront ici
          automatiquement.
        </div>
      ) : (
        items.map((item, index) => (
          <button
            key={`${item.pos}-${index}`}
            type="button"
            className="toc-row"
            style={{ paddingLeft: (item.level - 1) * 18 }}
            onClick={() => jump(item)}
          >
            <span className="toc-text">{item.text}</span>
            <span className="toc-dots" />
            <span className="toc-page">{item.page}</span>
          </button>
        ))
      )}
    </NodeViewWrapper>
  );
}

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addStorage() {
    return { pageH: 1123, margin: 96, zoom: 1 };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }];
  },

  renderHTML() {
    return ["div", { "data-type": "toc" }];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocView);
  },
});