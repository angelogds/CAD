const fs = require('fs');
const path = require('path');
const service = require('./compras.service');
const { applyMigrations } = require('../../database/migrate');
const storagePaths = require('../../config/storage');

const UPLOADS_DIR = storagePaths.UPLOAD_DIR;

function isSchemaError(error) {
  const msg = String(error?.message || error || '').toLowerCase();
  return msg.includes('no such table') || msg.includes('no such column') || msg.includes('sqlite_error');
}

function tryRenderDetalhe(id, res) {
  const sol = service.getSolicitacaoDetalhe(id);
  if (!sol) return res.status(404).send('Solicitação não encontrada');
  const fornecedores = service.listFornecedoresAtivos();
  return res.render('compras/solicitacoes/show', { title: `Compras ${sol.numero}`, activeMenu: 'compras', sol, fornecedores });
}

function lista(req, res) {
  const filters = {
    query: (req.query.q || '').trim(),
    status: service.STATUS_COMPRAS.includes(req.query.status) ? req.query.status : '',
    startDate: req.query.startDate || '',
    endDate: req.query.endDate || '',
  };

  const lista = service.listSolicitacoesPorStatus(filters);

  if (req.query.export === 'excel') {
    const escapeCsv = (value) => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
    const lines = [
      ["Número", "Título", "Status", "Fornecedor", "Solicitante", "Setor", "Criada em"].join(","),
      ...lista.map((s) =>
        [
          escapeCsv(s.numero || `#${s.id}`),
          escapeCsv(s.titulo || "-"),
          escapeCsv(s.status || "-"),
          escapeCsv(s.fornecedor_nome || s.fornecedor || "-"),
          escapeCsv(s.solicitante_nome || "-"),
          escapeCsv(s.setor_origem || "-"),
          escapeCsv(s.created_at || "-"),
        ].join(",")
      ),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=solicitacoes_${Date.now()}.csv`);
    return res.send(`\uFEFF${lines.join('\n')}`);
  }

  return res.render('compras/solicitacoes/index', {
    title: 'Compras',
    activeMenu: 'compras',
    lista,
    filters,
    statusList: service.STATUS_COMPRAS,
    resumo: service.getResumoSolicitacoes(),
  });
}

function detalhe(req, res) {
  const id = Number(req.params.id);
  try {
    return tryRenderDetalhe(id, res);
  } catch (e) {
    if (isSchemaError(e)) {
      try {
        console.warn('⚠️ Schema de compras incompleto. Tentando aplicar migrations automaticamente...');
        applyMigrations();
        return tryRenderDetalhe(id, res);
      } catch (migrationError) {
        console.error('❌ Falha ao aplicar migrations automaticamente:', migrationError && migrationError.stack ? migrationError.stack : migrationError);
      }
    }

    console.error('❌ Erro detalhe compras:', e && e.stack ? e.stack : e);
    req.flash('error', 'Falha ao abrir detalhes da solicitação. Verifique se as migrations do V3 já foram aplicadas.');
    return res.redirect('/compras/solicitacoes');
  }
}

function pdf(req, res) {
  try {
    const id = Number(req.params.id);
    const sol = service.getSolicitacaoDetalhe(id);
    if (!sol) return res.status(404).send('Solicitação não encontrada');

    service.iniciarCotacaoViaPdf(id, req.session?.user?.id || null);
    return service.gerarPdf(sol, res);
  } catch (error) {
    return res.status(500).send(error.message || 'Falha ao gerar PDF.');
  }
}

function criarCotacao(req, res) {
  try {
    service.createCotacao(Number(req.params.id), req.body);
    req.flash('success', 'Cotação registrada com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar cotação.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}`);
}

function selecionarCotacao(req, res) {
  try {
    service.selecionarCotacao(Number(req.params.id), Number(req.params.cotacaoId));
    req.flash('success', 'Cotação selecionada com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível selecionar cotação.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}`);
}

function atualizarDados(req, res) {
  try {
    service.atualizarDados(Number(req.params.id), req.body);
    req.flash('success', 'Dados de compras atualizados.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível atualizar dados.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}`);
}

function marcarComprada(req, res) {
  try {
    service.marcarComprada(Number(req.params.id), req.session.user.id, req.body);
    req.flash('success', 'Solicitação marcada como COMPRADA.');
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível marcar como comprada.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}`);
}

function uploadAnexo(req, res) {
  try {
    if (!req.file) throw new Error('Nenhum arquivo foi enviado.');
    service.salvarAnexo({
      solicitacaoId: Number(req.params.id),
      file: req.file,
      tipo: req.body.tipo || 'COTACAO',
      uploadedBy: req.session?.user?.id || null,
    });
    req.flash('success', 'Anexo enviado com sucesso.');
  } catch (error) {
    req.flash('error', error.message || 'Falha ao enviar anexo.');
  }
  return res.redirect(`/compras/solicitacoes/${req.params.id}`);
}

function downloadAnexo(req, res) {
  const anexo = service.getAnexoById(Number(req.params.anexoId));
  if (!anexo) return res.status(404).send('Anexo não encontrado');

  const fullPath = path.join(UPLOADS_DIR, anexo.filename);
  if (!fs.existsSync(fullPath)) return res.status(404).send('Arquivo não encontrado no disco');

  return res.download(fullPath, anexo.original_name || anexo.filename);
}

function deleteAnexo(req, res) {
  const anexo = service.getAnexoById(Number(req.params.anexoId));
  if (!anexo) {
    req.flash('error', 'Anexo não encontrado.');
    return res.redirect('/compras/solicitacoes');
  }

  const fullPath = path.join(UPLOADS_DIR, anexo.filename);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  service.deleteAnexo(anexo.id);
  req.flash('success', 'Anexo removido.');
  return res.redirect(`/compras/solicitacoes/${anexo.referencia_id}`);
}

module.exports = {
  lista,
  detalhe,
  pdf,
  criarCotacao,
  selecionarCotacao,
  atualizarDados,
  marcarComprada,
  uploadAnexo,
  downloadAnexo,
  deleteAnexo,
};
