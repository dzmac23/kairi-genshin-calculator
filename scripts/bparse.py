import json, re
re_ = re
S = json.load(open('buffsrc.json'))
ELEM = ['pyro','hydro','electro','cryo','anemo','geo','dendro','physical']
REACT = {'vaporize':'Vaporize','melt':'Melt','aggravate':'Aggravate','spread':'Spread','swirl':'Swirl','overloaded':'Overloaded',
         'electro-charged':'Electro-Charged','superconduct':'Superconduct','shattered':'Shattered','burning':'Burning',
         'hyperbloom':'Hyperbloom','burgeon':'Burgeon','bloom':'Bloom'}
TOK = re.compile(r'\{(\d+)\}|(\d+(?:\.\d+)?)(%?)')

def target_of(sent):
    s = sent.lower()
    s = re.sub(r'^\s*(when|after|if|upon|while|whenever|each time|for \d+(\.\d+)?s after)[^,]*,', '', s)
    if re.search(r'other (nearby )?(party members|characters)|party members other than|other members', s): return 'Others'
    if re.search(r'all (nearby )?party members|(nearby )?party members|your (current )?active character|the active character|all characters in the party|entire party', s): return 'Team'
    return 'Self'

def is_conditional(sent):
    return bool(re.search(r'\b(after|when|upon|while|within|if|for \d+(\.\d+)?s|whenever|each time|hits?|triggers?|using|casting|on hit)\b', sent.lower()))

