const fs = require('fs');
const path = require('path');
const { askText } = require('./ai.service');

function fallbackVision(name = '') {
  const n = String(name || '').toLowerCase();
  if (n.includes('vaz')) return { tipo_falha: 'Vazamento', criticidade: 'alta', recomendacao: 'Isolar linha, conter fluido e revisar vedação.' };
  if (n.includes('quebr') || n.includes('trinca')) return { tipo_falha: 'Quebra mecânica', criticidade: 'critica', recomendacao: 'Parar equipamento e substituir componente estrutural.' };
  return { tipo_falha: 'Falha mecânica não classificada', criticidade: 'media', recomendacao: 'Realizar inspeção detalhada com equipe de manutenção.' };
}

async function analisarImagemFalha({ filePath = null, fileBuffer = null, mimeType = 'image/jpeg', fileName = '' } = {}) {
  try {
    const contentBase64 = fileBuffer
      ? Buffer.from(fileBuffer).toString('base64')
      : (filePath ? fs.readFileSync(path.resolve(filePath)).toString('base64') : null);

    if (!contentBase64) return fallbackVision(fileName);

    const result = await askText({
      systemPrompt: 'Você é especialista em inspeção visual de falhas industriais. Responda JSON: {"tipo_falha":"","criticidade":"baixa|media|alta|critica","recomendacao":""}.',
      userPayload: {
        instrucao: 'Analise a imagem de falha e classifique.',
        imagem: {
          mime_type: mimeType,
          base64: contentBase64,
        },
      },
      maxOutputTokens: 220,
    });

    const parsed = JSON.parse(String(result?.text || '{}'));
    return {
      tipo_falha: String(parsed.tipo_falha || '').trim() || 'Falha visual não classificada',
      criticidade: String(parsed.criticidade || 'media').trim().toLowerCase(),
      recomendacao: String(parsed.recomendacao || '').trim() || 'Executar inspeção técnica presencial.',
    };
  } catch (_err) {
    return fallbackVision(fileName);
  }
}

module.exports = {
  analisarImagemFalha,
};
