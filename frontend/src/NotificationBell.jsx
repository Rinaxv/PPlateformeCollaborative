import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { AtSign, Bell, CheckCheck, Share2, Trash2 } from "lucide-react";

import "./collab.css";

const API_URL = "http://localhost:5000/api";

function ago(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `Il y a ${hours} h`;

  const days = Math.floor(hours / 24);

  if (days < 7) return `Il y a ${days} j`;

  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NotificationBell({
  token,
  onOpenDocument,
  variant = "light",
}) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(null);
  const previousUnread = useRef(null);

  const config = { headers: { Authorization: `Bearer ${token}` } };

  const load = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const list = Array.isArray(response.data?.items)
        ? response.data.items
        : [];

      const count = Number(response.data?.unread) || 0;

      if (
        previousUnread.current !== null &&
        count > previousUnread.current &&
        list[0]
      ) {
        setFlash(list[0]);
      }

      previousUnread.current = count;

      setItems(list);
      setUnread(count);
    } catch {
      // réseau indisponible : on réessaiera au prochain cycle
    }
  }, [token]);

  useEffect(() => {
    load();

    const timer = setInterval(load, 15000);
    const onPush = () => load();

    window.addEventListener("collab:notify", onPush);

    return () => {
      clearInterval(timer);
      window.removeEventListener("collab:notify", onPush);
    };
  }, [load]);

  useEffect(() => {
    if (!flash) return undefined;

    const timer = setTimeout(() => setFlash(null), 5000);

    return () => clearTimeout(timer);
  }, [flash]);

  const markRead = async (id) => {
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, is_read: true } : item))
    );
    setUnread((value) => Math.max(0, value - 1));

    try {
      await axios.post(`${API_URL}/notifications/${id}/read`, {}, config);
    } catch {
      load();
    }
  };

  const readAll = async () => {
    setItems((previous) => previous.map((item) => ({ ...item, is_read: true })));
    setUnread(0);

    try {
      await axios.post(`${API_URL}/notifications/read-all`, {}, config);
    } catch {
      load();
    }
  };

  const clearAll = async () => {
    setItems([]);
    setUnread(0);

    try {
      await axios.delete(`${API_URL}/notifications`, config);
    } catch {
      load();
    }
  };

  const openItem = async (item) => {
    if (!item.is_read) {
      await markRead(item.id);
    }

    setOpen(false);

    if (item.document_id && onOpenDocument) {
      onOpenDocument(item.document_id);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`bell-btn ${variant}`}
        onClick={() => setOpen((value) => !value)}
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>

      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />

          <div className="bell-panel" role="dialog" aria-label="Notifications">
            <div className="bell-head">
              <strong>Notifications</strong>

              <div className="bell-tools">
                <button
                  type="button"
                  onClick={readAll}
                  disabled={unread === 0}
                  title="Tout marquer comme lu"
                >
                  <CheckCheck size={16} />
                </button>

                <button
                  type="button"
                  onClick={clearAll}
                  disabled={items.length === 0}
                  title="Tout effacer"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <div className="bell-list">
              {items.length === 0 ? (
                <p className="bell-empty">Aucune notification pour le moment.</p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={item.is_read ? "bell-item" : "bell-item unread"}
                    onClick={() => openItem(item)}
                  >
                    <span className={`bell-icon ${item.type}`}>
                      {item.type === "mention" ? (
                        <AtSign size={16} />
                      ) : (
                        <Share2 size={16} />
                      )}
                    </span>

                    <span className="bell-text">
                      <span>{item.message}</span>
                      <em>{ago(item.created_at)}</em>
                    </span>

                    {!item.is_read && <i className="bell-dot" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {flash && (
        <div
          className="bell-flash"
          onClick={() => {
            setFlash(null);
            setOpen(true);
          }}
        >
          <Bell size={16} />
          <span>{flash.message}</span>
        </div>
      )}
    </>
  );
}