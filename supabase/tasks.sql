-- 업무지시 관리 + 텔레그램 알림 (새 Supabase 프로젝트의 SQL Editor에서 실행)

-- 사용 가능한 사람 목록 (이 목록에 있는 이메일만 로그인 후 사용 가능)
create table if not exists public.team_members (
  email text primary key,
  name  text not null
);
alter table public.team_members enable row level security;

create or replace function public.is_member() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from team_members where email = auth.email());
$$;

create policy tm_select on public.team_members for select to authenticated using (public.is_member());

-- 최초 1회 직접 등록 (이메일/이름은 실제 값으로 수정)
-- insert into public.team_members(email, name) values
--   ('me@example.com', '나(과장)'), ('staff@example.com', '담당자');

create table if not exists public.work_tasks (
  id          bigint generated always as identity primary key,
  title       text not null,
  detail      text,
  directed_by text,                       -- 지시자 (예: 김상무)
  due_date    date,
  created_by  text not null default auth.email(),
  created_at  timestamptz not null default now()
);

create table if not exists public.work_task_assignees (
  task_id  bigint not null references public.work_tasks(id) on delete cascade,
  email    text   not null,
  done_at  timestamptz,
  primary key (task_id, email)
);

create table if not exists public.telegram_links (
  email      text primary key,
  chat_id    bigint,
  link_code  text,
  created_at timestamptz not null default now()
);

alter table public.work_tasks         enable row level security;
alter table public.work_task_assignees enable row level security;
alter table public.telegram_links      enable row level security;

-- RLS 순환 참조를 피하려고 security definer 헬퍼 사용
create or replace function public.task_is_owner(p_task bigint) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from work_tasks where id = p_task and created_by = auth.email());
$$;
create or replace function public.task_is_member(p_task bigint) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from work_task_assignees where task_id = p_task and email = auth.email());
$$;

create policy tasks_select on public.work_tasks for select to authenticated
  using (created_by = auth.email() or public.task_is_member(id));
create policy tasks_insert on public.work_tasks for insert to authenticated
  with check (created_by = auth.email() and public.is_member());
create policy tasks_update on public.work_tasks for update to authenticated
  using (created_by = auth.email());
create policy tasks_delete on public.work_tasks for delete to authenticated
  using (created_by = auth.email());

create policy asg_select on public.work_task_assignees for select to authenticated
  using (public.task_is_owner(task_id) or public.task_is_member(task_id));
create policy asg_insert on public.work_task_assignees for insert to authenticated
  with check (public.task_is_owner(task_id));
create policy asg_update on public.work_task_assignees for update to authenticated
  using (email = auth.email() or public.task_is_owner(task_id));
create policy asg_delete on public.work_task_assignees for delete to authenticated
  using (public.task_is_owner(task_id));

-- 텔레그램 연결은 본인 행만
create policy tg_select on public.telegram_links for select to authenticated using (email = auth.email());
create policy tg_insert on public.telegram_links for insert to authenticated with check (email = auth.email());
create policy tg_update on public.telegram_links for update to authenticated using (email = auth.email());

-- API 접근 권한 (Automatically expose new tables 를 끈 경우 필요)
grant select, insert, update, delete on public.work_tasks, public.work_task_assignees, public.telegram_links to authenticated;
grant select on public.team_members to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.is_member() to authenticated;

-- ===== 정기 독촉 알림 (Edge Function 배포 + 시크릿 설정 후 실행) =====
-- create extension if not exists pg_cron; create extension if not exists pg_net;
-- 평일 09:00, 16:00 (KST) = UTC 00:00, 07:00
-- select cron.schedule('task-remind', '0 0,7 * * 1-5', $$
--   select net.http_post(
--     url := 'https://neepcdiumutjjwuxzjyt.supabase.co/functions/v1/task-notify',
--     headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb);
-- $$);

-- 로그인 전(anon) 호출 차단
revoke execute on function public.is_member(), public.task_is_owner(bigint), public.task_is_member(bigint) from public, anon;
grant execute on function public.is_member(), public.task_is_owner(bigint), public.task_is_member(bigint) to authenticated;

-- Edge Function(service_role)이 테이블을 읽고 쓰기 위한 권한 (Automatically expose new tables 를 끈 경우 필요)
grant select, insert, update, delete on public.work_tasks, public.work_task_assignees, public.telegram_links, public.team_members to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ===== 업무 유형(일반/대출진행) + 단계 =====
alter table public.work_tasks add column if not exists task_type text not null default 'general';

create table if not exists public.work_task_steps (
  task_id bigint   not null references public.work_tasks(id) on delete cascade,
  seq     smallint not null,
  name    text     not null,
  done_at timestamptz,
  done_by text,
  primary key (task_id, seq)
);
alter table public.work_task_steps enable row level security;

create policy steps_select on public.work_task_steps for select to authenticated
  using (public.task_is_owner(task_id) or public.task_is_member(task_id));
create policy steps_insert on public.work_task_steps for insert to authenticated
  with check (public.task_is_owner(task_id));
create policy steps_update on public.work_task_steps for update to authenticated
  using (public.task_is_owner(task_id) or public.task_is_member(task_id));

-- 단계는 순서대로만 완료/되돌리기 가능 (DB에서 강제)
create or replace function public.work_task_steps_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.done_at is not null and old.done_at is null then
    if exists (select 1 from work_task_steps where task_id = new.task_id and seq < new.seq and done_at is null) then
      raise exception '이전 단계를 먼저 완료해야 합니다.';
    end if;
    new.done_by := auth.email();
  elsif new.done_at is null and old.done_at is not null then
    if exists (select 1 from work_task_steps where task_id = new.task_id and seq > new.seq and done_at is not null) then
      raise exception '다음 단계가 이미 완료되어 되돌릴 수 없습니다.';
    end if;
    new.done_by := null;
  end if;
  return new;
end $$;

create trigger work_task_steps_guard_trg before update on public.work_task_steps
  for each row execute function public.work_task_steps_guard();

grant select, insert on public.work_task_steps to authenticated;
grant update (done_at) on public.work_task_steps to authenticated;
grant select, insert, update, delete on public.work_task_steps to service_role;

-- 등록자가 수정할 수 있는 컬럼만 허용 (task_type, created_by 변조 방지)
revoke update on public.work_tasks from authenticated;
grant update (title, detail, directed_by, due_date) on public.work_tasks to authenticated;
