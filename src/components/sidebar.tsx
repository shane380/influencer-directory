"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types/database";
import {
  Users,
  Megaphone,
  DollarSign,
  Settings,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface GroupedCampaigns {
  monthKey: string;
  label: string;
  campaigns: Campaign[];
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const [campaignsExpanded, setCampaignsExpanded] = useState(false);
  const [groupedCampaigns, setGroupedCampaigns] = useState<GroupedCampaigns[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
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

  const handleMonthClick = (monthKey: string) => {
    router.push(`/campaigns/month/${monthKey}`);
  };

  return (
    <div className="w-60 h-screen bg-white border-r flex flex-col fixed left-0 top-0">
      {/* Logo / Title */}
      <div className="px-5 py-4 border-b">
        <h1 className="text-lg font-semibold text-gray-900">Partnerships</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id ||
              (item.id === "campaigns" && pathname?.startsWith("/campaigns"));

            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </span>
                  {item.expandable && (
                    campaignsExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )
                  )}
                </button>

                {/* Campaigns submenu */}
                {item.id === "campaigns" && campaignsExpanded && (
                  <ul className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                    <li>
                      <button
                        onClick={() => {
                          onTabChange("campaigns");
                          router.push("/?tab=campaigns");
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
                      >
                        View All
                      </button>
                    </li>
                    {loadingCampaigns ? (
                      <li className="px-3 py-1.5 text-sm text-gray-400">Loading...</li>
                    ) : (
                      groupedCampaigns.slice(0, 6).map((group) => (
                        <li key={group.monthKey}>
                          <button
                            onClick={() => handleMonthClick(group.monthKey)}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
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

      {/* Bottom section */}
      <div className="border-t">
        {/* Settings */}
        <button
          onClick={() => router.push("/account")}
          className="w-full flex items-center gap-3 px-6 py-3 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
