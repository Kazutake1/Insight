/* Sales-count camera capture v8: precision-first three-pass local OCR, in-memory review only. */
(function(root){
  'use strict';
  if(root.InsightSalesCountCamera)return;

  var MAX_FILES=12;
  var MAX_FILE_BYTES=20*1024*1024;
  var POLICY={
    persistImages:false,
    externalTransmission:false,
    autoSave:false,
    unmatchedCategory:'discard'
  };
  var OCR_POLICY={
    engine:'Tesseract.js',
    version:'7.0.0',
    language:'jpn',
    assetOrigin:'same-origin',
    cacheMethod:'none',
    workerBlobURL:false
  };

  function pad(value){return String(value).padStart(2,'0');}
  function lastDay(year,month){return new Date(Number(year),Number(month),0).getDate();}
  function validPeriod(period){
    var year=Number(period&&period.year),month=Number(period&&period.month);
    return Number.isInteger(year)&&year>=1000&&Number.isInteger(month)&&month>=1&&month<=12?{year:year,month:month}:null;
  }
  function periodBounds(period){
    period=validPeriod(period);
    if(!period)return null;
    return {
      min:String(period.year)+'-'+pad(period.month)+'-01',
      max:String(period.year)+'-'+pad(period.month)+'-'+pad(lastDay(period.year,period.month))
    };
  }
  function defaultTargetDate(period,now){
    var bounds=periodBounds(period);
    if(!bounds)return '';
    var date=now instanceof Date?now:new Date(now||Date.now());
    if(!Number.isNaN(date.getTime())){
      var current=String(date.getFullYear())+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());
      if(current>=bounds.min&&current<=bounds.max)return current;
    }
    return bounds.min;
  }
  function isImageFile(file){
    return !!(file&&typeof file.size==='number'&&file.size>0&&file.size<=MAX_FILE_BYTES&&typeof file.type==='string'&&file.type.indexOf('image/')===0);
  }
  function fileIssue(file){
    if(!file)return '画像を取得できませんでした。';
    if(!(typeof file.type==='string'&&file.type.indexOf('image/')===0))return '画像ファイルのみ追加できます。';
    if(!(typeof file.size==='number'&&file.size>0))return '空の画像は追加できません。';
    if(file.size>MAX_FILE_BYTES)return '1枚20MB以下の画像を使用してください。';
    return null;
  }
  function normalizeText(value){
    var text=String(value==null?'':value);
    try{text=text.normalize('NFKC');}catch(_){}
    return text.replace(/\r/g,'').replace(/[ \t]+/g,' ').trim();
  }
  function compactForMatch(value){
    return normalizeText(value).replace(/\s+/g,'');
  }
  function bboxOf(value){
    var box=value&&value.bbox;
    if(!box||typeof box!=='object')return null;
    var x0=Number(box.x0!=null?box.x0:box.left);
    var y0=Number(box.y0!=null?box.y0:box.top);
    var x1=Number(box.x1!=null?box.x1:(box.left!=null&&box.width!=null?Number(box.left)+Number(box.width):NaN));
    var y1=Number(box.y1!=null?box.y1:(box.top!=null&&box.height!=null?Number(box.top)+Number(box.height):NaN));
    if([x0,y0,x1,y1].some(function(v){return !Number.isFinite(v);}))return null;
    return {x0:x0,y0:y0,x1:x1,y1:y1};
  }
  function wordFrom(value){
    if(!value||typeof value!=='object')return null;
    var text=normalizeText(value.text);
    if(!text)return null;
    var confidence=Number(value.confidence);
    return {
      text:text,
      confidence:Number.isFinite(confidence)?confidence:null,
      bbox:bboxOf(value)
    };
  }
  function extractLayout(blocks){
    var lines=[];
    function addLine(line){
      if(!line||typeof line!=='object')return;
      var words=Array.isArray(line.words)?line.words.map(wordFrom).filter(Boolean):[];
      var text=normalizeText(line.text||words.map(function(word){return word.text;}).join(' '));
      if(!text)return;
      var confidence=Number(line.confidence);
      lines.push({
        index:lines.length,
        text:text,
        confidence:Number.isFinite(confidence)?confidence:null,
        bbox:bboxOf(line),
        words:words
      });
    }
    function visit(node){
      if(!node)return;
      if(Array.isArray(node)){node.forEach(visit);return;}
      if(typeof node!=='object')return;
      if(Array.isArray(node.lines)){node.lines.forEach(addLine);return;}
      if(Array.isArray(node.paragraphs)){node.paragraphs.forEach(visit);return;}
      if(Array.isArray(node.blocks)){node.blocks.forEach(visit);return;}
      if(Array.isArray(node.words)){addLine(node);}
    }
    visit(blocks);
    return lines;
  }
  function validIso(year,month,day){
    year=Number(year);month=Number(month);day=Number(day);
    if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day)||year<1000||month<1||month>12||day<1)return null;
    var date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
    return String(year)+'-'+pad(month)+'-'+pad(day);
  }
  function targetDateParts(targetDate){
    var match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(targetDate||''));
    return match?{year:Number(match[1]),month:Number(match[2]),day:Number(match[3])}:null;
  }
  function inferYearForMonth(month,targetDate){
    var target=targetDateParts(targetDate);
    month=Number(month);
    if(!target||!Number.isInteger(month)||month<1||month>12)return new Date().getFullYear();
    var year=target.year;
    var delta=month-target.month;
    if(delta>6)year--;
    else if(delta<-6)year++;
    return year;
  }
  function extractDateCandidates(text,targetDate){
    text=normalizeText(text);
    var target=targetDateParts(targetDate);
    var found=[];
    function add(year,month,day,raw,precision){
      var iso=validIso(year,month,day);
      if(iso&&!found.some(function(item){return item.iso===iso;}))found.push({iso:iso,raw:normalizeText(raw),precision:precision||'monthDay'});
    }
    var full=/(\d{4})\s*(?:年|[\/.\-])\s*(\d{1,2})\s*(?:月|[\/.\-])\s*(\d{1,2})\s*日?/g;
    var match;
    while((match=full.exec(text)))add(match[1],match[2],match[3],match[0],'full');
    var japanese=/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
    while((match=japanese.exec(text)))add(target?inferYearForMonth(match[1],targetDate):new Date().getFullYear(),match[1],match[2],match[0],'monthDay');
    var shortDate=/(?:^|[^\d])(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?!\d)/g;
    while((match=shortDate.exec(text)))add(target?inferYearForMonth(match[1],targetDate):new Date().getFullYear(),match[1],match[2],match[0],'monthDay');
    return found;
  }
  function dateStamp(iso){
    var parts=targetDateParts(iso);
    return parts?Date.UTC(parts.year,parts.month-1,parts.day):NaN;
  }
  function evaluateTargetDate(dateCandidates,targetDate){
    var targetStamp=dateStamp(targetDate);
    if(!Number.isFinite(targetStamp))return null;
    var candidates=(Array.isArray(dateCandidates)?dateCandidates:[]).filter(function(item){return item&&Number.isFinite(dateStamp(item.iso));});
    if(candidates.some(function(item){return item.iso===targetDate;}))return true;
    if(!candidates.length)return null;

    var oneDay=86400000;
    var stamps=Array.from(new Set(candidates.map(function(item){return dateStamp(item.iso);}))).sort(function(a,b){return a-b;});
    var clusters=[],current=[];
    stamps.forEach(function(stamp){
      if(!current.length||stamp-current[current.length-1]<=3*oneDay)current.push(stamp);
      else{clusters.push(current);current=[stamp];}
    });
    if(current.length)clusters.push(current);

    var reliable=clusters.filter(function(cluster){return cluster.length>=3;});
    for(var i=0;i<reliable.length;i++){
      var cluster=reliable[i],min=cluster[0]-oneDay,max=cluster[cluster.length-1]+oneDay;
      if(targetStamp>=min&&targetStamp<=max)return true;
    }
    if(reliable.length)return false;
    return null;
  }
  function textLines(text){
    return String(text==null?'':text).replace(/\r/g,'').split('\n').map(function(line){return normalizeText(line);}).filter(Boolean);
  }
  function fallbackLines(text,confidence){
    return textLines(text).map(function(line,index){
      return {index:index,text:line,confidence:Number.isFinite(Number(confidence))?Number(confidence):null,bbox:null,words:[]};
    });
  }
  function candidateKind(line,start,end){
    var before=line.slice(Math.max(0,start-2),start);
    var after=line.slice(end,end+2);
    if(/便/.test(after))return 'trip_label';
    if(/[年月日\/.\-]/.test(before+after))return 'date';
    return 'value';
  }
  function extractNumberCandidates(lines,text){
    var sourceLines=Array.isArray(lines)&&lines.length?lines:fallbackLines(text,null);
    var out=[];
    sourceLines.forEach(function(line,lineIndex){
      var source=normalizeText(line&&line.text);
      var rx=/\d[\d,]*/g,match;
      while((match=rx.exec(source))){
        var raw=match[0],value=Number(raw.replace(/,/g,''));
        if(!Number.isSafeInteger(value)||value<0)continue;
        out.push({
          value:value,
          raw:raw,
          kind:candidateKind(source,match.index,match.index+raw.length),
          lineIndex:line&&Number.isInteger(line.index)?line.index:lineIndex,
          confidence:line&&Number.isFinite(Number(line.confidence))?Number(line.confidence):null,
          bbox:null
        });
      }
    });
    return out;
  }
  function matchCategories(text,lines,categories){
    var combined=compactForMatch([text].concat((lines||[]).map(function(line){return line.text;})).join('\n'));
    var out=[];
    (Array.isArray(categories)?categories:[]).forEach(function(category){
      if(!category||category.hidden===true||typeof category.id!=='string'||!category.id)return;
      var labels=[category.name].concat(Array.isArray(category.aliases)?category.aliases:[]).filter(function(label){return typeof label==='string'&&label.trim();});
      var matched=labels.find(function(label){
        var needle=compactForMatch(label);
        return !!needle&&combined.indexOf(needle)>=0;
      });
      if(matched)out.push({id:category.id,name:String(category.name||matched),matchedLabel:matched});
    });
    return out;
  }
  function detectLabels(text,lines){
    var source=normalizeText([text].concat((lines||[]).map(function(line){return line.text;})).join('\n'));
    function indexes(rx){
      var list=[];
      (lines||[]).forEach(function(line,index){if(rx.test(normalizeText(line.text))){list.push(Number.isInteger(line.index)?line.index:index);}rx.lastIndex=0;});
      return list;
    }
    return {
      delivery:{found:/納\s*品(?:\s*数)?/.test(source),lineIndexes:indexes(/納\s*品(?:\s*数)?/)},
      sales:{found:/販\s*売(?:\s*数)?/.test(source),lineIndexes:indexes(/販\s*売(?:\s*数)?/)},
      trips:[1,2,3].map(function(trip){
        var rx=new RegExp(String(trip)+'\\s*便');
        return {trip:trip,found:rx.test(source),lineIndexes:indexes(rx)};
      })
    };
  }
  function analyzeOcrData(data,categories,targetDate){
    data=data&&typeof data==='object'?data:{};
    var text=normalizeText(data.text||'');
    var lines=extractLayout(data.blocks);
    if(!lines.length)lines=fallbackLines(data.text||'',data.confidence);
    var dates=extractDateCandidates(text,targetDate);
    var numbers=extractNumberCandidates(lines,text).filter(function(candidate){return candidate.kind==='value';});
    var matched=matchCategories(text,lines,categories);
    var confidence=Number(data.confidence);
    return {
      text:text,
      confidence:Number.isFinite(confidence)?confidence:null,
      lines:lines,
      numberCandidates:numbers,
      matchedCategories:matched,
      dateCandidates:dates,
      targetDateMatched:evaluateTargetDate(dates,targetDate),
      labels:detectLabels(text,lines)
    };
  }
  function centerX(box){return box?(Number(box.x0)+Number(box.x1))/2:NaN;}
  function centerY(box){return box?(Number(box.y0)+Number(box.y1))/2:NaN;}
  function lineCenterY(line){
    var y=centerY(line&&line.bbox);
    if(Number.isFinite(y))return y;
    var ys=(line&&Array.isArray(line.words)?line.words:[]).map(function(word){return centerY(word.bbox);}).filter(Number.isFinite);
    return ys.length?ys.reduce(function(sum,value){return sum+value;},0)/ys.length:NaN;
  }
  function parseDateToken(value,referenceDate){
    var text=normalizeText(value).replace(/[（）()\[\]]/g,' ');
    var match=/(\d{4})\s*(?:年|[\/.\-])\s*(\d{1,2})\s*(?:月|[\/.\-])\s*(\d{1,2})/.exec(text);
    if(match)return validIso(match[1],match[2],match[3]);
    match=/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(text);
    if(match)return validIso(inferYearForMonth(match[1],referenceDate),match[1],match[2]);
    match=/(?:^|[^\d])(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?!\d)/.exec(text);
    if(match)return validIso(inferYearForMonth(match[1],referenceDate),match[1],match[2]);
    return null;
  }
  function wordNumber(word){
    var text=normalizeText(word&&word.text).replace(/,/g,'');
    if(!/^\d+$/.test(text))return null;
    var value=Number(text);
    return Number.isSafeInteger(value)&&value>=0?value:null;
  }
  function spatialWords(lines){
    var out=[];
    (Array.isArray(lines)?lines:[]).forEach(function(line,index){
      (Array.isArray(line&&line.words)?line.words:[]).forEach(function(word){
        var x=centerX(word.bbox),y=centerY(word.bbox);
        if(!Number.isFinite(x)||!Number.isFinite(y))return;
        out.push({
          text:normalizeText(word.text),
          confidence:Number.isFinite(Number(word.confidence))?Number(word.confidence):null,
          bbox:word.bbox,
          x:x,
          y:y,
          lineIndex:Number.isInteger(line.index)?line.index:index
        });
      });
    });
    return out;
  }
  function mergedWordBox(words){
    var boxes=(words||[]).map(function(word){return word&&word.bbox;}).filter(Boolean);
    if(!boxes.length)return null;
    return {
      x0:Math.min.apply(null,boxes.map(function(box){return Number(box.x0);})),
      y0:Math.min.apply(null,boxes.map(function(box){return Number(box.y0);})),
      x1:Math.max.apply(null,boxes.map(function(box){return Number(box.x1);})),
      y1:Math.max.apply(null,boxes.map(function(box){return Number(box.y1);}))
    };
  }
  function dateAnchorsFromLineText(line,index,referenceDate){
    var text=normalizeText(line&&line.text),box=bboxOf(line);
    if(!text||!box)return [];
    var out=[];
    function add(raw,start,end){
      var iso=parseDateToken(raw,referenceDate);
      if(!iso||out.some(function(item){return item.iso===iso;}))return;
      var mid=(start+end)/2;
      var x=box.x0+(box.x1-box.x0)*(mid/Math.max(1,text.length));
      var y=centerY(box),confidence=Number(line&&line.confidence);
      if(!Number.isFinite(x)||!Number.isFinite(y))return;
      out.push({iso:iso,x:x,y:y,raw:normalizeText(raw),confidence:Number.isFinite(confidence)?confidence:null,lineIndex:Number.isInteger(line&&line.index)?line.index:index,span:null,approximate:true});
    }
    var match,rxFull=/(\d{4}\s*(?:年|[\/.\-])\s*\d{1,2}\s*(?:月|[\/.\-])\s*\d{1,2}\s*日?)/g;
    while((match=rxFull.exec(text)))add(match[1],match.index,match.index+match[1].length);
    var rxJp=/(\d{1,2}\s*月\s*\d{1,2}\s*日?)/g;
    while((match=rxJp.exec(text)))add(match[1],match.index,match.index+match[1].length);
    var rxShort=/(^|[^\d])(\d{1,2}\s*[\/.\-]\s*\d{1,2})(?!\d)/g;
    while((match=rxShort.exec(text))){
      var offset=match[0].indexOf(match[2]);
      add(match[2],match.index+offset,match.index+offset+match[2].length);
    }
    return out;
  }
  function dateAnchorsForLine(line,index,referenceDate){
    var words=(Array.isArray(line&&line.words)?line.words:[]).filter(function(word){return word&&word.bbox&&normalizeText(word.text);}).slice().sort(function(a,b){return centerX(a.bbox)-centerX(b.bbox);});
    var anchors=[];
    function add(wordsSlice,raw){
      var iso=parseDateToken(raw,referenceDate),box=mergedWordBox(wordsSlice),x=centerX(box),y=centerY(box);
      if(!iso||!Number.isFinite(x)||!Number.isFinite(y))return;
      var confidences=wordsSlice.map(function(word){return Number(word.confidence);}).filter(Number.isFinite);
      var confidence=confidences.length?Math.min.apply(null,confidences):null;
      var candidate={iso:iso,x:x,y:y,raw:normalizeText(raw),confidence:confidence,lineIndex:Number.isInteger(line&&line.index)?line.index:index,span:wordsSlice.length};
      var existing=anchors.find(function(anchor){return anchor.iso===iso;});
      if(!existing){anchors.push(candidate);return;}
      if(candidate.span<existing.span||((candidate.confidence==null?-1:candidate.confidence)>(existing.confidence==null?-1:existing.confidence)))Object.assign(existing,candidate);
    }
    words.forEach(function(word){add([word],word.text);});
    for(var start=0;start<words.length;start++){
      for(var length=2;length<=4&&start+length<=words.length;length++){
        var slice=words.slice(start,start+length);
        var joined=slice.map(function(word){return normalizeText(word.text);}).join('');
        if(/[\/\.\-年月日]/.test(joined))add(slice,joined);
      }
    }
    dateAnchorsFromLineText(line,index,referenceDate).forEach(function(candidate){
      if(!anchors.some(function(anchor){return anchor.iso===candidate.iso;}))anchors.push(candidate);
    });
    return anchors;
  }
  function spatialDateAnchors(lines,referenceDate){
    var clusters=[];
    (Array.isArray(lines)?lines:[]).forEach(function(line,index){
      var anchors=dateAnchorsForLine(line,index,referenceDate).filter(function(anchor){return !anchor.approximate;});
      if(!anchors.length)return;
      var y=lineCenterY(line);
      if(!Number.isFinite(y))return;
      var cluster=clusters.find(function(item){return Math.abs(item.y-y)<=18;});
      if(!cluster){cluster={y:y,anchors:[]};clusters.push(cluster);}
      cluster.anchors.push.apply(cluster.anchors,anchors);
      cluster.y=(cluster.y+y)/2;
    });
    if(!clusters.length)return [];
    clusters.forEach(function(cluster){
      var seen=new Set();
      cluster.anchors=cluster.anchors.slice().sort(function(a,b){return a.x-b.x;}).filter(function(anchor){
        if(seen.has(anchor.iso))return false;
        seen.add(anchor.iso);
        return true;
      });
    });
    clusters.sort(function(a,b){return b.anchors.length-a.anchors.length||a.y-b.y;});
    return clusters[0].anchors;
  }
  function dateSequenceFromLines(lines,referenceDate){
    var best=[];
    (Array.isArray(lines)?lines:[]).forEach(function(line){
      var dates=extractDateCandidates(line&&line.text||'',referenceDate);
      if(dates.length>best.length)best=dates;
    });
    return best;
  }
  function tripGroupsFromLineText(line,index){
    var text=normalizeText(line&&line.text).replace(/([123])\s*便/g,'$1');
    var box=bboxOf(line);
    if(!text||!box||/[^123\s]/.test(text))return [];
    var tokens=text.split(/\s+/).filter(Boolean);
    if(tokens.length<3||tokens.length%3!==0)return [];
    for(var i=0;i<tokens.length;i++)if(tokens[i]!==String(i%3+1))return [];
    var step=(box.x1-box.x0)/tokens.length;
    if(!(step>0))return [];
    var xs=tokens.map(function(_,i){return box.x0+step*(i+0.5);});
    var y=centerY(box),groups=[];
    if(!Number.isFinite(y))return [];
    for(var start=0;start<xs.length;start+=3){
      groups.push({x:(xs[start]+xs[start+1]+xs[start+2])/3,tripXs:[xs[start],xs[start+1],xs[start+2]],y:y,lineIndex:Number.isInteger(line&&line.index)?line.index:index,approximate:true});
    }
    return groups;
  }
  function tripGroups(lines,firstCategoryY){
    var clusters=[];
    (Array.isArray(lines)?lines:[]).forEach(function(line,index){
      var y=lineCenterY(line);
      if(!Number.isFinite(y)||(Number.isFinite(firstCategoryY)&&y>=firstCategoryY-2))return;
      var words=(Array.isArray(line&&line.words)?line.words:[]).map(function(word){
        return {text:normalizeText(word.text),x:centerX(word.bbox),y:centerY(word.bbox)};
      }).filter(function(word){return /^[123]$/.test(word.text)&&Number.isFinite(word.x);}).sort(function(a,b){return a.x-b.x;});
      var groups=[];
      for(var i=0;i<=words.length-3;){
        if(words[i].text==='1'&&words[i+1].text==='2'&&words[i+2].text==='3'){
          groups.push({x:(words[i].x+words[i+1].x+words[i+2].x)/3,tripXs:[words[i].x,words[i+1].x,words[i+2].x],y:y,lineIndex:Number.isInteger(line&&line.index)?line.index:index,approximate:false});
          i+=3;
        }else i++;
      }
      if(!groups.length)groups=tripGroupsFromLineText(line,index);
      if(!groups.length)return;
      var cluster=clusters.find(function(item){return Math.abs(item.y-y)<=18;});
      if(!cluster){cluster={y:y,groups:[]};clusters.push(cluster);}
      cluster.groups.push.apply(cluster.groups,groups);
      cluster.y=(cluster.y+y)/2;
    });
    if(!clusters.length)return [];
    clusters.forEach(function(cluster){
      cluster.groups=cluster.groups.slice().sort(function(a,b){return a.x-b.x;});
      var dedup=[];
      cluster.groups.forEach(function(group){
        if(dedup.some(function(existing){return Math.abs(existing.x-group.x)<12;}))return;
        dedup.push(group);
      });
      cluster.groups=dedup;
    });
    clusters.sort(function(a,b){return b.groups.length-a.groups.length||a.y-b.y;});
    return clusters[0].groups;
  }
  function addIsoDays(iso,delta){
    var parts=targetDateParts(iso);
    if(!parts)return null;
    var date=new Date(Date.UTC(parts.year,parts.month-1,parts.day+delta));
    return validIso(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate());
  }
  function expandDateAnchorsWithTrips(anchors,groups){
    anchors=(Array.isArray(anchors)?anchors:[]).slice().sort(function(a,b){return a.x-b.x;});
    groups=(Array.isArray(groups)?groups:[]).slice().sort(function(a,b){return a.x-b.x;});
    if(!anchors.length||groups.length<=anchors.length)return anchors;
    var mapped=anchors.map(function(anchor){
      var bestIndex=-1,bestDistance=Infinity;
      groups.forEach(function(group,index){var distance=Math.abs(group.x-anchor.x);if(distance<bestDistance){bestDistance=distance;bestIndex=index;}});
      return {anchor:anchor,index:bestIndex};
    }).filter(function(item){return item.index>=0;});
    if(!mapped.length)return anchors;
    var baseline=mapped[0];
    var consistent=mapped.every(function(item){return addIsoDays(baseline.anchor.iso,item.index-baseline.index)===item.anchor.iso;});
    if(!consistent)return anchors;
    return groups.map(function(group,index){
      var iso=addIsoDays(baseline.anchor.iso,index-baseline.index);
      return {iso:iso,x:group.x,y:baseline.anchor.y,raw:iso,confidence:baseline.anchor.confidence,lineIndex:baseline.anchor.lineIndex,inferred:index!==baseline.index,tripXs:group.tripXs.slice()};
    });
  }
  function metricLabelKind(value){
    var text=compactForMatch(value),digit=text.search(/\d/);
    var label=digit<0?text:text.slice(0,digit);
    if(/納/.test(label)&&/(品|晶|口|ロ)/.test(label))return 'delivery';
    if(/(販|阪)/.test(label)&&/(売|壳|充)/.test(label))return 'sales';
    return null;
  }
  function categoryAnchors(lines,categories){
    var active=(Array.isArray(categories)?categories:[]).filter(function(category){return category&&category.hidden!==true&&category.id&&category.name;});
    var out=[];
    (Array.isArray(lines)?lines:[]).forEach(function(line,index){
      var compact=compactForMatch(line&&line.text),y=lineCenterY(line);
      if(!compact||!Number.isFinite(y))return;
      active.forEach(function(category){
        var labels=[category.name].concat(Array.isArray(category.aliases)?category.aliases:[]).filter(Boolean);
        var matched=labels.find(function(label){var needle=compactForMatch(label);return needle&&compact.indexOf(needle)>=0;});
        if(!matched)return;
        out.push({
          id:category.id,
          name:String(category.name),
          matchedLabel:matched,
          activeTrips:Array.isArray(category.activeTrips)&&category.activeTrips.length===3?category.activeTrips.map(function(v){return v!==false;}):[true,true,true],
          y:y,
          lineIndex:Number.isInteger(line.index)?line.index:index
        });
      });
    });
    var dedup=[];
    out.sort(function(a,b){return a.y-b.y;}).forEach(function(anchor){
      if(dedup.some(function(existing){return existing.id===anchor.id&&Math.abs(existing.y-anchor.y)<4;}))return;
      dedup.push(anchor);
    });
    return dedup;
  }
  function regularDateGrid(anchors){
    anchors=(Array.isArray(anchors)?anchors:[]).slice().sort(function(a,b){return a.x-b.x;});
    if(anchors.length<2)return null;
    var gaps=[];
    for(var i=1;i<anchors.length;i++){
      if(addIsoDays(anchors[i-1].iso,1)!==anchors[i].iso)return null;
      var gap=anchors[i].x-anchors[i-1].x;
      if(!(gap>0))return null;
      gaps.push(gap);
    }
    var sorted=gaps.slice().sort(function(a,b){return a-b;});
    var median=sorted[Math.floor(sorted.length/2)];
    if(!(median>0))return null;
    if(gaps.some(function(gap){return gap<median*0.55||gap>median*1.8;}))return null;
    return {anchors:anchors,spacing:median};
  }
  function tripXsFromDateGrid(grid,index){
    if(!grid||!grid.anchors[index])return null;
    var anchors=grid.anchors,anchor=anchors[index],spacing=grid.spacing;
    var left=index>0?(anchors[index-1].x+anchor.x)/2:anchor.x-spacing/2;
    var right=index<anchors.length-1?(anchor.x+anchors[index+1].x)/2:anchor.x+spacing/2;
    var width=right-left;
    if(!(width>0))return null;
    return {
      left:left,
      right:right,
      xs:[left+width/6,left+width/2,left+width*5/6]
    };
  }
  function dateColumns(dateAnchors,lines,firstCategoryY){
    var anchors=(Array.isArray(dateAnchors)?dateAnchors:[]).slice().sort(function(a,b){return a.x-b.x;});
    if(!anchors.length)return [];
    var groups=tripGroups(lines,firstCategoryY);
    var grid=regularDateGrid(anchors);
    return anchors.map(function(anchor,index){
      var prev=anchors[index-1],next=anchors[index+1];
      var left=prev?(prev.x+anchor.x)/2:(next?anchor.x-(next.x-anchor.x)/2:NaN);
      var right=next?(anchor.x+next.x)/2:(prev?anchor.x+(anchor.x-prev.x)/2:NaN);
      var nearestGroup=null,bestGroupDistance=Infinity;
      groups.forEach(function(group){
        var distance=Math.abs(group.x-anchor.x);
        if(distance<bestGroupDistance){bestGroupDistance=distance;nearestGroup=group;}
      });
      var tripXs=anchor.tripXs&&anchor.tripXs.length===3?anchor.tripXs.slice():(nearestGroup?nearestGroup.tripXs.slice():null);
      var layoutSource=tripXs?'trip-header':null;
      if(!tripXs&&grid){
        var derived=tripXsFromDateGrid(grid,index);
        if(derived){
          tripXs=derived.xs;
          left=derived.left;
          right=derived.right;
          layoutSource='date-grid';
        }
      }
      if(!tripXs||tripXs.length!==3||tripXs.some(function(value){return !Number.isFinite(value);}))return null;
      if(!Number.isFinite(left))left=Math.min.apply(null,tripXs)-Math.max(18,(tripXs[2]-tripXs[0])/4);
      if(!Number.isFinite(right))right=Math.max.apply(null,tripXs)+Math.max(18,(tripXs[2]-tripXs[0])/4);
      return {
        date:anchor.iso,
        x:anchor.x,
        left:left,
        right:right,
        tripXs:tripXs,
        approximate:!!anchor.approximate||!!(nearestGroup&&nearestGroup.approximate)||layoutSource==='date-grid',
        layoutSource:layoutSource
      };
    }).filter(Boolean);
  }
  function numericTextSequence(line){
    var text=normalizeText(line&&line.text),confidence=Number(line&&line.confidence),out=[],match;
    var rx=/(?:^|\s)(\d[\d,]*)(?=\s|$)/g;
    while((match=rx.exec(text))){
      var value=Number(match[1].replace(/,/g,''));
      if(Number.isSafeInteger(value)&&value>=0)out.push({value:value,confidence:Number.isFinite(confidence)?confidence:null,source:'line'});
    }
    return out;
  }
  function numericWordSequence(line){
    return (Array.isArray(line&&line.words)?line.words:[]).map(function(word){
      var value=wordNumber(word),confidence=Number(word&&word.confidence);
      return value===null?null:{value:value,confidence:Number.isFinite(confidence)?confidence:null,source:'word'};
    }).filter(Boolean);
  }
  function rowNumberSequence(line){
    var words=numericWordSequence(line),text=numericTextSequence(line);
    return text.length>words.length?text:words;
  }
  function numericWordCount(line){
    return rowNumberSequence(line).length;
  }
  function rowForCategory(lines,anchor,nextY,kind){
    var inRange=(Array.isArray(lines)?lines:[]).filter(function(line){
      var y=lineCenterY(line);
      return Number.isFinite(y)&&y>anchor.y&&(!Number.isFinite(nextY)||y<nextY);
    }).sort(function(a,b){return lineCenterY(a)-lineCenterY(b);});
    return inRange.find(function(line){return metricLabelKind(line&&line.text)===kind;})||null;
  }
  function mapRowCells(row,columns,category,field){
    if(!row)return [];
    var words=(Array.isArray(row.words)?row.words:[]).map(function(word){
      return {word:word,value:wordNumber(word),x:centerX(word.bbox),confidence:Number.isFinite(Number(word.confidence))?Number(word.confidence):null};
    }).filter(function(item){return item.value!==null&&Number.isFinite(item.x);});
    var byKey=new Map();
    words.forEach(function(item){
      var column=(columns||[]).find(function(candidate){return item.x>=candidate.left&&item.x<candidate.right;});
      if(!column)return;
      var trip=0,best=Infinity;
      column.tripXs.forEach(function(x,index){var distance=Math.abs(item.x-x);if(distance<best){best=distance;trip=index;}});
      if(category.activeTrips&&category.activeTrips[trip]===false)return;
      var key=column.date+'|'+trip+'|'+field,existing=byKey.get(key);
      if(!existing||((item.confidence==null?-1:item.confidence)>(existing.confidence==null?-1:existing.confidence))){
        byKey.set(key,{
          date:column.date,
          categoryId:category.id,
          categoryName:category.name,
          trip:trip+1,
          field:field,
          value:item.value,
          confidence:item.confidence,
          method:'bbox',
          geometryApproximate:!!column.approximate
        });
      }
    });
    var sequence=rowNumberSequence(row),expected=(columns||[]).length*3;
    if(expected>0&&sequence.length===expected){
      var positioned=Array.from(byKey.values());
      var consistent=positioned.every(function(cell){
        var columnIndex=(columns||[]).findIndex(function(column){return column.date===cell.date;});
        if(columnIndex<0)return false;
        var item=sequence[columnIndex*3+(cell.trip-1)];
        return !!item&&item.value===cell.value;
      });
      if(consistent){
        (columns||[]).forEach(function(column,columnIndex){
          for(var trip=0;trip<3;trip++){
            if(category.activeTrips&&category.activeTrips[trip]===false)continue;
            var key=column.date+'|'+trip+'|'+field;
            if(byKey.has(key))continue;
            var item=sequence[columnIndex*3+trip];
            if(!item)continue;
            byKey.set(key,{
              date:column.date,
              categoryId:category.id,
              categoryName:category.name,
              trip:trip+1,
              field:field,
              value:item.value,
              confidence:item.confidence,
              fallback:true,
              method:'line-sequence',
              geometryApproximate:!!column.approximate
            });
          }
        });
      }
    }
    return Array.from(byKey.values());
  }
  function buildMultiDayData(lines,categories,referenceDate){
    lines=Array.isArray(lines)?lines:[];
    var catAnchors=categoryAnchors(lines,categories);
    var firstCategoryY=catAnchors.length?catAnchors[0].y:NaN;
    var groups=tripGroups(lines,firstCategoryY);
    var directDateAnchors=spatialDateAnchors(lines,referenceDate);
    var rowDates=dateSequenceFromLines(lines,referenceDate);
    var fallbackDates=extractDateCandidates(lines.map(function(line){return line.text;}).join('\n'),referenceDate);
    var dateAnchors=directDateAnchors.slice();
    if(rowDates.length&&groups.length&&rowDates.length===groups.length&&directDateAnchors.length!==groups.length){
      dateAnchors=groups.map(function(group,index){
        var exact=directDateAnchors.find(function(anchor){return anchor.iso===rowDates[index].iso;});
        if(exact)return Object.assign({},exact,{x:group.x,tripXs:group.tripXs.slice(),approximate:!!group.approximate});
        return {iso:rowDates[index].iso,x:group.x,y:group.y,raw:rowDates[index].raw,confidence:null,lineIndex:group.lineIndex,approximate:true,tripXs:group.tripXs.slice()};
      });
    }
    var dates=(dateAnchors.length?dateAnchors.map(function(anchor){return anchor.iso;}):fallbackDates.map(function(item){return item.iso;}));
    dates=Array.from(new Set(dates)).sort();
    var columns=dateColumns(dateAnchors,lines,firstCategoryY);
    var cells=[];
    catAnchors.forEach(function(category,index){
      var next=catAnchors[index+1],nextY=next?next.y:Infinity;
      var delivery=rowForCategory(lines,category,nextY,'delivery');
      var sales=rowForCategory(lines,category,nextY,'sales');
      cells.push.apply(cells,mapRowCells(delivery,columns,category,'delivery'));
      cells.push.apply(cells,mapRowCells(sales,columns,category,'sales'));
    });
    return {
      dates:dates,
      categories:catAnchors.map(function(category){return {id:category.id,name:category.name,activeTrips:category.activeTrips.slice()};}),
      cells:cells,
      spatial:dateAnchors.length>0&&columns.length>0,
      warnings:[
        !dateAnchors.length?'日付列の位置を確定できませんでした。画面全体が入るように撮影してください':null,
        dateAnchors.length&&!catAnchors.length?'登録カテゴリーの位置を確定できませんでした':null,
        dateAnchors.length&&catAnchors.length&&!cells.length?'納品数・販売数の位置を確定できませんでした':null
      ].filter(Boolean)
    };
  }
  function consensusMultiDayResults(results){
    results=(Array.isArray(results)?results:[]).filter(Boolean);
    var dates=new Set(),categories=new Map(),groups=new Map(),warnings=[],disagreements=0,rejected=0;
    results.forEach(function(result,resultIndex){
      (result.dates||[]).forEach(function(date){dates.add(date);});
      (result.categories||[]).forEach(function(category){if(category&&category.id&&!categories.has(category.id))categories.set(category.id,category);});
      (result.warnings||[]).forEach(function(warning){warnings.push('OCR'+(resultIndex+1)+': '+warning);});
      (result.cells||[]).forEach(function(cell){
        var key=[cell.date,cell.categoryId,cell.trip,cell.field].join('|');
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(Object.assign({passIndex:resultIndex},cell));
      });
    });
    var cells=[];
    groups.forEach(function(candidates){
      var values=new Map();
      candidates.forEach(function(cell){
        var key=String(cell.value);
        if(!values.has(key))values.set(key,[]);
        values.get(key).push(cell);
      });
      var agreed=Array.from(values.values()).filter(function(items){return items.length>=2;}).sort(function(a,b){return b.length-a.length;})[0]||null;
      var chosen=null;
      if(agreed){
        var minConf=agreed.map(function(cell){return Number(cell.confidence);}).filter(Number.isFinite);
        var confidence=minConf.length?Math.min.apply(null,minConf):null;
        if(confidence===null||confidence>=75){
          chosen=Object.assign({},agreed[0],{confidence:confidence,consensus:true});
        }else rejected++;
      }else if(values.size>1){
        disagreements++;
      }else if(candidates.length===1){
        var only=candidates[0],conf=Number(only.confidence);
        if(only.method==='bbox'&&!only.geometryApproximate&&Number.isFinite(conf)&&conf>=96){
          chosen=Object.assign({},only,{consensus:false,strongSingle:true});
        }else rejected++;
      }else rejected++;
      if(chosen)cells.push(chosen);
    });
    if(disagreements)warnings.push('OCR方式間で値が一致しない '+disagreements+'項目は空欄にしました');
    if(rejected)warnings.push('信頼度または位置情報が不足した '+rejected+'項目は空欄にしました');
    return {
      dates:Array.from(dates).sort(),
      categories:Array.from(categories.values()),
      cells:cells,
      spatial:results.some(function(result){return result.spatial;}),
      warnings:Array.from(new Set(warnings))
    };
  }
  function shouldRunThirdPass(results,consensus){
    results=(Array.isArray(results)?results:[]).filter(Boolean);
    var best=results.reduce(function(max,result){return Math.max(max,(result.cells||[]).length);},0);
    var agreed=consensus&&Array.isArray(consensus.cells)?consensus.cells.length:0;
    return best>agreed;
  }
  function mergeMultiDayResults(results){
    var dates=new Set(),categories=new Map(),cells=new Map(),warnings=[];
    (Array.isArray(results)?results:[]).forEach(function(result,resultIndex){
      if(!result)return;
      (result.dates||[]).forEach(function(date){dates.add(date);});
      (result.categories||[]).forEach(function(category){if(category&&category.id&&!categories.has(category.id))categories.set(category.id,category);});
      (result.warnings||[]).forEach(function(warning){warnings.push('画像 '+(resultIndex+1)+': '+warning);});
      (result.cells||[]).forEach(function(cell){
        var key=[cell.date,cell.categoryId,cell.trip,cell.field].join('|');
        if(!cells.has(key))cells.set(key,{date:cell.date,categoryId:cell.categoryId,categoryName:cell.categoryName,trip:cell.trip,field:cell.field,values:[],confidences:[],sources:0});
        var merged=cells.get(key);
        merged.sources++;
        if(merged.values.indexOf(cell.value)<0)merged.values.push(cell.value);
        if(Number.isFinite(Number(cell.confidence)))merged.confidences.push(Number(cell.confidence));
      });
    });
    var mergedCells=Array.from(cells.values()).map(function(cell){
      var unique=cell.values.slice(),conf=cell.confidences.length?Math.min.apply(null,cell.confidences):null;
      return Object.assign(cell,{
        conflict:unique.length>1,
        value:unique.length===1?unique[0]:null,
        confidence:conf,
        needsReview:unique.length>1||(conf!==null&&conf<70)
      });
    }).sort(function(a,b){
      return a.date.localeCompare(b.date)||a.categoryName.localeCompare(b.categoryName)||a.trip-b.trip||a.field.localeCompare(b.field);
    });
    return {
      dates:Array.from(dates).sort(),
      categories:Array.from(categories.values()),
      cells:mergedCells,
      warnings:Array.from(new Set(warnings)),
      reviewCount:mergedCells.filter(function(cell){return cell.needsReview;}).length
    };
  }

  function localOcrAssets(baseHref){
    var base=new URL('./vendor/ocr/',baseHref);
    return {
      base:base.href,
      workerPath:new URL('worker.min.js',base).href,
      corePath:base.href.replace(/\/$/,''),
      langPath:new URL('lang',base).href.replace(/\/$/,'')
    };
  }

  var model={
    VERSION:8,
    MAX_FILES:MAX_FILES,
    MAX_FILE_BYTES:MAX_FILE_BYTES,
    POLICY:POLICY,
    OCR_POLICY:OCR_POLICY,
    periodBounds:periodBounds,
    defaultTargetDate:defaultTargetDate,
    isImageFile:isImageFile,
    fileIssue:fileIssue,
    normalizeText:normalizeText,
    extractLayout:extractLayout,
    extractDateCandidates:extractDateCandidates,
    evaluateTargetDate:evaluateTargetDate,
    extractNumberCandidates:extractNumberCandidates,
    matchCategories:matchCategories,
    detectLabels:detectLabels,
    analyzeOcrData:analyzeOcrData,
    buildMultiDayData:buildMultiDayData,
    consensusMultiDayResults:consensusMultiDayResults,
    shouldRunThirdPass:shouldRunThirdPass,
    mergeMultiDayResults:mergeMultiDayResults,
    spatialDateAnchors:spatialDateAnchors,
    tripGroups:tripGroups,
    expandDateAnchorsWithTrips:expandDateAnchorsWithTrips,
    localOcrAssets:localOcrAssets
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=model;
  root.InsightSalesCountCamera=model;
  if(!root.document)return;

  var doc=root.document;
  var session={targetDate:'',items:[],processing:false,engineStatus:''};
  var dialog=null,list=null,status=null,ocrStatus=null,resultsBox=null,dateInput=null,cameraInput=null,libraryInput=null;
  var nextId=1;

  function salesApi(){return root.InsightSalesCount;}
  function getPeriod(){
    var api=salesApi();
    return api&&typeof api.getPeriod==='function'?api.getPeriod():null;
  }
  function storesState(){
    try{if(typeof allStores!=='undefined')return allStores;}catch(_){}
    return root.allStores||null;
  }
  function categories(){
    var all=storesState();
    return all&&all.salesCountManagement&&Array.isArray(all.salesCountManagement.categories)?all.salesCountManagement.categories:[];
  }
  function summary(){
    var done=0,errors=0,matchedIds=new Set(),numberCount=0;
    session.items.forEach(function(item){
      if(item.ocr&&item.ocr.status==='done'){
        done++;
        (item.ocr.matchedCategories||[]).forEach(function(category){matchedIds.add(category.id);});
        numberCount+=(item.ocr.numberCandidates||[]).length;
      }else if(item.ocr&&item.ocr.status==='error')errors++;
    });
    var merged=mergeMultiDayResults(session.items.filter(function(item){return item.ocr&&item.ocr.status==='done';}).map(function(item){return item.ocr.multiDay;}));
    return {
      targetDate:session.targetDate,
      referenceDate:session.targetDate,
      count:session.items.length,
      totalBytes:session.items.reduce(function(sum,item){return sum+item.file.size;},0),
      names:session.items.map(function(item){return item.file.name||'';}),
      processing:session.processing,
      ocrDone:done,
      ocrErrors:errors,
      ocrPending:Math.max(0,session.items.length-done-errors),
      matchedCategories:matchedIds.size,
      numberCandidates:numberCount,
      detectedDates:merged.dates.length,
      structuredCells:merged.cells.length,
      reviewCount:merged.reviewCount
    };
  }
  function revoke(item){
    if(item&&item.url){
      try{root.URL.revokeObjectURL(item.url);}catch(_){}
      item.url='';
    }
  }
  function clearItems(){
    if(session.processing)return summary();
    session.items.forEach(revoke);
    session.items=[];
    session.engineStatus='';
    renderItems();
    return summary();
  }
  function resetSession(){
    session.processing=false;
    clearItems();
    session.targetDate='';
    session.engineStatus='';
    if(cameraInput)cameraInput.value='';
    if(libraryInput)libraryInput.value='';
  }
  function addFiles(files){
    if(session.processing)return summary();
    var incoming=Array.prototype.slice.call(files||[]);
    var errors=[];
    incoming.forEach(function(file){
      if(session.items.length>=MAX_FILES){errors.push('画像は1回につき最大12枚です。');return;}
      var issue=fileIssue(file);
      if(issue){errors.push(issue);return;}
      var url='';
      try{url=root.URL.createObjectURL(file);}catch(_){}
      session.items.push({id:nextId++,file:file,url:url,ocr:null});
    });
    renderItems();
    if(errors.length)alert(Array.from(new Set(errors)).join('\n'));
    return summary();
  }
  function removeItem(id){
    if(session.processing)return false;
    var index=session.items.findIndex(function(item){return item.id===Number(id);});
    if(index<0)return false;
    revoke(session.items[index]);
    session.items.splice(index,1);
    renderItems();
    return true;
  }
  function currentBounds(){
    return periodBounds(getPeriod());
  }
  function updateTargetDate(){
    if(!dateInput)return;
    var bounds=currentBounds();
    if(!bounds)return;
    dateInput.min=bounds.min;
    dateInput.max=bounds.max;
    session.targetDate=defaultTargetDate(getPeriod());
    dateInput.value=session.targetDate;
  }
  function refreshDateMatches(){
    session.items.forEach(function(item){
      if(!item.ocr||item.ocr.status!=='done')return;
      item.ocr.dateCandidates=extractDateCandidates(item.ocr.text,session.targetDate);
      item.ocr.targetDateMatched=evaluateTargetDate(item.ocr.dateCandidates,session.targetDate);
      if(Array.isArray(item.ocr.passes)&&item.ocr.passes.length){
        item.ocr.passes.forEach(function(pass){
          pass.dateCandidates=extractDateCandidates(pass.text,session.targetDate);
          pass.targetDateMatched=evaluateTargetDate(pass.dateCandidates,session.targetDate);
          pass.multiDay=buildMultiDayData(pass.lines,categories(),session.targetDate);
        });
        item.ocr.multiDay=consensusMultiDayResults(item.ocr.passes.map(function(pass){return pass.multiDay;}));
      }else item.ocr.multiDay=buildMultiDayData(item.ocr.lines,categories(),session.targetDate);
    });
  }
  function renderControls(){
    if(!dialog)return;
    var processing=session.processing,hasItems=session.items.length>0;
    ['#scCameraShoot','#scCameraLibrary','#scCameraClear','#scCameraRead'].forEach(function(selector){
      var button=dialog.querySelector(selector);
      if(!button)return;
      if(selector==='#scCameraClear'||selector==='#scCameraRead')button.disabled=processing||!hasItems;
      else button.disabled=processing;
    });
    if(dateInput)dateInput.disabled=processing;
    dialog.querySelectorAll('.sc-camera-remove').forEach(function(button){button.disabled=processing;});
  }
  function itemStatus(item){
    if(!item.ocr)return '未読取';
    if(item.ocr.status==='processing')return '読取中 '+Math.round((item.ocr.progress||0)*100)+'%';
    if(item.ocr.status==='error')return 'OCR失敗';
    if(item.ocr.status==='done'){var multi=item.ocr.multiDay||{dates:[],categories:[],cells:[]};return '完了: '+multi.dates.length+'日 / '+multi.categories.length+'カテゴリー / '+multi.cells.length+'項目';}
    return '未読取';
  }
  function valueLabel(cell){
    if(!cell)return '—';
    if(cell.conflict)return '⚠ '+cell.values.join(' / ');
    return String(cell.value);
  }
  function renderResults(){
    if(!resultsBox)return;
    resultsBox.replaceChildren();
    var merged=mergeMultiDayResults(session.items.filter(function(item){return item.ocr&&item.ocr.status==='done';}).map(function(item){return item.ocr.multiDay;}));
    if(!merged.dates.length&&!merged.cells.length)return;
    var head=doc.createElement('div');
    head.className='sc-camera-result-head';
    head.textContent='読取結果：'+merged.dates.length+'日 / '+merged.categories.length+'カテゴリー / '+merged.cells.length+'項目'+(merged.reviewCount?' / 要確認 '+merged.reviewCount+'件':'');
    resultsBox.append(head);
    if(merged.warnings.length){
      var warnings=doc.createElement('div');
      warnings.className='sc-camera-result-warnings';
      merged.warnings.forEach(function(message){var p=doc.createElement('div');p.textContent=message;warnings.append(p);});
      resultsBox.append(warnings);
    }
    merged.dates.forEach(function(date){
      var day=doc.createElement('section');
      day.className='sc-camera-result-day';
      var title=doc.createElement('h3');
      title.textContent=date.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1/$2/$3');
      day.append(title);
      var categoryIds=Array.from(new Set(merged.cells.filter(function(cell){return cell.date===date;}).map(function(cell){return cell.categoryId;})));
      if(!categoryIds.length){
        var empty=doc.createElement('p');empty.className='sc-camera-result-empty';empty.textContent='日付は認識しましたが、納品数・販売数の位置を確定できませんでした。';day.append(empty);
      }
      categoryIds.forEach(function(categoryId){
        var category=merged.categories.find(function(item){return item.id===categoryId;})||{id:categoryId,name:categoryId,activeTrips:[true,true,true]};
        var block=doc.createElement('div');block.className='sc-camera-result-category';
        var name=doc.createElement('strong');name.textContent=category.name;block.append(name);
        var grid=doc.createElement('div');grid.className='sc-camera-result-grid';
        ['','1便','2便','3便'].forEach(function(label){var node=doc.createElement('span');node.className='sc-camera-result-label';node.textContent=label;grid.append(node);});
        ['delivery','sales'].forEach(function(field){
          var rowLabel=doc.createElement('span');rowLabel.className='sc-camera-result-label';rowLabel.textContent=field==='delivery'?'納品':'販売';grid.append(rowLabel);
          [1,2,3].forEach(function(trip){
            var cell=merged.cells.find(function(item){return item.date===date&&item.categoryId===categoryId&&item.trip===trip&&item.field===field;});
            var node=doc.createElement('span');
            node.className='sc-camera-result-value'+(cell&&cell.needsReview?' needs-review':'');
            if(category.activeTrips&&category.activeTrips[trip-1]===false){node.textContent='ー';node.classList.add('not-applicable');}
            else node.textContent=valueLabel(cell);
            grid.append(node);
          });
        });
        block.append(grid);day.append(block);
      });
      resultsBox.append(day);
    });
  }
  function renderItems(){
    if(!list||!status)return;
    list.replaceChildren();
    if(!session.items.length){
      var empty=doc.createElement('div');
      empty.className='sc-camera-empty';
      empty.textContent='まだ画像は追加されていません。';
      list.append(empty);
    }else{
      session.items.forEach(function(item,index){
        var row=doc.createElement('div');
        row.className='sc-camera-item';
        var thumb=doc.createElement('div');
        thumb.className='sc-camera-thumb';
        if(item.url){
          var img=doc.createElement('img');
          img.src=item.url;
          img.alt='撮影画像 '+String(index+1);
          thumb.append(img);
        }
        var meta=doc.createElement('div');
        meta.className='sc-camera-meta';
        var title=doc.createElement('strong');
        title.textContent='撮影画像 '+String(index+1);
        var size=doc.createElement('span');
        size.textContent=(item.file.size/1024/1024).toFixed(1)+' MB';
        var state=doc.createElement('span');
        state.className='sc-camera-ocr-state '+(item.ocr&&item.ocr.status==='error'?'is-error':'');
        state.textContent=itemStatus(item);
        meta.append(title,size,state);
        var remove=doc.createElement('button');
        remove.type='button';
        remove.className='sc-camera-remove';
        remove.textContent='削除';
        remove.setAttribute('aria-label','撮影画像 '+String(index+1)+' を削除');
        remove.onclick=function(){removeItem(item.id);};
        row.append(thumb,meta,remove);
        list.append(row);
      });
    }
    var result=summary();
    status.textContent='撮影済み '+String(session.items.length)+' / '+String(MAX_FILES)+'枚';
    if(ocrStatus){
      if(session.processing)ocrStatus.textContent=session.engineStatus||'OCR処理中…';
      else if(result.ocrDone||result.ocrErrors)ocrStatus.textContent='OCR完了 '+result.ocrDone+'件 / エラー '+result.ocrErrors+'件 / 検出日 '+result.detectedDates+'日 / 構造化 '+result.structuredCells+'項目';
      else ocrStatus.textContent='OCRはまだ実行していません';
    }
    renderResults();
    renderControls();
  }
  function requestClose(){
    if(session.processing){alert('画像を読み取り中です。完了してから閉じてください。');return;}
    if(session.items.length&&!confirm('撮影済み画像とOCR結果を破棄して閉じますか？'))return;
    if(dialog&&dialog.open)dialog.close();
  }
  function closeAndClear(){
    resetSession();
    if(dialog&&dialog.parentNode)dialog.remove();
    dialog=null;list=null;status=null;ocrStatus=null;resultsBox=null;dateInput=null;cameraInput=null;libraryInput=null;
  }
  function ocrOptions(logger){
    var assets=localOcrAssets(doc.baseURI||root.location.href);
    return {
      workerPath:assets.workerPath,
      corePath:assets.corePath,
      langPath:assets.langPath,
      cacheMethod:'none',
      workerBlobURL:false,
      logger:logger
    };
  }
  async function readImages(){
    if(session.processing||!session.items.length)return summary();
    if(!root.Tesseract||typeof root.Tesseract.createWorker!=='function'){
      alert('ローカルOCRを初期化できませんでした。');
      return summary();
    }
    session.processing=true;
    session.engineStatus='OCRエンジンを準備中…';
    session.items.forEach(function(item){item.ocr=null;});
    renderItems();

    var activeItem=null,worker=null;
    try{
      var options=ocrOptions(function(message){
        if(activeItem&&activeItem.ocr&&activeItem.ocr.status==='processing'&&message&&Number.isFinite(Number(message.progress))){
          activeItem.ocr.progress=Math.max(0,Math.min(1,Number(message.progress)));
        }else if(message&&message.status){
          session.engineStatus=String(message.status);
        }
        renderItems();
      });
      worker=await root.Tesseract.createWorker('jpn',1,options);
      if(worker&&typeof worker.setParameters==='function'){
        var psm=root.Tesseract.PSM&&root.Tesseract.PSM.SPARSE_TEXT!=null?root.Tesseract.PSM.SPARSE_TEXT:'11';
        await worker.setParameters({tessedit_pageseg_mode:psm,preserve_interword_spaces:'1'});
      }
      for(var i=0;i<session.items.length;i++){
        activeItem=session.items[i];
        activeItem.ocr={status:'processing',progress:0};
        session.engineStatus='画像 '+(i+1)+' / '+session.items.length+' を読み取り中';
        renderItems();
        try{
          session.engineStatus='画像 '+(i+1)+' / '+session.items.length+' を1回目解析中';
          renderItems();
          var result=await worker.recognize(activeItem.file,{rotateAuto:true},{text:true,blocks:true});
          var firstAnalyzed=analyzeOcrData(result&&result.data||{},categories(),session.targetDate);
          firstAnalyzed.multiDay=buildMultiDayData(firstAnalyzed.lines,categories(),session.targetDate);

          session.engineStatus='画像 '+(i+1)+' / '+session.items.length+' を2回目解析中';
          renderItems();
          var blockPsm=root.Tesseract.PSM&&root.Tesseract.PSM.SINGLE_BLOCK!=null?root.Tesseract.PSM.SINGLE_BLOCK:'6';
          await worker.setParameters({tessedit_pageseg_mode:blockPsm,preserve_interword_spaces:'1'});
          var retryResult=await worker.recognize(activeItem.file,{rotateAuto:true},{text:true,blocks:true});
          var secondAnalyzed=analyzeOcrData(retryResult&&retryResult.data||{},categories(),session.targetDate);
          secondAnalyzed.multiDay=buildMultiDayData(secondAnalyzed.lines,categories(),session.targetDate);

          var passes=[firstAnalyzed,secondAnalyzed];
          var consensus=consensusMultiDayResults(passes.map(function(pass){return pass.multiDay;}));

          if(shouldRunThirdPass(passes.map(function(pass){return pass.multiDay;}),consensus)){
            session.engineStatus='画像 '+(i+1)+' / '+session.items.length+' を3回目解析中';
            renderItems();
            var autoPsm=root.Tesseract.PSM&&root.Tesseract.PSM.AUTO!=null?root.Tesseract.PSM.AUTO:'3';
            await worker.setParameters({tessedit_pageseg_mode:autoPsm,preserve_interword_spaces:'1'});
            var thirdResult=await worker.recognize(activeItem.file,{rotateAuto:true},{text:true,blocks:true});
            var thirdAnalyzed=analyzeOcrData(thirdResult&&thirdResult.data||{},categories(),session.targetDate);
            thirdAnalyzed.multiDay=buildMultiDayData(thirdAnalyzed.lines,categories(),session.targetDate);
            passes.push(thirdAnalyzed);
            consensus=consensusMultiDayResults(passes.map(function(pass){return pass.multiDay;}));
          }

          var bestAnalyzed=passes.slice().sort(function(a,b){
            var aScore=(a.dateCandidates||[]).length*10+(a.matchedCategories||[]).length+(a.multiDay&&a.multiDay.cells?a.multiDay.cells.length:0);
            var bScore=(b.dateCandidates||[]).length*10+(b.matchedCategories||[]).length+(b.multiDay&&b.multiDay.cells?b.multiDay.cells.length:0);
            return bScore-aScore;
          })[0]||firstAnalyzed;
          var analyzed=Object.assign({},bestAnalyzed,{
            passes:passes,
            multiDay:consensus
          });
          var sparsePsm=root.Tesseract.PSM&&root.Tesseract.PSM.SPARSE_TEXT!=null?root.Tesseract.PSM.SPARSE_TEXT:'11';
          await worker.setParameters({tessedit_pageseg_mode:sparsePsm,preserve_interword_spaces:'1'});
          activeItem.ocr=Object.assign({status:'done',progress:1},analyzed);
        }catch(error){
          activeItem.ocr={status:'error',progress:0,error:error&&error.message?String(error.message):String(error)};
        }
        renderItems();
      }
      session.engineStatus='OCR処理が完了しました';
    }catch(error){
      session.engineStatus='OCRエンジンを初期化できませんでした';
      session.items.forEach(function(item){
        if(!item.ocr||item.ocr.status==='processing')item.ocr={status:'error',progress:0,error:error&&error.message?String(error.message):String(error)};
      });
      alert('画像を読み取れませんでした。\n'+(error&&error.message?error.message:error));
    }finally{
      activeItem=null;
      if(worker&&typeof worker.terminate==='function'){try{await worker.terminate();}catch(_){}}
      session.processing=false;
      renderItems();
    }
    return summary();
  }
  function ensureDialog(){
    if(dialog&&dialog.isConnected)return;
    dialog=doc.createElement('dialog');
    dialog.id='scCameraDialog';
    dialog.className='sc-dialog sc-camera-dialog';
    dialog.innerHTML=
      '<header><div><h2>カメラ読取</h2><p>画面内の複数日をまとめて端末内で読み取ります。</p></div><button type="button" id="scCameraClose">閉じる</button></header>'+
      '<section class="sc-camera-body">'+
        '<label class="sc-camera-date" id="scCameraDateLabel">基準日（年判定用） <input id="scCameraDate" type="date"></label>'+
        '<p class="sc-camera-note">基準日は年を判定するためだけに使います。この日だけに限定せず、画像内の複数日をまとめて読み取ります。画像は外部OCRサービスへ送信せず、結果もこの画面を閉じるまでメモリ上だけで保持します。</p>'+
        '<div class="sc-camera-actions">'+
          '<button type="button" id="scCameraShoot">カメラで撮影</button>'+
          '<button type="button" id="scCameraLibrary">写真から追加</button>'+
          '<button type="button" id="scCameraClear" disabled>全て削除</button>'+
        '</div>'+
        '<input id="scCameraCapture" type="file" accept="image/*" capture="environment" hidden>'+
        '<input id="scCameraFiles" type="file" accept="image/*" multiple hidden>'+
        '<div class="sc-camera-summary"><strong id="scCameraStatus"></strong><span>外部OCR送信なし・自動保存なし</span></div>'+
        '<div id="scCameraList" class="sc-camera-list"></div>'+
        '<div id="scCameraOcrStatus" class="sc-camera-ocr-summary">OCRはまだ実行していません</div>'+
        '<div id="scCameraResults" class="sc-camera-results"></div>'+
        '<div class="sc-camera-next"><button id="scCameraRead" type="button" disabled>画像を読み取る</button></div>'+
      '</section>';
    doc.body.append(dialog);

    list=dialog.querySelector('#scCameraList');
    status=dialog.querySelector('#scCameraStatus');
    ocrStatus=dialog.querySelector('#scCameraOcrStatus');
    resultsBox=dialog.querySelector('#scCameraResults');
    dateInput=dialog.querySelector('#scCameraDate');
    cameraInput=dialog.querySelector('#scCameraCapture');
    libraryInput=dialog.querySelector('#scCameraFiles');

    dialog.querySelector('#scCameraClose').onclick=requestClose;
    dialog.querySelector('#scCameraShoot').onclick=function(){cameraInput.click();};
    dialog.querySelector('#scCameraLibrary').onclick=function(){libraryInput.click();};
    dialog.querySelector('#scCameraClear').onclick=function(){
      if(session.processing||!session.items.length)return;
      if(confirm('撮影済み画像とOCR結果をすべて削除しますか？'))clearItems();
    };
    dialog.querySelector('#scCameraRead').onclick=readImages;
    cameraInput.onchange=function(){addFiles(cameraInput.files);cameraInput.value='';};
    libraryInput.onchange=function(){addFiles(libraryInput.files);libraryInput.value='';};
    dateInput.onchange=function(){
      var bounds=currentBounds(),value=dateInput.value;
      if(!bounds||value<bounds.min||value>bounds.max){
        session.targetDate=defaultTargetDate(getPeriod());
        dateInput.value=session.targetDate;
        alert('基準日は表示中の月から選択してください。');
        refreshDateMatches();
        renderItems();
        return;
      }
      session.targetDate=value;
      refreshDateMatches();
      renderItems();
    };
    dialog.addEventListener('cancel',function(event){event.preventDefault();requestClose();});
    dialog.addEventListener('close',closeAndClear);
  }
  function open(){
    ensureDialog();
    resetSession();
    updateTargetDate();
    renderItems();
    dialog.showModal();
    return summary();
  }
  function ensureButton(){
    var toolbar=doc.querySelector('#pageSalesCount .sc-toolbar');
    if(!toolbar||doc.getElementById('scCameraOpen'))return;
    var button=doc.createElement('button');
    button.id='scCameraOpen';
    button.type='button';
    button.className='sc-camera-open';
    button.setAttribute('aria-label','カメラ読取');
    button.title='カメラ読取';
    button.innerHTML='<svg class="sc-camera-open-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l1.4-2h3.2L15 5h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3z"/><circle cx="12" cy="12" r="3.5"/></svg>';
    button.onclick=open;
    toolbar.append(button);
  }
  function init(){
    if(!salesApi()){setTimeout(init,0);return;}
    ensureButton();
  }

  var style=doc.createElement('style');
  style.id='scCameraStyle';
  style.textContent=
    '.sc-camera-open{width:40px;height:40px;min-width:40px;padding:0!important;display:inline-flex;align-items:center;justify-content:center}.sc-camera-open-icon{width:21px;height:21px;display:block}'+
    '.sc-camera-dialog{width:min(720px,calc(100vw - 24px))}.sc-camera-dialog header p{margin:3px 0 0;font-size:11px;color:var(--text4)}'+
    '.sc-camera-body{padding-top:14px}.sc-camera-date{display:flex;align-items:center;gap:9px;font-size:13px;font-weight:700}.sc-camera-date input{min-width:170px}'+
    '.sc-camera-note{margin:12px 0;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface2);font-size:11px;line-height:1.6;color:var(--text3)}'+
    '.sc-camera-actions{display:flex;gap:8px;flex-wrap:wrap}.sc-camera-actions button{min-height:40px}.sc-camera-summary{display:flex;justify-content:space-between;gap:10px;margin:14px 0 8px;font-size:11px;color:var(--text3)}'+
    '.sc-camera-list{display:grid;gap:8px}.sc-camera-empty{padding:22px;border:1px dashed var(--border);border-radius:10px;text-align:center;color:var(--text4);font-size:12px}'+
    '.sc-camera-item{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:11px;background:var(--surface2)}'+
    '.sc-camera-thumb{width:76px;height:58px;border-radius:8px;overflow:hidden;background:var(--input-bg)}.sc-camera-thumb img{width:100%;height:100%;object-fit:cover;display:block}'+
    '.sc-camera-meta{display:flex;flex-direction:column;gap:4px;min-width:0}.sc-camera-meta strong{font-size:12px}.sc-camera-meta span{font-size:10px;color:var(--text4)}'+
    '.sc-camera-ocr-state.is-error,.sc-camera-warning{color:#b45309!important;font-weight:700}.sc-camera-ocr-summary{margin-top:10px;padding:9px 11px;border-radius:9px;background:var(--surface2);font-size:11px;color:var(--text3)}'+
    '.sc-camera-remove{min-width:58px}.sc-camera-next{margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:flex-end}.sc-camera-next button{min-height:40px}.sc-camera-next button:disabled{opacity:.5}.sc-camera-results{margin-top:12px;display:grid;gap:10px}.sc-camera-result-head{font-size:12px;font-weight:800;padding:10px 12px;border-radius:10px;background:var(--surface2);border:1px solid var(--border)}.sc-camera-result-warnings{font-size:11px;line-height:1.6;color:#b45309}.sc-camera-result-day{border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--surface2)}.sc-camera-result-day h3{margin:0 0 8px;font-size:13px}.sc-camera-result-category+.sc-camera-result-category{margin-top:10px;padding-top:10px;border-top:1px solid var(--border)}.sc-camera-result-category>strong{display:block;font-size:12px;margin-bottom:6px}.sc-camera-result-grid{display:grid;grid-template-columns:54px repeat(3,minmax(52px,1fr));gap:4px;align-items:center}.sc-camera-result-label,.sc-camera-result-value{font-size:11px;text-align:center;padding:6px 3px;border-radius:7px}.sc-camera-result-label{color:var(--text4);font-weight:700}.sc-camera-result-value{background:var(--surface);border:1px solid var(--border);font-weight:800}.sc-camera-result-value.needs-review{border-color:#f59e0b;color:#b45309}.sc-camera-result-value.not-applicable{background:var(--input-bg);color:var(--text4)}.sc-camera-result-empty{margin:0;font-size:11px;color:var(--text4)}'+
    '@media(max-width:600px){.sc-camera-summary{flex-direction:column}.sc-camera-item{grid-template-columns:64px minmax(0,1fr) auto}.sc-camera-thumb{width:64px;height:50px}}';
  doc.head.append(style);

  model.open=open;
  model.close=requestClose;
  model.clear=clearItems;
  model.addFiles=addFiles;
  model.removeItem=removeItem;
  model.readImages=readImages;
  model.getSessionSummary=summary;
  model.getMultiDayResults=function(){return mergeMultiDayResults(session.items.filter(function(item){return item.ocr&&item.ocr.status==='done';}).map(function(item){return item.ocr.multiDay;}));};

  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init);else setTimeout(init,0);
})(typeof window!=='undefined'?window:globalThis);
