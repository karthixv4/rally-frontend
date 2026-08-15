import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Download, Flag, LayoutDashboard, ListPlus, LoaderCircle, Menu, Pause, Plus, RefreshCw, Rocket, SlidersHorizontal, Trash2, Upload, Users } from 'lucide-react'
import { rallyApi, subscribeToApiActivity } from './data/rallyApi'

const navItems = [
  ['operations', 'Operations', LayoutDashboard], ['setup', 'Campaign setup', SlidersHorizontal], ['attendees', 'Attendees', Users], ['waitlist', 'Waitlist recovery', ListPlus], ['summary', 'Summary', Flag],
]
const statusClass = (status) => status === 'Confirmed' || status === 'Campaign live' || status === 'Accepted' ? 'accent' : 'neutral'
const displayStatus = (status) => String(status || 'DRAFT').toLowerCase().replace(/(^|_)([a-z])/g, (_match, prefix, letter) => `${prefix === '_' ? ' ' : ''}${letter.toUpperCase()}`)
const formatTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
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
  const [details, setDetails] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [view, setView] = useState('campaigns')
  const [selectedPerson, setSelectedPerson] = useState(0)
  const [mobileNav, setMobileNav] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingRequests, setPendingRequests] = useState([])

  useEffect(() => subscribeToApiActivity(setPendingRequests), [])
  useEffect(() => {
    let active = true
    rallyApi.getCampaigns().then((items) => {
      if (!active) return
      setCampaigns(items)
      setLoading(false)
    }).catch((loadError) => {
      if (!active) return
      setError(loadError.message)
      setLoading(false)
    })
    return () => { active = false }
  }, [])
  const chooseCampaign = async (item) => {
    try {
      setError('')
      setCampaign(item)
      setDetails(null)
      setView('operations')
      setMobileNav(false)
      setSelectedPerson(0)
      setDetails(await rallyApi.getCampaignDetails(item.id))
    } catch (loadError) { setError(loadError.message) }
  }
  const openNew = () => { setCampaign(null); setView('new'); setMobileNav(false) }
  const handleCreated = async (createdCampaign) => {
    setCampaigns((current) => [createdCampaign, ...current])
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
    setSelectedPerson(0)
    setView('campaigns')
  }
  const refreshCampaignDetails = async (selectedCampaign = campaign) => {
    if (!selectedCampaign || selectedCampaign.isMock) return
    try {
      setError('')
      setDetails(await rallyApi.getCampaignDetails(selectedCampaign.id))
    } catch (loadError) { setError(loadError.message) }
  }
  if (loading) return <PageLoader requests={pendingRequests} />

  return <div className={`app-shell ${mobileNav ? 'mobile-nav-open' : ''}`}>
    <button className="menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation" aria-expanded={mobileNav}><Menu size={20} /></button>
    {mobileNav && <button className="mobile-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation" />}
    <Sidebar campaign={campaign} view={view} onNavigate={(nextView) => { setView(nextView); setMobileNav(false) }} onHome={() => { setView('campaigns'); setMobileNav(false) }} open={mobileNav} />
    <main className="main-content">
      <ApiActivity requests={pendingRequests} />
      {error && <div className="error-banner">{error}</div>}
      {view === 'campaigns' && <Campaigns campaigns={campaigns} onChoose={chooseCampaign} onNew={openNew} />}
      {view === 'new' && <NewCampaign onBack={() => setView('campaigns')} onCreated={handleCreated} />}
      {campaign && details && view === 'operations' && <Operations campaign={campaign} details={details} onCampaignUpdated={handleCampaignUpdated} onRefresh={refreshCampaignDetails} onDeleted={handleCampaignDeleted} />}
      {campaign && !details && view === 'operations' && <DetailsLoader campaign={campaign} requests={pendingRequests} />}
      {campaign && view === 'setup' && <Setup campaign={campaign} />}
      {campaign && view === 'attendees' && <Attendees people={details?.attendees ?? []} selected={selectedPerson} onSelect={setSelectedPerson} />}
      {campaign && view === 'waitlist' && <Waitlist rows={details?.waitlist ?? []} />}
      {campaign && details && view === 'summary' && <Summary details={details} />}
    </main>
  </div>
}

function Sidebar({ campaign, view, onNavigate, onHome, open }) { return <aside className={`sidebar ${open ? 'is-open' : ''}`}>
  <div className="brand"><strong>Rally</strong><span>Event readiness agent</span></div>
  <nav><button className={view === 'campaigns' ? 'active' : ''} onClick={onHome}><LayoutDashboard size={16} />All campaigns</button>
  {campaign && <><div className="nav-label">{campaign.shortName}</div>{navItems.filter(([id]) => id !== 'setup' || !campaign.isLaunched).map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={16} />{label}</button>)}</>}</nav>
  {campaign && <div className="campaign-state"><b>{campaign.shortName}</b><span>{campaign.meta}</span><small><i /> {campaign.status}</small></div>}
