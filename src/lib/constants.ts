import { PaymentStatus, DeliverableType } from "@/types/database";

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  not_paid: "Not Paid",
  deposit_paid: "Deposit Paid",
  paid_on_post: "Paid on Post",
  paid_in_full: "Paid in Full",
};

export const paymentStatusColors: Record<PaymentStatus, string> = {
  not_paid: "bg-gray-100 text-gray-800",
  deposit_paid: "bg-yellow-100 text-yellow-800",
  paid_on_post: "bg-blue-100 text-blue-800",
  paid_in_full: "bg-green-100 text-green-800",
};

export const deliverableTypeLabels: Record<DeliverableType, string> = {
  ugc: "UGC",
  collab_post: "Collab Post",
  organic_post: "Organic Post",
  whitelisting: "Whitelisting",
  other: "Other",
};

export const deliverableTypes: DeliverableType[] = [
  "ugc",
  "collab_post",
  "organic_post",
  "whitelisting",
  "other",
];

export const paymentStatuses: PaymentStatus[] = [
  "not_paid",
  "deposit_paid",
  "paid_on_post",
  "paid_in_full",
];

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCurrencyDetailed(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
