const CSS = `
.ct-page { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111; max-width: 680px; margin: 0 auto; padding: 56px 32px 80px; min-height: 100vh; background: white; }
@media (max-width: 768px) { .ct-page { padding: 40px 24px 64px; } }
.ct-back { font-size: 12px; color: #999; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; margin-bottom: 40px; }
.ct-back:hover { color: #333; }
.ct-logo-lockup { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; margin-bottom: 40px; }
.ct-logo { height: 28px; display: block; }
.ct-logo-sub { font-size: 8.5px; letter-spacing: 0.4em; text-transform: uppercase; color: #aaa; }
.ct-title { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 300; color: #111; line-height: 1.1; margin-bottom: 8px; }
@media (max-width: 768px) { .ct-title { font-size: 30px; } }
.ct-meta { font-size: 12px; color: #999; margin-bottom: 40px; }
.ct-section { margin-bottom: 32px; }
.ct-section-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 400; color: #111; margin-bottom: 12px; }
.ct-body { font-size: 14px; color: #555; font-weight: 300; line-height: 1.85; }
.ct-body p { margin-bottom: 12px; }
.ct-body p:last-child { margin-bottom: 0; }
.ct-body ul { margin: 8px 0 12px 20px; }
.ct-body li { margin-bottom: 6px; }
.ct-body a { color: #333; text-decoration: underline; text-underline-offset: 2px; }
.ct-body a:hover { color: #111; }
.ct-divider { height: 1px; background: #ebebeb; margin: 32px 0; }
`

export default function CreatorTermsPage() {
  return (
    <div className="ct-page">
      <style>{CSS}</style>

      <a href="javascript:history.back()" className="ct-back">&larr; Back</a>

      <div className="ct-logo-lockup">
        <img src="/nama-logo.svg" alt="Nama" className="ct-logo" />
        <div className="ct-logo-sub">Partners</div>
      </div>

      <div className="ct-title">Creator Terms of Use</div>
      <div className="ct-meta">Namastetics Inc. (&ldquo;Nama&rdquo;) &middot; Last Updated: March 2026</div>

      <div className="ct-body" style={{ marginBottom: 32 }}>
        <p>By creating a Nama Partners account, you agree to these Creator Terms of Use. These terms apply to all creators participating in the Nama Partners program, regardless of partnership structure.</p>
      </div>

      <div className="ct-divider" />

      <div className="ct-section">
        <div className="ct-section-title">1. Eligibility</div>
        <div className="ct-body">
          <p>You must be at least 18 years old and legally able to enter into binding agreements. You represent that all information provided during account creation is accurate and complete.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">2. Account Responsibilities</div>
        <div className="ct-body">
          <p>You are responsible for maintaining the security of your Nama Partners account credentials. You must not share your account access with any third party. You agree to notify Nama promptly of any unauthorized use of your account.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">3. Content Standards</div>
        <div className="ct-body">
          <p>All content created under this partnership must:</p>
          <ul>
            <li>Be original and created by you</li>
            <li>Comply with applicable advertising disclosure laws, including FTC guidelines (e.g., #ad, #sponsored, or platform-native disclosure tools)</li>
            <li>Not contain content that is defamatory, discriminatory, obscene, or otherwise harmful</li>
            <li>Not infringe on any third party&apos;s intellectual property rights</li>
            <li>Accurately represent the Nama products featured</li>
          </ul>
          <p>Nama reserves the right to request removal of content that violates these standards.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">4. Content Ownership &amp; Usage Rights</div>
        <div className="ct-body">
          <p>All content deliverables produced under this partnership are owned by Nama upon submission. Nama has the perpetual right to use, edit, and distribute this content across all channels. You retain the right to display the content on your personal social media accounts and portfolio.</p>
          <p>Specific usage terms for your partnership are detailed in your Partnership Terms.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">5. Whitelisting &amp; Content Usage</div>
        <div className="ct-body">
          <p>If your partnership includes whitelisting:</p>
          <ul>
            <li>You agree to maintain advertising account access and permissions for the duration of the partnership</li>
            <li>All advertising spend on whitelisted content is covered by Nama</li>
            <li>You grant Nama the right to post content to Nama&apos;s own organic channels (Instagram, TikTok, email, website) at any time, without prior approval</li>
            <li>Revoking ad account access is not an alternative to the standard termination process — you must provide the notice period specified in your Partnership Terms</li>
            <li>Upon termination, Nama will remove ad account access and whitelisting permissions within seven (7) days</li>
            <li>Nama&apos;s right to use submitted content on its own organic channels, website, and marketing materials survives termination indefinitely, per the content ownership terms above</li>
          </ul>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">6. Affiliate Codes &amp; Discount Links</div>
        <div className="ct-body">
          <p>If your partnership includes an affiliate component:</p>
          <ul>
            <li>Your unique code or link is for personal promotion only and must not be distributed on coupon aggregator sites, deal forums, browser extensions, or similar platforms</li>
            <li>You are responsible for making reasonable efforts to prevent unauthorized distribution of your code</li>
            <li>Nama reserves the right to modify or deactivate your code if it appears on unauthorized platforms</li>
            <li>Commissions are calculated on completed sales only; returned, refunded, or cancelled orders are excluded</li>
            <li>Nama reserves the right to withhold or reverse commissions on fraudulent, self-referred, or otherwise ineligible transactions</li>
          </ul>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">7. Payment Terms</div>
        <div className="ct-body">
          <p>All payments are made by the 5th of the following month via your selected payment method (PayPal or bank transfer). You are responsible for providing accurate payment information and for any taxes owed on payments received. Nama does not withhold taxes on creator payments.</p>
          <p>Minimum payout thresholds, if applicable, are specified in your Partnership Terms.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">8. Confidentiality</div>
        <div className="ct-body">
          <p>The financial terms of your partnership (including retainer amounts, commission rates, and ad spend percentages) are confidential. You agree not to disclose these terms publicly or to other creators without Nama&apos;s written consent.</p>
          <p>This does not restrict you from discussing your general experience as a Nama partner or from making required advertising disclosures.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">9. Termination</div>
        <div className="ct-body">
          <p>Either party may end the partnership in accordance with the notice period specified in your Partnership Terms. Upon termination:</p>
          <ul>
            <li>Outstanding payments for completed work will be paid on the next regular payment cycle</li>
            <li>Your affiliate code will be deactivated</li>
            <li>Nama retains ownership of all content deliverables submitted during the partnership</li>
            <li>Your Nama Partners dashboard access will be deactivated</li>
          </ul>
          <p>Nama reserves the right to terminate a partnership immediately if a creator materially breaches these terms or their Partnership Terms.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">10. Limitation of Liability</div>
        <div className="ct-body">
          <p>To the fullest extent permitted by law, Nama&apos;s total liability to you in connection with the partnership program shall not exceed the total payments made to you in the three (3) months preceding the claim. Nama is not liable for indirect, incidental, or consequential damages.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">11. Modifications</div>
        <div className="ct-body">
          <p>Nama may update these Creator Terms of Use from time to time. Material changes will be communicated via email or through the Nama Partners dashboard. Continued participation in the program after changes take effect constitutes acceptance.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">12. Governing Law</div>
        <div className="ct-body">
          <p>These terms are governed by the laws of the Province of Ontario, Canada. Any disputes will be resolved in the courts of Ontario.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">13. Contact</div>
        <div className="ct-body">
          <p>For questions about these terms, contact your dedicated Nama partner contact or email <a href="mailto:partners@namaclo.com">partners@namaclo.com</a>.</p>
        </div>
      </div>
    </div>
  )
}
