/* ══ Split View 経営分析AIパネル（表示制御のみ） ══ */
function getAIAnalysisThroughDay(year,month){
  try{
    const t=todayFY();
    return String(year)===String(t.fy) && month===t.month ? t.day : null;
  }catch(_){ return null; }
}

function renderAIAnalysisPanel(){
  const periodEl=document.getElementById('aiAnalysisPeriod');
  const commentsEl=document.getElementById('aiAnalysisComments');
  if(!periodEl||!commentsEl)return;

  const month=typeof selMonth==='string'?selMonth:'';
  const year=typeof baseYear!=='undefined'?baseYear:null;
  const compare=typeof cmpYear!=='undefined'?cmpYear:null;
  const throughDay=getAIAnalysisThroughDay(year,month);

  let result=null;
  try{
    if(window.ManagementCommentEngine && year!=null && month){
      result=window.ManagementCommentEngine.getPeriod(year,month,throughDay,compare);
    }
  }catch(e){ result=null; }

  const periodText=[year?`${year}年度`:null,month||null,throughDay?`${throughDay}日まで`:null,compare?`（前年差：${compare}年度）`:null]
    .filter(Boolean).join(' ');
  periodEl.textContent=periodText||'対象期間を取得できません';
  commentsEl.innerHTML='';

  const comments=result&&Array.isArray(result.comments)?result.comments:[];
  if(comments.length===0){
    const empty=document.createElement('div');
    empty.className='ai-analysis-empty';
    empty.textContent='前年比較に必要なデータが不足しているため、経営コメントを表示できません。';
    commentsEl.appendChild(empty);
    return;
  }
  comments.forEach(text=>{
    const p=document.createElement('p');
    p.className='ai-analysis-comment';
    p.textContent=text;
    commentsEl.appendChild(p);
  });
}

/* Monthly analysis can synchronously rebuild several months of data and DOM.
 * Keep that work off the opening transform transition. The daily and sales-count
 * views already open smoothly; retain their current immediate rendering. */
let pendingAIAnalysisRender=null;
function cancelPendingAIAnalysisRender(){
  if(!pendingAIAnalysisRender)return;
  clearTimeout(pendingAIAnalysisRender.timer);
  if(pendingAIAnalysisRender.panel){
    pendingAIAnalysisRender.panel.removeEventListener('transitionend',pendingAIAnalysisRender.onEnd);
  }
  pendingAIAnalysisRender=null;
}
function openAIAnalysisPanel(){
  cancelPendingAIAnalysisRender();
  const panel=document.getElementById('aiAnalysisPanel');
  const toggle=document.getElementById('aiAnalysisToggle');
  const nav=typeof currentNav==='undefined'?null:currentNav;
  const renderAfterOpen=!!panel&&nav!==0&&nav!=='salesCounts';
  if(!renderAfterOpen)renderAIAnalysisPanel();
  document.body.classList.add('ai-analysis-open');
  if(panel)panel.setAttribute('aria-hidden','false');
  if(toggle)toggle.setAttribute('aria-expanded','true');
  if(!renderAfterOpen)return;

  const pending={panel:panel,timer:null,onEnd:null};
  pendingAIAnalysisRender=pending;
  const finish=function(){
    if(pendingAIAnalysisRender!==pending)return;
    cancelPendingAIAnalysisRender();
    if(document.body.classList.contains('ai-analysis-open'))renderAIAnalysisPanel();
  };
  pending.onEnd=function(e){
    if(e.target===panel&&e.propertyName==='transform')finish();
  };
  panel.addEventListener('transitionend',pending.onEnd);
  // Fallback for disabled/interrupted transitions; never render after closing.
  pending.timer=setTimeout(finish,400);
}

function closeAIAnalysisPanel(){
  cancelPendingAIAnalysisRender();
  document.body.classList.remove('ai-analysis-open');
  const panel=document.getElementById('aiAnalysisPanel');
  const toggle=document.getElementById('aiAnalysisToggle');
  if(panel)panel.setAttribute('aria-hidden','true');
  if(toggle)toggle.setAttribute('aria-expanded','false');
}

window.addEventListener('keydown',e=>{
  if(e.key==='Escape' && document.body.classList.contains('ai-analysis-open'))closeAIAnalysisPanel();
});
