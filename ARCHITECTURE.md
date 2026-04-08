# OpenGuard 아키텍처 (MVP)

## 1. 시스템 개요

OpenGuard는 CLI 중심의 TypeScript 애플리케이션입니다. AI 에이전트 스킬과 워크플로를 정적으로 분석해 보안 위험을 탐지하고, 최소 권한 정책을 생성합니다. 또한 가벼운 로컬 서버를 통해 스캔 이력과 정책 상태를 웹 UI로 확인할 수 있습니다.

이 아키텍처는 다음 원칙을 기준으로 설계되었습니다.

- **확장성**: YAML 기반 규칙 추가, 새로운 파일 유형 확장 가능
- **결정성**: 같은 입력은 항상 같은 결과를 생성
- **오프라인 동작**: 분석 단계에서는 네트워크 없이도 동작
- **조합 가능성**: 각 모듈을 독립적으로 사용할 수 있음

```
┌──────────────────────────────────────────────────────────────────┐
│                         CLI (src/cli/)                          │
│  Commands: scan | policy generate | sign | verify | server      │
└──────┬───────────────┬──────────────────┬───────────────────┬───┘
       │               │                  │                   │
       ▼               ▼                  ▼                   ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐ ┌───────────────┐
│   Ingest    │ │   Scanner   │ │    Policy    │ │    Trust      │
│ (src/ingest)│ │(src/scanner)│ │ (src/policy) │ │  (src/trust)  │
│             │ │             │ │              │ │               │
│ repo loader │ │ rule engine │ │ allowlist    │ │ sign/verify   │
│ file class. │ │ evidence    │ │ inference    │ │ metadata      │
│ git ops     │ │ extraction  │ │ serializer   │ │ provenance    │
└──────┬──────┘ └──────┬──────┘ └──────┬───────┘ └───────────────┘
       │               │               │
       ▼               ▼               │
┌─────────────┐ ┌─────────────┐        │
│   Scoring   │ │   Report    │◄───────┘
│(src/scoring)│ │ (src/report)│
│             │ │             │
│ subscores   │ │ JSON writer │
│ aggregation │ │ MD renderer │
│ thresholds  │ │ PR comment  │
└─────────────┘ └─────────────┘
       │
       ▼
┌───────────────┐
│    Server     │
│ (src/server)  │
│ dashboard API │
│ static UI     │
└───────────────┘
```

## 2. 구성 요소 상세

### 2.1 Ingest (`src/ingest/`)

**역할:** 스캔 대상(로컬 경로 또는 Git URL)을 로드하고, 분석 대상 파일을 분류합니다.

**모듈**

- `repo-loader.ts`: 원격 저장소를 임시 디렉터리로 clone 하거나, 로컬 경로를 검증 및 해석
- `file-discovery.ts`: 디렉터리 트리를 순회하며 `.gitignore`, `.openguardignore`를 반영
- `file-classifier.ts`: 파일 유형을 분류해 어떤 규칙 집합을 적용할지 결정

**파일 분류 예시**

| 분류 | 확장자 / 패턴 |
| --- | --- |
| `shell` | `*.sh`, `*.bash`, `*.zsh`, `Makefile`, `Justfile` |
| `powershell` | `*.ps1`, `*.psm1`, `*.psd1` |
| `javascript` | `*.js`, `*.mjs`, `*.cjs` |
| `typescript` | `*.ts`, `*.mts`, `*.cts` |
| `python` | `*.py`, `setup.py`, `setup.cfg` |
| `yaml-workflow` | `.github/workflows/*.yml`, `.github/workflows/*.yaml` |
| `yaml-config` | `*.yml`, `*.yaml`(워크플로 제외) |
| `markdown` | `*.md`, `*.mdx` |
| `json-config` | `package.json`, `composer.json`, `*.config.json` |
| `dockerfile` | `Dockerfile`, `*.dockerfile`, `docker-compose*.yml` |
| `mcp-config` | MCP 서버 매니페스트, 도구 정의 |

**출력:** `{ path, category, size }` 형태의 `FileEntry[]`

### 2.2 Scanner (`src/scanner/`)

