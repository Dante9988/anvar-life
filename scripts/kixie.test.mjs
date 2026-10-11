import test from 'node:test';
import assert from 'node:assert/strict';
import { kixieConfig, kixieCapabilities, verifyKixieRequest, normalizeKixie, receiveKixie } from '../server/kixie.mjs';
import { callPatch, estimateCommission, financialSummary, retention } from '../server/production.mjs';
const now = Date.parse('2026-10-11T13:00:00Z');
const c = {enabled:true, secret:'fictional_test_secret_'.repeat(3), businessId:'12345', agencyId:'fictional', fixtureOnly:true};
const req = {headers:{'x-kixie-webhook-token':c.secret}};
const payload = (event = 'endcall') => ({data:{hookevent:event,businessid:'12345',callDetails:{
  callid:'fictional-call-0001', businessid:12345,calldate:'2026-10-11T12:00:00.000Z',answerDate:'2026-10-11T12:00:03.000Z',
  callEndDate:event === 'endcall' ? '2026-10-11T12:01:03.000Z' : '', duration:event === 'endcall' ? 60 : '',
  calltype:'incoming',callstatus:'answered',fromnumber164:'+12025550100',tonumber164:'+12025550101',email:'agent@example.invalid',
  recordingurl:'https://calls.kixie.com/fictional.mp3',},crm:{token:'do-not-retain'},apikey:'do-not-retain'}});
