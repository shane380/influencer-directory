'use client'

import { useParams } from 'next/navigation'
import GiftPageClient from '../../gift-page-client'

// Staff preview of a campaign's selects page. The shell is public (under
// /gift/), but its data route /api/gift/preview is admin/manager-only.
export default function GiftPreviewPage() {
  const params = useParams()
  return <GiftPageClient token={String(params?.campaignId || '')} preview />
}
