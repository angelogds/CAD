(function(){
  const endpoints=window.PCM_DASHBOARD_ENDPOINTS||{base:'/pcm/dashboard-gerencial',data:'/pcm/dashboard-gerencial/dados',pdf:'/pcm/dashboard-gerencial/pdf'};
  const state={charts:{},data:window.PCM_DASHBOARD_INITIAL||null,lastQuery:new URLSearchParams(location.search)};
  const $=(s,root=document)=>root.querySelector(s); const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
  const COLORS={green:'#159947',greenDark:'#107136',teal:'#15989a',blue:'#2788ca',red:'#d94b47',orange:'#ed941e',amber:'#e5a50a',slate:'#718096',ink:'#10233e',muted:'#68778a',grid:'rgba(82,98,115,.10)'};
  if(typeof Chart!=='undefined'){
    Chart.defaults.color=COLORS.muted;
    Chart.defaults.font.family='Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    Chart.defaults.font.size=11;
    Chart.defaults.animation.duration=620;
  }
  const fmt=(v,suffix='')=>v===null||typeof v==='undefined'||Number.isNaN(Number(v))?'Dados insuficientes':`${v}${suffix}`;
  const money=(cents)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents||0)/100);
  const compactMoney=(cents)=>{const value=Number(cents||0)/100;if(Math.abs(value)>=1e6)return `R$ ${(value/1e6).toFixed(1).replace('.',',')} mi`;if(Math.abs(value)>=1e3)return `R$ ${(value/1e3).toFixed(1).replace('.',',')} mil`;return money(cents);};
  const compact=(label,max=28)=>String(label??'-').length>max?`${String(label).slice(0,max-1)}…`:String(label??'-');
  function destroy(id){if(state.charts[id]){state.charts[id].destroy();delete state.charts[id];}}
  function noData(id,show){const box=$(`#${id}`)?.closest('.pcm-director-panel, .pcm-card')?.querySelector('.pcm-empty');if(box)box.style.display=show?'grid':'none';}
  function rows(k){return Array.isArray(state.data?.graficos?.[k])?state.data.graficos[k]:[];}
  function tr(v){return String(v??'-').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
  function dashboardHref(extra={}){
    const params=new URLSearchParams();
    Object.entries(state.data?.filtros||{}).forEach(([key,value])=>{if(value!==null&&typeof value!=='undefined'&&value!=='')params.set(key,String(value));});
    if(state.lastQuery){for(const [key,value] of state.lastQuery.entries()){if(value!=='')params.set(key,value);}}
    Object.entries(extra).forEach(([key,value])=>{if(value===null||typeof value==='undefined'||value==='')params.delete(key);else params.set(key,String(value));});
    params.delete('page');
    return `${endpoints.base}?${params.toString()}`;
  }
  function decorateChartPanel(id,{interactive=false,summary=''}={}){
    const canvas=$(`#${id}`);
    const panel=canvas?.closest('.pcm-director-panel');
    const chartWrap=canvas?.closest('.pcm-chart');
    if(!panel||!chartWrap)return;
    panel.classList.add('pcm-chart-panel--modern');
    let meta=panel.querySelector('.pcm-chart-modern-meta');
    if(!meta){meta=document.createElement('div');meta.className='pcm-chart-modern-meta';chartWrap.before(meta);}
    meta.innerHTML=`<span class="pcm-chart-badge${interactive?' is-interactive':''}"><i></i>${interactive?'Interativo':'Visão executiva'}</span><span class="pcm-chart-summary">${tr(summary)}</span>`;
  }
  const chartTotal=(values)=>values.reduce((sum,value)=>sum+(Number(value)||0),0);
  function ensureChartRuntime(){
    if(typeof Chart!=='undefined')return true;
    let alert=$('#pcmChartRuntimeAlert');
    if(!alert){
      alert=document.createElement('div');
      alert.id='pcmChartRuntimeAlert';
      alert.className='pcm-alert-box';
      alert.setAttribute('role','alert');
      alert.textContent='Os gráficos não puderam ser carregados. Atualize a página; se o problema persistir, a biblioteca gráfica está indisponível.';
      const intro=$('.pcm-analytics-intro');
      (intro?.parentNode||document.body).insertBefore(alert,intro||null);
    }
    console.error('[PCM Dashboard] Chart.js indisponível.');
    return false;
  }
  const centerTextPlugin={
    id:'pcmCenterText',
    afterDraw(chart,args,options){
      if(chart.config.type!=='doughnut'||!options?.text)return;
      const meta=chart.getDatasetMeta(0);const first=meta?.data?.[0];if(!first)return;
      const {ctx}=chart;ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle=COLORS.ink;ctx.font='800 22px Inter, system-ui, sans-serif';ctx.fillText(options.text,first.x,first.y-5);
      ctx.fillStyle=COLORS.muted;ctx.font='700 9px Inter, system-ui, sans-serif';ctx.fillText(String(options.label||'TOTAL').toUpperCase(),first.x,first.y+14);ctx.restore();
    }
  };
  function gradient(chart,from,to,horizontal=false){const area=chart.chartArea;if(!area)return from;const g=horizontal?chart.ctx.createLinearGradient(area.left,0,area.right,0):chart.ctx.createLinearGradient(0,area.bottom,0,area.top);g.addColorStop(0,from);g.addColorStop(1,to);return g;}
  function baseOptions({horizontal=false,currency=false,legend=false,links=null}={}){
    return {
      responsive:true,maintainAspectRatio:false,animation:{duration:620,easing:'easeOutQuart'},
      interaction:{mode:horizontal?'nearest':'index',intersect:false},
      layout:{padding:{top:12,right:10,bottom:4,left:4}},
      onClick:links?(event,elements)=>{const point=elements?.[0];if(!point)return;const href=links[point.index];if(href)location.href=href;}:undefined,
      onHover:links?(event,elements)=>{if(event?.native?.target)event.native.target.style.cursor=elements?.length?'pointer':'default';}:undefined,
      plugins:{
        legend:{display:legend,position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:18,color:COLORS.muted,font:{size:10,weight:'700'}}},
        tooltip:{backgroundColor:'rgba(12,30,52,.96)',titleColor:'#fff',bodyColor:'#f3f8f5',borderColor:'rgba(255,255,255,.10)',borderWidth:1,padding:12,cornerRadius:12,displayColors:true,boxPadding:5,caretPadding:8,callbacks:{label:(ctx)=>{const raw=Number(ctx.raw||0);return ` ${ctx.dataset.label||'Total'}: ${currency?money(raw):new Intl.NumberFormat('pt-BR').format(raw)}`;}}}
      },
      scales:{
        x:{beginAtZero:horizontal,grid:{display:false},border:{display:false},ticks:{color:COLORS.muted,font:{size:10,weight:'600'},padding:8,callback:currency?value=>compactMoney(Number(value)):undefined,maxRotation:0}},
        y:{beginAtZero:!horizontal,grid:{color:'rgba(82,98,115,.08)',drawTicks:false},border:{display:false},ticks:{color:COLORS.muted,font:{size:10,weight:'600'},padding:8,callback:horizontal?undefined:(currency?value=>compactMoney(Number(value)):undefined)}}
      }
    };
  }
  function bar(id,labels,data,opts={}){
    const el=$(`#${id}`);if(!el||typeof Chart==='undefined')return;destroy(id);const values=data.map(Number);const has=labels?.length&&values.some(n=>n>0);noData(id,!has);if(!has)return;
    const background=Array.isArray(opts.colors)?opts.colors:(ctx=>gradient(ctx.chart,opts.from||'#dff4e7',opts.to||COLORS.green,!!opts.horizontal));
    state.charts[id]=new Chart(el,{type:'bar',data:{labels:labels.map(x=>compact(x,opts.labelMax||30)),datasets:[{label:opts.label||'Total',data:values,backgroundColor:background,borderColor:opts.border||'rgba(255,255,255,.82)',borderWidth:opts.borderWidth??1,borderRadius:9,borderSkipped:false,barPercentage:.72,categoryPercentage:.68,hoverBorderWidth:2}]},options:baseOptions({horizontal:!!opts.horizontal,currency:!!opts.currency,legend:!!opts.legend,links:opts.links})});
    decorateChartPanel(id,{interactive:Boolean(opts.links?.some(Boolean)),summary:`${labels.length} ${labels.length===1?'item':'itens'}`});
  }
  function line(id,labels,datasets,{currency=false}={}){
    const el=$(`#${id}`);if(!el||typeof Chart==='undefined')return;destroy(id);const has=labels?.length&&datasets.some(ds=>ds.data.some(v=>Number(v)>0));noData(id,!has);if(!has)return;
    state.charts[id]=new Chart(el,{type:'line',data:{labels:labels.map(x=>compact(x,18)),datasets:datasets.map((ds,index)=>({label:ds.label,data:ds.data.map(Number),borderColor:ds.color||[COLORS.green,COLORS.blue,COLORS.orange][index%3],backgroundColor:(ctx)=>gradient(ctx.chart,ds.fillFrom||'rgba(21,153,71,.03)',ds.fillTo||'rgba(21,153,71,.18)'),borderWidth:2.6,tension:.4,cubicInterpolationMode:'monotone',fill:ds.fill!==false,pointRadius:0,pointHoverRadius:5,pointHitRadius:16,pointBackgroundColor:'#fff',pointBorderColor:ds.color||COLORS.green,pointBorderWidth:2}))},options:baseOptions({currency,legend:datasets.length>1})});
    decorateChartPanel(id,{summary:`${labels.length} ${labels.length===1?'período':'períodos'}`});
  }
  function doughnut(id,labels,data,opts={}){
    const el=$(`#${id}`);if(!el||typeof Chart==='undefined')return;destroy(id);const values=data.map(Number);const has=labels?.length&&values.some(n=>n>0);noData(id,!has);if(!has)return;
    const palette=opts.colors||[COLORS.green,COLORS.teal,COLORS.orange,COLORS.blue,COLORS.red,COLORS.slate];
    const links=opts.links||null;const total=chartTotal(values);
    state.charts[id]=new Chart(el,{type:'doughnut',plugins:[centerTextPlugin],data:{labels:labels.map(x=>compact(x,24)),datasets:[{label:opts.label||'Total',data:values,backgroundColor:palette,borderColor:'#fff',borderWidth:4,hoverBorderColor:'#fff',hoverBorderWidth:5,hoverOffset:8,spacing:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',animation:{duration:620,easing:'easeOutQuart'},onClick:links?(event,elements)=>{const point=elements?.[0];if(!point)return;const href=links[point.index];if(href)location.href=href;}:undefined,onHover:links?(event,elements)=>{if(event?.native?.target)event.native.target.style.cursor=elements?.length?'pointer':'default';}:undefined,plugins:{pcmCenterText:{text:new Intl.NumberFormat('pt-BR').format(total),label:opts.centerLabel||'total'},legend:{display:true,position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,padding:16,color:COLORS.muted,font:{size:10,weight:'700'}}},tooltip:{backgroundColor:'rgba(12,30,52,.96)',titleColor:'#fff',bodyColor:'#f3f8f5',borderColor:'rgba(255,255,255,.10)',borderWidth:1,padding:12,cornerRadius:12,boxPadding:5,callbacks:{label:(ctx)=>{const raw=Number(ctx.raw||0);const pct=total>0?(raw/total*100):0;return ` ${ctx.label}: ${new Intl.NumberFormat('pt-BR').format(raw)} · ${pct.toFixed(1).replace('.',',')}%`;}}}}}});
    decorateChartPanel(id,{interactive:Boolean(links?.some(Boolean)),summary:`${labels.length} ${labels.length===1?'categoria':'categorias'}`});
  }
  function renderCards(){const cards=state.data?.cards||{};$$('[data-card]').forEach(el=>{const key=el.dataset.card;const suffix=el.dataset.suffix||'';const target=$('.pcm-kpi-value',el)||el;if(target)target.textContent=fmt(cards[key],suffix);});$$('[data-card-money]').forEach(el=>{el.textContent=money(cards[el.dataset.cardMoney]);});}
  function renderTables(){
    const falhas=rows('falhas_equipamento');const ranking=$('#rankingFalhas');if(ranking)ranking.innerHTML=falhas.slice(0,5).map((e,i)=>`<tr><td>${i+1}</td><td><a href="/equipamentos/${tr(e.equipamento_id)}">${tr(e.nome)}</a></td><td>${tr(e.setor)}</td><td>${tr(e.falhas)}</td><td>${tr(e.falhas_criticas||0)}</td><td>${tr(e.reincidencias||0)}</td><td>${tr(e.media_dias_entre_falhas||'Dados insuficientes')}</td><td>${tr((e.ultima_ocorrencia||'').slice(0,10))}</td><td><span class="pcm-pill ${String(e.criticidade).toUpperCase().includes('ALTA')?'red':''}">${tr(e.criticidade||'Normal')}</span></td><td><a class="pcm-btn pcm-btn-ghost" href="/equipamentos/${tr(e.equipamento_id)}">Histórico</a></td></tr>`).join('')||'<tr><td colspan="10">Não foram encontrados dados para os filtros selecionados.</td></tr>';
    const crit=state.data?.equipamentos_atencao||[];const table=$('#equipAtencao');if(table)table.innerHTML=crit.slice(0,8).map(e=>{const equipamentoId=e.equipamento_id||e.id;return `<tr><td><a href="/equipamentos/${tr(equipamentoId)}">${tr(e.nome)}</a></td><td>${tr(e.setor)}</td><td><span class="pcm-pill red">${tr(e.criticidade||'Atenção')}</span></td><td>${tr((e.motivos||[]).join('; '))}<br><small>Sugestão do sistema — requer avaliação da Manutenção/PCM.</small></td><td>${tr(e.falhas)}</td><td>${tr((e.ultima_ocorrencia||'').slice(0,10))}</td><td>${tr(e.situacao||'Necessita avaliação')}</td><td>${tr(e.responsavel||'-')}</td><td><a class="pcm-btn pcm-btn-ghost" href="${tr(dashboardHref({equipamento_id:equipamentoId}))}">Analisar</a></td></tr>`}).join('')||'<tr><td colspan="9">Nenhum equipamento excedeu os limites configurados.</td></tr>';
  }
  function renderQuality(){const q=state.data?.qualidade_dados||{};$('[data-quality]').forEach(el=>{el.textContent=fmt(q[el.dataset.quality],'%');});const status=$('[data-quality-status]');if(status)status.textContent=q.status_label||'Sem dados suficientes';const list=$('#qualityPendencias');if(list)list.innerHTML=(q.campos_pendentes||[]).map(item=>`<li>${tr(item)}</li>`).join('')||'<li>Base mínima atendida para os campos avaliados.</li>';}
  function renderReliability(){const r=state.data?.confiabilidade||{};const status=$('[data-reliability-status]');if(status)status.textContent=r.status_label||'Dados insuficientes';}
  function renderCharts(){
    if(!ensureChartRuntime())return;
    const falhas=rows('falhas_equipamento').slice(0,6);
    bar('chartTopFalhas',falhas.map(x=>x.nome),falhas.map(x=>x.falhas),{horizontal:true,label:'Falhas',from:'#fde8e7',to:COLORS.red,labelMax:34,links:falhas.map(x=>x.equipamento_id?dashboardHref({equipamento_id:x.equipamento_id}):null)});
    const tipos=rows('tipos_manutencao');doughnut('chartCorPrev',tipos.map(x=>x.tipo),tipos.map(x=>x.total),{label:'Intervenções',colors:[COLORS.green,COLORS.orange,COLORS.blue,COLORS.teal],links:tipos.map(x=>x.tipo?dashboardHref({tipo_manutencao:String(x.tipo).toUpperCase()}):null)});
    const osMes=rows('os_mes');line('chartOsMes',osMes.map(x=>x.mes),[{label:'Ordens de serviço',data:osMes.map(x=>x.total),color:COLORS.green}],{});
    const status=rows('os_status');doughnut('chartStatus',status.map(x=>String(x.status||'-').replaceAll('_',' ')),status.map(x=>x.total),{label:'OS',colors:[COLORS.green,COLORS.teal,COLORS.orange,COLORS.red,COLORS.blue,COLORS.slate],links:status.map(x=>x.status?dashboardHref({status:String(x.status).toUpperCase()}):null)});
    const backlog=rows('backlog_idade');bar('chartBacklogIdade',backlog.map(x=>x.faixa),backlog.map(x=>x.total),{label:'OS pendentes',colors:['#7cc99a','#e7bd54','#ef9441','#d94b47'],legend:false});
    const reinc=rows('reincidencia_corretiva').slice(0,7);bar('chartReincidencia',reinc.map(x=>x.nome),reinc.map(x=>x.repeticoes_apos_primeira),{horizontal:true,label:'Repetições',from:'#fff0df',to:COLORS.orange,labelMax:32,links:reinc.map(x=>x.equipamento_id?dashboardHref({equipamento_id:x.equipamento_id}):null)});
    const custos=rows('custos_equipamento').slice(0,8);bar('chartCustosEquipamentos',custos.map(x=>x.equipamento_nome),custos.map(x=>x.consumido_centavos),{horizontal:true,label:'Custo consumido',from:'#dff5e7',to:COLORS.green,currency:true,labelMax:34,links:custos.map(x=>x.equipamento_id?dashboardHref({equipamento_id:x.equipamento_id}):null)});
    const meses=rows('custos_mes');line('chartCustosMes',meses.map(x=>x.mes),[{label:'Consumido',data:meses.map(x=>x.consumido_centavos),color:COLORS.green,fillFrom:'rgba(21,153,71,.03)',fillTo:'rgba(21,153,71,.20)'},{label:'Comprado',data:meses.map(x=>x.comprado_centavos),color:COLORS.orange,fill:false},{label:'Recebido',data:meses.map(x=>x.recebido_centavos),color:COLORS.blue,fill:false}],{currency:true});
  }
  function renderAll(){if(!state.data)return;renderCards();renderTables();renderQuality();renderReliability();renderCharts();const period=$('#periodoResumo');if(period)period.textContent=`Período analisado: ${state.data.filtros.data_inicial} a ${state.data.filtros.data_final}`;const last=$('#lastUpdate');if(last)last.textContent=new Date().toLocaleString('pt-BR');}
  async function load(params){$('.pcm-loading')?.classList.add('active');try{const res=await fetch(endpoints.data+'?'+params.toString(),{headers:{Accept:'application/json'}});const json=await res.json();if(!res.ok||!json.ok)throw new Error(json.message||'Falha ao carregar dados');state.data=json.dashboard;state.lastQuery=params;history.replaceState(null,'','?'+params.toString());renderAll();}catch(e){alert('Não foi possível atualizar o painel. Verifique os filtros e tente novamente.');console.error('[PCM Dashboard]',e);}finally{$('.pcm-loading')?.classList.remove('active');}}
  const form=$('#pcmFilters');$('[name="periodo"]',form)?.addEventListener('change',e=>{if(e.currentTarget.value!=='personalizado'){const ini=$('[name="data_inicial"]',form),fim=$('[name="data_final"]',form);if(ini)ini.value='';if(fim)fim.value='';}});form?.addEventListener('submit',e=>{e.preventDefault();load(new URLSearchParams(new FormData(e.currentTarget)));});$('#btnAtualizar')?.addEventListener('click',()=>load(new URLSearchParams(new FormData(form))));$('#btnLimpar')?.addEventListener('click',()=>{location.href=endpoints.base;});$('#btnMobileFilters')?.addEventListener('click',()=>$('.pcm-filters')?.classList.toggle('open'));$('#btnFull')?.addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();});$('#btnPdf')?.addEventListener('click',()=>{location.href=endpoints.pdf+'?'+new URLSearchParams(new FormData(form)).toString();});document.addEventListener('DOMContentLoaded',renderAll);if(document.readyState!=='loading')renderAll();
})();