const fails = (fn, code) => assert.throws(fn, e=>e.code === code);
test('Kixie gate cannot enable live ingestion and requires explicit isolated configuration',()=>{
  const env={KIXIE_PREVIEW_ENABLED:'true',KIXIE_FIXTURE_ONLY:'true',KIXIE_WEBHOOK_SECRET:c.secret,KIXIE_BUSINESS_ID:c.businessId,KIXIE_DATABASE_URL:'postgres://unused'};
  const app={configured:true,mode:'fictional_preview',agencyId:'fictional'};
  assert.equal(kixieConfig(env,app).enabled,true);
  for(const key of Object.keys(env)) assert.equal(kixieConfig({...env,[key]:''},app).enabled,false);
  assert.equal(kixieConfig(env,{...app,mode:'production'}).enabled,false);
  assert.equal(kixieCapabilities(c).liveCollectionEnabled,false);
  assert.equal(kixieCapabilities(c).clickToCallEnabled,false);
});
test('shared secret uses only supported exact header, never query or body',()=>{
  assert.doesNotThrow(()=>verifyKixieRequest(req,c));
  for(const headers of [{},{authorization:c.secret},{'x-kixie-webhook-token':c.secret+'x'},{'x-kixie-webhook-token':[c.secret]}])
    fails(()=>verifyKixieRequest({headers},c),'KIXIE_UNAUTHORIZED');
  fails(()=>verifyKixieRequest(req,{...c,enabled:false}),'KIXIE_NOT_CONFIGURED');
});
test('documented call envelope normalizes only allowlisted metadata',()=>{
  const e=normalizeKixie(payload(),c,now);
  assert.equal(e.status,'answered'); assert.equal(e.durationSeconds,60); assert.equal(e.direction,'inbound');
  assert.equal(e.consentStatus,'unknown');assert.equal(e.recordingStatus,'available_unreviewed');
  assert.ok(!JSON.stringify(e).includes('do-not-retain')); assert.ok(!JSON.stringify(e).includes('https:'));
  assert.match(e.eventId,/^[a-f0-9]{64}$/); assert.deepEqual(e,normalizeKixie(payload(),c,now));
  const noisy=payload();noisy.data.crm.token='changed';assert.equal(normalizeKixie(noisy,c,now).eventHash,e.eventHash);
});
test('ringing sample missed is never a terminal missed call; answer and end distinct',()=>{
  const start=payload('startcall');start.data.callDetails.callstatus='missed';start.data.callDetails.answerDate='';
  const a=normalizeKixie(start,c,now),b=normalizeKixie(payload('answeredcall'),c,now),d=normalizeKixie(payload(),c,now);
  assert.equal(a.status,'ringing');assert.equal(a.recordingStatus,'not_provided');
  assert.equal(b.status,'answered');assert.notEqual(a.eventId,b.eventId);assert.notEqual(b.eventId,d.eventId);
  const unknown=payload();unknown.data.callDetails.callstatus='completed';assert.equal(normalizeKixie(unknown,c,now).status,'unknown');
});
test('business, event, direction, timestamp and real-contact boundaries fail closed',()=>{
  const changes=[['KIXIE_BUSINESS_MISMATCH',p=>p.data.businessid='999'],['KIXIE_BUSINESS_MISMATCH',p=>p.data.callDetails.businessid='999'],
    ['KIXIE_EVENT_UNSUPPORTED',p=>p.data.hookevent='SMS'],['KIXIE_DIRECTION_UNSUPPORTED',p=>p.data.callDetails.calltype='outgoing'],
    ['KIXIE_TIMESTAMP',p=>p.data.callDetails.calldate='2026-10-11 12:00:00'],['KIXIE_TIMESTAMP',p=>p.data.callDetails.callEndDate=''],
    ['KIXIE_TIMESTAMP',p=>p.data.callDetails.callEndDate='2026-10-11T11:00:00Z'],['KIXIE_EVENT_AGE',p=>p.data.callDetails.callEndDate='2026-10-20T12:00:00Z'],
    ['KIXIE_FICTIONAL_ONLY',p=>p.data.callDetails.fromnumber164='+12025550200'],['KIXIE_FICTIONAL_ONLY',p=>p.data.callDetails.email='agent@actual.com'],
    ['KIXIE_PAYLOAD',p=>p.data.callDetails.duration=999999],['KIXIE_PAYLOAD',p=>p.data.callDetails.callid='../unsafe']];
  for(const [code,change] of changes){const p=payload();change(p);fails(()=>normalizeKixie(p,c,now),code);}
  const legacy=payload();legacy.data.callDetails.calldate='2026-10-11 12:00:00';
  assert.equal(normalizeKixie(legacy,{...c,legacyUtc:true},now).startedAt,'2026-10-11T12:00:00.000Z');
});
test('ingestion writes parameterized normalized records only after safe runtime role',async()=>{
  const calls=[];const database={query:async(sql,args)=>{calls.push({sql,args});return calls.length===1?{rows:[{rolsuper:false,rolbypassrls:false,can_access_tables:false}]}:{rows:[{result:{replayed:false,applied:true}}]};}};
  assert.deepEqual(await receiveKixie(req,c,payload(),{database,now}),{replayed:false,applied:true});
  assert.equal(calls[1].args[0],'fictional');assert.ok(!calls[1].args[1].includes('do-not-retain'));
  for(const unsafe of ['rolsuper','rolbypassrls','can_access_tables']){
    let n=0;await assert.rejects(receiveKixie(req,c,payload(),{now,database:{query:async()=>{n++;return {rows:[{[unsafe]:true}]};}}}),e=>e.code==='KIXIE_UNAVAILABLE');assert.equal(n,1);
  }
});
test('database replay conflicts map to actionable errors with no PII',async()=>{
  let n=0;await assert.rejects(receiveKixie(req,c,payload(),{now,database:{query:async()=>{if(++n===1)return {rows:[{}]};throw Object.assign(new Error('secret phone'),{code:'23505'});}}}),e=>e.status===409&&!e.message.includes('secret'));
});
test('call patch rejects ownership changes, unsafe notes and invalid callback states',()=>{
  assert.deepEqual(callPatch({disposition:'do_not_contact',follow_up_hold:true}),{disposition:'do_not_contact',follow_up_hold:true});
  for(const p of [{assigned_to:'agent'},{agency_id:'other'},{note:' '},{callback_at:'tomorrow'},{follow_up_hold:'false'},{disposition:'sold'},{}]) fails(()=>callPatch(p),'VALIDATION');
});
const schedule={product:'whole_life',carrier:'Example',agentId:'agent',contract:'example-contract',effectiveFrom:'2026-01-01',effectiveUntil:null,
  bands:[{minAge:18,maxAge:60,rateBasisPoints:3900,advanceBasisPoints:7500},{minAge:61,maxAge:120,rateBasisPoints:6500,advanceBasisPoints:7500}]};
