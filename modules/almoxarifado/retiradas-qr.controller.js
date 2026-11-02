const reservaService = require('../estoque/estoque.reservas.service');
const colaboradoresService = require('../colaboradores/colaboradores.service');
const { normalizeRole } = require('../../config/rbac');

function normNome(value) {
  return String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function cadastrarColaborador(req, res) {
  const nome = String(req.body.nome || '').trim().replace(/\s+/g, ' ');
  const funcao = String(req.body.funcao || 'COLABORADOR').trim().slice(0, 80);
  const setor = String(req.body.setor || 'NAO_INFORMADO').trim().slice(0, 80);
  const solicitacaoId = Number(req.body.solicitacao_id || 0) || null;
  const redirect = (params = '') => res.redirect('/almoxarifado/retiradas/qr' + params);
  try {
    if (nome.length < 3 || nome.length > 120) throw new Error('Informe o nome completo da pessoa (3 a 120 caracteres).');
    if (!/^[\p{L}][\p{L}\p{M}\s'.-]+$/u.test(nome)) throw new Error('Nome inválido para cadastro.');
    const existente = reservaService.listPessoasAtivas(nome).find(pessoa => normNome(pessoa.nome) === normNome(nome));
    if (existente) {
      req.flash('error', 'Essa pessoa já está cadastrada. Use o cadastro existente para evitar duplicidade.');
      const p = new URLSearchParams({...contexto(req.body),q_pessoa:nome});
      if (solicitacaoId) p.set('solicitacao_id', String(solicitacaoId));
      return redirect('?' + p.toString());
    }
    const id = colaboradoresService.createOrUpdateColaborador(
      { nome, funcao: funcao || 'COLABORADOR', setor: setor || 'NAO_INFORMADO', status: 'ATIVO' },
      { id: req.session.user.id, name: req.session.user.name, origem: 'ALMOXARIFADO_RETIRADA' }
    );
    req.flash('success', 'Cadastro para retirada criado. O cartão QR poderá ser emitido pelo RH ou encarregado autorizado.');
    const params = new URLSearchParams({...contexto(req.body),pessoa_tipo:'COLABORADOR',pessoa_id:String(id)});
    if (solicitacaoId) params.set('solicitacao_id', String(solicitacaoId));
    return redirect('?' + params.toString());
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a pessoa.');
    const params = new URLSearchParams({...contexto(req.body),q_pessoa:nome});
    if (solicitacaoId) params.set('solicitacao_id', String(solicitacaoId));
    return redirect('?' + params.toString());
  }
}


function contexto(data={}) {
  const modo=['ESTOQUE','CORREIAS'].includes(String(data.modo).toUpperCase())?String(data.modo).toUpperCase():'SOLICITACAO';
  const out={modo};
  const keys=modo==='SOLICITACAO'?['solicitacao_id']:modo==='CORREIAS'?['pedido_correia_id']:['item','q','familia'];
  for(const key of [...keys,'equipamento_id','setor_consumidor'])if(data[key])out[key]=String(data[key]).slice(0,120);
  return out;
}
function scanner(req, res) {
  const ctx=contexto(req.query),modo=ctx.modo;
  const codigo=String(req.query.codigo||'').trim(),solicitacaoId=modo==='SOLICITACAO'?Number(ctx.solicitacao_id)||null:null;
  const pessoaTipo=String(req.query.pessoa_tipo||'').trim().toUpperCase(),pessoaId=Number(req.query.pessoa_id)||null;
  const buscaPessoa=String(req.query.q_pessoa||'').trim();
  const pessoa=codigo?reservaService.getPessoaByQr(codigo):(pessoaTipo&&pessoaId?reservaService.getPessoaByCadastro(pessoaTipo,pessoaId):null);
  const solicitacoes=reservaService.listSolicitacoes().filter(g=>g.itens.some(i=>Number(i.quantidade_disponivel)>0));
  const grupos=solicitacaoId?reservaService.listSolicitacoes({solicitacao_id:solicitacaoId}):[];
  const estoque=require('../estoque/estoque.service'),belts=require('../correias/correias.fluxo.service'),db=require('../../database/db');
  const pedidosCorreias=belts.list().filter(p=>['SOLICITADA','SEPARADA'].includes(p.status));
  const pedido=modo==='CORREIAS'?pedidosCorreias.find(p=>p.id===Number(ctx.pedido_correia_id)):null;
  const reservas=reservaService.resumoPorItem();
  const itens=modo==='ESTOQUE'?estoque.listItens({q:ctx.q}).map(i=>({...i,saldo_disponivel:Math.max(0,Number(i.saldo_atual)-Number(reservas.get(i.id)||0))})).filter(i=>i.saldo_disponivel>0):[];
  if(ctx.familia==='CORREIAS'){const ids=new Set(require('../correias/correias.service').listCorreiasEstoque().map(i=>i.id));for(let n=itens.length-1;n>=0;n--)if(!ids.has(itens[n].id))itens.splice(n,1);}
  const item=itens.find(i=>i.id===Number(ctx.item));
  const equipamentoFixo=Number(grupos[0]?.itens[0]?.equipamento_id||pedido?.equipamento_id)||null;
  const equipamentoSelecionado=equipamentoFixo||Number(ctx.equipamento_id)||Number(item?.equipamento_id)||null;
  const {normalizeSetorCorporativo,SETORES}=require('../compras/compras-setores');
  const setor=normalizeSetorCorporativo(ctx.setor_consumidor||pedido?.setor_consumidor||grupos[0]?.setor_origem||item?.setor_utilizacao);
  const setorSelecionado=Object.values(SETORES).includes(setor)?setor:'';
  let historico=solicitacaoId?reservaService.historicoRetiradas(solicitacaoId):[];
  const operacao=String(req.query.operacao||'');
  if(operacao){const op=db.prepare('SELECT usuario_id FROM estoque_entrega_operacoes WHERE token=?').get(operacao);
    if(op&&(op.usuario_id===Number(req.session.user.id)||['ADMIN','ALMOXARIFADO','DIRETORIA'].includes(normalizeRole(req.session.user.role))))historico=reservaService.consultarRetiradas({operacaoToken:operacao,limite:100}).lista.map(m=>({...m,nome:m.item_nome,created_at:m.data_mov}));}
  return res.render('almoxarifado/retirada_qr',{
    title:'Retirada de materiais',activeMenu:'almoxarifado',modo,contexto:ctx,codigo,solicitacaoId,pessoaTipo,pessoaId,buscaPessoa,
    pessoasEncontradas:buscaPessoa?reservaService.listPessoasAtivas(buscaPessoa):[],pessoa,colaborador:pessoa,entregador:req.session.user,
    grupos,solicitacoes,itens,itemSelecionado:Number(ctx.item)||null,pedidosCorreias,pedido,
    equipamentos:estoque.listEquipamentosEstoque(),equipamentoFixo,equipamentoSelecionado,setorSelecionado,setores:Object.values(SETORES),historico,
    operacaoToken:require('node:crypto').randomUUID(),
    canWithdraw:require('../../config/rbac').ACCESS.estoque_retirada.includes(normalizeRole(req.session.user.role)),
    podeCadastrarPessoa:['ADMIN','ALMOXARIFADO'].includes(normalizeRole(req.session.user.role)),
  });
}
function retirarLivre(req,res) {
  const ctx=contexto({...req.body,modo:req.body.modo==='CORREIAS'?'CORREIAS':'ESTOQUE'});
  const ids=Array.isArray(req.body.item_id)?req.body.item_id:[req.body.item_id].filter(Boolean);
  let concluida=false;
  try {
    const r=require('../estoque/estoque.service').retirarLivreSelecionados({operacaoToken:req.body.operacao_token,
      itens:ids.map(id=>({itemId:id,quantidade:req.body['quantidade_'+id]})),pedidoCorreiaId:ctx.modo==='CORREIAS'?req.body.pedido_correia_id:null,
      qrCode:req.body.qr_code,pessoaTipo:req.body.pessoa_tipo,pessoaId:req.body.pessoa_id,nomeRetirante:req.body.nome_retirante,
      setorConsumidor:req.body.setor_consumidor,equipamentoId:req.body.equipamento_id,observacao:req.body.observacao},req.session.user);
    concluida=true;req.flash('success',r.duplicado?'Retirada já registrada. O saldo foi mantido.':`${r.itens} material(is) entregue(s) a ${r.pessoaNome}.`);
  }catch(e){req.flash('error',e.message||'Não foi possível registrar a retirada. Nenhum material foi baixado.');}
  const params=new URLSearchParams(ctx);
  if(concluida)params.set('operacao',String(req.body.operacao_token));
  else if(req.body.qr_code)params.set('codigo',String(req.body.qr_code));
  else if(req.body.pessoa_tipo&&req.body.pessoa_id){params.set('pessoa_tipo',String(req.body.pessoa_tipo));params.set('pessoa_id',String(req.body.pessoa_id));}
  return res.redirect('/almoxarifado/retiradas/qr?'+params+'#'+(concluida?'historico-retirada':'materiais-retirada'));
}

function retirarLote(req, res) {
  const solicitacaoId = Number(req.params.id);
  const ids = Array.isArray(req.body.reserva_id) ? req.body.reserva_id : [req.body.reserva_id].filter(Boolean);
  let concluida = false;
  try {
    const resultado = reservaService.retirarSelecionados({ solicitacaoId, operacaoToken: req.body.operacao_token,
      itens: ids.map(id => ({ reservaId: id, quantidade: req.body[`quantidade_${id}`] })),
      qrCode: String(req.body.qr_code || '').trim(), pessoaTipo: req.body.pessoa_tipo, pessoaId: req.body.pessoa_id,
      equipamentoId:req.body.equipamento_id,setorConsumidor:req.body.setor_consumidor, nomeRetirante: req.body.nome_retirante, entreguePorUserId: req.session.user.id, observacao: req.body.observacao });
    concluida = true;
    req.flash('success', resultado.duplicado ? 'Esta retirada já foi registrada. O estoque foi mantido.'
      : `${resultado.itens} material(is) entregue(s) a ${resultado.pessoaNome}. Retirada registrada no histórico.`);
  } catch (error) { req.flash('error', error.message || 'Não foi possível confirmar a retirada. Nenhum item foi baixado.'); }
  const params = new URLSearchParams({solicitacao_id:String(solicitacaoId)});
  // Uma falha mantém a conferência atual. Uma entrega concluída limpa a pessoa
  // e abre o histórico, para que a próxima entrega exija nova identificação.
  if (!concluida) {
    if (req.body.qr_code) params.set('codigo', String(req.body.qr_code));
    else if (req.body.pessoa_tipo && req.body.pessoa_id) {
      params.set('pessoa_tipo', String(req.body.pessoa_tipo)); params.set('pessoa_id', String(req.body.pessoa_id));
    }
  }
  return res.redirect(`/almoxarifado/retiradas/qr?${params}#${concluida?'historico-retirada':'materiais-retirada'}`);
}

function retirar(req, res) {
  const reservaId = Number(req.params.reservaId);
  const codigo = String(req.body.qr_code || '').trim();
  const solicitacaoId = Number(req.body.solicitacao_id || 0) || null;
  const pessoaTipo = String(req.body.pessoa_tipo || '').trim().toUpperCase();
  const pessoaId = Number(req.body.pessoa_id || 0) || null;
  try {
    const resultado = reservaService.retirarReserva({
      reservaId,
      quantidade: Number(req.body.quantidade || 0),
      qrCode: codigo,
      pessoaTipo,
      pessoaId,
      nomeRetirante: String(req.body.nome_retirante || '').trim(),
      entreguePorUserId: req.session.user.id,
      observacao: req.body.observacao || null,
      setorConsumidor: req.body.setor_consumidor,
    });
    req.flash('success', `${resultado.quantidade} unidade(s) entregues a ${resultado.pessoa?.nome || resultado.colaborador?.nome}. Estoque e reserva atualizados.`);
  } catch (error) {
    req.flash('error', error.message || 'Não foi possível registrar a retirada.');
  }
  const params = new URLSearchParams();
  if (codigo) params.set('codigo', codigo);
  if (!codigo && pessoaTipo && pessoaId) {
    params.set('pessoa_tipo', pessoaTipo);
    params.set('pessoa_id', String(pessoaId));
  }
  if (solicitacaoId) params.set('solicitacao_id', String(solicitacaoId));
  return res.redirect(`/almoxarifado/retiradas/qr?${params.toString()}`);
}

module.exports = { scanner, retirarLivre, retirar, retirarLote, cadastrarColaborador };
