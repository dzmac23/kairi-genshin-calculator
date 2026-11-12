import json, re, random
from bparse import parse_text, S
lib = []; review = []
DMGWORDS = re.compile(r'(atk|crit|dmg|elemental mastery|res\b|def\b|max hp)', re.I)
def add_rows(stype, owner, item, ename, text, values=None):
    rows = parse_text(text, values)
    # de-dup identical
    seen=set(); out=[]
    for r in rows:
        k=(r['stat'],r['attack'],r['element'],r['basis'],tuple(r['vals']),r['target'])
        if k in seen: continue
        seen.add(k); out.append(r)
    for r in out:
        r.update(stype=stype, owner=owner, item=item, ename=ename, conf='Check' if r.get('check') else 'Auto'); lib.append(r)
    if not out and DMGWORDS.search(text) and re.search(r'\d|\{\d\}', text):
        review.append(dict(stype=stype, owner=owner, item=item, ename=ename, text=text[:400]))
for w in S['weapons']:
    if w['tpl']: add_rows('Weapon', w['name'], 'Passive', w['effect'], w['tpl'], w['r'])
for a in S['sets']:
    if a['p2']: add_rows('Set', a['name'], '2pc', '2-Piece', a['p2'])
    if a['p4']: add_rows('Set', a['name'], '4pc', '4-Piece', a['p4'])
SLOTMAP = {'passive1':'A1','passive2':'A4','passive3':'Utility','passive4':'Passive 4'}
for c in S['chars']:
    for it in c['items']:
        item = SLOTMAP.get(it['slot'], it['slot'])
        if item in ('C3','C5') and re.search(r'increases the level of', it['text'], re.I) and len(it['text']) < 140: continue
        if item=='Utility' and re.search(r'cook|dish|expedition|craft|forg|ore|mining|refin|map|region|stamina|sprint|glid|swim|climb', it['text'], re.I): continue
        add_rows('Constellation' if item.startswith('C') else 'Passive', c['name'], item, it['name'], it['text'])
json.dump({'lib':lib,'review':review}, open('lib_auto.json','w'))
from collections import Counter
print(len(lib), Counter(r['stype'] for r in lib), 'review', len(review), Counter(r['stype'] for r in review))
print(Counter(r['conf'] for r in lib))
random.seed(5)
for r in random.sample([x for x in lib if x['conf']=='Auto'], 25):
    print(f"* {r['owner']} {r['item']} | {r['stat']} {r['attack']} {r['element']} basis={r['basis']} v={[round(x,4) for x in r['vals'][:2]]} st={r['stacks']} tgt={r['target']} alw={r['always']}\n    {r['sentence'][:170]}")
