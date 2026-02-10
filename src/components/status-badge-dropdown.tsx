"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { RelationshipStatus } from "@/types/database";
import { ChevronDown } from "lucide-react";

const statusColors: Record<RelationshipStatus, string> = {
  prospect: "bg-gray-100 text-gray-800",
  contacted: "bg-blue-100 text-blue-800",
  followed_up: "bg-yellow-100 text-yellow-800",
  lead_dead: "bg-red-100 text-red-800",
  creator_wants_paid: "bg-pink-100 text-pink-800",
  order_placed: "bg-orange-100 text-orange-800",
  order_delivered: "bg-teal-100 text-teal-800",
  order_follow_up_sent: "bg-indigo-100 text-indigo-800",
  order_follow_up_two_sent: "bg-purple-100 text-purple-800",
  posted: "bg-green-100 text-green-800",
};

const statusLabels: Record<RelationshipStatus, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  followed_up: "Followed Up",
  lead_dead: "Lead Dead",
  creator_wants_paid: "Creator Wants Paid",
  order_placed: "Order Placed",
  order_delivered: "Order Delivered",
  order_follow_up_sent: "Follow Up Sent",
  order_follow_up_two_sent: "Follow Up 2 Sent",
  posted: "Posted",
};

const allStatuses: RelationshipStatus[] = [
  "prospect",
  "contacted",
  "followed_up",
  "order_placed",
  "order_delivered",
  "order_follow_up_sent",
  "order_follow_up_two_sent",
  "posted",
  "creator_wants_paid",
  "lead_dead",
];

interface StatusBadgeDropdownProps {
  status: RelationshipStatus;
  onStatusChange: (newStatus: RelationshipStatus) => void;
  className?: string;
}

export function StatusBadgeDropdown({ status, onStatusChange, className = "" }: StatusBadgeDropdownProps) {
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
          className="absolute z-50 mt-1 w-48 bg-white rounded-md border border-gray-200 shadow-lg py-1 max-h-64 overflow-y-auto"
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
