// server.js
require("dotenv").config();

try {
  require("./database/migrate");
  console.log("✅ Migrations carregadas");
} catch (err) {
  console.error("❌ Erro nas migrations:", err.message || err);
}

const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const SQLiteStoreFactory = require("better-sqlite3-session-store")(session);
const db = require("./database/db");
const engine = require("ejs-mate");
const storage = require("./config/storage");

let webPush = null;
try { webPush = require("web-push"); } catch (_e) { webPush = null; }

const dateUtil = require("./utils/date");
const aiService = require("./modules/ai/ai.service");
const {
  OFFICIAL_ROUTES,
  COMPATIBILITY_ALIASES,
  registerCompatibilityAlias,
} = require("./config/routes");
const fmtBR =
  typeof dateUtil.fmtBR === "function" ? dateUtil.fmtBR : (v) => String(v ?? "-");
const TZ = dateUtil.TZ || "America/Sao_Paulo";

// ✅ RBAC helpers (para usar no EJS sem require)
let canAccessModule = () => true;
let normalizeRole = (v) => String(v || "").toLowerCase();
try {
  const rbac = require("./config/rbac");
  if (typeof rbac.canAccessModule === "function") canAccessModule = rbac.canAccessModule;
  if (typeof rbac.normalizeRole === "function") normalizeRole = rbac.normalizeRole;
} catch (e) {
  console.warn("⚠️ [rbac] não carregado (seguindo permissivo):", e.message || e);
}

const app = express();
app.set("trust proxy", 1);

try {
  storage.ensurePersistentDirs();
  console.log(`✅ Storage pronto: DATA_DIR=${storage.DATA_DIR}`);
} catch (err) {
  console.error("❌ Erro ao preparar diretórios persistentes:", err.message || err);
}

aiService.validateAIEnvironment();
setTimeout(() => {
  aiService.testOpenAIConnection().catch((err) => {
    console.error("ERRO REAL IA:", err?.message || err);
  });
}, 0);

if (webPush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@campodogado.local',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (e) {
    console.warn('⚠️ WebPush desativado: VAPID não configurado');
  }
} else {
  console.warn('⚠️ WebPush desativado: VAPID não configurado');
}

app.locals.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';

// ===== View engine =====
app.engine("ejs", engine);
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// ✅ (IMPORTANTÍSSIMO) Se o layout antigo usa "incluir(...)" em PT-BR,
// criamos um alias global pra apontar pro include padrão.
app.locals.incluir = function (p) {
  // aceita "parciais/..." e converte para "partials/..." (padrão atual)
  if (typeof p !== "string") return p;
  if (p.startsWith("parciais/")) return "partials/" + p.slice("parciais/".length);
  return p;
};

// ===== Middlewares base =====
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(storage.UPLOAD_DIR));
app.use("/pdfs", express.static(storage.PDF_DIR));
app.use("/imagens", express.static(storage.IMAGE_DIR));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// ===== Session + Flash =====
app.use(
  session({
    name: process.env.SESSION_COOKIE_NAME || "cg.sid",
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    store: new SQLiteStoreFactory({
      client: db,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 },
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
    },
  })
);
app.use(flash());

// ===== Globals (views) =====
app.locals.TZ = TZ;
app.locals.fmtBR = fmtBR;

