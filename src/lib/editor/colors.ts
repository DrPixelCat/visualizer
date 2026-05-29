import type { CSSProperties } from "react";

// Central palette for both Konva drawing and editor chrome.
export const editorColors = {
  appBackground: "#0d0f12",
  fieldBackground: "#181a20",
  fieldGrid: "rgba(148, 163, 184, 0.08)",
  transparent: "rgba(0, 0, 0, 0)",

  border: "#242832",
  borderStrong: "#303541",
  selected: "#950000FF",

  panel: "#13151a",
  panelInset: "#101217",
  panelRaised: "#181a20",
  inputBackground: "#101217",
  buttonBackground: "#181a20",
  codeBackground: "#0d0f12",

  textPrimary: "#e2e8f0",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  textSubtle: "#64748b",
  dangerText: "#fca5a5",

  canvasPath: "#38bdf8",
  canvasPathInactive: "#64748b",
  callback: "#facc15",
  callbackStroke: "#422006",
  ghostFill: "#94a3b8",
  ghostStroke: "#cbd5e1",
  poseFill: "#cbd5e1",
  arcPoseFill: "#facc15",
} as const;

type EditorColorVariable = `--editor-${string}`;

// CSS variable bridge so React panels and Tailwind arbitrary values share the palette.
export const editorColorVars: CSSProperties & Record<EditorColorVariable, string> = {
  "--editor-app-background": editorColors.appBackground,
  "--editor-field-background": editorColors.fieldBackground,
  "--editor-border": editorColors.border,
  "--editor-border-strong": editorColors.borderStrong,
  "--editor-selected": editorColors.selected,
  "--editor-panel": editorColors.panel,
  "--editor-panel-inset": editorColors.panelInset,
  "--editor-panel-raised": editorColors.panelRaised,
  "--editor-input-background": editorColors.inputBackground,
  "--editor-button-background": editorColors.buttonBackground,
  "--editor-code-background": editorColors.codeBackground,
  "--editor-text-primary": editorColors.textPrimary,
  "--editor-text-secondary": editorColors.textSecondary,
  "--editor-text-muted": editorColors.textMuted,
  "--editor-text-subtle": editorColors.textSubtle,
  "--editor-danger-text": editorColors.dangerText,
  "--editor-canvas-path": editorColors.canvasPath,
};
