import { TERMS_CSS, TERMS_SUPERSEDED_CSS } from './terms-css'

// Page chrome shared by every terms document. The document text itself lives
// in its own versions/<version>.jsx component so the same component can be
// embedded in the dashboard acceptance gate without duplicating a word of it.
export default function TermsShell({ Doc, isSuperseded, currentHref, currentLabel }) {
  return (
    <div className="ct-page">
      <style>{TERMS_CSS}</style>
      <style>{TERMS_SUPERSEDED_CSS}</style>

      <a href="javascript:history.back()" className="ct-back">&larr; Back</a>

      <div className="ct-logo-lockup">
        <img src="/nama-logo.svg" alt="Nama" className="ct-logo" />
        <div className="ct-logo-sub">Partners</div>
      </div>

      {isSuperseded && (
        <div className="ct-superseded">
          This is an archived version, kept available because partners accepted it. It has
          been superseded &mdash; the terms in force are the{' '}
          <a href={currentHref}>current version ({currentLabel})</a>.
        </div>
      )}

      <Doc />
    </div>
  )
}
