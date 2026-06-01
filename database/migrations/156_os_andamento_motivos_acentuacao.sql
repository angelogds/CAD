-- Normaliza textos institucionais em instalações que receberam uma versão preliminar sem acentuação.
UPDATE os_andamento_motivos SET
  nome = 'Falta de mão de obra capacitada',
  texto_padrao = 'OS mantida em andamento por indisponibilidade de mão de obra capacitada ou equipe suficiente para execução segura do serviço. A atividade deverá ser reprogramada conforme disponibilidade da equipe.'
WHERE codigo = 'FALTA_MAO_DE_OBRA';

UPDATE os_andamento_motivos SET
  nome = 'Equipamento em produção / sem parada liberada',
  texto_padrao = 'OS mantida em andamento porque o equipamento permanece em operação e ainda não houve liberação de parada pela produção. A execução deverá ocorrer após liberação operacional segura.'
WHERE codigo = 'EQUIPAMENTO_EM_PRODUCAO';

UPDATE os_andamento_motivos SET
  nome = 'Aguardando serviço terceirizado',
  texto_padrao = 'OS mantida em andamento por dependência de serviço terceirizado, fabricação externa, tornearia, soldagem especializada ou suporte externo. A manutenção acompanhará o retorno para dar continuidade ao serviço.'
WHERE codigo = 'AGUARDANDO_TERCEIRO';

UPDATE os_andamento_motivos SET
  nome = 'Aguardando peça de tornearia',
  texto_padrao = 'OS mantida em andamento porque depende de peça em fabricação ou recuperação na tornearia. Após retorno da peça, a equipe deverá retomar a montagem e concluir a OS.'
WHERE codigo = 'AGUARDANDO_PECA_TORNEARIA';

UPDATE os_andamento_motivos SET
  nome = 'Falta de ferramenta ou recurso adequado',
  texto_padrao = 'OS mantida em andamento por falta de ferramenta, equipamento auxiliar ou recurso adequado para execução segura do serviço.'
WHERE codigo = 'FALTA_FERRAMENTA';

UPDATE os_andamento_motivos SET
  nome = 'Serviço demanda continuação',
  texto_padrao = 'OS mantida em andamento porque o serviço demanda mais tempo de execução, desmontagem, montagem, ajuste, teste ou acompanhamento operacional. A atividade continuará na próxima programação da manutenção.'
WHERE codigo = 'SERVICO_COMPLEXO_CONTINUIDADE';

UPDATE os_andamento_motivos SET
  nome = 'Risco de segurança / aguardando bloqueio',
  texto_padrao = 'OS mantida em andamento porque a execução exige condição segura, bloqueio, liberação da área ou eliminação de risco operacional. O serviço somente deverá prosseguir após liberação segura.'
WHERE codigo = 'RISCO_SEGURANCA';

UPDATE os_andamento_motivos SET
  nome = 'Aguardando aprovação do encarregado',
  texto_padrao = 'OS mantida em andamento aguardando avaliação, orientação ou aprovação do encarregado de manutenção para definição da melhor forma de execução.'
WHERE codigo = 'AGUARDANDO_APROVACAO';

UPDATE os_andamento_motivos SET
  nome = 'Outro motivo',
  texto_padrao = 'OS mantida em andamento por motivo operacional informado pela equipe. A observação complementar deverá detalhar a situação para registro no relatório.'
WHERE codigo = 'OUTRO';
