'use strict';
const path=require('node:path');
module.exports={
  testDir:__dirname,testMatch:'backup-capacity.spec.cjs',workers:1,
  timeout:240000,retries:0,
  reporter:[['line']],
  use:{baseURL:'http://localhost:4173',headless:true,
    launchOptions:{args:process.env.INSIGHT_CAPACITY_BROWSER==='chromium'?['--enable-precise-memory-info']:[]}},
  projects:[{name:process.env.INSIGHT_CAPACITY_BROWSER??'chromium',
    use:{browserName:process.env.INSIGHT_CAPACITY_BROWSER??'chromium'}}],
  webServer:{
    cwd:path.resolve(__dirname,'../..'),command:'python3 -m http.server 4173',
    url:'http://localhost:4173/Index.html',reuseExistingServer:false
  }
};
