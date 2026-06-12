import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  truncate?: boolean;
  // When true, the dropdown chevron is not rendered at all — used for
  // inline-editable table cells where the arrow just wastes horizontal space.
  hideChevron?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, truncate, hideChevron, ...props }, ref) => {
    return (
      <div className="relative inline-block">
        <select
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-white text-gray-900 pl-3 pr-8 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none",
            truncate && "truncate",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        {!hideChevron && (
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
        )}
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
