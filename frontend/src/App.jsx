import React, { useEffect, useMemo, useState } from "react";

import axios from "axios";

import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import {
    FileText,
    Home,
    Star,
    Trash2,
    Plus,
    Search,
    LogOut,
    Share2,
    MoreHorizontal,
    Users,
    Sun,
    Moon,
    Monitor,
    Menu,
    X,
    Palette,
    RotateCcw,
    Check,
    Zap,
    Pencil,
    FolderOpen,
    Clock
} from "lucide-react";

import { useAuth } from "./AuthContext";
import { ACCENTS, useTheme } from "./theme";

import Login from "./Login";
import Register from "./Register";
import ProtectedRoute from "./ProtectedRoute";
import TextEditor from "./TextEditor";
import ShareModal from "./ShareModal";
import NotificationBell from "./NotificationBell";

import "./App.css";
import "./organize.css";
import "./extras.css";
import "./collab.css";

const API_URL = "http://localhost:5000/api";

/* =========================================================
   MODELES DE DOCUMENTS
========================================================= */

const para = (text = "") => ({
    type: "paragraph",
    content: text ? [{ type: "text", text }] : []
});

const heading = (level, text) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }]
});

const bullets = (items) => ({
    type: "bulletList",
    content: items.map((text) => ({
        type: "listItem",
        content: [para(text)]
    }))
});

const tasks = (items) => ({
    type: "taskList",
    content: items.map((text) => ({
        type: "taskItem",
        attrs: { checked: false },
        content: [para(text)]
    }))
});

const TEMPLATES = [
    {
        id: "blank",
        label: "Document vierge",
        base: "Nouveau document",
        content: null
    },
    {
        id: "letter",
        label: "Lettre",
        base: "Lettre",
        content: [
            para("[Votre nom]"),
            para("[Votre adresse]"),
            para(),
            para("[Ville], le [date]"),
            para(),
            para("Objet : [objet de la lettre]"),
            para(),
            para("Madame, Monsieur,"),
            para(),
            para("[Corps de la lettre]"),
            para(),
            para(
                "Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées."
            ),
            para(),
            para("[Signature]")
        ]
    },
    {
        id: "report",
        label: "Rapport",
        base: "Rapport",
        content: [
            heading(1, "Titre du rapport"),
            para("Auteur — date"),
            heading(2, "1. Introduction"),
            para("[Présentez le contexte et les objectifs.]"),
            heading(2, "2. Développement"),
            para("[Détaillez votre travail.]"),
            heading(2, "3. Conclusion"),
            para("[Résumez les résultats.]")
        ]
    },
    {
        id: "meeting",
        label: "Compte rendu",
        base: "Compte rendu de réunion",
        content: [
            heading(1, "Compte rendu de réunion"),
            para("Date :"),
            para("Participants :"),
            heading(2, "Ordre du jour"),
            bullets(["Point 1", "Point 2"]),
            heading(2, "Décisions"),
            para(),
            heading(2, "Actions à suivre"),
            tasks(["Action 1", "Action 2"])
        ]
    }
];

/* =========================================================
   OUTILS
========================================================= */

const NAV_ITEMS = [
    { id: "home", label: "Accueil", icon: Home },
    { id: "all", label: "Mes documents", icon: FolderOpen },
    { id: "shared", label: "Partagés avec moi", icon: Users },
    { id: "favorites", label: "Favoris", icon: Star },
    { id: "trash", label: "Corbeille", icon: Trash2 }
];

const VIEW_TITLES = {
    home: "Accueil",
    all: "Mes documents",
    shared: "Partagés avec moi",
    favorites: "Favoris",
    trash: "Corbeille"
};

function getDocumentTitle(document) {
    const title = document?.content?.title;

    if (typeof title === "string" && title.trim()) {
        return title;
    }

    return "Document sans titre";
}

function getPermissionLabel(permission) {
    if (permission === "owner") return "Propriétaire";
    if (permission === "editor") return "Éditeur";
    return "Lecteur";
}

function formatRelativeDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;

    const hours = Math.floor(minutes / 60);

    if (hours < 24) return `Il y a ${hours} h`;

    const days = Math.floor(hours / 24);

    if (days < 7) return `Il y a ${days} j`;

    return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function errorText(error, fallback) {
    return error?.response?.data?.message || fallback;
}

function Logo({ size = 22 }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M8 3h6.5L19 7.5V17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
            <path d="M14 3v4.5h5" />
            <path d="M3 8v11a2 2 0 0 0 2 2h9" />
            <path d="M9.5 12.5h6M9.5 15.5h4" />
        </svg>
    );
}

function Segmented({ value, options, onChange }) {
    return (
        <div className="segmented" role="radiogroup">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    className={
                        value === option.value
                            ? "segmented-item active"
                            : "segmented-item"
                    }
                    onClick={() => onChange(option.value)}
                >
                    {option.icon}
                    {option.label}
                </button>
            ))}
        </div>
    );
}

/* =========================================================
   WORKSPACE
========================================================= */

function Workspace() {
    const { user, token, logout } = useAuth();
    const navigate = useNavigate();
    const { preferences, resolvedMode, update, reset } = useTheme();

    const [documents, setDocuments] = useState([]);
    const [trashDocs, setTrashDocs] = useState([]);
    const [openId, setOpenId] = useState(null);
    const [shareId, setShareId] = useState(null);
    const [view, setView] = useState("home");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);

    const [menu, setMenu] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
    const [toast, setToast] = useState(null);

    const authConfig = {
        headers: { Authorization: `Bearer ${token}` }
    };

    /* ---------------- NOTIFICATIONS (toasts) ---------------- */

    const notify = (text, type = "success") => {
        setToast({ text, type, id: Date.now() });
    };

    useEffect(() => {
        if (!toast) return undefined;

        const timer = setTimeout(() => setToast(null), 2800);

        return () => clearTimeout(timer);
    }, [toast]);

    /* ---------------- CHARGEMENT ---------------- */

    const loadDocuments = async (silent = false) => {
        try {
            if (!silent) {
                setLoading(true);
            }

            const [activeResponse, trashResponse] = await Promise.all([
                axios.get(`${API_URL}/documents`, authConfig),
                axios.get(`${API_URL}/documents/trash`, authConfig)
            ]);

            setDocuments(
                Array.isArray(activeResponse.data) ? activeResponse.data : []
            );

            setTrashDocs(
                Array.isArray(trashResponse.data) ? trashResponse.data : []
            );
        } catch (error) {
            console.error("Erreur récupération documents :", error);

            if (error.response?.status === 401) {
                logout();
                navigate("/login");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            loadDocuments();
        }
    }, [token]);

    /* ---------------- RESEAU + CLAVIER ---------------- */

    useEffect(() => {
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);

        const onKeyDown = (event) => {
            if (event.key === "Escape") {
                setShareId(null);
                setShowSettings(false);
                setSidebarOpen(false);
                setMenu(null);
                setRenameTarget(null);
            }
        };

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        window.addEventListener("keydown", onKeyDown);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
            window.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    const openDoc = documents.find((item) => item.id === openId) || null;
    const shareDoc = documents.find((item) => item.id === shareId) || null;

    /* ---------------- CREATION ---------------- */

    const uniqueTitle = (base) => {
        const existing = new Set(
            [...documents, ...trashDocs].map((item) =>
                String(item.content?.title || "")
                    .trim()
                    .toLocaleLowerCase()
            )
        );

        let number = 1;

        while (existing.has(`${base} ${number}`.toLocaleLowerCase())) {
            number += 1;
        }

        return `${base} ${number}`;
    };

    const createDocument = async (template = TEMPLATES[0]) => {
        try {
            const documentTitle = uniqueTitle(template.base);
            const documentId = `document-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;

            const content = template.content
                ? {
                      type: "doc",
                      title: documentTitle,
                      content: template.content
                  }
                : { title: documentTitle, text: "" };

            const response = await axios.post(
                `${API_URL}/documents`,
                { id: documentId, content },
                authConfig
            );

            const newDocument = { ...response.data, is_favorite: false };

            setDocuments((previous) => [newDocument, ...previous]);
            setOpenId(newDocument.id);
            notify("Document créé");
        } catch (error) {
            console.error("Erreur création document :", error);
            notify(errorText(error, "Erreur lors de la création."), "error");
        }
    };

    /* ---------------- FAVORIS ---------------- */

    const toggleFavorite = async (item) => {
        const next = !item.is_favorite;

        setDocuments((previous) =>
            previous.map((entry) =>
                entry.id === item.id ? { ...entry, is_favorite: next } : entry
            )
        );

        try {
            await axios.post(
                `${API_URL}/documents/${item.id}/favorite`,
                { favorite: next },
                authConfig
            );

            notify(next ? "Ajouté aux favoris" : "Retiré des favoris");
        } catch (error) {
            setDocuments((previous) =>
                previous.map((entry) =>
                    entry.id === item.id
                        ? { ...entry, is_favorite: !next }
                        : entry
                )
            );

            notify(errorText(error, "Erreur favori."), "error");
        }
    };

    /* ---------------- RENOMMER ---------------- */

    const submitRename = async (event) => {
        event.preventDefault();

        if (!renameTarget) return;

        const title = renameTarget.title.trim();

        if (!title) return;

        try {
            await axios.put(
                `${API_URL}/documents/${renameTarget.id}/rename`,
                { title },
                authConfig
            );

            setDocuments((previous) =>
                previous.map((entry) =>
                    entry.id === renameTarget.id
                        ? {
                              ...entry,
                              content: { ...entry.content, title }
                          }
                        : entry
                )
            );

            setRenameTarget(null);
            notify("Document renommé");
        } catch (error) {
            notify(errorText(error, "Erreur de renommage."), "error");
        }
    };

    /* ---------------- CORBEILLE ---------------- */

    const moveToTrash = async (item) => {
        try {
            await axios.post(
                `${API_URL}/documents/${item.id}/trash`,
                {},
                authConfig
            );

            setDocuments((previous) =>
                previous.filter((entry) => entry.id !== item.id)
            );

            setTrashDocs((previous) => [
                { ...item, deleted_at: new Date().toISOString() },
                ...previous
            ]);

            notify("Déplacé dans la corbeille");
        } catch (error) {
            notify(errorText(error, "Erreur de suppression."), "error");
        }
    };

    const restoreDocument = async (item) => {
        try {
            await axios.post(
                `${API_URL}/documents/${item.id}/restore`,
                {},
                authConfig
            );

            await loadDocuments(true);
            notify("Document restauré");
        } catch (error) {
            notify(errorText(error, "Erreur de restauration."), "error");
        }
    };

    const deleteForever = async (item) => {
        const confirmed = window.confirm(
            `Supprimer définitivement « ${getDocumentTitle(
                item
            )} » ? Cette action est irréversible.`
        );

        if (!confirmed) return;

        try {
            await axios.delete(
                `${API_URL}/documents/${item.id}/permanent`,
                authConfig
            );

            setTrashDocs((previous) =>
                previous.filter((entry) => entry.id !== item.id)
            );

            notify("Supprimé définitivement");
        } catch (error) {
            notify(errorText(error, "Erreur de suppression."), "error");
        }
    };

    const emptyTrash = async () => {
        if (trashDocs.length === 0) return;

        const confirmed = window.confirm(
            `Supprimer définitivement ${trashDocs.length} document(s) ? Cette action est irréversible.`
        );

        if (!confirmed) return;

        try {
            await Promise.all(
                trashDocs.map((item) =>
                    axios.delete(
                        `${API_URL}/documents/${item.id}/permanent`,
                        authConfig
                    )
                )
            );

            setTrashDocs([]);
            notify("Corbeille vidée");
        } catch (error) {
            await loadDocuments(true);
            notify(errorText(error, "Erreur lors du vidage."), "error");
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    /* ---------------- MENU CONTEXTUEL ---------------- */

    const openMenu = (event, item) => {
        event.stopPropagation();

        const rect = event.currentTarget.getBoundingClientRect();

        setMenu({
            id: item.id,
            x: Math.max(8, Math.min(rect.right - 218, window.innerWidth - 226)),
            y: Math.min(rect.bottom + 6, window.innerHeight - 250)
        });
    };

    const menuItem = menu && documents.find((entry) => entry.id === menu.id);

    const changeView = (nextView) => {
        setView(nextView);
        setSearch("");
        setSidebarOpen(false);
    };

    /* ---------------- DONNEES CALCULEES ---------------- */

    const favoriteDocs = useMemo(
        () => documents.filter((item) => item.is_favorite),
        [documents]
    );

    const ownedDocs = useMemo(
        () => documents.filter((item) => item.permission === "owner"),
        [documents]
    );

    const sharedDocs = useMemo(
        () => documents.filter((item) => item.permission !== "owner"),
        [documents]
    );

    const searching = search.trim().length > 0;

    const visibleList = useMemo(() => {
        let base = documents;

        if (view === "trash") base = trashDocs;
        else if (view === "favorites") base = favoriteDocs;
        else if (view === "shared") base = sharedDocs;
        else if (view === "all") base = ownedDocs;
        else if (view === "home" && !searching) base = documents.slice(0, 8);

        const term = search.trim().toLowerCase();

        return base.filter((item) =>
            getDocumentTitle(item).toLowerCase().includes(term)
        );
    }, [
        view,
        documents,
        trashDocs,
        favoriteDocs,
        sharedDocs,
        ownedDocs,
        search,
        searching
    ]);

    const counts = {
        home: null,
        all: ownedDocs.length,
        shared: sharedDocs.length,
        favorites: favoriteDocs.length,
        trash: trashDocs.length
    };

    const lastActivity = documents.length
        ? formatRelativeDate(documents[0].updated_at || documents[0].created_at)
        : "—";

    const firstName = user?.name?.trim().split(" ")[0] || "";
    const initial = user?.name?.charAt(0)?.toUpperCase() || "U";
    const isDark = resolvedMode === "dark";

    const emptyMessages = {
        home: "Aucun document pour le moment. Choisissez un modèle ci-dessus.",
        all: "Vous n'avez pas encore créé de document.",
        shared: "Aucun document n'a été partagé avec vous.",
        favorites:
            "Aucun favori. Utilisez le menu « ⋯ » d'un document pour en ajouter.",
        trash: "La corbeille est vide."
    };

    /* ---------------- LIGNE DE DOCUMENT ---------------- */

    const renderRow = (item, index) => (
        <div
            key={item.id}
            className="file-row"
            role="button"
            tabIndex={0}
            style={{ "--i": Math.min(index, 12) }}
            onClick={() => {
                if (view !== "trash") setOpenId(item.id);
            }}
            onKeyDown={(event) => {
                if (
                    view !== "trash" &&
                    (event.key === "Enter" || event.key === " ")
                ) {
                    event.preventDefault();
                    setOpenId(item.id);
                }
            }}
        >
            <span className="file-icon">
                <FileText size={19} />
            </span>

            <span className="file-name">
                <strong>{getDocumentTitle(item)}</strong>

                {view !== "trash" && item.is_favorite && (
                    <Star size={13} className="fav-star" />
                )}
            </span>

            <span className="file-date">
                {view === "trash"
                    ? `Supprimé ${formatRelativeDate(
                          item.deleted_at
                      ).toLowerCase()}`
                    : formatRelativeDate(item.updated_at || item.created_at)}
            </span>

            <span className={`file-perm ${item.permission}`}>
                {getPermissionLabel(item.permission)}
            </span>

            <span className="file-actions">
                {view === "trash" ? (
                    <>
                        <button
                            type="button"
                            className="row-btn"
                            onClick={(event) => {
                                event.stopPropagation();
                                restoreDocument(item);
                            }}
                            title="Restaurer"
                        >
                            <RotateCcw size={15} />
                            Restaurer
                        </button>

                        <button
                            type="button"
                            className="row-btn danger"
                            onClick={(event) => {
                                event.stopPropagation();
                                deleteForever(item);
                            }}
                            title="Supprimer définitivement"
                            aria-label="Supprimer définitivement"
                        >
                            <Trash2 size={15} />
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        className="row-menu"
                        aria-label="Actions"
                        onClick={(event) => openMenu(event, item)}
                    >
                        <MoreHorizontal size={18} />
                    </button>
                )}
            </span>
        </div>
    );

    /* ---------------- RENDER ---------------- */

    return (
        <>
            {openDoc ? (
                <TextEditor
                    key={openDoc.id}
                    document={openDoc}
                    documentId={openDoc.id}
                    documentTitle={getDocumentTitle(openDoc)}
                    token={token}
                    readOnly={openDoc.permission === "viewer"}
                    onSaved={() => loadDocuments(true)}
                    onClose={() => setOpenId(null)}
                    onShare={
                        openDoc.permission === "owner"
                            ? () => setShareId(openDoc.id)
                            : undefined
                    }
                />
            ) : (
                <div className="start-shell">
                    {sidebarOpen && (
                        <div
                            className="sidebar-backdrop"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}

                    {/* ================= MENU GAUCHE ================= */}

                    <aside
                        className={sidebarOpen ? "start-nav open" : "start-nav"}
                    >
                        <div className="start-brand" translate="no">
                            <span className="start-brand-mark">
                                <Logo size={22} />
                            </span>

                            <div>
                                <strong>CollabSpace</strong>
                                <span>Documents en équipe</span>
                            </div>
                        </div>

                        <button
                            className="start-new"
                            onClick={() => createDocument(TEMPLATES[0])}
                        >
                            <Plus size={18} />
                            Nouveau document
                        </button>

                        <nav className="start-links">
                            {NAV_ITEMS.map((item) => {
                                const Icon = item.icon;

                                return (
                                    <button
                                        key={item.id}
                                        className={
                                            view === item.id ? "on" : undefined
                                        }
                                        onClick={() => changeView(item.id)}
                                    >
                                        <Icon size={18} />
                                        <span>{item.label}</span>

                                        {counts[item.id] !== null && (
                                            <em>{counts[item.id]}</em>
                                        )}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="start-bottom">
                            <button
                                className="start-link-btn"
                                onClick={() => {
                                    setShowSettings(true);
                                    setSidebarOpen(false);
                                }}
                            >
                                <Palette size={18} />
                                Personnalisation
                            </button>

                            <div className="start-user">
                                <span className="start-avatar">{initial}</span>

                                <div>
                                    <strong>{user?.name}</strong>
                                    <span>{user?.email}</span>
                                </div>
                            </div>

                            <button
                                className="start-logout"
                                onClick={handleLogout}
                            >
                                <LogOut size={17} />
                                Déconnexion
                            </button>
                        </div>
                    </aside>

                    {/* ================= CONTENU ================= */}

                    <main className="start-main">
                        <header className="start-top">
                            <button
                                className="icon-button menu-toggle"
                                onClick={() => setSidebarOpen(true)}
                                aria-label="Ouvrir le menu"
                            >
                                <Menu size={20} />
                            </button>

                            <div className="start-search">
                                <Search size={16} />

                                <input
                                    type="text"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Rechercher un document..."
                                />

                                {search && (
                                    <button
                                        type="button"
                                        onClick={() => setSearch("")}
                                        aria-label="Effacer la recherche"
                                    >
                                        <X size={15} />
                                    </button>
                                )}
                            </div>

                            <div className="start-top-actions">
                                <span
                                    className={
                                        online
                                            ? "sync-pill"
                                            : "sync-pill offline"
                                    }
                                >
                                    <span className="sync-dot" />
                                    {online ? "Connecté" : "Hors-ligne"}
                                </span>

                                <button
                                    className="icon-button"
                                    onClick={() =>
                                        update({
                                            mode: isDark ? "light" : "dark"
                                        })
                                    }
                                    title={
                                        isDark
                                            ? "Passer au mode clair"
                                            : "Passer au mode sombre"
                                    }
                                    aria-label="Changer de thème"
                                >
                                    <span
                                        key={resolvedMode}
                                        className="theme-icon"
                                    >
                                        {isDark ? (
                                            <Sun size={19} />
                                        ) : (
                                            <Moon size={19} />
                                        )}
                                    </span>
                                </button>

                                <button
                                    className="icon-button"
                                    onClick={() => setShowSettings(true)}
                                    title="Personnaliser l'interface"
                                    aria-label="Personnaliser l'interface"
                                >
                                    <Palette size={19} />
                                </button>

                                <NotificationBell
                                    token={token}
                                    onOpenDocument={async (id) => {
                                        await loadDocuments(true);
                                        setOpenId(id);
                                    }}
                                />

                                <button
                                    className="top-logout"
                                    onClick={handleLogout}
                                    title="Se déconnecter"
                                >
                                    <LogOut size={16} />
                                    <span>Déconnexion</span>
                                </button>
                            </div>
                        </header>

                        <div className="start-content" key={view}>
                            {view === "home" && !searching && (
                                <>
                                    <section className="start-hero">
                                        <h1>
                                            Bonjour{firstName ? "," : ""}{" "}
                                            <span>{firstName}</span>
                                        </h1>

                                        <p>
                                            Que souhaitez-vous créer
                                            aujourd'hui ?
                                        </p>

                                        <div className="stats-strip">
                                            <span>
                                                <FileText size={15} />
                                                {documents.length} document
                                                {documents.length > 1
                                                    ? "s"
                                                    : ""}
                                            </span>

                                            <span>
                                                <Users size={15} />
                                                {sharedDocs.length} partagé
                                                {sharedDocs.length > 1
                                                    ? "s"
                                                    : ""}
                                            </span>

                                            <span>
                                                <Clock size={15} />
                                                {lastActivity}
                                            </span>
                                        </div>
                                    </section>

                                    <section className="templates">
                                        <h2>Créer</h2>

                                        <div className="template-row">
                                            {TEMPLATES.map((template, index) => (
                                                <button
                                                    key={template.id}
                                                    className="template"
                                                    style={{ "--i": index }}
                                                    onClick={() =>
                                                        createDocument(template)
                                                    }
                                                >
                                                    <span className="tpl-page">
                                                        {template.id ===
                                                        "blank" ? (
                                                            <Plus size={34} />
                                                        ) : (
                                                            <>
                                                                <i />
                                                                <i />
                                                                <i />
                                                                <i />
                                                            </>
                                                        )}
                                                    </span>

                                                    <strong>
                                                        {template.label}
                                                    </strong>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                </>
                            )}

                            <section className="file-section">
                                <div className="file-section-head">
                                    <h2>
                                        {searching
                                            ? "Résultats de la recherche"
                                            : view === "home"
                                            ? "Récents"
                                            : VIEW_TITLES[view]}
                                    </h2>

                                    {view === "trash" ? (
                                        <button
                                            className="danger-button pill"
                                            onClick={emptyTrash}
                                            disabled={trashDocs.length === 0}
                                        >
                                            <Trash2 size={16} />
                                            Vider la corbeille
                                        </button>
                                    ) : (
                                        <span className="file-count">
                                            {visibleList.length} document
                                            {visibleList.length > 1 ? "s" : ""}
                                        </span>
                                    )}
                                </div>

                                <div className="file-head" aria-hidden="true">
                                    <span />
                                    <span>Nom</span>
                                    <span>Modifié</span>
                                    <span>Accès</span>
                                    <span />
                                </div>

                                {loading ? (
                                    <div className="file-list">
                                        {[0, 1, 2, 3].map((item) => (
                                            <div
                                                key={item}
                                                className="skeleton-row"
                                            />
                                        ))}
                                    </div>
                                ) : visibleList.length === 0 ? (
                                    <div className="file-empty">
                                        <FileText size={38} />
                                        <p>
                                            {searching
                                                ? "Aucun document ne correspond à votre recherche."
                                                : emptyMessages[view]}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="file-list">
                                        {visibleList.map(renderRow)}
                                    </div>
                                )}
                            </section>
                        </div>
                    </main>
                </div>
            )}

            {/* ================= MENU CONTEXTUEL ================= */}

            {menu && menuItem && (
                <>
                    <div
                        className="menu-backdrop"
                        onClick={() => setMenu(null)}
                    />

                    <div
                        className="context-menu"
                        style={{ top: menu.y, left: menu.x }}
                        role="menu"
                    >
                        <button
                            onClick={() => {
                                setMenu(null);
                                setOpenId(menuItem.id);
                            }}
                        >
                            <FolderOpen size={16} />
                            Ouvrir
                        </button>

                        {(menuItem.permission === "owner" ||
                            menuItem.permission === "editor") && (
                            <button
                                onClick={() => {
                                    setMenu(null);
                                    setRenameTarget({
                                        id: menuItem.id,
                                        title: getDocumentTitle(menuItem)
                                    });
                                }}
                            >
                                <Pencil size={16} />
                                Renommer
                            </button>
                        )}

                        <button
                            onClick={() => {
                                setMenu(null);
                                toggleFavorite(menuItem);
                            }}
                        >
                            <Star
                                size={16}
                                className={
                                    menuItem.is_favorite
                                        ? "fav-star"
                                        : undefined
                                }
                            />
                            {menuItem.is_favorite
                                ? "Retirer des favoris"
                                : "Ajouter aux favoris"}
                        </button>

                        {menuItem.permission === "owner" && (
                            <>
                                <button
                                    onClick={() => {
                                        setMenu(null);
                                        setShareId(menuItem.id);
                                    }}
                                >
                                    <Share2 size={16} />
                                    Partager
                                </button>

                                <hr />

                                <button
                                    className="danger"
                                    onClick={() => {
                                        setMenu(null);
                                        moveToTrash(menuItem);
                                    }}
                                >
                                    <Trash2 size={16} />
                                    Mettre à la corbeille
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}

            {/* ================= MODAL RENOMMER ================= */}

            {renameTarget && (
                <div
                    className="modal-overlay"
                    onClick={() => setRenameTarget(null)}
                >
                    <div
                        className="share-modal"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="modal-header">
                            <div>
                                <h2>Renommer le document</h2>
                                <p>Choisissez un nouveau titre.</p>
                            </div>

                            <button
                                className="modal-close"
                                onClick={() => setRenameTarget(null)}
                                aria-label="Fermer"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form className="rename-form" onSubmit={submitRename}>
                            <input
                                type="text"
                                autoFocus
                                maxLength={200}
                                value={renameTarget.title}
                                onChange={(event) =>
                                    setRenameTarget({
                                        ...renameTarget,
                                        title: event.target.value
                                    })
                                }
                                onFocus={(event) => event.target.select()}
                            />

                            <button type="submit" className="share-submit">
                                Enregistrer
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ================= MODAL PARTAGE ================= */}

            {shareDoc && (
                <ShareModal
                    documentId={shareDoc.id}
                    documentTitle={getDocumentTitle(shareDoc)}
                    token={token}
                    onClose={() => setShareId(null)}
                    notify={notify}
                />
            )}

            {/* ================= PERSONNALISATION ================= */}

            {showSettings && (
                <div
                    className="drawer-overlay"
                    onClick={() => setShowSettings(false)}
                >
                    <aside
                        className="settings-drawer"
                        role="dialog"
                        aria-label="Personnalisation"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="drawer-header">
                            <div>
                                <h2>Personnalisation</h2>
                                <p>Adaptez CollabSpace à vos préférences.</p>
                            </div>

                            <button
                                className="icon-button"
                                onClick={() => setShowSettings(false)}
                                aria-label="Fermer"
                            >
                                <X size={19} />
                            </button>
                        </div>

                        <div className="drawer-body">
                            <section className="setting-group">
                                <h3>Thème</h3>

                                <Segmented
                                    value={preferences.mode}
                                    onChange={(mode) => update({ mode })}
                                    options={[
                                        {
                                            value: "light",
                                            label: "Clair",
                                            icon: <Sun size={15} />
                                        },
                                        {
                                            value: "dark",
                                            label: "Sombre",
                                            icon: <Moon size={15} />
                                        },
                                        {
                                            value: "system",
                                            label: "Système",
                                            icon: <Monitor size={15} />
                                        }
                                    ]}
                                />
                            </section>

                            <section className="setting-group">
                                <h3>Couleur d'accent</h3>

                                <div className="swatches">
                                    {ACCENTS.map((accent) => (
                                        <button
                                            key={accent.id}
                                            type="button"
                                            className={
                                                preferences.accent ===
                                                accent.id
                                                    ? "swatch active"
                                                    : "swatch"
                                            }
                                            style={{
                                                background: accent.color
                                            }}
                                            title={accent.label}
                                            aria-label={accent.label}
                                            onClick={() =>
                                                update({ accent: accent.id })
                                            }
                                        >
                                            {preferences.accent ===
                                                accent.id && (
                                                <Check size={16} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section className="setting-group">
                                <h3>Taille du texte de l'éditeur</h3>

                                <Segmented
                                    value={preferences.editorFontSize}
                                    onChange={(editorFontSize) =>
                                        update({ editorFontSize })
                                    }
                                    options={[
                                        { value: "small", label: "Petite" },
                                        { value: "medium", label: "Moyenne" },
                                        { value: "large", label: "Grande" }
                                    ]}
                                />
                            </section>

                            <section className="setting-group">
                                <h3>Police de l'éditeur</h3>

                                <Segmented
                                    value={preferences.editorFont}
                                    onChange={(editorFont) =>
                                        update({ editorFont })
                                    }
                                    options={[
                                        { value: "sans", label: "Moderne" },
                                        { value: "serif", label: "Classique" }
                                    ]}
                                />
                            </section>

                            <section className="setting-group">
                                <h3>Densité de l'interface</h3>

                                <Segmented
                                    value={preferences.density}
                                    onChange={(density) => update({ density })}
                                    options={[
                                        {
                                            value: "comfortable",
                                            label: "Confortable"
                                        },
                                        { value: "compact", label: "Compacte" }
                                    ]}
                                />
                            </section>

                            <section className="setting-group">
                                <div className="setting-row">
                                    <div>
                                        <h3>
                                            <Zap
                                                size={14}
                                                style={{
                                                    marginRight: 6,
                                                    verticalAlign: "-2px"
                                                }}
                                            />
                                            Animations
                                        </h3>

                                        <p>
                                            Transitions et effets de
                                            mouvement.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={preferences.animations}
                                        className={
                                            preferences.animations
                                                ? "switch on"
                                                : "switch"
                                        }
                                        onClick={() =>
                                            update({
                                                animations:
                                                    !preferences.animations
                                            })
                                        }
                                    >
                                        <span className="switch-thumb" />
                                    </button>
                                </div>
                            </section>
                        </div>

                        <div className="drawer-footer">
                            <button className="reset-button" onClick={reset}>
                                <RotateCcw size={15} />
                                Réinitialiser
                            </button>
                        </div>
                    </aside>
                </div>
            )}

            {/* ================= NOTIFICATION (toast) ================= */}

            {toast && (
                <div
                    key={toast.id}
                    className={
                        toast.type === "error" ? "toast error" : "toast"
                    }
                    role="status"
                >
                    {toast.type === "error" ? (
                        <X size={16} />
                    ) : (
                        <Check size={16} />
                    )}
                    {toast.text}
                </div>
            )}
        </>
    );
}

/* =========================================================
   ROUTING
========================================================= */

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/register" element={<Register />} />

            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Workspace />
                    </ProtectedRoute>
                }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}