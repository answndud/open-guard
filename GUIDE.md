# OpenGuard 입문 가이드

이 문서는 개발 도구가 익숙하지 않은 사용자를 위한 안내서입니다.
순서대로 따라가며, 예시 명령은 그대로 복사해서 실행하면 됩니다.

## 1. OpenGuard가 하는 일

OpenGuard는 프로젝트를 스캔해서 다음 작업을 수행합니다.

- 위험한 명령과 패턴을 찾습니다.
- 위험 점수(0~100)를 계산합니다.
- 최소 권한 정책 파일(`openguard.policy.yaml`)을 생성합니다.

## 2. 먼저 필요한 것

- Node.js 20 이상
- pnpm

설치 여부 확인:

```bash
node -v
pnpm -v
```

두 명령 모두 버전 번호가 출력되면 준비가 끝난 것입니다.

## 3. 프로젝트 의존성 설치

OpenGuard 프로젝트 폴더에서 다음을 실행합니다.

```bash
pnpm install
```

## 4. 첫 스캔 해보기

현재 폴더를 스캔하고 읽기 쉬운 보고서를 출력합니다.

```bash
pnpm dev -- scan . --format md
```

JSON으로 저장:

```bash
pnpm dev -- scan . --format json --out report.json
```

SARIF로 저장:

```bash
pnpm dev -- scan . --format sarif --out openguard.sarif
```

## 5. 결과를 빠르게 읽는 법

우선 아래 항목부터 확인하세요.

1. `Risk Score`
2. `Subscores` (`shell`, `network`, `filesystem`, `credentials`)
3. `Findings` (규칙 ID, 파일 경로, 라인 번호, 증거)

간단한 해석 기준:

- 0~29: 낮음
- 30~59: 보통
- 60~79: 높음
- 80~100: 매우 높음

## 6. 정책 파일 생성

스캔 결과를 바탕으로 정책 파일을 생성합니다.

```bash
pnpm dev -- policy generate . --out openguard.policy.yaml
```

스캔하면서 정책 파일을 검증하려면:

```bash
pnpm dev -- scan . --policy openguard.policy.yaml --format md
```

## 7. 새로 바뀐 내용만 스캔하기

현재 브랜치를 `main`과 비교합니다.

```bash
pnpm dev -- scan . --diff-base main --format md
```

## 8. 로컬 대시보드 열기

서버 실행:

```bash
pnpm dev -- server --port 8787
```

브라우저에서 열기:

- `http://localhost:8787`

## 9. 자주 쓰는 옵션

- `--format <md|json|sarif>`: 출력 형식 지정
- `--out <file>`: 결과를 파일로 저장
- `--rules <dir>`: 사용자 정의 규칙 디렉터리 사용
- `--policy <file>`: 정책 입력 파일 검증
- `--threshold <number>`: 임계값 이상일 때 종료 코드 2 반환
- `--save-run`: 대시보드용 실행 결과 저장
- `--data-dir <dir>`: 대시보드 데이터 저장 위치 지정

## 10. 문제 해결

### `pnpm: command not found`

pnpm이 설치되어 있지 않습니다. 먼저 pnpm을 설치하세요.

### Node 버전 오류

Node.js를 20 이상 버전으로 업데이트하세요.

### `diff-base` 오류

- 현재 폴더가 Git 저장소인지 확인하세요.
- 기준 브랜치/레퍼런스가 실제로 존재하는지 확인하세요. 예: `main`

### `--policy` 검증 오류

YAML 문법과 필수 필드를 확인하세요.

- `version`
- `defaults.action`
- `allow`

## 11. 안전하게 사용하는 팁

- 무엇이든 실행하기 전에 `high`, `critical` finding부터 먼저 검토하세요.
- `curl | bash` 같은 명령은 특히 주의해서 봐야 합니다.
- `.env`, `~/.ssh`, `~/.aws`는 민감 경로로 취급하세요.

## 12. 다음에 읽으면 좋은 문서

- `docs/RULES_CATALOG.md`
- `docs/INTERPRETING_RESULTS.md`
- `README.md`
- `ARCHITECTURE.md`
