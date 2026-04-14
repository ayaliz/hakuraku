import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, Form, Spinner } from "react-bootstrap";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import type {
    AuthMessageResponse,
    AuthLoginRequest,
    AuthLoginResponse,
    AuthRequestPasswordResetRequest,
    AuthRegisterRequest,
    AuthRegisterResponse,
    AuthResetPasswordRequest,
    AuthResetPasswordResponse,
    AuthVerifyEmailRequest,
    AuthVerifyEmailResponse,
} from "../auth/authShared";
import "./AuthPage.css";

type AuthMode = "login" | "register" | "verify" | "reset";

async function readError(response: Response): Promise<string> {
    try {
        const payload = await response.json() as { error?: string };
        return payload.error ?? `HTTP ${response.status}`;
    } catch {
        return `HTTP ${response.status}`;
    }
}

export default function AuthPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { authenticated, user, setUser, refreshSession } = useAuth();

    const token = searchParams.get("token");
    const requestedMode = searchParams.get("mode");
    const redirectTo = searchParams.get("redirect") || "/account";

    const mode: AuthMode = token
        ? (requestedMode === "reset" ? "reset" : "verify")
        : requestedMode === "register"
            ? "register"
            : requestedMode === "reset"
                ? "reset"
                : "login";

    const [accountName, setAccountName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [verifying, setVerifying] = useState(mode === "verify");
    const [requestResetOnly, setRequestResetOnly] = useState(false);
    const consumedVerifyTokensRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (mode !== "reset") {
            setRequestResetOnly(false);
            return;
        }
        if (token) {
            setRequestResetOnly(false);
        }
    }, [mode, token]);

    useEffect(() => {
        if (!token || mode !== "verify") {
            setVerifying(false);
            return;
        }

        if (consumedVerifyTokensRef.current.has(token)) {
            setVerifying(false);
            return;
        }

        let cancelled = false;
        setVerifying(true);
        setError(null);
        setMessage(null);

        (async () => {
            const response = await fetch("/api/auth/verify-email", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    token,
                } satisfies AuthVerifyEmailRequest),
            });

            if (cancelled) return;

            if (!response.ok) {
                setError(await readError(response));
                setVerifying(false);
                return;
            }

            const payload = await response.json() as AuthVerifyEmailResponse;
            consumedVerifyTokensRef.current.add(token);
            setUser(payload.user);
            setMessage("Your email is confirmed and you are now signed in.");
            setVerifying(false);
            await refreshSession();
        })().catch((verifyError) => {
            if (cancelled) return;
            setError(verifyError instanceof Error ? verifyError.message : String(verifyError));
            setVerifying(false);
        });

        return () => {
            cancelled = true;
        };
    }, [token, mode, setUser, refreshSession]);

    useEffect(() => {
        if (authenticated && mode !== "verify" && mode !== "reset") {
            navigate(redirectTo, { replace: true });
        }
    }, [authenticated, mode, navigate, redirectTo]);

    const panelTitle = useMemo(() => {
        if (mode === "verify") return "Confirm your email";
        if (mode === "register") return "Create your Hakuraku account";
        if (mode === "reset") return token ? "Choose a new password" : "Reset your password";
        return "Sign in to Hakuraku";
    }, [mode]);

    const switchMode = (nextMode: Exclude<AuthMode, "verify">) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("token");
        if (nextMode === "register" || nextMode === "reset") {
            nextParams.set("mode", nextMode);
        } else {
            nextParams.delete("mode");
        }
        if (nextMode !== "reset") {
            setRequestResetOnly(false);
        }
        setSearchParams(nextParams, { replace: true });
        setError(null);
        setMessage(null);
    };

    const setResetMode = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("token");
        nextParams.set("mode", "reset");
        setSearchParams(nextParams, { replace: true });
        setRequestResetOnly(true);
        setError(null);
        setMessage(null);
    };

    const submitResetRequest = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            const response = await fetch("/api/auth/request-password-reset", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email,
                } satisfies AuthRequestPasswordResetRequest),
            });
            if (!response.ok) {
                setError(await readError(response));
                return;
            }
            const payload = await response.json() as AuthMessageResponse;
            setMessage(payload.message);
        } finally {
            setSubmitting(false);
        }
    };

    const submitResetPassword = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!token) {
            setError("Password reset token is missing.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }
        setSubmitting(true);
        setError(null);
        setMessage(null);
        try {
            const response = await fetch("/api/auth/reset-password", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    token,
                    password,
                } satisfies AuthResetPasswordRequest),
            });
            if (!response.ok) {
                setError(await readError(response));
                return;
            }
            const payload = await response.json() as AuthResetPasswordResponse;
            setUser(payload.user);
            await refreshSession();
            navigate(redirectTo, { replace: true });
        } finally {
            setSubmitting(false);
        }
    };

    const submitRegister = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setMessage(null);

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch("/api/auth/register", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    accountName,
                    email,
                    password,
                } satisfies AuthRegisterRequest),
            });

            if (!response.ok) {
                setError(await readError(response));
                return;
            }

            const payload = await response.json() as AuthRegisterResponse;
            setMessage(`Confirmation email sent to ${payload.email}. Open that link to finish registration.`);
            setAccountName("");
            setPassword("");
            setConfirmPassword("");
        } finally {
            setSubmitting(false);
        }
    };

    const submitLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);
        setMessage(null);
        setSubmitting(true);
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    identifier: email,
                    password,
                } satisfies AuthLoginRequest),
            });

            if (!response.ok) {
                setError(await readError(response));
                return;
            }

            const payload = await response.json() as AuthLoginResponse;
            setUser(payload.user);
            await refreshSession();
            navigate(redirectTo, { replace: true });
        } finally {
            setSubmitting(false);
        }
    };

    const resendVerification = async () => {
        setError(null);
        setMessage(null);
        setSubmitting(true);
        try {
            const response = await fetch("/api/auth/resend-verification", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email,
                }),
            });
            if (!response.ok) {
                setError(await readError(response));
                return;
            }
            const payload = await response.json() as AuthMessageResponse;
            setMessage(payload.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="auth-shell">
            <div className="auth-grid">
                <Card className="auth-panel">
                    <Card.Body>
                        <h1>{panelTitle}</h1>
                        {mode !== "verify" && mode !== "reset" ? (
                            <div className="auth-form-toggle" role="tablist" aria-label="Authentication mode">
                                <button
                                    type="button"
                                    className={mode === "login" ? "is-active" : ""}
                                    onClick={() => switchMode("login")}
                                >
                                    Log in
                                </button>
                                <button
                                    type="button"
                                    className={mode === "register" ? "is-active" : ""}
                                    onClick={() => switchMode("register")}
                                >
                                    Register
                                </button>
                            </div>
                        ) : null}

                        {error ? <Alert variant="danger">{error}</Alert> : null}
                        {message ? <Alert variant="success">{message}</Alert> : null}

                        {mode === "verify" ? (
                            verifying ? (
                                <div className="py-3 d-flex align-items-center gap-3">
                                    <Spinner animation="border" size="sm" />
                                    <span>Verifying your email...</span>
                                </div>
                            ) : (
                                <div className="d-flex gap-2 flex-wrap">
                                    <Link className="btn btn-primary" to="/account">Go to account</Link>
                                    <Link className="btn btn-outline-light" to="/umalogs">Back to Hakuraku</Link>
                                </div>
                            )
                        ) : mode === "register" ? (
                            <Form onSubmit={submitRegister}>
                                <Form.Group className="mb-3">
                                    <Form.Label>Account name</Form.Label>
                                    <Form.Control
                                        type="text"
                                        value={accountName}
                                        autoComplete="username"
                                        onChange={(event) => setAccountName(event.target.value)}
                                        placeholder="Choose a public account name"
                                        required
                                    />
                                </Form.Group>
                                <Form.Group className="mb-3">
                                    <Form.Label>Email</Form.Label>
                                    <Form.Control
                                        type="email"
                                        value={email}
                                        autoComplete="email"
                                        onChange={(event) => setEmail(event.target.value)}
                                        required
                                    />
                                </Form.Group>
                                <Form.Group className="mb-3">
                                    <Form.Label>Password</Form.Label>
                                    <Form.Control
                                        type="password"
                                        value={password}
                                        autoComplete="new-password"
                                        onChange={(event) => setPassword(event.target.value)}
                                        required
                                    />
                                </Form.Group>
                                <Form.Group className="mb-4">
                                    <Form.Label>Confirm password</Form.Label>
                                    <Form.Control
                                        type="password"
                                        value={confirmPassword}
                                        autoComplete="new-password"
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        required
                                    />
                                </Form.Group>
                                <div className="d-flex gap-2 flex-wrap">
                                    <Button type="submit" disabled={submitting}>
                                        {submitting ? "Creating..." : "Create account"}
                                    </Button>
                                </div>
                            </Form>
                        ) : mode === "reset" ? (
                            token && !requestResetOnly ? (
                                <Form onSubmit={submitResetPassword}>
                                    <Form.Group className="mb-3">
                                        <Form.Label>New password</Form.Label>
                                        <Form.Control
                                            type="password"
                                            value={password}
                                            autoComplete="new-password"
                                            onChange={(event) => setPassword(event.target.value)}
                                            required
                                        />
                                    </Form.Group>
                                    <Form.Group className="mb-4">
                                        <Form.Label>Confirm new password</Form.Label>
                                        <Form.Control
                                            type="password"
                                            value={confirmPassword}
                                            autoComplete="new-password"
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                            required
                                        />
                                    </Form.Group>
                                    <div className="d-flex gap-2 flex-wrap">
                                        <Button type="submit" disabled={submitting}>
                                            {submitting ? "Resetting..." : "Set new password"}
                                        </Button>
                                        <Button type="button" variant="outline-light" onClick={() => switchMode("login")}>
                                            Back to login
                                        </Button>
                                    </div>
                                </Form>
                            ) : (
                                <Form onSubmit={submitResetRequest}>
                                    <Form.Group className="mb-4">
                                        <Form.Label>Email</Form.Label>
                                        <Form.Control
                                            type="email"
                                            value={email}
                                            autoComplete="email"
                                            onChange={(event) => setEmail(event.target.value)}
                                            required
                                        />
                                    </Form.Group>
                                    <div className="d-flex gap-2 flex-wrap">
                                        <Button type="submit" disabled={submitting}>
                                            {submitting ? "Sending..." : "Send reset link"}
                                        </Button>
                                        <Button type="button" variant="outline-light" onClick={() => switchMode("login")}>
                                            Back to login
                                        </Button>
                                    </div>
                                </Form>
                            )
                        ) : (
                            <Form onSubmit={submitLogin}>
                                <Form.Group className="mb-3">
                                    <Form.Label>Account name or email</Form.Label>
                                    <Form.Control
                                        type="text"
                                        value={email}
                                        autoComplete="username"
                                        onChange={(event) => setEmail(event.target.value)}
                                        placeholder="yourname or you@example.com"
                                        required
                                    />
                                </Form.Group>
                                <Form.Group className="mb-4">
                                    <Form.Label>Password</Form.Label>
                                    <Form.Control
                                        type="password"
                                        value={password}
                                        autoComplete="current-password"
                                        onChange={(event) => setPassword(event.target.value)}
                                        required
                                    />
                                </Form.Group>
                                <div className="d-flex gap-2 flex-wrap">
                                    <Button type="submit" disabled={submitting}>
                                        {submitting ? "Signing in..." : "Log in"}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline-light"
                                        disabled={submitting}
                                        onClick={() => setResetMode()}
                                    >
                                        Forgot password
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline-light"
                                        disabled={submitting || !email}
                                        onClick={() => void resendVerification()}
                                    >
                                        Resend verification
                                    </Button>
                                </div>
                            </Form>
                        )}
                    </Card.Body>
                </Card>

                <Card className="auth-panel">
                    <Card.Body>
                        <h2>{user ? "Your account" : "What this gives you"}</h2>
                        {user ? (
                            <>
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Account name</div>
                                    <div className="auth-summary-value">{user.accountName}</div>
                                </div>
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Email</div>
                                    <div className="auth-summary-value">{user.email}</div>
                                </div>
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Verified</div>
                                    <div className="auth-summary-value">{user.emailVerified ? "Yes" : "No"}</div>
                                </div>
                                <div className="auth-summary-row">
                                    <div className="auth-summary-label">Created</div>
                                    <div className="auth-summary-value">{new Date(user.createdAt).toLocaleString()}</div>
                                </div>
                            </>
                        ) : (
                            <ul className="auth-help-list">
                                <li>View your personal race history from races in the database</li>
                                <li>Run multi-race analysis on your race history</li>
                                <li>More to come</li>
                            </ul>
                        )}
                    </Card.Body>
                </Card>
            </div>
        </div>
    );
}
