"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MonthlyBudget, CampaignDeal, Campaign, DealStatus } from "@/types/database";
import { Button } from "@/components/ui/button";
import { BudgetEditDialog } from "@/components/budget-edit-dialog";
import { formatCurrency } from "@/lib/constants";
import { ChevronDown, Pencil } from "lucide-react";

interface CampaignDealWithCampaign extends CampaignDeal {
  campaign: Campaign;
}

interface MonthBudgetData {
  monthKey: string;
  monthLabel: string;
  monthDate: string;
  budget: MonthlyBudget | null;
  confirmed: number;
  negotiating: number;
}

interface PaidCollabsBudgetBarProps {
  deals: CampaignDealWithCampaign[];
  onBudgetChange?: () => void;
}

export function PaidCollabsBudgetBar({ deals, onBudgetChange }: PaidCollabsBudgetBarProps) {
  const [monthsData, setMonthsData] = useState<MonthBudgetData[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const supabase = createClient();

  const fetchBudgetData = useCallback(async () => {
    setLoading(true);

    try {
      // Fetch all monthly budgets
      const { data: budgets } = await supabase
        .from("monthly_budgets")
        .select("*")
        .order("month", { ascending: false });

      // Build a map of month keys to budget data
      const monthMap = new Map<string, MonthBudgetData>();

      // Get current month and next few months
      const now = new Date();
      const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];

      for (let i = -2; i <= 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const monthLabel = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          monthDate,
          budget: null,
          confirmed: 0,
          negotiating: 0,
        });
      }

      // Map budgets to their months
      if (budgets) {
        budgets.forEach((budget: MonthlyBudget) => {
          const dateParts = budget.month.split("T")[0].split("-");
          const monthKey = `${dateParts[0]}-${dateParts[1]}`;
          const existing = monthMap.get(monthKey);
          if (existing) {
            existing.budget = budget;
          }
        });
      }

      // Calculate confirmed and negotiating amounts from deals
      deals.forEach((deal) => {
        if (deal.campaign?.start_date) {
          const dateParts = deal.campaign.start_date.split("T")[0].split("-");
          const monthKey = `${dateParts[0]}-${dateParts[1]}`;
          const existing = monthMap.get(monthKey);
          if (existing) {
            const dealStatus = (deal.deal_status || "negotiating") as DealStatus;
            if (dealStatus === "confirmed") {
              existing.confirmed += deal.total_deal_value || 0;
            } else if (dealStatus === "negotiating") {
              existing.negotiating += deal.total_deal_value || 0;
            }
            // cancelled deals don't count
          }
        }
      });

      // Convert to array and sort by month descending
      const monthsArray = Array.from(monthMap.values()).sort((a, b) =>
        b.monthKey.localeCompare(a.monthKey)
      );

      setMonthsData(monthsArray);

      // Set default selected month to current month
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      if (!selectedMonthKey || !monthMap.has(selectedMonthKey)) {
        setSelectedMonthKey(currentMonthKey);
      }
    } catch (error) {
      console.error("Error fetching budget data:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase, deals, selectedMonthKey]);

  useEffect(() => {
    fetchBudgetData();
  }, [fetchBudgetData]);

  // Recalculate when deals change
  useEffect(() => {
    if (monthsData.length > 0) {
      // Recalculate amounts from deals
      const updatedMonths = monthsData.map((month) => ({
        ...month,
        confirmed: 0,
        negotiating: 0,
      }));

      deals.forEach((deal) => {
        if (deal.campaign?.start_date) {
          const dateParts = deal.campaign.start_date.split("T")[0].split("-");
          const monthKey = `${dateParts[0]}-${dateParts[1]}`;
          const monthData = updatedMonths.find((m) => m.monthKey === monthKey);
          if (monthData) {
            const dealStatus = (deal.deal_status || "negotiating") as DealStatus;
            if (dealStatus === "confirmed") {
              monthData.confirmed += deal.total_deal_value || 0;
            } else if (dealStatus === "negotiating") {
              monthData.negotiating += deal.total_deal_value || 0;
            }
          }
        }
      });

      setMonthsData(updatedMonths);
    }
  }, [deals]);

  const handleBudgetSave = () => {
    fetchBudgetData();
    onBudgetChange?.();
  };

  const selectedMonth = monthsData.find((m) => m.monthKey === selectedMonthKey);

  if (loading || !selectedMonth) {
    return (
      <div className="mb-4 p-3 bg-white rounded-lg border shadow-sm">
        <div className="text-gray-500 text-sm">Loading budget...</div>
      </div>
    );
  }

  const budgetAmount = selectedMonth.budget?.budget_amount || 0;
  const totalCommitted = selectedMonth.confirmed + selectedMonth.negotiating;
  const remaining = budgetAmount - totalCommitted;

  // Calculate percentages for progress bar
  const confirmedPercent = budgetAmount > 0 ? (selectedMonth.confirmed / budgetAmount) * 100 : 0;
  const negotiatingPercent = budgetAmount > 0 ? (selectedMonth.negotiating / budgetAmount) * 100 : 0;

  return (
    <div className="mb-4 p-3 bg-white rounded-lg border shadow-sm">
      <div className="flex items-center gap-4">
        {/* Month Selector */}
        <div className="relative">
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            {selectedMonth.monthLabel}
            <ChevronDown className="h-4 w-4" />
          </button>
          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-20 py-1 min-w-[160px] max-h-64 overflow-y-auto">
                {monthsData.map((month) => (
                  <button
                    key={month.monthKey}
                    className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-100 ${
                      month.monthKey === selectedMonthKey ? "bg-gray-50 font-medium" : ""
                    }`}
                    onClick={() => {
                      setSelectedMonthKey(month.monthKey);
                      setDropdownOpen(false);
                    }}
                  >
                    {month.monthLabel}
                    {month.budget && (
                      <span className="text-gray-400 ml-2">
                        ({formatCurrency(month.budget.budget_amount)})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Budget Summary */}
        <div className="flex-1">
          {budgetAmount > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{formatCurrency(totalCommitted)}</span>
                {" / "}
                {formatCurrency(budgetAmount)} committed
                <span className="mx-2">·</span>
                <span className={remaining < 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
                  {formatCurrency(Math.abs(remaining))} {remaining < 0 ? "over" : "remaining"}
                </span>
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-500">No budget set for this month</span>
          )}
        </div>

        {/* Edit Budget Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => setEditDialogOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          {budgetAmount > 0 ? "Edit" : "Set Budget"}
        </Button>
      </div>

      {/* Progress Bar */}
      {budgetAmount > 0 && (
        <div className="mt-3">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
            {/* Confirmed (Green) */}
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${Math.min(confirmedPercent, 100)}%` }}
            />
            {/* Negotiating (Yellow with stripes) */}
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.min(negotiatingPercent, 100 - confirmedPercent)}%`,
                background: "repeating-linear-gradient(45deg, #fbbf24, #fbbf24 4px, #fcd34d 4px, #fcd34d 8px)",
              }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Confirmed ({formatCurrency(selectedMonth.confirmed)})</span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{
                  background: "repeating-linear-gradient(45deg, #fbbf24, #fbbf24 2px, #fcd34d 2px, #fcd34d 4px)",
                }}
              />
              <span>Negotiating ({formatCurrency(selectedMonth.negotiating)})</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-gray-200" />
              <span>Remaining</span>
            </div>
          </div>
        </div>
      )}

      <BudgetEditDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleBudgetSave}
        budget={selectedMonth.budget}
        month={selectedMonth.monthDate}
        monthLabel={selectedMonth.monthLabel}
      />
    </div>
  );
}
