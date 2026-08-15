// Set VITE_API_URL to your Express API origin (for example http://localhost:3000/api).
// The mock values below remain available when no API URL is configured or the API is offline.
const apiBaseUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '')

async function getJson(path) {
  if (!apiBaseUrl) return null
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    })
    if (!response.ok) throw new Error(`GET ${path} failed (${response.status})`)
    const payload = await response.json()
    return payload.data ?? payload
  } catch (error) {
    console.warn('Rally API unavailable; using mock data.', error)
    return null
  }
}

function normalizeCampaign(campaign) {
  const stats = campaign.stats ?? {}
  const event = campaign.event ?? {}
  return {
    ...campaign,
    name: event.name ?? campaign.name,
    shortName: campaign.shortName ?? campaign.short_name ?? event.name ?? campaign.name,
    venue: campaign.venue ?? event.venue ?? 'Venue pending',
    meta: campaign.meta ?? `${formatDate(event.startsAt ?? campaign.startsAt ?? campaign.date)} · ${event.capacity ?? campaign.capacity ?? 0} seats`,
    status: displayStatus(campaign.status ?? campaign.state ?? 'DRAFT'),
    confirmed: campaign.confirmed ?? stats.confirmed ?? 0,
    uncertain: campaign.uncertain ?? stats.uncertain ?? 0,
    declined: campaign.declined ?? stats.declined ?? 0,
    uncontacted: campaign.uncontacted ?? stats.uncontacted ?? 0,
  }
}

