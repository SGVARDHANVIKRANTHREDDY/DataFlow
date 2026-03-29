"use client";

import { usePipelineStore } from "@/stores/pipeline.store";
import { Button } from "@/components/ui/button";
import { Undo2, Redo2 } from "lucide-react";
import { useEffect } from "react";

export function HistoryControls() {
  const { undo, redo, past, future } = usePipelineStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
      <Button
        variant="ghost"
        size="icon"
        onClick={undo}
        disabled={past.length === 0}
        className="h-8 w-8 text-text-secondary"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={redo}
        disabled={future.length === 0}
        className="h-8 w-8 text-text-secondary"
        title="Redo (Ctrl+Y)"
      >
        <Redo2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
