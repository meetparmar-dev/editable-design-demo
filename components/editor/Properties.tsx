"use client";

import { SlidersHorizontal, Minus, Plus } from "lucide-react";
import { useObjectActions } from "@/hooks/useObjectActions";

/** Curated font list. Web-safe families render everywhere; the rest fall back
 * gracefully until a font-loading step is added. */
const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Verdana",
  "Montserrat",
  "Roboto",
  "Open Sans",
  "Lato",
  "Poppins",
  "Oswald",
  "Inter",
];

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function Properties() {
  const a = useObjectActions();

  return (
    <aside className="flex w-80 flex-col border-l bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium text-neutral-700">
        <SlidersHorizontal size={16} />
        Properties
      </div>

      {!a.isText || !a.props ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-sm text-neutral-400">
          Select a text layer to edit its properties.
        </div>
      ) : (
        <div className="space-y-4 p-4">
          <Field label="Font family">
            <select
              value={a.props.fontFamily}
              onChange={(e) => a.setFontFamily(e.target.value)}
              className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
            >
              {/* Include the current family even if it's outside our list. */}
              {!FONT_FAMILIES.includes(a.props.fontFamily) && (
                <option value={a.props.fontFamily}>{a.props.fontFamily}</option>
              )}
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Font size">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Decrease font size"
                onClick={() => a.setFontSize(Math.max(1, a.props!.fontSize - 1))}
                className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 hover:bg-neutral-100"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                min={1}
                value={a.props.fontSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) a.setFontSize(n);
                }}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-center text-sm"
              />
              <button
                type="button"
                aria-label="Increase font size"
                onClick={() => a.setFontSize(a.props!.fontSize + 1)}
                className="flex h-8 w-8 items-center justify-center rounded border border-neutral-300 hover:bg-neutral-100"
              >
                <Plus size={14} />
              </button>
            </div>
          </Field>

          <Field label="Color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={a.props.fill}
                onChange={(e) => a.setFill(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-neutral-300"
              />
              <input
                type="text"
                value={a.props.fill}
                onChange={(e) => a.setFill(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          </Field>
        </div>
      )}
    </aside>
  );
}
