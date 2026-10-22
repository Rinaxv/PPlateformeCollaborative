import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { io } from "socket.io-client";
import {
  ArrowLeft,
  FileText,
  MessageCircle,
  Search,
  Send,
  Smile,
  X,
} from "lucide-react";

import "./messenger.css";

const API_URL = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

const COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

const EMOJIS = [
  "😀", "😂", "😍", "👍", "🙏", "🎉", "❤️", "😮",
  "😢", "🔥", "👏", "🤔", "✅", "👀", "💡", "🚀",
];

/* =========================================================
   OUTILS
========================================================= */

function decodeToken(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");

    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    const payload = JSON.parse(json);

    return { id: Number(payload.id) || 0, name: payload.name || "Moi" };
  } catch {
    return { id: 0, name: "Moi" };
  }
}

const colorFor = (id) => COLORS[Math.abs(Number(id) || 0) % COLORS.length];

const parseDate = (value) => {
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const sameDay = (a, b) => a.toDateString() === b.toDateString();

function clock(value) {
  const date = parseDate(value);

  return date
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "";
}

function shortWhen(value) {
  const date = parseDate(value);

  if (!date) return "";

  const now = new Date();

  if (sameDay(date, now)) return clock(value);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(date, yesterday)) return "Hier";

  if ((now - date) / 86400000 < 7) {
    return date.toLocaleDateString("fr-FR", { weekday: "short" });
  }

  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function dayLabel(value) {
  const date = parseDate(value);

  if (!date) return "";

  const now = new Date();

  if (sameDay(date, now)) return "Aujourd'hui";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (sameDay(date, yesterday)) return "Hier";

  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function Avatar({ conversation, size = "" }) {
  if (conversation.type === "doc") {
    return (
      <span className={`ms-av doc ${size}`}>
        <FileText size={size === "small" ? 15 : 19} />
      </span>
    );
  }

  return (
    <span
      className={`ms-av ${size}`}
      style={{ background: colorFor(conversation.userId) }}
    >
      {conversation.title.charAt(0).toUpperCase()}
    </span>
  );
}

/* =========================================================
   MESSAGERIE
========================================================= */

export default function Messenger({
  token,
  documentId = null,
  lifted = false,
}) {
  const me = useMemo(() => decodeToken(token || ""), [token]);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const [open, setOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [query, setQuery] = useState("");

  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [otherRead, setOtherRead] = useState(0);
  const [typing, setTyping] = useState(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState("");

  const socketRef = useRef(null);
  const activeRef = useRef(null);
  const openRef = useRef(false);
  const listRef = useRef(null);
  const textareaRef = useRef(null);
  const stickRef = useRef(true);
  const skipScrollRef = useRef(false);
  const typingTimer = useRef(null);
  const lastTypingSent = useRef(0);
  const loadConversationsRef = useRef(() => {});
  const markReadRef = useRef(() => {});
  const touchRef = useRef(() => {});

  activeRef.current = active;
  openRef.current = open;

  /* ---------------- LISTE DES CONVERSATIONS ---------------- */

  const loadConversations = useCallback(async () => {
    if (!token) return;

    try {
      const response = await axios.get(`${API_URL}/chat/conversations`, {
        headers,
        params: documentId ? { doc: documentId } : {},
      });

      setConversations(
        Array.isArray(response.data?.items) ? response.data.items : []
      );
    } catch {
      // réseau indisponible : on réessaiera à la prochaine ouverture
    } finally {
      setLoadingList(false);
    }
  }, [token, headers, documentId]);

  loadConversationsRef.current = loadConversations;

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (open) loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const markRead = useCallback(
    async (channel) => {
      setConversations((previous) =>
        previous.map((item) =>
          item.channel === channel && item.unread
            ? { ...item, unread: 0 }
            : item
        )
      );

      try {
        await axios.post(`${API_URL}/chat/read`, { channel }, { headers });
      } catch {
        // sans importance : réessayé à la prochaine lecture
      }
    },
    [headers]
  );

  markReadRef.current = markRead;

  // Met à jour la liste quand un message arrive ou part
  touchRef.current = (channel, message, viewing) => {
    setConversations((previous) => {
      const index = previous.findIndex((item) => item.channel === channel);

      if (index === -1) {
        setTimeout(() => loadConversationsRef.current(), 0);
        return previous;
      }

      const current = previous[index];
      const incoming = message.sender_id !== me.id;

      const updated = {
        ...current,
        last: {
          body: message.body,
          sender_id: message.sender_id,
          created_at: message.created_at,
        },
        unread: incoming && !viewing ? current.unread + 1 : current.unread,
      };

      return [updated, ...previous.filter((_, i) => i !== index)];
    });
  };

  /* ---------------- TEMPS REEL ---------------- */

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(SOCKET_URL, { auth: { token } });

    socketRef.current = socket;

    socket.on("connect", () => loadConversationsRef.current());

    socket.on("chat-message", ({ channel, message } = {}) => {
      if (!message) return;

      const current = activeRef.current;
      const sameChannel = current && current.channel === channel;
      const viewing = openRef.current && sameChannel;

      if (sameChannel) {
        setMessages((previous) =>
          previous.some((item) => item.id === message.id)
            ? previous
            : [...previous, message]
        );

        setTyping((value) => (value && value.channel === channel ? null : value));
      }

      if (viewing && message.sender_id !== me.id) {
        markReadRef.current(channel);
      }

      touchRef.current(channel, message, viewing);
    });

    socket.on("chat-read", ({ channel, userId, lastReadId } = {}) => {
      const current = activeRef.current;

      if (userId === me.id) {
        setConversations((previous) =>
          previous.map((item) =>
            item.channel === channel ? { ...item, unread: 0 } : item
          )
        );

        return;
      }

      if (current && current.channel === channel) {
        setOtherRead((value) => Math.max(value, Number(lastReadId) || 0));
      }
    });

    socket.on("chat-typing", ({ channel, name } = {}) => {
      const current = activeRef.current;

      if (!current || current.channel !== channel) return;

      setTyping({ channel, name });

      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(null), 3500);
    });

    return () => {
      clearTimeout(typingTimer.current);
      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [token, me.id]);

  /* ---------------- OUVERTURE D'UNE CONVERSATION ---------------- */

  const openConversation = async (conversation) => {
    stickRef.current = true;

    setActive(conversation);
    setMessages([]);
    setHasMore(false);
    setOtherRead(0);
    setTyping(null);
    setError("");
    setEmojiOpen(false);
    setLoadingMessages(true);

    try {
      const response = await axios.get(`${API_URL}/chat/messages`, {
        headers,
        params: { channel: conversation.channel },
      });

      if (
        activeRef.current &&
        activeRef.current.channel !== conversation.channel
      ) {
        return;
      }

      setMessages(response.data.messages || []);
      setHasMore(Boolean(response.data.hasMore));
      setOtherRead(Number(response.data.otherRead) || 0);
    } catch (err) {
      setError(
        err.response?.data?.message || "Impossible de charger la discussion."
      );
    } finally {
      setLoadingMessages(false);
    }

    markRead(conversation.channel);
  };

  const goBack = () => {
    setActive(null);
    setMessages([]);
    setDraft("");
    setError("");
    setEmojiOpen(false);
    loadConversations();
  };

  useEffect(() => {
    if (open && active) {
      markReadRef.current(active.channel);
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active?.channel]);

  const loadOlder = async () => {
    const first = messages[0];

    if (!first || !active) return;

    const element = listRef.current;
    const previousHeight = element ? element.scrollHeight : 0;

    try {
      const response = await axios.get(`${API_URL}/chat/messages`, {
        headers,
        params: { channel: active.channel, before: first.id },
      });

      skipScrollRef.current = true;

      setMessages((previous) => [...(response.data.messages || []), ...previous]);
      setHasMore(Boolean(response.data.hasMore));

      requestAnimationFrame(() => {
        if (element) {
          element.scrollTop = element.scrollHeight - previousHeight;
        }
      });
    } catch (err) {
      setError(err.response?.data?.message || "Impossible de charger plus.");
    }
  };

  /* ---------------- DEFILEMENT ---------------- */

  useEffect(() => {
    const element = listRef.current;

    if (!element) return;

    if (skipScrollRef.current) {
      skipScrollRef.current = false;
      return;
    }

    if (stickRef.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, typing, active, loadingMessages]);

  /* ---------------- ENVOI ---------------- */

  const send = async () => {
    const body = draft.trim();

    if (!body || sending || !active) return;

    setSending(true);
    setError("");

    try {
      const response = await axios.post(
        `${API_URL}/chat/messages`,
        { channel: active.channel, body },
        { headers }
      );

      const message = response.data;

      stickRef.current = true;

      setDraft("");
      setEmojiOpen(false);

      if (textareaRef.current) textareaRef.current.style.height = "auto";

      setMessages((previous) =>
        previous.some((item) => item.id === message.id)
          ? previous
          : [...previous, message]
      );

      touchRef.current(active.channel, message, true);

      textareaRef.current?.focus();
    } catch (err) {
      setError(
        err.response?.data?.message || "Le message n'a pas pu être envoyé."
      );
    } finally {
      setSending(false);
    }
  };

  const onType = (value) => {
    setDraft(value);

    const now = Date.now();

    if (active && value.trim() && now - lastTypingSent.current > 2500) {
      lastTypingSent.current = now;
      socketRef.current?.emit("chat-typing", { channel: active.channel });
    }
  };

  const addEmoji = (emoji) => {
    setDraft((value) => value + emoji);
    textareaRef.current?.focus();
  };

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && openRef.current) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------- DONNEES CALCULEES ---------------- */

  const totalUnread = conversations.reduce(
    (sum, item) => sum + (item.unread || 0),
    0
  );

  const ordered = useMemo(() => {
    const term = query.trim().toLowerCase();

    const filtered = conversations.filter(
      (item) =>
        !term ||
        item.title.toLowerCase().includes(term) ||
        (item.subtitle || "").toLowerCase().includes(term)
    );

    const pinned = filtered.filter(
      (item) => item.type === "doc" && item.documentId === documentId
    );

    return [...pinned, ...filtered.filter((item) => !pinned.includes(item))];
  }, [conversations, query, documentId]);

  const rows = useMemo(() => {
    const out = [];
    const gap = (a, b) => !a || !b || Math.abs(b - a) > 5 * 60000;

    messages.forEach((message, index) => {
      const previous = messages[index - 1];
      const next = messages[index + 1];
      const date = parseDate(message.created_at);
      const previousDate = previous ? parseDate(previous.created_at) : null;
      const nextDate = next ? parseDate(next.created_at) : null;

      const newDay = !previousDate || !date || !sameDay(date, previousDate);

      if (newDay) {
        out.push({
          kind: "day",
          key: `day-${message.id}`,
          label: dayLabel(message.created_at),
        });
      }

      const nextNewDay = next && nextDate && date && !sameDay(date, nextDate);

      out.push({
        kind: "msg",
        message,
        firstOfGroup:
          !previous ||
          newDay ||
          previous.sender_id !== message.sender_id ||
          gap(previousDate, date),
        lastOfGroup:
          !next ||
          nextNewDay ||
          next.sender_id !== message.sender_id ||
          gap(date, nextDate),
      });
    });

    return out;
  }, [messages]);

  const lastOwnId = useMemo(() => {
    const own = [...messages].reverse().find((item) => item.sender_id === me.id);

    return own ? own.id : null;
  }, [messages, me.id]);

  /* ---------------- INTERFACE ---------------- */

  return (
    <>
      <button
        type="button"
        className={`ms-launcher${lifted ? " lifted" : ""}${open ? " open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Messages"
        title="Messages"
      >
        {open ? <X size={24} /> : <MessageCircle size={26} />}

        {!open && totalUnread > 0 && (
          <span className="ms-badge">{totalUnread > 9 ? "9+" : totalUnread}</span>
        )}
      </button>

      {open && (
        <section
          className={`ms-dock${lifted ? " lifted" : ""}`}
          role="dialog"
          aria-label="Messagerie"
        >
          {!active ? (
            <>
              <header className="ms-head">
                <h3>Discussions</h3>

                <button
                  type="button"
                  className="ms-icon"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </header>

              <div className="ms-search">
                <Search size={15} />

                <input
                  type="text"
                  value={query}
                  placeholder="Rechercher une personne ou un document"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <div className="ms-list">
                {loadingList ? (
                  [0, 1, 2, 3].map((item) => (
                    <div key={item} className="ms-skeleton" />
                  ))
                ) : ordered.length === 0 ? (
                  <p className="ms-empty">
                    {query
                      ? "Aucun résultat."
                      : "Aucune discussion pour le moment. Partagez un document avec quelqu'un pour pouvoir lui écrire."}
                  </p>
                ) : (
                  ordered.map((item) => (
                    <button
                      key={item.channel}
                      type="button"
                      className={item.unread ? "ms-row unread" : "ms-row"}
                      onClick={() => openConversation(item)}
                    >
                      <Avatar conversation={item} />

                      <span className="ms-row-body">
                        <span className="ms-row-top">
                          <strong>{item.title}</strong>

                          {item.last && (
                            <time>{shortWhen(item.last.created_at)}</time>
                          )}
                        </span>

                        <span className="ms-row-preview">
                          {item.type === "doc" && (
                            <em className="ms-tag">Document</em>
                          )}

                          <span>
                            {item.last
                              ? `${
                                  item.last.sender_id === me.id ? "Vous : " : ""
                                }${item.last.body}`
                              : item.type === "doc"
                              ? "Lancez la discussion"
                              : "Dites bonjour 👋"}
                          </span>
                        </span>
                      </span>

                      {item.unread > 0 && (
                        <span className="ms-count">
                          {item.unread > 9 ? "9+" : item.unread}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <header className="ms-head chat">
                <button
                  type="button"
                  className="ms-icon"
                  onClick={goBack}
                  aria-label="Retour aux discussions"
                >
                  <ArrowLeft size={18} />
                </button>

                <Avatar conversation={active} size="small" />

                <div className="ms-head-title">
                  <strong>{active.title}</strong>
                  <span>{active.subtitle}</span>
                </div>

                <button
                  type="button"
                  className="ms-icon"
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </header>

              <div
                className="ms-messages"
                ref={listRef}
                onScroll={(event) => {
                  const el = event.currentTarget;

                  stickRef.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
              >
                {hasMore && (
                  <button type="button" className="ms-more" onClick={loadOlder}>
                    Messages précédents
                  </button>
                )}

                {loadingMessages && (
                  <p className="ms-empty">Chargement…</p>
                )}

                {!loadingMessages && messages.length === 0 && !error && (
                  <p className="ms-empty">
                    Aucun message. Écrivez le premier !
                  </p>
                )}

                {rows.map((row) => {
                  if (row.kind === "day") {
                    return (
                      <div key={row.key} className="ms-day">
                        <span>{row.label}</span>
                      </div>
                    );
                  }

                  const { message, firstOfGroup, lastOfGroup } = row;
                  const mine = message.sender_id === me.id;

                  return (
                    <div
                      key={message.id}
                      className={`ms-msg ${mine ? "mine" : "theirs"}${
                        firstOfGroup ? " first" : ""
                      }${lastOfGroup ? " last" : ""}`}
                    >
                      {!mine && (
                        <span
                          className={`ms-av tiny${lastOfGroup ? "" : " ghost"}`}
                          style={{ background: colorFor(message.sender_id) }}
                        >
                          {(message.sender_name || "U").charAt(0).toUpperCase()}
                        </span>
                      )}

                      <div className="ms-col">
                        {!mine && active.type === "doc" && firstOfGroup && (
                          <span className="ms-sender">
                            {message.sender_name || "Utilisateur"}
                          </span>
                        )}

                        <div
                          className="ms-bubble"
                          title={`${dayLabel(message.created_at)} ${clock(
                            message.created_at
                          )}`}
                        >
                          {message.body}
                        </div>

                        {lastOfGroup && (
                          <span className="ms-meta">
                            {clock(message.created_at)}

                            {mine &&
                              message.id === lastOwnId &&
                              active.type === "dm" &&
                              (otherRead >= message.id ? " · Vu" : " · Envoyé")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {typing && typing.channel === active.channel && (
                  <div className="ms-msg theirs last typing">
                    <span className="ms-av tiny ghost" />

                    <div className="ms-col">
                      <div className="ms-bubble dots">
                        <i />
                        <i />
                        <i />
                      </div>

                      <span className="ms-meta">{typing.name} écrit…</span>
                    </div>
                  </div>
                )}
              </div>

              <footer className="ms-composer">
                {error && <div className="ms-error">{error}</div>}

                {emojiOpen && (
                  <div className="ms-emojis">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => addEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                <div className="ms-input-row">
                  <button
                    type="button"
                    className={emojiOpen ? "ms-icon on" : "ms-icon"}
                    onClick={() => setEmojiOpen((value) => !value)}
                    aria-label="Emojis"
                  >
                    <Smile size={20} />
                  </button>

                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={draft}
                    maxLength={2000}
                    placeholder="Écrivez un message…"
                    onChange={(event) => {
                      onType(event.target.value);

                      event.target.style.height = "auto";
                      event.target.style.height = `${Math.min(
                        event.target.scrollHeight,
                        110
                      )}px`;
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        send();
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="ms-send"
                    onClick={send}
                    disabled={!draft.trim() || sending}
                    aria-label="Envoyer"
                    title="Envoyer (Entrée)"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      )}
    </>
  );
}