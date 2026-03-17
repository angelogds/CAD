export function createDesenhoTecnicoState(initial = {}) {
  return {
    viewportState: null,
    activeTool: 'select',
    entities: [],
    selection: [],
    hover: null,
    preview: [],
    snappingConfig: { enabled: false },
    gridConfig: { visible: true, step: 25 },
    uiState: { showCoordinates: true, showTempMeasures: true },
    statusMessage: 'Pronto',
    ...initial
  };
}
