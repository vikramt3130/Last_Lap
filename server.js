const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname, rooms = new Map();
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
function frame(data) {
  const body=Buffer.from(typeof data==='string'?data:JSON.stringify(data)); let h;
  if(body.length<126) h=Buffer.from([129,body.length]);
  else if(body.length<65536){h=Buffer.alloc(4);h[0]=129;h[1]=126;h.writeUInt16BE(body.length,2);}
  else {h=Buffer.alloc(10);h[0]=129;h[1]=127;h.writeBigUInt64BE(BigInt(body.length),2);}
  return Buffer.concat([h,body]);
}
function send(p,m){if(!p.dead)p.socket.write(frame(m));}
function roomOf(p){return p.room&&rooms.get(p.room);}
function broadcast(r,m,except){if(r)for(const p of r.players.values())if(p!==except)send(p,m);}
function roster(r){return [...r.players.values()].map(p=>({id:p.id,name:p.name,color:p.color,host:p.id===r.host,ready:p.ready,alive:p.alive,score:p.score,placement:p.placement}));}
function update(r){broadcast(r,{type:'room',code:r.code,players:roster(r),phase:r.phase,round:r.round,scores:Object.fromEntries([...r.players.values()].map(p=>[p.id,p.score]))});}
function remove(p){
  if(p.dead)return;p.dead=true;const r=roomOf(p);
  if(r){r.players.delete(p.id);if(!r.players.size){clearTimeout(r.startTimer);rooms.delete(r.code);}
  else {if(r.host===p.id)r.host=r.players.keys().next().value;update(r);}}
  p.socket.destroy();
}
function handle(p,m){
  let r=roomOf(p);
  if(m.type==='create'){if(r)return;let code;do{code=crypto.randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));r={code,players:new Map(),host:p.id,phase:'lobby',round:1};rooms.set(code,r);join(p,r,m.name);return;}
  if(m.type==='join'){r=rooms.get(String(m.code||'').toUpperCase());if(!r){send(p,{type:'error',message:'That room code wasn’t found.'});return;}if(r.players.size>=8){send(p,{type:'error',message:'This room is full (8 racers max).'});return;}if(r.phase!=='lobby'){send(p,{type:'error',message:'This race is already in progress.'});return;}join(p,r,m.name);return;}
  if(!r)return;
  if(m.type==='ready'&&r.phase==='lobby'){p.ready=!!m.ready;update(r);return;}
  if(m.type==='start'&&r.phase==='lobby'&&p.id===r.host&&r.players.size>=2&&[...r.players.values()].every(q=>q.ready)){ 
    r.phase='countdown';for(const q of r.players.values()){q.alive=true;q.placement=undefined;q.survivalBonus=0;q.x=0;q.y=0;q.vx=0;q.vy=0;}
    update(r);broadcast(r,{type:'start',round:r.round,seed:Date.now()});clearTimeout(r.startTimer);
    r.startTimer=setTimeout(()=>{if(rooms.has(r.code)){r.phase='race';r.raceStartedAt=Date.now();broadcast(r,{type:'go',round:r.round});update(r);}},3000);return;
  }
  if(m.type==='input'&&r.phase==='race'){
    const x=Number(m.x),y=Number(m.y),vx=Number(m.vx),vy=Number(m.vy);if(![x,y,vx,vy].every(Number.isFinite))return;
    p.x=x;p.y=y;p.vx=vx;p.vy=vy;p.alive=m.alive!==false;
    broadcast(r,{type:'state',id:p.id,name:p.name,color:p.color,x,y,vx,vy,alive:p.alive,grapple:!!m.grapple,anchorX:Number.isFinite(Number(m.anchorX))?Number(m.anchorX):null,anchorY:Number.isFinite(Number(m.anchorY))?Number(m.anchorY):null,slide:!!m.slide,t:Date.now()},p);return;
  }
  if(m.type==='eliminated'&&p.alive){
    p.alive=false;const alive=[...r.players.values()].filter(q=>q.alive);p.placement=alive.length+1;p.survivalBonus=Math.floor(Math.max(0,Date.now()-(r.raceStartedAt||Date.now()))/3000);
    broadcast(r,{type:'eliminated',id:p.id,reason:m.reason||'The screen left you behind.',placement:p.placement});
    if(alive.length===0){
      for(const q of r.players.values()){const placePoints=q.placement===1?10:q.placement===2?4:q.placement===3?2:1;q.score+=placePoints+(q.survivalBonus||0);}
      r.phase='results';broadcast(r,{type:'results',round:r.round,players:roster(r)});update(r);
    }return;
  }
  if(m.type==='next'&&p.id===r.host&&r.phase==='results'){
    if(r.round>=3){r.phase='final';broadcast(r,{type:'final',players:roster(r)});update(r);}
    else {r.round++;r.phase='lobby';for(const q of r.players.values()){q.ready=false;q.alive=true;q.survivalBonus=0;}update(r);}return;
  }
  if(m.type==='rematch'&&p.id===r.host&&r.phase==='final'){r.round=1;for(const q of r.players.values()){q.score=0;q.alive=true;q.ready=false;q.placement=undefined;}r.phase='lobby';update(r);}
}
const colors=['#ff725e','#5bc0eb','#ffd166','#8bd450','#b28dff','#ff82c3','#62dac5','#ffa64d'];
function uniqueName(r,name){const base=String(name||'Runner').trim().slice(0,16)||'Runner';const used=new Set([...r.players.values()].map(q=>q.name.toLocaleLowerCase()));if(!used.has(base.toLocaleLowerCase()))return base;for(let i=2;i<=99;i++){const suffix=' '+i,candidate=base.slice(0,16-suffix.length)+suffix;if(!used.has(candidate.toLocaleLowerCase()))return candidate;}return 'Racer '+crypto.randomBytes(2).toString('hex');}
function join(p,r,name){p.room=r.code;p.name=uniqueName(r,name);p.color=colors[r.players.size%8];p.ready=false;p.alive=true;p.score=0;r.players.set(p.id,p);send(p,{type:'welcome',id:p.id,code:r.code});update(r);}
function parse(p,ch){
  p.buffer=Buffer.concat([p.buffer,ch]);
  while(p.buffer.length>=2){
    const op=p.buffer[0]&15,b=p.buffer[1];let n=b&127,o=2;
    if(n===126){if(p.buffer.length<4)return;n=p.buffer.readUInt16BE(2);o=4;}
    else if(n===127){if(p.buffer.length<10)return;const z=p.buffer.readBigUInt64BE(2);if(z>1000000n)return remove(p);n=Number(z);o=10;}
    const masked=!!(b&128);if(masked)o+=4;if(p.buffer.length<o+n)return;
    let d=p.buffer.subarray(o,o+n);if(masked){const k=p.buffer.subarray(o-4,o);d=Buffer.from(d);for(let i=0;i<d.length;i++)d[i]^=k[i%4];}
    p.buffer=p.buffer.subarray(o+n);if(op===8)return remove(p);
    if(op===9){p.socket.write(Buffer.concat([Buffer.from([138,n]),d]));continue;}if(op!==1)continue;
    try{handle(p,JSON.parse(d.toString()));}catch(e){console.error(e);}
  }
}
const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;const resolved=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(resolved!==root&&!resolved.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(resolved,(e,d)=>{if(e){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(resolved)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(d);});
});
server.on('upgrade',(req,s)=>{
  const k=req.headers['sec-websocket-key'];if(!k)return s.destroy();
  const a=crypto.createHash('sha1').update(k+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  s.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+a+'\r\n\r\n');
  const p={socket:s,id:crypto.randomUUID(),buffer:Buffer.alloc(0),dead:false};s.on('data',d=>parse(p,d));s.on('close',()=>remove(p));s.on('error',()=>remove(p));
});
const heartbeat=setInterval(()=>{for(const r of rooms.values())for(const p of r.players.values())if(!p.dead)p.socket.write(Buffer.from([137,0]));},25000);heartbeat.unref();
function listenOn(port){server.once('error',e=>{if(e.code==='EADDRINUSE'&&!process.env.PORT&&port<3010){console.log('Port '+port+' is busy; trying '+(port+1));listenOn(port+1);return;}throw e;});server.listen(port,'0.0.0.0',()=>console.log('Last Lap running at http://localhost:'+port));} listenOn(Number(process.env.PORT||3000));
