-- First-release Kixie CRM. Apply only as migration owner, never a runtime role.
-- No account bindings, live configuration, outbound transport or customer data are seeded.
begin;
do $$ begin
  if not exists(select from pg_roles where rolname='agency_kixie') then
    create role agency_kixie nologin noinherit;
  end if;
end $$;

-- A distinct restricted LOGIN must be provisioned for each integration tenant.
-- SET ROLE does not change session_user. Never bind the migration owner in production.
create table public.kixie_ingestion_accounts (
  runtime_role name primary key,
  agency_id uuid not null references public.agencies,
  active boolean not null default true
);
create table public.vendor_sources (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies,
  source_key text not null check(length(source_key) between 1 and 100),
  name text not null check(length(name) between 1 and 150),
  active boolean not null default true,
  unique(agency_id,id), unique(agency_id,source_key)
);
create table public.vendor_tracking_numbers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  source_id uuid not null,
  phone text not null check(phone ~ '^\+1[2-9][0-9]{2}55501[0-9]{2}$'),
  effective_from timestamptz not null default now() check(isfinite(effective_from)),
  active boolean not null default true,
  verification_reference text not null check(length(trim(verification_reference)) between 3 and 200),
  unique(agency_id,id), unique(agency_id,phone),
  foreign key(agency_id,source_id) references public.vendor_sources(agency_id,id)
);
create table public.kixie_agent_mappings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  external_agent_id text check(length(external_agent_id) between 1 and 100),
  external_agent_email text check(length(external_agent_email) between 3 and 254),
  user_id uuid not null,
  active boolean not null default true,
  verification_reference text not null check(length(trim(verification_reference)) between 3 and 200),
  check(external_agent_id is not null or external_agent_email is not null),
  unique(agency_id,external_agent_id), unique(agency_id,external_agent_email),
  foreign key(agency_id,user_id) references public.memberships(agency_id,user_id)
);
create table public.kixie_calls (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies,
  external_call_id text not null check(length(external_call_id) between 1 and 150),
  lead_id uuid,
  vendor_source_id uuid,
  tracking_number_id uuid,
  mapped_agent_id uuid,
  direction text not null default 'inbound' check(direction='inbound'),
  status text not null default 'unknown' check(status in ('ringing','answered','missed','unknown')),
  from_number text check(from_number ~ '^\+[1-9][0-9]{7,14}$'),
  to_number text check(to_number ~ '^\+[1-9][0-9]{7,14}$'),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check(duration_seconds between 0 and 86400),
  recording_status text not null default 'not_provided' check(recording_status in ('available_unreviewed','not_provided')),
  consent_status text not null default 'unknown' check(consent_status='unknown'),
  disposition text check(disposition in ('connected','no_answer','voicemail','callback_requested','not_interested','do_not_contact','wrong_number','replied')),
  callback_at timestamptz,
  follow_up_hold boolean not null default true,
  do_not_contact boolean not null default false,
  reply_received boolean not null default false,
  last_event_at timestamptz not null,
  last_event_key text not null,
  lifecycle_rank integer not null default 0 check(lifecycle_rank between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agency_id,id), unique(agency_id,external_call_id),
  foreign key(agency_id,lead_id) references public.leads(agency_id,id),
  foreign key(agency_id,vendor_source_id) references public.vendor_sources(agency_id,id),
  foreign key(agency_id,tracking_number_id) references public.vendor_tracking_numbers(agency_id,id),
  foreign key(agency_id,mapped_agent_id) references public.memberships(agency_id,user_id),
  check(ended_at is null or started_at is null or ended_at>=started_at)
);
create index kixie_calls_agency_time on public.kixie_calls(agency_id,last_event_at desc);
create index kixie_calls_lead on public.kixie_calls(agency_id,lead_id);
-- Only normalized IDs, hashes, type and timestamps: never payloads, phones, email,
-- recording URLs, transcripts, authorization headers, or unreviewed vendor metadata.
create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  call_id uuid not null,
  external_event_id text not null check(length(external_event_id) between 1 and 128),
  event_hash text not null check(event_hash ~ '^[a-f0-9]{64}$'),
  event_type text not null check(event_type in ('startcall','answeredcall','endcall','disposition')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  applied boolean not null,
  normalization_version integer not null default 1 check(normalization_version=1),
  unique(agency_id,external_event_id), unique(agency_id,event_hash),
  foreign key(agency_id,call_id) references public.kixie_calls(agency_id,id)
);
create table public.lead_contact_candidates (
  agency_id uuid not null,
  call_id uuid not null,
  lead_id uuid not null,
  reason text not null default 'phone_only_review' check(reason='phone_only_review'),
  status text not null default 'pending' check(status in ('pending','confirmed','dismissed')),
  created_at timestamptz not null default now(),
  primary key(agency_id,call_id,lead_id),
  foreign key(agency_id,call_id) references public.kixie_calls(agency_id,id),
  foreign key(agency_id,lead_id) references public.leads(agency_id,id)
);
create table public.kixie_call_notes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  call_id uuid not null,
  actor_id uuid not null references auth.users,
  body text not null check(length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key(agency_id,call_id) references public.kixie_calls(agency_id,id)
);
create table public.crm_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  call_id uuid not null,
  lead_id uuid not null,
  task_type text not null default 'callback' check(task_type='callback'),
  channel text not null default 'phone' check(channel='phone'),
  due_at timestamptz not null,
  status text not null check(status in ('held','suppressed','completed','cancelled')),
  hold_reason text not null check(hold_reason in ('live_outbound_disabled','do_not_contact','consent_unknown','replied','manual_hold','not_interested','wrong_number')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agency_id,call_id,task_type),
  foreign key(agency_id,call_id) references public.kixie_calls(agency_id,id),
  foreign key(agency_id,lead_id) references public.leads(agency_id,id)
);
create table public.lead_route_verifications (
  agency_id uuid not null,
  lead_id uuid not null,
  state text not null check(state ~ '^[A-Z]{2}$'),
  product text not null,
  carrier text not null check(length(trim(carrier)) between 1 and 150),
  verification_reference text not null check(length(trim(verification_reference)) between 3 and 200),
  verified_by uuid not null references auth.users,
  verified_at timestamptz not null default now(),
  primary key(agency_id,lead_id),
  foreign key(agency_id,lead_id) references public.leads(agency_id,id)
);
-- Purchased-lead costs and telephony usage are deliberately separate ledgers.
create table public.vendor_lead_costs (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null,
  lead_id uuid not null, source_id uuid not null,
  amount_cents bigint not null check(amount_cents between 0 and 1000000000000),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  reference text not null check(length(trim(reference)) between 3 and 200),
  recorded_by uuid not null references auth.users, created_at timestamptz not null default now(),
  unique(agency_id,reference),
  foreign key(agency_id,lead_id) references public.leads(agency_id,id),
  foreign key(agency_id,source_id) references public.vendor_sources(agency_id,id)
);
create table public.telephony_costs (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null, call_id uuid not null,
  amount_cents bigint not null check(amount_cents between 0 and 1000000000000),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  reference text not null check(length(trim(reference)) between 3 and 200),
  recorded_by uuid not null references auth.users, created_at timestamptz not null default now(),
  unique(agency_id,reference),
  foreign key(agency_id,call_id) references public.kixie_calls(agency_id,id)
);
create table public.compensation_schedules (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null,
  agent_id uuid not null, carrier text not null, product text not null,
  contract_key text not null check(length(trim(contract_key)) between 1 and 150),
  effective_from date not null, effective_until date,
  min_issue_age integer not null check(min_issue_age between 0 and 120),
  max_issue_age integer not null check(max_issue_age between min_issue_age and 120),
  commission_bps integer not null check(commission_bps between 0 and 30000),
  advance_bps integer not null default 7500 check(advance_bps between 0 and 10000),
  verification_reference text not null check(length(trim(verification_reference)) between 3 and 200),
  recorded_by uuid not null references auth.users,
  unique(agency_id,id),
  unique(agency_id,agent_id,carrier,product,contract_key,effective_from,min_issue_age,max_issue_age),
  check(effective_until is null or effective_until>=effective_from),
  foreign key(agency_id,agent_id) references public.memberships(agency_id,user_id)
);
create table public.policy_production (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null,
  lead_id uuid not null, agent_id uuid not null,
  carrier text not null, product text not null, contract_key text not null,
  external_reference text not null check(length(trim(external_reference)) between 3 and 150),
  status text not null check(status in ('draft','qualified','quoted','application','submitted','approved','issued','paid','active','declined','not_taken','cancelled','lapsed')),
  status_verified_at timestamptz, verification_reference text,
  issued_at timestamptz,
  effective_date date, issue_age integer check(issue_age between 0 and 120),
  recorded_by uuid not null references auth.users,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(agency_id,id), unique(agency_id,carrier,external_reference),
  check(status='draft' or (status_verified_at is not null and verification_reference is not null and length(trim(verification_reference))>=3)),
  check(status not in ('issued','paid','active','lapsed') or issued_at is not null),
  check(issued_at is null or status in ('issued','paid','active','lapsed','cancelled')),
  check(issued_at is null or isfinite(issued_at)),
  foreign key(agency_id,lead_id) references public.leads(agency_id,id),
  foreign key(agency_id,agent_id) references public.memberships(agency_id,user_id)
);
create table public.policy_financial_facts (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null, policy_id uuid not null,
  fact_type text not null check(fact_type in ('annualized_premium','commission_earned','commission_advanced','commission_paid','chargeback')),
  amount_cents bigint not null check(amount_cents between 0 and 1000000000000), currency text not null check(currency ~ '^[A-Z]{3}$'),
  verification_reference text not null check(length(trim(verification_reference)) between 3 and 200),
  verified_at timestamptz not null default now(), recorded_by uuid not null references auth.users,
  unique(agency_id,policy_id,fact_type,verification_reference),
  foreign key(agency_id,policy_id) references public.policy_production(agency_id,id)
);
-- One verified cash receipt cannot be counted as both advance and earned payment.
create unique index policy_cash_receipt_unique on public.policy_financial_facts(agency_id,policy_id,verification_reference) where fact_type in ('commission_advanced','commission_paid');
create table public.policy_compensation_estimates (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null, policy_id uuid not null, schedule_id uuid not null,
  annualized_premium_cents bigint not null check(annualized_premium_cents between 0 and 1000000000000),
  estimated_commission_cents bigint not null check(estimated_commission_cents between 0 and 1000000000000),
  estimated_advance_cents bigint not null check(estimated_advance_cents between 0 and 1000000000000),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(), recorded_by uuid not null references auth.users,
  foreign key(agency_id,policy_id) references public.policy_production(agency_id,id),
  foreign key(agency_id,schedule_id) references public.compensation_schedules(agency_id,id)
);

