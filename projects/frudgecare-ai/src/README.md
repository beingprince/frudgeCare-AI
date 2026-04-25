# Source Code


The hackathon submission template asks for the source code under `projects/<team>/src/`. The actual FrudgeCare AI source lives at the repository root so the build tooling, npm workspaces, and FastAPI module imports work without symlinks.


This file is a one page index pointing at where each piece actually lives.




## What runs


| Layer | Folder | Entry file |
| ----- | ------ | ---------- |
| Web frontend | `apps/web/` | `apps/web/src/app/page.tsx` |
| Patient triage demo | The same folder | `apps/web/src/app/triage/page.tsx` |
| Unified staff console | The same folder | `apps/web/src/app/console/page.tsx` |
| Command palette | The same folder | `apps/web/src/components/common/CommandPalette.tsx` |
| AI concierge endpoint | The same folder | `apps/web/src/app/api/ai/concierge/route.ts` |
| Triage analyze endpoint | The same folder | `apps/web/src/app/api/ai/analyze-intake/route.ts` |
| Triage cascade endpoint | The same folder | `apps/web/src/app/api/ai/triage-cascade/route.ts` |
| Python AI engine | `services/ai-engine/` | `services/ai-engine/main.py` |
| Tiered language model selector | The same folder | `services/ai-engine/tiered_ai.py` |
| Knowledge base files | The same folder | `services/ai-engine/knowledge_base/` |




## Why the code is at the repository root and not inside this folder


npm workspaces are declared in the root `package.json` with `"workspaces": ["apps/*", "services/*", "packages/*"]`. Moving the apps under `projects/frudgecare-ai/src/` would break the workspace resolver.


FastAPI module imports in `services/ai-engine/main.py` use relative paths against the `services/ai-engine/` working directory.


The submission template structure is a packaging convention, not a build system requirement. The README at this folder explains the layout judges will see when they clone the repository.




## To run the code


See the Setup Instructions section in the project README at `../README.md`. It is four shell commands.
