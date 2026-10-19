import React, { useEffect, useRef, useState } from "react";
import {
  AtSign,
  CheckCheck,
  ChevronDown,
  ListTree,
  PanelRight,
  PanelTop,
  Pencil,
  X,
} from "lucide-react";

function Btn({
  icon: Icon,
  label,
  onClick,
  active = false,
  disabled = false,
  title,
  caret = false,
}) {
  return (
    <button
      type="button"
      className={`rbtn large${active ? " active" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title || label}
    >
      {Icon && <Icon size={24} />}
      <span className="rbtn-label">
        {label}
        {caret && <ChevronDown size={11} />}
      </span>
    </button>
  );
}

function Grp({ label, edit = true, children }) {
  return (
    <div className={edit ? "rgroup edit" : "rgroup"}>
      <div className="rgroup-body">{children}</div>
      <div className="rgroup-label">{label}</div>
    </div>
  );
}

function Drop({ trigger, children, panelClass = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);

    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="rdrop" ref={ref}>
      {trigger({ toggle: () => setOpen((value) => !value) })}
      {open && <div className={`rdrop-panel ${panelClass}`}>{children}</div>}
    </div>
  );
}

export function CollabRibbon({
  tab,
  suggestMode,
  onToggleMode,
  count,
  onAcceptAll,
  onRejectAll,
  sidebarOpen,
  onToggleSidebar,
  navOpen,
  onToggleNav,
  onInsertToc,
  onMention,
  pageSetup,
  setPageSetup,
}) {
  /* ---------------- INSERTION ---------------- */

  if (tab === "insert") {
    return (
      <>
        <Grp label="Table des matières">
          <Btn
            icon={ListTree}
            label="Table des matières"
            onClick={onInsertToc}
            title="Insérer une table des matières automatique"
          />
        </Grp>

        <Grp label="En-tête et pied de page">
          <Drop
            panelClass="wide"
            trigger={({ toggle }) => (
              <Btn
                icon={PanelTop}
                label="En-tête / pied"
                caret
                onClick={toggle}
                active={Boolean(
                  pageSetup.header || pageSetup.footer || pageSetup.pageNumbers
                )}
              />
            )}
          >
            <div className="hf-form">
              <label>En-tête</label>
              <input
                type="text"
                maxLength={120}
                value={pageSetup.header}
                placeholder="Texte en haut de chaque page"
                onChange={(event) =>
                  setPageSetup({ ...pageSetup, header: event.target.value })
                }
              />

              <label>Pied de page</label>
              <input
                type="text"
                maxLength={120}
                value={pageSetup.footer}
                placeholder="Texte en bas de chaque page"
                onChange={(event) =>
                  setPageSetup({ ...pageSetup, footer: event.target.value })
                }
              />

              <label className="hf-check">
                <input
                  type="checkbox"
                  checked={pageSetup.pageNumbers}
                  onChange={(event) =>
                    setPageSetup({
                      ...pageSetup,
                      pageNumbers: event.target.checked,
                    })
                  }
                />
                Numéros de page
              </label>

              <label>Position du numéro</label>
              <select
                value={pageSetup.numberAlign}
                disabled={!pageSetup.pageNumbers}
                onChange={(event) =>
                  setPageSetup({
                    ...pageSetup,
                    numberAlign: event.target.value,
                  })
                }
              >
                <option value="left">À gauche</option>
                <option value="center">Au centre</option>
                <option value="right">À droite</option>
              </select>

              <p className="hf-note">
                Enregistrez le document (Ctrl + S) pour conserver ces réglages.
              </p>
            </div>
          </Drop>
        </Grp>

        <Grp label="Mentions">
          <Btn
            icon={AtSign}
            label="Mentionner"
            onClick={onMention}
            title="Mentionner un collaborateur (ou tapez @)"
          />
        </Grp>
      </>
    );
  }

  /* ---------------- REVISION ---------------- */

  if (tab === "review") {
    return (
      <>
        <Grp label="Suivi des modifications">
          <Btn
            icon={Pencil}
            label={suggestMode ? "Suggestion : activée" : "Suggestion : désactivée"}
            active={suggestMode}
            onClick={onToggleMode}
            title="Activer ou désactiver le mode suggestion (Ctrl+Maj+E)"
          />

          <Btn
            icon={CheckCheck}
            label="Tout accepter"
            disabled={count === 0}
            onClick={onAcceptAll}
          />

          <Btn
            icon={X}
            label="Tout refuser"
            disabled={count === 0}
            onClick={onRejectAll}
          />
        </Grp>

        <Grp label="Volet" edit={false}>
          <Btn
            icon={PanelRight}
            label={`Modifications (${count})`}
            active={sidebarOpen}
            onClick={onToggleSidebar}
          />
        </Grp>
      </>
    );
  }

  /* ---------------- AFFICHAGE ---------------- */

  if (tab === "view") {
    return (
      <Grp label="Volet de navigation" edit={false}>
        <Btn
          icon={ListTree}
          label="Plan du document"
          active={navOpen}
          onClick={onToggleNav}
        />
      </Grp>
    );
  }

  return null;
}