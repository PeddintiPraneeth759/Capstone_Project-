const firebaseAdmin = require('../config/firebase');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  try {
    if (!firebaseAdmin.isInitialized()) {
      return res.status(503).json({ message: 'Authentication is not configured on this server.' });
    }
    const decoded = await firebaseAdmin.verifyIdToken(authHeader.slice(7));
    if (!decoded?.uid) {
      return res.status(401).json({ message: 'Unauthorized: Token has no user id.' });
    }
    req.user = decoded;
    return next();
  } catch (error) {
    console.error('Error verifying token:', error.message);
    if (error.code === 'app/invalid-credential' || error.code === 'auth/invalid-credential') {
      return res.status(503).json({ message: 'Firebase Admin credentials are invalid.' });
    }
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired sign-in. Please sign in again.' });
  }
};

module.exports = { verifyToken };
