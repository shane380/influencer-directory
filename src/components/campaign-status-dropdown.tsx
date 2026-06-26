"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { CampaignStatus } from "@/types/database";
import { ChevronDown } from "lucide-react";

const statusColors: Record<CampaignStatus, string> = {
  planning: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

const statusLabels: Record<CampaignStatus, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

const allStatuses: CampaignStatus[] = [
  "planning",
  "active",
  "completed",
  "cancelled",
];

interface CampaignStatusDropdownProps {
  status: CampaignStatus;
  onStatusChange: (newStatus: CampaignStatus) => void;
  className?: string;
}

export function CampaignStatusDropdown({ status, onStatusChange, className = "" }: CampaignStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center gap-1 cursor-pointer"
      >
        <Badge className={`${statusColors[status]} hover:opacity-80 transition-opacity`}>
          {statusLabels[status]}
          <ChevronDown className="h-3 w-3 ml-0.5 inline" />
        </Badge>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-44 bg-white rounded-md border border-gray-200 shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {allStatuses.map((s) => (
            <button
              key={s}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                s === status ? "font-semibold" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (s !== status) {
                  onStatusChange(s);
                }
                setOpen(false);
              }}
            >
              <Badge className={`${statusColors[s]} text-[10px] px-1.5 py-0`}>
                {statusLabels[s]}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
