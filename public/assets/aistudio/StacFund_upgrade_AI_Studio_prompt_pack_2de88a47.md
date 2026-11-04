# StacFund upgrade: AI Studio prompt pack

*Made on 27 Oct 2026 from your StacFund-AI-main (17) zip. 54 code files, about 1 MB.*

## How to use this

- AI Studio has to retype every file it copies, so I kept each prompt to about 50 to 60 KB of code, well under the point where your first attempt stopped (about 100 KB). That is why it takes 19 prompts and 2 checks.
- Attach **StacFund-upgrade-files.zip** (the small zip from the chat, 0.6 MB) to Prompt 1. If AI Studio ever says it can’t find the zip, attach it again. If it can’t open zips at all, unzip it in your Files app and attach the files for that prompt instead.
- Send one prompt at a time and wait for Done before the next. Order matters.
- Your first attempt already wrote 5 files: package.json, index.html, firestore.rules, AIAssistant.tsx and ApplicationWorkflow.tsx. They are skipped here and verified in Check 1.
- Red errors or a broken preview until Prompt 18 is done are normal, because some files import others that arrive later. Don’t ask AI Studio to fix them.
- If a prompt fails with the token error, send it again with only the first half of its files, then the rest.
- Before Prompt 1, confirm the project already has a services/ai-gateway folder. If it doesn’t, stop and tell me.

## A. Core engine and alerts

### Prompt 1

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- types.ts
- services/opportunityStatus.ts
- services/opportunitiesStore.ts
- services/eligibilityEngine.ts
- services/matchingEngine.ts
- services/autofillContext.ts
- .env.example

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 2

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- services/opportunityIntake.ts
- services/userAlerts.ts
- services/fundingDeadlineService.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 3

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- services/intakeRoutes.ts
- services/advancedScraper.ts
- components/FundingCard.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 4

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- components/WhatsAppIngestion.tsx
- components/AlertPreferences.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 5

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- components/FundingHeatmap.tsx
- components/FormDigitizer.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

## B. Official form autofill

### Prompt 6

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- services/formModel.ts
- services/formAutofill.ts
- services/formTemplates/index.ts
- services/formTemplates/kznYouthFund2026.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 7 (one small edit)

```
In the attached zip (StacFund-upgrade-files.zip), open constants.ts and find the object whose opportunity_id is kzn_youth_fund_2026_27. It is the 2nd item in MOCK_FUNDING, between the first record and the one with opportunity_id tia_seed_002. Copy that one object exactly and insert it at the same position in the project's constants.ts. Change nothing else in that file. Don't print file contents. Reply with just the word Done.
```

## C. Business Plan Studio

### Prompt 8

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- services/businessPlan/planSchema.ts
- services/businessPlan/planDepth.ts
- services/businessPlan/planFinancials.ts
- services/brandKit.ts
- utils/planPdfExport.ts
- utils/studioDocxExport.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 9

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- services/businessPlan/planStructure.ts
- services/docx/docxShared.ts
- services/studioDocs.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 10

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- services/businessPlan/planGenerator.ts
- components/businessPlan/planPaginate.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 11

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- components/businessPlan/PlanBlocks.tsx
- components/businessPlan/PlanEditorPanel.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 12

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- components/businessPlan/PlanSetupPanel.tsx
- components/BrandKitPanel.tsx
- services/docx/planDocx.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 13

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- components/businessPlan/BusinessPlanStudio.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

## D. Proposal Studio

### Prompt 14

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- services/proposal/proposalSchema.ts
- services/proposal/proposalTemplates.ts
- services/proposal/proposalGenerator.ts
- services/docx/proposalDocx.ts
- components/proposal/ProposalPages.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 15

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- components/proposal/ProposalStudio.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

## E. Wiring it all together

### Prompt 16

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- server.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 17

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- components/FormAutofillWizard.tsx
- pages/FundingExplorer.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Prompt 18

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- pages/Dashboard.tsx

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

## F. The form PDF

### Prompt 19

```
From the attached zip (StacFund-upgrade-files.zip), save public/assets/forms/kzn-youth-fund-2026-27.pdf into the project at the same path, as a binary file. Do not convert, retype or regenerate it. If you can't save binary files, say so and stop. Reply with just the word Done or describe the problem.
```

