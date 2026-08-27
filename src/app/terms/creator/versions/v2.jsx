import { TERMS_CSS } from '@/components/terms/terms-css'

// Current Creator Terms of Use. Supersedes v1: the Affiliate Program Terms &
// Conditions are folded in as section 13 (previously a separate document), the
// old standalone "Affiliate Codes & Discount Links" clause is dropped as fully
// covered by 13.4/13.5/13.8/13.9, and payment moves from the 5th to the end of
// the following calendar month for all partner payments.
//
// Frozen once anyone has accepted it -- publish changes as v3, never edit here.
export default function CreatorTermsV2() {
  return (
    <>
      <style>{TERMS_CSS}</style>

      <div className="ct-title">Creator Terms of Use</div>
      <div className="ct-meta">Namastetics Inc. (&ldquo;Nama&rdquo;) &middot; Last Updated: August 2026</div>

      <div className="ct-body" style={{ marginBottom: 32 }}>
        <p>By creating a Nama Partners account, you agree to these Creator Terms of Use. These terms apply to all creators participating in the Nama Partners program, regardless of partnership structure. Section 13 applies additionally to partnerships that include an affiliate component.</p>
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
        <div className="ct-section-title">6. Payment Terms</div>
        <div className="ct-body">
          <p>All payments are made by the end of the following calendar month via your selected payment method (PayPal or bank transfer). This allows time for returns, refunds, cancellations, and other adjustments to be properly accounted for before payment. For example, amounts earned in August are paid by September 30. You are responsible for providing accurate payment information and for any taxes owed on payments received. Nama does not withhold taxes on creator payments.</p>
          <p>Minimum payout thresholds, if applicable, are specified in your Partnership Terms.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">7. Confidentiality</div>
        <div className="ct-body">
          <p>The financial terms of your partnership (including retainer amounts, commission rates, and ad spend percentages) are confidential. You agree not to disclose these terms publicly or to other creators without Nama&apos;s written consent.</p>
          <p>This does not restrict you from discussing your general experience as a Nama partner or from making required advertising disclosures.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">8. Termination</div>
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
        <div className="ct-section-title">9. Limitation of Liability</div>
        <div className="ct-body">
          <p>To the fullest extent permitted by law, Nama&apos;s total liability to you in connection with the partnership program shall not exceed the total payments made to you in the three (3) months preceding the claim. Nama is not liable for indirect, incidental, or consequential damages.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">10. Modifications</div>
        <div className="ct-body">
          <p>Nama may update these Creator Terms of Use from time to time. Material changes will be communicated via email or through the Nama Partners dashboard. Continued participation in the program after changes take effect constitutes acceptance.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">11. Governing Law</div>
        <div className="ct-body">
          <p>These terms are governed by the laws of the Province of Ontario, Canada. Any disputes will be resolved in the courts of Ontario.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">12. Contact</div>
        <div className="ct-body">
          <p>For questions about these terms, contact your dedicated Nama partner contact or email <a href="mailto:partners@namaclo.com">partners@namaclo.com</a>.</p>
        </div>
      </div>

      <div className="ct-section">
        <div className="ct-section-title">13. Affiliate Program Terms &amp; Conditions</div>
        <div className="ct-body" style={{ marginBottom: 24 }}>
          <p>This section applies only to partnerships that include an affiliate component. Where it differs from the general terms above, this section governs for affiliate activity.</p>
        </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.1 Program Overview</div>
        <div className="ct-body">
          <p>The Nama Affiliate Program (&ldquo;Program&rdquo;) allows approved partners (&ldquo;Affiliates&rdquo; or &ldquo;Partners&rdquo;) to earn commission on eligible purchases made through their approved affiliate link or personal discount code.</p>
          <p>By participating in the Program, you agree to these Terms &amp; Conditions. Nama reserves the right to approve, reject, suspend, or remove any Affiliate from the Program at its discretion.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.2 Affiliate Discount &amp; Commission</div>
        <div className="ct-body">
          <p>The standard Nama Affiliate Program structure is:</p>
          <ul>
            <li>15% off for the Affiliate&apos;s audience using their personal affiliate code.</li>
            <li>10% commission on eligible purchases attributed to the Affiliate.</li>
            <li>Commission is calculated on the net order value, excluding taxes, shipping, duties, discounts, refunds, cancellations, and other excluded amounts.</li>
            <li>Commission is only earned on eligible transactions that comply with these Terms &amp; Conditions.</li>
          </ul>
          <p>Nama reserves the right to modify commission rates, discount amounts, or other Program benefits with reasonable notice.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.3 Payment Terms</div>
        <div className="ct-body">
          <p>Affiliate commissions are paid monthly, by the end of the following calendar month. This allows time for returns, refunds, cancellations, and other adjustments to be properly accounted for before payment. For example, commissions earned in August will be paid by September 30.</p>
          <p>Transactions that remain under review for fraud, attribution issues, code misuse, returns, refunds, or other eligibility concerns may be held until the review is completed.</p>
          <p>Affiliates are responsible for maintaining accurate and current payment information. Nama is not responsible for payment delays resulting from incomplete or incorrect information provided by the Affiliate.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.4 Affiliate Code Usage</div>
        <div className="ct-body">
          <p>Each Affiliate will receive a unique discount code intended for use by their audience.</p>
          <ul>
            <li>Affiliate codes are intended for organic promotional activity by the Affiliate.</li>
            <li>Each customer may use an Affiliate code one time only.</li>
            <li>Affiliates may not use their own Affiliate code to generate commission on personal purchases.</li>
            <li>Affiliates may not create, purchase, distribute, or promote unauthorized variations of their code.</li>
            <li>Affiliates may not represent their code as a sitewide Nama promotion or official Nama discount beyond the terms provided by Nama.</li>
          </ul>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.5 Unauthorized Distribution &amp; Leaked Codes</div>
        <div className="ct-body">
          <p>Affiliate codes are personal promotional codes and should not be submitted to or distributed through coupon, discount, deal, cashback, or affiliate-code aggregation websites without prior written approval from Nama.</p>
          <p>Nama reserves the right to exclude transactions that result from unauthorized use, distribution, publication, or placement of an Affiliate code.</p>
          <p>If an Affiliate code is leaked, publicly distributed, misused, or otherwise compromised, Nama reserves the right to deactivate, replace, or change the code at any time.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.6 Attribution</div>
        <div className="ct-body">
          <p>Affiliate-link attribution is subject to a 30-day tracking window from the customer&apos;s initial qualifying click, subject to Nama&apos;s affiliate tracking platform and these Terms &amp; Conditions.</p>
          <p>Tracking or attribution by Nama&apos;s affiliate platform does not, by itself, guarantee that a transaction is eligible for commission.</p>
          <p>Nama reserves the right to review, investigate, and adjust transactions where there is evidence of:</p>
          <ul>
            <li>Unauthorized code use</li>
            <li>Code leakage or public distribution</li>
            <li>Fraudulent or suspicious activity</li>
            <li>Self-referrals</li>
            <li>Duplicate attribution</li>
            <li>Returns or cancellations</li>
            <li>Misuse of the Affiliate code or link</li>
            <li>Nama-funded paid advertising</li>
            <li>Any other activity that does not represent genuine Affiliate-driven sales</li>
          </ul>
          <p>Where multiple Affiliates, codes, links, marketing channels, or other sources may have contributed to a transaction, Nama&apos;s tracking records and attribution rules will determine commission eligibility.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.7 Paid Advertising &amp; Affiliate Attribution</div>
        <div className="ct-body">
          <p>Affiliate commissions are intended to compensate Affiliates for eligible sales generated through the Affiliate&apos;s own approved promotional activity.</p>
          <p>Unless expressly approved in writing by Nama, Affiliates may not use their affiliate code or affiliate link in paid advertising, boosted posts, sponsored placements, paid search, paid social, retargeting, or other paid media.</p>
          <p>Sales generated through advertising paid for or managed by Nama, its agencies, or its advertising partners are not eligible for Affiliate commission unless Nama expressly agrees otherwise in writing. This applies even where an Affiliate&apos;s content, name, affiliate code, or affiliate link appears in the advertisement or advertising creative.</p>
          <p>Where Nama separately licenses or receives permission to use Affiliate content for paid advertising, whitelisting, boosting, or other paid media, the applicable content or usage agreement will govern those usage rights. Unless expressly agreed otherwise, sales generated through such Nama-funded paid media are not eligible for Affiliate commission.</p>
          <p>Nama may remove, replace, suppress, or otherwise exclude an Affiliate code or link from paid media and may adjust commissions incorrectly attributed to Nama-funded advertising.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.8 Returns, Cancellations &amp; Ineligible Transactions</div>
        <div className="ct-body">
          <p>Commission will not be paid on cancelled, returned, refunded, fraudulent, or otherwise ineligible orders. Commission is not earned on:</p>
          <ul>
            <li>Cancelled, returned, refunded, or charged-back purchases</li>
            <li>The refunded portion of partially returned orders</li>
            <li>Fraudulent or suspicious transactions</li>
            <li>Self-referrals</li>
            <li>Gift card purchases</li>
            <li>Free products or zero-value orders</li>
            <li>Replacement or reshipment orders</li>
            <li>Wholesale or B2B purchases</li>
            <li>Test orders</li>
            <li>Transactions generated through unauthorized paid advertising</li>
            <li>Transactions resulting from unauthorized code distribution or coupon websites</li>
            <li>Sales generated through Nama-funded paid media unless expressly approved otherwise</li>
            <li>Any transaction Nama reasonably determines does not represent a genuine Affiliate-driven retail sale</li>
          </ul>
          <p>If commission has already been paid on an order that is subsequently returned, refunded, cancelled, charged back, or determined to be ineligible, Nama reserves the right to deduct the corresponding commission from future payments.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.9 Self-Referrals</div>
        <div className="ct-body">
          <p>Affiliates may not use their own Affiliate code or link to generate commission on their own purchases.</p>
          <p>Affiliates may not use their code to generate commission on purchases made by individuals where the primary purpose is to artificially generate Affiliate earnings.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.10 Promotion Guidelines</div>
        <div className="ct-body">
          <p>Affiliates agree to promote Nama in a truthful and authentic manner and must not make false or misleading claims about Nama, its products, pricing, promotions, or available discounts.</p>
          <p>Affiliates may not purchase Nama-related keywords for paid search or impersonate Nama without written approval.</p>
          <p>Affiliates may not engage in promotional activity that is misleading, deceptive, fraudulent, unlawful, or reasonably likely to harm Nama, its customers, or its reputation.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.11 Content &amp; Paid Usage</div>
        <div className="ct-body">
          <p>Participation in the Affiliate Program does not automatically grant Nama rights to use an Affiliate&apos;s content for paid advertising, whitelisting, or other commercial purposes.</p>
          <p>Any paid usage, whitelisting, licensing, boosting, or other commercial use of Affiliate content by Nama will be subject to a separate agreement between Nama and the Affiliate.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.12 Disclosure Requirements</div>
        <div className="ct-body">
          <p>Affiliates must clearly and conspicuously disclose their relationship with Nama whenever promoting Nama products through an Affiliate link or discount code, including that they may receive commission from qualifying purchases.</p>
          <p>Disclosures must comply with applicable advertising, endorsement, influencer-marketing, and consumer-protection requirements.</p>
          <p>A Nama tag, affiliate link, or personalized discount code alone should not be relied upon as the sole disclosure of the Affiliate&apos;s financial relationship with Nama.</p>
          <p>Nama may request that an Affiliate correct, update, or remove promotional content that does not comply with these requirements.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.13 Program Changes</div>
        <div className="ct-body">
          <p>Nama reserves the right to modify, suspend, or terminate the Affiliate Program, including changes to commission rates, discount amounts, eligibility requirements, attribution rules, payment terms, and Affiliate benefits.</p>
          <p>Nama will provide reasonable notice of material changes where appropriate.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.14 Termination</div>
        <div className="ct-body">
          <p>Nama may suspend or terminate an Affiliate&apos;s participation if the Affiliate violates these Terms &amp; Conditions, misuses an Affiliate code or link, engages in fraudulent or suspicious activity, distributes a code through unauthorized channels, or engages in conduct that may negatively impact Nama or its customers.</p>
          <p>Upon termination, the Affiliate will only be eligible for commission on qualifying transactions completed prior to termination, subject to any applicable return/refund period and these Terms &amp; Conditions.</p>
          <p>Nama reserves the right to withhold unpaid commissions associated with transactions determined to be fraudulent, improperly attributed, or otherwise ineligible under these Terms &amp; Conditions.</p>
        </div>
      </div>

      <div className="ct-sub">
        <div className="ct-sub-title">13.15 Governing Law</div>
        <div className="ct-body">
          <p>These Terms &amp; Conditions and participation in the Nama Affiliate Program will be governed by the laws of the Province of Ontario and the applicable federal laws of Canada.</p>
          <p>Any dispute arising from the Program or these Terms &amp; Conditions will be subject to the jurisdiction of the courts located in Ontario, Canada.</p>
        </div>
      </div>
      </div>
    </>
  )
}
