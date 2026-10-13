import React from "react";

/*
 * Filet de sécurité : si un composant plante pendant le rendu (par
 * exemple à cause d'un document Yjs corrompu), React démonte tout
 * l'arbre par défaut, ce qui donne un écran blanc. Ce composant
 * affiche un message clair à la place, pour pouvoir diagnostiquer le
 * problème au lieu d'avoir juste une page vide.
 */
export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Erreur non gérée dans l'application :", error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        minHeight: "100vh",
                        padding: "2rem",
                        textAlign: "center",
                        fontFamily: "Arial, sans-serif",
                        color: "#172033"
                    }}
                >
                    <h2>Une erreur est survenue</h2>
                    <p>
                        L'application a rencontré un problème inattendu.
                        Vos données ne sont pas perdues : elles restent
                        enregistrées côté serveur.
                    </p>
                    <pre
                        style={{
                            maxWidth: "600px",
                            overflow: "auto",
                            background: "#f1f5f9",
                            padding: "1rem",
                            borderRadius: "8px",
                            fontSize: "12px",
                            textAlign: "left"
                        }}
                    >
                        {String(this.state.error?.message || this.state.error)}
                    </pre>
                    <button
                        onClick={this.handleReload}
                        style={{
                            marginTop: "1rem",
                            padding: "0.6rem 1.2rem",
                            borderRadius: "6px",
                            border: "none",
                            background: "#2563eb",
                            color: "white",
                            cursor: "pointer"
                        }}
                    >
                        Recharger la page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
