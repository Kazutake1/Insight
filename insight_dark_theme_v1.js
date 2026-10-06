/* Firefox-inspired dark theme v1: color-only overrides for Insight dark mode. */
(function(root){
  'use strict';
  if(root.InsightDarkTheme)return;

  var PALETTE={
    background:'#251b26',
    surface:'#2f2942',
    surface2:'#342c45',
    surface3:'#3b324c',
    border:'#554a5e',
    text:'#e2e2ea',
    text2:'#d2cdda',
    text3:'#b9b3c4',
    text4:'#9793a1',
    text5:'#756f7e',
    wine:'#432325',
    wineActive:'#5a3038'
  };

  var model={VERSION:1,palette:PALETTE};
  root.InsightDarkTheme=model;
  if(!root.document)return;

  var doc=root.document;
  function darkActive(){
    return doc.documentElement.classList.contains('dark')||!!(doc.body&&doc.body.classList.contains('dark'));
  }
  function updateThemeColor(){
    var meta=doc.querySelector('meta[name="theme-color"]');
    if(!meta)return;
    if(!meta.dataset.insightLightThemeColor)meta.dataset.insightLightThemeColor=meta.getAttribute('content')||'#1a1a1a';
    meta.setAttribute('content',darkActive()?PALETTE.background:meta.dataset.insightLightThemeColor);
  }
  updateThemeColor();

  var observer=new MutationObserver(updateThemeColor);
  observer.observe(doc.documentElement,{attributes:true,attributeFilter:['class']});
  if(doc.body)observer.observe(doc.body,{attributes:true,attributeFilter:['class']});

  model.isDark=darkActive;
  model.refresh=updateThemeColor;
})(typeof window!=='undefined'?window:globalThis);
