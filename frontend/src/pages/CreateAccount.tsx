// CreateAccount.tsx

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";

const MIN_PASSWORD_LENGTH = 12;
const PASSWORD_REQUIREMENTS_MESSAGE =
  `Password must be at least ${MIN_PASSWORD_LENGTH} characters and include an uppercase letter, ` +
  "a lowercase letter, a number, and a special character.";

function meetsPasswordPolicy(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export const CreateAccount: React.FC = () => {
  const navigate = useNavigate();
  const { signUp, error, clearError, loading } = useAppState();
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    const form = e.target as HTMLFormElement;
    const name = (
      form.elements.namedItem("name") as HTMLInputElement
    ).value.trim();
    const email = (
      form.elements.namedItem("email") as HTMLInputElement
    ).value.trim();
    const password = (
      form.elements.namedItem("password") as HTMLInputElement
    ).value.trim();
    const confirmPassword = (
      form.elements.namedItem("confirmPassword") as HTMLInputElement
    ).value.trim();

    if (!name) {
      setLocalError("Please enter your name.");
      return;
    }

    if (!email) {
      setLocalError("Please enter your email address.");
      return;
    }

    if (!password || !confirmPassword) {
      setLocalError("Please confirm password.");
      return;
    }
    if (!meetsPasswordPolicy(password)) {
      setLocalError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match.");
      return;
    }

    try {
      await signUp(email, password, name);
      navigate("/login", {
        state: {
          notice:
            "Account created! Check your email to verify your address before logging in.",
        },
      });
    } catch {
      // error surfaced via useAuth
    }
  };

  const displayError = localError || error;

  return (
    <div className="stage auth-page">
      <aside className="auth-aside">
        <img src="./logo.png" alt="Deepfake Detection" />
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Create Account</h1>

        <form onSubmit={submit}>
          <div className="field">
            <input
              name="name"
              type="text"
              placeholder="Full Name"
              autoComplete="name"
              disabled={loading}
            />
          </div>

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
              autoComplete="new-password"
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
            <p className="field-hint">{PASSWORD_REQUIREMENTS_MESSAGE}</p>
          </div>

          <div className="field">
            <input
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Confirm Password"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          {displayError && <p className="auth-error">{displayError}</p>}

          <button type="submit" className="btn auth-submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="auth-links">
          <p>
            Already have an account?{" "}
            <Link to="/login" onClick={clearError}>
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};
