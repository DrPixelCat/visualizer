import PathEditor from "@/components/PathEditor";
import { editorColorVars } from "@/lib/editor/colors";

// Main app frame: static header around the interactive editor workspace.
export default function Home() {
  return (
    <main
      className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--editor-app-background)] font-sans text-slate-200"
      style={editorColorVars}
    >
      <header className="flex h-14 shrink-0 items-center border-b border-[var(--editor-border)] bg-[var(--editor-panel)] px-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">Apex Pathing</h1>
          <span className="text-xs text-slate-500">Visualizer</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PathEditor />
      </div>
    </main>
  );
}
