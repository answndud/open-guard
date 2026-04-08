# OpenGuard AI 개발 가이드

> **이 문서는 AI 코딩 에이전트용 안내서입니다.** OpenCode, Cursor, Claude Code 같은 도구가 OpenGuard를 구현할 때 따라야 할 제약 조건, 구현 순서, 코딩 기준, 모듈별 지침을 정의합니다.

## 1. 프로젝트 목표

OpenGuard MVP를 구현합니다. 핵심 목표는 다음과 같습니다.

- 규칙 기반 finding과 다축 위험 점수를 제공하는 정적 스캐너
- 최소 권한 정책 생성기(YAML)
- GitHub PR 댓글 봇(Action)
- 최소 수준의 SLSA-lite 서명/검증 기능

## 2. 절대 깨면 안 되는 제약

아래 규칙은 반드시 지켜야 합니다.

1. **데이터 유출 금지**: 스캐너는 스캔한 코드, finding, 그 외 어떤 데이터도 외부 서비스로 보내면 안 된다
2. **결정적 출력**: 같은 입력은 항상 같은 Finding ID와 점수를 생성해야 한다. Finding ID는 `hash(rule_id + file_path + start_line + matched_text)` 기반으로 만든다
3. **증거 필수**: 모든 Finding에는 파일 경로, 라인 범위, 코드 스니펫, 매칭 패턴이 포함되어야 한다
4. **코드 실행 금지**: 스캐너는 스캔 대상 코드를 실행, eval, import 하면 안 된다
5. **오프라인 동작**: 최초 저장소 clone 이후에는 인터넷 없이 스캔할 수 있어야 한다
6. **고신호 우선**: 잡음 많은 탐지보다 적더라도 정확한 finding을 우선한다. 애매하면 confidence를 높게 요구한다
7. **시크릿 마스킹**: 로그에는 `sk-`, `ghp_`, `AKIA`처럼 API 키/토큰/비밀번호로 보이는 패턴이 그대로 남으면 안 된다

## 3. 기술 스택

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 언어 | TypeScript 5.x (strict) | `tsconfig`에서 `"strict": true` |
| 런타임 | Node.js 20+ | 가능한 한 내장 API 우선 사용 |
| 패키지 매니저 | pnpm | lockfile 커밋 필수 |
| CLI 프레임워크 | commander | 가볍고 문서가 잘 되어 있음 |
| YAML | js-yaml | 규칙 로딩과 정책 직렬화용 |
| Git 작업 | simple-git | clone, diff 등에 사용 |
| 암호화 | @noble/ed25519 | SLSA-lite 서명/검증용 |
| 해싱 | Node.js `crypto` | Finding ID, 콘텐츠 해시 |
| 테스트 | vitest | 빠르고 TypeScript 친화적 |
| 빌드 | tsup | CLI 번들링 |
| 린트 | eslint + @typescript-eslint | 엄격한 구성 |
| 포맷 | prettier | 일관된 스타일 유지 |

## 4. 코딩 기준

### TypeScript

```typescript
// ✅ 권장: 엄격한 타입 사용
interface Finding {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: Severity;
}

// ✅ 권장: 고정값에는 const enum 사용
const enum Severity {
  Info = 'info',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

// ✅ 권장: 예상 가능한 실패는 Result 타입 사용
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// ❌ 금지: any 사용
// ❌ 금지: 근거 없는 non-null assertion(!)
// ❌ 금지: 예상 가능한 오류에 예외 남발
// ❌ 금지: console.log 사용
```

### 오류 처리

- 예상 가능한 실패는 `Result<T, E>`로 다룬다
- throw는 프로그래머 오류(버그)에만 사용한다
- 오류 메시지는 사용자가 바로 행동할 수 있게 작성한다
- 내부 경로와 스택 트레이스를 최종 사용자에게 노출하지 않는다

### 로깅

- 구조화된 로거(pino 또는 동급)를 사용한다
- 로그 레벨은 `debug`, `info`, `warn`, `error`
- 모든 로그에는 모듈/작업 맥락을 담는다
- 로그 출력 전 시크릿 마스킹을 적용한다

### 파일 I/O

- 모든 파일 읽기는 스캔 대상 루트 기준으로 처리한다
- 대상 디렉터리 밖을 가리키는 symlink를 따라가지 않는다
- `.gitignore`, `.openguardignore`를 존중한다
- 기본 파일 크기 제한은 1MB(설정 가능)이다

## 5. 모듈 구현 순서

아래 순서대로 구현합니다. 각 모듈은 테스트까지 마친 뒤 다음 단계로 넘어갑니다.

### Phase 1: 기반 모듈

#### Module 1: `src/ingest/` — 저장소 로더와 파일 탐색

**생성할 파일**

- `src/ingest/index.ts`
- `src/ingest/repo-loader.ts`
- `src/ingest/file-discovery.ts`
- `src/ingest/file-classifier.ts`
- `src/ingest/types.ts`

**핵심 동작**

