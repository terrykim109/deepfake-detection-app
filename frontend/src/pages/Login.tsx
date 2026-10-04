// Login.tsx

import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";
import { consumeSessionExpired } from "../state/useInactivityTimeout";
import { Alert, Button, TextField } from "../components/ui";

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    signIn,
    error,
    clearError,
    loading,
    resendVerificationEmail,
  } = useAppState();
  const [localError, setLocalError] = useState("");
  const [sessionNote, setSessionNote] = useState(
    (location.state as { notice?: string } | null)?.notice || "",
  );
  const [resendStatus, setResendStatus] = useState("");
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const reason = consumeSessionExpired();
    if (reason === "inactivity") {
      setSessionNote(
        `You have been logged out due to inactivity. Please sign in again to continue.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    setSessionNote("");
    setResendStatus("");
    clearError();

    const form = e.target as HTMLFormElement;
    const email = (
      form.elements.namedItem("email") as HTMLInputElement
    ).value.trim();
    const password = (
      form.elements.namedItem("password") as HTMLInputElement
    ).value.trim();

    if (!email || !password) {
      setLocalError("Enter an email address and password to continue.");
      return;
    }

    try {
      await signIn(email, password);
      navigate("/upload");
    } catch {
      // error surfaced via useAuth
    }
  };

  const displayError = localError || error;
  const needsVerification = displayError.includes("verify your email");

  const handleResend = async () => {
    setResendStatus("");
    setResending(true);
    try {
      await resendVerificationEmail();
      setResendStatus("Verification email re-sent. Please check your inbox.");
    } catch {
      // Error handled in resendVerificationEmail
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <img src="/logo.png" alt="Deepfake Detection" />
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Log in</h1>

        {sessionNote && <Alert tone="info" className="auth-alert">{sessionNote}</Alert>}

        <form className="auth-form" onSubmit={submit}>
          <TextField
            name="email"
            type="email"
            label="Email Address"
            hideLabel
            placeholder="Email Address"
            autoComplete="email"
            disabled={loading}
          />

          <TextField
            name="password"
            type="password"
            label="Password"
            hideLabel
            placeholder="Password"
            autoComplete="current-password"
            disabled={loading}
          />

          {displayError && <Alert tone="error">{displayError}</Alert>}

          {needsVerification && (
            <Button variant="ghost" onClick={handleResend} loading={resending}>
              {resending ? "Sending..." : "Resend verification email"}
            </Button>
          )}

          {resendStatus && <Alert tone="success">{resendStatus}</Alert>}

          <Button type="submit" size="lg" fullWidth loading={loading} className="auth-submit">
            {loading ? "Logging in..." : "Log in"}
          </Button>
        </form>

        <p className="auth-links">
          Don't have an account?{" "}
          <Link to="/create-account" onClick={clearError}>
            Create an account
          </Link>
        </p>
      </main>
    </div>
  );
};
