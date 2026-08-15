import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Download, FileSpreadsheet, Flag, LayoutDashboard, ListPlus, Menu, Pause, Plus, SlidersHorizontal, Upload, Users, X } from 'lucide-react'
import { rallyApi } from './data/rallyApi'

const navItems = [
  ['operations', 'Operations', LayoutDashboard], ['setup', 'Campaign setup', SlidersHorizontal], ['attendees', 'Attendees', Users], ['waitlist', 'Waitlist recovery', ListPlus], ['summary', 'Summary', Flag],
]
const statusClass = (status) => status === 'Confirmed' || status === 'Campaign live' || status === 'Accepted' ? 'accent' : 'neutral'

function App() {
  const [campaigns, setCampaigns] = useState([])
  const [details, setDetails] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [view, setView] = useState('campaigns')
  const [selectedPerson, setSelectedPerson] = useState(0)
  const [mobileNav, setMobileNav] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
  if (loading) return <div className="loading">Loading Rally…</div>

  return <div className="app-shell">
    <button className="menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={20} /></button>
    <Sidebar campaign={campaign} view={view} onNavigate={setView} onHome={() => setView('campaigns')} open={mobileNav} />
    <main className="main-content">
      {error && <div className="error-banner">{error}</div>}
      {view === 'campaigns' && <Campaigns campaigns={campaigns} onChoose={chooseCampaign} onNew={openNew} />}
      {view === 'new' && <NewCampaign onBack={() => setView('campaigns')} onCreated={handleCreated} />}
      {campaign && details && view === 'operations' && <Operations campaign={campaign} details={details} />}
      {campaign && view === 'setup' && <Setup />}
      {campaign && view === 'attendees' && <Attendees people={details?.attendees ?? []} selected={selectedPerson} onSelect={setSelectedPerson} />}
      {campaign && view === 'waitlist' && <Waitlist rows={details.waitlist} />}
      {campaign && details && view === 'summary' && <Summary details={details} />}
    </main>
  </div>
}

function Sidebar({ campaign, view, onNavigate, onHome, open }) { return <aside className={`sidebar ${open ? 'is-open' : ''}`}>
  <div className="brand"><strong>Rally</strong><span>Event readiness agent</span></div>
  <nav><button className={view === 'campaigns' ? 'active' : ''} onClick={onHome}><LayoutDashboard size={16} />All campaigns</button>
  {campaign && <><div className="nav-label">{campaign.shortName}</div>{navItems.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={16} />{label}</button>)}</>}</nav>
  {campaign && <div className="campaign-state"><b>{campaign.shortName}</b><span>{campaign.meta}</span><small><i /> {campaign.status}</small></div>}
</aside> }

function Campaigns({ campaigns, onChoose, onNew }) { return <section><Header kicker="Campaigns" title="Your event readiness campaigns" description="Create a campaign, import opted-in attendees, and launch calls from one place." action={<Button icon={Plus} onClick={onNew}>New campaign</Button>} />
  <div className="campaign-grid">{campaigns.map(c => <button className="campaign-card" key={c.id} onClick={() => onChoose(c)}><div className="card-top"><div><h2>{c.name}</h2><p>{c.meta}</p></div><Tag type={statusClass(c.status)}>{c.status}</Tag></div><div className="mini-stats"><Stat number={c.confirmed} label="confirmed" /><Stat number={c.uncertain} label="uncertain" /><Stat number={c.uncontacted} label="to call" /></div><Progress values={[c.confirmed, c.uncertain, c.uncontacted]} /></button>)}
  <button className="new-card" onClick={onNew}><Plus size={20} /><strong>New campaign</strong><span>Import a list, pick questions, launch.</span></button></div></section> }

