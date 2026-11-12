import json, re, manual
from bparse import S
A = json.load(open('lib_auto.json'))
tal = json.load(open('talents.json'))
lib = []
over = set(manual.M)
for r in A['lib']:
    if (r['owner'], r['item']) in over: continue
    lib.append(dict(stype=r['stype'],owner=r['owner'],item=r['item'],ename=r['ename'],stat=r['stat'],attack=r['attack'],element=r['element'],
        basis=r['basis'],vals=r['vals'],talent='',stacks=r['stacks'],cap=None,capbase=None,target=r['target'],always=r['always'],
        conf=r['conf'],note=r.get('note',''),text=r['sentence']))
src_text = {}
for c in S['chars']:
    for it in c['items']: src_text[(c['name'],{'passive1':'A1','passive2':'A4','passive3':'Utility','passive4':'Passive 4'}.get(it['slot'],it['slot']))]=(it['name'],it['text'])
for a in S['sets']: src_text[(a['name'],'2pc')]=('2-Piece',a['p2']); src_text[(a['name'],'4pc')]=('4-Piece',a['p4'])
for w in S['weapons']: src_text[(w['name'],'Passive')]=(w['effect'],w['tpl'])
setnames = {a['name'] for a in S['sets']}; wepnames = {w['name'] for w in S['weapons']}
for (owner,item), rows in manual.M.items():
    stype = 'Set' if owner in setnames else 'Weapon' if owner in wepnames else ('Constellation' if item.startswith('C') else 'Talent' if item in ('E','Q') else 'Passive')
    en, tx = src_text.get((owner,item), ('Elemental Skill' if item=='E' else '', 'Jade Shield: decreases Elemental and Physical RES of nearby opponents by 20%.' if owner=='Zhongli' else ''))
    for r in rows:
        lib.append(dict(stype=stype,owner=owner,item=item,ename=en,stat=r['stat'],attack=r['attack'],element=r['element'],basis=r['basis'],
            vals=r['vals'],talent='',stacks=r['stacks'],cap=r['cap'],capbase=r['capbase'],target=r['target'],always=r['always'],
            conf='Manual',note=r['note'],text=tx[:300]))
tk = {(t['char'],t['disp']):t for t in tal}
for (ch,lab,stat,att,el,basis,tgt,stacks,capbase,note) in manual.TALENT:
    t = tk[(ch,lab)]
    lib.append(dict(stype='Talent',owner=ch,item={'Skill':'E','Burst':'Q'}.get(t['cat'],'NA'),ename=t['tname'],stat=stat,attack=att,element=el,
        basis=basis,vals=[None],talent=f"{ch}|{lab}",stacks=stacks,cap=None,capbase=capbase,target=tgt,always='N',conf='Manual',
        note=note,text=f"{lab}: {t['raw10']} at Lv10 (scales with talent level)"))
# C3/C5 talent boosts
boost = {}
tn = {}
for t in json.load(open('raw.json'))['tal']: tn.setdefault(t['char'],{})[t['tname'].lower()] = {'Normal Attack':'Normal Attack','Skill':'Skill','Burst':'Burst'}.get(t['cat'],'')
for c in S['chars']:
    for it in c['items']:
        if it['slot'] in ('C3','C5'):
            m = re.search(r'increases the level of (.+?) by 3', it['text'], re.I)
            if m:
                name = m.group(1).strip().lower()
                hit = [v for k,v in tn.get(c['name'],{}).items() if k in name or name in k]
                boost[(c['name'],it['slot'])] = hit[0] if hit else ''
order = {'Talent':0,'Passive':1,'Constellation':2,'Weapon':3,'Set':4}
lib.sort(key=lambda r:(order[r['stype']], r['owner'].strip('"'), r['item'], r['stat']))
json.dump(dict(lib=lib, review=A['review'], boost={f"{k[0]}|{k[1]}":v for k,v in boost.items()}), open('lib_final.json','w'))
from collections import Counter
print(len(lib), Counter(r['conf'] for r in lib), Counter(r['stype'] for r in lib))
print('boosts', len(boost), Counter(boost.values()))
print([k for k,v in boost.items() if not v][:10])
