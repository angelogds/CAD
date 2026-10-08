"use strict";

// Relatório gerencial somente leitura. Nunca reconstitui saldos somando movimentações.
function moedaCentavos(valor) { return Math.round(Number(valor || 0) * 100); }
function numero(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function dataValida(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return false;
  const d = new Date(v + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function hojeLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
}
function diasAntes(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function periodoSeguro(query = {}, hoje = hojeLocal()) {
  const modo = ["7d", "30d", "mes", "ano", "personalizado"].includes(query.periodo) ? query.periodo : "30d";
  let inicio = modo === "7d" ? diasAntes(hoje, 6) : modo === "30d" ? diasAntes(hoje, 29)
    : modo === "mes" ? hoje.slice(0, 7) + "-01" : modo === "ano" ? hoje.slice(0, 4) + "-01-01" : hoje;
  let fim = hoje;
  if (modo === "personalizado") {
    if (!dataValida(query.inicio) || !dataValida(query.fim) || query.inicio > query.fim || query.fim > hoje
      || query.inicio < diasAntes(hoje, 365)) throw new Error("Escolha datas válidas, até hoje, com intervalo máximo de 366 dias.");
    inicio = query.inicio;
    fim = query.fim;
  }
  return { modo, inicio, fim, corte90: diasAntes(hoje, 90), hoje };
}
function consolidar(itens = [], movimentos = [], ultimasSaidas = [], periodo = periodoSeguro()) {
  const saidasPorId = new Map(ultimasSaidas.map(r => [Number(r.item_id), String(r.ultima_saida || "").slice(0, 10)]));
  const porItem = new Map();
  let estoqueCentavos = 0, itensSemValor = 0, itensComSaldo = 0;
  for (const i of itens) {
    const saldo = Math.max(0, numero(i.saldo_atual));
    const custo = numero(i.custo_unit);
    const precoConhecido = custo > 0;
    if (saldo > 0) {
      itensComSaldo++;
      if (precoConhecido) estoqueCentavos += moedaCentavos(saldo * custo);
      else itensSemValor++;
    }
    porItem.set(Number(i.id), {
      id: Number(i.id), nome: String(i.nome || "Material sem nome"), unidade: String(i.unidade || "UN"),
      saldo, custoUnitario: precoConhecido ? custo : null, valorSaldoCentavos: precoConhecido ? moedaCentavos(saldo * custo) : null,
      criadoEm: String(i.created_at || "").slice(0,10), ultimaSaida: saidasPorId.get(Number(i.id)) || null,
      qtdSaida: 0, qtdEntrada: 0, saidas: 0, entradas: 0, valorSaidaCentavos: 0,
    });
  }
  let entradas = 0, saidas = 0, valorEntradaCentavos = 0, valorSaidaCentavos = 0;
  let entradasSemPreco = 0, saidasSemPreco = 0, valoresEstimados = 0;
  const series = new Map();
  const periodoDias = Math.round((new Date(periodo.fim + "T12:00:00Z") - new Date(periodo.inicio + "T12:00:00Z")) / 86400000) + 1;
  const agruparMes = periodoDias > 45;
  for (const mov of movimentos) {
    const tipo = String(mov.tipo || "").toUpperCase();
    const entrada = tipo.startsWith("ENTRADA");
    const saida = tipo.startsWith("SAIDA");
    if (!entrada && !saida) continue; // AJUSTES físicos não são compras nem consumo.
    const qtd = Math.abs(numero(mov.quantidade));
    if (!(qtd > 0)) continue;
    const item = porItem.get(Number(mov.item_id));
    if (!item) continue;
    const momento = String(mov.data_mov || "").slice(0,10);
    if (!dataValida(momento) || momento < periodo.inicio || momento > periodo.fim) continue;
    if (saida && (!item.ultimaSaida || momento > item.ultimaSaida)) item.ultimaSaida = momento;
    // custo_unit em movimentos/estoque é BRL; cotação de compras é em centavos.
    const precoMov = numero(mov.custo_unit);
    const precoCompra = numero(mov.valor_unitario_centavos) / 100;
    const preco = precoMov > 0 ? precoMov : precoCompra > 0 ? precoCompra : item.custoUnitario;
    const estimado = !(precoMov > 0 || precoCompra > 0);
    const centavos = preco > 0 ? moedaCentavos(qtd * preco) : 0;
    if (preco > 0 && estimado) valoresEstimados++;
    const chave = agruparMes ? momento.slice(0,7) : momento;
    if (!series.has(chave)) series.set(chave, { data: chave, entradas: 0, saidas: 0, valorEntradasCentavos: 0, valorSaidasCentavos: 0 });
    const periodoItem = series.get(chave);
    if (entrada) {
      entradas++; item.entradas++; item.qtdEntrada += qtd; valorEntradaCentavos += centavos;
      periodoItem.entradas++; periodoItem.valorEntradasCentavos += centavos;
      if (!(preco > 0)) entradasSemPreco++;
    } else {
      saidas++; item.saidas++; item.qtdSaida += qtd; item.valorSaidaCentavos += centavos;
      valorSaidaCentavos += centavos; periodoItem.saidas++; periodoItem.valorSaidasCentavos += centavos;
      if (!(preco > 0)) saidasSemPreco++;
    }
  }
  const materiais = [...porItem.values()];
  const maisSaidos = materiais.filter(i => i.qtdSaida > 0).sort((a,b) => b.saidas-a.saidas || b.qtdSaida-a.qtdSaida || a.nome.localeCompare(b.nome,"pt-BR")).slice(0,10);
  // Sem consumo nos últimos 90 dias E cadastro antigo o suficiente: não chamar material novo de obsoleto.
  const paradosTodos = materiais.filter(i => i.saldo > 0 && i.criadoEm && i.criadoEm <= periodo.corte90
    && (!i.ultimaSaida || i.ultimaSaida <= periodo.corte90))
    .sort((a,b) => (a.ultimaSaida || a.criadoEm).localeCompare(b.ultimaSaida || b.criadoEm));
  const parados = paradosTodos.slice(0,15);
  return {
    periodo, resumo: { itensCadastrados: materiais.length, itensComSaldo, estoqueCentavos, itensSemValor,
      registrosEntrada: entradas, registrosSaida: saidas, valorEntradaCentavos, valorSaidaCentavos,
      entradasSemPreco, saidasSemPreco, valoresEstimados, parados90d: paradosTodos.length },
    serie: [...series.values()].sort((a,b)=>a.data.localeCompare(b.data)),
    maisSaidos, parados, inventario: materiais.filter(i=>i.saldo>0).sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR")),
  };
}
function gerarRelatorio(query = {}) {
  const db = require("../../database/db");
  const temTabela = (t) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
  const colunas = (t) => temTabela(t) ? new Set(db.prepare("PRAGMA table_info(" + t + ")").all().map(c=>c.name)) : new Set();
  const periodo = periodoSeguro(query);
  if (!temTabela("estoque_itens")) return consolidar([], [], [], periodo);
  const ic = colunas("estoque_itens");
  const mc = colunas("estoque_movimentos");
  const sc = colunas("solicitacao_itens");
  const itemCol = (col, fallback="NULL") => ic.has(col) ? "i."+col : fallback;
  const itens = db.prepare(`SELECT i.id,i.nome, ${itemCol("unidade", "'UN'")} unidade,
    ${itemCol("saldo_atual", "0")} saldo_atual, ${itemCol("custo_unit")} custo_unit,
    ${itemCol("created_at")} created_at FROM estoque_itens i
    ${ic.has("ativo") ? "WHERE i.ativo=1" : ""} ORDER BY i.nome`).all();
  if (!mc.size || !mc.has("item_id") || !mc.has("tipo")) return consolidar(itens, [], [], periodo);
  const data = mc.has("data_mov") && mc.has("created_at") ? "COALESCE(m.data_mov,m.created_at)"
    : mc.has("data_mov") ? "m.data_mov" : mc.has("created_at") ? "m.created_at" : "NULL";
  const precoMov = mc.has("custo_unit") ? "m.custo_unit" : "NULL";
  const compraJoin = mc.has("solicitacao_item_id") && sc.has("valor_unitario_centavos")
    ? "LEFT JOIN solicitacao_itens si ON si.id=m.solicitacao_item_id" : "";
  const precoCompra = compraJoin ? "si.valor_unitario_centavos" : "NULL";
  const movimentos = db.prepare(`SELECT m.item_id,m.tipo,m.quantidade,${data} data_mov,
      ${precoMov} custo_unit,${precoCompra} valor_unitario_centavos
      FROM estoque_movimentos m ${compraJoin}
      WHERE date(${data}) BETWEEN ? AND ?
      AND (UPPER(m.tipo) LIKE 'ENTRADA%' OR UPPER(m.tipo) LIKE 'SAIDA%')`).all(periodo.inicio, periodo.fim);
  const ultimasSaidas = db.prepare(`SELECT m.item_id, MAX(date(${data})) ultima_saida
      FROM estoque_movimentos m WHERE UPPER(m.tipo) LIKE 'SAIDA%'
      GROUP BY m.item_id`).all();
  return consolidar(itens, movimentos, ultimasSaidas, periodo);
}
module.exports = { periodoSeguro, consolidar, gerarRelatorio };
