-- Isolated fictional-preview dispatcher only. No production email transport.
begin;
do $$ begin if not exists(select from pg_roles where rolname='agency_outbox') then create role agency_outbox nologin noinherit; end if; end $$;
alter table public.notification_outbox drop constraint notification_outbox_status_check;
alter table public.notification_outbox add constraint notification_outbox_status_check check(status in ('pending','leased','sent','failed','suppressed','simulated'));
alter table public.notification_outbox add column lease_token uuid,add column completed_at timestamptz,add column last_error text;
create index notification_available on public.notification_outbox(status,available_at);
create function public.claim_preview_notifications(p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.notification_outbox; result jsonb='[]'::jsonb; token uuid;
begin
 if p_limit is null or p_limit<1 or p_limit>25 then raise exception 'INVALID_LIMIT' using errcode='22023'; end if;
 for r in select o.* from public.notification_outbox o join public.leads l on l.id=o.lead_id and l.agency_id=o.agency_id where l.fictional and ((o.status='pending' and o.available_at<=now()) or (o.status='leased' and o.lease_until<now())) order by o.available_at,o.id limit p_limit for update of o skip locked loop
  if r.attempts>=5 then update public.notification_outbox set status='failed',last_error='RETRY_EXHAUSTED',lease_token=null,lease_until=null where id=r.id; continue; end if;
  if not exists(select 1 from public.leads where id=r.lead_id and agency_id=r.agency_id and fictional and not do_not_contact) then update public.notification_outbox set status='suppressed',last_error='PREVIEW_OR_CONTACT_RESTRICTED',lease_token=null,lease_until=null where id=r.id; continue; end if;
  token=gen_random_uuid();
  update public.notification_outbox set status='leased',lease_token=token,lease_until=now()+interval '2 minutes',attempts=attempts+1 where id=r.id;
  result=result||jsonb_build_array(jsonb_build_object('id',r.id,'leaseToken',token));
 end loop;
 return result;
end $$;
create function public.resolve_preview_notification(p_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.notification_outbox; l public.leads; m public.memberships;
begin
 select * into r from public.notification_outbox where id=p_id and lease_token=p_token and status='leased' and lease_until>now();
 if not found then return null; end if;
 select * into l from public.leads where id=r.lead_id and agency_id=r.agency_id and fictional and not do_not_contact;
 if not found then return null; end if;
 if l.assigned_to is not null then
  select * into m from public.memberships where agency_id=l.agency_id and user_id=l.assigned_to and status='active' and verified and role='agent';
 else
  select * into m from public.memberships where agency_id=l.agency_id and status='active' and verified and role in ('owner','admin') order by case when role='owner' then 0 else 1 end,user_id limit 1;
 end if;
 if m.user_id is null then return null; end if;
 return jsonb_build_object('recipientId',m.user_id,'recipientEmail',m.email,'portalPath','/admin/leads?lead='||l.id::text,'eventId',r.id);
end $$;
create function public.finish_preview_notification(p_id uuid,p_token uuid,p_outcome text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.notification_outbox;
begin
 if p_outcome not in ('simulated','retry','suppressed') or p_outcome is null then raise exception 'INVALID_OUTCOME' using errcode='22023'; end if;
 select * into r from public.notification_outbox where id=p_id and lease_token=p_token and status='leased' and lease_until>now() for update;
 if not found then return false; end if;
 update public.notification_outbox set status=case when p_outcome='retry' then case when attempts>=5 then 'failed' else 'pending' end else p_outcome end,available_at=case when p_outcome='retry' then now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) else available_at end,lease_until=null,lease_token=null,completed_at=case when p_outcome in ('simulated','suppressed') then now() else null end,last_error=case when p_outcome='retry' then 'SINK_FAILURE' when p_outcome='suppressed' then 'AUTHORIZATION_CHANGED' else null end where id=r.id;
 return true;
end $$;
revoke all on function public.claim_preview_notifications(integer),public.resolve_preview_notification(uuid,uuid),public.finish_preview_notification(uuid,uuid,text) from public;
grant usage on schema public to agency_outbox;
grant execute on function public.claim_preview_notifications(integer),public.resolve_preview_notification(uuid,uuid),public.finish_preview_notification(uuid,uuid,text) to agency_outbox;
commit;
