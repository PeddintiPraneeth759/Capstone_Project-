import axios from 'axios';
import { auth } from './firebaseClient';

const api = axios.create({
  baseURL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000',
});

// Keep the latest Firebase token available even if auth.currentUser is
// briefly null while Firebase restores the session.
let cachedAuthToken = null;
export const setAuthToken = (token) => { cachedAuthToken = token || null; };

// Automatically attach Firebase token to every request
api.interceptors.request.use(async (config) => {
  try {
    // Wait for Firebase to restore the signed-in session before deciding
    // whether this request has a token. Without this, the first requests
    // after a refresh can be sent unauthenticated and fall back to the
    // shared local mock user.
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    const user = auth.currentUser;
    const token = user ? await user.getIdToken() : cachedAuthToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error('Error getting auth token:', error);
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use((response) => response, (error) => {
  if (error.response?.status === 401
    && String(error.response?.data?.message || '').includes('Invalid or expired sign-in')) {
    window.dispatchEvent(new CustomEvent('wayfare:auth-expired'));
  }
  return Promise.reject(error);
});

export default api;
