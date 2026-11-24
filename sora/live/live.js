import {createRig} from './rig.js';

const stage=document.querySelector('#stage');
const image=document.querySelector('#portrait');
const canvas=document.querySelector('#live');
const pause=document.querySelector('#pause');
const status=document.querySelector('#status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches, visible=true, frame=0, last=0, rig;
let time=0, nextBlink=2.3, blinkAge=4, waveAge=5, melodyAge=8;
let lookX=0,lookY=0, eyeX=0,eyeY=0, targetX=0,targetY=0,recoil=0;
let audio, voices=[];
const clamp=value=>Math.max(-1,Math.min(1,value));
function setGaze(x,y){
  if(Number.isFinite(x)&&Number.isFinite(y)){
    targetX=clamp(x);
    targetY=clamp(y);
  }
}
stage.addEventListener('pointermove',event=>{
  const bounds=stage.getBoundingClientRect();
  setGaze(2*(event.clientX-bounds.left)/bounds.width-1,2*(event.clientY-bounds.top)/bounds.height-1);
});
stage.addEventListener('pointerleave',()=>setGaze(0,0));
window.addEventListener('message',event=>{
  if(event.source===parent && event.origin===location.origin && event.data?.type==='sora:gaze'){
    setGaze(event.data.x,event.data.y);
  }
});
function draw(dt){
  time+=dt;
  waveAge+=dt;
  blinkAge+=dt;
  melodyAge+=dt;
  if(time>=nextBlink){
    blinkAge=0;
    nextBlink=time+(Math.random()<.13 ? .32 : 2.5+Math.random()*3.7);
  }
  const glance=.16*Math.sin(time*.95)*Math.sin(time*.43);
  const follow=1-Math.exp(-dt*3.5), snap=1-Math.exp(-dt*15);
  const previousX=lookX;
  lookX+=(targetX+glance-lookX)*follow;
  lookY+=(targetY-lookY)*follow;
  eyeX+=(targetX+glance-eyeX)*snap;
  eyeY+=(targetY+.1*Math.sin(time*.77)-eyeY)*snap;
  recoil+=(lookX-previousX)*3;
  recoil*=Math.exp(-dt*2.9);
  const blink=blinkAge<.095?Math.sin(blinkAge/.095*Math.PI/2):Math.max(0,1-(blinkAge-.095)/.16)**2;
  const greeting=Math.sin(waveAge*11)*Math.min(1,waveAge*7)*Math.min(1,Math.max(0,2.2-waveAge)*2);
  const beat=melodyAge<2.6 ? Math.sin(melodyAge*Math.PI*4.8)*Math.min(1,melodyAge*6)*Math.min(1,2.6-melodyAge):0;
  const breath=Math.sin(time*1.49)+.16*Math.sin(time*2.98);
  if(rig){
    rig.draw({time,look:[lookX,lookY],gaze:[eyeX,eyeY],breath,greeting,beat,recoil,blink});
  }else{
    image.style.transform='translateY('+(-breath*1.2)+'px) rotate('+(greeting*.7+lookX*.35+beat*.4)+'deg)';
  }
}
function animate(now){
  frame=0;
  if(!last || now-last>=32){
    draw(last?Math.min((now-last)/1000,.07):0);
    last=now;
  }
  schedule();
}
function schedule(){
  if(paused||!visible||document.hidden){
    cancelAnimationFrame(frame);
    frame=last=0;
  }else if(!frame){
    frame=requestAnimationFrame(animate);
  }
}
function updatePause(){
  pause.setAttribute('aria-pressed',String(paused));
  pause.title=paused?'恢复动态':'暂停动态';
  pause.setAttribute('aria-label',pause.title);
  schedule();
}
pause.addEventListener('click',()=>{
  paused=!paused;
  if(paused) stopNotes();
  updatePause();
});
reduced.addEventListener('change',()=>{paused=reduced.matches;updatePause();});
document.addEventListener('visibilitychange',schedule);
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;schedule();}).observe(stage);
function greet(){
  waveAge=0;
  status.textContent='Sora 向你挥了挥手。';
}
stage.addEventListener('click',greet);
document.querySelector('#greet').addEventListener('click',greet);
function stopNotes(){
  for(const voice of voices) {try{voice.stop();}catch{}}
  voices=[];
}
async function playMusic(){
  melodyAge=0;
  status.textContent='Sora 哼起了一小段旋律。';
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio) return;
  audio ||= new Audio();
  await audio.resume();
  stopNotes();
  const start=audio.currentTime+.02;
  const notes=[62,69,73,71,69,66,69];
  notes.forEach((note,index)=>{
    const at=start+index*.208;
    for(const [partial,volume] of [[1,.11],[2,.031],[3,.013]]){
      const tone=audio.createOscillator(),gain=audio.createGain();
      tone.frequency.value=440*2**((note-69)/12)*partial;
      gain.gain.setValueAtTime(.0001,at);
      gain.gain.exponentialRampToValueAtTime(volume,at+.013);
      gain.gain.exponentialRampToValueAtTime(.0001,at+.8/Math.sqrt(partial));
      tone.connect(gain).connect(audio.destination);
      tone.onended=()=>{tone.disconnect();gain.disconnect();};
      tone.start(at);tone.stop(at+.85);
      voices.push(tone);
    }
  });
}
document.querySelector('#music').addEventListener('click',()=>{playMusic().catch(()=>{});});
function resize(){
  const {width,height}=stage.getBoundingClientRect();
  if(width&&height){rig?.resize(width,height);draw(0);}
}
function initialize(){
  try{
    rig=createRig(canvas,image);
    stage.classList.toggle('ready',Boolean(rig));
  }catch{
    rig=null;
    stage.classList.remove('ready');
  }
  resize();
  updatePause();
}
canvas.addEventListener('webglcontextlost',event=>{
  event.preventDefault();rig=null;stage.classList.remove('ready');
});
canvas.addEventListener('webglcontextrestored',initialize);
new ResizeObserver(resize).observe(stage);
if(image.complete && image.naturalWidth){initialize();}else{image.addEventListener('load',initialize,{once:true});}
