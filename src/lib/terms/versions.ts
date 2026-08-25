// Single source of truth for which terms document is current.
//
// One document, creator-terms, covers every partner. The Affiliate Program
// Terms & Conditions are section 13 of it rather than a separate document, so
// an affiliate agrees to one thing and the ledger holds one row.
//
// Every acceptance in `creator_terms_acceptances` names a version, so a
// superseded version must never be deleted or reworded -- the row is only
// meaningful if the text it points at still exists. To publish new terms: add a
// version entry, add the matching component under
// src/app/terms/creator/versions/, and move CREATOR_TERMS_CURRENT.

export const CREATOR_TERMS_KEY = 'creator-terms';
export const CREATOR_TERMS_CURRENT = 'v2';

export const CREATOR_TERMS_VERSIONS: Record<string, { effective: string }> = {
  v1: { effective: 'March 2026' },
  v2: { effective: 'August 2026' },
};

export function isKnownCreatorTermsVersion(version: string): boolean {
  return version in CREATOR_TERMS_VERSIONS;
}

/** The current version lives at /terms/creator; superseded ones at /terms/creator/<version>. */
export function creatorTermsPath(version: string): string {
  return version === CREATOR_TERMS_CURRENT
    ? '/terms/creator'
    : `/terms/creator/${version}`;
}
