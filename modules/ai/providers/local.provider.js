function unavailable(capability) {
  const err = new Error(`Provider local ainda não configurado para ${capability}.`);
  err.code = 'AI_LOCAL_PROVIDER_UNAVAILABLE';
  err.status = 503;
  return err;
}

async function createResponse() {
  throw unavailable('respostas de texto');
}

async function createRealtimeCall() {
  throw unavailable('voz em tempo real');
}

function status() {
  return {
    name: 'local',
    configured: false,
    supports: { responses: false, realtime: false },
    note: 'Contrato reservado para integração futura com OmniRoute/modelo local.',
  };
}

module.exports = { name: 'local', createResponse, createRealtimeCall, status };
