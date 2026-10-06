/* Legacy bootstrap compatibility shim.
 * STEP5 complete: payload source no longer requires string replacement before execution.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.InsightBootstrapPatches=factory();
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  function apply(html){
    if(typeof html!=='string')throw new Error('Insight payload HTML is invalid');
    return html;
  }

  return{apply:apply};
});
