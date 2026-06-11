"use client";
import { useState, useEffect, createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { STORE_NAME } from "@/lib/constants/branding";
import type { AppUser } from "@/types/user";

// ─── Local Cache for offline access ───────────────────────────────────────────
const CACHE_KEY = "blgasm_app_user_v2";

function saveUserToCache(user: AppUser) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(user)); } catch {}
}

function loadUserFromCache(): AppUser | null {
  try {
    const s = localStorage.getItem(CACHE_KEY);
    if (!s) return null;
    const obj = JSON.parse(s);
    if (obj.createdAt) obj.createdAt = new Date(obj.createdAt);
    return obj as AppUser;
  } catch { return null; }
}

function clearUserCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}
// ──────────────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  appUser: null,
  loading: true,
  signIn: async () => {},
  logOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

async function signInAutomatically() {
  const email = process.env.NEXT_PUBLIC_AUTO_LOGIN_EMAIL?.trim();
  const password = process.env.NEXT_PUBLIC_AUTO_LOGIN_PASSWORD?.trim();
  if (email && password) {
    await signInWithEmailAndPassword(auth, email, password);
  }
}

function getDisplayName(firebaseUser: User) {
  return (
    firebaseUser.displayName ||
    firebaseUser.email?.split("@")[0] ||
    "مستخدم"
  );
}

function createFallbackAppUser(firebaseUser: User): AppUser {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email || "",
    displayName: getDisplayName(firebaseUser),
    role: "admin",
    storeId: firebaseUser.uid,
    isActive: true,
    createdAt: new Date(),
  };
}

async function loadAppUser(firebaseUser: User): Promise<AppUser> {
  const fallback = createFallbackAppUser(firebaseUser);
  try {
    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        ...fallback,
        email: data.email || firebaseUser.email || "",
        displayName: data.displayName || getDisplayName(firebaseUser),
        role: data.role || "employee",
        storeId: data.storeId || fallback.storeId,
        isActive: data.isActive !== false,
        createdAt: data.createdAt?.toDate() || fallback.createdAt,
      };
    }
    // New user — create Firestore docs in background
    setDoc(doc(db, "users", firebaseUser.uid), {
      email: fallback.email,
      displayName: fallback.displayName,
      role: fallback.role,
      storeId: fallback.storeId,
      isActive: fallback.isActive,
      createdAt: serverTimestamp(),
    }).catch(() => {});
    setDoc(
      doc(db, "stores", fallback.storeId),
      {
        name: `${STORE_NAME} Store`,
        address: "",
        phone: "",
        currency: "DZD",
        taxRate: 0,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    ).catch(() => {});
  } catch {
    // Offline: getDoc throws — fallback is fine
  }
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let autoLoginAttempted = false;

    // Safety timeout: 4 seconds max. After that, use cache or show login.
    const timeout = setTimeout(() => {
      if (!active) return;
      const cached = loadUserFromCache();
      if (cached) {
        setAppUser(cached);
      }
      setLoading(false);
    }, 4000);

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timeout);
      if (!active) return;

      setUser(firebaseUser);

      if (!firebaseUser) {
        // No Firebase session — try auto-login
        const hasAutoCredentials =
          !!process.env.NEXT_PUBLIC_AUTO_LOGIN_EMAIL?.trim() &&
          !!process.env.NEXT_PUBLIC_AUTO_LOGIN_PASSWORD?.trim();

        if (hasAutoCredentials && !autoLoginAttempted) {
          autoLoginAttempted = true;
          signInAutomatically().catch(() => {
            if (!active) return;
            // Auto-login failed (offline) — use cached user
            const cached = loadUserFromCache();
            if (cached) {
              setAppUser(cached);
            } else {
              setAppUser(null);
            }
            setLoading(false);
          });
          return; // Wait for next onAuthStateChanged
        }

        // No auto-credentials — check cache before showing login
        const cached = loadUserFromCache();
        if (cached) {
          setAppUser(cached);
          setLoading(false);
          return;
        }

        setAppUser(null);
        setLoading(false);
        return;
      }

      // Skip anonymous users
      if (firebaseUser.isAnonymous && !firebaseUser.email) {
        signOut(auth).catch(() => {});
        setUser(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      // Set fallback immediately so UI is NOT blocked
      const fallback = createFallbackAppUser(firebaseUser);
      setAppUser(fallback);
      saveUserToCache(fallback);
      setLoading(false);

      // Load full profile in background
      loadAppUser(firebaseUser).then((loaded) => {
        if (active && auth.currentUser?.uid === firebaseUser.uid) {
          setAppUser(loaded);
          saveUserToCache(loaded);
        }
      }).catch(() => {});
    });

    return () => {
      active = false;
      clearTimeout(timeout);
      unsub();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logOut = async () => {
    clearUserCache(); // Remove offline cache on logout
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, appUser, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}
