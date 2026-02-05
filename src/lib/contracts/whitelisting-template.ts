import { WhitelistingContractVariables } from "@/types/database";

export function renderWhitelistingContract(vars: WhitelistingContractVariables): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; max-width: 8.5in; margin: 0 auto; padding: 0.75in;">
  <div style="text-align: center; font-family: 'Times New Roman', serif; font-size: 36pt; letter-spacing: 0.2em; margin-bottom: 0.2in;">NAMA</div>
  <h1 style="text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 0.5in;">Whitelisting Collaboration Agreement</h1>

  <div style="margin-bottom: 0.3in; padding-top: 0.2in; border-top: 1px solid #000;">
    <p><strong>This Agreement</strong> ("Agreement") is made and entered into on <strong>${vars.effective_date}</strong>, by and between:</p>

    <div style="margin-bottom: 0.15in;">
      <p><span style="font-weight: bold;">Namastetics Inc.</span> ("Nama")<br>
      Contact: Shane Petersen, Founder<br>
      Email: shane@namaclo.com</p>
    </div>

    <p>and</p>

    <div style="margin-bottom: 0.15in;">
      <p><span style="font-weight: bold;">${vars.talent_name}</span> ("Talent")<br>
      Email: ${vars.talent_email}</p>
    </div>

    <p>Collectively referred to as the "Parties."</p>
  </div>

  <h2 style="font-size: 14pt; font-weight: normal; margin-top: 0.4in; margin-bottom: 0.15in; padding-top: 0.15in; border-top: 1px solid #ccc;">1. Overview</h2>
  <p>Talent grants Nama permission to use existing social media content featuring Nama products ("Approved Content") for paid advertising purposes ("Whitelisting") on Meta platforms (Instagram and Facebook).</p>

  <h2 style="font-size: 14pt; font-weight: normal; margin-top: 0.4in; margin-bottom: 0.15in; padding-top: 0.15in; border-top: 1px solid #ccc;">2. Usage Rights</h2>
  <ul style="margin: 0.1in 0; padding-left: 0.4in;">
    <li style="margin-bottom: 0.08in;">Nama is granted non-exclusive rights to run paid advertisements using Approved Content via Talent's handle and/or Nama's handle.</li>
    <li style="margin-bottom: 0.08in;">Usage is limited to Meta platforms (Instagram and Facebook).</li>
    <li style="margin-bottom: 0.08in;">Nama will share ad creative with Talent for approval prior to activation. Talent has 24 hours to respond with approval or requested changes. If no response is received within 24 hours, the ad will be considered approved.</li>
  </ul>

  <h2 style="font-size: 14pt; font-weight: normal; margin-top: 0.4in; margin-bottom: 0.15in; padding-top: 0.15in; border-top: 1px solid #ccc;">3. Compensation & Payment Terms</h2>
  <p>In exchange for the rights granted, Talent will receive:</p>
  <ul style="margin: 0.1in 0; padding-left: 0.4in;">
    <li style="margin-bottom: 0.08in;"><strong>${vars.compensation}</strong></li>
  </ul>

  <h2 style="font-size: 14pt; font-weight: normal; margin-top: 0.4in; margin-bottom: 0.15in; padding-top: 0.15in; border-top: 1px solid #ccc;">4. Usage Period & Renewal</h2>
  <ul style="margin: 0.1in 0; padding-left: 0.4in;">
    <li style="margin-bottom: 0.08in;">This Agreement grants ongoing usage rights.</li>
    <li style="margin-bottom: 0.08in;">Either party may terminate with 30 days written notice. Upon termination, Nama will remove all active ads using Talent's content within 7 business days.</li>
  </ul>

  <h2 style="font-size: 14pt; font-weight: normal; margin-top: 0.4in; margin-bottom: 0.15in; padding-top: 0.15in; border-top: 1px solid #ccc;">5. Ownership</h2>
  <p>All content remains the sole property of Talent. Nama is granted only the limited usage rights described above and makes no claim to ownership or copyright of the Approved Content.</p>

  <h2 style="font-size: 14pt; font-weight: normal; margin-top: 0.4in; margin-bottom: 0.15in; padding-top: 0.15in; border-top: 1px solid #ccc;">6. Termination</h2>
  <p>Either party may terminate this Agreement with 30 days written notice via email. Upon termination, all whitelisting rights end and Nama will deactivate any running ads featuring Talent's content.</p>

  <div style="margin-top: 0.5in; padding-top: 0.2in; border-top: 1px solid #ccc;">
    <p><strong>IN WITNESS WHEREOF</strong>, the Parties have executed this Agreement as of the date written below.</p>

    <div style="margin-top: 0.3in;">
      <p><strong>For Nama:</strong></p>
      <p>Name: Shane Petersen<br>
      Title: Founder</p>
      <p>Signature: <img src="/signature-shane.png" alt="Shane Petersen Signature" style="height: 100px; margin: 0.1in 0;" /></p>
      <p>Date: ${vars.effective_date}</p>
    </div>

    <div style="margin-top: 0.3in;">
      <p><strong>For Talent: ${vars.talent_name}</strong></p>
      <p>Name: ${vars.talent_name}</p>
      <p>Signature: <span style="display: inline-block; border-bottom: 1px solid #000; width: 2.5in; margin: 0.2in 0 0.05in 0;"></span></p>
      <p>Date: ___________________________</p>
    </div>
  </div>
</body>
</html>
`;
}
