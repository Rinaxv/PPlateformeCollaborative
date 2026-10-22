import React, { useState } from "react";
import { Check, RotateCcw, Send, Trash2, X } from "lucide-react";

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

function Box({ placeholder, submitLabel, onSubmit, onCancel, autoFocus = false }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const body = text.trim();

    if (!body || busy) return;

    setBusy(true);

    try {
      const ok = await onSubmit(body);

      if (ok !== false) setText("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cm-box">
      <textarea
        value={text}
        rows={2}
        maxLength={2000}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            send();
          }

          if (event.key === "Escape" && onCancel) {
            onCancel();
          }
        }}
      />

      <div className="cm-box-actions">
        {onCancel && (
          <button type="button" className="cm-ghost" onClick={onCancel}>
            Annuler
          </button>
        )}

        <button
          type="button"
          className="cm-send"
          disabled={!text.trim() || busy}
          onClick={send}
        >
          <Send size={14} />
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function CommentsPanel({
  threads,
  inDoc,
  draft,
  activeThread,
  canComment,
  userId,
  isOwner,
  onSubmitDraft,
  onCancelDraft,
  onReply,
  onResolve,
  onDelete,
  onFocus,
  onClose,
}) {
  const [showResolved, setShowResolved] = useState(false);

  const openCount = threads.filter((thread) => !thread.resolved).length;
  const resolvedCount = threads.length - openCount;
  const list = showResolved ? threads : threads.filter((thread) => !thread.resolved);
  const stop = (event) => event.stopPropagation();

  return (
    <aside className="side-panel">
      <div className="panel-head">
        <strong>Commentaires ({openCount})</strong>

        <button className="panel-x" onClick={onClose} aria-label="Fermer">
          <X size={16} />
        </button>
      </div>

      {resolvedCount > 0 && (
        <label className="cm-filter">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Afficher les résolus ({resolvedCount})
        </label>
      )}

      <div className="panel-body">
        {draft && (
          <div className="cm-thread cm-draft">
            <div className="cm-draft-title">Nouveau commentaire</div>

            <blockquote className="cm-quote">{draft.quote}</blockquote>

            <Box
              autoFocus
              placeholder="Écrivez votre commentaire…"
              submitLabel="Commenter"
              onSubmit={onSubmitDraft}
              onCancel={onCancelDraft}
            />

            <small className="cm-hint">Ctrl + Entrée pour publier</small>
          </div>
        )}

        {!draft && list.length === 0 && (
          <p className="panel-empty">
            Aucun commentaire. Sélectionnez du texte puis cliquez sur
            « Nouveau commentaire » (Révision) ou tapez Ctrl + Alt + M.
          </p>
        )}

        {list.map((thread) => (
          <div
            key={thread.id}
            className={`cm-thread${thread.id === activeThread ? " active" : ""}${
              thread.resolved ? " resolved" : ""
            }`}
            onClick={() => onFocus(thread)}
          >
            {thread.quote && (
              <blockquote className="cm-quote">{thread.quote}</blockquote>
            )}

            {inDoc && !inDoc.has(thread.id) && (
              <span className="cm-orphan">Texte supprimé ou remplacé</span>
            )}

            {thread.comments.map((comment) => (
              <div className="cm-comment" key={comment.id}>
                <div className="cm-head">
                  <span className="cm-av">
                    {(comment.author_name || "U").charAt(0).toUpperCase()}
                  </span>

                  <strong>{comment.author_name || "Utilisateur"}</strong>

                  <time>{when(comment.created_at)}</time>

                  {canComment && (comment.author_id === userId || isOwner) && (
                    <button
                      type="button"
                      className="cm-del"
                      title="Supprimer"
                      aria-label="Supprimer"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(comment);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <p className="cm-body">{comment.body}</p>
              </div>
            ))}

            {canComment && (
              <div className="cm-foot" onClick={stop}>
                <button
                  type="button"
                  className="cm-resolve"
                  onClick={() => onResolve(thread.id, !thread.resolved)}
                >
                  {thread.resolved ? (
                    <>
                      <RotateCcw size={13} /> Rouvrir
                    </>
                  ) : (
                    <>
                      <Check size={13} /> Résoudre
                    </>
                  )}
                </button>
              </div>
            )}

            {canComment && !thread.resolved && (
              <div onClick={stop}>
                <Box
                  placeholder="Répondre…"
                  submitLabel="Répondre"
                  onSubmit={(body) => onReply(thread.id, body)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}