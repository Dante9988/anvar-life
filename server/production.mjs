import { HttpError } from './config.mjs';
export const PRODUCTION_STAGES = Object.freeze(['qualified','quoted','application','submitted','issued','paid','active','declined','not_taken','lapsed','cancelled']);
export const CALL_DISPOSITIONS = Object.freeze(['connected','no_answer','voicemail','callback_requested','not_interested','do_not_contact','wrong_number','replied']);
const invalid = message => { throw new HttpError(400, 'VALIDATION', message); };
function validCalendarDay(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number),d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
}
function safeSum(entries) {
  const total=entries.reduce((n,e)=>n+e.amountCents,0);
  if(!Number.isSafeInteger(total)) throw new HttpError(503,'REPORT_LIMIT','This ledger requires higher-precision aggregation.');
  return total;
}
export function callPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Invalid call update.');
  const allowed = ['disposition', 'note', 'callback_at', 'follow_up_hold'];
  if (!Object.keys(input).length || Object.keys(input).some(k => !allowed.includes(k))) invalid('Unsupported call update.');
  if ('disposition' in input && !CALL_DISPOSITIONS.includes(input.disposition)) invalid('Select a supported disposition.');
  if ('note' in input && (typeof input.note !== 'string' || !input.note.trim() || input.note.length > 2000)) invalid('Write a note of 1–2,000 characters.');
  if ('follow_up_hold' in input && typeof input.follow_up_hold !== 'boolean') invalid('Invalid follow-up hold.');
  if ('callback_at' in input && input.callback_at !== null &&
      (typeof input.callback_at !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(input.callback_at) || !validCalendarDay(input.callback_at.slice(0,10)) || !Number.isFinite(Date.parse(input.callback_at)))) invalid('Use a dated callback time with timezone.');
  return { ...input, ...('note' in input ? {note:input.note.trim()} : {}) };
}
export function estimateCommission({monthlyPremiumCents, age, product, carrier, agentId, contract, effectiveOn}, schedule) {
  if (!Number.isSafeInteger(monthlyPremiumCents) || monthlyPremiumCents < 0 || monthlyPremiumCents > 10000000 || !Number.isInteger(age) || age < 18 || age > 120)
    invalid('Enter a valid premium and adult issue age.');
  if (!schedule || !['whole_life','term_life','iul','final_expense','mortgage_protection'].includes(product) ||
      schedule.product !== product || schedule.carrier !== carrier || schedule.agentId !== agentId || schedule.contract !== contract ||
      !validCalendarDay(effectiveOn) ||
      effectiveOn < schedule.effectiveFrom || (schedule.effectiveUntil && effectiveOn > schedule.effectiveUntil))
    return { available: false, reason: 'matching_schedule_required' };
  const bands = (schedule.bands || []).filter(b => age >= b.minAge && age <= b.maxAge);
  if (bands.length !== 1) return {available:false,reason:'unambiguous_age_schedule_required'};
  const {rateBasisPoints,advanceBasisPoints} = bands[0];
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 30000 || !Number.isInteger(advanceBasisPoints) || advanceBasisPoints < 0 || advanceBasisPoints > 10000) invalid('Invalid compensation percentages.');
  const annualPremiumCents = monthlyPremiumCents * 12;
  const commissionCents = Math.round(annualPremiumCents * rateBasisPoints / 10000);
  const advanceCents = Math.round(commissionCents * advanceBasisPoints / 10000);
  return {available:true, estimateOnly:true, annualPremiumCents, commissionCents, advanceCents, rateBasisPoints, advanceBasisPoints,
    revenueRecognizedCents:0, warning:'An estimate is not earned, paid or retained revenue.'};
}
// Exact actual ledger entries only. Quote premium and commission estimates never enter ROI.
export function financialSummary(policies = [], costs = []) {
  const sum = kind => safeSum(policies.flatMap(p => p.financialEntries || []).filter(e => e.verified === true && e.kind === kind && e.currency === 'USD' && Number.isSafeInteger(e.amountCents) && e.amountCents >= 0));
  const cost = kind => safeSum(costs.filter(e => e.verified === true && e.kind === kind && e.currency === 'USD' && Number.isSafeInteger(e.amountCents) && e.amountCents >= 0));
  const earnedCents=sum('earned'), paidCents=sum('paid'), advancedCents=sum('advanced'), chargebackCents=sum('chargeback');
  const vendorCostCents=cost('vendor_lead'), telephonyCostCents=cost('telephony'), totalCostCents=vendorCostCents+telephonyCostCents;
  const netCashCents=Number(BigInt(paidCents)+BigInt(advancedCents)-BigInt(chargebackCents)-BigInt(vendorCostCents)-BigInt(telephonyCostCents));
  if(!Number.isSafeInteger(totalCostCents)||!Number.isSafeInteger(netCashCents)) throw new HttpError(503,'REPORT_LIMIT','This ledger requires higher-precision aggregation.');
  return {currency:'USD', earnedCents,paidCents,advancedCents,chargebackCents,vendorCostCents,telephonyCostCents,
    netCashCents, recordedLedgerNetCents:netCashCents, cashRoi:null, reconciliationRequired:true,
    policyCount:policies.length, policiesWithoutCashEvidence:policies.filter(p=>!(p.financialEntries||[]).some(e=>e.verified===true&&['paid','advanced','chargeback'].includes(e.kind))).length,
    note:'Recorded USD ledger subtotals only. Missing facts are not verified zeroes. Complete cash and cost reconciliation is required before ROI; paid and advanced cash classifications are mutually exclusive.'};
}
export function retention(policies, days, asOf = Date.now()) {
  if (![30,60,90].includes(days)) invalid('Retention window must be 30, 60 or 90 days.');
  const eligible = policies.filter(p=>p.issuedAt && Date.parse(p.issuedAt)+days*86400000<=asOf);
  const verified = eligible.filter(p=>p.retention?.[days]?.verified === true && typeof p.retention[days].active === 'boolean');
  return {days,eligible:eligible.length,verified:verified.length,unknown:eligible.length-verified.length,
    active:verified.filter(p=>p.retention[days].active).length,rate:verified.length ? verified.filter(p=>p.retention[days].active).length/verified.length : null};
}
