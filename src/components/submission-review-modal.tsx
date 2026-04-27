"use client";

import { useState } from "react";
import { X } from "lucide-react";

export interface SubmissionForReview {
  id: string;
  creator_name: string;
  creator_photo?: string | null;
  month?: string | null;
  file_count: number;
  files: Array<{ name: string; r2_url?: string; mime_type?: string }>;
  notes?: string | null;
}

interface Props {
  submission: SubmissionForReview;
  onClose: () => void;
  onAction: (
    submissionId: string,
    action: "approved" | "revision_requested",
    feedback: string,
  ) => Promise<void>;
}

export function SubmissionReviewModal({ submission, onClose, onAction }: Props) {
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const [yr, mo] = (submission.month || "").split("-");
  const monthLabel = yr && mo
    ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("en", { month: "long", year: "numeric" })
    : submission.month || "";

  async function handle(action: "approved" | "revision_requested") {
    if (saving) return;
    setSaving(true);
    try {
      await onAction(submission.id, action, feedback);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {submission.creator_photo ? (
              <img
                src={submission.creator_photo}
                alt=""
                className="w-9 h-9 rounded-full object-cover bg-gray-200"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-200" />
            )}
            <div>
              <div className="text-sm font-semibold text-gray-900">{submission.creator_name}</div>
              <div className="text-xs text-gray-500">
                {submission.file_count} file{submission.file_count !== 1 ? "s" : ""}
                {monthLabel ? ` for ${monthLabel}` : ""}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto border-r">
            {submission.notes && (
              <p className="text-sm text-gray-600 italic mb-4">&ldquo;{submission.notes}&rdquo;</p>
            )}
            <div className="space-y-4">
              {submission.files.map((file, fi) => {
                const isImage = file.mime_type?.startsWith("image/");
                const isVideo = file.mime_type?.startsWith("video/");
                return (
                  <div key={fi}>
                    {isImage && file.r2_url ? (
                      <a href={file.r2_url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={file.r2_url}
                          alt={file.name}
                          className="w-full max-h-[75vh] object-contain rounded-lg border border-gray-200 hover:opacity-90 transition-opacity bg-gray-50"
                        />
                      </a>
                    ) : isVideo && file.r2_url ? (
                      <video
                        controls
                        preload="metadata"
                        playsInline
                        className="w-full max-h-[75vh] rounded-lg border border-gray-200 bg-black object-contain"
                      >
                        <source src={file.r2_url} type={file.mime_type || "video/mp4"} />
                        <source src={file.r2_url} type="video/mp4" />
                      </video>
                    ) : file.r2_url ? (
                      <a
                        href={file.r2_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        <div className="text-xs text-gray-400">
                          {file.name?.split(".").pop()?.toUpperCase()}
                        </div>
                        <div className="text-sm text-gray-700">{file.name}</div>
                      </a>
                    ) : (
                      <div className="p-4 border border-gray-200 rounded-lg text-sm text-gray-400">
                        {file.name}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">{file.name}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="w-64 p-6 flex flex-col gap-4">
            <button
              onClick={() => handle("approved")}
              disabled={saving}
              className="w-full py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Approve"}
            </button>
            <div className="border-t pt-4">
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Request Revision
              </label>
              <textarea
                placeholder="What changes are needed?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-amber-300"
              />
              <button
                onClick={() => handle("revision_requested")}
                disabled={saving || !feedback.trim()}
                className="w-full mt-2 py-2 text-sm font-medium border border-amber-400 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                Request Revision
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
