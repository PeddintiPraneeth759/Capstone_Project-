import { io } from 'socket.io-client';
import { auth } from './firebaseClient';

const URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export const socket = io(URL, {
  autoConnect: false,
  auth: (callback) => {
    const user = auth.currentUser;
    if (!user) return callback({});
    user.getIdToken()
      .then((token) => callback({ token }))
      .catch(() => callback({}));
  },
});
