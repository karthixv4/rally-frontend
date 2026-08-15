const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${response.status} ${response.statusText}`)
  return payload.data ?? payload
}

function displayStatus(status) {
  return String(status || 'DRAFT').toLowerCase().replace(/(^|_)([a-z])/g, (_match, prefix, letter) => `${prefix === '_' ? ' ' : ''}${letter.toUpperCase()}`)
}

function formatDate(value) {
  if (!value) return 'Date pending'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date)
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}

function asRows(counts = {}) {
  return Object.entries(counts).filter(([, value]) => value > 0).map(([label, value]) => [displayStatus(label), String(value)])
}

function normalizeCampaign(campaign) {
  const event = campaign.event ?? {}
  return {
    ...campaign,
    name: event.name ?? campaign.name,
    shortName: event.name ?? campaign.name,
    venue: event.venue ?? 'Venue pending',
    meta: `${formatDate(event.startsAt)} · ${event.capacity ?? 0} seats`,
    status: displayStatus(campaign.state),
    confirmed: 0,
    uncertain: 0,
    declined: 0,
    uncontacted: 0,
  }
}

function normalizeAttendee(attendee) {
  const response = attendee.responses?.[0]
  const status = displayStatus(attendee.status)
  return {
    id: attendee.id,
    name: attendee.name,
    meta: attendee.seat?.seatNumber ? `Seat ${attendee.seat.seatNumber}` : attendee.optedIn ? 'Phone contact consented' : 'No phone consent',
    phone: attendee.phone ?? 'No phone number',
    status,
    readiness: response?.callSummary ?? `Status: ${status}`,
    when: formatTime(response?.createdAt ?? attendee.updatedAt),
    answers: [
      ['Attendance', response?.outcome ? displayStatus(response.outcome) : status],
      ['Arrival', response?.arrivalSlot ?? 'Not provided'],
      ['Parking', response?.parking === true ? 'Required' : response?.parking === false ? 'Not required' : 'Not provided'],
      ['Food', response?.foodPreference ?? 'Not provided'],
      ['Accessibility', response?.accessibilityNeeds ?? 'Not provided'],
    ],
  }
}

function composeDashboard({ attendees, preferences, tasks, waitlist, activity }) {
  const normalizedAttendees = attendees.map(normalizeAttendee)
  const offersByAttendee = new Map((waitlist.offers ?? []).map((offer) => [offer.attendeeId, offer]))
  return {
    groups: [
      { title: 'Arrival planning', rows: asRows(preferences.transportModes) },
      { title: 'Catering', rows: asRows(preferences.foodPreferences) },
      { title: 'Response health', rows: [['Escalations', String(preferences.escalations ?? 0)], ['Accessibility requests', String(preferences.accessibilityRequests ?? 0)], ['Total responses', String(preferences.totalResponses ?? 0)]] },
    ],
    tasks: tasks.map((task) => [task.summary, task.attendee?.name ?? '—', task.owner ?? 'Unassigned', displayStatus(task.status)]),
    activity: activity.map((item) => [formatTime(item.occurredAt), item.transcript ?? item.details?.callSummary ?? `${item.attendee?.name ?? 'Attendee'} · ${displayStatus(item.eventType)}`]),
    attendees: normalizedAttendees,
    waitlist: (waitlist.waitlist ?? []).map((attendee) => {
      const offer = offersByAttendee.get(attendee.id)
      return [String(attendee.waitlistRank ?? '—'), attendee.name, attendee.optedIn ? 'Phone contact consented' : 'No phone consent', displayStatus(offer?.status ?? attendee.status), offer?.expiresAt ? formatTime(offer.expiresAt) : 'On release']
    }),
  }
}

export const rallyApi = {
  getCampaigns: async () => {
    const payload = await request('/campaigns')
    return (payload.campaigns ?? []).map(normalizeCampaign)
  },
  createCampaign: async (input) => {
    const payload = await request('/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    return normalizeCampaign({ ...payload.campaign, event: payload.event })
  },
  importExcel: async (campaignId, file) => {
    const form = new FormData()
    form.append('file', file)
    return request(`/campaigns/${campaignId}/attendees/import-excel`, { method: 'POST', body: form })
  },
  launchCampaign: async (campaignId, startTimestamp, endTimestamp) => request(`/campaigns/${campaignId}/sarvam/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startTimestamp, endTimestamp }) }),
  getCampaignDetails: async (campaignId) => {
    const [attendeesPayload, preferences, tasksPayload, waitlist, activityPayload] = await Promise.all([
      request(`/campaigns/${campaignId}/attendees`), request(`/campaigns/${campaignId}/preferences-summary`), request(`/campaigns/${campaignId}/tasks`), request(`/campaigns/${campaignId}/waitlist`), request(`/campaigns/${campaignId}/activity`),
    ])
    return composeDashboard({ attendees: attendeesPayload.attendees ?? [], preferences, tasks: tasksPayload.tasks ?? [], waitlist, activity: activityPayload.activity ?? [] })
  },
}
