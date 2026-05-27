<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Apex Pathing Visualizer - AI Agent Directives

## Project Overview
You are an expert web developer and robotics software engineer assisting in the development of "Apex Pathing," a web-based 2D trajectory visualizer and editor for autonomous robots. The goal is to provide a "lazy but robust" IDE-like experience for tuning paths, visualizing kinematics, and exporting waypoints.

## Tech Stack
- **Framework:** Next.js (App Router, **NO `src` directory**)
- **Language:** TypeScript (Strict typing required, especially for math/coordinates)
- **Styling:** Tailwind CSS
- **Canvas/Drawing:** `react-konva` and `konva`
- **Global State:** `zustand`

## Architectural Rules (CRITICAL)
1. **File Structure:** 
    - '/src' -> {
      - `/app` -> Next.js routing, layouts, and pages.
      - `/components` -> React components (UI panels, canvas elements).
      - `/lib` -> Pure math, splines, kinematic constraints, and export utilities.
      }
2. **Canvas Rendering:** Next.js uses Server-Side Rendering (SSR) by default, which WILL crash `react-konva`. Any component utilizing Konva MUST include the `"use client";` directive AND be dynamically imported with `{ ssr: false }` by its parent page/layout.
3. **Layout Scaling:** The main UI uses a strict Flexbox layout with `h-screen`, `w-screen`, and `overflow-hidden`. The central canvas container uses `aspect-square` and `min-h-0` to maximize space without pushing sidebars off-screen. Do not break this CSS architecture.

## Math & Robotics Context
- You are translating algorithms typically written in Java into TypeScript. Prioritize computational efficiency in the `/lib` folder.
- **Coordinate System:** Assume a standard robotics odometry plane `(x, y, theta)`.
- Be prepared to assist with B-splines, vector fields, PID tuning visualizations, and mecanum drive kinematics.
- Types for generic poses (`Pose2d`), translation vectors (`Translation2d`), and geometry should mirror standard WPILib or FTC RoadRunner conventions to make exporting easier.

## Coding Style
- Avoid premature abstraction. Write straightforward, readable code.
- Prefer Tailwind utility classes over custom CSS. Use the established dark-mode palette (`#0d0f12`, `#13151a`, `#181a20`).
- If you don't know the answer or lack the context to complete a complex mathematical visualization, state it clearly. Do not hallucinate math.

<!-- END:nextjs-agent-rules -->
