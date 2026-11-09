function participantName(item) {
  const registration = item?.registration;
  return [registration?.first_name, registration?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function jobParticipantTitle(job, detailItems = []) {
  const items = detailItems.length ? detailItems : job?.recipient_preview || [];
  const name = items.map(participantName).find(Boolean);
  const count = Math.max(0, Number(job?.total_items) || items.length);

  if (name && count > 1) return `${name} + ${count - 1} others`;
  if (name) return name;
  if (count === 1) return '1 participant';
  if (count > 1) return `${count} participants`;
  return 'No participants';
}

module.exports = { jobParticipantTitle };
