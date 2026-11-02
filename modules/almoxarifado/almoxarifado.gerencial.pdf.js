'use strict';
const { createInstitutionalReport } = require('../../utils/pdf/institutional-report');
const { COLORS, logoPath, formatDate } = require('../../utils/pdf-standard');
const { gerarRelatorio } = require('./almoxarifado.gerencial.service');
const { listarAtrasosPorFornecedor, filtrarAtrasos } = require('./almoxarifado.atrasos-fornecedor.service');
const brl = v => (Number(v || 0) / 100).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const qtd = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits:2 });
const dataSerie = value => /^\d{4}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : formatDate(value);

function gerarDocumento(info, pendencias, consultaAtrasos, { retiradas = { lista:[],total:0 }, emitidoEm = new Date() } = {}) {
  const { periodo,resumo,maisSaidos,parados,inventario,serie } = info;
  const report = createInstitutionalReport({
    title:'Relatório gerencial do almoxarifado',
    subtitle:`Movimentações de ${formatDate(periodo.inicio)} a ${formatDate(periodo.fim)} | Estoque atual na emissão`,
    issuedAt:emitidoEm.toLocaleDateString('pt-BR', {timeZone:'America/Sao_Paulo'}),
    logoPath:logoPath('materiais'),
    colors:{...COLORS,text:'#374151',muted:'#6B7280',border:'#DDE5DE',row:'#F8FBF9'},
    sector:'ALMOXARIFADO', headerContext:'Materiais | Manutenção Campo do Gado',
    footerText:'Manutenção Campo do Gado - Almoxarifado - Documento gerencial para controle interno.',
    subject:'Entradas, retiradas, estoque e acompanhamento de compras',
  });
  const render = () => {
    report.start();
    report.identification([
      ['PERÍODO',`${formatDate(periodo.inicio)} a ${formatDate(periodo.fim)}`,'EMISSÃO',emitidoEm.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})],
      ['ESTOQUE','Saldo atual do cadastro','MOVIMENTAÇÕES','Entradas e saídas do período'],
    ]);
    report.summary([
      {label:'Materiais com saldo atual',value:qtd(resumo.itensComSaldo)},
      {label:'Entradas no período (registros)',value:qtd(resumo.registrosEntrada)},
      {label:'Retiradas no período (registros)',value:qtd(resumo.registrosSaida)},
    ]);
    report.table({title:'Resumo de valores e qualidade dos registros',columns:[
      {key:'indicador',label:'Indicador',width:350},{key:'valor',label:'Valor',width:165,align:'right'},
    ],rows:[
      {indicador:'Valor estimado em estoque (materiais precificados)',valor:brl(resumo.estoqueCentavos)},
      {indicador:'Valor de entradas registrado / estimado',valor:brl(resumo.valorEntradaCentavos)},
      {indicador:'Valor de saídas registrado / estimado',valor:brl(resumo.valorSaidaCentavos)},
      {indicador:'Materiais com saldo sem custo cadastrado',valor:qtd(resumo.itensSemValor)},
      {indicador:'Movimentações sem preço: entradas / saídas',valor:`${qtd(resumo.entradasSemPreco)} / ${qtd(resumo.saidasSemPreco)}`},
    ]});
    report.table({title:'Movimentação no período',columns:[
      {key:'data',label:'Período',width:170},{key:'entradas',label:'Entradas (registros)',width:170,align:'right'},
      {key:'saidas',label:'Saídas (registros)',width:175,align:'right'},
    ],rows:serie.map(i=>({...i,data:dataSerie(i.data)})),emptyText:'Sem entradas ou saídas registradas no intervalo.'});
    report.table({title:'Materiais mais retirados (por número de retiradas)',columns:[
      {key:'nome',label:'Material',width:310},{key:'quantidade',label:'Quantidade',width:110,align:'right'},
      {key:'saidas',label:'Retiradas',width:95,align:'right'},
    ],rows:maisSaidos.map((i,n)=>({nome:`${n+1}. ${i.nome}`,quantidade:`${qtd(i.qtdSaida)} ${i.unidade}`,saidas:qtd(i.saidas)})),emptyText:'Nenhuma retirada no período.'});
    report.note('Materiais sem saída há 90 dias ou mais: lista de atenção. Avaliar criticidade e reserva mínima antes de reduzir compras.',{keepWithNext:90});
    report.table({title:'Materiais sem saídas há 90 dias ou mais',columns:[
      {key:'nome',label:'Material',width:360},{key:'saldo',label:'Saldo atual',width:155,align:'right'},
    ],rows:parados.map(i=>({nome:i.nome,saldo:`${qtd(i.saldo)} ${i.unidade}`})),emptyText:'Nenhum material antigo com saldo e sem saída identificado.'});
    const pesquisa=[consultaAtrasos.filtros.tipo==='TODOS'?'Todas as pendências':consultaAtrasos.filtros.tipo==='ATRASADOS'?'Somente atrasados':'Sem previsão',consultaAtrasos.filtros.fornecedor||'Todos os fornecedores',consultaAtrasos.filtros.busca||''].filter(Boolean).join(' | ');
    report.note(`Pesquisa de entregas: ${pesquisa}. Posição em ${formatDate(pendencias.hoje)}. Somente compras confirmadas com quantidade a receber.`,{keepWithNext:90});
    report.summary([
      {label:'Fornecedores com atraso (pesquisa)',value:qtd(consultaAtrasos.resumo.fornecedores)},
      {label:'Materiais atrasados (pesquisa)',value:qtd(consultaAtrasos.resumo.atrasados)},
      {label:'Pedidos com atraso (pesquisa)',value:qtd(consultaAtrasos.resumo.pedidos)},
    ]);
    report.table({title:'Materiais atrasados por fornecedor',columns:[
      {key:'origem',label:'Fornecedor / solicitação',width:145,repeatOnSplit:true},
      {key:'nome',label:'Material',width:185},{key:'pendente',label:'A receber',width:80,align:'right'},
      {key:'prazo',label:'Previsão / atraso',width:105},
    ],rows:consultaAtrasos.atrasados.map(i=>({origem:`${i.fornecedor}\n${i.numero}`,nome:i.nome,pendente:`${qtd(i.pendente)} ${i.unidade}`,prazo:`${formatDate(i.previsao)}\n${i.diasAtraso} dia(s)`})),emptyText:'Nenhum material com prazo vencido e recebimento pendente.'});
    report.table({title:'Materiais pendentes sem previsão',columns:[
      {key:'origem',label:'Fornecedor / solicitação',width:165,repeatOnSplit:true},{key:'nome',label:'Material',width:250},
      {key:'pendente',label:'A receber',width:100,align:'right'},
    ],rows:consultaAtrasos.semPrevisao.map(i=>({origem:`${i.fornecedor}\n${i.numero}`,nome:i.nome,pendente:`${qtd(i.pendente)} ${i.unidade}`})),emptyText:'Nenhuma compra pendente sem previsão.'});
    report.note('Compras sem data válida não são classificadas como atrasadas. Completar a previsão em Compras. Quantidades de unidades distintas não são somadas.');
    report.table({title:'Retiradas identificadas no período',columns:[
      {key:'material',label:'Material / solicitação',width:200},{key:'quantidade',label:'Quantidade',width:75,align:'right'},
      {key:'responsaveis',label:'Quem retirou / quem entregou',width:155},{key:'data',label:'Data',width:85},
    ],rows:retiradas.lista.map(m=>({material:`${m.item_nome}\n${m.numero||'Retirada avulsa'}\n${m.setor}`,quantidade:`${qtd(m.quantidade)} ${m.unidade}`,responsaveis:`Retirou: ${m.retirante_nome}\nEntregou: ${m.entregador_nome}`,data:formatDate(m.data_mov)})),emptyText:'Nenhuma retirada registrada no intervalo.'});
    if(retiradas.total>retiradas.lista.length)report.note(`Exibidos os ${retiradas.lista.length} registros mais recentes de ${retiradas.total}. O histórico completo está em Estoque > Materiais retirados, com busca e paginação.`);
    report.table({title:'Inventário valorizado - saldo atual',columns:[
      {key:'nome',label:'Material / setor',width:310},{key:'saldo',label:'Saldo atual',width:90,align:'right'},
      {key:'valor',label:'Valor estimado',width:115,align:'right'},
    ],rows:inventario.map(i=>({nome:`${i.nome}\n${i.setorPadrao}`,saldo:`${qtd(i.saldo)} ${i.unidade}`,valor:i.valorSaldoCentavos==null?'Custo não cadastrado':brl(i.valorSaldoCentavos)})),emptyText:'Nenhum material com saldo atual.'});
    report.note('Notas: preços históricos da movimentação prevalecem; na ausência, usa-se o valor da compra vinculada ou, como estimativa, o custo atual do estoque. Ajustes de inventário não representam entradas ou saídas operacionais. Materiais sem custo não entram nos totais monetários. Quantidades de unidades diferentes não são somadas. Perfis ausentes em registros antigos permanecem não identificados. Este relatório não substitui a escrituração contábil.');
    report.end();
  };
  return {doc:report.doc,render};
}
function exportar(req,res) {
  let info;
  try { info=gerarRelatorio(req.query||{}); }
  catch(e) { return res.status(400).send(e.message); }
  const pendencias=listarAtrasosPorFornecedor(info.periodo.hoje);
  const consultaAtrasos=filtrarAtrasos(pendencias, req.query||{});
  const retiradas=require('../estoque/estoque.reservas.service').consultarRetiradas({...info.periodo,limite:100});
  const pdf=gerarDocumento(info,pendencias,consultaAtrasos,{retiradas});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="almoxarifado-gerencial-${info.periodo.inicio}-${info.periodo.fim}.pdf"`);
  pdf.doc.pipe(res);
  pdf.render();
}
module.exports={exportar,gerarDocumento};
