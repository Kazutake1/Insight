
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

function openAIAnalysisPanel(){
  renderAIAnalysisPanel();
  document.body.classList.add('ai-analysis-open');
  const panel=document.getElementById('aiAnalysisPanel');
  const toggle=document.getElementById('aiAnalysisToggle');
  if(panel)panel.setAttribute('aria-hidden','false');
  if(toggle)toggle.setAttribute('aria-expanded','true');
}

function closeAIAnalysisPanel(){
  document.body.classList.remove('ai-analysis-open');
  const panel=document.getElementById('aiAnalysisPanel');
  const toggle=document.getElementById('aiAnalysisToggle');
  if(panel)panel.setAttribute('aria-hidden','true');
  if(toggle)toggle.setAttribute('aria-expanded','false');
}

window.addEventListener('keydown',e=>{
  if(e.key==='Escape' && document.body.classList.contains('ai-analysis-open'))closeAIAnalysisPanel();
});
