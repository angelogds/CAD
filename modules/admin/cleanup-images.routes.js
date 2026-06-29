// modules/admin/cleanup-images.routes.js
// Endpoint seguro para apagar e recriar as pastas de imagens no volume persistente.

const fs = require("fs").promises;
const path = require("path");
const storage = require("../../config/storage");

// Subpastas de imagens que serão limpas
const IMAGE_SUBDIRS = ["equipamentos", "users"];

/**
 * POST /admin/cleanup-images
 * Requer: requireLogin + requireRole(["ADMIN"])
 *
 * Apaga e recria as pastas:
 *   - <IMAGE_DIR>/equipamentos
 *   - <IMAGE_DIR>/users
 *
 * Retorna JSON com o resultado de cada pasta.
 */
async function cleanupImages(req, res) {
  const who = req.session?.user?.name || req.session?.user?.email || "desconhecido";
  const results = [];

  console.log(`[cleanup-images] Iniciado por: ${who} — ${new Date().toISOString()}`);

  for (const subdir of IMAGE_SUBDIRS) {
    const dirPath = path.join(storage.IMAGE_DIR, subdir);

    try {
      // Remove a pasta e todo o seu conteúdo recursivamente
      await fs.rm(dirPath, { recursive: true, force: true });
      console.log(`[cleanup-images] ✅ Pasta removida: ${dirPath}`);

      // Recria a pasta vazia
      await fs.mkdir(dirPath, { recursive: true });
      console.log(`[cleanup-images] ✅ Pasta recriada: ${dirPath}`);

      results.push({ pasta: subdir, caminho: dirPath, status: "ok", mensagem: "Pasta limpa e recriada com sucesso." });
    } catch (err) {
      const mensagem = err?.message || String(err);
      console.error(`[cleanup-images] ❌ Erro ao processar ${dirPath}:`, mensagem);
      results.push({ pasta: subdir, caminho: dirPath, status: "erro", mensagem });
    }
  }

  const temErro = results.some((r) => r.status === "erro");

  console.log(
    `[cleanup-images] Concluído por: ${who} — sucesso: ${!temErro} — ${new Date().toISOString()}`
  );

  return res.status(temErro ? 207 : 200).json({
    ok: !temErro,
    mensagem: temErro
      ? "Limpeza concluída com erros. Verifique os detalhes abaixo."
      : "Todas as pastas de imagens foram limpas e recriadas com sucesso.",
    executadoPor: who,
    timestamp: new Date().toISOString(),
    resultados: results,
  });
}

module.exports = { cleanupImages };
