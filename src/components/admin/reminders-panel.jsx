'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Download,
  FlaskConical,
  Mail,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import guestSendAttempt from '@/lib/guest-send-attempt.cjs';
import reminderEmail from '@/lib/reminder-email.cjs';
import reminderUtils from '@/lib/reminder-utils.cjs';
import {
  AdminAlert,
  AdminStatCard,
  AdminStatusBadge,
  AdminToast,
} from '@/components/admin/admin-ui';
import AdminPagination from '@/components/admin/admin-pagination';

const { RETRY_BEFORE_MS, canRetryGuestSend } = guestSendAttempt;
const {
  DEFAULT_REMINDER_BODY,
  DEFAULT_REMINDER_SUBJECT,
  PLACEHOLDERS,
  buildReminderEmail,
  daysUntilEvent,
  findUnknownPlaceholders,
} = reminderEmail;
const {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  isBulkSendable,
} = reminderUtils;

// Resend's documented rate limit is a few requests per second; a short gap
// between bulk sends keeps every request well inside it.
const BULK_SEND_GAP_MS = 700;

const STATE_LABELS = {
  not_sent: 'Not sent',
  sent: 'Sent',
  failed: 'Needs retry',
  sending: 'Sending',
};

const STATE_FILTERS = [
  { value: 'all', label: 'All confirmed' },
  { value: 'not_sent', label: 'Not sent' },
  { value: 'sent', label: 'Sent' },
  { value: 'attention', label: 'Needs attention' },
];

const EMPTY_FORM = { name: '', subject: '', body: '' };

const RECIPIENTS_PAGE_SIZE = 50;

// Lets typing stay instant while expensive work (filtering every recipient,
// rebuilding the preview iframe) waits for a pause.
function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function stateTone(state) {
  if (state === 'sent') return 'success';
  if (state === 'failed') return 'danger';
  if (state === 'sending') return 'warning';
  return 'default';
}

function matchesFilter(row, filter) {
  if (filter === 'all') return true;
  if (filter === 'attention') {
    return row.state === 'failed' || row.state === 'sending';
  }
  return row.state === filter;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function suggestedName(campaigns) {
  const base = `T-${daysUntilEvent()} reminder`;
  const taken = new Set(campaigns.map((campaign) => campaign.name));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
  }
}

function buttonStyle(primary = false, danger = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    padding: '9px 13px',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'var(--adm-mono)',
    letterSpacing: '.04em',
    border: `1px solid ${
      danger
        ? 'var(--adm-bad)'
        : primary
          ? 'var(--adm-accent)'
          : 'var(--adm-line-strong)'
    }`,
    background: danger
      ? 'var(--adm-bad-soft)'
      : primary
        ? 'var(--adm-accent)'
        : 'var(--adm-panel)',
    color: danger
      ? 'var(--adm-bad)'
      : primary
        ? 'var(--adm-accent-ink)'
        : 'var(--adm-ink)',
  };
}

function inputStyle() {
  return {
    width: '100%',
    border: '1px solid var(--adm-line-strong)',
    borderRadius: 10,
    background: 'var(--adm-panel)',
    color: 'var(--adm-ink)',
    padding: '10px 12px',
    fontSize: 13,
    outline: 'none',
    minHeight: 40,
  };
}

const FIELD_LABEL = {
  color: 'var(--adm-ink-2)',
  fontFamily: 'var(--adm-mono)',
  fontSize: 10,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
};

const CARD = {
  border: '1px solid var(--adm-line)',
  borderRadius: 10,
  background: 'var(--adm-panel)',
};

// The preview iframe is sandboxed, so the embedded logo and footer point at
// the same images on this site.
function emailPreviewHtml(html) {
  if (!html || typeof window === 'undefined') return '';
  const origin = window.location.origin;
  return html
    .replaceAll('cid:event-logo', `${origin}/img/email/event-logo.png`)
    .replaceAll('cid:event-footer', `${origin}/img/email/event-footer.jpeg`);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readJson(response, fallback) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) throw new Error(json.error || fallback);
  return json;
}

function SectionTitle({ children }) {
  return (
    <div style={{ color: 'var(--adm-ink)', fontSize: 14, fontWeight: 600 }}>
      {children}
    </div>
  );
}

