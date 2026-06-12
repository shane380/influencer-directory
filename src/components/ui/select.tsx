import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  truncate?: boolean;
  // When true, the chevron is hidden until the nearest `group` ancestor (e.g. a
  // table row) is hovered — used for inline-editable table cells so the arrow
  // doesn't permanently take up horizontal space.
  chevronOnHover?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, truncate, chevronOnHover, ...props }, ref) => {
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
        <ChevronDown
          className={cn(
            "absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none",
            chevronOnHover && "opacity-0 transition-opacity group-hover:opacity-100"
          )}
        />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
