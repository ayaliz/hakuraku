import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

import type { AuthSessionResponse, AuthUser } from "./authShared";

type AuthContextValue = {
    loading: boolean;
    authenticated: boolean;
    user: AuthUser | null;
    refreshSession: () => Promise<void>;
    setUser: (user: AuthUser | null) => void;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchSession(): Promise<AuthSessionResponse> {
    const response = await fetch("/api/auth/session", {
        credentials: "same-origin",
    });
    if (!response.ok) {
        throw new Error(`Failed to load session: HTTP ${response.status}`);
    }
    return await response.json() as AuthSessionResponse;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<AuthUser | null>(null);

    const refreshSession = async () => {
        try {
            const session = await fetchSession();
            setUser(session.user);
        } catch (error) {
            console.error(error);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void refreshSession();
    }, []);

    const logout = async () => {
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
            },
            body: "{}",
        });
        setUser(null);
    };

    const value = useMemo<AuthContextValue>(() => ({
        loading,
        authenticated: Boolean(user),
        user,
        refreshSession,
        setUser,
        logout,
    }), [loading, user]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
