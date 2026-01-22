"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MonthlyBudget } from "@/types/database";

interface BudgetEditDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  budget: MonthlyBudget | null;
  month: string;
  monthLabel: string;
}

export function BudgetEditDialog({
  open,
  onClose,
  onSave,
  budget,
  month,
  monthLabel,
}: BudgetEditDialogProps) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (budget) {
      setAmount(budget.budget_amount.toString());
    } else {
      setAmount("");
    }
    setError(null);
  }, [budget, open]);

  const handleSave = async () => {
    const budgetAmount = parseFloat(amount);
    if (isNaN(budgetAmount) || budgetAmount < 0) {
      setError("Please enter a valid budget amount");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      if (budget) {
        const { error: updateError } = await supabase
          .from("monthly_budgets")
          .update({ budget_amount: budgetAmount })
          .eq("id", budget.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("monthly_budgets")
          .insert({ month, budget_amount: budgetAmount });

        if (insertError) throw insertError;
      }

      onSave();
      onClose();
    } catch (err) {
      console.error("Error saving budget:", err);
      setError("Failed to save budget. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Set Budget for {monthLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="budget-amount">Monthly Budget</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <Input
                id="budget-amount"
                type="number"
                min="0"
                step="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
                className="pl-7"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Budget"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
