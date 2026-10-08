"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Campaign } from "@/types/database";
import {
  Users,
  Gift,
  DollarSign,
  Share2,
  Heart,
  CreditCard,
  ChevronDown,
  ChevronRight,
  User,
  HelpCircle,
  LogOut,
  Bell,
  Settings,
  Megaphone,
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
    isManager: boolean;
  } | null;
  onLogout: () => void;
}

interface GroupedCampaigns {
  monthKey: string;
  label: string;
  campaigns: Campaign[];
}

export function Sidebar({ activeTab, onTabChange, currentUser, onLogout }: SidebarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [giftingExpanded, setGiftingExpanded] = useState(false);
  const [campaignsExpanded, setCampaignsExpanded] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [partnersExpanded, setPartnersExpanded] = useState(false);
  const [adsExpanded, setAdsExpanded] = useState(false);
  const [groupedCampaigns, setGroupedCampaigns] = useState<GroupedCampaigns[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pendingCodeRequests, setPendingCodeRequests] = useState(0);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    type?: "content_submission" | "outfit_request" | "ad_approval" | "ad_feedback" | "gift_selects" | "whitelisting_expiring" | "whitelisting_expired";
    creator_name: string;
    creator_id?: string;
    influencer_id?: string | null;
    month?: string;
    file_count?: number;
    campaign_id?: string;
    campaign_title?: string;
    product_count?: number;
    ad_name?: string;
    days_remaining?: number;
    expiry_date?: string | null;
    creator_handle?: string | null;
    created_at: string;
  }>>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  // Locally dismissed notifications (per browser) — the underlying items are
  // derived from pending states, so dismissing here just hides them for you.
  const [dismissedNotifs, setDismissedNotifs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem("nama_dismissed_notifs") || "[]"));
    } catch {
      return new Set();
    }
  });
  const dismissNotifs = (keys: string[]) => {
    setDismissedNotifs((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      try {
        // Cap so long-gone entries don't accumulate forever
        localStorage.setItem("nama_dismissed_notifs", JSON.stringify([...next].slice(-300)));
      } catch {}
      return next;
    });
  };
  const visibleNotifications = notifications.filter(
    (n) => !dismissedNotifs.has(`${n.type}:${n.id}`)
  );
  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  const supabase = createClient();

  // Auto-expand submenus when on a matching page
  useEffect(() => {
    if (pathname?.startsWith('/partnerships/creators') || pathname?.startsWith('/partnerships/campaigns') || pathname?.startsWith('/partnerships/affiliate-codes')) {
      setPartnersExpanded(true);
    }
    if (pathname?.startsWith('/gifting') || pathname?.startsWith('/campaigns')) {
      setGiftingExpanded(true);
    }
    if (pathname?.startsWith('/campaigns')) {
      setCampaignsExpanded(true);
    }
  }, [pathname]);

  // Auto-expand the month matching the current campaign/month page
  useEffect(() => {
    if (!pathname) return;
    const monthMatch = pathname.match(/^\/campaigns\/month\/([^/]+)/);
    if (monthMatch) {
      setExpandedMonth(monthMatch[1]);
      return;
    }
    const idMatch = pathname.match(/^\/campaigns\/([^/]+)/);
    if (idMatch && idMatch[1] !== 'month') {
      const group = groupedCampaigns.find((g) =>
        g.campaigns.some((c) => c.id === idMatch[1])
      );
      if (group) setExpandedMonth(group.monthKey);
    }
  }, [pathname, groupedCampaigns]);

  // Fetch campaigns for the sidebar
  useEffect(() => {
    async function fetchCampaigns() {
      setLoadingCampaigns(true);
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .in("status", ["planning", "active"])
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

  // Fetch pending code change request count
  useEffect(() => {
    async function fetchPendingRequests() {
      try {
        const res = await fetch("/api/admin/code-change-requests?count_only=true");
        const data = await res.json();
        setPendingCodeRequests(data.count || 0);
      } catch {}
    }
    fetchPendingRequests();
  }, []);

  // Fetch pending content submissions as notifications
  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await fetch("/api/admin/notifications");
        const data = await res.json();
        setNotifications(data.notifications || []);
      } catch {}
    }
    fetchNotifications();
    // Poll every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdowns and submenus when sidebar collapses
  useEffect(() => {
    if (!isHovered) {
      setUserMenuOpen(false);
      setNotifOpen(false);
    }
  }, [isHovered]);

  // Close on escape key
  // Reflect the current route in the nav: landing on an Ads page directly should
  // show its section already expanded, not collapsed.
  useEffect(() => {
    if (pathname?.startsWith("/ads")) setAdsExpanded(true);
  }, [pathname]);

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
    { id: "gifting", label: "Gifting/PR", icon: Gift, expandable: true },
    { id: "paid_collabs", label: "Paid Collabs", icon: DollarSign },
    { id: "whitelisting", label: "Whitelisting", icon: Share2 },
    { id: "ads", label: "Ads", icon: Megaphone, expandable: true },
    { id: "partners", label: "Partners", icon: Heart, expandable: true },
    // The old creator_payments page is retired from the menu (still reachable
    // by URL at /partnerships/payments while it winds down).
    { id: "payments_v2", label: "Payments", icon: CreditCard },
  ];

  const handleNavClick = (id: string) => {
    if (id === "gifting") {
      setGiftingExpanded(!giftingExpanded);
    } else if (id === "partners") {
      setPartnersExpanded(!partnersExpanded);
    } else if (id === "ads") {
      setAdsExpanded(!adsExpanded);
    } else if (id === "payments_v2") {
      router.push("/partnerships/payments-v2");
    } else {
      router.push(`/?tab=${id}`);
    }
  };

  const handleMonthClick = (e: React.MouseEvent, monthKey: string) => {
    e.stopPropagation();
    router.push(`/campaigns/month/${monthKey}`);
  };

  function getTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  // Labels, chevrons and badges are always in the DOM and fade with the rail's
  // width; toggling them off the hover state made them vanish the instant the
  // pointer left while the width was still easing.
  const fade = `transition-opacity duration-200 ${isHovered ? "opacity-100" : "opacity-0"}`;
  const fadeOut = `transition-opacity duration-200 ${isHovered ? "opacity-0" : "opacity-100"}`;

  // Sub-items read like Shopify's: plain text indented under the parent's
  // label (nav px-2 + item px-3 + 16px icon + gap-2 = 36px), no icon, no guide
  // line; the active one is a soft grey pill.
  const subItemClass = (active: boolean) =>
    `flex items-center w-full text-left pl-9 pr-3 h-8 rounded-md text-[13px] transition-colors ${
      active ? "bg-gray-100 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
    }`;

  return (
    <>
      {/* The rail is fixed and overlays the page; this spacer holds its 56px in
          the flow so expanding it never reflows the content behind it. */}
      <div className="w-14 flex-shrink-0" aria-hidden />
      <aside
        className={`${isHovered ? "w-56 shadow-xl" : "w-14"} fixed inset-y-0 left-0 z-50 bg-white border-r flex flex-col transition-[width] duration-200 ease-out overflow-hidden`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      {/* Logo / Title — the "P" sits centred in the rail and cross-fades with
          the full title as the rail widens. */}
      <div className="relative pl-5 pr-4 border-b h-[49px] flex items-center flex-shrink-0">
        <span
          className={`absolute inset-y-0 left-0 w-14 flex items-center justify-center text-base font-semibold text-gray-900 ${fadeOut}`}
          aria-hidden
        >
          P
        </span>
        <h1 className={`flex-1 min-w-0 text-base font-semibold text-gray-900 whitespace-nowrap overflow-hidden ${fade}`}>
          Partnerships
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id ||
              (item.id === "gifting" && (pathname?.startsWith("/gifting") || pathname?.startsWith("/campaigns"))) ||
              (item.id === "partners" && (pathname?.startsWith("/partnerships/creators") || pathname?.startsWith("/partnerships/campaigns") || pathname?.startsWith("/partnerships/affiliate-codes"))) ||
              (item.id === "ads" && pathname?.startsWith("/ads")) ||
              (item.id === "payments_v2" && pathname?.startsWith("/partnerships/payments"));

            const hasBadge = item.id === "influencers" && pendingCodeRequests > 0;
            const sectionExpanded =
              item.id === "gifting" ? giftingExpanded : item.id === "partners" ? partnersExpanded : item.id === "ads" ? adsExpanded : false;

            return (
              <li key={item.id}>
                {/* One constant padding: nav px-2 + px-3 + 16px icon centres the
                    icon in the 56px rail, so nothing shifts as the width eases. */}
                <button
                  onClick={() => handleNavClick(item.id)}
                  title={!isHovered ? item.label : undefined}
                  className={`w-full flex items-center justify-start gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="relative flex-shrink-0 flex items-center">
                    <Icon className="h-4 w-4" />
                    {hasBadge && (
                      <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ${fadeOut}`} />
                    )}
                  </span>
                  <span className={`flex-1 min-w-0 text-left overflow-hidden whitespace-nowrap ${fade}`}>
                    {item.label}
                  </span>
                  {hasBadge && (
                    <span className={`flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center px-1 ${fade}`}>
                      {pendingCodeRequests}
                    </span>
                  )}
                  {item.expandable && (
                    <ChevronRight
                      className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-[transform,opacity] duration-200 ${sectionExpanded ? "rotate-90" : ""} ${isHovered ? "opacity-100" : "opacity-0"}`}
                    />
                  )}
                </button>

                {/* Ads submenu */}
                {item.id === "ads" && (
                  <Collapsible open={isHovered && adsExpanded}>
                    <ul className="mt-0.5 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                      <li>
                        {/* Stays at /ads: notification deep links use /ads?review=1&draft=… */}
                        <Link
                          href="/ads"
                          onClick={(e) => e.stopPropagation()}
                          className={subItemClass(pathname === "/ads")}
                        >
                          <span className="whitespace-nowrap overflow-hidden">Ad Creator</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/ads/performance"
                          onClick={(e) => e.stopPropagation()}
                          className={subItemClass(!!pathname?.startsWith("/ads/performance"))}
                        >
                          <span className="whitespace-nowrap overflow-hidden">Ad Performance</span>
                        </Link>
                      </li>
                    </ul>
                  </Collapsible>
                )}

                {/* Partners submenu */}
                {item.id === "partners" && (
                  <Collapsible open={isHovered && partnersExpanded}>
                    <ul className="mt-0.5 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                      <li>
                        <Link
                          href="/partnerships/creators"
                          onClick={(e) => e.stopPropagation()}
                          className={subItemClass(
                            pathname === "/partnerships/creators" || !!pathname?.startsWith("/partnerships/creators/")
                          )}
                        >
                          <span className="whitespace-nowrap overflow-hidden">Partners</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/partnerships/campaigns"
                          onClick={(e) => e.stopPropagation()}
                          className={subItemClass(pathname === "/partnerships/campaigns")}
                        >
                          <span className="whitespace-nowrap overflow-hidden">Partner Campaigns</span>
                        </Link>
                      </li>
                      <li>
                        <Link
                          href="/partnerships/affiliate-codes"
                          onClick={(e) => e.stopPropagation()}
                          className={subItemClass(pathname === "/partnerships/affiliate-codes")}
                        >
                          <span className="whitespace-nowrap overflow-hidden">Code Leaks</span>
                        </Link>
                      </li>
                    </ul>
                  </Collapsible>
                )}

                {/* Gifting/PR submenu */}
                {item.id === "gifting" && (
                  <Collapsible open={isHovered && giftingExpanded}>
                    <ul className="mt-0.5 space-y-0.5" onClick={(e) => e.stopPropagation()}>
                      <li>
                        <Link
                          href="/gifting"
                          onClick={(e) => e.stopPropagation()}
                          className={subItemClass(pathname === "/gifting")}
                        >
                          <span className="whitespace-nowrap overflow-hidden">Dashboard</span>
                        </Link>
                      </li>
                      <li>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCampaignsExpanded(!campaignsExpanded);
                          }}
                          className={subItemClass(!!pathname?.startsWith("/campaigns"))}
                        >
                          <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden">Campaigns</span>
                          <ChevronRight
                            className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform duration-200 ${campaignsExpanded ? "rotate-90" : ""}`}
                          />
                        </button>
                        <Collapsible open={campaignsExpanded}>
                          <ul className="mt-0.5 space-y-0.5">
                            <li>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push("/?tab=campaigns");
                                }}
                                className={`${subItemClass(false)} pl-12`}
                              >
                                <span className="whitespace-nowrap overflow-hidden">View All</span>
                              </button>
                            </li>
                            {loadingCampaigns ? (
                              <li className="flex items-center pl-12 pr-3 h-8 text-[13px] text-gray-400">Loading...</li>
                            ) : (
                              groupedCampaigns.slice(0, 6).map((group) => {
                                const isExpanded = expandedMonth === group.monthKey;
                                const monthActive =
                                  pathname === `/campaigns/month/${group.monthKey}`;
                                return (
                                  <li key={group.monthKey}>
                                    <div
                                      className={`flex items-center h-8 rounded-md text-[13px] transition-colors ${
                                        monthActive
                                          ? "bg-gray-100 text-gray-900 font-medium"
                                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                                      }`}
                                    >
                                      <button
                                        onClick={(e) =>
                                          handleMonthClick(e, group.monthKey)
                                        }
                                        className="flex-1 min-w-0 h-full text-left pl-12 whitespace-nowrap overflow-hidden"
                                      >
                                        {group.label}
                                      </button>
                                      {group.campaigns.length > 0 && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedMonth(
                                              isExpanded ? null : group.monthKey
                                            );
                                          }}
                                          aria-label={
                                            isExpanded
                                              ? `Collapse ${group.label}`
                                              : `Expand ${group.label}`
                                          }
                                          className="h-full pl-1.5 pr-3 text-gray-400 hover:text-gray-700 flex-shrink-0 flex items-center"
                                        >
                                          <ChevronRight
                                            className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                                          />
                                        </button>
                                      )}
                                    </div>
                                    {group.campaigns.length > 0 && (
                                      <Collapsible open={isExpanded}>
                                        <ul className="mt-0.5 space-y-0.5">
                                          {group.campaigns.map((campaign) => (
                                            <li key={campaign.id}>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  router.push(
                                                    `/campaigns/${campaign.id}`
                                                  );
                                                }}
                                                className={`${subItemClass(pathname === `/campaigns/${campaign.id}`)} pl-[60px]`}
                                              >
                                                <span className="min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                                                  {campaign.name}
                                                </span>
                                              </button>
                                            </li>
                                          ))}
                                        </ul>
                                      </Collapsible>
                                    )}
                                  </li>
                                );
                              })
                            )}
                          </ul>
                        </Collapsible>
                      </li>
                    </ul>
                  </Collapsible>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Notifications — px-5 + 16px bell centres it in the rail. */}
      <div className="border-t relative flex-shrink-0" ref={notifRef}>
        <button
          onClick={() => setNotifOpen(!notifOpen)}
          title={!isHovered ? "Notifications" : undefined}
          className="w-full flex items-center justify-start gap-2 px-5 py-2.5 hover:bg-gray-50 transition-colors"
        >
          <span className="relative flex-shrink-0 flex items-center text-gray-600">
            <Bell className="h-4 w-4" />
            {visibleNotifications.length > 0 && (
              <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ${fadeOut}`} />
            )}
          </span>
          <span className={`flex-1 min-w-0 text-left text-sm text-gray-600 whitespace-nowrap overflow-hidden ${fade}`}>
            Notifications
          </span>
          {visibleNotifications.length > 0 && (
            <span className={`flex-shrink-0 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-medium flex items-center justify-center px-1 ${fade}`}>
              {visibleNotifications.length}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-1 mx-1.5 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-64 overflow-y-auto" style={{ minWidth: 220 }}>
            {visibleNotifications.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">No new notifications</div>
            ) : (
              <>
                {visibleNotifications.map((n) => {
                  const timeAgo = getTimeAgo(n.created_at);
                  let description = "";
                  if (n.type === "ad_approval") {
                    description = `Ad "${n.ad_name}" awaiting review · ${timeAgo}`;
                  } else if (n.type === "ad_feedback") {
                    description = `Changes requested on "${n.ad_name}" · ${timeAgo}`;
                  } else if (n.type === "outfit_request") {
                    description = `Requested ${n.product_count} item${n.product_count !== 1 ? "s" : ""} · ${timeAgo}`;
                  } else if (n.type === "whitelisting_expiring") {
                    const d = n.days_remaining ?? 0;
                    description = `Whitelisting term ends ${d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`} · ${n.expiry_date}`;
                  } else if (n.type === "whitelisting_expired") {
                    const d = Math.abs(n.days_remaining ?? 0);
                    description = `Whitelisting term ended ${d === 0 ? "today" : `${d} day${d !== 1 ? "s" : ""} ago`} · pause the ads or renew`;
                  } else if (n.type === "gift_selects") {
                    description = `Selected ${n.product_count} piece${n.product_count !== 1 ? "s" : ""} · ${n.campaign_title} · ${timeAgo}`;
                  } else {
                    const [yr, mo] = (n.month || "").split("-");
                    const monthLabel = yr && mo
                      ? new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("en", { month: "short" })
                      : "";
                    description = `Submitted ${n.file_count} file${n.file_count !== 1 ? "s" : ""} for ${monthLabel} · ${timeAgo}`;
                  }
                  return (
                    <div
                      key={`${n.type}:${n.id}`}
                      className="group flex items-start border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors"
                    >
                      <button
                        onClick={() => {
                          setNotifOpen(false);
                          if (n.type === "ad_approval" || n.type === "ad_feedback") {
                            router.push(`/ads?review=1&draft=${n.id}`);
                          } else if (n.type === "whitelisting_expiring" || n.type === "whitelisting_expired") {
                            router.push("/?tab=whitelisting");
                          } else if (n.type === "gift_selects" && n.campaign_id) {
                            router.push(`/campaigns/${n.campaign_id}`);
                          } else if (n.creator_id) {
                            router.push(`/partnerships/creators/${n.creator_id}`);
                          }
                        }}
                        className="flex-1 min-w-0 text-left px-3 py-2"
                      >
                        <div className="text-xs text-gray-800 font-medium">{n.creator_name}</div>
                        <div className="text-[11px] text-gray-500">{description}</div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dismissNotifs([`${n.type}:${n.id}`]);
                        }}
                        title="Dismiss"
                        className="px-2 py-2 text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => dismissNotifs(visibleNotifications.map((n) => `${n.type}:${n.id}`))}
                  className="w-full text-center px-3 py-1.5 text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
                >
                  Clear all
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* User section at bottom — px-3.5 + 28px avatar centres it in the rail. */}
      {currentUser && (
        <div className="border-t relative flex-shrink-0" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            title={!isHovered ? currentUser.displayName : undefined}
            className="w-full flex items-center justify-start gap-2 px-3.5 py-2.5 hover:bg-gray-50 transition-colors"
          >
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
            <span className={`flex-1 min-w-0 text-left text-sm font-medium text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis ${fade}`}>
              {currentUser.displayName}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-[transform,opacity] duration-200 ${userMenuOpen ? "rotate-180" : ""} ${isHovered ? "opacity-100" : "opacity-0"}`}
            />
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
              {(currentUser.isAdmin || currentUser.isManager) && (
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    router.push("/admin/settings");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Settings className="h-4 w-4 text-gray-400" />
                  App Settings
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
      </aside>
    </>
  );
}

/**
 * A section of sub-items that eases open and shut. The open height is measured
 * and kept in a CSS variable so the list slides closed as the rail narrows
 * (hover off) instead of dropping out the instant the pointer leaves. Nothing
 * is unmounted on close, so nested sections and route-driven state survive.
 */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
        open ? "max-h-[var(--open-h)]" : "max-h-0"
      }`}
      style={{ "--open-h": `${height}px` } as React.CSSProperties}
      aria-hidden={!open}
    >
      <div
        ref={contentRef}
        className={`transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      >
        {children}
      </div>
    </div>
  );
}
