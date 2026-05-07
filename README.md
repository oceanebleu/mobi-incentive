# 수주인센티브 운영관리 시스템

수주인센티브 운영 현황을 관리하는 웹 애플리케이션입니다.

## 기능

- **대시보드**: 누적 지급액, 실지급 비율, 단계별 현황, 개인별 순위
- **프로젝트 관리**: 운영위원회 진행 프로젝트 CRUD, 상태 관리, 지급 추적
- **개인별 지급 관리**: 구성원별 인센티브 지급 내역 및 연도별 현황

## 기술 스택

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Zustand** (상태 관리 + localStorage 영속성)

## 로컬 실행

```bash
npm install
npm run dev
```

## 배포 (Vercel + GitHub)

1. GitHub 리포지토리 생성 후 코드 푸시
2. [vercel.com](https://vercel.com) 접속 → Import Git Repository
3. 설정 없이 Deploy 클릭 (자동 감지)

## 데이터 구조

현재는 브라우저 `localStorage`에 데이터를 저장합니다.  
실제 운영을 위해서는 Supabase 또는 Google Sheets API 연동이 필요합니다.
