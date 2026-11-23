# Apexplain

Agent-run explainer videos, designed so coding agents spend fewer tokens than a full studio like [explainroo](https://github.com/vincentsch/explainroo).

One small skill → `script.md` + `scenes.json` → `apexplain make` → `out/video.mp4`.

Plan: [docs/apexplain-token-mvp.md](docs/apexplain-token-mvp.md) · Agent skill: [skills/apexplain/SKILL.md](skills/apexplain/SKILL.md)

## Quick start

Requires Node.js 20.11+.

```bash
npm install
node bin/apexplain.js init videos/demo --title "My topic"
# edit script.md + scenes.json
node bin/apexplain.js make videos/demo --dry-run
node bin/apexplain.js make videos/demo
```

Useful flags:

```bash
node bin/apexplain.js make videos/demo --draft       # faster encode while iterating
node bin/apexplain.js make videos/demo --voice-only  # Kokoro TTS only
node bin/apexplain.js preview videos/demo            # still PNGs in build/stills/
node bin/apexplain.js doctor
```

`APEXPLAIN_TTS=mock` skips the Kokoro model download (tests). Example project: `examples/leap-years`.
