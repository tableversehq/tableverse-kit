---
"@tableverse-kit/cli": patch
---

`tvk` loads the `.env` beside your `tableverse.config.ts`, so `TABLEVERSE_API_URL` and `TABLEVERSE_WEB_URL` can point the CLI at another deployment without exporting them each time. Variables already set in the environment win over the file.
