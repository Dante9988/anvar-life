import { HttpError } from './config.mjs';
import { json, body } from './http.mjs';
import { admin } from './auth.mjs';
import { UUID, only } from './validation.mjs';
import { kixieConfig, kixieCapabilities } from './kixie.mjs';
import { callPatch, estimateCommission, financialSummary, retention } from './production.mjs';
const id = value => { if (!UUID.test(value || '')) throw new HttpError(400,'VALIDATION','Invalid identifier.'); return value; };
const pageOf = url => {
  const page = Number(url.searchParams.get('page') || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new HttpError(400,'VALIDATION','Invalid page.');
  return page;
};
async function all(a, checked, table, agencyId) {
  const rows=[];
  for(let offset=0;offset<10000;offset+=1000){
    const part=checked(await a.sdk.from(table).select('*').eq('agency_id',agencyId).order('id').range(offset,offset+999));
    rows.push(...part);if(part.length<1000)return rows;
  }
  throw new HttpError(503,'REPORT_LIMIT','This report needs a database aggregation upgrade.');
}
async function requireScoped(a, checked, table, agencyId, targetId) {
  const record=checked(await a.sdk.from(table).select('id').eq('agency_id',agencyId).eq('id',targetId).maybeSingle());
  if(!record)throw new HttpError(404,'NOT_FOUND','The record was not found.');
}
async function enrichCalls(a, checked, agencyId, calls) {
  const collect=key=>[...new Set(calls.map(c=>c[key]).filter(Boolean))];
  const read=async(table,fields,column,ids)=>ids.length?checked(await a.sdk.from(table).select(fields).eq('agency_id',agencyId).in(column,ids)):[];
  const [vendors,agents,leads]=await Promise.all([
    read('vendor_sources','id,name','id',collect('vendor_source_id')),
    read('memberships','user_id,email','user_id',collect('mapped_agent_id')),
    read('leads','id,name,do_not_contact','id',collect('lead_id')),
  ]);
  return calls.map(c=>({...c,vendor_name:vendors.find(v=>v.id===c.vendor_source_id)?.name||null,
    mapped_agent_email:agents.find(v=>v.user_id===c.mapped_agent_id)?.email||null,
    lead_name:leads.find(v=>v.id===c.lead_id)?.name||null,
    lead_do_not_contact:leads.find(v=>v.id===c.lead_id)?.do_not_contact??null}));
}
export async function handleCrm({req,res,c,a,url,path,method,checked}) {
  if (path === '/api/admin/integrations/kixie' && method === 'GET') {
    json(res,200,kixieCapabilities(kixieConfig(process.env,c)));return true;
  }
  if (path === '/api/admin/calls' && method === 'GET') {
    const page=pageOf(url);let query=a.sdk.from('kixie_calls').select('*',{count:'exact'}).eq('agency_id',c.agencyId);
    const status=url.searchParams.get('status');
    if(status){if(!['ringing','answered','missed','unknown'].includes(status))throw new HttpError(400,'VALIDATION','Invalid call status.');query=query.eq('status',status);}
    const vendor=url.searchParams.get('vendor');if(vendor)query=query.eq('vendor_source_id',id(vendor));
    const result=await query.order('last_event_at',{ascending:false}).range((page-1)*25,page*25-1);
    json(res,200,{calls:await enrichCalls(a,checked,c.agencyId,checked(result)),total:result.count,page,pageSize:25});return true;
  }
  const match=path.match(/^\/api\/admin\/calls\/([^/]+)(?:\/(link|route))?$/);
  if(match){
    const callId=id(match[1]);
    const call=checked(await a.sdk.from('kixie_calls').select('*').eq('agency_id',c.agencyId).eq('id',callId).maybeSingle());
    if(!call)throw new HttpError(404,'NOT_FOUND','The call was not found.');
    if(!match[2]&&method==='GET'){
      const [events,notes,tasks]=await Promise.all([
        a.sdk.from('integration_events').select('*').eq('agency_id',c.agencyId).eq('call_id',callId).order('occurred_at',{ascending:false}).limit(100),
        a.sdk.from('kixie_call_notes').select('*').eq('agency_id',c.agencyId).eq('call_id',callId).order('created_at',{ascending:false}).limit(100),
        a.sdk.from('crm_follow_up_tasks').select('*').eq('agency_id',c.agencyId).eq('call_id',callId).limit(20),
      ]);
      let candidates=[];
      if(a.user.role==='owner'&&!call.lead_id){
        const matches=checked(await a.sdk.from('lead_contact_candidates').select('lead_id,reason,status').eq('agency_id',c.agencyId).eq('call_id',callId).eq('status','pending').limit(50));
        if(matches.length){
          const leads=checked(await a.sdk.from('leads').select('id,name,state,product').eq('agency_id',c.agencyId).in('id',matches.map(m=>m.lead_id)));
          candidates=matches.map(m=>({...m,...leads.filter(l=>l.id===m.lead_id).map(l=>({name:l.name,state:l.state,product:l.product}))[0]}));
        }
      }
      json(res,200,{call:(await enrichCalls(a,checked,c.agencyId,[call]))[0],events:checked(events),notes:checked(notes),tasks:checked(tasks),candidates});return true;
    }
    if(!match[2]&&method==='PATCH'){
      const updated=checked(await a.sdk.rpc('update_kixie_call',{p_call:callId,p_patch:callPatch(await body(req))}));
      json(res,200,{call:updated});return true;
    }
    if(match[2]==='link'&&method==='POST'){
      if(a.user.role!=='owner')throw new HttpError(403,'FORBIDDEN','Agency owner review is required.');const p=await body(req);only(p,['leadId','reason']);id(p.leadId);
      if(typeof p.reason!=='string'||p.reason.trim().length<8||p.reason.length>500)throw new HttpError(400,'VALIDATION','Record the identity verification reason.');
      json(res,200,{call:checked(await a.sdk.rpc('link_kixie_call',{p_call:callId,p_lead:p.leadId,p_reason:p.reason.trim()}))});return true;
    }
    if(match[2]==='route'&&method==='POST'){
      admin(a);const p=await body(req);only(p,['agentId','expectedAssignee','reason']);id(p.agentId);if(p.expectedAssignee!==null)id(p.expectedAssignee);
      if(typeof p.reason!=='string'||p.reason.trim().length<3||p.reason.length>500)throw new HttpError(400,'VALIDATION','Explain this routing choice.');
      json(res,200,{lead:checked(await a.sdk.rpc('route_kixie_call',{p_call:callId,p_agent:p.agentId,p_expected:p.expectedAssignee,p_reason:p.reason.trim()}))});return true;
    }
  }
  if(path==='/api/admin/production'&&method==='GET'){
    admin(a);
    const tables=['policy_production','compensation_schedules','vendor_sources','vendor_lead_costs','telephony_costs','policy_financial_facts','policy_retention_checks'];
    const [policies,schedules,vendors,vendorCosts,telephonyCosts,facts,checks]=await Promise.all(tables.map(t=>all(a,checked,t,c.agencyId)));
    const kinds={commission_earned:'earned',commission_paid:'paid',commission_advanced:'advanced',chargeback:'chargeback'};
    const normalizedPolicies=policies.map(p=>({...p,issuedAt:p.issued_at,financialEntries:facts.filter(f=>f.policy_id===p.id&&kinds[f.fact_type]).map(f=>({kind:kinds[f.fact_type],amountCents:Number(f.amount_cents),currency:f.currency,verified:!!f.verified_at})),retention:Object.fromEntries(checks.filter(r=>r.policy_id===p.id).map(r=>[r.day_mark,{active:r.active,verified:!!r.verified_at}]))}));
    const costs=[...vendorCosts.map(c=>({...c,kind:'vendor_lead'})),...telephonyCosts.map(c=>({...c,kind:'telephony'}))].map(c=>({...c,amountCents:Number(c.amount_cents),verified:!!c.reference}));
    json(res,200,{policies,schedules,vendors,summary:financialSummary(normalizedPolicies,costs),retention:[30,60,90].map(d=>retention(normalizedPolicies,d)),reportingState:'recorded_facts_pending_reconciliation'});return true;
  }
  if (method === 'POST' && ['/api/admin/vendors','/api/admin/kixie-agent-mappings','/api/admin/compensation-schedules','/api/admin/policies','/api/admin/costs'].includes(path)) {
    admin(a); const p=await body(req); let rpc, args;
    if(path==='/api/admin/vendors') {
      only(p,['key','name','phone','reference']); rpc='configure_kixie_source';
      args={p_agency:c.agencyId,p_key:p.key,p_name:p.name,p_phone:p.phone||null,p_reference:p.reference||null};
    } else if(path==='/api/admin/kixie-agent-mappings') {
      only(p,['userId','externalAgentId','externalEmail','reference']);id(p.userId);rpc='map_kixie_agent';
      args={p_agency:c.agencyId,p_user:p.userId,p_external_agent_id:p.externalAgentId||null,p_external_email:p.externalEmail||null,p_reference:p.reference};
    } else if(path==='/api/admin/compensation-schedules') {
      only(p,['agent_id','carrier','product','contract_key','effective_from','effective_until','min_issue_age','max_issue_age','commission_bps','advance_bps','verification_reference']);id(p.agent_id);
      rpc='create_compensation_schedule';args={p_agency:c.agencyId,p_data:p};
    } else if(path==='/api/admin/policies') {
      only(p,['lead_id','agent_id','carrier','product','contract_key','external_reference','status','verification_reference','effective_date','issued_at','issue_age']);id(p.lead_id);id(p.agent_id);
      rpc='record_policy_production';args={p_agency:c.agencyId,p_data:p};
    } else {
      only(p,['kind','targetId','sourceId','amountCents','currency','reference']);id(p.targetId);if(p.sourceId)id(p.sourceId);
      if(!['vendor_lead','telephony'].includes(p.kind)||!Number.isSafeInteger(p.amountCents)||p.amountCents<0)throw new HttpError(400,'VALIDATION','Enter a valid verified cost.');
      rpc='record_crm_cost';args={p_agency:c.agencyId,p_kind:p.kind,p_target:p.targetId,p_source:p.sourceId||null,p_amount_cents:p.amountCents,p_currency:p.currency,p_reference:p.reference};
    }
    json(res,201,{record:checked(await a.sdk.rpc(rpc,args))});return true;
  }
  const financeMatch=path.match(/^\/api\/admin\/policies\/([^/]+)\/financial-facts$/);
  if(financeMatch&&method==='POST'){
    admin(a);const policyId=id(financeMatch[1]);await requireScoped(a,checked,'policy_production',c.agencyId,policyId);const p=await body(req);only(p,['type','amountCents','currency','reference']);
    if(!['annualized_premium','commission_earned','commission_paid','commission_advanced','chargeback'].includes(p.type)||!Number.isSafeInteger(p.amountCents)||p.amountCents<0)throw new HttpError(400,'VALIDATION','Enter a valid verified financial fact.');
    json(res,201,{record:checked(await a.sdk.rpc('record_policy_financial_fact',{p_policy:policyId,p_type:p.type,p_amount_cents:p.amountCents,p_currency:p.currency,p_reference:p.reference}))});return true;
  }
  const retentionMatch=path.match(/^\/api\/admin\/policies\/([^/]+)\/retention$/);
  if(retentionMatch&&method==='POST'){
    admin(a);const policyId=id(retentionMatch[1]);await requireScoped(a,checked,'policy_production',c.agencyId,policyId);const p=await body(req);only(p,['dayMark','observedOn','active','reference']);
    if(![30,60,90].includes(p.dayMark)||typeof p.active!=='boolean'||typeof p.observedOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.observedOn))throw new HttpError(400,'VALIDATION','Enter a verified retention observation.');
    json(res,201,{record:checked(await a.sdk.rpc('record_policy_retention',{p_policy:policyId,p_day_mark:p.dayMark,p_observed_on:p.observedOn,p_active:p.active,p_reference:p.reference}))});return true;
  }
  const routingMatch=path.match(/^\/api\/admin\/leads\/([^/]+)\/routing-verification$/);
  if(routingMatch&&method==='POST'){
    admin(a);const leadId=id(routingMatch[1]);await requireScoped(a,checked,'leads',c.agencyId,leadId);const p=await body(req);only(p,['state','product','carrier','reference']);
    json(res,201,{record:checked(await a.sdk.rpc('verify_lead_routing',{p_lead:leadId,p_state:p.state,p_product:p.product,p_carrier:p.carrier,p_reference:p.reference}))});return true;
  }
  if(path==='/api/admin/commission-estimate'&&method==='POST'){
    admin(a);const p=await body(req);only(p,['scheduleId','monthlyPremiumCents','age','product','carrier','agentId','contract','effectiveOn']);id(p.scheduleId);id(p.agentId);
    const schedule=checked(await a.sdk.from('compensation_schedules').select('*').eq('agency_id',c.agencyId).eq('id',p.scheduleId).maybeSingle());
    if(!schedule)throw new HttpError(404,'NOT_FOUND','The compensation schedule was not found.');
    const estimate=estimateCommission(p,{product:schedule.product,carrier:schedule.carrier,agentId:schedule.agent_id,contract:schedule.contract_key,effectiveFrom:schedule.effective_from,effectiveUntil:schedule.effective_until,bands:[{minAge:schedule.min_issue_age,maxAge:schedule.max_issue_age,rateBasisPoints:schedule.commission_bps,advanceBasisPoints:schedule.advance_bps}]});
    json(res,200,estimate);return true;
  }
  return false;
}
