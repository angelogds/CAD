// modules/auth/auth.controller.js
const bcrypt = require("bcryptjs");
const authService = require("./auth.service");

exports.showLogin = (req, res) => {
  if (req.session?.user) return res.redirect("/dashboard");

  // mantém esses campos pra sua view atualizada
  return res.render("auth/login", {
    title: "Login",
    authFullscreen: true,
    lockout: null,
    attemptsLeft: null,
    rememberedEmail: "",
    next: String(req.query?.next || "").trim(),
  });
};

exports.doLogin = (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    req.flash("error", "Informe e-mail e senha.");
    return res.redirect("/auth/login");
  }

  const user = authService.getUserByEmail(email);

  if (!user) {
    req.flash("error", "Usuário ou senha inválidos.");
    return res.redirect("/auth/login");
  }

  const ok = bcrypt.compareSync(password, user.password_hash || "");
  if (!ok) {
    req.flash("error", "Usuário ou senha inválidos.");
    return res.redirect("/auth/login");
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error("❌ Erro regenerate session:", err);
      req.flash("error", "Erro ao iniciar sessão. Tente novamente.");
      return res.redirect("/auth/login");
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      photo_path: user.photo_path || null,
    };

    req.session.save((err2) => {
      if (err2) {
        console.error("❌ Erro session.save:", err2);
        req.flash("error", "Erro ao salvar sessão. Tente novamente.");
        return res.redirect("/auth/login");
      }
      const nextUrl = String(req.body?.next || "").trim();
      if (nextUrl && nextUrl.startsWith("/")) return res.redirect(nextUrl);
      return res.redirect("/dashboard");
    });
  });
};

exports.logout = (req, res) => {
  const sidName = process.env.SESSION_COOKIE_NAME || "cg.sid";
  req.session?.destroy((err) => {
    if (err) console.error("❌ Erro ao destruir sessão:", err);
    res.clearCookie(sidName);
    return res.redirect("/auth/login");
  });
};
