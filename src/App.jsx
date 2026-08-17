import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, Download, Flag, LayoutDashboard, ListPlus, LoaderCircle, LogOut, Menu, Pause, Plus, RefreshCw, Rocket, SlidersHorizontal, Trash2, Upload, Users } from 'lucide-react'
import { authStore, rallyApi, subscribeToApiActivity } from './data/rallyApi'

const navItems = [
  ['operations', 'Operations', LayoutDashboard], ['setup', 'Campaign setup', SlidersHorizontal], ['attendees', 'Attendees', Users], ['waitlist', 'Waitlist recovery', ListPlus], ['summary', 'Summary', Flag],
]
const statusClass = (status) => status === 'Confirmed' || status === 'Campaign live' || status === 'Accepted' ? 'accent' : 'neutral'
const displayStatus = (status) => String(status || 'DRAFT').toLowerCase().replace(/(^|_)([a-z])/g, (_match, prefix, letter) => `${prefix === '_' ? ' ' : ''}${letter.toUpperCase()}`)
const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
const formatDuration = (seconds) => {
  const total = Math.round(Number(seconds || 0))
  if (!total) return '—'
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`
}
const attemptDescription = (attempt) => {
  if (attempt.failureReason) return displayStatus(attempt.failureReason)
  if (String(attempt.endedBy || '').toUpperCase() === 'NO_END_REASON') return 'No completion reason reported'
  if (attempt.endedBy) return `Ended by ${displayStatus(attempt.endedBy)}`
  return 'No delivery issue reported'
}
const formatDateTime = (value) => {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not scheduled' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
const scheduledWindow = () => {
  // Sarvam enforces a 10-minute lead time. Pick the next normal calling period
  // rather than quietly creating an unusable evening or overnight schedule.
  const start = new Date(Date.now() + 15 * 60 * 1000)
  start.setSeconds(0, 0)
  if (start.getHours() >= 18) start.setDate(start.getDate() + 1)
  if (start.getHours() >= 18 || start.getHours() < 9) start.setHours(9, 15, 0, 0)
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000)
  return { startTimestamp: start.toISOString(), endTimestamp: end.toISOString() }
}
const asLocalDateTimeInput = (value) => {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}
const defaultCallWindow = () => {
  const { startTimestamp, endTimestamp } = scheduledWindow()
  return { start: asLocalDateTimeInput(startTimestamp), end: asLocalDateTimeInput(endTimestamp) }
}

function App() {
  const [campaigns, setCampaigns] = useState([])
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [details, setDetails] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [view, setView] = useState('events')
  const [selectedPerson, setSelectedPerson] = useState(null)
  const [mobileNav, setMobileNav] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingRequests, setPendingRequests] = useState([])
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => subscribeToApiActivity(setPendingRequests), [])
  const refreshCampaigns = async () => {
    try {
      const items = await rallyApi.getCampaigns()
      setCampaigns(items)
      return items
    } catch (loadError) {
      setError(loadError.message)
      return []
    }
  }
  const refreshEvents = async () => {
    try {
      const items = await rallyApi.getEvents()
      setEvents(items)
      return items
    } catch (loadError) {
      setError(loadError.message)
      return []
    }
  }
  useEffect(() => {
    let active = true
    if (!authStore.getToken()) {
      setAuthLoading(false)
      setLoading(false)
      return () => { active = false }
    }
    rallyApi.me().then((currentUser) => {
      if (active) setUser(currentUser)
    }).catch(() => {
      authStore.clear()
    }).finally(() => {
      if (active) setAuthLoading(false)
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!user) return undefined
    let active = true
    Promise.all([rallyApi.getCampaigns(), rallyApi.getEvents()]).then(([campaignItems, eventItems]) => {
      if (!active) return
      setCampaigns(campaignItems)
      setEvents(eventItems)
      setLoading(false)
    }).catch((loadError) => {
      if (!active) return
      setError(loadError.message)
      setLoading(false)
    })
    return () => { active = false }
  }, [user])
  const chooseCampaign = async (item) => {
    try {
      setError('')
      setCampaign(item)
      setDetails(null)
      setView('operations')
      setMobileNav(false)
      setSelectedPerson(null)
      setDetails(await rallyApi.getCampaignDetails(item.id))
    } catch (loadError) { setError(loadError.message) }
  }
  const openNew = (event = selectedEvent) => { setCampaign(null); setSelectedEvent(event || null); setView('new'); setMobileNav(false) }
  const chooseEvent = (event) => { setSelectedEvent(event); setCampaign(null); setDetails(null); setView('event-campaigns'); setMobileNav(false) }
  const handleEventCreated = async (event) => {
    setEvents((current) => [event, ...current])
    chooseEvent(event)
  }
  const handleCreated = async (createdCampaign) => {
    setCampaigns((current) => [createdCampaign, ...current])
    await refreshEvents()
    await chooseCampaign(createdCampaign)
  }
  const handleCampaignUpdated = (updatedCampaign) => {
    setCampaign(updatedCampaign)
    setCampaigns((current) => current.map((item) => item.id === updatedCampaign.id ? updatedCampaign : item))
  }
  const handleCampaignDeleted = (campaignId) => {
    setCampaigns((current) => current.filter((item) => item.id !== campaignId))
    setCampaign(null)
    setDetails(null)
    setSelectedPerson(null)
    setView('event-campaigns')
  }
  const refreshCampaignDetails = async (selectedCampaign = campaign) => {
    if (!selectedCampaign || selectedCampaign.isMock) return
    try {
      setError('')
      const [freshDetails, refreshedCampaigns] = await Promise.all([
        rallyApi.getCampaignDetails(selectedCampaign.id),
        rallyApi.getCampaigns()
      ])
      setDetails(freshDetails)
      setCampaigns(refreshedCampaigns)
      const refreshedCampaign = refreshedCampaigns.find((item) => item.id === selectedCampaign.id)
      if (refreshedCampaign) setCampaign(refreshedCampaign)
    } catch (loadError) { setError(loadError.message) }
  }
  const signOut = () => {
    rallyApi.logout()
    setUser(null)
    setCampaigns([])
    setCampaign(null)
    setDetails(null)
    setSelectedEvent(null)
    setView('events')
  }
  if (authLoading) return <PageLoader requests={pendingRequests} />
  if (!user) return <AuthScreen onAuthenticated={(currentUser) => { setUser(currentUser); setLoading(true) }} />
  if (loading) return <PageLoader requests={pendingRequests} />

  return <div className={`app-shell ${mobileNav ? 'mobile-nav-open' : ''}`}>
    <button className="menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation" aria-expanded={mobileNav}><Menu size={20} /></button>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <Sidebar campaign={campaign} view={view} user={user} onSignOut={signOut} onNavigate={(nextView) => { setView(nextView); setMobileNav(false) }} onHome={() => { setSelectedEvent(null); setView('events'); setMobileNav(false); Promise.all([refreshCampaigns(), refreshEvents()]) }} open={mobileNav} />
    <main className="main-content">
      <ApiActivity requests={pendingRequests} />
      {error && <div className="error-banner">{error}</div>}
      {view === 'events' && <Events events={events} onChoose={chooseEvent} onNew={() => { setSelectedEvent(null); setView('new-event') }} />}
      {view === 'new-event' && <NewEvent onBack={() => setView('events')} onCreated={handleEventCreated} />}
      {view === 'event-campaigns' && selectedEvent && <EventCampaigns event={selectedEvent} campaigns={campaigns.filter((item) => item.eventId === selectedEvent.id)} onBack={() => setView('events')} onChoose={chooseCampaign} onNew={() => openNew(selectedEvent)} />}
      {view === 'new' && <NewCampaign initialEvent={selectedEvent} onBack={() => setView(selectedEvent ? 'event-campaigns' : 'events')} onCreated={handleCreated} />}
      {campaign && details && view === 'operations' && <Operations campaign={campaign} details={details} onCampaignUpdated={handleCampaignUpdated} onRefresh={refreshCampaignDetails} onDeleted={handleCampaignDeleted} />}
      {campaign && !details && view === 'operations' && <DetailsLoader campaign={campaign} requests={pendingRequests} />}
      {campaign && view === 'setup' && <Setup campaign={campaign} />}
      {campaign && view === 'attendees' && <Attendees people={details?.attendees ?? []} selected={selectedPerson} onSelect={setSelectedPerson} />}
      {campaign && view === 'waitlist' && <Waitlist rows={details?.waitlist ?? []} />}
      {campaign && details && view === 'summary' && <Summary details={details} />}
    </main>
  </div>
}

function Sidebar({ campaign, view, user, onSignOut, onNavigate, onHome, open }) { return <aside className={`sidebar ${open ? 'is-open' : ''}`}>
  <div className="brand"><strong>Rally</strong><span>Event readiness agent</span></div>
  <nav><button className={view === 'events' || view === 'event-campaigns' || view === 'new-event' ? 'active' : ''} onClick={onHome}><LayoutDashboard size={16} />All events</button>
  {campaign && <><div className="nav-label">{campaign.shortName}</div>{navItems.filter(([id]) => id !== 'setup' || !campaign.isLaunched).map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={16} />{label}</button>)}</>}</nav>
  {campaign && <div className="campaign-state"><b>{campaign.shortName}</b><span>{campaign.meta}</span><small><i /> {campaign.status}</small></div>}
  <div className="account-card"><span>{user.name || user.email}</span><button onClick={onSignOut}><LogOut size={14} />Sign out</button></div>
</aside> }

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    try {
      setBusy(true); setError('')
      const currentUser = mode === 'login'
        ? await rallyApi.login({ email: form.email, password: form.password })
        : await rallyApi.signup(form)
      onAuthenticated(currentUser)
    } catch (authError) { setError(authError.message) } finally { setBusy(false) }
  }
  const isSignup = mode === 'signup'
  return <main className="auth-shell"><section className="auth-story"><div className="auth-brand"><strong>Rally</strong><span>Event readiness agent</span></div><div className="auth-copy"><small>EVENT OPERATIONS, MADE CLEAR</small><h1>Every RSVP becomes a decision you can act on.</h1><p>Bring your attendee list, let Rally coordinate voice outreach, and see the readiness of every event in one calm workspace.</p></div><div className="auth-orbit" aria-hidden="true"><i /><i /><i /><div><span>CALL DELIVERY</span><b>RSVP, without the chase.</b></div></div><div className="auth-signals"><span>Consent-aware calls</span><span>Live response capture</span><span>Organiser follow-ups</span></div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="auth-kicker">WELCOME TO RALLY</div><h2>{isSignup ? 'Create your workspace' : 'Welcome back'}</h2><p>{isSignup ? 'Start organising your events with a secure Rally account.' : 'Sign in to continue to your event operations.'}</p><div className="auth-mode"><button className={!isSignup ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Sign in</button><button className={isSignup ? 'active' : ''} onClick={() => { setMode('signup'); setError('') }}>Create account</button></div><form onSubmit={submit}>{isSignup && <label>Name<input value={form.name} onChange={update('name')} placeholder="Your name" autoComplete="name" /></label>}<label>Email<input required type="email" value={form.email} onChange={update('email')} placeholder="you@company.com" autoComplete="email" /></label><label>Password<input required type="password" minLength="8" value={form.password} onChange={update('password')} placeholder="At least 8 characters" autoComplete={isSignup ? 'new-password' : 'current-password'} /></label>{error && <div className="error-banner">{error}</div>}<Button type="submit" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in to Rally'}</Button></form><small className="auth-security">Your account is protected with a signed session. Use a unique password of at least 8 characters.</small></div></section></main>
}

function Events({ events, onChoose, onNew }) { return <section><Header kicker="Events" title="Your event workspace" description="Create an event first, then run one or more audience campaigns inside it." action={<Button icon={Plus} onClick={onNew}>New event</Button>} />
  {!events.length ? <div className="empty-workspace"><span><Plus size={22} /></span><h2>Create your first event</h2><p>An event is the home for its venue, date, capacity, attendee roster, and every campaign you run for it.</p><Button icon={Plus} onClick={onNew}>Create event</Button></div> : <div className="event-grid">{events.map((event) => <button className="event-card" key={event.id} onClick={() => onChoose(event)}><div className="card-top"><div><small>EVENT</small><h2>{event.name}</h2><p>{formatDateTime(event.startsAt)} · {event.venue || 'Venue pending'}</p></div><Tag type="neutral">{event._count?.campaigns ?? 0} campaign{(event._count?.campaigns ?? 0) === 1 ? '' : 's'}</Tag></div><div className="event-card-footer"><span>{event.capacity ?? '—'} seats</span><span>{event._count?.attendees ?? 0} attendees</span><b>Open event →</b></div></button>)}</div>}</section> }

function NewEvent({ onBack, onCreated }) {
  const [form, setForm] = useState({ name: '', startsAt: '', venue: '', capacity: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const submit = async (event) => {
    event.preventDefault()
    try {
      setBusy(true); setError('')
      if (!form.name || !form.startsAt || !form.venue || !form.capacity) throw new Error('Complete the event name, date, venue, and capacity first.')
      await onCreated(await rallyApi.createEvent({ ...form, startsAt: new Date(form.startsAt).toISOString(), capacity: Number(form.capacity) }))
    } catch (createError) { setError(createError.message) } finally { setBusy(false) }
  }
  return <section><button className="back" onClick={onBack}><ArrowLeft size={15} />All events</button><Header kicker="New event" title="Start with the event" description="Set the shared details once. You can add separate RSVP, reminder, or follow-up campaigns afterwards." /><form className="event-form" onSubmit={submit}><div><small>EVENT DETAILS</small><h2>Create an event workspace</h2><p>Campaigns, attendees, and call outcomes will stay organised under this event.</p></div><div className="form-grid"><label>Event name<input required value={form.name} onChange={update('name')} placeholder="Codex Community Build Hackathon" /></label><DateTimePicker value={form.startsAt} onChange={(startsAt) => setForm((current) => ({ ...current, startsAt }))} /><label>Venue<input required value={form.venue} onChange={update('venue')} placeholder="Prestige Tech Park, Bengaluru" /></label><label>Capacity<input required type="number" min="1" value={form.capacity} onChange={update('capacity')} placeholder="90" /></label></div>{error && <div className="error-banner">{error}</div>}<div className="wizard-actions"><Button variant="secondary" type="button" onClick={onBack}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</Button></div></form></section>
}

function DateTimePicker({ value, onChange }) {
  const inputRef = useRef(null)
  const openPicker = () => {
    const input = inputRef.current
    if (!input) return
    if (typeof input.showPicker === 'function') input.showPicker()
    else input.focus()
  }
  return <label className="date-time-picker"><span className="picker-label">Event date and start time</span><div className="datetime-single-field" onClick={openPicker}><input ref={inputRef} required type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} onClick={(event) => { event.stopPropagation(); openPicker() }} /><CalendarDays size={17} aria-hidden="true" /></div><small>Click anywhere in this field to choose the date and time.</small></label>
}

function EventCampaigns({ event, campaigns, onBack, onChoose, onNew }) { return <section><button className="back" onClick={onBack}><ArrowLeft size={15} />All events</button><Header kicker="Event workspace" title={event.name} description={`${formatDateTime(event.startsAt)} · ${event.venue || 'Venue pending'} · ${event.capacity ?? '—'} seats`} action={<Button icon={Plus} onClick={onNew}>New campaign</Button>} /><div className="event-overview"><Stat number={campaigns.length} label="campaigns" /><Stat number={campaigns.reduce((sum, item) => sum + (item.attendeeCount || 0), 0)} label="attendees" /><Stat number={campaigns.reduce((sum, item) => sum + (item.confirmed || 0), 0)} label="confirmed" /></div>{campaigns.length ? <div className="campaign-grid">{campaigns.map(c => <button className="campaign-card" key={c.id} onClick={() => onChoose(c)}><div className="card-top"><div><small>CAMPAIGN</small><h2>{c.name}</h2><p>{c.attendeeCount ? `${c.attendeeCount} attendees` : 'No attendees yet'}</p></div><Tag type={statusClass(c.status)}>{c.status}</Tag></div><div className="mini-stats"><Stat number={c.confirmed} label="confirmed" /><Stat number={c.declined} label="declined" /><Stat number={c.uncontacted} label="awaiting result" /></div><Progress values={[c.confirmed, c.declined, c.uncontacted]} /></button>)}</div> : <div className="empty-workspace compact"><span><Rocket size={21} /></span><h2>Ready for the first campaign?</h2><p>Import an attendee cohort and set the questions Rally should collect on the call.</p><Button icon={Plus} onClick={onNew}>Create campaign</Button></div>}</section> }

function NewCampaign({ onBack, onCreated, initialEvent = null }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ eventName: '', startsAt: '', venue: '', capacity: '', campaignName: '' })
  const [events, setEvents] = useState([])
  const [eventMode, setEventMode] = useState(initialEvent ? 'existing' : 'new')
  const [eventId, setEventId] = useState(initialEvent?.id ?? '')
  const [file, setFile] = useState(null)
  const [createdCampaign, setCreatedCampaign] = useState(null)
  const [attendees, setAttendees] = useState([])
  const [attendeePage, setAttendeePage] = useState(0)
  const [settings, setSettings] = useState({ attendanceEnabled: true, parkingEnabled: true, foodEnabled: true, sessionSlots: '' })
  const [callWindow, setCallWindow] = useState(defaultCallWindow)
  const [allowedSchedule, setAllowedSchedule] = useState({ allowedStartTime: '09:00', allowedEndTime: '18:00', allowedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { rallyApi.getEvents().then(setEvents).catch(() => setEvents([])) }, [])
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const callableAttendees = attendees.filter((attendee) => attendee.optedIn && attendee.phone && !['WAITLISTED', 'RELEASED'].includes(String(attendee.status).toUpperCase()))
  const uniquePhoneCount = new Set(callableAttendees.map((attendee) => attendee.phone)).size
  const pageSize = 8
  const pageCount = Math.max(1, Math.ceil(attendees.length / pageSize))
  const visibleAttendees = attendees.slice(attendeePage * pageSize, attendeePage * pageSize + pageSize)
  const moveTo = (nextStep) => { setError(''); setMessage(''); setStep(nextStep) }
  const create = async (event) => {
    event.preventDefault()
    try {
      setBusy(true); setError(''); setMessage('')
      if (eventMode === 'existing' && !eventId) throw new Error('Choose the event this campaign belongs to.')
      if (eventMode === 'new' && (!form.eventName || !form.startsAt || !form.venue || !form.capacity)) throw new Error('Complete the event name, date, venue, and capacity first.')
      const selectedEvent = events.find((item) => item.id === eventId)
      const campaignName = form.campaignName || `${eventMode === 'existing' ? selectedEvent?.name || 'Event' : form.eventName} readiness`
      const campaign = await rallyApi.createCampaign({
        ...(eventMode === 'existing' ? { eventId } : { event: { name: form.eventName, startsAt: new Date(form.startsAt).toISOString(), venue: form.venue, capacity: Number(form.capacity) } }),
        campaign: { name: campaignName, attendanceEnabled: true, parkingEnabled: true, foodEnabled: true, state: 'DRAFT' },
      })
      setCreatedCampaign(campaign)
      setSettings({ attendanceEnabled: campaign.attendanceEnabled !== false, parkingEnabled: campaign.parkingEnabled === true, foodEnabled: campaign.foodEnabled === true, sessionSlots: (campaign.sessionSlotOptions ?? []).join('\n') })
      setMessage('Campaign created. Next, import and review your attendee list.')
      setStep(2)
    } catch (createError) { setError(createError.message) } finally { setBusy(false) }
  }
  const upload = async () => {
    try {
      if (!file) throw new Error('Choose the Rally attendee Excel workbook first.')
      setBusy(true); setError(''); setMessage('')
      const result = await rallyApi.importExcel(createdCampaign.id, file)
      setAttendees(result.attendees ?? [])
      setAttendeePage(0)
      setMessage(`${result.imported} attendees imported. ${result.attendees?.filter((attendee) => attendee.optedIn && attendee.phone && !['WAITLISTED', 'RELEASED'].includes(attendee.status)).length ?? 0} are ready to call.`)
    } catch (uploadError) { setError(uploadError.message) } finally { setBusy(false) }
  }
  const saveSettings = async () => {
    try {
      setBusy(true); setError(''); setMessage('')
      const sessionSlotOptions = settings.sessionSlots.split('\n').map((value) => value.trim()).filter(Boolean)
      const campaign = await rallyApi.updateCampaign(createdCampaign.id, { attendanceEnabled: settings.attendanceEnabled, parkingEnabled: settings.parkingEnabled, foodEnabled: settings.foodEnabled, sessionSlotOptions })
      setCreatedCampaign(campaign)
      setMessage('Call settings saved. Choose when Sarvam should begin calling.')
      setStep(4)
    } catch (saveError) { setError(saveError.message) } finally { setBusy(false) }
  }
  const launch = async () => {
    try {
      const startDate = new Date(callWindow.start)
      const endDate = new Date(callWindow.end)
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new Error('Choose a valid start and end time for the calling window.')
      if (endDate <= startDate) throw new Error('The calling window must end after it starts.')
      if (!allowedSchedule.allowedDays.length) throw new Error('Choose at least one permitted calling day.')
      if (allowedSchedule.allowedStartTime >= allowedSchedule.allowedEndTime) throw new Error('The daily calling end time must be later than its start time.')
      const startTimestamp = startDate.toISOString()
      const endTimestamp = endDate.toISOString()
      setBusy(true); setError(''); setMessage('')
      const result = await rallyApi.launchCampaign(createdCampaign.id, startTimestamp, endTimestamp, { allowedSchedule: { timezone: 'Asia/Kolkata', allowed_start_time: allowedSchedule.allowedStartTime, allowed_end_time: allowedSchedule.allowedEndTime, allowed_days: allowedSchedule.allowedDays } })
      await onCreated({ ...createdCampaign, ...result.campaign, event: createdCampaign.event })
    } catch (launchError) {
      const readiness = launchError.details?.attendeeReadiness
      const breakdown = readiness ? ` Rally found ${readiness.callable} callable, ${readiness.notOptedIn} not opted in, ${readiness.missingPhone} missing a phone number, and ${readiness.waitlistedOrReleased} waitlisted or released.` : ''
      setError(`${launchError.message}${breakdown}`)
    } finally { setBusy(false) }
  }
  const steps = ['Event details', 'Attendees', 'Call settings', 'Schedule']
  return <section><button className="back" onClick={onBack}><ArrowLeft size={15} />{initialEvent ? initialEvent.name : 'All events'}</button><Header kicker="New campaign" title="Create a campaign" description="Work through one decision at a time. Nothing is sent to Sarvam until the final launch step." />
  <div className="campaign-wizard"><div className="wizard-steps">{steps.map((label, index) => <button key={label} type="button" className={step === index + 1 ? 'active' : ''} disabled={index + 1 > step && !(index + 1 === 2 && createdCampaign)} onClick={() => index + 1 <= step && moveTo(index + 1)}><span>{index + 1}</span>{label}</button>)}</div>
  {message && <div className="notice">{message}</div>}{error && <div className="error-banner">{error}</div>}
  {step === 1 && <form className="wizard-panel" onSubmit={create}><div><small>Step 1 of 4</small><h2>{initialEvent ? `Campaign for ${initialEvent.name}` : 'Choose the event'}</h2><p>{initialEvent ? 'This campaign will live under the event you selected. Its event details stay shared across all campaigns.' : 'Start a new event or run another audience campaign for an event you already own.'}</p></div>{!initialEvent && <div className="event-choice"><button type="button" className={eventMode === 'new' ? 'active' : ''} onClick={() => setEventMode('new')}><b>New event</b><span>Create the event and its first campaign.</span></button><button type="button" className={eventMode === 'existing' ? 'active' : ''} onClick={() => setEventMode('existing')}><b>Existing event</b><span>Create another campaign under an existing event.</span></button></div>}<div className="form-grid">{eventMode === 'existing' ? initialEvent ? <div className="selected-event form-full"><small>SELECTED EVENT</small><b>{initialEvent.name}</b><span>{formatDateTime(initialEvent.startsAt)} · {initialEvent.venue || 'Venue pending'}</span></div> : <label className="form-full">Event<select required value={eventId} onChange={(event) => setEventId(event.target.value)}><option value="">Select an event</option>{events.map((item) => <option key={item.id} value={item.id}>{item.name} · {item._count?.campaigns || 0} campaigns</option>)}</select></label> : <><label>Event name<input required value={form.eventName} onChange={update('eventName')} placeholder="Codex Community Build Hackathon" /></label><label>Event date and start time<input required type="datetime-local" value={form.startsAt} onChange={update('startsAt')} /></label><label>Venue<input required value={form.venue} onChange={update('venue')} placeholder="Prestige Tech Park, Bengaluru" /></label><label>Capacity<input required type="number" min="1" value={form.capacity} onChange={update('capacity')} placeholder="90" /></label></>}<label className={eventMode === 'existing' ? 'form-full' : ''}>Campaign name<input value={form.campaignName} onChange={update('campaignName')} placeholder="Final RSVP confirmation" /></label></div><div className="wizard-actions"><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Continue to attendees'}</Button></div></form>}
  {step === 2 && <div className="wizard-panel"><div><small>Step 2 of 4</small><h2>Import and check attendees</h2><p>Only people with phone consent, a phone number, and an invited status will be sent to Sarvam.</p></div><div className="upload-box"><div><b>{file?.name ?? 'Rally attendee workbook'}</b><p>Use the supplied Excel template. You can see exactly who is callable below.</p></div><div className="button-row"><a className="button secondary" href="https://raw.githubusercontent.com/karthixv4/rally-backend/master/demo-assets/Rally_Attendee_Import_Template.xlsx"><Download size={15} />Template</a><label className="button secondary" htmlFor="attendee-file"><Upload size={15} />Choose file</label></div><input id="attendee-file" className="file-input" type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div><div className="wizard-actions"><Button variant="secondary" onClick={upload} disabled={busy || !file}>{busy ? 'Importing…' : 'Import workbook'}</Button></div>{attendees.length > 0 && <><div className="wizard-stats"><Stat number={attendees.length} label="imported" /><Stat number={callableAttendees.length} label="ready to call" /><Stat number={attendees.length - callableAttendees.length} label="not callable" /></div>{callableAttendees.length > uniquePhoneCount && <div className="warning-banner">{callableAttendees.length} callable rows share {uniquePhoneCount} phone number{uniquePhoneCount === 1 ? '' : 's'}. Sarvam may deduplicate repeated recipients; use distinct numbers for a real batch.</div>}<div className="attendee-preview"><table><thead><tr><th>Attendee</th><th>Phone</th><th>Consent</th><th>Status</th><th>Callability</th></tr></thead><tbody>{visibleAttendees.map((attendee) => { const callable = callableAttendees.some((item) => item.id === attendee.id); return <tr key={attendee.id}><td><b>{attendee.name}</b></td><td>{attendee.phone || 'Missing'}</td><td>{attendee.optedIn ? 'Opted in' : 'Not opted in'}</td><td>{displayStatus(attendee.status)}</td><td><Tag type={callable ? 'accent' : 'neutral'}>{callable ? 'Ready' : 'Excluded'}</Tag></td></tr> })}</tbody></table><div className="pagination"><span>Showing {attendeePage * pageSize + 1}–{Math.min((attendeePage + 1) * pageSize, attendees.length)} of {attendees.length}</span><div className="button-row"><Button variant="secondary" onClick={() => setAttendeePage((page) => Math.max(0, page - 1))} disabled={attendeePage === 0}>Previous</Button><Button variant="secondary" onClick={() => setAttendeePage((page) => Math.min(pageCount - 1, page + 1))} disabled={attendeePage >= pageCount - 1}>Next</Button></div></div></div></>}<div className="wizard-actions"><Button variant="secondary" onClick={() => moveTo(1)}>Back</Button><Button onClick={() => moveTo(3)} disabled={!callableAttendees.length}>Continue to call settings</Button></div></div>}
  {step === 3 && <div className="wizard-panel"><div><small>Step 3 of 4</small><h2>Choose what Rally collects</h2><p>These settings become the campaign’s call brief and lock once the campaign is launched.</p></div><div className="settings-list"><label className="question"><span><b>Attendance confirmation</b><small>Ask whether they plan to attend</small></span><input type="checkbox" checked={settings.attendanceEnabled} onChange={(event) => setSettings((current) => ({ ...current, attendanceEnabled: event.target.checked }))} /></label><label className="question"><span><b>Parking requirement</b><small>Ask whether they need parking</small></span><input type="checkbox" checked={settings.parkingEnabled} onChange={(event) => setSettings((current) => ({ ...current, parkingEnabled: event.target.checked }))} /></label><label className="question"><span><b>Food preference</b><small>Ask about meal and dietary preferences</small></span><input type="checkbox" checked={settings.foodEnabled} onChange={(event) => setSettings((current) => ({ ...current, foodEnabled: event.target.checked }))} /></label><label className="slot-input">Arrival or session slots <span>Optional — one option per line</span><textarea value={settings.sessionSlots} onChange={(event) => setSettings((current) => ({ ...current, sessionSlots: event.target.value }))} placeholder={'Morning session: 9:00 AM\nAfternoon session: 2:00 PM'} /></label></div><div className="wizard-actions"><Button variant="secondary" onClick={() => moveTo(2)}>Back</Button><Button onClick={saveSettings} disabled={busy}>{busy ? 'Saving…' : 'Continue to scheduling'}</Button></div></div>}
  {step === 4 && <div className="wizard-panel"><div><small>Step 4 of 4</small><h2>Set the calling window</h2><p>Sarvam needs at least 10 minutes of lead time. The selected start must be inside the permitted days and hours below (Asia/Kolkata).</p></div><div className="form-grid"><label>Calls start<input type="datetime-local" value={callWindow.start} onChange={(event) => setCallWindow((current) => ({ ...current, start: event.target.value }))} /></label><label>Calls end<input type="datetime-local" value={callWindow.end} onChange={(event) => setCallWindow((current) => ({ ...current, end: event.target.value }))} /></label><label>Daily calls from<input type="time" value={allowedSchedule.allowedStartTime} onChange={(event) => setAllowedSchedule((current) => ({ ...current, allowedStartTime: event.target.value }))} /></label><label>Daily calls until<input type="time" value={allowedSchedule.allowedEndTime} onChange={(event) => setAllowedSchedule((current) => ({ ...current, allowedEndTime: event.target.value }))} /></label></div><div className="allowed-days"><b>Permitted days</b><div>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => <label key={day}><input type="checkbox" checked={allowedSchedule.allowedDays.includes(day)} onChange={() => setAllowedSchedule((current) => ({ ...current, allowedDays: current.allowedDays.includes(day) ? current.allowedDays.filter((value) => value !== day) : [...current.allowedDays, day] }))} />{day.slice(0, 3)}</label>)}</div></div><div className="launch-checklist"><div><Check size={16} /><span>{createdCampaign?.name} is ready</span></div><div><Check size={16} /><span>{callableAttendees.length} callable rows across {uniquePhoneCount} phone number{uniquePhoneCount === 1 ? '' : 's'} will be uploaded</span></div><div><Check size={16} /><span>Call settings are saved</span></div></div><div className="wizard-actions"><Button variant="secondary" onClick={() => moveTo(3)}>Back</Button><Button icon={Rocket} onClick={launch} disabled={busy}>{busy ? 'Launching…' : 'Launch campaign'}</Button></div></div>}</div></section>
}

function Operations({ campaign, details, onCampaignUpdated, onRefresh, onDeleted }) {
  const [busyAction, setBusyAction] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const execution = details.execution
  const paused = campaign.state === 'PAUSED' || campaign.status === 'Paused'
  const canRelaunch = execution.schedulerState === 'schedule_ended'
  const updateStatus = async () => { try { setBusyAction(true); setActionError(''); const result = await rallyApi.updateCampaignStatus(campaign.id, paused ? 'resume' : 'pause'); onCampaignUpdated(result.campaign); setNotice(result.message); await onRefresh() } catch (error) { setActionError(error.message) } finally { setBusyAction(false) } }
  const launch = async () => { try { setBusyAction(true); setActionError(''); const { startTimestamp, endTimestamp } = scheduledWindow(); const result = await rallyApi.launchCampaign(campaign.id, startTimestamp, endTimestamp); if (result.campaign) onCampaignUpdated(result.campaign); setNotice(`Cohort uploaded. Sarvam is scheduled to begin at ${formatDateTime(startTimestamp)}.`); await onRefresh() } catch (error) { setActionError(error.message) } finally { setBusyAction(false) } }
  const deleteCampaign = async () => {
    const confirmed = window.confirm(`Delete “${campaign.name}”? This permanently removes its attendees, call results, activity, tasks, seats, and waitlist data. This cannot be undone.`)
    if (!confirmed) return
    try {
      setBusyAction(true)
      setActionError('')
      await rallyApi.deleteCampaign(campaign.id)
      onDeleted(campaign.id)
    } catch (error) { setActionError(error.message) } finally { setBusyAction(false) }
  }
  return <section><Header kicker="Campaign operations" title={campaign.name} description={`${campaign.venue} · Use Refresh when you want the latest Sarvam results.`} action={<div className="button-row"><Button variant="secondary" icon={RefreshCw} onClick={onRefresh} disabled={busyAction}>Refresh</Button>{(!execution.hasSarvamSchedule || canRelaunch) && <Button icon={Rocket} onClick={launch} disabled={busyAction}>{canRelaunch ? 'Schedule a new call run' : 'Launch campaign'}</Button>}{execution.hasSarvamSchedule && !canRelaunch && <Button variant="secondary" icon={Pause} onClick={updateStatus} disabled={busyAction}>{paused ? 'Resume campaign' : 'Pause campaign'}</Button>}{!campaign.isMock && <Button variant="danger" icon={Trash2} onClick={deleteCampaign} disabled={busyAction}>Delete campaign</Button>}</div>} />
  <ExecutionStatus execution={execution} sarvamCampaign={details.sarvamCampaign} />{notice && <div className="notice">{notice}</div>}{actionError && <div className="error-banner">{actionError}</div>}
  <SarvamAnalytics analytics={details.analytics} campaignId={campaign.id} execution={execution} results={details.responses} />
  <div className="operations-lower-grid"><div><SarvamResults results={details.responses} /><div className="insight-grid">{details.groups.map(g => <div className="insight-card" key={g.title}><small>{g.title}</small>{g.rows.length ? g.rows.map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>) : <div><span>No responses yet</span><b>—</b></div>}</div>)}</div><h3 className="section-title">Action queue</h3><table><thead><tr><th>Task</th><th>Attendee</th><th>Owner</th><th>Status</th></tr></thead><tbody>{details.tasks.length ? details.tasks.map(t => <tr key={t[0]}>{t.map((x,i) => <td key={x}>{i === 3 ? <Tag type="neutral">{x}</Tag> : x}</td>)}</tr>) : <tr><td colSpan="4">No organiser follow-ups yet.</td></tr>}</tbody></table></div><aside className="operations-activity"><div className="batch-card"><small>Result capture</small><b>{execution.results.total} results saved</b><Progress values={[execution.results.total, execution.attendees.awaitingCallOrResult]} /><p>{execution.attendees.awaitingCallOrResult} eligible attendees are still awaiting a completed result.</p></div><h3 className="section-title">Latest activity</h3><div className="activity">{details.activity.length ? details.activity.map(([time, text]) => <div key={`${time}-${text}`}><time>{time}</time><span>{text}</span></div>) : <div><span>No call activity yet.</span></div>}</div></aside></div></section>
}

function SarvamResults({ results = [] }) { return <section className="sarvam-results"><div className="sarvam-results-heading"><div><small>Completed call results</small><h2>What attendees told Sarvam</h2></div></div>{!results.length ? <p className="sarvam-results-empty">No completed result yet. Once Sarvam posts the call result, attendance, travel, parking, food, and notes will appear here.</p> : <div className="sarvam-result-list">{results.slice(0, 5).map((result) => <article className="sarvam-result" key={result.id}><div className="sarvam-result-top"><div><b>{result.attendeeName}</b><span>{formatTime(result.createdAt)}</span></div><Tag type={statusClass(displayStatus(result.outcome))}>{displayStatus(result.outcome)}</Tag></div><p>{result.callSummary || 'No summary supplied.'}</p><div className="sarvam-result-fields">{result.transportMode && <span>Travel: <b>{result.transportMode}</b></span>}{result.arrivalSlot && <span>Arrival: <b>{result.arrivalSlot}</b></span>}{result.foodPreference && <span>Food: <b>{result.foodPreference}</b></span>}{result.escalationFlag && <span className="result-escalation">Needs organiser follow-up</span>}</div></article>)}</div>}</section> }

function SarvamAnalytics({ analytics, campaignId, execution, results = [] }) {
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('all')
  const [transcript, setTranscript] = useState(null)
  const [transcriptError, setTranscriptError] = useState('')
  const [loadingTranscript, setLoadingTranscript] = useState('')
  const attempts = analytics?.attempts ?? []
  const connectedAttempts = attempts.filter((attempt) => String(attempt.connectivityStatus || '').toLowerCase() === 'connected' || Number(attempt.durationSeconds) > 0)
  const needsAttention = attempts.filter((attempt) => attempt.failureReason || attempt.hasLogIssues)
  const filteredAttempts = filter === 'connected' ? connectedAttempts : filter === 'attention' ? needsAttention : attempts
  const pageSize = 8
  const visibleAttempts = filteredAttempts.slice(page * pageSize, page * pageSize + pageSize)
  const pageCount = Math.max(1, Math.ceil(filteredAttempts.length / pageSize))
  const loadTranscript = async (interactionId) => {
    try {
      setLoadingTranscript(interactionId); setTranscriptError('')
      const payload = await rallyApi.getSarvamTranscript(campaignId, interactionId)
      setTranscript(payload)
    } catch (error) { setTranscriptError(error.message) } finally { setLoadingTranscript('') }
  }
  if (!analytics) return null
  if (analytics.error) return <section className="sarvam-analytics"><div className="sarvam-results-heading"><div><small>Sarvam delivery analytics</small><h2>Call attempts</h2></div></div><p className="sarvam-results-empty">Sarvam analytics could not be loaded: {analytics.error}</p></section>
  const summary = analytics.summary ?? {}
  const completedResults = results.length
  const awaitingResults = Math.max(0, execution?.attendees?.awaitingCallOrResult ?? 0)
  const resultGap = Math.max(0, (summary.uniqueAttendees ?? 0) - completedResults)
  const transcriptValue = transcript?.transcript?.transcript ?? transcript?.transcript?.text ?? transcript?.transcript
  const transcriptText = typeof transcriptValue === 'string' ? transcriptValue : transcriptValue ? JSON.stringify(transcriptValue, null, 2) : ''
  const selectFilter = (next) => { setFilter(next); setPage(0) }
  return <section className="sarvam-analytics"><div className="sarvam-results-heading"><div><small>Sarvam delivery analytics</small><h2>Call delivery control centre</h2><p>Live attempt history from Sarvam, reconciled beside the RSVP results Rally has stored.</p></div><span>{analytics.range?.startDatetime ? `${formatDateTime(analytics.range.startDatetime)} onwards` : 'No Sarvam schedule yet'}</span></div><div className="delivery-funnel"><div><span>Eligible to call</span><b>{execution?.attendees?.eligible ?? 0}</b><small>Rally audience</small></div><i /><div><span>Sarvam attempted</span><b>{summary.uniqueAttendees ?? 0}</b><small>{summary.totalAttempts ?? 0} total tries</small></div><i /><div><span>Conversation started</span><b>{connectedAttempts.length}</b><small>interaction or talk time</small></div><i /><div><span>Result captured</span><b>{completedResults}</b><small>saved in Rally</small></div></div><div className="analytics-health"><div className="delivery-message"><b>{!attempts.length ? 'No call attempt received yet' : resultGap > 0 ? `${resultGap} call result${resultGap === 1 ? '' : 's'} may still be pending` : 'Sarvam delivery and Rally results are aligned'}</b><span>{!attempts.length ? 'Once Sarvam starts a call, each attempt will appear here. Use Refresh when you want a new snapshot.' : resultGap > 0 ? 'Attempts and result webhooks are separate. A completed call can arrive before its result is posted.' : 'Every attempted attendee currently has a captured RSVP result.'}</span></div><div className="analytics-stats"><Stat number={formatDuration(summary.totalDurationSeconds)} label="talk time" /><Stat number={summary.retriedAttempts ?? 0} label="retries" /><Stat number={needsAttention.length} label="needs review" /><Stat number={awaitingResults} label="awaiting result" /></div></div>{Object.keys(summary.connectivityStatuses ?? {}).length > 0 && <div className="analytics-statuses">{Object.entries(summary.connectivityStatuses).map(([status, count]) => <Tag key={status} type="neutral">{displayStatus(status)} · {count}</Tag>)}</div>}{!attempts.length ? <p className="sarvam-results-empty">No Sarvam attempts in this campaign’s selected history. This is different from a scheduled campaign: it means Sarvam has not reported an attempt for this campaign yet.</p> : <><div className="analytics-toolbar"><div><b>Attempt history</b><span>{filteredAttempts.length} shown</span></div><div className="analytics-filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => selectFilter('all')}>All attempts</button><button className={filter === 'connected' ? 'active' : ''} onClick={() => selectFilter('connected')}>Conversations</button><button className={filter === 'attention' ? 'active' : ''} onClick={() => selectFilter('attention')}>Needs review</button></div></div><div className="analytics-table"><table><thead><tr><th>Attendee</th><th>Attempt</th><th>Delivery</th><th>Duration</th><th>What happened</th><th /></tr></thead><tbody>{visibleAttempts.map((attempt) => <tr key={attempt.attemptId}><td><b>{attempt.attendeeName}</b><br /><span>{formatDateTime(attempt.attemptedAt)}</span></td><td>{attempt.retryCount ? `Retry ${attempt.retryCount}` : 'First attempt'}</td><td><Tag type={attempt.failureReason ? 'neutral' : 'accent'}>{displayStatus(attempt.connectivityStatus)}</Tag></td><td>{formatDuration(attempt.durationSeconds)}</td><td>{attemptDescription(attempt)}</td><td>{attempt.interactionId && <Button variant="secondary" onClick={() => loadTranscript(attempt.interactionId)} disabled={loadingTranscript === attempt.interactionId}>{loadingTranscript === attempt.interactionId ? 'Loading…' : 'Transcript'}</Button>}</td></tr>)}{!visibleAttempts.length && <tr><td colSpan="6">No attempts match this view.</td></tr>}</tbody></table></div>{filteredAttempts.length > pageSize && <div className="pagination"><span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredAttempts.length)} of {filteredAttempts.length} attempts</span><div className="button-row"><Button variant="secondary" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page === 0}>Previous</Button><Button variant="secondary" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1}>Next</Button></div></div>}{transcriptError && <div className="error-banner">{transcriptError}</div>}{transcriptText && <div className="transcript-panel"><div><b>Call transcript</b><Button variant="secondary" onClick={() => setTranscript(null)}>Close</Button></div><pre>{transcriptText}</pre></div>}</>}</section>
}

function ExecutionStatus({ execution, sarvamCampaign }) {
  const [showDetails, setShowDetails] = useState(false)
  const isEnded = execution?.schedulerState === 'schedule_ended'
  useEffect(() => { if (isEnded) setShowDetails(false) }, [isEnded])
  if (!execution) return null
  const { attendees, results, schedulerState, hasSarvamSchedule, schedule, latestActivity } = execution
  const title = schedulerState === 'scheduled' ? 'Calls are scheduled with Sarvam.' : schedulerState === 'calling_window_open' ? 'Sarvam is within the planned calling window.' : schedulerState === 'schedule_time_unknown' ? 'Sarvam has a schedule, but Rally does not have its timing.' : schedulerState === 'paused' ? 'Campaign calling is paused.' : isEnded ? 'The scheduled calling window has ended.' : 'This campaign has not been launched.'
  const next = !hasSarvamSchedule ? 'Finish campaign setup and launch when the attendee list is ready.' : schedulerState === 'schedule_time_unknown' ? 'This is an older schedule. Its start and end time were not stored; new launches will show both times here.' : schedulerState === 'scheduled' ? `First calls are planned from ${formatDateTime(schedule?.startsAt)}.` : schedulerState === 'paused' ? 'Resume the campaign when you are ready for Sarvam to continue.' : `${attendees.awaitingCallOrResult} eligible attendees are still awaiting a completed result.`
  const header = <div className="execution-heading"><div><small>Call plan</small><h2>{title}</h2></div><Tag type={hasSarvamSchedule ? 'accent' : 'neutral'}>{displayStatus(schedulerState)}</Tag></div>
  if (isEnded && !showDetails) return <section className="execution-status execution-status-compact"><div>{header}<p>{results.total} results were captured. {attendees.awaitingCallOrResult} attendees are still awaiting a completed result.</p></div><Button variant="secondary" onClick={() => setShowDetails(true)}>View call plan</Button></section>
  return <section className={`execution-status ${hasSarvamSchedule ? 'is-scheduled' : 'needs-launch'}`}>{header}{isEnded && <Button className="compact-control" variant="secondary" onClick={() => setShowDetails(false)}>Minimise</Button>}<p>{next}</p><div className="execution-grid"><Stat number={attendees.eligible} label="ready to call" /><Stat number={attendees.awaitingCallOrResult} label="not completed" /><Stat number={results.total} label="results received" /><Stat number={attendees.notOptedIn + attendees.waitlistedOrReleased + attendees.missingPhone} label="not callable" /></div><div className="execution-notes"><span>Scheduled start: {formatDateTime(sarvamCampaign?.startTimestamp || schedule?.startsAt)}</span><span>Scheduled end: {formatDateTime(sarvamCampaign?.endTimestamp || schedule?.endsAt)}</span><span>{attendees.notOptedIn} not opted in</span><span>{attendees.waitlistedOrReleased} waitlisted/released</span><span>{attendees.missingPhone} missing phone</span></div>{sarvamCampaign && <div className="execution-latest">Sarvam status: <b>{displayStatus(sarvamCampaign.status)}</b> · ID: {sarvamCampaign.id}</div>}{latestActivity && <div className="execution-latest">Latest Rally event: <b>{displayStatus(latestActivity.eventType)}</b>{latestActivity.attendeeName ? ` · ${latestActivity.attendeeName}` : ''} · {formatTime(latestActivity.occurredAt)}</div>}</section>
}

function Setup({ campaign }) { if (campaign.isLaunched) return <section><Header kicker="Campaign setup" title="Setup is locked" description="This campaign has been launched. Its call questions are locked so Sarvam uses one consistent script for every attendee." /><div className="notice">Create a new campaign to change the questions or safeguards.</div></section>; return <section><Header kicker="Campaign setup" title="Questions and safeguards" description="Set the call flow before launching this campaign. These settings lock at launch." /><div className="setup-grid"><div><h3 className="section-title">Call questions</h3>{['Attendance confirmation', 'Expected arrival time', 'Parking requirement', 'Food preference', 'Team status', 'Accessibility request'].map((q,i) => <label className="question" key={q}><span><b>{q}</b><small>{i < 4 ? 'Required' : 'Optional'}</small></span><input type="checkbox" defaultChecked={i < 4} /></label>)}</div><div className="rule-card"><small>Before launch</small>{[['Call attempts','3, spaced 90 min'],['Private fields','Dietary, accessibility'],['Opt-out','Offered in every call'],['Lock point','Campaign launch']].map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div></section> }

function attendeeListNote(person) {
  const response = person.response
  if (!response) return 'Awaiting a completed call result'
  if (response.outcome === 'DECLINED') return response.seatRelease === 'YES' ? 'Declined · seat released' : 'Declined · seat retained'
  if (response.outcome === 'CONFIRMED') return [response.arrivalSlot, response.transportMode].filter(Boolean).join(' · ') || 'Confirmed attendance'
  return response.callSummary || 'Needs a follow-up call'
}

function Attendees({ people, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const responded = people.filter((item) => item.response).length
  const filterMatches = (person) => {
    if (filter === 'all') return true
    if (filter === 'awaiting') return !person.response
    if (filter === 'attention') return Boolean(person.response?.escalationFlag)
    return String(person.status).toLowerCase() === filter
  }
  const visiblePeople = people.filter((person) => filterMatches(person) && `${person.name} ${person.phone}`.toLowerCase().includes(query.trim().toLowerCase()))
  const person = visiblePeople.find((item) => item.id === selected) || visiblePeople[0]
  const details = person?.response ? (() => {
    const response = person.response
    const base = [['Attendance', displayStatus(response.outcome)]]
    if (response.outcome === 'CONFIRMED') return [...base, ...(response.transportMode ? [['Travel', response.transportMode]] : []), ...(response.arrivalSlot ? [['Arrival', response.arrivalSlot]] : []), ...(response.parking === true ? [['Parking', 'Requested']] : []), ...(response.foodPreference ? [['Food', response.foodPreference]] : [])]
    if (response.outcome === 'DECLINED') return [...base, ...(response.declineReason ? [['Reason', response.declineReason]] : []), ['Seat release', response.seatRelease ? displayStatus(response.seatRelease) : 'Not asked'], ...(response.substituteAttendee ? [['Substitute', response.substituteAttendee]] : [])]
    return base
  })() : []
  if (!people.length) return <section><Header kicker="Attendees" title="Readiness responses" description="Import attendees and launch the campaign to see call results here." /><div className="notice">No attendees have been imported yet.</div></section>
  return <section><Header kicker="Attendees" title="Readiness responses" description={`${responded} of ${people.length} attendees have a completed Sarvam response.`} /><div className="attendee-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search attendee or phone" /><div className="analytics-filters"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All {people.length}</button><button className={filter === 'awaiting' ? 'active' : ''} onClick={() => setFilter('awaiting')}>Awaiting {people.length - responded}</button><button className={filter === 'confirmed' ? 'active' : ''} onClick={() => setFilter('confirmed')}>Confirmed</button><button className={filter === 'declined' ? 'active' : ''} onClick={() => setFilter('declined')}>Declined</button><button className={filter === 'attention' ? 'active' : ''} onClick={() => setFilter('attention')}>Needs attention</button></div></div><div className="people-grid"><div className="people-list">{visiblePeople.length ? visiblePeople.map((p) => <button key={p.id} className={p.id === person?.id ? 'person active-person' : 'person'} onClick={() => onSelect(p.id)}><div><b>{p.name}</b><span>{attendeeListNote(p)}</span></div><Tag type={statusClass(p.status)}>{p.status}</Tag></button>) : <div className="empty-list">No attendees match this view.</div>}</div><aside className="person-detail">{person ? <><div className="detail-heading"><div><h2>{person.name}</h2><p>{person.meta}</p><p>{person.phone}</p></div><Tag type={statusClass(person.status)}>{person.status}</Tag></div>{person.response ? <><p className="readiness">{person.readiness}</p><h3 className="section-title">Call response</h3>{details.map(([key, value]) => <div className="answer" key={key}><span>{key}</span><b>{value}</b></div>)}{person.response.dietaryRequirements && <div className="answer"><span>Dietary notes</span><b>{person.response.dietaryRequirements}</b></div>}{person.response.accessibilityNeeds && <div className="answer"><span>Accessibility</span><b>{person.response.accessibilityNeeds}</b></div>}{person.response.escalationFlag && <p className="readiness">Needs organiser follow-up</p>}<h3 className="section-title">Response received</h3><p>{formatDateTime(person.response.createdAt)}</p></> : <div className="sarvam-results-empty">No completed Sarvam response yet. This attendee is ready for a call when the campaign schedule runs.</div>}</> : <div className="sarvam-results-empty">Choose an attendee to inspect their response.</div>}</aside></div></section>
}

function Waitlist({ rows }) { return <section><Header kicker="Waitlist recovery" title="Release seats with care" description="Rally only offers a released seat after the original attendee gives explicit permission." /><div className="steps">{['Decline logged', 'Seat released', 'Offer called', 'Accepted'].map((x,i) => <div key={x}><span>Step {i+1}</span><b>{x}</b><p>{['No further questions asked.', 'Returned to the seat pool.', '45-minute hold issued.', 'Counts and roster updated.'][i]}</p></div>)}</div><h3 className="section-title">Waitlist queue</h3><table><thead><tr><th>#</th><th>Attendee</th><th>Offer</th><th>Expires</th></tr></thead><tbody>{rows.map(r => <tr key={r[0]}><td>{r[0]}</td><td><b>{r[1]}</b><br/><span>{r[2]}</span></td><td><Tag type={statusClass(r[3])}>{r[3]}</Tag></td><td>{r[4]}</td></tr>)}</tbody></table></section> }

function Summary({ details }) {
  const execution = details.execution
  const outcomes = [['Confirmed', String(execution.results.confirmed), 'planning to attend'], ['Declined', String(execution.results.declined), 'unable to attend'], ['Awaiting result', String(execution.attendees.awaitingCallOrResult), 'call or result pending'], ['Follow-ups', String(details.tasks.length), 'need organiser attention']]
  const signals = details.groups.flatMap((group) => group.rows.slice(0, 3).map(([label, value]) => ({ group: group.title, label, value })))
  return <section><Header kicker="Summary" title="Campaign pulse" description="A concise view of attendee outcomes, operational follow-ups, and readiness signals." /><div className="outcomes">{outcomes.map(o => <div key={o[0]}><b>{o[1]}</b><span>{o[0]}</span><small>{o[2]}</small></div>)}</div><div className="summary-dashboard"><section><h3 className="section-title">What needs attention</h3>{details.tasks.length ? <div className="summary-list">{details.tasks.slice(0, 4).map((task) => <div key={task[0]}><Check size={17}/><span><b>{task[0]}</b><small>{task[1]} · {task[2]}</small></span><Tag type="neutral">{task[3]}</Tag></div>)}</div> : <div className="sarvam-results-empty">No organiser follow-ups are currently open.</div>}<h3 className="section-title">Latest call activity</h3><div className="summary-list">{details.activity.length ? details.activity.slice(0, 4).map(([time, text]) => <div key={`${time}-${text}`}><Check size={17}/><span><b>{time}</b><small>{text}</small></span></div>) : <div><Check size={17}/>No calls have completed yet. Launch the campaign to start the Sarvam call run.</div>}</div></section><aside className="summary-signals"><h3 className="section-title">Readiness signals</h3>{signals.length ? signals.map((signal) => <div key={`${signal.group}-${signal.label}`}><span>{signal.group} · {signal.label}</span><b>{signal.value}</b></div>) : <p>No attendee preferences have been captured yet.</p>}</aside></div></section>
}

function Header({ kicker, title, description, action }) { return <header className="page-header"><div><small>{kicker}</small><h1>{title}</h1><p>{description}</p></div>{action}</header> }
function PageLoader({ requests }) { return <div className="loading"><LoaderCircle className="spinner" size={28} /><strong>Connecting to Rally</strong><span>{requests[0]?.label ?? 'Loading campaign data…'}</span></div> }
function DetailsLoader({ campaign, requests }) { return <section className="details-loader"><LoaderCircle className="spinner" size={30} /><h2>Loading {campaign.name}</h2><p>{requests.length ? requests.map((request) => request.label).join(' · ') : 'Preparing campaign operations…'}</p></section> }
function ApiActivity({ requests }) { if (!requests.length) return null; return <aside className="api-activity" aria-live="polite"><div><LoaderCircle className="spinner" size={16} /><strong>Loading live data</strong></div>{requests.map((request) => <span key={request.id}>{request.label}</span>)}</aside> }
function Button({ children, icon: Icon, variant = 'primary', className = '', ...props }) { return <button className={`button ${variant} ${className}`.trim()} {...props}>{Icon && <Icon size={15} />}{children}</button> }
function Tag({ children, type = 'neutral' }) { return <span className={`tag ${type}`}>{children}</span> }
function Stat({ number, label }) { return <div className="stat"><b>{number}</b><span>{label}</span></div> }
function Progress({ values }) { return <div className="progress">{values.map((v,i) => <i key={i} style={{ flex: v }} />)}</div> }
function FormSection({ n, title, children }) { return <div className="form-section"><h3><em>{n}</em>{title}</h3>{children}</div> }
function MappingTable() { return <div className="mapping"><div className="mapping-heading"><h3>Required columns</h3><span>Rows without a name or phone are skipped</span></div><table><thead><tr><th>Workbook column</th><th>Rally field</th><th>Example</th></tr></thead><tbody>{[['name','Name','Ananya Rao'],['phone','Phone','+91 98450 22187'],['optedIn','Call consent','TRUE'],['status','Starting status','INVITED'],['waitlistRank','Waitlist order','1']].map(r => <tr key={r[0]}>{r.map(x => <td key={x}>{x}</td>)}</tr>)}</tbody></table></div> }
export default App
