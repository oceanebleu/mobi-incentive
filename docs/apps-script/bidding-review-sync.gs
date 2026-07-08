/**
 * ─────────────────────────────────────────────────────────────
 *  mobi-incentive 리뷰 진행일 프록시 (Standalone Apps Script Web App)
 *
 *  용도: mobi-incentive 서버가 이 웹앱을 호출하면, @mobidays.com 도메인 권한으로
 *        요청받은 스프레드시트를 열어 「09 결과 분석 (ALL)」 C5 셀 값을 반환.
 *
 *  왜 이 방식?
 *   · PL 은 시트 복제 후 링크만 mobi-incentive PL 페이지에 저장하면 끝.
 *   · 서비스 계정을 시트마다 공유할 필요 없음.
 *   · 관리자가 mobi-incentive 에서 [리뷰 동기화] 를 누르면 서버 → 이 웹앱 → 시트 순으로 pull.
 *
 *  설치 방법 (배포 관리자가 딱 한 번):
 *   1. 배포 담당자 mobidays.com 계정(예: bot@mobidays.com)으로 https://script.google.com 접속
 *   2. [새 프로젝트] 클릭 → 프로젝트명: "mobi-incentive review reader"
 *   3. 기본 Code.gs 내용 전부 지우고 이 파일 내용 붙여넣기
 *   4. 상단 SHARED_SECRET 값을 서버 환경변수 REVIEW_SYNC_SECRET 와 동일한 문자열로 교체
 *   5. 저장 (Ctrl/Cmd + S)
 *   6. 우측 상단 [배포] → [새 배포] 클릭
 *      · 유형: 웹 앱
 *      · 설명: mobi-incentive review reader
 *      · 다음으로 실행: 나 (bot@mobidays.com)     ← 중요
 *      · 액세스 권한: 모든 사용자                  ← 중요 (secret 으로 자체 검증)
 *      · [배포] 클릭 → 권한 승인 팝업 → 「허용」
 *   7. 배포된 웹 앱 URL 복사 (형식: https://script.google.com/macros/s/AKfycb.../exec)
 *   8. 서버 환경변수 REVIEW_APPS_SCRIPT_URL 에 붙여넣기
 *
 *  코드 수정 후에는 반드시 [배포 관리 → 편집(연필) → 새 버전 배포] 를 해야 반영됨.
 * ─────────────────────────────────────────────────────────────
 */

// TODO: 배포 시 실제 값으로 교체. 서버 REVIEW_SYNC_SECRET 과 동일해야 함.
const SHARED_SECRET = 'REPLACE_WITH_REVIEW_SYNC_SECRET';

// 대상 탭 이름 — 정확 이름 매칭 실패 시 접두어 정규식 대체
const TARGET_SHEET_NAME = '09 결과 분석 (ALL)';
const TARGET_SHEET_PREFIX_REGEX = /^\s*09\s*결과\s*분석/;
const TARGET_CELL = 'C5';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // 1) 인증
    if (body.secret !== SHARED_SECRET) {
      return jsonOut({ ok: false, error: 'forbidden' });
    }

    // 2) 입력 검증
    const url = body.spreadsheet_url;
    if (!url) return jsonOut({ ok: false, error: 'missing_url' });

    // 3) 시트 열기
    let ss;
    try {
      ss = SpreadsheetApp.openByUrl(url);
    } catch (err) {
      return jsonOut({
        ok: false,
        error: 'cannot_open_sheet',
        detail: String(err),
      });
    }

    // 4) 대상 탭 찾기 — 정확 이름 → 실패 시 접두어 정규식
    let sheet = ss.getSheetByName(TARGET_SHEET_NAME);
    if (!sheet) {
      const all = ss.getSheets();
      for (var i = 0; i < all.length; i++) {
        if (TARGET_SHEET_PREFIX_REGEX.test(all[i].getName())) {
          sheet = all[i];
          break;
        }
      }
    }
    if (!sheet) {
      return jsonOut({ ok: false, error: 'target_sheet_not_found' });
    }

    // 5) C5 값 (표시 포맷 그대로) 반환
    const rawValue = sheet.getRange(TARGET_CELL).getDisplayValue();
    return jsonOut({
      ok: true,
      spreadsheet_id: ss.getId(),
      sheet_name: sheet.getName(),
      cell: TARGET_CELL,
      raw_value: rawValue,
    });
  } catch (err) {
    return jsonOut({ ok: false, error: 'internal', detail: String(err) });
  }
}

// GET 요청은 헬스체크용 — 배포 확인 시 브라우저로 URL 접근하면 이 메시지가 뜸.
function doGet(e) {
  return jsonOut({
    ok: true,
    message: 'mobi-incentive review reader is live. Use POST with { secret, spreadsheet_url }.',
  });
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
