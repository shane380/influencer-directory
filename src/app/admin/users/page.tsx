"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, UserPlus, Check, AlertCircle, Shield, Trash2, Heart } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

interface EnrichedProfile {
  id: string;
  email: string;
  display_name: string;
  profile_photo_url: string | null;
  is_admin: boolean;
  is_manager: boolean;
  created_at: string;
  last_sign_in: string | null;
}

interface EnrichedCreator {
  id: string;
  creator_name: string;
  email: string;
  user_id: string;
  status: string;
  onboarded_at: string | null;
  last_sign_in: string | null;
  sign_in_count: number | null;
  created_at_auth: string | null;
}

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<EnrichedProfile[]>([]);
  const [creators, setCreators] = useState<EnrichedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; type: "profile" | "creator"; name: string } | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) { router.push("/"); return; }
    setIsAdmin(true);

    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setProfiles(data.profiles || []);
    setCreators(data.creators || []);
    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      setInviteMessage({ type: "error", text: "Please enter an email address" });
      return;
    }
    setSendingInvite(true);
    setInviteMessage(null);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, displayName: inviteDisplayName || inviteEmail.split("@")[0] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invite");
      setInviteMessage({ type: "success", text: `Invite sent to ${inviteEmail}` });
      setInviteEmail("");
      setInviteDisplayName("");
      fetchData();
    } catch (error: any) {
      setInviteMessage({ type: "error", text: error.message });
    } finally {
      setSendingInvite(false);
    }
  };

  const handleDelete = async (userId: string, type: "profile" | "creator") => {
    setDeleting(userId);
    try {
      await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, type }),
      });
      fetchData();
    } catch {}
    setDeleting(null);
    setDeleteConfirm(null);
  };

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdatingRole(userId);
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      fetchData();
    } catch {}
    setUpdatingRole(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "Never";
    const date = new Date(d);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    const timeStr = date.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
    if (days === 0) return `Today ${timeStr} ET`;
    if (days === 1) return `Yesterday ${timeStr} ET`;
    if (days < 7) return `${days}d ago · ${timeStr} ET`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` · ${timeStr} ET`;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Invite Employee */}
        <div className="bg-white rounded-lg border p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite Employee
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="inviteEmail">Email Address</Label>
              <Input id="inviteEmail" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@namaclo.com" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="inviteDisplayName">Display Name</Label>
              <Input id="inviteDisplayName" value={inviteDisplayName} onChange={(e) => setInviteDisplayName(e.target.value)} placeholder="Jane Doe" className="mt-1" />
            </div>
          </div>
          {inviteMessage && (
            <div className={`flex items-center gap-2 text-sm mt-4 ${inviteMessage.type === "success" ? "text-green-600" : "text-red-600"}`}>
              {inviteMessage.type === "success" ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {inviteMessage.text}
            </div>
          )}
          <Button onClick={handleSendInvite} disabled={sendingInvite || !inviteEmail} className="mt-4">
            {sendingInvite ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : <><UserPlus className="h-4 w-4 mr-2" />Send Invite</>}
          </Button>
        </div>

        {/* Team Members */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2 className="text-lg font-medium text-gray-900">Team ({profiles.length})</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {user.profile_photo_url ? (
                        <Image src={user.profile_photo_url} alt={user.display_name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" unoptimized />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                          {getInitials(user.display_name || user.email)}
                        </div>
                      )}
                      <span className="font-medium">{user.display_name || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{user.email}</TableCell>
                  <TableCell>
                    {user.is_admin ? (
                      <span className="inline-flex items-center gap-1 text-sm text-purple-700 bg-purple-50 px-2 py-1 rounded">
                        <Shield className="h-3 w-3" />Admin
                      </span>
                    ) : (
                      <select
                        className="text-sm border border-gray-200 rounded px-2 py-1 bg-white"
                        value={user.is_manager ? "manager" : "member"}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={updatingRole === user.id}
                      >
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">{formatDate(user.last_sign_in)}</TableCell>
                  <TableCell>
                    {!user.is_admin && (
                      <button
                        onClick={() => setDeleteConfirm({ userId: user.id, type: "profile", name: user.display_name || user.email })}
                        disabled={deleting === user.id}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        {deleting === user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Partner Accounts */}
        <div className="bg-white rounded-lg border">
          <div className="p-6 border-b">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Heart className="h-5 w-5" />
              Partner Accounts ({creators.length})
            </h2>
          </div>
          {creators.length === 0 ? (
            <div className="p-6 text-sm text-gray-400 text-center">No partner accounts yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logins</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creators.map((creator) => (
                  <TableRow key={creator.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-sm font-medium text-pink-600">
                          {getInitials(creator.creator_name)}
                        </div>
                        <span className="font-medium">{creator.creator_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-600">{creator.email}</TableCell>
                    <TableCell>
                      <span className={`text-sm px-2 py-1 rounded ${creator.status === 'active' ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-50'}`}>
                        {creator.status || "active"}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">{creator.sign_in_count ?? "—"}</TableCell>
                    <TableCell className="text-gray-500 text-sm">{formatDate(creator.last_sign_in)}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => setDeleteConfirm({ userId: creator.id, type: "creator", name: creator.creator_name })}
                        disabled={deleting === creator.id}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      >
                        {deleting === creator.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Remove User</h3>
            <p className="text-sm text-gray-600 mb-4">
              Remove <strong>{deleteConfirm.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={!!deleting}
                className="px-4 py-2 text-sm border rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.userId, deleteConfirm.type)}
                disabled={!!deleting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:bg-red-300"
              >
                {deleting ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
