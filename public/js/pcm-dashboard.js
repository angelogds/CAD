(function(){
  const endpoints=window.PCM_DASHBOARD_ENDPOINTS||{base:'/pcm/dashboard-gerencial',data:'/pcm/dashboard-gerencial/dados',pdf:'/pcm/dashboard-gerencial/pdf'};
  const state={charts:{},data:window.PCM_DASHBOARD_INITIAL||null,lastQuery:new URLSearchParams(location.search)};
  const $=(s,root=document)=>root.querySelector(s); const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
  const COLORS={green:'#159947',greenDark:'#107136',teal:'#15989a',blue:'#2788ca',red:'#d94b47',orange:'#ed941e',amber:'#e5a50a',slate:'#718096',ink:'#10233e',muted:'#68778a',grid:'rgba(82,98,115,.10)'};
  const fmt=(v,suffix='')=>v===null||typeof v==='undefined'||Number.isNaN(Number(v))?'Dados insuficientes':`${v}${suffix}`;
  const money=(cents)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents||0)/100);
  const compactMoney=(cents)=>{const value=Number(cents||0)/100;if(Math.abs(value)>=1e6)return `R$ ${(value/1e6).toFixed(1).replace('.',',')} mi`;if(Math.abs(value)>=1e3)return `R$ ${(value/1e3).toFixed(1).replace('.',',')} mil`;return money(cents);};
  const compact=(label,max=28)=>String(label??'-').length>max?`${String(label).slice(0,max-1)}…`:String(label??'-');
  function destroy(id){if(state.charts[id]){state.charts[id].destroy();delete state.charts[id];}}
  function noData(id,show){const box=$(`#${id}`)?.closest('.pcm-director-panel, .pcm-card')?.querySelector('.pcm-empty');if(box)box.style.display=show?'grid':'none';}
  function rows(k){return Array.isArray(state.data?.graficos?.[k])?state.data.graficos[k]:[];}
  function tr(v){return String(v??'-').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));}
  function gradient(chart,from,to,horizontal=false){const area=chart.chartArea;if(!area)return from;const g=horizontal?chart.ctx.createLinearGradient(area.left,0,area.right,0):chart.ctx.createLinearGradient(0,area.bottom,0,area.top);g.addColorStop(0,from);g.addColorStop(1,to);return g;}
  function baseOptions({horizontal=false,currency=false,legend=false,links=null}={}){
    return {
      responsive:true,maintainAspectRatio:false,animation:{duration:520,easing:'easeOutQuart'},
      interaction:{mode:'nearest',intersect:false},
      layout:{padding:{top:8,right:8,bottom:4,left:4}},
      onClick:links?(event,elements)=>{const point=elements?.[0];if(!point)return;const href=links[point.index];if(href)location.href=href;}:undefined,
      plugins:{
        legend:{display:legend,position:'bottom',labels:{usePointStyle:true,boxWidth:8,boxHeight:8,padding:16,color:COLORS.muted,font:{size:11,weight:'600'}}},
        tooltip:{backgroundColor:'rgba(15,35,62,.94)',titleColor:'#fff',bodyColor:'#eef7f1',padding:11,cornerRadius:9,displayColors:true,callbacks:{label:(ctx)=>{const raw=Number(ctx.raw||0);return ` ${ctx.dataset.label||'Total'}: ${currency?money(raw):new Intl.NumberFormat('pt-BR').format(raw)}`;}}}
      },
      scales:{
        x:{beginAtZero:horizontal,grid:{display:false},border:{display:false},ticks:{color:COLORS.muted,font:{size:10},callback:currency?value=>compactMoney(Number(value)):undefined,maxRotation:0}},
        y:{beginAtZero:!horizontal,grid:{color:COLORS.grid,drawTicks:false},border:{display:false},ticks:{color:COLORS.muted,font:{size:10},padding:7,callback:horizontal?undefined:(currency?value=>compactMoney(Number(value)):undefined)}}
      }
    };
  }
  function bar(id,labels,data,opts={}){
    const el=$(`#${id}`);if(!el||typeof Chart==='undefined')return;destroy(id);const values=data.map(Number);const has=labels?.length&&values.some(n=>n>0);noData(id,!has);if(!has)return;
    const background=Array.isArray(opts.colors)?opts.colors:(ctx=>gradient(ctx.chart,opts.from||'#dff4e7',opts.to||COLORS.green,!!opts.horizontal));
    state.charts[id]=new Chart(el,{type:'bar',data:{labels:labels.map(x=>compact(x,opts.labelMax||30)),datasets:[{label:opts.label||'Total',data:values,backgroundColor:background,borderColor:opts.border||'transparent',borderWidth:opts.borderWidth||0,borderRadius:9,borderSkipped:false,barPercentage:.78,categoryPercentage:.72}]},options:baseOptions({horizontal:!!opts.horizontal,currency:!!opts.currency,legend:!!opts.legend,links:opts.links})});
  }
  function line(id,labels,datasets,{currency=false}={}){
    const el=$(`#${id}`);if(!el||typeof Chart==='undefined')return;destroy(id);const has=labels?.length&&datasets.some(ds=>ds.data.some(v=>Number(v)>0));noData(id,!has);if(!has)return;
    state.charts[id]=new Chart(el,{type:'line',data:{labels:labels.map(x=>compact(x,18)),datasets:datasets.map((ds,index)=>({label:ds.label,data:ds.data.map(Number),borderColor:ds.color||[COLORS.green,COLORS.blue,COLORS.orange][index%3],backgroundColor:(ctx)=>gradient(ctx.chart,ds.fillFrom||'rgba(21,153,71,.04)',ds.fillTo||'rgba(21,153,71,.22)'),borderWidth:2.4,tension:.38,fill:ds.fill!==false,pointRadius:3,pointHoverRadius:5,pointBackgroundColor:'#fff',pointBorderWidth:2}))},options:baseOptions({currency,legend:datasets.length>1})});
  }
  function doughnut(id,labels,data,opts={}){
    const el=$(`#${id}`);if(!el||typeof Chart==='undefined')return;destroy(id);const values=data.map(Number);const has=labels?.length&&values.some(n=>n>0);noData(id,!has);if(!has)return;
    const palette=opts.colors||[COLORS.green,COLORS.teal,COLORS.orange,COLORS.blue,COLORS.red,COLORS.slate];
    state.charts[id]=new Chart(el,{type:'doughnut',data:{labels:labels.map(x=>compact(x,24)),datasets:[{label:opts.label||'Total',data:values,backgroundColor:palette,borderColor:'#fff',borderWidth:4,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',animation:{duration:520},plugins:{legend:{display:true,position:'bottom',labels:{usePointStyle:true,boxWidth:8,padding:14,color:COLORS.muted,font:{size:10,weight:'600'}}},tooltip:{backgroundColor:'rgba(15,35,62,.94)',padding:11,cornerRadius:9,callbacks:{label:(ctx)=>` ${ctx.label}: ${new Intl.NumberFormat('pt-BR').format(Number(ctx.raw||0))}`}}}}});
  }
  function renderCards(){const cards=state.data?.cards||{};$$('[data-card]').forEach(el=>{const key=el.dataset.card;const suffix=el.dataset.suffix||'';const target=$('.pcm-kpi-value',el)||el;if(target)target.textContent=fmt(cards[key],suffix);});$$('[data-card-money]').forEach(el=>{el.textContent=money(cards[el.dataset.cardMoney]);});}
  function renderTables(){
    const falhas=rows('falhas_equipamento');const ranking=$('#rankingFalhas');if(ranking)ranking.innerHTML=falhas.slice(0,5).map((e,i)=>`<tr><td>${i+1}</td><td><a href="/equipamentos/${tr(e.equipamento_id)}">${tr(e.nome)}</a></td><td>${tr(e.setor)}</td><td>${tr(e.falhas)}</td><td>${tr(e.falhas_criticas||0)}</td><td>${tr(e.reincidencias||0)}</td><td>${tr(e.media_dias_entre_falhas||'Dados insuficientes')}</td><td>${tr((e.ultima_ocorrencia||'').slice(0,10))}</td><td><span class="pcm-pill ${String(e.criticidade).toUpperCase().includes('ALTA')?'red':''}">${tr(e.criticidade||'Normal')}</span></td><td><a class="pcm-btn pcm-btn-ghost" href="/equipamentos/${tr(e.equipamento_id)}">Histórico</a></td></tr>`).join('')||'<tr><td colspan="10">Não foram encontrados dados para os filtros selecionados.</td></tr>';
    const crit=state.data?.equipamentos_atencao||[];const table=$('#equipAtencao');if(table)table.innerHTML=crit.slice(0,8).map(e=>`<tr><td><a href="/equipamentos/${tr(e.equipamento_id||e.id)}">${tr(e.nome)}</a></td><td>${tr(e.setor)}</td><td><span class="pcm-pill red">${tr(e.criticidade||'Atenção')}</span></td><td>${tr((e.motivos||[]).join('; '))}<br><small>Sugestão do sistema — requer avaliação da Manutenção/PCM.</small></td><td>${tr(e.falhas)}</td><td>${tr((e.ultima_ocorrencia||'').slice(0,10))}</td><td>${tr(e.situacao||'Necessita avaliação')}</td><td>${tr(e.responsavel||'-')}</td></tr>`).join('')||'<tr><td colspan="8">Nenhum equipamento excedeu os limites configurados.</td></tr>';
  }
  function renderQuality(){const q=state.data?.qualidade_dados||{};$('[data-quality]').forEach(el=>{el.textContent=fmt(q[el.dataset.quality],'%');});const status=$('[data-quality-status]');if(status)status.textContent=q.status_label||'Sem dados suficientes';const list=$('#qualityPendencias');if(list)list.innerHTML=(q.campos_pendentes||[]).map(item=>`<li>${tr(item)}</li>`).join('')||'<li>Base mínima atendida para os campos avaliados.</li>';}
  function renderReliability(){const r=state.data?.confiabilidade||{};const status=$('[data-reliability-status]');if(status){status.textContent=r.status_label||'Dados insuficientes';status.classList.toggle('pending',!r.publicado);}}
  function renderCharts(){
    const falhas=rows('falhas_equipamento').slice(0,6);
    bar('chartTopFalhas',falhas.map(x=>x.nome),falhas.map(x=>x.falhas),{horizontal:true,label:'Falhas',from:'#fde8e7',to:COLORS.red,labelMax:34,links:falhas.map(x=>x.equipamento_id?`/equipamentos/${x.equipamento_id}`:null)});
    const paradas=rows('confiabilidade_equipamento').filter(x=>Number(x.tempo_parada_horas||0)>0).slice(0,7);
    bar('chartParadasEquipamentos',paradas.map(x=>x.equipamento_nome),paradas.map(x=>x.tempo_parada_horas),{horizontal:true,label:'Horas de parada',from:'#fff0df',to:COLORS.orange,labelMax:32,links:paradas.map(x=>x.equipamento_id?`/equipamentos/${x.equipamento_id}`:null)});
    const tipos=rows('tipos_manutencao');doughnut('chartCorPrev',tipos.map(x=>x.tipo),tipos.map(x=>x.total),{label:'Intervenções',colors:[COLORS.green,COLORS.orange,COLORS.blue,COLORS.teal]});
    const osMes=rows('os_mes');line('chartOsMes',osMes.map(x=>x.mes),[{label:'Ordens de serviço',data:osMes.map(x=>x.total),color:COLORS.green}],{});
    const status=rows('os_status');doughnut('chartStatus',status.map(x=>String(x.status||'-').replaceAll('_',' ')),status.map(x=>x.total),{label:'OS',colors:[COLORS.green,COLORS.teal,COLORS.orange,COLORS.red,COLORS.blue,COLORS.slate]});
    const backlog=rows('backlog_idade');bar('chartBacklogIdade',backlog.map(x=>x.faixa),backlog.map(x=>x.total),{label:'OS pendentes',colors:['#7cc99a','#e7bd54','#ef9441','#d94b47'],legend:false});
    const reinc=rows('reincidencia_corretiva').slice(0,7);bar('chartReincidencia',reinc.map(x=>x.nome),reinc.map(x=>x.repeticoes_apos_primeira),{horizontal:true,label:'Repetições',from:'#fff0df',to:COLORS.orange,labelMax:32,links:reinc.map(x=>x.equipamento_id?`/equipamentos/${x.equipamento_id}`:null)});
    const custos=rows('custos_equipamento').slice(0,8);bar('chartCustosEquipamentos',custos.map(x=>x.equipamento_nome),custos.map(x=>x.consumido_centavos),{horizontal:true,label:'Custo consumido',from:'#dff5e7',to:COLORS.green,currency:true,labelMax:34,links:custos.map(x=>x.equipamento_id?`/equipamentos/${x.equipamento_id}`:null)});
    const meses=rows('custos_mes');line('chartCustosMes',meses.map(x=>x.mes),[{label:'Consumido',data:meses.map(x=>x.consumido_centavos),color:COLORS.green,fillFrom:'rgba(21,153,71,.03)',fillTo:'rgba(21,153,71,.20)'},{label:'Comprado',data:meses.map(x=>x.comprado_centavos),color:COLORS.blue,fill:false}],{currency:true});
  }
  function renderAll(){if(!state.data)return;renderCards();renderTables();renderQuality();renderReliability();renderCharts();const period=$('#periodoResumo');if(period)period.textContent=`Período analisado: ${state.data.filtros.data_inicial} a ${state.data.filtros.data_final}`;const last=$('#lastUpdate');if(last)last.textContent=new Date().toLocaleString('pt-BR');}
  async function load(params){$('.pcm-loading')?.classList.add('active');try{const res=await fetch(endpoints.data+'?'+params.toString(),{headers:{Accept:'application/json'}});const json=await res.json();if(!res.ok||!json.ok)throw new Error(json.message||'Falha ao carregar dados');state.data=json.dashboard;state.lastQuery=params;history.replaceState(null,'','?'+params.toString());renderAll();}catch(e){alert('Não foi possível atualizar o painel. Verifique os filtros e tente novamente.');console.error('[PCM Dashboard]',e);}finally{$('.pcm-loading')?.classList.remove('active');}}
  const form=$('#pcmFilters');$('[name="periodo"]',form)?.addEventListener('change',e=>{if(e.currentTarget.value!=='personalizado'){const ini=$('[name="data_inicial"]',form),fim=$('[name="data_final"]',form);if(ini)ini.value='';if(fim)fim.value='';}});form?.addEventListener('submit',e=>{e.preventDefault();load(new URLSearchParams(new FormData(e.currentTarget)));});$('#btnAtualizar')?.addEventListener('click',()=>load(new URLSearchParams(new FormData(form))));$('#btnLimpar')?.addEventListener('click',()=>{location.href=endpoints.base;});$('#btnMobileFilters')?.addEventListener('click',()=>$('.pcm-filters')?.classList.toggle('open'));$('#btnFull')?.addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();});$('#btnPdf')?.addEventListener('click',()=>{location.href=endpoints.pdf+'?'+new URLSearchParams(new FormData(form)).toString();});document.addEventListener('DOMContentLoaded',renderAll);if(document.readyState!=='loading')renderAll();
})();