export default function RemindersPanel({
  canManage,
  operatorEmail,
  operatorName,
}) {
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [recipients, setRecipients] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState('');
  const [bulk, setBulk] = useState(null);
  const [uploads, setUploads] = useState(null);
  const [toast, setToast] = useState(null);
  const [testTo, setTestTo] = useState(operatorEmail || '');
  const [testResult, setTestResult] = useState(null);
  const [clockNow, setClockNow] = useState(0);
  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const stopBulkRef = useRef(false);

  const campaign = saved?.campaign || null;
  const attachments = saved?.attachments || [];
  const dirty = Boolean(
    campaign &&
    (form.name !== campaign.name ||
      form.subject !== campaign.subject ||
      form.body !== campaign.body)
  );
  const working = Boolean(bulk?.running || uploads?.running);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    setError('');
    try {
      const response = await fetch('/api/admin/reminders', {
        cache: 'no-store',
      });
      const json = await readJson(response, 'Unable to load reminders.');
      setCampaigns(json.campaigns || []);
      return json.campaigns || [];
    } catch (loadError) {
      setError(loadError.message);
      return [];
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  const loadCampaign = useCallback(async (id) => {
    if (!id) return;
    try {
      const response = await fetch(`/api/admin/reminders/${id}`, {
        cache: 'no-store',
      });
      const json = await readJson(response, 'Unable to load reminder.');
      setSaved({ campaign: json.campaign, attachments: json.attachments });
      setForm({
        name: json.campaign.name,
        subject: json.campaign.subject,
        body: json.campaign.body,
      });
    } catch (loadError) {
      setToast({ tone: 'danger', message: loadError.message });
    }
  }, []);

  const loadRecipients = useCallback(async (id) => {
    if (!id) return;
    setLoadingRecipients(true);
    try {
      const response = await fetch(`/api/admin/reminders/${id}/recipients`, {
        cache: 'no-store',
      });
      const json = await readJson(response, 'Unable to load recipients.');
      setRecipients(json.recipients || []);
      setSummary(json.summary || null);
    } catch (loadError) {
      setToast({ tone: 'danger', message: loadError.message });
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch updates after an awaited request
    loadCampaigns().then((list) => {
      if (list.length) setSelectedId((current) => current || list.at(-1).id);
    });
  }, [loadCampaigns]);

  useEffect(() => {
    if (!selectedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-change updates after an awaited request
    loadCampaign(selectedId);
    loadRecipients(selectedId);
  }, [selectedId, loadCampaign, loadRecipients]);

  useEffect(() => {
    if (!toast?.message) return undefined;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!working && !dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [working, dirty]);

  const hasOpenAttempts = recipients.some((row) => row.state === 'sending');
  useEffect(() => {
    if (!hasOpenAttempts) return undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the retry clock immediately
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [hasOpenAttempts]);

  const previewName = useMemo(() => {
    const name = String(operatorName || '').trim();
    return name && !name.includes('@') ? name.split(/\s+/)[0] : 'there';
  }, [operatorName]);

  const previewSubject = useDebouncedValue(form.subject, 300);
  const previewBody = useDebouncedValue(form.body, 300);
  const preview = useMemo(() => {
    if (!previewSubject && !previewBody) return null;
    return buildReminderEmail({
      subject: previewSubject,
      body: previewBody,
      recipient: { firstName: previewName },
    });
  }, [previewSubject, previewBody, previewName]);
  const previewHtml = useMemo(
    () => emailPreviewHtml(preview?.html),
    [preview?.html]
  );

  const unknownPlaceholders = useMemo(
    () => findUnknownPlaceholders(`${form.subject}\n${form.body}`),
    [form.subject, form.body]
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(recipients.map((row) => row.category).filter(Boolean))
      ).sort(),
    [recipients]
  );

  const debouncedSearch = useDebouncedValue(search, 250);
  const visible = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return recipients.filter(
      (row) =>
        matchesFilter(row, filter) &&
        (category === 'all' || row.category === category) &&
        (!term ||
          `${row.firstName} ${row.lastName}`.toLowerCase().includes(term) ||
          row.email.toLowerCase().includes(term) ||
          row.organization.toLowerCase().includes(term))
    );
  }, [recipients, debouncedSearch, filter, category]);

  // Render one page of recipients at a time; any filter change starts at 1.
  const recipientFilterKey = `${selectedId}|${debouncedSearch}|${filter}|${category}`;
  const [recipientPaging, setRecipientPaging] = useState({ key: '', page: 1 });
  const recipientTotalPages = Math.max(
    1,
    Math.ceil(visible.length / RECIPIENTS_PAGE_SIZE)
  );
  const recipientPage = Math.min(
    recipientPaging.key === recipientFilterKey ? recipientPaging.page : 1,
    recipientTotalPages
  );
  const pagedRecipients = useMemo(
    () =>
      visible.slice(
        (recipientPage - 1) * RECIPIENTS_PAGE_SIZE,
        recipientPage * RECIPIENTS_PAGE_SIZE
      ),
    [visible, recipientPage]
  );

  const bulkQueue = useMemo(
    () => recipients.filter(isBulkSendable),
    [recipients]
  );
  const attachmentBytes = attachments.reduce(
    (total, attachment) => total + attachment.sizeBytes,
    0
  );

  function selectCampaign(id) {
    if (id === selectedId || working) return;
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    setSaved(null);
    setRecipients([]);
    setSummary(null);
    setBulk(null);
    setTestResult(null);
    setSelectedId(id);
  }

  async function createCampaign({ duplicate = false } = {}) {
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    setBusy(duplicate ? 'duplicate' : 'create');
    try {
      const response = await fetch('/api/admin/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          duplicate
            ? { duplicateFrom: selectedId, name: suggestedName(campaigns) }
            : {
                name: suggestedName(campaigns),
                subject: DEFAULT_REMINDER_SUBJECT,
                body: DEFAULT_REMINDER_BODY,
              }
        ),
      });
      const json = await readJson(response, 'Unable to create reminder.');
      setToast(
        json.warning
          ? { tone: 'warning', message: json.warning }
          : {
              tone: 'success',
              message: duplicate
                ? `Duplicated as ${json.campaign.name}. Edit the copy for this day, then save.`
                : `${json.campaign.name} created. Edit the copy, then save.`,
            }
      );
      await loadCampaigns();
      setSaved(null);
      setBulk(null);
      setTestResult(null);
      setSelectedId(json.campaign.id);
    } catch (createError) {
      setToast({ tone: 'danger', message: createError.message });
    } finally {
      setBusy('');
    }
  }

  async function saveCampaign(event) {
    event?.preventDefault();
    if (!campaign) return;
    setBusy('save');
    try {
      const response = await fetch(`/api/admin/reminders/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await readJson(response, 'Unable to save reminder.');
      setSaved((current) => ({ ...current, campaign: json.campaign }));
      setForm({
        name: json.campaign.name,
        subject: json.campaign.subject,
        body: json.campaign.body,
      });
      setToast({ tone: 'success', message: 'Reminder saved.' });
      await loadCampaigns();
    } catch (saveError) {
      setToast({ tone: 'danger', message: saveError.message });
    } finally {
      setBusy('');
    }
  }

  async function deleteCampaign() {
    if (!campaign) return;
    if (
      !window.confirm(
        `Remove "${campaign.name}" and its attachments? This cannot be undone.`
      )
    )
      return;
    setBusy('delete');
    try {
      const response = await fetch(`/api/admin/reminders/${campaign.id}`, {
        method: 'DELETE',
      });
      await readJson(response, 'Unable to remove reminder.');
      setToast({ tone: 'success', message: `${campaign.name} removed.` });
      const list = await loadCampaigns();
      setSaved(null);
      setRecipients([]);
      setSummary(null);
      setForm(EMPTY_FORM);
      setSelectedId(list.at(-1)?.id || '');
    } catch (deleteError) {
      setToast({ tone: 'danger', message: deleteError.message });
    } finally {
      setBusy('');
    }
  }

  function insertPlaceholder(key) {
    const token = `{{${key}}}`;
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? form.body.length;
    const end = textarea.selectionEnd ?? form.body.length;
    const body = form.body.slice(0, start) + token + form.body.slice(end);
    setForm((current) => ({ ...current, body }));
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function uploadAttachments(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || !campaign) return;
    const results = [];
    setUploads({ running: true, done: 0, total: files.length, results });
    for (const file of files) {
      try {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(
            `Larger than ${formatBytes(MAX_ATTACHMENT_BYTES)}. Compress it or share a link in the copy instead.`
          );
        }
        const body = new FormData();
        body.set('file', file);
        const response = await fetch(
          `/api/admin/reminders/${campaign.id}/attachments`,
          { method: 'POST', body }
        );
        await readJson(response, 'Upload failed.');
        results.push({ file: file.name, ok: true });
      } catch (uploadError) {
        results.push({
          file: file.name,
          ok: false,
          message: uploadError.message,
        });
      }
      setUploads({
        running: true,
        done: results.length,
        total: files.length,
        results: [...results],
      });
    }
    setUploads({
      running: false,
      done: results.length,
      total: files.length,
      results,
    });
    await loadCampaign(campaign.id);
    await loadCampaigns();
  }

  async function removeAttachment(attachment) {
    if (!window.confirm(`Remove ${attachment.filename} from this reminder?`)) {
      return;
    }
    setBusy(`attachment-${attachment.id}`);
    try {
      const response = await fetch(
        `/api/admin/reminders/${campaign.id}/attachments/${attachment.id}`,
        { method: 'DELETE' }
      );
      await readJson(response, 'Unable to remove attachment.');
      await loadCampaign(campaign.id);
      await loadCampaigns();
    } catch (removeError) {
      setToast({ tone: 'danger', message: removeError.message });
    } finally {
      setBusy('');
    }
  }

  async function sendTest(event) {
    event.preventDefault();
    if (!campaign) return;
    setBusy('test');
    try {
      const response = await fetch(`/api/admin/reminders/${campaign.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const json = await readJson(response, 'Unable to send test email.');
      const sentAt = new Intl.DateTimeFormat('en-IN', {
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date());
      setTestResult({
        ok: true,
        message: `Test sent to ${json.recipient} at ${sentAt}. Check that inbox (and spam) in a minute.`,
      });
    } catch (testError) {
      setTestResult({ ok: false, message: testError.message });
    } finally {
      setBusy('');
    }
  }

  // Sends carry the version on screen, so a save in another window stops
  // the run instead of mixing copy.
  async function postSend(row, { resend = false } = {}) {
    const response = await fetch(`/api/admin/reminders/${campaign.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        registrationId: row.id,
        resend,
        contentVersion: campaign.contentVersion,
      }),
    });
    return readJson(response, 'Unable to send reminder.');
  }

  async function sendOne(row) {
    const isResend = row.state === 'sent';
    const name = `${row.firstName} ${row.lastName}`.trim();
    if (
      !window.confirm(
        isResend
          ? `${name} has already been sent "${campaign.name}".\n\nSend it again to ${row.email}?`
          : `Send "${campaign.name}" to ${name} (${row.email})?`
      )
    )
      return;
    setBusy(`send-${row.id}`);
    try {
      await postSend(row, { resend: isResend });
      setToast({
        tone: 'success',
        message: `Reminder accepted for delivery to ${row.email}.`,
      });
    } catch (sendError) {
      setToast({ tone: 'danger', message: sendError.message });
    } finally {
      setBusy('');
      await Promise.all([loadRecipients(campaign.id), loadCampaigns()]);
    }
  }

  async function retryOne(row) {
    if (
      !window.confirm(
        `Retry the same send to ${row.email}? Resend uses the original attempt ID, so they cannot get a duplicate.`
      )
    )
      return;
    setBusy(`send-${row.id}`);
    try {
      const response = await fetch(
        `/api/admin/reminders/${campaign.id}/retry`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: row.id }),
        }
      );
      await readJson(response, 'Unable to retry this send safely.');
      setToast({ tone: 'success', message: 'The original send is confirmed.' });
    } catch (retryError) {
      setToast({ tone: 'danger', message: retryError.message });
    } finally {
      setBusy('');
      await loadRecipients(campaign.id);
    }
  }

  async function releaseOne(row) {
    if (
      !window.confirm(
        `This send to ${row.email} was never confirmed and can no longer be retried safely.\n\nCheck Resend first. If it did not go out, release it so you can send again. Release it?`
      )
    )
      return;
    setBusy(`send-${row.id}`);
    try {
      const response = await fetch(
        `/api/admin/reminders/${campaign.id}/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationId: row.id }),
        }
      );
      await readJson(response, 'Unable to release this send.');
      setToast({
        tone: 'success',
        message: `Released. ${row.email} can be sent this reminder again.`,
      });
    } catch (releaseError) {
      setToast({ tone: 'danger', message: releaseError.message });
    } finally {
      setBusy('');
      await loadRecipients(campaign.id);
    }
  }

  async function sendAll() {
    const queue = bulkQueue;
    if (!queue.length || !campaign) return;
    if (
      !window.confirm(
        `Send "${campaign.name}" to ${queue.length} confirmed registrant${queue.length === 1 ? '' : 's'} who have not had it yet?\n\nSubject: ${preview?.subject || campaign.subject}\nAttachments: ${attachments.length ? attachments.map((a) => a.filename).join(', ') : 'none'}\n\nPeople already sent this reminder are skipped.`
      )
    )
      return;

    stopBulkRef.current = false;
    const failures = [];
    let sent = 0;
    setBulk({ running: true, done: 0, total: queue.length, sent, failures });

    for (const [index, row] of queue.entries()) {
      if (stopBulkRef.current) break;
      try {
        await postSend(row);
        sent += 1;
      } catch (sendError) {
        failures.push({
          id: row.id,
          name: `${row.firstName} ${row.lastName}`.trim(),
          message: sendError.message,
        });
      }
      setBulk({
        running: true,
        done: index + 1,
        total: queue.length,
        sent,
        failures: [...failures],
      });
      if (index < queue.length - 1) await sleep(BULK_SEND_GAP_MS);
    }

    setBulk((current) => ({
      ...current,
      running: false,
      stopped: stopBulkRef.current,
    }));
    await Promise.all([loadRecipients(campaign.id), loadCampaigns()]);
  }

  const sendBlockedReason = dirty
    ? 'Save your changes before sending.'
    : unknownPlaceholders.length
      ? 'Fix the unknown placeholders before sending.'
      : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <section
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <p
          style={{
            margin: 0,
            maxWidth: 680,
            color: 'var(--adm-ink-3)',
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          Send countdown reminders to every confirmed registrant. Each reminder
          (T-10, T-7, …) has its own copy, attachments and send history.
          Duplicate the last one to start the next. Replies go to
          comms@example.org.
        </p>
        {canManage ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {campaign ? (
              <button
                type="button"
                disabled={working || Boolean(busy)}
                style={buttonStyle()}
                onClick={() => createCampaign({ duplicate: true })}
              >
                <Copy size={14} />{' '}
                {busy === 'duplicate' ? 'Duplicating…' : 'Duplicate this one'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={working || Boolean(busy)}
              style={buttonStyle(true)}
              onClick={() => createCampaign()}
            >
              <Plus size={14} />{' '}
              {busy === 'create' ? 'Creating…' : 'New reminder'}
            </button>
          </div>
        ) : null}
      </section>

      {!canManage ? (
        <AdminAlert
          tone="info"
          title="Read-only access"
          description="Reviewer accounts can view reminders and who has been sent them, but only an admin can edit or send."
        />
      ) : null}

      {error ? (
        <AdminAlert
          tone="danger"
          title="Could not load reminders"
          description={error}
          actions={
            <button type="button" style={buttonStyle()} onClick={loadCampaigns}>
              Try again
            </button>
          }
        />
      ) : null}

      {!loadingCampaigns && !campaigns.length && !error ? (
        <section
          style={{
            ...CARD,
            padding: '48px 20px',
            textAlign: 'center',
            color: 'var(--adm-ink-3)',
          }}
        >
          <Mail size={28} style={{ margin: '0 auto 10px' }} />
          <div>No reminders yet.</div>
          {canManage ? (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                disabled={Boolean(busy)}
                style={buttonStyle(true)}
                onClick={() => createCampaign()}
              >
                <Plus size={14} /> Create the {suggestedName(campaigns)}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {campaigns.length ? (
        <nav
          aria-label="Reminders"
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          {campaigns.map((item) => {
            const active = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                disabled={working && !active}
                onClick={() => selectCampaign(item.id)}
                style={{
                  ...CARD,
                  cursor: 'pointer',
                  padding: '9px 14px',
                  textAlign: 'left',
                  borderColor: active ? 'var(--adm-accent)' : 'var(--adm-line)',
                  boxShadow: active ? '0 0 0 1px var(--adm-accent)' : 'none',
                  color: 'var(--adm-ink)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</div>
                <div
                  style={{
                    marginTop: 3,
                    color: 'var(--adm-ink-3)',
                    fontSize: 11,
                    fontFamily: 'var(--adm-mono)',
                  }}
                >
                  {item.sentCount} sent
                  {item.attachmentCount
                    ? ` · ${item.attachmentCount} file${item.attachmentCount === 1 ? '' : 's'}`
                    : ''}
                </div>
              </button>
            );
          })}
        </nav>
      ) : null}

      {selectedId && !campaign ? (
        <p style={{ color: 'var(--adm-ink-3)', fontSize: 13, margin: 0 }}>
          Loading reminder…
        </p>
      ) : null}

      {campaign ? (
        <div
          className="adm-reminder-editor"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <form
            onSubmit={saveCampaign}
            style={{ ...CARD, padding: 18, display: 'grid', gap: 14 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <SectionTitle>Email copy</SectionTitle>
              {dirty ? (
                <AdminStatusBadge tone="warning">
                  Unsaved changes
                </AdminStatusBadge>
              ) : (
                <span style={{ color: 'var(--adm-ink-3)', fontSize: 11 }}>
                  Saved {formatDate(campaign.updatedAt)}
                </span>
              )}
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={FIELD_LABEL}>Reminder name (only you see this)</span>
              <input
                required
                maxLength={120}
                disabled={!canManage}
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                style={inputStyle()}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={FIELD_LABEL}>Subject</span>
              <input
                required
                maxLength={200}
                disabled={!canManage}
                value={form.subject}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
                style={inputStyle()}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={FIELD_LABEL}>Message</span>
              <textarea
                ref={bodyRef}
                required
                maxLength={10000}
                rows={16}
                disabled={!canManage}
                value={form.body}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
                style={{
                  ...inputStyle(),
                  minHeight: 320,
                  resize: 'vertical',
                  lineHeight: 1.55,
                  fontFamily: 'inherit',
                }}
              />
            </label>

            {canManage ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <span style={FIELD_LABEL}>Insert a personal detail</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PLACEHOLDERS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => insertPlaceholder(key)}
                      style={{
                        ...buttonStyle(),
                        padding: '6px 10px',
                        fontSize: 11,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p
                  style={{
                    margin: 0,
                    color: 'var(--adm-ink-3)',
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  Leave a blank line between paragraphs. Start lines with{' '}
                  <code>- </code> for a bullet list. <code>**bold**</code> for
                  bold, <code>[text](https://…)</code> for a link. Days to go is
                  counted on the day each email is sent.
                </p>
              </div>
            ) : null}

            {unknownPlaceholders.length ? (
              <AdminAlert
                tone="danger"
                title="Unknown placeholder"
                description={`${unknownPlaceholders
                  .map((key) => `{{${key}}}`)
                  .join(
                    ', '
                  )} will not be filled in. Use the buttons above to insert a supported one.`}
              />
            ) : null}

            <div
              style={{
                display: 'grid',
                gap: 8,
                paddingTop: 14,
                borderTop: '1px solid var(--adm-line)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <SectionTitle>Attachments</SectionTitle>
                <span style={{ color: 'var(--adm-ink-3)', fontSize: 11 }}>
                  {formatBytes(attachmentBytes || 0)} of{' '}
                  {formatBytes(MAX_TOTAL_ATTACHMENT_BYTES)}
                </span>
              </div>
              {attachments.length ? (
                attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      border: '1px solid var(--adm-line)',
                      borderRadius: 10,
                      padding: '8px 10px',
                      fontSize: 13,
                      color: 'var(--adm-ink-2)',
                    }}
                  >
                    <Paperclip size={14} />
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {attachment.filename}
                    </span>
                    <span style={{ color: 'var(--adm-ink-3)', fontSize: 11 }}>
                      {formatBytes(attachment.sizeBytes)}
                    </span>
                    <a
                      href={`/api/admin/reminders/${campaign.id}/attachments/${attachment.id}`}
                      aria-label={`Download ${attachment.filename}`}
                      style={{ ...buttonStyle(), padding: '6px 8px' }}
                    >
                      <Download size={13} />
                    </a>
                    {canManage ? (
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.filename}`}
                        disabled={working || Boolean(busy)}
                        onClick={() => removeAttachment(attachment)}
                        style={{
                          ...buttonStyle(false, true),
                          padding: '6px 8px',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div style={{ color: 'var(--adm-ink-3)', fontSize: 12 }}>
                  No attachments. Every registrant gets the same files.
                </div>
              )}
              {uploads ? (
                <div
                  role="status"
                  style={{ display: 'grid', gap: 3, fontSize: 12 }}
                >
                  <span style={{ color: 'var(--adm-ink-2)' }}>
                    {uploads.running
                      ? `Uploading… ${uploads.done} of ${uploads.total}`
                      : `Uploaded ${uploads.results.filter((r) => r.ok).length} of ${uploads.total}`}
                  </span>
                  {uploads.results
                    .filter((result) => !result.ok)
                    .map((result) => (
                      <span
                        key={result.file}
                        style={{ color: 'var(--adm-bad)' }}
                      >
                        {result.file}: {result.message}
                      </span>
                    ))}
                </div>
              ) : null}
              {canManage ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    multiple
                    hidden
                    onChange={(event) => {
                      uploadAttachments(event.target.files);
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    disabled={
                      working ||
                      Boolean(busy) ||
                      attachments.length >= MAX_ATTACHMENTS
                    }
                    onClick={() => fileInputRef.current?.click()}
                    style={buttonStyle()}
                  >
                    <Paperclip size={14} /> Add attachment
                  </button>
                  <span
                    style={{
                      marginLeft: 10,
                      color: 'var(--adm-ink-3)',
                      fontSize: 11,
                    }}
                  >
                    PDF, PNG or JPG · up to {formatBytes(MAX_ATTACHMENT_BYTES)}{' '}
                    each · {MAX_ATTACHMENTS} files
                  </span>
                </div>
              ) : null}
            </div>

            {canManage ? (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  paddingTop: 14,
                  borderTop: '1px solid var(--adm-line)',
                }}
              >
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    disabled={!dirty || Boolean(busy) || working}
                    style={{
                      ...buttonStyle(true),
                      opacity: !dirty || working ? 0.55 : 1,
                    }}
                  >
                    <Save size={14} />{' '}
                    {busy === 'save' ? 'Saving…' : 'Save changes'}
                  </button>
                  {dirty ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        setForm({
                          name: campaign.name,
                          subject: campaign.subject,
                          body: campaign.body,
                        })
                      }
                      style={buttonStyle()}
                    >
                      <RotateCcw size={14} /> Discard
                    </button>
                  ) : null}
                </div>
                {campaigns.find((item) => item.id === campaign.id)
                  ?.sentCount === 0 ? (
                  <button
                    type="button"
                    disabled={Boolean(busy) || working}
                    onClick={deleteCampaign}
                    style={buttonStyle(false, true)}
                  >
                    <Trash2 size={14} /> Remove reminder
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>

          <section style={{ ...CARD, padding: 18, display: 'grid', gap: 10 }}>
            <SectionTitle>Preview</SectionTitle>
            <div
              style={{
                color: 'var(--adm-ink-3)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <div>
                <strong style={{ color: 'var(--adm-ink-2)' }}>Subject:</strong>{' '}
                {preview?.subject || '—'}
              </div>
              <div>
                As {previewName === 'there' ? 'a registrant' : previewName}{' '}
                would see it today
                {attachments.length
                  ? ` · ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`
                  : ''}
              </div>
            </div>
            <iframe
              title="Reminder email preview"
              srcDoc={previewHtml}
              sandbox=""
              style={{
                width: '100%',
                height: 640,
                border: '1px solid var(--adm-line-strong)',
                borderRadius: 10,
                background: '#ffffff',
              }}
            />
            {canManage ? (
              <form onSubmit={sendTest} style={{ display: 'grid', gap: 8 }}>
                <label htmlFor="reminder-test-email" style={FIELD_LABEL}>
                  Send a test to
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    id="reminder-test-email"
                    type="email"
                    required
                    value={testTo}
                    onChange={(event) => setTestTo(event.target.value)}
                    placeholder="name@example.org"
                    style={{ ...inputStyle(), flex: 1 }}
                  />
                  <button
                    type="submit"
                    disabled={Boolean(busy) || Boolean(sendBlockedReason)}
                    style={buttonStyle()}
                  >
                    <FlaskConical size={14} />{' '}
                    {busy === 'test' ? 'Sending…' : 'Send test'}
                  </button>
                </div>
                {testResult ? (
                  <p
                    role="status"
                    style={{
                      margin: 0,
                      padding: '9px 12px',
                      borderRadius: 10,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: testResult.ok ? 'var(--adm-ok)' : 'var(--adm-bad)',
                      background: testResult.ok
                        ? 'var(--adm-ok-soft)'
                        : 'var(--adm-bad-soft)',
                    }}
                  >
                    {testResult.ok ? '✓ ' : ''}
                    {testResult.message}
                  </p>
                ) : null}
                <p
                  style={{ margin: 0, color: 'var(--adm-ink-3)', fontSize: 12 }}
                >
                  {sendBlockedReason ||
                    'The test uses the saved copy and attachments, is marked [TEST], and does not count as sent.'}
                </p>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}

      {campaign ? (
        <>
          {summary ? (
            <div
              className="adm-reminder-stats"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <AdminStatCard
                label="Confirmed registrants"
                value={summary.total}
              />
              <AdminStatCard
                label="Sent this reminder"
                value={summary.sent}
                tone="success"
              />
              <AdminStatCard
                label="Not sent yet"
                value={summary.notSent}
                tone="info"
              />
              <AdminStatCard
                label="Needs attention"
                value={summary.attention}
                tone={summary.attention ? 'warning' : 'default'}
              />
            </div>
          ) : null}

          {bulk ? (
            <AdminAlert
              tone={
                bulk.running
                  ? 'info'
                  : bulk.failures.length
                    ? 'warning'
                    : 'success'
              }
              title={
                bulk.running
                  ? `Sending reminders… ${bulk.done} of ${bulk.total}`
                  : `${bulk.stopped ? 'Stopped. ' : ''}${bulk.sent} reminder${bulk.sent === 1 ? '' : 's'} accepted for delivery`
              }
              description={
                bulk.failures.length ? (
                  <span style={{ display: 'grid', gap: 3, marginTop: 4 }}>
                    {bulk.failures.map((failure) => (
                      <span
                        key={failure.id}
                        style={{ display: 'block', color: 'var(--adm-bad)' }}
                      >
                        {failure.name}: {failure.message}
                      </span>
                    ))}
                  </span>
                ) : bulk.running ? (
                  'Keep this page open until sending finishes.'
                ) : null
              }
              actions={
                bulk.running ? (
                  <button
                    type="button"
                    style={buttonStyle(false, true)}
                    onClick={() => {
                      stopBulkRef.current = true;
                    }}
                  >
                    <Square size={14} /> Stop after this one
                  </button>
                ) : (
                  <button
                    type="button"
                    style={buttonStyle()}
                    onClick={() => setBulk(null)}
                  >
                    <X size={14} /> Dismiss
                  </button>
                )
              }
            />
          ) : null}

          <section style={{ ...CARD, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                padding: 18,
                borderBottom: '1px solid var(--adm-line)',
              }}
            >
              <div>
                <SectionTitle>Recipients</SectionTitle>
                <div
                  style={{
                    marginTop: 3,
                    color: 'var(--adm-ink-3)',
                    fontSize: 12,
                  }}
                >
                  Every confirmed registrant, read live. People confirmed later
                  appear here automatically.
                </div>
              </div>
              {canManage ? (
                <div style={{ display: 'grid', justifyItems: 'end', gap: 4 }}>
                  <button
                    type="button"
                    disabled={
                      working ||
                      Boolean(busy) ||
                      !bulkQueue.length ||
                      Boolean(sendBlockedReason)
                    }
                    style={{
                      ...buttonStyle(true),
                      fontFamily: 'var(--adm-sans)',
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: 0,
                      opacity:
                        working || !bulkQueue.length || sendBlockedReason
                          ? 0.55
                          : 1,
                    }}
                    onClick={sendAll}
                  >
                    <Send size={14} /> Send to all not yet sent (
                    {bulkQueue.length})
                  </button>
                  {sendBlockedReason ? (
                    <span style={{ color: 'var(--adm-warn)', fontSize: 11 }}>
                      {sendBlockedReason}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              className="adm-reminder-filters"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 1fr) 190px 190px',
                gap: 10,
                padding: 18,
                borderBottom: '1px solid var(--adm-line)',
              }}
            >
              <input
                aria-label="Search registrants"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, organisation…"
                style={inputStyle()}
              />
              <select
                aria-label="Filter by reminder status"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                style={inputStyle()}
              >
                {STATE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                style={inputStyle()}
              >
                <option value="all">All categories</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  minWidth: 860,
                }}
              >
                <thead>
                  <tr>
                    {[
                      'Registrant',
                      'Email',
                      'Category',
                      'Status',
                      'Last sent',
                      '',
                    ].map((heading) => (
                      <th
                        key={heading}
                        style={{
                          padding: '11px 16px',
                          textAlign: 'left',
                          borderBottom: '1px solid var(--adm-line)',
                          ...FIELD_LABEL,
                          color: 'var(--adm-ink-3)',
                        }}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingRecipients && !recipients.length ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ padding: 18, color: 'var(--adm-ink-3)' }}
                      >
                        Loading confirmed registrants…
                      </td>
                    </tr>
                  ) : null}
                  {!loadingRecipients && !visible.length ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: '40px 20px',
                          textAlign: 'center',
                          color: 'var(--adm-ink-3)',
                        }}
                      >
                        {recipients.length
                          ? 'No registrants match this filter.'
                          : 'No confirmed registrants yet.'}
                      </td>
                    </tr>
                  ) : null}
                  {pagedRecipients.map((row) => {
                    const retryReady =
                      row.state === 'sending' &&
                      canRetryGuestSend(row.activeAttempt, clockNow);
                    const releaseReady =
                      row.state === 'sending' &&
                      clockNow > 0 &&
                      clockNow -
                        Date.parse(row.activeAttempt?.created_at || '') >=
                        RETRY_BEFORE_MS;
                    const rowBusy = busy === `send-${row.id}`;
                    return (
                      <tr
                        key={row.id}
                        style={{ borderBottom: '1px solid var(--adm-line)' }}
                      >
                        <td
                          style={{
                            padding: '13px 16px',
                            color: 'var(--adm-ink)',
                            fontWeight: 500,
                          }}
                        >
                          {`${row.firstName} ${row.lastName}`.trim()}
                          {row.organization ? (
                            <div
                              style={{
                                marginTop: 3,
                                color: 'var(--adm-ink-3)',
                                fontSize: 12,
                                fontWeight: 400,
                              }}
                            >
                              {row.organization}
                            </div>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: '13px 16px',
                            color: 'var(--adm-ink-2)',
                            fontSize: 13,
                          }}
                        >
                          {row.email}
                        </td>
                        <td
                          style={{
                            padding: '13px 16px',
                            color: 'var(--adm-ink-3)',
                            fontSize: 12,
                          }}
                        >
                          {row.category || '—'}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <AdminStatusBadge tone={stateTone(row.state)}>
                            {STATE_LABELS[row.state] || row.state}
                          </AdminStatusBadge>
                          {row.state === 'sent' &&
                          row.lastSentVersion !== campaign.contentVersion ? (
                            <div
                              style={{
                                marginTop: 4,
                                color: 'var(--adm-ink-3)',
                                fontSize: 11,
                              }}
                            >
                              Got an earlier version of the copy
                            </div>
                          ) : null}
                          {row.lastError && row.state === 'failed' ? (
                            <div
                              style={{
                                marginTop: 4,
                                maxWidth: 240,
                                color: 'var(--adm-bad)',
                                fontSize: 11,
                              }}
                            >
                              {row.lastError}
                            </div>
                          ) : null}
                          {row.state === 'sending' &&
                          !retryReady &&
                          !releaseReady ? (
                            <div
                              style={{
                                marginTop: 4,
                                maxWidth: 240,
                                color: 'var(--adm-ink-3)',
                                fontSize: 11,
                              }}
                            >
                              Locked while the outcome is confirmed. A safe
                              retry opens after 10 minutes.
                            </div>
                          ) : null}
                        </td>
                        <td
                          style={{
                            padding: '13px 16px',
                            color: 'var(--adm-ink-3)',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row.lastSentAt
                            ? formatDate(row.lastSentAt)
                            : 'Not sent'}
                          {row.sendCount > 1 ? ` · ${row.sendCount}×` : ''}
                        </td>
                        <td
                          style={{
                            padding: '9px 16px',
                            textAlign: 'right',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {canManage && releaseReady ? (
                            <button
                              type="button"
                              disabled={working || Boolean(busy)}
                              style={buttonStyle(false, true)}
                              onClick={() => releaseOne(row)}
                            >
                              {rowBusy ? 'Releasing…' : 'Release'}
                            </button>
                          ) : null}
                          {canManage && retryReady ? (
                            <button
                              type="button"
                              disabled={working || Boolean(busy)}
                              style={buttonStyle()}
                              onClick={() => retryOne(row)}
                            >
                              {rowBusy ? 'Retrying…' : 'Retry safely'}
                            </button>
                          ) : null}
                          {canManage && row.state !== 'sending' ? (
                            <button
                              type="button"
                              disabled={
                                working ||
                                Boolean(busy) ||
                                Boolean(sendBlockedReason)
                              }
                              style={buttonStyle(row.state !== 'sent')}
                              onClick={() => sendOne(row)}
                            >
                              <Send size={14} />{' '}
                              {rowBusy
                                ? 'Sending…'
                                : row.state === 'sent'
                                  ? 'Resend'
                                  : 'Send'}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={recipientPage}
              pageSize={RECIPIENTS_PAGE_SIZE}
              total={visible.length}
              totalPages={recipientTotalPages}
              onPage={(page) =>
                setRecipientPaging({ key: recipientFilterKey, page })
              }
              label="matching registrants"
            />
          </section>
        </>
      ) : null}

      {/* Pinned so results are visible wherever you are on the page. */}
      {toast?.message ? (
        <div
          style={{
            position: 'fixed',
            right: 20,
            bottom: 20,
            zIndex: 60,
            width: 'min(420px, calc(100vw - 40px))',
            boxShadow: '0 12px 32px rgba(17,17,17,.12)',
            borderRadius: 10,
            background: 'var(--adm-panel)',
          }}
        >
          <AdminToast
            message={toast.message}
            tone={toast.tone}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}

      <style jsx>{`
        @media (max-width: 1100px) {
          .adm-reminder-editor {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 760px) {
          .adm-reminder-filters,
          .adm-reminder-stats {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
