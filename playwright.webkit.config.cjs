const path=require('node:path');

module.exports={
  testDir:path.join(__dirname,'tests','e2e'),
  testMatch:'webkit-smoke.spec.cjs',
  timeout:45000,
  expect:{timeout:10000},
  fullyParallel:false,
  workers:1,
  retries:0,
  reporter:[['line']],
  use:{
    baseURL:'http://127.0.0.1:4173',
    browserName:'webkit',
    headless:true,
    viewport:{width:1194,height:834}
  },
  webServer:{
    command:'python3 -m http.server 4173 --bind 127.0.0.1',
    url:'http://127.0.0.1:4173/Index.html',
    reuseExistingServer:false,
    timeout:30000
  }
};
