# OpenGuard 제품 명세 (MVP)

## 1. 문제 정의

AI 에이전트 스킬과 워크플로는 공개 저장소에서 내려받아 로컬 권한을 넓게 가진 상태로 실행되는 경우가 많습니다. 기존 패키지 의존성 생태계처럼 레지스트리, 취약점 데이터베이스, 샌드박스 모델이 잘 정착된 영역과 달리, AI 에이전트 스킬은 다음과 같은 위험을 자주 포함합니다.

- 관리자 권한이 필요한 셸 명령 실행을 유도
- `~/.ssh`, `~/.aws`, 브라우저 프로필 같은 민감 경로 접근
- 임의의 외부 네트워크 엔드포인트 호출
- API 키와 비밀값 입력 요구
- 셸 설정 파일을 수정해 지속성 확보

현재 사용자는 대부분 **수동 판단**에 의존합니다. 하지만 스킬 생태계가 커질수록 이 방식은 확장되지 않습니다. OpenCode, Cursor, Claude Code, OpenClaw, MCP 서버 같은 흐름이 커질수록 "스킬 공급망" 자체가 중요한 공격 표면이 됩니다.

팀과 사용자는 다음이 필요합니다.

- 설치 전에 위험을 **표준화된 방식으로 평가**할 수 있는 수단
- 에이전트 도구 실행을 실제로 통제할 수 있는 **최소 권한 정책**
- 스킬 배포자의 신원을 검증할 수 있는 **서명과 provenance**

## 2. 대상 사용자

### 2.1 개인 파워 유저 (무료)

- OpenCode, Cursor, Claude Code, OpenClaw 등 AI 코딩 에이전트를 적극 활용
- 커뮤니티 스킬, 프롬프트 팩, MCP 서버를 자주 설치
- 설치 전 한 번의 명령으로 위험도를 점검하고 싶어 함
- 소비하는 스킬에 "검증됨" 배지가 붙어 있길 원함

### 2.2 엔지니어링 팀 (팀 플랜)

- 팀 전체의 AI 에이전트 도구 사용 방식을 표준화하려고 함
- 여러 저장소에 정책 템플릿을 일관되게 적용해야 함
- PR에 위험한 스크립트가 들어오면 CI에서 눈에 띄게 드러나고 차단되길 원함
- 감사 로그와 컴플라이언스 요구사항(SOC 2, ISO 27001 등)을 고려해야 함
- SSO와 중앙 정책 배포가 필요함

### 2.3 스킬 퍼블리셔 및 유지관리자 (무료 / 프로)

- "Verified Publisher" 같은 신뢰 표시를 원함
- 반복 가능한 릴리스 서명 워크플로가 필요함
- 자신의 스킬이 "OpenGuard Verified"로 발견되길 원함

### 2.4 플랫폼 빌더 (엔터프라이즈)

- AI 에이전트 플랫폼 또는 스킬 마켓플레이스를 구축 중
- 플랫폼 안에 OpenGuard 스캔 기능을 임베드하고 싶어 함
- API 접근, 화이트라벨 리포트, 커스텀 규칙 집합이 필요함

## 3. 핵심 가치 제안

| 계층 | OpenGuard가 제공하는 것 |
| --- | --- |
| **가시성** | 파일, 라인, 스니펫, 패턴까지 포함한 고신호 finding |
| **통제 가능성** | 도구 실행을 게이트할 수 있는 정책 생성 |
| **신뢰** | 퍼블리셔 서명과 소비자 검증(SLSA-lite) |
| **자동화** | 모든 PR에서 회귀를 잡아내는 CI 봇 |

MVP는 **가시성**과 **통제 가능성**에 집중하고, 기본 수준의 **신뢰**와 **자동화**를 포함합니다.

## 4. 범위

### 4.1 MVP 포함 범위

- 저장소, 텍스트 지침, 스크립트에 대한 정적 스캔
- 증거와 위험 점수를 포함하는 규칙 기반 finding
- 승인 게이트가 포함된 allowlist YAML 정책 생성
- 요약 및 diff 기반 신규 finding을 보여주는 GitHub PR 댓글 봇
- 기본적인 릴리스 서명/검증 기능(SLSA-lite 최소 구현)
- 로컬 사용을 위한 CLI 도구(`openguard`)
- 스캔 이력과 정책 상태를 보여주는 읽기 전용 로컬 대시보드

### 4.2 MVP 제외 범위

- 완전한 런타임 샌드박스 / 동적 분석
- 조직 전체 정책 배포 UI
- SLSA level 3+ 수준의 완전한 attestation / 재현 가능한 빌드
- GitHub 외 CI 플랫폼 연동(GitLab, Bitbucket 등)
- 코드 의도를 해석하는 AI/LLM 기반 의미 분석
- 유료 과금 인프라

## 5. 주요 사용 사례

### UC1: 설치 전 스캔 (개인)

**사용자 입장에서는**, 스킬을 설치하거나 실행하기 전에 저장소를 먼저 스캔해서 위험을 이해하고 싶다.

**흐름**

