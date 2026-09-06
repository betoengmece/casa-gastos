create extension if not exists pgcrypto with schema extensions;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Casa',
  token_hash text not null unique,
  created_at timestamptz not null default now()
);

create table public.household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  person text not null check (person in ('Beto', 'Mari')),
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  spent_at date not null,
  category text not null,
  person text not null check (person in ('Beto', 'Mari', 'Beto + Mari')),
  author text not null check (author in ('Beto', 'Mari')),
  payment text not null check (payment in ('Pix', 'Débito', 'Crédito', 'Dinheiro', 'Outro')),
  note text not null default '',
  installment integer not null default 1,
  installment_count integer not null default 1,
  series_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  expense_id uuid not null,
  action text not null,
  author text not null,
  summary text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index idx_expenses_household_updated on public.expenses(household_id, updated_at desc);
create index idx_expenses_household_spent on public.expenses(household_id, spent_at desc) where deleted_at is null;
create index idx_audit_expense_created on public.audit_logs(expense_id, created_at desc);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;

create policy "members read household" on public.households for select to authenticated using (id in (select household_id from public.household_members where user_id = auth.uid()));
create policy "members read membership" on public.household_members for select to authenticated using (user_id = auth.uid());
create policy "members read expenses" on public.expenses for select to authenticated using (household_id in (select household_id from public.household_members where user_id = auth.uid()));
create policy "members read audit" on public.audit_logs for select to authenticated using (household_id in (select household_id from public.household_members where user_id = auth.uid()));

create or replace function public.bootstrap_household(p_token text, p_person text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_household uuid; v_hash text;
begin
  if auth.uid() is null or p_person not in ('Beto', 'Mari') then raise exception 'invalid device'; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select id into v_household from public.households where token_hash = v_hash;
  if v_household is null then
    begin insert into public.households(token_hash) values (v_hash) returning id into v_household;
    exception when unique_violation then select id into v_household from public.households where token_hash = v_hash; end;
  end if;
  insert into public.household_members(user_id, household_id, person) values (auth.uid(), v_household, p_person)
  on conflict (user_id) do update set household_id = excluded.household_id, person = excluded.person;
  return v_household;
end $$;

create or replace function public.sync_expense(p_expense jsonb, p_expected_version integer)
returns public.expenses language plpgsql security definer set search_path = '' as $$
declare v_household uuid; v_row public.expenses;
begin
  select household_id into v_household from public.household_members where user_id = auth.uid();
  if v_household is null then raise exception 'device not connected'; end if;
  select * into v_row from public.expenses where id = (p_expense->>'id')::uuid and household_id = v_household;
  if not found then
    if p_expected_version <> 0 then raise sqlstate '40001' using message = 'version conflict'; end if;
    insert into public.expenses(id,household_id,description,amount_cents,spent_at,category,person,author,payment,note,installment,installment_count,series_id,version,created_at,updated_at,deleted_at)
    values ((p_expense->>'id')::uuid,v_household,p_expense->>'description',(p_expense->>'amount_cents')::integer,(p_expense->>'spent_at')::date,p_expense->>'category',p_expense->>'person',p_expense->>'author',p_expense->>'payment',coalesce(p_expense->>'note',''),(p_expense->>'installment')::integer,(p_expense->>'installment_count')::integer,nullif(p_expense->>'series_id','')::uuid,1,coalesce((p_expense->>'created_at')::timestamptz,now()),now(),nullif(p_expense->>'deleted_at','')::timestamptz) returning * into v_row;
  else
    if v_row.version <> p_expected_version then raise sqlstate '40001' using message = 'version conflict'; end if;
    update public.expenses set description=p_expense->>'description',amount_cents=(p_expense->>'amount_cents')::integer,spent_at=(p_expense->>'spent_at')::date,category=p_expense->>'category',person=p_expense->>'person',author=p_expense->>'author',payment=p_expense->>'payment',note=coalesce(p_expense->>'note',''),installment=(p_expense->>'installment')::integer,installment_count=(p_expense->>'installment_count')::integer,series_id=nullif(p_expense->>'series_id','')::uuid,deleted_at=nullif(p_expense->>'deleted_at','')::timestamptz,version=version+1,updated_at=now() where id=v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;

create or replace function public.audit_expense_change() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_summary text;
begin
  if tg_op = 'INSERT' then v_action := 'Criada'; v_summary := new.description || ' por R$ ' || to_char(new.amount_cents / 100.0, 'FM999G999G990D00');
  elsif old.deleted_at is null and new.deleted_at is not null then v_action := 'Excluída'; v_summary := new.description || ' foi movida para a lixeira';
  elsif old.deleted_at is not null and new.deleted_at is null then v_action := 'Restaurada'; v_summary := new.description || ' voltou aos lançamentos';
  else v_action := 'Editada'; v_summary := new.description || ' foi atualizada'; end if;
  insert into public.audit_logs(household_id, expense_id, action, author, summary, old_data, new_data) values (new.household_id,new.id,v_action,new.author,v_summary,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new));
  return new;
end $$;

create trigger expense_audit after insert or update on public.expenses for each row execute function public.audit_expense_change();
grant execute on function public.bootstrap_household(text,text) to authenticated;
grant execute on function public.sync_expense(jsonb,integer) to authenticated;
grant select on public.expenses, public.audit_logs, public.households, public.household_members to authenticated;
