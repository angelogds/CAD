# Hora extra desde as 17h

No formulário **Registrar Hora Extra** (`/escala/hora-extra/nova`), o encarregado
de manutenção, supervisor de manutenção ou administrador escolhe **Iniciar agora**
ou **Iniciar às 17h de hoje**, antes de confirmar a abertura. O padrão é iniciar
agora. A opção de início às 17h é validada no servidor, inclusive para requisições
que não passaram pela tela. Mecânicos mantêm somente a abertura no horário real.

O atalho `/escala/hora-extra/desde-17` continua disponível para abertura com início
às **17h de hoje, no horário de Brasília**.

- O início é calculado no servidor. O formulário não escolhe data nem horário.
- Uma abertura lançada às 17h31 contabiliza o período desde as 17h.
- É possível preparar a abertura antes das 17h. O contador fica em zero até
  esse horário e o lançamento só pode ser finalizado com duração positiva.
- O fechamento usa o horário real do servidor e segue para aprovação.
- O banco de horas recebe o crédito pelo processo de aprovação já existente.
- A mesma OS pode ter vários mecânicos. Cada funcionário tem seu próprio
  lançamento; escolha o colaborador antes de abrir ou fechar.
- Um funcionário não pode ter dois lançamentos ativos. Um período já
  registrado a partir das 17h também impede uma segunda abertura desde as 17h,
  exceto quando o registro anterior foi cancelado ou reprovado.
- Os registros comuns continuam iniciando no momento real da abertura.

O campo `inicio_fixo_17h` identifica o novo fluxo. `inicio_extra` contém o início
contabilizado; `criado_em` mantém o instante real do lançamento; `user_id`
identifica o responsável autenticado. Foto e GPS de abertura correspondem ao
momento do lançamento, não constituem evidência retroativa das 17h.

A migration `228_escala_hora_extra_inicio_fixo_17h.js` acrescenta somente a flag,
com valor zero nos registros existentes. Nenhum lançamento antigo é recalculado.

Exemplo de validação: abrir às 17h31 e finalizar às 18h10 deve registrar início
17h, lançamento 17h31, fim 18h10 e total de 70 minutos. A opção deve estar oculta
para mecânicos e outros setores, e as rotas de abertura devem negar acesso
direto desses perfis.
