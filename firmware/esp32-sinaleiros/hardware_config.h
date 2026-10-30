#pragma once
// Somente o módulo e a fiação confirmados devem ser habilitados.
// O ESP32-D0WD-V3 e os sinaleiros 18/19/21 ativos em LOW vieram do sketch fornecido.
#define CGD_ENABLE_PT100 0
#define CGD_PT100_SCK -1
#define CGD_PT100_MISO -1
#define CGD_PT100_MOSI -1
#define CGD_PT100_CS -1
#define CGD_PT100_WIRES 0
#define CGD_PT100_REFERENCE_OHMS 0.0f
#define CGD_PT100_NOMINAL_OHMS 100.0f
// Purgadores: GPIO25 e GPIO26 para comando de interface de relés; armar/iniciar apenas local.
// Responsável confirmou relés ativos LOW e válvulas que fecham sem energia.
// Armar+Iniciar local obrigatório; jamais restaura armamento após reinício.
#define CGD_ENABLE_PURGE_OUTPUTS 1
#define CGD_PURGE_RELAY_ACTIVE_LEVEL LOW
#define CGD_PURGE_FAIL_CLOSED_CONFIRMED 1

// Preparação V10: GPIO32/33 são somente CANDIDATOS após conferir ligação do
// PT100, todas as cargas e tipo de distribuidora pneumática. Não há driver físico.
// Solenoide com DUAS BOBINAS não deve ser tratada como monoestável sem ensaio.
// Nenhuma rotina usa estes pinos enquanto o projeto executivo não for aprovado.
#define CGD_ENABLE_MATERIAL_GATE_OUTPUTS 0
#define CGD_GATE_FEED_CANDIDATE_GPIO 32
#define CGD_GATE_DISCHARGE_CANDIDATE_GPIO 33
