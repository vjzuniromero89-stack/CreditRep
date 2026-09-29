// Genera reportes de prueba con estructura parecida a IdentityIQ / SmartCredit
export function identityIQ({ removed = false } = {}) {
  const t4 = (rows) => `<table class="rpt_content_table rpt_content_header rpt_table4column"><tbody>
    <tr><th></th><th class="headerTUC">TransUnion</th><th class="headerEXP">Experian</th><th class="headerEQF">Equifax</th></tr>
    ${rows.map(([l, a, b, c]) => `<tr><td class="label">${l}</td><td class="info">${a}</td><td class="info">${b}</td><td class="info">${c}</td></tr>`).join('')}
  </tbody></table>`;
  const acct = (name, rows, hist) => `<div class="sub_header">${name}</div>
   <table><tr><td>${t4(rows)}</td></tr></table>
   ${hist ? `<table class="addr_hsrty"><tr><th></th>${hist.months.map(m=>`<td>${m}</td>`).join('')}</tr>
   ${Object.entries(hist.rows).map(([b, v]) => `<tr><td class="label">${b}</td>${v.map(x=>`<td><div>${x}</div></td>`).join('')}</tr>`).join('')}</table>` : ''}
   <div><a href="#top">Back to Top</a></div>`;
  const midland = acct('MIDLAND CREDIT MGMT', [
    ['Account #:', '8547****', removed ? '-' : '8547****', removed ? '-' : '8547****'],
    ['Account Type:', 'Open Account', removed ? '-' : 'Open Account', removed ? '-' : 'Open Account'],
    ['Account Type - Detail:', 'Collection Agency/Attorney', removed ? '-' : 'Collection Agency/Attorney', removed ? '-' : 'Debt Buyer'],
    ['Account Status:', 'Derogatory', removed ? '-' : 'Derogatory', removed ? '-' : 'Derogatory'],
    ['Date Opened:', '03/15/2022', removed ? '-' : '03/01/2022', removed ? '-' : '03/01/2022'],
    ['Balance:', '$1,245.00', removed ? '-' : '$1,245.00', removed ? '-' : '$1,245.00'],
    ['Payment Status:', 'Collection/Chargeoff', removed ? '-' : 'Collection/Chargeoff', removed ? '-' : 'Collection/Chargeoff'],
    ['Last Reported:', '08/01/2026', removed ? '-' : '08/05/2026', removed ? '-' : '08/03/2026'],
    ['Comments:', 'Placed for collection', removed ? '-' : 'Account information disputed by consumer', removed ? '-' : ''],
    ['Original Creditor:', 'COMENITY BANK', removed ? '-' : 'COMENITY BANK', removed ? '-' : 'COMENITY BANK'],
  ]);
  const capone = acct('CAPITAL ONE', [
    ['Account #:', '517805******1234', '517805******', '517805******1234'],
    ['Account Type:', 'Revolving', 'Revolving', 'Revolving'],
    ['Account Status:', 'Open', 'Open', 'Open'],
    ['Monthly Payment:', '$35.00', '$35.00', '$35.00'],
    ['Date Opened:', '06/10/2019', '06/01/2019', '06/01/2019'],
    ['Balance:', '$845.00', '$845.00', '$845.00'],
    ['High Credit:', '$1,200.00', '$1,200.00', '$1,200.00'],
    ['Credit Limit:', '$1,500.00', '$1,500.00', '$1,500.00'],
    ['Past Due:', '$0.00', '$0.00', '$0.00'],
    ['Payment Status:', 'Current', 'Current', 'Current'],
    ['Last Reported:', '08/20/2026', '08/20/2026', '08/20/2026'],
  ], { months: ['Aug','Jul','Jun','May','Apr','Mar'], rows: { TransUnion: ['OK','OK','30','OK','60','OK'], Experian: ['OK','OK','30','OK','OK','OK'], Equifax: ['OK','OK','30','OK','OK','OK'] } });
  const chase = acct('JPMCB CARD', [
    ['Account #:', '4266********', '4266********', '4266********'],
    ['Account Type:', 'Revolving', 'Revolving', 'Revolving'],
    ['Account Status:', 'Closed', 'Closed', 'Closed'],
    ['Balance:', '$2,310.00', '$2,310.00', '$2,310.00'],
    ['Payment Status:', 'Charged Off', 'Charged Off', 'Charged Off'],
    ['Comments:', 'Charged off account', 'Profit and loss writeoff', 'Charged off account'],
  ]);
  const portfolio = acct('PORTFOLIO RECOVERY', [
    ['Account #:', '-', '601100******', '-'],
    ['Account Type:', '-', 'Open Account', '-'],
    ['Account Type - Detail:', '-', 'Factoring Company Account', '-'],
    ['Balance:', '-', '$640.00', '-'],
    ['Payment Status:', '-', 'Collection', '-'],
  ]);
  return `<!DOCTYPE html><html><head><title>IdentityIQ - Credit Report</title><style>td{padding:2px 6px;font:11px Arial}</style></head><body>
  <div id="header">IdentityIQ</div>
  <table><tr><td>
   <div class="rpt_fullReport_header">Personal Information</div>
   ${t4([
     ['Credit Report Date:', '09/15/2026', '09/15/2026', '09/15/2026'],
     ['Name:', 'JUAN C PEREZ', 'JUAN CARLOS PEREZ', 'JUAN PEREZ'],
     ['Also Known As:', removed ? '-' : 'JUAN PERES<br>JOHN PEREZ', 'JUAN C PEREZ LOPEZ', '-'],
     ['Former:', '-', ' ', '-'],
     ['Date of Birth:', '1989', '1989', '01/01/1989'],
     ['Current Address(es):', '123 MAIN ST<br>WILMINGTON, DE 19801<br>05/2021', '123 MAIN ST<br>WILMINGTON, DE 19801', '123 MAIN STREET<br>WILMINGTON, DE 19801'],
     ['Previous Address(es):', removed ? '-' : '45 OAK AVE APT 2<br>NEWARK, DE 19711<br>01/2019<br>900 PINE RD<br>DOVER, DE 19901', '45 OAK AVE<br>NEWARK, DE 19711', '-'],
     ['Employers:', 'ACME LOGISTICS', 'ACME LOGISTICS INC', '-'],
   ])}
   <div class="rpt_fullReport_header">Credit Score</div>
   ${t4([['Credit Score:', removed ? '612' : '548', removed ? '598' : '561', removed ? '605' : '552'], ['Lender Rank:', 'Fair', 'Fair', 'Poor'], ['Score Scale:', '300-850', '300-850', '300-850']])}
   <div class="rpt_fullReport_header">Summary</div>
   ${t4([['Total Accounts:', '4', '5', '4'], ['Collection:', '1', '2', '1'], ['Inquiries(2 years):', '2', '1', '1']])}
   <div class="rpt_fullReport_header">Account History</div>
   ${midland}${capone}${chase}${portfolio}
   <div class="rpt_fullReport_header">Public Information</div>
   <div>None Reported</div>
   <div class="rpt_fullReport_header">Inquiries</div>
   <table class="rpt_content_table"><tr><th>Creditor Name</th><th>Type of Business</th><th>Date of inquiry</th><th>Credit Bureau</th></tr>
    <tr><td>CREDIT ONE BANK</td><td>Bank Credit Cards</td><td>07/12/2026</td><td>TransUnion</td></tr>
    ${removed ? '' : '<tr><td>WESTLAKE FINANCIAL</td><td>Auto Financing</td><td>05/02/2026</td><td>Experian</td></tr>'}
    <tr><td>WESTLAKE FINANCIAL</td><td>Auto Financing</td><td>05/02/2026</td><td>Equifax</td></tr>
    <tr><td>SYNCB/AMAZON</td><td>Bank Credit Cards</td><td>02/20/2026</td><td>TransUnion</td></tr>
   </table>
   <div class="rpt_fullReport_header">Creditor Contacts</div>
   <table><tr><td>MIDLAND CREDIT MGMT</td><td>350 CAMINO DE LA REINA, SAN DIEGO, CA 92108</td><td>(800) 825-8131</td></tr></table>
  </td></tr></table></body></html>`;
}

