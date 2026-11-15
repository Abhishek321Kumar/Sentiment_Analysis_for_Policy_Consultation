/**
 * PotentSim API Client
 * Interacts with PotentPolicy public & developer endpoints without touching any core logic.
 */

export async function fetchEmails() {
  const res = await fetch('/api/dev/emails');
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch outbox emails`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : (data.emails || []);
  return raw.slice().sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
}

export async function deleteEmail(id) {
  const res = await fetch(`/api/dev/emails/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to delete email`);
  return res.json();
}

export async function clearAllEmails() {
  const res = await fetch('/api/dev/emails', { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to clear emails`);
  return res.json();
}

export async function verifyStakeholder({ userId, orgCode }) {
  const res = await fetch('/api/participate/verify-stakeholder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, orgCode }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Verification failed`);
  }
  return data;
}

export async function fetchTokenDetails(token) {
  const res = await fetch(`/api/participate/token/${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 409 || data.alreadySubmitted) {
      return {
        ...data,
        alreadySubmitted: true,
        submission_status: 'SUBMITTED',
      };
    }
    const err = new Error(data.error || `HTTP ${res.status}: Failed to fetch consultation details`);
    err.status = data.status || data.campaignStatus;
    err.data = data;
    throw err;
  }
  return data;
}

export async function submitFeedback(token, answers) {
  const res = await fetch(`/api/participate/submit/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: Feedback submission failed`);
  }
  return data;
}

