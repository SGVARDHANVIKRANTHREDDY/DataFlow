"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { pipelinesApi } from "@/lib/api/client";
import { useToast } from "@/stores/ui.store";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ForkButtonProps {
  pipelineId: number;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
  showLabel?: boolean;
}

export function ForkButton({ 
  pipelineId, 
  className, 
  variant = "ghost", 
  size = "sm",
  showLabel = true 
}: ForkButtonProps) {
  const qc = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: () => pipelinesApi.fork(pipelineId),
    onSuccess: (newPipe) => {
      toast({ 
        type: "success", 
        title: "Pipeline forked", 
        description: `Created "${newPipe.name}"` 
      });
      qc.invalidateQueries({ queryKey: ["pipelines"] });
    },
    onError: () => {
      toast({ 
        type: "error", 
        title: "Fork failed", 
        description: "Could not clone the pipeline." 
      });
    },
  });

  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-2", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      loading={mutation.isPending}
      title="Fork pipeline"
    >
      <GitBranch className="w-4 h-4" />
      {showLabel && <span>Fork</span>}
    </Button>
  );
}
