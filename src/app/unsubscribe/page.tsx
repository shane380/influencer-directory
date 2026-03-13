"use client";

import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleUnsubscribe = async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (!email || !token) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-sm text-gray-500">This unsubscribe link is not valid.</p>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Unsubscribed</h1>
          <p className="text-sm text-gray-500">
            You&apos;ve been unsubscribed from all Nama Partners emails. You can re-enable notifications anytime from your dashboard settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Unsubscribe</h1>
        <p className="text-sm text-gray-500 mb-6">
          Click below to unsubscribe <span className="font-medium text-gray-700">{email}</span> from all Nama Partners email notifications.
        </p>
        <button
          onClick={handleUnsubscribe}
          disabled={status === "loading"}
          className="px-6 py-2.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? "Unsubscribing..." : "Unsubscribe"}
        </button>
        {status === "error" && (
          <p className="text-sm text-red-600 mt-4">Something went wrong. Please try again.</p>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
