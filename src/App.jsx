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

  useEffect(() => {
    let active = true
    rallyApi.getCampaigns().then(async (items) => {
      if (!active) return
      setCampaigns(items)
      const campaignDetails = await rallyApi.getCampaignDetails(items[0]?.id)
      if (active) setDetails(campaignDetails)
    })
    return () => { active = false }
  }, [])
  const chooseCampaign = async (item) => {
    setCampaign(item)
    setView('operations')
    setMobileNav(false)
    setSelectedPerson(0)
    setDetails(await rallyApi.getCampaignDetails(item.id))
  }
  const openNew = () => { setCampaign(null); setView('new'); setMobileNav(false) }
  if (!details) return <div className="loading">Loading Rally…</div>

  return <div className="app-shell">
    <button className="menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={20} /></button>
    <Sidebar campaign={campaign} view={view} onNavigate={setView} onHome={() => setView('campaigns')} open={mobileNav} />
    <main className="main-content">
      {view === 'campaigns' && <Campaigns campaigns={campaigns} onChoose={chooseCampaign} onNew={openNew} />}
      {view === 'new' && <NewCampaign onBack={() => setView('campaigns')} onCreate={() => chooseCampaign(campaigns[0])} />}
      {campaign && view === 'operations' && <Operations campaign={campaign} details={details} />}
      {campaign && view === 'setup' && <Setup />}
      {campaign && view === 'attendees' && <Attendees people={details.attendees} selected={selectedPerson} onSelect={setSelectedPerson} />}
      {campaign && view === 'waitlist' && <Waitlist rows={details.waitlist} />}
      {campaign && view === 'summary' && <Summary />}
    </main>
  </div>
}

