"use strict";

// Relatório somente leitura, por item comprado e com previsão do item antes da solicitação.
// Não soma quantidades de unidades distintas e não altera registros operacionais.

function isoValida(valor) {
  const iso = String(valor || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const data = new Date(iso + "T12:00:00Z");
  return Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== iso ? "" : iso;
}

function gerarResumoAtrasos(linhas = [], hoje = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date())) {
  if (!isoValida(hoje)) throw new Error("Data de referência inválida.");
  const atrasados = [], semPrevisao = [], noPrazo = [];
  const fornecedores = new Map();
  for (const linha of linhas) {
    const comprada = Number(linha.qtd_comprada);
    const recebida = Number(linha.qtd_recebida);
    if (!Number.isFinite(comprada) || !(comprada > 0) || !Number.isFinite(recebida)) continue;
    const pendente = Math.max(0, comprada - Math.max(0, recebida));
    if (!(pendente > 0)) continue;
    const fornecedor = String(linha.fornecedor_nome || "").trim() || "Fornecedor não informado";
    const previsao = isoValida(linha.previsao_entrega);
    const diasAtraso = previsao && previsao < hoje
      ? Math.round((Date.parse(hoje + "T12:00:00Z") - Date.parse(previsao + "T12:00:00Z")) / 86400000) : 0;
    const item = {
      solicitacaoId: Number(linha.solicitacao_id), numero: String(linha.numero || linha.solicitacao_id),
      nome: String(linha.item_nome || "Material sem descrição"),
      fornecedor, unidade: String(linha.unidade || "UN"),
      comprada, recebida: Math.max(0, recebida), pendente, previsao: previsao || null, diasAtraso
    };
    if (!previsao) { semPrevisao.push(item); continue; }
    if (previsao >= hoje) { noPrazo.push(item); continue; }
    atrasados.push(item);
    const chave = fornecedor.toLocaleLowerCase("pt-BR");
    if (!fornecedores.has(chave)) fornecedores.set(chave, {
      nome: fornecedor, itensAtrasados: 0, pedidos: new Set(), maiorAtrasoDias: 0
    });
    const grupo = fornecedores.get(chave);
    grupo.itensAtrasados++;
    grupo.pedidos.add(item.solicitacaoId);
    grupo.maiorAtrasoDias = Math.max(grupo.maiorAtrasoDias, diasAtraso);
  }
  atrasados.sort((a,b) => a.fornecedor.localeCompare(b.fornecedor, "pt-BR")
    || b.diasAtraso-a.diasAtraso || a.numero.localeCompare(b.numero, "pt-BR"));
  semPrevisao.sort((a,b) => a.fornecedor.localeCompare(b.fornecedor, "pt-BR"));
  const porFornecedor = [...fornecedores.values()].map(g => ({
    nome:g.nome, itensAtrasados:g.itensAtrasados, pedidosAtrasados:g.pedidos.size,
    maiorAtrasoDias:g.maiorAtrasoDias
  })).sort((a,b) => b.itensAtrasados-a.itensAtrasados || a.nome.localeCompare(b.nome,"pt-BR"));
  return {
    hoje, atrasados, semPrevisao, porFornecedor,
    resumo: { fornecedoresAtrasados:porFornecedor.length, itensAtrasados:atrasados.length,
      pedidosAtrasados:new Set(atrasados.map(i=>i.solicitacaoId)).size,
      semPrevisao:semPrevisao.length, itensNoPrazo:noPrazo.length }
  };
}

function listarAtrasosPorFornecedor(hoje, options = {}) {
  // Injeção opcional permite validar a SQL em SQLite isolado, sem acessar o banco de produção.
  const db = options.db || require("../../database/db");
  const ALMOX_STATUS = options.status || require("./almoxarifado.service").ALMOX_STATUS;
  const temTabela = nome => Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(nome));
  if (!temTabela("solicitacoes") || !temTabela("solicitacao_itens")) return gerarResumoAtrasos([], hoje);
  const colunas = nome => new Set(db.prepare("PRAGMA table_info(" + nome + ")").all().map(c=>c.name));
  const si = colunas("solicitacao_itens"), s = colunas("solicitacoes");
  const f = temTabela("fornecedores") ? colunas("fornecedores") : new Set();
  const expr = (cols, alias, col, padrao="NULL") => cols.has(col) ? alias+"."+col : padrao;
  const fornecedor = alias => {
    if (!f.size) return [];
    return ["nome_fantasia","nome"].filter(col=>f.has(col))
      .map(col=>`NULLIF(TRIM(${alias}.${col}), '')`);
  };
  const forItem = f.size && si.has("fornecedor_id");
  const forSol = f.size && s.has("fornecedor_id");
  const nomeFornecedor = [
    ...(forItem ? fornecedor("fi") : []),
    ...(forSol ? fornecedor("fs") : []),
    ...(s.has("fornecedor") ? ["NULLIF(TRIM(s.fornecedor), '')"] : []),
    "'Fornecedor não informado'"
  ];
  const nomeItem = ["item_nome", "item_descricao", "descricao"].filter(col=>si.has(col))
    .map(col=>`NULLIF(TRIM(si.${col}), '')`);
  const comprado = expr(si, "si", "qtd_comprada", "0");
  const recebido = expr(si, "si", "qtd_recebida_total", "0");
  const linhas = db.prepare(`
    SELECT si.id, s.id AS solicitacao_id, s.numero,
      COALESCE(${[...nomeItem, "'Material sem descrição'"].join(", ")}) AS item_nome,
      ${expr(si,"si","unidade","'UN'")} AS unidade,
      COALESCE(${comprado}, 0) AS qtd_comprada,
      COALESCE(${recebido}, 0) AS qtd_recebida,
      COALESCE(${nomeFornecedor.join(", ")}) AS fornecedor_nome,
      COALESCE(${[expr(si,"si","previsao_entrega"),expr(s,"s","previsao_entrega")].map(x=>x==="NULL"?"NULL":`NULLIF(TRIM(${x}), '')`).join(", ")}) AS previsao_entrega
    FROM solicitacao_itens si
    JOIN solicitacoes s ON s.id = si.solicitacao_id
    ${forItem ? "LEFT JOIN fornecedores fi ON fi.id=si.fornecedor_id" : ""}
    ${forSol ? "LEFT JOIN fornecedores fs ON fs.id=s.fornecedor_id" : ""}
    WHERE s.status IN (${ALMOX_STATUS.map(() => "?").join(",")})
      AND COALESCE(${comprado}, 0) > COALESCE(${recebido}, 0)
    ORDER BY s.id DESC, si.id DESC
  `).all(...ALMOX_STATUS);
  return gerarResumoAtrasos(linhas, hoje);
}

module.exports = { isoValida, gerarResumoAtrasos, listarAtrasosPorFornecedor };
