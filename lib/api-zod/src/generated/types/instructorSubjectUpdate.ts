/**
 * Hand-added (2026-09-15, per request) to mirror instructorCapabilityManagerUpdate.ts --
 * NOT run through orval, since this session's codegen tooling is broken.
 * Regenerate for real once openapi.yaml's /instructors/{id}/subject path
 * is picked up by a working orval run.
 */

export interface InstructorSubjectUpdate {
  manual_dept_area: string | null;
}
