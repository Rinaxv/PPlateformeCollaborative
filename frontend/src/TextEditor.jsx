import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
} from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
  Table,
  TableRow,
  TableHeader,
  TableCell,
} from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import ImageExtension from "@tiptap/extension-image";

import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { io } from "socket.io-client";
import axios from "axios";

import {
  ArrowLeft,
  Save,
  Undo2,
  Redo2,
  Share2,
  Wifi,
  WifiOff,
  LoaderCircle,
  Info,
  FileUp,
  Download,
  Printer,
  History,
  X,
  Search,
  ChevronUp,
  ChevronDown,
  BookOpen,
  FileText,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import html2pdf from "html2pdf.js";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import VersionHistory from "./VersionHistory";
import { Ribbon, PAGE_SIZES, MARGINS, DEFAULT_PAGE } from "./Ribbon";
import {
  PageBreak,
  LineSpacing,
  SearchReplace,
  searchKey,
} from "./customExtensions";
import { useTheme } from "./theme";

import "./TextEditor.css";
import "./extras.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/* =========================================================
   CONFIGURATION
========================================================= */

const API_URL = "http://localhost:5000/api";
const SOCKET_URL = "http://localhost:5000";

const CURSOR_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

const DEFAULT_PT = { small: 10.5, medium: 12, large: 13.5 };

const PX_TO_MM = 0.2646;

const PRINT_CSS = `
body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12pt;line-height:1.4;color:#111}
p{margin:0 0 .6em;min-height:1.4em}
h1{font-size:1.8em}h2{font-size:1.4em}h3{font-size:1.17em}
h1,h2,h3{margin:.9em 0 .4em;line-height:1.25;break-after:avoid}
ul,ol{padding-left:1.6em}
blockquote{margin-left:0;padding-left:14px;border-left:3px solid #cbd5e1;color:#475569;font-style:italic}
pre{background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px;white-space:pre-wrap}
code{font-family:Consolas,monospace}
img{max-width:100%;height:auto}
table{border-collapse:collapse;width:100%;table-layout:fixed;margin:.6em 0}
td,th{border:1px solid #777;padding:5px 8px;vertical-align:top}
th{background:#eef2f7}
ul[data-type="taskList"]{list-style:none;padding-left:.2em}
ul[data-type="taskList"] li{display:flex;gap:.5em}
ul[data-type="taskList"] li>div{flex:1}
div[data-type="page-break"]{break-after:page;height:0;margin:0;border:0}
hr{border:none;border-top:1px solid #ccc;margin:1em 0}
`;

const TABS = [
  { id: "home", label: "Accueil" },
  { id: "insert", label: "Insertion" },
  { id: "layout", label: "Mise en page" },
  { id: "review", label: "Révision" },
  { id: "view", label: "Affichage" },
];

/* =========================================================
   OUTILS
========================================================= */

function getUserFromToken(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");

    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );

    const payload = JSON.parse(json);
    const id = Number(payload.id) || 0;

    return {
      name: payload.name || "Utilisateur",
      color: CURSOR_COLORS[id % CURSOR_COLORS.length],
    };
  } catch {
    return { name: "Utilisateur", color: CURSOR_COLORS[0] };
  }
}

function plainTextToTiptap(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");

  return {
    type: "doc",
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : [],
    })),
  };
}

function jsonHasContent(node) {
  if (!node || typeof node !== "object") {
    return false;
  }

  if (node.type === "text") {
    return Boolean(node.text && node.text.trim());
  }

  if (node.type === "pageBreak" || node.type === "image") {
    return true;
  }

  if (Array.isArray(node.content)) {
    return node.content.some(jsonHasContent);
  }

  return false;
}

function convertRestContentToTiptap(documentContent) {
  if (!documentContent) {
    return null;
  }

  if (
    typeof documentContent === "object" &&
    (documentContent.type === "doc" || Array.isArray(documentContent.content))
  ) {
    return { type: "doc", content: documentContent.content || [] };
  }

  if (
    typeof documentContent === "object" &&
    typeof documentContent.text === "string"
  ) {
    return plainTextToTiptap(documentContent.text);
  }

  if (typeof documentContent === "string") {
    return plainTextToTiptap(documentContent);
  }

  return null;
}

function normalizePage(page) {
  const safe = page && typeof page === "object" ? page : {};

  return {
    size: PAGE_SIZES[safe.size] ? safe.size : DEFAULT_PAGE.size,
    orientation:
      safe.orientation === "landscape" ? "landscape" : "portrait",
    margin: MARGINS[safe.margin] ? safe.margin : DEFAULT_PAGE.margin,
  };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return window.btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Réduit l'image pour ne pas alourdir la base de données ni la synchronisation
function compressImage(file, maxSide = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Lecture de l'image impossible."));

    reader.onload = () => {
      const img = new window.Image();

      img.onerror = () => reject(new Error("Image invalide."));

      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

/* =========================================================
   IMPORT : WORD
========================================================= */

async function wordToHtml(arrayBuffer) {
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      styleMap: [
        "u => u",
        "strike => s",
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Titre'] => h1:fresh",
        "p[style-name='Sous-titre'] => h2:fresh",
      ],
    }
  );

  return String(result.value || "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "<p></p>");
}

/* =========================================================
   IMPORT : PDF
========================================================= */

async function pdfToText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
  }).promise;

  const pagesText = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const items = textContent.items
      .filter((item) => "str" in item && item.str.trim() !== "")
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        height: Math.abs(item.height) || Math.abs(item.transform[3]) || 10,
      }));

    const lines = [];

    items
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .forEach((item) => {
        const line = lines.find(
          (candidate) => Math.abs(candidate.y - item.y) < item.height * 0.5
        );

        if (line) {
          line.items.push(item);
        } else {
          lines.push({ y: item.y, height: item.height, items: [item] });
        }
      });

    lines.sort((a, b) => b.y - a.y);

    const output = [];
    let previousY = null;

    lines.forEach((line) => {
      const text = line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();

      if (!text) return;

      if (previousY !== null && previousY - line.y > line.height * 1.9) {
        output.push("");
      }

      output.push(text);
      previousY = line.y;
    });

    pagesText.push(output.join("\n"));
  }

  return pagesText.join("\n\n");
}

