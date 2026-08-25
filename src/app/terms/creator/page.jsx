import TermsShell from '@/components/terms/terms-shell'
import { CREATOR_TERMS_COMPONENTS } from './versions/registry'
import { CREATOR_TERMS_CURRENT } from '@/lib/terms/versions'

// Always serves whichever version is current. Superseded versions stay
// readable at /terms/creator/<version>.
export default function CreatorTermsPage() {
  return <TermsShell Doc={CREATOR_TERMS_COMPONENTS[CREATOR_TERMS_CURRENT]} isSuperseded={false} />
}
