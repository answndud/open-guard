# 변경 이력

OpenGuard의 주요 변경 사항은 이 문서에 기록합니다.

문서 형식은 [Keep a Changelog](https://keepachangelog.com/)를 따르며, 버전 정책은 [Semantic Versioning](https://semver.org/)을 준수합니다.

## [Unreleased]

### 추가됨

- 대시보드에서 직접 `scan`, `policy-generate`, `sign`, `verify`, `rerun`을 실행하고 job/target/audit 이력을 확인할 수 있는 dashboard-first 운영 워크스페이스
- 스캔 리포트용 SARIF 출력 형식
- 기준 ref 대비 신규 finding만 보여주는 `diff-base` 스캔
- 클립보드 실행과 검증 우회 설치 지침을 탐지하는 Markdown 소셜 엔지니어링 규칙
- 와일드카드 권한, 무제한 파일시스템 범위, 무제한 네트워크 범위를 탐지하는 MCP/도구 매니페스트 규칙
- 결정적인 위험 점수 계산과 테스트를 포함한 scoring 모듈
- safe list, 정책 생성, 테스트를 포함한 policy 모듈
- JSON, Markdown, PR 댓글 렌더러를 포함한 report 모듈
- scan/policy/sign/verify 명령을 포함한 CLI 모듈
- 산출물 서명/검증과 테스트를 포함한 trust 모듈
- PR 스캔과 댓글 갱신을 수행하는 GitHub Action
- 정책 검증/병합과 action 패키징 로드맵 관련 문서 보강
- 프로젝트 문서와 명세
  - README.md: 프로젝트 개요와 빠른 시작
  - SPEC.md: 사용 사례를 포함한 제품 명세
  - ARCHITECTURE.md: 기술 아키텍처와 데이터 흐름
  - docs/BUSINESS.md: 수익화 및 GTM 전략
  - docs/THREAT_MODEL.md: 위협 모델과 공격 표면
  - docs/POLICY.md: 정책 모델 문서(v1)
  - docs/RULES_CATALOG.md: 초기 규칙 카탈로그(35개 이상)
  - AI_GUIDE.md: AI 코딩 에이전트용 개발 가이드
  - CONTRIBUTING.md: 기여 안내
  - PLAN.md: 현재 개발 로드맵과 테스트 품질 목표
  - PROGRESS.md: 실행 이력과 미해결 이슈 추적
  - docs/VERSIONING.md: 버전 정책
  - docs/SECURITY.md: 보안 정책과 제보 절차
- finding, policy, report용 JSON 스키마
- YAML 형식의 규칙 정의
  - 셸/설치 규칙(10개)
  - PowerShell 규칙(4개)
  - macOS 전용 규칙(4개)
  - 네트워크/유출 규칙(5개)
  - 자격 증명 규칙(4개)
  - GitHub Actions 규칙(5개)
  - 공급망 규칙(3개)
- 예제 파일
  - 테스트용 위험 스킬 샘플
  - 샘플 정책 파일
- 프로젝트 설정 파일(`package.json`, `tsconfig.json`)
- GitHub Action 워크플로 템플릿

### 변경됨

- 로컬 서버가 이제 persisted job history, target records, audit feed, command preview를 함께 저장하며 대시보드 overview/run detail이 이를 바로 사용하도록 확장
- 내장 규칙 로딩이 패키지 환경에서도 안정적으로 동작하도록 개선했고, 사용자 정의 규칙은 기본 규칙을 대체하지 않고 override 방식으로 병합되도록 변경
- `scan --diff-base`가 더 이상 현재 저장소 워킹 트리를 직접 checkout 하며 변경하지 않도록 수정
- `scan --policy`가 파일 읽기 가능 여부만 보는 대신 정책 YAML 내용을 실제로 검증하도록 변경
- GHA scoring에서 `OG-GHA-001`을 credentials subscore로 매핑하도록 조정해 위험 귀속을 개선
- GitHub Actions 워크플로 스캔이 YAML 구조를 인식하는 방식으로 동작하며, 재사용 워크플로 참조까지 포함해 unpinned action 탐지를 강화
- MCP 규칙은 일반 JSON/YAML 파일의 잡음을 줄이기 위해 MCP 매니페스트 성격의 경로로 범위를 제한
- GHA injection 탐지에 재사용 워크플로 `with:` 입력으로 전달되는 위험 표현식까지 포함
- PR 댓글 출력에 `New High-Signal Rules` 섹션을 추가해 critical/high-confidence 신규 규칙 히트를 요약
- 계획 및 실행 추적 문서를 저장소 루트(`PLAN.md`, `PROGRESS.md`)로 통합

### 수정됨

- 로드맵 이력이 SARIF 내보내기 기능이 이미 제공되었다는 현재 상태를 반영하도록 수정
