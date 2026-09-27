// Login.tsx

import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";
import { consumeSessionExpired } from "../state/useInactivityTimeout";

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    signIn,
    error,
    clearError,
    loading,
    sessionTimeoutMinutes,
    resendVerificationEmail,
  } = useAppState();
  const [showPassword, setShowPassword] = useState(false);
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
      navigate("/profile");
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
    <div className="stage auth-page">
      <aside className="auth-aside">
        <img src="./logo.png" alt="Deepfake Detection" />
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Log in</h1>

        {sessionNote && <p className="auth-error">{sessionNote}</p>}

        <form onSubmit={submit}>
          <div className="field">
            <input
              name="email"
              type="email"
              placeholder="Email Address"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="field">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              autoComplete="current-password"
              disabled={loading}
            />
            <button
              type="button"
              className="field-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <img src="/assets/icon-visibility.svg" alt="" />
            </button>
          </div>

          {displayError && <p className="auth-error">{displayError}</p>}

          {needsVerification && (
            <button
              type="button"
              className="btn-ghost auth-resend"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? "Sending..." : "Resend verification email"}
            </button>
          )}

          {resendStatus && <p className="auth-error">{resendStatus}</p>}

          <button type="submit" className="btn auth-submit" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="auth-links">
          <p>
            Don't have an account?{" "}
            <Link to="/create-account" onClick={clearError}>
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};
