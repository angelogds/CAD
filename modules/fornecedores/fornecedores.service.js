const db = require('../../database/db');

const normalize = (v) => String(v || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
const digits = (v) => String(v || '').replace(/\D/g, '');
const listValue = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => x.trim()).filter(Boolean);

function validCnpj(value) {
  const cnpj = digits(value); if (!cnpj) return true;
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const calc = (base) => { let size = base.length, sum = 0, pos = size - 7; for (let i=0;i<size;i++) { sum += Number(base[i]) * pos--; if (pos < 2) pos=9; } const r=sum%11; return r<2?0:11-r; };
  return calc(cnpj.slice(0,12))===Number(cnpj[12]) && calc(cnpj.slice(0,13))===Number(cnpj[13]);
}

function categoryRows() { return db.prepare('SELECT * FROM fornecedor_categorias ORDER BY nome').all(); }
function hydrate(rows) {
  if (!rows.length) return rows;
  const ids=rows.map(r=>r.id); const marks=ids.map(()=>'?').join(',');
  const cats=db.prepare(`SELECT v.fornecedor_id,c.nome FROM fornecedor_categoria_vinculos v JOIN fornecedor_categorias c ON c.id=v.categoria_id WHERE v.fornecedor_id IN (${marks}) ORDER BY c.nome`).all(...ids);
  const products=db.prepare(`SELECT v.fornecedor_id,p.nome,p.tipo FROM fornecedor_produto_vinculos v JOIN fornecedor_produtos_servicos p ON p.id=v.produto_servico_id WHERE v.fornecedor_id IN (${marks}) ORDER BY p.nome`).all(...ids);
  return rows.map(r=>({...r,categorias:cats.filter(x=>x.fornecedor_id===r.id).map(x=>x.nome),produtos_servicos:products.filter(x=>x.fornecedor_id===r.id)}));
}

function searchCondition(filters, params) {
  const where=[]; const q=normalize(filters.q);
  if(q){ params.q=`%${q}%`; params.cnpj=`%${digits(q)}%`; where.push(`(lower(COALESCE(f.nome_fantasia,f.nome)) LIKE @q OR lower(COALESCE(f.razao_social,'')) LIKE @q OR COALESCE(f.cnpj_normalizado,'') LIKE @cnpj OR lower(COALESCE(f.cidade,'')||' '||COALESCE(f.uf,'')||' '||COALESCE(f.responsavel_comercial,'')||' '||COALESCE(f.marcas,'')) LIKE @q OR EXISTS(SELECT 1 FROM fornecedor_categoria_vinculos v JOIN fornecedor_categorias c ON c.id=v.categoria_id WHERE v.fornecedor_id=f.id AND c.nome_normalizado LIKE @q) OR EXISTS(SELECT 1 FROM fornecedor_produto_vinculos v JOIN fornecedor_produtos_servicos p ON p.id=v.produto_servico_id WHERE v.fornecedor_id=f.id AND p.nome_normalizado LIKE @q) OR EXISTS(SELECT 1 FROM solicitacao_itens si WHERE si.fornecedor_id=f.id AND lower(COALESCE(si.item_nome,'')||' '||COALESCE(si.item_descricao,'')) LIKE @q))`); }
  if(filters.situacao) { where.push('f.situacao=@situacao'); params.situacao=filters.situacao; }
  if(filters.favorito==='1') where.push('f.favorito=1');
  if(filters.categoria){ where.push('EXISTS(SELECT 1 FROM fornecedor_categoria_vinculos v WHERE v.fornecedor_id=f.id AND v.categoria_id=@categoria)');params.categoria=Number(filters.categoria); }
  if(filters.local){ params.local=`%${normalize(filters.local)}%`; where.push("lower(COALESCE(f.cidade,'')||'/'||COALESCE(f.uf,'')) LIKE @local"); }
  if(filters.pendencia==='1') where.push("(COALESCE(f.responsavel_comercial,'')='' OR COALESCE(f.whatsapp,f.telefone,'')='' OR NOT EXISTS(SELECT 1 FROM fornecedor_categoria_vinculos v WHERE v.fornecedor_id=f.id) AND NOT EXISTS(SELECT 1 FROM fornecedor_produto_vinculos v WHERE v.fornecedor_id=f.id))");
  return where;
}

function list(filters={}) {
  const params={}; const where=searchCondition(filters,params);
  const rows=db.prepare(`SELECT f.*,
    COUNT(DISTINCT CASE WHEN si.status_cotacao='COTADO' THEN si.id END) total_cotacoes,
    COUNT(DISTINCT CASE WHEN si.status_compra='COMPRADO' THEN si.id END) total_compras,
    COALESCE(SUM(CASE WHEN si.status_compra='COMPRADO' THEN COALESCE(si.qtd_comprada,si.qtd_solicitada,0)*COALESCE(si.valor_unitario_centavos,0) END),0) valor_total_centavos,
    MAX(CASE WHEN si.status_compra='COMPRADO' THEN si.comprado_em END) ultima_compra_em,
    (SELECT x.item_nome FROM solicitacao_itens x WHERE x.fornecedor_id=f.id AND x.status_compra='COMPRADO' ORDER BY x.comprado_em DESC LIMIT 1) ultima_compra_item
    FROM fornecedores f LEFT JOIN solicitacao_itens si ON si.fornecedor_id=f.id ${where.length?'WHERE '+where.join(' AND '):''} GROUP BY f.id ORDER BY f.favorito DESC, COALESCE(f.nome_fantasia,f.nome)`).all(params);
  return hydrate(rows);
}

