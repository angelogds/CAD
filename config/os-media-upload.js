const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');

const FORMATS = {
  'image/jpeg': ['.jpg','.jpeg'], 'image/png':['.png'], 'image/webp':['.webp'],
  'image/gif':['.gif'], 'image/avif':['.avif'], 'image/heic':['.heic'], 'image/heif':['.heif'],
  'video/mp4':['.mp4','.m4v'], 'video/quicktime':['.mov'], 'video/webm':['.webm'],
  'video/ogg':['.ogg','.ogv'], 'video/x-msvideo':['.avi'],
};
function invalid() {
  const error = new Error('Formato de mídia inválido ou incompatível com o conteúdo. Envie imagem ou vídeo válido.');
  error.code = 'OS_MEDIA_INVALID';
  return error;
}
function matchesContent(file) {
  const head=Buffer.alloc(32);
  const fd=fs.openSync(file.path,'r');
  let length;
  try { length=fs.readSync(fd,head,0,head.length,0); } finally { fs.closeSync(fd); }
  const type=file.mimetype.toLowerCase();
  if (type==='image/png') return length>=8 && head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type==='image/jpeg') return length>=3 && head[0]===255 && head[1]===216 && head[2]===255;
  if (type==='image/gif') return /^GIF8[79]a/.test(head.toString('ascii',0,6));
  if (type==='image/webp') return head.toString('ascii',0,4)==='RIFF' && head.toString('ascii',8,12)==='WEBP';
  if (type==='video/x-msvideo') return head.toString('ascii',0,4)==='RIFF' && head.toString('ascii',8,12)==='AVI ';
  if (type==='video/webm') return length>=4 && head.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  if (type==='video/ogg') return head.toString('ascii',0,4)==='OggS';
  const box=head.toString('ascii',4,8);
  if (type==='video/quicktime') return ['ftyp','moov','mdat','wide','free'].includes(box);
  if (type==='video/mp4') return box==='ftyp';
  if (type.startsWith('image/')) {
    const brands=head.toString('ascii',8,length);
    return box==='ftyp' && (type==='image/avif' ? /avif|avis/.test(brands) : /heic|heix|hevc|hevx|mif1/.test(brands));
  }
  return false;
}
function createOSMediaUpload({directory,maxBytes}) {
  const upload=multer({
    storage:multer.diskStorage({
      destination:(_req,_file,cb)=>cb(null,directory),
      filename:(_req,file,cb)=>cb(null,crypto.randomUUID()+FORMATS[file.mimetype.toLowerCase()][0]),
    }),
    limits:{fileSize:maxBytes},
    fileFilter:(_req,file,cb)=>{
      const extensions=FORMATS[String(file.mimetype || '').toLowerCase()];
      return extensions?.includes(path.extname(file.originalname).toLowerCase()) ? cb(null,true) : cb(invalid());
    },
  });
  return { fields(fields) {
    const receive=upload.fields(fields);
    return (req,res,next)=>receive(req,res,error=>{
      const files=Object.values(req.files || {}).flat();
      try {
        if (error) throw error;
        if (files.some(file=>!matchesContent(file))) throw invalid();
        return next();
      } catch (failure) {
        for (const file of files) {
          try { fs.unlinkSync(file.path); } catch (cleanupError) { if (cleanupError.code!=='ENOENT') return next(cleanupError); }
        }
        return next(failure);
      }
    });
  } };
}

module.exports = { createOSMediaUpload };
