const crypto = require('node:crypto');

function normalizeMemoryText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hashContent(value) {
  return crypto.createHash('sha256').update(normalizeMemoryText(value), 'utf8').digest('hex');
}

function chunkText(value, { maxChars = 1000, overlapChars = 150 } = {}) {
  const text = normalizeMemoryText(value);
  const max = Math.max(300, Math.min(4000, Number(maxChars || 1000)));
  const overlap = Math.max(0, Math.min(max - 100, Number(overlapChars || 150)));
  if (!text) return [];
  if (text.length <= max) return [text];

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const window = text.slice(start, end);
      const boundary = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('; '));
      if (boundary >= Math.floor(max * 0.55)) end = start + boundary + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;
    const next = Math.max(start + 1, end - overlap);
    start = next;
  }
  return chunks;
}

function flattenJsonText(value, prefix = '') {
  let parsed = value;
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return '';
    try { parsed = JSON.parse(raw); } catch (_e) { return normalizeMemoryText(raw); }
  }

  const lines = [];
  const walk = (node, path) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      const text = normalizeMemoryText(node);
      if (text) lines.push(path ? `${path}: ${text}` : text);
      return;
    }
    if (Array.isArray(node)) {
      node.slice(0, 100).forEach((item, index) => walk(item, path ? `${path}[${index + 1}]` : `[${index + 1}]`));
      return;
    }
    if (typeof node === 'object') {
      Object.entries(node).slice(0, 150).forEach(([key, item]) => {
        const safeKey = normalizeMemoryText(key).slice(0, 120);
        walk(item, path ? `${path}.${safeKey}` : safeKey);
      });
    }
  };
  walk(parsed, prefix);
  return normalizeMemoryText(lines.join('\n'));
}

function queryTokens(value) {
  return [...new Set(normalizeMemoryText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3))].slice(0, 30);
}

function lexicalScore(query, content) {
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const haystack = normalizeMemoryText(content)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  let hits = 0;
  for (const token of tokens) if (haystack.includes(token)) hits += 1;
  return hits / tokens.length;
}

module.exports = { normalizeMemoryText, hashContent, chunkText, flattenJsonText, queryTokens, lexicalScore };
