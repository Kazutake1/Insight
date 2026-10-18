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
  // These fields previously used type=number: retain number-only input despite type=text.
  function keepNativeNumericInput(event){
    var input=event.target;
    if(!input||input.tagName!=='INPUT'||input.type!=='text')return;
    var whole=input.id==='qi_客数'||input.classList.contains('kyaku-input');
    var decimal=input.id==='qi_買上点数';
    if(!whole&&!decimal)return;
    var value=input.value.replace(/[^0-9.]/g,'');
    if(whole)value=value.replace(/\./g,'');
    else{var dot=value.indexOf('.');if(dot!==-1)value=value.slice(0,dot+1)+value.slice(dot+1).replace(/\./g,'');}
    if(input.value!==value)input.value=value;
  }
  doc.addEventListener('input',keepNativeNumericInput,true);
  doc.addEventListener('focusin',toEnd);
  doc.addEventListener('click',toEnd);
})(document);
