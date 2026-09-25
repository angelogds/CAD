const configService = require('./tv-config.service');

function boolField(value) {
  return ['1', 'true', 'on', 'yes'].includes(String(value || '').toLowerCase());
}

exports.page = (req, res, next) => {
  try {
    res.locals.activeMenu = 'tv-configuracoes';
    return res.render('tv/configuracoes', {
      title: 'Configurações do Modo TV',
      config: configService.ensureRow(),
      midias: configService.listMidias(),
      user: req.session?.user || null,
    });
  } catch (error) {
    return next(error);
  }
};

exports.updateConfig = (req, res) => {
  try {
    configService.updateMainConfig({
      mascoteOsAtivo: boolField(req.body.mascote_os_ativo),
      midiasIntervaloAtivas: boolField(req.body.midias_intervalo_ativas),
      userId: req.session?.user?.id || null,
    });
    req.flash('success', 'Configurações do Modo TV atualizadas.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível atualizar as configurações.');
  }
  return res.redirect('/tv/configuracoes');
};

exports.uploadMascot = (req, res) => {
  try {
    if (!req.file) throw new Error('Selecione um vídeo para o mascote da chamada de OS.');
    const publicPath = configService.uploadedFileToPublicPath(req.file);
    if (!publicPath) throw new Error('Não foi possível publicar o vídeo enviado.');
    configService.setMascotPath(publicPath, req.session?.user?.id || null);
    req.flash('success', 'Vídeo do mascote da chamada de OS atualizado.');
  } catch (error) {
    req.flash('error', error.message || 'Falha ao atualizar o vídeo do mascote.');
  }
  return res.redirect('/tv/configuracoes');
};

exports.uploadMedia = (req, res) => {
  try {
    if (!req.file) throw new Error('Selecione uma imagem ou vídeo.');
    const mime = String(req.file.mimetype || '').toLowerCase();
    const tipo = mime.startsWith('video/') ? 'VIDEO' : 'IMAGEM';
    const publicPath = configService.uploadedFileToPublicPath(req.file);
    if (!publicPath) throw new Error('Não foi possível publicar a mídia enviada.');

    configService.addMedia({
      nome: req.body.nome || req.file.originalname,
      tipo,
      caminho: publicPath,
      posicaoDepoisTela: req.body.posicao_depois_tela,
      duracaoSegundos: req.body.duracao_segundos,
      ordem: req.body.ordem,
      userId: req.session?.user?.id || null,
    });
    req.flash('success', 'Mídia adicionada à biblioteca do Modo TV.');
  } catch (error) {
    req.flash('error', error.message || 'Falha ao adicionar mídia ao Modo TV.');
  }
  return res.redirect('/tv/configuracoes');
};

exports.toggleMedia = (req, res) => {
  try {
    const ativo = boolField(req.body.ativo);
    if (!configService.toggleMedia(req.params.id, ativo)) {
      throw new Error('Mídia não encontrada.');
    }
    req.flash('success', ativo ? 'Mídia ativada.' : 'Mídia desativada.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível alterar a mídia.');
  }
  return res.redirect('/tv/configuracoes');
};

exports.deleteMedia = (req, res) => {
  try {
    const row = configService.removeMedia(req.params.id);
    if (!row) throw new Error('Mídia não encontrada.');
    req.flash('success', 'Mídia removida do Modo TV.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível remover a mídia.');
  }
  return res.redirect('/tv/configuracoes');
};
