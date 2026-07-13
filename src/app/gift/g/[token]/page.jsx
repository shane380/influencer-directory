'use client'

import { useParams } from 'next/navigation'
import GiftPageClient from '../../gift-page-client'

// Campaign-level open link — no influencer record required; submissions
// match-or-create records server-side.
export default function GenericGiftPage() {
  const params = useParams()
  return <GiftPageClient token={String(params?.token || '')} generic />
}
