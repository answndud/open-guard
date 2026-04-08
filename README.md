<p align="center">
  <h1 align="center">OpenGuard</h1>
  <p align="center">
    <strong>AI 에이전트 스킬과 워크플로를 위한 보안 스캐너이자 신뢰 계층</strong>
  </p>
  <p align="center">
    <a href="#빠른-시작">빠른 시작</a> ·
    <a href="GUIDE.md">입문 가이드</a> ·
    <a href="#주요-기능">주요 기능</a> ·
    <a href="ARCHITECTURE.md">아키텍처</a> ·
    <a href="PLAN.md">로드맵</a> ·
    <a href="CONTRIBUTING.md">기여 안내</a>
  </p>
</p>

---

## 문제 정의

OpenCode, Cursor, Claude Code, Copilot Workspace 같은 AI 코딩 에이전트는 이제 다양한 "스킬" 생태계를 빠르게 흡수하고 있습니다. 저장소, 프롬프트 팩, 셸 스크립트, GitHub Actions, MCP 서버, 자동화 워크플로가 모두 에이전트의 능력을 확장하는 수단이 되고 있습니다.

이런 스킬은 다음과 같은 민감한 자원에 접근할 수 있습니다.

| 자산 | 예시 |
| --- | --- |
| **자격 증명** | `~/.ssh`, `~/.aws`, API 키, `.env` 파일 |
| **파일** | 소스 코드, 브라우저 프로필, 비밀번호 내보내기 파일 |
| **네트워크** | 임의의 외부 연결, 데이터 유출 |
| **셸** | 전체 명령 실행, cron/launchd 기반 지속성 |

문제는, **실행 전에 이 스킬이 안전한지 평가하고, 통제하고, 검증할 표준적인 방법이 사실상 없다는 점**입니다. 결국 사용자는 무턱대고 신뢰하거나, 일일이 수동 감사에 의존하게 됩니다. 둘 다 규모가 커질수록 한계가 분명합니다.

## 해결 방식

OpenGuard는 AI 에이전트 스킬 공급망에 의존성 수준의 보안 관점을 가져옵니다.

```

                    OpenGuard Pipeline

  Skill Input ──► Static Scan ──► Risk Score ──► Policy
  (repo/script)    (rules)        (evidence)    (allowlist)

       ┌──────────────┐    ┌──────────────────┐
       │ PR Comment   │    │ Publisher Sign   │
       │ (CI Bot)     │    │ (SLSA-lite)      │
       └──────────────┘    └──────────────────┘

```

## 주요 기능

### MVP (v0.1)

- **정적 위험 스캐너**: `curl|bash`, `chmod 777`, `base64|sh`, `osascript`, PowerShell 난독화, 자격 증명 접근 같은 위험 패턴을 탐지합니다.
- **다축 위험 점수 계산**: 셸, 네트워크, 파일시스템, 자격 증명 위험을 각각 분리해 점수화하고 근거를 함께 제공합니다.
- **최소 권한 정책 생성기**: 명령, 경로, 도메인 기반 allowlist 정책과 승인 게이트를 자동 생성합니다.
- **GitHub PR 봇**: CI Action으로 PR에 위험 요약, 신규 finding 차이, 권장 정책 변경사항을 댓글로 남깁니다.
- **퍼블리셔 서명(SLSA-lite)**: 배포 산출물에 provenance 메타데이터와 함께 서명하고, 소비자는 설치 전에 이를 검증할 수 있습니다.
- **로컬 대시보드**: 최신 스캔 결과, 추이, 정책 상태를 확인할 수 있는 읽기 전용 웹 UI를 제공합니다.

### 차별점

| 항목 | 전통적인 SAST | OpenGuard |
| --- | --- | --- |
| AI 스킬 특화 규칙 | 아니오 | 예, 프롬프트 팩·MCP 서버·에이전트 워크플로를 이해 |
| 정책 기반 도구 실행 통제 | 아니오 | 예, 프롬프트 인젝션까지 고려한 실행 게이트 |
| 퍼블리셔 신원 검증 | 아니오 | 예, SLSA-lite 서명과 검증 |
| 승인 워크플로 | 아니오 | 예, 셸 실행/신규 도메인 등에 2단계 승인 가능 |

## 빠른 시작

```bash
# 전역 설치
npm install -g openguard
```

프로젝트를 클론해서 개발 모드로 바로 실행하려면:

```bash
pnpm install
pnpm dev -- scan . --format md
```