1. 사용자가 `openguard scan ./path/to/skill` 또는 `openguard scan https://github.com/org/repo` 실행
2. OpenGuard가 관련 파일(스크립트, 워크플로, Markdown)을 탐색
3. 규칙 엔진이 evidence를 포함한 finding 생성
4. scoring 엔진이 서브스코어와 총점 계산
5. policy generator가 권장 allowlist 정책 생성
6. 결과를 JSON 또는 Markdown으로 출력

**수용 기준**

- 최소한 다음을 제공해야 함
  - 전체 위험 점수
  - evidence가 포함된 주요 finding
  - 권장 allowlist 정책
- 일반적인 저장소(파일 수 1000개 미만)는 10초 이내 스캔 완료
- 스캔 중 네트워크 호출이 없어야 함(최초 저장소 fetch 이후)

### UC2: PR 가드레일 (팀)

**팀 리드 입장에서는**, 위험한 스크립트나 워크플로가 PR에 들어오면 자동으로 드러나고, 필요하면 병합 전에 막히길 원한다.

**흐름**

1. 개발자가 스크립트나 워크플로 변경이 포함된 PR 생성
2. GitHub Action이 PR diff를 기준으로 OpenGuard 스캔 실행
3. 봇이 전체 점수 변화량, 신규 finding, 파일/라인 evidence를 댓글로 게시
4. 선택적으로 점수가 임계값을 넘으면 체크 실패 처리

**수용 기준**

- PR 댓글에 추적 가능한 안정적인 Finding ID가 포함되어야 함
- 댓글은 중복 생성되지 않고 기존 댓글을 갱신해야 함
- 점수 임계값으로 pass/fail 여부를 설정할 수 있어야 함
- base 브랜치 대비 새로 생긴 finding만 강조해야 함

### UC3: 검증 가능한 릴리스 (퍼블리셔)

**스킬 퍼블리셔 입장에서는**, 릴리스를 서명해 소비자가 진위를 검증할 수 있길 원한다.

**흐름**

1. 퍼블리셔가 `openguard sign ./dist --key private.key` 실행
2. 서명 파일과 provenance 메타데이터 생성
3. 소비자가 `openguard verify ./dist --pub publisher.pub` 실행
4. 서명과 메타데이터 무결성을 검증

**수용 기준**

- `openguard verify`가 명확한 성공/실패 결과를 반환해야 함
- 서명 범위에 콘텐츠 해시와 메타데이터(타임스탬프, 버전, 커밋 SHA)가 포함되어야 함
- 표준 Ed25519 키로 동작해야 함

### UC4: 정책 기반 실행 통제 (Post-MVP 미리보기)

**팀 입장에서는**, 프롬프트 인젝션 같은 상황에서도 에이전트 도구 실행이 정책에 의해 통제되길 원한다.

**흐름**

1. 에이전트 시작 시 정책 로드
2. 셸, 네트워크, 파일 쓰기 같은 도구 호출 직전에 allowlist 확인
3. 금지 동작은 차단하고, 애매한 동작은 2단계 승인 요구

**참고:** 완전한 런타임 enforcement는 Post-MVP 범위지만, 정책 포맷과 생성은 MVP에 포함됩니다.

## 6. 출력과 데이터 모델

### 6.1 Finding

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `id` | string | `rule_id`와 evidence 맥락으로 만든 안정적인 해시 |
| `rule_id` | string | 규칙 식별자 (예: `OG-SHELL-001`) |
| `severity` | enum | `info`, `low`, `medium`, `high`, `critical` |
| `category` | enum | `shell`, `network`, `filesystem`, `credentials`, `obfuscation`, `supply-chain`, `gha`, `macos`, `windows` |
| `confidence` | enum | `low`, `medium`, `high` |
| `title` | string | 사람이 읽기 쉬운 제목 |
| `description` | string | 위험 설명 |
| `evidence` | object | `{ path, start_line, end_line, snippet, match }` |
| `remediation` | string | 더 안전한 대안 |
| `tags` | string[] | 선택적 분류 태그 |

### 6.2 위험 점수

**서브스코어 차원**

- `shell`: 명령 실행 위험
- `network`: 외부 연결 및 유출 위험
- `filesystem`: 파일 접근 위험
- `credentials`: 자격 증명 노출 위험

**점수 계산 방식**

```
finding별 기여도:
  base_points = severity_to_points(severity)
    critical = 30, high = 15, medium = 8, low = 3, info = 1
  confidence_weight = confidence_to_weight(confidence)
    high = 1.0, medium = 0.7, low = 0.4
  contribution = base_points × confidence_weight

카테고리 서브스코어(0~100):
  raw = 해당 카테고리 finding 기여도의 합
  subscore = min(raw, 100)

전체 점수(0~100):
  total = min(weighted_sum(subscores), 100)
  weights: shell=0.30, network=0.25, filesystem=0.20, credentials=0.25

예외:
  critical finding이 하나라도 있으면 total >= 60
```

**점수 해석 기준**

