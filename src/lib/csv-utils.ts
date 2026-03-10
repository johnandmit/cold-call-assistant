import { TargetField, TARGET_FIELDS, ColumnMapping, Contact } from '@/types';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_\-\.]/g, '');
}

const FIELD_ALIASES: Record<TargetField, string[]> = {
  name: ['name', 'companyname', 'company', 'businessname', 'business'],
  phone: ['phone', 'phonenumber', 'telephone', 'tel', 'mobile', 'contact'],
  address: ['address', 'streetaddress', 'location', 'fulladdress'],
  website: ['website', 'url', 'web', 'siteurl', 'websiteurl'],
  google_maps_url: ['googlemapsurl', 'googlemaps', 'mapsurl', 'mapslink', 'googleurl', 'gmaps'],
  rating: ['rating', 'starrating', 'stars', 'score', 'googlerating'],
  review_count: ['reviewcount', 'reviews', 'numberofreviews', 'totalreviews', 'numreviews'],
  conversion_confidence_score: ['conversionconfidencescore', 'convconfidence', 'conversionscore', 'confidencescore', 'convscore'],
  outreach_tier: ['outreachtier', 'tier', 'priority', 'prioritytier'],
  average_urgency: ['averageurgency', 'avgurgency', 'urgency'],
  opening_hours: ['openinghours', 'hours', 'businesshours', 'operatinghours', 'workinghours'],
  called: ['called', 'contacted', 'reached', 'calledstatus'],
};

// Only auto-detect with HIGH confidence (exact or very close match)
export function autoDetectMappings(csvColumns: string[]): ColumnMapping[] {
  return TARGET_FIELDS.map(field => {
    const aliases = FIELD_ALIASES[field];
    const match = csvColumns.find(col => {
      const norm = normalize(col);
      // Only exact alias matches — no fuzzy includes
      return aliases.some(a => norm === a);
    });
    return {
      targetField: field,
      csvColumn: match || '',
      autoDetected: !!match,
      required: field === 'name' || field === 'phone',
    };
  });
}

export function mapRowToContact(row: Record<string, any>, mappings: ColumnMapping[]): Partial<Contact> {
  const result: any = {};
  for (const m of mappings) {
    if (m.csvColumn && row[m.csvColumn] !== undefined) {
      result[m.targetField] = row[m.csvColumn];
    }
  }
  return result;
}

/** Check if a CSV "called" value indicates the lead was called */
export function parseCalled(value: any): boolean {
  if (!value && value !== 0) return false;
  const s = String(value).trim().toLowerCase();
  if (!s || s === '0' || s === 'false' || s === 'no' || s === 'n') return false;
  // Any other text (yes, y, true, notes, dates, etc.) = called
  return true;
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

export function findDuplicates(
  existing: Contact[],
  newContacts: Partial<Contact>[]
): { existing: Contact; new_: Partial<Contact>; matchType: 'phone' | 'name' }[] {
  const dupes: { existing: Contact; new_: Partial<Contact>; matchType: 'phone' | 'name' }[] = [];
  for (const nc of newContacts) {
    for (const ec of existing) {
      if (nc.phone && ec.phone && nc.phone.replace(/\D/g, '') === ec.phone.replace(/\D/g, '')) {
        dupes.push({ existing: ec, new_: nc, matchType: 'phone' });
        break;
      }
      if (nc.name && ec.name && levenshtein(nc.name.toLowerCase(), ec.name.toLowerCase()) <= 2) {
        dupes.push({ existing: ec, new_: nc, matchType: 'name' });
        break;
      }
    }
  }
  return dupes;
}
