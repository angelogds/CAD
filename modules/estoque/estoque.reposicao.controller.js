const service=require('./estoque.reposicao.service');
const classificacao=require('./estoque.classificacao.service');
const estoque=require('./estoque.service');
function salvar(req,res){try{service.salvar(req.params.id,{...req.body,rateio_setores_json:Object.fromEntries(['RECICLAGEM','FRIGORIFICO','LOGISTICA','ADMINISTRATIVO'].map(s=>[s,req.body['rateio_'+s]||0]))});req.flash('success','Política de reposição salva.');}catch(e){req.flash('error',e.message);}res.redirect(`/estoque/itens/${req.params.id}`);}
function gerar(req,res){try{const ids=service.gerar(req.session.user);req.flash('success',`${ids.length} pré-solicitação(ões) preparada(s). Revise e encaminhe pela fila do Almoxarifado.`);}catch(e){req.flash('error',e.message);}res.redirect('/pre-solicitacoes');}
function regras(req,res){res.render('estoque/classificacao',{title:'Classificação automática',activeMenu:'estoque',regras:classificacao.regras(),categorias:estoque.listCategorias()});}
function salvarRegra(req,res){try{classificacao.salvarRegra(req.params.id,req.body);req.flash('success','Endereço da família atualizado para novos cadastros e recebimentos.');}catch(e){req.flash('error',e.message);}res.redirect('/estoque/classificacao');}
module.exports={salvar,gerar,regras,salvarRegra};
