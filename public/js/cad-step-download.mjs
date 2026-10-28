export async function downloadStep(drawingId, filename = 'eixo') {
  if (!drawingId) throw new Error('Identificador do desenho não encontrado.');
  const response = await fetch('/desenho-tecnico/cad/' +
    encodeURIComponent(drawingId) + '/step', { credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Falha ao exportar STEP: HTTP ' + response.status);
  }
  const blob = await response.blob();
  if (!blob.size || blob.size > 8_000_000) {
    throw new Error('Arquivo STEP vazio ou acima do limite permitido.');
  }
  const safe = String(filename || 'eixo').replace(/[^a-z0-9._-]+/gi, '-').slice(0, 85);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = safe + '.step';
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
