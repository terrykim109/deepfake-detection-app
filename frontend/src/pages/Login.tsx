// Login.tsx

import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";
import { EMAIL_NOT_VERIFIED_MESSAGE } from "../state/useAuth";
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
  } = useAppState();
  const [localError, setLocalError] = useState("");
  const [sessionNote, setSessionNote] = useState(
    (location.state as { notice?: string } | null)?.notice || "",
  );

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
    } catch (err) {
      // Unverified accounts go to the verification page; other errors surface via useAuth
      if (err instanceof Error && err.message === EMAIL_NOT_VERIFIED_MESSAGE) {
        clearError();
        navigate("/verify-email", { state: { email } });
      }
    }
  };

  const displayError = localError || error;

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

          <Link
            to="/forgot-password"
            className="auth-forgot"
            onClick={(e) => {
              clearError();
              // Carry over whatever was typed so the reset form starts filled in
              const form = e.currentTarget.closest("form");
              const typed = (form?.elements.namedItem("email") as HTMLInputElement | null)?.value.trim();
              if (typed) {
                e.preventDefault();
                navigate("/forgot-password", { state: { email: typed } });
              }
            }}
          >
            Forgot password?
          </Link>

          {displayError && <Alert tone="error">{displayError}</Alert>}

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
