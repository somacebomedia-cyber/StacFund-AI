# Feature Roadmap & Plans

## Version 2 (V2) - Triggered when reaching ~500 paying users
- **Business Registration Suite**:
  - CIPC Business Registration
  - SARS Tax Clearance Certificate
  - B-BBEE (BEE) Certificate

## Implementation Strategy for V2
- **Wizard of Oz (Concierge MVP) Approach**:
  - The app will collect all necessary user information, director details, and documents via a polished, step-by-step UI workflow.
  - The actual submission to CIPC and SARS will be handled manually in the background by the team using the collected data.
  - Users will see live status updates ("In Progress", "Awaiting CIPC", etc.) while the manual work happens behind the scenes.
  - Once the volume increases further or official APIs become more accessible, we can automate the backend processes.
