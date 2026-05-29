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

# Developer Guidelines

## 1. GUIDING PRINCIPLES
- **Precision over Speed**: Write correct code the first time. Check for common syntax errors, missing imports, and type mismatches before responding.
- **Project Stack**: This project uses React 19, Vite, TypeScript, Tailwind CSS, Lucide Icons, Firebase (Auth + Firestore), and the Google Generative AI SDK (@google/genai). Do not suggest Next.js, Shadcn, Prisma, Drizzle, or any other stack unless explicitly asked.
- **Component-Driven**: Build modular, reusable components. Use the Composition Pattern.

## 2. UI/UX STANDARDS
- **Visual Polish**: Always use consistent spacing (Tailwind gap, p, m scales). Add subtle hover states, transitions, and loading skeletons without being asked.
- **Mobile First**: All UI must be responsive.
- **Dark Mode**: All components must work on dark backgrounds. This app uses a dark glassmorphism aesthetic — semi-transparent panels, backdrop blur, white/gray text on near-black backgrounds.

## 3. THE "ANTI-DEBUGGING" PROTOCOL
- **Firebase Safety**: Are all Firestore reads/writes inside try/catch blocks? Is the user authenticated before any db call is made?
- **State Management**: Is state kept as close to where it's needed as possible? Avoid unnecessary prop drilling — suggest lifting state or a shared context if a value is needed in 3+ components.
- **TypeScript**: No `any`. Use the existing interfaces and types from `types.ts` for all props and Firestore data shapes.
- **Gemini AI calls**: Is the API key coming from environment variables only? Is there a loading state and an error fallback in the UI for every AI call?
- **Error Handling**: Are there UI-level error states (not just console.error) for failed Firestore operations and failed AI responses?

## 4. OUTPUT FORMAT
- **Full files only**: To prevent copy-paste errors, provide the entire contents of a file if changes are significant.
- **File pathing**: Always start code blocks with a comment indicating the file path (e.g., `// components/FundingCard.tsx`).
- **No hardcoded values**: No hardcoded user IDs, collection names as raw strings (define them as constants), or localhost URLs.
- **Deployment ready**: Code must be compatible with Vercel or Firebase Hosting deployment.

## 5. PRODUCTIVITY SHORTCUTS
- If I provide a screenshot of a UI, recreate it exactly using Tailwind, matching the dark glassmorphism style of the existing app.
- If I describe a bug, analyze the full logical flow across all relevant files before suggesting a fix. Provide the fix AND a "preventative" suggestion (e.g., a helper function, a type guard, or a custom hook) to stop the same class of bug recurring.
- If I paste a component, check it against the existing types in `types.ts` and flag any status enum mismatches or missing fields before touching anything else.
