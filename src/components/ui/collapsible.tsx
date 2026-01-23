"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

interface CollapsibleContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CollapsibleContext = React.createContext<CollapsibleContextValue | undefined>(undefined);

function useCollapsibleContext() {
  const context = React.useContext(CollapsibleContext);
  if (!context) {
    throw new Error("Collapsible components must be used within a Collapsible provider");
  }
  return context;
}

interface CollapsibleProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function Collapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  className,
}: CollapsibleProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback((newOpen: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  }, [isControlled, onOpenChange]);

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      <div className={cn("w-full", className)}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

interface CollapsibleTriggerProps {
  children: React.ReactNode;
  className?: string;
  asChild?: boolean;
}

function CollapsibleTrigger({ children, className, asChild }: CollapsibleTriggerProps) {
  const { open, onOpenChange } = useCollapsibleContext();

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
      onClick: () => onOpenChange(!open),
    });
  }

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between py-2 text-sm font-medium transition-all [&[data-state=open]>svg]:rotate-180",
        className
      )}
      data-state={open ? "open" : "closed"}
      onClick={() => onOpenChange(!open)}
    >
      <span className="flex items-center gap-2">{children}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200" />
    </button>
  );
}

interface CollapsibleContentProps {
  children: React.ReactNode;
  className?: string;
}

function CollapsibleContent({ children, className }: CollapsibleContentProps) {
  const { open } = useCollapsibleContext();

  return (
    <div
      className={cn(
        "overflow-hidden transition-all",
        open ? "animate-in fade-in-0" : "hidden",
        className
      )}
    >
      {children}
    </div>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
