const INVITATION_QR_PASS_TEMPLATE = 'invitation_v2';

function getQrPassTemplateVersion(environment = process.env) {
  return String(environment.QR_PASS_EMAIL_TEMPLATE_VERSION || '')
    .trim()
    .toLowerCase() === INVITATION_QR_PASS_TEMPLATE
    ? INVITATION_QR_PASS_TEMPLATE
    : 'legacy';
}

function isInvitationQrPassTemplateEnabled(environment = process.env) {
  return getQrPassTemplateVersion(environment) === INVITATION_QR_PASS_TEMPLATE;
}

module.exports = {
  INVITATION_QR_PASS_TEMPLATE,
  getQrPassTemplateVersion,
  isInvitationQrPassTemplateEnabled,
};
