const service = require('./fornecedores.service');

const safeContext = (req) => {
  const solicitacaoId=Number(req.query.solicitacao_id||req.body.solicitacao_id)||null;
  const itemId=Number(req.query.item_id||req.body.item_id)||null;
  if(!solicitacaoId) return null;
  return {solicitacaoId,itemId,returnTo:`/compras/solicitacoes/${solicitacaoId}`,
    numero:req.query.numero||req.body.contexto_numero||'',equipamento:req.query.equipamento||req.body.contexto_equipamento||'',item:req.query.item||req.body.contexto_item||''};
};
function filters(req){return {q:String(req.query.q||'').trim(),categoria:req.query.categoria||'',local:req.query.local||'',situacao:req.query.situacao||'',favorito:req.query.favorito||'',pendencia:req.query.pendencia||''};}
function list(req,res){const f=filters(req);return res.render('fornecedores/index',{title:'Fornecedores',activeMenu:'fornecedores',...service.dashboard(f),filters:f,selectionContext:safeContext(req)});}
function form(req,res,fornecedor=null){return res.render('fornecedores/form',{title:fornecedor?'Editar fornecedor':'Novo fornecedor',activeMenu:'fornecedores',fornecedor,categories:service.categoryRows(),context:safeContext(req),formAction:fornecedor?`/fornecedores/${fornecedor.id}`:'/fornecedores'});}
function newForm(req,res){return form(req,res);}
function create(req,res){try{const id=service.save(null,req.body);req.flash('success','Fornecedor cadastrado com sucesso.');const ctx=safeContext(req);if(req.body.acao==='salvar_selecionar'&&ctx){req.session.pendingSupplierSelection={solicitacaoId:ctx.solicitacaoId,itemId:ctx.itemId,fornecedorId:id};return res.redirect(`${ctx.returnTo}?fornecedor_selecionado=${id}${ctx.itemId?`&item_id=${ctx.itemId}`:''}`);}return res.redirect(`/fornecedores/${id}`);}catch(error){req.flash('error',error.message||'Não foi possível cadastrar o fornecedor.');return res.redirect('/fornecedores/novo');}}
function profile(req,res){const fornecedor=service.getById(req.params.id);if(!fornecedor)return res.status(404).send('Fornecedor não encontrado');const q=String(req.query.q||'').trim();const historico=service.history(req.params.id,q);return res.render('fornecedores/profile',{title:fornecedor.nome_fantasia,activeMenu:'fornecedores',fornecedor,historico,q});}
function editForm(req,res){const fornecedor=service.getById(req.params.id);if(!fornecedor)return res.status(404).send('Fornecedor não encontrado');return form(req,res,fornecedor);}
function update(req,res){try{service.save(Number(req.params.id),req.body);req.flash('success','Fornecedor atualizado com sucesso.');return res.redirect(`/fornecedores/${req.params.id}`);}catch(error){req.flash('error',error.message);return res.redirect(`/fornecedores/${req.params.id}/editar`);}}
function toggle(req,res){try{service.toggle(Number(req.params.id),req.params.action);req.flash('success','Fornecedor atualizado.');}catch(e){req.flash('error',e.message);}return res.redirect(req.get('referer')?.startsWith(`${req.protocol}://${req.get('host')}/fornecedores`)?req.get('referer'):`/fornecedores/${req.params.id}`);}
function api(req,res){return res.json(service.list({...filters(req),situacao:'ATIVO'}).map(f=>({id:f.id,nome:f.nome_fantasia||f.nome,cnpj:f.cnpj,cidade:f.cidade,uf:f.uf,categorias:f.categorias,produtos:f.produtos_servicos,prazoMedio:f.lead_time_medio_dias,compras:f.total_compras,ultimaCompra:f.ultima_compra_em})));}
module.exports={list,newForm,create,profile,editForm,update,toggle,api};
