// Payments made on a preview/local deployment are flagged is_test so they never
// pollute the real payouts ledger. Production-facing reads use isTestEnv()=false.
export const isTestEnv = (): boolean => process.env.VERCEL_ENV !== "production";