function NewCampaign({ onBack, onCreated }) {
  const [form, setForm] = useState({ eventName: '', startsAt: '', venue: '', capacity: '', campaignName: '' })
  const [file, setFile] = useState(null)
  const [createdCampaign, setCreatedCampaign] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const create = async () => {
    try {
      setBusy(true); setError(''); setMessage('')
      if (!form.eventName || !form.startsAt || !form.venue || !form.capacity) throw new Error('Complete the event name, start time, venue, and capacity first.')
      const campaign = await rallyApi.createCampaign({
        event: { name: form.eventName, startsAt: new Date(form.startsAt).toISOString(), venue: form.venue, capacity: Number(form.capacity) },
        campaign: { name: form.campaignName || `${form.eventName} readiness`, attendanceEnabled: true, parkingEnabled: true, foodEnabled: true, state: 'DRAFT' },
      })
      setCreatedCampaign(campaign)
      setMessage('Campaign created. Upload the attendee workbook next.')
    } catch (createError) { setError(createError.message) } finally { setBusy(false) }
  }
  const upload = async () => {
    try {
      if (!createdCampaign) throw new Error('Create the campaign before importing attendees.')
      if (!file) throw new Error('Choose the Rally attendee Excel workbook first.')
      setBusy(true); setError(''); const result = await rallyApi.importExcel(createdCampaign.id, file)
      setMessage(`${result.imported} attendees imported. You can now launch the campaign.`)
    } catch (uploadError) { setError(uploadError.message) } finally { setBusy(false) }
  }
  const launch = async () => {
    try {
      if (!createdCampaign) throw new Error('Create and import attendees before launching.')
      setBusy(true); setError(''); const start = new Date().toISOString(); const end = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
      await rallyApi.launchCampaign(createdCampaign.id, start, end)
      setMessage('Campaign is live. Sarvam is now scheduling calls.')
      await onCreated({ ...createdCampaign, state: 'ACTIVE', status: 'Active' })
    } catch (launchError) { setError(launchError.message) } finally { setBusy(false) }
  }
  return <section><button className="back" onClick={onBack}><ArrowLeft size={15} />All campaigns</button><Header kicker="New campaign" title="Create, import, and launch" description="Build a campaign, upload opted-in attendees, then start the Sarvam call run." />
  <div className="two-column"><div className="form-flow"><FormSection n="01" title="Name the event"><div className="form-grid"><label>Event name<input value={form.eventName} onChange={update('eventName')} placeholder="Codex Community Build Hackathon" /></label><label>Campaign name<input value={form.campaignName} onChange={update('campaignName')} placeholder="Final RSVP confirmation" /></label><label>Date and start time<input type="datetime-local" value={form.startsAt} onChange={update('startsAt')} /></label><label>Venue<input value={form.venue} onChange={update('venue')} placeholder="Prestige Tech Park, Bengaluru" /></label><label>Capacity<input type="number" min="1" value={form.capacity} onChange={update('capacity')} placeholder="90" /></label></div><div className="button-row"><Button onClick={create} disabled={busy || Boolean(createdCampaign)}>{createdCampaign ? 'Campaign created' : 'Create campaign'}</Button></div></FormSection>
  <FormSection n="02" title="Import attendees"><div className="upload-box"><div><b>{file?.name ?? 'Rally attendee workbook'}</b><p>Use the supplied .xlsx template. Only opted-in rows are callable.</p></div><label className="button secondary" htmlFor="attendee-file"><Upload size={15} />Choose file</label><input id="attendee-file" className="file-input" type="file" accept=".xlsx" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div><div className="button-row"><Button variant="secondary" onClick={upload} disabled={busy || !createdCampaign || !file}>Import workbook</Button></div><MappingTable /></FormSection>
  <FormSection n="03" title="Launch calls"><div className="chips">{['Attendance', 'Arrival time', 'Parking', 'Food preference'].map((x) => <Tag key={x} type="accent">{x}</Tag>)}</div><div className="button-row"><Button onClick={launch} disabled={busy || !createdCampaign}>Launch campaign</Button></div></FormSection>{message && <div className="notice">{message}</div>}{error && <div className="error-banner">{error}</div>}</div><aside className="consent-card"><small>Consent</small><p>Rally uploads only opted-in attendees for calling. During the demo, the backend can safely route calls to the configured demo recipient.</p></aside></div></section>
}

