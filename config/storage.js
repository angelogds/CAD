const fs = require("fs");
const path = require("path");

const hasDataMount = fs.existsSync("/data");
const defaultBaseDir = hasDataMount ? "/data" : path.join(process.cwd(), "data");

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
