# OmniRoute e consumo de IA

Pesquisa em 25/10/2026: o endereço `diegosouzapw/OmniRoute` redireciona para o [repositório cheaper-inference/OmniRoute](https://github.com/cheaper-inference/OmniRoute). O projeto se apresenta como gateway compatível com APIs OpenAI, com seleção de provedores/modelos, fallback e opções de compressão/cache. São capacidades declaradas do projeto, sem economia percentual aferida neste CAD.

O gateway pode atender clientes/CLIs configurados para seu endpoint. Isso não muda a franquia, o provedor ou o consumo da conversa atual do ChatGPT/Codex, nem resolve o bloqueio de revisão automática por limite de uso da conta.

## Aplicação ao painel 2A

O dashboard não usa LLM para renderizar objetos, girar eixos, calcular a maquete, atualizar níveis ou abrir indicadores. Three.js e o estado local do navegador fazem esse trabalho. Colocar um gateway de IA nesse caminho não reduziria tokens: não existem chamadas de IA ali.

Uma adoção útil do OmniRoute seria um serviço separado para futuras funcionalidades de IA, usando credenciais autorizadas e clientes configuráveis, com orçamento por tarefa. Antes da ativação:

1. Fixar e revisar a versão/commit escolhido do gateway e sua licença.
2. Definir host/endpoint, modelo e credencial do próprio ambiente; manter o gateway e suas chaves fora dos assets do navegador.
3. Usar as instruções oficiais de integração do cliente/CLI do repositório. Avaliar a configuração proposta em modo de prévia antes de alterar o perfil do desenvolvedor.
4. Medir custo/latência/qualidade por tarefa com e sem compressão. Não comprimir tags, unidades, alarmes ou dados de processo de forma que mude seu significado.

Nenhum gateway foi instalado, nenhuma chave foi copiada, nenhum perfil desta sessão foi reconfigurado e o cliente de IA existente no CAD não foi alterado neste trabalho. Não há necessidade de um serviço de IA para operar a nova cena 3D.
