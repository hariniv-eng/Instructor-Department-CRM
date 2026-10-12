// SOP notes (2026-10-12, per request): every change an Admin-team member, Capability Manager (CM) or HRBP makes in the FCC
// has a standard procedure. This is the single place those procedures live; <SopNote> (components/sop-note.tsx) shows
// them right next to the control, so editing a rule here updates every place it is displayed.
// Keys for movements match MOVEMENT_TYPES in components/movement-tracker.tsx.

export type SopRole = 'admin' | 'cm' | 'hrbp';

export type Sop = {
  title: string;
  admin: string[];
  cm: string[];
  hrbp: string[];
};

export const SOP_ROLE_LABELS: Record<SopRole, string> = {
  admin: 'Admin team',
  cm: 'Capability Manager',
  hrbp: 'HRBP',
};

const CM_REMARKS = 'Update the necessary details in the Remarks column.';

export const SOPS: Record<string, Sop> = {
  new_joiner: {
    title: 'New joiner — giving TeachOS access',
    admin: [
      'Create the UID only after the person is in Darwin.',
      'Tag the CM (manager) in TeachOS on the same day the UID is created.',
      'Tag the person as Training in Campus.',
    ],
    cm: ['Confirm the Capability Manager before access is created.'],
    hrbp: [],
  },
  cm_change: {
    title: 'CM change',
    admin: ['Change the CM in TeachOS accordingly.'],
    cm: [CM_REMARKS, 'Name the new Capability Manager in the Remarks column.'],
    hrbp: [],
  },
  external_move: {
    title: 'Team Movement',
    admin: ['Remove TeachOS access.'],
    cm: [CM_REMARKS, 'Inform the HRBP about the department change and the RP change.'],
    hrbp: ['Initiate the department change in Darwin.', 'Initiate the RP change in Darwin.'],
  },
  dsa_team: {
    title: 'DSA team Move',
    admin: ['Mark the person inactive in TeachOS and leave the CM (manager) blank.'],
    cm: [CM_REMARKS, 'Inform the HRBP about the RP change.'],
    hrbp: ['Initiate the RP change in Darwin.'],
  },
  product_move: {
    title: 'Product Movement',
    admin: [
      'Deactivate the NIAT learning portal.',
      'Give Academy / Intensive learning portal access (Finance team).',
      'Give TeachOS access for Academy / Intensive.',
      'Deactivate TeachOS access for NIAT.',
      'Change the CM accordingly.',
    ],
    cm: [CM_REMARKS, 'Inform the HRBP about the RP change.'],
    hrbp: ['Initiate the RP change in Darwin.'],
  },
  deployment_yes: {
    title: 'Ins/Men Deployment',
    admin: ['Tag the TeachOS Campus.', 'For Academy / Intensive, follow the Product Movement process.'],
    cm: [CM_REMARKS],
    hrbp: [],
  },
  deployment_no: {
    title: 'Ins/Men Recall',
    admin: ['Change the Campus from College to Training.', 'For Academy / Intensive, roll the enrolment back to Training.'],
    cm: [CM_REMARKS],
    hrbp: [],
  },
};
