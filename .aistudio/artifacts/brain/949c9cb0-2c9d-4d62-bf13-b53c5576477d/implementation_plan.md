# Step-by-Step Testing Guide: StacFund AI

This guide walks you through testing all 4 key areas in order:
1. **AI Gateway & Provider Health Panel** (Newly upgraded multi-provider system)
2. **Funding Application & AI Business Plan Generator** (4-Step workflow with AI drafting)
3. **Presentation Pitch Deck Designer & Outline Editor** (Strategy selector, slide outlining & editing)
4. **Onboarding & Full Dashboard Overview** (Gamification, compliance, analytics & quick actions)

---

## Stage 1: AI Gateway & Provider Health Panel

### Objective
Verify that the multi-provider routing engine, circuit breaker, usage tracking, and the live status panel on the Dashboard are operational.

### Test Steps
1. **Open the Dashboard**:
   - Navigate to the **Dashboard** view (`/` after login or demo sign-in).
   - Scroll down to the **AI Gateway Status** section (embedded right below the Funding Heatmap).
2. **Inspect Provider Health**:
   - Verify that **Google Gemini** shows as **Healthy** (with model `gemini-3.8-flash`).
   - Check that secondary providers (GroqCloud, OpenRouter, Hugging Face) display their status gracefully (marked as disabled or standby when their individual API keys are not supplied in `.env`).
3. **Verify Quota & Usage Metering**:
   - Note the rolling 24-hour quota cards: **Daily Requests** (e.g. `0 / 60`) and **Daily Tokens** (e.g. `0 / 200,000`).
   - Verify that your user plan (Free/Pro/Business) is accurately reflected.
4. **Active Probe (Admin test)**:
   - If an admin secret is configured, clicking **Probe Providers** will ping the health check endpoints and refresh the latencies and failure counts live.

---

## Stage 2: Funding Application & Business Plan Generator

### Objective
Verify the end-to-end 4-step funding application flow and confirm that the AI proposal/business plan generation triggers and handles responses cleanly.

### Test Steps
1. **Browse Funding Opportunities**:
   - Click **Explore Funding** on the top navigation bar or **Browse Opportunities** from the dashboard.
   - Pick an opportunity (e.g., Seda Technology Program, sefa Small Business Fund, or NEF Women Empowerment Fund).
   - Click **Apply Now** to launch the modal workflow.
2. **Step 1: Application Form**:
   - Fill in or review the pre-filled business details: Business Name, CIPC Registration Number, Contact Phone, and Funding Requested amount.
   - Click **Continue to Business Plan**.
3. **Step 2: AI Business Plan Generation**:
   - Click **Generate Proposal & Pitch Deck** (or **Generate with AI**).
   - Verify the loading indicator ("Compiling Proposal..." / "Drafting Proposal...").
   - Upon completion, verify that the executive summary, market analysis, and use of funds cards appear.
   - Click **View Pitch Deck** to open the full-screen Gamma-style presentation modal.
   - Click the left/right arrows to flip through slides, then click **X** to return.
   - Click **Next: Compliance**.
4. **Step 3: Compliance Documents**:
   - Select the required compliance checklist items (CIPC Certificate, Tax Clearance, BEE Certificate, Bank Statements).
   - Click **Next: Submit**.
5. **Step 4: Submission Review**:
   - Review the submission package overview.
   - Click **Submit Application** and verify the success confirmation.

---

## Stage 3: Presentation Pitch Deck Designer & Outline Editor

### Objective
Verify the slide strategy selector, outline generator, and visual deck customizer.

### Test Steps
1. **Launch Pitch Deck Designer**:
   - On the Dashboard, find the **Pitch Deck** card or quick action, or open **Presentation Designer**.
2. **Test Outline Strategy Picker**:
   - In the outline generator, inspect the pitch strategy cards:
     - **SA Funding Pitch (Local Standard)**: Verify the subtitle "SA public & private funders" and the 8-slide count tag.
     - **YC Seed Pitch (Silicon Valley Style)**: Verify the subtitle "Accelerators & seed VCs" and the 7-slide count tag.
     - **Kawasaki 10/20/30 Rule**: Verify the 10-slide count tag.
   - Select a strategy and click **Generate Outline**.
3. **Test Outline Editor**:
   - Verify that generated slides appear with titles, copy formulas, emotions, and bullet points.
   - Edit slide titles or bullet points directly in the card editors.
   - Drag or re-order slides if applicable.
4. **Open in Canvas Designer**:
   - Click **Customize in Designer** / **Open Deck**.
   - Verify that slide elements (headings, lead text, decorative backgrounds, container sections) render without console errors.
   - Test changing themes, fonts, or previewing in presentation mode.

---

## Stage 4: Onboarding & Full Dashboard Overview

### Objective
Validate user onboarding, gamified progress scoring, financial analytics, and responsive dark glassmorphism layout.

### Test Steps
1. **User Profile & Readiness Score**:
   - Go to **Profile** or click your user avatar in the top right.
   - Update company stage, annual turnover, and BBBEE level.
   - Check the **Funding Readiness Score** gauge on the dashboard to confirm it updates dynamically based on compliance and profile completion.
2. **Compliance Tracker**:
   - On the Dashboard, review the **Compliance Tracker** card.
   - Verify status badges for CIPC, SARS Tax Clearance, and B-BBEE.
3. **Analytics & Funnel Charts**:
   - Check the **Application Funnel Chart** showing Stage progression (Drafted → Submitted → Under Review → Approved).
   - Verify the **Funding Countdown** timers for open grant deadlines.
4. **Mobile & Dark Theme Check**:
   - Resize the browser or switch to mobile view to confirm all glassmorphism cards, modals, and nav bars adapt smoothly without horizontal overflow.
