// utils/logger.js
// Structured logger with timestamps, levels, file persistence, and crash handling.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const LEVEL_LABELS = { 0: 'ERROR', 1: 'WARN', 2: 'INFO', 3: 'DEBUG' };

// Resolve log directory — prefer /data/logs (persistent volume), fall back to cwd/logs
function resolveLogDir() {
  try {
    // Lazy-require to avoid circular dependency at module load time
    const storage = require('../config/storage');
    return path.join(storage.DATA_DIR, 'logs');
  } catch (_e) {
    return path.join(process.cwd(), 'logs');
  }
}

function ensureLogDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_e) {}
}

function getLogFilePath(dir) {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(dir, `app-${date}.log`);
}

function systemInfo() {
  try {
    return {
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      memUsedMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      memFreeMB: Math.round(os.freemem() / 1024 / 1024),
      uptimeSec: Math.round(process.uptime()),
      loadAvg: os.loadavg().map((v) => v.toFixed(2)),
    };
  } catch (_e) {
    return {};
  }
}

// Configured log level from env (default INFO)
const configuredLevel = (() => {
  const raw = String(process.env.LOG_LEVEL || 'INFO').toUpperCase();
  return raw in LEVELS ? LEVELS[raw] : LEVELS.INFO;
})();

let _logDir = null;
function getLogDir() {
  if (!_logDir) {
    _logDir = resolveLogDir();
    ensureLogDir(_logDir);
  }
  return _logDir;
}

function writeToFile(entry) {
  try {
    const dir = getLogDir();
    const filePath = getLogFilePath(dir);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  } catch (_e) {
    // Never throw from logger
  }
}

function formatConsole(entry) {
  const { timestamp, level, message, context, error } = entry;
  let line = `[${timestamp}] ${level} — ${message}`;
  if (context && Object.keys(context).length > 0) {
    line += ` | ${JSON.stringify(context)}`;
  }
  if (error) {
    line += `\n  ${error.stack || error.message || String(error)}`;
  }
  return line;
}

function log(levelName, message, context = {}, errorObj = null) {
  const levelNum = LEVELS[levelName] ?? LEVELS.INFO;
  if (levelNum > configuredLevel) return;

  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level: levelName,
    message: String(message || ''),
    context: context && typeof context === 'object' ? context : {},
    ...(errorObj ? {
      error: {
        message: errorObj.message || String(errorObj),
        code: errorObj.code,
        stack: errorObj.stack,
      },
    } : {}),
  };

  // Console output
  const consoleFn = levelNum === LEVELS.ERROR ? console.error
    : levelNum === LEVELS.WARN ? console.warn
    : console.log;
  consoleFn(formatConsole(entry));

  // Persist ERROR and WARN to file
  if (levelNum <= LEVELS.WARN) {
    writeToFile(entry);
  }
}

const logger = {
  error: (message, context, err) => log('ERROR', message, context, err),
  warn:  (message, context, err) => log('WARN',  message, context, err),
  info:  (message, context)      => log('INFO',  message, context),
  debug: (message, context)      => log('DEBUG', message, context),

  /**
   * Register global handlers for uncaught exceptions and unhandled rejections.
   * Call once from server.js during startup.
   */
  registerGlobalHandlers() {
    process.on('uncaughtException', (err) => {
      const sys = systemInfo();
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Uncaught exception — process will exit',
        context: { reason: 'uncaughtException', system: sys },
        error: { message: err.message, code: err.code, stack: err.stack },
      };
      console.error(formatConsole(entry));
      writeToFile(entry);
      // Give the file write a moment, then exit
      setTimeout(() => process.exit(1), 200);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      const entry = {
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: 'Unhandled promise rejection',
        context: { reason: 'unhandledRejection', promise: String(promise) },
        error: { message: err.message, code: err.code, stack: err.stack },
      };
      console.error(formatConsole(entry));
      writeToFile(entry);
    });

    process.on('exit', (code) => {
      const entry = {
        timestamp: new Date().toISOString(),
        level: code === 0 ? 'INFO' : 'ERROR',
        message: `Process exiting with code ${code}`,
        context: { exitCode: code, system: systemInfo() },
      };
      // Synchronous write on exit
      try {
        const dir = getLogDir();
        fs.appendFileSync(getLogFilePath(dir), JSON.stringify(entry) + '\n');
      } catch (_e) {}
    });
  },

  /**
   * Return the last N lines from today's log file (for admin viewer).
   */
  getRecentErrors(limit = 100) {
    try {
      const dir = getLogDir();
      const filePath = getLogFilePath(dir);
      if (!fs.existsSync(filePath)) return [];
      const lines = fs.readFileSync(filePath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-limit);
      return lines.map((l) => {
        try { return JSON.parse(l); } catch (_e) { return { raw: l }; }
      }).filter((e) => !e.level || LEVELS[e.level] <= LEVELS.WARN);
    } catch (_e) {
      return [];
    }
  },

  getLogDir,
};

module.exports = logger;
