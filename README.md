# 음성 → 코드 파이프라인 (4 에이전트 + 오케스트레이션)

아이디어를 말로 하면 노트 → 승인 → 코드 → 테스트 → GitHub Pages 배포까지 이어지는 구조입니다.
주 용도: 아이들용 교육/미니게임 (타자 연습, 수학 등). 코드 스타일 기준: CHOMPER (바닐라 HTML/JS, 단일 파일, 모바일 터치).

## 파일 목록과 저장소 내 위치

| 받은 파일 | 저장소에 둘 위치 |
|---|---|
| README.md | `README.md` (또는 `docs/pipeline.md`) |
| ORCHESTRATION.md | `docs/ORCHESTRATION.md` |
| note-template.md | `notes/_TEMPLATE.md` |
| agent-1-idea-organizer.md | `.claude/agents/idea-organizer.md` |
| agent-2-code-builder.md | `.claude/agents/code-builder.md` |
| agent-3-tester.md | `.claude/agents/tester.md` |
| agent-4-deployer.md | `.claude/agents/deployer.md` |

## 저장소 폴더 구조

```
repo/
├── .claude/agents/          # 서브에이전트 정의 4개
├── .github/workflows/       # 자동 실행 + Pages 배포 (ORCHESTRATION.md 참고)
├── docs/ORCHESTRATION.md
├── notes/
│   ├── _TEMPLATE.md
│   ├── inbox/               # 음성에서 나온 원본 메모 (사람이 넣음)
│   └── ideas/               # 정리된 노트 (에이전트 1이 생성, 상태값 관리)
├── games/<slug>/            # 완성된 게임 (index.html, i18n/, config/)
└── tests/<slug>/            # 테스트 리포트와 체크리스트
```

## 한 줄 흐름

`음성` → `inbox/` → **[1 정리]** → `ideas/*.md (draft)` → **사람 승인** → **[2 코드]** → **[3 테스트]** → PR 머지 → **[4 배포 준비/확인]** → GitHub Pages

## 시작 순서 (첫 날)

1. 위 위치대로 파일 배치 후 커밋
2. `notes/inbox/`에 메모 1개 넣고 에이전트 1만 수동 실행해서 노트가 잘 나오는지 확인
3. 노트 status를 `approved`로 바꾸고 에이전트 2 수동 실행
4. 잘 되면 ORCHESTRATION.md의 자동 실행 단계로 넘어가기
