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

-- 이메일은 nullable이지만 있을 때는 유일해야 함 (대소문자 무시)
create unique index if not exists users_email_lower_uidx
  on public.users (lower(email))
  where email is not null;

-- 자주 조회되는 인덱스
create index if not exists users_status_idx        on public.users (status);
create index if not exists users_role_idx          on public.users (role);
create index if not exists users_affiliation2_idx  on public.users (affiliation2);

-- updated_at 자동 갱신
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
