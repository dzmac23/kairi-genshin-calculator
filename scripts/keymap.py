import json, re
G='gcsim/gcsim-main/pkg/shortcut/'
def aliases(fn):
    s=open(G+fn).read()
    return dict(re.findall(r'"([a-z0-9]+)":\s*keys\.(\w+)', s))
CA, WA, AA = aliases('character.dm.go'), aliases('weapon.dm.go'), aliases('artifact.dm.go')
raw=json.load(open('raw.json')); src=json.load(open('buffsrc.json'))
norm=lambda n: re.sub(r'[^a-z0-9]','',n.lower())
def best_alias(keyobj, amap):
    al=[a for a,k in amap.items() if k==keyobj]
    return max(al,key=len) if al else None
out={'char':{},'weapon':{},'set':{}}; miss={'char':[],'weapon':[],'set':[]}
for c in raw['chars']:
    n=c['name']
    if n.startswith('Traveler'):
        el=n[n.index('(')+1:-1].lower(); cand=[f'aether{el}', f'lumine{el}', f'traveler{el}']
    else: cand=[norm(n), norm(n.split()[-1]), norm(n.split()[0])]
    hit=next((x for x in cand if x in CA),None)
    if hit: out['char'][n]=hit
    else: miss['char'].append(n)
for w in raw['weps']:
    k=norm(w['name'])
    if k in WA: out['weapon'][w['name']]=k
    else: miss['weapon'].append(w['name'])
for a in src['sets']:
    k=norm(a['name'])
    if k in AA: out['set'][a['name']]=k
    else: miss['set'].append(a['name'])
print({k:len(v) for k,v in out.items()}, {k:len(v) for k,v in miss.items()})
print(miss)
json.dump(out,open('gkeys.json','w'))
