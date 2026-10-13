import React, { useEffect, useState } from "react";
import axios from "axios";
import { X, RotateCcw, History } from "lucide-react";

import "./extras.css";

const API_URL = "http://localhost:5000/api";

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
  "codeBlock",
]);

function jsonToText(node) {
  if (!node || typeof node !== "object") return "";

  if (node.type === "text") return node.text || "";
  if (node.type === "pageBreak") return "\n──── saut de page ────\n";

  const inner = Array.isArray(node.content)
    ? node.content.map(jsonToText).join("")
    : "";

  return BLOCK_TYPES.has(node.type) ? `${inner}\n` : inner;
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VersionHistory({
  documentId,
  token,
  canEdit,
  onClose,
  onRestore,
}) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const config = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await axios.get(
          `${API_URL}/documents/${documentId}/versions`,
          config
        );

        if (!cancelled) {
          setVersions(Array.isArray(response.data) ? response.data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err.response?.data?.message || "Impossible de charger l'historique."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const selectVersion = async (version) => {
    setSelectedId(version.id);
    setPreview(null);
    setError("");

    try {
      const response = await axios.get(
        `${API_URL}/documents/${documentId}/versions/${version.id}`,
        config
      );

      setPreview(response.data);
    } catch (err) {
      setError(
        err.response?.data?.message || "Impossible de charger cette version."
      );
    }
  };

  const handleRestore = async () => {
    if (!preview) return;

    if (
      !window.confirm(
        "Restaurer cette version ? L'état actuel sera conservé dans l'historique."
      )
    ) {
      return;
    }

    setRestoring(true);

    try {
      await onRestore(preview.content, preview.title);
      onClose();
    } catch (err) {
      setError("La restauration a échoué.");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="history-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>Historique des versions</h2>
            <p>Une version est créée à chaque enregistrement.</p>
          </div>

          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        {error && <div className="share-message">{error}</div>}

        <div className="history-body">
          <div className="history-list">
            {loading ? (
              <div className="share-empty">Chargement...</div>
            ) : versions.length === 0 ? (
              <div className="share-empty">
                Aucune version pour le moment. Cliquez sur « Enregistrer »
                pour en créer une.
              </div>
            ) : (
              versions.map((version, index) => (
                <button
                  key={version.id}
                  className={
                    selectedId === version.id
                      ? "history-item selected"
                      : "history-item"
                  }
                  onClick={() => selectVersion(version)}
                >
                  {index === 0 && <span className="history-badge">Dernière</span>}
                  <strong>{formatDate(version.created_at)}</strong>
                  <span>
                    {version.created_by_name || "Utilisateur"}
                    {version.label ? ` · ${version.label}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>

          <div className="history-preview">
            {preview ? (
              <>
                <pre className="history-preview-text">
                  {jsonToText(preview.content).trim() || "(document vide)"}
                </pre>

                {canEdit ? (
                  <button
                    className="share-submit"
                    onClick={handleRestore}
                    disabled={restoring}
                  >
                    <RotateCcw
                      size={15}
                      style={{ marginRight: 8, verticalAlign: "-2px" }}
                    />
                    {restoring ? "Restauration..." : "Restaurer cette version"}
                  </button>
                ) : (
                  <p className="history-note">
                    Vous avez un accès en lecture seule : restauration
                    impossible.
                  </p>
                )}
              </>
            ) : (
              <div className="history-placeholder">
                <div>
                  <History size={34} />
                  <p>Sélectionnez une version pour la prévisualiser.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}