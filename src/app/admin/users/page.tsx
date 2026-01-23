"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/types/database";
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
import { ArrowLeft, Loader2, UserPlus, Check, AlertCircle, Shield } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const checkAdminAndFetchUsers = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    // Check if current user is admin
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      router.push("/");
      return;
    }

    setIsAdmin(true);

    // Fetch all users
    const { data: usersData } = await (supabase.from("profiles") as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (usersData) {
      setUsers(usersData);
    }

    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    checkAdminAndFetchUsers();
  }, [checkAdminAndFetchUsers]);

  const handleSendInvite = async () => {
    if (!inviteEmail) {
      setInviteMessage({ type: "error", text: "Please enter an email address" });
      return;
    }

    setSendingInvite(true);
    setInviteMessage(null);

    try {
      const response = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          displayName: inviteDisplayName || inviteEmail.split("@")[0],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invite");
      }

      setInviteMessage({ type: "success", text: `Invite sent to ${inviteEmail}` });
      setInviteEmail("");
      setInviteDisplayName("");

      // Refresh users list
      checkAdminAndFetchUsers();
    } catch (error: any) {
      setInviteMessage({ type: "error", text: error.message || "Failed to send invite" });
    } finally {
      setSendingInvite(false);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Invite User Section */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Invite New User
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="inviteEmail">Email Address</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="inviteDisplayName">Display Name (optional)</Label>
                <Input
                  id="inviteDisplayName"
                  value={inviteDisplayName}
                  onChange={(e) => setInviteDisplayName(e.target.value)}
                  placeholder="John Doe"
                  className="mt-1"
                />
              </div>
            </div>

            {inviteMessage && (
              <div
                className={`flex items-center gap-2 text-sm mt-4 ${
                  inviteMessage.type === "success" ? "text-green-600" : "text-red-600"
                }`}
              >
                {inviteMessage.type === "success" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                {inviteMessage.text}
              </div>
            )}

            <Button
              onClick={handleSendInvite}
              disabled={sendingInvite || !inviteEmail}
              className="mt-4"
            >
              {sendingInvite ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Send Invite
                </>
              )}
            </Button>
          </div>

          {/* Users List */}
          <div className="bg-white rounded-lg border">
            <div className="p-6 border-b">
              <h2 className="text-lg font-medium text-gray-900">
                All Users ({users.length})
              </h2>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {user.profile_photo_url ? (
                          <Image
                            src={user.profile_photo_url}
                            alt={user.display_name}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full object-cover"
                            unoptimized
                          />
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
                          <Shield className="h-3 w-3" />
                          Admin
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">Member</span>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}
