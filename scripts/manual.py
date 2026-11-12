# (owner, item) -> list of rows. Replaces auto rows for that item. vals = single or R1..R5 list.
def R(stat, vals, attack='Any', element='Any', basis='Fixed', target='Self', always='N', stacks=1, cap=None, capbase=None, note=''):
    return dict(stat=stat, vals=vals if isinstance(vals, list) else [vals], attack=attack, element=element, basis=basis,
                target=target, always=always, stacks=stacks, cap=cap, capbase=capbase, note=note)
M = {
 # ---- characters ----
 ('Kaedehara Kazuha','A4'): [R('DMG%',0.0004,element='Elemental',basis='EM',target='Others',note='Applies to the swirled element only; set Element filter if needed')],
 ('Sucrose','A1'): [R('EM',50,target='Others',note='Only party members matching the swirled element')],
 ('Sucrose','A4'): [R('EM',0.2,basis='EM',target='Others')],
 ('Mona','A4'): [R('DMG%',0.2,element='Hydro',basis='ER',always='Y')],
 ('Raiden Shogun','A4'): [R('DMG%',0.4,element='Electro',basis='ER over 100%',always='Y')],
 ('Nahida','A1'): [R('EM',0.25,basis='EM',target='Team',cap=250,note="Uses Nahida's own EM; in-game it's 25% of the highest EM in the party")],
 ('Chevreuse','A1'): [R('RES Shred',0.4,element='Pyro',target='Team'),R('RES Shred',0.4,element='Electro',target='Team')],
 ('Chevreuse','A4'): [R('ATK%',0.00001,basis='HP',target='Team',cap=0.4,note='1% ATK per 1,000 Max HP, max 40%')],
 ('Yelan','A4'): [R('DMG%',0.25,target='Team',note='Ramps 1% to 50% over 14s; 25% is a rough average')],
 ('Lisa','A4'): [R('DEF Red',0.15,target='Team')],
 ('Rosaria','A4'): [R('CR',0.15,basis='CR',target='Others',cap=0.15)],
 ('Faruzan','A4'): [R('Flat DMG',0.32,element='Anemo',basis='Base ATK',target='Team')],
 ('Citlali','A1'): [R('RES Shred',0.2,element='Pyro',target='Team'),R('RES Shred',0.2,element='Hydro',target='Team')],
 ('Xianyun','A4'): [R('Flat DMG',2.0,attack='Plunge',basis='ATK',target='Team',cap=9000)],
 ('Hu Tao','A4'): [R('DMG%',0.33,element='Pyro',note='When HP is 50% or less')],
 ('Mavuika','A4'): [R('DMG%',0.4,target='Team',note='Decays over 20s; 40% is the starting value')],
 # ---- talent-embedded team buffs (not in passives) ----
 ('Zhongli','E'): [R('RES Shred',0.2,target='Team',note='Jade Shield: all Elemental and Physical RES')],
 # ---- artifact sets ----
 ('Viridescent Venerer','4pc'): [R('Reaction:Swirl',0.6,always='Y'),R('RES Shred',0.4,element='Elemental',target='Team',note='Only the swirled element')],
 ('Crimson Witch of Flames','4pc'): [R('Reaction:Overloaded',0.4,always='Y'),R('Reaction:Burning',0.4,always='Y'),R('Reaction:Burgeon',0.4,always='Y'),
                                     R('Reaction:Vaporize',0.15,always='Y'),R('Reaction:Melt',0.15,always='Y'),R('DMG%',0.075,element='Pyro',stacks=3,note='Skill stacks, max 3')],
 ('Emblem of Severed Fate','4pc'): [R('DMG%',0.25,attack='Burst',basis='ER',always='Y',cap=0.75)],
 ('Deepwood Memories','4pc'): [R('RES Shred',0.3,element='Dendro',target='Team')],
 ('Noblesse Oblige','4pc'): [R('ATK%',0.2,target='Team')],
 ('Tenacity of the Millelith','4pc'): [R('ATK%',0.2,target='Team')],
 ('Instructor','4pc'): [R('EM',120,target='Team')],
 ('Archaic Petra','4pc'): [R('DMG%',0.35,element='Elemental',target='Team',note='Only the crystallized element')],
 ('Marechaussee Hunter','4pc'): [R('CR',0.12,stacks=3,note='Stacks on HP change, max 3')],
 ('Scroll of the Hero of Cinder City','4pc'): [R('DMG%',0.12,element='Elemental',target='Team',note='Reaction elements only; +28% more with Nightsoul Burst')],
 # ---- weapons ----
 ('Thrilling Tales of Dragon Slayers','Passive'): [R('ATK%',[0.24,0.30,0.36,0.42,0.48],target='Others',note='Next character switched in')],
 ('"The Catch"','Passive'): [R('DMG%',[0.16,0.20,0.24,0.28,0.32],attack='Burst',always='Y'),R('CR',[0.06,0.075,0.09,0.105,0.12],attack='Burst',always='Y')],
 ('Engulfing Lightning','Passive'): [R('ATK%',[0.28,0.35,0.42,0.49,0.56],basis='ER over 100%',always='Y',cap=0.8,note='Cap rises with refinement: 80/90/100/110/120%')],
 ('Elegy for the End','Passive'): [R('EM',[100,125,150,175,200],target='Team'),R('ATK%',[0.2,0.25,0.3,0.35,0.4],target='Team')],
 ('Key of Khaj-Nisut','Passive'): [R('EM',[0.0012,0.0015,0.0018,0.0021,0.0024],basis='HP',stacks=3),R('EM',[0.002,0.0025,0.003,0.0035,0.004],basis='HP',target='Others',note='At 3 stacks')],
 ("Wolf's Gravestone",'Passive'): [R('ATK%',[0.4,0.5,0.6,0.7,0.8],target='Team',note='When hitting enemies below 30% HP')],
}
TALENT = [  # (char, talent action label, stat, attack, element, basis, target, stacks, capbase, note)
 ('Bennett','Q: ATK Bonus Ratio','ATK','Any','Any','Base ATK','Team',1,None,'Inside the burst field'),
 ('Kujou Sara','E: ATK Bonus Ratio','ATK','Any','Any','Base ATK','Team',1,None,''),
 ('Arataki Itto','Q: ATK Bonus','ATK','Any','Any','DEF','Self',1,None,''),
 ('Noelle','Q: ATK Bonus','ATK','Any','Any','DEF','Self',1,None,''),
 ('Hu Tao','E: ATK Increase','ATK','Any','Any','HP','Self',1,4.0,'Capped at 400% of Base ATK'),
 ('Candace','Q: DMG Bonus','DMG%','Normal','Elemental','Fixed','Team',1,None,'Elemental Normal Attacks'),
 ('Faruzan','Q: Anemo DMG Bonus','DMG%','Any','Anemo','Fixed','Team',1,None,''),
 ('Faruzan','Q: Anemo RES Decrease','RES Shred','Any','Anemo','Fixed','Team',1,None,''),
 ('Furina','Q: Fanfare to DMG Increase Conversion Ratio','DMG%','Any','Any','Fixed','Team',300,None,'Per Fanfare point; default 300 (C0 max)'),
 ('Gorou','E: Geo DMG Bonus','DMG%','Any','Geo','Fixed','Team',1,None,'With 3+ Geo characters'),
 ('Sangonomiya Kokomi','Q: Normal Attack DMG Bonus','Flat DMG','Normal','Any','HP','Self',1,None,''),
 ('Sangonomiya Kokomi','Q: Charged Attack DMG Bonus','Flat DMG','Charged','Any','HP','Self',1,None,''),
 ('Sangonomiya Kokomi','Q: Bake-Kurage DMG Bonus','Flat DMG','Skill','Any','HP','Self',1,None,''),
 ('Mona','Q: DMG Bonus','DMG%','Any','Any','Fixed','Team',1,None,'Omen'),
 ('Shenhe','E: DMG Bonus','Flat DMG','Any','Cryo','ATK','Team',1,None,'Icy Quill, per Cryo hit'),
 ('Shenhe','Q: RES Decrease','RES Shred','Any','Cryo','Fixed','Team',1,None,''),
 ('Shenhe','Q: RES Decrease','RES Shred','Any','Physical','Fixed','Team',1,None,''),
 ('Xiao','Q: Normal/Charged/Plunging Attack DMG Bonus','DMG%','Normal','Any','Fixed','Self',1,None,''),
 ('Xiao','Q: Normal/Charged/Plunging Attack DMG Bonus','DMG%','Charged','Any','Fixed','Self',1,None,''),
 ('Xiao','Q: Normal/Charged/Plunging Attack DMG Bonus','DMG%','Plunge','Any','Fixed','Self',1,None,''),
 ('Xilonen','E: Elemental RES Decrease','RES Shred','Any','Any','Fixed','Team',1,None,'Geo + converted elements'),
 ('Yanfei','Q: Charged Attack DMG Bonus','DMG%','Charged','Any','Fixed','Self',1,None,''),
 ('Yun Jin','Q: DMG Increase','Flat DMG','Normal','Any','DEF','Team',1,None,''),
 ('Kamisato Ayato','Q: Normal Attack DMG Bonus','DMG%','Normal','Any','Fixed','Team',1,None,''),
 ('Eula','E: Physical RES Decrease','RES Shred','Any','Physical','Fixed','Team',1,None,''),
 ('Eula','E: Cryo RES Decrease','RES Shred','Any','Cryo','Fixed','Team',1,None,''),
 ('Lauma','E: Elemental RES Decrease','RES Shred','Any','Dendro','Fixed','Team',1,None,''),
 ('Lauma','E: Elemental RES Decrease','RES Shred','Any','Hydro','Fixed','Team',1,None,''),
 ('Vodyanitsa','E: Hydro/Cryo RES Reduction','RES Shred','Any','Hydro','Fixed','Team',1,None,''),
 ('Vodyanitsa','E: Hydro/Cryo RES Reduction','RES Shred','Any','Cryo','Fixed','Team',1,None,''),
 ('Nicole','E: Grace of Kenosis ATK Bonus Ratio','ATK','Any','Any','ATK','Team',1,None,''),
 ('Iansan','Q: High Nightsoul Points ATK Conversion Rate','ATK','Any','Any','ATK','Team',1,None,'High Nightsoul state'),
 ('Illuga','Q: Geo DMG Bonus','Flat DMG','Any','Geo','EM','Team',1,None,''),
 ('Kaveh','Q: Dendro Core Burst DMG Bonus','Reaction:Bloom','Any','Any','Fixed','Team',1,None,''),
 ('Aloy','E: Rushing Ice Normal Attack DMG Bonus','DMG%','Normal','Any','Fixed','Self',1,None,''),
 ('Sethos','Q: Dusk Bolt DMG Increase','Flat DMG','Charged','Any','EM','Self',1,None,''),
 ('Mavuika','Q: Sunfell Slice DMG Bonus','Flat DMG','Burst','Any','ATK','Self',200,None,'Per Fighting Spirit; default 200'),
 ('Mavuika','Q: Flamestrider Normal Attack DMG Bonus','Flat DMG','Normal','Any','ATK','Self',200,None,'Per Fighting Spirit; default 200'),
 ('Mavuika','Q: Flamestrider Charged Attack DMG Bonus','Flat DMG','Charged','Any','ATK','Self',200,None,'Per Fighting Spirit; default 200'),
 ('Kamisato Ayato','E: Namisen DMG Bonus','Flat DMG','Normal','Any','HP','Self',4,None,'Per Namisen stack; default 4'),
 ('Raiden Shogun','E: Elemental Burst DMG Bonus','DMG%','Burst','Any','Fixed','Team',60,None,"Per point of the receiver's Energy cost; default 60"),
]
M[('Elegy for the End','Passive')].insert(0, R('EM',[60,75,90,105,120],always='Y'))
M[('Key of Khaj-Nisut','Passive')].insert(0, R('HP%',[0.2,0.25,0.3,0.35,0.4],always='Y'))
M[("Wolf's Gravestone",'Passive')].insert(0, R('ATK%',[0.2,0.25,0.3,0.35,0.4],always='Y'))
M[('Engulfing Lightning','Passive')][0]['cap'] = [0.8,0.9,1.0,1.1,1.2]
M[('Bennett','C1')] = [R('ATK',0.2,basis='Base ATK',target='Team',note="Adds to Fantastic Voyage's ATK bonus; turn on together with Bennett Q")]
M[('Xingqiu','C4')] = [R('DMG%',0.5,attack='Skill',note='During Raincutter')]
M[('Xiangling','C6')] = [R('DMG%',0.15,element='Pyro',target='Team',note='While Pyronado is spinning')]
