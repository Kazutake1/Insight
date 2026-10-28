const path=require('node:path');

module.exports={
  testDir:path.join(__dirname,'tests','e2e'),
  testMatch:['webkit-smoke.spec.cjs','saved-report.spec.cjs','sales-count-year-warning.spec.cjs','order-forecast.spec.cjs','event-demand-categories.spec.cjs','event-day-scroll.spec.cjs','weather-picker.spec.cjs','inline-events.spec.cjs','runtime-csp.spec.cjs','weather-sales-view.spec.cjs','sales-operation-observer.spec.cjs','weather-bulk-operation-observer.spec.cjs','hourly-save-operation-observer.spec.cjs'],
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

