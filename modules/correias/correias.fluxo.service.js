const db = require('../../database/db');
const { normalizeRole } = require('../../config/rbac');
const exists = (table) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
const setores = ['RECICLAGEM', 'LOGISTICA', 'FRIGORIFICO', 'ADMINISTRATIVO'];
function quantidade(v) { const n = Number(String(v ?? '').replace(',', '.')); if (!Number.isFinite(n) || n <= 0) throw new Error('Informe uma quantidade maior que zero.'); return n; }
function almox(user) { if (!['ADMIN', 'ALMOXARIFADO'].includes(normalizeRole(user?.role))) throw new Error('Esta ação é do Almoxarifado.'); }
function vinculos(equipamentoId) {
  if (!exists('correias_pedidos')) return [];
  return db.prepare(`SELECT p.id plano_id,p.equipamento_id,p.estoque_item_id,p.quantidade_material,i.nome,i.codigo,i.unidade FROM preventiva_planos p JOIN estoque_itens i ON i.id=p.estoque_item_id WHERE p.equipamento_id=? AND p.tipo_plano='TROCA_CORREIA' AND p.ativo=1 AND i.ativo=1 ORDER BY i.nome`).all(Number(equipamentoId));
}
function list(equipamentoId = null) {
  if (!exists('correias_pedidos')) return [];
  return db.prepare(`SELECT p.*,e.nome equipamento_nome,e.codigo equipamento_codigo,i.nome material_nome,i.codigo material_codigo,u.name mecanico_nome FROM correias_pedidos p JOIN equipamentos e ON e.id=p.equipamento_id JOIN estoque_itens i ON i.id=p.estoque_item_id JOIN users u ON u.id=p.mecanico_user_id ${equipamentoId ? 'WHERE p.equipamento_id=?' : ''} ORDER BY p.id DESC LIMIT 200`).all(...(equipamentoId ? [Number(equipamentoId)] : []));
}
function get(id) { const p = db.prepare("SELECT *,date(created_at,'-3 hours') solicitada_em FROM correias_pedidos WHERE id=?").get(Number(id)); if (!p) throw new Error('Pedido de correias não encontrado.'); return p; }
function solicitar(data, user) {
  return db.transaction(() => {
    const execId = data.preventiva_execucao_id ? Number(data.preventiva_execucao_id) : null;
    let equipamentoId = Number(data.equipamento_id), mecanicoId = Number(data.mecanico_user_id);
    if (execId) {
      const prev = require('../preventivas/preventivas.service');
      if (!prev.userCanExecutePreventiva(execId, user)) throw new Error('Preventiva atribuída a outro responsável.');
      const exec = db.prepare('SELECT x.status,p.equipamento_id FROM preventiva_execucoes x JOIN preventiva_planos p ON p.id=x.plano_id WHERE x.id=?').get(execId);
      if (!exec || ['CONCLUIDA','EXECUTADA','FINALIZADA','CANCELADA'].includes(exec.status)) throw new Error('A preventiva precisa estar aberta.');
      equipamentoId = Number(exec.equipamento_id); mecanicoId = normalizeRole(user.role)==='MECANICO' ? Number(user.id) : Number(data.mecanico_user_id);
    } else almox(user);
    const vinculo = vinculos(equipamentoId).find(v => Number(v.estoque_item_id) === Number(data.estoque_item_id));
    if (!vinculo) throw new Error('Selecione uma correia cadastrada para este equipamento.');
    if (!db.prepare("SELECT id FROM users WHERE id=? AND ativo=1 AND UPPER(role)='MECANICO'").get(mecanicoId)) throw new Error('Selecione o mecânico responsável.');
    if (execId && !require('../preventivas/preventivas.service').userCanExecutePreventiva(execId, {id:mecanicoId,role:'MECANICO'})) throw new Error('Selecione um mecânico atribuído à preventiva.');
    const qtd = quantidade(data.quantidade || vinculo.quantidade_material);
    if (!Number.isInteger(qtd)) throw new Error('A quantidade de correias deve ser inteira.');
    if (data.operacao_token) { const atual=db.prepare('SELECT id FROM correias_pedidos WHERE operacao_token=?').get(String(data.operacao_token)); if(atual) return atual.id; }
    if (!setores.includes(data.setor_consumidor) || !String(data.empresa_consumidora || '').trim()) throw new Error('Informe a empresa e o setor consumidor.');
    // Reenvio da mesma inspeção mantém a reserva existente.
    if (execId) { const atual = db.prepare('SELECT id FROM correias_pedidos WHERE preventiva_execucao_id=? AND estoque_item_id=?').get(execId,vinculo.estoque_item_id); if (atual) return atual.id; }
    const saldo = Number(db.prepare('SELECT saldo_atual FROM estoque_itens WHERE id=?').get(vinculo.estoque_item_id).saldo_atual);
    const reservado = Number(require('../estoque/estoque.reservas.service').resumoPorItem().get(vinculo.estoque_item_id) || 0);
    if (saldo - reservado < qtd) throw new Error('Saldo livre insuficiente. Providencie a reposição antes de reservar.');
    return Number(db.prepare(`INSERT INTO correias_pedidos(operacao_token,equipamento_id,estoque_item_id,preventiva_execucao_id,mecanico_user_id,quantidade,observacao,empresa_consumidora,setor_consumidor) VALUES(?,?,?,?,?,?,?,?,?)`).run(data.operacao_token||null,equipamentoId,vinculo.estoque_item_id,execId,mecanicoId,qtd,String(data.observacao || '').trim(),String(data.empresa_consumidora).trim(),data.setor_consumidor).lastInsertRowid);
  })();
}
function movimento(p, user, tipo, qtd) {
  const item = db.prepare('SELECT saldo_atual,custo_unit FROM estoque_itens WHERE id=?').get(p.estoque_item_id);
  const anterior = Number(item.saldo_atual), posterior = anterior + (tipo.startsWith('ENTRADA') ? qtd : -qtd);
  if (posterior < 0) throw new Error('Saldo insuficiente.');
  db.prepare("UPDATE estoque_itens SET saldo_atual=?,updated_at=datetime('now') WHERE id=?").run(posterior,p.estoque_item_id);
  return Number(db.prepare(`INSERT INTO estoque_movimentos(tipo,item_id,quantidade,origem,equipamento_id,usuario_id,mecanico_user_id,empresa_consumidora,setor_utilizacao,saldo_anterior,saldo_posterior,custo_unit,observacao) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(tipo,p.estoque_item_id,qtd,p.preventiva_execucao_id?'PREVENTIVA':'MANUAL',p.equipamento_id,user.id,p.mecanico_user_id,p.empresa_consumidora,p.setor_consumidor,anterior,posterior,item.custo_unit || null,`Pedido de correias #${p.id}; execução ${p.preventiva_execucao_id || 'avulsa'}`).lastInsertRowid);
}
function entregar(id, user) {
  almox(user);
  return db.transaction(() => {
    const p = get(id); if (p.movimento_id) return p.movimento_id;
    if (!['SOLICITADA','SEPARADA'].includes(p.status)) throw new Error('Pedido não disponível para retirada.');
    // Libera apenas a própria reserva dentro da mesma transação da baixa.
    db.prepare("UPDATE correias_pedidos SET status='RETIRADA',updated_at=datetime('now') WHERE id=?").run(p.id);
    const mov = movimento(p,user,'SAIDA_REQUISICAO_INTERNA',p.quantidade);
    db.prepare('UPDATE correias_pedidos SET movimento_id=? WHERE id=?').run(mov,p.id);
    return mov;
  })();
}
function separar(id,user) { almox(user); const p=get(id); if(p.status==='SOLICITADA') db.prepare("UPDATE correias_pedidos SET status='SEPARADA',updated_at=datetime('now') WHERE id=?").run(p.id); }
function cancelar(id,user) { almox(user); const p=get(id); if(!['SOLICITADA','SEPARADA'].includes(p.status)) throw new Error('Pedido já retirado: registre devolução.'); db.prepare("UPDATE correias_pedidos SET status='CANCELADA',updated_at=datetime('now') WHERE id=?").run(p.id); }
function devolver(id,qtd,user) {
  almox(user);
  return db.transaction(() => { const p=get(id); const n=quantidade(qtd); if(p.status!=='RETIRADA'||n>p.quantidade-p.quantidade_devolvida) throw new Error('Quantidade acima do saldo retirado ainda não utilizado.'); movimento(p,user,'ENTRADA_DEVOLUCAO',n); db.prepare("UPDATE correias_pedidos SET quantidade_devolvida=quantidade_devolvida+?,status=CASE WHEN quantidade_devolvida+?>=quantidade THEN 'DEVOLVIDA' ELSE status END,updated_at=datetime('now') WHERE id=?").run(n,n,p.id); })();
}
function confirmarTroca(id,date,user) {
  return db.transaction(() => {
    const p=get(id); if(p.troca_em) return;
    if(p.mecanico_user_id!==Number(user.id)&&!['ADMIN','MANUTENCAO_SUPERVISOR'].includes(normalizeRole(user?.role))) throw new Error('A troca deve ser confirmada pelo mecânico responsável.');
    if(p.status!=='RETIRADA'||p.quantidade<=p.quantidade_devolvida) throw new Error('Retire as correias antes de confirmar a troca.');
    const raw=String(date||''); const parsed=new Date(`${raw}T00:00:00Z`);
    const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bahia'});
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==raw||raw>hoje||raw<p.solicitada_em) throw new Error('Informe uma data real da troca, entre a solicitação e hoje.');
    const anterior=db.prepare('SELECT * FROM correias_pedidos WHERE equipamento_id=? AND estoque_item_id=? AND troca_em IS NOT NULL AND troca_em<=? AND id<>? ORDER BY troca_em DESC,id DESC LIMIT 1').get(p.equipamento_id,p.estoque_item_id,raw,p.id);
    db.prepare("UPDATE correias_pedidos SET troca_em=?,status='TROCADA',updated_at=datetime('now') WHERE id=?").run(raw,p.id);
    const config=db.prepare('SELECT prazo_falha_dias FROM correias_config_equipamento WHERE equipamento_id=?').get(p.equipamento_id);
    if(anterior&&config?.prazo_falha_dias>0) { const intervalo=(parsed-new Date(`${anterior.troca_em}T00:00:00Z`))/86400000; if(intervalo<config.prazo_falha_dias) db.prepare('INSERT OR IGNORE INTO correias_alertas(pedido_id,pedido_anterior_id,equipamento_id,intervalo_dias,prazo_falha_dias) VALUES(?,?,?,?,?)').run(p.id,anterior.id,p.equipamento_id,intervalo,config.prazo_falha_dias); }
  })();
}
function alertas(equipamentoId=null) { if(!exists('correias_alertas')) return []; return db.prepare(`SELECT a.*,e.nome equipamento_nome,i.nome material_nome,p.troca_em,u.name mecanico_nome FROM correias_alertas a JOIN correias_pedidos p ON p.id=a.pedido_id JOIN equipamentos e ON e.id=a.equipamento_id JOIN estoque_itens i ON i.id=p.estoque_item_id JOIN users u ON u.id=p.mecanico_user_id ${equipamentoId?'WHERE a.equipamento_id=?':''} ORDER BY a.id DESC LIMIT 100`).all(...(equipamentoId?[Number(equipamentoId)]:[])); }
function salvarPrazo(equipamentoId,prazo) { const n=quantidade(prazo); if(!db.prepare('SELECT id FROM equipamentos WHERE id=?').get(Number(equipamentoId))) throw new Error('Equipamento não encontrado.'); db.prepare('INSERT INTO correias_config_equipamento(equipamento_id,prazo_falha_dias) VALUES(?,?) ON CONFLICT(equipamento_id) DO UPDATE SET prazo_falha_dias=excluded.prazo_falha_dias').run(Number(equipamentoId),n); }
module.exports={vinculos,list,solicitar,entregar,separar,cancelar,devolver,confirmarTroca,alertas,salvarPrazo};
