const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('perfil Coordenador de Manutenção existe no RBAC e cadastro',()=>{
 const rbac=read('config/rbac.js');
 const controller=read('modules/usuarios/usuarios.controller.js');
 const service=read('modules/usuarios/usuarios.service.js');
 assert.match(rbac,/COORDENADOR_MANUTENCAO/);
 assert.match(controller,/Coordenador de Manutenção/);
 assert.match(service,/COORDENADOR_MANUTENCAO/);
});

test('coordenador acessa novas funcionalidades de gestão da manutenção',()=>{
 const rbac=read('config/rbac.js');
 ['pcm','pcm_manage','preventivas_view','preventivas_manage','equipamentos','os_view','os_open','demandas_view','solicitacoes_read','acompanhamento_compras'].forEach(key=>{
   const line=rbac.split('\n').find(l=>l.includes(key+':'));
   assert.ok(line && line.includes('ROLE.COORDENADOR_MANUTENCAO'),key+' deve liberar coordenador');
 });
});

test('coordenador não recebe privilégios administrativos sensíveis',()=>{
 const rbac=read('config/rbac.js');
 ['usuarios','usuarios_delete','rh_sensitive','compras_manage','almoxarifado_manage','estoque_manage'].forEach(key=>{
   const line=rbac.split('\n').find(l=>l.includes(key+':'));
   assert.ok(line && !line.includes('ROLE.COORDENADOR_MANUTENCAO'),key+' deve permanecer restrito');
 });
});

test('migração preserva usuários e valida foreign keys',()=>{
 const migration=read('database/migrations/215_users_add_coordenador_manutencao.js');
 assert.match(migration,/INSERT INTO .* SELECT .* FROM users/s);
 assert.match(migration,/PRAGMA foreign_key_check/);
 assert.doesNotMatch(migration,/DELETE FROM users/);
});

test('perfil deriva função e setor corretos',()=>{
 const perfil=read('modules/usuarios/usuarios.perfil.js');
 assert.match(perfil,/COORDENADOR_MANUTENCAO: \{ funcao: 'Coordenador de Manutenção', setor: 'RECICLAGEM'/);
});
