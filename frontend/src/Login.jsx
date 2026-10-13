import React, {
    useState
} from "react";

import {
    Link,
    useNavigate
} from "react-router-dom";

import {
    useAuth
} from "./AuthContext";

import "./auth.css";

export default function Login() {

    const navigate =
        useNavigate();

    const {
        login
    } = useAuth();

    const [email, setEmail] =
        useState("");

    const [password, setPassword] =
        useState("");

    const [error, setError] =
        useState("");

    const [loading, setLoading] =
        useState(false);

    const handleSubmit =
        async (event) => {

            event.preventDefault();

            setError("");
            setLoading(true);

            try {

                await login(
                    email,
                    password
                );

                navigate("/");

            } catch (error) {

                setError(
                    error.response?.data?.message ||
                    "Erreur lors de la connexion."
                );

            } finally {

                setLoading(false);
            }
        };

    return (
        <div className="auth-page">

            <div className="auth-card">

                <div className="auth-logo">
                    C
                </div>

                <h1>
                    Bienvenue sur CollabSpace
                </h1>

                <p className="auth-subtitle">
                    Connectez-vous à votre espace
                    collaboratif.
                </p>

                {error && (
                    <div className="auth-error">
                        {error}
                    </div>
                )}

                <form
                    onSubmit={handleSubmit}
                >

                    <label>
                        Adresse email
                    </label>

                    <input
                        type="email"
                        value={email}
                        onChange={(e) =>
                            setEmail(
                                e.target.value
                            )
                        }
                        placeholder="exemple@email.com"
                        required
                    />

                    <label>
                        Mot de passe
                    </label>

                    <input
                        type="password"
                        value={password}
                        onChange={(e) =>
                            setPassword(
                                e.target.value
                            )
                        }
                        placeholder="Votre mot de passe"
                        required
                    />

                    <button
                        type="submit"
                        disabled={loading}
                    >
                        {loading
                            ? "Connexion..."
                            : "Se connecter"}
                    </button>

                </form>

                <p className="auth-footer">

                    Vous n'avez pas encore
                    de compte ?

                    {" "}

                    <Link to="/register">
                        Créer un compte
                    </Link>

                </p>

            </div>

        </div>
    );
}