/* =========================================================
   EDITEUR
========================================================= */

export default function TextEditor({
  document: documentProp = null,
  documentId: documentIdProp = null,
  documentTitle: documentTitleProp = null,
  token = null,
  readOnly = false,
  onSaved,
  onClose,
  onShare,
}) {
  const documentId = documentProp?.id || documentIdProp || "document-test-001";

  const initialTitle =
    documentProp?.content?.title || documentTitleProp || "Document sans titre";

  const { preferences, resolvedMode, update: updateTheme } = useTheme();

  /* ---------------- ETATS ---------------- */

  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState("Connexion...");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [collaborators, setCollaborators] = useState(0);
  const [importing, setImporting] = useState(false);
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState([]);

  const [activeTab, setActiveTab] = useState("home");
  const [showBackstage, setShowBackstage] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const [pageSetup, setPageSetup] = useState(DEFAULT_PAGE);
  const [zoom, setZoom] = useState(100);
  const [showRuler, setShowRuler] = useState(true);
  const [readingMode, setReadingMode] = useState(false);
  const [spell, setSpell] = useState(true);

  const [findOpen, setFindOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);

  const [contentHeight, setContentHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  /* ---------------- REFS ---------------- */

  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const docAreaRef = useRef(null);
  const pageRef = useRef(null);
  const socketRef = useRef(null);
  const saveRef = useRef(() => {});
  const printRef = useRef(() => {});

  const documentPropRef = useRef(documentProp);
  documentPropRef.current = documentProp;

  const runIdRef = useRef(0);
  const restLoadedRef = useRef(false);
  const pendingRestRef = useRef(null);
  const restHadTextRef = useRef(false);
  const mergedRef = useRef(false);
  const seedingRef = useRef(false);
  const serverHasStateRef = useRef(null);
  const syncedOnceRef = useRef(false);
  const remoteUpdateRef = useRef(false);
  const trySeedRef = useRef(() => {});
  const aliveRef = useRef(true);

  /* ---------------- YJS + PRESENCE ---------------- */

  const [yDoc] = useState(() => new Y.Doc());
  const [awareness] = useState(() => new Awareness(yDoc));
  const currentUser = useMemo(() => getUserFromToken(token || ""), [token]);

  useEffect(() => {
    aliveRef.current = true;

    return () => {
      aliveRef.current = false;

      setTimeout(() => {
        if (!aliveRef.current) {
          awareness.destroy();
        }
      }, 0);
    };
  }, [awareness]);

  /* ---------------- EDITEUR TIPTAP ---------------- */

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        link: { openOnClick: false },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Subscript,
      Superscript,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      ImageExtension.configure({ allowBase64: true }),
      Placeholder.configure({
        placeholder: "Commencez à rédiger votre document...",
      }),
      PageBreak,
      LineSpacing,
      SearchReplace,
      Collaboration.configure({ document: yDoc }),
      CollaborationCaret.configure({
        provider: { awareness },
        user: currentUser,
      }),
    ],
    content: "",
    editable: !readOnly,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "tiptap-editor-content",
        spellcheck: "true",
        lang: "fr",
      },
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly && !readingMode);
    }
  }, [editor, readOnly, readingMode]);

  useEffect(() => {
    if (!editor) return;

    editor.setOptions({
      editorProps: {
        attributes: {
          class: "tiptap-editor-content",
          spellcheck: String(spell),
          lang: "fr",
        },
      },
    });
  }, [editor, spell]);

  useEffect(() => {
    setTitle(
      documentProp?.content?.title || documentTitleProp || "Document sans titre"
    );
  }, [documentProp, documentTitleProp]);

  /* ---------------- DONNEES CALCULEES ---------------- */

  const pageDef = PAGE_SIZES[pageSetup.size] || PAGE_SIZES.A4;
  const landscape = pageSetup.orientation === "landscape";
  const pageW = landscape ? pageDef.h : pageDef.w;
  const pageH = landscape ? pageDef.w : pageDef.h;
  const marginPx = (MARGINS[pageSetup.margin] || MARGINS.normal).px;
  const zoomFactor = zoom / 100;

  const pages = Math.max(
    1,
    Math.ceil((contentHeight + marginPx * 2) / pageH)
  );

  const currentPage = Math.min(
    pages,
    Math.max(1, Math.floor((scrollTop + 200) / (pageH * zoomFactor)) + 1)
  );

  const isDark = resolvedMode === "dark";
  const defaultPt = DEFAULT_PT[preferences.editorFontSize] || 12;

  const searchState = editor ? searchKey.getState(editor.state) : null;
  const searchCount = searchState?.results.length || 0;
  const searchCurrent = searchState?.current || 0;

  const stats = useMemo(() => {
    if (!editor) {
      return { words: 0, chars: 0, charsNoSpaces: 0, paragraphs: 0 };
    }

    const doc = editor.state.doc;
    const text = doc.textBetween(0, doc.content.size, "\n", " ");
    const trimmed = text.trim();

    let paragraphs = 0;

    doc.descendants((node) => {
      if (
        (node.type.name === "paragraph" || node.type.name === "heading") &&
        node.textContent.trim()
      ) {
        paragraphs += 1;
      }
    });

    return {
      words: trimmed ? trimmed.split(/\s+/).length : 0,
      chars: text.replace(/\n/g, "").length,
      charsNoSpaces: text.replace(/\s/g, "").length,
      paragraphs,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.state.doc]);

  const inTable = Boolean(editor?.isActive("table"));

  useEffect(() => {
    if (activeTab === "table" && !inTable) {
      setActiveTab("home");
    }
  }, [activeTab, inTable]);

  /* ---------------- MESURE DES PAGES ---------------- */

  useEffect(() => {
    if (!editor) return undefined;

    let observer = null;
    let cancelled = false;

    const timer = setTimeout(() => {
      const element = pageRef.current?.querySelector(".tiptap-editor-content");

      if (!element || cancelled) return;

      const measure = () => setContentHeight(element.offsetHeight);

      measure();

      observer = new ResizeObserver(measure);
      observer.observe(element);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [editor]);

  /* ---------------- RECHERCHE ---------------- */

  useEffect(() => {
    if (!editor) return;

    editor.commands.setSearchTerm(findOpen ? findTerm : "", caseSensitive);
  }, [editor, findOpen, findTerm, caseSensitive]);

  useEffect(() => {
    if (!editor || !findOpen || searchCount === 0) return undefined;

    const timer = setTimeout(() => {
      editor.view.dom
        .querySelector(".search-match.current")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 30);

    return () => clearTimeout(timer);
  }, [editor, findOpen, searchCurrent, searchCount, findTerm]);

  const openFind = useCallback((withReplace) => {
    setFindOpen(true);
    setReplaceMode(Boolean(withReplace));
  }, []);

  /* ---------------- DOCUMENT VIDE ? ---------------- */

  const isEditorEmpty = () => {
    if (!editor) {
      return true;
    }

    return !jsonHasContent(editor.getJSON());
  };

  /* =========================================================
     INJECTION UNIQUE DU CONTENU REST
  ========================================================= */

  const claimSeed = () =>
    new Promise((resolve) => {
      const socket = socketRef.current;

      if (!socket || !socket.connected) {
        resolve(false);
        return;
      }

      const timer = setTimeout(() => resolve(false), 5000);

      socket.emit("yjs-claim-seed", { documentId }, (response) => {
        clearTimeout(timer);
        resolve(response?.granted === true);
      });
    });

  trySeedRef.current = async () => {
    if (!editor || editor.isDestroyed) return;
    if (mergedRef.current || seedingRef.current) return;
    if (!restLoadedRef.current) return;
    if (serverHasStateRef.current === null) return;

    const runId = runIdRef.current;

    const finish = () => {
      mergedRef.current = true;
      pendingRestRef.current = null;
      setReady(true);
    };

    const pending = pendingRestRef.current;

    const needsSeed =
      !readOnly &&
      serverHasStateRef.current === false &&
      pending &&
      jsonHasContent(pending);

    if (!needsSeed) {
      finish();
      return;
    }

    seedingRef.current = true;
    const granted = await claimSeed();
    seedingRef.current = false;

    if (runId !== runIdRef.current || editor.isDestroyed) {
      return;
    }

    if (granted && isEditorEmpty()) {
      editor.commands.setContent(pending);
    }

    finish();
  };

  /* =========================================================
     CHARGEMENT REST (sauvegarde de secours)
  ========================================================= */

  useEffect(() => {
    if (!editor || !documentId) {
      return undefined;
    }

    let cancelled = false;

    runIdRef.current += 1;
    restLoadedRef.current = false;
    mergedRef.current = false;
    seedingRef.current = false;
    pendingRestRef.current = null;
    setReady(false);

    async function loadDocument() {
      try {
        setLoading(true);
        setErrorMessage("");

        let documentContent = null;

        if (documentPropRef.current?.content) {
          documentContent = documentPropRef.current.content;
        } else {
          const headers = token ? { Authorization: `Bearer ${token}` } : {};

          const response = await axios.get(
            `${API_URL}/documents/${documentId}`,
            { headers }
          );

          if (cancelled) return;

          const loadedDocument = response.data?.document || response.data;

          if (!loadedDocument) {
            throw new Error("Document introuvable.");
          }

          documentContent = loadedDocument.content;
        }

        const loadedContent = convertRestContentToTiptap(documentContent);

        setTitle(
          documentContent?.title || documentTitleProp || "Document sans titre"
        );

        setPageSetup(normalizePage(documentContent?.page));

        pendingRestRef.current = loadedContent;
        restHadTextRef.current = jsonHasContent(loadedContent);
        restLoadedRef.current = true;

        trySeedRef.current();
      } catch (error) {
        console.error("Erreur chargement document :", error);

        if (!cancelled) {
          setErrorMessage("Impossible de charger le document.");
          setStatus("Erreur");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [editor, documentId, token]);

  /* =========================================================
     SOCKET.IO + YJS + PRESENCE
  ========================================================= */

  useEffect(() => {
    if (!editor || !documentId) {
      return undefined;
    }

    serverHasStateRef.current = null;
    syncedOnceRef.current = false;

    const socket = io(SOCKET_URL, token ? { auth: { token } } : {});

    socketRef.current = socket;

    const refreshPeers = () => {
      const list = [];

      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID || !state?.user) {
          return;
        }

        list.push({
          id: clientId,
          name: state.user.name || "Utilisateur",
          color: state.user.color || "#2563eb",
        });
      });

      setPeers(list);
    };

    const broadcastAwareness = () => {
      if (!socket.connected || !awareness.getLocalState()) {
        return;
      }

      socket.emit("awareness-update", {
        documentId,
        clientId: awareness.clientID,
        update: arrayBufferToBase64(
          encodeAwarenessUpdate(awareness, [awareness.clientID])
        ),
      });
    };

    const handleAwarenessUpdate = ({ added, updated }, origin) => {
      if (origin === "remote") {
        return;
      }

      const changed = [...added, ...updated].filter(
        (id) => id === awareness.clientID
      );

      if (changed.length > 0) {
        broadcastAwareness();
      }
    };

    const handleAwarenessChange = () => refreshPeers();

    function handleRemoteAwareness(data) {
      if (!data?.update) return;

      if (data.documentId && String(data.documentId) !== String(documentId)) {
        return;
      }

      try {
        applyAwarenessUpdate(
          awareness,
          base64ToUint8Array(data.update),
          "remote"
        );
      } catch (error) {
        console.error("Erreur présence :", error);
      }
    }

    function handleAwarenessRemove(data) {
      if (!Array.isArray(data?.clientIds)) return;

      removeAwarenessStates(
        awareness,
        data.clientIds.filter((id) => id !== awareness.clientID),
        "remote"
      );
    }

    function handleConnect() {
      setStatus("Connecté");
      setErrorMessage("");
      socket.emit("yjs-join", { documentId });
    }

    function handleConnectError(error) {
      console.error("Socket.IO error :", error.message);
      setStatus("Hors-ligne");
      setErrorMessage(
        "Connexion temps réel impossible. Vérifiez que le backend est démarré."
      );
    }

    function handleDisconnect() {
      setStatus("Hors-ligne");
      setCollaborators(0);

      removeAwarenessStates(
        awareness,
        [...awareness.getStates().keys()].filter(
          (id) => id !== awareness.clientID
        ),
        "remote"
      );
    }

    function handleSync(data) {
      if (!data || !data.update) return;

      if (data.documentId && String(data.documentId) !== String(documentId)) {
        return;
      }

      try {
        remoteUpdateRef.current = true;
        Y.applyUpdate(yDoc, base64ToUint8Array(data.update), "remote");
      } catch (error) {
        console.error("Erreur synchronisation Yjs :", error);
        return;
      } finally {
        remoteUpdateRef.current = false;
      }

      serverHasStateRef.current = data.hasState === true;

      const firstSync = !syncedOnceRef.current;
      syncedOnceRef.current = true;

      if (!firstSync && !readOnly) {
        socket.emit("yjs-sync", {
          documentId,
          update: arrayBufferToBase64(Y.encodeStateAsUpdate(yDoc)),
        });
      }

      setStatus("Synchronisé");
      broadcastAwareness();
      trySeedRef.current();
    }

    function handleRemoteUpdate(data) {
      if (!data || !data.update) return;

      if (data.documentId && String(data.documentId) !== String(documentId)) {
        return;
      }

      try {
        remoteUpdateRef.current = true;
        Y.applyUpdate(yDoc, base64ToUint8Array(data.update), "remote");
        setStatus("Synchronisé");
      } catch (error) {
        console.error("Erreur réception modification :", error);
      } finally {
        remoteUpdateRef.current = false;
      }
    }

    function handleYjsUsers(data) {
      if (!data) return;

      if (data.documentId && String(data.documentId) !== String(documentId)) {
        return;
      }

      setCollaborators(Number(data.count) || 0);
      broadcastAwareness();
    }

    function handleYjsError(data) {
      setErrorMessage(data?.message || "Erreur de collaboration.");
    }

    function handleLocalUpdate(update, origin) {
      if (origin === "remote" || remoteUpdateRef.current) {
        return;
      }

      if (!socket.connected) {
        setStatus("Hors-ligne");
        return;
      }

      socket.emit("yjs-update", {
        documentId,
        update: arrayBufferToBase64(update),
      });

      setSaved(false);
      setStatus("Modification...");
    }

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("yjs-sync", handleSync);
    socket.on("yjs-update", handleRemoteUpdate);
    socket.on("yjs-users", handleYjsUsers);
    socket.on("yjs-error", handleYjsError);
    socket.on("awareness-update", handleRemoteAwareness);
    socket.on("awareness-remove", handleAwarenessRemove);

    yDoc.on("update", handleLocalUpdate);
    awareness.on("update", handleAwarenessUpdate);
    awareness.on("change", handleAwarenessChange);

    refreshPeers();

    return () => {
      yDoc.off("update", handleLocalUpdate);
      awareness.off("update", handleAwarenessUpdate);
      awareness.off("change", handleAwarenessChange);

      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("yjs-sync", handleSync);
      socket.off("yjs-update", handleRemoteUpdate);
      socket.off("yjs-users", handleYjsUsers);
      socket.off("yjs-error", handleYjsError);
      socket.off("awareness-update", handleRemoteAwareness);
      socket.off("awareness-remove", handleAwarenessRemove);

      socket.disconnect();

      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setCollaborators(0);
      setPeers([]);
    };
  }, [editor, documentId, token, yDoc, awareness, readOnly]);

  /* =========================================================
     ENREGISTREMENT REST (+ version dans l'historique)
  ========================================================= */

  const handleSave = async (titleOverride, versionLabel) => {
    if (!editor || !documentId || saving) {
      return;
    }

    if (!ready) {
      setErrorMessage("Synchronisation en cours. Réessayez dans un instant.");
      return;
    }

    if (readOnly) {
      return;
    }

    const finalTitle =
      typeof titleOverride === "string" ? titleOverride : title;

    if (
      isEditorEmpty() &&
      restHadTextRef.current &&
      !window.confirm(
        "Le document est vide. L'enregistrer écrasera la version précédente. Continuer ?"
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      setSaved(false);
      setErrorMessage("");

      const tiptapContent = editor.getJSON();

      const headers = { "Content-Type": "application/json" };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const contentToSave = {
        type: "doc",
        title: String(finalTitle || "").trim() || "Document sans titre",
        page: pageSetup,
        content: tiptapContent.content || [],
      };

      await axios.put(
        `${API_URL}/documents/${documentId}`,
        { content: contentToSave },
        { headers }
      );

      axios
        .post(
          `${API_URL}/documents/${documentId}/versions`,
          {
            content: contentToSave,
            label: typeof versionLabel === "string" ? versionLabel : undefined,
          },
          { headers }
        )
        .catch((error) =>
          console.warn("Version non enregistrée :", error.message)
        );

      restHadTextRef.current = jsonHasContent(tiptapContent);

      setSaved(true);
      setStatus("Enregistré");

      if (typeof onSaved === "function") {
        await onSaved();
      }

      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.error("Erreur sauvegarde :", error.response?.data || error.message);

      setErrorMessage(
        error.response?.data?.message ||
          "Erreur lors de l'enregistrement du document."
      );

      setStatus("Erreur");
    } finally {
      setSaving(false);
    }
  };

  saveRef.current = () => handleSave();

  /* =========================================================
     RESTAURATION D'UNE VERSION
  ========================================================= */

  const handleRestoreVersion = async (versionContent, versionTitle) => {
    if (!editor || readOnly) {
      throw new Error("Restauration impossible.");
    }

    const restored = convertRestContentToTiptap(versionContent);

    if (!restored) {
      throw new Error("Version invalide.");
    }

    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      await axios.post(
        `${API_URL}/documents/${documentId}/versions`,
        {
          content: {
            type: "doc",
            title: String(title || "").trim() || "Document sans titre",
            page: pageSetup,
            content: editor.getJSON().content || [],
          },
          label: "Avant restauration",
        },
        { headers }
      );
    } catch (error) {
      console.warn("Sauvegarde avant restauration impossible :", error.message);
    }

    editor.commands.setContent(restored);

    if (versionContent?.page) {
      setPageSetup(normalizePage(versionContent.page));
    }

    const restoredTitle =
      typeof versionTitle === "string" && versionTitle.trim()
        ? versionTitle
        : title;

    setTitle(restoredTitle);

    await handleSave(restoredTitle, "Restauration");
  };

  /* =========================================================
     IMPORT WORD / PDF
  ========================================================= */

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !editor) return;

    if (readOnly) {
      setErrorMessage("Vous n'avez pas le droit de modifier ce document.");
      return;
    }

    if (!ready) {
      setErrorMessage("Synchronisation en cours. Réessayez dans un instant.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension !== "docx" && extension !== "pdf") {
      setErrorMessage(
        "Formats acceptés : Word .docx et PDF .pdf (l'ancien format .doc n'est pas pris en charge)."
      );
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage("Fichier trop volumineux (15 Mo maximum).");
      return;
    }

    if (
      editor.getText().trim() &&
      !window.confirm(
        "Importer ce fichier remplacera le contenu actuel. Continuer ?"
      )
    ) {
      return;
    }

    setImporting(true);
    setErrorMessage("");
    setSaved(false);

    try {
      const buffer = await file.arrayBuffer();

      if (extension === "docx") {
        const html = await wordToHtml(buffer);

        if (!html.replace(/<[^>]*>/g, "").trim()) {
          throw new Error("Ce document Word ne contient aucun texte.");
        }

        editor.commands.setContent(html);
      } else {
        const text = await pdfToText(buffer);

        if (!text.trim()) {
          throw new Error(
            "Aucun texte extractible. Si le PDF est scanné, il nécessite une reconnaissance OCR."
          );
        }

        editor.commands.setContent(plainTextToTiptap(text));
      }

      const importedTitle =
        file.name.replace(/\.(docx|pdf)$/i, "").trim() || "Document importé";

      setTitle(importedTitle);
      setStatus("Fichier importé — enregistrement...");

      await handleSave(importedTitle, "Import");
    } catch (error) {
      console.error("Erreur import document :", error);
      setErrorMessage(error.message || "Impossible d'importer ce fichier.");
      setStatus("Erreur d'importation");
    } finally {
      setImporting(false);
    }
  };

  /* =========================================================
     INSERTION D'IMAGE
  ========================================================= */

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !editor) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Ce fichier n'est pas une image.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage("Image trop volumineuse (10 Mo maximum).");
      return;
    }

    try {
      const src = await compressImage(file);

      editor.chain().focus().setImage({ src, alt: file.name }).run();
    } catch (error) {
      setErrorMessage(error.message || "Impossible d'insérer l'image.");
    }
  };

  /* =========================================================
     COLLER
  ========================================================= */

  const handlePasteButton = async () => {
    if (!editor) return;

    try {
      const text = await navigator.clipboard.readText();

      if (!text) return;

      const lines = text.replace(/\r\n/g, "\n").split("\n");

      if (lines.length === 1) {
        editor.chain().focus().insertContent(text).run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent(
            lines.map((line) => ({
              type: "paragraph",
              content: line ? [{ type: "text", text: line }] : [],
            }))
          )
          .run();
      }
    } catch {
      setErrorMessage(
        "Le navigateur refuse l'accès au presse-papiers. Utilisez Ctrl + V."
      );
    }
  };

  /* =========================================================
     EXPORT PDF
  ========================================================= */

  const handleDownloadPDF = useCallback(() => {
    if (!editor) return;

    const editorElement = pageRef.current?.querySelector(
      ".tiptap-editor-content"
    );

    if (!editorElement) return;

    const exportContainer = document.createElement("div");

    exportContainer.style.width = `${pageW - marginPx * 2}px`;
    exportContainer.style.backgroundColor = "#ffffff";
    exportContainer.style.color = "#172033";

    const contentClone = editorElement.cloneNode(true);
    contentClone.removeAttribute("contenteditable");
    contentClone.style.minHeight = "0";

    contentClone
      .querySelectorAll(".is-editor-empty")
      .forEach((element) => element.removeAttribute("data-placeholder"));

    contentClone
      .querySelectorAll(
        ".collaboration-carets__caret, .collaboration-cursor__caret, .column-resize-handle"
      )
      .forEach((element) => element.remove());

    exportContainer.appendChild(contentClone);

    const safeFileName = (title || "document")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim();

    const marginMm = marginPx * PX_TO_MM;

    const options = {
      margin: [marginMm, marginMm, marginMm, marginMm],
      filename: `${safeFileName || "document"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: {
        unit: "mm",
        format: pageDef.pdf,
        orientation: pageSetup.orientation,
      },
      pagebreak: {
        mode: ["css", "legacy"],
        before: ".document-page-break",
        avoid: ["h1", "h2", "h3", "li", "tr", "img"],
      },
    };

    html2pdf()
      .set(options)
      .from(exportContainer)
      .save()
      .catch((error) => {
        console.error("Erreur export PDF :", error);
        setErrorMessage("Impossible de générer le PDF.");
      });
  }, [editor, title, pageW, marginPx, pageDef, pageSetup.orientation]);

  /* =========================================================
     IMPRESSION
  ========================================================= */

  const handlePrint = () => {
    if (!editor) return;

    const marginMm = (marginPx * PX_TO_MM).toFixed(1);

    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(
      title
    )}</title><style>@page{size:${pageDef.css} ${
      pageSetup.orientation
    };margin:${marginMm}mm}${PRINT_CSS}</style></head><body>${editor.getHTML()}</body></html>`;

    const iframe = document.createElement("iframe");

    iframe.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";

    document.body.appendChild(iframe);

    const frameDocument = iframe.contentWindow.document;

    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();

      setTimeout(() => iframe.remove(), 2000);
    }, 300);
  };

  printRef.current = handlePrint;

  /* =========================================================
     ZOOM, PLEIN ECRAN, RACCOURCIS
  ========================================================= */

  const fitWidth = () => {
    const width = docAreaRef.current?.clientWidth || 0;

    if (!width) return;

    setZoom(
      Math.min(200, Math.max(50, Math.floor(((width - 48) / pageW) * 100)))
    );
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;

      if (mod && key === "s") {
        event.preventDefault();
        saveRef.current();
      } else if (mod && key === "f") {
        event.preventDefault();
        openFind(false);
      } else if (mod && key === "h") {
        event.preventDefault();
        openFind(true);
      } else if (mod && key === "p") {
        event.preventDefault();
        printRef.current();
      } else if (event.key === "Escape") {
        setFindOpen(false);
        setShowBackstage(false);
        setShowStats(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openFind]);

  const keepFocus = (event) => {
    const tag = event.target.tagName;

    if (["INPUT", "SELECT", "OPTION", "TEXTAREA"].includes(tag)) {
      return;
    }

    event.preventDefault();
  };

  /* =========================================================
     CHARGEMENT DE L'EDITEUR
  ========================================================= */

  if (!editor) {
    return (
      <div className="editor-screen">
        <div className="editor-loading">
          <LoaderCircle className="loading-icon" size={25} />
          <span>Initialisation de l'éditeur...</span>
        </div>
      </div>
    );
  }

  const backstageAction = (action) => () => {
    setShowBackstage(false);
    action();
  };

  const permissionLabel =
    documentProp?.permission === "owner"
      ? "Propriétaire"
      : documentProp?.permission === "editor"
      ? "Éditeur"
      : "Lecteur";

  const formatDateTime = (value) => {
    if (!value) return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString("fr-FR", {
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  };

  const cmPx = 37.795 * zoomFactor;
  const marginZoomed = marginPx * zoomFactor;

  /* =========================================================
     INTERFACE
  ========================================================= */

  return (
    <div className="editor-screen">
      {/* ------------------- BARRE DE TITRE ------------------- */}

      <header className="titlebar">
        <button
          type="button"
          className="tb-btn"
          onClick={onClose}
          title="Retour à mes documents"
          aria-label="Retour à mes documents"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="tb-quick">
          <button
            type="button"
            className="tb-btn"
            onClick={() => handleSave()}
            disabled={saving || loading || readOnly || !ready}
            title="Enregistrer (Ctrl+S)"
            aria-label="Enregistrer"
          >
            {saving ? (
              <LoaderCircle size={17} className="loading-icon" />
            ) : (
              <Save size={17} />
            )}
          </button>

          <button
            type="button"
            className="tb-btn"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={readOnly || !editor.can().undo()}
            title="Annuler (Ctrl+Z)"
            aria-label="Annuler"
          >
            <Undo2 size={17} />
          </button>

          <button
            type="button"
            className="tb-btn"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={readOnly || !editor.can().redo()}
            title="Rétablir (Ctrl+Y)"
            aria-label="Rétablir"
          >
            <Redo2 size={17} />
          </button>
        </div>

        <div className="tb-title">
          <input
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setSaved(false);
            }}
            placeholder="Titre du document"
            disabled={readOnly}
            aria-label="Titre du document"
          />

          <span className="tb-status">
            {status === "Hors-ligne" ? (
              <WifiOff size={12} />
            ) : (
              <Wifi size={12} />
            )}

            {saved ? "Enregistré ✓" : status}

            {(loading || importing) && (
              <LoaderCircle size={12} className="loading-icon" />
            )}
          </span>
        </div>

        <div className="tb-right">
          {peers.length > 0 && (
            <span className="peer-avatars">
              {peers.slice(0, 5).map((peer) => (
                <span
                  key={peer.id}
                  className="peer-avatar"
                  style={{ background: peer.color }}
                  title={peer.name}
                >
                  {peer.name.charAt(0).toUpperCase()}
                </span>
              ))}
            </span>
          )}

          <span className="tb-count">
            {collaborators} en ligne
          </span>

          {onShare && (
            <button type="button" className="tb-share" onClick={onShare}>
              <Share2 size={15} />
              Partager
            </button>
          )}
        </div>
      </header>

      {/* ------------------- ONGLETS + RUBAN ------------------- */}

      {!readingMode && (
        <>
          <div className="tab-row" role="tablist">
            <button
              type="button"
              className="tab file"
              onClick={() => setShowBackstage(true)}
            >
              Fichier
            </button>

            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "tab active" : "tab"}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}

            {inTable && (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "table"}
                className={
                  activeTab === "table"
                    ? "tab contextual active"
                    : "tab contextual"
                }
                onClick={() => setActiveTab("table")}
              >
                Tableau
              </button>
            )}
          </div>

          <div
            className={readOnly ? "ribbon locked" : "ribbon"}
            onMouseDown={keepFocus}
          >
            <Ribbon
              editor={editor}
              tab={activeTab}
              spell={spell}
              setSpell={setSpell}
              pageSetup={pageSetup}
              setPageSetup={setPageSetup}
              zoom={zoom}
              setZoom={setZoom}
              onFitWidth={fitWidth}
              showRuler={showRuler}
              setShowRuler={setShowRuler}
              readingMode={readingMode}
              setReadingMode={setReadingMode}
              onFind={openFind}
              onPrint={handlePrint}
              onPickImage={() => imageInputRef.current?.click()}
              onImport={() => fileInputRef.current?.click()}
              onStats={() => setShowStats(true)}
              onHistory={() => setShowHistory(true)}
              onPaste={handlePasteButton}
              isDark={isDark}
              onToggleTheme={() =>
                updateTheme({ mode: isDark ? "light" : "dark" })
              }
              onFullscreen={toggleFullscreen}
              defaultPt={defaultPt}
            />
          </div>
        </>
      )}

      {readingMode && (
        <button
          type="button"
          className="reading-exit"
          onClick={() => setReadingMode(false)}
        >
          <X size={15} />
          Quitter le mode lecture
        </button>
      )}

      {/* ------------------- MESSAGES ------------------- */}

      {errorMessage && (
        <div className="editor-error-message">
          {errorMessage}

          <button
            type="button"
            onClick={() => setErrorMessage("")}
            aria-label="Fermer le message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ------------------- RECHERCHE ------------------- */}

      {findOpen && (
        <div className="find-panel" role="search">
          <div className="find-row">
            <Search size={15} />

            <input
              type="text"
              value={findTerm}
              onChange={(event) => setFindTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  editor.commands.searchStep(event.shiftKey ? -1 : 1);
                }
              }}
              placeholder="Rechercher dans le document"
              autoFocus
            />

            <span className="find-count">
              {findTerm
                ? searchCount
                  ? `${searchCurrent + 1} / ${searchCount}`
                  : "0 résultat"
                : ""}
            </span>

            <button
              type="button"
              onClick={() => editor.commands.searchStep(-1)}
              disabled={searchCount === 0}
              aria-label="Résultat précédent"
            >
              <ChevronUp size={16} />
            </button>

            <button
              type="button"
              onClick={() => editor.commands.searchStep(1)}
              disabled={searchCount === 0}
              aria-label="Résultat suivant"
            >
              <ChevronDown size={16} />
            </button>

            <button
              type="button"
              onClick={() => setFindOpen(false)}
              aria-label="Fermer la recherche"
            >
              <X size={16} />
            </button>
          </div>

          {replaceMode && (
            <div className="find-row">
              <span className="find-replace-label">Remplacer par</span>

              <input
                type="text"
                value={replaceTerm}
                onChange={(event) => setReplaceTerm(event.target.value)}
                placeholder="Texte de remplacement"
                disabled={readOnly}
              />

              <button
                type="button"
                className="find-action"
                disabled={readOnly || searchCount === 0}
                onClick={() => editor.commands.replaceCurrent(replaceTerm)}
              >
                Remplacer
              </button>

              <button
                type="button"
                className="find-action"
                disabled={readOnly || searchCount === 0}
                onClick={() => editor.commands.replaceAllMatches(replaceTerm)}
              >
                Tout remplacer
              </button>
            </div>
          )}

          <label className="find-case">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(event) => setCaseSensitive(event.target.checked)}
            />
            Respecter la casse
          </label>

          {!replaceMode && (
            <button
              type="button"
              className="find-link"
              onClick={() => setReplaceMode(true)}
            >
              Remplacer...
            </button>
          )}
        </div>
      )}

      {/* ------------------- DOCUMENT ------------------- */}

      <div
        className="doc-area"
        ref={docAreaRef}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {showRuler && !readingMode && (
          <div className="ruler-wrap">
            <div
              className="ruler"
              style={{
                width: pageW * zoomFactor,
                backgroundImage: `linear-gradient(to right, var(--ruler-margin) ${marginZoomed}px, transparent ${marginZoomed}px, transparent calc(100% - ${marginZoomed}px), var(--ruler-margin) calc(100% - ${marginZoomed}px)), linear-gradient(to right, var(--text-muted) 1px, transparent 1px)`,
                backgroundSize: `100% 100%, ${cmPx}px 7px`,
                backgroundRepeat: "no-repeat, repeat-x",
                backgroundPosition: "0 0, 0 100%",
              }}
            />
          </div>
        )}

        <div
          className="page-outer"
          style={{
            width: pageW * zoomFactor,
            height: pages * pageH * zoomFactor,
          }}
        >
          <div
            ref={pageRef}
            className="tiptap-document-page"
            style={{
              width: pageW,
              minHeight: pages * pageH,
              padding: marginPx,
              transform: `scale(${zoomFactor})`,
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${
                pageH - 2
              }px, #cfd6e2 ${pageH - 2}px, #cfd6e2 ${pageH}px)`,
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* ------------------- BARRE D'ETAT ------------------- */}

      <footer className="statusbar">
        <div className="sb-left">
          <span>
            Page {currentPage} sur {pages}
          </span>

          <span>{stats.words} mot{stats.words > 1 ? "s" : ""}</span>

          <span>Français (France)</span>

          {readOnly && <span className="sb-badge">Lecture seule</span>}
        </div>

        <div className="sb-right">
          <button
            type="button"
            className={!readingMode ? "sb-mode active" : "sb-mode"}
            onClick={() => setReadingMode(false)}
            title="Mode page"
            aria-label="Mode page"
          >
            <FileText size={15} />
          </button>

          <button
            type="button"
            className={readingMode ? "sb-mode active" : "sb-mode"}
            onClick={() => setReadingMode(true)}
            title="Mode lecture"
            aria-label="Mode lecture"
          >
            <BookOpen size={15} />
          </button>

          <button
            type="button"
            className="sb-mode"
            onClick={() => setZoom((value) => Math.max(50, value - 10))}
            aria-label="Réduire le zoom"
          >
            <ZoomOut size={15} />
          </button>

          <input
            type="range"
            min="50"
            max="200"
            step="10"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            aria-label="Zoom"
          />

          <button
            type="button"
            className="sb-mode"
            onClick={() => setZoom((value) => Math.min(200, value + 10))}
            aria-label="Agrandir le zoom"
          >
            <ZoomIn size={15} />
          </button>

          <button
            type="button"
            className="sb-zoom"
            onClick={() => setZoom(100)}
            title="Revenir à 100 %"
          >
            {zoom} %
          </button>
        </div>
      </footer>

      {/* ------------------- FICHIER (backstage) ------------------- */}

      {showBackstage && (
        <div className="backstage">
          <nav className="backstage-nav">
            <button
              type="button"
              className="backstage-back"
              onClick={() => setShowBackstage(false)}
              aria-label="Retour au document"
            >
              <ArrowLeft size={20} />
            </button>

            <button type="button" className="on">
              <Info size={17} />
              Informations
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={backstageAction(() => handleSave())}
                disabled={!ready}
              >
                <Save size={17} />
                Enregistrer
              </button>
            )}

            {!readOnly && (
              <button
                type="button"
                onClick={backstageAction(() => fileInputRef.current?.click())}
              >
                <FileUp size={17} />
                Importer Word ou PDF
              </button>
            )}

            <button type="button" onClick={backstageAction(handleDownloadPDF)}>
              <Download size={17} />
              Exporter en PDF
            </button>

            <button type="button" onClick={backstageAction(handlePrint)}>
              <Printer size={17} />
              Imprimer
            </button>

            <button
              type="button"
              onClick={backstageAction(() => setShowHistory(true))}
            >
              <History size={17} />
              Historique des versions
            </button>

            {onShare && (
              <button type="button" onClick={backstageAction(onShare)}>
                <Share2 size={17} />
                Partager
              </button>
            )}

            <button
              type="button"
              className="backstage-close"
              onClick={backstageAction(() => onClose?.())}
            >
              <X size={17} />
              Fermer le document
            </button>
          </nav>

          <section className="backstage-pane">
            <h2>Informations</h2>
            <h3>{title || "Document sans titre"}</h3>

            <dl className="info-grid">
              <dt>Accès</dt>
              <dd>{permissionLabel}</dd>

              <dt>Dernière modification</dt>
              <dd>
                {formatDateTime(
                  documentProp?.updated_at || documentProp?.created_at
                )}
              </dd>

              <dt>Création</dt>
              <dd>{formatDateTime(documentProp?.created_at)}</dd>

              <dt>Pages</dt>
              <dd>{pages}</dd>

              <dt>Mots</dt>
              <dd>{stats.words}</dd>

              <dt>Format</dt>
              <dd>
                {pageDef.label} ({pageDef.dim}),{" "}
                {landscape ? "paysage" : "portrait"}
              </dd>

              <dt>Collaborateurs en ligne</dt>
              <dd>{collaborators}</dd>
            </dl>
          </section>
        </div>
      )}

      {/* ------------------- STATISTIQUES ------------------- */}

      {showStats && (
        <div className="modal-overlay" onClick={() => setShowStats(false)}>
          <div
            className="share-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>Statistiques</h2>
                <p>Contenu du document</p>
              </div>

              <button
                className="modal-close"
                onClick={() => setShowStats(false)}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>

            <dl className="info-grid">
              <dt>Pages</dt>
              <dd>{pages}</dd>

              <dt>Mots</dt>
              <dd>{stats.words}</dd>

              <dt>Caractères (avec espaces)</dt>
              <dd>{stats.chars}</dd>

              <dt>Caractères (sans espaces)</dt>
              <dd>{stats.charsNoSpaces}</dd>

              <dt>Paragraphes</dt>
              <dd>{stats.paragraphs}</dd>
            </dl>
          </div>
        </div>
      )}

      {/* ------------------- HISTORIQUE ------------------- */}

      {showHistory && (
        <VersionHistory
          documentId={documentId}
          token={token}
          canEdit={!readOnly}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestoreVersion}
        />
      )}

      {/* ------------------- CHAMPS FICHIER CACHES ------------------- */}

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden-input"
        onChange={handleImportFile}
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden-input"
        onChange={handleImageFile}
      />
    </div>
  );
}