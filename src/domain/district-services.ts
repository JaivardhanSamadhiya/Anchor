/** Public, manually reviewed local-service metadata. No address or ZIP inference. */
export const DISTRICT_SOURCES_REVIEWED_AT = '2026-10-11';
export const COUNTY_IDS = ['santa-clara', 'san-mateo'] as const;
export type ServiceCountyId = (typeof COUNTY_IDS)[number];
export interface ServiceSource {
  id: string;
  title: string;
  url: string;
  checkedAt: string;
}
export interface CountyServices {
  id: ServiceCountyId;
  name: string;
  agency: string;
  phone: string;
  phoneHref: string;
  applyUrl: string;
  helpUrl: string;
  officeLocationsUrl: string;
  coverage: string;
  programs: { id: 'calfresh' | 'medi-cal' | 'calworks'; label: string; url: string }[];
  sources: ServiceSource[];
}
const source = (id: string, title: string, url: string): ServiceSource => ({
  id,
  title,
  url,
  checkedAt: DISTRICT_SOURCES_REVIEWED_AT,
});

export const DISTRICT_CONTEXT = {
  label: 'California’s 16th Congressional District',
  representative: 'Sam Liccardo',
  congress: '119th Congress',
  checkedAt: DISTRICT_SOURCES_REVIEWED_AT,
  countyIds: COUNTY_IDS,
  coverage:
    'The current district includes parts of Santa Clara and San Mateo counties. County benefit offices serve their county residents; their service areas are distinct from congressional district boundaries.',
  boundaryNote:
    'California’s Proposition 50 maps govern the 2026 congressional election. Current representation continues under the existing district lines until noon on January 3, 2027. Confirm current representation with an official lookup; a ZIP code or county alone does not establish district membership.',
  currentMapUrl: 'https://www2.census.gov/geo/maps/cong_dist/cd119/cd_based/ST06/CD119_CA16.pdf',
  representativeLookupUrl: 'https://www.house.gov/representatives/find-your-representative',
  electionMapUrl:
    'https://sdmg.senate.ca.gov/committeehome/2025-congressional-districts/congressional-district-16-2025',
  sources: [
    source(
      'ca16-current',
      'Santa Clara Registrar: current 16th Congressional District',
      'https://vote.santaclaracounty.gov/16th-congressional-district',
    ),
    source(
      'ca16-map',
      'Census: California 16, 119th Congress map',
      'https://www2.census.gov/geo/maps/cong_dist/cd119/cd_based/ST06/CD119_CA16.pdf',
    ),
    source(
      'ca-redistricting',
      'California Secretary of State: redistricting dates',
      'https://www.sos.ca.gov/elections/california-redistricting',
    ),
    source(
      'house-lookup',
      'U.S. House: verify current representative',
      'https://www.house.gov/representatives/find-your-representative',
    ),
    source(
      'ca16-election-map',
      'Senate Demographics: 2026 election map, effective January 2027',
      'https://sdmg.senate.ca.gov/committeehome/2025-congressional-districts/congressional-district-16-2025',
    ),
  ],
} as const;

