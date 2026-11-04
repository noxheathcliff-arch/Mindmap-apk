import numpy as np, json, sys
from PIL import Image, ImageDraw
from scipy import ndimage as nd
U='/root/.claude/uploads/26e087db-5a35-5d60-bc5f-04a51bcb9df2/'
FILES=['46086399','124833d9','e7ea3ab1','1debd386','63b6f631','e5ac8df8','503126f8','238987b4','2d11fe38']
out=[]
for f in FILES:
  im=np.asarray(Image.open(U+f+'-image.jpg').convert('RGB')).astype(int)
  R,G,B=im[...,0],im[...,1],im[...,2]
  black=(R<14)&(G<14)&(B<14)
  lab,n=nd.label(nd.binary_opening(black,np.ones((5,5))))
  for sl in nd.find_objects(lab):
    h=sl[0].stop-sl[0].start; w=sl[1].stop-sl[1].start
    if w<300 or h<180: continue
    y0,x0=sl[0].start,sl[1].start
    sub=im[sl]; r,g,b=sub[...,0],sub[...,1],sub[...,2]
    yellow=(r>190)&(g>150)&(b<150)&(r-b>70)
    white=(r>170)&(g>170)&(b>170)
    orange=(r>110)&(r-b>40)&~yellow
    # node blobs: white text dilated horizontally + yellow
    bright=(r+g+b)>200
    tx=nd.binary_closing(bright,np.ones((3,7)))
    tx=nd.binary_opening(tx,np.ones((4,6)))
    tx=nd.binary_closing(tx,np.ones((5,11)))
    yl=nd.binary_closing(yellow,np.ones((3,3)))
    lt,nt=nd.label(tx|yl)
    nodes=[]
    for i,s in enumerate(nd.find_objects(lt)):
      hh=s[0].stop-s[0].start; ww=s[1].stop-s[1].start
      if ww<14 or hh<5: continue
      isroot=yl[s].mean()>0.3
      nodes.append(dict(x0=s[1].start-3,y0=s[0].start-3,x1=s[1].stop+3,y1=s[0].stop+3,root=bool(isroot)))
    # suppress nested nodes / white text inside yellow
    nodes=[a for a in nodes if not any(b is not a and b['x0']<=a['x0'] and b['y0']<=a['y0'] and b['x1']>=a['x1'] and b['y1']>=a['y1'] for b in nodes)]
    # fusion des fragments d'un même libellé (même ligne, petit écart)
    ch=True
    while ch:
      ch=False
      for i in range(len(nodes)):
        for j in range(i+1,len(nodes)):
          a,bb=nodes[i],nodes[j]
          oy=min(a['y1'],bb['y1'])-max(a['y0'],bb['y0']); gx=max(a['x0'],bb['x0'])-min(a['x1'],bb['x1'])
          gy=max(a['y0'],bb['y0'])-min(a['y1'],bb['y1']); ox=min(a['x1'],bb['x1'])-max(a['x0'],bb['x0'])
          if (oy>0.4*min(a['y1']-a['y0'],bb['y1']-bb['y0']) and gx<8) or (ox>0.5*min(a['x1']-a['x0'],bb['x1']-bb['x0']) and gy<3):
            nodes[i]=dict(x0=min(a['x0'],bb['x0']),y0=min(a['y0'],bb['y0']),x1=max(a['x1'],bb['x1']),y1=max(a['y1'],bb['y1']),root=a['root'] or bb['root'])
            del nodes[j]; ch=True; break
        if ch: break
    if not nodes: continue
    if not any(a['root'] for a in nodes):
      continue
    # line mask
    mask=np.zeros_like(orange)
    for a in nodes: mask[max(0,a['y0']-2):a['y1']+2,max(0,a['x0']-2):a['x1']+2]=True
    line=((r+g+b)>110)&((r-b)>=12)&~mask
    line=nd.binary_dilation(line,np.ones((3,3)),iterations=3)
    ll,nl=nd.label(line)
    adj={}
    for k,a in enumerate(nodes):
      ring=np.zeros_like(line); Y0,Y1,X0,X1=max(0,a['y0']-5),a['y1']+5,max(0,a['x0']-5),a['x1']+5
      ring[Y0:Y1,X0:X1]=True
      for c in set(np.unique(ll[ring]))-{0}: adj.setdefault(c,set()).add(k)
    nb={k:set() for k in range(len(nodes))}
    for c,ks in adj.items():
      for a in ks:
        nb[a]|=ks-{a}
    root=[k for k,a in enumerate(nodes) if a['root']]; root=max(root,key=lambda k:(nodes[k]['x1']-nodes[k]['x0']))
    C=[((a['x0']+a['x1'])/2,(a['y0']+a['y1'])/2) for a in nodes]
    par={root:None}
    while len(par)<len(nodes):
      best=None
      for v in range(len(nodes)):
        if v in par: continue
        for u in par:
          d=((C[u][0]-C[v][0])**2+(C[u][1]-C[v][1])**2)**.5
          if v in nb[u]: d*=0.35
          if C[u][1]>C[v][1]+4: d*=1.8
          if best is None or d<best[0]: best=(d,u,v)
      par[best[2]]=best[1]
    out.append(dict(src=f,box=[x0,y0,w,h],nodes=nodes,parent={str(k):v for k,v in par.items()},root=root))
    # debug drawing
    dbg=Image.fromarray(sub.astype('uint8')).resize((w*3,h*3)); d=ImageDraw.Draw(dbg)
    for k,a in enumerate(nodes):
      d.rectangle([a['x0']*3,a['y0']*3,a['x1']*3,a['y1']*3],outline=(0,255,0) if k in par else (255,0,0))
      if par.get(k) is not None:
        p=nodes[par[k]]; d.line([((p['x0']+p['x1'])*1.5,(p['y0']+p['y1'])*1.5),((a['x0']+a['x1'])*1.5,(a['y0']+a['y1'])*1.5)],fill=(0,200,255),width=2)
    dbg.save(f'dbg_{len(out)-1}.png')
json.dump(out,open('xmind.json','w'))
import sys
print(sum(len(o['nodes']) for o in out), sum(len(o['parent']) for o in out))
for i,o in enumerate(out[:0]): print(i,o['src'],len(o['nodes']),'linked',len(o['parent']))
