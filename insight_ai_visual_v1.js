/* 分析AIコメント表示 v1: 決定論的な分析結果を読みやすいカードへ整形する */
(function(root){
  'use strict';

  var KNOWN_LABELS=[
    '1人当たり買上点数','1点当たり売上','販売・納品','廃棄金額','廃棄額','廃棄率',
    '人件費率','粗利率','客単価','買上点数','客数','売上'
  ];

  function clean(value){return String(value==null?'':value).trim();}
  function metricFrom(text){
    text=clean(text);
    var match=text.match(/[+\-−]?\d+(?:\.\d+)?(?:%|pt)/);
    if(match)return match[0].replace('−','-');
    match=text.match(/[+\-−]?\d[\d,]*(?:\.\d+)?(?:円|人|個|件|日)/);
    return match?match[0].replace('−','-'):null;
  }
  function parseLine(value){
    var original=clean(value),text=original,state=null,title='',detail='';
    var stateMatch=text.match(/^【([^】]+)】/);
    if(stateMatch){state=stateMatch[1];text=text.slice(stateMatch[0].length).trim();}
    var colon=text.indexOf('：');
    if(colon>0){
      title=text.slice(0,colon).trim();
      detail=text.slice(colon+1).trim();
    }else{
      var found=null;
      KNOWN_LABELS.some(function(label){
        if(text.indexOf(label)===0){found=label;return true;}
        return false;
      });
      if(found){
        title=found;
        detail=text.slice(found.length).trim();
      }else{
        title='';
        detail=text;
      }
    }
    return {
      original:original,
      state:state,
      title:title,
      detail:detail,
      metric:metricFrom(detail||text)
    };
  }
  function metricNumber(metric){
    var match=String(metric||'').replace(/,/g,'').match(/^([+\-−]?\d+(?:\.\d+)?)/);
    return match?Number(match[1].replace('−','-')):null;
  }
  function toneFor(id,parts){
    var state=parts&&parts.state;
    if(state==='改善'||state==='解消'||state==='機会')return 'success';
    if(state==='注意'||state==='重要'||state==='悪化'||state==='新規'||state==='継続')return 'danger';
    if(state==='関連'||state==='主因候補'||state==='情報'||state==='結論')return 'neutral';
    if(parts&&/廃棄/.test(parts.original||'')){
      var value=metricNumber(parts.metric);
      if(value!==null&&value>0)return 'danger';
    }
    if(id==='aiAnalysisCaution')return 'danger';
    if(id==='aiAnalysisGood')return 'success';
    return 'neutral';
  }
  function emptyNode(document,text){
    var node=document.createElement('p');
    node.className='ai-analysis-empty';
    node.textContent=text;
    return node;
  }
  function textNode(document,tag,text,cls){
    var node=document.createElement(tag);
    if(cls)node.className=cls;
    node.textContent=text;
    return node;
  }
  function renderChecks(document,host,lines){
    var list=document.createElement('div');
    list.className='ai-check-list';
    lines.forEach(function(text){
      var row=document.createElement('div');
      row.className='ai-check-line';
      row.append(
        textNode(document,'span','•','ai-check-dot'),
        textNode(document,'span',text,'ai-check-text')
      );
      list.appendChild(row);
    });
    host.appendChild(list);
  }
  function renderInsight(document,host,id,text,index){
    var parts=parseLine(text),tone=toneFor(id,parts);
    var item=document.createElement('article');
    item.className='ai-insight-item is-'+tone+(id==='aiAnalysisSummary'&&index===0?' is-primary':'');
    item.dataset.tone=tone;

    var head=document.createElement('div');
    head.className='ai-insight-head';
    var title=parts.title||(
      parts.state==='結論'?'結論':
      parts.state==='関連'?'関連性':
      id==='aiAnalysisCaution'?'重要ポイント':
      id==='aiAnalysisGood'?'関連性':'分析結果'
    );
    head.appendChild(textNode(document,'div',title,'ai-insight-title'));
    if(parts.state)head.appendChild(textNode(document,'span',parts.state,'ai-insight-state'));
    item.appendChild(head);

    if(parts.metric)item.appendChild(textNode(document,'div',parts.metric,'ai-insight-value'));
    if(parts.detail)item.appendChild(textNode(document,'div',parts.detail,'ai-insight-detail'));
    else if(!parts.title)item.appendChild(textNode(document,'div',parts.original,'ai-insight-detail'));

    host.appendChild(item);
  }
  function renderLines(id,lines,fallback,document){
    document=document||root.document;
    if(!document)return false;
    var host=document.getElementById(id);
    if(!host)return false;
    host.replaceChildren();
    var unique=Array.from(new Set((lines||[]).map(clean).filter(Boolean)));
    if(!unique.length){
      host.appendChild(emptyNode(document,fallback));
      return true;
    }
    if(id==='aiAnalysisChecks'){
      renderChecks(document,host,unique);
      return true;
    }
    var list=document.createElement('div');
    list.className='ai-insight-list '+(id==='aiAnalysisSummary'?'is-summary':'is-side');
    unique.forEach(function(text,index){renderInsight(document,list,id,text,index);});
    host.appendChild(list);
    return true;
  }

  var model={VERSION:1,parseLine:parseLine,metricFrom:metricFrom,metricNumber:metricNumber,toneFor:toneFor,renderLines:renderLines};
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightAIVisual=model;
})(typeof window!=='undefined'?window:globalThis);
