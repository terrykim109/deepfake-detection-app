// VerifyEmail.tsx

import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppState } from "../state/AppState";
import { auth } from "../firebase";
import { Alert, Button, MailIcon } from "../components/ui";

/* Seconds before another verification email can be requested, so users
   don't trip Firebase's auth/too-many-requests limit. */
const RESEND_COOLDOWN_SECONDS = 60;

type Status = { tone: "success" | "error" | "info"; message: string } | null;

export const VerifyEmail: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { resendVerificationEmail, clearError } = useAppState();
  const [email, setEmail] = useState(
    (location.state as { email?: string } | null)?.email || "",
  );
  const [ready, setReady] = useState(Boolean(email));
  const [status, setStatus] = useState<Status>(null);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // On refresh there's no router state — wait for Firebase to restore the pending user.
  useEffect(() => {
    if (email) return;
    let cancelled = false;
    auth.authStateReady().then(() => {
      if (cancelled) return;
      setEmail(auth.currentUser?.email || "");
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [email]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const handleResend = async () => {
    setStatus(null);
    setResending(true);
    try {
      await resendVerificationEmail();
      setStatus({
        tone: "success",
        message: "Verification email sent. Please check your inbox.",
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      clearError();
      setStatus({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't send the email. Please try again.",
      });
    } finally {
      setResending(false);
    }
  };

  const handleCheck = async () => {
    setStatus(null);
    const user = auth.currentUser;
    if (!user) {
      setStatus({
        tone: "error",
        message: "Your session has ended. Please log in again.",
      });
      return;
    }
    setChecking(true);
    try {
      await user.reload();
      if (user.emailVerified) {
        navigate("/login", {
          state: { notice: "Email verified, you can now log in." },
        });
        return;
      }
      setStatus({
        tone: "info",
        message:
          "Your email isn't verified yet. Click the link in the email, then try again.",
      });
    } catch {
      setStatus({
        tone: "error",
        message: "Couldn't check your verification status. Please try again.",
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <img src="/logo.png" alt="Deepfake Detection" />
      </aside>

      <main className="auth-main verify">
        <div className="verify-icon">
          <MailIcon />
        </div>

        <h1 className="verify-title">Please verify your email</h1>

        {!ready ? null : email ? (
          <>
            <p className="verify-text">
              You're almost there! We sent an email to
              <strong className="verify-email">{email}</strong>
            </p>
            <p className="verify-text">
              Just click the link in that email to complete your signup. If you
              don't see it, you may need to <strong>check your spam</strong>{" "}
              folder.
            </p>
            <p className="verify-text">Still can't find the email? No problem.</p>

            <div className="verify-actions">
              <Button
                size="lg"
                fullWidth
                onClick={handleResend}
                loading={resending}
                disabled={cooldown > 0}
              >
                {resending
                  ? "Sending..."
                  : cooldown > 0
                    ? `Resend in ${cooldown}s`
                    : "Resend Verification Email"}
              </Button>
              <Button
                variant="ghost"
                size="lg"
                fullWidth
                onClick={handleCheck}
                loading={checking}
              >
                I've verified my email
              </Button>
            </div>

            {status && (
              <Alert tone={status.tone} className="verify-status">
                {status.message}
              </Alert>
            )}
          </>
        ) : (
          <p className="verify-text">
            We couldn't find an account waiting for verification. Log in again
            and we'll take you back here if your email still needs verifying.
          </p>
        )}

        <p className="auth-links">
          <Link to="/login">Back to log in</Link>
        </p>
      </main>
    </div>
  );
};
