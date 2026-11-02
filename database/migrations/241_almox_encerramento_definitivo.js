module.exports = ({db,tableExists}) => {
  if (!tableExists('solicitacoes') || !tableExists('solicitacao_itens')) return;
  db.transaction(() => {
    const terminal = "('FECHADA','FECHADO','ENTREGUE_SOLICITANTE')";
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_solicitacao_encerrada_definitiva
      BEFORE UPDATE OF status ON solicitacoes
      WHEN UPPER(TRIM(OLD.status)) IN ${terminal} AND UPPER(TRIM(NEW.status)) NOT IN ${terminal}
      BEGIN SELECT RAISE(ABORT,'Solicitação encerrada não pode ser reaberta.'); END;
      CREATE TRIGGER IF NOT EXISTS trg_item_novo_solicitacao_encerrada
      BEFORE INSERT ON solicitacao_itens
      WHEN EXISTS(SELECT 1 FROM solicitacoes s WHERE s.id=NEW.solicitacao_id AND UPPER(TRIM(s.status)) IN ${terminal})
      BEGIN SELECT RAISE(ABORT,'Solicitação encerrada não aceita novos itens.'); END;`);
    const columns=new Set(db.prepare('PRAGMA table_info(solicitacao_itens)').all().map(c=>c.name));
    const physical=['qtd_solicitada','qtd_comprada','qtd_recebida_total','estoque_item_id','status_compra'].filter(c=>columns.has(c));
    if(physical.length)db.exec(`CREATE TRIGGER IF NOT EXISTS trg_item_encerrado_preservar_quantidades
      BEFORE UPDATE OF ${physical.join(',')} ON solicitacao_itens
      WHEN EXISTS(SELECT 1 FROM solicitacoes s WHERE s.id=OLD.solicitacao_id AND UPPER(TRIM(s.status)) IN ${terminal})
        AND (${physical.map(c=>`NEW.${c} IS NOT OLD.${c}`).join(' OR ')})
      BEGIN SELECT RAISE(ABORT,'Material de solicitação encerrada não pode ser alterado.'); END;`);
    if (!tableExists('estoque_reservas')) return;
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_reserva_nao_recriar_encerrada
      BEFORE INSERT ON estoque_reservas
      WHEN NOT EXISTS(SELECT 1 FROM estoque_reservas r WHERE r.solicitacao_item_id=NEW.solicitacao_item_id) AND EXISTS(SELECT 1 FROM solicitacoes s WHERE s.id=NEW.solicitacao_id AND UPPER(TRIM(s.status)) IN ${terminal})
      BEGIN SELECT RAISE(ABORT,'Solicitação encerrada não aceita novas reservas.'); END;
      CREATE TRIGGER IF NOT EXISTS trg_reserva_nao_reabrir_encerrada
      BEFORE UPDATE ON estoque_reservas
      WHEN EXISTS(SELECT 1 FROM solicitacoes s WHERE s.id=OLD.solicitacao_id AND UPPER(TRIM(s.status)) IN ${terminal})
        AND (NEW.quantidade_reservada>OLD.quantidade_reservada OR NEW.quantidade_retirada<OLD.quantidade_retirada
          OR (OLD.status='RETIRADA' AND NEW.status IN ('RESERVADA','PARCIAL')))
      BEGIN SELECT RAISE(ABORT,'Reserva de solicitação encerrada não pode ser reaberta.'); END;`);
    if (!tableExists('estoque_itens')) return;
    const reservado=`COALESCE((SELECT SUM(MAX(r.quantidade_reservada-r.quantidade_retirada,0)) FROM estoque_reservas r
      WHERE r.estoque_item_id=NEW.id AND r.status<>'CANCELADA'
        AND NOT EXISTS(SELECT 1 FROM solicitacoes s WHERE s.id=r.solicitacao_id AND UPPER(TRIM(s.status)) IN ('CANCELADA','CANCELADO','FECHADA','FECHADO','ENTREGUE_SOLICITANTE'))),0)`;
    const correias=tableExists('correias_pedidos')?"COALESCE((SELECT SUM(quantidade) FROM correias_pedidos WHERE estoque_item_id=NEW.id AND status IN ('SOLICITADA','SEPARADA')),0)":'0';
    db.exec(`DROP TRIGGER IF EXISTS trg_estoque_proteger_saldo_reservado;
      CREATE TRIGGER trg_estoque_proteger_saldo_reservado BEFORE UPDATE OF saldo_atual ON estoque_itens
      WHEN NEW.saldo_atual<${reservado} BEGIN SELECT RAISE(ABORT,'Saldo reservado para solicitações não pode ser consumido por retirada avulsa.'); END;
      DROP TRIGGER IF EXISTS trg_estoque_proteger_reserva_correias;
      CREATE TRIGGER trg_estoque_proteger_reserva_correias BEFORE UPDATE OF saldo_atual ON estoque_itens
      WHEN NEW.saldo_atual<${reservado}+${correias} BEGIN SELECT RAISE(ABORT,'Saldo reservado para solicitações e correias não pode ser consumido.'); END;`);
  })();
};
