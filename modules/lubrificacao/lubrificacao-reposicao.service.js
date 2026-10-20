const db = require('../../database/db');
const { normalizeRole } = require('../../config/rbac');
const solicitacoes = require('../solicitacoes/solicitacoes.service');

function disponivel() {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pcm_lub_reposicao_itens'").get();
}
function normalizar(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}
function numero(v, campo, positivo = false) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || (positivo && n === 0)) throw new Error(campo + ' inválido.');
  return n;
}
function classificar(plano = {}, equipamentoNome = '') {
  const tipo = normalizar(plano.tipo_lubrificante_texto);
  const equipamento = normalizar(equipamentoNome);
  if (tipo.includes('GRAXA')) {
    if (tipo.includes('DECANTER') || equipamento.includes('DECANTER')) {
      if ((equipamento + ' ' + tipo).includes('JULIAN')) return 'GRAXA_DECANTER_JULIANO';
      if (/GRATT|GRATE|GRAT\b/.test(equipamento + ' ' + tipo)) return 'GRAXA_DECANTER_GRATT';
      return null; // Decanter sem especificação identificável: não supor graxa EP2.
    }
    if (/ESPECIAL|NLGI\s*[0134]/.test(tipo)) return null;
    return 'GRAXA_EP2';
  }
  return tipo.includes('OLEO') && /(^|\D)680(\D|$)/.test(tipo) ? 'OLEO_680' : null;
}
function totais(tabela, campo) {
  return new Map(db.prepare('SELECT codigo, COALESCE(SUM(' + campo + '),0) AS total FROM ' + tabela + ' GROUP BY codigo')
    .all().map(row => [row.codigo, Number(row.total)]));
}
function listarItens() {
  if (!disponivel()) return [];
  const consumos = totais('pcm_lub_reposicao_consumos', 'quantidade');
  const ajustes = totais('pcm_lub_reposicao_ajustes', 'diferenca');
  const sugestoes = new Map(db.prepare("SELECT * FROM pcm_lub_reposicao_sugestoes WHERE status IN ('SUGERIDA','ENVIADA') ORDER BY id").all()
    .map(s => [s.codigo,s]));
  return db.prepare("SELECT * FROM pcm_lub_reposicao_itens ORDER BY CASE codigo WHEN 'OLEO_680' THEN 0 WHEN 'GRAXA_EP2' THEN 1 ELSE 2 END,codigo").all()
    .map(i => {
      const consumido = consumos.get(i.codigo) || 0;
      const saldo = Math.round((Number(i.saldo_referencia) + (ajustes.get(i.codigo) || 0) - consumido) * 10000) / 10000;
      return { ...i, saldo, consumido, abaixo_minimo:saldo <= Number(i.minimo),
        quantidade_sugerida:Math.max(1,Math.ceil(Math.max(0,Number(i.alvo)-saldo)/Number(i.embalagem_quantidade))),
        sugestao:sugestoes.get(i.codigo) || null };
    });
}
function atualizarSugestoes() {
  if (!disponivel()) return [];
  return db.transaction(() => {
    for (const item of listarItens()) {
      if (item.abaixo_minimo && !item.sugestao) {
        db.prepare('INSERT OR IGNORE INTO pcm_lub_reposicao_sugestoes(codigo,quantidade_embalagens,saldo_ao_criar) VALUES(?,?,?)')
          .run(item.codigo,item.quantidade_sugerida,item.saldo);
      } else if (!item.abaixo_minimo && item.sugestao) {
        db.prepare("UPDATE pcm_lub_reposicao_sugestoes SET status='RESOLVIDA' WHERE id=?").run(item.sugestao.id);
      }
    }
    return listarItens();
  })();
}
function registrarConsumo(execucaoId, plano, quantidadeInformada, equipamentoNome) {
  if (!disponivel()) return null;
  const codigo = classificar(plano,equipamentoNome);
  if (!codigo) return null;
  const item = db.prepare('SELECT * FROM pcm_lub_reposicao_itens WHERE codigo=?').get(codigo);
  if (!item) return null;
  let quantidade = 0, origem = '';
  const unidade = normalizar(plano.unidade);
  const informado = Number(String(quantidadeInformada ?? '').replace(',','.'));
  if (codigo === 'GRAXA_EP2') {
    // 150 g por EQUIPAMENTO/DIA; vários pontos no mesmo equipamento não duplicam o consumo estimado.
    quantidade = Number(item.consumo_padrao) || 0.15;
    origem = 'PADRAO_150G';
  } else if (codigo.startsWith('GRAXA_DECANTER')) {
    if (Number.isFinite(informado) && informado > 0 && ['G','GR','GRAMAS','GRAMA','KG','QUILO','QUILOS'].includes(unidade)) {
      quantidade = unidade.startsWith('G') ? informado / 1000 : informado;
      origem = 'QUANTIDADE_REGISTRADA';
    }
  } else if (codigo === 'OLEO_680') {
    // Inspecionar nível não significa consumir óleo; litros não viram tambores sem fator validado.
    const descricao = normalizar((plano.metodo_aplicacao || '') + ' ' + (plano.ponto_lubrificacao || ''));
    if (/TROCAR|TROCA|COMPLETAR|REPOR|ABASTECER/.test(descricao) &&
        ['TAMBOR','TAMBORES'].includes(unidade) && Number.isFinite(informado) && informado > 0) {
      quantidade = informado;
      origem = 'TAMBOR_REGISTRADO';
    }
  }
  if (!(quantidade > 0)) return null;
  const data = db.prepare("SELECT date('now','localtime') AS dia").get().dia;
  const row = db.prepare('INSERT OR IGNORE INTO pcm_lub_reposicao_consumos(codigo,execucao_id,equipamento_id,data_execucao,quantidade,origem) VALUES(?,?,?,?,?,?)')
    .run(codigo,Number(execucaoId),Number(plano.equipamento_id),data,quantidade,origem);
  return row.changes ? {codigo,quantidade} : null;
}
function salvarConfiguracao(codigo, dados, usuario) {
  if (!disponivel()) throw new Error('Execute a migration de reposição.');
  if (!db.prepare('SELECT 1 FROM pcm_lub_reposicao_itens WHERE codigo=?').get(codigo)) throw new Error('Lubrificante desconhecido.');
  const minimo = numero(dados.minimo,'Estoque mínimo');
  const alvo = numero(dados.alvo,'Estoque-alvo');
  const embalagem = numero(dados.embalagem_quantidade,'Tamanho da embalagem',true);
  const consumo = numero(dados.consumo_padrao,'Consumo-padrão');
  if (alvo <= minimo) throw new Error('Estoque-alvo precisa ser maior que o mínimo.');
  const modo = dados.modo === 'AUTOMATICO' ? 'AUTOMATICO' : 'ASSISTIDO';
  const confirmado = dados.especificacao_confirmada === '1' ? 1 : 0;
  if (modo === 'AUTOMATICO' && !confirmado) throw new Error('Valide a especificação antes do modo automático.');
  const uid = Number(usuario?.id);
  if (!uid) throw new Error('Gestor não identificado.');
  db.prepare("UPDATE pcm_lub_reposicao_itens SET minimo=?,alvo=?,embalagem_quantidade=?,consumo_padrao=?,modo=?,especificacao_confirmada=?,solicitante_user_id=?,atualizado_em=datetime('now') WHERE codigo=?")
    .run(minimo,alvo,embalagem,consumo,modo,confirmado,uid,codigo);
  atualizarSugestoes();
  if (modo === 'AUTOMATICO') enviarAutomaticas();
}
function ajustarSaldo(codigo, saldoNovo, motivo, usuario) {
  if (!disponivel()) throw new Error('Execute a migration de reposição.');
  const saldo = numero(saldoNovo,'Saldo de referência');
  const atual = listarItens().find(i => i.codigo === codigo);
  if (!atual) throw new Error('Lubrificante desconhecido.');
  const delta = Math.round((saldo - atual.saldo) * 10000) / 10000;
  if (Math.abs(delta) < 0.00001) return;
  if (!usuario?.id) throw new Error('Gestor não identificado.');
  db.prepare('INSERT INTO pcm_lub_reposicao_ajustes(codigo,diferenca,saldo_informado,motivo,usuario_id) VALUES(?,?,?,?,?)')
    .run(codigo,delta,saldo,String(motivo || 'Conferência de estoque').slice(0,240),usuario.id);
  atualizarSugestoes();
  enviarAutomaticas();
}
function enviarSugestao(id, usuario, { automatico = false, quantidade_embalagens = null } = {}) {
  if (!disponivel()) throw new Error('Execute a migration de reposição.');
  return db.transaction(() => {
    const s = db.prepare('SELECT * FROM pcm_lub_reposicao_sugestoes WHERE id=?').get(Number(id));
    if (!s) throw new Error('Pré-solicitação inexistente.');
    if (s.status === 'ENVIADA') return {id:s.solicitacao_id,ja_enviada:true};
    if (s.status !== 'SUGERIDA') throw new Error('Pré-solicitação já encerrada.');
    const item = db.prepare('SELECT * FROM pcm_lub_reposicao_itens WHERE codigo=?').get(s.codigo);
    if (!item?.especificacao_confirmada) throw new Error('Confirme a especificação antes da solicitação.');
    const qtd = quantidade_embalagens == null ? s.quantidade_embalagens :
      numero(quantidade_embalagens,'Quantidade de embalagens',true);
    if (!Number.isSafeInteger(qtd) || qtd > 10000) throw new Error('Informe número inteiro de embalagens.');
    const uid = automatico ? Number(item.solicitante_user_id) : Number(usuario?.id);
    if (!uid) throw new Error('Configure o responsável do modo automático.');
    const remetente = db.prepare('SELECT id,role FROM users WHERE id=?').get(uid);
    if (!remetente || !['ADMIN','ENCARREGADO_MANUTENCAO','MANUTENCAO_SUPERVISOR','SUPERVISOR_MANUTENCAO'].includes(normalizeRole(remetente.role))) {
      throw new Error('Responsável pela solicitação precisa ter acesso à gestão do PCM.');
    }
    const solId = solicitacoes.createSolicitacao({
      userId:uid,user:remetente,setor_origem:'RECICLAGEM',prioridade:'MEDIA',
      titulo:'Reposição de lubrificantes — Plano de Lubrificação (PCM)',
      descricao:'Solicitação de material gerada via sistema automático de lubrificação. Revisar estoque físico no Almoxarifado. ' +
        item.nome + '; ' + item.embalagem_descricao + '; origem ' + (automatico ? 'automática' : 'revisão PCM') + '.',
      tipo_aplicacao:'OUTRO',destino_uso:'Estoque da Manutenção / Plano de Lubrificação',
      itens:[{item_nome:item.nome + ' — ' + item.embalagem_descricao,
        item_descricao:'Reposição preventiva conforme Plano de Lubrificação - ' + item.codigo,
        unidade:'UN',qtd_solicitada:qtd}]
    });
    // Identificação de origem na solicitação. Segue aprovação/compra existentes.
    const cols = db.prepare('PRAGMA table_info(solicitacoes)').all().map(c => c.name);
    if (cols.includes('tipo_origem')) db.prepare("UPDATE solicitacoes SET tipo_origem='LUBRIFICACAO' WHERE id=?").run(solId);
    solicitacoes.finalizarElaboracao(solId,uid);
    db.prepare("UPDATE pcm_lub_reposicao_sugestoes SET status='ENVIADA',quantidade_embalagens=?,solicitacao_id=?,usuario_envio_id=?,enviada_em=datetime('now') WHERE id=?")
      .run(qtd,solId,uid,s.id);
    return {id:solId,ja_enviada:false};
  })();
}
function enviarAutomaticas() {
  if (!disponivel()) return [];
  const resultado = [];
  for (const i of atualizarSugestoes()) {
    if (i.modo === 'AUTOMATICO' && i.especificacao_confirmada && i.sugestao?.status === 'SUGERIDA') {
      try { resultado.push(enviarSugestao(i.sugestao.id,null,{automatico:true})); }
      catch (e) { console.error('[LUBRIFICACAO_REPOSICAO] Requisição automática pendente:',e.message); }
    }
  }
  return resultado;
}
function contarAlertas() {
  if (!disponivel()) return 0;
  return db.prepare("SELECT COUNT(*) AS n FROM pcm_lub_reposicao_sugestoes WHERE status='SUGERIDA'").get().n;
}
function getPainel() { return { itens:atualizarSugestoes(),alertas:contarAlertas() }; }

module.exports={disponivel,classificar,listarItens,registrarConsumo,atualizarSugestoes,
  salvarConfiguracao,ajustarSaldo,enviarSugestao,enviarAutomaticas,contarAlertas,getPainel};