function listOnlineUsers() {
  try {
    const nowMs = Date.now();
    const tableInfo = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND lower(name) IN ('sessions','session') ORDER BY name")
      .all();
    const tableName = tableInfo[0]?.name;
    if (!tableName) return [];

    const columns = new Set(
      db.prepare(`PRAGMA table_info(${tableName})`).all().map((col) => String(col?.name || "").toLowerCase())
    );
    if (!columns.has("sess")) return [];

    const hasExpired = columns.has("expired");
    const hasExpires = columns.has("expires");

    let query = `SELECT sess${hasExpired ? ', expired' : ''}${hasExpires ? ', expires' : ''} FROM ${tableName}`;
    if (hasExpired) query += " WHERE expired >= ?";
    const rows = hasExpired ? db.prepare(query).all(nowMs) : db.prepare(query).all();
    const byUserId = new Map();

    for (const row of rows) {
      if (!row?.sess) continue;

      let payload = null;
      try {
        payload = JSON.parse(row.sess);
      } catch (_e) {
        continue;
      }

      const expiresRaw = row?.expires;
      if (!hasExpired && expiresRaw != null) {
        const expiresMs = Number.isFinite(Number(expiresRaw))
          ? Number(expiresRaw)
          : Date.parse(String(expiresRaw));
        if (Number.isFinite(expiresMs) && expiresMs < nowMs) continue;
      }

      const sessionUser = payload?.user || payload?.session?.user || payload?.passport?.user || null;
      const userId = Number(sessionUser?.id || sessionUser?.user_id || 0);
      const userName = String(sessionUser?.name || sessionUser?.username || "").trim();
      if (!userId || !userName) continue;

      if (!byUserId.has(userId)) {
        byUserId.set(userId, {
          id: userId,
          name: userName,
          photo_path: sessionUser?.photo_path || null,
        });
      }
    }

    return Array.from(byUserId.values())
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR", { sensitivity: "base" }))
      .slice(0, 12);
  } catch (_e) {
    return [];
  }
}

app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;

  // ✅ flash sempre existe no EJS
  res.locals.flash = {
    success: req.flash("success") || [],
    error: req.flash("error") || [],
  };

  // ✅ data helpers
  res.locals.fmtBR = fmtBR;
  res.locals.TZ = TZ;
  res.locals.VAPID_PUBLIC_KEY = app.locals.VAPID_PUBLIC_KEY || "";

  // ✅ RBAC helpers disponíveis no EJS (sem require no template)
  res.locals.canAccessModule = canAccessModule;
  res.locals.normalizeRole = normalizeRole;

  // ✅ alias "incluir" também disponível no res.locals (alguns layouts chamam direto)
  res.locals.incluir = app.locals.incluir;

  // evita crash no layout
  res.locals.activeMenu = res.locals.activeMenu || "";
  res.locals.activePcmSection = res.locals.activePcmSection || "";

  // contadores operacionais globais (menu/alertas inteligentes)
  try {
    const osAbertas = db.prepare(`
      SELECT COUNT(*) AS total
      FROM os
      WHERE UPPER(COALESCE(status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA')
    `).get()?.total || 0;

    const osCriticas = db.prepare(`
      SELECT COUNT(*) AS total
      FROM os
      WHERE UPPER(COALESCE(status,'')) IN ('ABERTA','ANDAMENTO','EM_ANDAMENTO','PAUSADA')
        AND UPPER(COALESCE(prioridade, 'MEDIA')) IN ('CRITICA','CRÍTICA','EMERGENCIAL','ALTA')
    `).get()?.total || 0;

    const preventivasHoje = db.prepare(`
      SELECT COUNT(*) AS total
      FROM preventiva_execucoes
      WHERE UPPER(COALESCE(status,'')) IN ('PENDENTE','ATRASADA') AND date(COALESCE(data_prevista,'')) = date('now','localtime')
    `).get()?.total || 0;

    res.locals.operationalCounters = {
      osAbertas: Number(osAbertas || 0),
      osCriticas: Number(osCriticas || 0),
      preventivasHoje: Number(preventivasHoje || 0),
    };
  } catch (_e) {
    res.locals.operationalCounters = { osAbertas: 0, osCriticas: 0, preventivasHoje: 0 };
  }

  res.locals.onlineUsers = listOnlineUsers();

  next();
});

// ✅ Seeds
try {
  const seed = require("./database/seed");
  if (seed && typeof seed.runSeeds === "function") seed.runSeeds();
  else if (seed && typeof seed.ensureAdmin === "function") seed.ensureAdmin();
} catch (err) {
  console.warn("⚠️ Seed não carregado:", err.message || err);
}