def classify(left, right, is_pct):
    """return list of (stat, attack, element, reaction, basis) or [] ; left/right lowercased"""
    L = left[-140:]
    basis = None
    mb = re.match(r"\s*(?:of (?:the )?(?:equipping character's |wielder's |the wielder's |their |his |her |[a-z\-' ]{0,30}?'s )?)(max hp|base atk|atk|def|elemental mastery|energy recharge)", right)
    if mb: basis = {'max hp':'HP','base atk':'Base ATK','atk':'ATK','def':'DEF','elemental mastery':'EM','energy recharge':'ER'}[mb.group(1)]
    perpoint = False
    if not basis and re.search(r'(for )?(every|each) (1 )?(point|1%) of (\w+ ){0,3}(elemental mastery|energy recharge|max hp|atk|def)|per point of', right[:120]):
        mm = re.search(r'(elemental mastery|energy recharge|max hp|atk|def)', right[:120])
        if mm: basis = {'elemental mastery':'EM','energy recharge':'ER','max hp':'HP','atk':'ATK','def':'DEF'}[mm.group(1)]; perpoint = True
    # candidate keywords with positions
    cands = []
    def add(pat, res):
        for m in re.finditer(pat, L): cands.append((m.end(), res))
    for e in ELEM:
        add(e + r' (dmg bonus|dmg)', [('DMG%','Any',e.capitalize(),None)])
        add(e + r' res', [('RES Shred','Any',e.capitalize(),None)] if re.search(r'decreas|reduc|lower', L+right[:40]) else [])
    add(r'elemental dmg( bonus)?', [('DMG%','Any','Elemental',None)])
    add(r'elemental res|all elemental and physical res|all res', [('RES Shred','Any','Any',None)] if re.search(r'decreas|reduc|lower', L+right[:40]) else [])
    add(r"(opponents?'?s?|enemies'?|enemy's) def|def of (opponents|enemies)", [('DEF Red','Any','Any',None)])
    add(r'ignor\w* (\w+ )?', [('DEF Ignore','Any','Any',None)] if 'def' in right[:40] else [])
    add(r'normal, charged,? and plunging attack(s)? (dmg|deal)', [('DMG%','Normal','Any',None),('DMG%','Charged','Any',None),('DMG%','Plunge','Any',None)])
    add(r'normal and charged attack(s)? (dmg|deal)', [('DMG%','Normal','Any',None),('DMG%','Charged','Any',None)])
    add(r'normal attack(s)? (dmg|deal)|dmg (dealt )?by normal attacks|normal attack dmg', [('DMG%','Normal','Any',None)])
    add(r'charged attack(s)? (dmg|deal)|dmg (dealt )?by charged attacks|charged attack dmg', [('DMG%','Charged','Any',None)])
    add(r'plunging attack(s)? (dmg|deal)|dmg (dealt )?by plunging attacks|plunging attack dmg', [('DMG%','Plunge','Any',None)])
    add(r'elemental skill(s)? (dmg|deal)|dmg (dealt )?by elemental skills?|skill dmg', [('DMG%','Skill','Any',None)])
    add(r'elemental burst(s)? (dmg|deal)|dmg (dealt )?by elemental bursts?|burst dmg', [('DMG%','Burst','Any',None)])
    add(r'crit rate', [('CR','Any','Any',None)])
    add(r'crit dmg', [('CD','Any','Any',None)])
    add(r'elemental mastery', [('EM','Any','Any',None)])
    add(r'energy recharge', [('ER','Any','Any',None)])
    add(r'max hp|\bhp\b', [('HP%' if is_pct else 'HP','Any','Any',None)])
    add(r'(?<![a-z])def\b', [('DEF%' if is_pct else 'DEF','Any','Any',None)])
    add(r'(?<![a-z])atk\b(?! spd)', [('ATK%' if is_pct else 'ATK','Any','Any',None)])
    add(r'\bdmg\b|damage', [('DMG%','Any','Any',None)])
    add(r'healing bonus|incoming healing|shield strength|movement spd|atk spd|cd\b|cooldown|stamina|energy', [])
    RN = r'(?:electro-charged|superconduct|overloaded|hyperbloom|aggravate|vaporize|shattered|burgeon|burning|spread|swirl|bloom|melt)'
    for m in re.finditer(r'(' + RN + r'(?:(?:,|,? and|,? or) ' + RN + r')*)(?: reaction)? (?:dmg|damage)', L):
        keys = re.findall(RN, m.group(1))
        cands.append((m.end()+1, [('Reaction:'+REACT[k],'Any','Any',None) for k in keys]))
    if (not cands or max(c[0] for c in cands) < len(L) - 45) and re.search(r'(gains?|grants?|provides?|obtains?|receives?|\ba|\ban|additional)\s*$', L):
        R = right[:70]
        sub, _ = classify(' ' + R.split(' for ')[0].split(' to ')[0] + ' ', '', is_pct) if R.strip() else ([], None)
        if sub:
            out = []
            for st,a,e,b in sub:
                if basis and not perpoint and st == 'DMG%': st = 'Flat DMG'
                out.append((st,a,e,basis))
            return out, basis
    if not cands: return [], basis
    pos, res = max(cands, key=lambda c: c[0])
    if not res: return [], basis
    out = []
    for st,a,e,r in res:
        if basis and not perpoint and st == 'DMG%': st = 'Flat DMG'
        if basis and st in ('ATK%','HP%','DEF%'): st = st[:-1]
        out.append((st,a,e,basis))
    return out, basis