export const COUNTY_SERVICES: Record<ServiceCountyId, CountyServices> = {
  'santa-clara': {
    id: 'santa-clara',
    name: 'Santa Clara County',
    agency: 'Department of Employment and Benefit Services',
    phone: '(408) 758-3800',
    phoneHref: 'tel:+14087583800',
    applyUrl: 'https://benefitscal.com/',
    helpUrl:
      'https://ssa.santaclaracounty.gov/departments/department-employment-and-benefit-services/contact-department-employment-and-benefit',
    officeLocationsUrl: 'https://ssa.santaclaracounty.gov/apply-public-benefits',
    coverage:
      'Use Santa Clara County services for a case managed by Santa Clara County. Confirm the issuing county on the notice.',
    programs: [
      {
        id: 'calfresh',
        label: 'CalFresh food assistance',
        url: 'https://ssa.santaclaracounty.gov/apply-public-benefits',
      },
      {
        id: 'medi-cal',
        label: 'Medi-Cal health coverage',
        url: 'https://ssa.santaclaracounty.gov/apply-public-benefits',
      },
      {
        id: 'calworks',
        label: 'CalWORKs cash assistance',
        url: 'https://ssa.santaclaracounty.gov/apply-public-benefits',
      },
    ],
    sources: [
      source(
        'santa-clara-benefits',
        'Santa Clara: applications, office locations and document submission',
        'https://ssa.santaclaracounty.gov/apply-public-benefits',
      ),
      source(
        'santa-clara-contact',
        'Santa Clara: benefit services contacts',
        'https://ssa.santaclaracounty.gov/departments/department-employment-and-benefit-services/contact-department-employment-and-benefit',
      ),
    ],
  },
  'san-mateo': {
    id: 'san-mateo',
    name: 'San Mateo County',
    agency: 'Human Services Agency',
    phone: '(800) 223-8383',
    phoneHref: 'tel:+18002238383',
    applyUrl: 'https://benefitscal.com/',
    helpUrl: 'https://www.smcgov.org/hsa/apply-mail-phone-or-fax',
    officeLocationsUrl: 'https://www.smcgov.org/hsa/office-locations',
    coverage:
      'Use San Mateo County services for a case managed by San Mateo County. Confirm the issuing county on the notice.',
    programs: [
      {
        id: 'calfresh',
        label: 'CalFresh food assistance',
        url: 'https://www.smcgov.org/hsa/food-assistance',
      },
      {
        id: 'medi-cal',
        label: 'Medi-Cal health coverage',
        url: 'https://www.smcgov.org/hsa/health-coverage',
      },
      {
        id: 'calworks',
        label: 'CalWORKs cash assistance',
        url: 'https://www.smcgov.org/hsa/calworks',
      },
    ],
    sources: [
      source(
        'san-mateo-calfresh',
        'San Mateo: CalFresh applications and BenefitsCal',
        'https://www.smcgov.org/hsa/apply-calfresh',
      ),
      source(
        'san-mateo-contact',
        'San Mateo: phone, mail and fax applications',
        'https://www.smcgov.org/hsa/apply-mail-phone-or-fax',
      ),
      source(
        'san-mateo-offices',
        'San Mateo: current office locations',
        'https://www.smcgov.org/hsa/office-locations',
      ),
      source(
        'san-mateo-renewal',
        'San Mateo: CalFresh reporting and recertification',
        'https://www.smcgov.org/hsa/already-receiving-calfresh',
      ),
      source(
        'san-mateo-health',
        'San Mateo: Medi-Cal health coverage and renewals',
        'https://www.smcgov.org/hsa/health-coverage',
      ),
      source(
        'san-mateo-calworks',
        'San Mateo: CalWORKs and BenefitsCal',
        'https://www.smcgov.org/hsa/calworks',
      ),
    ],
  },
};

/** Accept a selected county ID only. Addresses, ZIP codes and ambiguous notices fail closed. */
export function getCountyServices(county: unknown): CountyServices | null {
  return typeof county === 'string' && Object.hasOwn(COUNTY_SERVICES, county)
    ? COUNTY_SERVICES[county as ServiceCountyId]
    : null;
}

export const PROGRAM_CAPABILITIES = {
  calfresh: {
    sourceGuidance: true,
    guidedForms: ['cf37', 'sar7b'],
    pdfPreparation:
      'Only reviewed mapped fields in the verified official blank; unsigned and not submitted.',
    noticeExtraction: ['CF 377.2', 'CF 377.6', 'explicit CalFresh interview appointment'],
  },
  'medi-cal': { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  medicare: { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  ssi: { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  ssdi: { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  housing: { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  wic: { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  energy: { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  unemployment: { sourceGuidance: true, guidedForms: [], noticeExtraction: [] },
  calworks: {
    sourceGuidance: false,
    officialCountyLinks: true,
    guidedForms: [],
    noticeExtraction: [],
  },
} as const;