function Sidebar({ campaign, view, onNavigate, onHome, open }) { return <aside className={`sidebar ${open ? 'is-open' : ''}`}>
  <div className="brand"><strong>Rally</strong><span>Event readiness agent</span></div>
  <nav><button className={view === 'campaigns' ? 'active' : ''} onClick={onHome}><LayoutDashboard size={16} />All campaigns</button>
  {campaign && <><div className="nav-label">{campaign.shortName}</div>{navItems.map(([id, label, Icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => onNavigate(id)}><Icon size={16} />{label}</button>)}</>}</nav>
  {campaign && <div className="campaign-state"><b>{campaign.shortName}</b><span>{campaign.meta}</span><small><i /> Campaign live</small></div>}
</aside> }

function Campaigns({ campaigns, onChoose, onNew }) { return <section><Header kicker="Campaigns" title="Good morning, Meera" description="Open a campaign to see its operations view, or start a new one." action={<Button icon={Plus} onClick={onNew}>New campaign</Button>} />
  <div className="campaign-grid">{campaigns.map(c => <button className="campaign-card" key={c.id} onClick={() => onChoose(c)}><div className="card-top"><div><h2>{c.name}</h2><p>{c.meta}</p></div><Tag type={statusClass(c.status)}>{c.status}</Tag></div><div className="mini-stats"><Stat number={c.confirmed} label="confirmed" /><Stat number={c.uncertain} label="uncertain" /><Stat number={c.uncontacted} label="to call" /></div><Progress values={[c.confirmed, c.uncertain, c.uncontacted]} /></button>)}
  <button className="new-card" onClick={onNew}><Plus size={20} /><strong>New campaign</strong><span>Import a list, pick questions, launch.</span></button></div></section> }

function NewCampaign({ onBack, onCreate }) { const [source, setSource] = useState('CSV or Excel'); return <section><button className="back" onClick={onBack}><ArrowLeft size={15} />All campaigns</button><Header kicker="New campaign" title="Start a readiness campaign" description="Three steps, a few minutes. No prompt writing." />
  <div className="two-column"><div className="form-flow"><FormSection n="01" title="Name the event"><div className="form-grid">{['Event name', 'Date and start time', 'Venue', 'Capacity'].map((x, i) => <label key={x}>{x}<input placeholder={['Codex Community Build Hackathon', 'Sat 14 Feb · 09:00', 'Prestige Tech Park, Bengaluru', '90 seats'][i]} /></label>)}</div></FormSection>
  <FormSection n="02" title="Import attendees"><div className="source-grid">{['CSV or Excel', 'Google Sheets', 'Notion', 'HubSpot', 'Eventbrite', 'Manual entry'].map(x => <button className={source === x ? 'selected' : ''} onClick={() => setSource(x)} key={x}><FileSpreadsheet size={17} />{x}</button>)}</div><div className="upload-box"><div><b>{source}</b><p>Upload your attendee list and Rally will map the fields.</p></div><Button icon={Upload}>Choose file</Button></div><MappingTable /></FormSection>
  <FormSection n="03" title="Choose what to ask"><div className="chips">{['Attendance', 'Arrival time', 'Parking', 'Food preference', 'Team status', 'Accessibility'].map((x, i) => <Tag key={x} type={i < 4 ? 'accent' : 'neutral'}>{x}</Tag>)}</div><div className="button-row"><Button onClick={onCreate}>Create campaign</Button><Button variant="secondary">Save draft</Button></div></FormSection></div><aside className="consent-card"><small>Consent</small><p>Rally contacts only attendees who opted in to phone contact, discloses automation, and offers an opt-out in the first ten seconds.</p></aside></div></section> }

function Operations({ campaign, details }) { return <section><Header kicker="Operations" title={campaign.name} description={`${campaign.venue} · Outreach closes in 6h 12m`} action={<div className="button-row"><Button variant="secondary" icon={Pause}>Pause campaign</Button><Button icon={Download}>Export plan</Button></div>} /><div className="headline-stats"><Stat number={campaign.confirmed} label="confirmed" /><Stat number={campaign.uncertain} label="uncertain" /><Stat number={campaign.declined} label="declined" /><Stat number={campaign.uncontacted} label="uncontacted" /></div><Progress values={[campaign.confirmed, campaign.uncertain, campaign.declined, campaign.uncontacted]} />
  <div className="dashboard-grid"><div><div className="insight-grid">{details.groups.map(g => <div className="insight-card" key={g.title}><small>{g.title}</small>{g.rows.map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>)}</div><h3 className="section-title">Action queue</h3><table><thead><tr><th>Task</th><th>Attendee</th><th>Owner</th><th>Status</th></tr></thead><tbody>{details.tasks.map(t => <tr key={t[0]}>{t.map((x,i) => <td key={x}>{i === 3 ? <Tag type="neutral">{x}</Tag> : x}</td>)}</tr>)}</tbody></table></div><aside><div className="batch-card"><small>Batch progress</small><b>62 calls completed · 12 queued</b><Progress values={[62, 12]} /><p>Average 58s · next batch 15:10 · 3 attempts max</p></div><h3 className="section-title">Live activity</h3><div className="activity">{details.activity.map(([time, text]) => <div key={time}><time>{time}</time><span>{text}</span></div>)}</div></aside></div></section> }

function Setup() { return <section><Header kicker="Campaign setup" title="Questions and safeguards" description="Adjust the call flow and rules without changing approved consent language." /><div className="setup-grid"><div><h3 className="section-title">Call questions</h3>{['Attendance confirmation', 'Expected arrival time', 'Parking requirement', 'Food preference', 'Team status', 'Accessibility request'].map((q,i) => <label className="question" key={q}><span><b>{q}</b><small>{i < 4 ? 'Required' : 'Optional'}</small></span><input type="checkbox" defaultChecked={i < 4} /></label>)}</div><div className="rule-card"><small>Campaign rules</small>{[['Campaign deadline','Fri 13 Feb, 21:00'],['Call attempts','3, spaced 90 min'],['Escalation owner','Meera K'],['Private fields','Dietary, accessibility'],['Opt-out','Offered in every call']].map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div></div></section> }

function Attendees({ people, selected, onSelect }) { const person = people[selected]; return <section><Header kicker="Attendees" title="Readiness responses" description="Every response is traceable to the attendee and their contact consent." /><div className="people-grid"><div className="people-list">{people.map((p,i) => <button key={p.name} className={i === selected ? 'person active-person' : 'person'} onClick={() => onSelect(i)}><div><b>{p.name}</b><span>{p.meta}</span></div><Tag type={statusClass(p.status)}>{p.status}</Tag></button>)}</div><aside className="person-detail"><div className="detail-heading"><div><h2>{person.name}</h2><p>{person.meta}</p><p>{person.phone}</p></div><Tag type={statusClass(person.status)}>{person.status}</Tag></div><p className="readiness">{person.readiness}</p><h3 className="section-title">Answers</h3>{person.answers.map(([k,v]) => <div className="answer" key={k}><span>{k}</span><b>{v}</b></div>)}<h3 className="section-title">Last activity</h3><p>{person.when} · Response captured by Rally</p></aside></div></section> }

function Waitlist({ rows }) { return <section><Header kicker="Waitlist recovery" title="Release seats with care" description="Rally only offers a released seat after the original attendee gives explicit permission." /><div className="steps">{['Decline logged', 'Seat released', 'Offer called', 'Accepted'].map((x,i) => <div key={x}><span>Step {i+1}</span><b>{x}</b><p>{['No further questions asked.', 'Returned to the seat pool.', '45-minute hold issued.', 'Counts and roster updated.'][i]}</p></div>)}</div><h3 className="section-title">Waitlist queue</h3><table><thead><tr><th>#</th><th>Attendee</th><th>Offer</th><th>Expires</th></tr></thead><tbody>{rows.map(r => <tr key={r[0]}><td>{r[0]}</td><td><b>{r[1]}</b><br/><span>{r[2]}</span></td><td><Tag type={statusClass(r[3])}>{r[3]}</Tag></td><td>{r[4]}</td></tr>)}</tbody></table></section> }

function Summary() { const outcomes = [['5','Seats recovered','from 6 declines'],['87%','Attendance confidence','up from 61%'],['51','Catering count fixed','9 fewer meals wasted'],['3','Human follow-ups','all owned by Meera K']]; return <section><Header kicker="Summary" title="Campaign outcome" description="A clear record of what changed, what Rally handled, and what needs a human owner." /><div className="outcomes">{outcomes.map(o => <div key={o[1]}><b>{o[0]}</b><span>{o[1]}</span><small>{o[2]}</small></div>)}</div><div className="summary-list">{['Catering revised to 42 vegetarian, 6 vegan, 3 other; four private alerts sent to the catering lead only.', '18 parking slots held at Gate 3; 11 late arrivals expected between 09:30 and 10:15.', 'Five released seats filled from the waitlist within 26 minutes of each decline.', 'One accessibility request escalated to a named organiser rather than answered by the agent.'].map(x => <div key={x}><Check size={17}/>{x}</div>)}</div></section> }

function Header({ kicker, title, description, action }) { return <header className="page-header"><div><small>{kicker}</small><h1>{title}</h1><p>{description}</p></div>{action}</header> }
function Button({ children, icon: Icon, variant = 'primary', ...props }) { return <button className={`button ${variant}`} {...props}>{Icon && <Icon size={15} />}{children}</button> }
function Tag({ children, type = 'neutral' }) { return <span className={`tag ${type}`}>{children}</span> }
function Stat({ number, label }) { return <div className="stat"><b>{number}</b><span>{label}</span></div> }
function Progress({ values }) { return <div className="progress">{values.map((v,i) => <i key={i} style={{ flex: v }} />)}</div> }
function FormSection({ n, title, children }) { return <div className="form-section"><h3><em>{n}</em>{title}</h3>{children}</div> }
function MappingTable() { return <div className="mapping"><div className="mapping-heading"><h3>Column mapping</h3><span>90 rows · 2 skipped, missing phone</span></div><table><thead><tr><th>Source column</th><th>Rally field</th><th>Sample</th></tr></thead><tbody>{[['full_name','Name','Ananya Rao'],['phone_e164','Phone','+91 98450 22187'],['rsvp','RSVP status','Registered'],['ticket','Ticket type','Builder pass'],['calls_ok','Phone opt-in','Yes']].map(r => <tr key={r[0]}>{r.map(x => <td key={x}>{x}</td>)}</tr>)}</tbody></table></div> }
export default App
