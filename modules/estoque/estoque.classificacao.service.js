const db=require('../../database/db');
const normal=(s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
function classificar(itemId) {
  const item=db.prepare('SELECT * FROM estoque_itens WHERE id=?').get(Number(itemId));if(!item) return;
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estoque_classificacao_regras'").get()) return;
  const name=` ${normal(item.nome)} `;
  const rules=db.prepare('SELECT r.* FROM estoque_classificacao_regras r JOIN estoque_categorias c ON c.id=r.categoria_id WHERE c.ativo=1').all().filter(r=>name.includes(` ${normal(r.termo)} `));
  const cats=new Set(rules.map(r=>r.categoria_id));
  if(!item.categoria_id&&cats.size!==1) {db.prepare('UPDATE estoque_itens SET classificacao_pendente=1 WHERE id=?').run(item.id);return;}
  const rule=rules.find(r=>Number(r.categoria_id)===Number(item.categoria_id||[...cats][0]));
  if(!rule) return;
  const fields=['categoria_id','endereco_zona','endereco_estante','endereco_prateleira','endereco_posicao'];
  const updates=fields.map(f=>`${f}=COALESCE(NULLIF(${f},''),?)`);
  db.prepare(`UPDATE estoque_itens SET ${updates.join(',')},classificacao_pendente=0 WHERE id=?`).run(...fields.map(f=>rule[f]||null),item.id);
}
function regras() {return db.prepare('SELECT r.*,c.nome categoria_nome FROM estoque_classificacao_regras r JOIN estoque_categorias c ON c.id=r.categoria_id ORDER BY c.nome,r.termo').all();}
function salvarRegra(id,data) {
  db.prepare('UPDATE estoque_classificacao_regras SET endereco_zona=?,endereco_estante=?,endereco_prateleira=?,endereco_posicao=? WHERE categoria_id=(SELECT categoria_id FROM estoque_classificacao_regras WHERE id=?)').run(...['endereco_zona','endereco_estante','endereco_prateleira','endereco_posicao'].map(f=>String(data[f]||'').trim().toUpperCase()||null),Number(id));
}
module.exports={classificar,regras,salvarRegra};
