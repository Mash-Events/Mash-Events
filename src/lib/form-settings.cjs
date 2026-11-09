// Public forms that admins can open or close from Settings. A form with no
// row in form_settings is open, so a fresh database changes nothing.
const PUBLIC_FORMS = [
  {
    key: 'registration',
    label: 'Delegate registration',
    path: '/register',
    closedMessage: 'Registration for Mash Event 2026 has closed.',
  },
  {
    key: 'speaker_application',
    label: 'Speaker application',
    path: '/speaker-application',
    closedMessage: 'Speaker applications for Mash Event 2026 have closed.',
  },
  {
    key: 'volunteer_application',
    label: 'Volunteer application',
    path: '/volunteer-application',
    closedMessage: 'Volunteer applications for Mash Event 2026 have closed.',
  },
  {
    key: 'media_accreditation',
    label: 'Media accreditation',
    path: '/media/accreditation',
    closedMessage: 'Media accreditation for Mash Event 2026 has closed.',
  },
  {
    key: 'exhibition_enquiry',
    label: 'Exhibition enquiry',
    path: '/exhibition',
    closedMessage: 'Exhibition enquiries for Mash Event 2026 have closed.',
  },
];

const FORM_CLOSED_MESSAGE = 'This form is closed.';

function getFormClosedMessage(key) {
  return (
    PUBLIC_FORMS.find((form) => form.key === key)?.closedMessage ||
    FORM_CLOSED_MESSAGE
  );
}

function isPublicFormKey(key) {
  return PUBLIC_FORMS.some((form) => form.key === key);
}

// Merges stored rows over the defaults. Unknown keys are ignored.
function buildFormStatuses(rows) {
  const byKey = new Map((rows || []).map((row) => [row.form_key, row]));
  return PUBLIC_FORMS.map((form) => {
    const row = byKey.get(form.key);
    return {
      ...form,
      open: row ? row.is_open !== false : true,
      updatedBy: row?.updated_by_email || null,
      updatedAt: row?.updated_at || null,
    };
  });
}

module.exports = {
  PUBLIC_FORMS,
  FORM_CLOSED_MESSAGE,
  getFormClosedMessage,
  isPublicFormKey,
  buildFormStatuses,
};
