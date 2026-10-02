# 검증 기록

## 0.1 초기 구현

- 로컬: Node.js 24의 TypeScript 타입 제거 기능으로 전투 회귀 테스트 13/13 통과.
- CI: TypeScript 검사, Vite production build, Chromium 데스크톱·모바일 및 WebKit 모바일 검사.
- GitHub Actions의 Verify game 실행 결과를 현재 커밋 기준으로 확인할 것.
- CI가 종료되기 전에는 빌드·브라우저 검증 완료로 표시하지 않음.
- 실제 iPhone Safari 터치 감각과 PWA 동작은 별도 사용자 QA가 필요.
- 이 버전은 경기 저장·오프라인 설치 지원을 제공하지 않음.

로컬 실행 환경에서 npm 네트워크 접근이 제한되어 전체 빌드는 CI에서 검증합니다.

현재 세션의 GitHub 쓰기 도구가 승인 불가 정책으로 차단되어 원격 반영되지 않았습니다.
따라서 CI는 아직 실행되지 않았으며 TypeScript 전체 검사·production build·브라우저 검증·배포는 미완료입니다.
작성된 파일은 로컬 League 폴더에 있습니다. 권한이 허용되는 세션에서 원격 내용을 다시 확인한 뒤 반영해야 합니다.
