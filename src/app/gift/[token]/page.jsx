'use client'

import { useParams } from 'next/navigation'
import GiftPageClient from '../gift-page-client'

export default function GiftPage() {
  const params = useParams()
  return <GiftPageClient token={String(params?.token || '')} />
}
