import type { Metadata } from "next";

// The gift page is public and gets shared in DMs/emails — its link preview
// must read as an invite, not as the internal dashboard.
export const metadata: Metadata = {
  title: "Nama Campaign Invite",
  description: "Pick your pieces from Nama's latest collection — on us.",
  openGraph: {
    title: "Nama Campaign Invite",
    description: "Pick your pieces from Nama's latest collection — on us.",
    siteName: "Nama",
  },
  twitter: {
    card: "summary",
    title: "Nama Campaign Invite",
    description: "Pick your pieces from Nama's latest collection — on us.",
  },
};

export default function GiftLayout({ children }: { children: React.ReactNode }) {
  return children;
}
