-- ─────────────────────────────────────────────────────────────
-- 사용자관리 (users) 테이블
-- information_employees 시트와 1:1 미러링 + 권한 override 컬럼
-- ─────────────────────────────────────────────────────────────

create table if not exists public.users (
  employee_id        text primary key,            -- A: 사번
  name               text not null,               -- B: 사원명
  corp_group         text,                        -- C: 법인/그룹
  affiliation1       text,                        -- D: 소속1
  affiliation2       text,                        -- E: 소속2
  status             text,                        -- F: 재직상태
  hire_date          text,                        -- G: 입사일
  last_work_date     text,                        -- H: 마지막 근무일
  resignation_date   text,                        -- I: 서류상 퇴사일
  email              text,                        -- J: 회사이메일 (소문자 저장)
  role               text not null default 'NORMAL'
                       check (role in ('EXEC','ADMIN','NORMAL')),
  role_overridden    boolean not null default false,  -- true면 sync 시 role 덮어쓰지 않음
  synced_at          timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 과거 strict 유일 인덱스가 있던 환경이면 먼저 제거 (퇴사자 동기화 충돌 원인)
drop index if exists public.users_email_lower_uidx;

-- 이메일 유일성은 "퇴사 아닌" 사람들 사이에서만 강제
-- (퇴사자 ↔ 재직자, 또는 퇴사자 ↔ 퇴사자 사이에 같은 이메일이 있어도 동기화 통과)
-- 재직자끼리 진짜 중복이면 시트에서 수정 필요
create unique index if not exists users_email_lower_active_uidx
  on public.users (lower(email))
  where email is not null and status is distinct from '퇴사';

create index if not exists users_status_idx        on public.users (status);
create index if not exists users_role_idx          on public.users (role);
create index if not exists users_affiliation2_idx  on public.users (affiliation2);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 제안서 (proposals) — [RAW] 제안서 시트
-- C열(promote_to_project)이 true면 운영위원회 → projects로 승격
-- ─────────────────────────────────────────────────────────────

create table if not exists public.proposals (
  id                  bigserial primary key,
  is_archived         boolean not null default false,  -- A: 운영위원회 진행여부(상단)
  post_status         text,                            -- B: 사후처리여부 (완료/공백)
  promote_to_project  boolean not null default false,  -- C: 운영위 진행여부 = TRUE면 승격
  bidding_status      text,                            -- D: 빌딩현황 (수주성공/수주실패/검토대기/...)
  client_name         text not null,                   -- E: 광고주 (캠페인명)
  agency              text,                            -- F: 인사이즈
  submitted_at        date,                            -- G: 제출일
  pt_at               date,                            -- H: PT일
  result_at           date,                            -- I: 결과발행일
  category            text,                            -- J: 연장/신규
  team                text,                            -- K: 담당팀
  pl                  text,                            -- L: PL
  r_value             bigint,                          -- M: R값
  commission          numeric,                         -- N: 수수료
  pre_review_marked   boolean,                         -- O: 주가공제 (V 표기)
  progress_note       text,                            -- P: 진행상황
  promoted_project_id text,                            -- 승격되면 projects.id 기록
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists proposals_promote_idx     on public.proposals (promote_to_project);
create index if not exists proposals_bidding_idx     on public.proposals (bidding_status);
create index if not exists proposals_submitted_idx   on public.proposals (submitted_at);

drop trigger if exists proposals_set_updated_at on public.proposals;
create trigger proposals_set_updated_at
before update on public.proposals
for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 프로젝트 (projects) — 수주인센티브운영관리 시트
-- ─────────────────────────────────────────────────────────────

create table if not exists public.projects (
  id                          text primary key,                -- A: PROPJ00001 등
  campaign_name               text not null,                   -- B: 광고주(캠페인명)
  committee_sheet_link        text,                            -- C: 운영위원회시트 URL
  r_value                     bigint,                          -- D
  commission                  numeric,                         -- E (0.15 = 15%)
  team                        text,                            -- F
  pl                          text,                            -- G
  submitted_at                date,                            -- H
  distributed                 boolean not null default false,  -- I: 배포진행여부
  distributed_at              date,                            -- J: 운영위 양식 배포일
  acquisition_status          text                             -- K: 프로젝트현황
                                check (acquisition_status in
                                  ('WON','LOST','CANCELLED','PENDING','REVIEWING','RESULT_PENDING')),
  pl_completed                boolean not null default false,  -- L
  fund_confirmed              boolean not null default false,  -- M: 사후확정여부
  incentive_fund              bigint not null default 0,       -- N
  first_payment_date          date,                            -- O
  first_payment_ratio         int,                             -- P (60 = 60%)
  first_payment_completed     boolean not null default false,  -- Q
  second_payment_date         date,                            -- R
  second_payment_ratio        int,                             -- S
  second_payment_completed    boolean not null default false,  -- T
  campaign_end_date           date,                            -- U: 캠페인 종료예정일
  category                    text,                            -- V: 연장/신규
  note                        text,                            -- W: 지급 특이사항
  source_proposal_id          bigint,                          -- proposals.id에서 승격된 경우
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists projects_acquisition_idx   on public.projects (acquisition_status);
create index if not exists projects_team_idx          on public.projects (team);
create index if not exists projects_submitted_idx     on public.projects (submitted_at);
create index if not exists projects_campaign_name_idx on public.projects (campaign_name);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 프로젝트 멤버 (project_members) — 개인별 인센티브 지급액 시트
--   * member_name은 사람 이름(예: '최경원') 또는 팀계정(예: 'Creative.Lab') 둘 다 허용
--   * employee_id가 NULL이면 users 매칭 안 됨 (팀계정 또는 미등록자)
-- ─────────────────────────────────────────────────────────────

create table if not exists public.project_members (
  id                     bigserial primary key,
  project_id             text not null references public.projects(id) on delete cascade,
  member_name            text not null,
  employee_id            text references public.users(employee_id) on delete set null,
  is_team_account        boolean not null default false,  -- 'Creative.Lab' 같은 팀 계정
  contribution           numeric not null,                -- % (25.00 = 25%)
  incentive_amount       bigint not null default 0,       -- 본인분 인센티브 (member.contribution × project.incentiveFund)
  first_amount           bigint not null default 0,
  first_paid_at          date,
  second_amount          bigint not null default 0,
  second_paid_at         date,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique(project_id, member_name)
);

create index if not exists pm_project_idx     on public.project_members (project_id);
create index if not exists pm_employee_idx    on public.project_members (employee_id);
create index if not exists pm_member_name_idx on public.project_members (member_name);

drop trigger if exists project_members_set_updated_at on public.project_members;
create trigger project_members_set_updated_at
before update on public.project_members
for each row execute function public.set_updated_at();
