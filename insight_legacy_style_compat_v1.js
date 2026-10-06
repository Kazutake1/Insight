/* Legacy core style compatibility v1.
 * Migrates a visual compatibility override out of bootstrap payload string rewriting.
 */
(function(root){
  'use strict';
  if(root.InsightLegacyStyleCompat)return;

  function compact(value){return String(value||'').replace(/\s+/g,'').trim();}
  function applyRules(rules){
    var matched=0;
    if(!rules)return matched;
    for(var i=0;i<rules.length;i++){
      var rule=rules[i];
      if(rule&&rule.style){
        var background=compact(rule.style.getPropertyValue('background'));
        var color=compact(rule.style.getPropertyValue('color'));
        var shadow=compact(rule.style.getPropertyValue('box-shadow'));
        if(background==='var(--surface)'&&color==='var(--text)'&&shadow==='06px24pxvar(--shadow)'){
          rule.style.setProperty('background','#1a1a1a');
          rule.style.setProperty('color','#fff');
          matched++;
        }
      }
      if(rule&&rule.cssRules)matched+=applyRules(rule.cssRules);
    }
    return matched;
  }
  function apply(){
    var matched=0,sheets=document.styleSheets||[];
    for(var i=0;i<sheets.length;i++){
      try{matched+=applyRules(sheets[i].cssRules);}catch(_){}
    }
    model.matched=matched;
    return matched;
  }
  var model={VERSION:1,matched:0,apply:apply};
  root.InsightLegacyStyleCompat=model;
  apply();
})(typeof window!=='undefined'?window:globalThis);
