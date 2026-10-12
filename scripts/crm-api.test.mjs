import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCrm } from '../server/crm-api.mjs';
import handler from '../api/index.mjs';
const agency='00000000-0000-4000-8000-000000000001', callId='00000000-0000-4000-8000-000000000002';
function context(path,method='GET',payload={},role='owner'){
  const queries=[],rpcs=[];
  const records={kixie_calls:[{id:callId,agency_id:agency,status:'answered'}]};
  const sdk={from(table){const filters=[];const query={table,filters};queries.push(query);let single=false;const q={
    select(fields){query.fields=fields;return q;},eq(k,v){filters.push([k,v]);return q;},in(k,v){filters.push([k,v]);return q;},order(){return q;},range(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},
    then(resolve){let rows=(records[table]||[]).filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));return Promise.resolve({data:single?(rows[0]||null):rows,count:rows.length}).then(resolve);}};return q;},
    async rpc(name,args){rpcs.push({name,args});return {data:{id:callId}};}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.value=JSON.parse(value);}};
  const ctx={req:{headers:{'content-type':'application/json'},body:payload},res,c:{agencyId:agency},a:{sdk,user:{role}},url:new URL('https://example.test'+path),path:path.split('?')[0],method,checked:r=>{if(r.error)throw new Error('db failed');return r.data;}};
  return {ctx,res,queries,rpcs,records};
}
test('call list applies tenant scope and bounded paging before returning normalized rows',async()=>{
  const x=context('/api/admin/calls?page=1');await handleCrm(x.ctx);assert.equal(x.res.value.calls.length,1);
  assert.ok(x.queries.every(q=>q.filters.some(([k,v])=>k==='agency_id'&&v===agency)));
  for(const page of ['0','NaN','1.2','10001'])await assert.rejects(handleCrm(context('/api/admin/calls?page='+page).ctx),e=>e.status===400);
});
test('call display lookups are agency scoped and RLS limited',async()=>{
  const x=context('/api/admin/calls');x.records.kixie_calls[0].lead_id=callId;x.records.leads=[{id:callId,agency_id:agency,name:'Fictional',do_not_contact:true}];
  await handleCrm(x.ctx);assert.equal(x.res.value.calls[0].lead_name,'Fictional');assert.equal(x.res.value.calls[0].lead_do_not_contact,true);
  assert.ok(x.queries.find(q=>q.table==='leads').filters.some(([k,v])=>k==='agency_id'&&v===agency));
});
test('cross-agency or unknown call is not found before mutation RPC',async()=>{
  const x=context('/api/admin/calls/'+callId,'PATCH',{disposition:'connected'});x.records.kixie_calls[0].agency_id='other';
  await assert.rejects(handleCrm(x.ctx),e=>e.status===404);assert.equal(x.rpcs.length,0);
});
test('call mutation uses validated patch and atomic scoped RPC',async()=>{
  const x=context('/api/admin/calls/'+callId,'PATCH',{disposition:'do_not_contact',follow_up_hold:true});await handleCrm(x.ctx);
  assert.deepEqual(x.rpcs,[{name:'update_kixie_call',args:{p_call:callId,p_patch:{disposition:'do_not_contact',follow_up_hold:true}}}]);
  await assert.rejects(handleCrm(context('/api/admin/calls/'+callId,'PATCH',{agency_id:'other'}).ctx),e=>e.status===400);
});
test('agents cannot access or mutate finance configuration',async()=>{
  for(const [path,method]of[['/api/admin/production','GET'],['/api/admin/vendors','POST'],['/api/admin/compensation-schedules','POST'],['/api/admin/policies','POST'],['/api/admin/commission-estimate','POST']]){
    const x=context(path,method,{},'agent');await assert.rejects(handleCrm(x.ctx),e=>e.status===403);assert.equal(x.rpcs.length,0);
  }
});
test('vendor and policy setup never accepts caller-supplied agency',async()=>{
  const x=context('/api/admin/vendors','POST',{key:'fictional',name:'Fictional vendor',agency_id:'other'});
  await assert.rejects(handleCrm(x.ctx),e=>e.status===400);assert.equal(x.rpcs.length,0);
  const y=context('/api/admin/vendors','POST',{key:'fictional',name:'Fictional vendor'});await handleCrm(y.ctx);assert.equal(y.rpcs[0].args.p_agency,agency);
});
test('missing integration config is explicit; bad method cannot simulate webhook acceptance',async()=>{
  const old=process.env.KIXIE_PREVIEW_ENABLED;delete process.env.KIXIE_PREVIEW_ENABLED;
  try{for(const method of ['POST','GET']){const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.value=JSON.parse(v);}};await handler({url:'/api/integrations/kixie',method,headers:{}},res);assert.equal(res.statusCode,method==='POST'?503:405);assert.ok(!res.value.accepted);assert.match(res.headers['Cache-Control'],/no-store/);}}
  finally{if(old!==undefined)process.env.KIXIE_PREVIEW_ENABLED=old;}
});
test('UUID-only finance retention and routing RPC targets are bound to configured agency',async()=>{
  for(const path of [`/api/admin/policies/${callId}/financial-facts`,`/api/admin/policies/${callId}/retention`,`/api/admin/leads/${callId}/routing-verification`]){
    const x=context(path,'POST',{});x.records.policy_production=[{id:callId,agency_id:'other'}];x.records.leads=[{id:callId,agency_id:'other'}];
    await assert.rejects(handleCrm(x.ctx),e=>e.status===404);assert.equal(x.rpcs.length,0);
  }
});
test('owner candidate review is scoped; admin identity linking is denied before RPC',async()=>{
  const x=context('/api/admin/calls/'+callId);x.records.lead_contact_candidates=[{agency_id:agency,call_id:callId,lead_id:callId,reason:'phone_only_review',status:'pending'}];x.records.leads=[{id:callId,agency_id:agency,name:'Fictional Candidate',state:'TX',product:'whole_life'}];
  await handleCrm(x.ctx);assert.equal(x.res.value.candidates[0].name,'Fictional Candidate');
  const y=context('/api/admin/calls/'+callId+'/link','POST',{leadId:callId,reason:'Verified identity reference'},'admin');await assert.rejects(handleCrm(y.ctx),e=>e.status===403);assert.equal(y.rpcs.length,0);
});
