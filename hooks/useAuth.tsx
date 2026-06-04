"use client";
import { useState, useEffect, createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setAppUser({
              uid: firebaseUser.uid,
              email: data.email || firebaseUser.email || "",
              displayName: data.displayName || firebaseUser.displayName || "",
              role: data.role || "employee",
              storeId: data.storeId || "",
              isActive: data.isActive !== false,
              createdAt: data.createdAt?.toDate() || new Date(),
            });
          } else {
            const storeId = firebaseUser.uid;
            const newUser = {
              email: firebaseUser.email || "",
              displayName:
                firebaseUser.displayName ||
                firebaseUser.email?.split("@")[0] ||
                "مستخدم",
              role: "admin" as const,
              storeId,
              isActive: true,
              createdAt: new Date(),
            };
            await setDoc(doc(db, "users", firebaseUser.uid), {
              ...newUser,
              createdAt: serverTimestamp(),
            });
            await setDoc(
              doc(db, "stores", storeId),
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
            setAppUser({ uid: firebaseUser.uid, ...newUser });
          }
        } catch {
          setAppUser(null);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });
    return unsub;
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
