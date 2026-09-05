(function(){
  var attempts=0;
  function init(){
    attempts++;
    if(!window.ManagementOpsAnalysis||typeof window.ManagementOpsAnalysis.getCurrent!=='function'||typeof window.renderAIAnalysisPanel!=='function'||typeof window.buildAIQuestionAnswer!=='function'){
      if(attempts<200)setTimeout(init,50);
      return;
    }
    if(window.__insightStockoutRateFixApplied)return;
    window.__insightStockoutRateFixApplied=true;

    function rate(status){
      if(!status||!status.recorded)return null;
      return (Number(status.many)||0)/(Number(status.recorded)||1)*100;
    }
    function signedPt(v){
      var n=Number(v)||0;
      return (n>0?'+':'')+n.toFixed(1)+'pt';
    }
    function removeStockoutLines(el){
      if(!el)return;
      Array.prototype.slice.call(el.querySelectorAll('p')).forEach(function(p){
        if(p.textContent&&p.textContent.indexOf('欠品「多い」')>=0)p.remove();
      });
    }
    function appendLine(el,text,empty){
      if(!el||!text)return;
      var p=document.createElement('p');
      p.className=empty?'ai-analysis-empty':'ai-analysis-comment';
      p.textContent=text;
      el.appendChild(p);
    }
    function addRateEvaluation(a){
      if(!a||!a.status)return;
      var good=document.getElementById('aiAnalysisGood');
      var caution=document.getElementById('aiAnalysisCaution');
      var summary=document.getElementById('aiAnalysisSummary');
      removeStockoutLines(good);
      removeStockoutLines(caution);
      removeStockoutLines(summary);

      var curRate=rate(a.status);
      if(curRate==null)return;
      var current='欠品「多い」は記録'+a.status.recorded+'日中'+a.status.many+'日（'+curRate.toFixed(1)+'%）です。';
      var hasComparison=a.context&&a.context.prevYear!=null&&a.prevStatus&&a.prevStatus.recorded>0;
      if(!hasComparison){
        if(a.status.many>0)appendLine(caution,current,false);
        else appendLine(summary,current,false);
        return;
      }
      var prevRate=rate(a.prevStatus);
      var diff=curRate-prevRate;
      var comparison=' 前年は'+a.prevStatus.recorded+'日中'+a.prevStatus.many+'日（'+prevRate.toFixed(1)+'%）、前年差'+signedPt(diff)+'です。';
      if(diff<0)appendLine(good,current+comparison,false);
      else if(diff>0)appendLine(caution,current+comparison,false);
      else appendLine(summary,current+' 前年も'+prevRate.toFixed(1)+'%で同水準です。',false);
    }
    function stockoutAnswer(a){
      if(!a||!a.status||a.status.recorded<=0)return 'この期間の欠品記録はまだありません。';
      var curRate=rate(a.status);
      var out=['欠品記録は'+a.status.recorded+'日分で、「多い」'+a.status.many+'日（'+curRate.toFixed(1)+'%）、「少ない」'+a.status.few+'日です。'];
      if(a.context&&a.context.prevYear!=null&&a.prevStatus&&a.prevStatus.recorded>0){
        var prevRate=rate(a.prevStatus);
        var diff=curRate-prevRate;
        out.push('前年は記録'+a.prevStatus.recorded+'日中「多い」'+a.prevStatus.many+'日（'+prevRate.toFixed(1)+'%）で、割合の前年差は'+signedPt(diff)+'です。');
      }
      if(a.status.manyDays&&a.status.manyDays.length)out.push('「多い」の記録日：'+a.status.manyDays.join('日、')+'日。');
      out.push('記録日数が異なる場合でも、日数そのものではなく記録日に占める割合で比較しています。欠品が売上に与えた影響は、この記録だけでは断定できません。');
      return out.join('\n');
    }

    var originalRender=window.renderAIAnalysisPanel;
    window.renderAIAnalysisPanel=function(){
      var result=originalRender.apply(this,arguments);
      try{addRateEvaluation(window.ManagementOpsAnalysis.getCurrent());}catch(e){console.warn('Insight stockout comparison:',e);}
      return result;
    };

    var originalBuild=window.buildAIQuestionAnswer;
    window.buildAIQuestionAnswer=function(q){
      var text=String(q||'').trim();
      if(/欠品|品切れ/.test(text)){
        try{return stockoutAnswer(window.ManagementOpsAnalysis.getCurrent());}catch(e){console.warn('Insight stockout answer:',e);}
      }
      return originalBuild.apply(this,arguments);
    };
  }
  init();
})();
