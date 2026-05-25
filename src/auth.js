const config = require('./config');
const log = require('./logger');

function basicAuth(req, res, next) {
  if (!config.authUsername && !config.authPassword) {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="RAID Monitor"');
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const base64 = header.slice(6);
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const colonIdx = decoded.indexOf(':');
    const user = decoded.slice(0, colonIdx);
    const pass = decoded.slice(colonIdx + 1);

    if (user !== config.authUsername || pass !== config.authPassword) {
      res.setHeader('WWW-Authenticate', 'Basic realm="RAID Monitor"');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    next();
  } catch (_) {
    return res.status(400).json({ error: 'Invalid authorization header' });
  }
}

module.exports = { basicAuth };