</aside> }

function Campaigns({ campaigns, onChoose, onNew }) { return <section><Header kicker="Campaigns" title="Your event readiness campaigns" description="Create a campaign, import opted-in attendees, and launch calls from one place." action={<Button icon={Plus} onClick={onNew}>New campaign</Button>} />
  <div className="mock-data-note"><strong>Mock data is available:</strong> open the labelled sample campaign to explore Rally without creating real event data.</div><div className="campaign-grid">{campaigns.map(c => <button className="campaign-card" key={c.id} onClick={() => onChoose(c)}><div className="card-top"><div><h2>{c.name}</h2><p>{c.meta}</p></div><div className="card-tags">{c.isMock && <Tag type="mock">Mock data</Tag>}<Tag type={statusClass(c.status)}>{c.status}</Tag></div></div><div className="mini-stats"><Stat number={c.confirmed} label="confirmed" /><Stat number={c.uncertain} label="uncertain" /><Stat number={c.uncontacted} label="to call" /></div><Progress values={[c.confirmed, c.uncertain, c.uncontacted]} /></button>)}
  <button className="new-card" onClick={onNew}><Plus size={20} /><strong>New campaign</strong><span>Import a list, pick questions, launch.</span></button></div></section> }

function NewCampaign({ onBack, onCreated }) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ eventName: '', startsAt: '', venue: '', capacity: '', campaignName: '' })
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
      if (!form.eventName || !form.startsAt || !form.venue || !form.capacity) throw new Error('Complete the event name, date, venue, and capacity first.')
      const campaign = await rallyApi.createCampaign({
        event: { name: form.eventName, startsAt: new Date(form.startsAt).toISOString(), venue: form.venue, capacity: Number(form.capacity) },
        campaign: { name: form.campaignName || `${form.eventName} readiness`, attendanceEnabled: true, parkingEnabled: true, foodEnabled: true, state: 'DRAFT' },
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
  return <section><button className="back" onClick={onBack}><ArrowLeft size={15} />All campaigns</button><Header kicker="New campaign" title="Create a campaign" description="Work through one decision at a time. Nothing is sent to Sarvam until the final launch step." />
  <div className="campaign-wizard"><div className="wizard-steps">{steps.map((label, index) => <button key={label} type="button" className={step === index + 1 ? 'active' : ''} disabled={index + 1 > step && !(index + 1 === 2 && createdCampaign)} onClick={() => index + 1 <= step && moveTo(index + 1)}><span>{index + 1}</span>{label}</button>)}</div>
  {message && <div className="notice">{message}</div>}{error && <div className="error-banner">{error}</div>}
  {step === 1 && <form className="wizard-panel" onSubmit={create}><div><small>Step 1 of 4</small><h2>Start with the event</h2><p>This creates a draft only. You can safely leave and return before scheduling any calls.</p></div><div className="form-grid"><label>Event name<input required value={form.eventName} onChange={update('eventName')} placeholder="Codex Community Build Hackathon" /></label><label>Campaign name<input value={form.campaignName} onChange={update('campaignName')} placeholder="Final RSVP confirmation" /></label><label>Event date and start time<input required type="datetime-local" value={form.startsAt} onChange={update('startsAt')} /></label><label>Venue<input required value={form.venue} onChange={update('venue')} placeholder="Prestige Tech Park, Bengaluru" /></label><label>Capacity<input required type="number" min="1" value={form.capacity} onChange={update('capacity')} placeholder="90" /></label></div><div className="wizard-actions"><Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Continue to attendees'}</Button></div></form>}
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
  <ExecutionStatus execution={execution} sarvamCampaign={details.sarvamCampaign} />{notice && <div className="notice">{notice}</div>}{actionError && <div className="error-banner">{actionError}</div>}<div className="headline-stats"><Stat number={execution.attendees.awaitingCallOrResult} label="awaiting call / result" /><Stat number={execution.results.confirmed} label="confirmed" /><Stat number={execution.results.declined} label="declined" /><Stat number={execution.results.uncertain} label="uncertain" /></div><Progress values={[execution.results.confirmed, execution.results.declined, execution.results.uncertain, execution.attendees.awaitingCallOrResult]} />
  <SarvamResults results={details.responses} /><div className="dashboard-grid"><div><div className="insight-grid">{details.groups.map(g => <div className="insight-card" key={g.title}><small>{g.title}</small>{g.rows.length ? g.rows.map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>) : <div><span>No responses yet</span><b>—</b></div>}</div>)}</div><h3 className="section-title">Action queue</h3><table><thead><tr><th>Task</th><th>Attendee</th><th>Owner</th><th>Status</th></tr></thead><tbody>{details.tasks.length ? details.tasks.map(t => <tr key={t[0]}>{t.map((x,i) => <td key={x}>{i === 3 ? <Tag type="neutral">{x}</Tag> : x}</td>)}</tr>) : <tr><td colSpan="4">No organiser follow-ups yet.</td></tr>}</tbody></table></div><aside><div className="batch-card"><small>Call progress</small><b>{execution.results.total} results received · {execution.attendees.awaitingCallOrResult} awaiting</b><Progress values={[execution.results.total, execution.attendees.awaitingCallOrResult]} /><p>Results are added after Sarvam completes a call and posts its result.</p></div><h3 className="section-title">Latest activity</h3><div className="activity">{details.activity.length ? details.activity.map(([time, text]) => <div key={`${time}-${text}`}><time>{time}</time><span>{text}</span></div>) : <div><span>No call activity yet.</span></div>}</div></aside></div></section>
}

function SarvamResults({ results = [] }) { return <section className="sarvam-results"><div className="sarvam-results-heading"><div><small>Completed call results</small><h2>What attendees told Sarvam</h2></div></div>{!results.length ? <p className="sarvam-results-empty">No completed result yet. Once Sarvam posts the call result, attendance, travel, parking, food, and notes will appear here.</p> : <div className="sarvam-result-list">{results.slice(0, 5).map((result) => <article className="sarvam-result" key={result.id}><div className="sarvam-result-top"><div><b>{result.attendeeName}</b><span>{formatTime(result.createdAt)}</span></div><Tag type={statusClass(displayStatus(result.outcome))}>{displayStatus(result.outcome)}</Tag></div><p>{result.callSummary || 'No summary supplied.'}</p><div className="sarvam-result-fields">{result.transportMode && <span>Travel: <b>{result.transportMode}</b></span>}{result.arrivalSlot && <span>Arrival: <b>{result.arrivalSlot}</b></span>}{result.foodPreference && <span>Food: <b>{result.foodPreference}</b></span>}{result.escalationFlag && <span className="result-escalation">Needs organiser follow-up</span>}</div></article>)}</div>}</section> }

function ExecutionStatus({ execution, sarvamCampaign }) { if (!execution) return null; const { attendees, results, schedulerState, hasSarvamSchedule, schedule, latestActivity } = execution; const title = schedulerState === 'scheduled' ? 'Calls are scheduled with Sarvam.' : schedulerState === 'calling_window_open' ? 'Sarvam is within the planned calling window.' : schedulerState === 'schedule_time_unknown' ? 'Sarvam has a schedule, but Rally does not have its timing.' : schedulerState === 'paused' ? 'Campaign calling is paused.' : schedulerState === 'schedule_ended' ? 'The scheduled calling window has ended.' : 'This campaign has not been launched.'; const next = !hasSarvamSchedule ? 'Finish campaign setup and launch when the attendee list is ready.' : schedulerState === 'schedule_time_unknown' ? 'This is an older schedule. Its start and end time were not stored; new launches will show both times here.' : schedulerState === 'scheduled' ? `First calls are planned from ${formatDateTime(schedule?.startsAt)}.` : schedulerState === 'paused' ? 'Resume the campaign when you are ready for Sarvam to continue.' : `${attendees.awaitingCallOrResult} eligible attendees are still awaiting a completed result.`; return <section className={`execution-status ${hasSarvamSchedule ? 'is-scheduled' : 'needs-launch'}`}><div className="execution-heading"><div><small>Call plan</small><h2>{title}</h2></div><Tag type={hasSarvamSchedule ? 'accent' : 'neutral'}>{displayStatus(schedulerState)}</Tag></div><p>{next}</p><div className="execution-grid"><Stat number={attendees.eligible} label="ready to call" /><Stat number={attendees.awaitingCallOrResult} label="not completed" /><Stat number={results.total} label="results received" /><Stat number={attendees.notOptedIn + attendees.waitlistedOrReleased + attendees.missingPhone} label="not callable" /></div><div className="execution-notes"><span>Scheduled start: {formatDateTime(sarvamCampaign?.startTimestamp || schedule?.startsAt)}</span><span>Scheduled end: {formatDateTime(sarvamCampaign?.endTimestamp || schedule?.endsAt)}</span><span>{attendees.notOptedIn} not opted in</span><span>{attendees.waitlistedOrReleased} waitlisted/released</span><span>{attendees.missingPhone} missing phone</span></div>{sarvamCampaign && <div className="execution-latest">Sarvam status: <b>{displayStatus(sarvamCampaign.status)}</b> · ID: {sarvamCampaign.id}</div>}{latestActivity && <div className="execution-latest">Latest Rally event: <b>{displayStatus(latestActivity.eventType)}</b>{latestActivity.attendeeName ? ` · ${latestActivity.attendeeName}` : ''} · {formatTime(latestActivity.occurredAt)}</div>}</section> }

function Setup({ campaign }) { if (campaign.isLaunched) return <section><Header kicker="Campaign setup" title="Setup is locked" description="This campaign has been launched. Its call questions are locked so Sarvam uses one consistent script for every attendee." /><div className="notice">Create a new campaign to change the questions or safeguards.</div></section>; return <section><Header kicker="Campaign setup" title="Questions and safeguards" description="Set the call flow before launching this campaign. These settings lock at launch." /><div className="setup-grid"><div><h3 className="section-title">Call questions</h3>{['Attendance confirmation', 'Expected arrival time', 'Parking requirement', 'Food preference', 'Team status', 'Accessibility request'].map((q,i) => <label className="question" key={q}><span><b>{q}</b><small>{i < 4 ? 'Required' : 'Optional'}</small></span><input type="checkbox" defaultChecked={i < 4} /></label>)}</div><div className="rule-card"><small>Before launch</small>{[['Call attempts','3, spaced 90 min'],['Private fields','Dietary, accessibility'],['Opt-out','Offered in every call'],['Lock point','Campaign launch']].map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div></section> }

function Attendees({ people, selected, onSelect }) { const person = people[selected]; const responded = people.filter((item) => item.response).length; if (!person) return <section><Header kicker="Attendees" title="Readiness responses" description="Import attendees and launch the campaign to see call results here." /><div className="notice">No attendees have been imported yet.</div></section>; return <section><Header kicker="Attendees" title="Readiness responses" description={`${responded} of ${people.length} attendees have a completed Sarvam response.`} /><div className="people-grid"><div className="people-list">{people.map((p,i) => <button key={p.id} className={i === selected ? 'person active-person' : 'person'} onClick={() => onSelect(i)}><div><b>{p.name}</b><span>{p.response ? `${p.response.transportMode || 'Travel not provided'} · ${p.response.parking === true ? 'Parking requested' : 'No parking request'}` : p.meta}</span></div><Tag type={statusClass(p.status)}>{p.status}</Tag></button>)}</div><aside className="person-detail"><div className="detail-heading"><div><h2>{person.name}</h2><p>{person.meta}</p><p>{person.phone}</p></div><Tag type={statusClass(person.status)}>{person.status}</Tag></div>{person.response ? <><p className="readiness">{person.readiness}</p><h3 className="section-title">Readiness details</h3>{person.answers.map(([k,v]) => <div className="answer" key={k}><span>{k}</span><b>{v}</b></div>)}{person.response.dietaryRequirements && <div className="answer"><span>Dietary notes</span><b>{person.response.dietaryRequirements}</b></div>}{person.response.escalationFlag && <p className="readiness">Needs organiser follow-up</p>}<h3 className="section-title">Response received</h3><p>{formatDateTime(person.response.createdAt)}</p></> : <div className="sarvam-results-empty">No completed Sarvam response yet. This attendee is {person.meta.toLowerCase()}.</div>}</aside></div></section> }

function Waitlist({ rows }) { return <section><Header kicker="Waitlist recovery" title="Release seats with care" description="Rally only offers a released seat after the original attendee gives explicit permission." /><div className="steps">{['Decline logged', 'Seat released', 'Offer called', 'Accepted'].map((x,i) => <div key={x}><span>Step {i+1}</span><b>{x}</b><p>{['No further questions asked.', 'Returned to the seat pool.', '45-minute hold issued.', 'Counts and roster updated.'][i]}</p></div>)}</div><h3 className="section-title">Waitlist queue</h3><table><thead><tr><th>#</th><th>Attendee</th><th>Offer</th><th>Expires</th></tr></thead><tbody>{rows.map(r => <tr key={r[0]}><td>{r[0]}</td><td><b>{r[1]}</b><br/><span>{r[2]}</span></td><td><Tag type={statusClass(r[3])}>{r[3]}</Tag></td><td>{r[4]}</td></tr>)}</tbody></table></section> }

function Summary({ details }) { const outcomes = [['Responses', String(details.attendees.length), 'captured by Rally'], ['Follow-ups', String(details.tasks.length), 'in the action queue'], ['Activity events', String(details.activity.length), 'visible to organisers'], ['Waitlist', String(details.waitlist.length), 'eligible attendees']]; return <section><Header kicker="Summary" title="Campaign outcome" description="A live record built from Sarvam call results and Rally operations data." /><div className="outcomes">{outcomes.map(o => <div key={o[0]}><b>{o[1]}</b><span>{o[0]}</span><small>{o[2]}</small></div>)}</div><div className="summary-list">{details.activity.length ? details.activity.slice(0, 4).map(([time, text]) => <div key={`${time}-${text}`}><Check size={17}/>{time} · {text}</div>) : <div><Check size={17}/>No calls have completed yet. Launch the campaign to start the Sarvam call run.</div>}</div></section> }

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
