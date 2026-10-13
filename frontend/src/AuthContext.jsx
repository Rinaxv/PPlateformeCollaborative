import React, {
    createContext,
    useContext,
    useEffect,
    useState
} from "react";

import axios from "axios";

const API_URL =
    "http://localhost:5000/api";

const AuthContext =
    createContext(null);

export function AuthProvider({
    children
}) {

    const [user, setUser] =
        useState(null);

    const [token, setToken] =
        useState(
            localStorage.getItem(
                "collabspace_token"
            )
        );

    const [loading, setLoading] =
        useState(true);

    useEffect(() => {

        const loadUser =
            async () => {

                if (!token) {

                    setLoading(false);

                    return;
                }

                try {

                    const response =
                        await axios.get(
                            `${API_URL}/auth/me`,
                            {
                                headers: {
                                    Authorization:
                                        `Bearer ${token}`
                                }
                            }
                        );

                    setUser(
                        response.data.user
                    );

                } catch (error) {

                    console.error(
                        "Session invalide :",
                        error
                    );

                    localStorage.removeItem(
                        "collabspace_token"
                    );

                    setToken(null);
                    setUser(null);

                } finally {

                    setLoading(false);
                }
            };

        loadUser();

    }, [token]);

    /* =====================================================
       LOGIN
    ===================================================== */

    const login =
        async (
            email,
            password
        ) => {

            const response =
                await axios.post(
                    `${API_URL}/auth/login`,
                    {
                        email,
                        password
                    }
                );

            const newToken =
                response.data.token;

            localStorage.setItem(
                "collabspace_token",
                newToken
            );

            setToken(newToken);

            setUser(
                response.data.user
            );

            return response.data;
        };

    /* =====================================================
       REGISTER
    ===================================================== */

    const register =
        async (
            name,
            email,
            password
        ) => {

            const response =
                await axios.post(
                    `${API_URL}/auth/register`,
                    {
                        name,
                        email,
                        password
                    }
                );

            const newToken =
                response.data.token;

            localStorage.setItem(
                "collabspace_token",
                newToken
            );

            setToken(newToken);

            setUser(
                response.data.user
            );

            return response.data;
        };

    /* =====================================================
       LOGOUT
    ===================================================== */

    const logout =
        () => {

            localStorage.removeItem(
                "collabspace_token"
            );

            setToken(null);
            setUser(null);
        };

    return (

        <AuthContext.Provider
            value={{
                user,
                token,
                loading,
                login,
                register,
                logout,
                isAuthenticated:
                    !!user && !!token
            }}
        >

            {children}

        </AuthContext.Provider>
    );
}

export function useAuth() {

    return useContext(
        AuthContext
    );
}