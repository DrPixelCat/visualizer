import PathEditor from "@/components/PathEditor";

export default function Home() {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-[#0d0f12] font-sans text-slate-200">
      <header className="flex h-14 shrink-0 items-center border-b border-[#242832] bg-[#13151a] px-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-wide text-slate-100">
            Apex Pathing
          </h1>
          <span className="text-xs text-slate-500">Visualizer</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PathEditor />
      </div>
    </main>
  );
}
