/* Draft-only IndexedDB session for monthly input screens. */
(function(root){
  'use strict';

  let connectedType=null,connectedStatus=null,allowConnectedNavigation=null,allowConnectedPeriod=null;
  const screens={
    sales:{route:2,button:'salesSaveBtn',notice:'savedSales',label:'売上'},
    kyaku:{route:3,button:'kyakuSaveBtn',notice:'savedKyaku',label:'客数'},
    haiki:{route:4,button:'haikiSaveBtn',notice:'savedHaiki',label:'廃棄'}
  };
  const sidebarRoutes={
    nav0:0,nav1:1,nav2:2,nav3:3,nav4:4,navSalesCount:'salesCounts',navSaleResults:'saleResults'
  };

  async function connect(type='sales',{followInputScreens=false,followQuickInput=false}={}){
    if(connectedStatus||root.InsightIndexedDBQuickInputPreviewV1?.getStatus())
      throw new Error('An input preview is already connected');
    let screen=screens[type];
    if(!screen||(followQuickInput
      ?!followInputScreens||currentNav!==0||!root.InsightIndexedDBQuickInputPreviewV1
      :currentNav!==screen.route))throw new Error('Open the corresponding input screen first');
    const doc=root.document;
    function controlsFor(screen){
      const button=doc.getElementById(screen.button);
      const notice=doc.getElementById(screen.notice);
      if(!button||!notice)throw new Error('The input controls are unavailable');
      const status=doc.createElement('p');
      status.setAttribute('role','status');
      button.parentNode.insertBefore(status,button.nextSibling);
      return {button,notice,status};
    }

    const api=root.InsightIndexedDBStorageV1;
    const state={storeId:allStores.current,committed:await api.read(),busy:false,held:false,pending:false};
    const quick=followQuickInput
      ?await root.InsightIndexedDBQuickInputPreviewV1.connect({sharedState:state}):null;
    let target=displayedPeriod();
    function matchesPeriod(){
      return currentNav===screen.route&&allStores.current===target.storeId&&
        editYear[type]===target.year&&editMonth[type]===target.month;
    }
    function matchesScreen(){
      return matchesPeriod()&&
        root.InsightStorage.serialize(allStores)===root.InsightStorage.serialize(state.committed.snapshot);
    }
    function displayedPeriod(){
      return {storeId:allStores.current,year:editYear[type],month:editMonth[type]};
    }
    function rows(snapshot,storeId,period=target){
      return snapshot.stores[storeId]?.data?.[period.year]?.[period.month];
    }
    function collectNumber(fields,key,draft,before,integer=true){
      const value=Number(draft?.[key]??0);
      if(value<0||!Number.isFinite(value)||(integer&&!Number.isSafeInteger(value)))
        throw new Error('Month input value is invalid');
      if(value!==Number(before?.[key]??0))fields[key]=value;
    }
    function changes(period=target){
      const saved=rows(state.committed.snapshot,period.storeId,period);
      if(!Array.isArray(saved)||saved.length!==drafts[type].length)
        throw new Error('Input month is incomplete');
      const edited=[];
      drafts[type].forEach((draft,index)=>{
        const before=saved[index];
        const day=index+1;
        if(Number(draft.d)!==day||Number(before?.d)!==day)
          throw new Error('Month input day is invalid');
        const fields={};
        if(type==='sales'){
          collectNumber(fields,'売上',draft,before);
          collectNumber(fields,'買上点数',draft,before,false);
          const weather=draft.weather||'';
          if(weather!==(before.weather||'')){
            if(!WX_KEYS.includes(weather))throw new Error('Sales weather is invalid');
            fields.weather=weather;
          }
        }else if(type==='kyaku'){
          collectNumber(fields,'客数',draft,before);
        }else{
          const categories={};
          for(const category of HAIKI_CATS)
            collectNumber(categories,category,draft.haiki,before.haiki);
          if(Object.keys(categories).length){
            fields.haiki={...before.haiki,...categories};
            fields.廃棄金額=HAIKI_CATS.reduce((total,category)=>total+Number(fields.haiki[category]??0),0);
            if(!Number.isSafeInteger(fields.廃棄金額))throw new Error('Waste total is invalid');
          }
        }
        if(Object.keys(fields).length)edited.push({day,fields});
      });
      return edited;
    }
    function apply(snapshot,edited){
      for(const {day,fields} of edited){
        const row=rows(snapshot,target.storeId)[day-1];
        Object.assign(row,fields);
        if(!Object.hasOwn(fields,'weather'))continue;
        snapshot.sharedWeather??={};
        snapshot.sharedWeather[wxKey(target.year,target.month,day)]=fields.weather;
        for(const id of Object.keys(snapshot.stores)){
          const peer=rows(snapshot,id)?.[day-1];
          if(Number(peer?.d)===day)peer.weather=fields.weather;
        }
      }
    }
    let button,notice,status;
    const attachments=new Map();
    if(!quick){
      if(!matchesScreen())throw new Error('The displayed month is not the committed snapshot');
      changes();
      ({button,notice,status}=controlsFor(screen));
      attachments.set(type,{target,button,notice,status});
    }

    function followCurrentScreen(){
      if(!followInputScreens||(currentNav===screen.route&&attachments.has(type)&&!quick))return;
      const next=Object.keys(screens).find(key=>screens[key].route===currentNav);
      if(!next)return;
      clearTimeout(timer);
      notice?.classList.remove('is-visible');
      type=next;
      screen=screens[type];
      if(!attachments.has(type)){
        const period=displayedPeriod();
        attachments.set(type,{target:{...period,storeId:state.storeId},...controlsFor(screen)});
      }
      const attachment=attachments.get(type);
      attachment.target??={...displayedPeriod(),storeId:state.storeId};
      ({target,button,notice,status}=attachment);
      connectedType=type;
    }
    let timer;
    const blocked=()=>state.busy||state.pending||state.held;
    const getStatus=()=>{
      if(quick&&currentNav===0)return quick.getStatus();
      let dirty=true;
      try{
        dirty=currentNav===screen.route&&((matchesPeriod()&&!matchesScreen())||changes(displayedPeriod()).length>0);
      }catch(_){}
      return {state:state.held?'HELD':blocked()?'ACTIVE':'IDLE_OBSERVED',hasUnsavedInput:dirty||blocked()};
    };
    function stop(message){
      state.held=true;
      button.disabled=true;
      status.textContent=message;
    }

    async function save(){
      state.pending=false;
      if(state.held||state.busy)return 'cancelled_before_mutation';
      clearTimeout(timer);
      notice.classList.remove('is-visible');
      if(!matchesPeriod()){
        status.textContent='この期間は試験用の'+screen.label+'保存の対象外です。';
        return 'cancelled_before_mutation';
      }
      if(!matchesScreen()){
        stop('表示中の店舗・日付または保存済みデータが変わったため、保存を停止しました。');
        return 'unknown';
      }

      let edited;
      try{edited=changes();}
      catch(_){
        status.textContent=screen.label+'の入力を確認してください。';
        return 'cancelled_before_mutation';
      }
      if(!edited.length){
        status.textContent='保存する変更はありません。';
        return 'cancelled_before_mutation';
      }
      const candidate=JSON.parse(JSON.stringify(state.committed.snapshot));
      apply(candidate,edited);
      const body=doc.body;
      const wasInert=body.inert;
      state.busy=true;
      button.disabled=true;
      body.inert=true;
      status.textContent='保存を確認しています。';
      try{
        const result=await api.save(state.committed.revision,candidate);
        if(!matchesScreen()||JSON.stringify(changes())!==JSON.stringify(edited)){
          stop('表示中の店舗・日付または保存済みデータが変わりました。保存済みの内容を確認してください。');
          return 'unknown';
        }
        apply(allStores,edited);
        state.committed=result;
        updateMissingBadge();
        status.textContent='';
        notice.classList.add('is-visible');
        const savedNotice=notice;
        timer=root.setTimeout(()=>savedNotice.classList.remove('is-visible'),3000);
        return 'completed';
      }catch(_){
        stop('保存結果を確認できないため、追加の保存を停止しました。');
        return 'unknown';
      }finally{
        state.busy=false;
        body.inert=wasInert;
        button.disabled=state.held;
      }
    }

    // Cancel the synchronous core and its after-save writers in the isolated sales screen.
    root.InsightHooks.on('input:save:before','indexeddb-sales-input-preview',ctx=>{
      if(!Object.hasOwn(screens,ctx.args[0]))return;
      if(ctx.args[0]!==type||(quick&&currentNav!==screen.route))
        return followInputScreens?false:undefined;
      if(!blocked()){
        if(quick)state.pending=true;
        ctx.runIndexedDBPreview=save;
      }
      return false;
    },-1000);
    function allowNavigation(question){
      const current=getStatus();
      return current.state==='IDLE_OBSERVED'&&
        (!current.hasUnsavedInput||root.confirm('未保存の入力があります。\n'+question));
    }

    // Approve a sidebar dispatch once, before document capture can start date synchronization.
    const sidebarSelector=Object.keys(sidebarRoutes).map(id=>'#'+id).join(',');
    let approved=null;
    const screenQuestion='保存せずに画面を移動しますか？';
    const isInputRoute=route=>route===0||Object.values(screens).some(screen=>screen.route===route);
    root.addEventListener('click',event=>{
      const item=event.target.closest?.(sidebarSelector);
      if(quick){
        if(item){
          event.preventDefault();
          event.stopImmediatePropagation();
          root.gotoNav(sidebarRoutes[item.id]);
          return;
        }
        const inside=event.target.closest?.('.page.show');
        const excluded=event.target.closest?.('.clear-btn,#autoWxBtn');
        if(!blocked()&&((inside&&!excluded)||event.target.closest?.('#storeSel,#storeMenuBtn')))return;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if(currentNav!==screen.route||!item)return;
      approved=null;
      if(allowNavigation(screenQuestion)){
        approved={event,route:sidebarRoutes[item.id]};
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);

    const gotoNav=root.gotoNav;
    root.gotoNav=function(destination){
      if(followInputScreens&&blocked())return false;
      if(quick){
        if(!isInputRoute(destination)||destination===currentNav||!allowNavigation(screenQuestion))return false;
        const fromQuick=currentNav===0;
        const period=root.InsightPagePeriodSync;
        const previous=period?.getTarget();
        const daily=root.InsightDateContext.getSelectedInfo();
        const priorPeriod=fromQuick?null:displayedPeriod();
        const priorType=type;
        const result=gotoNav.apply(this,arguments);
        if(priorPeriod){
          drafts[priorType]=JSON.parse(JSON.stringify(rows(state.committed.snapshot,priorPeriod.storeId,priorPeriod)??[]));
        }
        if(destination===0){
          connectedType=null;
          quick.onEnter();
        }else{
          const next=fromQuick?{year:daily.fy,month:daily.mIdx+1,day:daily.day,source:'daily'}:previous;
          if(next){
            period.setTarget(next);
            period.syncCurrentPage();
          }
          followCurrentScreen();
        }
        return result;
      }
      if(currentNav!==screen.route){
        const result=gotoNav.apply(this,arguments);
        followCurrentScreen();
        return result;
      }
      const approvedClick=approved;
      approved=null;
      const allowed=approvedClick&&approvedClick.route===destination&&approvedClick.event.eventPhase!==0;
      if(!allowed&&!allowNavigation(screenQuestion))return false;
      const priorPeriod=displayedPeriod();
      const priorDraft=drafts[type];
      const result=gotoNav.apply(this,arguments);
      const after=displayedPeriod();
      if(drafts[type]===priorDraft&&(currentNav!==screen.route||after.storeId!==priorPeriod.storeId||
         after.year!==priorPeriod.year||after.month!==priorPeriod.month)){
        drafts[type]=JSON.parse(JSON.stringify(rows(state.committed.snapshot,priorPeriod.storeId,priorPeriod)??[]));
      }
      followCurrentScreen();
      return result;
    };
    if(followInputScreens){
      const selector=doc.getElementById('storeSel');
      const storeStatus=doc.createElement('span');
      storeStatus.setAttribute('role','status');
      selector.parentNode.insertBefore(storeStatus,selector.nextSibling);

      async function switchStore(id){
        // The browser changes the select value before dispatching the change event.
        selector.value=state.storeId;
        if(blocked()||id===state.storeId||!Object.hasOwn(state.committed.snapshot.stores,id))return false;
        if(currentNav!==screen.route){
          storeStatus.textContent='試験用の店舗切替は月次入力画面で行ってください。';
          return false;
        }
        if(allStores.current!==state.storeId||
           root.InsightStorage.serialize(allStores)!==root.InsightStorage.serialize(state.committed.snapshot)){
          stop('保存済みデータとの一致を確認できないため、店舗切替を停止しました。');
          return false;
        }
        const dirty=getStatus().hasUnsavedInput;
        if(!root.confirm(dirty
          ?'未保存の入力があります。\n保存せずに店舗を切り替えますか？'
          :'店舗を切り替えますか？'))return false;

        const period=root.InsightPagePeriodSync?.getTarget();
        const priorDraft=JSON.stringify(drafts[type]);
        const candidate=JSON.parse(JSON.stringify(state.committed.snapshot));
        candidate.current=id;
        applySharedWeatherToStore(candidate.stores[id],candidate);
        const wasInert=doc.body.inert;
        clearTimeout(timer);
        notice.classList.remove('is-visible');
        state.busy=true;
        selector.disabled=button.disabled=true;
        doc.body.inert=true;
        storeStatus.textContent='店舗の切替を確認しています。';
        try{
          const result=await api.save(state.committed.revision,candidate);
          if(currentNav!==screen.route||allStores.current!==state.storeId||
             root.InsightStorage.serialize(allStores)!==root.InsightStorage.serialize(state.committed.snapshot)||
             JSON.stringify(drafts[type])!==priorDraft){
            throw new Error('Store selection changed during save');
          }
          state.committed=result;
          state.storeId=id;
          allStores=JSON.parse(JSON.stringify(result.snapshot));
          renderStoreSelection(id);
          root.InsightPagePeriodSync?.reconcileCurrentStore(period);
          for(const attachment of attachments.values())attachment.target=null;
          target={...displayedPeriod(),storeId:state.storeId};
          attachments.get(type).target=target;
          storeStatus.textContent='店舗を切り替えました。';
          return true;
        }catch(_){
          stop('店舗切替の結果を確認できないため、追加の保存を停止しました。');
          storeStatus.textContent=status.textContent;
          return false;
        }finally{
          state.busy=false;
          doc.body.inert=wasInert;
          selector.disabled=button.disabled=state.held;
          selector.value=state.storeId;
        }
      }
      selector.addEventListener('change',event=>{
        event.stopImmediatePropagation();
        void switchStore(selector.value);
      },true);
      root.switchStore=switchStore;
      root.showStoreMenu=function(){
        storeStatus.textContent='店舗の追加・変更・削除は試験対象外です。';
        return false;
      };
    }
    if(quick){
      allowConnectedPeriod=(inputType,year)=>{
        if(blocked()||currentNav!==screen.route||inputType!==type)return false;
        if(root.InsightYearManager?.isCurrentRegistered(year))return true;
        status.textContent='試験中は登録済みの年度だけを表示できます。';
        return false;
      };
      root.clearDayData=root.clearKyakuMonth=()=>false;
      root.addEventListener('beforeunload',event=>{
        if(!getStatus().hasUnsavedInput)return;
        event.preventDefault();
        event.returnValue='';
      });
    }
    allowConnectedNavigation=allowNavigation;
    connectedType=quick?null:type;
    connectedStatus=getStatus;
    return Object.freeze({getStatus});
  }

  root.InsightIndexedDBSalesInputPreviewV1=Object.freeze({
    connect,
    getConnectedStatus:(type=connectedType)=>type===connectedType?connectedStatus?.()??null:null,
    allowPeriod:(type,year)=>allowConnectedPeriod?.(type,year)??null,
    allowNavigation:(type,question)=>type===connectedType?allowConnectedNavigation(question):true
  });
})(globalThis);
