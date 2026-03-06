"use client";

import { useState, useEffect } from "react";
import { ExternalLink, Check, RotateCcw, X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SubmissionFile {
  name: string;
  drive_file_id: string;
  drive_url: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

interface Submission {
  id: string;
  creator_id: string;
  influencer_id: string;
  month: string;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  files: SubmissionFile[];
  notes: string | null;
  status: string;
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  created_at: string;
}

interface Props {
  influencerId: string;
}

const statusConfig: Record<string, { label: string; variant: string; color: string }> = {
  pending: { label: "Pending", variant: "secondary", color: "bg-gray-100 text-gray-700" },
  approved: { label: "Approved", variant: "default", color: "bg-green-100 text-green-800" },
  revision_requested: { label: "Revision Requested", variant: "outline", color: "bg-amber-100 text-amber-800" },
  rejected: { label: "Rejected", variant: "destructive", color: "bg-red-100 text-red-800" },
};

export function InfluencerSubmissionsTab({ influencerId }: Props) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackAction, setFeedbackAction] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<SubmissionFile | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, [influencerId]);

  async function fetchSubmissions() {
    setLoading(true);
    try {
      const res = await fetch(`/api/creator/submissions?influencer_id=${influencerId}`);
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch (err) {
      console.error("Failed to fetch submissions:", err);
    }
    setLoading(false);
  }

  async function updateStatus(id: string, status: string, feedback?: string) {
    setUpdating(id);
    try {
      const res = await fetch("/api/creator/submissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          admin_feedback: feedback || null,
          reviewed_by: "Admin",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions((prev) =>
          prev.map((s) => (s.id === id ? data.submission : s))
        );
        setFeedbackId(null);
        setFeedbackText("");
        setFeedbackAction(null);
      }
    } catch (err) {
      console.error("Failed to update submission:", err);
    }
    setUpdating(null);
  }

  function handleAction(id: string, action: string) {
    if (action === "approved") {
      updateStatus(id, "approved");
    } else {
      setFeedbackId(id);
      setFeedbackAction(action);
      setFeedbackText("");
    }
  }

  function submitFeedback() {
    if (!feedbackId || !feedbackAction) return;
    updateStatus(feedbackId, feedbackAction, feedbackText);
  }

  function formatMonth(month: string) {
    const [yr, mo] = month.split("-");
    if (!yr || !mo) return month;
    return new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("en", {
      month: "long",
      year: "numeric",
    });
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        Loading submissions...
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <MessageSquare className="h-10 w-10 mb-3 text-gray-300" />
        <p>No content submissions yet</p>
      </div>
    );
  }

  // Group by month
  const grouped: Record<string, Submission[]> = {};
  for (const sub of submissions) {
    const key = sub.month;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(sub);
  }

  return (
    <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
      {Object.entries(grouped).map(([month, subs]) => (
        <div key={month}>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {formatMonth(month)}
          </h3>
          <div className="space-y-3">
            {subs.map((sub) => {
              const files = Array.isArray(sub.files) ? sub.files : [];
              const cfg = statusConfig[sub.status] || statusConfig.pending;

              return (
                <div
                  key={sub.id}
                  className="border border-gray-200 rounded-lg p-4 bg-white"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="text-xs text-gray-400">
                          {files.length} file{files.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Submitted {formatDate(sub.submitted_at)}
                      </p>
                    </div>
                    {sub.drive_folder_url && (
                      <a
                        href={sub.drive_folder_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open in Drive
                      </a>
                    )}
                  </div>

                  {/* File previews */}
                  {files.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {files.map((file, i) => {
                        const isImage = file.mime_type?.startsWith("image/");
                        const isVideo = file.mime_type?.startsWith("video/");
                        const previewUrl = `/api/drive/preview/${file.drive_file_id}`;
                        return (
                          <div key={i} className="relative group">
                            {isImage ? (
                              <img
                                src={previewUrl}
                                alt={file.name}
                                className="max-w-full max-h-64 rounded border border-gray-200 cursor-pointer object-contain"
                                onClick={() => setPreviewFile(file)}
                              />
                            ) : isVideo ? (
                              <video
                                controls
                                preload="metadata"
                                src={previewUrl}
                                className="max-w-full max-h-[400px] rounded border border-gray-200"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded bg-gray-100 border border-gray-200 flex items-center justify-center">
                                <span className="text-gray-400 text-[10px]">FILE</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-gray-400 truncate">{file.name}</span>
                              <a
                                href={file.drive_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-blue-500 hover:text-blue-700 shrink-0"
                              >
                                Open in Drive
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Notes */}
                  {sub.notes && (
                    <p className="text-xs text-gray-500 mb-3 italic">
                      &ldquo;{sub.notes}&rdquo;
                    </p>
                  )}

                  {/* Admin feedback */}
                  {sub.admin_feedback && (
                    <div className="text-xs bg-gray-50 border border-gray-100 rounded p-2 mb-3">
                      <span className="font-medium text-gray-600">Feedback:</span>{" "}
                      <span className="text-gray-500">{sub.admin_feedback}</span>
                    </div>
                  )}

                  {/* Reviewed info */}
                  {sub.reviewed_at && (
                    <p className="text-[10px] text-gray-400 mb-3">
                      Reviewed by {sub.reviewed_by || "Admin"} on{" "}
                      {formatDate(sub.reviewed_at)}
                    </p>
                  )}

                  {/* Feedback input */}
                  {feedbackId === sub.id && (
                    <div className="mb-3 space-y-2">
                      <textarea
                        className="w-full text-sm border border-gray-200 rounded p-2 resize-none"
                        rows={2}
                        placeholder={
                          feedbackAction === "revision_requested"
                            ? "What changes are needed?"
                            : "Reason for rejection..."
                        }
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={feedbackAction === "rejected" ? "destructive" : "default"}
                          onClick={submitFeedback}
                          disabled={updating === sub.id}
                        >
                          {updating === sub.id
                            ? "Saving..."
                            : feedbackAction === "revision_requested"
                            ? "Request Revision"
                            : "Reject"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setFeedbackId(null);
                            setFeedbackAction(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  {feedbackId !== sub.id && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        onClick={() => handleAction(sub.id, "approved")}
                        disabled={updating === sub.id}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleAction(sub.id, "revision_requested")}
                        disabled={updating === sub.id}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Request Revision
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                        onClick={() => handleAction(sub.id, "rejected")}
                        disabled={updating === sub.id}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {/* Lightbox */}
      {previewFile && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] cursor-pointer"
          onClick={() => setPreviewFile(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
            onClick={() => setPreviewFile(null)}
          >
            ×
          </button>
          {previewFile.mime_type?.startsWith("image/") ? (
            <img
              src={`/api/drive/preview/${previewFile.drive_file_id}`}
              alt={previewFile.name}
              className="max-w-[90vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              controls
              autoPlay
              src={`/api/drive/preview/${previewFile.drive_file_id}`}
              className="max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  );
}
