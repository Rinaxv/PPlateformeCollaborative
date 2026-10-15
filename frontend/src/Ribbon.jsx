import React, { useEffect, useRef, useState } from "react";

import {
  ClipboardPaste,
  Scissors,
  Copy,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Highlighter,
  RemoveFormatting,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  IndentIncrease,
  IndentDecrease,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  ArrowUpDown,
  Search,
  Replace,
  TextSelect,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  Minus,
  Calendar,
  Omega,
  Code,
  FilePlus2,
  FileUp,
  Printer,
  RectangleHorizontal,
  RectangleVertical,
  ZoomIn,
  ZoomOut,
  Maximize,
  BookOpen,
  Ruler,
  Sun,
  Moon,
  History,
  Plus,
  Trash2,
  ChevronDown,
  SpellCheck,
  Hash,
  FileText,
} from "lucide-react";

/* =========================================================
   DONNEES
========================================================= */

export const PAGE_SIZES = {
  A4: { label: "A4", w: 794, h: 1123, pdf: "a4", css: "A4", dim: "21 × 29,7 cm" },
  A5: { label: "A5", w: 559, h: 794, pdf: "a5", css: "A5", dim: "14,8 × 21 cm" },
  Letter: { label: "Lettre", w: 816, h: 1056, pdf: "letter", css: "letter", dim: "21,6 × 27,9 cm" },
  Legal: { label: "Légal", w: 816, h: 1344, pdf: "legal", css: "legal", dim: "21,6 × 35,6 cm" },
};

export const MARGINS = {
  normal: { label: "Normales", px: 96, dim: "2,54 cm" },
  narrow: { label: "Étroites", px: 48, dim: "1,27 cm" },
  moderate: { label: "Modérées", px: 72, dim: "1,91 cm" },
  wide: { label: "Larges", px: 120, dim: "3,18 cm" },
};

export const DEFAULT_PAGE = {
  size: "A4",
  orientation: "portrait",
  margin: "normal",
};

export const FONT_SIZES = [
  "8pt", "9pt", "10pt", "10.5pt", "11pt", "12pt", "13.5pt", "14pt",
  "16pt", "18pt", "20pt", "24pt", "28pt", "36pt", "48pt", "72pt",
];

const FONTS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, Carlito, sans-serif" },
  { label: "Cambria", value: "Cambria, serif" },
  { label: "Comic Sans MS", value: "Comic Sans MS, cursive" },
  { label: "Courier New", value: "Courier New, monospace" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Segoe UI", value: "Segoe UI, sans-serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
];

const TEXT_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#cccccc", "#ffffff",
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#16a34a", "#059669",
  "#0891b2", "#2563eb", "#4f46e5", "#7c3aed", "#c026d3", "#e11d48",
];

const HIGHLIGHT_COLORS = [
  "#fef08a", "#bbf7d0", "#a5f3fc", "#fbcfe8",
  "#fed7aa", "#e5e7eb", "#ddd6fe", "#fecaca",
];

const SPACINGS = ["1", "1.15", "1.5", "2", "2.5", "3"];

const SYMBOLS =
  "© ® ™ € £ ¥ ° ± × ÷ ≠ ≈ ≤ ≥ ∞ √ π Ω α β γ δ µ § ¶ • … – — « » → ← ↑ ↓ ↔ ✓ ✗ ★ ♥ ½ ¼ ¾".split(
    " "
  );

/* =========================================================
   PETITS COMPOSANTS
========================================================= */

