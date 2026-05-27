import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/firebase.client';
import { toast } from '~/components/ui/use-toast';
import Cookies from 'js-cookie';
import { SettingsRepository } from '~/lib/firebase/repositories/settingsRepository';
import { githubConnectionStore } from '~/lib/stores/githubConnection';
import { gitlabConnectionStore } from '~/lib/stores/gitlabConnection';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-Provisioning Engine
  const syncUserToFirestore = async (firebaseUser: User) => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const batch = writeBatch(db);

        // Default payload for user root doc
        batch.set(userRef, {
          metadata: {
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            createdAt: serverTimestamp(),
          },
          status: 'active',
          tier: 'free',
          credits: 1, // Award 1 free credit to new users
        });

        // Initialize default settings document
        const settingsRef = doc(db, 'users', firebaseUser.uid, 'settings', 'preferences');
        batch.set(settingsRef, {
          theme: 'dark',
          aiModelFallback: 'gemini-1.5-flash',
          autoScroll: true,
        });

        await batch.commit();

        import('~/lib/stores/profile').then(({ updateProfile }) => {
          updateProfile({ credits: 1 });
        });
      } else {
        const userData = userSnap.data();
        import('~/lib/stores/profile').then(({ updateProfile }) => {
          updateProfile({ credits: userData?.credits || 0 });
        });
      }
    } catch (error: any) {
      console.error('Error syncing user to Firestore:', error);
      toast.error(error.message || 'Failed to initialize user data.');
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        import('~/lib/stores/profile').then(({ updateProfile }) => {
          updateProfile({
            username: currentUser.displayName || currentUser.email?.split('@')[0] || 'Guest User',
            avatar: currentUser.photoURL || '',
          });
        });
        await syncUserToFirestore(currentUser);

        // Ensure local cookies are wiped so API keys are never stored on the client
        Cookies.remove('apiKeys');

        // Set ID token and UID for server-side credit validation
        try {
          const idToken = await currentUser.getIdToken();
          Cookies.set('firebaseIdToken', idToken);
          Cookies.set('firebaseUid', currentUser.uid);
        } catch (err) {
          console.error('Failed to get ID token:', err);
        }
      } else {
        import('~/lib/stores/profile').then(({ updateProfile }) => {
          updateProfile({ username: '', avatar: '' });
        });
        Cookies.remove('firebaseIdToken');
        Cookies.remove('firebaseUid');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      toast.error(`Google Sign-In Error: ${error.message}`);
      throw error;
    }
  };

  const signInWithGithub = async () => {
    try {
      const provider = new GithubAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      toast.error(`GitHub Sign-In Error: ${error.message}`);
      throw error;
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      toast.error(`Login Error: ${error.message}`);
      throw error;
    }
  };

  const registerWithEmail = async (email: string, pass: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      toast.error(`Registration Error: ${error.message}`);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      
      // Wipe Protocol: Securely destroy client-side session data
      Cookies.remove('apiKeys');
      Cookies.remove('providers');
      Cookies.remove('vercelToken');
      
      // Clear GitHub and GitLab connections
      githubConnectionStore.disconnect();
      gitlabConnectionStore.disconnect();
      
      // Remove any local settings that might contain sensitive data
      localStorage.removeItem('settings');
      
      toast.success('Logged out securely. Session data wiped.');
    } catch (error: any) {
      toast.error(`Logout Error: ${error.message}`);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signInWithGithub,
        loginWithEmail,
        registerWithEmail,
        logout,
      }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
