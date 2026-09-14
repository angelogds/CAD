// Dados exclusivamente sintéticos para validação visual e regressão.
const banco = Array.from({ length: 7 }, (_, i) => {
  const creditos = 300 + i * 67;
  const debitos = i === 6 ? 930 : i * 40;
  const minutos = creditos - debitos;
  const abs = Math.abs(minutos);
  return { id:100 + i, nome:i === 3 || i === 4 ? 'Júnior Exemplo' : `Colaborador Exemplo ${i + 1}`,funcaoLabel:'Mecânico Industrial',
    saldo:{creditos,debitos,minutos,horas:`${minutos < 0 ? '-' : ''}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2,'0')}`,diasFolgaDecimal:Math.round(minutos / 480 * 100) / 100} };
});
const horasExtras = banco.map((b, i) => ({ colaborador_id:b.id,colaborador_nome:b.nome,os_id:i === 1 ? null : 900 + i,
  data_servico:'2026-09-13',inicio_extra:'07:00',fim_extra:'10:00',total_minutos:180,equipamento_nome:'Equipamento de exemplo',
  descricao_servico:'Revisão mecânica, verificação de mancais e ajustes do conjunto. Dados fictícios para avaliação do formato.',status:i === 1 ? 'PENDENTE_APROVACAO' : 'APROVADO' }));
module.exports = { emitidoEm:'2026-09-14T12:00:00Z',minutosDiaFolga:480,
  reportSubtitle:'DEMONSTRAÇÃO VISUAL - DADOS FICTÍCIOS',
  filtros:{inicio:'2026-09-01',fim:'2026-09-14'},banco,horasExtras,
  folgas:[{colaborador_id:100,colaborador_nome:banco[0].nome,tipo_lancamento:'FOLGA_COMPENSATORIA',data_folga:'2026-09-18',minutos_descontados:240,status:'PROGRAMADA'}] };
