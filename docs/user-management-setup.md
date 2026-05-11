# 사용자관리 셋업 가이드

`사용자관리` 탭은 `information_employees` 시트와 Supabase의 `users` 테이블을 미러링하여 시스템 권한을 관리합니다.

## 1. Supabase 테이블 생성

[supabase/schema.sql](../supabase/schema.sql) 의 DDL을 Supabase SQL Editor에서 실행합니다.

## 2. Google Service Account 발급

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 선택
2. **IAM 및 관리자 → 서비스 계정 → 만들기**
3. **키 추가 → JSON** 으로 키 파일 다운로드
4. JSON 안의 `client_email`, `private_key` 두 필드를 환경변수로 등록
5. **Google Sheets API** 사용 설정 (API 라이브러리에서 검색 후 사용)
6. 대상 스프레드시트(1ve6MFc...)를 서비스계정 이메일에게 **뷰어 권한**으로 공유

## 3. 환경변수

`.env.local` 또는 Vercel Project Settings에 추가:

| 키 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role 키 (서버 전용, 절대 클라이언트 노출 금지) |
| `GOOGLE_SHEETS_SHEET_ID` | `1ve6MFc9OMR2EeZQ3AQ4prPHbSv96f3VamiECYMdz5Xg` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 서비스계정 이메일 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | private_key (개행 `\n` 이스케이프) |
| `SUPER_ADMIN_EMAILS` | 최초 sync 실행 가능한 부트스트랩 관리자 이메일 (쉼표 구분) |

## 4. 최초 동기화

1. `SUPER_ADMIN_EMAILS` 에 등록된 계정으로 로그인 (DB가 비어있어도 ADMIN으로 입장 가능)
2. 좌측 메뉴에서 **사용자관리** 클릭
3. 우측 상단 **[시트와 동기화]** 버튼 클릭

## 5. 역할 체계

| 역할 | 라벨 | 권한 |
|---|---|---|
| `EXEC` | 경영진 | 모든 탭 + 사용자관리 |
| `ADMIN` | 관리자 | 모든 탭 + 사용자관리 |
| `NORMAL` | 일반 | 앱 접근 불가 (`/unauthorized`) |

### 기본 역할 매핑

시트 동기화 시 자동 매핑:

- 소속1(D) 또는 소속2(E) 가 `HRBP` 또는 `C.O1` 패턴에 매칭 → **ADMIN**
- 그 외 → **NORMAL**
- 재직상태(F) 가 `퇴사` → 신규는 미등록, 기존은 status 갱신만 (로그인 차단)

### 수동 변경

- 사용자관리 탭에서 역할 셀렉트로 즉시 변경 (DB는 `role_overridden=true`)
- override 된 사용자는 이후 sync 때 자동 재매핑되지 않음
- `Undo2` 아이콘으로 override 해제 → 다음 sync 시 기본 규칙으로 복귀

## 6. 권한 변경 즉시 반영 시점

- 로그인 세션의 JWT는 30분마다 Supabase에서 role을 재조회합니다.
- 즉시 반영이 필요하면 해당 사용자에게 재로그인을 요청하세요.
