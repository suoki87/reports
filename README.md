# suoki87 · Reports

> Claude Code 작업 결과·결론·공유 보고서. GitHub Pages 호스팅. 1 링크 공유.

## URL

발행된 사이트: **https://suoki87.github.io/reports/**

## 워크플로

```
클로드 코드 작업 → /share-report <markdown>
                     ↓
                  helper script (pandoc 또는 Jekyll)
                     ↓
                  git push → Pages 자동 빌드
                     ↓
                  URL 1 클릭 공유
```

## 파일 구조

- `_config.yml` — Jekyll 설정 (theme: minima dark)
- `index.md` — 인덱스 페이지
- `_posts/` — 보고서 (Jekyll 표준, `YYYY-MM-DD-slug.md`)
- `assets/` — 이미지·attachment
- `.gitignore` — `_site/`·캐시 제외

## 발행

```bash
# helper script 사용
~/.claude/helpers/share-report.sh <markdown-file>

# 또는 수동
cp report.md _posts/$(date +%Y-%m-%d)-slug.md
git add -A && git commit -m "report: <slug>" && git push
# → ~1분 후 https://suoki87.github.io/reports/<year>/<month>/<day>/<slug>/
```

## 관련 자산

- 글로벌 Skill: `~/.claude/skills/share-report/SKILL.md`
- Helper: `~/.claude/helpers/share-report.sh`
- 옵시디언 vault: `~/Desktop/AI_Project/obsidian-vault/` (raw 보존)