// ===== ROTAS =====
function mount(basePath, modPath) {
  try {
    app.use(basePath, require(modPath));
  } catch (err) {
    console.error(`❌ [routes] Falha ao carregar ${modPath}:`, err && (err.stack || err.message || err));
    app.use(basePath, (_req, res) => {
      res.status(503).send(`Módulo temporariamente indisponível: ${basePath}`);
    });
  }
}

mount("/auth", "./modules/auth/auth.routes");
mount(OFFICIAL_ROUTES.dashboard, "./modules/dashboard/dashboard.routes");
mount("/push", "./modules/push/push.routes");
mount("/mobile", "./modules/mobile/mobile.routes");
mount(OFFICIAL_ROUTES.pcm, "./modules/pcm/pcm.routes");
mount("/equipamentos", "./modules/equipamentos/equipamentos.routes");
mount(OFFICIAL_ROUTES.os, "./modules/os/os.routes");
mount("/preventivas", "./modules/preventivas/preventivas.routes");
mount(OFFICIAL_ROUTES.compras, "./modules/compras/compras.routes");
mount("/fornecedores", "./modules/fornecedores/fornecedores.routes");
mount("/solicitacoes", "./modules/solicitacoes/solicitacoes.routes");
mount(OFFICIAL_ROUTES.estoque, "./modules/estoque/estoque.routes");
mount(OFFICIAL_ROUTES.almoxarifado, "./modules/almoxarifado/almoxarifado.routes");
mount("/escala", "./modules/escala/escala.routes");
mount("/avisos", "./modules/avisos/avisos.routes");
mount("/usuarios", "./modules/usuarios/usuarios.routes");
mount("/demandas", "./modules/demandas/demandas.routes");
mount("/motores", "./modules/motores/motores.routes");
mount(OFFICIAL_ROUTES.inspecao, "./modules/inspecao/inspecao.routes");
mount("/inspection", "./modules/inspection/inspecao.routes");
mount("/tracagem", "./modules/tracagem/tracagem.routes");
mount("/tracagens", "./modules/tracagem/tracagens.routes");
mount("/desenho-tecnico", "./modules/desenho-tecnico/desenho-tecnico.routes");
mount("/academia", "./modules/academia/academia.routes");
mount(OFFICIAL_ROUTES.ia, "./modules/ai/ai.routes");
mount("/ia", "./modules/ia/ia.routes");
mount("/", "./modules/tv/tv.routes");

// Compatibilidade de rotas legadas para não quebrar links antigos.
for (const alias of COMPATIBILITY_ALIASES) {
  registerCompatibilityAlias(app, alias.from, alias.to);
}

try {
  const osService = require("./modules/os/os.service");
  if (typeof osService.syncOpenOSWithCurrentShift === "function") {
    const run = () => {
      try {
        osService.syncOpenOSWithCurrentShift();
      } catch (err) {
        console.warn("⚠️ Falha na sincronização automática das OS por turno:", err.message || err);
      }
    };

    run();
    setInterval(run, 60 * 1000);
  }
} catch (err) {
  console.warn("⚠️ Serviço de OS não carregado para sincronização automática:", err.message || err);
}

// ===== Home =====
app.get("/", (req, res) => {
  if (req.session?.user) return res.redirect("/dashboard");
  return res.redirect("/auth/login");
});

app.get("/painel-operacional", (req, res) => {
  if (!req.session?.user) return res.redirect("/auth/login");
  return res.redirect("/dashboard");
});


// ===== Health =====
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    app: "manutencao-campo-do-gado-v2",
    timezone: TZ,
    timestamp_utc: new Date().toISOString(),
  });
});

// ===== 404 =====
app.use((_req, res) => res.status(404).send("404 - Página não encontrada"));

// ===== Error handler =====
app.use((err, req, res, _next) => {
  console.error("❌ ERRO 500:", req.method, req.originalUrl);
  console.error(err && err.stack ? err.stack : err);
  res.status(500).send("500 - Erro interno");
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🚀 Servidor ativo na porta ${port}`));