- `loadTarget(target: string): Promise<RepoContext>`
- Git URL이면 임시 디렉터리로 clone 후 정리
- 로컬 경로면 존재 여부와 디렉터리 여부 검증
- `.gitignore`, `.openguardignore`, 최대 파일 크기를 반영한 파일 탐색
- 확장자/패턴 기준 파일 유형 분류

**테스트**

- 알려진 구조를 가진 로컬 경로에서 올바른 분류가 되는지
- `.gitignore` 패턴이 반영되는지
- 큰 파일이 건너뛰어지는지
- 루트 밖 symlink를 따라가지 않는지

#### Module 2: `src/scanner/` — 규칙 엔진과 evidence

**생성할 파일**

- `src/scanner/index.ts`
- `src/scanner/rule-loader.ts`
- `src/scanner/rule-engine.ts`
- `src/scanner/evidence.ts`
- `src/scanner/finding-factory.ts`
- `src/scanner/types.ts`

**핵심 동작**

- `loadRules(rulesDir: string): Rule[]`
- `scanFile(file, rules): Finding[]`
- `scanTarget(files, rules): Finding[]`
- evidence는 매치 전후 3줄 맥락과 라인 번호를 포함
- Finding ID는 `sha256(rule_id + ':' + relative_path + ':' + start_line + ':' + matched_text).slice(0, 12)`
- 같은 ID는 같은 finding으로 보고 첫 항목만 유지

**테스트**

- 각 규칙마다 최소 1개 positive, 1개 negative 테스트
- evidence의 라인 범위가 정확한지
- Finding ID가 실행마다 안정적인지
- 잘못된 파일 유형에는 규칙이 적용되지 않는지

### Phase 2: 점수와 정책

#### Module 3: `src/scoring/` — 위험 점수 계산

**생성할 파일**

- `src/scoring/index.ts`
- `src/scoring/score-calculator.ts`
- `src/scoring/weights.ts`
- `src/scoring/types.ts`

**핵심 동작**

- 정확한 알고리즘은 `ARCHITECTURE.md` 2.3절 기준
- 서브스코어는 100 상한
- 총점도 100 상한
- critical finding이 있으면 총점은 최소 60
- 결과는 항상 결정적이어야 함

**테스트**

- known findings 기준 기대 서브스코어/총점
- critical floor 동작 확인
- finding이 없을 때 0점
- category 매핑 정확성

#### Module 4: `src/policy/` — 정책 생성기

**생성할 파일**

- `src/policy/index.ts`
- `src/policy/policy-inferrer.ts`
- `src/policy/policy-serializer.ts`
- `src/policy/policy-validator.ts`
- `src/policy/safe-lists.ts`
- `src/policy/types.ts`

**핵심 동작**

- `generatePolicy(findings, context): Policy`
- 스크립트 명령 중 안전한 것은 allow, 위험한 것은 승인 필요
- 네트워크 호출 도메인 중 알려진 레지스트리는 allow, 나머지는 deny
- 프로젝트 내부 경로는 allow, 자격 증명 경로는 deny
- 출력은 `schemas/policy.schema.json`을 만족해야 함

**테스트**

- known findings에 맞는 정책 엔트리 생성
- safe list 명령 자동 허용
- 자격 증명 경로는 항상 deny
- 정책 스키마 검증 통과

### Phase 3: 출력과 인터페이스

#### Module 5: `src/report/` — 리포트 포맷터

**생성할 파일**

- `src/report/index.ts`
- `src/report/json-reporter.ts`
- `src/report/markdown-reporter.ts`
- `src/report/pr-comment-renderer.ts`
- `src/report/types.ts`

**핵심 동작**

- JSON 리포트는 `schemas/report.schema.json` 준수
- Markdown에는 위험 점수, finding 표, evidence 스니펫 포함
- PR 댓글에는 점수 delta, 신규 finding, 정책 diff 포함
- PR 댓글은 HTML marker를 이용해 idempotent 하게 갱신 가능해야 함

**테스트**

- JSON 리포트 스키마 검증
- known findings에 대한 Markdown 렌더링
- base/head 비교 시 신규 finding만 출력되는지
- 리포트 포맷 스냅샷 테스트

#### Module 6: `src/cli/` — 명령행 인터페이스

**생성할 파일**

- `src/cli/index.ts`
- `src/cli/scan-command.ts`
- `src/cli/policy-command.ts`
- `src/cli/sign-command.ts`
- `src/cli/verify-command.ts`

**핵심 동작**

- `scan`, `policy generate`, `sign`, `verify` 명령 제공
- 전체 CLI 계약은 `SPEC.md` 7절 기준
- 종료 코드: 0=성공, 1=오류, 2=임계값 초과
- 기본 컬러 출력, `--no-color` 지원
- 긴 스캔에는 진행 상황 표시 가능

**테스트**

- fixture 기준 통합 테스트
- 잘못된 경로, 잘못된 포맷 등 오류 처리
- 임계값 기준 종료 코드 확인

### Phase 4: 신뢰 계층과 CI

#### Module 7: `src/trust/` — 서명과 검증

**생성할 파일**

- `src/trust/index.ts`
- `src/trust/signer.ts`
- `src/trust/verifier.ts`
- `src/trust/metadata.ts`
- `src/trust/types.ts`

