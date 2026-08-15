const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '')

const apiListeners = new Set()
const pendingRequests = new Map()

function notifyApiListeners() {
  const requests = [...pendingRequests.values()]
  apiListeners.forEach((listener) => listener(requests))
}

function startRequest(label, path) {
  const id = `${Date.now()}-${Math.random()}`
  pendingRequests.set(id, { id, label, path })
  notifyApiListeners()
  return () => {
    pendingRequests.delete(id)
    notifyApiListeners()
  }
}

function requestLabel(path, method) {
  if (method === 'POST' && path === '/campaigns') return 'Creating campaign'
  if (path.includes('import-excel')) return 'Importing attendee workbook'
  if (path.includes('/sarvam/launch')) return 'Launching call campaign'
  if (path.includes('/sarvam/status')) return 'Updating campaign status'
  if (path.includes('/sarvam/execution-status')) return 'Checking call delivery status'
  if (path.endsWith('/attendees')) return 'Loading attendees'
  if (path.endsWith('/preferences-summary')) return 'Loading preference summary'
  if (path.endsWith('/tasks')) return 'Loading action queue'
  if (path.endsWith('/waitlist')) return 'Loading waitlist'
  if (path.endsWith('/activity')) return 'Loading call activity'
  if (path === '/campaigns') return 'Loading campaigns'
  return 'Loading campaign data'
}

export function subscribeToApiActivity(listener) {
  apiListeners.add(listener)
  listener([...pendingRequests.values()])
  return () => apiListeners.delete(listener)
}

const MOCK_CAMPAIGN = {
  id: 'mock-product-community-night',
  name: 'Product Community Night — Mock Event',
  shortName: 'Mock Community Night',
  venue: 'Mock venue · Bengaluru',
  meta: '22 Aug · 60 seats',
  status: 'Campaign live',
  confirmed: 38,
  uncertain: 7,
  declined: 4,
  uncontacted: 11,
  isMock: true,
}

const MOCK_DASHBOARD = {
  groups: [
    { title: 'Arrival planning', rows: [['Parking requests', '12'], ['Likely late', '6'], ['Metro or cab', '29']] },
    { title: 'Catering', rows: [['Vegetarian', '25'], ['Vegan', '5'], ['Other', '2'], ['Private alerts', '3']] },
    { title: 'Response health', rows: [['Escalations', '2'], ['Accessibility requests', '1'], ['Total responses', '49']] },
  ],
  tasks: [
    ['Confirm step-free entrance', 'Kavya Shah', 'Meera K', 'Open'],
    ['Follow up on travel plan', 'Rahul Iyer', 'Rally · 18:00', 'Scheduled'],
    ['Waitlist offer, seat 14', 'Nisha Patel', 'Rally', 'Accepted'],
  ],
  activity: [
    ['14:12', 'Nisha Patel accepted the waitlist offer for seat 14.'],
    ['14:04', 'Kavya Shah requested a step-free entrance route.'],
    ['13:48', 'Rahul Iyer confirmed and requested a parking spot.'],
    ['13:31', 'Aniket Bose declined and approved a seat release.'],
  ],
  responses: [
    { id: 'mock-response-kavya', attendeeName: 'Kavya Shah', outcome: 'CONFIRMED', transportMode: 'Metro', arrivalSlot: '18:30', foodPreference: 'Vegetarian', escalationFlag: true, callSummary: 'Kavya confirmed attendance and asked for the step-free entrance route.', createdAt: new Date().toISOString() },
  ],
  attendees: [
    { id: 'mock-kavya', name: 'Kavya Shah', meta: 'Phone contact consented', phone: '+91 98765 11220', status: 'Confirmed', readiness: 'Accessibility route needs organiser confirmation', when: '14:04', answers: [['Attendance', 'Confirmed'], ['Arrival', '18:30'], ['Parking', 'Not required'], ['Food', 'Vegetarian'], ['Accessibility', 'Step-free route']] },
    { id: 'mock-rahul', name: 'Rahul Iyer', meta: 'Phone contact consented', phone: '+91 98111 45320', status: 'Confirmed', readiness: 'Parking spot requested', when: '13:48', answers: [['Attendance', 'Confirmed'], ['Arrival', '19:00'], ['Parking', 'Required'], ['Food', 'Vegan'], ['Accessibility', 'Not provided']] },
    { id: 'mock-aniket', name: 'Aniket Bose', meta: 'Phone contact consented', phone: '+91 99000 84313', status: 'Declined', readiness: 'Seat released with consent', when: '13:31', answers: [['Attendance', 'Declined'], ['Arrival', 'Not attending'], ['Parking', 'Not provided'], ['Food', 'Not provided'], ['Accessibility', 'Not provided']] },
    { id: 'mock-sana', name: 'Sana Mirza', meta: 'Phone contact consented', phone: '+91 98220 15642', status: 'Uncertain', readiness: 'Follow-up scheduled for 18:00', when: '13:20', answers: [['Attendance', 'Likely attending'], ['Arrival', 'Unknown'], ['Parking', 'Not required'], ['Food', 'Vegetarian'], ['Accessibility', 'Not provided']] },
  ],
  waitlist: [
    ['1', 'Nisha Patel', 'Phone contact consented', 'Accepted', '—'],
    ['2', 'Varun Rao', 'Phone contact consented', 'Queued', 'On release'],
    ['3', 'Ishita Singh', 'Phone contact consented', 'Queued', 'On release'],
  ],
  execution: { schedulerState: 'calling_window_open', hasSarvamSchedule: true, schedule: { startsAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString() }, attendees: { total: 60, eligible: 49, notOptedIn: 6, waitlistedOrReleased: 5, missingPhone: 0, awaitingCallOrResult: 11 }, results: { total: 38, confirmed: 28, declined: 4, uncertain: 6, unavailable: 0 }, latestActivity: { eventType: 'call_completed', occurredAt: new Date().toISOString(), attendeeName: 'Nisha Patel' } },
}

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration))

