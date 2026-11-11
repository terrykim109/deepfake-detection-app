// CreateAccount.tsx

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";
import { Alert, Button, TextField } from "../components/ui";
import {
  PASSWORD_REQUIREMENTS_MESSAGE,
  USERNAME_RULE,
  isValidUsername,
  meetsPasswordPolicy,
} from "../state/accountRules";

export const CreateAccount: React.FC = () => {
  const navigate = useNavigate();
  const { signUp, error, clearError, loading } = useAppState();
  const [localError, setLocalError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");
    clearError();

    const form = e.target as HTMLFormElement;
    const username = (
      form.elements.namedItem("username") as HTMLInputElement
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

    if (!isValidUsername(username)) {
      setLocalError(USERNAME_RULE);
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
      await signUp(email, password, username);
      navigate("/verify-email", { state: { email } });
    } catch {
      // error surfaced via useAuth
    }
  };

  const displayError = localError || error;

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <img src="/logo.png" alt="Deepfake Detection" />
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Create Account</h1>

        <form className="auth-form" onSubmit={submit}>
          <TextField
            name="username"
            label="Username"
            hideLabel
            placeholder="Username"
            autoComplete="nickname"
            autoCapitalize="none"
            spellCheck={false}
            disabled={loading}
          />

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
            autoComplete="new-password"
            hint={PASSWORD_REQUIREMENTS_MESSAGE}
            disabled={loading}
          />

          <TextField
            name="confirmPassword"
            type="password"
            label="Confirm Password"
            hideLabel
            placeholder="Confirm Password"
            autoComplete="new-password"
            disabled={loading}
          />

          {displayError && <Alert tone="error">{displayError}</Alert>}

          <Button type="submit" size="lg" fullWidth loading={loading} className="auth-submit">
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <p className="auth-links">
          Already have an account?{" "}
          <Link to="/login" onClick={clearError}>
            Log in
          </Link>
        </p>
      </main>
    </div>
  );
};
