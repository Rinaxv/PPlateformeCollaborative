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

import {
    FileText
} from "lucide-react";

import "./auth.css";

export default function Register() {

    const navigate =
        useNavigate();

    const {
        register
    } = useAuth();

    const [name, setName] =
        useState("");

    const [email, setEmail] =
        useState("");

    const [password, setPassword] =
        useState("");

    const [
        confirmPassword,
        setConfirmPassword
    ] = useState("");

    const [error, setError] =
        useState("");

    const [loading, setLoading] =
        useState(false);

    const handleSubmit =
        async (event) => {

            event.preventDefault();

            setError("");

            if (
                password !==
                confirmPassword
            ) {

                setError(
                    "Les mots de passe ne correspondent pas."
                );

                return;
            }

            if (
                password.length < 6
            ) {

                setError(
                    "Le mot de passe doit contenir au moins 6 caractères."
                );

                return;
            }

            setLoading(true);

            try {

                await register(
                    name,
                    email,
                    password
                );

                navigate("/");

            } catch (error) {

                console.error(
                    error
                );

                setError(
                    error.response?.data?.message ||
                    "Erreur lors de l'inscription."
                );

            } finally {

                setLoading(false);
            }
        };

    return (

        <div className="auth-page">

            <div className="auth-card">

                <div className="auth-logo">

                    <FileText
                        size={25}
                    />

                </div>

                <h1>
                    Créer votre compte
                </h1>

                <p className="auth-subtitle">
                    Rejoignez votre espace
                    collaboratif.
                </p>

                {error && (

                    <div className="auth-error">
                        {error}
                    </div>

                )}

                <form
                    onSubmit={
                        handleSubmit
                    }
                >

                    <label>
                        Nom complet
                    </label>

                    <input
                        type="text"
                        value={name}
                        onChange={
                            event =>
                                setName(
                                    event.target.value
                                )
                        }
                        placeholder="Votre nom"
                        required
                    />

                    <label>
                        Adresse email
                    </label>

                    <input
                        type="email"
                        value={email}
                        onChange={
                            event =>
                                setEmail(
                                    event.target.value
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
                        onChange={
                            event =>
                                setPassword(
                                    event.target.value
                                )
                        }
                        placeholder="Minimum 6 caractères"
                        required
                    />

                    <label>
                        Confirmer le mot de passe
                    </label>

                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={
                            event =>
                                setConfirmPassword(
                                    event.target.value
                                )
                        }
                        placeholder="Confirmez le mot de passe"
                        required
                    />

                    <button
                        type="submit"
                        disabled={
                            loading
                        }
                    >

                        {loading
                            ? "Création..."
                            : "Créer mon compte"}

                    </button>

                </form>

                <p className="auth-footer">

                    Vous avez déjà
                    un compte ?

                    {" "}

                    <Link to="/login">
                        Se connecter
                    </Link>

                </p>

            </div>

        </div>
    );
}