import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Node } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";

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
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Undo2,
  Redo2,
  Download,
  Copy,
  Check,
  Wifi,
  WifiOff,
  FileText,
  LoaderCircle,
  FileUp,
  FilePlus2,
  History,
} from "lucide-react";

import html2pdf from "html2pdf.js";
import mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import VersionHistory from "./VersionHistory";

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

/* =========================================================
   NOEUD "SAUT DE PAGE"
========================================================= */

const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },

  renderHTML() {
    return [
      "div",
      {
        "data-type": "page-break",
        class: "document-page-break",
        contenteditable: "false",
      },
    ];
  },
});

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

  if (node.type === "pageBreak") {
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

  if (typeof documentContent === "object" && documentContent.type === "doc") {
    return documentContent;
  }

  if (
    typeof documentContent === "object" &&
    Array.isArray(documentContent.content)
  ) {
    return { type: "doc", content: documentContent.content };
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
   BOUTON DE BARRE D'OUTILS
========================================================= */

function ToolbarButton({
  active = false,
  onClick,
  title,
  disabled = false,
  className = "",
  children,
}) {
  return (
    <button
      type="button"
      className={`toolbar-button${active ? " active" : ""}${
        className ? ` ${className}` : ""
      }`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
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
}) {
  const documentId = documentProp?.id || documentIdProp || "document-test-001";

  const initialTitle =
    documentProp?.content?.title || documentTitleProp || "Document sans titre";

  /* ---------------- ETATS ---------------- */

  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState("Connexion...");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [collaborators, setCollaborators] = useState(0);
  const [importing, setImporting] = useState(false);
  const [ready, setReady] = useState(false);
  const [peers, setPeers] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  /* ---------------- REFS ---------------- */

  const fileInputRef = useRef(null);
  const socketRef = useRef(null);

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

  // Libère le minuteur interne d'awareness (compatible React StrictMode)
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
      StarterKit.configure({ undoRedo: false }),
      Placeholder.configure({
        placeholder: "Commencez à rédiger votre document...",
      }),
      PageBreak,
      Collaboration.configure({ document: yDoc }),
      CollaborationCaret.configure({
        provider: { awareness },
        user: currentUser,
      }),
    ],
    content: "",
    editable: !readOnly,
    editorProps: {
      attributes: { class: "tiptap-editor-content" },
    },
  });

  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  useEffect(() => {
    setTitle(
      documentProp?.content?.title || documentTitleProp || "Document sans titre"
    );
  }, [documentProp, documentTitleProp]);

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
      return;
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
      return;
    }

    serverHasStateRef.current = null;
    syncedOnceRef.current = false;

    const socket = io(SOCKET_URL, token ? { auth: { token } } : {});

    socketRef.current = socket;

    /* ---------- presence ---------- */

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

    /* ---------- connexion ---------- */

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

      // Un collaborateur arrive : on lui renvoie notre présence
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
        content: tiptapContent.content || [],
      };

      await axios.put(
        `${API_URL}/documents/${documentId}`,
        { content: contentToSave },
        { headers }
      );

      // Version d'historique : un échec ici ne doit pas bloquer l'enregistrement
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

    // Conserve l'état actuel dans l'historique avant d'écraser
    try {
      await axios.post(
        `${API_URL}/documents/${documentId}/versions`,
        {
          content: {
            type: "doc",
            title: String(title || "").trim() || "Document sans titre",
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
     EXPORT PDF
  ========================================================= */

  const handleDownloadPDF = useCallback(() => {
    if (!editor) return;

    const editorElement = document.querySelector(".tiptap-editor-content");

    if (!editorElement) return;

    const exportContainer = document.createElement("div");

    exportContainer.style.width = "700px";
    exportContainer.style.padding = "10px 20px";
    exportContainer.style.backgroundColor = "#ffffff";
    exportContainer.style.color = "#172033";
    exportContainer.style.fontFamily = "Arial, sans-serif";
    exportContainer.style.lineHeight = "1.6";

    const heading = document.createElement("h1");
    heading.textContent = title || "Document sans titre";
    heading.style.margin = "0 0 24px";

    const contentClone = editorElement.cloneNode(true);
    contentClone.removeAttribute("contenteditable");
    contentClone.style.minHeight = "0";

    contentClone
      .querySelectorAll(".is-editor-empty")
      .forEach((element) => element.removeAttribute("data-placeholder"));

    // Retire les curseurs des collaborateurs du PDF
    contentClone
      .querySelectorAll(
        ".collaboration-carets__caret, .collaboration-cursor__caret"
      )
      .forEach((element) => element.remove());

    exportContainer.appendChild(heading);
    exportContainer.appendChild(contentClone);

    const safeFileName = (title || "document")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim();

    const options = {
      margin: [12, 12, 12, 12],
      filename: `${safeFileName || "document"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: {
        mode: ["css", "legacy"],
        before: ".document-page-break",
        avoid: ["h1", "h2", "h3", "li"],
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
  }, [editor, title]);

  /* =========================================================
     COPIER LE LIEN
  ========================================================= */

  const handleCopyLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/documents/${documentId}`;

      await navigator.clipboard.writeText(url);

      setCopied(true);

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Erreur copie lien :", error);
      setErrorMessage("Impossible de copier le lien.");
    }
  }, [documentId]);

  /* =========================================================
     CHARGEMENT DE L'EDITEUR
  ========================================================= */

  if (!editor) {
    return (
      <div className="editor-loading">
        <LoaderCircle className="loading-icon" size={25} />
        <span>Initialisation de l'éditeur...</span>
      </div>
    );
  }

  /* =========================================================
     INTERFACE
  ========================================================= */

  return (
    <div className="tiptap-editor-wrapper">
      {/* ------------------- EN-TETE ------------------- */}

      <header className="tiptap-editor-header">
        <div className="editor-title-section">
          <div className="editor-file-icon">
            <FileText size={21} />
          </div>

          <div className="editor-title-info">
            <input
              type="text"
              className="editor-title-input"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setSaved(false);
              }}
              placeholder="Titre du document"
              disabled={readOnly}
            />

            <div className="editor-status-line">
              {status === "Hors-ligne" ? (
                <WifiOff size={13} />
              ) : (
                <Wifi size={13} />
              )}

              <span>{status}</span>

              {loading && (
                <LoaderCircle className="status-loading" size={13} />
              )}

              <span className="collaborators-count">
                👥 {collaborators} collaborateur
                {collaborators > 1 ? "s" : ""} en ligne
              </span>

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
            </div>
          </div>
        </div>

        <div className="editor-header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="editor-file-input-hidden"
            onChange={handleImportFile}
          />

          {!readOnly && (
            <button
              type="button"
              className="editor-action-button secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || loading || !ready}
              title="Importer un fichier Word ou PDF"
            >
              <FileUp size={16} />
              {importing ? "Importation..." : "Importer"}
            </button>
          )}

          <button
            type="button"
            className="editor-action-button"
            onClick={() => handleSave()}
            disabled={saving || loading || readOnly || !ready}
          >
            {saving
              ? "Enregistrement..."
              : saved
                ? "Enregistré ✓"
                : "Enregistrer"}
          </button>

          <button
            type="button"
            className="editor-action-button secondary"
            onClick={() => setShowHistory(true)}
            title="Historique des versions"
          >
            <History size={16} />
            Historique
          </button>

          <button
            type="button"
            className="editor-action-button secondary"
            onClick={handleDownloadPDF}
          >
            <Download size={16} />
            PDF
          </button>

          <button
            type="button"
            className="editor-action-button secondary"
            onClick={handleCopyLink}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copié" : "Copier le lien"}
          </button>
        </div>
      </header>

      {/* ------------------- BARRE D'OUTILS ------------------- */}

      {!readOnly && (
        <div className="tiptap-toolbar">
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Gras"
          >
            <Bold size={17} />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italique"
          >
            <Italic size={17} />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Souligné"
          >
            <UnderlineIcon size={17} />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Barré"
          >
            <Strikethrough size={17} />
          </ToolbarButton>

          <span className="toolbar-divider" />

          <ToolbarButton
            active={editor.isActive("heading", { level: 1 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            title="Titre 1"
          >
            <Heading1 size={17} />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            title="Titre 2"
          >
            <Heading2 size={17} />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            title="Titre 3"
          >
            <Heading3 size={17} />
          </ToolbarButton>

          <span className="toolbar-divider" />

          <ToolbarButton
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Liste à puces"
          >
            <List size={17} />
          </ToolbarButton>

          <ToolbarButton
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Liste numérotée"
          >
            <ListOrdered size={17} />
          </ToolbarButton>

          <span className="toolbar-divider" />

          <ToolbarButton
            className="page-break-button"
            onClick={() =>
              editor.chain().focus().insertContent({ type: "pageBreak" }).run()
            }
            title="Ajouter une page vierge"
          >
            <FilePlus2 size={17} />
            <span>Page vierge</span>
          </ToolbarButton>

          <span className="toolbar-divider" />

          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Annuler"
          >
            <Undo2 size={17} />
          </ToolbarButton>

          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Rétablir"
          >
            <Redo2 size={17} />
          </ToolbarButton>
        </div>
      )}

      {/* ------------------- MESSAGES ------------------- */}

      {errorMessage && (
        <div className="editor-error-message">{errorMessage}</div>
      )}

      {saved && (
        <div className="editor-success-message">
          Document enregistré avec succès !
        </div>
      )}

      {/* ------------------- DOCUMENT ------------------- */}

      <main className="tiptap-document-area">
        <div className="tiptap-document-page">
          <EditorContent editor={editor} />
        </div>
      </main>

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
    </div>
  );
}