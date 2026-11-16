# 오케스트레이션

4개 에이전트를 어떤 순서와 조건으로 연결할지 정의합니다.

## 1. 상태 머신 (노트의 `status` 필드가 유일한 진실)

```
inbox 메모
   │  [에이전트 1: idea-organizer]
   ▼
 draft ──(사람 검토, 열린 질문 답변)──▶ approved   ◀── 승인 게이트 (사람만 변경)
                                          │  [에이전트 2: code-builder → PR]
                                          ▼
                                        built
                                          │  [에이전트 3: tester]
                              ┌───────────┴───────────┐
                              ▼                       ▼
                           tested                 needs-fix ──▶ 에이전트 2로 되돌림 (최대 2회)
                              │  [에이전트 4: deployer]
                              ▼
                  사람이 PR 머지 ──▶ GitHub Actions가 Pages 배포
                              │
                              ▼
                          deployed
```

## 2. 각 단계의 담당과 권한

| 단계 | 담당 | 입력 | 출력 | 하면 안 되는 것 |
|---|---|---|---|---|
| 정리 | idea-organizer | notes/inbox | notes/ideas/*.md (draft) | approved로 바꾸기, 내용 지어내기 |
| 승인 | **사람** | draft 노트 | status: approved | — |
| 코드 | code-builder | approved 노트 | 브랜치 + PR | main 병합, 범위 확장 |
| 테스트 | tester | PR 브랜치 | report.md, status | 코드 수정 |
| 배포 준비 | deployer | tested 노트 | 체크리스트, 포털 갱신 | 직접 머지, 설정 변경 |
| 머지 | **사람** | PR | main 반영 | — |

사람이 하는 일은 딱 두 번입니다: **승인**과 **머지**.

## 3. 실패 처리
- tester가 FAIL → status `needs-fix` → code-builder가 리포트를 읽고 수정 (최대 2회). 2회 후에도 FAIL이면 중단하고 사람에게 알린다
- 에이전트가 시작 전 확인에서 중단하면 상태를 바꾸지 말고 이유만 보고한다
- 어떤 단계에서도 의심스러우면 진행하지 말고 사람에게 묻는다

## 4. 실행 방법 (단계별로 키우기)

### 4-A. 수동 (첫 주 추천)
Claude Code CLI에서 한 단계씩 직접 호출합니다.
```
> idea-organizer 에이전트로 notes/inbox/ 새 메모 정리해줘
  (노트 검토 후 status를 approved로 수정)
> code-builder 에이전트로 notes/ideas/001-*.md 구현해줘
> tester 에이전트로 001 검증해줘
> deployer 에이전트로 001 배포 준비해줘
```
이렇게 해서 각 에이전트의 결과 품질을 먼저 확인합니다.

### 4-B. GitHub 이벤트로 자동화
- 트리거 예: `notes/ideas/**` 파일이 변경되고 `status: approved`일 때 code-builder 실행 → PR 열림 → PR 이벤트로 tester 실행
- 방법 1: Claude Code Routines (GitHub 트리거). Claude GitHub App이 저장소에 설치되어 있어야 합니다
- 방법 2: GitHub Actions + `anthropics/claude-code-action`
- 비대화형 실행은 별도 크레딧에서 차감될 수 있으니 사용량을 확인하세요

Actions 워크플로 뼈대 (초안, 실제 입력 이름과 인증 방식은 공식 문서로 확인 후 적용):
```yaml
name: build-approved-note
on:
  push:
    paths: ["notes/ideas/**"]
permissions:
  contents: write
  pull-requests: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: approved 노트가 있는지 확인
        id: check
        run: |
          f=$(grep -l "^status: approved" notes/ideas/*.md | head -1 || true)
          echo "note=$f" >> "$GITHUB_OUTPUT"
      - if: steps.check.outputs.note != ''
        uses: anthropics/claude-code-action@v1
        with:
          # 인증: 구독 OAuth 토큰 또는 API 키 (저장소 Secrets에 저장, 값을 파일에 쓰지 말 것)
          prompt: |
            code-builder 에이전트로 ${{ steps.check.outputs.note }} 를 구현하고 PR을 열어줘.
```

### 4-C. 음성 입력 연결
- 지금: 음성 대화 → "노트로 정리해줘" → 결과를 `notes/inbox/`에 넣기 (수동)
- 나중: 아이폰에서 GitHub 이슈/파일로 올리는 단축어, 또는 Claude Code 웹/모바일 세션에서 바로 저장소에 메모 추가

## 5. 승인 게이트 방식 (택 1, 아직 미정)
1. **노트 파일 수정**: 사람이 status를 `approved`로 바꿔 커밋 (가장 단순, 추천)
2. **PR 라벨**: 노트를 PR로 올리고 `approved` 라벨을 붙이면 다음 단계 트리거
3. **이슈 코멘트**: `/approve` 코멘트로 트리거

## 6. 안전 규칙 (모든 에이전트 공통)
- main 직접 커밋 금지, 머지는 사람만
- 시크릿/토큰을 파일, PR, 로그에 쓰지 않는다
- 아이 대상 프로그램: 외부 전송, 추적, 광고, 개인정보 수집 없음
- 확인하지 못한 것은 "확인 못 함"으로 보고한다

## 7. 이후 확장 (지금은 하지 않음)
- 유저 관리 (프로필, 나이 제한, 친구 초대, 아이 대시보드)
- 언어 추가 (중국어, 일본어, 힌디어 등): 언어 파일 추가만으로 되도록 i18n 구조 유지
- 두 번째 게임: 수학 레이스 (학년별 난이도)