function RBtn({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  title,
  large = false,
  caret = false,
  children,
}) {
  return (
    <button
      type="button"
      className={`rbtn${large ? " large" : ""}${active ? " active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
    >
      {Icon && <Icon size={large ? 24 : 16} />}
      {children}
      {label && (
        <span className="rbtn-label">
          {label}
          {caret && <ChevronDown size={11} />}
        </span>
      )}
    </button>
  );
}

function Group({ label, edit = true, children }) {
  return (
    <div className={edit ? "rgroup edit" : "rgroup"}>
      <div className="rgroup-body">{children}</div>
      <div className="rgroup-label">{label}</div>
    </div>
  );
}

function Dropdown({ trigger, children, panelClass = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="rdrop" ref={ref}>
      {trigger({ open, toggle: () => setOpen((value) => !value) })}

      {open && (
        <div className={`rdrop-panel ${panelClass}`}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}

function TableGrid({ onPick }) {
  const [hover, setHover] = useState({ r: 0, c: 0 });

  return (
    <div>
      <div className="tgrid">
        {Array.from({ length: 64 }).map((_, index) => {
          const r = Math.floor(index / 8) + 1;
          const c = (index % 8) + 1;

          return (
            <button
              key={index}
              type="button"
              className={
                r <= hover.r && c <= hover.c ? "tcell on" : "tcell"
              }
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => onPick(r, c)}
              aria-label={`${r} lignes, ${c} colonnes`}
            />
          );
        })}
      </div>

      <div className="tgrid-label">
        {hover.r > 0 ? `${hover.c} × ${hover.r}` : "Insérer un tableau"}
      </div>
    </div>
  );
}

function LinkForm({ editor, close }) {
  const [url, setUrl] = useState(editor.getAttributes("link").href || "");

  const normalize = (value) => {
    const trimmed = value.trim();

    if (!trimmed) return "";

    return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
  };

  const apply = (event) => {
    event.preventDefault();

    const href = normalize(url);

    if (!href) return;

    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: href,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    }

    close();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    close();
  };

  return (
    <form className="link-form" onSubmit={apply}>
      <label>Adresse du lien</label>

      <input
        type="text"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://exemple.com"
        autoFocus
      />

      <div className="link-form-actions">
        <button type="submit" className="primary">
          Appliquer
        </button>

        <button type="button" onClick={remove}>
          Supprimer le lien
        </button>
      </div>
    </form>
  );
}

/* =========================================================
   RUBAN
========================================================= */

export function Ribbon({
  editor,
  tab,
  spell,
  setSpell,
  pageSetup,
  setPageSetup,
  zoom,
  setZoom,
  onFitWidth,
  showRuler,
  setShowRuler,
  readingMode,
  setReadingMode,
  onFind,
  onPrint,
  onPickImage,
  onImport,
  onStats,
  onHistory,
  onPaste,
  isDark,
  onToggleTheme,
  onFullscreen,
  defaultPt,
}) {
  const run = (fn) => fn(editor.chain().focus()).run();

  const exec = (command) => {
    editor.view.focus();
    document.execCommand(command);
  };

  const textStyle = editor.getAttributes("textStyle");
  const fontFamily = textStyle.fontFamily || "";
  const fontSize = textStyle.fontSize || "";
  const textColor = textStyle.color || "";
  const highlightColor = editor.getAttributes("highlight").color || "";

  const align =
    ["left", "center", "right", "justify"].find((value) =>
      editor.isActive({ textAlign: value })
    ) || "left";

  const spacing =
    editor.getAttributes("paragraph").lineSpacing ||
    editor.getAttributes("heading").lineSpacing ||
    "";

  const stepSize = (direction) => {
    const current = fontSize || `${defaultPt}pt`;

    let index = FONT_SIZES.indexOf(current);

    if (index < 0) {
      index = FONT_SIZES.findIndex(
        (size) => parseFloat(size) >= parseFloat(current)
      );
    }

    if (index < 0) index = FONT_SIZES.length - 1;

    const next =
      FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, index + direction))];

    run((chain) => chain.setFontSize(next));
  };

  const indent = (direction) => {
    const type = editor.isActive("taskItem") ? "taskItem" : "listItem";

    run((chain) =>
      direction > 0 ? chain.sinkListItem(type) : chain.liftListItem(type)
    );
  };

  const clearFormatting = () =>
    run((chain) =>
      chain.unsetAllMarks().clearNodes().unsetTextAlign().unsetLineSpacing()
    );

  const sizeLabel = (value) => value.replace("pt", "").replace(".", ",");

  const zoomBy = (delta) =>
    setZoom((value) => Math.min(200, Math.max(50, value + delta)));

  const dimsLabel = PAGE_SIZES[pageSetup.size] || PAGE_SIZES.A4;

  /* ---------------- ACCUEIL ---------------- */

  if (tab === "home") {
    return (
      <>
        <Group label="Presse-papiers">
          <RBtn large icon={ClipboardPaste} label="Coller" onClick={onPaste} />

          <div className="rcol">
            <RBtn icon={Scissors} label="Couper" onClick={() => exec("cut")} />
            <RBtn icon={Copy} label="Copier" onClick={() => exec("copy")} />
          </div>
        </Group>

        <Group label="Police">
          <div className="rcol">
            <div className="rrow">
              <select
                className="rselect"
                style={{ width: 150 }}
                value={fontFamily}
                onChange={(event) =>
                  event.target.value
                    ? run((chain) => chain.setFontFamily(event.target.value))
                    : run((chain) => chain.unsetFontFamily())
                }
                title="Police"
              >
                <option value="">Police par défaut</option>

                {FONTS.map((font) => (
                  <option key={font.label} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>

              <select
                className="rselect"
                style={{ width: 62 }}
                value={fontSize}
                onChange={(event) =>
                  event.target.value
                    ? run((chain) => chain.setFontSize(event.target.value))
                    : run((chain) => chain.unsetFontSize())
                }
                title="Taille de police"
              >
                <option value="">{String(defaultPt).replace(".", ",")}</option>

                {FONT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {sizeLabel(size)}
                  </option>
                ))}
              </select>

              <RBtn
                icon={Plus}
                title="Agrandir la police"
                onClick={() => stepSize(1)}
              />

              <RBtn
                icon={Minus}
                title="Réduire la police"
                onClick={() => stepSize(-1)}
              />

              <RBtn
                icon={RemoveFormatting}
                title="Effacer la mise en forme"
                onClick={clearFormatting}
              />
            </div>

            <div className="rrow">
              <RBtn
                icon={Bold}
                title="Gras (Ctrl+B)"
                active={editor.isActive("bold")}
                onClick={() => run((chain) => chain.toggleBold())}
              />

              <RBtn
                icon={Italic}
                title="Italique (Ctrl+I)"
                active={editor.isActive("italic")}
                onClick={() => run((chain) => chain.toggleItalic())}
              />

              <RBtn
                icon={Underline}
                title="Souligné (Ctrl+U)"
                active={editor.isActive("underline")}
                onClick={() => run((chain) => chain.toggleUnderline())}
              />

              <RBtn
                icon={Strikethrough}
                title="Barré"
                active={editor.isActive("strike")}
                onClick={() => run((chain) => chain.toggleStrike())}
              />

              <RBtn
                icon={Subscript}
                title="Indice"
                active={editor.isActive("subscript")}
                onClick={() => run((chain) => chain.toggleSubscript())}
              />

              <RBtn
                icon={Superscript}
                title="Exposant"
                active={editor.isActive("superscript")}
                onClick={() => run((chain) => chain.toggleSuperscript())}
              />

              <span className="rsep" />

              <Dropdown
                trigger={({ toggle }) => (
                  <button
                    type="button"
                    className="rbtn color-btn"
                    title="Couleur de police"
                    onClick={toggle}
                  >
                    <span className="color-letter">A</span>
                    <span
                      className="color-bar"
                      style={{ background: textColor || "#dc2626" }}
                    />
                    <ChevronDown size={11} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <div className="palette">
                      {TEXT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="sw"
                          style={{ background: color }}
                          aria-label={color}
                          onClick={() => {
                            run((chain) => chain.setColor(color));
                            close();
                          }}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      className="rmenu-item"
                      onClick={() => {
                        run((chain) => chain.unsetColor());
                        close();
                      }}
                    >
                      Automatique
                    </button>
                  </>
                )}
              </Dropdown>

              <Dropdown
                trigger={({ toggle }) => (
                  <button
                    type="button"
                    className="rbtn color-btn"
                    title="Surlignage"
                    onClick={toggle}
                  >
                    <Highlighter size={16} />
                    <span
                      className="color-bar"
                      style={{ background: highlightColor || "#fef08a" }}
                    />
                    <ChevronDown size={11} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <div className="palette">
                      {HIGHLIGHT_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className="sw"
                          style={{ background: color }}
                          aria-label={color}
                          onClick={() => {
                            run((chain) => chain.setHighlight({ color }));
                            close();
                          }}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      className="rmenu-item"
                      onClick={() => {
                        run((chain) => chain.unsetHighlight());
                        close();
                      }}
                    >
                      Aucune couleur
                    </button>
                  </>
                )}
              </Dropdown>
            </div>
          </div>
        </Group>

        <Group label="Paragraphe">
          <div className="rcol">
            <div className="rrow">
              <RBtn
                icon={List}
                title="Liste à puces"
                active={editor.isActive("bulletList")}
                onClick={() => run((chain) => chain.toggleBulletList())}
              />

              <RBtn
                icon={ListOrdered}
                title="Liste numérotée"
                active={editor.isActive("orderedList")}
                onClick={() => run((chain) => chain.toggleOrderedList())}
              />

              <RBtn
                icon={ListTodo}
                title="Liste de cases à cocher"
                active={editor.isActive("taskList")}
                onClick={() => run((chain) => chain.toggleTaskList())}
              />

              <RBtn
                icon={IndentDecrease}
                title="Diminuer le retrait"
                onClick={() => indent(-1)}
              />

              <RBtn
                icon={IndentIncrease}
                title="Augmenter le retrait"
                onClick={() => indent(1)}
              />
            </div>

            <div className="rrow">
              <RBtn
                icon={AlignLeft}
                title="Aligner à gauche"
                active={align === "left"}
                onClick={() => run((chain) => chain.setTextAlign("left"))}
              />

              <RBtn
                icon={AlignCenter}
                title="Centrer"
                active={align === "center"}
                onClick={() => run((chain) => chain.setTextAlign("center"))}
              />

              <RBtn
                icon={AlignRight}
                title="Aligner à droite"
                active={align === "right"}
                onClick={() => run((chain) => chain.setTextAlign("right"))}
              />

              <RBtn
                icon={AlignJustify}
                title="Justifier"
                active={align === "justify"}
                onClick={() => run((chain) => chain.setTextAlign("justify"))}
              />

              <span className="rsep" />

              <Dropdown
                trigger={({ toggle }) => (
                  <RBtn
                    icon={ArrowUpDown}
                    title="Interligne"
                    onClick={toggle}
                    active={Boolean(spacing)}
                  >
                    <ChevronDown size={11} />
                  </RBtn>
                )}
              >
                {(close) => (
                  <div className="rmenu">
                    {SPACINGS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={
                          spacing === value ? "rmenu-item on" : "rmenu-item"
                        }
                        onClick={() => {
                          run((chain) => chain.setLineSpacing(value));
                          close();
                        }}
                      >
                        {value.replace(".", ",")}
                      </button>
                    ))}

                    <button
                      type="button"
                      className="rmenu-item"
                      onClick={() => {
                        run((chain) => chain.unsetLineSpacing());
                        close();
                      }}
                    >
                      Par défaut
                    </button>
                  </div>
                )}
              </Dropdown>

              <RBtn
                icon={Quote}
                title="Citation"
                active={editor.isActive("blockquote")}
                onClick={() => run((chain) => chain.toggleBlockquote())}
              />
            </div>
          </div>
        </Group>

        <Group label="Styles">
          <div className="gallery">
            {[
              {
                id: "normal",
                label: "Normal",
                style: { fontSize: 14 },
                active:
                  editor.isActive("paragraph") &&
                  !editor.isActive("blockquote"),
                apply: (chain) => chain.setParagraph(),
              },
              {
                id: "h1",
                label: "Titre 1",
                style: { fontSize: 20, fontWeight: 700 },
                active: editor.isActive("heading", { level: 1 }),
                apply: (chain) => chain.toggleHeading({ level: 1 }),
              },
              {
                id: "h2",
                label: "Titre 2",
                style: { fontSize: 17, fontWeight: 700 },
                active: editor.isActive("heading", { level: 2 }),
                apply: (chain) => chain.toggleHeading({ level: 2 }),
              },
              {
                id: "h3",
                label: "Titre 3",
                style: { fontSize: 15, fontWeight: 700 },
                active: editor.isActive("heading", { level: 3 }),
                apply: (chain) => chain.toggleHeading({ level: 3 }),
              },
              {
                id: "quote",
                label: "Citation",
                style: { fontSize: 14, fontStyle: "italic" },
                active: editor.isActive("blockquote"),
                apply: (chain) => chain.toggleBlockquote(),
              },
              {
                id: "code",
                label: "Code",
                style: { fontSize: 13, fontFamily: "Consolas, monospace" },
                active: editor.isActive("codeBlock"),
                apply: (chain) => chain.toggleCodeBlock(),
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.active ? "gal-item active" : "gal-item"}
                onClick={() => run(item.apply)}
                title={item.label}
              >
                <span className="gal-preview" style={item.style}>
                  AaBbCc
                </span>

                <span className="gal-label">{item.label}</span>
              </button>
            ))}
          </div>
        </Group>

        <Group label="Édition" edit={false}>
          <div className="rcol">
            <RBtn
              icon={Search}
              label="Rechercher"
              onClick={() => onFind(false)}
            />

            <RBtn
              icon={Replace}
              label="Remplacer"
              onClick={() => onFind(true)}
            />

            <RBtn
              icon={TextSelect}
              label="Tout sélectionner"
              onClick={() => editor.chain().focus().selectAll().run()}
            />
          </div>
        </Group>
      </>
    );
  }

  /* ---------------- INSERTION ---------------- */

  if (tab === "insert") {
    return (
      <>
        <Group label="Pages">
          <RBtn
            large
            icon={FilePlus2}
            label="Saut de page"
            onClick={() =>
              run((chain) => chain.insertContent({ type: "pageBreak" }))
            }
          />
        </Group>

        <Group label="Tableaux">
          <Dropdown
            trigger={({ toggle }) => (
              <RBtn
                large
                caret
                icon={TableIcon}
                label="Tableau"
                onClick={toggle}
              />
            )}
          >
            {(close) => (
              <TableGrid
                onPick={(rows, cols) => {
                  run((chain) =>
                    chain.insertTable({ rows, cols, withHeaderRow: true })
                  );
                  close();
                }}
              />
            )}
          </Dropdown>
        </Group>

        <Group label="Illustrations">
          <RBtn
            large
            icon={ImageIcon}
            label="Image"
            onClick={onPickImage}
          />
        </Group>

        <Group label="Liens">
          <Dropdown
            trigger={({ toggle }) => (
              <RBtn
                large
                caret
                icon={LinkIcon}
                label="Lien"
                active={editor.isActive("link")}
                onClick={toggle}
              />
            )}
            panelClass="wide"
          >
            {(close) => <LinkForm editor={editor} close={close} />}
          </Dropdown>
        </Group>

        <Group label="Texte">
          <div className="rcol">
            <RBtn
              icon={Minus}
              label="Ligne horizontale"
              onClick={() => run((chain) => chain.setHorizontalRule())}
            />

            <RBtn
              icon={Calendar}
              label="Date du jour"
              onClick={() =>
                run((chain) =>
                  chain.insertContent(
                    new Date().toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })
                  )
                )
              }
            />

            <RBtn
              icon={Code}
              label="Bloc de code"
              onClick={() => run((chain) => chain.toggleCodeBlock())}
            />
          </div>
        </Group>

        <Group label="Symboles">
          <Dropdown
            trigger={({ toggle }) => (
              <RBtn
                large
                caret
                icon={Omega}
                label="Symbole"
                onClick={toggle}
              />
            )}
            panelClass="wide"
          >
            {(close) => (
              <div className="symbols">
                {SYMBOLS.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => {
                      run((chain) => chain.insertContent(symbol));
                      close();
                    }}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            )}
          </Dropdown>
        </Group>

        <Group label="Fichier">
          <RBtn
            large
            icon={FileUp}
            label="Word ou PDF"
            onClick={onImport}
            title="Importer un document Word (.docx) ou un PDF"
          />
        </Group>
      </>
    );
  }

  /* ---------------- MISE EN PAGE ---------------- */

  if (tab === "layout") {
    return (
      <>
        <Group label="Mise en page">
          <Dropdown
            trigger={({ toggle }) => (
              <RBtn
                large
                caret
                icon={FileText}
                label="Marges"
                onClick={toggle}
              />
            )}
            panelClass="wide"
          >
            {(close) => (
              <div className="rmenu">
                {Object.entries(MARGINS).map(([key, margin]) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      pageSetup.margin === key ? "rmenu-item on" : "rmenu-item"
                    }
                    onClick={() => {
                      setPageSetup({ ...pageSetup, margin: key });
                      close();
                    }}
                  >
                    <strong>{margin.label}</strong>
                    <span>{margin.dim}</span>
                  </button>
                ))}
              </div>
            )}
          </Dropdown>

          <div className="rcol">
            <RBtn
              icon={RectangleVertical}
              label="Portrait"
              active={pageSetup.orientation === "portrait"}
              onClick={() =>
                setPageSetup({ ...pageSetup, orientation: "portrait" })
              }
            />

            <RBtn
              icon={RectangleHorizontal}
              label="Paysage"
              active={pageSetup.orientation === "landscape"}
              onClick={() =>
                setPageSetup({ ...pageSetup, orientation: "landscape" })
              }
            />
          </div>

          <Dropdown
            trigger={({ toggle }) => (
              <RBtn
                large
                caret
                icon={FileText}
                label={`Taille : ${dimsLabel.label}`}
                onClick={toggle}
              />
            )}
            panelClass="wide"
          >
            {(close) => (
              <div className="rmenu">
                {Object.entries(PAGE_SIZES).map(([key, size]) => (
                  <button
                    key={key}
                    type="button"
                    className={
                      pageSetup.size === key ? "rmenu-item on" : "rmenu-item"
                    }
                    onClick={() => {
                      setPageSetup({ ...pageSetup, size: key });
                      close();
                    }}
                  >
                    <strong>{size.label}</strong>
                    <span>{size.dim}</span>
                  </button>
                ))}
              </div>
            )}
          </Dropdown>
        </Group>

        <Group label="Pages">
          <RBtn
            large
            icon={FilePlus2}
            label="Saut de page"
            onClick={() =>
              run((chain) => chain.insertContent({ type: "pageBreak" }))
            }
          />
        </Group>

        <Group label="Impression" edit={false}>
          <RBtn large icon={Printer} label="Imprimer" onClick={onPrint} />
        </Group>
      </>
    );
  }

  /* ---------------- REVISION ---------------- */

  if (tab === "review") {
    return (
      <>
        <Group label="Vérification" edit={false}>
          <RBtn
            large
            icon={SpellCheck}
            label="Orthographe"
            active={spell}
            onClick={() => setSpell(!spell)}
            title="Active ou désactive le correcteur du navigateur"
          />

          <RBtn
            large
            icon={Hash}
            label="Statistiques"
            onClick={onStats}
          />
        </Group>

        <Group label="Recherche" edit={false}>
          <RBtn
            large
            icon={Search}
            label="Rechercher"
            onClick={() => onFind(false)}
          />

          <RBtn
            large
            icon={Replace}
            label="Remplacer"
            onClick={() => onFind(true)}
          />
        </Group>

        <Group label="Historique" edit={false}>
          <RBtn
            large
            icon={History}
            label="Versions"
            onClick={onHistory}
          />
        </Group>
      </>
    );
  }

  /* ---------------- AFFICHAGE ---------------- */

  if (tab === "view") {
    return (
      <>
        <Group label="Modes d'affichage" edit={false}>
          <RBtn
            large
            icon={FileText}
            label="Page"
            active={!readingMode}
            onClick={() => setReadingMode(false)}
          />

          <RBtn
            large
            icon={BookOpen}
            label="Lecture"
            active={readingMode}
            onClick={() => setReadingMode(true)}
          />
        </Group>

        <Group label="Afficher" edit={false}>
          <RBtn
            large
            icon={Ruler}
            label="Règle"
            active={showRuler}
            onClick={() => setShowRuler(!showRuler)}
          />
        </Group>

        <Group label="Zoom" edit={false}>
          <RBtn
            large
            icon={ZoomIn}
            label="Agrandir"
            onClick={() => zoomBy(10)}
          />

          <RBtn
            large
            icon={ZoomOut}
            label="Réduire"
            onClick={() => zoomBy(-10)}
          />

          <div className="rcol">
            <RBtn label="100 %" onClick={() => setZoom(100)} />
            <RBtn label="Largeur de page" onClick={onFitWidth} />
          </div>
        </Group>

        <Group label="Thème" edit={false}>
          <RBtn
            large
            icon={isDark ? Sun : Moon}
            label={isDark ? "Mode clair" : "Mode sombre"}
            onClick={onToggleTheme}
          />
        </Group>

        <Group label="Fenêtre" edit={false}>
          <RBtn
            large
            icon={Maximize}
            label="Plein écran"
            onClick={onFullscreen}
          />
        </Group>
      </>
    );
  }

  /* ---------------- TABLEAU (contextuel) ---------------- */

  if (tab === "table") {
    return (
      <>
        <Group label="Lignes">
          <div className="rcol">
            <RBtn
              icon={Plus}
              label="Insérer au-dessus"
              onClick={() => run((chain) => chain.addRowBefore())}
            />

            <RBtn
              icon={Plus}
              label="Insérer en dessous"
              onClick={() => run((chain) => chain.addRowAfter())}
            />

            <RBtn
              icon={Trash2}
              label="Supprimer la ligne"
              onClick={() => run((chain) => chain.deleteRow())}
            />
          </div>
        </Group>

        <Group label="Colonnes">
          <div className="rcol">
            <RBtn
              icon={Plus}
              label="Insérer à gauche"
              onClick={() => run((chain) => chain.addColumnBefore())}
            />

            <RBtn
              icon={Plus}
              label="Insérer à droite"
              onClick={() => run((chain) => chain.addColumnAfter())}
            />

            <RBtn
              icon={Trash2}
              label="Supprimer la colonne"
              onClick={() => run((chain) => chain.deleteColumn())}
            />
          </div>
        </Group>

        <Group label="Fusion">
          <div className="rcol">
            <RBtn
              label="Fusionner les cellules"
              disabled={!editor.can().mergeCells()}
              onClick={() => run((chain) => chain.mergeCells())}
            />

            <RBtn
              label="Fractionner la cellule"
              disabled={!editor.can().splitCell()}
              onClick={() => run((chain) => chain.splitCell())}
            />
          </div>
        </Group>

        <Group label="Tableau">
          <div className="rcol">
            <RBtn
              label="Ligne d'en-tête"
              active={editor.isActive("tableHeader")}
              onClick={() => run((chain) => chain.toggleHeaderRow())}
            />

            <RBtn
              icon={Trash2}
              label="Supprimer le tableau"
              onClick={() => run((chain) => chain.deleteTable())}
            />
          </div>
        </Group>
      </>
    );
  }

  return null;
}