import EditorCanvas from "@/components/editor/Canvas";
import Toolbar from "@/components/editor/Toolbar";
import Sidebar from "@/components/editor/Sidebar";
import Properties from "@/components/editor/Properties";

/**
 * Editor layout skeleton.
 *
 *   ┌───────────────────────────── Toolbar ─────────────────────────────┐
 *   ├──────────┬──────────────────────────────────────┬────────────────┤
 *   │ Sidebar  │               Canvas                  │   Properties   │
 *   └──────────┴──────────────────────────────────────┴────────────────┘
 *
 * This is a server component: it only arranges the shells. Each child that
 * needs interactivity ("use client") owns its own boundary, so we don't turn
 * the whole page into a client bundle unnecessarily.
 */
export default function EditorPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1">
          <EditorCanvas />
        </main>
        <Properties />
      </div>
    </div>
  );
}
