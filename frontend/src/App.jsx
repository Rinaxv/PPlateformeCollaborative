import React, { useEffect, useMemo, useState } from "react";

import axios from "axios";

import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import {
    FileText,
    LayoutDashboard,
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
    Clock,
    Check,
    Zap,
    Pencil
} from "lucide-react";

import { useAuth } from "./AuthContext";
import { ACCENTS, useTheme } from "./theme";

import Login from "./Login";
import Register from "./Register";
import ProtectedRoute from "./ProtectedRoute";
import TextEditor from "./TextEditor";
import ShareModal from "./ShareModal";

import "./App.css";
import "./organize.css";
import "./extras.css";

const API_URL = "http://localhost:5000/api";

/* =========================================================
   OUTILS
========================================================= */

const NAV_ITEMS = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "all", label: "Documents", icon: FileText },
    { id: "favorites", label: "Favoris", icon: Star },
    { id: "trash", label: "Corbeille", icon: Trash2 }
];

const VIEW_META = {
    dashboard: {
        eyebrow: "VUE D'ENSEMBLE",
        subtitle: "Retrouvez l'essentiel de votre activité, en un coup d'œil."
    },
    all: {
        eyebrow: "VOTRE ESPACE",
        line1: "Mes",
        line2: "documents",
        subtitle: "Créez, organisez et modifiez vos documents en temps réel."
    },
    favorites: {
        eyebrow: "ACCÈS RAPIDE",
        line1: "Vos",
        line2: "favoris",
        subtitle: "Vos documents importants, toujours à portée de main."
    },
    trash: {
        eyebrow: "DOCUMENTS SUPPRIMÉS",
        line1: "La",
        line2: "corbeille",
        subtitle: "Restaurez un document ou supprimez-le définitivement."
    }
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
    const [selectedId, setSelectedId] = useState(null);
    const [view, setView] = useState("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const [showShare, setShowShare] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);

    const [menu, setMenu] = useState(null);
    const [renameTarget, setRenameTarget] = useState(null);
    const [toast, setToast] = useState(null);

    const authConfig = {
        headers: { Authorization: `Bearer ${token}` }
    };

    /* ---------------- NOTIFICATIONS ---------------- */

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
                setShowShare(false);
                setShowSettings(false);
                setMenuOpen(false);
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

    /* ---------------- DOCUMENT SELECTIONNE ---------------- */

    const selectedDocument =
        documents.find((item) => item.id === selectedId) ||
        documents[0] ||
        null;

    const selectedTrash =
        trashDocs.find((item) => item.id === selectedId) || null;

    /* ---------------- CREATION ---------------- */

    const createDocument = async () => {
        try {
            const existingTitles = new Set(
                [...documents, ...trashDocs].map((item) =>
                    String(item.content?.title || "")
                        .trim()
                        .toLocaleLowerCase()
                )
            );

            let titleNumber = 1;

            while (
                existingTitles.has(
                    `nouveau document ${titleNumber}`.toLocaleLowerCase()
                )
            ) {
                titleNumber += 1;
            }

            const documentTitle = `Nouveau document ${titleNumber}`;
            const documentId = `document-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 7)}`;

            const response = await axios.post(
                `${API_URL}/documents`,
                {
                    id: documentId,
                    content: { title: documentTitle, text: "" }
                },
                authConfig
            );

            const newDocument = { ...response.data, is_favorite: false };

            setDocuments((previous) => [newDocument, ...previous]);
            setSelectedId(newDocument.id);
            setView("all");
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

    const menuItem =
        menu &&
        (view === "trash" ? trashDocs : documents).find(
            (entry) => entry.id === menu.id
        );

    const changeView = (nextView) => {
        setView(nextView);
        setSearch("");
        setMenuOpen(false);
    };

    /* ---------------- DONNEES CALCULEES ---------------- */

    const favoriteDocs = useMemo(
        () => documents.filter((item) => item.is_favorite),
        [documents]
    );

    const visibleList = useMemo(() => {
        const base =
            view === "trash"
                ? trashDocs
                : view === "favorites"
                ? favoriteDocs
                : documents;

        const term = search.trim().toLowerCase();

        return base.filter((item) =>
            getDocumentTitle(item).toLowerCase().includes(term)
        );
    }, [view, documents, trashDocs, favoriteDocs, search]);

    const sharedCount = documents.filter(
        (item) => item.permission !== "owner"
    ).length;

    const lastActivity = documents.length
        ? formatRelativeDate(documents[0].updated_at || documents[0].created_at)
        : "—";

    const firstName = user?.name?.trim().split(" ")[0] || "";
    const initial = user?.name?.charAt(0)?.toUpperCase() || "U";
    const isDark = resolvedMode === "dark";

    const meta = VIEW_META[view];
    const line1 = view === "dashboard" ? "Bonjour," : meta.line1;
    const line2 = view === "dashboard" ? firstName || "vous" : meta.line2;

    const counts = {
        dashboard: null,
        all: documents.length,
        favorites: favoriteDocs.length,
        trash: trashDocs.length
    };

    /* ---------------- BLOCS REUTILISABLES ---------------- */

    const renderDocCard = (item, index) => (
        <button
            key={item.id}
            className="doc-card"
            style={{ "--i": index }}
            onClick={() => {
                setSelectedId(item.id);
                setView("all");
            }}
        >
            <div className="doc-card-top">
                <div className="document-item-icon">
                    <FileText size={18} />
                </div>

                {item.is_favorite && <Star size={16} className="fav-star" />}
            </div>

            <strong>{getDocumentTitle(item)}</strong>

            <span className="meta">
                {getPermissionLabel(item.permission)}
                {" · "}
                {formatRelativeDate(item.updated_at || item.created_at)}
            </span>
        </button>
    );

    const emptyMessages = {
        all: {
            title: "Aucun document trouvé",
            text: search
                ? "Essayez avec un autre mot-clé."
                : "Créez votre premier document collaboratif."
        },
        favorites: {
            title: "Aucun favori",
            text: search
                ? "Essayez avec un autre mot-clé."
                : "Cliquez sur « ⋯ » puis « Ajouter aux favoris » sur un document."
        },
        trash: {
            title: "La corbeille est vide",
            text: search
                ? "Essayez avec un autre mot-clé."
                : "Les documents supprimés apparaîtront ici."
        }
    };

    /* ---------------- RENDER ---------------- */

    return (
        <div className="app-shell">
            {/* ================= BARRE DE NAVIGATION ================= */}

            <header className="topnav-wrap">
                <nav className="topnav">
                    <div className="nav-brand" translate="no">
                        <span className="brand-mark">
                            <Logo size={20} />
                        </span>
                        <strong>CollabSpace</strong>
                    </div>

                    <div className={menuOpen ? "nav-links open" : "nav-links"}>
                        {NAV_ITEMS.map((item) => {
                            const Icon = item.icon;

                            return (
                                <button
                                    key={item.id}
                                    className={
                                        view === item.id
                                            ? "nav-link active"
                                            : "nav-link"
                                    }
                                    onClick={() => changeView(item.id)}
                                >
                                    <Icon size={16} />
                                    <span>{item.label}</span>

                                    {counts[item.id] !== null && (
                                        <em className="nav-count">
                                            {counts[item.id]}
                                        </em>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="nav-actions">
                        <span
                            className={
                                online ? "nav-status" : "nav-status offline"
                            }
                            title={online ? "Connecté" : "Hors-ligne"}
                        >
                            <span className="status-dot" />
                        </span>

                        <button
                            className="nav-icon"
                            onClick={() =>
                                update({ mode: isDark ? "light" : "dark" })
                            }
                            title={
                                isDark
                                    ? "Passer au mode clair"
                                    : "Passer au mode sombre"
                            }
                            aria-label="Changer de thème"
                        >
                            <span key={resolvedMode} className="theme-icon">
                                {isDark ? (
                                    <Sun size={17} />
                                ) : (
                                    <Moon size={17} />
                                )}
                            </span>
                        </button>

                        <button
                            className="nav-icon"
                            onClick={() => setShowSettings(true)}
                            title="Personnaliser l'interface"
                            aria-label="Personnaliser l'interface"
                        >
                            <Palette size={17} />
                        </button>

                        <div className="user-chip" title={user?.email}>
                            <span className="user-chip-avatar">{initial}</span>
                            <span className="user-chip-name">
                                {user?.name}
                            </span>
                        </div>

                        <button
                            className="nav-logout"
                            onClick={handleLogout}
                            title="Se déconnecter"
                            aria-label="Se déconnecter"
                        >
                            <LogOut size={16} />
                            <span>Déconnexion</span>
                        </button>

                        <button
                            className="nav-icon menu-toggle"
                            onClick={() => setMenuOpen((open) => !open)}
                            aria-label="Menu"
                        >
                            {menuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </nav>
            </header>

            {/* ================= CONTENU ================= */}

            <main className="page">
                {/* ---------- HERO ---------- */}

                <section className="hero" key={view}>
                    <div className="hero-copy">
                        <span className="eyebrow">{meta.eyebrow}</span>

                        <h1>
                            <span>{line1}</span>
                            <span className="faded">{line2}</span>
                        </h1>

                        <p className="hero-subtitle">{meta.subtitle}</p>

                        <div className="hero-meta">
                            <span>
                                {online ? "TEMPS RÉEL ACTIF" : "HORS-LIGNE"}
                            </span>

                            <i className="meta-line">
                                <b />
                                <b />
                            </i>
                        </div>

                        <div className="hero-actions">
                            {view === "trash" ? (
                                <button
                                    className="danger-button pill"
                                    onClick={emptyTrash}
                                    disabled={trashDocs.length === 0}
                                >
                                    <Trash2 size={17} />
                                    Vider la corbeille
                                </button>
                            ) : (
                                <button
                                    className="new-document-button"
                                    onClick={createDocument}
                                >
                                    <Plus size={18} />
                                    Nouveau document
                                </button>
                            )}

                            <div className="hero-switch" role="tablist">
                                {[
                                    { id: "all", label: "Documents" },
                                    { id: "favorites", label: "Favoris" },
                                    { id: "trash", label: "Corbeille" }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        role="tab"
                                        aria-selected={view === tab.id}
                                        className={
                                            view === tab.id ? "active" : ""
                                        }
                                        onClick={() => changeView(tab.id)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <span className="sparkles" aria-hidden="true">
                                ✦ ✦ ✦
                            </span>
                        </div>
                    </div>

                    <div className="hero-visual">
                        <div className="hv-stripes">
                            <div className="hv-logo">
                                <Logo size={30} />
                            </div>
                        </div>

                        <div className="hv-main">
                            <span className="hv-label">Documents totaux</span>

                            <strong className="hv-number">
                                {documents.length}
                            </strong>

                            <div className="hv-row">
                                <div className="hv-tile">
                                    <Users size={16} />
                                    <strong>{sharedCount}</strong>
                                    <span>Partagés avec moi</span>
                                </div>

                                <div className="hv-tile">
                                    <Clock size={16} />
                                    <strong className="small">
                                        {lastActivity}
                                    </strong>
                                    <span>Dernière activité</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ---------- TABLEAU DE BORD ---------- */}

                {view === "dashboard" && (
                    <>
                        <section className="dashboard-section">
                            <h2>Récemment modifiés</h2>

                            {loading ? (
                                <div className="doc-grid">
                                    {[0, 1, 2].map((item) => (
                                        <div
                                            key={item}
                                            className="skeleton-row"
                                            style={{ height: 130 }}
                                        />
                                    ))}
                                </div>
                            ) : documents.length === 0 ? (
                                <div className="section-empty">
                                    Aucun document pour le moment.
                                </div>
                            ) : (
                                <div className="doc-grid">
                                    {documents.slice(0, 6).map(renderDocCard)}
                                </div>
                            )}
                        </section>

                        <section className="dashboard-section">
                            <h2>Mes favoris</h2>

                            {favoriteDocs.length === 0 ? (
                                <div className="section-empty">
                                    Aucun favori. Utilisez le menu « ⋯ » d'un
                                    document pour en ajouter.
                                </div>
                            ) : (
                                <div className="doc-grid">
                                    {favoriteDocs
                                        .slice(0, 6)
                                        .map(renderDocCard)}
                                </div>
                            )}
                        </section>
                    </>
                )}

                {/* ---------- LISTE + EDITEUR / CORBEILLE ---------- */}

                {view !== "dashboard" && (
                    <div className="documents-workspace">
                        <section className="documents-card">
                            <div className="documents-card-header">
                                <div>
                                    <h2>
                                        {view === "trash"
                                            ? "Documents supprimés"
                                            : view === "favorites"
                                            ? "Documents favoris"
                                            : "Documents récents"}
                                    </h2>
                                    <span>
                                        {visibleList.length} document
                                        {visibleList.length > 1 ? "s" : ""}
                                    </span>
                                </div>

                                <MoreHorizontal size={19} />
                            </div>

                            <div className="search-box">
                                <Search size={16} />

                                <input
                                    type="text"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                    placeholder="Rechercher un document..."
                                />
                            </div>

                            {loading ? (
                                <div className="document-list">
                                    {[0, 1, 2, 3, 4].map((item) => (
                                        <div
                                            key={item}
                                            className="skeleton-row"
                                        />
                                    ))}
                                </div>
                            ) : visibleList.length === 0 ? (
                                <div className="documents-empty">
                                    {view === "trash" ? (
                                        <Trash2 size={38} />
                                    ) : view === "favorites" ? (
                                        <Star size={38} />
                                    ) : (
                                        <FileText size={38} />
                                    )}

                                    <h3>{emptyMessages[view].title}</h3>

                                    <p>{emptyMessages[view].text}</p>

                                    {view === "all" && !search && (
                                        <button onClick={createDocument}>
                                            <Plus size={16} />
                                            Créer un document
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="document-list">
                                    {visibleList.map((item, index) => {
                                        const isSelected =
                                            view === "trash"
                                                ? selectedTrash?.id === item.id
                                                : selectedDocument?.id ===
                                                  item.id;

                                        return (
                                            <div
                                                key={item.id}
                                                role="button"
                                                tabIndex={0}
                                                style={{
                                                    "--i": Math.min(index, 12)
                                                }}
                                                className={
                                                    isSelected
                                                        ? "document-item selected"
                                                        : "document-item"
                                                }
                                                onClick={() =>
                                                    setSelectedId(item.id)
                                                }
                                                onKeyDown={(event) => {
                                                    if (
                                                        event.key === "Enter" ||
                                                        event.key === " "
                                                    ) {
                                                        event.preventDefault();
                                                        setSelectedId(item.id);
                                                    }
                                                }}
                                            >
                                                <div className="document-item-icon">
                                                    <FileText size={17} />
                                                </div>

                                                <div className="document-item-content">
                                                    <strong>
                                                        {getDocumentTitle(item)}
                                                    </strong>

                                                    <span>
                                                        {view === "trash"
                                                            ? `Supprimé · ${formatRelativeDate(
                                                                  item.deleted_at
                                                              ).toLowerCase()}`
                                                            : `${getPermissionLabel(
                                                                  item.permission
                                                              )} · ${formatRelativeDate(
                                                                  item.updated_at ||
                                                                      item.created_at
                                                              )}`}
                                                    </span>
                                                </div>

                                                {view !== "trash" &&
                                                    item.is_favorite && (
                                                        <Star
                                                            size={15}
                                                            className="fav-star"
                                                        />
                                                    )}

                                                <button
                                                    type="button"
                                                    className="item-menu-button"
                                                    aria-label="Actions"
                                                    onClick={(event) =>
                                                        openMenu(event, item)
                                                    }
                                                >
                                                    <MoreHorizontal
                                                        size={17}
                                                    />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* ---------- PANNEAU DROIT ---------- */}

                        <section className="editor-card">
                            {view === "trash" ? (
                                selectedTrash ? (
                                    <div className="trash-pane">
                                        <div className="editor-empty-icon">
                                            <Trash2 size={36} />
                                        </div>

                                        <h2>
                                            {getDocumentTitle(selectedTrash)}
                                        </h2>

                                        <p>
                                            Ce document est dans la corbeille.
                                            Restaurez-le pour le modifier à
                                            nouveau, ou supprimez-le
                                            définitivement.
                                        </p>

                                        <div className="trash-actions">
                                            <button
                                                className="restore-button"
                                                onClick={() =>
                                                    restoreDocument(
                                                        selectedTrash
                                                    )
                                                }
                                            >
                                                <RotateCcw size={16} />
                                                Restaurer
                                            </button>

                                            <button
                                                className="danger-button"
                                                onClick={() =>
                                                    deleteForever(selectedTrash)
                                                }
                                            >
                                                <Trash2 size={16} />
                                                Supprimer définitivement
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="editor-empty">
                                        <div className="editor-empty-icon">
                                            <Trash2 size={36} />
                                        </div>

                                        <h2>Corbeille</h2>

                                        <p>
                                            Sélectionnez un document supprimé
                                            pour le restaurer ou l'effacer
                                            définitivement.
                                        </p>
                                    </div>
                                )
                            ) : selectedDocument ? (
                                <>
                                    <div className="editor-card-header">
                                        <div className="editor-card-meta">
                                            <span
                                                className={
                                                    selectedDocument.permission ===
                                                    "owner"
                                                        ? "permission-badge owner"
                                                        : selectedDocument.permission ===
                                                          "editor"
                                                        ? "permission-badge editor"
                                                        : "permission-badge viewer"
                                                }
                                            >
                                                {getPermissionLabel(
                                                    selectedDocument.permission
                                                )}
                                            </span>

                                            <span className="editor-card-date">
                                                Modifié{" "}
                                                {formatRelativeDate(
                                                    selectedDocument.updated_at ||
                                                        selectedDocument.created_at
                                                ).toLowerCase()}
                                            </span>
                                        </div>

                                        {selectedDocument.permission ===
                                            "owner" && (
                                            <button
                                                className="share-button"
                                                onClick={() =>
                                                    setShowShare(true)
                                                }
                                            >
                                                <Share2 size={16} />
                                                Partager
                                            </button>
                                        )}
                                    </div>

                                    <div className="editor-wrapper">
                                        <TextEditor
                                            key={selectedDocument.id}
                                            document={selectedDocument}
                                            documentId={selectedDocument.id}
                                            documentTitle={getDocumentTitle(
                                                selectedDocument
                                            )}
                                            token={token}
                                            readOnly={
                                                selectedDocument.permission ===
                                                "viewer"
                                            }
                                            onSaved={() => loadDocuments(true)}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="editor-empty">
                                    <div className="editor-empty-icon">
                                        <FileText size={36} />
                                    </div>

                                    <h2>Sélectionnez un document</h2>

                                    <p>
                                        Choisissez un document dans la liste
                                        pour commencer à le modifier.
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>

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
                        {view === "trash" ? (
                            <>
                                <button
                                    onClick={() => {
                                        setMenu(null);
                                        restoreDocument(menuItem);
                                    }}
                                >
                                    <RotateCcw size={16} />
                                    Restaurer
                                </button>

                                <hr />

                                <button
                                    className="danger"
                                    onClick={() => {
                                        setMenu(null);
                                        deleteForever(menuItem);
                                    }}
                                >
                                    <Trash2 size={16} />
                                    Supprimer définitivement
                                </button>
                            </>
                        ) : (
                            <>
                                {(menuItem.permission === "owner" ||
                                    menuItem.permission === "editor") && (
                                    <button
                                        onClick={() => {
                                            setMenu(null);
                                            setRenameTarget({
                                                id: menuItem.id,
                                                title: getDocumentTitle(
                                                    menuItem
                                                )
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
                                                setSelectedId(menuItem.id);
                                                setShowShare(true);
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

            {showShare && selectedDocument && (
                <ShareModal
                    documentId={selectedDocument.id}
                    documentTitle={getDocumentTitle(selectedDocument)}
                    token={token}
                    onClose={() => setShowShare(false)}
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

            {/* ================= NOTIFICATION ================= */}

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
        </div>
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