"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  InfluencerContract,
  ContractType,
  ContractStatus,
  PaidCollabContractVariables,
  WhitelistingContractVariables,
} from "@/types/database";
import { renderPaidCollabContract } from "@/lib/contracts/paid-collab-template";
import { renderWhitelistingContract } from "@/lib/contracts/whitelisting-template";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  Eye,
  Download,
  Upload,
  Trash2,
  X,
  Loader2,
} from "lucide-react";

interface InfluencerContractsTabProps {
  influencer: Influencer;
}

const statusColors: Record<ContractStatus, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  signed: "bg-green-100 text-green-800",
};

const statusLabels: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
};

const contractTypeLabels: Record<ContractType, string> = {
  paid_collab: "Paid Collaboration",
  whitelisting: "Whitelisting",
};

export function InfluencerContractsTab({ influencer }: InfluencerContractsTabProps) {
  const [contracts, setContracts] = useState<InfluencerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUploadExistingDialog, setShowUploadExistingDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [contractType, setContractType] = useState<ContractType>("paid_collab");
  const [uploadExistingType, setUploadExistingType] = useState<ContractType>("paid_collab");
  const [uploadingExisting, setUploadingExisting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingFileInputRef = useRef<HTMLInputElement>(null);

  // Paid collab form state
  const [paidCollabForm, setPaidCollabForm] = useState<PaidCollabContractVariables>({
    effective_date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    talent_name: influencer.name,
    talent_representative: "",
    deliverables: "One (1) Collaborative Instagram carousel post featuring Nama products",
    total_fee: "",
    fee_additions: "+ 15% ASF + GST",
    total_amount_due: "",
    payment_1_percent: "50%",
    payment_1_amount: "",
    payment_1_condition: "due upon execution",
    payment_2_percent: "50%",
    payment_2_amount: "",
    payment_2_condition: "due once content is live",
    usage_rights_duration: "3 months from publication date",
    talent_signatory_name: influencer.name,
  });

  // Whitelisting form state
  const [whitelistingForm, setWhitelistingForm] = useState<WhitelistingContractVariables>({
    effective_date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    talent_name: influencer.name,
    talent_email: influencer.email || "",
    compensation: "$150 USD Nama gift card, delivered via email upon signing this Agreement.",
  });

  const supabase = createClient();

  useEffect(() => {
    fetchContracts();
  }, [influencer.id]);

  // Update form when influencer changes
  useEffect(() => {
    setPaidCollabForm((prev) => ({
      ...prev,
      talent_name: influencer.name,
      talent_signatory_name: influencer.name,
    }));
    setWhitelistingForm((prev) => ({
      ...prev,
      talent_name: influencer.name,
      talent_email: influencer.email || "",
    }));
  }, [influencer]);

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/contracts?influencer_id=${influencer.id}`);
      if (response.ok) {
        const data = await response.json();
        setContracts(data.contracts || []);
      }
    } catch (err) {
      console.error("Failed to fetch contracts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = () => {
    const html =
      contractType === "paid_collab"
        ? renderPaidCollabContract(paidCollabForm)
        : renderWhitelistingContract(whitelistingForm);
    setPreviewHtml(html);
    setShowPreviewDialog(true);
  };

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      // Dynamic import of html2pdf to avoid SSR issues
      const html2pdf = (await import("html2pdf.js")).default;

      const html =
        contractType === "paid_collab"
          ? renderPaidCollabContract(paidCollabForm)
          : renderWhitelistingContract(whitelistingForm);

      // Create a container element
      const container = document.createElement("div");
      container.innerHTML = html;
      document.body.appendChild(container);

      const filename =
        contractType === "paid_collab"
          ? `${influencer.name.replace(/\s+/g, "_")}_Paid_Collab_Contract.pdf`
          : `${influencer.name.replace(/\s+/g, "_")}_Whitelisting_Agreement.pdf`;

      const element = container.firstChild as HTMLElement;
      if (element) {
        await html2pdf()
          .set({
            margin: 0,
            filename,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          })
          .from(element)
          .save();
      }

      document.body.removeChild(container);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleSaveContract = async () => {
    setCreating(true);
    try {
      const variables =
        contractType === "paid_collab" ? paidCollabForm : whitelistingForm;

      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: influencer.id,
          contract_type: contractType,
          variables,
          status: "draft",
        }),
      });

      if (response.ok) {
        await fetchContracts();
        setShowCreateDialog(false);
      }
    } catch (err) {
      console.error("Failed to save contract:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async (contractId: string, status: ContractStatus) => {
    try {
      const response = await fetch("/api/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: contractId, status }),
      });

      if (response.ok) {
        setContracts((prev) =>
          prev.map((c) => (c.id === contractId ? { ...c, status } : c))
        );
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    if (!confirm("Delete this contract?")) return;

    try {
      const response = await fetch(`/api/contracts?id=${contractId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setContracts((prev) => prev.filter((c) => c.id !== contractId));
      }
    } catch (err) {
      console.error("Failed to delete contract:", err);
    }
  };

  const handleUploadSignedPdf = async (contractId: string, file: File) => {
    setUploadingFile(contractId);
    try {
      const fileName = `contracts/${influencer.id}/${contractId}_signed_${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(fileName, file, { contentType: "application/pdf" });

      if (uploadError) {
        // Try creating the bucket if it doesn't exist
        console.error("Upload error:", uploadError);
        alert("Failed to upload. Make sure the 'contracts' storage bucket exists in Supabase.");
        return;
      }

      // Store the file path (not public URL) for private bucket access
      const response = await fetch("/api/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contractId,
          signed_pdf_url: fileName,
          status: "signed",
        }),
      });

      if (response.ok) {
        setContracts((prev) =>
          prev.map((c) =>
            c.id === contractId
              ? { ...c, signed_pdf_url: fileName, status: "signed" }
              : c
          )
        );
      }
    } catch (err) {
      console.error("Failed to upload signed PDF:", err);
    } finally {
      setUploadingFile(null);
    }
  };

  const handleUploadExistingContract = async (file: File) => {
    setUploadingExisting(true);
    try {
      // First create the contract record
      const response = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: influencer.id,
          contract_type: uploadExistingType,
          variables: uploadExistingType === "paid_collab"
            ? { talent_name: influencer.name, effective_date: "", deliverables: "", total_fee: "", total_amount_due: "", payment_1_percent: "", payment_1_amount: "", payment_1_condition: "", payment_2_percent: "", payment_2_amount: "", payment_2_condition: "", usage_rights_duration: "", talent_signatory_name: influencer.name }
            : { talent_name: influencer.name, talent_email: influencer.email || "", effective_date: "", compensation: "" },
          status: "signed",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create contract record");
      }

      const { contract } = await response.json();

      // Upload the PDF
      const fileName = `contracts/${influencer.id}/${contract.id}_signed_${Date.now()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(fileName, file, { contentType: "application/pdf" });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        alert("Failed to upload PDF. Make sure the 'contracts' storage bucket exists in Supabase.");
        return;
      }

      // Store the file path (not public URL) for private bucket access
      await fetch("/api/contracts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: contract.id,
          signed_pdf_url: fileName,
        }),
      });

      await fetchContracts();
      setShowUploadExistingDialog(false);
    } catch (err) {
      console.error("Failed to upload existing contract:", err);
    } finally {
      setUploadingExisting(false);
    }
  };

  const handleViewContract = (contract: InfluencerContract) => {
    const html =
      contract.contract_type === "paid_collab"
        ? renderPaidCollabContract(contract.variables as PaidCollabContractVariables)
        : renderWhitelistingContract(contract.variables as WhitelistingContractVariables);
    setPreviewHtml(html);
    setShowPreviewDialog(true);
  };

  const handleDownloadExistingContract = async (contract: InfluencerContract) => {
    console.log("Download contract:", contract.id, "signed_pdf_url:", contract.signed_pdf_url, "variables:", contract.variables);

    // If there's an uploaded signed PDF, download that directly
    if (contract.signed_pdf_url && contract.signed_pdf_url.trim() !== "") {
      // Check if it's a storage path (starts with contracts/) or a full URL
      if (contract.signed_pdf_url.startsWith("contracts/")) {
        // Generate a signed URL for private bucket access
        const { data, error } = await supabase.storage
          .from("contracts")
          .createSignedUrl(contract.signed_pdf_url, 60); // 60 seconds expiry

        if (error || !data?.signedUrl) {
          console.error("Failed to create signed URL:", error);
          alert("Failed to access the contract file. Please try again.");
          return;
        }
        window.open(data.signedUrl, "_blank");
      } else {
        // It's already a full URL (legacy or public bucket) - try to extract path
        // Legacy URLs look like: https://xxx.supabase.co/storage/v1/object/public/contracts/path/to/file.pdf
        const match = contract.signed_pdf_url.match(/\/contracts\/(.+)$/);
        if (match) {
          const path = "contracts/" + match[1];
          console.log("Extracted path from legacy URL:", path);
          const { data, error } = await supabase.storage
            .from("contracts")
            .createSignedUrl(path, 60);

          if (error || !data?.signedUrl) {
            console.error("Failed to create signed URL from legacy path:", error);
            alert("Failed to access the contract file. The file may need to be re-uploaded.");
            return;
          }
          window.open(data.signedUrl, "_blank");
        } else {
          // Can't parse, try opening directly (probably won't work for private bucket)
          window.open(contract.signed_pdf_url, "_blank");
        }
      }
      return;
    }

    // Check if we have valid variables to generate a PDF
    const vars = contract.variables;
    console.log("No signed PDF, checking variables:", vars);
    const hasValidVariables = contract.contract_type === "paid_collab"
      ? (vars as PaidCollabContractVariables).talent_name && (vars as PaidCollabContractVariables).effective_date
      : (vars as WhitelistingContractVariables).talent_name && (vars as WhitelistingContractVariables).effective_date;

    if (!hasValidVariables) {
      alert("This contract doesn't have a downloadable PDF. Please upload a signed PDF or create a new contract with complete details.");
      return;
    }

    // Generate PDF from template
    setGeneratingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      const html =
        contract.contract_type === "paid_collab"
          ? renderPaidCollabContract(contract.variables as PaidCollabContractVariables)
          : renderWhitelistingContract(contract.variables as WhitelistingContractVariables);

      console.log("Generated HTML length:", html?.length);

      const filename =
        contract.contract_type === "paid_collab"
          ? `${influencer.name.replace(/\s+/g, "_")}_Paid_Collab_Contract.pdf`
          : `${influencer.name.replace(/\s+/g, "_")}_Whitelisting_Agreement.pdf`;

      // Create a wrapper div and use that as the source
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      wrapper.style.position = "absolute";
      wrapper.style.left = "-9999px";
      wrapper.style.top = "0";
      document.body.appendChild(wrapper);

      await html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        })
        .from(wrapper)
        .save();

      document.body.removeChild(wrapper);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Contracts</h3>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowUploadExistingDialog(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Upload Existing
          </Button>
          <Button type="button" size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Contract
          </Button>
        </div>
      </div>

      {/* Contracts List */}
      {loading ? (
        <div className="text-center text-gray-500 py-8">Loading contracts...</div>
      ) : contracts.length === 0 ? (
        <div className="text-center py-8">
          <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No contracts yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Create a contract to get started
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((contract) => (
            <div
              key={contract.id}
              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {contractTypeLabels[contract.contract_type]}
                    </span>
                    <Badge className={statusColors[contract.status]}>
                      {statusLabels[contract.status]}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Created {formatDate(contract.created_at)}
                  </p>
                  {contract.signed_pdf_url && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (contract.signed_pdf_url!.startsWith("contracts/")) {
                          const { data, error } = await supabase.storage
                            .from("contracts")
                            .createSignedUrl(contract.signed_pdf_url!, 60);
                          if (data?.signedUrl) {
                            window.open(data.signedUrl, "_blank");
                          }
                        } else {
                          window.open(contract.signed_pdf_url!, "_blank");
                        }
                      }}
                      className="text-sm text-purple-600 hover:underline mt-1 inline-block"
                    >
                      View signed contract
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewContract(contract)}
                    title="Preview"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadExistingContract(contract)}
                    disabled={generatingPdf}
                    title="Download PDF"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {contract.status !== "signed" && (
                    <>
                      <label className="cursor-pointer inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-gray-100 transition-colors">
                        {uploadingFile === contract.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                        ) : (
                          <Upload className="h-4 w-4 text-gray-500" />
                        )}
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadSignedPdf(contract.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteContract(contract.id)}
                    className="text-gray-400 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {contract.status === "draft" && (
                <div className="mt-3 pt-3 border-t">
                  <Select
                    value={contract.status}
                    onChange={(e) =>
                      handleUpdateStatus(contract.id, e.target.value as ContractStatus)
                    }
                    className="text-sm w-32"
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="signed">Signed</option>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Contract Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" style={{ width: "700px" }}>
          <DialogHeader>
            <DialogTitle>Create Contract</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Contract Type Selector */}
            <div>
              <Label className="text-xs font-medium">Contract Type</Label>
              <Select
                value={contractType}
                onChange={(e) => setContractType(e.target.value as ContractType)}
              >
                <option value="paid_collab">Paid Collaboration</option>
                <option value="whitelisting">Whitelisting Agreement</option>
              </Select>
            </div>

            {/* Paid Collab Form */}
            {contractType === "paid_collab" && (
              <div className="space-y-4 border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium">Effective Date</Label>
                    <Input
                      value={paidCollabForm.effective_date}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          effective_date: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Talent Name</Label>
                    <Input
                      value={paidCollabForm.talent_name}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          talent_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium">
                    Representative/Agency (optional)
                  </Label>
                  <Input
                    value={paidCollabForm.talent_representative}
                    onChange={(e) =>
                      setPaidCollabForm((prev) => ({
                        ...prev,
                        talent_representative: e.target.value,
                      }))
                    }
                    placeholder="e.g., SDV OPERATIONS PTY LIMITED"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium">Deliverables</Label>
                  <Textarea
                    value={paidCollabForm.deliverables}
                    onChange={(e) =>
                      setPaidCollabForm((prev) => ({
                        ...prev,
                        deliverables: e.target.value,
                      }))
                    }
                    rows={2}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs font-medium">Total Fee</Label>
                    <Input
                      value={paidCollabForm.total_fee}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          total_fee: e.target.value,
                        }))
                      }
                      placeholder="$1714.00 AUD"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Fee Additions</Label>
                    <Input
                      value={paidCollabForm.fee_additions}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          fee_additions: e.target.value,
                        }))
                      }
                      placeholder="+ 15% ASF + GST"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Total Amount Due</Label>
                    <Input
                      value={paidCollabForm.total_amount_due}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          total_amount_due: e.target.value,
                        }))
                      }
                      placeholder="1,997.71 AUD"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Payment 1</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={paidCollabForm.payment_1_percent}
                        onChange={(e) =>
                          setPaidCollabForm((prev) => ({
                            ...prev,
                            payment_1_percent: e.target.value,
                          }))
                        }
                        placeholder="50%"
                      />
                      <Input
                        value={paidCollabForm.payment_1_amount}
                        onChange={(e) =>
                          setPaidCollabForm((prev) => ({
                            ...prev,
                            payment_1_amount: e.target.value,
                          }))
                        }
                        placeholder="998.85 AUD"
                      />
                    </div>
                    <Input
                      value={paidCollabForm.payment_1_condition}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          payment_1_condition: e.target.value,
                        }))
                      }
                      placeholder="due upon execution"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Payment 2</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={paidCollabForm.payment_2_percent}
                        onChange={(e) =>
                          setPaidCollabForm((prev) => ({
                            ...prev,
                            payment_2_percent: e.target.value,
                          }))
                        }
                        placeholder="50%"
                      />
                      <Input
                        value={paidCollabForm.payment_2_amount}
                        onChange={(e) =>
                          setPaidCollabForm((prev) => ({
                            ...prev,
                            payment_2_amount: e.target.value,
                          }))
                        }
                        placeholder="998.85 AUD"
                      />
                    </div>
                    <Input
                      value={paidCollabForm.payment_2_condition}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          payment_2_condition: e.target.value,
                        }))
                      }
                      placeholder="due once content is live"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium">Usage Rights Duration</Label>
                    <Input
                      value={paidCollabForm.usage_rights_duration}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          usage_rights_duration: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Talent Signatory Name</Label>
                    <Input
                      value={paidCollabForm.talent_signatory_name}
                      onChange={(e) =>
                        setPaidCollabForm((prev) => ({
                          ...prev,
                          talent_signatory_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Whitelisting Form */}
            {contractType === "whitelisting" && (
              <div className="space-y-4 border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium">Effective Date</Label>
                    <Input
                      value={whitelistingForm.effective_date}
                      onChange={(e) =>
                        setWhitelistingForm((prev) => ({
                          ...prev,
                          effective_date: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Talent Name</Label>
                    <Input
                      value={whitelistingForm.talent_name}
                      onChange={(e) =>
                        setWhitelistingForm((prev) => ({
                          ...prev,
                          talent_name: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium">Talent Email</Label>
                  <Input
                    value={whitelistingForm.talent_email}
                    onChange={(e) =>
                      setWhitelistingForm((prev) => ({
                        ...prev,
                        talent_email: e.target.value,
                      }))
                    }
                    placeholder="talent@email.com"
                  />
                </div>

                <div>
                  <Label className="text-xs font-medium">Compensation</Label>
                  <Textarea
                    value={whitelistingForm.compensation}
                    onChange={(e) =>
                      setWhitelistingForm((prev) => ({
                        ...prev,
                        compensation: e.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="$150 USD Nama gift card, delivered via email upon signing this Agreement."
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 mt-4">
            <Button type="button" variant="outline" onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadPdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              Download PDF
            </Button>
            <Button type="button" onClick={handleSaveContract} disabled={creating}>
              {creating ? "Saving..." : "Save Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh]" style={{ width: "700px" }}>
          <DialogHeader>
            <DialogTitle>Contract Preview</DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-white">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-[70vh]"
              title="Contract Preview"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowPreviewDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Existing Contract Dialog */}
      <Dialog open={showUploadExistingDialog} onOpenChange={setShowUploadExistingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Existing Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Contract Type</Label>
              <Select
                value={uploadExistingType}
                onChange={(e) => setUploadExistingType(e.target.value as ContractType)}
              >
                <option value="paid_collab">Paid Collaboration</option>
                <option value="whitelisting">Whitelisting Agreement</option>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Signed Contract PDF</Label>
              <div className="mt-2">
                <input
                  ref={existingFileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadExistingContract(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => existingFileInputRef.current?.click()}
                  disabled={uploadingExisting}
                >
                  {uploadingExisting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Choose PDF file
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowUploadExistingDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