async function request(path, options = {}) {
  const method = options.method ?? 'GET'
  const finish = startRequest(requestLabel(path, method), path)
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers: { Accept: 'application/json', ...options.headers },
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const error = new Error(payload.error || `${response.status} ${response.statusText}`)
      error.details = payload
      throw error
    }
    return payload.data ?? payload
  } finally {
    finish()
  }
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
    isLaunched: Boolean(campaign.sarvamCampaignId) || ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(campaign.state),
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
    response: response ? {
      outcome: response.outcome,
      transportMode: response.transportMode,
      arrivalSlot: response.arrivalSlot,
      parking: response.parking,
      foodPreference: response.foodPreference,
      dietaryRequirements: response.dietaryRequirements,
      accessibilityNeeds: response.accessibilityNeeds,
      escalationFlag: response.escalationFlag,
      callSummary: response.callSummary,
      createdAt: response.createdAt,
    } : null,
    answers: [
      ['Attendance', response?.outcome ? displayStatus(response.outcome) : status],
      ['Arrival', response?.arrivalSlot ?? 'Not provided'],
      ['Parking', response?.parking === true ? 'Required' : response?.parking === false ? 'Not required' : 'Not provided'],
      ['Food', response?.foodPreference ?? 'Not provided'],
      ['Accessibility', response?.accessibilityNeeds ?? 'Not provided'],
    ],
  }
}

