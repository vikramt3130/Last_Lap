const $=s=>document.querySelector(s);
const canvas=$('#sea'),ctx=canvas.getContext('2d'),joinButton=$('#dive-button'),nameInput=$('#fish-name');
const state={ws:null,started:false,ready:false,self:null,others:new Map(),fish:new Map(),board:[],ocean:'—',online:0,capacity:10,keys:new Set(),direction:{x:0,y:0},mouse:{x:0,y:0,active:false},pointer:null,joining:false,lastInput:0,lastFrame:0,lastState:0,toastTimer:0,joinTimer:0,serverOffset:0,respawnShown:false,connectionLost:false};
let dpr=1,w=0,h=0,scale=1,drawX=0,drawY=0,worldW=5000,worldH=3200,haveDraw=false;
const COLORS=['#85e5d0','#ffd166','#ff8f70','#9fa8ff','#c4ec75','#ff9bca','#69c9f0','#e7a76d'];
function showToast(message){const node=$('#toast');node.textContent=message;node.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>node.classList.remove('show'),1900);}
function setConnection(label,kind=''){ $('#connection-label').textContent=label;$('#connection-dot').className=kind;}
function connect(){
 if(state.ws&&state.ws.readyState<2)return;
 const proto=location.protocol==='https:'?'wss:':'ws:';state.ws=new WebSocket(proto+'//'+location.host+'/play');
 setConnection('CONNECTING');
 state.ws.onopen=()=>{setConnection('JOINING OCEAN…');state.ws.send(JSON.stringify({type:'join',name:nameInput.value.trim()||'Minnow'}));};
 state.ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}handleMessage(m);};
 state.ws.onerror=()=>setConnection('SIGNAL LOST','bad');
 state.ws.onclose=()=>{if(state.started){showConnectionLost('The ocean server stopped responding. Reconnect to rejoin as a small fish.');}else if(state.joining){setConnection('RECONNECTING','bad');setTimeout(()=>{if(state.joining)connect()},1800);}else if(!state.connectionLost)setConnection('JOIN FAILED · RETRY','bad');};
}
function fishForm(mass){
 if(mass>=2000)return 'whale';
 if(mass>=1000)return 'shark';
 if(mass>=500)return 'young-shark';
 if(mass>=200)return 'puffer';
 if(mass>=50)return 'goldfish';
 return 'minnow';
}
function formName(mass){const stage=fishForm(mass);return stage==='young-shark'?'Baby shark':stage[0].toUpperCase()+stage.slice(1);}
function handleMessage(m){
 if(m.type==='welcome'){
  clearTimeout(state.joinTimer);state.joining=false;state.started=true;state.connectionLost=false;state.lastState=performance.now();joinButton.disabled=true;joinButton.querySelector('span').textContent='IN THE OCEAN';state.ocean=m.ocean;state.capacity=m.capacity||10;setConnection('CONNECTED','live');document.getElementById('connection-overlay').classList.add('hidden');document.getElementById('join-hint').textContent='NO ROOM CODE · UP TO 10 FISH PER OCEAN';$('#spawn-overlay').classList.add('hidden');showToast('You’re in. Find the smaller fish.');return;
 }
 if(m.type==='eaten'){state.respawnShown=true;const cause=m.predator?'A '+m.by+' swallowed you.':m.by+' gulped you.';$('#respawn-copy').textContent=cause+' Back in the sea in '+Math.max(1,Math.ceil(m.respawnIn/1000))+' seconds.';$('#eaten-overlay').classList.remove('hidden');showToast(cause);return;} if(m.type!=='state')return;
 const now=performance.now();
 state.serverOffset=Date.now()-m.now;worldW=m.width||worldW;worldH=m.height||worldH;
 state.lastState=now;state.ocean=m.ocean;state.online=m.online;state.capacity=m.capacity||10;state.board=m.board||[];
 const previous=state.self;
 state.self={...m.self,rotation:previous?.rotation??Math.atan2(m.self.vy||0,m.self.vx||1),gulpUntil:previous?.gulpUntil||0,evolveUntil:previous?.evolveUntil||0,buffs:m.self.buffs||{},buffPulseUntil:previous?.buffPulseUntil||0,giantScale:previous?.giantScale||1};
 if(previous&&m.self.eaten>(previous.eaten||0))state.self.gulpUntil=now+420;
 if(previous){for(const [key,label] of [['goldUntil','GOLD SHIELD · UNGULPABLE'],['speedUntil','SWORD SPEED · 3× SWIM'],['giantUntil','GIANT GULP · 2.5× SIZE']])if((m.self.buffs?.[key]||0)>(previous.buffs?.[key]||0)){state.self.buffPulseUntil=now+1900;showToast(label+'!');}}
 if(previous&&fishForm(m.self.mass)!==fishForm(previous.mass)){state.self.evolveUntil=now+2600;showToast('Evolution: '+formName(m.self.mass)+'!');}
 if(m.self.dead){state.respawnShown=true;$('#eaten-overlay').classList.remove('hidden');$('#respawn-copy').textContent='Back in the sea in '+Math.max(1,Math.ceil(m.self.respawnIn/1000))+' seconds.';}
 else if(previous?.dead||state.respawnShown){state.respawnShown=false;$('#eaten-overlay').classList.add('hidden');showToast('Fresh fins. Swim smart.');}
 if(!haveDraw&&m.self){drawX=m.self.x;drawY=m.self.y;haveDraw=true;}
 const next=new Map();
 for(const p of m.players||[]){
  const old=state.others.get(p.id),entity={...p,dx:old?.dx??p.x,dy:old?.dy??p.y,rotation:old?.rotation??Math.atan2(p.vy||0,p.vx||1),gulpUntil:old?.gulpUntil||0,evolveUntil:old?.evolveUntil||0};
  if(old&&p.eaten>(old.eaten||0))entity.gulpUntil=now+420;
  entity.buffs=p.buffs||{};entity.buffPulseUntil=old?.buffPulseUntil||0;entity.giantScale=old?.giantScale||1;if(old){for(const key of ['goldUntil','speedUntil','giantUntil'])if((p.buffs?.[key]||0)>(old.buffs?.[key]||0))entity.buffPulseUntil=now+1900;}
  if(old&&fishForm(p.mass)!==fishForm(old.mass))entity.evolveUntil=now+2600;
  next.set(p.id,entity);
 }
 state.others=next;
 const foods=new Map();
 for(const f of m.fish||[]){const old=state.fish.get(f.id),entity={...f,dx:old?.dx??f.x,dy:old?.dy??f.y,rotation:old?.rotation??Math.atan2(f.vy||0,f.vx||1),gulpUntil:old?.gulpUntil||0,evolveUntil:old?.evolveUntil||0};if(old&&f.eaten>(old.eaten||0))entity.gulpUntil=now+420;if(old&&f.species!==old.species)entity.evolveUntil=now+2600;foods.set(f.id,entity);}
 state.fish=foods;
 renderHUD();
}function buffRemaining(until){return Math.max(0,(until||0)-(Date.now()-(state.serverOffset||0)));}
function activeBuffs(buffs={}){return{gold:buffRemaining(buffs.goldUntil)>0,speed:buffRemaining(buffs.speedUntil)>0,giant:buffRemaining(buffs.giantUntil)>0};}
function visualBuffs(entity,dt){const active=activeBuffs(entity.buffs),target=active.giant?2.5:1;entity.giantScale=(entity.giantScale||1)+(target-(entity.giantScale||1))*Math.min(1,dt*7);return{...active,giant:active.giant||entity.giantScale>1.03,giantScale:entity.giantScale};}
function renderBuffHUD(){const node=document.getElementById("buff-tracker");if(!node)return;node.textContent='';const b=state.self?.buffs||{};for(const item of [['goldUntil','GOLD SHIELD'],['speedUntil','SWORD SPEED'],['giantUntil','GIANT GULP']]){const seconds=Math.ceil(buffRemaining(b[item[0]])/1000);if(seconds<=0)continue;const pill=document.createElement('div');pill.className='buff-pill '+item[0].replace('Until','');const title=document.createElement('strong');title.textContent=item[1];const timer=document.createElement('span');timer.textContent=seconds+'s';pill.append(title,timer);node.append(pill);}}
function renderHUD(){renderBuffHUD();
 if(!state.self)return;const p=state.self;
 $('#mass-value').textContent=p.mass;$('#fish-count').textContent=p.eaten||0;$('#ko-count').textContent=p.kos||0;
 $('#ocean-id').textContent=state.ocean;$('#online-count').textContent=state.online+' / '+state.capacity+' SWIMMING';
 const progress=Math.min(100,Math.max(8,(p.r-10)/64*100));$('#mass-meter').style.width=progress+'%';
 document.getElementById('growth-copy').textContent=p.protected?'SHIELDED · '+formName(p.mass).toUpperCase():p.r>32?'GROWING · '+formName(p.mass).toUpperCase():'EAT TO GROW · '+formName(p.mass).toUpperCase();
 $('#board-count').textContent=state.online+' LIVE';
 const list=$('#leader-list');list.textContent='';
 state.board.forEach((b,i)=>{const li=document.createElement('li');if(b.id===p.id)li.classList.add('you');const rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');const dot=document.createElement('i');dot.className='dot';dot.style.background=b.color;const name=document.createElement('span');name.className='name';name.textContent=b.name+(b.id===p.id?' · YOU':'');const score=document.createElement('span');score.className='score';score.textContent=b.mass;li.append(rank,dot,name,score);list.append(li);});
}
function resize(){const rect=canvas.getBoundingClientRect();w=rect.width;h=rect.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.floor(w*dpr));canvas.height=Math.max(1,Math.floor(h*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);scale=Math.min(1.08,w/1050,h/700);}
window.addEventListener('resize',resize);resize();
function pointerDir(e){if(!state.self)return;const r=canvas.getBoundingClientRect(),dx=e.clientX-r.left-w/2,dy=e.clientY-r.top-h/2,len=Math.hypot(dx,dy);if(len>15){state.mouse.x=dx/len;state.mouse.y=dy/len;state.mouse.active=true;}}
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse')pointerDir(e);});
canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')state.mouse.active=false;});
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();state.keys.add(k);if(k==='?'||k==='h')$('#help-modal').classList.remove('hidden');},{passive:false});
window.addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>state.keys.clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden)state.keys.clear();});
function vector(){
 let x=(state.keys.has('d')||state.keys.has('arrowright')?1:0)-(state.keys.has('a')||state.keys.has('arrowleft')?1:0);
 let y=(state.keys.has('s')||state.keys.has('arrowdown')?1:0)-(state.keys.has('w')||state.keys.has('arrowup')?1:0);
 if(state.pointer){x=state.pointer.x;y=state.pointer.y;}
 else if(state.mouse.active&&Math.hypot(state.mouse.x,state.mouse.y)>.01){x=state.mouse.x;y=state.mouse.y;}
 const n=Math.hypot(x,y);return n>1?{x:x/n,y:y/n}:{x,y};
}
const stick=$('#joystick');
stick.addEventListener('pointerdown',e=>{e.preventDefault();stick.setPointerCapture(e.pointerId);state.pointer={x:0,y:0};moveStick(e);});
stick.addEventListener('pointermove',e=>{if(state.pointer)moveStick(e);});
function moveStick(e){const r=stick.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),max=r.width*.29,n=Math.hypot(dx,dy)||1;state.pointer={x:dx/n*Math.min(1,n/max),y:dy/n*Math.min(1,n/max)};const knob=stick.querySelector('span');knob.style.left='calc(50% + '+Math.max(-max,Math.min(max,dx))+'px)';knob.style.top='calc(50% + '+Math.max(-max,Math.min(max,dy))+'px)';}
function endStick(){state.pointer=null;const k=stick.querySelector('span');k.style.left='50%';k.style.top='50%';}
stick.addEventListener('pointerup',endStick);stick.addEventListener('pointercancel',endStick);stick.addEventListener('lostpointercapture',endStick);
function start(){if(state.started||state.joining)return;state.connectionLost=false;state.joining=true;joinButton.disabled=true;joinButton.querySelector('span').textContent='FINDING AN OCEAN…';document.getElementById('join-hint').textContent='CONNECTING TO THE OCEAN…';connect();state.joinTimer=setTimeout(()=>{if(state.started)return;state.joining=false;joinButton.disabled=false;joinButton.querySelector('span').textContent='TRY AGAIN';document.getElementById('join-hint').textContent='SERVER UNAVAILABLE · CHECK CONNECTION AND RETRY';setConnection('OCEAN CONNECTION TIMED OUT','bad');if(state.ws&&state.ws.readyState<2)state.ws.close();},10000);}joinButton.addEventListener('click',start);nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')start();});
$('#help-button').addEventListener('click',()=>$('#help-modal').classList.remove('hidden'));$('#help-close').addEventListener('click',()=>$('#help-modal').classList.add('hidden'));$('#help-done').addEventListener('click',()=>$('#help-modal').classList.add('hidden'));
function showConnectionLost(message){if(state.connectionLost)return;state.connectionLost=true;state.started=false;state.joining=false;state.keys.clear();state.pointer=null;clearTimeout(state.joinTimer);setConnection('CONNECTION LOST','bad');document.getElementById('connection-copy').textContent=message;document.getElementById('connection-overlay').classList.remove('hidden');}
document.getElementById('reconnect-button').addEventListener('click',()=>{const old=state.ws;state.ws=null;if(old){old.onopen=old.onmessage=old.onerror=old.onclose=null;if(old.readyState<2)old.close();}state.started=false;state.joining=false;state.connectionLost=false;state.self=null;state.others.clear();state.fish.clear();state.board=[];state.lastState=0;haveDraw=false;state.keys.clear();endStick();document.getElementById('connection-overlay').classList.add('hidden');document.getElementById('spawn-overlay').classList.remove('hidden');joinButton.disabled=false;joinButton.querySelector('span').textContent='DIVE IN';start();});function drawBackground(now){
 const water=ctx.createLinearGradient(0,0,0,h);water.addColorStop(0,'#167b7a');water.addColorStop(.34,'#105d63');water.addColorStop(.72,'#0a3944');water.addColorStop(1,'#061f2b');ctx.fillStyle=water;ctx.fillRect(0,0,w,h);
 const light=ctx.createRadialGradient(w*.52,h*.04,0,w*.52,h*.12,Math.max(w,h)*.8);light.addColorStop(0,'#72eee07a');light.addColorStop(.42,'#37b8aa22');light.addColorStop(1,'#06252d00');ctx.fillStyle=light;ctx.fillRect(0,0,w,h);
 ctx.save();ctx.globalCompositeOperation='screen';
 for(let i=0;i<7;i++){const sway=Math.sin(now*.00025+i*1.7)*36,x=(i+.5)*w/7+sway;ctx.beginPath();ctx.moveTo(x-18,0);ctx.lineTo(x+12,0);ctx.lineTo(x+150,h*.67);ctx.lineTo(x-72,h*.67);ctx.closePath();const beam=ctx.createLinearGradient(x,0,x+30,h*.67);beam.addColorStop(0,'#d2fff322');beam.addColorStop(1,'#b6fff000');ctx.fillStyle=beam;ctx.fill();}
 ctx.restore();
 const bands=[{y:.28,color:'#1b888366'},{y:.48,color:'#07555c88'},{y:.68,color:'#052f3bb0'}];
 bands.forEach((band,layer)=>{const base=h*band.y;ctx.beginPath();ctx.moveTo(0,h);for(let x=0;x<=w+24;x+=24){const yy=base+Math.sin(x*.007+now*.00012+layer*1.8)*h*.025+Math.sin(x*.015-now*.00009+layer)*h*.009;ctx.lineTo(x,yy);}ctx.lineTo(w,h);ctx.closePath();ctx.fillStyle=band.color;ctx.fill();});
 ctx.lineCap='round';for(let i=0;i<9;i++){const x=((i*173+now*.012)%(w+120))-60,y=h*(.13+(i%4)*.055),wave=Math.sin(now*.001+i)*5;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+18,y-5+wave,x+34,y+5-wave,x+54,y);ctx.strokeStyle='#b5fff32a';ctx.lineWidth=1+(i%2);ctx.stroke();}
 for(let i=0;i<32;i++){const seed=i*129.7,px=((seed+now*(.006+i%3*.001))%(w+70))-35,py=((i*83-now*(.008+i%4*.001)+h*4)%h);const radius=1.5+(i%4)*1.15;ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.strokeStyle=i%3===0?'#c8fff04a':'#d9fff223';ctx.lineWidth=1;ctx.stroke();ctx.beginPath();ctx.arc(px-radius*.3,py-radius*.35,Math.max(.6,radius*.16),0,Math.PI*2);ctx.fillStyle='#effff099';ctx.fill();}
 ctx.save();ctx.lineCap='round';for(let clump=0;clump<12;clump++){const baseX=((clump*191-drawX*.045)%(w+160)+w+160)%(w+160)-80,baseY=h+10;for(let blade=0;blade<4;blade++){const x=baseX+blade*8,height=h*(.12+.035*((clump+blade)%4)),phase=now*.00072+clump*.8+blade*.55,sway=Math.sin(phase)*height*.15,tipX=x+sway;ctx.beginPath();ctx.moveTo(x,baseY);ctx.bezierCurveTo(x+sway*.3,baseY-height*.34,x-sway*.55,baseY-height*.72,tipX,baseY-height);ctx.strokeStyle=['#42ad8a9c','#287f738f','#67c59a9c','#218477a0'][(clump+blade)%4];ctx.lineWidth=3+blade*.65;ctx.stroke();for(let leaf=0;leaf<2;leaf++){const t=.36+leaf*.2,yy=baseY-height*t,xx=x+sway*(t*t);const side=(leaf+blade+clump)%2?1:-1;ctx.beginPath();ctx.moveTo(xx,yy);ctx.quadraticCurveTo(xx+side*height*.11,yy-height*.025,xx+side*height*.16,yy-height*.12);ctx.quadraticCurveTo(xx+side*height*.08,yy-height*.08,xx,yy);ctx.fillStyle='#43a98178';ctx.fill();}}}ctx.restore();
 const edgeX=[w/2-drawX*scale,w/2+(worldW-drawX)*scale],edgeY=[h/2-drawY*scale,h/2+(worldH-drawY)*scale];ctx.save();ctx.lineWidth=3;ctx.strokeStyle='#d4f47a';ctx.shadowColor='#bcf776';ctx.shadowBlur=15;for(let side=0;side<2;side++){const x=edgeX[side],inward=side===0?1:-1;if(x>=-2&&x<=w+2){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#d4f47a88';for(let y=18;y<h;y+=42){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+inward*11,y+8);ctx.stroke();}ctx.save();ctx.translate(x+inward*14,h*.52);ctx.rotate(-Math.PI/2);ctx.fillStyle='#e1ff9d';ctx.font='700 9px DM Mono, monospace';ctx.textAlign='center';ctx.fillText('OCEAN EDGE',0,0);ctx.restore();ctx.strokeStyle='#d4f47a';ctx.shadowBlur=15;}}for(let side=0;side<2;side++){const y=edgeY[side],inward=side===0?1:-1;if(y>=-2&&y<=h+2){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();ctx.shadowBlur=0;ctx.strokeStyle='#d4f47a88';for(let x=18;x<w;x+=42){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8,y+inward*11);ctx.stroke();}ctx.save();ctx.translate(w*.52,y+inward*14);ctx.fillStyle='#e1ff9d';ctx.font='700 9px DM Mono, monospace';ctx.textAlign='center';ctx.fillText('OCEAN EDGE',0,0);ctx.restore();ctx.strokeStyle='#d4f47a';ctx.shadowBlur=15;}}ctx.restore();
}function delta(a,b,size){return a-b;}
function worldPoint(x,y){return{ x:w/2+delta(x,drawX,worldW)*scale, y:h/2+delta(y,drawY,worldH)*scale};}
function smoothHeading(entity,dt){
 const vx=entity.vx||0,vy=entity.vy||0;
 if(Math.hypot(vx,vy)<3)return entity.rotation||0;
 const target=Math.atan2(vy,vx),current=Number.isFinite(entity.rotation)?entity.rotation:target;
 let difference=target-current;
 difference=Math.atan2(Math.sin(difference),Math.cos(difference));
 entity.rotation=current+difference*Math.min(1,dt*9);
 return entity.rotation;
}
function drawFish(x,y,r,colorValue,now,isPlayer=false,name='',mass=0,protectedFish=false,self=false,heading=0,gulpUntil=0,evolveUntil=0,species='minnow',showMass=false,weightStatus='neutral',buffType=null,effects=null,buffPulseUntil=0){
 const pt=worldPoint(x,y),rr=Math.max(4,r*scale);
 const giantScale=effects?.giantScale||1,giant=giantScale>1.03,extent=giant?2.7:1;if(pt.x<-rr*3*extent||pt.x>w+rr*3*extent||pt.y<-rr*3*extent||pt.y>h+rr*3*extent)return;
 const form=isPlayer?fishForm(mass):(species||'minnow');
 const formColor={sprat:'#75d8cc',minnow:colorValue,goldfish:'#ffb638','young-shark':'#8fc9c4',puffer:'#e6cf7a',tuna:'#80b6e2',swordfish:'#69c9f0',sunfish:'#c894ff',shark:'#7296ae',whale:'#72a8a4'}[form];
 const accent={sprat:'#d7fff4',minnow:'#eafff3',goldfish:'#fff0a1','young-shark':'#d9ffff',puffer:'#fff1b5',tuna:'#e0f1ff',swordfish:'#b9f1ff',sunfish:'#f1dcff',shark:'#d8e8ef',whale:'#d2efdd'}[form];
 const outline={sprat:'#173a3b',minnow:'#183c3b',goldfish:'#754234','young-shark':'#23494b',puffer:'#675639',tuna:'#344f66',swordfish:'#1b4c62',sunfish:'#624a78',shark:'#263e50',whale:'#315b5a'}[form];
 const gulp=Math.max(0,Math.min(1,(gulpUntil-now)/320));
 const evolve=Math.max(0,Math.min(1,(evolveUntil-now)/2600));
 const wag=Math.sin(now*.014+(mass||r))*.16;
 ctx.save();ctx.translate(pt.x,pt.y);ctx.rotate(heading);if(giant)ctx.scale(giantScale,giantScale);ctx.lineJoin='round';ctx.lineCap='round';
 const auraType=buffType||(effects?.gold?'gold':effects?.speed?'speed':effects?.giant?'giant':null),auraColor={gold:'#ffd451',speed:'#54caff',giant:'#bd79ff'}[auraType];if(auraColor){const pulse=.5+.5*Math.sin(now*.008);ctx.save();ctx.globalAlpha=buffType ? .82 : .35+pulse*.24;ctx.shadowColor=auraColor;ctx.shadowBlur=buffType?24:19;ctx.beginPath();ctx.ellipse(0,0,rr*(1.35+pulse*.14),rr*(.98+pulse*.09),0,0,Math.PI*2);ctx.strokeStyle=auraColor;ctx.lineWidth=buffType?2.4:2;ctx.stroke();if(buffType){for(let i=0;i<8;i++){const a=now*.001+i*Math.PI/4,inner=rr*1.13,outer=rr*(1.25+(i%2)*.18);ctx.beginPath();ctx.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);ctx.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);ctx.strokeStyle=auraColor;ctx.lineWidth=1.5;ctx.stroke();}}if(effects?.speed){ctx.globalAlpha=.3;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-rr*(1.1+i*.2),-rr*(.2+i*.2));ctx.lineTo(-rr*(1.8+i*.2),-rr*(.2+i*.2));ctx.strokeStyle=auraColor;ctx.lineWidth=2;ctx.stroke();}}ctx.restore();}if(buffPulseUntil>now){const pulse=(buffPulseUntil-now)/1900;ctx.beginPath();ctx.arc(0,0,rr*(1.15+(1-pulse)*1.3),0,Math.PI*2);ctx.strokeStyle=(auraColor||'#ffffff')+Math.round(pulse*190).toString(16).padStart(2,'0');ctx.lineWidth=3*pulse;ctx.stroke();}
 if(gulp>0)ctx.scale(1+Math.sin(gulp*Math.PI)*.18,1-Math.sin(gulp*Math.PI)*.09);
 if(protectedFish){ctx.beginPath();ctx.arc(0,0,rr*1.75,0,Math.PI*2);ctx.strokeStyle='#e5ff9b8a';ctx.lineWidth=1.5;ctx.setLineDash([3,4]);ctx.stroke();ctx.setLineDash([]);}
 if(evolve>0){ctx.beginPath();ctx.arc(0,0,rr*(1.35+(1-evolve)*.55),0,Math.PI*2);ctx.strokeStyle=accent+Math.round(evolve*150).toString(16).padStart(2,'0');ctx.lineWidth=2+evolve*2;ctx.stroke();}
 ctx.shadowColor=formColor+'66';ctx.shadowBlur=Math.min(18,rr*.8);ctx.lineWidth=Math.max(1.2,rr*.075);ctx.strokeStyle=outline;
 // Species-specific tails make each growth step readable at a glance.
 ctx.beginPath();
 if(form==='whale'){
  ctx.moveTo(-rr*.88,0);ctx.quadraticCurveTo(-rr*1.38,-rr*.08,-rr*1.48,-rr*.48+wag*rr);ctx.quadraticCurveTo(-rr*1.12,-rr*.52,-rr*.93,-rr*.18);ctx.quadraticCurveTo(-rr*1.08,0,-rr*.93,rr*.18);ctx.quadraticCurveTo(-rr*1.12,rr*.52-wag*rr,-rr*1.48,rr*.48-wag*rr);ctx.quadraticCurveTo(-rr*1.38,rr*.08,-rr*.88,0);
 }else if(form==='goldfish'){
  ctx.moveTo(-rr*.72,0);ctx.quadraticCurveTo(-rr*1.35,-rr*.6-wag*rr,-rr*1.55,-rr*.42-wag*rr);ctx.quadraticCurveTo(-rr*1.38,0,-rr*1.55,rr*.42+wag*rr);ctx.quadraticCurveTo(-rr*1.35,rr*.6+wag*rr,-rr*.72,0);
 }else{
  ctx.moveTo(-rr*.65,0);ctx.lineTo(-rr*1.25,-rr*.52+wag*rr);ctx.lineTo(-rr*1.13,0);ctx.lineTo(-rr*1.25,rr*.52+wag*rr);ctx.closePath();
 }
 ctx.fillStyle=formColor;ctx.fill();ctx.stroke();ctx.shadowBlur=0;
 // Dorsal, pectoral, and flowing fins.
 if(form==='young-shark'||form==='shark'||form==='tuna'||form==='swordfish'){
  ctx.beginPath();ctx.moveTo(-rr*.22,-rr*.48);ctx.lineTo(rr*.08,-rr*1.03);ctx.lineTo(rr*.4,-rr*.45);ctx.closePath();ctx.fillStyle=accent;ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-rr*.05,rr*.34);ctx.lineTo(rr*.48,rr*.78+wag*rr);ctx.lineTo(rr*.36,rr*.25);ctx.closePath();ctx.fillStyle=formColor;ctx.fill();ctx.stroke();
  if(form==='shark'){ctx.beginPath();ctx.moveTo(-rr*.5,-rr*.39);ctx.lineTo(-rr*.3,-rr*.69);ctx.lineTo(-rr*.12,-rr*.48);ctx.closePath();ctx.fillStyle=accent;ctx.fill();ctx.stroke();}
 }else if(form==='whale'){
  ctx.beginPath();ctx.moveTo(-rr*.05,rr*.35);ctx.quadraticCurveTo(rr*.2,rr*.88,rr*.74,rr*.7);ctx.quadraticCurveTo(rr*.53,rr*.28,rr*.36,rr*.18);ctx.closePath();ctx.fillStyle=accent;ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-rr*.35,-rr*.48);ctx.quadraticCurveTo(-rr*.12,-rr*.66,rr*.08,-rr*.5);ctx.lineTo(-rr*.08,-rr*.25);ctx.closePath();ctx.fillStyle=accent;ctx.fill();ctx.stroke();
 }else if(form==='puffer'){
  for(let i=0;i<12;i++){const a=i*Math.PI*2/12,inner=rr*.63,outer=rr*.91;ctx.beginPath();ctx.moveTo(Math.cos(a-.11)*inner,Math.sin(a-.11)*inner);ctx.lineTo(Math.cos(a)*outer,Math.sin(a)*outer);ctx.lineTo(Math.cos(a+.11)*inner,Math.sin(a+.11)*inner);ctx.closePath();ctx.fillStyle=accent;ctx.fill();ctx.stroke();}
 }else if(form==='goldfish'){
  ctx.beginPath();ctx.moveTo(-rr*.12,-rr*.5);ctx.quadraticCurveTo(rr*.12,-rr*.83,rr*.48,-rr*.54);ctx.lineTo(rr*.2,-rr*.32);ctx.closePath();ctx.fillStyle=accent;ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-rr*.12,rr*.4);ctx.quadraticCurveTo(rr*.2,rr*.85,rr*.55,rr*.55);ctx.lineTo(rr*.2,rr*.27);ctx.closePath();ctx.fillStyle='#f38d45';ctx.fill();ctx.stroke();
 }
 // Rounded early fish, streamlined sharks, and a broad whale body.
 const grad=ctx.createRadialGradient(-rr*.2,-rr*.32,1,0,0,rr*1.15);grad.addColorStop(0,'#ffffffd8');grad.addColorStop(.25,formColor);grad.addColorStop(1,formColor+'bb');
 ctx.beginPath();
 if(form==='young-shark'||form==='shark'||form==='tuna'||form==='swordfish'){
  ctx.moveTo(-rr*.88,0);ctx.quadraticCurveTo(-rr*.3,-rr*.62,rr*.62,-rr*.3);ctx.lineTo(rr*1.02,-rr*.06);ctx.quadraticCurveTo(rr*1.12,0,rr*1.02,rr*.06);ctx.lineTo(rr*.62,rr*.3);ctx.quadraticCurveTo(-rr*.3,rr*.62,-rr*.88,0);
 }else{
  const width=form==='whale'?rr*1.18:form==='puffer'?rr*.8:form==='sunfish'?rr*.92:form==='goldfish'?rr*1.03:rr;
  ctx.ellipse(0,0,width,rr*((form==='goldfish'||form==='puffer') ? .76 : form==='sunfish' ? .88 : .68),0,0,Math.PI*2);
 }
 ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle=outline;ctx.lineWidth=Math.max(1.2,rr*.075);ctx.stroke();ctx.shadowBlur=0;
 if(form==='swordfish'){ctx.beginPath();ctx.moveTo(rr*.72,-rr*.035);ctx.lineTo(rr*1.7,0);ctx.lineTo(rr*.72,rr*.035);ctx.closePath();ctx.fillStyle='#baf6ff';ctx.fill();ctx.strokeStyle=outline;ctx.lineWidth=Math.max(.7,rr*.025);ctx.stroke();}
 if(form==='goldfish'&&rr>8){
  ctx.fillStyle='#f27d36aa';for(let row=-1;row<=1;row++){for(let col=0;col<3;col++){const sx=-rr*.25+col*rr*.28+(row===0?0:rr*.1),sy=row*rr*.2;ctx.beginPath();ctx.arc(sx,sy,Math.max(.8,rr*.045),0,Math.PI*2);ctx.fill();}}
  ctx.beginPath();ctx.moveTo(-rr*.62,0);ctx.quadraticCurveTo(-rr*.25,-rr*.05,rr*.1,0);ctx.strokeStyle='#fff0a188';ctx.lineWidth=Math.max(1,rr*.035);ctx.stroke();
 }
 if(form==='young-shark'||form==='shark'){
  ctx.strokeStyle=accent+'bb';ctx.lineWidth=Math.max(1,rr*.035);
  for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(rr*.18+i*rr*.13,-rr*.12);ctx.lineTo(rr*.2+i*rr*.13,rr*.18);ctx.stroke();}
  if(rr>10){ctx.fillStyle='#fff9df';for(let i=0;i<4;i++){const tx=rr*.58+i*rr*.085;ctx.beginPath();ctx.moveTo(tx,rr*.065);ctx.lineTo(tx+rr*.075,rr*.065);ctx.lineTo(tx+rr*.037,rr*.16);ctx.closePath();ctx.fill();ctx.strokeStyle=outline;ctx.lineWidth=Math.max(.6,rr*.018);ctx.stroke();}}
 }else if(form==='whale'){
  ctx.fillStyle=accent+'bb';for(let i=0;i<4;i++){ctx.beginPath();ctx.arc(-rr*.25+i*rr*.16,-rr*.16+(i%2)*rr*.12,Math.max(.8,rr*.035),0,Math.PI*2);ctx.fill();}
  ctx.beginPath();ctx.arc(rr*.02,-rr*.5,Math.max(1,rr*.045),0,Math.PI*2);ctx.fillStyle=accent;ctx.fill();
 }
 // Oversized expressive eye, tiny catchlight, and a readable mouth.
 const eyeX=form==='whale'?rr*.82:rr*.52,eyeY=-rr*.12,eyeR=Math.max(2,rr*.13);
 ctx.beginPath();ctx.arc(eyeX,eyeY,eyeR,0,Math.PI*2);ctx.fillStyle='#fff9e9';ctx.fill();ctx.strokeStyle=outline;ctx.lineWidth=Math.max(1,rr*.045);ctx.stroke();
 ctx.beginPath();ctx.arc(eyeX+eyeR*.2,eyeY,eyeR*.54,0,Math.PI*2);ctx.fillStyle='#18323a';ctx.fill();
 ctx.beginPath();ctx.arc(eyeX+eyeR*.34,eyeY-eyeR*.2,Math.max(.7,eyeR*.22),0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
 if(gulp>0){ctx.beginPath();ctx.moveTo(rr*.7,rr*.12);ctx.quadraticCurveTo(rr*.91,rr*(.3+.18*Math.sin(gulp*Math.PI)),rr*1.08,rr*.12);ctx.closePath();ctx.fillStyle='#182d32';ctx.fill();ctx.strokeStyle=outline;ctx.lineWidth=Math.max(1,rr*.045);ctx.stroke();}
 else{ctx.beginPath();ctx.moveTo(rr*.76,rr*.18);ctx.quadraticCurveTo(rr*.9,rr*.25,rr*1.02,rr*.13);ctx.strokeStyle=outline;ctx.lineWidth=Math.max(1,rr*.045);ctx.stroke();}

 if(isPlayer){ctx.fillStyle='#eff7ee';ctx.font='600 '+Math.max(9,Math.min(13,rr*.47))+'px Space Grotesk, sans-serif';ctx.textAlign='center';ctx.shadowColor='#00110e';ctx.shadowBlur=5;ctx.fillText(name,0,-rr-9);ctx.shadowBlur=0;}
 if(self){ctx.beginPath();ctx.arc(0,0,rr+5+Math.sin(now*.005)*1.5,0,Math.PI*2);ctx.strokeStyle='#d4f47a55';ctx.lineWidth=1;ctx.stroke();}
 ctx.restore();
 if(showMass){const tag=buffType?({gold:' · GOLD',speed:' · SPEED',giant:' · GIANT'})[buffType]:'',label=String(Math.round(mass))+tag,color=weightStatus==='edible'?'#dfff88':weightStatus==='danger'?'#ff927e':'#f4f0dc';ctx.save();ctx.font='700 11px DM Mono, monospace';ctx.textAlign='center';const tw=ctx.measureText(label).width,pw=Math.max(25,tw+12),ph=16,py=Math.max(4,pt.y-rr-25);ctx.fillStyle='#061a1de8';ctx.beginPath();ctx.roundRect(pt.x-pw/2,py,pw,ph,5);ctx.fill();ctx.strokeStyle=color+'bb';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(label,pt.x,py+ph/2+.5);ctx.restore();}
}function preyStatus(mass){if(!state.self)return 'neutral';const ownMass=state.self.mass*(activeBuffs(state.self.buffs).giant?2.5:1);if(ownMass>mass)return 'edible';if(mass>ownMass)return 'danger';return 'neutral';}
function draw(now,dt){
 drawBackground(now);
 for(const f of state.fish.values()){const t=Math.min(1,dt*7);f.dx+=(f.x-f.dx)*t;f.dy+=(f.y-f.dy)*t;drawFish(f.dx,f.dy,f.r,f.color,now,false,'',f.mass,false,false,smoothHeading(f,dt),f.gulpUntil,f.evolveUntil,f.species,true,preyStatus(f.mass),f.buff,null,0);}
 for(const p of state.others.values()){const t=Math.min(1,dt*8);p.dx+=(p.x-p.dx)*t;p.dy+=(p.y-p.dy)*t;drawFish(p.dx,p.dy,p.r,p.color,now,true,p.name,p.mass,p.protected,false,smoothHeading(p,dt),p.gulpUntil,p.evolveUntil,undefined,false,'neutral',null,visualBuffs(p,dt),p.buffPulseUntil);}
 if(state.self&&!state.self.dead){const p=state.self,t=Math.min(1,dt*11);drawX+=(p.x-drawX)*t;drawY+=(p.y-drawY)*t;drawFish(drawX,drawY,p.r,p.color,now,true,p.name,p.mass,p.protected,true,smoothHeading(p,dt),p.gulpUntil,p.evolveUntil,undefined,false,'neutral',null,visualBuffs(p,dt),p.buffPulseUntil);}
}function loop(now){const dt=Math.min(.06,Math.max(.001,(now-state.lastFrame)/1000||.016));state.lastFrame=now;
 if(state.ws?.readyState===1&&now-state.lastInput>50){const d=vector();state.ws.send(JSON.stringify({type:'input',x:d.x,y:d.y}));state.lastInput=now;}
 if(state.started&&now-state.lastState>2800&&!state.connectionLost){showConnectionLost('The ocean stopped sending updates. Reconnect to dive back in.');}
 draw(now,dt);requestAnimationFrame(loop);}
requestAnimationFrame(loop);
