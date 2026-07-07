/**
 * Helper de conexión para redes donde la consulta DNS TXT hacia *.mongodb.net
 * es rechazada (REFUSED) por el resolver/firewall local, pero SRV sí funciona.
 * Resuelve los hosts del shard vía SRV y arma una URI mongodb:// directa,
 * evitando así la consulta TXT que normalmente requiere mongodb+srv://.
 *
 * Uso: const { connectDirect } = require('./_db_direct_connect');
 *      await connectDirect(mongoose, process.env.MONGO_URI);
 */
const dns = require('dns').promises;

function parseSrvUri(srvUri) {
  const m = srvUri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/]+)\/([^?]+)(\?.*)?$/);
  if (!m) throw new Error('No se pudo parsear la URI mongodb+srv://');
  const [, user, pass, host, db, query] = m;
  return { user, pass, host, db, query: query || '' };
}

async function connectDirect(mongoose, srvUri, options = {}) {
  const { user, pass, host, db, query } = parseSrvUri(srvUri);
  const srvRecords = await dns.resolveSrv(`_mongodb._tcp.${host}`);
  const hosts = srvRecords.map(r => `${r.name}:${r.port}`).join(',');

  const params = new URLSearchParams(query.replace(/^\?/, ''));
  if (!params.has('ssl')) params.set('ssl', 'true');
  if (!params.has('authSource')) params.set('authSource', 'admin');

  const directUri = `mongodb://${user}:${pass}@${hosts}/${db}?${params.toString()}`;
  await mongoose.connect(directUri, { serverSelectionTimeoutMS: 20000, ...options });
  return mongoose.connection;
}

module.exports = { connectDirect, parseSrvUri };