create table public.policy_retention_checks (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null, policy_id uuid not null,
  day_mark integer not null check(day_mark in (30,60,90)),
  cohort_date date not null, observed_on date not null,
  active boolean not null,
  verification_reference text not null check(length(trim(verification_reference)) between 3 and 200),
  verified_at timestamptz not null default now(), recorded_by uuid not null references auth.users,
  unique(agency_id,policy_id,day_mark),
  check(observed_on>=cohort_date+day_mark),
  foreign key(agency_id,policy_id) references public.policy_production(agency_id,id)
);

create function public.agency_owner(a uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.memberships where agency_id=a and user_id=auth.uid() and status='active' and role='owner');
$$;
create function public.can_read_kixie_call(a uuid,c uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.kixie_calls k where k.agency_id=a and k.id=c and
    (public.agency_owner(a) or (k.lead_id is not null and public.visible_lead(a,k.lead_id))));
$$;
create function public.can_read_policy(a uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.policy_production r where r.agency_id=a and r.id=p and public.visible_lead(a,r.lead_id));
$$;
create function public.reject_immutable_crm_change() returns trigger language plpgsql set search_path='' as $$
  begin raise exception 'IMMUTABLE_CRM_RECORD' using errcode='42501'; end;
$$;
create trigger integration_events_immutable before update or delete on public.integration_events for each row execute function public.reject_immutable_crm_change();
create trigger kixie_notes_immutable before update or delete on public.kixie_call_notes for each row execute function public.reject_immutable_crm_change();
create trigger financial_facts_immutable before update or delete on public.policy_financial_facts for each row execute function public.reject_immutable_crm_change();

