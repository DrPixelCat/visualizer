<!-- BEGIN:nextjs-agent-rules -->
# Apex Pathing Visualizer - Agent Instructions

## First Rule: Verify The Local Next.js Version
This project uses Next.js `16.2.6`, React `19.2.4`, Tailwind CSS `4`, and the App Router. These versions may differ from your training data. Before changing framework behavior, routing, dynamic imports, metadata, server/client component boundaries, or config, read the relevant local guide in `node_modules/next/dist/docs/` and follow current deprecation notices.
If this is your first time using the codebase, you MUST process the entire codebase and understand it before making any changes.

## Project Goal
Apex Pathing is a web-based 2D trajectory visualizer and editor for autonomous robots. The target experience is a lazy but robust robotics path IDE: fast to sketch paths, precise enough for tuning, clear about geometry and units, and reliable when exporting waypoints.

Build the actual editor experience first. Avoid marketing-page thinking, decorative UI, or features that look impressive but do not help a driver, programmer, or robotics student inspect and tune robot motion.

## Stack
- **Framework:** Next.js App Router under `src/app`.
- **Language:** TypeScript with strict, explicit math and coordinate types.
- **Styling:** Tailwind CSS, using the centralized editor palette.
- **Canvas:** `react-konva` and `konva`.
- **State:** `zustand` where shared editor state is needed.

## Repo Structure
This repo intentionally uses a `src` directory:

- `src/app` - routing, layouts, pages, and SSR/client boundaries.
- `src/components` - React UI and editor components.
- `src/components/path-editor` - focused path editor panels, canvas, controls, and hooks.
- `src/lib/editor` - editor-specific constants, types, coordinate transforms, colors, and API helpers.
- `src/lib/geometry` - pure geometry, splines, path math, heading interpolation, sampling, and robotics-adjacent primitives.

Keep math and export logic out of React components when practical. Components should orchestrate interaction and rendering; `src/lib` should hold testable computation.

## Canvas And SSR Rules
Konva must only run on the client. Any component that imports or renders Konva must include `"use client";`.

Parent pages or server components must dynamically import Konva-backed components with `ssr: false`. Do not rely on SSR fallthrough for canvas code.

## Layout Rules
Preserve the editor shell as a full-screen tool:

- Use `h-screen`, `w-screen`, and `overflow-hidden` for the main workspace.
- Keep the canvas area constrained with `aspect-square`, `min-h-0`, and flex layouts so side panels do not get pushed off-screen.
- Prefer dense, scan-friendly controls over oversized cards or landing-page sections.
- Avoid nested cards and decorative backgrounds. Panels should feel like practical tooling.
- Optimize for 16:9 laptop devices, but make resizing possible for different devices. In the future, panels should dynamically change size based on width/height, and a vertical screen layout should be added and used when a vertical desktop screen or taller than wide window is detected.

## Visual System
Use `src/lib/editor/colors.ts` as the source of truth for editor colors. Prefer `editorColors` for Konva drawing and `editorColorVars` or Tailwind arbitrary values backed by those variables for React UI.

Current palette intent:

- YOU MUST: Read these everytime the user gives you a prompt, compare them with the src/lib/editor/colors.ts, and change this file to reflect what is done there. These primary colors should be changed by the user, not you.
- App background: `#0d0f12`
- Panels: `#13151a`, `#181a20`, `#101217`
- Borders: `#242832`, `#303541`
- Primary path: `#38bdf8`
- Callback marker: `#facc15`
- Selected/error emphasis: `#950000FF` and danger text `#fca5a5`

Do not introduce one-off colors unless the palette first gains a named token. Keep contrast usable on the dark interface.

## Math And Robotics Rules
- Treat the field as a robotics odometry plane with `Pose2d`-style `(x, y, theta)` semantics unless local code says otherwise.
- Mirror familiar WPILib and FTC RoadRunner naming where it improves export compatibility.
- Be explicit about units, coordinate transforms, sampling resolution, and angle wrapping.
- Do not hallucinate kinematics, spline math, or controller behavior. If the local implementation is unclear, inspect it first and state assumptions in code or the response.
- Prioritize efficient, deterministic algorithms in `src/lib`; avoid React state as a storage place for derived geometry that can be computed cleanly.

## Implementation Preferences
- Number one priority is to make the code base maintainable and organized 
- Code should be easy to read and understand
- Make small, coherent changes that match nearby code.
- Avoid premature abstraction. Add helpers only when they reduce real duplication or isolate nontrivial math.
- Keep TypeScript types precise, especially for poses, vectors, headings, path points, and canvas/field coordinate conversion.
- Prefer Tailwind utilities over custom CSS, but keep repeated editor colors routed through `colors.ts`.
- Use icons for compact tool actions when an icon library is already present; otherwise keep controls simple and clear.
- Preserve user edits in the working tree. Do not revert unrelated changes.
- Add minimal comments everywhere to explain the code you write.
- DO NOT: write code files that are > 750 lines of code EVER. Less strict rule: try to keep code files <= 500 lines of code. 

## Verification
Run the narrowest meaningful check after changes:

- `npm run build` for framework/type integration.
- Targeted local inspection for canvas rendering and layout changes.
- Add or update tests when behavior is pure math, exported data, or shared geometry logic.

If a check cannot be run, say exactly why.
<!-- END:nextjs-agent-rules -->