function dashboard(filters={}) {
  const fornecedores=list(filters);
  const metrics=db.prepare(`SELECT (SELECT COUNT(*) FROM fornecedores WHERE situacao='ATIVO') ativos,(SELECT COUNT(*) FROM fornecedor_categorias) categorias,(SELECT COUNT(DISTINCT fornecedor_id) FROM solicitacao_itens WHERE status_cotacao='COTADO' AND date(cotado_em)>=date('now','-30 days')) cotacoes,(SELECT COUNT(*) FROM solicitacao_itens WHERE status_compra='COMPRADO') compras`).get();
  const recent=db.prepare(`SELECT si.*,COALESCE(f.nome_fantasia,f.nome,si.fornecedor_nome) fornecedor_nome,s.numero solicitacao_numero,s.os_id,e.nome equipamento_nome FROM solicitacao_itens si JOIN solicitacoes s ON s.id=si.solicitacao_id LEFT JOIN fornecedores f ON f.id=si.fornecedor_id LEFT JOIN equipamentos e ON e.id=s.equipamento_id WHERE si.status_compra='COMPRADO' ORDER BY COALESCE(si.comprado_em,si.updated_at) DESC LIMIT 8`).all();
  const popular=db.prepare(`SELECT COALESCE(NULLIF(si.item_nome,''),'Não informado') nome,COUNT(*) total FROM solicitacao_itens si WHERE si.status_compra='COMPRADO' GROUP BY lower(COALESCE(si.item_nome,'')) ORDER BY total DESC LIMIT 6`).all();
  return {fornecedores,metrics,recent,popular,categories:categoryRows(),quick:categoryRows().slice(0,8)};
}

function getById(id) { const rows=list({}); return rows.find(x=>Number(x.id)===Number(id)); }
function history(id,q='') { const p={id:Number(id),q:`%${normalize(q)}%`}; return db.prepare(`SELECT si.*,s.numero solicitacao_numero,s.os_id,s.equipamento_id,e.nome equipamento_nome,COALESCE(f.nome_fantasia,f.nome,si.fornecedor_nome) fornecedor_nome FROM solicitacao_itens si JOIN solicitacoes s ON s.id=si.solicitacao_id LEFT JOIN equipamentos e ON e.id=s.equipamento_id LEFT JOIN fornecedores f ON f.id=si.fornecedor_id WHERE si.fornecedor_id=@id AND (@q='%%' OR lower(COALESCE(si.item_nome,'')||' '||COALESCE(si.item_descricao,'')) LIKE @q) AND (si.status_cotacao='COTADO' OR si.status_compra='COMPRADO') ORDER BY COALESCE(si.comprado_em,si.cotado_em) DESC`).all(p); }

