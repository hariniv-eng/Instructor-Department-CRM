/**
 * Hand-added (2026-09-15, per request) to mirror instructorGenderUpdate.ts --
 * NOT run through orval, since this session's codegen tooling is broken.
 * Regenerate for real once openapi.yaml's /instructors/{id}/capability-manager
 * path is picked up by a working orval run.
 */

export interface InstructorCapabilityManagerUpdate {
  manual_capability_manager: string | null;
}
