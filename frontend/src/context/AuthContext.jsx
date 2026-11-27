import { createContext, useContext, useState, useEffect } from 'react';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  googleProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from '../services/firebaseClient';
import api, { setAuthToken } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [localLogout, setLocalLogout] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    const start = async () => {
      // Let Firebase restore the persisted session first. Otherwise the
      // initial null auth event can incorrectly start a local mock session
      // even though a real user is signed in.
      if (typeof auth.authStateReady === 'function') {
        await auth.authStateReady();
      }
      if (cancelled) return;

      unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser);
        if (firebaseUser) {
          try {
            setAuthToken(await firebaseUser.getIdToken());
            const res = await api.get('/api/users/profile');
            setUserProfile(res.data);
          } catch (err) {
            console.error('Error fetching user profile:', err);
          }
        } else {
          setAuthToken(null);
          setUserProfile(null);
        }
        setLoading(false);
      });
    };

    start();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [localLogout]);

  const login = async (email, password) => {
    setLocalLogout(false);
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result;
  };

  const register = async (email, password, displayName) => {
    setLocalLogout(false);
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    return result;
  };

  const loginWithGoogle = async () => {
    setLocalLogout(false);
    const result = await signInWithPopup(auth, googleProvider);
    return result;
  };

  const logout = async () => {
    if (user?.isLocalDevelopment) setLocalLogout(true);
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
  };

  const refreshProfile = async () => {
    try {
      const res = await api.get('/api/users/profile');
      setUserProfile(res.data);
    } catch (err) {
      console.error('Error refreshing profile:', err);
    }
  };

  const value = {
    user,
    userProfile,
    loading,
    login,
    register,
    loginWithGoogle,
    logout,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
