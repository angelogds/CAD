(() => {
  const categoryMap = {
    EIXOS: ['PONTA_EIXO_PRINCIPAL', 'PONTA_EIXO_SECUNDARIA', 'PONTA_EIXO_EMENDA'],
    FLANGES: ['FLANGE_CIRCULAR', 'FLANGE_CEGO', 'FLANGE_FURACAO'],
    CHAPARIA: ['CHAPA_RETANGULAR', 'CHAPA_DOBRADA', 'BASE_SIMPLES'],
    ESTRUTURAS: ['MAO_FRANCESA', 'SUPORTE_SIMPLES', 'BASE_MANCAL'],
    TRANSICOES: ['QUADRADO_REDONDO', 'REDUCAO_CONCENTRICA'],
  };

  const paramsBySubtype = {
    PONTA_EIXO_PRINCIPAL: ['medidaPonta', 'comprimentoPonta', 'assento1', 'comprimentoAssento1', 'assento2', 'comprimentoAssento2', 'encosto', 'comprimentoTotal', 'furacoes', 'espacamento'],
    PONTA_EIXO_SECUNDARIA: ['medidaPonta', 'comprimentoPonta', 'assento1', 'comprimentoTotal'],
    PONTA_EIXO_EMENDA: ['diametro', 'comprimentoTotal', 'insercaoTubo'],
    FLANGE_CIRCULAR: ['diametroExterno', 'diametroInterno', 'espessura', 'numeroFuros', 'diametroFuros', 'diametroPrimitivo'],
    FLANGE_CEGO: ['diametroExterno', 'espessura', 'numeroFuros', 'diametroFuros'],
    FLANGE_FURACAO: ['diametroExterno', 'diametroInterno', 'numeroFuros', 'diametroFuros', 'diametroPrimitivo'],
    CHAPA_RETANGULAR: ['largura', 'altura', 'espessura'],
    CHAPA_DOBRADA: ['largura', 'altura', 'espessura', 'angulo'],
    BASE_SIMPLES: ['largura', 'altura', 'espessura', 'furacoes'],
    MAO_FRANCESA: ['base', 'altura', 'espessura', 'furacoes'],
    SUPORTE_SIMPLES: ['base', 'altura', 'espessura'],
    BASE_MANCAL: ['base', 'altura', 'largura', 'espessura'],
    QUADRADO_REDONDO: ['ladoQuadrado', 'diametro', 'altura', 'espessura'],
    REDUCAO_CONCENTRICA: ['diametroMaior', 'diametroMenor', 'altura', 'espessura'],
  };

  const categoria = document.getElementById('categoriaSelect');
  const subtipo = document.getElementById('subtipoSelect');
  const paramFields = document.getElementById('paramFields');
  if (!categoria || !subtipo || !paramFields) return;

  const initial = window.DT_INITIAL || {};

  function buildSubtypeOptions(cat, selected) {
    const list = categoryMap[cat] || [];
    subtipo.innerHTML = '<option value="">Subtipo</option>' + list.map((s) => `<option ${selected === s ? 'selected' : ''} value="${s}">${s}</option>`).join('');
  }

  function renderParamFields(sub) {
    const fields = paramsBySubtype[sub] || [];
    paramFields.innerHTML = fields
      .map((name) => `<input class="input dt-param" type="number" step="any" min="0" name="param_${name}" placeholder="${name}" value="${initial.params?.[name] ?? ''}">`)
      .join('');
  }

  function bindInputs() {
    document.querySelectorAll('.dt-param').forEach((i) => i.addEventListener('input', renderSvgPreview));
  }

  function renderSvgPreview() {
    const pane = document.getElementById('svgPreview');
    const summary = document.getElementById('technicalSummary');
    if (!pane || !summary) return;

    const vals = [...document.querySelectorAll('.dt-param')]
      .map((i) => `${i.name.replace('param_', '')}: ${i.value || '-'} mm`)
      .join('<br>');
    summary.innerHTML = `<b>Categoria:</b> ${categoria.value || '-'}<br><b>Subtipo:</b> ${subtipo.value || '-'}<br>${vals}`;

    pane.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="420">
      <rect x="20" y="20" width="760" height="460" fill="white" stroke="#0f172a"/>
      <text x="40" y="52" font-size="16" fill="#14532d">Prévia técnica em tempo real</text>
      <text x="40" y="90" font-size="14" fill="#1f2937">${categoria.value || ''} / ${subtipo.value || ''}</text>
      <line x1="60" y1="280" x2="740" y2="280" stroke="#cbd5e1" stroke-dasharray="6 4"/>
      <line x1="400" y1="110" x2="400" y2="420" stroke="#cbd5e1" stroke-dasharray="6 4"/>
      <rect x="250" y="180" width="300" height="140" fill="none" stroke="#0f172a" stroke-width="2"/>
      <text x="400" y="350" text-anchor="middle" font-size="12" fill="#334155">Cotas automáticas, linhas de centro e vistas serão geradas no SVG final.</text>
    </svg>`;
  }

  categoria.addEventListener('change', () => {
    buildSubtypeOptions(categoria.value, '');
    initial.params = {};
    renderParamFields('');
    renderSvgPreview();
  });

  subtipo.addEventListener('change', () => {
    renderParamFields(subtipo.value);
    bindInputs();
    renderSvgPreview();
  });

  buildSubtypeOptions(initial.categoria || categoria.value, initial.subtipo || '');
  if (initial.subtipo) renderParamFields(initial.subtipo);
  bindInputs();
  renderSvgPreview();
})();
