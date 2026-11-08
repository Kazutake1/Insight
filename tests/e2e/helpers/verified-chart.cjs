// Optional local copy of the exact production CDN asset, for proxy-only runners.
// SRI remains enabled in Index.html; no substitute Chart implementation is used.
const fs=require('node:fs');
const {createHash}=require('node:crypto');
module.exports=function verifiedChart(test){
  const file=process.env.INSIGHT_TEST_CHART_PATH;
  if(!file)return;
  const body=fs.readFileSync(file);
  const integrity='CQBWl4fJHWbryGE+Pc7UAxWMUMNMWzWxF4SQo9CgkJIN1kx6djDQZjh3Y8SZ1d+6I+1zze6Z7kHXO7q3UyZAWw==';
  if(createHash('sha512').update(body).digest('base64')!==integrity)throw new Error('Chart CDN integrity mismatch');
  test.beforeEach(async({context})=>{
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',route=>
      route.fulfill({body,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}}));
  });
};
