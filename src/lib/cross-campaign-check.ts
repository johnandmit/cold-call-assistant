import { Contact } from '@/types';
import { getContacts, getCampaigns } from '@/lib/storage';
import { levenshtein } from '@/lib/csv-utils';

export interface CrossCampaignMatch {
  contact: Contact;
  matchedContact: Contact;
  matchedCampaignId: string;
  matchedCampaignName: string;
  matchType: 'phone' | 'name';
}

/**
 * Check contacts from the active campaign against leads in other campaigns.
 * @param activeCampaignId - the current campaign
 * @param campaignIdsToCheck - which other campaigns to compare against
 * @param contactsToCheck - optionally pass specific contacts; defaults to all active campaign contacts
 */
export function checkCrossCampaignDuplicates(
  activeCampaignId: string,
  campaignIdsToCheck: string[],
  contactsToCheck?: Contact[]
): CrossCampaignMatch[] {
  const campaigns = getCampaigns();
  const sourceContacts = contactsToCheck || getContacts(activeCampaignId);
  const matches: CrossCampaignMatch[] = [];
  const seen = new Set<string>(); // avoid duplicate matches

  for (const checkCampaignId of campaignIdsToCheck) {
    if (checkCampaignId === activeCampaignId) continue;
    const campaign = campaigns.find(c => c.id === checkCampaignId);
    if (!campaign) continue;

    const otherContacts = getContacts(checkCampaignId);

    for (const sc of sourceContacts) {
      for (const oc of otherContacts) {
        const key = `${sc.id}-${oc.id}`;
        if (seen.has(key)) continue;

        // Phone match
        if (sc.phone && oc.phone) {
          const normA = sc.phone.replace(/\D/g, '');
          const normB = oc.phone.replace(/\D/g, '');
          if (normA && normB && normA === normB) {
            seen.add(key);
            matches.push({
              contact: sc,
              matchedContact: oc,
              matchedCampaignId: checkCampaignId,
              matchedCampaignName: campaign.name,
              matchType: 'phone',
            });
            continue;
          }
        }

        // Name match (fuzzy)
        if (sc.name && oc.name) {
          if (levenshtein(sc.name.toLowerCase(), oc.name.toLowerCase()) <= 2) {
            seen.add(key);
            matches.push({
              contact: sc,
              matchedContact: oc,
              matchedCampaignId: checkCampaignId,
              matchedCampaignName: campaign.name,
              matchType: 'name',
            });
          }
        }
      }
    }
  }

  return matches;
}
