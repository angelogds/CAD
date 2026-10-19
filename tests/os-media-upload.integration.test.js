const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createOSMediaUpload } = require('../config/os-media-upload');

test('mídia válida recebe nome controlado; lote incompatível é removido integralmente', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'cad-media-'));
  const app = express();
  app.post('/upload',createOSMediaUpload({directory,maxBytes:1024}).fields([{name:'media',maxCount:5}]),(req,res) => res.json(req.files.media.map(file => file.filename)));
  app.use((err,req,res,next) => res.status(400).json({code:err.code}));
  const server = app.listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening',resolve));
  const send = body => fetch('http://127.0.0.1:'+server.address().port+'/upload',{method:'POST',body});
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=','base64');
  try {
    const valid = new FormData();
    valid.append('media',new Blob([png],{type:'image/png'}),'foto original.PNG');
    // Assinatura ISO BMFF usada por gravações MP4 de celular.
    const mp4 = Buffer.from([0,0,0,20,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109]);
    valid.append('media',new Blob([mp4],{type:'video/mp4'}),'celular.m4v');
    const accepted = await send(valid);
    assert.equal(accepted.status,200);
    const files = await accepted.json();
    assert.match(files[0],/^[a-f0-9-]+\.png$/);
    assert.match(files[1],/^[a-f0-9-]+\.mp4$/);
    assert.deepEqual(fs.readFileSync(path.join(directory,files[0])),png);
    const previous = fs.readdirSync(directory).sort();
    for (const [name,content] of [['fake.png','conteúdo incompatível'],['active.html',png]]) {
      const mixed = new FormData();
      mixed.append('media',new Blob([png],{type:'image/png'}),'valida.png');
      mixed.append('media',new Blob([content],{type:'image/png'}),name);
      assert.equal((await send(mixed)).status,400);
      assert.deepEqual(fs.readdirSync(directory).sort(),previous);
    }
    const oversized = new FormData();
    oversized.append('media',new Blob([Buffer.alloc(1025)],{type:'image/png'}),'grande.png');
    assert.equal((await send(oversized)).status,400);
    assert.deepEqual(fs.readdirSync(directory).sort(),previous);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
