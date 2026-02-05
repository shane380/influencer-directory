import { PaidCollabContractVariables } from "@/types/database";

export function renderPaidCollabContract(vars: PaidCollabContractVariables): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
      max-width: 8.5in;
      margin: 0 auto;
      padding: 0.75in;
    }
    h1 {
      text-align: center;
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 0.5in;
    }
    .date-line {
      text-align: center;
      font-weight: bold;
      margin-bottom: 0.3in;
      padding-top: 0.2in;
      border-top: 1px solid #000;
    }
    .party {
      margin-bottom: 0.2in;
    }
    .party-name {
      font-weight: bold;
    }
    h2 {
      font-size: 11pt;
      font-weight: bold;
      text-decoration: underline;
      margin-top: 0.3in;
      margin-bottom: 0.15in;
    }
    ul {
      margin: 0.1in 0;
      padding-left: 0.4in;
    }
    li {
      margin-bottom: 0.05in;
    }
    .signature-section {
      margin-top: 0.5in;
      page-break-inside: avoid;
    }
    .signature-block {
      margin-top: 0.3in;
    }
    .signature-line {
      border-bottom: 1px solid #000;
      width: 3in;
      margin: 0.3in 0 0.05in 0;
    }
    .signature-image {
      height: 100px;
      margin: 0.1in 0;
    }
    .signature-name {
      margin-top: 0.1in;
    }
  </style>
</head>
<body>
  <h1>TALENT COLLABORATION AGREEMENT</h1>

  <div class="date-line">Effective Date: ${vars.effective_date}</div>

  <p>This Agreement is entered into by and between:</p>

  <div class="party">
    <p><span class="party-name">NAMA</span> ("Brand")<br>
    Contact: Shane Petersen<br>
    Email: shane@namaclo.com</p>
  </div>

  <p>and</p>

  <div class="party">
    <p><span class="party-name">${vars.talent_name}</span> ("Talent")${vars.talent_representative ? `<br>Represented by: ${vars.talent_representative}` : ''}</p>
  </div>

  <h2>1. SCOPE OF WORK</h2>
  <p>The Talent agrees to create and publish the following content ("Deliverables"):</p>
  <ul>
    <li>${vars.deliverables}</li>
  </ul>

  <h2>2. COMPENSATION</h2>
  <p><strong>Total Fee:</strong> ${vars.total_fee}${vars.fee_additions ? ` ${vars.fee_additions}` : ''}</p>
  <p><strong>Total Amount Due:</strong> ${vars.total_amount_due}</p>
  <p>Payment Terms:</p>
  <ul>
    <li>${vars.payment_1_percent} (${vars.payment_1_amount}) ${vars.payment_1_condition}</li>
    <li>${vars.payment_2_percent} (${vars.payment_2_amount}) ${vars.payment_2_condition}</li>
  </ul>

  <h2>3. TIMELINE</h2>
  <ul>
    <li>Product shipment: Within 2–3 days of execution</li>
    <li>Outfit selection: Before shipment</li>
    <li>Content creation & approval: Per mutual agreement</li>
    <li>Publication: Within 7 days of receiving the product</li>
  </ul>

  <h2>4. CONTENT REQUIREMENTS</h2>
  <ul>
    <li>Must include @nama and any required hashtags</li>
    <li>Must include links where requested/relevant</li>
    <li>Talent maintains creative control but must follow brand guidelines</li>
    <li>Brand may request reasonable revisions to ensure brand alignment</li>
  </ul>

  <h2>5. USAGE RIGHTS</h2>
  <p>The following rights are included in the compensation:</p>
  <ul>
    <li>Organic digital & social media usage: ${vars.usage_rights_duration}</li>
    <li>Instagram collaborative post rights (included at no additional fee)</li>
  </ul>

  <h2>6. CONTENT APPROVAL</h2>
  <ul>
    <li>Brand may review content prior to posting</li>
    <li>Brand will provide feedback within 24 hours of receiving content for review</li>
    <li>Talent will make reasonable efforts to accommodate revision requests</li>
    <li>Final approval required before posting</li>
  </ul>

  <h2>7. PRODUCT</h2>
  <ul>
    <li>Brand provides the product from the chosen collection as agreed upon</li>
    <li>Talent selects the product before shipment</li>
    <li>Product becomes property of Talent after deliverables are completed</li>
  </ul>

  <h2>8. REPRESENTATIONS & WARRANTIES</h2>
  <p>Both parties represent and warrant that:</p>
  <ul>
    <li>They have the full right and authority to enter into this Agreement</li>
    <li>The content will not infringe third-party rights</li>
    <li>All content will be original work created specifically for this collaboration</li>
    <li>Talent has the right to grant all rights specified herein</li>
  </ul>

  <h2>9. TERMINATION</h2>
  <p>Either party may terminate if the other materially breaches. The brand may seek a remedy in the event of a Talent breach after payment.</p>

  <h2>10. CONFIDENTIALITY</h2>
  <p>Both parties agree to keep confidential all proprietary information, including rates, terms, and unreleased product details.</p>

  <h2>11. INDEMNIFICATION</h2>
  <p>Each party agrees to indemnify and hold the other harmless from claims arising from breach or negligence.</p>

  <h2>12. ENTIRE AGREEMENT</h2>
  <p>This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements. Any modifications must be made in writing and signed by both parties.</p>

  <div class="signature-section">
    <h2 style="text-decoration: underline;">ACCEPTANCE</h2>

    <div class="signature-block">
      <p>For NAMA:</p>
      <img src="/signature-shane.png" alt="Shane Petersen Signature" class="signature-image" />
      <p class="signature-name">Shane Petersen<br>Date: ${vars.effective_date}</p>
    </div>

    <div class="signature-block">
      <p>For ${vars.talent_name}:</p>
      <div class="signature-line"></div>
      <p class="signature-name">${vars.talent_signatory_name}<br>Date: ___________________</p>
    </div>
  </div>
</body>
</html>
`;
}
