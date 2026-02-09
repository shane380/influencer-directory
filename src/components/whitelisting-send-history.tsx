"use client";

import { InfluencerOrder } from "@/types/database";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Package } from "lucide-react";
import { format, parseISO } from "date-fns";

interface WhitelistingSendHistoryProps {
  orders: InfluencerOrder[];
}

export function WhitelistingSendHistory({ orders }: WhitelistingSendHistoryProps) {
  if (orders.length === 0) return null;

  const sorted = [...orders].sort(
    (a, b) => new Date(b.order_date).getTime() - new Date(a.order_date).getTime()
  );

  return (
    <Collapsible className="border-t border-gray-200">
      <CollapsibleTrigger className="px-5 py-3 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-900">
        <Package className="h-3.5 w-3.5 mr-1.5" />
        {orders.length} PACKAGE{orders.length !== 1 ? "S" : ""} SENT
      </CollapsibleTrigger>
      <CollapsibleContent className="px-5 pb-3">
        <div className="space-y-2">
          {sorted.map((order) => (
            <div key={order.id} className="flex items-start justify-between text-xs">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">#{order.order_number}</span>
                <p className="text-gray-500 truncate mt-0.5">
                  {order.line_items && order.line_items.length > 0
                    ? order.line_items.map((li) => li.product_name).join(", ")
                    : "No items"}
                </p>
              </div>
              <span className="text-gray-400 ml-2 flex-shrink-0">
                {format(parseISO(order.order_date), "MMM d, yyyy")}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