**핵심 동작**

- 서명: `hash(artifact contents) + metadata`를 Ed25519로 서명
- 검증: 공개키로 서명 확인, 메타데이터 검증
- 메타데이터: timestamp, version, commit SHA, builder 정보 포함
- 서명 엔벌로프 형식은 `ARCHITECTURE.md` 2.7절 참고

#### Module 8: `github-action/` — PR 댓글 Action

**생성할 파일**

- `github-action/action.yml`
- `github-action/index.ts`
- `github-action/pr-commenter.ts`

**핵심 동작**

- `pull_request` 이벤트에서 실행
- HEAD를 스캔하고, 필요하면 BASE와 diff
- 댓글 생성 또는 갱신(idempotent)
- 임계값 기준으로 체크 상태 설정
- `@actions/core`, `@actions/github` 사용

## 6. 파일명과 구조 규칙

```
src/
├── ingest/
│   ├── index.ts
│   ├── types.ts
│   ├── repo-loader.ts
│   └── __tests__/         # 또는 루트 tests/ 사용
├── scanner/
│   ├── index.ts
│   ├── types.ts
│   └── ...
└── ...
```

- 각 모듈은 공개 API만 export 하는 `index.ts`를 가진다
- 모듈별 타입은 해당 디렉터리의 `types.ts`에 둔다
- 공용 타입은 `src/types.ts`에 둔다
- 테스트는 `tests/`에서 소스 구조를 반영한다

## 7. 규칙 개발 프로토콜

규칙을 추가하거나 수정할 때는 다음 순서를 따른다.

1. `rules/<category>.yaml`에 규칙 추가/수정
2. 최소 2개 테스트 추가: positive 1개, negative 1개
3. 필요하면 `tests/fixtures/`에 테스트 픽스처 추가
4. `docs/RULES_CATALOG.md` 갱신
5. 전체 테스트 실행: `pnpm test`
6. Finding ID 안정성 확인(스냅샷 테스트 포함)

## 8. 출력 계약

모든 출력은 `schemas/` 아래 JSON 스키마를 따라야 한다.

- `finding.schema.json`: 개별 finding 형식
- `policy.schema.json`: 정책 파일 형식
- `report.schema.json`: 스캔 리포트 형식

스키마를 바꾸는 경우에는 반드시:

1. 스키마 파일을 갱신하고
2. 영향을 받는 테스트를 모두 수정하고
3. `docs/VERSIONING.md` 기준으로 버전을 조정해야 한다

## 9. AI 에이전트용 권장 프롬프트

모듈 단위 구현을 유도할 때는 아래 형태의 프롬프트를 사용할 수 있다.

```text
"AI_GUIDE.md, ARCHITECTURE.md, SPEC.md를 읽은 뒤, AI_GUIDE.md Module 1 사양에 따라 ingest 모듈(src/ingest/)을 구현해라. 명시된 모든 파일과 테스트를 포함해 완성하라."

"AI_GUIDE.md와 docs/RULES_CATALOG.md를 읽고, Module 2 지침에 맞게 scanner 모듈(src/scanner/)을 구현해라. rules/*.yaml에서 규칙을 로드하고 evidence 추출까지 포함하라. 모든 규칙에 대한 테스트를 추가하라."

"AI_GUIDE.md와 ARCHITECTURE.md 2.3절을 읽고 scoring 모듈(src/scoring/)을 정확한 알고리즘으로 구현해라. empty findings, all critical, mixed categories 같은 edge case를 포함하라."

"AI_GUIDE.md와 docs/POLICY.md를 읽고 policy 모듈(src/policy/)을 구현해라. docs/POLICY.md 6절의 safe list를 사용해 finding으로부터 YAML 정책을 생성하라."

"AI_GUIDE.md를 읽고 report 모듈(src/report/)을 구현해라. JSON, Markdown, PR comment 포맷터를 포함하고, JSON은 schemas/report.schema.json을 만족해야 한다."

"AI_GUIDE.md와 SPEC.md 7절을 읽고 commander 기반 CLI(src/cli/)를 구현해라. scan, policy, sign, verify 명령을 모두 연결하라."

"AI_GUIDE.md의 Module 7 지침에 따라 @noble/ed25519 기반 SLSA-lite 서명/검증을 구현해라."

"AI_GUIDE.md의 Module 8 지침에 따라 github-action/ 아래 PR 스캔 및 댓글 게시 Action을 구현해라."
```

## 10. 모듈별 완료 기준

모듈은 다음 조건을 모두 만족해야 완료로 본다.

- [ ] 명시된 파일이 모두 생성되었다
- [ ] TypeScript가 오류 없이 컴파일된다 (`pnpm tsc --noEmit`)
- [ ] 모든 테스트가 통과한다 (`pnpm test`)
- [ ] 구현 코드에 `any`가 없다
- [ ] 예상 가능한 실패는 Result 타입으로 처리된다
- [ ] 로깅은 구조화된 로거를 사용한다
- [ ] 공개 API가 모듈의 `index.ts`에서 export 된다
- [ ] 이전 모듈과의 통합이 검증되었다
