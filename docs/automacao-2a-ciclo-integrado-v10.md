# ESP32 V10 demonstrativo — integração mecânica + térmica

Esta atualização prepara a IHM e o CAD para uma **maquete de apresentação**. A seleção do digestor, o movimento da rosca, os dois desenhos de guilhotina, o cozimento guiado pela temperatura simulada, a descarga para a percoladora e o tacho com bomba são estados virtuais do navegador. A indicação vermelho piscando significa acima de 120 °C na referência V9 e **não autoriza descarga física**.

## Mapa do GPIO — revisão preliminar

| Função | GPIO | Condição |
| --- | --- | --- |
| Torre vermelha | 18 | Existente, relé ativo LOW |
| Torre amarela | 19 | Existente, relé ativo LOW |
| Torre verde | 21 | Existente, relé ativo LOW |
| Purga camisa | 25 | Existente, com armamento e comando local |
| Purga eixo | 26 | Existente, com armamento e comando local |
| Guilhotina alimentação D1 | 32 (candidato) | NÃO configurado/não acionado |
| Guilhotina descarga D1 | 33 (candidato) | NÃO configurado/não acionado |

GPIO32/33 são apenas candidatos de projeto; validar conflito com MAX31865 ou outro módulo PT100, esquema de aterramento, fonte, circuito de proteção e módulos de relé. **Nenhum firmware gerado nesta etapa configura GPIO32/33 como saída.** Os pinos 25/26 continuam exclusivos dos purgadores e não são reaproveitados.

## Válvula pneumática — pendência crítica

O relato de **duas bobinas** exige identificar o corpo e a função (por exemplo, válvula 5/2 biestável de duas bobinas versus outra configuração). Desenergizar ambas **não comprova retorno à posição fechada**. Uma válvula biestável geralmente conserva sua última posição; não programar a suposição "bobina desligada = guilhotina fechada". Para abrir/fechar com garantia, projetar interface de bobinas, energia, cilindro e **dois fins de curso** por guilhotina, independente da representação visual. Três relés não permitem assumir controle independente de quatro bobinas adicionais sem expansão de I/O e análise.

## Firmware entregue nesta revisão

- `hardware_config.h` registra pinos candidatos sem habilitar driver.
- `esp32-sinaleiros.ino` identifica `temperatura-v10-demo` e expõe `guilhotinas.carregamento`, `guilhotinas.descarga` como `SEM_RETORNO_FISICO`, `saidas_habilitadas=false` e `comandos_remotos_habilitados=false` na API local `/api/estado`.
- Preserva NVS Wi-Fi/token, sinaleiros 18/19/21, modo real de PT100 e purgadores 25/26. **Não faz comando remoto da descarga.**
- Não considerar release de campo: falta compilar no Arduino IDE para a placa real e testar em bancada isolada, depois validar com profissional habilitado e análise de risco antes de qualquer carga.

## Teste de apresentação

Na tela do simulador, selecionar D1, habilitar "Vincular simulações elétrica + mecânica" e iniciar. A rosca superior alimenta D1 pela guilhotina, fecha, entra em cozimento e o PT100 **simulado** evolui até 121 °C. Só então abre a guilhotina de descarga **virtual**, entra a percoladora, o tacho acumula líquido e a bomba transfere para a fronteira do tanque de serviço. Valores de carga, tempo e fração do líquido são ilustrativos. Com TODOS, somente uma carga por vez; o próximo digestor inicia após transferir o anterior. Pausar interrompe o relógio; reiniciar fecha as guilhotinas virtuais. O acesso REAL e o comando de vapor não mudam.

## Próxima revisão física (não implementada)

Confirmar modelo/placa da válvula pneumática, tensão das duas bobinas e regime de retenção, número de saídas efetivas do relé, realimentação de posição aberta/fechada, sensores e lógica de falha; acrescentar saídas sob permissão física local independente, testes de falha de conexão/reinicialização e E-stop apropriado. A lógica de sequência final depende de engenharia de segurança, sem reaproveitar o front-end como CLP de segurança.
