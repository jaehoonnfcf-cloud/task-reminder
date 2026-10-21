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
-- 평일 08:30 (KST) = 전날 UTC 23:30 → 일~목 UTC 이므로 요일이 0-4
-- select cron.schedule('task-remind', '30 23 * * 0-4', $$
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

-- 업무 내용 수정은 등록자 + 담당자 모두 가능 (수정 가능한 컬럼은 위에서 4개로 제한)
drop policy if exists tasks_update on public.work_tasks;
create policy tasks_update on public.work_tasks for update to authenticated
  using (created_by = auth.email() or public.task_is_member(id))
  with check (created_by = auth.email() or public.task_is_member(id));

-- ===== 여신/수신 업무구분 + 담당자 권한 (적용 완료된 내용 기록) =====
-- team_members: perm_credit(여신), perm_deposit(수신), is_admin(관리자) 컬럼
-- work_tasks.division: 'credit'(여신, 기본값) | 'deposit'(수신)
-- 함수: has_div(text), is_admin(), task_div(bigint)  (security definer, 로그인 사용자만 실행)
-- 규칙: 조회는 전 담당자 가능 / 등록·수정·단계수정·완료체크는 해당 구분 권한 필요
--       담당자 구성 변경·삭제는 등록자 또는 관리자 / 담당자 목록 수정은 관리자만(admin-users 함수 경유)
-- 초기값: jaehoon.nfcf@gmail.com = 여신+수신+관리자, 01021280429a@gmail.com = 여신

-- ===== 프로필 사진 / 이름 변경 (적용 완료된 내용 기록) =====
-- team_members.avatar_v (bigint): 사진 버전, 없으면 null
-- Storage 버킷 'avatars' (비공개, 500KB 제한, JPEG): 파일명 = 이메일(@ → _at_) + '.jpg'
--   읽기: 로그인한 팀원 / 올리기·수정·삭제: 본인 파일 또는 관리자
-- 함수 update_my_profile(p_name, p_avatar_v, p_clear_avatar): 본인이 이름·사진만 바꾸는 전용 함수
--   (team_members 직접 수정 권한은 관리자에게만 있어 본인이 자기 권한을 바꿀 수 없음)

-- ===== 개인업무 + 고정업무(반복) (적용 완료된 내용 기록) =====
-- personal_tasks      : 개인 할 일 (owner_email, title, detail, due_date, lead_days, done_at, recurring_id)
-- personal_recurring  : 고정업무 규칙 (freq: weekdays/weekly/monthly, weekday, month_day(0=말일),
--                       every_months(1/3/6/12), anchor_month, weekend_rule(keep/before/after), lead_days, active)
-- RLS: owner_email = auth.email() 인 행만 조회/수정 (관리자 포함 다른 사람은 볼 수 없음)
-- gen_personal_occurrences(email): 고정업무의 앞으로 21일 이내 회차를 personal_tasks 로 생성 (중복 방지 unique index)
--   - 서버 정기 작업(task-notify, 평일 09:00/16:00)이 전원분 실행, ensure_my_personal() 로 본인 것은 화면 진입 시 즉시 생성
-- 알림: 기한 - lead_days 부터 기한 지난 뒤에도 완료할 때까지, 본인에게만 [개인]/[개인·고정] 표시로 전송

-- ===== 알림 시각 변경 (적용 완료) =====
-- 평일 08:30 KST : task-remind     '30 23 * * 0-4'  (UTC 일~목 23:30 = 한국 월~금 08:30)
-- 평일 15:30 KST : task-remind-pm  '30 6 * * 1-5'   (UTC 월~금 06:30 = 한국 월~금 15:30)
-- 두 작업은 같은 호출 내용(CRON_SECRET 포함)을 사용: cron.schedule('task-remind-pm', '30 6 * * 1-5', (select command from cron.job where jobname='task-remind'))

-- ===== 실시간 갱신 (적용 완료) =====
-- alter publication supabase_realtime add table public.work_tasks, public.work_task_assignees, public.work_task_steps, public.team_members;
-- 화면이 이 테이블의 변경을 구독해 새로고침 없이 갱신 (RLS 가 적용되어 볼 수 있는 행만 전달됨)

-- ===== 대출 미진행 (적용 완료된 내용 기록) =====
-- work_tasks: dropped_at, dropped_by, dropped_step(중단된 단계 seq), drop_reason
-- 함수 set_loan_dropped(p_task, p_drop, p_reason): 해당 구분 권한자만 처리/재개 (대출 업무만, 이미 처리된 건 거부)
-- 함수 task_active(p_task): 미진행 업무는 단계 변경 불가 (steps_update 정책에 반영)
-- 미진행 업무는 기본 목록(미완료)과 정기 알림에서 제외, 상태 필터 '미진행'에서 조회, '진행 재개'로 되돌림
-- 처리/재개 시 담당자 전원에게 텔레그램 알림

-- 본점/지점/통합 구분 (필수). 기존 업무는 모두 '본점'으로 처리
alter table public.work_tasks add column if not exists scope text not null default '본점';
alter table public.work_tasks add constraint work_tasks_scope_chk check (scope in ('본점','지점','통합'));
alter table public.work_tasks alter column scope drop default;
grant update (scope) on public.work_tasks to authenticated;

-- 감정평가 관리 (적용 완료). 상태 구분 없음: 의뢰 등록 → 평가기관별 가격 입력 → (선택) 채택
alter table public.team_members add column if not exists perm_appraisal boolean not null default false;
grant update (perm_appraisal) on public.team_members to authenticated;
-- has_appraisal(): 관리자 또는 perm_appraisal. appraisal_firms(관리자만 수정) / appraisal_cases / appraisal_properties /
-- appraisal_requests(건×평가기관) / appraisal_prices(의뢰×물건, 원 단위) — 조회는 팀원 전체, 쓰기는 has_appraisal(), 건 삭제는 등록자·관리자.
-- 평가기관 초기값: 대화, 통일, 나라, 삼창, 하나, 경일, 가온, 태평양, 중앙 (관리자 화면에서 추가·숨김)
-- 알림: task-notify 이벤트 appraisal_created / appraisal_priced / appraisal_chosen → 건의 notify_emails(체크한 사람)에게만
-- 감정평가는 본점/지점만 (통합 없음)
alter table public.appraisal_cases drop constraint appraisal_cases_scope_check;
alter table public.appraisal_cases add constraint appraisal_cases_scope_check check (scope in ('본점','지점'));

-- 감정평가: 기관별 총액만 입력(total_amount) + 특이사항(note)
alter table public.appraisal_requests add column if not exists total_amount bigint check (total_amount is null or total_amount >= 0);
alter table public.appraisal_requests add column if not exists note text;

-- 감정평가: 취급구분 (신규대출/기한연장/채권관리/기타+사유)
alter table public.appraisal_cases add column if not exists handling_type text check (handling_type in ('신규대출','기한연장','채권관리','기타'));
alter table public.appraisal_cases add column if not exists handling_note text;

-- 감정평가: 대출신청금액(원). 회신 예정일은 사용하지 않음(due_date 컬럼은 남아 있지만 화면에서 안 씀)
alter table public.appraisal_cases add column if not exists loan_amount bigint check (loan_amount is null or loan_amount >= 0);

-- 감정평가 물건: 건물일 때 대지면적(land_area) 함께 입력 (area = 건물면적)
alter table public.appraisal_properties add column if not exists land_area numeric(14,2) check (land_area is null or land_area > 0);

-- 감정평가 보관함: archived_at 이 있으면 보관함 (진행중 목록·배지에서 제외, 검색은 그대로)
alter table public.appraisal_cases add column if not exists archived_at timestamptz;
alter table public.appraisal_cases add column if not exists archived_by text;

-- 감정평가 의뢰서(팩스) 회신 연락처: 본점/지점별 (관리자만 수정, 팀원은 조회)
create table if not exists public.appraisal_settings (
  scope text primary key check (scope in ('본점','지점')),
  org_name text not null default '', staff_text text not null default '', contact_text text not null default '',
  updated_at timestamptz not null default now());
-- RLS: appraisal_settings select = is_member(), insert/update = is_admin()

-- 감정평가기관 팩스번호 (의뢰서 수신처에 표시). 의뢰번호는 DB 컬럼 없이 '요청연도-건번호(4자리)'로 계산
alter table public.appraisal_firms add column if not exists fax text not null default '';

-- 감정평가 지도: 물건 좌표 (주소 검색 결과의 좌표를 등록 시 저장, 기존 물건은 관리자 화면에서 채우기)
alter table public.appraisal_properties add column if not exists lat double precision;
alter table public.appraisal_properties add column if not exists lng double precision;

-- 감정평가 물건 '가격 묶음': group_no 가 같은 물건은 가격을 한 번에 받는다. 가격은 묶음의 첫 물건(appraisal_prices.property_id)에만 저장
alter table public.appraisal_properties add column if not exists group_no smallint check (group_no is null or group_no between 1 and 20);

-- 취급구분에 '추가대출' 추가
alter table public.appraisal_cases drop constraint appraisal_cases_handling_type_check;
alter table public.appraisal_cases add constraint appraisal_cases_handling_type_check check (handling_type in ('신규대출','추가대출','기한연장','채권관리','기타'));

-- 가격 묶음은 평가기관(의뢰)별 결과값: appraisal_requests.bundles = [[물건id, 물건id], …]. 묶음의 가격은 첫 물건 id 에 저장.
-- (앞서 추가했던 appraisal_properties.group_no 는 더 이상 사용하지 않음)
alter table public.appraisal_requests add column if not exists bundles jsonb not null default '[]'::jsonb;

-- 조합 주요일정(calendar_events): 여신·수신 화면 맨 위 2주 달력. 조회는 팀원 전체, 등록·수정·삭제는 관리자만.
-- columns: title, start_date, end_date(여러 날), event_time(선택), kind(조합행사/휴가/출장/외부행사/기타), created_by. realtime publication 포함.

-- 업무카드 댓글(work_task_comments): 여신/수신 업무 상세창 댓글. 조회는 팀원 전체, 작성은 업무 작성자·담당자·해당 구분 권한자, 삭제는 본인 또는 관리자.
create table if not exists public.work_task_comments (
  id bigint generated always as identity primary key,
  task_id bigint not null references public.work_tasks(id) on delete cascade,
  author_email text not null default auth.email(),
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.work_task_comments enable row level security;
create policy cmt_select on public.work_task_comments for select to authenticated using (public.is_member());
create policy cmt_insert on public.work_task_comments for insert to authenticated
  with check (author_email = auth.email() and (public.task_is_owner(task_id) or public.task_is_member(task_id) or public.has_div(public.task_div(task_id))));
create policy cmt_delete on public.work_task_comments for delete to authenticated using (author_email = auth.email() or public.is_admin());
grant select, insert, delete on public.work_task_comments to authenticated;
grant all on public.work_task_comments to service_role;
alter publication supabase_realtime add table public.work_task_comments;

-- 일정 종류 변경: 행사 → 조합행사 (출장·외부행사 추가)
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
update public.calendar_events set kind = '조합행사' where kind = '행사';
alter table public.calendar_events add constraint calendar_events_kind_check check (kind in ('조합행사','휴가','출장','외부행사','기타'));

-- 공휴일 종류 추가 (달력에만 표시, 텔레그램 일정 안내에는 포함하지 않음). 공휴일은 관리자가 일정으로 직접 입력.
alter table public.calendar_events drop constraint if exists calendar_events_kind_check;
alter table public.calendar_events add constraint calendar_events_kind_check check (kind in ('조합행사','휴가','출장','외부행사','공휴일','기타'));

-- 채권관리(debt_cases / debt_logs): 연체 채무자별 연체기준일(연체일수는 화면에서 자동 계산), 연락·방문 이력, 다음 조치 예정일.
-- 별도 권한 team_members.perm_debt(또는 관리자)만 조회·입력. 알림 없음(화면만).
alter table public.team_members add column if not exists perm_debt boolean not null default false;
grant update (perm_debt) on public.team_members to authenticated;
create or replace function public.has_debt() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where email = auth.email() and (is_admin or perm_debt))
$$;
create table if not exists public.debt_cases (
  id bigint generated always as identity primary key,
  debtor_name text not null check (char_length(debtor_name) between 1 and 100),
  scope text not null default '본점' check (scope in ('본점','지점')),
  overdue_since date not null,
  principal bigint check (principal is null or principal >= 0),
  assignee_email text,
  next_action_date date,
  next_action_note text check (next_action_note is null or char_length(next_action_note) <= 200),
  memo text check (memo is null or char_length(memo) <= 1000),
  status text not null default '진행중' check (status in ('진행중','종결')),
  closed_at timestamptz,
  created_by text not null default auth.email(),
  created_at timestamptz not null default now()
);
create table if not exists public.debt_logs (
  id bigint generated always as identity primary key,
  case_id bigint not null references public.debt_cases(id) on delete cascade,
  log_date date not null default current_date,
  kind text not null check (kind in ('전화','문자','방문','면담','우편','기타')),
  body text not null check (char_length(body) between 1 and 1000),
  created_by text not null default auth.email(),
  created_at timestamptz not null default now()
);
create index if not exists debt_logs_case_idx on public.debt_logs (case_id, log_date desc);
alter table public.debt_cases enable row level security;
alter table public.debt_logs enable row level security;
create policy dc_sel on public.debt_cases for select to authenticated using (has_debt());
create policy dc_ins on public.debt_cases for insert to authenticated with check (has_debt() and created_by = auth.email());
create policy dc_upd on public.debt_cases for update to authenticated using (has_debt());
create policy dc_del on public.debt_cases for delete to authenticated using (has_debt() and (created_by = auth.email() or is_admin()));
create policy dl_sel on public.debt_logs for select to authenticated using (has_debt());
create policy dl_ins on public.debt_logs for insert to authenticated with check (has_debt() and created_by = auth.email());
create policy dl_del on public.debt_logs for delete to authenticated using (has_debt() and (created_by = auth.email() or is_admin()));
grant select, insert, update, delete on public.debt_cases to authenticated;
grant select, insert, delete on public.debt_logs to authenticated;
alter publication supabase_realtime add table public.debt_cases, public.debt_logs;

-- 채권관리 이력 수정: 본인이 쓴 이력 또는 관리자만 날짜·종류·내용 수정
create policy dl_upd on public.debt_logs for update to authenticated using (has_debt() and (created_by = auth.email() or is_admin())) with check (has_debt() and (created_by = auth.email() or is_admin()));
grant update (log_date, kind, body) on public.debt_logs to authenticated;

-- 개인일정(personal_events): 개인업무 화면 맨 위 2주 달력. 본인만 조회·등록·수정·삭제 (조합 달력의 공휴일은 화면에서 같이 보여줌).
-- 조합 주요일정(calendar_events)은 화면에서 '조합일정' 이라는 이름으로 표시.
create table if not exists public.personal_events (
  id bigint generated always as identity primary key,
  owner_email text not null default auth.email(),
  title text not null check (char_length(title) between 1 and 100),
  kind text not null default '개인' check (kind in ('개인','약속','휴가','출장','기타')),
  start_date date not null,
  end_date date check (end_date is null or end_date >= start_date),
  event_time time,
  created_at timestamptz not null default now()
);
create index if not exists personal_events_owner_idx on public.personal_events (owner_email, start_date);
alter table public.personal_events enable row level security;
create policy pe_sel on public.personal_events for select to authenticated using (owner_email = auth.email());
create policy pe_ins on public.personal_events for insert to authenticated with check (owner_email = auth.email() and is_member());
create policy pe_upd on public.personal_events for update to authenticated using (owner_email = auth.email()) with check (owner_email = auth.email());
create policy pe_del on public.personal_events for delete to authenticated using (owner_email = auth.email());
grant select, insert, update, delete on public.personal_events to authenticated;
alter publication supabase_realtime add table public.personal_events;