전역 설치 후에는 `openguard ...`, 저장소 안에서 개발 모드로 돌릴 때는 `pnpm dev -- ...` 형태로 쓰면 됩니다.

## 로컬에서 사용하는 기본 흐름

### 1. 저장소/스킬 스캔

```bash
# 현재 폴더를 읽기 쉬운 Markdown으로 출력
openguard scan . --format md

# 로컬 스킬/저장소 스캔
openguard scan ./path/to/skill --format json --out report.json

# 원격 GitHub 저장소 스캔
openguard scan https://github.com/org/repo --format md

# 기준 브랜치 대비 신규 finding만 스캔
openguard scan . --diff-base main
```

자주 함께 쓰는 옵션:

- `--format <md|json|sarif>`: 출력 형식 선택
- `--out <file>`: 결과를 파일로 저장
- `--diff-base <gitref>`: 기준 브랜치 대비 새 finding만 표시
- `--threshold <number>`: 점수가 임계값 이상이면 종료 코드 `2`
- `--rules <dir>`: 사용자 정의 규칙 디렉터리 추가
- `--policy <file>`: 기존 정책 파일 검증
- `--save-run`: 대시보드용 실행 기록 저장
- `--data-dir <dir>`: 대시보드 데이터 저장 위치 지정

### 2. 정책 생성 및 검증

```bash
# 최소 권한 정책 생성
openguard policy generate ./path/to/skill --out openguard.policy.yaml

# 코드 스캐닝 도구용 SARIF 내보내기
openguard scan ./path/to/skill --format sarif --out openguard.sarif

# 생성한 정책을 기준으로 다시 스캔
openguard scan ./path/to/skill --policy openguard.policy.yaml --format md
```

### 3. 대시보드에 실행 기록 저장

대시보드는 메모리에서 바로 스캔 결과를 보여주는 구조가 아니라, `--save-run`으로 저장된 실행 기록을 읽어 보여줍니다.

```bash
# 스캔 결과 저장
openguard scan ./path/to/skill --format md --save-run

# 정책 생성 결과도 함께 저장
openguard policy generate ./path/to/skill --save-run

# 저장 위치를 따로 두고 싶을 때
openguard scan ./path/to/skill --save-run --data-dir ./.openguard-demo
```

### 4. 로컬 서버 실행

```bash
# 기본 포트 8787
openguard server --port 8787

# 저장 위치를 지정한 경우 같은 data-dir로 실행
openguard server --port 8787 --data-dir ./.openguard-demo
```

브라우저에서 `http://localhost:8787`을 열면 대시보드를 볼 수 있습니다.

### 5. 대시보드에서 할 수 있는 일

- 최신 저장 run의 총점, 위험 수준, finding 수, 정책 첨부 여부 확인
- 최근 저장된 run 목록 확인
- run별 점수 추이 확인
- 최신 run의 severity 분포 확인
- 개별 run 상세 화면에서 finding 목록, 파일 경로, 라인 번호 확인

현재 대시보드는 읽기 전용입니다. 실행 기록과 정책 파일을 저장해두고, 그것을 훑어보는 용도입니다.

### 6. 서명/검증

```bash
# 서명
openguard sign ./artifact --key publisher.key --out artifact.sig.json

# 서명된 아티팩트 검증
openguard verify ./artifact --pub publisher.pub
```

### 7. 대화형 메뉴

아무 인자 없이 실행하면 대화형 메뉴가 열립니다.

```bash
openguard
```

대화형 메뉴에서는 다음 기능을 순서대로 실행할 수 있습니다.

- 스캔
- 마지막 스캔 다시 실행
- 정책 생성
- 로컬 대시보드 열기
- 아티팩트 서명
- 서명 검증

## 대시보드가 읽는 데이터

대시보드는 저장 디렉터리 안의 run index와 report/policy 파일을 읽습니다.

- 기본 저장 위치: `./.openguard`
- 다른 위치를 쓰려면 `scan/policy generate`와 `server`에 같은 `--data-dir`를 넘겨야 함
- 기록이 하나도 없으면 빈 상태 화면이 보임

예를 들어:

```bash
openguard scan . --save-run --data-dir ./.openguard-demo
openguard server --data-dir ./.openguard-demo
```

## 결과를 해석할 때 주의할 점

