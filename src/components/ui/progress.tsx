import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const progressVariants = cva(
  "h-2 rounded-full transition-all",
  {
    variants: {
      variant: {
        default: "bg-blue-500",
        success: "bg-green-500",
        warning: "bg-yellow-500",
        danger: "bg-red-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof progressVariants> {
  value: number;
  max?: number;
}

function Progress({ className, variant, value, max = 100, ...props }: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-gray-200", className)}
      {...props}
    >
      <div
        className={cn(progressVariants({ variant }))}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export { Progress, progressVariants };
