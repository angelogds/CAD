const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('cadastro real de materiais em setor operacional entra na pré-cotação e preserva propostas após liberação', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-prequote-create-'));
  try {
    execFileSync(process.execPath, ['-e', String.raw`
      (async()=>{
      const assert = require('node:assert/strict');
      require('./database/migrate');
      const db = require('./database/db');
      const demand = require('./modules/demandas/demandas.service');
      const pre = require('./modules/compras/compras-demandas.service');
      const compras = require('./modules/compras/compras.service');
      db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES('Responsável teste','teste@example.invalid','test','ENCARREGADO_MANUTENCAO')").run();
      const user = db.prepare('SELECT id,role FROM users ORDER BY id DESC LIMIT 1').get();
      const id = demand.create({titulo:'Reforma teste',setor_origem:'Caldeira',prioridade:'URGENTE'}, user);
      assert.equal(pre.countPreCotacoesDemandas(), 0);
      const sol = demand.createMaterialPlanning(id, {user,itens:[{item_nome:'Rolamento teste',unidade:'UN',qtd_solicitada:2}]});
      assert.equal(pre.countPreCotacoesDemandas(), 1);
      assert.equal(pre.listPreCotacoesDemandas(null)[0].id, sol);
      assert.equal(pre.listPreCotacoesDemandas(null)[0].itens_cotados, 0);
      assert.equal(db.prepare('SELECT demanda_id FROM solicitacoes WHERE id=?').get(sol).demanda_id,id);
      assert.ok(!compras.getOperationalQueue({tab:'active'}).rows.some(r=>r.id===sol));
      assert.throws(()=>pre.assertCompraLiberada(sol),e=>e.code==='DEMANDA_COMPRA_AGUARDANDO_LIBERACAO');
      // Registros históricos conservam o local operacional; o autor vinculado
      // comprova a origem corporativa sem gravar vínculos ou modificar registros.
      db.prepare("UPDATE solicitacoes SET setor_origem='Caldeira' WHERE id=?").run(sol);
      assert.equal(pre.countPreCotacoesDemandas(),1);
      assert.equal(pre.diagnosticarPreCotacoesDemandas().contagens.vinculadas_demanda_reciclagem,1);
      db.prepare("INSERT INTO fornecedores(nome) VALUES('Fornecedor teste')").run();
      const fornecedor=db.prepare('SELECT id FROM fornecedores ORDER BY id DESC LIMIT 1').get().id;
      compras.createCotacao(sol,{fornecedor_id:fornecedor,valor_total:240,observacao:'Proposta antecipada'});
      const item=db.prepare('SELECT id FROM solicitacao_itens WHERE solicitacao_id=?').get(sol).id;
      compras.salvarPainelItens(sol,{item_id:[item],fornecedor_id:[fornecedor],valor_unitario:['120,00'],cotado:[item],acao:'salvar'},user.id);
      assert.equal(pre.listPreCotacoesDemandas(null)[0].itens_cotados,1);
      assert.throws(()=>compras.salvarPainelItens(sol,{acao:'comprar',item_id:[item],comprar:[item]},user.id),e=>e.code==='DEMANDA_COMPRA_AGUARDANDO_LIBERACAO');
      assert.throws(()=>compras.salvarPainelItens(sol,{item_id:[item],atendido_estoque:[item]},user.id),e=>e.code==='DEMANDA_COMPRA_AGUARDANDO_LIBERACAO');
      assert.throws(()=>require('./modules/compras/compras.aprovacao-itens.service').approveQuotedItems(sol,[item],{id:user.id,role:'ADMIN'}),e=>e.code==='DEMANDA_COMPRA_AGUARDANDO_LIBERACAO');
      compras.salvarAnexo({solicitacaoId:sol,file:{filename:'teste.pdf',originalname:'teste.pdf',mimetype:'application/pdf',size:12},uploadedBy:user.id});
      const anexos=db.prepare("SELECT * FROM compras_anexos WHERE referencia_tipo='SOLICITACAO' AND referencia_id=?").all(sol);
      const before=db.prepare('SELECT * FROM compras_cotacoes WHERE solicitacao_id=?').all(sol);
      const items=db.prepare('SELECT * FROM solicitacao_itens WHERE solicitacao_id=?').all(sol);
      db.prepare("INSERT INTO os(equipamento,descricao,opened_by,demanda_id) VALUES('Equipamento teste','Serviço teste',?,?)").run(user.id,id);
      const order=db.prepare('SELECT id FROM os ORDER BY id DESC LIMIT 1').get().id;
      db.prepare('UPDATE solicitacoes SET demanda_id=NULL,os_id=? WHERE id=?').run(order,sol);
      assert.equal(pre.listPreCotacoesDemandas(null)[0].os_id,order);
      assert.equal(demand.getById(id).solicitacoes[0].id,sol);
      db.prepare('INSERT INTO os_solicitacoes_vinculos(os_id,solicitacao_id) VALUES(?,?)').run(order,sol);
      db.prepare('UPDATE solicitacoes SET os_id=NULL WHERE id=?').run(sol);
      assert.equal(pre.listPreCotacoesDemandas(null)[0].os_id,order);
      assert.equal(demand.getById(id).solicitacoes[0].id,sol);
      demand.updatePurchaseRelease(id,{liberacao_compras_status:'LIBERADA',user_id:user.id});
      assert.equal(pre.countPreCotacoesDemandas(),0);
      const row=compras.getOperationalQueue({tab:'active'}).rows.find(r=>r.id===sol);
      assert.ok(row);
      assert.equal(row.prioridade,'CRITICA');
      assert.deepEqual(db.prepare('SELECT * FROM compras_cotacoes WHERE solicitacao_id=?').all(sol),before);
      assert.deepEqual(db.prepare('SELECT * FROM solicitacao_itens WHERE solicitacao_id=?').all(sol),items);
      assert.deepEqual(db.prepare("SELECT * FROM compras_anexos WHERE referencia_tipo='SOLICITACAO' AND referencia_id=?").all(sol),anexos);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM solicitacoes').get().n,1);
      for(const setor of ['LOGISTICA','FRIGORIFICO','ADMINISTRATIVO']) {
        const other=demand.create({titulo:'Outro setor',setor_origem:setor},user);
        const request=demand.createMaterialPlanning(other,{user,itens:[{item_nome:'Material teste',qtd_solicitada:1}]});
        db.prepare("UPDATE solicitacoes SET setor_origem='RECICLAGEM' WHERE id=?").run(request);
        assert.equal(pre.countPreCotacoesDemandas(),0); // não misturar setores divergentes
      }
      demand.updatePurchaseRelease(id,{liberacao_compras_status:'PENDENTE',user_id:user.id});
      db.prepare("UPDATE demandas SET status='CONCLUIDA' WHERE id=?").run(id);
      assert.equal(pre.countPreCotacoesDemandas(),0);
      db.prepare("UPDATE demandas SET status='PLANEJAMENTO' WHERE id=?").run(id);
      db.prepare("UPDATE solicitacao_itens SET status_compra=' cancelado ' WHERE solicitacao_id=?").run(sol);
      assert.equal(pre.countPreCotacoesDemandas(),0);
      db.prepare("UPDATE solicitacao_itens SET status_compra='PENDENTE',status_cotacao='CANCELADO' WHERE solicitacao_id=?").run(sol);
      assert.equal(pre.listPreCotacoesDemandas(null)[0].itens_cotados,0);
      for(let i=0;i<11;i++) {
        const d=demand.create({titulo:'Demanda adicional '+i,setor_origem:'Manutenção'},user);
        demand.createMaterialPlanning(d,{user,itens:[{item_nome:'Material teste',qtd_solicitada:1}]});
      }
      const app=require('express')();
      app.use((req,res,next)=>{
        const role=req.get('X-Test-Role');
        req.session=role?{user:{id:user.id,role}}:{};
        req.flash=()=>{};
        next();
      });
      app.use('/compras',require('./modules/compras/compras.routes'));
      const server=app.listen(0,'127.0.0.1');
      await new Promise(resolve=>server.once('listening',resolve));
      try {
        const url='http://127.0.0.1:'+server.address().port+'/compras/demandas/pre-cotacoes.json';
        const get=(suffix='',role='COMPRAS')=>fetch(url+suffix,{headers:{Accept:'application/json',...(role?{'X-Test-Role':role}:{})},redirect:'manual'});
        const first=await (await get()).json();
        assert.equal(first.ok,true);
        assert.equal(first.total,12);
        assert.equal(first.rows.length,5);
        const all=await (await get('?todas=1')).json();
        assert.equal(all.rows.length,12);
        const diag=await (await get('?diagnostico=1')).json();
        assert.equal(diag.diagnostico.contagens.pre_cotacoes_visiveis_no_card,12);
        assert.equal((await get('','RH')).status,403);
        assert.equal((await get('',null)).status,302);
      } finally {await new Promise(resolve=>server.close(resolve));}
      db.close();
      })().catch(error=>{console.error(error);process.exitCode=1;});
    `], {cwd:path.resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'test',DATA_DIR:tmp,DB_PATH:path.join(tmp,'app.db')},stdio:'pipe'});
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});
