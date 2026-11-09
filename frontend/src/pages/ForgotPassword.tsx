// ForgotPassword.tsx

import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAppState } from "../state/AppState";
import { Alert, ArrowLeftIcon, Button, MailIcon, TextField } from "../components/ui";

/* Reached from "Forgot password?" on Log in. Firebase sends the reset
   email; the sent screen reads the same whether or not the account exists. */
export const ForgotPassword: React.FC = () => {
  const location = useLocation();
  const { sendPasswordReset } = useAppState();
  const [email, setEmail] = useState(
    (location.state as { email?: string } | null)?.email || "",
  );
  const [sentTo, setSentTo] = useState("");
  const [sending, setSending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState("");

  const send = async (target: string) => {
    setError("");
    if (!target) {
      setError("Enter your email address to continue.");
      return;
    }
    setSending(true);
    try {
      await sendPasswordReset(target);
      setResent(target === sentTo);
      setSentTo(target);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setSending(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(email.trim());
  };

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <img src="/logo.png" alt="Deepfake Detection" />
      </aside>

      <main className="auth-main">
        {sentTo ? (
          <div className="auth-sent">
            <span className="auth-sent__icon" aria-hidden="true">
              <MailIcon />
            </span>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-lead">
              If an account exists for <strong>{sentTo}</strong>, we&rsquo;ve sent a link to reset
              your password. The link works for 1 hour.
            </p>
            {error && <Alert tone="error">{error}</Alert>}
            <Link to="/login" className="ui-btn ui-btn--primary ui-btn--lg ui-btn--block auth-submit">
              Back to log in
            </Link>
            <p className="auth-resend" aria-live="polite">
              {resent ? (
                "Sent again. It can take a few minutes to arrive."
              ) : (
                <>
                  Didn&rsquo;t get it? Check spam, or{" "}
                  <Button variant="link" onClick={() => void send(sentTo)} disabled={sending}>
                    send it again
                  </Button>
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            <Link to="/login" className="auth-back">
              <ArrowLeftIcon aria-hidden="true" />
              Back to log in
            </Link>
            <h1 className="auth-title">Reset your password</h1>
            <p className="auth-lead">
              Enter the email you signed up with. We&rsquo;ll send you a link to set a new password.
            </p>

            <form className="auth-form" onSubmit={submit} noValidate>
              <TextField
                variant="filled"
                id="reset-email"
                name="email"
                type="email"
                label="Email address"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
                disabled={sending}
              />

              {error && <Alert tone="error">{error}</Alert>}

              <Button type="submit" size="lg" fullWidth loading={sending} className="auth-submit">
                {sending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}
      </main>
    </div>
  );
};
