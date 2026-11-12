import json, re
raw = json.load(open('raw.json'))
STAT = {'':'ATK','ATK':'ATK','Max HP':'HP','DEF':'DEF','Elemental Mastery':'EM'}
CAT = {'Normal Attack':'NA','Skill':'E','Burst':'Q','Special':'Sp'}
PR = re.compile(r'\{param(\d+):([A-Z0-9]+)\}')

def fmtval(v, f):
    if v is None: return '?'
    if 'P' in f:
        d = 2 if 'F2' in f else 1
        return f"{v*100:.{d}f}%"
    return f"{v:.2f}".rstrip('0').rstrip('.') if 'F' in f else str(round(v))

def parse_label(lab, params):
    name, _, tpl = lab.partition('|')
    tpl = tpl.strip()
    out = []
    hits = 1
    tpl = re.sub(r'\s+(each|per Paw)$|/Strike$', '', tpl)
    m = re.match(r'^\((.*)\)\s*[×*]\s*(\d+)$', tpl) or re.match(r'^([^+]*?)\s*[×*]\s*(\d+)$', tpl)
    core = tpl
    if m: core, hits = m.group(1).strip(), int(m.group(2))
    pieces = core.split('/')
    if len(pieces) > 1 and all(PR.search(p) for p in pieces):
        last_suffix = PR.sub('', pieces[-1]).strip()
        variants = []
        for p in pieces:
            if PR.sub('', p).strip() == '' and last_suffix: p = p + ' ' + last_suffix
            variants.append(p.strip())
        nparts = name.split('/')
        if len(nparts) == len(variants):
            tail = ' '.join(nparts[-1].split(' ')[1:])
            vnames = [ (np if i == len(nparts)-1 else (np + (' ' + tail if tail else ''))).strip() for i,np in enumerate(nparts)]
        else:
            vnames = [f"{name} ({i+1})" for i in range(len(variants))]
    else:
        variants, vnames = [core], [name]
    for vn, v in zip(vnames, variants):
        out.append(parse_variant(vn, v, hits, tpl, params))
    return out

def vals(params, pid):
    arr = params.get(f'param{pid}', [])
    return [arr[i] if i < len(arr) else None for i in range(15)]

def parse_variant(name, v, hits, tpl, params):
    row = dict(label=name, statA='', statB='', hits=hits, A=[None]*15, B=[None]*15, F=[None]*15, status='OK', note='')
    comps = [c.strip() for c in v.split('+')]
    scal = {}   # stat -> summed list
    order = []
    flat = None
    nsum = 0
    for c in comps:
        m = re.match(r'^\{param(\d+):([A-Z0-9]+)\}\s*(.*?)$', c)
        if not m: row['status'] = 'Special'; break
        pid, f, suf = m.group(1), m.group(2), m.group(3).strip()
        vv = vals(params, pid)
        if 'P' in f:
            if suf not in STAT: row['status'] = 'Special'; break
            st = STAT[suf]
            if st in scal:
                scal[st] = [a+b if a is not None and b is not None else None for a,b in zip(scal[st], vv)]; nsum += 1
            else:
                scal[st] = vv; order.append(st)
        else:
            if suf == '' and flat is None and len(comps) > 1: flat = vv
            else: row['status'] = 'Value' if len(comps) == 1 and not scal else 'Special'; 
            if row['status'] != 'OK': break
    if row['status'] == 'OK' and (len(order) > 2 or not order):
        row['status'] = 'Special'
    if row['status'] == 'OK':
        row['statA'] = order[0]; row['A'] = scal[order[0]]
        if len(order) == 2: row['statB'] = order[1]; row['B'] = scal[order[1]]
        if flat: row['F'] = flat
        if nsum: row['note'] = f"{nsum+1} hits summed into one value"
    else:
        m = PR.search(v)
        if m: row['A'] = vals(params, m.group(1))
        row['statA'] = 'Value' if row['status'] == 'Value' else 'Special'
        if row['status'] == 'Value': row['status'] = 'Non-damage value'
    # human-readable Lv10 text
    row['raw10'] = PR.sub(lambda mm: fmtval(vals(params, mm.group(1))[9], mm.group(2)), tpl)
    row['raw1'] = PR.sub(lambda mm: fmtval(vals(params, mm.group(1))[0], mm.group(2)), tpl)
    return row

rows = []
for t in raw['tal']:
    seen = set()
    for lab in t['labels']:
        for r in parse_label(lab, t['params']):
            disp = f"{CAT[t['cat']]}: {r['label']}"
            base = disp; k = 2
            while (t['char'], disp) in {(x['char'], x['disp']) for x in rows if x['char']==t['char']}:
                disp = f"{base} #{k}"; k += 1
            lab=r['label'].lower()
            if r['status']!='OK': kind=''
            elif re.search(r'regen|heal|restor|shield|absorption', lab): kind='Heal/Shield'
            elif re.search(r'increase|bonus|boost|ratio|reduction|conversion', lab) and 'dmg' not in lab.replace('dmg bonus',''): kind='Buff/Other'
            else: kind='Damage'
            r.update(char=t['char'], cat=t['cat'], tname=t['tname'], disp=disp, kind=kind)
            rows.append(r)
json.dump(rows, open('talents.json','w'))
from collections import Counter
print(len(rows), Counter(r['status'] for r in rows))
for r in rows:
    if r['char']=='Hu Tao' or r['char']=='Nahida': print(r['disp'], '|', r['statA'], r['statB'], r['hits'], r['A'][9], r['B'][9], r['F'][9], r['status'], r['raw10'])
