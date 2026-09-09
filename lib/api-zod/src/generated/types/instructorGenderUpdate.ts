/**
 * Hand-added (2026-09-09, per request) to mirror instructorUpdate.ts --
 * NOT run through orval, since this session's codegen tooling is broken.
 * Regenerate for real once openapi.yaml's /instructors/{id}/gender path is
 * picked up by a working orval run.
 */

export interface InstructorGenderUpdate {
  manual_gender: 'male' | 'female' | null;
}
