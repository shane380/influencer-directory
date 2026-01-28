"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types/database";
import {
  Users,
  Megaphone,
  DollarSign,
  ChevronDown,
  ChevronRight,
  User,
  HelpCircle,
  LogOut,
} from "lucide-react";
import Image from "next/image";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  currentUser: {
    displayName: string;
    email: string;
    profilePhotoUrl: string | null;
    isAdmin: boolean;
  } | null;
  onLogout: () => void;
}

interface GroupedCampaigns {
  monthKey: string;
  label: string;
  campaigns: Campaign[];
}

export function Sidebar({ activeTab, onTabChange, currentUser, onLogout }: SidebarProps) {
  const [campaignsExpanded, setCampaignsExpanded] = useState(false);
  const [groupedCampaigns, setGroupedCampaigns] = useState<GroupedCampaigns[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const supabase = createClient();

  // Fetch campaigns for the sidebar
  useEffect(() => {
    async function fetchCampaigns() {
      setLoadingCampaigns(true);
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .order("start_date", { ascending: false });

      if (!error && data) {
        // Group by month
        const grouped: Record<string, Campaign[]> = {};

        data.forEach((campaign: Campaign) => {
          let monthKey = 'no-date';
          if (campaign.start_date) {
            const dateParts = campaign.start_date.split('T')[0].split('-');
            monthKey = `${dateParts[0]}-${dateParts[1]}`;
          }
          if (!grouped[monthKey]) {
            grouped[monthKey] = [];
          }
          grouped[monthKey].push(campaign);
        });

        // Convert to array with labels
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];

        const sortedGroups = Object.keys(grouped)
          .sort((a, b) => {
            if (a === 'no-date') return 1;
            if (b === 'no-date') return -1;
            return b.localeCompare(a);
          })
          .map((key) => {
            let label = 'No Date';
            if (key !== 'no-date') {
              const [year, month] = key.split('-');
              label = `${monthNames[parseInt(month, 10) - 1]} ${year}`;
            }
            return {
              monthKey: key,
              label,
              campaigns: grouped[key],
            };
          });

        setGroupedCampaigns(sortedGroups);
      }
      setLoadingCampaigns(false);
    }

    fetchCampaigns();
  }, [supabase]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  const navItems = [
    { id: "influencers", label: "Influencers", icon: Users },
    { id: "campaigns", label: "Campaigns", icon: Megaphone, expandable: true },
    { id: "paid_collabs", label: "Paid Collabs", icon: DollarSign },
  ];

  const handleNavClick = (id: string) => {
    if (id === "campaigns") {
      setCampaignsExpanded(!campaignsExpanded);
    } else {
      onTabChange(id);
      router.push(`/?tab=${id}`);
    }
  };

  const handleMonthClick = (e: React.MouseEvent, monthKey: string) => {
    e.stopPropagation();
    router.push(`/campaigns/month/${monthKey}`);
  };

  return (
    <div className="w-48 h-screen bg-white border-r flex flex-col fixed left-0 top-0">
      {/* Logo / Title */}
      <div className="px-4 py-3 border-b">
        <h1 className="text-base font-semibold text-gray-900">Partnerships</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id ||
              (item.id === "campaigns" && pathname?.startsWith("/campaigns"));

            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-2 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.expandable && (
                    campaignsExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    )
                  )}
                </button>

                {/* Campaigns submenu */}
                {item.id === "campaigns" && campaignsExpanded && (
                  <ul className="mt-1 ml-3 pl-3 border-l border-gray-200 space-y-1">
                    <li>
                      <button
                        onClick={() => {
                          onTabChange("campaigns");
                          router.push("/?tab=campaigns");
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
                      >
                        View All
                      </button>
                    </li>
                    {loadingCampaigns ? (
                      <li className="px-2 py-1.5 text-sm text-gray-400">Loading...</li>
                    ) : (
                      groupedCampaigns.slice(0, 6).map((group) => (
                        <li key={group.monthKey}>
                          <button
                            onClick={(e) => handleMonthClick(e, group.monthKey)}
                            className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate ${
                              pathname === `/campaigns/month/${group.monthKey}`
                                ? "text-gray-900 bg-gray-100 font-medium"
                                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                          >
                            {group.label}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section at bottom */}
      {currentUser && (
        <div className="border-t relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              {currentUser.profilePhotoUrl ? (
                <Image
                  src={currentUser.profilePhotoUrl}
                  alt={currentUser.displayName}
                  width={28}
                  height={28}
                  className="rounded-full flex-shrink-0"
                  unoptimized
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-medium text-gray-600">
                    {currentUser.displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0 text-left">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {currentUser.displayName}
                </p>
              </div>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform flex-shrink-0 ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown menu */}
          {userMenuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 mx-1.5 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  router.push("/account");
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <User className="h-4 w-4 text-gray-400" />
                Account Settings
              </button>
              {currentUser.isAdmin && (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/admin/users");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Users className="h-4 w-4 text-gray-400" />
                  Manage Users
                </button>
              )}
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  // Placeholder - can link to help/docs later
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <HelpCircle className="h-4 w-4 text-gray-400" />
                Help & Support
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <LogOut className="h-4 w-4 text-gray-400" />
                Sign out
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
