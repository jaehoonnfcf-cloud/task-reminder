# 할일요정 (task-reminder)

기존 NFCF_CRM과 **별개**로 쓰는 독립 앱입니다. 새 Supabase 프로젝트 + 텔레그램 봇이 필요합니다.
이 폴더만 새 저장소로 옮겨도 동작합니다.

## 설정 순서
1. **Supabase 새 프로젝트** 생성 → SQL Editor에서 `supabase/tasks.sql` 실행
   → 맨 위 주석의 `team_members` insert 를 실제 이메일/이름으로 실행 (본인 + 담당자)
2. **텔레그램 봇 생성**: 텔레그램에서 `@BotFather` → `/newbot` → 토큰과 사용자명 확보
3. **Edge Function 배포** (`supabase/functions/task-notify`, **JWT 검증 끄기**: `--no-verify-jwt`)
   시크릿 설정: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`(임의 문자열), `CRON_SECRET`(임의 문자열)
4. **웹훅 등록** (브라우저/터미널 1회):
   `https://api.telegram.org/bot<토큰>/setWebhook?url=https://<프로젝트>.supabase.co/functions/v1/task-notify&secret_token=<TELEGRAM_WEBHOOK_SECRET>`
5. **정기 알림**: `tasks.sql` 하단 pg_cron 주석을 `<CRON_SECRET>` 채워서 실행 (평일 09:00·15:00)
6. `index.html` 상단의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BOT_USERNAME` 교체 후 호스팅(GitHub Pages 등)
7. Supabase Auth > URL Configuration 에 호스팅 주소를 Site URL/Redirect 로 추가
8. 각자 페이지에서 **텔레그램 연결하기** 1회 클릭

## 동작
- 등록 → 담당자에게 즉시 텔레그램 알림
- 미완료 → 평일 하루 2번 담당자별 요약 독촉 (기한초과 🔴 / 오늘마감 🟠 표시)
- 완료 체크 → 지시 등록자와 다른 담당자에게 완료 알림, 전원 완료 시 🎉 알림
