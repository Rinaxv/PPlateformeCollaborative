
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_URL = "http://localhost:5000/api";

function App() {
    const [documents, setDocuments] = useState([]);
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [activeMenu, setActiveMenu] = useState("documents");

    useEffect(() => {
        loadDocuments();
    }, []);

    async function loadDocuments() {
        try {
            setLoading(true);

            const response = await axios.get(`${API_URL}/documents`);

            const data = response.data.documents || [];

            setDocuments(data);

            if (data.length > 0) {
                selectDocument(data[0]);
            }
        } catch (error) {
            console.error("Erreur chargement documents :", error);
            setMessage("Impossible de charger les documents.");
        } finally {
            setLoading(false);
        }
    }

    function selectDocument(document) {
        setSelectedDocument(document);

        const documentContent = document.content;

        if (typeof documentContent === "object" && documentContent !== null) {
            setTitle(documentContent.title || "Document sans titre");
            setContent(
                documentContent.text ||
                documentContent.content ||
                ""
            );
        } else {
            setTitle("Document sans titre");
            setContent(documentContent || "");
        }

        setMessage("");
    }

    async function saveDocument() {
        if (!selectedDocument) {
            return;
        }

        try {
            setSaving(true);
            setMessage("");

            await axios.put(
                `${API_URL}/documents/${selectedDocument.id}`,
                {
                    content: {
                        title: title,
                        text: content
                    }
                }
            );

            setDocuments((previousDocuments) =>
                previousDocuments.map((document) =>
                    document.id === selectedDocument.id
                        ? {
                            ...document,
                            content: {
                                title: title,
                                text: content
                            },
                            updated_at: new Date().toISOString()
                        }
                        : document
                )
            );

            setSelectedDocument((previousDocument) => ({
                ...previousDocument,
                content: {
                    title: title,
                    text: content
                },
                updated_at: new Date().toISOString()
            }));

            setMessage("Document enregistré avec succès.");
        } catch (error) {
            console.error("Erreur sauvegarde :", error);
            setMessage("Erreur lors de l'enregistrement.");
        } finally {
            setSaving(false);
        }
    }

    async function createDocument() {
        const newId = `document-${Date.now()}`;

        try {
            await axios.post(`${API_URL}/documents`, {
                id: newId,
                content: {
                    title: "Nouveau document",
                    text: ""
                }
            });

            await loadDocuments();
            setMessage("Nouveau document créé.");
        } catch (error) {
            console.error("Erreur création :", error);
            setMessage("Impossible de créer le document.");
        }
    }

    const filteredDocuments = useMemo(() => {
        return documents.filter((document) => {
            const documentContent = document.content;

            const documentTitle =
                typeof documentContent === "object" &&
                documentContent !== null
                    ? documentContent.title || ""
                    : "";

            return documentTitle
                .toLowerCase()
                .includes(search.toLowerCase());
        });
    }, [documents, search]);

    return (
        <div className="app-layout">

            <aside className="sidebar">

                <div className="brand">
                    <div className="brand-icon">
                        <i className="bi bi-layers-fill"></i>
                    </div>

                    <div>
                        <h5>CollabSpace</h5>
                        <span>Document Workspace</span>
                    </div>
                </div>

                <div className="workspace-selector">
                    <div className="workspace-avatar">G</div>

                    <div className="workspace-info">
                        <strong>Mon espace</strong>
                        <span>Espace personnel</span>
                    </div>

                    <i className="bi bi-chevron-down"></i>
                </div>

                <nav className="sidebar-menu">

                    <p className="menu-label">ESPACE DE TRAVAIL</p>

                    <button
                        className={
                            activeMenu === "dashboard"
                                ? "menu-item active"
                                : "menu-item"
                        }
                        onClick={() => setActiveMenu("dashboard")}
                    >
                        <i className="bi bi-grid-1x2"></i>
                        Tableau de bord
                    </button>

                    <button
                        className={
                            activeMenu === "documents"
                                ? "menu-item active"
                                : "menu-item"
                        }
                        onClick={() => setActiveMenu("documents")}
                    >
                        <i className="bi bi-files"></i>
                        Mes documents
                        <span className="menu-count">
                            {documents.length}
                        </span>
                    </button>

                    <button
                        className="menu-item"
                        onClick={() => setMessage("Fonctionnalité bientôt disponible.")}
                    >
                        <i className="bi bi-star"></i>
                        Favoris
                    </button>

                    <button
                        className="menu-item"
                        onClick={() => setMessage("Fonctionnalité bientôt disponible.")}
                    >
                        <i className="bi bi-trash3"></i>
                        Corbeille
                    </button>

                    <p className="menu-label second-label">CONFIGURATION</p>

                    <button
                        className="menu-item"
                        onClick={() => setMessage("Fonctionnalité bientôt disponible.")}
                    >
                        <i className="bi bi-people"></i>
                        Collaborateurs
                    </button>

                    <button
                        className="menu-item"
                        onClick={() => setMessage("Fonctionnalité bientôt disponible.")}
                    >
                        <i className="bi bi-gear"></i>
                        Paramètres
                    </button>

                </nav>

                <div className="sidebar-bottom">

                    <div className="storage-card">
                        <div className="storage-header">
                            <span>Stockage</span>
                            <i className="bi bi-cloud-check"></i>
                        </div>

                        <div className="storage-progress">
                            <div></div>
                        </div>

                        <small>Documents synchronisés</small>
                    </div>

                    <div className="user-profile">
                        <div className="user-avatar">G</div>

                        <div className="user-info">
                            <strong>Georges</strong>
                            <span>Utilisateur</span>
                        </div>

                        <i className="bi bi-three-dots"></i>
                    </div>

                </div>

            </aside>

            <main className="main-content">

                <header className="topbar">

                    <div className="breadcrumb">
                        <span>Workspace</span>
                        <i className="bi bi-chevron-right"></i>
                        <strong>Documents</strong>
                    </div>

                    <div className="topbar-actions">

                        <div className="connection-status">
                            <span className="status-dot"></span>
                            Connecté
                        </div>

                        <button className="icon-button">
                            <i className="bi bi-bell"></i>
                        </button>

                        <button className="top-avatar">G</button>

                    </div>

                </header>

                <section className="content-area">

                    <div className="page-heading">

                        <div>
                            <p className="page-overline">VOTRE ESPACE</p>
                            <h1>Mes documents</h1>
                            <p className="page-description">
                                Créez, organisez et modifiez vos documents
                                en temps réel.
                            </p>
                        </div>

                        <button
                            className="primary-button"
                            onClick={createDocument}
                        >
                            <i className="bi bi-plus-lg"></i>
                            Nouveau document
                        </button>

                    </div>

                    <div className="statistics">

                        <div className="stat-card">
                            <div className="stat-icon blue">
                                <i className="bi bi-file-earmark-text"></i>
                            </div>

                            <div>
                                <span>Total documents</span>
                                <h3>{documents.length}</h3>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon green">
                                <i className="bi bi-cloud-check"></i>
                            </div>

                            <div>
                                <span>Synchronisation</span>
                                <h3>Active</h3>
                            </div>
                        </div>

                        <div className="stat-card">
                            <div className="stat-icon purple">
                                <i className="bi bi-people"></i>
                            </div>

                            <div>
                                <span>Collaboration</span>
                                <h3>Temps réel</h3>
                            </div>
                        </div>

                    </div>

                    <div className="workspace-grid">

                        <section className="documents-panel">

                            <div className="panel-heading">
                                <div>
                                    <h2>Documents récents</h2>
                                    <span>
                                        {documents.length} document(s)
                                    </span>
                                </div>

                                <button className="small-icon-button">
                                    <i className="bi bi-three-dots"></i>
                                </button>
                            </div>

                            <div className="search-box">
                                <i className="bi bi-search"></i>

                                <input
                                    type="text"
                                    placeholder="Rechercher un document..."
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                />
                            </div>

                            <div className="document-list">

                                {loading && (
                                    <div className="empty-state">
                                        <div className="spinner-border text-primary"></div>
                                        <p>Chargement des documents...</p>
                                    </div>
                                )}

                                {!loading &&
                                    filteredDocuments.length === 0 && (
                                        <div className="empty-state">
                                            <i className="bi bi-file-earmark-x"></i>
                                            <p>Aucun document trouvé.</p>
                                        </div>
                                    )}

                                {!loading &&
                                    filteredDocuments.map((document) => {
                                        const documentContent =
                                            document.content;

                                        const documentTitle =
                                            typeof documentContent === "object" &&
                                            documentContent !== null
                                                ? documentContent.title ||
                                                  "Document sans titre"
                                                : "Document sans titre";

                                        const isSelected =
                                            selectedDocument?.id ===
                                            document.id;

                                        return (
                                            <button
                                                key={document.id}
                                                className={
                                                    isSelected
                                                        ? "document-item selected"
                                                        : "document-item"
                                                }
                                                onClick={() =>
                                                    selectDocument(document)
                                                }
                                            >
                                                <div className="document-icon">
                                                    <i className="bi bi-file-earmark-text"></i>
                                                </div>

                                                <div className="document-details">
                                                    <strong>
                                                        {documentTitle}
                                                    </strong>

                                                    <span>
                                                        Document collaboratif
                                                    </span>

                                                    <small>
                                                        {document.updated_at
                                                            ? new Date(
                                                                document.updated_at
                                                            ).toLocaleDateString()
                                                            : "Récemment"}
                                                    </small>
                                                </div>

                                                {isSelected && (
                                                    <i className="bi bi-check-circle-fill selected-icon"></i>
                                                )}
                                            </button>
                                        );
                                    })}

                            </div>

                        </section>

                        <section className="editor-panel">

                            <div className="editor-header">

                                <div className="editor-document-info">
                                    <div className="editor-file-icon">
                                        <i className="bi bi-file-earmark-richtext"></i>
                                    </div>

                                    <div>
                                        <span>DOCUMENT ACTUEL</span>
                                        <strong>
                                            {selectedDocument
                                                ? "Modification en cours"
                                                : "Aucun document sélectionné"}
                                        </strong>
                                    </div>
                                </div>

                                <div className="editor-status">
                                    <span className="status-dot"></span>
                                    Synchronisé
                                </div>

                            </div>

                            <div className="editor-toolbar">
                                <button>
                                    <i className="bi bi-type-bold"></i>
                                </button>

                                <button>
                                    <i className="bi bi-type-italic"></i>
                                </button>

                                <button>
                                    <i className="bi bi-type-underline"></i>
                                </button>

                                <span className="toolbar-separator"></span>

                                <button>
                                    <i className="bi bi-list-ul"></i>
                                </button>

                                <button>
                                    <i className="bi bi-list-ol"></i>
                                </button>

                                <button>
                                    <i className="bi bi-link-45deg"></i>
                                </button>

                                <span className="toolbar-separator"></span>

                                <button>
                                    <i className="bi bi-chat-left-text"></i>
                                </button>

                                <button>
                                    <i className="bi bi-three-dots"></i>
                                </button>
                            </div>

                            <div className="editor-body">

                                {selectedDocument ? (
                                    <>
                                        <input
                                            className="document-title-input"
                                            value={title}
                                            onChange={(event) =>
                                                setTitle(event.target.value)
                                            }
                                            placeholder="Titre du document"
                                        />

                                        <div className="editor-meta">
                                            <span>
                                                <i className="bi bi-person"></i>
                                                Georges
                                            </span>

                                            <span>
                                                <i className="bi bi-clock"></i>
                                                Modification locale
                                            </span>
                                        </div>

                                        <textarea
                                            className="document-editor"
                                            value={content}
                                            onChange={(event) =>
                                                setContent(event.target.value)
                                            }
                                            placeholder="Commencez à écrire votre document..."
                                        ></textarea>
                                    </>
                                ) : (
                                    <div className="empty-editor">
                                        <i className="bi bi-file-earmark-plus"></i>
                                        <h3>Sélectionnez un document</h3>
                                        <p>
                                            Choisissez un document dans la liste
                                            pour commencer à le modifier.
                                        </p>
                                    </div>
                                )}

                            </div>

                            <div className="editor-footer">

                                <div className="editor-footer-info">
                                    <i className="bi bi-shield-check"></i>
                                    Vos modifications sont sécurisées
                                </div>

                                <div className="editor-footer-actions">

                                    {message && (
                                        <span className="save-message">
                                            {message}
                                        </span>
                                    )}

                                    <button
                                        className="save-button"
                                        onClick={saveDocument}
                                        disabled={
                                            !selectedDocument || saving
                                        }
                                    >
                                        <i className="bi bi-cloud-arrow-up"></i>

                                        {saving
                                            ? "Enregistrement..."
                                            : "Enregistrer"}
                                    </button>

                                </div>

                            </div>

                        </section>

                    </div>

                </section>

            </main>

        </div>
    );
}

export default App;