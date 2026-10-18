/* Editable numeric fields: place the insertion caret after the current value on focus/tap.
   Keep typing, selection by keyboard, formatting and storage handling in their owner modules. */
(function(doc){
  'use strict';
  function toEnd(event){
    var input=event.target;
    if(!input||input.tagName!=='INPUT'||input.type!=='text'||input.disabled||input.readOnly||!input.value)return;
    if(input.inputMode!=='numeric'&&input.inputMode!=='decimal')return;
    if(doc.activeElement!==input)return;
    try{input.setSelectionRange(input.value.length,input.value.length);}catch(_){}
  }
  doc.addEventListener('focusin',toEnd);
  doc.addEventListener('click',toEnd);
})(document);
