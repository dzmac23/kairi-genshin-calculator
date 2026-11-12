const g=require('genshin-db'); const fs=require('fs');
const raw=JSON.parse(fs.readFileSync('../raw.json'));
const out={weapons:[],sets:[],chars:[]};
for(const w0 of raw.weps){const w=g.weapons(w0.name);
  out.weapons.push({name:w.name,type:w.weaponText,rarity:w.rarity,effect:w.effectName||'',tpl:(w.effectTemplateRaw||'').replace(/<[^>]+>/g,''),
   r:[1,2,3,4,5].map(i=>w['r'+i]?w['r'+i].values:null)});}
for(const n of g.artifacts('names',{matchCategories:true})){const a=g.artifacts(n);
  out.sets.push({name:a.name,p1:a.effect1Pc||'',p2:a.effect2Pc||'',p4:a.effect4Pc||'',rarity:a.rarityList});}
for(const c of raw.chars){const base=c.name.startsWith('Traveler')?c.name:c.name;
  const t=g.talents(c.name)||{}; const k=g.constellations(c.name)||{};
  const e={name:c.name,element:c.element,items:[]};
  for(const p of ['passive1','passive2','passive3','passive4']) if(t[p]) e.items.push({slot:p,name:t[p].name,text:t[p].description});
  for(const p of ['c1','c2','c3','c4','c5','c6']) if(k[p]) e.items.push({slot:p.toUpperCase(),name:k[p].name,text:k[p].description});
  out.chars.push(e);}
fs.writeFileSync('../buffsrc.json',JSON.stringify(out));
console.log(out.weapons.length,out.sets.length,out.chars.length,out.chars.reduce((a,c)=>a+c.items.length,0));
console.log(out.chars.filter(c=>c.items.length<9).map(c=>c.name+':'+c.items.length).join(', '));