| 점수 구간 | 위험 수준 | 권장 해석 |
| --- | --- | --- |
| 0–19 | 낮음 | 일반적인 주의 수준에서 사용 가능 |
| 20–39 | 보통 | finding 검토 후 사용 |
| 40–59 | 높음 | 주의 깊은 검토와 정책 적용 필요 |
| 60–79 | 매우 높음 | 엄격한 정책 없이 사용 비권장 |
| 80–100 | 치명적 | 철저한 감사 없이 설치 비권장 |

### 6.3 정책 파일 (YAML)

정책 모델 전체는 [docs/POLICY.md](docs/POLICY.md)를 참고합니다.

핵심 필드:

- `version`: 스키마 버전(v1)
- `defaults`: 기본 deny 및 승인 요구사항
- `allow`: 명령, 경로, 네트워크 허용 목록
- `approvals`: 사람 승인 조건

**구현 메모:** 정책 스키마 검증과 병합 의미론(deny-first, 승인 강도 상향)은 이미 지원됩니다.

### 6.4 로컬 대시보드 데이터

대시보드는 기본적으로 `./.openguard/` 아래에 저장된 스캔 결과와 정책 파일을 읽습니다. 모든 데이터는 파일 기반이며 오프라인 전용입니다.

## 7. CLI 인터페이스

```
openguard <command> [options]

Commands:
  scan <target>              스킬/저장소를 스캔해 보안 위험 분석
  policy generate <target>   스캔 결과로 최소 권한 정책 생성
  sign <artifact>            provenance 메타데이터와 함께 아티팩트 서명
  verify <artifact>          아티팩트 서명과 provenance 검증
  server                     로컬 대시보드 서버 실행

Scan options:
  --format <json|md|sarif>   출력 형식 (기본값: md)
  --out <file>               결과를 파일에 저장 (기본값: stdout)
  --diff-base <gitref>       base ref 대비 새 finding만 표시
  --rules <path>             사용자 정의 규칙 디렉터리
  --policy <path>            검증할 기존 정책 파일
  --threshold <number>       점수가 임계값 이상이면 에러 종료

Policy options:
  --out <file>               정책을 파일에 저장 (기본값: stdout)
  --merge <file>             기존 정책과 병합

Sign options:
  --key <path>               개인키 경로 (Ed25519)
  --out <path>               서명 + 메타데이터 출력 경로

Verify options:
  --pub <path>               공개키 경로
  --strict                   메타데이터 불일치가 하나라도 있으면 실패

Global options:
  --verbose                  자세한 출력
  --quiet                    비핵심 출력 숨김
  --no-color                 컬러 출력 비활성화
  --version                  버전 표시
  --help                     도움말 표시
```

## 8. CI / GitHub Action 요구사항

### 입력값

| 입력 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `fail-on-score` | number | `80` | 전체 점수가 이 값 이상이면 체크 실패 |
| `comment` | boolean | `true` | PR 댓글 게시 여부 |
| `diff-only` | boolean | `true` | base 대비 신규 finding만 보고 |
| `rules` | string | 내장 규칙 | 사용자 정의 규칙 경로 |
| `policy` | string | 없음 | 검증할 기존 정책 파일 경로 |

### 동작 요구사항

- `pull_request` 이벤트에서 실행
- diff 분석을 위해 PR head와 base를 모두 checkout
- 댓글은 하나만 게시하고 이후에는 갱신(idempotent)
- `fail-on-score` 임계값에 따라 체크 상태 결정
- 댓글에는 점수 배지, findings 표, 정책 diff, evidence 링크 포함

### 빌드/패키징

- 릴리스 시 Action 런타임은 번들된 `github-action/dist/index.js` 엔트리를 사용

## 9. 품질 속성 (비기능 요구사항)

| 항목 | 요구사항 |
| --- | --- |
| **결정성** | 같은 입력은 항상 같은 Finding ID와 점수를 생성 |
| **성능** | 일반적인 하드웨어에서 5,000개 파일을 30초 이내 스캔 |
| **낮은 오탐률** | 고신호 패턴 중심, 적더라도 더 정확한 finding 선호 |
| **설명 가능성** | 모든 finding에 파일, 라인, 스니펫, 근거 설명 포함 |
| **오프라인 동작** | 최초 저장소 fetch 이후 인터넷 없이 스캔 가능 |
| **데이터 유출 금지** | 스캐너가 스캔한 코드를 외부 서비스로 전송하지 않음 |
| **확장성** | 코드 수정 없이 YAML 규칙 추가 가능 |
| **로컬 가시성** | 외부 저장소 없이 대시보드에서 스캔 이력 확인 가능 |

## 10. 성공 지표

### 개인 사용자

- "실행 전 스캔" 사용 비율
- 반복 사용 빈도
- 스킬 발견부터 안전한 설치 판단까지 걸리는 시간

### 팀

- OpenGuard CI를 활성화한 저장소 비율
- 병합 전에 탐지한 위험한 PR 수
- 생성된 정책을 실제로 채택한 팀 비율

### 퍼블리셔

- Verified 배지 발급 수
- 검증된 설치와 미검증 설치의 비율
- 릴리스 후 검증 완료까지의 시간

### 플랫폼

- GitHub star / npm 다운로드 수
- 커뮤니티 규칙 기여 수
- 무료에서 팀 플랜으로의 전환율