function syncTags(id,data){
  db.prepare('DELETE FROM fornecedor_categoria_vinculos WHERE fornecedor_id=?').run(id); db.prepare('DELETE FROM fornecedor_produto_vinculos WHERE fornecedor_id=?').run(id);
  const addCat=db.prepare('INSERT OR IGNORE INTO fornecedor_categorias(nome,nome_normalizado) VALUES(?,?)'); const catId=db.prepare('SELECT id FROM fornecedor_categorias WHERE nome_normalizado=?'); const linkCat=db.prepare('INSERT OR IGNORE INTO fornecedor_categoria_vinculos VALUES(?,?)');
  listValue(data.categorias).forEach(name=>{const n=normalize(name).replace(/s$/,'');addCat.run(name.trim(),n);linkCat.run(id,catId.get(n).id);});
  const addP=db.prepare('INSERT OR IGNORE INTO fornecedor_produtos_servicos(nome,nome_normalizado,tipo) VALUES(?,?,?)'); const pId=db.prepare('SELECT id FROM fornecedor_produtos_servicos WHERE nome_normalizado=? AND tipo=?');const linkP=db.prepare('INSERT OR IGNORE INTO fornecedor_produto_vinculos VALUES(?,?)');
  for(const [field,type] of [['produtos_servicos','PRODUTO'],['servicos','SERVICO']]) listValue(data[field]).forEach(name=>{const n=normalize(name);addP.run(name,n,type);linkP.run(id,pId.get(n,type).id);});
}
function payload(data){const cnpj=digits(data.cnpj);return {nome:String(data.nome_fantasia||data.nome||'').trim(),nome_fantasia:String(data.nome_fantasia||data.nome||'').trim(),razao_social:String(data.razao_social||'').trim()||null,cnpj:cnpj||null,cnpj_normalizado:cnpj||null,responsavel_comercial:String(data.responsavel_comercial||'').trim()||null,whatsapp:String(data.whatsapp||'').trim()||null,telefone:String(data.telefone||'').trim()||null,email:String(data.email||'').trim()||null,cidade:String(data.cidade||'').trim()||null,uf:String(data.uf||'').toUpperCase()||null,endereco:String(data.endereco||'').trim()||null,situacao:data.situacao==='INATIVO'?'INATIVO':'ATIVO',ativo:data.situacao==='INATIVO'?0:1,favorito:data.favorito?1:0,lead_time_medio_dias:Number(data.prazo_medio_entrega)||0,condicao_pagamento:data.condicao_pagamento||null,pedido_minimo_centavos:Math.round(Number(String(data.pedido_minimo||'0').replace(',','.'))*100)||null,frete:data.frete||null,validade_proposta_dias:Number(data.validade_proposta_dias)||null,garantia:data.garantia||null,regiao_atendida:data.regiao_atendida||null,marcas:data.marcas||null,especialidade:data.especialidade||null,observacoes_comerciais:data.observacoes_comerciais||null,observacoes:data.observacoes||null};}
function validate(data,id){const p=payload(data);if(!p.nome)throw new Error('Nome fantasia é obrigatório.');if(!p.responsavel_comercial)throw new Error('Responsável comercial é obrigatório.');if(!p.whatsapp&&!p.telefone)throw new Error('Informe WhatsApp ou telefone.');if(!listValue(data.categorias).length&&!listValue(data.produtos_servicos).length&&!listValue(data.servicos).length)throw new Error('Informe ao menos uma categoria, produto ou serviço.');if(p.cnpj&&!validCnpj(p.cnpj))throw new Error('CNPJ inválido.');if(p.cnpj&&db.prepare("SELECT id FROM fornecedores WHERE cnpj_normalizado=? AND situacao='ATIVO' AND id<>?").get(p.cnpj,Number(id)||0))throw new Error('Já existe fornecedor ativo com este CNPJ.');return p;}
function save(id,data){const p=validate(data,id);const tx=db.transaction(()=>{if(id){db.prepare(`UPDATE fornecedores SET nome=@nome,nome_fantasia=@nome_fantasia,razao_social=@razao_social,cnpj=@cnpj,cnpj_normalizado=@cnpj_normalizado,responsavel_comercial=@responsavel_comercial,whatsapp=@whatsapp,telefone=@telefone,email=@email,cidade=@cidade,uf=@uf,endereco=@endereco,situacao=@situacao,ativo=@ativo,favorito=@favorito,lead_time_medio_dias=@lead_time_medio_dias,condicao_pagamento=@condicao_pagamento,pedido_minimo_centavos=@pedido_minimo_centavos,frete=@frete,validade_proposta_dias=@validade_proposta_dias,garantia=@garantia,regiao_atendida=@regiao_atendida,marcas=@marcas,especialidade=@especialidade,observacoes_comerciais=@observacoes_comerciais,observacoes=@observacoes,updated_at=datetime('now') WHERE id=@id`).run({...p,id});}else{id=Number(db.prepare(`INSERT INTO fornecedores(nome,nome_fantasia,razao_social,cnpj,cnpj_normalizado,responsavel_comercial,whatsapp,telefone,email,cidade,uf,endereco,situacao,ativo,favorito,lead_time_medio_dias,condicao_pagamento,pedido_minimo_centavos,frete,validade_proposta_dias,garantia,regiao_atendida,marcas,especialidade,observacoes_comerciais,observacoes) VALUES(@nome,@nome_fantasia,@razao_social,@cnpj,@cnpj_normalizado,@responsavel_comercial,@whatsapp,@telefone,@email,@cidade,@uf,@endereco,@situacao,@ativo,@favorito,@lead_time_medio_dias,@condicao_pagamento,@pedido_minimo_centavos,@frete,@validade_proposta_dias,@garantia,@regiao_atendida,@marcas,@especialidade,@observacoes_comerciais,@observacoes)`).run(p).lastInsertRowid);}syncTags(id,data);return id;});return tx();}
function toggle(id,field){if(!['favorito','situacao'].includes(field))return; if(field==='favorito')db.prepare('UPDATE fornecedores SET favorito=1-favorito,updated_at=datetime(\'now\') WHERE id=?').run(id);else db.prepare("UPDATE fornecedores SET situacao=CASE situacao WHEN 'ATIVO' THEN 'INATIVO' ELSE 'ATIVO' END,ativo=CASE ativo WHEN 1 THEN 0 ELSE 1 END,updated_at=datetime('now') WHERE id=?").run(id);}
module.exports={normalize,validCnpj,list,dashboard,getById,history,categoryRows,save,toggle};