**역할:** 분류된 파일에 규칙을 적용해 finding과 증거를 생성합니다.

**모듈**

- `rule-loader.ts`: `rules/*.yaml`을 읽어 타입이 지정된 규칙 객체로 변환
- `rule-engine.ts`: 파일 내용과 규칙을 매칭하고 finding 생성
- `evidence.ts`: 파일 경로, 라인 범위, 스니펫, 매칭 텍스트 추출
- `finding-factory.ts`: 안정적인 finding ID 생성

**규칙 실행 흐름**

```
각 FileEntry에 대해:
  1. 파일 유형과 규칙 scope를 기준으로 적용 가능한 규칙을 선택
  2. 각 규칙에 대해
     a. 패턴 매처 실행(대부분 정규식 기반)
     b. 매치되면
        - 증거 추출(라인 범위, 스니펫, 매칭 문자열)
        - 안정적인 ID를 가진 Finding 생성
  3. ID 기준으로 중복 제거
```

**규칙 정의 예시(YAML)**

```yaml
id: OG-SHELL-001
title: "curl 파이프를 통한 원격 코드 실행"
description: "curl/wget 결과를 바로 셸로 넘겨 실행하는 패턴을 탐지한다"
severity: critical
confidence: high
category: shell
scope:
  file_types: [shell, markdown, yaml-workflow]
patterns:
  - regex: 'curl\s+[^|]*\|\s*(ba)?sh'
    description: "curl 결과를 bash로 바로 넘김"
  - regex: 'wget\s+[^|]*\|\s*(ba)?sh'
    description: "wget 결과를 bash로 바로 넘김"
remediation: "스크립트를 먼저 내려받아 내용을 검토하고 체크섬을 확인한 뒤 실행하세요"
tags: [supply-chain, rce]
```

### 2.3 Scoring (`src/scoring/`)

**역할:** finding을 바탕으로 위험 점수를 계산합니다.

**모듈**

- `score-calculator.ts`: 서브스코어와 총점 계산
- `weights.ts`: severity/confidence/category 가중치 정의

**알고리즘 요약**

```typescript
const SEVERITY_POINTS = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

const CONFIDENCE_WEIGHT = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

const CATEGORY_WEIGHTS = {
  shell: 0.3,
  network: 0.25,
  filesystem: 0.2,
  credentials: 0.25,
};
```

- finding별 기여도는 `severity 점수 × confidence 가중치`
- 카테고리별 점수는 합산 후 100으로 cap
- 전체 점수는 가중 합산 후 반올림
- critical finding이 하나라도 있으면 전체 점수는 최소 60

**카테고리 매핑**

| finding category | 점수 차원 |
| --- | --- |
| `shell`, `obfuscation` | `shell` |
| `network`, `supply-chain` | `network` |
| `filesystem`, `macos`, `windows` | `filesystem` |
| `credentials` | `credentials` |
| `gha` | 권한 관련은 `credentials`, 실행 단계 관련은 `shell` |

### 2.4 Policy (`src/policy/`)

**역할:** finding을 바탕으로 최소 권한 정책을 추론합니다.

**모듈**

- `policy-inferrer.ts`: 필요한 권한을 추론
- `policy-serializer.ts`: YAML 정책 파일 직렬화
- `policy-validator.ts`: 스키마 검증
- `policy-merge.ts`: 기존 사용자 정책과 deny-first 방식으로 병합

**추론 로직**

1. 셸 스크립트에서 발견된 명령을 수집해 안전한 명령은 allowlist에 추가
2. 접근된 파일 경로를 분석해 프로젝트 내부 읽기 경로를 허용
3. 외부 도메인을 수집해 알려진 안전 도메인을 허용
4. 위험한 동작은 승인 필요 또는 deny 대상으로 분류
5. 명시적으로 허용되지 않은 것은 기본적으로 차단

### 2.5 Report (`src/report/`)

**역할:** 스캔 결과를 다양한 형식으로 출력합니다.

**모듈**

