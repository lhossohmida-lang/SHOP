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
import type { AppUser } from "@/types/user";

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

  await setDoc(doc(db, "users", firebaseUser.uid), {
    email: fallback.email,
    displayName: fallback.displayName,
    role: fallback.role,
    storeId: fallback.storeId,
    isActive: fallback.isActive,
    createdAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, "stores", fallback.storeId),
    {
      name: "Blgasm POS Store",
      address: "",
      phone: "",
      currency: "DZD",
      taxRate: 0,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let autoLoginStarted = false;
    const timeout = setTimeout(() => {
      if (active) setLoading(false);
    }, 10000);

    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      clearTimeout(timeout);
      if (!active) return;

      setUser(firebaseUser);

      if (!firebaseUser) {
        const hasAutoLoginCredentials =
          !!process.env.NEXT_PUBLIC_AUTO_LOGIN_EMAIL?.trim() &&
          !!process.env.NEXT_PUBLIC_AUTO_LOGIN_PASSWORD?.trim();

        if (hasAutoLoginCredentials && !autoLoginStarted) {
          autoLoginStarted = true;
          signInAutomatically().catch((err) => {
            console.warn("Automatic sign-in failed:", err);
            if (active) {
              setAppUser(null);
              setLoading(false);
            }
          });
          return;
        }

        setAppUser(null);
        setLoading(false);
        return;
      }

      if (firebaseUser.isAnonymous && !firebaseUser.email) {
        signOut(auth).catch((err) => {
          console.warn("Failed to clear anonymous Firebase session:", err);
        });
        setUser(null);
        setAppUser(null);
        setLoading(false);
        return;
      }

      setAppUser(createFallbackAppUser(firebaseUser));
      setLoading(false);

      loadAppUser(firebaseUser)
        .then((loadedUser) => {
          if (active && auth.currentUser?.uid === firebaseUser.uid) {
            setAppUser(loadedUser);
          }
        })
        .catch((err) => {
          console.warn("Failed to load Firestore user profile:", err);
        });
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
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, appUser, loading, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}
