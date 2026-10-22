import React from "react";
import { MessageSquare, MessageSquarePlus } from "lucide-react";

function Btn({ icon: Icon, label, onClick, active = false, title }) {
  return (
    <button
      type="button"
      className={`rbtn large${active ? " active" : ""}`}
      onClick={onClick}
      title={title || label}
    >
      <Icon size={24} />
      <span className="rbtn-label">{label}</span>
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

export function CommentRibbon({
  tab,
  onNew,
  commentsOpen,
  onToggleComments,
  count,
}) {
  if (tab !== "insert" && tab !== "review") return null;

  return (
    <>
      <Grp label="Commentaires">
        <Btn
          icon={MessageSquarePlus}
          label="Nouveau commentaire"
          onClick={onNew}
          title="Commenter le texte sélectionné (Ctrl+Alt+M)"
        />
      </Grp>

      {tab === "review" && (
        <Grp label="Volet des commentaires" edit={false}>
          <Btn
            icon={MessageSquare}
            label={`Commentaires (${count})`}
            active={commentsOpen}
            onClick={onToggleComments}
          />
        </Grp>
      )}
    </>
  );
}