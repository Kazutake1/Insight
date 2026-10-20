'use strict';
// Synthetic values only. No exports from actual saved data.
function reportFixture(){
  const categories=[{id:'food',name:'架空米飯',activeTrips:[true,false,false],hidden:false,aliases:[]}];
  function store(name,sales){
    const data={};
    for(let month=1;month<=12;month++){
      const length=new Date(2026,month,0).getDate();
      data[month+'月']=Array.from({length},(_,i)=>({d:String(i+1),売上:0,客数:0,買上点数:0,廃棄金額:0,haiki:Object.fromEntries(['米飯','調理パン','麺類・その他','デリカテッセン','スイーツ','FF','その他デイリー','パン・ペストリー'].map(k=>[k,0])),weather:''}));
    }
    Object.assign(data['10月'][11],{売上:100,客数:100,廃棄金額:3000});
    Object.assign(data['10月'][18],{売上:sales,客数:80,廃棄金額:0});
    const record=n=>({food:{trips:[{delivery:n,sales:n},{delivery:null,sales:null},{delivery:null,sales:null}]}});
    return {name,years:['2026'],data:{'2026':data},salesCounts:{'2026-10-19':record(0),'2026-09-28':record(10),'2026-09-29':record(20)},events:[]};
  }
  return {schemaVersion:1,current:'store_a',stores:{store_a:store('架空店舗A',80),store_b:store('架空店舗B',40)},
    salesCountManagement:{version:1,categories},eventManagement:{version:1,events:[]}};
}
module.exports={reportFixture};
