const $ = s => document.querySelector(s);
const home=$('#home-view'),lobby=$('#lobby-view'),race=$('#race-view'),canvas=$('#game-canvas'),ctx=canvas.getContext('2d');
const nameInput=$('#player-name'),codeInput=$('#room-code-input'),homeError=$('#home-error');
let ws=null,myId=null,roomCode=null,host=false,phase='home',players=[],round=1,ready=false,raf=0,lastFrame=0,lastSend=0,countdownTimer=null;
const remotes=new Map(),keys=new Set(),touch=new Set();
const game={running:false,elapsed:0,camera:0,me:{x:90,y:0,vx:0,vy:0,grounded:true,alive:true,grapple:0,slide:0,wall:0},worldSeed:1,roundStart:0,deathSent:false,particles:[]};
function cameraLead(){return canvas.clientWidth<700?.52:.64}
function stormSpeed(){return canvas.clientWidth*cameraLead()/35}
function viewScale(){const h=canvas.clientHeight,w=canvas.clientWidth,widthScale=w<700?w/500:1.15;return Math.max(.62,Math.min(1.15,h/420,widthScale));}
const palette=['#ff725e','#5bc0eb','#ffd166','#8bd450','#b28dff','#ff82c3','#62dac5','#ffa64d'];
function wsUrl(){return (location.protocol==='https:'?'wss://':'ws://')+location.host;}
function connect(kind,payload){
 if(ws&&ws.readyState===1){ws.send(JSON.stringify({type:kind,...payload}));return;}
 ws=new WebSocket(wsUrl());$('#connection-label').textContent='CONNECTING';
 ws.addEventListener('open',()=>ws.send(JSON.stringify({type:kind,...payload})));
 ws.addEventListener('message',e=>{try{onMessage(JSON.parse(e.data));}catch{}});
 ws.addEventListener('close',()=>{$('#connection-label').textContent='OFFLINE';if(phase!=='home'&&phase!=='final')setTimeout(()=>{if(!ws||ws.readyState===3)showError('Connection lost. Return to the start and create a new room.');},600);});
 ws.addEventListener('error',()=>showError('Could not reach the game server. Please try again.'));
}
function send(type,data={}){if(ws&&ws.readyState===1)ws.send(JSON.stringify({type,...data}));}
function showError(msg){homeError.textContent=msg;$('#copy-feedback').textContent=msg;}
function setView(view){[home,lobby,race].forEach(x=>x.classList.add('hidden'));view.classList.remove('hidden');}
function callsign(){return nameInput.value.trim().slice(0,16)||'Runner';}
function onMessage(m){
 if(m.type==='welcome'){myId=m.id;roomCode=m.code;$('#room-code-display').textContent=m.code;$('#room-code-large').textContent=m.code;phase='lobby';setView(lobby);const url=new URL(location.href);url.searchParams.set('room',m.code);history.replaceState({},'',url);return;}
 if(m.type==='error'){showError(m.message);return;}
 if(m.type==='room'){const previousPhase=phase;roomCode=m.code;players=m.players;host=!!players.find(p=>p.id===myId)?.host;ready=!!players.find(p=>p.id===myId)?.ready;round=m.round||round;phase=m.phase;if(m.phase==='lobby'&&(previousPhase==='results'||previousPhase==='final')){setView(lobby);['eliminated-overlay','results-overlay','final-overlay'].forEach(id=>$('#'+id).classList.add('hidden'));}renderPlayers();$('#player-count').textContent=players.length+' / 8';$('#race-round').textContent=String(round).padStart(2,'0');$('#race-live-count').textContent=players.filter(p=>p.alive).length+' RACERS';$('#connection-label').textContent='CONNECTED';const allReady=players.length>=2&&players.every(p=>p.ready);$('#start-button').disabled=!host||!allReady||phase!=='lobby';$('#start-button span').textContent=phase==='countdown'?'RACE STARTING…':round>1?'START ROUND '+round:'START THE RACE';$('#lobby-status').textContent=phase==='countdown'?'GET READY…':phase==='race'?'RACE IN PROGRESS':players.length<2?'WAITING FOR RACERS…':allReady?'ALL RACERS READY':players.filter(p=>p.ready).length+' / '+players.length+' READY';$('#ready-button').classList.toggle('hidden',phase!=='lobby');$('#ready-button').textContent=ready?'READY ✓':"I'M READY";return;}
 if(m.type==='start'){round=m.round;buildCourse(m.seed);startCountdown();return;}
 if(m.type==='go'){beginRace();return;}
 if(m.type==='state'){if(m.id!==myId){const prev=remotes.get(m.id);const anchor=m.grapple?(Number.isFinite(m.anchorX)&&Number.isFinite(m.anchorY)?{x:m.anchorX,y:m.anchorY}:prev?.grapple?{x:prev.anchorX,y:prev.anchorY}:nearestAnchor(m.x,m.y)):null;remotes.set(m.id,{...m,drawX:prev?.drawX??m.x,drawY:prev?.drawY??m.y,anchorX:anchor?.x??null,anchorY:anchor?.y??null,received:performance.now()});}return;}
 if(m.type==='eliminated'){const p=players.find(x=>x.id===m.id);if(p)p.alive=false;if(m.id===myId)showEliminated(m.reason);return;}
 if(m.type==='results'){game.running=false;phase='results';showRoundResults(m.players,m.round);return;}
 if(m.type==='final'){game.running=false;phase='final';showFinal(m.players);return;}
}
function renderPlayers(){const list=$('#players-list');list.innerHTML='';players.forEach(p=>{const row=document.createElement('div');row.className='player-row';row.innerHTML='<span class="player-avatar"></span><span class="player-name"></span><span class="player-tag"></span>';row.querySelector('.player-avatar').style.background=p.color;row.querySelector('.player-avatar').textContent=p.name.slice(0,1).toUpperCase();row.querySelector('.player-name').textContent=p.name+(p.id===myId?' (you)':'');const tag=row.querySelector('.player-tag');tag.textContent=p.host?(p.ready?'HOST · READY':'HOST'):p.ready?'READY':'';if(p.host)tag.classList.add('host');if(p.ready)tag.classList.add('ready');list.append(row);});}
$('#create-room').onclick=()=>{homeError.textContent='';connect('create',{name:callsign()});};
$('#join-room').onclick=()=>{homeError.textContent='';const code=codeInput.value.replace(/[^a-z0-9]/gi,'').toUpperCase();if(code.length!==6){showError('Enter the 6-character room code.');return;}connect('join',{name:callsign(),code});};
codeInput.addEventListener('input',()=>{codeInput.value=codeInput.value.replace(/[^a-z0-9]/gi,'').toUpperCase();});
codeInput.addEventListener('keydown',e=>{if(e.key==='Enter')$('#join-room').click();});
nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')$('#create-room').click();});
$('#start-button').onclick=()=>send('start');
$('#ready-button').onclick=()=>{ready=!ready;send('ready',{ready});};
$('#copy-invite').onclick=async()=>{const code=(roomCode||$('#room-code-large').textContent||'').trim();const feedback=$('#copy-feedback');try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(code);feedback.textContent='Room code '+code+' copied. Send it to your crew.';}catch{feedback.textContent='Clipboard is blocked here. Press and hold the code to copy it:';const field=document.createElement('input');field.type='text';field.readOnly=true;field.value=code;field.setAttribute('aria-label','Room code to copy');field.className='invite-copy-fallback';feedback.append(field);field.focus();field.select();field.setSelectionRange(0,code.length);}};
$('#leave-room').onclick=()=>{if(ws)ws.close();ws=null;myId=null;roomCode=null;history.replaceState({},'',location.pathname);phase='home';setView(home);};
function modal(show){$('#rules-modal').classList.toggle('hidden',!show);}
$('#rules-open').onclick=()=>modal(true);$('#rules-close').onclick=()=>modal(false);$('#rules-done').onclick=()=>modal(false);$('#rules-modal').addEventListener('click',e=>{if(e.target.id==='rules-modal')modal(false);});
$('#race-brand').onclick=e=>e.preventDefault();
$('#next-round').onclick=()=>{if(host){send('next');if(round<3){$('#results-overlay').classList.add('hidden');game.deathSent=false;phase='lobby';setView(lobby);}}};
$('#rematch-button').onclick=()=>{if(host){send('rematch');$('#final-overlay').classList.add('hidden');game.deathSent=false;phase='lobby';setView(lobby);}};
function placeRows(parent,rows){parent.innerHTML='';[...rows].sort((a,b)=>(a.placement||99)-(b.placement||99)).forEach((p,i)=>{const row=document.createElement('div');row.className='result-row';row.innerHTML='<span class="place"></span><span class="result-name"></span><span class="result-points"></span>';row.querySelector('.place').textContent='#'+(p.placement||i+1);row.querySelector('.result-name').textContent=p.name;row.querySelector('.result-points').textContent='TOTAL  '+p.score+' PTS';parent.append(row);});}
function showRoundResults(rows,r){$('#eliminated-overlay').classList.add('hidden');$('#result-round').textContent=String(r).padStart(2,'0');const winner=rows.find(p=>p.placement===1);$('#result-title').innerHTML=winner?(escapeHtml(winner.name.toUpperCase())+'<br>LAST ONE OUT.'):'PHOTO FINISH.';placeRows($('#round-results'),rows);$('#next-round span').textContent=r>=3?'SEE FINAL SCORES':'BACK TO LOBBY';$('#next-round').classList.toggle('hidden',!host);$('#results-overlay').classList.remove('hidden');}
function showFinal(rows){const winner=[...rows].sort((a,b)=>b.score-a.score)[0];$('#final-winner').innerHTML=winner?(escapeHtml(winner.name.toUpperCase())+'<br>IS THE CHAMPION.'):'THE CHAMPION.';placeRows($('#final-results'),rows);$('#rematch-button').classList.toggle('hidden',!host);$('#final-overlay').classList.remove('hidden');}
function showEliminated(reason='The shrinking screen caught you.'){game.running=false;const title=$('#elimination-title'),detail=$('#elimination-reason');if(reason==='You fell into a gap.'){title.textContent='YOU MISSED THE GAP.';detail.textContent='Jump before the pit to land safely on the far side.';}else if(reason==='You fell off the course.'){title.textContent='OFF THE COURSE.';detail.textContent='Stay on the track and use the jump to clear gaps.';}else{title.textContent='THE EDGE CAUGHT YOU.';detail.textContent='The leader pulled the camera forward. Keep pace to stay in frame.';}$('#eliminated-overlay').classList.remove('hidden');}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function startCountdown(){setView(race);['eliminated-overlay','results-overlay','final-overlay'].forEach(id=>$('#'+id).classList.add('hidden'));game.running=false;$('#countdown-overlay').classList.remove('hidden');const beats=['GET','SET','GO'];let step=0;$('#countdown-number').textContent=beats[step];$('#countdown-caption').textContent='RACE STARTING';clearInterval(countdownTimer);countdownTimer=setInterval(()=>{step++;if(step>=beats.length){clearInterval(countdownTimer);return;}$('#countdown-number').textContent=beats[step];},1000);}
function beginRace(){setView(race);$('#countdown-overlay').classList.add('hidden');['eliminated-overlay','results-overlay','final-overlay'].forEach(id=>$('#'+id).classList.add('hidden'));const index=Math.max(0,players.findIndex(p=>p.id===myId));game.me={x:100+index*38,y:0,vx:145+index*4,vy:0,grounded:true,alive:true,grapple:0,slide:0,wall:0,grappleCarry:0,anchor:null,ropeLength:0,angle:0};game.camera=0;game.elapsed=0;game.deathSent=false;game.running=true;game.roundStart=performance.now();remotes.clear();lastFrame=performance.now();cancelAnimationFrame(raf);resizeCanvas();raf=requestAnimationFrame(loop);}
function resizeCanvas(){const dpr=Math.min(devicePixelRatio||1,2),r=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.floor(r.width*dpr));canvas.height=Math.max(1,Math.floor(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);}
window.addEventListener('resize',resizeCanvas);
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.repeat)return;if(e.key===' ')jump();else if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')jumpOrGrapple();},{passive:false});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();touch.clear();gestures.clear();clearTimeout(gestureSlideTimer);}});
function bindTouch(id,key,down,up){const b=$(id);if(!b)return;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch.add(key);if(down)down();});const end=e=>{e.preventDefault();touch.delete(key);if(up)up();};b.addEventListener('pointerup',end);b.addEventListener('pointercancel',end);}
bindTouch('#touch-left','left');bindTouch('#touch-right','right');bindTouch('#touch-slide','slide');bindTouch('#touch-jump','jump',()=>jump());bindTouch('#touch-grapple','grapple',()=>grapple());
const gestures=new Map();let gestureSlideTimer=0;
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||phase!=='race'||!game.running)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);gestures.set(e.pointerId,{x:e.clientX,y:e.clientY,axis:''});},{passive:false});
canvas.addEventListener('pointermove',e=>{const g=gestures.get(e.pointerId);if(!g)return;e.preventDefault();const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.axis&&Math.max(Math.abs(dx),Math.abs(dy))>22)g.axis=Math.abs(dx)>Math.abs(dy)?'x':'y';if(g.axis==='x'){touch.delete('left');touch.delete('right');if(dx<-24)touch.add('left');else if(dx>24)touch.add('right');}},{passive:false});
function endGesture(e){const g=gestures.get(e.pointerId);if(!g)return;gestures.delete(e.pointerId);touch.delete('left');touch.delete('right');const dx=e.clientX-g.x,dy=e.clientY-g.y;if(g.axis==='y'&&dy<-38)jumpOrGrapple();else if(g.axis==='y'&&dy>38){touch.add('slide');clearTimeout(gestureSlideTimer);gestureSlideTimer=setTimeout(()=>touch.delete('slide'),550);}else if(Math.abs(dx)<18&&Math.abs(dy)<18)jumpOrGrapple();}
canvas.addEventListener('pointerup',endGesture);canvas.addEventListener('pointercancel',endGesture);canvas.addEventListener('lostpointercapture',endGesture);
function held(...names){return names.some(n=>keys.has(n)||touch.has(n));}
const GAP_START=850,GAP_SPACING=2000,GAP_WIDTH_MIN=360,GAP_WIDTH_MAX=440;
function courseRandom(index,salt=0){let x=(Number(game.worldSeed)||1)^Math.imul(index+1,0x9e3779b9)^salt;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);x^=x>>>16;return (x>>>0)/4294967296;}
function gapWidthAt(index){return GAP_WIDTH_MIN+Math.floor(courseRandom(index,0xa341316c)*(GAP_WIDTH_MAX-GAP_WIDTH_MIN+1));}
function inGapZone(x){const nearest=Math.round((x-GAP_START)/GAP_SPACING);for(let j=nearest-1;j<=nearest+1;j++){const start=GAP_START+j*GAP_SPACING;if(x>=start-500&&x<=start+gapWidthAt(j)+500)return true;}return false;}
const gapAt=x=>{const k=Math.floor((x-GAP_START)/GAP_SPACING);for(let j=k-1;j<=k+1;j++){const start=GAP_START+j*GAP_SPACING;if(x>start&&x<start+gapWidthAt(j))return true;}return false;};
function upcomingGapDistance(x){const k=Math.max(0,Math.floor((x-GAP_START)/GAP_SPACING));const start=GAP_START+k*GAP_SPACING;if(x<=start+gapWidthAt(k))return Math.max(0,start-x);return start+GAP_SPACING-x;}
function wallPosition(n){return n<0?null:GAP_START+n*GAP_SPACING+gapWidthAt(n)+500;}
function wallAt(x){const n=Math.round((x-(GAP_START+GAP_WIDTH_MIN+500))/GAP_SPACING);for(let i=n-1;i<=n+1;i++){const wall=wallPosition(i);if(wall!==null&&Math.abs(x-wall)<=22)return wall;}return null;}
function jump(){if(phase!=='race'||!game.running)return;const wallJump=!!game.me.wall;if(game.me.grounded||wallJump){game.me.vy=wallJump?-655:-555;game.me.grounded=false;game.me.wall=0;burst(game.me.x,game.me.y-5,'#d8ff54',7);}}
function jumpOrGrapple(){if(phase!=='race'||!game.running)return;const a=nearestAnchor(game.me.x,game.me.y);if(a)grapple();else jump();}
const anchors=[];
function buildCourse(seed){game.worldSeed=Number(seed)||1;anchors.length=0;for(let i=0;i<90;i++){const jitter=(courseRandom(i,0xc8013ea4)-0.5)*180,x=470+i*440+(i%3)*40+jitter;if(!inGapZone(x))anchors.push({x,y:-100-Math.floor(courseRandom(i,0x9e3779b9)*71)});}for(let i=0;i<60;i++){const start=GAP_START+i*GAP_SPACING,width=gapWidthAt(i),offset=-80+Math.floor(courseRandom(i,0x7f4a7c15)*(Math.floor(width*0.5)+81)),y=-125-Math.floor(courseRandom(i,0x94d049bb)*45),anchor={x:start+offset,y,pit:true,gapStart:start};anchor.range=Math.hypot(anchor.x-(start-100),anchor.y)+14;anchors.push(anchor);if(offset<=20){const rescueOffset=width*(0.45+courseRandom(i,0x6a09e667)*0.15),rescue={x:start+rescueOffset,y:-65-Math.floor(courseRandom(i,0xbb67ae85)*35),pit:true,rescue:true,gapStart:start};rescue.range=Math.hypot(rescue.x-(start+45),rescue.y-40)+20;anchors.push(rescue);}}}
buildCourse(game.worldSeed);
function nearestAnchor(x,y){let best=null,dBest=340;for(const a of anchors){const dx=a.x-x,dy=a.y-y,d=Math.hypot(dx,dy),range=a.pit?a.range:340;if(dx>-70&&d<range&&d<dBest){best=a;dBest=d;}}return best;}
function grapple(){if(phase!=='race'||!game.running||game.me.grapple>.05)return;const a=nearestAnchor(game.me.x,game.me.y);if(a){const d=Math.hypot(a.x-game.me.x,a.y-game.me.y);game.me.anchor=a;game.me.ropeLength=Math.max(120,Math.min(270,d-24));game.me.grapple=.42;game.me.grappleCarry=1.25;game.me.vy=Math.min(game.me.vy,-800);game.me.vx=Math.min(520,game.me.vx+400);burst(a.x,a.y,'#d8ff54',8);}}
function groundY(x){const wave=Math.sin(x*.0011)*9+Math.sin(x*.0024)*3;return 0+wave;}
function loop(now){if(!game.running)return;const frameElapsed=Math.max(0,(now-lastFrame)/1000)||.016;lastFrame=now;const drawDt=Math.min(.034,frameElapsed);let remaining=frameElapsed,steps=0;while(remaining>0&&game.running&&steps<6000){const dt=Math.min(.034,remaining);game.elapsed+=dt;updatePhysics(dt);remaining-=dt;steps++;}drawScene(now,drawDt);if(now-lastSend>80){send('input',{x:game.me.x,y:game.me.y,vx:game.me.vx,vy:game.me.vy,alive:game.me.alive,grapple:game.me.grapple>0,anchorX:game.me.grapple>0&&game.me.anchor?game.me.anchor.x:null,anchorY:game.me.grapple>0&&game.me.anchor?game.me.anchor.y:null,slide:game.me.slide>.22});lastSend=now;}raf=requestAnimationFrame(loop);}
function updatePhysics(dt){
 const me=game.me;if(!me.alive)return;
 const left=held('a','arrowleft','left'),right=held('d','arrowright','right'),slide=held('s','arrowdown','slide');
 const rampSpeed=145+Math.min(230,game.elapsed*8.5);me.grappleCarry=Math.max(0,(me.grappleCarry||0)-dt);const speedResponse=(me.grapple>0||me.grappleCarry>0)?0.18:1.8;me.vx+=(rampSpeed-me.vx)*Math.min(1,dt*speedResponse);if(right)me.vx+=255*dt;if(left)me.vx-=270*dt;if(slide){me.vx=Math.min(rampSpeed+145,me.vx+125*dt);me.slide=Math.min(1,me.slide+dt*5);}else me.slide=Math.max(0,me.slide-dt*4);me.vx=Math.max(100,Math.min(620,me.vx));
 const wasGrappling=me.grapple>0;me.grapple=Math.max(0,me.grapple-dt);if(wasGrappling&&me.grapple===0){me.anchor=null;me.vx=Math.min(620,me.vx+65);me.vy=Math.min(me.vy,-30);}else if(me.grapple>0&&me.anchor){const dx=me.x-me.anchor.x,dy=me.y-me.anchor.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d,radialSpeed=me.vx*nx+me.vy*ny,stretch=Math.max(0,d-me.ropeLength),tension=Math.min(1400,stretch*14+Math.max(0,radialSpeed)*2.5);me.vx-=nx*tension*dt;me.vy-=ny*tension*dt;me.vx=Math.min(620,me.vx+25*dt);}
 me.vy+=1350*dt;me.x+=me.vx*dt;me.y+=me.vy*dt;me.grounded=false;
 const barrier=wallAt(me.x);if(barrier!==null&&me.y>-90){me.x=barrier-22;me.vx=0;me.wall=1;}else me.wall=0;
 const gy=groundY(me.x);if(me.y>=gy&& !gapAt(me.x)){me.y=gy;me.vy=0;me.grounded=true;}
 const beamIndex=Math.max(0,Math.floor((me.x-(GAP_START+GAP_WIDTH_MIN+900))/GAP_SPACING)),beamStart=wallPosition(beamIndex)+400;if(me.x>beamStart+9&&me.x<beamStart+74&&me.y>-25&&me.lastBeam!==beamStart){me.vx=me.slide>.22?Math.min(620,me.vx+90):Math.max(100,me.vx-120);me.lastBeam=beamStart;}
 if(me.x>105&&gapAt(me.x)&&me.y>80){eliminate('You fell into a gap.');}
 const nearest=nearestAnchor(me.x,me.y);$('#grapple-indicator').classList.toggle('active',!!nearest&&me.grapple<=0);
 const pitDistance=upcomingGapDistance(me.x),pitWarning=$('#pit-warning');if(pitDistance<=560){pitWarning.classList.remove('hidden');$('#pit-distance').textContent=me.grapple>0?'SWING!':nearest?.rescue?'RESCUE NOW':nearest?.pit?'GRAPPLE NOW':'GAP IN '+Math.ceil(pitDistance);}else pitWarning.classList.add('hidden');pitWarning.classList.toggle('danger',pitDistance<=250);$('#race-pace').textContent=Math.round(me.vx);
 const liveOthers=players.filter(p=>p.id!==myId&&p.alive);const others=[...remotes.entries()].filter(([id,p])=>p.alive);const maxX=Math.max(me.x,...others.map(([,p])=>p.drawX??p.x));const scale=viewScale(),cameraTarget=maxX-(canvas.clientWidth/scale)*cameraLead();if(cameraTarget>game.camera)game.camera=Math.min(cameraTarget,game.camera+700*dt);
 const screenX=(me.x-game.camera)*scale,stormInset=game.elapsed*stormSpeed();
 const nearEdge=screenX<stormInset+185;$('#race-position').classList.toggle('danger',nearEdge);if(nearEdge)$('#race-position').textContent='EDGE CLOSING — MOVE';else $('#race-position').textContent=liveOthers.length+' OPPONENT'+(liveOthers.length===1?'':'S')+' LEFT';
 if(screenX<stormInset+10)eliminate('The shrinking screen caught you.');
 if(me.y<-760)eliminate('You fell off the course.');
 for(const [id,p] of remotes){if(nowMinus(p)>5000)remotes.delete(id);}
 game.particles=game.particles.filter(p=>p.life>0);game.particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;});
}
function nowMinus(p){return performance.now()-p.received;}
function eliminate(reason){if(game.deathSent)return;game.deathSent=true;game.me.alive=false;game.running=false;send('eliminated',{reason});showEliminated(reason);}
function burst(x,y,color,count){for(let i=0;i<count;i++)game.particles.push({x,y,vx:(Math.random()-.5)*180,vy:(Math.random()-.5)*180,life:.35,color});}
function drawScene(now,dt){
 const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const scale=viewScale();ctx.clearRect(0,0,w,h);ctx.save();ctx.scale(scale,scale);const W=w/scale,H=h/scale;
 const cam=game.camera;const horizon=H*.66;const worldStart=cam-W*.1;const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#172728');sky.addColorStop(.62,'#435953');sky.addColorStop(1,'#8e8966');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
 // distant sun and layered hills
 ctx.fillStyle='#ffd17b';ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(W*.77,H*.23,34,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
 for(let layer=0;layer<3;layer++){ctx.beginPath();ctx.moveTo(0,H);for(let x=0;x<=W+20;x+=12){const wx=x+cam*(.12+layer*.08);const y=H*(.54+layer*.07)+Math.sin(wx*.004+layer)*18+Math.sin(wx*.009+layer*3)*8;ctx.lineTo(x,y);}ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=['#304341','#34483e','#43513d'][layer];ctx.fill();}
 // course deck
 const base=horizon+42;ctx.fillStyle='#292f2a';ctx.fillRect(0,base,W,H-base);ctx.fillStyle='#c7b77b';ctx.fillRect(0,base,W,4);
 // repeating dash marks
 for(let wx=Math.floor(worldStart/105)*105;wx<cam+W;wx+=105){let x=wx-cam;ctx.fillStyle='#c0b47b44';ctx.fillRect(x,base+28,44,2);}
 // open pit cutouts
 for(let j=Math.floor((worldStart-GAP_START)/GAP_SPACING)-1;j<Math.ceil((cam+W-GAP_START)/GAP_SPACING)+1;j++){const a=GAP_START+j*GAP_SPACING,x=a-cam,width=gapWidthAt(j);if(x>-180&&x<W+180){ctx.fillStyle='#101614';ctx.fillRect(x,base,width,H-base);ctx.fillStyle='#ff685d';ctx.globalAlpha=.7;ctx.fillRect(x,base,width,2);ctx.globalAlpha=1;}}
 // bright approach marks show exactly where to jump
 for(let j=Math.floor((worldStart-GAP_START)/GAP_SPACING)-1;j<Math.ceil((cam+W-GAP_START)/GAP_SPACING)+1;j++){const a=GAP_START+j*GAP_SPACING,gx=a-cam;if(gx>-260&&gx<W+40){for(let n=1;n<=4;n++){const mx=gx-n*58;if(mx>-8&&mx<W){ctx.fillStyle=n<3?'#ff7466':'#ffc36d';ctx.globalAlpha=.75;ctx.beginPath();ctx.moveTo(mx,base-2);ctx.lineTo(mx+18,base-10);ctx.lineTo(mx+12,base-2);ctx.closePath();ctx.fill();ctx.globalAlpha=1;}}if(gx-205>-90&&gx-205<W){ctx.fillStyle='#ff685d';ctx.fillRect(gx-224,base-82,72,22);ctx.fillStyle='#151a17';ctx.font='bold 10px monospace';ctx.textAlign='center';ctx.fillText('HOOK →',gx-188,base-67);}}}
 // wall-jump barriers
 for(let wi=Math.floor((worldStart-(GAP_START+GAP_WIDTH_MAX+500))/GAP_SPACING);wi<=Math.ceil((cam+W-GAP_START-GAP_WIDTH_MIN-500)/GAP_SPACING);wi++){const wx=wallPosition(wi);if(wx===null)continue;const x=wx-cam;if(x<-40||x>W+40)continue;ctx.fillStyle='#d86c4d';ctx.fillRect(x,base-90,22,90);ctx.fillStyle='#ffbe70';for(let y=base-82;y<base-14;y+=22){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+22,y+13);ctx.lineTo(x+22,y+19);ctx.lineTo(x,y+6);ctx.closePath();ctx.fill();}ctx.fillStyle='#f4e6c3';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText('JUMP',x+11,base-98);}
 // low gantries and elevated boosts
 for(let wi=Math.floor((worldStart-GAP_START-GAP_WIDTH_MAX-900)/GAP_SPACING);wi<=Math.ceil((cam+W-GAP_START-GAP_WIDTH_MIN-900)/GAP_SPACING);wi++){const wall=wallPosition(wi);if(wall===null)continue;const wx=wall+400,x=wx-cam;if(wx<0||x<90||x>W+200)continue;const bY=base-36-(Math.sin(wx)*3);ctx.fillStyle='#d6c88e';ctx.fillRect(x,bY,7,36);ctx.fillRect(x+67,bY,7,36);ctx.fillRect(x,bY,74,7);ctx.fillStyle='#ffffff22';ctx.fillRect(x+3,bY+7,2,27);ctx.fillStyle='#c2b677';ctx.fillRect(x+85,base-14,52,14);ctx.fillStyle='#222a25';ctx.fillRect(x+85,base-17,52,4);}
 // anchors with pulsing ring
 for(const a of anchors){const x=a.x-cam;if(x<-40||x>W+40)continue;const y=base+a.y-15;const pulse=1+Math.sin(now*.006+a.x)*.12,hookColor='#d8ff54',featuredHook=a.pit&&!a.rescue;ctx.strokeStyle=hookColor;ctx.globalAlpha=featuredHook?0.5:0.25;ctx.lineWidth=featuredHook?2:1;ctx.beginPath();ctx.arc(x,y,(featuredHook?18:13)*pulse,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.95;ctx.fillStyle=hookColor;ctx.font=featuredHook?'20px sans-serif':'18px sans-serif';ctx.textAlign='center';ctx.fillText('✳',x,y+6);if(featuredHook){ctx.font='8px monospace';ctx.fillText('PIT HOOK',x,y-21);}ctx.globalAlpha=1;}
 // The fireline visibly eats into the course as the round continues
 const stormX=game.elapsed*stormSpeed()/scale;const wall=ctx.createLinearGradient(0,0,stormX+72,0);wall.addColorStop(0,'#ff493888');wall.addColorStop(Math.max(.08,stormX/(stormX+72)),'#ff593077');wall.addColorStop(1,'#ff593000');ctx.fillStyle=wall;ctx.fillRect(0,0,stormX+72,H);ctx.fillStyle='#ff685d';ctx.globalAlpha=.95;ctx.fillRect(stormX,H*.11,3,H*.78);for(let fy=H*.14;fy<H*.82;fy+=24){const flicker=Math.sin(now*.014+fy)*5;ctx.beginPath();ctx.moveTo(stormX+2,fy);ctx.quadraticCurveTo(stormX+17+flicker,fy+9,stormX+3,fy+18);ctx.fillStyle='#ff9b55';ctx.fill();}ctx.globalAlpha=1;
 // remote racers
 for(const [id,p] of remotes){if(!p.alive)continue;const age=Math.min(.4,Math.max(0,(performance.now()-p.received)/1000)),targetX=p.x+p.vx*age,targetY=p.y+p.vy*age+(p.grapple?0:675*age*age),xStep=900*dt,yStep=1200*dt;p.drawX+=Math.max(-xStep,Math.min(xStep,targetX-p.drawX));p.drawY+=Math.max(-yStep,Math.min(yStep,targetY-p.drawY));const x=p.drawX-cam;const y=base+p.drawY-15;if(x<-50||x>W+50)continue;const remoteAnchor=p.grapple?(Number.isFinite(p.anchorX)&&Number.isFinite(p.anchorY)?{x:p.anchorX,y:p.anchorY}:nearestAnchor(p.x,p.y)):null;const rope=remoteAnchor?{x:remoteAnchor.x-cam,y:base+remoteAnchor.y-15}:null;drawRunner(x,y,p.color||'#8bd450',p.name||'Runner',false,p.grapple,p.slide,now,rope);}
 // local racer
 if(game.me.alive){const x=game.me.x-cam;const y=base+game.me.y-15;const rope=game.me.grapple>0&&game.me.anchor?{x:game.me.anchor.x-cam,y:base+game.me.anchor.y-15}:null;drawRunner(x,y,players.find(p=>p.id===myId)?.color||'#d8ff54',callsign(),true,game.me.grapple,game.me.slide,now,rope);}
 // particles
 for(const p of game.particles){ctx.globalAlpha=Math.max(0,p.life*2.5);ctx.fillStyle=p.color;ctx.fillRect(p.x-cam,p.y+base-15,3,3);}ctx.globalAlpha=1;
 // progress ticks
 const remain=players.filter(p=>p.alive).length;ctx.fillStyle='#1117';ctx.fillRect(W-128,18,110,28);ctx.fillStyle='#b4beb4';ctx.font='9px monospace';ctx.textAlign='right';ctx.fillText(remain+' IN THE FRAME',W-28,36);
 ctx.restore();
}
function drawRunner(x,y,color,name,self,grapple,slide,now,ropeEnd=null){
 ctx.save();ctx.translate(x,y);const me=game.me;const lean=self?Math.max(-.2,Math.min(.25,(me.vy||0)*.00025)):-.08;ctx.rotate(slide>.2?.23:lean);if(slide>.2)ctx.scale(1.3,.58);
 // taut animated cable connects the runner to the actual anchor
 if(grapple&&ropeEnd){const hx=8,hy=-5,tx=ropeEnd.x-x,ty=ropeEnd.y-y,bend=Math.sin(now*.018+x*.01)*5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(hx,hy);ctx.quadraticCurveTo((hx+tx)*.5,(hy+ty)*.5+bend,tx,ty);ctx.strokeStyle='#17231d';ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(hx,hy);ctx.quadraticCurveTo((hx+tx)*.5,(hy+ty)*.5+bend,tx,ty);ctx.strokeStyle='#d8ff54';ctx.lineWidth=1.8;ctx.stroke();ctx.beginPath();ctx.arc(tx,ty,5+Math.sin(now*.02)*1.2,0,Math.PI*2);ctx.strokeStyle='#d8ff54';ctx.lineWidth=1.5;ctx.stroke();}
 // shadow
 ctx.fillStyle='#10151277';ctx.beginPath();ctx.ellipse(0,17,18,4,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(-9,-10,18,24,6);ctx.fill();
 ctx.fillStyle='#f6edcf';ctx.beginPath();ctx.arc(2,-14,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#15201b';ctx.fillRect(4,-16,4,2);
 ctx.strokeStyle=color;ctx.lineWidth=4;ctx.lineCap='round';const t=now*.015+(self?0:x);ctx.beginPath();ctx.moveTo(-3,9);ctx.lineTo(-7+Math.sin(t)*5,17);ctx.moveTo(5,9);ctx.lineTo(8+Math.cos(t)*5,17);ctx.stroke();
 ctx.strokeStyle='#eadcb3';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-7,-2);ctx.lineTo(-15+Math.cos(t)*3,4);ctx.moveTo(8,-3);ctx.lineTo(14+Math.sin(t)*3,0);ctx.stroke();
 ctx.restore();ctx.fillStyle='#ecf0e8';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText(name.slice(0,12),x,y-28);
}
function frameLoop(){if(!game.running)return;raf=requestAnimationFrame(loop);}
const urlParams=new URLSearchParams(location.search);const invite=urlParams.get('room');if(invite){codeInput.value=invite.toUpperCase();nameInput.focus();}
resizeCanvas();