function Operations({ campaign, details }) { const counts = details.attendees.reduce((result, attendee) => ({ ...result, [attendee.status.toLowerCase()]: (result[attendee.status.toLowerCase()] ?? 0) + 1 }), {}); const uncontacted = Math.max(0, details.attendees.length - (counts.confirmed ?? 0) - (counts.uncertain ?? 0) - (counts.declined ?? 0) - (counts.released ?? 0)); return <section><Header kicker="Operations" title={campaign.name} description={`${campaign.venue} · Results update automatically after each Sarvam call`} action={<div className="button-row"><Button variant="secondary" icon={Pause}>Pause campaign</Button><Button icon={Download}>Export plan</Button></div>} /><div className="headline-stats"><Stat number={counts.confirmed ?? 0} label="confirmed" /><Stat number={counts.uncertain ?? 0} label="uncertain" /><Stat number={counts.declined ?? 0} label="declined" /><Stat number={uncontacted} label="uncontacted" /></div><Progress values={[counts.confirmed ?? 0, counts.uncertain ?? 0, counts.declined ?? 0, uncontacted]} />
  <div className="dashboard-grid"><div><div className="insight-grid">{details.groups.map(g => <div className="insight-card" key={g.title}><small>{g.title}</small>{g.rows.map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>)}</div><h3 className="section-title">Action queue</h3><table><thead><tr><th>Task</th><th>Attendee</th><th>Owner</th><th>Status</th></tr></thead><tbody>{details.tasks.map(t => <tr key={t[0]}>{t.map((x,i) => <td key={x}>{i === 3 ? <Tag type="neutral">{x}</Tag> : x}</td>)}</tr>)}</tbody></table></div><aside><div className="batch-card"><small>Batch progress</small><b>62 calls completed · 12 queued</b><Progress values={[62, 12]} /><p>Average 58s · next batch 15:10 · 3 attempts max</p></div><h3 className="section-title">Live activity</h3><div className="activity">{details.activity.map(([time, text]) => <div key={time}><time>{time}</time><span>{text}</span></div>)}</div></aside></div></section> }

function Setup() { return <section><Header kicker="Campaign setup" title="Questions and safeguards" description="Adjust the call flow and rules without changing approved consent language." /><div className="setup-grid"><div><h3 className="section-title">Call questions</h3>{['Attendance confirmation', 'Expected arrival time', 'Parking requirement', 'Food preference', 'Team status', 'Accessibility request'].map((q,i) => <label className="question" key={q}><span><b>{q}</b><small>{i < 4 ? 'Required' : 'Optional'}</small></span><input type="checkbox" defaultChecked={i < 4} /></label>)}</div><div className="rule-card"><small>Campaign rules</small>{[['Campaign deadline','Fri 13 Feb, 21:00'],['Call attempts','3, spaced 90 min'],['Escalation owner','Meera K'],['Private fields','Dietary, accessibility'],['Opt-out','Offered in every call']].map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div></section> }

function Attendees({ people, selected, onSelect }) { const person = people[selected]; if (!person) return <section><Header kicker="Attendees" title="Readiness responses" description="Import attendees and launch the campaign to see call results here." /><div className="notice">No attendees have been imported yet.</div></section>; return <section><Header kicker="Attendees" title="Readiness responses" description="Every response is traceable to the attendee and their contact consent." /><div className="people-grid"><div className="people-list">{people.map((p,i) => <button key={p.id} className={i === selected ? 'person active-person' : 'person'} onClick={() => onSelect(i)}><div><b>{p.name}</b><span>{p.meta}</span></div><Tag type={statusClass(p.status)}>{p.status}</Tag></button>)}</div><aside className="person-detail"><div className="detail-heading"><div><h2>{person.name}</h2><p>{person.meta}</p><p>{person.phone}</p></div><Tag type={statusClass(person.status)}>{person.status}</Tag></div><p className="readiness">{person.readiness}</p><h3 className="section-title">Answers</h3>{person.answers.map(([k,v]) => <div className="answer" key={k}><span>{k}</span><b>{v}</b></div>)}<h3 className="section-title">Last activity</h3><p>{person.when} · Response captured by Rally</p></aside></div></section> }

function Waitlist({ rows }) { return <section><Header kicker="Waitlist recovery" title="Release seats with care" description="Rally only offers a released seat after the original attendee gives explicit permission." /><div className="steps">{['Decline logged', 'Seat released', 'Offer called', 'Accepted'].map((x,i) => <div key={x}><span>Step {i+1}</span><b>{x}</b><p>{['No further questions asked.', 'Returned to the seat pool.', '45-minute hold issued.', 'Counts and roster updated.'][i]}</p></div>)}</div><h3 className="section-title">Waitlist queue</h3><table><thead><tr><th>#</th><th>Attendee</th><th>Offer</th><th>Expires</th></tr></thead><tbody>{rows.map(r => <tr key={r[0]}><td>{r[0]}</td><td><b>{r[1]}</b><br/><span>{r[2]}</span></td><td><Tag type={statusClass(r[3])}>{r[3]}</Tag></td><td>{r[4]}</td></tr>)}</tbody></table></section> }

function Summary({ details }) { const outcomes = [['Responses', String(details.attendees.length), 'captured by Rally'], ['Follow-ups', String(details.tasks.length), 'in the action queue'], ['Activity events', String(details.activity.length), 'visible to organisers'], ['Waitlist', String(details.waitlist.length), 'eligible attendees']]; return <section><Header kicker="Summary" title="Campaign outcome" description="A live record built from Sarvam call results and Rally operations data." /><div className="outcomes">{outcomes.map(o => <div key={o[0]}><b>{o[1]}</b><span>{o[0]}</span><small>{o[2]}</small></div>)}</div><div className="summary-list">{details.activity.length ? details.activity.slice(0, 4).map(([time, text]) => <div key={`${time}-${text}`}><Check size={17}/>{time} · {text}</div>) : <div><Check size={17}/>No calls have completed yet. Launch the campaign to start the Sarvam call run.</div>}</div></section> }

function Header({ kicker, title, description, action }) { return <header className="page-header"><div><small>{kicker}</small><h1>{title}</h1><p>{description}</p></div>{action}</header> }
function Button({ children, icon: Icon, variant = 'primary', ...props }) { return <button className={`button ${variant}`} {...props}>{Icon && <Icon size={15} />}{children}</button> }
function Tag({ children, type = 'neutral' }) { return <span className={`tag ${type}`}>{children}</span> }
function Stat({ number, label }) { return <div className="stat"><b>{number}</b><span>{label}</span></div> }
function Progress({ values }) { return <div className="progress">{values.map((v,i) => <i key={i} style={{ flex: v }} />)}</div> }
function FormSection({ n, title, children }) { return <div className="form-section"><h3><em>{n}</em>{title}</h3>{children}</div> }
function MappingTable() { return <div className="mapping"><div className="mapping-heading"><h3>Column mapping</h3><span>90 rows · 2 skipped, missing phone</span></div><table><thead><tr><th>Source column</th><th>Rally field</th><th>Sample</th></tr></thead><tbody>{[['full_name','Name','Ananya Rao'],['phone_e164','Phone','+91 98450 22187'],['rsvp','RSVP status','Registered'],['ticket','Ticket type','Builder pass'],['calls_ok','Phone opt-in','Yes']].map(r => <tr key={r[0]}>{r.map(x => <td key={x}>{x}</td>)}</tr>)}</tbody></table></div> }
export default App
