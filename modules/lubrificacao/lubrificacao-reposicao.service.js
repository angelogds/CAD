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
  return tipo.includes('OLEO') && /(^|\D)680(\D|$)/.test(tipo) && !/DECANTER|ESPECIAL|SINTETICO|SHC|HIDRAULICO/.test(tipo+' '+equipamento) ? 'OLEO_680' : null;
}
function estoqueVinculado(item) {
  if (!item?.estoque_item_id) return null;
  return db.prepare("SELECT i.id,i.codigo,i.nome,i.unidade,i.saldo_atual,i.saldo_minimo,i.ativo,i.setor_utilizacao,l.nome AS local_nome FROM estoque_itens i LEFT JOIN estoque_locais l ON l.id=i.local_id WHERE i.id=? AND i.ativo=1")
    .get(Number(item.estoque_item_id)) || null;
}
function pedidoEstoquePendente(estoqueItemId) {
  if (!estoqueItemId || !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estoque_reposicao_vinculos'").get()) return null;
  return db.prepare("SELECT s.id,s.numero,s.status FROM estoque_reposicao_vinculos v JOIN solicitacoes s ON s.id=v.solicitacao_id WHERE v.estoque_item_id=? AND s.status NOT IN ('CANCELADA','FECHADA','RECEBIDA_TOTAL','SEPARADA_PARA_RETIRADA','ENTREGUE_SOLICITANTE') AND COALESCE(s.pre_status,'')<>'REPROVADA' ORDER BY s.id DESC LIMIT 1")
    .get(Number(estoqueItemId)) || null;
}
function listarOpcoesEstoque() {
  if (!disponivel()) return [];
  return db.prepare("SELECT i.id,i.nome,i.codigo,i.unidade,i.saldo_atual,COALESCE(i.setor_utilizacao,'COMUM') setor_utilizacao,l.nome AS local_nome FROM estoque_itens i LEFT JOIN estoque_locais l ON l.id=i.local_id LEFT JOIN estoque_categorias c ON c.id=i.categoria_id WHERE i.ativo=1 AND (UPPER(i.nome) LIKE '%GRAXA%' OR UPPER(i.nome) LIKE '%ÓLEO%' OR UPPER(i.nome) LIKE '%OLEO%' OR UPPER(COALESCE(c.nome,''))='LUBRIFICANTES') AND UPPER(COALESCE(i.setor_utilizacao,'COMUM')) IN ('RECICLAGEM','COMUM') ORDER BY i.nome LIMIT 250").all();
}
function listarItens() {
  if (!disponivel()) return [];
  // Consumos históricos estimados não constituem baixa física e não alteram o saldo oficial.
  const consumos = new Map(db.prepare("SELECT codigo,COALESCE(SUM(quantidade),0) AS total FROM pcm_lub_reposicao_consumos WHERE estoque_movimento_id IS NOT NULL GROUP BY codigo")
    .all().map(r => [r.codigo,Number(r.total)]));
  const sugestoes = new Map(db.prepare("SELECT * FROM pcm_lub_reposicao_sugestoes WHERE status IN ('SUGERIDA','ENVIADA') ORDER BY id").all().map(s=>[s.codigo,s]));
  return db.prepare("SELECT * FROM pcm_lub_reposicao_itens ORDER BY CASE codigo WHEN 'OLEO_680' THEN 0 WHEN 'GRAXA_EP2' THEN 1 ELSE 2 END,codigo").all()
    .map(i => {
      const fisico = estoqueVinculado(i);
      const saldo = fisico ? Number(fisico.saldo_atual || 0) : null;
      const minimo = Number(i.minimo);
      const embalagem = Number(i.embalagem_quantidade);
      return {...i, saldo, saldo_confiavel:Boolean(fisico), estoque_nome:fisico?.nome || null,
        estoque_local:fisico?.local_nome || null, estoque_unidade:fisico?.unidade || null,
        consumido:consumos.get(i.codigo)||0, abaixo_minimo:saldo!==null && saldo<=minimo,
        quantidade_sugerida:saldo===null?0:Math.max(1,Math.ceil(Math.max(0,Number(i.alvo)-saldo)/embalagem)),
        pedido_estoque:pedidoEstoquePendente(fisico?.id),
        sugestao:sugestoes.get(i.codigo)||null };
    });
}

function atualizarSugestoes() {
  if (!disponivel()) return [];
  return db.transaction(() => {
    for (const item of listarItens()) {
      if (item.abaixo_minimo && !item.pedido_estoque && !item.sugestao) {
        db.prepare('INSERT OR IGNORE INTO pcm_lub_reposicao_sugestoes(codigo,quantidade_embalagens,saldo_ao_criar) VALUES(?,?,?)')
          .run(item.codigo,item.quantidade_sugerida,item.saldo);
      } else if (item.sugestao?.status === 'SUGERIDA' && (!item.abaixo_minimo || item.pedido_estoque)) {
        db.prepare("UPDATE pcm_lub_reposicao_sugestoes SET status='RESOLVIDA' WHERE id=?").run(item.sugestao.id);
      } else if (item.sugestao?.status === 'ENVIADA' && item.saldo_confiavel && !item.abaixo_minimo) {
        db.prepare("UPDATE pcm_lub_reposicao_sugestoes SET status='RESOLVIDA' WHERE id=?").run(item.sugestao.id);
      }
    }
    return listarItens();
  })();
}

function registrarConsumo(execucaoId, plano, quantidadeInformada, equipamentoNome, usuarioId) {
  if (!disponivel()) return null;
  const codigo = classificar(plano,equipamentoNome);
  if (!codigo) return null;
  const item = db.prepare('SELECT * FROM pcm_lub_reposicao_itens WHERE codigo=?').get(codigo);
  if (!estoqueVinculado(item)) return null; // Nunca baixar saldo físico sem SKU validado.
  if (quantidadeInformada === '' || quantidadeInformada == null) return null;
  const informado = Number(String(quantidadeInformada).replace(',','.'));
  if (!Number.isFinite(informado) || informado <= 0) return null;
  const unidade = normalizar(plano.unidade);
  let quantidade = 0;
  if (codigo.startsWith('GRAXA_')) {
    if (['G','GR','GRAMAS','GRAMA'].includes(unidade)) quantidade = informado / 1000;
    else if (['KG','QUILO','QUILOS'].includes(unidade)) quantidade = informado;
  } else if (codigo === 'OLEO_680') {
    const descricao = normalizar((plano.metodo_aplicacao || '')+' '+(plano.ponto_lubrificacao || ''));
    if (/TROCAR|TROCA|COMPLETAR|REPOR|ABASTECER/.test(descricao) && ['TAMBOR','TAMBORES'].includes(unidade)) quantidade = informado;
  }
  if (!(quantidade>0)) return null;
  if (db.prepare('SELECT 1 FROM pcm_lub_reposicao_consumos WHERE codigo=? AND execucao_id=?').get(codigo,Number(execucaoId))) return null;
  const saida = require('../estoque/estoque.service').registrarSaidaLubrificacao({
    item_id:item.estoque_item_id, quantidade, usuario_id:usuarioId,
    equipamento_id:plano.equipamento_id, execucao_id:execucaoId, codigo
  });
  const data = db.prepare("SELECT date('now','localtime') AS dia").get().dia;
  db.prepare('INSERT INTO pcm_lub_reposicao_consumos(codigo,execucao_id,equipamento_id,data_execucao,quantidade,origem,estoque_movimento_id) VALUES(?,?,?,?,?,?,?)')
    .run(codigo,Number(execucaoId),Number(plano.equipamento_id),data,quantidade,'QUANTIDADE_CONFIRMADA',saida.movimentoId);
  return {codigo,quantidade,movimentoId:saida.movimentoId};
}

function salvarConfiguracao(codigo, dados, usuario) {
  if (!disponivel()) throw new Error('Execute a migration de reposição.');
  const anterior = db.prepare('SELECT * FROM pcm_lub_reposicao_itens WHERE codigo=?').get(codigo);
  if (!anterior) throw new Error('Lubrificante desconhecido.');
  const minimo = numero(dados.minimo,'Estoque mínimo');
  const alvo = numero(dados.alvo,'Estoque-alvo');
  const embalagem = numero(dados.embalagem_quantidade,'Tamanho da embalagem',true);
  const consumo = numero(dados.consumo_padrao,'Consumo-padrão');
  if (alvo <= minimo) throw new Error('Estoque-alvo precisa ser maior que o mínimo.');
  const modo = dados.modo === 'AUTOMATICO' ? 'AUTOMATICO' : 'ASSISTIDO';
  const confirmado = dados.especificacao_confirmada === '1' ? 1 : 0;
  const uid = Number(usuario?.id);
  if (!uid) throw new Error('Gestor não identificado.');
  const estoqueItemId = dados.estoque_item_id ? Number(dados.estoque_item_id) : null;
  const fisico = estoqueItemId ? estoqueVinculado({estoque_item_id:estoqueItemId}) : null;
  if (estoqueItemId && !fisico) throw new Error('Item não encontrado no estoque oficial.');
  if (fisico) {
    if (normalizar(fisico.unidade)!==normalizar(anterior.unidade_saldo)) throw new Error('Unidade do estoque incompatível: valide KG ou TAMBOR antes de vincular.');
    if (!['RECICLAGEM','COMUM'].includes(normalizar(fisico.setor_utilizacao))) throw new Error('O item selecionado não pertence ao estoque da Reciclagem.');
    const local = normalizar(fisico.local_nome);
    if (!local) throw new Error('Defina o local físico no Almoxarifado antes de vincular o lubrificante.');
    if (codigo==='GRAXA_EP2' && !local.includes('OFICINA')) throw new Error('A graxa EP2 deve estar vinculada ao estoque localizado na Oficina.');
    if (codigo==='OLEO_680' && !/ALMOX|ARMAZEM/.test(local)) throw new Error('O óleo 680 deve estar vinculado ao estoque do Almoxarifado.');
  }
  if (modo==='AUTOMATICO' && (!confirmado || !fisico)) throw new Error('Confirme especificação, unidade, local e item físico antes de ativar a compra automática.');
  if (Number(anterior.estoque_item_id||0)!==Number(estoqueItemId||0) && db.prepare("SELECT 1 FROM pcm_lub_reposicao_sugestoes WHERE codigo=? AND status='ENVIADA'").get(codigo))
    throw new Error('Existe solicitação em andamento. Conclua ou cancele a compra antes de trocar o vínculo de estoque.');
  db.transaction(()=>{
    db.prepare("UPDATE pcm_lub_reposicao_itens SET minimo=?,alvo=?,embalagem_quantidade=?,consumo_padrao=?,modo=?,especificacao_confirmada=?,solicitante_user_id=?,estoque_item_id=?,atualizado_em=datetime('now') WHERE codigo=?")
      .run(minimo,alvo,embalagem,consumo,modo,confirmado,uid,estoqueItemId,codigo);
    if (fisico) db.prepare("UPDATE estoque_itens SET saldo_minimo=?,ponto_reposicao=?,saldo_alvo=?,updated_at=datetime('now') WHERE id=?")
      .run(minimo,minimo,alvo,estoqueItemId);
  })();
  atualizarSugestoes();
  if (modo === 'AUTOMATICO') enviarAutomaticas();
}

function ajustarSaldo() {
  throw new Error('O saldo só pode ser corrigido por inventário ou movimentação no Almoxarifado. Não há saldo paralelo no PCM.');
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
    if (!estoqueVinculado(item)) throw new Error('Vincule um item físico validado do Almoxarifado antes de solicitar.');
    if (pedidoEstoquePendente(item.estoque_item_id)) throw new Error('Já existe reposição em andamento para este item no Almoxarifado.');
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
        estoque_item_id:item.estoque_item_id,unidade:item.unidade_saldo,qtd_solicitada:qtd*Number(item.embalagem_quantidade)}]
    });
    // Identificação de origem na solicitação. Segue aprovação/compra existentes.
    const cols = db.prepare('PRAGMA table_info(solicitacoes)').all().map(c => c.name);
    if (cols.includes('tipo_origem')) db.prepare("UPDATE solicitacoes SET tipo_origem='LUBRIFICACAO' WHERE id=?").run(solId);
    solicitacoes.finalizarElaboracao(solId,uid);
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estoque_reposicao_vinculos'").get()) {
      db.prepare('INSERT OR IGNORE INTO estoque_reposicao_vinculos(estoque_item_id,solicitacao_id) VALUES(?,?)').run(item.estoque_item_id,solId);
    }
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

module.exports={disponivel,classificar,listarItens,listarOpcoesEstoque,registrarConsumo,atualizarSugestoes,
  salvarConfiguracao,ajustarSaldo,enviarSugestao,enviarAutomaticas,contarAlertas,getPainel};