const quote={monthlyPremiumCents:7500,age:61,product:'whole_life',carrier:'Example',agentId:'agent',contract:'example-contract',effectiveOn:'2026-10-11'};
test('whole-life schedule respects age boundary and advance applies to commission',()=>{
  const p=estimateCommission(quote,schedule);assert.equal(p.annualPremiumCents,90000);assert.equal(p.commissionCents,58500);assert.equal(p.advanceCents,43875);assert.equal(p.revenueRecognizedCents,0);
  assert.equal(estimateCommission({...quote,age:60},schedule).commissionCents,35100);
  for(const changed of [{product:'term_life'},{product:'iul'},{carrier:'Other'},{agentId:'Other'},{contract:'Other'},{effectiveOn:'2025-10-11'}]) assert.equal(estimateCommission({...quote,...changed},schedule).available,false);
});
test('verified ROI separates earned paid advance chargebacks and vendor/telephony costs',()=>{
  const result=financialSummary([{quoteAnnualPremiumCents:90000,financialEntries:[{kind:'advanced',amountCents:43875,currency:'USD',verified:true},{kind:'paid',amountCents:10000,currency:'USD',verified:true},{kind:'earned',amountCents:58500,currency:'USD',verified:false}]}],[{kind:'vendor_lead',amountCents:6000,currency:'USD',verified:true},{kind:'telephony',amountCents:500,currency:'USD',verified:true}]);
  assert.equal(result.earnedCents,0);assert.equal(result.netCashCents,47375);assert.equal(result.vendorCostCents,6000);assert.equal(result.telephonyCostCents,500);
});
test('retention reports mature cohort and unknown evidence without fabricated active status',()=>{
  const result=retention([{issuedAt:'2026-07-01',retention:{30:{verified:true,active:true}}},{issuedAt:'2026-07-01',stage:'active'},{issuedAt:'2026-10-01',retention:{30:{verified:true,active:true}}}],30,now);
  assert.deepEqual(result,{days:30,eligible:2,verified:1,unknown:1,active:1,rate:1});
});
test('runtime guard checks session identity and rejects elevated login hidden by SET ROLE',async()=>{
  const {PGlite}=await import('@electric-sql/pglite'); const {KIXIE_ROLE_CHECK_SQL}=await import('../server/kixie.mjs');const db=new PGlite();
  try{await db.exec('CREATE ROLE safe_kixie_test; SET ROLE safe_kixie_test;');const r=(await db.query(KIXIE_ROLE_CHECK_SQL)).rows[0];assert.equal(r.rolsuper,true);assert.equal(r.switched_role,true);}finally{await db.close();}
});
test('invalid calendar dates and missing financial evidence are never normalized as facts',()=>{
  const p=payload();p.data.callDetails.calldate='2026-02-30T12:00:00Z';fails(()=>normalizeKixie(p,c,now),'KIXIE_TIMESTAMP');
  const s=financialSummary([{financialEntries:[]}],[{kind:'vendor_lead',amountCents:6000,currency:'USD',verified:true}]);
  assert.equal(s.cashRoi,null);assert.equal(s.reconciliationRequired,true);assert.equal(s.policiesWithoutCashEvidence,1);
});
test('commission and callback dates reject nonexistent calendar days; aggregates retain integer precision',()=>{
  assert.equal(estimateCommission({...quote,effectiveOn:'2026-02-30'},schedule).available,false);
  fails(()=>callPatch({callback_at:'2026-02-30T12:00:00Z'}),'VALIDATION');
  assert.throws(()=>financialSummary([],[{kind:'vendor_lead',amountCents:Number.MAX_SAFE_INTEGER,currency:'USD',verified:true},{kind:'vendor_lead',amountCents:10,currency:'USD',verified:true}]),e=>e.code==='REPORT_LIMIT');
});
test('cash net does not lose integer cents in an unsafe intermediate sum',()=>{
  const entry=(kind,amountCents)=>({kind,amountCents,currency:'USD',verified:true});
  assert.equal(financialSummary([{financialEntries:[entry('paid',Number.MAX_SAFE_INTEGER),entry('advanced',2),entry('chargeback',2)]}]).recordedLedgerNetCents,Number.MAX_SAFE_INTEGER);
});