- `json-reporter.ts`: `schemas/report.schema.json`에 맞는 전체 JSON 리포트
- `markdown-reporter.ts`: 사람이 읽기 쉬운 Markdown 보고서
- `pr-comment-renderer.ts`: GitHub PR 댓글용 포맷
- `sarif-reporter.ts`: GitHub Code Scanning용 SARIF

**PR 댓글 예시**

```markdown
## OpenGuard Scan Report

**Risk Score: 72/100** (Very High) +15 vs base

| Category    | Score | Findings           |
| ----------- | ----- | ------------------ |
| Shell       | 85    | 3 critical, 2 high |
| Network     | 60    | 1 high, 1 medium   |
| Filesystem  | 45    | 2 medium           |
| Credentials | 30    | 1 high             |

### New Findings

| ID         | Severity | Rule         | File         | Line |
| ---------- | -------- | ------------ | ------------ | ---- |
| `a1b2c3d4` | Critical | OG-SHELL-001 | `install.sh` | L12  |
| `e5f6g7h8` | High     | OG-NET-001   | `setup.sh`   | L45  |
```

### 2.6 CLI (`src/cli/`)

**역할:** 명령행 인터페이스와 전체 오케스트레이션을 담당합니다.

**모듈**

- `index.ts`: 명령 등록과 엔트리포인트
- `scan-command.ts`: ingest → scan → score → report 흐름 실행
- `policy-command.ts`: ingest → scan → policy generate 흐름 실행
- `sign-command.ts`: 산출물 서명
- `verify-command.ts`: 산출물 검증

### 2.7 Server (`src/server/`)

**역할:** 스캔 이력과 정책 상태를 보여주는 읽기 전용 로컬 대시보드를 제공합니다.

**모듈**

- `index.ts`: HTTP 서버 엔트리포인트
- `api.ts`: runs, summary, policy를 제공하는 최소 JSON API
- `store.ts`: 파일 기반 실행 이력 저장소와 인덱스 관리
- `ui/`: 정적 HTML/JS/CSS 자산

### 2.8 Trust (`src/trust/`)

**역할:** SLSA-lite 수준의 서명과 검증을 제공합니다.

**모듈**

- `signer.ts`: Ed25519 키로 산출물 해시와 메타데이터에 서명
- `verifier.ts`: 공개키 기준으로 서명 검증
- `metadata.ts`: 타임스탬프, 커밋, 버전 같은 provenance 메타데이터 생성

**서명 엔벌로프 예시**

```json
{
  "payload_hash": "sha256:abc123...",
  "payload_type": "application/vnd.openguard.skill.v1",
  "metadata": {
    "timestamp": "2026-02-09T12:00:00Z",
    "version": "1.0.0",
    "commit": "abc123def456",
    "builder": "openguard-cli/0.1.0"
  },
  "signature": "base64-encoded-ed25519-signature"
}
```

## 3. 데이터 흐름

### 3.1 스캔 흐름

```
사용자: openguard scan ./skill
          │
          ▼
    ┌─────────────┐
    │  Ingest     │
    │  repo-loader│──► 경로 해석 / 저장소 clone
    │  file-disc. │──► 파일 탐색
    │  file-class.│──► 파일 유형 분류
    └──────┬──────┘
           │ FileEntry[]
           ▼
    ┌─────────────┐
    │  Scanner    │
    │  rule-loader│──► rules/*.yaml 로드
    │  rule-engine│──► 파일별 패턴 매칭
    │  evidence   │──► 근거 추출
    └──────┬──────┘
           │ Finding[]
           ▼
    ┌─────────────┐
    │  Scoring    │──► 서브스코어 + 총점 계산
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  Policy     │──► allowlist 정책 생성(선택)
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  Report     │──► JSON / MD / SARIF 출력
    └──────┬──────┘
           │
           ▼
      stdout / file
```

### 3.2 CI 흐름 (GitHub Action)

```
PR 생성/업데이트
       │
       ▼
GitHub Action 실행
       │
       ▼
HEAD + BASE checkout
       │
       ▼
Action 번들 준비
       │
       ▼
HEAD 스캔 ─────────────────────┐
BASE 스캔 ─────────┐           │
                   │           │
                   ▼           ▼
              base_report  head_report
                   │           │
                   └─────┬─────┘
                         │
                    finding diff
                         │
                         ▼
                  신규 finding만 추출
                         │
                         ▼
                    PR 댓글 렌더링
                         │
                         ▼
                  댓글 게시/업데이트
                         │
                         ▼
                    체크 상태 설정
```

