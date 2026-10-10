// Public source metadata and original, fictional practice correspondence.
// Source dates are research checks, not guarantees about an individual case.
export const SOURCES = [
  {
    id: 'cdss-forms',
    title: 'CDSS forms directory: A–D',
    url: 'https://www.cdss.ca.gov/inforesources/forms-brochures/forms-alphabetic-list/a-d',
    description: 'Lists CF 377.2 (9/18), CalFresh expiration of certification, and CF 377.6 (8/13), information or verification needed. Related form variants require separate review.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'cf377-2',
    title: 'CF 377.2 (9/18): expiration of certification',
    url: 'https://www.cdss.ca.gov/Portals/9/FMUForms/A-D/CF%20377.2.pdf?ver=2018-09-20-141948-567',
    description: 'Official form includes the certification end date and renewal steps. Its standard guidance refers to filing by the 15th day of the last certification month and a separate interview appointment letter.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'cf377-6',
    title: 'CF 377.6 (8/13): information or verification needed',
    url: 'https://www.cdss.ca.gov/cdssweb/entres/forms/english/cf377.6.pdf',
    description: 'Official form requests specified information after a reported household change. Requests and return dates depend on the notice; it invites people to contact the county if they need help or time.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'santa-clara-contact',
    title: 'Santa Clara County: benefit services contacts',
    url: 'https://ssa.santaclaracounty.gov/departments/department-employment-and-benefit-services/contact-department-employment-and-benefit',
    description: 'Publishes the CalFresh contact number, office addresses, document drop boxes, and help with language access or forms. Existing recipients can use their worker’s number on their notice.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'santa-clara-apply',
    title: 'Santa Clara County: apply and submit documents',
    url: 'https://ssa.santaclaracounty.gov/apply-public-benefits',
    description: 'Links to BenefitsCal and gives phone, office, mail, fax, and document submission options. Its verification examples are possibilities; the county determines what is needed.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'san-mateo-apply',
    title: 'San Mateo County: apply for CalFresh',
    url: 'https://www.smcgov.org/hsa/apply-calfresh',
    description: 'Links to BenefitsCal and county application channels, describes possible verification requests, and provides information about interpretive services.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'san-mateo-contact',
    title: 'San Mateo County: phone, mail, and fax',
    url: 'https://www.smcgov.org/hsa/apply-mail-phone-or-fax',
    description: 'Publishes the Human Services Agency call center, Monday–Friday hours, mail address, fax number, and interpretive service information.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'san-mateo-locations',
    title: 'San Mateo County: office locations',
    url: 'https://www.smcgov.org/hsa/office-locations',
    description: 'Lists regional offices, including the Human Services Agency at 2500 Middlefield Road in Redwood City.',
    checkedAt: '2026-10-09',
  },
  {
    id: 'san-mateo-verifications',
    title: 'San Mateo County: submit verifications',
    url: 'https://www.smcgov.org/hsa/submit-verifications',
    description: 'Lists BenefitsCal, mail, county upload, regional office, and fax submission options, plus the number to call with questions.',
    checkedAt: '2026-10-09',
  },
];

export const COUNTIES = {
  'santa-clara': {
    name: 'Santa Clara County',
    phone: '(408) 758-3800',
    phoneHref: 'tel:+14087583800',
    address: 'Benefits Assistance Center, 1867 Senter Road, San Jose, CA 95112',
    applyUrl: 'https://benefitscal.com/',
    helpUrl: 'https://ssa.santaclaracounty.gov/departments/department-employment-and-benefit-services/contact-department-employment-and-benefit',
    hours: 'Monday–Friday, 8:00 AM–5:00 PM, except county holidays',
  },
  'san-mateo': {
    name: 'San Mateo County',
    phone: '(800) 223-8383',
    phoneHref: 'tel:+18002238383',
    address: 'Human Services Agency, 2500 Middlefield Road, Redwood City, CA 94063',
    applyUrl: 'https://benefitscal.com/',
    helpUrl: 'https://www.smcgov.org/hsa/apply-mail-phone-or-fax',
    hours: 'Monday–Friday, 8:00 AM–5:00 PM',
  },
};

export const DEMO_NOTICES = [
  {
    id: 'renewal',
    title: 'Renewal + appointment',
    filename: 'fictional-renewal-practice.txt',
    type: 'renewal',
    county: 'santa-clara',
    isDemo: true,
    text: `FICTIONAL PRACTICE NOTICE
Original simplified sample for Anchor. This was not issued by a government agency. It is based on the CF377.2 (9/18) form family, with a fictional supplemental appointment reminder.

County: Santa Clara County
Notice Date: October 9, 2026
CalFresh renewal practice scenario

Your certification ends on October 31, 2026.
Submit your renewal form by October 15, 2026.

This practice household is preparing its renewal. Review the original notice for the requested steps, then contact the county if anything is unclear. Anchor can help organize a plan; it cannot determine whether a renewal is complete or whether benefits will continue. Keep a copy of what you submit and any confirmation provided by the county.

FICTIONAL SUPPLEMENTAL APPOINTMENT REMINDER
Your CalFresh interview is scheduled for October 20, 2026 at 10:00 AM.
This sample does not specify the interview method. Confirm the method and contact details in the actual appointment letter before attending or calling. Ask the county for help if you cannot make an appointment or need an interpreter.

All dates and appointments above belong only to this fictional practice scenario. No name or case number is included.`,
  },
  {
    id: 'verification',
    title: 'Requested documents',
    filename: 'fictional-verification-practice.txt',
    type: 'verification',
    county: 'san-mateo',
    isDemo: true,
    text: `FICTIONAL PRACTICE NOTICE
Original simplified sample for Anchor. This was not issued by a government agency. It is based on the CF377.6 (8/13) form family.

County: San Mateo County
Notice Date: October 9, 2026
CalFresh information request practice scenario

In this fictional scenario, a household reported a change in earned income and housing costs. The practice request lists two items to help review that change. These are examples, not documents required from everyone receiving CalFresh.

Submit the requested items by October 24, 2026.

[X] Pay stubs for August and September 2026
[X] Proof of rent, such as a rental agreement or rent receipt
[ ] Other documents not requested in this sample

For rent verification, review the housing cost you reported. If you do not have one of the requested items, contact the county to ask what it can accept and whether it can help you get the information. Review the request before sending personal documents. Use the county’s official submission channel and keep any confirmation.

All requests and dates above belong only to this fictional practice scenario. No name or case number is included.`,
  },
  {
    id: 'conflicting-dates',
    title: 'Conflicting dates · needs review',
    filename: 'fictional-conflicting-dates-practice.txt',
    type: 'verification',
    county: 'santa-clara',
    isDemo: true,
    text: `FICTIONAL PRACTICE NOTICE
Original simplified sample for Anchor. This was not issued by a government agency. It is based on the CF377.6 (8/13) form family and deliberately contains conflicting dates.

County: Santa Clara County
Notice Date: October 9, 2026
CalFresh information request practice scenario

The first section asks for information about a reported income change.
Submit the requested items by October 23, 2026.
[X] Pay stubs for September 2026

An additional section gives a different date for the same request.
Submit the requested items by October 26, 2026.

This practice sample does not explain which date controls or whether a later section replaces the earlier one. Both dates are visible, so an automated tool should not silently choose one. Review the complete original correspondence and ask the county to clarify the request before relying on a deadline or exporting a reminder.

All requests and dates above belong only to this fictional practice scenario. No name or case number is included.`,
  },
];
