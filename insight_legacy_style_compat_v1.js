/* Legacy core style compatibility v1.
 * Migrates a visual compatibility override out of bootstrap payload string rewriting.
 */
(function(root){
  'use strict';
  if(root.InsightLegacyStyleCompat)return;

  function apply(){model.matched=0;return 0;}
  var model={VERSION:2,matched:0,apply:apply};
  root.InsightLegacyStyleCompat=model;
})(typeof window!=='undefined'?window:globalThis);
