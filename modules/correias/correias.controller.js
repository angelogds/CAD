const service = require('./correias.service');
const { canAccessModule } = require('../../config/rbac');

function index(req,res){
  const filtros={
    q:String(req.query.q||'').trim(),
    equipamento_id:req.query.equipamento_id||'',
    status:String(req.query.status||'').trim().toUpperCase(),
  };
  return res.render('pcm/correias',{
    layout:'layout',
    title:'PCM – Plano de Correias',
    activeMenu:'pcm',
    activePcmSection:'correias',
    filtros,
    planos:service.listPlanos(filtros),
    resumo:service.dashboard(),
    equipamentos:service.listEquipamentos(),
    correias:service.listCorreiasEstoque(),
    canManagePcm:canAccessModule(req.session?.user?.role||'','pcm_manage'),
  });
}

function create(req,res){
  try{
    const id=service.createPlano(req.body||{},req.session?.user?.id||null);
    req.flash('success',`Plano de correias #${id} criado. A primeira troca já foi programada e o estoque mínimo foi recalculado.`);
  }catch(error){
    req.flash('error',error.message||'Não foi possível criar o plano de correias.');
  }
  return res.redirect('/pcm/correias');
}

module.exports={index,create};
