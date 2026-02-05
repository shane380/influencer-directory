import { WhitelistingContractVariables } from "@/types/database";

export function renderWhitelistingContract(vars: WhitelistingContractVariables): string {
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
    .logo {
      text-align: center;
      font-family: 'Times New Roman', serif;
      font-size: 36pt;
      letter-spacing: 0.2em;
      margin-bottom: 0.2in;
    }
    h1 {
      text-align: center;
      font-size: 14pt;
      font-weight: bold;
      margin-bottom: 0.5in;
    }
    .intro {
      margin-bottom: 0.3in;
      padding-top: 0.2in;
      border-top: 1px solid #000;
    }
    .party {
      margin-bottom: 0.15in;
    }
    .party-name {
      font-weight: bold;
    }
    h2 {
      font-size: 14pt;
      font-weight: normal;
      margin-top: 0.4in;
      margin-bottom: 0.15in;
      padding-top: 0.15in;
      border-top: 1px solid #ccc;
    }
    ul {
      margin: 0.1in 0;
      padding-left: 0.4in;
    }
    li {
      margin-bottom: 0.08in;
    }
    .signature-section {
      margin-top: 0.5in;
      page-break-inside: avoid;
      padding-top: 0.2in;
      border-top: 1px solid #ccc;
    }
    .signature-block {
      margin-top: 0.3in;
    }
    .signature-line {
      border-bottom: 1px solid #000;
      width: 2.5in;
      margin: 0.2in 0 0.05in 0;
    }
    .signature-image {
      height: 50px;
      margin: 0.1in 0;
    }
  </style>
</head>
<body>
  <div class="logo">NAMA</div>
  <h1>Whitelisting Collaboration Agreement</h1>

  <div class="intro">
    <p><strong>This Agreement</strong> ("Agreement") is made and entered into on <strong>${vars.effective_date}</strong>, by and between:</p>

    <div class="party">
      <p><span class="party-name">Namastetics Inc.</span> ("Nama")<br>
      Contact: Shane Petersen, Founder<br>
      Email: shane@namaclo.com</p>
    </div>

    <p>and</p>

    <div class="party">
      <p><span class="party-name">${vars.talent_name}</span> ("Talent")<br>
      Email: ${vars.talent_email}</p>
    </div>

    <p>Collectively referred to as the "Parties."</p>
  </div>

  <h2>1. Overview</h2>
  <p>Talent grants Nama permission to use existing social media content featuring Nama products ("Approved Content") for paid advertising purposes ("Whitelisting") on Meta platforms (Instagram and Facebook).</p>

  <h2>2. Usage Rights</h2>
  <ul>
    <li>Nama is granted non-exclusive rights to run paid advertisements using Approved Content via Talent's handle and/or Nama's handle.</li>
    <li>Usage is limited to Meta platforms (Instagram and Facebook).</li>
    <li>Nama will share ad creative with Talent for approval prior to activation. Talent has 24 hours to respond with approval or requested changes. If no response is received within 24 hours, the ad will be considered approved.</li>
  </ul>

  <h2>3. Compensation & Payment Terms</h2>
  <p>In exchange for the rights granted, Talent will receive:</p>
  <ul>
    <li><strong>${vars.compensation}</strong></li>
  </ul>

  <h2>4. Usage Period & Renewal</h2>
  <ul>
    <li>This Agreement grants ongoing usage rights.</li>
    <li>Either party may terminate with 30 days written notice. Upon termination, Nama will remove all active ads using Talent's content within 7 business days.</li>
  </ul>

  <h2>5. Ownership</h2>
  <p>All content remains the sole property of Talent. Nama is granted only the limited usage rights described above and makes no claim to ownership or copyright of the Approved Content.</p>

  <h2>6. Termination</h2>
  <p>Either party may terminate this Agreement with 30 days written notice via email. Upon termination, all whitelisting rights end and Nama will deactivate any running ads featuring Talent's content.</p>

  <div class="signature-section">
    <p><strong>IN WITNESS WHEREOF</strong>, the Parties have executed this Agreement as of the date written below.</p>

    <div class="signature-block">
      <p><strong>For Nama:</strong></p>
      <p>Name: Shane Petersen<br>
      Title: Founder</p>
      <p>Signature: <img src="/signature-shane.png" alt="Shane Petersen Signature" class="signature-image" /></p>
      <p>Date: ${vars.effective_date}</p>
    </div>

    <div class="signature-block">
      <p><strong>For Talent: ${vars.talent_name}</strong></p>
      <p>Name: ${vars.talent_name}</p>
      <p>Signature: <span class="signature-line" style="display: inline-block;"></span></p>
      <p>Date: ___________________________</p>
    </div>
  </div>
</body>
</html>
`;
}
