"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { MonthlyBudget, CampaignDeal, Campaign } from "@/types/database";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BudgetEditDialog } from "@/components/budget-edit-dialog";
import { formatCurrency } from "@/lib/constants";
import { Pencil, DollarSign } from "lucide-react";

interface CampaignDealWithCampaign extends CampaignDeal {
  campaign: Campaign;
}

interface MonthData {
  monthKey: string;
  monthLabel: string;
  monthDate: string;
  budget: MonthlyBudget | null;
  committed: number;
  paid: number;
}

export function BudgetDashboard({ onRefresh }: { onRefresh?: () => void }) {
  const [monthsData, setMonthsData] = useState<MonthData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<MonthData | null>(null);

  const supabase = createClient();

  const fetchBudgetData = useCallback(async () => {
    setLoading(true);

    try {
      // Fetch all monthly budgets
      const { data: budgets } = await supabase
        .from("monthly_budgets")
        .select("*")
        .order("month", { ascending: false });

      // Fetch all campaign deals with their campaigns
      const { data: deals } = await supabase
        .from("campaign_deals")
        .select("*, campaign:campaigns(*)");

      // Fetch all campaigns to get their months (even without deals)
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id, start_date")
        .not("start_date", "is", null);

      // Build a map of month keys to budget data
      const monthMap = new Map<string, MonthData>();

      // Get current month and next few months
      const now = new Date();
      for (let i = -1; i <= 3; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const monthDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        const monthNames = [
          "January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"
        ];
        const monthLabel = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

        monthMap.set(monthKey, {
          monthKey,
          monthLabel,
          monthDate,
          budget: null,
          committed: 0,
          paid: 0,
        });
      }

      // Add months from campaigns that have start dates
      if (campaigns) {
        campaigns.forEach((campaign: { id: string; start_date: string }) => {
          if (campaign.start_date) {
            const dateParts = campaign.start_date.split("T")[0].split("-");
            const monthKey = `${dateParts[0]}-${dateParts[1]}`;
            if (!monthMap.has(monthKey)) {
              const year = parseInt(dateParts[0], 10);
              const month = parseInt(dateParts[1], 10) - 1;
              const monthNames = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
              ];
              monthMap.set(monthKey, {
                monthKey,
                monthLabel: `${monthNames[month]} ${year}`,
                monthDate: `${dateParts[0]}-${dateParts[1]}-01`,
                budget: null,
                committed: 0,
                paid: 0,
              });
            }
          }
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
          } else {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const monthNames = [
              "January", "February", "March", "April", "May", "June",
              "July", "August", "September", "October", "November", "December"
            ];
            monthMap.set(monthKey, {
              monthKey,
              monthLabel: `${monthNames[month]} ${year}`,
              monthDate: `${dateParts[0]}-${dateParts[1]}-01`,
              budget,
              committed: 0,
              paid: 0,
            });
          }
        });
      }

      // Calculate committed and paid amounts from deals
      if (deals) {
        deals.forEach((deal: CampaignDealWithCampaign) => {
          if (deal.campaign?.start_date) {
            const dateParts = deal.campaign.start_date.split("T")[0].split("-");
            const monthKey = `${dateParts[0]}-${dateParts[1]}`;
            const existing = monthMap.get(monthKey);
            if (existing) {
              existing.committed += deal.total_deal_value || 0;

              // Calculate paid amount based on payment status
              if (deal.payment_status === "paid_in_full" || deal.payment_status === "paid_on_post") {
                existing.paid += deal.total_deal_value || 0;
              } else if (deal.payment_status === "deposit_paid") {
                existing.paid += deal.deposit_amount || 0;
              }
            }
          }
        });
      }

      // Convert to array and sort by month descending
      const monthsArray = Array.from(monthMap.values()).sort((a, b) =>
        b.monthKey.localeCompare(a.monthKey)
      );

      setMonthsData(monthsArray);
    } catch (error) {
      console.error("Error fetching budget data:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchBudgetData();
  }, [fetchBudgetData]);

  const handleEditBudget = (month: MonthData) => {
    setSelectedMonth(month);
    setEditDialogOpen(true);
  };

  const handleBudgetSave = () => {
    fetchBudgetData();
    onRefresh?.();
  };

  const getProgressVariant = (committed: number, budget: number) => {
    if (budget === 0) return "default";
    const percentage = (committed / budget) * 100;
    if (percentage > 100) return "danger";
    if (percentage >= 75) return "warning";
    return "success";
  };

  if (loading) {
    return (
      <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
        <div className="text-gray-500 text-sm">Loading budget data...</div>
      </div>
    );
  }

  // Only show months that have budgets or committed spend
  const relevantMonths = monthsData.filter(
    (m) => m.budget || m.committed > 0
  );

  if (relevantMonths.length === 0) {
    return (
      <div className="mb-6 p-4 bg-white rounded-lg border shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-gray-400" />
            <span className="font-medium text-gray-700">Monthly Budgets</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const now = new Date();
              const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              const monthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
              const monthNames = [
                "January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"
              ];
              setSelectedMonth({
                monthKey,
                monthLabel: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
                monthDate,
                budget: null,
                committed: 0,
                paid: 0,
              });
              setEditDialogOpen(true);
            }}
          >
            Set Budget
          </Button>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          No budgets set yet. Click &quot;Set Budget&quot; to add a monthly budget.
        </p>

        <BudgetEditDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          onSave={handleBudgetSave}
          budget={selectedMonth?.budget || null}
          month={selectedMonth?.monthDate || ""}
          monthLabel={selectedMonth?.monthLabel || ""}
        />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-gray-600" />
          <span className="font-semibold text-gray-900">Paid Campaign Budgets</span>
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2">
        {relevantMonths.map((month) => {
          const budgetAmount = month.budget?.budget_amount || 0;
          const remaining = budgetAmount - month.committed;
          const percentage = budgetAmount > 0 ? (month.committed / budgetAmount) * 100 : 0;

          return (
            <div
              key={month.monthKey}
              className="flex-shrink-0 w-64 bg-white rounded-lg border shadow-sm p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-gray-900">{month.monthLabel}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => handleEditBudget(month)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>

              {budgetAmount > 0 ? (
                <>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Budget</span>
                      <span className="font-medium">{formatCurrency(budgetAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Committed</span>
                      <span className="font-medium">{formatCurrency(month.committed)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Remaining</span>
                      <span className={`font-medium ${remaining < 0 ? "text-red-600" : "text-green-600"}`}>
                        {formatCurrency(remaining)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Progress
                      value={month.committed}
                      max={budgetAmount}
                      variant={getProgressVariant(month.committed, budgetAmount)}
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">
                        {Math.round(percentage)}% committed
                      </span>
                      {month.paid > 0 && (
                        <span className="text-xs text-gray-400">
                          {formatCurrency(month.paid)} paid
                        </span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  {month.committed > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Committed</span>
                        <span className="font-medium">{formatCurrency(month.committed)}</span>
                      </div>
                      <Badge variant="warning" className="text-xs">No budget set</Badge>
                    </>
                  ) : (
                    <p className="text-sm text-gray-500">No budget set</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Add new month button */}
        <div
          className="flex-shrink-0 w-64 bg-gray-50 rounded-lg border border-dashed shadow-sm p-4 flex items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => {
            // Find the next month that doesn't have a budget
            const existingMonthKeys = new Set(relevantMonths.map((m) => m.monthKey));
            const now = new Date();
            let targetDate = new Date(now.getFullYear(), now.getMonth(), 1);

            // Try to find a month without a budget in the next 12 months
            for (let i = 0; i < 12; i++) {
              const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}`;
              if (!existingMonthKeys.has(monthKey)) {
                const monthNames = [
                  "January", "February", "March", "April", "May", "June",
                  "July", "August", "September", "October", "November", "December"
                ];
                setSelectedMonth({
                  monthKey,
                  monthLabel: `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`,
                  monthDate: `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-01`,
                  budget: null,
                  committed: 0,
                  paid: 0,
                });
                setEditDialogOpen(true);
                return;
              }
              targetDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1);
            }
          }}
        >
          <span className="text-gray-500 text-sm">+ Add Month</span>
        </div>
      </div>

      <BudgetEditDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleBudgetSave}
        budget={selectedMonth?.budget || null}
        month={selectedMonth?.monthDate || ""}
        monthLabel={selectedMonth?.monthLabel || ""}
      />
    </div>
  );
}
