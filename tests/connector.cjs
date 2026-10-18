const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const callbacks={},messages=[];
const event=name=>({addListener:fn=>{callbacks[name]=fn;}});
let tabs=[{id:1,active:true,url:'https://example.com/path?private=secret',title:'Example',audible:true,mutedInfo:{muted:false}}];
let focused=true;
const context={URL,Date,setTimeout,chrome:{
  runtime:{connectNative:name=>{assert.equal(name,'com.minavian.memoir');return{onMessage:event('nativeMessage'),onDisconnect:event('disconnect'),postMessage:message=>messages.push(message)};},lastError:null},
  action:{setBadgeText:()=>{},setTitle:()=>{}},
  windows:{getLastFocused:async()=>({id:11,focused}),onFocusChanged:event('focus')},
  tabs:{query:async args=>{assert.deepEqual(JSON.parse(JSON.stringify(args)),{active:true,windowId:11});return tabs;},onActivated:event('active'),onUpdated:event('updated'),onRemoved:event('removed')},
  alarms:{onAlarm:event('alarm'),create:()=>{}},
}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
(async()=>{
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../Browser Connector/background.js'),'utf8'),context);
  await tick();assert.equal(messages[0].url,'https://example.com');assert.equal(messages[0].audible,true);assert(!JSON.stringify(messages).includes('secret'));
  tabs[0]={...tabs[0],audible:false,mutedInfo:{muted:true}};callbacks.updated(1,{audible:false},tabs[0]);await tick();assert.equal(messages.at(-1).audible,false);assert.equal(messages.at(-1).muted,true);
  const count=messages.length;callbacks.updated(2,{audible:true},{active:false});await tick();assert.equal(messages.length,count);
  focused=false;callbacks.focus(-1);await tick();assert.equal(messages.at(-1).focused,false);
  focused=true;tabs[0]={...tabs[0],incognito:true,title:'Private title'};callbacks.active();await tick();assert.equal(messages.at(-1).title,'');assert.equal(messages.at(-1).incognito,true);
  tabs[0]={...tabs[0],url:'chrome://settings'};callbacks.active();await tick();assert.equal(messages.at(-1).url,'');
  console.log('PASS: connector sends only active-tab origins, exact audio/mute state, focus, and private-window status.');
})().catch(e=>{console.error(e);process.exitCode=1;});
