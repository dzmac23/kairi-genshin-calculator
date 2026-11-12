const g = require('genshin-db'); const fs=require('fs');
const CK=[[1,''],[20,''],[20,'+'],[40,''],[40,'+'],[50,''],[50,'+'],[60,''],[60,'+'],[70,''],[70,'+'],[80,''],[80,'+'],[90,''],[95,''],[100,'']];
const WK=CK.slice(0,14);
const chars=[];
let names=g.characters('names',{matchCategories:true}).filter(n=>!/^(Aether|Lumine|Manekin|Manekina)$/.test(n));
function cstats(c){return CK.map(([l,p])=>{const s=c.stats(l,p||undefined);return {key:l+p,level:l,hp:s.hp,atk:s.attack,def:s.defense,spec:s.specialized};});}
for(const n of names){const c=g.characters(n); chars.push({name:c.name,element:c.elementText,weapon:c.weaponText,rarity:c.rarity,version:c.version,substat:c.substatText,stats:cstats(c)});}
const ae=g.characters('Aether');
for(const el of ['Anemo','Geo','Electro','Dendro','Hydro','Pyro','Cryo']){
  if(g.talents('Traveler ('+el+')')) chars.push({name:'Traveler ('+el+')',element:el,weapon:ae.weaponText,rarity:5,version:'',substat:ae.substatText,stats:cstats(ae)});
}
const tal=[];
for(const c of chars){const t=g.talents(c.name); if(!t){console.error('no talents',c.name);continue;}
  for(const [k,cat] of [['combat1','Normal Attack'],['combat2','Skill'],['combatsp','Special'],['combat3','Burst']]){
    if(!t[k]||!t[k].attributes) continue;
    tal.push({char:c.name,cat,tname:t[k].name,labels:t[k].attributes.labels,params:t[k].attributes.parameters});}}
const weps=[];
for(const n of g.weapons('names',{matchCategories:true})){const w=g.weapons(n); if(w.rarity<3) continue;
  weps.push({name:w.name,type:w.weaponText,rarity:w.rarity,substat:w.mainStatText||'',version:w.version,
   effect:w.effectName||'', r1:(w.r1&&w.r1.description)||'',
   stats:WK.map(([l,p])=>{const s=w.stats(l,p||undefined);return {key:l+p,atk:s.attack,spec:s.specialized};})});}
fs.writeFileSync('../raw.json',JSON.stringify({chars,tal,weps}));
console.log(chars.length, tal.length, weps.length);
