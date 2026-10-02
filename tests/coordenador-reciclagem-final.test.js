const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Coordenador da Reciclagem tem operação e não acessa PCM',()=>{
 const { ACCESS, ROLE }=require('../config/rbac');
 const r=ROLE.COORDENADOR_RECICLAGEM;
 ['painel_operacional','equipamentos','os_view','os_open','os_chat_read','solicitacoes_read','solicitacoes_create','demandas_view','diretoria_compras','preventivas_view'].forEach(k=>assert.ok(ACCESS[k].includes(r),k));
 ['pcm','pcm_manage','diretoria_aprovacao','compras_manage','almoxarifado_manage','usuarios'].forEach(k=>assert.ok(!ACCESS[k].includes(r),k));
 assert.deepEqual(ACCESS.pcm.sort(),[ROLE.ADMIN,ROLE.ENCARREGADO_MANUTENCAO].sort());
 assert.deepEqual(ACCESS.pcm_manage.sort(),[ROLE.ADMIN,ROLE.ENCARREGADO_MANUTENCAO].sort());
});

test('solicitações do coordenador ficam fixas na Reciclagem',()=>{
 const service=read('modules/solicitacoes/solicitacoes.service.js');
 assert.match(service,/COORDENADOR_RECICLAGEM.*RECICLAGEM|ENCARREGADO_MANUTENCAO.*COORDENADOR_RECICLAGEM/s);
});

test('acompanhamento do coordenador força filtro Reciclagem e bloqueia detalhe externo',()=>{
 const controller=read('modules/solicitacoes/solicitacoes.acompanhamento.controller.js');
 assert.match(controller,/COORDENADOR_RECICLAGEM.*query\.setor = 'RECICLAGEM'/s);
 assert.match(controller,/coordinatorCanView/);
 assert.match(controller,/Acesso restrito às compras da Reciclagem/);
});

test('aprovação de compra usa permissão diferente da consulta',()=>{
 const routes=read('modules/diretoria/diretoria.routes.js');
 assert.match(routes,/DIRETORIA_APROVACAO = ACCESS\.diretoria_aprovacao/);
 assert.match(routes,/aprovar-itens-cotados'.*requireRole\(DIRETORIA_APROVACAO\)/);
});

test('ADMIN usa identidade direta e pode emitir cartão do Almoxarifado',()=>{
 const perfil=read('modules/usuarios/usuarios.perfil.js');
 const vinculo=read('modules/meu-portal/meu-portal.vinculo.js');
 assert.match(perfil,/normalized === 'ADMIN'\) return true/);
 assert.match(vinculo,/MATERIAL_SELF_SERVICE_ROLES[\s\S]*'ADMIN'/);
});

test('migration remove CHECK legado de funcao sem perder usuários',()=>{
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE users (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   name TEXT NOT NULL,
   role TEXT NOT NULL,
   funcao TEXT CHECK (funcao IN ('MECANICO','MONTADOR','AUXILIAR'))
 ); CREATE INDEX idx_users_name ON users(name);
 INSERT INTO users(name,role,funcao) VALUES ('Admin','ADMIN',NULL);`);
 const migration=require('../database/migrations/216_users_funcao_perfis_gestao.js');
 migration({db,tableExists:(name)=>!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)});
 db.prepare("INSERT INTO users(name,role,funcao) VALUES (?,?,?)").run('Coord','COORDENADOR_RECICLAGEM','Coordenador da Reciclagem');
 assert.equal(db.prepare('SELECT COUNT(*) n FROM users').get().n,2);
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
 db.close();
});
