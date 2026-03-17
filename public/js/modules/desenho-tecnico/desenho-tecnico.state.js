export function createDesenhoTecnicoState(initial = {}) {
  return {
    viewportState: null,
    activeTool: 'select',
    activeLayer: 'geometria_principal',
    layers: {},
    entities: [],
    selection: [],
    hover: null,
    preview: [],
    grips: [],
    snappingConfig: { enabled: true },
    gridConfig: { visible: true, step: 20 },
    orthoEnabled: false,
    dimensionMode: 'linear',
    metadata: { codigo: '', titulo: '', material: '', equipamento_id: null, observacoes: '' },
    uiState: { showCoordinates: true, showTempMeasures: true },
    statusMessage: 'Pronto',
    ...initial,
  };
}