function displayStatus(status) {
  return String(status).toLowerCase().replace(/(^|_)([a-z])/g, (_match, prefix, letter) => `${prefix === '_' ? ' ' : ''}${letter.toUpperCase()}`)
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

function normalizeAttendee(attendee) {
  const response = attendee.responses?.[0]
  const status = displayStatus(attendee.status)
  const answers = [
    ['Attendance', response?.outcome ? displayStatus(response.outcome) : status],
    ['Arrival', response?.arrivalSlot ?? 'Not provided'],
    ['Parking', response?.parking === true ? 'Required' : response?.parking === false ? 'Not required' : 'Not provided'],
    ['Food', response?.foodPreference ?? 'Not provided'],
  ]
  return {
    id: attendee.id,
    name: attendee.name,
    meta: attendee.seat?.seatNumber ? `Seat ${attendee.seat.seatNumber}` : attendee.optedIn ? 'Phone contact consented' : 'No phone consent',
    phone: attendee.phone ?? 'No phone number',
    status,
    readiness: response?.callSummary ?? `Status: ${status}`,
    when: formatTime(response?.createdAt ?? attendee.updatedAt),
    answers,
  }
}

function composeDashboard({ attendees, preferences, tasks, waitlist, activity }) {
  const normalizedAttendees = attendees.map(normalizeAttendee)
  const offersByAttendee = new Map(waitlist.offers.map((offer) => [offer.attendeeId, offer]))
  return {
    groups: [
      { title: 'Arrival planning', rows: asRows(preferences.transportModes) },
      { title: 'Catering', rows: asRows(preferences.foodPreferences) },
      { title: 'Response health', rows: [['Escalations', String(preferences.escalations ?? 0)], ['Accessibility requests', String(preferences.accessibilityRequests ?? 0)], ['Total responses', String(preferences.totalResponses ?? 0)]] },
    ],
    tasks: tasks.map((task) => [task.summary, task.attendee?.name ?? '—', task.owner ?? 'Unassigned', displayStatus(task.status)]),
    activity: activity.map((item) => [formatTime(item.occurredAt), item.transcript ?? item.details?.message ?? `${item.attendee?.name ?? 'Attendee'} · ${displayStatus(item.eventType)}`]),
    attendees: normalizedAttendees,
    waitlist: waitlist.waitlist.map((attendee) => {
      const offer = offersByAttendee.get(attendee.id)
      return [String(attendee.waitlistRank ?? '—'), attendee.name, attendee.optedIn ? 'Phone contact consented' : 'No phone consent', displayStatus(offer?.status ?? attendee.status), offer?.expiresAt ? formatTime(offer.expiresAt) : 'On release']
    }),
  }
}

export const rallyApi = {
  async getCampaigns() {
    const payload = await getJson('/campaigns')
    if (payload) {
      const campaigns = Array.isArray(payload) ? payload : payload.campaigns ?? []
      return campaigns.map(normalizeCampaign)
    }
    return [
      { id: 'codex-build', name: 'Codex Community Build Hackathon', shortName: 'Codex Community Build', meta: 'Sat 14 Feb · 90 seats', venue: 'Prestige Tech Park, Bengaluru', status: 'Campaign live', confirmed: 64, uncertain: 8, declined: 6, uncontacted: 12 },
      { id: 'design-jam', name: 'Product Design Jam', shortName: 'Product Design Jam', meta: 'Thu 19 Feb · 42 seats', venue: 'Indiranagar Social, Bengaluru', status: 'Draft', confirmed: 25, uncertain: 4, declined: 2, uncontacted: 11 },
      { id: 'founder-dinner', name: 'Founders Dinner', shortName: 'Founders Dinner', meta: 'Wed 25 Feb · 30 seats', venue: 'The Leela Palace, Bengaluru', status: 'Complete', confirmed: 28, uncertain: 0, declined: 2, uncontacted: 0 },
    ]
  },
  async getCampaignDetails(campaignId = 'codex-build') {
    if (apiBaseUrl && campaignId) {
      const [campaignPayload, attendeesPayload, preferences, tasksPayload, waitlist, activityPayload] = await Promise.all([
        getJson(`/campaigns/${campaignId}`),
        getJson(`/campaigns/${campaignId}/attendees`),
        getJson(`/campaigns/${campaignId}/preferences-summary`),
        getJson(`/campaigns/${campaignId}/tasks`),
        getJson(`/campaigns/${campaignId}/waitlist`),
        getJson(`/campaigns/${campaignId}/activity`),
      ])
      if (campaignPayload && attendeesPayload && preferences && tasksPayload && waitlist && activityPayload) {
        return composeDashboard({
          attendees: attendeesPayload.attendees ?? [],
          preferences,
          tasks: tasksPayload.tasks ?? [],
          waitlist,
          activity: activityPayload.activity ?? [],
        })
      }
    }
    return {
      groups: [
        { title: 'Arrival planning', rows: [['Parking requests', '18'], ['Likely late', '11'], ['Metro or cab', '37']] },
        { title: 'Catering', rows: [['Vegetarian', '42'], ['Vegan', '6'], ['Other', '3'], ['Private alerts', '4']] },
        { title: 'Team health', rows: [['Solo, open to match', '5'], ['Teams short a member', '2'], ['Introductions made', '3']] },
      ],
      tasks: [
        ['Step-free route confirmation', 'Sneha Iyer', 'Meera K', 'Escalated'], ['Follow-up call, travel blocker', 'Divya Menon', 'Rally · 20:00', 'Scheduled'], ['Waitlist offer, seat 41', 'Aditi Sharma', 'Rally', 'Accepted'], ['Team match introduction', 'Priya Nair', 'Rally', 'Consent given'],
      ],
      activity: [['14:07', 'Aditi Sharma accepted the waitlist offer for seat 41.'], ['14:04', 'Waitlist offer placed to Aditi Sharma, first in queue.'], ['14:02', 'Ananya Rao declined and consented to release her seat.'], ['13:58', 'Catering count updated: 42 vegetarian, 6 vegan.'], ['13:31', 'Divya Menon flagged uncertain, follow-up set for 20:00.']],
      attendees: [
        { name: 'Ananya Rao', meta: 'Builder pass · Team Kestrel', phone: '+91 98450 22187', status: 'Declined', readiness: 'Seat released, waitlist triggered', when: '14:02', answers: [['Attendance', 'Not attending'], ['Reason', 'Work conflict'], ['Seat', 'Released with consent'], ['Language', 'Kannada']] },
        { name: 'Farhan Qureshi', meta: 'Builder pass · Team Kestrel', phone: '+91 99008 32347', status: 'Confirmed', readiness: 'Parking slot reserved', when: '13:47', answers: [['Attendance', 'Attending'], ['Arrival', '09:15'], ['Parking', 'Yes'], ['Food', 'Vegetarian']] },
        { name: 'Divya Menon', meta: 'Builder pass · Solo', phone: '+91 98999 88900', status: 'Uncertain', readiness: 'Follow-up scheduled for 20:00', when: '13:31', answers: [['Attendance', 'Likely attending'], ['Blocker', 'Travel approval'], ['Arrival', 'Unknown'], ['Food', 'Vegan']] },
        { name: 'Priya Nair', meta: 'Builder pass · Solo', phone: '+91 98123 22187', status: 'Confirmed', readiness: 'Open to a team introduction', when: '12:18', answers: [['Attendance', 'Attending'], ['Team', 'Open to match'], ['Arrival', '09:30'], ['Food', 'Vegetarian']] },
      ],
      waitlist: [['1', 'Aditi Sharma', 'Applied 2 Feb · solo', 'Accepted', '—'], ['2', 'Vikram Joshi', 'Applied 3 Feb · Team Aster', 'Queued', 'On release'], ['3', 'Nikita Patel', 'Applied 5 Feb · solo', 'Queued', 'On release']],
    }
  },
}
