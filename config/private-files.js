const fs = require('node:fs');
const path = require('node:path');
const { canAccessModule, normalizeRole } = require('./rbac');
const { requireLogin } = require('../modules/auth/auth.middleware');
const { canViewOSDetails } = require('../modules/os/os.permissions');

function mountPrivateFiles(app, { db, storage, publicDir }) {
  const allowed = (user, key) => canAccessModule(normalizeRole(user.role), key);
  function row(sql, ...args) {
    try { return db.prepare(sql).get(...args); }
    catch (error) {
      if (/no such (table|column)/i.test(error.message)) return null;
      throw error;
    }
  }
  const mayReadOS = user => allowed(user,'os_view') || canViewOSDetails(user);
  function mayReadAcademia(user, kind, relative) {
    if (allowed(user,'academia_manage')) return true;
    if (!allowed(user,'academia_view')) return false;
    const file = '/'+kind+'/'+relative;
    let personal = false;
    for (const [table,column] of [
      ['academia_etapas_externas','certificado_url'],
      ['academia_documentos_internos','arquivo_url'],
      ['academia_certificados','arquivo_url'],
    ]) {
      const record = row(`SELECT MAX(usuario_id = ?) AS owned FROM ${table} WHERE ${column}=? HAVING COUNT(*)>0`,user.id,file);
      if (record?.owned) return true;
      if (record) personal = true;
    }
    if (personal) return false;
    // Sem registro de titular, documentos pessoais também falham fechado.
    return !['academia/certificados-externos/','academia/documentos-internos/','academia/certificados/']
      .some(prefix => relative.startsWith(prefix));
  }
  function mayRead(user, kind, relative) {
    if (normalizeRole(user.role) === 'ADMIN') return true;
    if (kind === 'uploads') {
      const attachment = row('SELECT referencia_tipo,referencia_id FROM compras_anexos WHERE filename=?', relative);
      if (attachment) {
        if (allowed(user,'compras_read')) return true;
        const requestId = attachment.referencia_tipo === 'COTACAO'
          ? row('SELECT solicitacao_id FROM compras_cotacoes WHERE id=?',attachment.referencia_id)?.solicitacao_id
          : attachment.referencia_id;
        const request = row('SELECT s.*,u.role solicitante_role FROM solicitacoes s LEFT JOIN users u ON u.id=s.solicitante_user_id WHERE s.id=?',requestId);
        return require('../modules/solicitacoes/solicitacoes.service').canViewSolicitacao(request,user);
      }
      if (relative.startsWith('colaboradores/documentos/')) return allowed(user,'rh_sensitive');
      if (relative.startsWith('os/')) return mayReadOS(user);
      if (relative.startsWith('equipamentos/')) return allowed(user,'equipamentos');
      if (relative.startsWith('academia/')) return mayReadAcademia(user,kind,relative);
      if (relative.startsWith('tv/')) return true; // A tela /tv é acessível a qualquer sessão autenticada.
      if (relative.startsWith('escala-horas/')) {
        if (allowed(user,'escala_rh') || allowed(user,'escala_manage')) return true;
        const file = '/uploads/'+relative;
        const own = row(`SELECT h.user_id,c.user_id colaborador_user_id FROM escala_horas_extras h
          LEFT JOIN colaboradores c ON c.id=h.colaborador_id WHERE h.foto_inicio_path=? OR h.foto_fim_path=?`,file,file);
        return !!own && [Number(own.user_id),Number(own.colaborador_user_id)].includes(Number(user.id));
      }
      return false;
    }
    if (kind === 'imagens') {
      if (relative.startsWith('users/') || relative.startsWith('colaboradores/fotos/')) return true;
      return relative.startsWith('equipamentos/') && (allowed(user,'equipamentos') || allowed(user,'os_view'));
    }
    const group = relative.split('/')[0];
    if (group === 'os') return mayReadOS(user);
    if (group === 'academia') return mayReadAcademia(user,kind,relative);
    const permission = {tracagem:'tracagem_view',
      'desenho-tecnico':'desenho_tecnico_view',escala:'escala_reports'}[group];
    return !!permission && allowed(user,permission);
  }
  const roots = {uploads:storage.UPLOAD_DIR,pdfs:storage.PDF_DIR,imagens:storage.IMAGE_DIR};
  for (const [kind, directory] of Object.entries(roots)) {
    app.use('/'+kind, requireLogin, (req,res,next) => {
      try {
        let relative;
        try { relative=decodeURIComponent(req.path).replace(/^\/+/, ''); }
        catch { return res.sendStatus(400); }
        if (!relative || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(p=>p==='..' || p.startsWith('.'))) return res.sendStatus(404);
        if (!mayRead(req.session.user,kind,relative)) return res.sendStatus(403);
        // A raiz pública legada passa pelas mesmas regras; symlinks não escapam.
        for (const root of [directory,path.join(publicDir,kind)]) {
          const file=path.resolve(root,relative);
          if (!fs.existsSync(file)) continue;
          const realRoot=fs.realpathSync(root), realFile=fs.realpathSync(file);
          if (!realFile.startsWith(realRoot+path.sep) || !fs.statSync(realFile).isFile()) return res.sendStatus(404);
          res.setHeader('Cache-Control','private, no-store');
          res.setHeader('Vary','Cookie');
          res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
          const inline = new Set(['.pdf','.jpg','.jpeg','.png','.gif','.webp','.avif','.heic','.heif','.bmp','.mp4','.mov','.webm','.ogg','.ogv']);
          if (!inline.has(path.extname(realFile).toLowerCase())) {
            res.attachment(path.basename(realFile));
            res.setHeader('Content-Type','application/octet-stream');
          }
          return res.sendFile(realFile,{cacheControl:false,lastModified:false,dotfiles:'deny'},error=>{
            if (error && !res.headersSent) next(error);
          });
        }
        return res.sendStatus(404);
      } catch (error) { return next(error); }
    });
  }
}

module.exports = { mountPrivateFiles };
