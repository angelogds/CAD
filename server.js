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

let webPush = null;
try { webPush = require("web-push"); } catch (_e) { webPush = null; }

const dateUtil = require("./utils/date");
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
const UPLOADS_DIR = process.env.UPLOADS_DIR || (fs.existsSync('/data') ? '/data/uploads' : path.join(process.cwd(), "uploads"));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use("/uploads", express.static(UPLOADS_DIR));

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

  // compatibilidade com layouts antigos que esperam resumoOS
  res.locals.resumoOS = res.locals.resumoOS || {
    abertas: 0,
    andamento: 0,
    fechadas: 0,
  };

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
mount("/dashboard", "./modules/dashboard/dashboard.routes");
mount("/push", "./modules/push/push.routes");
mount("/pcm", "./modules/pcm/pcm.routes");
mount("/equipamentos", "./modules/equipamentos/equipamentos.routes");
mount("/os", "./modules/os/os.routes");
mount("/ordens-servico", "./modules/os/os.routes");
mount("/preventivas", "./modules/preventivas/preventivas.routes");
mount("/compras", "./modules/compras/compras.routes");
mount("/fornecedores", "./modules/fornecedores/fornecedores.routes");
mount("/solicitacoes", "./modules/solicitacoes/solicitacoes.routes");
mount("/estoque", "./modules/estoque/estoque.routes");
mount("/almoxarifado", "./modules/almoxarifado/almoxarifado.routes");
mount("/escala", "./modules/escala/escala.routes");
mount("/avisos", "./modules/avisos/avisos.routes");
mount("/usuarios", "./modules/usuarios/usuarios.routes");
mount("/demandas", "./modules/demandas/demandas.routes");
mount("/motores", "./modules/motores/motores.routes");
mount("/inspecao", "./modules/inspecao/inspecao.routes");
mount("/inspection", "./modules/inspection/inspecao.routes");
mount("/tracagem", "./modules/tracagem/tracagem.routes");
mount("/tracagens", "./modules/tracagem/tracagens.routes");
mount("/desenho-tecnico", "./modules/desenho-tecnico/desenho-tecnico.routes");

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
