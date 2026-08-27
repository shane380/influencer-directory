import CreatorTermsV1 from './v1'
import CreatorTermsV2 from './v2'

// Keyed by the version strings in src/lib/terms/versions.ts. An entry here must
// never be removed -- acceptance rows point at these versions by name.
export const CREATOR_TERMS_COMPONENTS = {
  v1: CreatorTermsV1,
  v2: CreatorTermsV2,
}