export function smartCredit() {
  // Orden de columnas diferente y etiquetas sin dos puntos
  const t = (rows) => `<table><tr><td></td><td>TransUnion</td><td>Equifax</td><td>Experian</td></tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  return `<html><body><h1>SmartCredit 3B Report</h1>
  <h2>Personal Information</h2>
  ${t([['Name', 'MARIA LOPEZ', 'MARIA G LOPEZ', 'MARIA LOPEZ'], ['Date of Birth', '1990', '1990', '1990'], ['Addresses', '77 ELM ST, BEAR, DE 19701', '77 ELM ST, BEAR, DE 19701', '77 ELM ST, BEAR, DE 19701'], ['Phone Numbers', '(302) 555-1212', '-', '302-555-9999']])}
  <h2>Credit Scores</h2>
  ${t([['VantageScore 3.0', '580', '575', '590']])}
  <h2>Collections</h2>
  <h3>LVNV FUNDING LLC</h3>
  ${t([['Account Number', '4121****', '4121****', '-'], ['Balance Owed', '$455', '$455', '-'], ['Account Status', 'Open', 'Open', '-'], ['Original Creditor', 'CREDIT ONE BANK N.A.', 'CREDIT ONE BANK N.A.', '-'], ['Date Opened', '01/2023', '01/2023', '-']])}
  <h2>Accounts</h2>
  <h3>DISCOVER BANK</h3>
  ${t([['Account Number', '6011****', '6011****', '6011****'], ['Balance Owed', '$0', '$0', '$0'], ['Account Status', 'Closed', 'Closed', 'Closed'], ['Payment Status', 'Late 90 Days', 'Current', 'Current'], ['Times 30/60/90 Days Late', '30: 1 60: 1 90: 1', '30: 0 60: 0 90: 0', '30: 0 60: 0 90: 0']])}
  <h2>Inquiries</h2>
  <table><tr><td>Creditor Name</td><td>Inquiry Date</td><td>Bureau</td></tr><tr><td>CAPITAL ONE</td><td>03/03/2026</td><td>Equifax</td></tr></table>
  </body></html>`;
}
