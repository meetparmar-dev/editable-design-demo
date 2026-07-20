"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { useExport } from "@/hooks/useExport";
import type { ExportFormat } from "@/lib/export/exportCanvas";

/** Export button with a PNG/JPG format dropdown. */
export default function ExportMenu() {
  const { exportAs, canExport } = useExport();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (format: ExportFormat) => {
    setOpen(false);
    exportAs(format);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={!canExport}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-40"
      >
        <Download size={16} />
        Export
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-md border bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => choose("png")}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={() => choose("jpeg")}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-100"
          >
            JPG
          </button>
        </div>
      )}
    </div>
  );
}
