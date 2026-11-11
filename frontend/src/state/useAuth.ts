import { useState, useEffect, useCallback } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile as updateFirebaseProfile,
} from "firebase/auth";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { authApi, setTokenGetter, type UserResponse } from "../api/client";
import { auth, storage } from "../firebase";
import {
  clearLastActivity,
  useInactivityTimeout,
  writeLastActivity,
} from "./useInactivityTimeout";

const TOKEN_KEY = "dfd.token";
const USER_KEY = "dfd.user";
const DEFAULT_TIMEOUT_MINUTES = 30;

export const EMAIL_NOT_VERIFIED_MESSAGE =
  "Please verify your email inbox to continue.";

function loadStored(): { token: string | null; user: UserResponse | null } {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const userRaw = sessionStorage.getItem(USER_KEY);
    const user = userRaw ? JSON.parse(userRaw) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

function saveStored(token: string, user: UserResponse) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  writeLastActivity();
}

function clearStored() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  clearLastActivity();
}

/* Map a Firebase Auth error code to a user-facing message */
function firebaseAuthErrorMessage(err: unknown): string {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Please log in instead.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return "Password must be at least 12 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/missing-email":
      return "Enter your email address to continue.";
    case "storage/unauthorized":
      return "You don't have permission to change this photo. Please log in again.";
    case "storage/quota-exceeded":
      return "Photo storage is full right now. Please try again later.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password. Please try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    default:
      // Any other Storage failure (offline, cancelled, no bucket) gets one
      // plain message instead of Firebase's "Firebase Storage: ... (storage/x)"
      if (code.startsWith("storage/")) {
        return "Couldn't update your photo. Please try again.";
      }
      return err instanceof Error
        ? err.message
        : "Something went wrong. Please try again.";
  }
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface AuthState {
  user: UserResponse | null;
  token: string | null;
  profile: Profile;
  loading: boolean;
  saving: boolean;
  error: string;
  sessionTimeoutMinutes: number;
  /** Profile photo URL from Firebase Auth; null when the user has none. */
  photoURL: string | null;
}

export interface AuthActions {
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (opts?: { reason?: "manual" | "inactivity" }) => Promise<void>;
  updateProfile: (next: Profile) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateAvatar: (image: Blob) => Promise<void>;
  removeAvatar: () => Promise<void>;
  clearError: () => void;
}

function emptyProfile(): Profile {
  return { firstName: "", lastName: "", email: "", phone: "" };
}

function buildProfile(user: UserResponse | null): Profile {
  if (!user) return emptyProfile();
  const names = (user.display_name || "").split(" ");
  return {
    firstName: user.first_name || names[0] || "",
    lastName: user.last_name || names.slice(1).join(" ") || "",
    email: user.email || "",
    phone: user.phone || "",
  };
}

function applyUser(
  user: UserResponse,
  fallback?: Profile | UserResponse | null,
): UserResponse {
  const fb =
    fallback && "firstName" in fallback
      ? fallback
      : fallback
        ? buildProfile(fallback)
        : emptyProfile();
  return {
    ...user,
    email: user.email || fb.email || "",
    first_name: user.first_name || fb.firstName || "",
    last_name: user.last_name || fb.lastName || "",
    phone: user.phone || fb.phone || "",
  };
}

