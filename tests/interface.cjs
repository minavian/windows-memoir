const { chromium } = require(process.env.MEMOIR_PLAYWRIGHT || 'C:/Users/messo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../web');
const today = new Date().toLocaleDateString('en-CA');
const hours = Array(24).fill(0); hours[12] = 2700000;
const fixture = {
  onboarded: true,
  apps: {'app:notepad.exe': {name:'Notepad', category:'work'}, 'app:spotify.exe':{name:'Spotify',category:'video'}},
  [`day:${today}`]: {s:{'app:notepad.exe':1800000,'example.com':600000,'app:spotify.exe':300000},h:hours,hs:{12:{'app:notepad.exe':1800000,'example.com':600000,'app:spotify.exe':300000}},ti:{}},
  settings:{paused:false,weeklyReminder:true,reminderDay:0,reminderMinutes:1140,titles:false,excluded:[],retention:0},
};
let checks=0;
const verify=(value,message)=>{assert(value,message); ++checks;};
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1500,height:950}});
    await context.route('https://memoir.example/**',async route=>{
      const file=path.join(root,decodeURIComponent(new URL(route.request().url()).pathname));
      if(!file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:''});
      const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'};
      await route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
    });
    await context.addInitScript(({fixture})=>{
      const data=structuredClone(fixture), receivers=[];
      window.testData=data;
      const notify=(changes,area='local')=>receivers.forEach(fn=>fn({data:{event:'storage',area,changes}}));
      window.chrome=window.chrome||{};
      window.chrome.webview={addEventListener:(_,fn)=>receivers.push(fn),postMessage:message=>setTimeout(()=>{
        const {id,op,data:args}=message; let result=null;
        if(op==='storage.get') result=args.keys==null?structuredClone(data):Object.fromEntries((typeof args.keys==='string'?[args.keys]:Array.isArray(args.keys)?args.keys:Object.keys(args.keys)).filter(k=>k in data||!Array.isArray(args.keys)&&typeof args.keys==='object').map(k=>[k,structuredClone(data[k]??args.keys[k])]));
        else if(op==='storage.keys') result=Object.keys(data);
        else if(op==='storage.bytes') result=JSON.stringify(data).length;
        else if(op==='storage.set') {const changes={}; for(const[k,v]of Object.entries(args.patch)){changes[k]={oldValue:data[k],newValue:v};data[k]=structuredClone(v);}notify(changes);}
        else if(op==='storage.remove'){const changes={};for(const k of typeof args.keys==='string'?[args.keys]:args.keys){changes[k]={oldValue:data[k]};delete data[k];}notify(changes);}
        else if(op==='session.get') result={session:null};
        else if(op==='log') window.testLogs=(window.testLogs||[]).concat(args.message);
        else if(op==='theme') window.testAppearance=structuredClone(args);
        else if(op==='window.today'||op==='window.report') window.testView=op;
        receivers.forEach(fn=>fn({data:{id,result}}));
      },0)};
    },{fixture});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('https://memoir.example/recap.html');
    await page.locator('#sites li[data-domain="app:notepad.exe"]').waitFor();
    await page.waitForTimeout(1800);
    verify((await page.locator('#sites').innerText()).includes('Notepad'),'App labels replace executable keys');
    verify(await page.locator('.app-name a').count()===0,'App names do not open invalid website links');
    verify(await page.locator('.desktop-today').count()===0,'Report header has no Today button');
    verify(await page.locator('#scope [data-scope="day"]').getAttribute('aria-pressed')==='true','Categories starts on Day');
    verify(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+2),'Large report fits in one screen');
    for(const theme of ['light','dark','pink']) {
      await page.evaluate(async theme=>{const m=await import('./shared/theme.js');m.setThemePref(theme);},theme);
      await page.waitForTimeout(800);
      verify(await page.evaluate(theme=>window.testAppearance?.theme===theme&&window.testAppearance?.mode===theme,theme),`${theme} tray theme reaches the native host`);
      verify(await page.evaluate(()=>testAppearance.palette.surface===getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()&&testAppearance.palette.label===getComputedStyle(document.documentElement).getPropertyValue('--label').trim()),`${theme} tray palette matches the interface`);
      await page.locator('#sites li[data-domain="app:notepad.exe"]').click({button:'right'});
      await page.waitForTimeout(80);
      verify(await page.locator('.context-menu').isVisible(),`${theme} custom right-click opens`);
      verify((await page.locator('.context-title').innerText()).includes('Notepad'),`${theme} context menu names the app`);
      verify(await page.evaluate(()=>document.querySelector('.context-menu').getAnimations().length>0),`${theme} opening has animation`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(200);
      verify(!(await page.locator('.context-menu').isVisible()),`${theme} Escape dismisses menu`);
    }
    await page.locator('#settings-btn').click(); await page.waitForTimeout(750);
    verify(await page.locator('#settings-panel').isVisible(),'Settings opens');
    await page.locator('#set-tracking').evaluate(el=>el.scrollIntoView());
    await page.locator('#set-tracking').click(); await page.waitForTimeout(300);
    verify(await page.evaluate(()=>testData.settings.paused),'Pause reaches native storage bridge');
    await page.locator('#set-tracking').click(); await page.waitForTimeout(300);
    verify(!(await page.evaluate(()=>testData.settings.paused)),'Resume reaches native storage bridge');
    await page.screenshot({path:path.join(__dirname,'report-settings.png')});
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    await page.setViewportSize({width:780,height:600}); await page.waitForTimeout(500);
    verify(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'Narrow report scrolls');
    await page.mouse.move(420,420); await page.mouse.wheel(0,650); await page.waitForTimeout(70);
    const early=await page.evaluate(()=>document.scrollingElement.scrollTop);
    await page.waitForTimeout(400); const later=await page.evaluate(()=>document.scrollingElement.scrollTop);
    verify(early>0&&later>early,'Wheel scrolling glides after input');
    await page.screenshot({path:path.join(__dirname,'report-narrow.png')});
    await page.setViewportSize({width:380,height:650}); await page.goto('https://memoir.example/popup.html'); await page.waitForTimeout(1800);
    verify((await page.locator('#site-list').innerText()).includes('Notepad'),'Today renders app names');
    await page.locator('#open-week').click(); await page.waitForFunction(()=>window.testView==='window.report');
    verify(await page.evaluate(()=>window.testView==='window.report'),'Today opens native report');
    verify(!page.isClosed(),'Today no longer closes the desktop host');
    await page.screenshot({path:path.join(__dirname,'today.png')});
    await page.evaluate(()=>{testData.onboarded=false;});
    await page.setViewportSize({width:1360,height:850});
    // A new document receives the fixture again, so use a separate first-run context.
    await context.addInitScript(()=>{setTimeout(()=>{if(window.testData)window.testData.onboarded=false;},0);});
    await page.goto('https://memoir.example/recap.html'); await page.locator('.wel.on').waitFor();
    verify((await page.locator('.wel').innerText()).includes('notification area'),'Windows welcome keeps animated first-run screen');
    await page.locator('.wel-skip').click(); await page.locator('.wel').waitFor({state:'detached'});
    verify(await page.evaluate(()=>testData.onboarded),'Welcome choice persists');
    verify(errors.length===0,`No JavaScript errors: ${errors.join('; ')}`);
    verify(await page.evaluate(()=>!window.testLogs?.length),'No desktop bridge error logs');
    console.log(`PASS: ${checks} desktop interface checks.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
