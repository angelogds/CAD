module.exports = function up({ db }) {
  db.exec([
    "CREATE TABLE IF NOT EXISTS pcm_lub_reposicao_itens (codigo TEXT PRIMARY KEY,nome TEXT NOT NULL,unidade_saldo TEXT NOT NULL,saldo_referencia REAL NOT NULL DEFAULT 0,minimo REAL NOT NULL DEFAULT 0,alvo REAL NOT NULL DEFAULT 0,embalagem_quantidade REAL NOT NULL CHECK(embalagem_quantidade>0),embalagem_descricao TEXT NOT NULL,consumo_padrao REAL NOT NULL DEFAULT 0,modo TEXT NOT NULL DEFAULT 'ASSISTIDO' CHECK(modo IN ('ASSISTIDO','AUTOMATICO')),especificacao_confirmada INTEGER NOT NULL DEFAULT 0,solicitante_user_id INTEGER REFERENCES users(id),atualizado_em TEXT DEFAULT (datetime('now')));",
    "CREATE TABLE IF NOT EXISTS pcm_lub_reposicao_consumos (id INTEGER PRIMARY KEY,codigo TEXT NOT NULL REFERENCES pcm_lub_reposicao_itens(codigo),execucao_id INTEGER NOT NULL REFERENCES pcm_lubrificacao_execucoes(id),equipamento_id INTEGER NOT NULL,data_execucao TEXT NOT NULL,quantidade REAL NOT NULL CHECK(quantidade>0),origem TEXT NOT NULL,criado_em TEXT NOT NULL DEFAULT (datetime('now')),UNIQUE(codigo,execucao_id));",
    "CREATE UNIQUE INDEX IF NOT EXISTS uidx_lub_consumo_ep2_equip_dia ON pcm_lub_reposicao_consumos(codigo,equipamento_id,data_execucao) WHERE codigo='GRAXA_EP2' AND origem='PADRAO_150G';",
    "CREATE TABLE IF NOT EXISTS pcm_lub_reposicao_ajustes (id INTEGER PRIMARY KEY,codigo TEXT NOT NULL REFERENCES pcm_lub_reposicao_itens(codigo),diferenca REAL NOT NULL,saldo_informado REAL NOT NULL,motivo TEXT,usuario_id INTEGER NOT NULL REFERENCES users(id),criado_em TEXT NOT NULL DEFAULT (datetime('now')));",
    "CREATE TABLE IF NOT EXISTS pcm_lub_reposicao_sugestoes (id INTEGER PRIMARY KEY,codigo TEXT NOT NULL REFERENCES pcm_lub_reposicao_itens(codigo),quantidade_embalagens INTEGER NOT NULL CHECK(quantidade_embalagens>0),saldo_ao_criar REAL NOT NULL,status TEXT NOT NULL DEFAULT 'SUGERIDA' CHECK(status IN ('SUGERIDA','ENVIADA','RESOLVIDA')),solicitacao_id INTEGER REFERENCES solicitacoes(id),usuario_envio_id INTEGER REFERENCES users(id),criada_em TEXT NOT NULL DEFAULT (datetime('now')),enviada_em TEXT);",
    "CREATE UNIQUE INDEX IF NOT EXISTS uidx_lub_reposicao_aberta ON pcm_lub_reposicao_sugestoes(codigo) WHERE status IN ('SUGERIDA','ENVIADA');"
  ].join('\n'));
  const ins = db.prepare('INSERT OR IGNORE INTO pcm_lub_reposicao_itens (codigo,nome,unidade_saldo,saldo_referencia,minimo,alvo,embalagem_quantidade,embalagem_descricao,consumo_padrao,especificacao_confirmada) VALUES(?,?,?,?,?,?,?,?,?,?)');
  db.transaction(() => {
    ins.run('OLEO_680','Óleo industrial ISO VG 680','TAMBOR',4,2,4,1,'Tambor de óleo 680 - volume a confirmar',0,1);
    ins.run('GRAXA_EP2','Graxa EP2 para alta temperatura','KG',20,5,20,20,'Tambor de 20 kg',0.15,1);
    ins.run('GRAXA_DECANTER_JULIANO','Graxa especial do Decanter Juliano','KG',0,0.25,1,1,'Embalagem de 1 kg',0,0);
    ins.run('GRAXA_DECANTER_GRATT','Graxa especial do Decanter GRATT','KG',0,0.25,1,1,'Embalagem de 1 kg',0,0);
  })();
};
