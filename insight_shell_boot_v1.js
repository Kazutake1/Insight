/* Insight shell boot v1: shell version freshness check. */
(function(){
  // Shell rule: bump BUILD whenever the loader, payload list, bootstrap loader, or shell HTML changes.
  // Feature-module ?v changes are detected independently by the manifest signature below.
  var BUILD="20261009-weather-bulk-build-1";
  window.__INSIGHT_SHELL_VERSION__=BUILD;
  try{
    fetch('./Index.html?insight_probe='+Date.now(),{cache:'no-store'}).then(function(r){
      if(!r.ok)throw new Error('shell probe '+r.status);
      return r.text();
    }).then(function(text){
      var m=text.match(/<meta name="insight-shell-version" content="([^"]+)"/);
      if(m&&m[1]&&m[1]!==BUILD){
        location.replace('./Index.html?insight_build='+encodeURIComponent(m[1]));
      }
    }).catch(function(){});
  }catch(_){}
})();
