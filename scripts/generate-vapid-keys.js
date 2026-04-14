#!/usr/bin/env node
/**
 * Gerador de chaves VAPID para WebPush (COMINT)
 *
 * Uso:
 *   npm run generate:vapid
 *
 * As chaves geradas devem ser adicionadas como variáveis de ambiente no Railway:
 *   VAPID_PUBLIC_KEY  → chave pública (65 bytes decodificada)
 *   VAPID_PRIVATE_KEY → chave privada (32 bytes decodificada)
 *   VAPID_SUBJECT     → mailto:seu-email@dominio.com
 */

'use strict';

const webPush = require('web-push');

function decodeBase64Url(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLength), 'base64');
}

console.log('\n🔑 Gerando chaves VAPID válidas...\n');

const vapidKeys = webPush.generateVAPIDKeys();

const publicKeyBytes  = decodeBase64Url(vapidKeys.publicKey);
const privateKeyBytes = decodeBase64Url(vapidKeys.privateKey);

console.log('✅ Chaves geradas com sucesso!');
console.log(`   Public Key  → ${publicKeyBytes.length} bytes (esperado: 65)`);
console.log(`   Private Key → ${privateKeyBytes.length} bytes (esperado: 32)\n`);

if (publicKeyBytes.length !== 65 || privateKeyBytes.length !== 32) {
  console.error('❌ Tamanho inesperado nas chaves geradas. Verifique a versão do web-push.');
  process.exit(1);
}

console.log('─'.repeat(60));
console.log('📋 Copie as variáveis abaixo e adicione no Railway:\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@campodogado.local`);
console.log('─'.repeat(60));
console.log('\n📌 Como adicionar no Railway:');
console.log('   1. Acesse seu projeto em https://railway.app');
console.log('   2. Selecione o serviço CAD');
console.log('   3. Vá em Variables → New Variable');
console.log('   4. Adicione cada variável acima (nome e valor)');
console.log('   5. Faça o redeploy do serviço');
console.log('\n⚠️  Guarde as chaves em local seguro — elas não serão exibidas novamente.\n');
