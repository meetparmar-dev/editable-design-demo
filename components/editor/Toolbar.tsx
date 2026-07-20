"use client";

import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Copy,
  Trash2,
  BringToFront,
  SendToBack,
  Undo2,
  Redo2,
} from "lucide-react";
import { useObjectActions } from "@/hooks/useObjectActions";
import { useEditorStore } from "@/store/editorStore";
import ExportMenu from "./ExportMenu";

/** A toolbar icon button. `active` shows toggle state; `disabled` greys out. */
function TBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:text-neutral-300 ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-neutral-700 hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px bg-neutral-200" />;
}

export default function Toolbar() {
  const a = useObjectActions();
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.undoStack.length > 1);
  const canRedo = useEditorStore((s) => s.redoStack.length > 0);
  const textDisabled = !a.isText;
  const noSelection = !a.hasSelection;
  const align = a.props?.textAlign;

  return (
    <header className="flex h-14 items-center gap-1 border-b bg-white px-3">
      <TBtn label="Undo" disabled={!canUndo} onClick={undo}>
        <Undo2 size={16} />
      </TBtn>
      <TBtn label="Redo" disabled={!canRedo} onClick={redo}>
        <Redo2 size={16} />
      </TBtn>

      <Divider />

      <TBtn
        label="Bold"
        active={a.props?.bold}
        disabled={textDisabled}
        onClick={a.toggleBold}
      >
        <Bold size={16} />
      </TBtn>
      <TBtn
        label="Italic"
        active={a.props?.italic}
        disabled={textDisabled}
        onClick={a.toggleItalic}
      >
        <Italic size={16} />
      </TBtn>
      <TBtn
        label="Underline"
        active={a.props?.underline}
        disabled={textDisabled}
        onClick={a.toggleUnderline}
      >
        <Underline size={16} />
      </TBtn>

      <Divider />

      <TBtn
        label="Align left"
        active={align === "left"}
        disabled={textDisabled}
        onClick={() => a.setTextAlign("left")}
      >
        <AlignLeft size={16} />
      </TBtn>
      <TBtn
        label="Align center"
        active={align === "center"}
        disabled={textDisabled}
        onClick={() => a.setTextAlign("center")}
      >
        <AlignCenter size={16} />
      </TBtn>
      <TBtn
        label="Align right"
        active={align === "right"}
        disabled={textDisabled}
        onClick={() => a.setTextAlign("right")}
      >
        <AlignRight size={16} />
      </TBtn>

      <Divider />

      <TBtn label="Duplicate" disabled={noSelection} onClick={a.duplicate}>
        <Copy size={16} />
      </TBtn>
      <TBtn label="Delete" disabled={noSelection} onClick={a.remove}>
        <Trash2 size={16} />
      </TBtn>

      <Divider />

      <TBtn
        label="Bring forward"
        disabled={noSelection}
        onClick={a.bringForward}
      >
        <BringToFront size={16} />
      </TBtn>
      <TBtn label="Send backward" disabled={noSelection} onClick={a.sendBackward}>
        <SendToBack size={16} />
      </TBtn>

      <div className="ml-auto">
        <ExportMenu />
      </div>
    </header>
  );
}