## 4. 기술 선택

| 관심사 | 선택 | 이유 |
| --- | --- | --- |
| 언어 | TypeScript (strict) | npm/GitHub Actions 생태계와 잘 맞고 팀 친화적 |
| 런타임 | Node.js 20+ | LTS, 안정성, I/O 중심 작업에 적합 |
| 패키지 매니저 | pnpm | 빠르고 엄격하며 관리가 편함 |
| CLI 프레임워크 | `commander` | 가볍고 널리 쓰임 |
| YAML 파싱 | `js-yaml` | 표준적이고 유지보수가 안정적 |
| Git 연산 | `simple-git` | 프로그래밍 방식 Git 제어 |
| 해싱 | Node.js `crypto` | 내장 모듈, 추가 의존성 최소화 |
| 서명 | `@noble/ed25519` | 순수 JS, 감사 이력, 네이티브 의존성 없음 |
| 테스트 | `vitest` | 빠르고 TypeScript 친화적 |
| 린트/포맷 | `eslint` + `prettier` | 표준적 조합 |
| 빌드 | `tsup` | CLI 번들링에 적합 |

## 5. 규칙 시스템 설계

### 5.1 규칙 정의 형식

규칙은 `rules/` 디렉터리에 있는 YAML 데이터 파일입니다.

```
rules/
├── shell.yaml
├── powershell.yaml
├── network.yaml
├── credentials.yaml
├── gha.yaml
├── macos.yaml
├── supply-chain.yaml
└── _meta.yaml
```

### 5.2 규칙 로딩 및 캐싱

- 규칙은 시작 시 한 번 로드하고 메모리에 유지
- 규칙 파일은 스키마에 맞게 검증
- `--rules` 플래그로 사용자 정의 규칙을 병합 가능
- 충돌 시 우선순위는 `custom > built-in`

### 5.3 패턴 매칭

MVP에서는 정규식 기반 매칭을 사용합니다.

- 대부분의 규칙은 라인 기반 매칭
- 일부 규칙은 멀티라인 매칭 지원
- 증거 스니펫은 매치 기준 앞뒤 3줄 문맥 추출
- 매칭 텍스트와 그룹은 evidence 상세에 반영

향후 확장 방향:

- JavaScript/TypeScript/Python AST 기반 분석
- GitHub Actions용 YAML 구조 인지 매칭 강화
- OPA/Rego 기반 정책 평가

## 6. 확장 포인트 (Post-MVP)

| 확장 항목 | 설명 |
| --- | --- |
| 사용자 정의 규칙 팩 | 커뮤니티 규칙 세트(npm 패키지 형태) |
| 언어 분석기 | 정규식 이상의 AST 기반 분석 |
| 정책 평가기 | 복잡한 정책을 위한 OPA/Rego 런타임 |
| 샌드박스 실행기 | 컨테이너 기반 동적 분석 |
| 웹 대시보드 | 팀 정책 관리, 감사 로그, 팀 관리 |
| API 서버 | 플랫폼 연동용 REST/GraphQL |
| 플러그인 시스템 | 커스텀 리포터, ingest, scorer 확장 |

## 7. 보안 고려사항

- **코드 실행 금지**: 스캐너는 정적 분석만 수행하며, 대상 코드를 실행하지 않음
- **스캔 중 네트워크 호출 금지**: 최초 저장소 fetch 이후에는 오프라인 동작
- **텔레메트리 없음**: MVP 기준으로 사용자 데이터는 외부로 전송되지 않음
- **결정적 출력**: 같은 입력은 항상 같은 finding ID를 생성
- **시크릿 마스킹**: 로그에 API 키/토큰처럼 보이는 문자열이 남지 않도록 처리
- **의존성 최소화**: 도구 자체의 공급망 공격 표면을 줄이기 위해 의존성 수를 제한