function composeDashboard({ attendees, preferences, tasks, waitlist, activity, execution, sarvamCampaign }) {
  const normalizedAttendees = attendees.map(normalizeAttendee)
  const responses = attendees.flatMap((attendee) => (attendee.responses ?? []).map((response) => ({
    id: response.id,
    attendeeName: attendee.name,
    outcome: response.outcome,
    transportMode: response.transportMode,
    arrivalSlot: response.arrivalSlot,
    foodPreference: response.foodPreference,
    escalationFlag: response.escalationFlag,
    callSummary: response.callSummary,
    createdAt: response.createdAt,
  }))).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const offersByAttendee = new Map((waitlist.offers ?? []).map((offer) => [offer.attendeeId, offer]))
  return {
    groups: [
      { title: 'Travel plans', rows: asRows(preferences.transportModes) },
      { title: 'Food preferences', rows: asRows(preferences.foodPreferences) },
      { title: 'Needs attention', rows: [['Escalations', String(preferences.escalations ?? 0)], ['Accessibility', String(preferences.accessibilityRequests ?? 0)], ['Responses', String(preferences.totalResponses ?? 0)]] },
    ],
    tasks: tasks.map((task) => [task.summary, task.attendee?.name ?? '—', task.owner ?? 'Unassigned', displayStatus(task.status)]),
    activity: activity.map((item) => [formatTime(item.occurredAt), item.transcript ?? item.details?.callSummary ?? `${item.attendee?.name ?? 'Attendee'} · ${displayStatus(item.eventType)}`]),
    attendees: normalizedAttendees,
    responses,
    sarvamCampaign,
    waitlist: (waitlist.waitlist ?? []).map((attendee) => {
      const offer = offersByAttendee.get(attendee.id)
      return [String(attendee.waitlistRank ?? '—'), attendee.name, attendee.optedIn ? 'Phone contact consented' : 'No phone consent', displayStatus(offer?.status ?? attendee.status), offer?.expiresAt ? formatTime(offer.expiresAt) : 'On release']
    }),
    execution,
  }
}

export const rallyApi = {
  getCampaigns: async () => {
    try {
      const payload = await request('/campaigns')
      return [...(payload.campaigns ?? []).map(normalizeCampaign), MOCK_CAMPAIGN]
    } catch (error) {
      console.warn('Campaign API unavailable; showing explicit mock campaign.', error)
      return [MOCK_CAMPAIGN]
    }
  },
  createCampaign: async (input) => {
    const payload = await request('/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    return normalizeCampaign({ ...payload.campaign, event: payload.event })
  },
  updateCampaign: async (campaignId, input) => {
    const payload = await request(`/campaigns/${campaignId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    return normalizeCampaign(payload.campaign)
  },
  deleteCampaign: (campaignId) => request(`/campaigns/${campaignId}`, { method: 'DELETE' }),
  importExcel: async (campaignId, file) => {
    const form = new FormData()
    form.append('file', file)
    return request(`/campaigns/${campaignId}/attendees/import-excel`, { method: 'POST', body: form })
  },
  launchCampaign: async (campaignId, startTimestamp, endTimestamp, options = {}) => request(`/campaigns/${campaignId}/sarvam/launch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startTimestamp, endTimestamp, ...options }) }),
  updateCampaignStatus: async (campaignId, action) => {
    const payload = await request(`/campaigns/${campaignId}/sarvam/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    return { campaign: normalizeCampaign(payload.campaign), message: payload.message }
  },
  getCampaignDetails: async (campaignId) => {
    if (campaignId === MOCK_CAMPAIGN.id) {
      const finish = startRequest('Loading explicit mock campaign data', 'mock://campaign-details')
      try {
        await sleep(450)
        return MOCK_DASHBOARD
      } finally {
        finish()
      }
    }
    const [attendeesPayload, preferences, tasksPayload, waitlist, activityPayload, executionPayload, sarvamStatusPayload] = await Promise.all([
      request(`/campaigns/${campaignId}/attendees`), request(`/campaigns/${campaignId}/preferences-summary`), request(`/campaigns/${campaignId}/tasks`), request(`/campaigns/${campaignId}/waitlist`), request(`/campaigns/${campaignId}/activity`),
      request(`/campaigns/${campaignId}/sarvam/execution-status`),
      request(`/campaigns/${campaignId}/sarvam/status`),
    ])
    return composeDashboard({ attendees: attendeesPayload.attendees ?? [], preferences, tasks: tasksPayload.tasks ?? [], waitlist, activity: activityPayload.activity ?? [], execution: executionPayload.execution, sarvamCampaign: sarvamStatusPayload.sarvamCampaign })
  },
}