export function useAuth(): AuthState & AuthActions {
  const stored = loadStored();
  const [user, setUser] = useState<UserResponse | null>(stored.user);
  const [token, setToken] = useState<string | null>(stored.token);
  const [profile, setProfile] = useState<Profile>(buildProfile(stored.user));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(
    DEFAULT_TIMEOUT_MINUTES,
  );
  // Keyed by uid: Firebase Auth keeps its own session, which can outlive
  // our sessionStorage one, so only trust a photo that belongs to `user`.
  const [photo, setPhoto] = useState<{ uid: string; url: string | null } | null>(
    null,
  );

  useEffect(
    () =>
      onAuthStateChanged(auth, (fbUser) => {
        setPhoto(fbUser ? { uid: fbUser.uid, url: fbUser.photoURL } : null);
      }),
    [],
  );

  useEffect(() => {
    setTokenGetter(() => {
      try {
        return sessionStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi.sessionConfig().then((res) => {
      if (cancelled || !res.data?.timeout_minutes) return;
      setSessionTimeoutMinutes(res.data.timeout_minutes);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedUser = stored.user;
    const storedToken = stored.token;
    if (!storedUser?.user_id || !storedToken) return;

    // Ensure the Firebase ID token is attached before restoring the session.
    setTokenGetter(() => {
      try {
        return sessionStorage.getItem(TOKEN_KEY);
      } catch {
        return null;
      }
    });

    let cancelled = false;
    authApi.me(storedToken).then((res) => {
      if (cancelled || !res.data) return;
      const nextUser = applyUser(res.data, storedUser);
      saveStored(storedToken, nextUser);
      setToken(storedToken);
      setUser(nextUser);
      setProfile(buildProfile(nextUser));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearError = useCallback(() => setError(""), []);

  // Sync Firebase user to BE after email verification + login.
  const syncFirebaseUser = useCallback(
    async (
      uid: string,
      email: string,
      displayName: string | null,
      createdAt: string,
      idToken: string,
    ): Promise<UserResponse> => {
      const localUser = applyUser({
        id: uid,
        user_id: uid,
        email,
        display_name: displayName,
        auth_provider: "firebase",
        created_at: createdAt,
      });

      // UID is derived from the verified bearer token on the backend.
      const synced = await authApi.syncUser(
        {
          email,
          display_name: displayName,
          auth_provider: "firebase",
        },
        idToken,
      );

      if (synced.error) {
        throw new Error(synced.error);
      }

      return applyUser(synced.data || localUser, localUser);
    },
    [],
  );

  const persistFirebaseUser = useCallback(
    async (
      uid: string,
      email: string,
      displayName: string | null,
      idToken: string,
      createdAt: string,
    ) => {
      // Attach the Firebase ID token before any authenticated backend call.
      sessionStorage.setItem(TOKEN_KEY, idToken);
      setTokenGetter(() => idToken);
      setToken(idToken);

      const nextUser = await syncFirebaseUser(
        uid,
        email,
        displayName,
        createdAt,
        idToken,
      );
      saveStored(idToken, nextUser);
      setUser(nextUser);
      setProfile(buildProfile(nextUser));
    },
    [syncFirebaseUser],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setLoading(true);
      setError("");
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        if (displayName) {
          await updateFirebaseProfile(credential.user, { displayName });
        }
        try {
          await sendEmailVerification(credential.user);
        } catch {
          // Account creation already succeeded; a failed verification email isn't fatal here.
        }
        // Do not call /users/sync here: the backend rejects unverified tokens
        // (and identity sync runs on verified login via persistFirebaseUser).
        setLoading(false);
      } catch (err) {
        const message = firebaseAuthErrorMessage(err);
        setError(message);
        setLoading(false);
        throw new Error(message);
      }
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError("");
      try {
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        if (!credential.user.emailVerified) {
          throw new Error(EMAIL_NOT_VERIFIED_MESSAGE);
        }
        // Force refresh so email_verified and other claims are current.
        const idToken = await credential.user.getIdToken(true);
        const createdAt = credential.user.metadata.creationTime
          ? new Date(credential.user.metadata.creationTime).toISOString()
          : "";
        await persistFirebaseUser(
          credential.user.uid,
          credential.user.email || email,
          credential.user.displayName,
          idToken,
          createdAt,
        );
        setLoading(false);
      } catch (err) {
        const message = firebaseAuthErrorMessage(err);
        setError(message);
        setLoading(false);
        throw new Error(message);
      }
    },
    [persistFirebaseUser],
  );

  const signOut = useCallback(
    async (opts?: { reason?: "manual" | "inactivity" }) => {
      setLoading(true);
      try {
        if (user?.user_id) await authApi.logout(user.user_id);
      } finally {
        clearStored();
        if (opts?.reason === "inactivity") {
          try {
            sessionStorage.setItem("dfd.sessionExpired", "inactivity");
          } catch {
            /* ignore */
          }
        }
        setToken(null);
        setUser(null);
        setProfile(emptyProfile());
        setLoading(false);
      }
    },
    [user],
  );

  const updateProfile = useCallback(
    async (next: Profile) => {
      if (!user?.user_id) {
        const msg = "You must be logged in to update your profile.";
        setError(msg);
        throw new Error(msg);
      }
      setSaving(true);
      setError("");

      const res = await authApi.updateProfile(
        user.user_id,
        {
          first_name: next.firstName,
          last_name: next.lastName,
          email: next.email,
          phone: next.phone,
        },
        token,
      );

      if (res.error) {
        setError(res.error);
        setSaving(false);
        throw new Error(res.error);
      }

      const updatedUser = applyUser(
        res.data || {
          ...user,
          display_name: `${next.firstName} ${next.lastName}`.trim(),
          email: next.email,
          first_name: next.firstName,
          last_name: next.lastName,
          phone: next.phone,
        },
        next,
      );
      saveStored(token || "", updatedUser);
      setUser(updatedUser);
      setProfile(buildProfile(updatedUser));
      setSaving(false);
    },
    [user, token],
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      const msg = "No pending account to verify. Please log in again.";
      setError(msg);
      throw new Error(msg);
    }
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      const message = firebaseAuthErrorMessage(err);
      setError(message);
      throw new Error(message);
    }
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      // Same outcome as a real account so the page can't be used to probe
      // which emails are registered.
      if (code === "auth/user-not-found") return;
      throw new Error(firebaseAuthErrorMessage(err));
    }
  }, []);

  const signedInFirebaseUser = useCallback(() => {
    const fbUser = auth.currentUser;
    if (!fbUser || fbUser.uid !== user?.user_id) {
      throw new Error("Please log in again to change your photo.");
    }
    return fbUser;
  }, [user]);

  const updateAvatar = useCallback(
    async (image: Blob) => {
      const fbUser = signedInFirebaseUser();
      try {
        const avatarRef = ref(storage, `avatars/${fbUser.uid}`);
        await uploadBytes(avatarRef, image, { contentType: image.type });
        const url = await getDownloadURL(avatarRef);
        await updateFirebaseProfile(fbUser, { photoURL: url });
        setPhoto({ uid: fbUser.uid, url });
      } catch (err) {
        throw new Error(firebaseAuthErrorMessage(err));
      }
    },
    [signedInFirebaseUser],
  );

  const removeAvatar = useCallback(async () => {
    const fbUser = signedInFirebaseUser();
    // Unlink first: if the delete below fails we leave an unseen orphan file,
    // not a profile pointing at a missing image.
    try {
      await updateFirebaseProfile(fbUser, { photoURL: null });
      setPhoto({ uid: fbUser.uid, url: null });
    } catch (err) {
      throw new Error(firebaseAuthErrorMessage(err));
    }
    try {
      await deleteObject(ref(storage, `avatars/${fbUser.uid}`));
    } catch {
      // Nothing links to the file any more, and the next upload overwrites it
    }
  }, [signedInFirebaseUser]);

  // Inactivity auto-logout
  useInactivityTimeout(
    Boolean(user && token),
    () => {
      void signOut({ reason: "inactivity" });
    },
    sessionTimeoutMinutes * 60 * 1000,
  );

  return {
    user,
    token,
    profile,
    loading,
    saving,
    error,
    sessionTimeoutMinutes,
    photoURL: photo && photo.uid === user?.user_id ? photo.url : null,
    signUp,
    signIn,
    signOut,
    updateProfile,
    resendVerificationEmail,
    sendPasswordReset,
    updateAvatar,
    removeAvatar,
    clearError,
  };
}