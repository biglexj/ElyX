"""ElyX 0.1: experimental RGB8 wavelet codec, no WebP/AV1/JXL payload.
Uses reversible YCoCg-R, 3-level integer CDF 5/3, optional scalar detail
quantization, signed zigzag + byte planes + DEFLATE (zlib). Not production-ready.
"""
import argparse, hashlib, json, struct, zlib
from pathlib import Path
import numpy as np
from PIL import Image

MAGIC=b'ELYX\r\n\x1a\n'
MAX_PIXELS=60_000_000

def pixel_hash(img):
 h=hashlib.sha256()
 for y in range(0,img.height,128):h.update(img.crop((0,y,img.width,min(y+128,img.height))).tobytes())
 return h.hexdigest()

def lift(a,axis,inverse=False):
 n=a.shape[axis]//2
 if not inverse:
  e=np.take(a,np.arange(0,n*2,2),axis=axis);d=np.take(a,np.arange(1,n*2,2),axis=axis)
  nxt=np.concatenate([np.take(e,np.arange(1,n),axis=axis),np.take(e,[-1],axis=axis)],axis=axis)
  d=d-((e+nxt)>>1)
  prev=np.concatenate([np.take(d,[0],axis=axis),np.take(d,np.arange(n-1),axis=axis)],axis=axis)
  return np.concatenate([e+((prev+d+2)>>2),d],axis=axis)
 s=np.take(a,np.arange(n),axis=axis);d=np.take(a,np.arange(n,n*2),axis=axis)
 prev=np.concatenate([np.take(d,[0],axis=axis),np.take(d,np.arange(n-1),axis=axis)],axis=axis)
 e=s-((prev+d+2)>>2)
 nxt=np.concatenate([np.take(e,np.arange(1,n),axis=axis),np.take(e,[-1],axis=axis)],axis=axis)
 odd=d+((e+nxt)>>1);out=np.empty_like(a)
 sl=[slice(None)]*a.ndim;sl[axis]=slice(0,None,2);out[tuple(sl)]=e;sl[axis]=slice(1,None,2);out[tuple(sl)]=odd
 return out

