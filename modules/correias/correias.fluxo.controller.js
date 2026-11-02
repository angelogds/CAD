const service = require('./correias.fluxo.service');
function index(req,res) {
  res.render('almoxarifado/correias',{title:'Correias por equipamento',activeMenu:'almoxarifado',pedidos:service.list()});
}
function avulsa(req,res) {
  const params=new URLSearchParams({modo:'ESTOQUE',familia:'CORREIAS'});
  if(req.body.equipamento_id)params.set('equipamento_id',String(req.body.equipamento_id));
  if(req.body.estoque_item_id)params.set('item',String(req.body.estoque_item_id));
  return res.redirect('/almoxarifado/retiradas/qr?'+params);
}
function acao(req,res) {if(req.body.acao==='entregar')return res.redirect('/almoxarifado/retiradas/qr?modo=CORREIAS&pedido_correia_id='+Number(req.params.pedidoId));try {const u=req.session.user,id=req.params.pedidoId;switch(req.body.acao){case 'separar':service.separar(id,u);break;case 'cancelar':service.cancelar(id,u);break;case 'devolver':service.devolver(id,req.body.quantidade,u);break;default:throw new Error('Ação inválida.');}req.flash('success','Pedido atualizado.');}catch(e){req.flash('error',e.message);}res.redirect('/almoxarifado/correias');}
function solicitar(req,res) {try {service.solicitar({...req.body,preventiva_execucao_id:req.params.execId},req.session.user);req.flash('success','Pedido reservado e enviado ao Almoxarifado.');}catch(e){req.flash('error',e.message);}res.redirect(`/preventivas/${req.params.id}`);}
function confirmar(req,res) {try {service.confirmarTroca(req.params.pedidoId,req.body.troca_em,req.session.user);req.flash('success','Troca confirmada. A próxima inspeção permanece programada.');}catch(e){req.flash('error',e.message);}res.redirect(`/preventivas/${req.params.id}`);}
function registrarTroca(req,res) {try {const r=service.registrarTrocaPreventiva({...req.body,plano_id:req.params.id,preventiva_execucao_id:req.params.execId},req.session.user);req.flash('success',r.duplicado?'Esta troca já foi registrada. Nenhuma nova baixa.':'Troca registrada e baixa vinculada ao equipamento.');}catch(e){req.flash('error',e.message);}res.redirect(`/preventivas/${req.params.id}`);}
function prazo(req,res) {try {service.salvarPrazo(req.body.equipamento_id,req.body.prazo_falha_dias);req.flash('success','Prazo de investigação salvo.');}catch(e){req.flash('error',e.message);}res.redirect(`/pcm/engenharia?equipamento_id=${Number(req.body.equipamento_id)}#criticidade`);}
module.exports={index,avulsa,acao,solicitar,confirmar,registrarTroca,prazo};
