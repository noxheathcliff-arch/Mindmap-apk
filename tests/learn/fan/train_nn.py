import json,numpy as np
from sklearn.neural_network import MLPRegressor
from sklearn.model_selection import KFold
D=json.load(open('xmind.json'))
X=[];Y=[];G=[]
for gi,o in enumerate(D):
  N=o['nodes']; P={int(k):v for k,v in o['parent'].items()}
  if len(N)<3: continue
  C=[((a['x0']+a['x1'])/2,(a['y0']+a['y1'])/2) for a in N]
  W=[a['x1']-a['x0'] for a in N]; H=[a['y1']-a['y0'] for a in N]
  U=float(np.median(H))  # unité : hauteur médiane d'un nœud de la miniature
  kids={k:[] for k in range(len(N))}
  for k,p in P.items():
    if p is not None: kids[p].append(k)
  def desc(k): return 1+sum(desc(c) for c in kids[k])
  def depth(k): return 0 if P.get(k) is None else 1+depth(P[k])
  for p,ch in kids.items():
    if not ch: continue
    # ordre de lecture du cours inconnu sur l'image : on prend l'ordre angulaire autour du parent
    pp=P.get(p)
    ind=(0.0,1.0) if pp is None else (C[p][0]-C[pp][0],C[p][1]-C[pp][1])
    m=np.hypot(*ind) or 1; ind=(ind[0]/m,ind[1]/m)
    ch=sorted(ch,key=lambda c:np.arctan2(C[c][1]-C[p][1],C[c][0]-C[p][0])*-1 if ind[1]>=0 else np.arctan2(C[c][1]-C[p][1],C[c][0]-C[p][0]))
    n=len(ch)
    for i,c in enumerate(ch):
      X.append([n, i/(n-1) if n>1 else .5, depth(p), ind[0], ind[1], W[p]/U, H[p]/U, W[c]/U, H[c]/U, np.log1p(desc(c)-1)])
      Y.append([(C[c][0]-C[p][0])/U,(C[c][1]-C[p][1])/U]); G.append(gi)
X=np.array(X,float);Y=np.array(Y,float);G=np.array(G)
print('exemples',len(X),'cartes',len(set(G)))
mu,sd=X.mean(0),X.std(0)+1e-6; Xn=(X-mu)/sd
ys=np.abs(Y).mean()
best=None
for hid in [(8,),(16,),(16,8),(24,12)]:
  for a in [1e-2,1e-1,1.0]:
    errs=[]
    for tr,te in KFold(5,shuffle=True,random_state=0).split(Xn):
      m=MLPRegressor(hidden_layer_sizes=hid,activation='tanh',alpha=a,max_iter=4000,random_state=0).fit(Xn[tr],Y[tr]/ys)
      errs.append(np.mean(np.linalg.norm(m.predict(Xn[te])*ys-Y[te],axis=1)))
    e=np.mean(errs)
    if best is None or e<best[0]: best=(e,hid,a)
base=np.mean(np.linalg.norm(Y-Y.mean(0),axis=1))
print('erreur réseau %.2f u, base (moyenne) %.2f u, choix'%(best[0],base),best[1:])
m=MLPRegressor(hidden_layer_sizes=best[1],activation='tanh',alpha=best[2],max_iter=6000,random_state=0).fit(Xn,Y/ys)
out=dict(mu=mu.round(5).tolist(),sd=sd.round(5).tolist(),ys=round(float(ys),5),
  W=[w.round(5).tolist() for w in m.coefs_],B=[b.round(5).tolist() for b in m.intercepts_],
  n=len(X),maps=len(set(G)),err=round(float(best[0]),3),base=round(float(base),3))
open('fan-net.json','w').write(json.dumps(out))
# ce que le réseau a compris : réponses à des cas types
def pr(v): return m.predict(((np.array([v])-mu)/sd))[0]*ys
for n in [2,3,5]:
  print('racine,',n,'enfants:',[tuple(pr([n,i/(n-1),0,0,1,6,1.5,4,1,1]).round(1)) for i in range(n)])
print('niv2 vers la gauche, 3 feuilles:',[tuple(pr([3,i/2,1,-.7,.7,4,1,4,1,0]).round(1)) for i in range(3)])