def transform(a,levels,step,inverse=False):
 h,w=a.shape[:2]
 for lev in (reversed(range(levels)) if inverse else range(levels)):
  hh,ww=h>>lev,w>>lev;hy,hx=hh//2,ww//2
  if inverse:
   if step>1:
    a[:hy,hx:ww]*=step;a[hy:hh,:ww]*=step
   a[:hh,:ww]=lift(lift(a[:hh,:ww],0,True),1,True)
  else:
   a[:hh,:ww]=lift(lift(a[:hh,:ww],1),0)
   if step>1:
    for band in (a[:hy,hx:ww],a[hy:hh,:ww]):
     band[:]=np.sign(band)*((np.abs(band)+step//2)//step)
 return a

def color(a,inverse=False):
 if inverse:
  y,co,cg=a[:,:,0],a[:,:,1],a[:,:,2];t=y-(cg>>1);g=cg+t;b=t-(co>>1);r=co+b
  return np.stack([r,g,b],axis=2)
 r,g,b=a[:,:,0],a[:,:,1],a[:,:,2];co=r-b;t=b+(co>>1);cg=g-t;y=t+(cg>>1)
 return np.stack([y,co,cg],axis=2)

def read_exact(f,n):
 b=f.read(n)
 if len(b)!=n:raise ValueError('Archivo ELYX truncado')
 return b

def encode(input_path,output_path,step=1,tile=512,levels=3):
 if not 1<=step<=64 or levels not in range(1,5) or not 32<=tile<=1024 or tile%(1<<levels):raise ValueError('Parámetros inválidos')
 with Image.open(input_path) as original:
  if original.mode!='RGB':raise ValueError('Prototipo 0.1: solo RGB de 8 bits; convertir explícitamente antes')
  img=original.copy()
 if img.width*img.height>MAX_PIXELS:raise ValueError('Límite de 60 MP del prototipo')
 header=dict(version=1,width=img.width,height=img.height,mode='RGB8',tile=tile,levels=levels,step=step,color='YCoCg-R',wavelet='CDF53',entropy='zigzag16-byteplanes-deflate',pixel_sha256=pixel_hash(img))
 raw_header=json.dumps(header,separators=(',',':'),sort_keys=True).encode('utf-8')
 with open(output_path,'xb') as f:
  f.write(MAGIC+struct.pack('<I',len(raw_header))+raw_header)
  for y in range(0,img.height,tile):
   for x in range(0,img.width,tile):
    a=np.asarray(img.crop((x,y,min(x+tile,img.width),min(y+tile,img.height))),dtype=np.int32)
    hh,ww=a.shape[:2];unit=1<<levels;a=np.pad(a,((0,(-hh)%unit),(0,(-ww)%unit),(0,0)),mode='edge')
    a=transform(color(a),levels,step)
    if a.min()<-32768 or a.max()>32767:raise ValueError('Coeficiente fuera del rango del formato')
    zz=((a<<1)^(a>>31)).astype(np.uint16).transpose(2,0,1).ravel()
    raw=(zz&255).astype(np.uint8).tobytes()+(zz>>8).astype(np.uint8).tobytes()
    payload=zlib.compress(raw,6);f.write(struct.pack('<II',len(payload),zlib.crc32(raw)));f.write(payload)
 img.close();return header

def decode(input_path):
 with open(input_path,'rb') as f:
  if read_exact(f,8)!=MAGIC:raise ValueError('Firma ELYX inválida')
  hn=struct.unpack('<I',read_exact(f,4))[0]
  if not 2<=hn<=65536:raise ValueError('Cabecera excesiva')
  h=json.loads(read_exact(f,hn));w,ht,tile,levels,step=(h[k] for k in ['width','height','tile','levels','step'])
  if any(type(v)!=int for v in [w,ht,tile,levels,step]):raise ValueError('Tipos inválidos')
  if h.get('version')!=1 or h.get('mode')!='RGB8' or h.get('color')!='YCoCg-R' or h.get('wavelet')!='CDF53' or h.get('entropy')!='zigzag16-byteplanes-deflate':raise ValueError('Versión o herramientas no compatibles')
  if min(w,ht)<1 or w*ht>MAX_PIXELS or not 1<=step<=64 or levels not in range(1,5) or not 32<=tile<=1024 or tile%(1<<levels):raise ValueError('Dimensiones/parámetros inválidos')
  dst=Image.new('RGB',(w,ht));unit=1<<levels
  for y in range(0,ht,tile):
   for x in range(0,w,tile):
    hh,ww=min(tile,ht-y),min(tile,w-x);ph,pw=hh+(-hh)%unit,ww+(-ww)%unit;n=ph*pw*3;expected=n*2
    size,crc=struct.unpack('<II',read_exact(f,8))
    if not 1<=size<=expected+65536:raise ValueError('Bloque excesivo')
    payload=read_exact(f,size);dec=zlib.decompressobj();raw=dec.decompress(payload,expected+1)
    if len(raw)!=expected or not dec.eof or dec.unused_data or dec.unconsumed_tail or zlib.crc32(raw)!=crc:raise ValueError('Bloque corrupto o longitud inválida')
    lo=np.frombuffer(raw,dtype=np.uint8,count=n).astype(np.uint16);hi=np.frombuffer(raw,dtype=np.uint8,offset=n).astype(np.uint16)
    zz=(lo|(hi<<8)).astype(np.int32);a=((zz>>1)^-(zz&1)).reshape(3,ph,pw).transpose(1,2,0).copy()
    a=color(transform(a,levels,step,True),True)
    if step==1 and (a.min()<0 or a.max()>255):raise ValueError('RGB lossless fuera de rango')
    dst.paste(Image.fromarray(np.clip(a[:hh,:ww],0,255).astype(np.uint8)),(x,y))
  if f.read(1):raise ValueError('Datos sobrantes')
 if step==1 and pixel_hash(dst)!=h.get('pixel_sha256'):raise ValueError('SHA256 de píxeles reconstruidos incorrecto')
 return dst,h

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='action',required=True)
 e=sub.add_parser('encode');e.add_argument('input');e.add_argument('output');e.add_argument('--step',type=int,default=1);e.add_argument('--tile',type=int,default=512)
 d=sub.add_parser('decode');d.add_argument('input');d.add_argument('output')
 a=p.parse_args()
 if a.action=='encode':print(json.dumps(encode(a.input,a.output,a.step,a.tile),indent=2))
 else:
  image,header=decode(a.input)
  with open(a.output,'xb') as f:image.save(f,format='PNG')
  print(json.dumps(header,indent=2))
