"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function CampaignError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Campaign page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
      <p className="text-sm text-gray-500">An error occurred loading this campaign.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
