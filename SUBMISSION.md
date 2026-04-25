# How to Submit FrudgeCare AI to the Hackathon


This document is the step by step the team follows on submission day. All times are in Central Daylight Time. Nepal Time is Central Daylight Time plus ten hours forty five minutes.


The hard deadline is Sunday April 26 at 4 PM CDT, which is Monday April 27 at 2 45 AM NPT. There are no extensions.




## 1. Pre Submission Checklist


Run through this once before opening the pull request.


* The team members table in `projects/frudgecare-ai/README.md` has the GitHub handle column filled in for every member.
* The Demo section in `projects/frudgecare-ai/README.md` has a real video link or a confirmation that the screenshots are enough.
* `projects/frudgecare-ai/responsible-ai.md` reads cleanly and has no placeholders.
* `projects/frudgecare-ai/team-contributions.md` reads cleanly and the timeline reflects what actually happened on the day.
* `projects/frudgecare-ai/demo/` has the eight screenshots listed in the manifest.
* `npm run dev` starts both the web and the AI engine without errors on a clean clone.
* `http://localhost:3000/triage` runs the Sepsis scenario end to end.
* `http://localhost:3000/console` loads all four tabs.
* The command palette opens with Cmd plus K and routes correctly for "open the queue", "patient Maria Lopez", and "operations dashboard".
* No `.env`, `.env.local`, `.env.development.local`, or `.env.production.local` file is staged for commit. Only `.env.example` files should be committed.
* No `node_modules`, `.next`, `__pycache__`, or `venv` folder is staged.




## 2. Step One. Push the Working Repository


This is the team's working repository. The full source lives here.


```bash
git remote -v
```


If the output is empty, add the remote.


```bash
git remote add origin https://github.com/beingprince/frudgeCare-AI.git
git branch -m master main
git push -u origin main
```




## 3. Step Two. Fork the Organiser Template


The organiser requires submissions to live inside the organiser template repository, not as standalone repositories.


1. Open the organiser template repository on GitHub. The exact URL is announced in `#announcements` on Slack and is something close to `https://github.com/caredevi-innovation-lab/hackathon-2026-projects`.


2. Click Fork in the top right.


3. Clone the fork locally.


```bash
git clone https://github.com/beingprince/hackathon-2026-projects.git
cd hackathon-2026-projects
```




## 4. Step Three. Copy the FrudgeCare AI Submission Folder


From inside the clone of the template fork, copy the `projects/frudgecare-ai/` folder out of the FrudgeCare AI repository.


On macOS or Linux.


```bash
mkdir -p projects
cp -R ../frudgeCareAI/projects/frudgecare-ai projects/
```


On Windows PowerShell.


```powershell
New-Item -ItemType Directory -Force -Path projects | Out-Null
Copy-Item -Recurse -Force ..\frudgeCareAI\projects\frudgecare-ai projects\
```


The result inside the template fork must look like the following.


```
hackathon-2026-projects/         the organiser template, the team fork
  projects/
    frudgecare-ai/
      README.md
      responsible-ai.md
      team-contributions.md
      src/
        README.md
      demo/
        demo-script.md
        README.md
        screenshots
```


The `src/README.md` inside the submission folder explains that the full source code lives in the team's working repository from Section 2 and links to it. This is the cleanest way to handle a large mono repository without breaking the build tooling.


If the team prefers, the actual source code can also go inside `projects/frudgecare-ai/src/` by copying `apps/`, `services/`, and the root configuration files in there. The team does not recommend it. The npm workspace declaration and the FastAPI imports both expect the code at the repository root, and judges can clone the working repository from the URL in the README in any case.




## 5. Step Four. Commit, Push, Open the Pull Request


From inside the template fork.


```bash
git checkout -b submit/frudgecare-ai
git add projects/frudgecare-ai
git commit -m "Submission: FrudgeCare AI by team McNeeseCodes_"
git push -u origin submit/frudgecare-ai
```


Then on GitHub.


1. Go to the original organiser repository, not the team fork.


2. Click Pull requests, then New pull request.


3. Click Compare across forks. Pick the team fork and the `submit/frudgecare-ai` branch.


4. Use this exact pull request title format. The organiser requires it.


   ```
   [Submission] McNeeseCodes_ - FrudgeCare AI
   ```


5. Pull request description. Paste the following block, with the three pending handles updated once each member confirms their GitHub account.


   ```
   Track. AI Patient Triage.

   Project README. ./projects/frudgecare-ai/README.md
   Responsible AI document. ./projects/frudgecare-ai/responsible-ai.md
   Team contributions. ./projects/frudgecare-ai/team-contributions.md
   Demo. ./projects/frudgecare-ai/demo/demo-script.md
   Source code repository. https://github.com/beingprince/frudgeCare-AI

   Team McNeeseCodes_.
   - Prince Pudasaini, Team Lead, Full Stack Engineer, AI Engineer, @beingprince
   - Rita Thapa Chhetri, Clinical and Nursing Workflow Advisor, handle pending
   - David Okpo, Frontend Design Ideation, handle pending
   - Solida Tan, RAG Dataset Curation, Idea Development, Presentation, handle pending
   ```


6. Submit the pull request.




## 6. Step Five. Confirm in Slack


Post in `#hackathon-demo-day`.


```
[Submission] McNeeseCodes_ - FrudgeCare AI
PR. <link to the pull request you just opened>
```


That is the entire submission flow.




## 7. What the Organiser Requires


From the participant resources, all four are mandatory. Missing any one disqualifies the submission.


| Deliverable | Where the team submission has it |
| ----------- | -------------------------------- |
| GitHub repository with frequent meaningful commits | The team working repository from Section 2 |
| README with Problem, Approach, Architecture, Data sources, Limitations, Setup, Team | `projects/frudgecare-ai/README.md` |
| Three minute demo, live or recorded | `projects/frudgecare-ai/demo/demo-script.md` plus the screenshots |
| Responsible AI document | `projects/frudgecare-ai/responsible-ai.md` |


The README must include Project Name, Team Members with names and GitHub handles, Problem Statement, Solution, Tech Stack, Setup Instructions, and Demo. All seven are present in the team README.


The Responsible AI document must cover Data sources, Model choices, Bias considerations, and Failure cases. All four are present in the team document, plus a regulatory awareness section because the participant guide flags it under the feasibility scoring criterion.
