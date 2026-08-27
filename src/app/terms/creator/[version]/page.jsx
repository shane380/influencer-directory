import { notFound, redirect } from 'next/navigation'
import TermsShell from '@/components/terms/terms-shell'
import { CREATOR_TERMS_COMPONENTS } from '../versions/registry'
import {
  CREATOR_TERMS_CURRENT,
  CREATOR_TERMS_VERSIONS,
  isKnownCreatorTermsVersion,
} from '@/lib/terms/versions'

// Archived terms. Public (the /terms prefix is whitelisted in middleware) so an
// acceptance record can always be resolved back to the text that was accepted.
export default async function CreatorTermsVersionPage({ params }) {
  const { version } = await params

  if (!isKnownCreatorTermsVersion(version)) notFound()
  // The current version has one canonical home; don't serve it from two URLs.
  if (version === CREATOR_TERMS_CURRENT) redirect('/terms/creator')

  return (
    <TermsShell
      Doc={CREATOR_TERMS_COMPONENTS[version]}
      isSuperseded
      currentHref="/terms/creator"
      currentLabel={CREATOR_TERMS_VERSIONS[CREATOR_TERMS_CURRENT].effective}
    />
  )
}
