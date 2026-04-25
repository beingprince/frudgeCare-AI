import React from "react";
import { FolderOpen, Inbox, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: "folder" | "inbox" | "search";
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  isCompact?: boolean;
}

export function EmptyState({ icon = "inbox", title, description, action, className, isCompact = false }: EmptyStateProps) {
  const IconComponent = 
    icon === "folder" ? FolderOpen : 
    icon === "search" ? Search : 
    Inbox;

  return (
    <div className={cn(
      "w-full h-full flex flex-col items-center justify-center text-center p-6",
      isCompact ? "py-8" : "py-16",
      "animate-in fade-in duration-200 text-slate-500",
      className
    )}>
      <div className={cn(
        "rounded-full bg-slate-100 flex items-center justify-center mb-4 transition-transform duration-200 hover:scale-105",
        isCompact ? "w-12 h-12" : "w-16 h-16"
      )}>
        <IconComponent className={cn(
          "text-slate-300", 
          isCompact ? "w-6 h-6" : "w-8 h-8"
        )} />
      </div>
      <h3 className={cn("font-semibold text-slate-900 mb-1", isCompact ? "text-[15px]" : "text-[18px]")}>
        {title}
      </h3>
      <p className={cn("max-w-xs text-slate-500", isCompact ? "text-[13px]" : "text-[15px]")}>
        {description}
      </p>
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
