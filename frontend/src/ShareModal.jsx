import React, { useEffect, useState } from "react";
import axios from "axios";
import { X, Trash2 } from "lucide-react";

import "./extras.css";

const API_URL = "http://localhost:5000/api";

function errorText(error, fallback) {
  return error?.response?.data?.message || fallback;
}

export default function ShareModal({
  documentId,
  documentTitle,
  token,
  onClose,
  notify,
}) {
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const config = { headers: { Authorization: `Bearer ${token}` } };

  const loadShares = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/documents/${documentId}/shares`,
        config
      );

      setShares(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setMessage(errorText(error, "Impossible de charger les partages."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShares();
  }, [documentId]);

  const handleAdd = async (event) => {
    event.preventDefault();

    setBusy(true);
    setMessage("");

    try {
      await axios.post(
        `${API_URL}/documents/${documentId}/share`,
        { email, permission },
        config
      );

      setEmail("");
      await loadShares();
      notify?.("Accès accordé");
    } catch (error) {
      setMessage(errorText(error, "Erreur lors du partage."));
    } finally {
      setBusy(false);
    }
  };

  const handleChange = async (share, newPermission) => {
    try {
      await axios.put(
        `${API_URL}/documents/${documentId}/share/${share.user_id}`,
        { permission: newPermission },
        config
      );

      setShares((previous) =>
        previous.map((item) =>
          item.user_id === share.user_id
            ? { ...item, permission: newPermission }
            : item
        )
      );

      notify?.("Permission modifiée");
    } catch (error) {
      notify?.(errorText(error, "Erreur de modification."), "error");
    }
  };

  const handleRemove = async (share) => {
    if (!window.confirm(`Retirer l'accès de ${share.name} ?`)) {
      return;
    }

    try {
      await axios.delete(
        `${API_URL}/documents/${documentId}/share/${share.user_id}`,
        config
      );

      setShares((previous) =>
        previous.filter((item) => item.user_id !== share.user_id)
      );

      notify?.("Accès retiré");
    } catch (error) {
      notify?.(errorText(error, "Erreur de suppression."), "error");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="share-modal wide"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2>Partager le document</h2>
            <p>{documentTitle}</p>
          </div>

          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleAdd}>
          <label>Email de l'utilisateur</label>

          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="utilisateur@email.com"
            required
          />

          <label>Niveau d'accès</label>

          <select
            value={permission}
            onChange={(event) => setPermission(event.target.value)}
          >
            <option value="viewer">Lecteur — lecture seule</option>
            <option value="editor">Éditeur — peut modifier</option>
          </select>

          {message && <div className="share-message">{message}</div>}

          <button type="submit" className="share-submit" disabled={busy}>
            {busy ? "Partage..." : "Donner l'accès"}
          </button>
        </form>

        <div className="share-list-title">
          Personnes ayant accès ({shares.length})
        </div>

        <div className="share-list">
          {loading ? (
            <div className="share-empty">Chargement...</div>
          ) : shares.length === 0 ? (
            <div className="share-empty">
              Ce document n'est partagé avec personne.
            </div>
          ) : (
            shares.map((share) => (
              <div key={share.user_id} className="share-row">
                <div className="share-row-avatar">
                  {share.name?.charAt(0)?.toUpperCase() || "U"}
                </div>

                <div className="share-row-info">
                  <strong>{share.name}</strong>
                  <span>{share.email}</span>
                </div>

                <select
                  value={share.permission}
                  onChange={(event) => handleChange(share, event.target.value)}
                >
                  <option value="viewer">Lecteur</option>
                  <option value="editor">Éditeur</option>
                </select>

                <button
                  className="icon-danger"
                  onClick={() => handleRemove(share)}
                  title="Retirer l'accès"
                  aria-label="Retirer l'accès"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}