const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.info;

function format(level, msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  return `[${ts}] [${level.toUpperCase()}] ${msg}`;
}

const logger = {
  debug: (msg) => { if (currentLevel <= 0) console.log(format('debug', msg)); },
  info: (msg) => { if (currentLevel <= 1) console.log(format('info', msg)); },
  warn: (msg) => { if (currentLevel <= 2) console.warn(format('warn', msg)); },
  error: (msg) => { if (currentLevel <= 3) console.error(format('error', msg)); },
};

module.exports = logger;