def parse_text(text, values=None, owner_elem=None):
    """values: list per placeholder of R1..R5 strings or None. Return list of buff dicts and flag."""
    rows = []
    sents = re.split(r'(?<=[.;])\s+|\n|·', text)
    stack_global = re.search(r'(max(imum)?( of)?|up to) (\d+) stacks', text.lower())
    for sent in sents:
        sl = sent.lower()
        st_m = re.search(r'(max(imum)?( of)?|up to) (\d+) stacks', sl)
        stacks = int(st_m.group(4)) if st_m else 1
        for m in TOK.finditer(sent):
            if m.group(1) is not None:
                idx = int(m.group(1))
                rv = [ (r[idx] if r and idx < len(r) else None) for r in values ] if values else None
                if not rv or rv[0] is None: continue
                rv = [x if x is not None else rv[0] for x in rv]
                is_pct = '%' in (rv[0] or '')
                if '/' in rv[0]:   # stack-level values like 8/16/28% -> take max
                    vals = [float(re.findall(r'[\d.]+', x.split('/')[-1])[0]) / (100 if '%' in x else 1) for x in rv]
                    note = 'stack-level values; max level used'
                else:
                    vals = [float(re.findall(r'[\d.]+', x)[0]) / (100 if '%' in x else 1) if x and re.findall(r'[\d.]+', x) else None for x in rv]
                    note = ''
            else:
                num, pct = m.group(2), m.group(3)
                if not pct:
                    # plain numbers only meaningful for EM / flat ATK etc; skip seconds, counts
                    after = sent[m.end():m.end()+8].lower()
                    if re.match(r'\s*(s\b|second|stack|time|energy|point|%|m\b|meter|hit|seconds|x)', after): continue
                    if re.search(r'\b(level|lv\.?|c\d)\s*$', sent[:m.start()].lower()): continue
                is_pct = bool(pct); v = float(num) / (100 if pct else 1)
                # handle X/Y/Z% sequences: take the last of a slash group
                tail = sent[m.end():m.end()+12]
                if re.match(r'%?/\d', tail): continue
                vals = [v]; note = ''
            left = sent[:m.start()].lower(); right = sent[m.end():].lower()
            if re.search(r'\b(by|to|is|are|gains?|grants?|provides?|increases?|\+|of|a|an|on|additional|extra)\s*$', left) is None and not re.search(r'\+\s*$', left):
                continue
            if re.match(r'\s*or (above|more|higher|less|lower|below)', right) or re.search(r'lunar-\s*$|lunar-(bloom|charged|crystallize)', left[-40:]+right[:20]) and 'lunar' in (left[-40:]+right[:30]): continue
            if re.search(r'(less than|more than|above|below|at least|exceeds?|lower than|higher than|falls? to)\s*$', left): continue
            if re.search(r'chance|healing|restor|regenerat|shield|absorb|reduces? the cd|cooldown', left[-60:]) and not re.search(r'dmg|atk|crit|mastery|res\b', left[-30:]):
                continue
            if (re.search(r'deal(ing|s)? (an? )?(additional )?(\w+ ){0,4}dmg (equal|equivalent) to\s*$|(dealing|deals) (\w+ ){0,3}dmg (equal|equivalent) to\s*$', left[-90:]) and not re.search(r'increas|bonus', left[-90:])) or re.search(r'additional (strike|attack|instance)', left[-80:]) or re.match(r'\s*of (atk|max hp|def|elemental mastery)( as)? (\w+ )?dmg', right): continue
            res, basis = classify(left, right, is_pct)
            if not res: continue
            chk = bool(re.search(r'up to a maximum|maximum of|aforementioned|further|increased to|every [\d,]+ points|per point|every point|for every|beyond|corresponding|based on|per stack|each stack|stack level|this effect|the above', sl))
            if not is_pct and any(r[0] in ('DMG%','CR','CD','ER','RES Shred','DEF Red','DEF Ignore') for r in res) and not basis: continue
            for st,a,e,b in res:
                if e == 'Elemental' and re.search(r"character's elemental type|their elemental type|corresponding element", sl): e = 'Own'
                rows.append(dict(stat=st, attack=a, element=e, basis=b or 'Fixed', vals=vals, stacks=stacks,
                    target=('Team' if st in ('RES Shred','DEF Red') else target_of(sent)), always='N' if is_conditional(sent) else 'Y', note=note, check=chk, sentence=sent.strip()[:300]))
    return rows

if __name__ == '__main__':
    tests = ["Increases all party members' ATK by 20% for 12s.", "Upon causing a Swirl reaction, decreases opponent's Elemental RES to the element infused in the Swirl by 40% for 10s.",
             "Swirl DMG increased by 60%.", "Gain a 0.04% Elemental DMG Bonus for every point of Elemental Mastery Kazuha has to other party members.",
             "Increases Overloaded, Burning, and Burgeon DMG by 40%. Increases Vaporize and Melt DMG by 15%."]
    for t in tests: print(t, '->', [(r['stat'],r['element'],r['basis'],r['vals'],r['target'],r['always']) for r in parse_text(t)])
    w = [x for x in S['weapons'] if x['name'] in ('Mistsplitter Reforged','Primordial Jade Cutter','Everlasting Moonglow','The Catch','Staff of Homa')]
    for x in w: print(x['name'], [(r['stat'],r['attack'],r['element'],r['basis'],r['vals'],r['stacks'],r['always']) for r in parse_text(x['tpl'], x['r'])])
