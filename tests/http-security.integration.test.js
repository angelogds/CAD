const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { removeOrArchiveUser } = require('../modules/usuarios/usuarios-lifecycle');

test('arquivos privados, upload e revogação pelo servidor HTTP real', async t => {
  const root = path.resolve(__dirname,'..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'cad-http-security-'));
  const password = crypto.randomBytes(24).toString('hex');
  const env = {...process.env,NODE_ENV:'test',DATA_DIR:dir,DB_PATH:path.join(dir,'sqlite/app.db'),
    UPLOAD_DIR:path.join(dir,'uploads'),PDF_DIR:path.join(dir,'pdfs'),IMAGE_DIR:path.join(dir,'imagens'),
    SESSION_SECRET:crypto.randomBytes(40).toString('hex'),ADMIN_PASSWORD:password};
  let db, child;
  try {
    execFileSync(process.execPath,['database/migrate.js'],{cwd:root,env,stdio:'pipe'});
    db = new Database(env.DB_PATH);
    db.pragma('foreign_keys = ON');
    const hash = bcrypt.hashSync(password,4);
    const add = role => Number(db.prepare('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)').run('Pessoa teste',role.toLowerCase()+'@example.invalid',hash,role).lastInsertRowid);
    const buyer=add('COMPRAS'), mechanic=add('MECANICO'), hr=add('RH'), requester=add('ENCARREGADO_FRIGORIFICO');
    const request=Number(db.prepare("INSERT INTO solicitacoes(numero,titulo,solicitante_user_id,setor_origem,status) VALUES('SEC-1','Fixture sintética',?,'FRIGORIFICO','ABERTA')").run(requester).lastInsertRowid);
    db.prepare("INSERT INTO compras_anexos(referencia_tipo,referencia_id,tipo,original_name,filename,mimetype,size,uploaded_by) VALUES('SOLICITACAO',?,'COTACAO','fixture.pdf','fixture.pdf','application/pdf',20,?)").run(request,buyer);
    for (const p of [env.UPLOAD_DIR,env.PDF_DIR,env.IMAGE_DIR,path.join(env.UPLOAD_DIR,'colaboradores/documentos')]) fs.mkdirSync(p,{recursive:true});
    fs.writeFileSync(path.join(env.UPLOAD_DIR,'fixture.pdf'),'%PDF-1.4 synthetic only');
    fs.mkdirSync(path.join(env.UPLOAD_DIR,'os'),{recursive:true});
    fs.writeFileSync(path.join(env.UPLOAD_DIR,'os/legacy.html'),'<html>fixture inerte</html>');
    fs.mkdirSync(path.join(env.PDF_DIR,'os'),{recursive:true});
    fs.writeFileSync(path.join(env.PDF_DIR,'os/fixture.pdf'),'%PDF-1.4 synthetic only');
    fs.mkdirSync(path.join(env.IMAGE_DIR,'users'),{recursive:true});
    fs.writeFileSync(path.join(env.IMAGE_DIR,'users/avatar.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64'));
    fs.writeFileSync(path.join(env.UPLOAD_DIR,'colaboradores/documentos/private.pdf'),'%PDF-1.4 synthetic HR only');
    const outside=path.join(dir,'outside');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'secret.pdf'),'synthetic');
    fs.symlinkSync(outside,path.join(env.UPLOAD_DIR,'colaboradores/documentos/escape'));
    const portServer=net.createServer();await new Promise(resolve=>portServer.listen(0,'127.0.0.1',resolve));
    const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
    child=spawn(process.execPath,['server.js'],{cwd:root,env:{...env,PORT:String(port)},stdio:'ignore'});
    const base='http://127.0.0.1:'+port;
    let ready=false;
    for(let i=0;i<100;i++) {
      if(child.exitCode!==null)throw new Error('Servidor de teste encerrou antes de iniciar.');
      try {if((await fetch(base+'/health')).ok){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,'servidor iniciou');
    const get=(url,cookie)=>fetch(base+url,{headers:{Accept:'application/json',...(cookie?{Cookie:cookie}:{})},redirect:'manual'});
    const login=async role=>{
      const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:role.toLowerCase()+'@example.invalid',password}),redirect:'manual'});
      assert.equal(r.headers.get('location'),'/dashboard');
      const cookie=r.headers.get('set-cookie');assert.ok(cookie);
      return cookie.split(';')[0];
    };
    const buyerCookie=await login('COMPRAS'), mechanicCookie=await login('MECANICO'), hrCookie=await login('RH'), ownerCookie=await login('ENCARREGADO_FRIGORIFICO');
    await t.test('anexo sem sessão é recusado e leitor autorizado continua acessando',async()=>{
      assert.ok([302,401].includes((await get('/uploads/fixture.pdf')).status));
      assert.equal((await get('/uploads/fixture.pdf',buyerCookie)).status,200);
      assert.equal((await get('/uploads/fixture.pdf',ownerCookie)).status,200);
      assert.equal((await get('/uploads/fixture.pdf',mechanicCookie)).status,403);
    });
    await t.test('documento de RH não vaza a outro perfil nem por symlink',async()=>{
      assert.equal((await get('/uploads/colaboradores/documentos/private.pdf',buyerCookie)).status,403);
      assert.equal((await get('/uploads/colaboradores/documentos/private.pdf',hrCookie)).status,200);
      assert.ok([403,404].includes((await get('/uploads/colaboradores/documentos/escape/secret.pdf',hrCookie)).status));
    });
    await t.test('PDF e avatar autorizados preservam leitura, HEAD e Range; HTML legado força download',async()=>{
      for (const url of ['/pdfs/os/fixture.pdf','/imagens/users/avatar.png']) {
        assert.ok([302,401].includes((await get(url)).status));
        const full=await get(url,mechanicCookie);
        assert.equal(full.status,200);
        assert.equal(full.headers.get('x-content-type-options'),'nosniff');
        assert.match(full.headers.get('cache-control'),/private.*no-store/);
        assert.match(full.headers.get('content-security-policy'),/sandbox/);
        const head=await fetch(base+url,{method:'HEAD',headers:{Cookie:mechanicCookie},redirect:'manual'});
        assert.equal(head.status,200);
        const range=await fetch(base+url,{headers:{Cookie:mechanicCookie,Range:'bytes=0-3'},redirect:'manual'});
        assert.equal(range.status,206);
        assert.equal((await range.arrayBuffer()).byteLength,4);
      }
      const legacy=await get('/uploads/os/legacy.html',mechanicCookie);
      assert.equal(legacy.status,200);
      assert.match(legacy.headers.get('content-disposition'),/^attachment/);
      assert.match(legacy.headers.get('content-type'),/application\/octet-stream/);
    });
    await t.test('upload de OS rejeita extensão ativa e conteúdo incompatível sem gravar arquivo',async()=>{
      const target=path.join(env.UPLOAD_DIR,'os');
      const before=fs.readdirSync(target).sort();
      for(const filename of ['synthetic.html','synthetic.png']) {
        const body=new FormData();body.set('abertura_fotos',new Blob(['<html>fixture inerte</html>'],{type:'image/png'}),filename);
        const r=await fetch(base+'/os',{method:'POST',headers:{Cookie:mechanicCookie,Accept:'application/json'},body,redirect:'manual'});
        assert.ok(r.status>=400 && r.status<500);
        assert.deepEqual(fs.readdirSync(target).sort(),before);
      }
    });
    await t.test('sessão existente é revogada após redefinição de senha',async()=>{
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(crypto.randomBytes(24).toString('hex'),4),mechanic);
      assert.ok([302,401].includes((await get('/os',mechanicCookie)).status));
    });
    await t.test('sessão perde privilégios antigos após mudança de perfil',async()=>{
      db.prepare("UPDATE users SET role='MECANICO' WHERE id=?").run(buyer);
      assert.ok([302,401,403].includes((await get('/compras/demandas/pre-cotacoes.json',buyerCookie)).status));
    });
    await t.test('sessão de usuário arquivado é revogada',async()=>{
      assert.equal(removeOrArchiveUser(db,requester).action,'archived');
      assert.ok([302,401].includes((await get('/uploads/fixture.pdf',ownerCookie)).status));
    });
  } finally {
    if(child && child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
    if(db)db.close();
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
