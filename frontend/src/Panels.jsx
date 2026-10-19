import React from "react";
import { Check, X } from "lucide-react";

function when(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ---------------- PLAN DU DOCUMENT ---------------- */

export function NavPane({ headings, onJump, onClose }) {
  return (
    <aside className="nav-pane">
      <div className="panel-head">
        <strong>Plan du document</strong>

        <button className="panel-x" onClick={onClose} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div className="panel-body">
        {headings.length === 0 ? (
          <p className="panel-empty">
            Aucun titre. Utilisez les styles Titre 1, 2 ou 3 pour structurer
            le document.
          </p>
        ) : (
          headings.map((heading, index) => (
            <button
              key={`${heading.pos}-${index}`}
              className="nav-item"
              style={{ paddingLeft: 12 + (heading.level - 1) * 14 }}
              onClick={() => onJump(heading)}
            >
              {heading.text}
            </button>
          ))
        )}
      </div>
    </aside>
  );
}

/* ---------------- MODIFICATIONS (suggestions) ---------------- */

export function SuggestionsPanel({
  suggestions,
  canEdit,
  suggestMode,
  onFocus,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onClose,
}) {
  return (
    <aside className="side-panel">
      <div className="panel-head">
        <strong>Modifications ({suggestions.length})</strong>

        <button className="panel-x" onClick={onClose} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      <div className="panel-note">
        {suggestMode
          ? "Mode suggestion activé : vos modifications sont proposées."
          : "Mode suggestion désactivé : vos modifications sont directes."}
      </div>

      {canEdit && suggestions.length > 0 && (
        <div className="panel-actions">
          <button className="ok" onClick={onAcceptAll}>
            <Check size={14} /> Tout accepter
          </button>

          <button className="no" onClick={onRejectAll}>
            <X size={14} /> Tout refuser
          </button>
        </div>
      )}

      <div className="panel-body">
        {suggestions.length === 0 ? (
          <p className="panel-empty">Aucune modification en attente.</p>
        ) : (
          suggestions.map((item, index) => (
            <div
              key={`${item.type}-${item.from}-${index}`}
              className={`sg-card ${item.type}`}
              onClick={() => onFocus(item)}
            >
              <div className="sg-meta">
                <span className={`sg-badge ${item.type}`}>
                  {item.type === "insert" ? "Ajout" : "Suppression"}
                </span>
                <span>{item.author}</span>
                {item.date && <time>{when(item.date)}</time>}
              </div>

              <p className={`sg-text ${item.type}`}>
                {item.text.length > 140
                  ? `${item.text.slice(0, 140)}…`
                  : item.text}
              </p>

              {canEdit && (
                <div className="sg-actions">
                  <button
                    className="ok"
                    onClick={(event) => {
                      event.stopPropagation();
                      onAccept(item);
                    }}
                  >
                    <Check size={14} /> Accepter
                  </button>

                  <button
                    className="no"
                    onClick={(event) => {
                      event.stopPropagation();
                      onReject(item);
                    }}
                  >
                    <X size={14} /> Refuser
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

/* ---------------- CHOIX D'UNE MENTION ---------------- */

export function MentionPicker({ state, list, index, onPick, hasPeople }) {
  if (!state) return null;

  const left = Math.max(8, Math.min(state.x, window.innerWidth - 290));

  return (
    <div
      className="mention-picker"
      style={{ left, top: state.y + 6 }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {list.length === 0 ? (
        <div className="mention-empty">
          {hasPeople
            ? "Aucun résultat"
            : "Partagez le document pour pouvoir mentionner quelqu'un"}
        </div>
      ) : (
        list.map((person, position) => (
          <button
            key={person.id}
            className={position === index ? "mention-opt on" : "mention-opt"}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(person);
            }}
          >
            <span className="mention-av">
              {person.name.charAt(0).toUpperCase()}
            </span>

            <span className="mention-info">
              <strong>{person.name}</strong>
              <em>{person.email}</em>
            </span>
          </button>
        ))
      )}
    </div>
  );
}