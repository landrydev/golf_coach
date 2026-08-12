import {
  configuredConsentGrantRequirement,
  consentGrantRequirementsCurrent,
  parseConsentPolicyRegistry,
  requireCurrentConsentGrant,
  type ConsentGrantRequirement,
  type ConsentPolicyRegistry,
} from "@/lib/consent-repository";

const ACCOUNT_SUBJECT = { type: "account", golferId: null } as const;

/**
 * `golfer_record` is the narrow account-level processing key for creating and
 * changing golfer/roadmap data. Its exact meaning and text come only from the
 * owner-supplied registry; code supplies no legal wording or production bypass.
 */
export async function requireGolferRecordProcessingConsent(
  accountId: string,
  registry = parseConsentPolicyRegistry(),
): Promise<readonly ConsentGrantRequirement[]> {
  return [
    await requireCurrentConsentGrant(
      accountId,
      ACCOUNT_SUBJECT,
      "golfer_record",
      registry,
    ),
  ];
}

export function configuredGolferRecordProcessingRequirement(
  registry = parseConsentPolicyRegistry(),
): ConsentGrantRequirement {
  return configuredConsentGrantRequirement(
    ACCOUNT_SUBJECT,
    "golfer_record",
    registry,
  );
}

export async function golferRecordProcessingConsentCurrent(
  accountId: string,
): Promise<boolean> {
  try {
    const requirements = await requireGolferRecordProcessingConsent(accountId);
    return await consentGrantRequirementsCurrent(accountId, requirements);
  } catch {
    return false;
  }
}

/**
 * Sharing requires both the account-level golfer-record processing key and the
 * exact golfer's roadmap-sharing key. Withdrawal of either therefore makes a
 * capability ineffective on its next authorization check.
 */
export async function requireRoadmapSharingConsent(
  accountId: string,
  golferId: string,
  registry = parseConsentPolicyRegistry(),
): Promise<readonly ConsentGrantRequirement[]> {
  const requirements = configuredRoadmapAccessRequirements(golferId, registry);
  for (const requirement of requirements) {
    await requireCurrentConsentGrant(
      accountId,
      requirement.subject,
      requirement.purpose,
      registry,
    );
  }
  return requirements;
}

export function configuredRoadmapAccessRequirements(
  golferId: string,
  registry: ConsentPolicyRegistry = parseConsentPolicyRegistry(),
): readonly ConsentGrantRequirement[] {
  return [
    configuredConsentGrantRequirement(
      ACCOUNT_SUBJECT,
      "golfer_record",
      registry,
    ),
    configuredConsentGrantRequirement(
      { type: "golfer", golferId },
      "roadmap_sharing",
      registry,
    ),
  ];
}

export async function roadmapAccessConsentCurrent(
  accountId: string,
  golferId: string,
): Promise<boolean> {
  let requirements: readonly ConsentGrantRequirement[];
  try {
    requirements = configuredRoadmapAccessRequirements(golferId);
  } catch {
    return false;
  }
  try {
    return await consentGrantRequirementsCurrent(accountId, requirements);
  } catch {
    return false;
  }
}
