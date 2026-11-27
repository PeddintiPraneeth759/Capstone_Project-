const mongoose = require('mongoose');
const dns = require('dns');
const dnsPromises = dns.promises;

// ─── Force Google Public DNS ──────────────────────────────────────────────────
// Many ISP/network DNS servers cannot resolve MongoDB Atlas _mongodb._tcp SRV
// records. By pointing Node's resolver at Google DNS we bypass that completely.
try {
  dns.setDefaultResultOrder('ipv4first');
  const { Resolver } = dns;
  const resolver = new Resolver();
  resolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  // Monkey-patch the promises API so the SRV/TXT fallback also uses Google DNS
  dnsPromises.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (_e) {
  // Older Node versions may not support setServers on promises – ignore
}

let connectionPromise = null;
let retryTimer = null;
let retryDelayMs = 5000;
const MAX_RETRY_DELAY_MS = 60000;

// Some networks resolve the SRV record for mongodb+srv:// but time out on the
// TXT lookup the driver needs. When that happens we resolve the shard hosts
// ourselves and connect with a standard mongodb:// URI instead.
let fallbackUri = null;
let fallbackAttempted = false;

function isSrvDnsError(error) {
  const message = String(error?.message || '');
  return /queryTxt|querySrv|ETIMEOUT|ENOTFOUND|ESERVFAIL|EREFUSED|EAI_AGAIN/i.test(message);
}

async function buildDirectUriFromSrv(uri) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb+srv:') return null;

  const records = await dnsPromises.resolveSrv(`_mongodb._tcp.${parsed.hostname}`);
  if (!records.length) return null;

  const hosts = records
    .map((record) => `${record.name.replace(/\.$/, '')}:${record.port || 27017}`)
    .join(',');

  const params = new URLSearchParams(parsed.search);
  if (!params.has('tls') && !params.has('ssl')) params.set('tls', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');

  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
    : '';

  return `mongodb://${auth}${hosts}${parsed.pathname || '/'}?${params.toString()}`;
}

function scheduleRetry(delayMs) {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connectDB();
  }, delayMs);
  retryTimer.unref?.();
}

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MongoDB URI is missing. Set MONGODB_URI in backend/.env.');
    return null;
  }
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  const uri = fallbackUri || process.env.MONGODB_URI;

  connectionPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
  }).then((conn) => {
    retryDelayMs = 5000;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn.connection;
  }).catch(async (error) => {
    if (
      !fallbackUri &&
      !fallbackAttempted &&
      isSrvDnsError(error) &&
      String(process.env.MONGODB_URI).startsWith('mongodb+srv://')
    ) {
      fallbackAttempted = true;
      try {
        const directUri = await buildDirectUriFromSrv(process.env.MONGODB_URI);
        if (directUri) {
          fallbackUri = directUri;
          console.warn('MongoDB SRV/TXT lookup failed; retrying with resolved shard hosts.');
          scheduleRetry(0);
          return null;
        }
      } catch (resolveError) {
        console.error(`Could not resolve MongoDB SRV hosts: ${resolveError.message}`);
      }
    }

    console.error(`MongoDB connection failed: ${error.message}`);
    console.error('Check DNS/network access, the Atlas IP allowlist, and database credentials. Retrying automatically.');
    scheduleRetry(retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
    return null;
  }).finally(() => {
    connectionPromise = null;
  });

  return connectionPromise;
};

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = connectDB;
module.exports.isDatabaseConnected = isDatabaseConnected;