If AI Studio can’t do this, skip it. Everything else works, but the “Fill the official form” button can’t load the form until the PDF is there. Add it later on GitHub: unzip the PDF on your phone, open the repo folder public/assets/forms, tap Add file, then Upload files.

## G. Checks

### Check 1: files and key markers

```
Check only. Change nothing. Tell me which of these paths are missing from the project:

- types.ts
- services/opportunityStatus.ts
- services/opportunitiesStore.ts
- services/eligibilityEngine.ts
- services/matchingEngine.ts
- services/autofillContext.ts
- .env.example
- services/opportunityIntake.ts
- services/userAlerts.ts
- services/fundingDeadlineService.ts
- services/intakeRoutes.ts
- services/advancedScraper.ts
- components/FundingCard.tsx
- components/WhatsAppIngestion.tsx
- components/AlertPreferences.tsx
- components/FundingHeatmap.tsx
- components/FormDigitizer.tsx
- services/formModel.ts
- services/formAutofill.ts
- services/formTemplates/index.ts
- services/formTemplates/kznYouthFund2026.ts
- services/businessPlan/planSchema.ts
- services/businessPlan/planDepth.ts
- services/businessPlan/planFinancials.ts
- services/brandKit.ts
- utils/planPdfExport.ts
- utils/studioDocxExport.ts
- services/businessPlan/planStructure.ts
- services/docx/docxShared.ts
- services/studioDocs.ts
- services/businessPlan/planGenerator.ts
- components/businessPlan/planPaginate.ts
- components/businessPlan/PlanBlocks.tsx
- components/businessPlan/PlanEditorPanel.tsx
- components/businessPlan/PlanSetupPanel.tsx
- components/BrandKitPanel.tsx
- services/docx/planDocx.ts
- components/businessPlan/BusinessPlanStudio.tsx
- services/proposal/proposalSchema.ts
- services/proposal/proposalTemplates.ts
- services/proposal/proposalGenerator.ts
- services/docx/proposalDocx.ts
- components/proposal/ProposalPages.tsx
- components/proposal/ProposalStudio.tsx
- server.ts
- components/FormAutofillWizard.tsx
- pages/FundingExplorer.tsx
- pages/Dashboard.tsx
- package.json
- index.html
- firestore.rules
- components/AIAssistant.tsx
- components/ApplicationWorkflow.tsx
- constants.ts
- public/assets/forms/kzn-youth-fund-2026-27.pdf

Then answer yes or no to each:
1. package.json lists docx, nodemailer, pdf-lib and playwright in dependencies.
2. components/AIAssistant.tsx contains open_business_plan_studio and open_proposal_studio.
3. components/ApplicationWorkflow.tsx imports ./businessPlan/BusinessPlanStudio.
4. firestore.rules has rules for plans, proposals and brand_kit.
5. index.html loads the Source Serif 4 font.
6. constants.ts contains kzn_youth_fund_2026_27.
7. server.ts contains /api/plan/export-pdf, /api/plan/export-docx, /api/proposal/export-docx and /api/alerts/prefs.

Reply with the problems only, or the words All good.
```

If anything is missing or answered no, send me the reply and I’ll tell you exactly which prompt to repeat.

### Check 2: type check

```
Run npx tsc --noEmit. Don't fix anything. Give me the full error list, or say No errors.
```

Paste any errors to me in the chat and I’ll sort them out with you. Once it is clean, push to GitHub from AI Studio.

## H. Optional, only if you want them in GitHub

The app doesn’t need these. They are the test scripts and the written notes from the upgrade.

### Optional 1: test scripts

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- scripts/verify-builtin-records.ts
- scripts/verify-plan-engine.ts
- scripts/verify-studio-upgrades.ts
- scripts/verify-form-engine.ts
- scripts/smoke-test-docx-endpoints.ts

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

### Optional 2: notes

```
Copy these files from the attached zip (StacFund-upgrade-files.zip) into the project, same paths. Copy each file's full contents exactly as it is, overwriting the file if it exists. Do not rewrite, refactor, reformat or fix anything.

- IMPLEMENTATION_NOTES.md
- VERIFICATION_REPORT.md

Don't touch any other file. Don't fix import errors, install packages or run a build, because later steps add the missing files. Don't print file contents. When done, reply with just the word Done and the list of files written.
```

## After you push

Download the repo as a zip from GitHub and upload it to me in the chat. I will compare it with your upgrade zip file by file and tell you if anything differs.