do $$ declare t text; begin
  foreach t in array array['kixie_ingestion_accounts','vendor_sources','vendor_tracking_numbers','kixie_agent_mappings','kixie_calls','integration_events','lead_contact_candidates','kixie_call_notes','crm_follow_up_tasks','lead_route_verifications','vendor_lead_costs','telephony_costs','compensation_schedules','policy_production','policy_financial_facts','policy_compensation_estimates','policy_retention_checks'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated, agency_intake, agency_outbox, agency_kixie',t);
    if t<>'kixie_ingestion_accounts' then execute format('grant select on public.%I to authenticated',t); end if;
  end loop;
end $$;
create policy vendor_sources_read on public.vendor_sources for select to authenticated using(public.agency_admin(agency_id));
create policy tracking_read on public.vendor_tracking_numbers for select to authenticated using(public.agency_admin(agency_id));
create policy agent_mapping_read on public.kixie_agent_mappings for select to authenticated using(public.agency_admin(agency_id));
create policy calls_read on public.kixie_calls for select to authenticated using(public.can_read_kixie_call(agency_id,id));
create policy integration_events_read on public.integration_events for select to authenticated using(public.agency_owner(agency_id));
-- Candidate identities are owner-only until an explicit identity review; assignment
-- to a matched lead never leaks an unlinked caller or a different candidate person.
create policy candidates_read on public.lead_contact_candidates for select to authenticated using(public.agency_owner(agency_id));
create policy call_notes_read on public.kixie_call_notes for select to authenticated using(public.can_read_kixie_call(agency_id,call_id));
create policy follow_up_read on public.crm_follow_up_tasks for select to authenticated using(public.visible_lead(agency_id,lead_id) and public.can_read_kixie_call(agency_id,call_id));
create policy route_verifications_read on public.lead_route_verifications for select to authenticated using(public.agency_admin(agency_id));
create policy vendor_costs_read on public.vendor_lead_costs for select to authenticated using(public.agency_admin(agency_id));
create policy telephony_costs_read on public.telephony_costs for select to authenticated using(public.agency_admin(agency_id));
create policy compensation_read on public.compensation_schedules for select to authenticated using(public.agency_admin(agency_id));
create policy production_read on public.policy_production for select to authenticated using(public.visible_lead(agency_id,lead_id));
create policy financial_facts_read on public.policy_financial_facts for select to authenticated using(public.agency_admin(agency_id));
create policy retention_read on public.policy_retention_checks for select to authenticated using(public.agency_admin(agency_id));
create policy estimates_read on public.policy_compensation_estimates for select to authenticated using(public.agency_admin(agency_id));

-- Private helper; all tasks remain held or suppressed. There is intentionally no
-- outbound claim/send function or notification_outbox insertion in this migration.
create function public.refresh_kixie_follow_up(p_call uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.kixie_calls; l public.leads; reason text; task_status text;
begin
  select * into c from public.kixie_calls where id=p_call for update;
  if not found or c.lead_id is null then return; end if;
  -- Serialize the decision and task write with the existing lead opt-out trigger.
  select * into l from public.leads where agency_id=c.agency_id and id=c.lead_id for update;
  reason:=case when l.do_not_contact or c.do_not_contact then 'do_not_contact'
    when c.reply_received then 'replied'
    when c.disposition in ('replied','not_interested','wrong_number') then c.disposition
    when (select e.contact from public.consent_events e where e.agency_id=l.agency_id and e.lead_id=l.id order by e.created_at desc,e.id desc limit 1) is distinct from true then 'consent_unknown'
    when c.follow_up_hold then 'manual_hold' else 'live_outbound_disabled' end;
  task_status:=case when reason in ('do_not_contact','replied','not_interested','wrong_number') then 'suppressed' else 'held' end;
  if c.callback_at is null then
    update public.crm_follow_up_tasks set status=case when task_status='suppressed' then 'suppressed' else 'cancelled' end,hold_reason=reason,updated_at=now() where agency_id=c.agency_id and call_id=c.id and status in ('held','suppressed');
    return;
  end if;
  insert into public.crm_follow_up_tasks(agency_id,call_id,lead_id,due_at,status,hold_reason)
    values(c.agency_id,c.id,c.lead_id,c.callback_at,task_status,reason)
    on conflict(agency_id,call_id,task_type) do update set due_at=excluded.due_at,status=excluded.status,hold_reason=excluded.hold_reason,updated_at=now();
end $$;
-- An opt-out through the existing lead RPC suppresses existing tasks atomically.
create function public.suppress_crm_follow_ups() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.do_not_contact then update public.crm_follow_up_tasks set status='suppressed',hold_reason='do_not_contact',updated_at=now() where agency_id=new.agency_id and lead_id=new.id and status='held'; end if;
  return new;
end $$;
create trigger lead_opt_out_crm after update of do_not_contact on public.leads for each row execute function public.suppress_crm_follow_ups();

create function public.ingest_kixie_event(p_agency uuid,p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c public.kixie_calls; prior public.integration_events; event_uuid uuid; source_uuid uuid; tracking_uuid uuid; agent_uuid uuid;
  event_time timestamptz; rate_hits integer; started timestamptz; ended timestamptz; stage integer; applied boolean; status_value text;
begin
  if exists(select 1 from pg_catalog.pg_roles r where r.rolname=session_user and (r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication)) or
    exists(select 1 from pg_catalog.pg_class rel join pg_catalog.pg_namespace ns on ns.oid=rel.relnamespace where ns.nspname='public' and rel.relkind in ('r','p','v','m','f') and pg_catalog.has_table_privilege(session_user,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    then raise exception 'UNSAFE_INTEGRATION_ROLE' using errcode='42501'; end if;
  if not exists(select 1 from public.kixie_ingestion_accounts where runtime_role=session_user and agency_id=p_agency and active) then raise exception 'INTEGRATION_AGENCY_FORBIDDEN' using errcode='42501'; end if;
  if p_event is null or jsonb_typeof(p_event)<>'object' or
    exists(select 1 from jsonb_object_keys(p_event) k where k not in ('eventId','eventHash','callId','eventType','occurredAt','startedAt','endedAt','direction','status','fromNumber','toNumber','trackingNumber','kixieAgentId','externalAgentEmail','durationSeconds','disposition','recordingStatus','consentStatus')) or
    nullif(p_event->>'eventId','') is null or length(p_event->>'eventId')>128 or
    (p_event->>'eventHash') is null or (p_event->>'eventHash')!~'^[a-f0-9]{64}$' or
    nullif(p_event->>'callId','') is null or length(p_event->>'callId')>150 or
    (p_event->>'eventType') is null or (p_event->>'eventType') not in ('startcall','answeredcall','endcall','disposition') or
    (p_event->>'direction') is distinct from 'inbound' or
    (p_event->>'status') is null or (p_event->>'status') not in ('ringing','answered','missed','unknown') or
    (p_event->>'occurredAt') is null or (p_event->>'occurredAt')!~'(Z|\+00:00)$' or
    (p_event->>'consentStatus') is distinct from 'unknown' or
    (p_event->>'recordingStatus') is null or (p_event->>'recordingStatus') not in ('available_unreviewed','not_provided')
  then raise exception 'INVALID_KIXIE_EVENT' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(p_event) e where e.key in ('fromNumber','toNumber','trackingNumber') and e.value<>'null'::jsonb and (e.value#>>'{}')!~'^\+[1-9][0-9]{7,14}$') or
    exists(select 1 from jsonb_each(p_event) e where e.key in ('startedAt','endedAt') and e.value<>'null'::jsonb and (e.value#>>'{}')!~'(Z|\+00:00)$') or
    (p_event->>'kixieAgentId' is not null and length(p_event->>'kixieAgentId') not between 1 and 100) or
    (p_event->>'externalAgentEmail' is not null and length(p_event->>'externalAgentEmail') not between 3 and 254) or
    (p_event->>'disposition' is not null and p_event->>'disposition' not in ('connected','no_answer','voicemail','callback_requested','not_interested','do_not_contact','wrong_number','replied'))
  then raise exception 'INVALID_KIXIE_EVENT' using errcode='22023'; end if;
  event_time:=(p_event->>'occurredAt')::timestamptz;
  started:=(p_event->>'startedAt')::timestamptz; ended:=(p_event->>'endedAt')::timestamptz;
  if not isfinite(event_time) or (started is not null and not isfinite(started)) or (ended is not null and not isfinite(ended)) then raise exception 'INVALID_KIXIE_EVENT' using errcode='22023'; end if;
  -- This migration is preview-only, independently of HTTP adapter settings.
  if p_event->>'fromNumber' is null or p_event->>'toNumber' is null or
    p_event->>'fromNumber'!~'^\+1[2-9][0-9]{2}55501[0-9]{2}$' or
    p_event->>'toNumber'!~'^\+1[2-9][0-9]{2}55501[0-9]{2}$' or
    (p_event->>'trackingNumber' is not null and p_event->>'trackingNumber'!~'^\+1[2-9][0-9]{2}55501[0-9]{2}$') or
    (p_event->>'externalAgentEmail' is not null and p_event->>'externalAgentEmail'!~*'^[^[:space:]@]+@example\.(invalid|test)$')
    then raise exception 'KIXIE_FICTIONAL_ONLY' using errcode='22023'; end if;
  -- Serialize both event replay and all updates for one call.
  perform pg_advisory_xact_lock(hashtextextended(p_agency::text||':event:'||(p_event->>'eventId'),0));
  select * into prior from public.integration_events where agency_id=p_agency and external_event_id=p_event->>'eventId';
  if found then
    if prior.event_hash is distinct from p_event->>'eventHash' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
    return jsonb_build_object('callId',prior.call_id,'eventId',prior.id,'replayed',true,'applied',prior.applied);
  end if;
  if event_time<now()-interval '7 days' or event_time>now()+interval '5 minutes' then raise exception 'KIXIE_EVENT_AGE' using errcode='22023'; end if;
  if exists(select 1 from public.integration_events where agency_id=p_agency and event_hash=p_event->>'eventHash') then raise exception 'EVENT_HASH_CONFLICT' using errcode='23505'; end if;
  -- Persistent per-agency bound; duplicate replay above consumes no budget.
  insert into public.rate_buckets(bucket,hits,expires_at) values('kixie:'||p_agency::text,1,now()+interval '1 minute')
    on conflict(bucket) do update set hits=case when public.rate_buckets.expires_at<=now() then 1 else public.rate_buckets.hits+1 end,expires_at=case when public.rate_buckets.expires_at<=now() then now()+interval '1 minute' else public.rate_buckets.expires_at end returning hits into rate_hits;
  if rate_hits>500 then raise exception 'RATE_LIMITED' using errcode='54000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_agency::text||':call:'||(p_event->>'callId'),0));
  select t.id,t.source_id into tracking_uuid,source_uuid from public.vendor_tracking_numbers t join public.vendor_sources s on s.agency_id=t.agency_id and s.id=t.source_id
    where t.agency_id=p_agency and t.phone=coalesce(p_event->>'trackingNumber',p_event->>'toNumber') and t.active and s.active and started>=t.effective_from;
  -- Mapping identifies who handled a call; it never changes lead assignment.
  select m.user_id into agent_uuid from public.kixie_agent_mappings m join public.memberships u on u.agency_id=m.agency_id and u.user_id=m.user_id
    where m.agency_id=p_agency and m.active and u.status='active' and u.role='agent' and u.verified and
      ((p_event->>'kixieAgentId' is not null and m.external_agent_id=p_event->>'kixieAgentId') or
       (p_event->>'kixieAgentId' is null and p_event->>'externalAgentEmail' is not null and m.external_agent_email=lower(p_event->>'externalAgentEmail')))
    order by m.id limit 1;
  stage:=case p_event->>'eventType' when 'startcall' then 1 when 'answeredcall' then 2 when 'endcall' then 3 else 0 end;
  status_value:=case when p_event->>'eventType'='startcall' then 'ringing' else p_event->>'status' end;
  select * into c from public.kixie_calls where agency_id=p_agency and external_call_id=p_event->>'callId' for update;
  if not found then
    insert into public.kixie_calls(agency_id,external_call_id,vendor_source_id,tracking_number_id,mapped_agent_id,status,from_number,to_number,started_at,ended_at,duration_seconds,recording_status,disposition,last_event_at,last_event_key,lifecycle_rank)
      values(p_agency,p_event->>'callId',source_uuid,tracking_uuid,agent_uuid,status_value,p_event->>'fromNumber',p_event->>'toNumber',started,ended,(p_event->>'durationSeconds')::integer,p_event->>'recordingStatus',p_event->>'disposition',event_time,p_event->>'eventId',stage) returning * into c;
    applied:=true;
  else
    applied:=(event_time>c.last_event_at or (event_time=c.last_event_at and (stage>c.lifecycle_rank or (stage=c.lifecycle_rank and p_event->>'eventId'>c.last_event_key)))) and (stage=0 or stage>=c.lifecycle_rank);
    if applied then
      update public.kixie_calls set
        -- Preserve first-observed attribution, including an unknown source.
        mapped_agent_id=coalesce(agent_uuid,mapped_agent_id),
        status=case when stage=0 or status_value='unknown' or (status='answered' and status_value='missed') then status else status_value end,
        from_number=coalesce(from_number,p_event->>'fromNumber'),to_number=coalesce(to_number,p_event->>'toNumber'),
        started_at=coalesce(started_at,started),ended_at=greatest(ended,ended_at),duration_seconds=greatest(duration_seconds,(p_event->>'durationSeconds')::integer),
        recording_status=case when p_event->>'recordingStatus'='available_unreviewed' then 'available_unreviewed' else recording_status end,
        disposition=coalesce(p_event->>'disposition',disposition),last_event_at=event_time,last_event_key=p_event->>'eventId',lifecycle_rank=greatest(stage,lifecycle_rank),updated_at=now()
        where id=c.id returning * into c;
    elsif p_event->>'eventType'='answeredcall' and status_value='answered' and c.status<>'answered' then
      -- A delayed answer event is positive evidence, even after an end event
      -- reported an unknown/missed outcome. It cannot move the lifecycle clock
      -- backward, erase terminal time, or change source/identity/disposition.
      update public.kixie_calls set status='answered',updated_at=now() where id=c.id returning * into c;
      applied:=true;
    end if;
  end if;
  insert into public.integration_events(agency_id,call_id,external_event_id,event_hash,event_type,occurred_at,applied)
    values(p_agency,c.id,p_event->>'eventId',p_event->>'eventHash',p_event->>'eventType',event_time,applied) returning id into event_uuid;
  if c.lead_id is null and c.from_number is not null then
    insert into public.lead_contact_candidates(agency_id,call_id,lead_id)
      select p_agency,c.id,l.id from public.leads l where l.agency_id=p_agency and
        regexp_replace(l.phone,'[^+0-9]','','g')=c.from_number order by l.id limit 50
      on conflict do nothing;
  end if;
  -- Opt-outs and replies are sticky even if their event arrives out of order.
  if p_event->>'disposition' in ('do_not_contact','replied') then
    update public.kixie_calls set do_not_contact=do_not_contact or p_event->>'disposition'='do_not_contact',reply_received=reply_received or p_event->>'disposition'='replied',follow_up_hold=true where id=c.id returning * into c;
  end if;
  if c.lead_id is not null then
    if c.do_not_contact then update public.leads set do_not_contact=true,updated_at=now() where agency_id=p_agency and id=c.lead_id; end if;
    perform public.refresh_kixie_follow_up(c.id);
  end if;
  return jsonb_build_object('callId',c.id,'eventId',event_uuid,'replayed',false,'applied',applied);
end $$;

create function public.configure_kixie_source(p_agency uuid,p_key text,p_name text,p_phone text,p_reference text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.vendor_sources; t public.vendor_tracking_numbers;
begin
  if not public.agency_admin(p_agency) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_phone is not null and p_phone!~'^\+1[2-9][0-9]{2}55501[0-9]{2}$' then raise exception 'KIXIE_FICTIONAL_ONLY' using errcode='22023'; end if;
  insert into public.vendor_sources(agency_id,source_key,name) values(p_agency,p_key,p_name)
    on conflict(agency_id,source_key) do update set name=excluded.name returning * into s;
  if p_phone is not null then
    insert into public.vendor_tracking_numbers(agency_id,source_id,phone,verification_reference) values(p_agency,s.id,p_phone,p_reference)
      on conflict(agency_id,phone) do update set verification_reference=excluded.verification_reference where public.vendor_tracking_numbers.source_id=excluded.source_id returning * into t;
    if not found then raise exception 'TRACKING_NUMBER_SOURCE_CONFLICT' using errcode='23505'; end if;
  end if;
  return jsonb_build_object('sourceId',s.id,'trackingNumberId',t.id);
end $$;
create function public.map_kixie_agent(p_agency uuid,p_user uuid,p_external_agent_id text,p_external_email text,p_reference text) returns public.kixie_agent_mappings language plpgsql security definer set search_path='' as $$
declare m public.kixie_agent_mappings;
begin
  if not public.agency_admin(p_agency) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if not exists(select 1 from public.memberships where agency_id=p_agency and user_id=p_user and role='agent' and status='active' and verified) then raise exception 'AGENT_INELIGIBLE' using errcode='22023'; end if;
  if p_external_email is not null and p_external_email!~*'^[^[:space:]@]+@example\.(invalid|test)$' then raise exception 'KIXIE_FICTIONAL_ONLY' using errcode='22023'; end if;
  insert into public.kixie_agent_mappings(agency_id,user_id,external_agent_id,external_agent_email,verification_reference)
    values(p_agency,p_user,p_external_agent_id,lower(trim(p_external_email)),p_reference) returning * into m;
  return m;
end $$;
create function public.link_kixie_call(p_call uuid,p_lead uuid,p_reason text) returns public.kixie_calls language plpgsql security definer set search_path='' as $$
declare c public.kixie_calls; l public.leads;
begin
  select * into c from public.kixie_calls where id=p_call for update;
  if not found or not public.agency_owner(c.agency_id) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  select * into l from public.leads where id=p_lead and agency_id=c.agency_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if not l.fictional then raise exception 'KIXIE_FICTIONAL_ONLY' using errcode='22023'; end if;
  if p_reason is null or length(trim(p_reason)) not between 8 and 500 then raise exception 'IDENTITY_REVIEW_REQUIRED' using errcode='22023'; end if;
  if c.lead_id is not null and c.lead_id<>l.id then raise exception 'CALL_ALREADY_LINKED' using errcode='23505'; end if;
  if c.lead_id=l.id then return c; end if;
  update public.kixie_calls set lead_id=l.id,updated_at=now() where id=c.id returning * into c;
  update public.lead_contact_candidates set status=case when lead_id=l.id then 'confirmed' else 'dismissed' end where agency_id=c.agency_id and call_id=c.id;
  insert into public.lead_events(agency_id,lead_id,actor_id,event,detail) values(c.agency_id,l.id,auth.uid(),'kixie_identity_linked',jsonb_build_object('callId',c.id,'reason',p_reason));
  if c.do_not_contact then update public.leads set do_not_contact=true,updated_at=now() where id=l.id; end if;
  perform public.refresh_kixie_follow_up(c.id);
  return c;
end $$;
create function public.update_kixie_call(p_call uuid,p_patch jsonb) returns public.kixie_calls language plpgsql security definer set search_path='' as $$
declare c public.kixie_calls;
begin
  select * into c from public.kixie_calls where id=p_call for update;
  if not found then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  -- Serialize authorization against a concurrent reassignment/disable.
  if c.lead_id is not null then perform 1 from public.leads where agency_id=c.agency_id and id=c.lead_id for update; end if;
  perform 1 from public.memberships where agency_id=c.agency_id and user_id=auth.uid() for share;
  if not public.can_read_kixie_call(c.agency_id,c.id) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb or
    exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('disposition','note','callback_at','follow_up_hold')) or
    (p_patch?'disposition' and (p_patch->>'disposition' is null or p_patch->>'disposition' not in ('connected','no_answer','voicemail','callback_requested','not_interested','do_not_contact','wrong_number','replied'))) or
    (p_patch?'note' and (p_patch->>'note' is null or length(trim(p_patch->>'note')) not between 1 and 2000)) or
    (p_patch?'follow_up_hold' and jsonb_typeof(p_patch->'follow_up_hold')<>'boolean') or
    (p_patch->>'callback_at' is not null and (p_patch->>'callback_at')!~'(Z|[+-][0-9]{2}:[0-9]{2})$')
    then raise exception 'INVALID_CALL_PATCH' using errcode='22023'; end if;
  update public.kixie_calls set disposition=coalesce(p_patch->>'disposition',disposition),
    do_not_contact=do_not_contact or coalesce(p_patch->>'disposition'='do_not_contact',false),
    reply_received=reply_received or coalesce(p_patch->>'disposition'='replied',false),
    callback_at=case when p_patch?'callback_at' then (p_patch->>'callback_at')::timestamptz else callback_at end,
    follow_up_hold=case when p_patch->>'disposition' in ('replied','do_not_contact','not_interested','wrong_number') then true when p_patch?'follow_up_hold' then (p_patch->>'follow_up_hold')::boolean else follow_up_hold end,
    updated_at=now() where id=c.id returning * into c;
  if p_patch?'note' then insert into public.kixie_call_notes(agency_id,call_id,actor_id,body) values(c.agency_id,c.id,auth.uid(),p_patch->>'note'); end if;
  if c.lead_id is not null then
    if c.do_not_contact then update public.leads set do_not_contact=true,updated_at=now() where agency_id=c.agency_id and id=c.lead_id; end if;
    insert into public.lead_events(agency_id,lead_id,actor_id,event,detail) values(c.agency_id,c.lead_id,auth.uid(),'kixie_call_updated',jsonb_build_object('callId',c.id,'disposition',c.disposition,'callbackAt',c.callback_at,'followUpHold',c.follow_up_hold));
    perform public.refresh_kixie_follow_up(c.id);
  end if;
  return c;
end $$;
create function public.verify_lead_routing(p_lead uuid,p_state text,p_product text,p_carrier text,p_reference text) returns public.lead_route_verifications language plpgsql security definer set search_path='' as $$
declare l public.leads; v public.lead_route_verifications;
begin
  select * into l from public.leads where id=p_lead for update;
  if not found or not public.agency_admin(l.agency_id) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  -- These inputs are verified residency and intended coverage, never caller area code.
  update public.leads set state=p_state,product=p_product,carrier=p_carrier,updated_at=now() where id=l.id;
  insert into public.lead_route_verifications(agency_id,lead_id,state,product,carrier,verification_reference,verified_by)
    values(l.agency_id,l.id,p_state,p_product,p_carrier,p_reference,auth.uid())
    on conflict(agency_id,lead_id) do update set state=excluded.state,product=excluded.product,carrier=excluded.carrier,verification_reference=excluded.verification_reference,verified_by=excluded.verified_by,verified_at=now() returning * into v;
  insert into public.lead_events(agency_id,lead_id,actor_id,event,detail) values(l.agency_id,l.id,auth.uid(),'routing_verified',jsonb_build_object('state',p_state,'product',p_product,'carrier',p_carrier,'reference',p_reference));
  return v;
end $$;
-- The existing assignment RPC remains unchanged. This invariant also protects
-- its legacy API path whenever the lead has been linked to a Kixie call.
create function public.enforce_kixie_route_verification() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.kixie_calls c where c.agency_id=new.agency_id and c.lead_id=new.id) and
    not exists(select 1 from public.lead_route_verifications v where v.agency_id=new.agency_id and v.lead_id=new.id and v.state=new.state and v.product=new.product and v.carrier=new.carrier)
    then raise exception 'ROUTING_FACTS_UNVERIFIED' using errcode='22023'; end if;
  return new;
end $$;
create trigger kixie_assignment_verified before update of assigned_to on public.leads for each row when (old.assigned_to is distinct from new.assigned_to) execute function public.enforce_kixie_route_verification();
create function public.route_kixie_call(p_call uuid,p_agent uuid,p_expected uuid,p_reason text) returns public.leads language plpgsql security definer set search_path='' as $$
declare c public.kixie_calls; l public.leads;
begin
  select * into c from public.kixie_calls where id=p_call for share;
  if not found or not public.agency_admin(c.agency_id) or c.lead_id is null then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  select * into l from public.leads where agency_id=c.agency_id and id=c.lead_id for update;
  if not exists(select 1 from public.lead_route_verifications v where v.agency_id=l.agency_id and v.lead_id=l.id and v.state=l.state and v.product=l.product and v.carrier=l.carrier) then raise exception 'ROUTING_FACTS_UNVERIFIED' using errcode='22023'; end if;
  return public.assign_lead(l.id,p_agent,p_expected,p_reason);
end $$;

create function public.record_crm_cost(p_agency uuid,p_kind text,p_target uuid,p_source uuid,p_amount_cents bigint,p_currency text,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not public.agency_admin(p_agency) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_kind='vendor_lead' then
    insert into public.vendor_lead_costs(agency_id,lead_id,source_id,amount_cents,currency,reference,recorded_by) values(p_agency,p_target,p_source,p_amount_cents,p_currency,p_reference,auth.uid()) returning id into result;
  elsif p_kind='telephony' and p_source is null then
    insert into public.telephony_costs(agency_id,call_id,amount_cents,currency,reference,recorded_by) values(p_agency,p_target,p_amount_cents,p_currency,p_reference,auth.uid()) returning id into result;
  else raise exception 'INVALID_COST_KIND' using errcode='22023'; end if;
  return result;
end $$;
create function public.create_compensation_schedule(p_agency uuid,p_data jsonb) returns public.compensation_schedules language plpgsql security definer set search_path='' as $$
declare r public.compensation_schedules;
begin
  if not public.agency_admin(p_agency) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('agent_id','carrier','product','contract_key','effective_from','effective_until','min_issue_age','max_issue_age','commission_bps','advance_bps','verification_reference')) then raise exception 'INVALID_SCHEDULE' using errcode='22023'; end if;
  if not exists(select 1 from public.memberships where agency_id=p_agency and user_id=(p_data->>'agent_id')::uuid and role='agent' and status='active' and verified) then raise exception 'AGENT_INELIGIBLE' using errcode='22023'; end if;
  insert into public.compensation_schedules(agency_id,agent_id,carrier,product,contract_key,effective_from,effective_until,min_issue_age,max_issue_age,commission_bps,advance_bps,verification_reference,recorded_by)
    values(p_agency,(p_data->>'agent_id')::uuid,p_data->>'carrier',p_data->>'product',p_data->>'contract_key',(p_data->>'effective_from')::date,(p_data->>'effective_until')::date,(p_data->>'min_issue_age')::integer,(p_data->>'max_issue_age')::integer,(p_data->>'commission_bps')::integer,coalesce((p_data->>'advance_bps')::integer,7500),p_data->>'verification_reference',auth.uid()) returning * into r;
  return r;
end $$;
-- A human-verified policy record is the only source of policy production. Call
-- outcomes, duration, dispositions and lead.status='sold' are never consulted.
create function public.record_policy_production(p_agency uuid,p_data jsonb) returns public.policy_production language plpgsql security definer set search_path='' as $$
declare r public.policy_production;
begin
  if not public.agency_admin(p_agency) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('lead_id','agent_id','carrier','product','contract_key','external_reference','status','verification_reference','issued_at','effective_date','issue_age')) then raise exception 'INVALID_PRODUCTION' using errcode='22023'; end if;
  if not exists(select 1 from public.memberships where agency_id=p_agency and user_id=(p_data->>'agent_id')::uuid and role='agent' and status='active' and verified) then raise exception 'AGENT_INELIGIBLE' using errcode='22023'; end if;
  if p_data->>'issued_at' is not null and ((p_data->>'issued_at')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' or not isfinite((p_data->>'issued_at')::timestamptz) or (p_data->>'issued_at')::timestamptz>now()) then raise exception 'INVALID_ISSUANCE_TIME' using errcode='22023'; end if;
  if exists(select 1 from public.policy_production p where p.agency_id=p_agency and p.carrier=p_data->>'carrier' and p.external_reference=p_data->>'external_reference' and p.issued_at is not null and p_data->>'issued_at' is not null and p.issued_at<>(p_data->>'issued_at')::timestamptz) then raise exception 'ISSUANCE_IMMUTABLE' using errcode='22023'; end if;
  insert into public.policy_production(agency_id,lead_id,agent_id,carrier,product,contract_key,external_reference,status,status_verified_at,verification_reference,issued_at,effective_date,issue_age,recorded_by)
    values(p_agency,(p_data->>'lead_id')::uuid,(p_data->>'agent_id')::uuid,p_data->>'carrier',p_data->>'product',p_data->>'contract_key',p_data->>'external_reference',p_data->>'status',case when p_data->>'status'<>'draft' then now() end,p_data->>'verification_reference',(p_data->>'issued_at')::timestamptz,(p_data->>'effective_date')::date,(p_data->>'issue_age')::integer,auth.uid())
    on conflict(agency_id,carrier,external_reference) do update set status=excluded.status,status_verified_at=excluded.status_verified_at,verification_reference=excluded.verification_reference,issued_at=coalesce(public.policy_production.issued_at,excluded.issued_at),effective_date=excluded.effective_date,issue_age=excluded.issue_age,updated_at=now()
    where public.policy_production.lead_id=excluded.lead_id and public.policy_production.agent_id=excluded.agent_id and public.policy_production.product=excluded.product and public.policy_production.contract_key=excluded.contract_key returning * into r;
  if not found then raise exception 'POLICY_IDENTITY_CONFLICT' using errcode='23505'; end if;
  return r;
end $$;
create function public.record_policy_financial_fact(p_policy uuid,p_type text,p_amount_cents bigint,p_currency text,p_reference text) returns public.policy_financial_facts language plpgsql security definer set search_path='' as $$
declare p public.policy_production; r public.policy_financial_facts;
begin
  select * into p from public.policy_production where id=p_policy for share;
  if not found or not public.agency_admin(p.agency_id) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if p.status='draft' then raise exception 'POLICY_UNVERIFIED' using errcode='22023'; end if;
  insert into public.policy_financial_facts(agency_id,policy_id,fact_type,amount_cents,currency,verification_reference,recorded_by) values(p.agency_id,p.id,p_type,p_amount_cents,p_currency,p_reference,auth.uid()) returning * into r;
  return r;
end $$;
create function public.estimate_policy_compensation(p_policy uuid,p_schedule uuid,p_annualized_premium_cents bigint,p_currency text) returns public.policy_compensation_estimates language plpgsql security definer set search_path='' as $$
declare p public.policy_production; s public.compensation_schedules; r public.policy_compensation_estimates;
begin
  select * into p from public.policy_production where id=p_policy for share;
  if not found or not public.agency_admin(p.agency_id) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  select * into s from public.compensation_schedules where agency_id=p.agency_id and id=p_schedule;
  if not found or s.agent_id<>p.agent_id or s.carrier<>p.carrier or s.product<>p.product or s.contract_key<>p.contract_key or p.effective_date is null or p.issue_age is null or p.effective_date<s.effective_from or (s.effective_until is not null and p.effective_date>s.effective_until) or p.issue_age not between s.min_issue_age and s.max_issue_age then raise exception 'SCHEDULE_INELIGIBLE' using errcode='22023'; end if;
  insert into public.policy_compensation_estimates(agency_id,policy_id,schedule_id,annualized_premium_cents,estimated_commission_cents,estimated_advance_cents,currency,recorded_by)
    values(p.agency_id,p.id,s.id,p_annualized_premium_cents,round(p_annualized_premium_cents::numeric*s.commission_bps/10000)::bigint,round(round(p_annualized_premium_cents::numeric*s.commission_bps/10000)*s.advance_bps/10000)::bigint,p_currency,auth.uid()) returning * into r;
  return r;
end $$;

create function public.record_policy_retention(p_policy uuid,p_day_mark integer,p_observed_on date,p_active boolean,p_reference text) returns public.policy_retention_checks language plpgsql security definer set search_path='' as $$
declare p public.policy_production; r public.policy_retention_checks;
begin
  select * into p from public.policy_production where id=p_policy for share;
  if not found or not public.agency_admin(p.agency_id) then raise exception 'NOT_FOUND' using errcode='42501'; end if;
  if p.issued_at is null or p.status not in ('issued','paid','active','lapsed','cancelled') or p_observed_on>current_date then raise exception 'RETENTION_UNVERIFIED' using errcode='22023'; end if;
  insert into public.policy_retention_checks(agency_id,policy_id,day_mark,cohort_date,observed_on,active,verification_reference,recorded_by)
    values(p.agency_id,p.id,p_day_mark,(p.issued_at at time zone 'UTC')::date,p_observed_on,p_active,p_reference,auth.uid()) returning * into r;
  return r;
end $$;

-- Every new function is closed by default, including private definer helpers.
revoke all on function public.agency_owner(uuid),public.can_read_kixie_call(uuid,uuid),public.can_read_policy(uuid,uuid),public.reject_immutable_crm_change(),public.enforce_kixie_route_verification(),public.refresh_kixie_follow_up(uuid),public.suppress_crm_follow_ups(),public.ingest_kixie_event(uuid,jsonb),public.configure_kixie_source(uuid,text,text,text,text),public.map_kixie_agent(uuid,uuid,text,text,text),public.link_kixie_call(uuid,uuid,text),public.update_kixie_call(uuid,jsonb),public.verify_lead_routing(uuid,text,text,text,text),public.route_kixie_call(uuid,uuid,uuid,text),public.record_crm_cost(uuid,text,uuid,uuid,bigint,text,text),public.create_compensation_schedule(uuid,jsonb),public.record_policy_production(uuid,jsonb),public.record_policy_financial_fact(uuid,text,bigint,text,text),public.estimate_policy_compensation(uuid,uuid,bigint,text),public.record_policy_retention(uuid,integer,date,boolean,text) from public;
grant usage on schema public to agency_kixie;
grant execute on function public.ingest_kixie_event(uuid,jsonb) to agency_kixie;
grant execute on function public.agency_owner(uuid),public.can_read_kixie_call(uuid,uuid),public.can_read_policy(uuid,uuid),public.configure_kixie_source(uuid,text,text,text,text),public.map_kixie_agent(uuid,uuid,text,text,text),public.link_kixie_call(uuid,uuid,text),public.update_kixie_call(uuid,jsonb),public.verify_lead_routing(uuid,text,text,text,text),public.route_kixie_call(uuid,uuid,uuid,text),public.record_crm_cost(uuid,text,uuid,uuid,bigint,text,text),public.create_compensation_schedule(uuid,jsonb),public.record_policy_production(uuid,jsonb),public.record_policy_financial_fact(uuid,text,bigint,text,text),public.estimate_policy_compensation(uuid,uuid,bigint,text),public.record_policy_retention(uuid,integer,date,boolean,text) to authenticated;
commit;