- 점수는 triage용 신호이지 최종 판정이 아닙니다.
- `.github/workflows/*`, 실제 스크립트, manifest finding은 보통 신뢰도가 높습니다.
- 문서/테스트/예제 경로의 generic finding 노이즈는 현재 기본적으로 줄여두었지만, 리포트는 항상 근거 파일과 라인을 같이 확인하는 편이 안전합니다.
- 자세한 읽는 법은 [docs/INTERPRETING_RESULTS.md](docs/INTERPRETING_RESULTS.md)를 참고하세요.

## CI 연동 (GitHub Actions)

```yaml
# .github/workflows/openguard.yml
name: OpenGuard Scan
on: [pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: openguard/action@v1
        with:
          github-token: ${{ github.token }}
          fail-on-score: 70 # 위험 점수가 70 이상이면 PR 실패
          comment: true # finding 요약 댓글 게시
```

봇은 모든 PR에 다음 정보를 남깁니다.

- 전체 위험 점수와 기준 브랜치 대비 변화량
- PR에서 새로 추가된 finding
- 권장 정책 변경사항
- 파일/라인 기준의 증거 링크

## SARIF 및 코드 스캐닝

OpenGuard는 GitHub Code Scanning 등에서 활용할 수 있도록 SARIF를 출력할 수 있습니다.

```bash
openguard scan ./path/to/skill --format sarif --out openguard.sarif
```

## OpenGuard가 스캔하는 대상

| 입력 유형 | 예시 |
| --- | --- |
| Git 저장소 | 로컬 경로, 원격 URL |
| 셸 스크립트 | `*.sh`, `*.bash`, `*.zsh`, `*.ps1` |
| 패키지 스크립트 | `npm postinstall`, `pip setup.py`, `Makefile` |
| GitHub Actions | `.github/workflows/*.yml` |
| Markdown 지침 | README 설치 단계, 스킬 문서 |
| MCP 서버 설정 | 서버 매니페스트, 도구 정의 |

## MVP에서 하지 않는 것

- 완전한 동적 샌드박스 실행
- 시그니처 기반 악성코드 탐지
- 코드 리뷰 대체: OpenGuard는 가드레일이지, 최종 판단을 대신하는 도구가 아닙니다

## 프로젝트 구조

```
openguard/
├── README.md              # 프로젝트 개요와 빠른 시작
├── SPEC.md                # 제품 명세
├── ARCHITECTURE.md        # 기술 아키텍처
├── docs/BUSINESS.md       # 수익화 및 GTM 전략
├── docs/THREAT_MODEL.md   # 위협 모델과 공격 표면
├── docs/POLICY.md         # 정책 모델 문서
├── docs/RULES_CATALOG.md  # 규칙 정의와 카탈로그
├── docs/SECURITY.md       # 보안 정책 및 제보 절차
├── AI_GUIDE.md            # AI 코딩 에이전트용 개발 가이드
├── CONTRIBUTING.md        # 기여 안내
├── PLAN.md                # 현재 개발 계획
├── PROGRESS.md            # 실행 이력과 미해결 항목
├── docs/VERSIONING.md     # 버전 정책
├── CHANGELOG.md           # 변경 이력
├── schemas/               # finding, policy, report용 JSON 스키마
├── rules/                 # YAML 규칙 정의
├── examples/              # 샘플 스킬과 정책
├── src/                   # 소스 코드
│   ├── ingest/            # 저장소 로더와 파일 분류
│   ├── scanner/           # 규칙 엔진과 증거 추출
│   ├── scoring/           # 위험 점수 계산 엔진
│   ├── policy/            # 정책 생성기
│   ├── report/            # JSON, Markdown, SARIF 리포터
│   ├── cli/               # CLI 진입점
│   ├── server/            # 로컬 대시보드 서버
│   └── trust/             # 서명 및 검증
├── tests/                 # 테스트 스위트
├── .github/workflows/     # CI 설정
└── docs/                  # 추가 문서
```

## 라이선스

Apache License 2.0. 자세한 내용은 [LICENSE](LICENSE)를 참고하세요.

## 문서 링크

- [제품 명세](SPEC.md)
- [아키텍처](ARCHITECTURE.md)
- [비즈니스 및 수익화](docs/BUSINESS.md)
- [위협 모델](docs/THREAT_MODEL.md)
- [규칙 카탈로그](docs/RULES_CATALOG.md)
- [로드맵 및 개발 계획](PLAN.md)
- [실행 이력](PROGRESS.md)
- [결과 해석 가이드](docs/INTERPRETING_RESULTS.md)
- [기여 안내](CONTRIBUTING.md)
