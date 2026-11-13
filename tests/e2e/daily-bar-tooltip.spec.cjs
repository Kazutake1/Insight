const {test,expect}=require('@playwright/test');

test.use({hasTouch:true,viewport:{width:1194,height:834}});

test('売上・廃棄の日別棒を続けてタップしても選択とツールチップを保持する',async({page})=>{
  await page.route('**/Index.html*',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace(/;?\s*upgrade-insecure-requests/g,'')});
  });
  await page.goto('/Index.html');
  for(const dark of [false,true]){
    await page.locator('#navSettings').click();
    const activeDark=await page.evaluate(()=>document.documentElement.classList.contains('dark')||document.body.classList.contains('dark'));
    if(activeDark!==dark)await page.locator('.insight-theme-switch-track').click();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.classList.contains('dark')||document.body.classList.contains('dark'))).toBe(dark);

    for(const entry of [
      {nav:'#nav2',type:'sales',id:'salesLineChart',color:'#166534',label:'売上'},
      {nav:'#nav4',type:'haiki',id:'haikiBarChart',color:'#b91c1c',label:'廃棄'}
    ]){
      await page.locator(entry.nav).click();
      const canvas=page.locator('#'+entry.id);
      await expect(canvas).toBeVisible();
      await page.evaluate(({type,id})=>{
        const fy=editYear[type],mi=MONTHS.indexOf(editMonth[type]);
        for(const [index,value] of [[0,123],[1,234]]){
          if(type==='sales')drafts.sales[index].売上=value;
          else drafts.haiki[index].haiki[HAIKI_CATS[0]]=value;
        }
        if(type==='sales')refreshSalesLineChart(fy,mi);
        else refreshHaikiBarChart(fy,mi);
        Chart.getChart(id).update('none');
      },entry);
      await canvas.scrollIntoViewIfNeeded();
      // Let the navigation's queued chart render finish before recording identity.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      for(const index of [0,1]){
        const position=await canvas.evaluate((element,index)=>{
          const rect=element.getBoundingClientRect();
          const chart=Chart.getChart(element);
          window.dailyBarChart=chart;
          const bar=chart.getDatasetMeta(0).data[index];
          return {x:rect.left+bar.x,y:rect.top+(bar.y+bar.base)/2};
        },index);
        await page.touchscreen.tap(position.x,position.y);
        await expect(page.locator('#'+entry.type+'Form .hf-title')).toContainText(' '+(index+1)+'日');
        await expect(page.locator('#'+entry.type+'DayList .sel .hdb-num')).toContainText((index+1)+'日');
        await expect.poll(()=>canvas.evaluate((element,index)=>{
          const chart=Chart.getChart(element);
          const tooltip=chart.tooltip;
          return {sameChart:chart===window.dailyBarChart,day:tooltip.dataPoints?.[0]?.dataIndex,
            visible:tooltip.opacity>0,label:tooltip.body?.[0]?.lines?.[0],
            color:chart.data.datasets[0].backgroundColor[index]};
        },index)).toEqual({sameChart:true,day:index,visible:true,
          label:entry.label+': '+(entry.type==='sales'?[123,234][index]+'千円':'¥'+[123,234][index]),color:entry.color});
      }
    }
  }
});
