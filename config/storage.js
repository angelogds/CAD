const fs = require("fs");
const path = require("path");

function firstWritableDir(candidates) {
  for (const candidate of candidates) {
    if (!candidate || !String(candidate).trim()) continue;
    const dir = path.resolve(String(candidate).trim());
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
      return dir;
    } catch (_error) {
      // tenta o próximo candidato
    }
  }
  return path.join(process.cwd(), "data");
}

// No Railway, o volume pode ser montado em um caminho dinâmico e exposto por
// RAILWAY_VOLUME_MOUNT_PATH. Preferir esse caminho evita gravar SQLite em /data
// quando /data existe na imagem, mas não é o volume persistente real.
const defaultBaseDir = firstWritableDir([
  process.env.RAILWAY_VOLUME_MOUNT_PATH,
  process.env.RAILWAY_VOLUME_PATH,
  fs.existsSync("/data") ? "/data" : null,
  path.join(process.cwd(), "data"),
]);

function resolveDir(envKey, fallbackPath) {
  const envValue = process.env[envKey];
  if (envValue && String(envValue).trim()) return path.resolve(String(envValue).trim());
  return path.resolve(fallbackPath);
}

const DATA_DIR = resolveDir("DATA_DIR", defaultBaseDir);
const UPLOAD_DIR = resolveDir("UPLOAD_DIR", path.join(DATA_DIR, "uploads"));
const PDF_DIR = resolveDir("PDF_DIR", path.join(DATA_DIR, "pdfs"));
const IMAGE_DIR = resolveDir("IMAGE_DIR", path.join(DATA_DIR, "imagens"));
const TEMP_DIR = resolveDir("TEMP_DIR", path.join(DATA_DIR, "temp"));
const SQLITE_DIR = resolveDir("SQLITE_DIR", path.join(DATA_DIR, "sqlite"));
const DB_PATH = process.env.DB_PATH && String(process.env.DB_PATH).trim()
  ? path.resolve(String(process.env.DB_PATH).trim())
  : path.join(SQLITE_DIR, "app.db");

const PERSISTENT_DIRS = [DATA_DIR, UPLOAD_DIR, PDF_DIR, IMAGE_DIR, TEMP_DIR, SQLITE_DIR];

function ensurePersistentDirs() {
  for (const dir of PERSISTENT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function toPublicPath(absoluteFilePath) {
  const normalized = path.resolve(absoluteFilePath);
  if (normalized.startsWith(`${UPLOAD_DIR}${path.sep}`)) {
    const rel = path.relative(UPLOAD_DIR, normalized).split(path.sep).join("/");
    return `/uploads/${rel}`;
  }
  if (normalized.startsWith(`${PDF_DIR}${path.sep}`)) {
    const rel = path.relative(PDF_DIR, normalized).split(path.sep).join("/");
    return `/pdfs/${rel}`;
  }
  if (normalized.startsWith(`${IMAGE_DIR}${path.sep}`)) {
    const rel = path.relative(IMAGE_DIR, normalized).split(path.sep).join("/");
    return `/imagens/${rel}`;
  }
  return null;
}

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  PDF_DIR,
  IMAGE_DIR,
  TEMP_DIR,
  SQLITE_DIR,
  DB_PATH,
  ensurePersistentDirs,
  toPublicPath,
};
