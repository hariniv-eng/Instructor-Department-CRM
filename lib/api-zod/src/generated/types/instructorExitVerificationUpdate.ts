/**
 * Hand-added (2026-09-17, per request) to mirror instructorGenderUpdate.ts --
 * NOT run through orval, since this session's codegen tooling is broken.
 * Regenerate for real once openapi.yaml's /instructors/{id}/exit-verification
 * path is picked up by a working orval run.
 */

export interface InstructorExitVerificationUpdate {
  exit_verification: 'exited' | 'serving_notice_period' | 'payroll_converted' | 'absconded' | 'revoked' | null;
}
