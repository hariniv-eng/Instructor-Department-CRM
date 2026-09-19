/**
 * Hand-added (2026-09-17, per request) to mirror instructorGenderUpdate.ts --
 * NOT run through orval, since this session's codegen tooling is broken.
 * Regenerate for real once openapi.yaml's /instructors/{id}/exit-verification
 * path is picked up by a working orval run.
 *
 * "revoked" removed from the settable values (2026-09-19, per request) now
 * that reports.ts auto-excludes Darwinbox-reported "Revoked" exits from the
 * Exception queue automatically -- see instructors.ts's
 * EXIT_VERIFICATION_VALUES comment. Instructor/InstructorSummary's
 * exit_verification (the read side) still allows "revoked" since a row set
 * that way before this change may still carry it.
 */

export interface InstructorExitVerificationUpdate {
  exit_verification: 'exited' | 'serving_notice_period' | 'payroll_converted' | 'absconded' | null;
}
