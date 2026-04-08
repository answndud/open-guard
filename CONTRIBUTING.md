# OpenGuard 기여 안내

OpenGuard에 관심을 갖고 기여해 주셔서 감사합니다. 이 문서는 처음 기여할 때 필요한 기본 흐름을 정리한 안내서입니다.

## 개발 환경 준비

### 사전 요구사항

- Node.js 20 이상(LTS 권장)
- pnpm 9 이상 (`npm install -g pnpm`)
- Git 2.30 이상

### 시작하기

```bash
# 저장소 복제
git clone https://github.com/openguard/openguard.git
cd openguard

# 의존성 설치
pnpm install

# 테스트 실행
pnpm test

# 빌드
pnpm build

# 로컬에서 CLI 실행
pnpm dev scan ./examples/sample-skill
```

### 프로젝트 구조

```
src/
├── ingest/     # 저장소 로딩과 파일 분류
├── scanner/    # 규칙 엔진과 증거 추출
├── scoring/    # 위험 점수 계산
├── policy/     # 정책 생성과 직렬화
├── report/     # 출력 포맷터(JSON, MD, PR 댓글)
├── cli/        # CLI 명령과 오케스트레이션
└── trust/      # SLSA-lite 서명과 검증

rules/          # 규칙 정의(YAML)
schemas/        # 출력용 JSON 스키마
tests/          # 테스트 스위트
examples/       # 샘플 스킬과 정책
github-action/  # CI용 GitHub Action
```

## 기여 방법

### 1. 새로운 탐지 규칙 추가

가장 영향이 크고 비교적 접근하기 쉬운 기여 방식입니다.

**절차**

1. [docs/RULES_CATALOG.md](docs/RULES_CATALOG.md)에서 기존 규칙을 먼저 확인합니다.
2. `rules/<category>.yaml`에 새 규칙을 추가합니다.

```yaml
- id: OG-SHELL-XXX
  title: "설명적인 제목"
  description: "무엇을 탐지하며 왜 위험한지"
  severity: high          # info | low | medium | high | critical
  confidence: medium      # low | medium | high
  category: shell         # shell | network | filesystem | credentials | ...
  scope:
    file_types: [shell]   # 이 규칙이 적용될 파일 유형
  patterns:
    - regex: 'your-regex-pattern-here'
      description: "이 패턴이 탐지하는 내용"
  remediation: "더 안전한 대안"
  tags: [relevant, tags]
```

3. 테스트를 추가합니다.
   - 최소 1개의 **positive test**: 반드시 매치되어야 하는 입력
   - 최소 1개의 **negative test**: 매치되면 안 되는 입력
4. [docs/RULES_CATALOG.md](docs/RULES_CATALOG.md)에 규칙 설명을 추가합니다.
5. `pnpm test`를 실행합니다.

**규칙 품질 체크리스트**

- [ ] 신호 대비 잡음이 높다(오탐이 적다)
- [ ] 무엇을 왜 탐지하는지 설명이 명확하다
- [ ] 대응 방안이 실질적이다
- [ ] positive/negative 테스트가 모두 있다
- [ ] severity와 confidence가 적절하다

### 2. 기존 규칙 개선

- 패턴을 더 정교하게 만들어 오탐 줄이기
- 증거 추출 개선(맥락 정보 보강)
- remediation 문구 개선
- 경계 사례 테스트 추가

### 3. 코드 기여

**시작 전에**

- 관련 이슈가 이미 있는지 확인하세요.
- 변경 범위가 크다면 먼저 이슈를 열고 접근 방식을 논의하세요.
- 코딩 표준은 [AI_GUIDE.md](AI_GUIDE.md)를 참고하세요.

**코딩 기준**

- TypeScript strict mode 유지(`no any`)
- 예측 가능한 실패는 예외 대신 `Result` 타입 사용
- 구조화된 로깅 사용(`console.log` 금지)
- 공개 함수에는 JSDoc 작성
- 기존 코드 패턴을 우선 존중

### 4. 문서 기여

- 오탈자 수정
- 설명 명확화
- 예시 보강
- 문서 번역 작업(`docs/<lang>/` 구조 추가 가능)

## Pull Request 절차

### PR 체크리스트

- [ ] 변경 사항에 맞는 테스트를 추가하거나 갱신했다
- [ ] Finding ID 안정성이 깨지지 않았다
- [ ] 리포트 스키마가 유지되었거나, 변경 이유가 명확하다
- [ ] scanner 모듈에 네트워크 호출을 추가하지 않았다
- [ ] 새로운 `any` 타입을 도입하지 않았다
- [ ] `pnpm test` 통과
- [ ] `pnpm tsc --noEmit` 통과
- [ ] 규칙 추가/수정 시 `docs/RULES_CATALOG.md` 업데이트
- [ ] 사용자에게 보이는 변경이면 `CHANGELOG.md`의 `Unreleased` 업데이트

### PR 제목 규칙

Conventional Commit 형식을 권장합니다.

- `feat: add OG-NET-006 DNS tunneling detection`
- `fix: reduce false positives in OG-SHELL-004`
- `docs: improve policy model documentation`
- `test: add edge case tests for scoring`
- `refactor: extract common pattern matching utils`

### 리뷰 절차

1. 자동화 검사(CI scan, tests, lint)를 통과해야 합니다.
2. 최소 1명의 maintainer 리뷰가 필요합니다.
3. 규칙 변경은 오탐/미탐 관점의 검토가 필요합니다.
4. 스키마 변경은 maintainer 2명의 승인이 필요합니다.

## 개발 워크플로

### 테스트 실행

```bash
# 전체 테스트
pnpm test

# 특정 모듈만 실행
pnpm test -- --filter scanner

# watch 모드
pnpm test -- --watch

# 스냅샷 갱신
pnpm test -- --update-snapshots

# 커버리지
pnpm test -- --coverage
```

### 린트와 포맷

```bash
# 린트
pnpm lint

# 포맷
pnpm format

# 타입 체크
pnpm tsc --noEmit
```

### 빌드

```bash
# CLI 빌드
pnpm build

# GitHub Action 빌드
pnpm build:action
```

## 이슈 제보

### 버그 리포트

다음 정보를 함께 포함해 주세요.

- OpenGuard 버전 (`openguard --version`)
- Node.js 버전 (`node --version`)
- 운영체제와 버전
- 실행한 명령과 전체 출력
- 기대한 동작과 실제 동작
- 가능하다면 최소 재현 예제

### 기능 요청

다음 내용을 포함하면 논의가 훨씬 수월합니다.

- 사용 사례 설명
- 기존 기능으로 해결되지 않는 이유
- 가능한 해결 방향
- 직접 구현 의사가 있는지 여부

## 행동 원칙

서로를 존중하고, 건설적으로 의견을 나누며, 협업 가능한 태도를 유지해 주세요. 목표는 AI 에이전트 사용을 더 안전하게 만드는 것입니다.

## 라이선스

OpenGuard에 기여하는 모든 변경 사항은 Apache License 2.0으로 배포되는 데 동의하는 것으로 간주됩니다.
