import React, { useState, useEffect, useMemo } from 'react'
const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') // empty = same origin (Express serves dist)
const TPLS = ['modern', 'minimal', 'professional', 'tech', 'fresher', 'classic', 'neon']
const DRAFT_KEY = 'cvforge_draft_v2', LEGACY_KEY = 'cvforge_draft_v1'
const uid = () => Math.random().toString(36).slice(2, 9)
// Best-effort migration of old free-text blobs into structured entries
function migrateLegacy() {
  try {
    const o = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null')
    if (!o || typeof o !== 'object') return null
    const lines = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)
    const groupBullets = (arr) => {
      const out = []; let cur = null
      for (const l of arr) {
        if (/^[-•]/.test(l)) { if (!cur) { cur = { title: '', bullets: [] }; out.push(cur) } cur.bullets.push(l.replace(/^[-•]\s*/, '')) }
        else { cur = { title: l, bullets: [] }; out.push(cur) }
      }
      return out
    }
    const d = {
      name: o.name || '', email: o.email || '', phone: o.phone || '', location: o.location || '',
      linkedin: o.linkedin || '', github: o.github || '', summary: o.summary || '', skills: o.skills || '',
      jd: o.jd || '', template: o.template || 'modern',
      education: lines(o.education).map(school => ({ id: uid(), school, degree: '', years: '', detail: '' })),
      certs: String(o.certs || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).map(name => ({ id: uid(), name })),
      experience: groupBullets(lines(o.experience)).map(g => ({ id: uid(), role: g.title, org: '', dates: '', bullets: g.bullets.join('\n') })),
      projects: groupBullets(lines(o.projects)).map(g => ({ id: uid(), name: g.title, tech: '', desc: g.bullets.join('\n') })),
      achievements: lines(o.achievements).map(text => ({ id: uid(), text })),
    }
    if (!d.education.length && !d.experience.length && !d.projects.length && !d.name) return null
    return d
  } catch { return null }
}
const EMPTY_DRAFT = { name: '', email: '', phone: '', location: '', linkedin: '', github: '', summary: '', skills: '', jd: '', template: 'modern', education: [], experience: [], projects: [], certs: [], achievements: [] }
// Guarantee list fields are always arrays of objects — any stray string/legacy
// shape becomes entries instead of crashing .map (blank page on Next).
function asEntries(val, mapLine) {
  if (Array.isArray(val)) return val.filter(x => x && typeof x === 'object')
  if (typeof val === 'string' && val.trim()) return val.split('\n').map(s => s.trim()).filter(Boolean).map(mapLine)
  return []
}
function normalizeDraft(d) {
  const b = { ...EMPTY_DRAFT, ...(d && typeof d === 'object' ? d : {}) }
  b.education = asEntries(b.education, school => ({ id: uid(), school, degree: '', years: '', detail: '' }))
  b.experience = asEntries(b.experience, line => /^[-•]/.test(line) ? { id: uid(), role: '', org: '', dates: '', bullets: line.replace(/^[-•]\s*/, '') } : { id: uid(), role: line, org: '', dates: '', bullets: '' })
  b.projects = asEntries(b.projects, line => /^[-•]/.test(line) ? { id: uid(), name: '', tech: '', desc: line.replace(/^[-•]\s*/, '') } : { id: uid(), name: line, tech: '', desc: '' })
  b.certs = asEntries(b.certs, name => ({ id: uid(), name }))
  b.achievements = asEntries(b.achievements, text => ({ id: uid(), text }))
  if (!TPLS.includes(b.template)) b.template = 'modern'
  return b
}
// Structured entries → backend plain-text payload (backend unchanged; crash-safe)
function draftToPayload(d) {
  const b = normalizeDraft(d || {})
  const edu = b.education.map(e => [e.degree && e.school ? `${e.degree}, ${e.school}` : (e.school || e.degree), e.years ? `— ${e.years}` : '', e.detail].filter(Boolean).join(' ').trim()).filter(Boolean).join('\n')
  const exp = b.experience.map(e => [[e.role, e.org].filter(Boolean).join(', ') + (e.dates ? ` — ${e.dates}` : ''), e.bullets].filter(Boolean).join('\n')).filter(Boolean).join('\n')
  const proj = b.projects.map(p => [[p.name, p.tech].filter(Boolean).join(' — '), p.desc].filter(Boolean).join('\n')).filter(Boolean).join('\n')
  return { name: b.name, email: b.email, phone: b.phone, location: b.location, linkedin: b.linkedin, github: b.github, summary: b.summary, education: edu, experience: exp, skills: b.skills, projects: proj, achievements: b.achievements.map(a => a.text).filter(Boolean).join('\n'), certs: b.certs.map(c => c.name).filter(Boolean).join(', '), jd: b.jd, template: b.template }
}
function draftProgress(d) {
  const b = normalizeDraft(d || {})
  const checks = [!!(b.name || '').trim(), !!String(b.email || '').includes('@'), b.education.length > 0, b.experience.length > 0, !!(b.skills || '').trim(), b.projects.length > 0]
  const done = checks.filter(Boolean).length
  return { pct: Math.round(done / checks.length * 100), done, total: checks.length }
}
// A render crash anywhere used to mean a dead blank page. Now it shows what broke + a way out.
class PageErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error) { try { console.error('CVForge page crash:', error) } catch {} }
  render() {
    if (this.state.error) return <div className="analysis-card"><h3>⚠️ This page hit an error</h3><p className="text-xs">{String(this.state.error.message || this.state.error)}</p><div className="flex gap-2 mt-2"><button onClick={() => this.setState({ error: null })} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs">Try again</button><button onClick={() => { try { localStorage.removeItem(DRAFT_KEY) } catch {} window.location.reload() }} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs">Reset draft + reload</button></div></div>
    return this.props.children
  }
}
const BRAND = 'CVForge', TAG = 'Create. Analyze. Improve.'

// ---------- helpers ----------
async function postJSON(path, body, token) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || r.statusText)
  return j
}
export const toast = (m) => window.dispatchEvent(new CustomEvent('cf-toast', { detail: m }))
function Toasts() {
  const [items, setItems] = useState([])
  useEffect(() => {
    const fn = (e) => { const id = Math.random().toString(36).slice(2); setItems(x => [...x, { id, m: String(e.detail) }]); setTimeout(() => setItems(x => x.filter(t => t.id !== id)), 3500) }
    window.addEventListener('cf-toast', fn)
    return () => window.removeEventListener('cf-toast', fn)
  }, [])
  return <div className="fixed bottom-20 md:bottom-6 right-4 z-50 grid gap-2">{items.map(t => <div key={t.id} className="anim-pop px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-2xl" style={{ background: 'linear-gradient(135deg,#4f46e5,#06b6d4)' }}>{t.m}</div>)}</div>
}
async function getJSON(path, token) {
  const r = await fetch(API + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || r.statusText)
  return j
}
function useHashRoute() {
  const get = () => (window.location.hash || '#/').replace(/^#/, '')
  const [route, setRoute] = useState(get())
  useEffect(() => { const fn = () => setRoute(get()); window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn) }, [])
  return [route.split('?')[0], (p) => { window.location.hash = '#' + p }]
}
function useAuth() {
  const [token, setToken] = useState(localStorage.getItem('cvforge_token') || '')
  const [user, setUser] = useState(localStorage.getItem('cvforge_user') || '')
  const save = (t, u) => { localStorage.setItem('cvforge_token', t); localStorage.setItem('cvforge_user', u); setToken(t); setUser(u) }
  const logout = () => { localStorage.removeItem('cvforge_token'); localStorage.removeItem('cvforge_user'); setToken(''); setUser('') }
  return { token, user, save, logout }
}
function useDraft() {
  const [draft, setDraftState] = useState(() => {
    try {
      const cur = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
      if (cur && typeof cur === 'object') return normalizeDraft(cur)
      const mig = migrateLegacy()
      if (mig) { const n = normalizeDraft(mig); localStorage.setItem(DRAFT_KEY, JSON.stringify(n)); return n }
    } catch {}
    return { ...EMPTY_DRAFT }
  })
  const [savedAt, setSavedAt] = useState(null)
  const timer = React.useRef(null)
  const set = (patch) => setDraftState(d => {
    const n = { ...d, ...patch }
    clearTimeout(timer.current) // autosave (debounced) — no save button needed
    timer.current = setTimeout(() => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(n)); setSavedAt(new Date()) } catch {} }, 600)
    return n
  })
  const clear = () => { clearTimeout(timer.current); localStorage.removeItem(DRAFT_KEY); setDraftState({ ...EMPTY_DRAFT }); setSavedAt(null) }
  return [draft, set, clear, savedAt]
}
const inp = 'w-full p-2 rounded-lg bg-slate-950 border border-slate-700 text-sm mb-2'
const btn = 'bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-xl py-3 font-bold w-full'
const card = 'bg-slate-900/60 border border-slate-700 rounded-2xl p-4'
function Score({ v, small }) {
  const c = v >= 80 ? '#16a34a' : v >= 65 ? '#ca8a04' : v >= 45 ? '#ea580c' : '#dc2626'
  const sz = small ? 'w-16 h-16 text-lg' : 'w-24 h-24 text-2xl', inner = small ? 'w-12 h-12' : 'w-[72px] h-[72px]'
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0; const t0 = performance.now(), dur = 900
    const tick = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); setN(Math.round(v * e)); if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [v])
  return <div className={`score-ring ${sz} rounded-full grid place-items-center font-black shrink-0`} style={{ background: `conic-gradient(${c} ${n * 3.6}deg, #1e293b 0)`, color: c }}><div className={`${inner} rounded-full bg-slate-950 grid place-items-center`}>{n}</div></div>
}
function TopNav({ route, go, auth, theme, setTheme }) {
  const appLinks = [['/dashboard', 'Dashboard'], ['/create', 'Create CV'], ['/analyzer', 'CV Analyzer'], ['/match', 'Job Matcher'], ['/interview', 'Interview'], ['/tracker', 'Tracker']];
  const toggle = () => { const n = theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('cvforge_theme', n); setTheme(n) }
  const scrollTo = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const isLanding = route === '/'
  return <div className="mb-4 sticky top-0 z-40 -mx-4 px-4 py-2 backdrop-blur-xl" style={{ background: theme === 'dark' ? 'rgba(2,6,23,.78)' : 'rgba(238,242,247,.85)' }}>
    <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 flex-wrap">
      <button onClick={() => go('/')} className="text-xl font-black tracking-tight">🔨 {BRAND}</button>
      {isLanding
        ? <div className="hidden md:flex gap-1 text-sm font-semibold">{[['features', 'Features'], ['templates', 'Templates'], ['how', 'How it works'], ['pricing', 'Pricing'], ['about', 'About']].map(([id, l]) => <button key={id} onClick={() => scrollTo('lp-' + id)} className="px-3 py-1.5 rounded-full opacity-70 hover:opacity-100">{l}</button>)}</div>
        : <div className="hidden md:flex gap-1 flex-wrap">{appLinks.map(([p, l]) => <button key={p} onClick={() => go(p)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${route === p ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white' : 'opacity-70 hover:opacity-100'}`}>{l}</button>)}</div>}
      <div className="text-xs flex gap-2 items-center"><button onClick={toggle} title="Dark / light mode" aria-label="Toggle dark or light mode" className="px-2.5 py-1.5 rounded-full border border-slate-600">{theme === 'dark' ? '🌙' : '☀️'}</button>
        {auth.user ? <button onClick={() => go('/dashboard')} className="px-3 py-1.5 rounded-full border border-slate-600 font-bold">👤 {auth.user}</button>
          : <><button onClick={() => go('/login')} className="px-3 py-1.5 font-bold opacity-80 hidden sm:block">Log in</button><button onClick={() => go('/create')} className="px-4 py-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 font-bold text-white shadow-lg">Build My CV</button></>}</div>
    </div>
  </div>
}

// ---------- pages ----------
// ---------- SaaS landing ----------
function HeroPreview() {
  const [tab, setTab] = useState('cv')
  return <div className={`${card} !p-4`}>
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950/60 border border-slate-700 mb-3">{[['cv', '📄 CV'], ['ats', '📊 ATS 87']].map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`py-1.5 rounded-lg text-xs font-bold transition-all ${tab === k ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white' : 'opacity-60'}`}>{l}</button>)}</div>
    {tab === 'cv'
      ? <div className="bg-white text-slate-900 rounded-xl p-4 text-[11px] leading-relaxed anim-pop" key="cv"><b className="text-sm">AARAV KUMAR</b><div className="text-slate-500">aarav@mail.com • Pune</div><div className="mt-2 font-bold text-indigo-700 text-[10px] tracking-wide">SUMMARY</div><div>Junior developer with internship + 2 shipped projects…</div><div className="mt-1 font-bold text-indigo-700 text-[10px] tracking-wide">SKILLS</div><div>Python, React, SQL, Docker</div></div>
      : <div className="rounded-xl p-4 text-center anim-pop" key="ats" style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.3)' }}><Score v={87} /><div className="text-xs mt-2 font-bold" style={{ color: '#6ee7b7' }}>💪 Strong Match</div><div className="text-[11px] opacity-70 mt-1">12/14 JD skills • quantified bullets • ATS-safe layout</div></div>}
  </div>
}
function Home({ go }) {
  const feat = [['🎯', 'ATS analysis', 'Score 0-100 with keyword, skill & structure breakdowns.'], ['✨', 'JD-tailored drafts', 'Paste requirements → get a CV built for that exact role.'], ['🛠️', 'One-click fixes', 'Weak bullets rewritten; apply straight into your draft.'], ['🎤', 'Interview practice', 'Tailored questions, STAR-scored 0-10.'], ['📋', 'Application tracking', 'Pipeline, reminders, shareable links with QR.'], ['🔒', 'Honest by design', 'Gaps shown as “learn this” — never invented experience.']]
  return <div className="grid gap-10">
    {/* hero */}
    <div className="grid md:grid-cols-2 gap-6 items-center pt-4">
      <div className="reveal">
        <div className="inline-block text-[11px] font-bold px-3 py-1 rounded-full border border-indigo-500/40 mb-3" style={{ background: 'rgba(99,102,241,.12)' }}>✨ Free for students • No card required</div>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.05]">Build a CV that<br />gets <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-300">noticed.</span></h1>
        <p className="mt-3 opacity-70 max-w-md">CVForge reads the job, matches it against you, and drafts a tailored resume — then proves the score before you apply.</p>
        <div className="flex gap-2 mt-5 flex-wrap"><button onClick={() => go('/create')} className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 font-bold text-white shadow-xl">Build My CV →</button><button onClick={() => go('/analyzer')} className="px-6 py-3 rounded-xl border border-slate-600 font-bold">Analyze My CV</button></div>
        <div className="text-[11px] opacity-50 mt-3">PDF + DOCX export • Fresher Mode • Works on mobile</div>
      </div>
      <div className="reveal reveal-d1"><HeroPreview /></div>
    </div>
    {/* features */}
    <div id="lp-features" className="scroll-mt-24"><h2 className="text-2xl font-black text-center">Everything between you and hired</h2><p className="text-center text-sm opacity-60 mt-1">One workflow: Create → Analyze → Improve → Match → Interview → Apply → Track.</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">{feat.map(([i, t, d], x) => <div key={t} className={`${card} reveal`} style={{ animationDelay: Math.min(x, 5) * 0.06 + 's' }}><div className="text-2xl">{i}</div><b>{t}</b><div className="text-xs opacity-60 mt-1">{d}</div></div>)}</div></div>
    {/* templates strip */}
    <div id="lp-templates" className="scroll-mt-24 text-center"><h2 className="text-2xl font-black">Templates recruiters actually read</h2><p className="text-sm opacity-60 mt-1">ATS-safe, single column, real hierarchy.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-left">{[['modern', '🟣 Modern'], ['classic', '📜 Classic'], ['minimal', '⬜ Minimal'], ['neon', '🌙 Neon']].map(([t, n]) => <button key={t} onClick={() => go('/templates')} className={`${card} hover:-translate-y-1 transition-transform`}><div className={`rounded-lg p-3 text-[11px] mb-2 ${t === 'neon' ? 'bg-slate-950' : 'bg-white text-slate-900'}`}><b>{n}</b><div className="opacity-60">Aa — Summary, Skills…</div></div><b className="text-sm">{n}</b></button>)}</div></div>
    {/* how */}
    <div id="lp-how" className="scroll-mt-24"><h2 className="text-2xl font-black text-center">How it works</h2>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">{[['1', 'Tell it the job', 'Paste a JD — AI extracts skills, keywords, seniority.'], ['2', 'Get your tailored CV', 'Built only from your real profile. Gaps marked, never faked.'], ['3', 'Prove the score', 'ATS re-check, then PDF/DOCX download & apply.']].map(([n, t, d]) => <div key={n} className={`${card} text-center`}><div className="w-9 h-9 mx-auto rounded-full grid place-items-center font-black text-white" style={{ background: 'linear-gradient(135deg,#6366f1,#06b6d4)' }}>{n}</div><b className="block mt-2">{t}</b><div className="text-xs opacity-60 mt-1">{d}</div></div>)}</div></div>
    {/* pricing */}
    <div id="lp-pricing" className="scroll-mt-24"><h2 className="text-2xl font-black text-center">Pricing</h2>
      <div className="grid sm:grid-cols-3 gap-3 mt-4">{[['Free', '₹0', 'Everything core: create, analyze, match, PDF/DOCX, tracker.', 'Start free →', '/create', false], ['Pro', 'soon', 'Unlimited AI polish, LLM interviews, priority builds.', 'Notify me →', '/login', true], ['College', 'soon', 'Placement-cell dashboards, bulk analysis, SSO.', 'Talk to us →', '/login', true]].map(([n, p, d, cta, to, soon]) =>
        <div key={n} className={card} style={n === 'Free' ? { borderColor: 'rgba(99,102,241,.5)', boxShadow: '0 0 30px rgba(99,102,241,.15)' } : {}}><b>{n}</b><div className="text-3xl font-black mt-1">{p}</div><div className="text-xs opacity-60 mt-1 min-h-[48px]">{d}</div><button onClick={() => go(to)} className={`w-full mt-2 py-2.5 rounded-xl font-bold text-sm ${n === 'Free' ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white' : 'border border-slate-600'}`}>{cta}</button></div>)}</div></div>
    {/* about + footer */}
    <div id="lp-about" className={`${card} text-center scroll-mt-24`}><b>About CVForge</b><p className="text-xs opacity-60 mt-1 max-w-lg mx-auto">Built for campus placements: honest, offline-capable analysis that shows what matches, what's missing, and exactly how to fix it — without inventing a single line of experience.</p>
      <button onClick={() => go('/create')} className="mt-3 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 font-bold text-white">Build My CV →</button></div>
  </div>
}
function Login({ go, auth }) {
  const [mode, setMode] = useState('login'); const [u, setU] = useState(''); const [email, setEmail] = useState(''); const [p, setP] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr('')
    if (!u.trim()) return setErr('Enter your name (login id)')
    if (p.length < 6) return setErr('Password must be at least 6 characters')
    if (mode === 'register' && email && !/^\S+@\S+\.\S+$/.test(email)) return setErr('Invalid email format')
    setBusy(true)
    try { const j = await postJSON(`/api/auth/${mode}`, { name: u.trim(), email: email.trim(), password: p }); auth.save(j.token, j.name || j.username); if (mode === 'register') { toast('Account created — set your target role 🎯'); go('/profile') } else go('/dashboard') }
    catch (e) { setErr(e.message || 'Request failed — is the server reachable?') }
    finally { setBusy(false) }
  }
  const onKey = (e) => { if (e.key === 'Enter') submit() }
  const switchMode = () => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }
  const field = 'w-full p-3 pl-10 rounded-xl bg-slate-950 border border-slate-700 text-sm mb-2 focus:border-indigo-400 focus:outline-none transition-all'
  return <div className="max-w-3xl mx-auto grid md:grid-cols-2 rounded-3xl overflow-hidden border border-slate-700 shadow-2xl anim-pop">
    {/* brand panel */}
    <div className="relative p-8 hidden md:flex flex-col justify-between overflow-hidden" style={{ background: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 45%,#06b6d4 100%)', backgroundSize: '200% 200%' }}>
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10 blur-2xl"></div>
      <div className="absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-cyan-300/20 blur-2xl"></div>
      <div className="relative"><div className="text-3xl font-black text-white">🔨 CVForge</div><div className="text-cyan-100 text-sm font-semibold">{TAG}</div></div>
      <div className="relative text-white text-sm grid gap-3">
        {[['⚡', 'ATS score in seconds', 'Upload → structured → gaps'], ['🎯', 'Job matcher', 'Rank every application'], ['🎤', 'Interview practice', 'STAR-scored answers'], ['🔒', 'Private by design', 'JWT • bcrypt • revocable links']].map(([i, t, d]) =>
          <div key={t} className="flex gap-2.5 items-start"><span className="text-xl leading-none">{i}</span><span><b>{t}</b><br /><span className="text-white/80 text-xs">{d}</span></span></div>)}
      </div>
      <div className="relative text-white/70 text-[11px]">Honest AI — shows gaps, never invents experience.</div>
    </div>
    {/* form panel */}
    <div className="p-6 sm:p-8 bg-slate-900/60">
      <div className="md:hidden text-center mb-3"><div className="text-2xl font-black">🔨 CVForge</div><div className="text-xs opacity-60">{TAG}</div></div>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-700 mb-4">{['login', 'register'].map(m =>
        <button key={m} onClick={() => { setMode(m); setErr('') }} className={`py-2 rounded-lg text-sm font-bold transition-all ${mode === m ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white shadow-lg' : 'opacity-60'}`}>{m === 'login' ? 'Login' : 'Sign up'}</button>)}</div>
      <h2 className="font-black text-xl">{mode === 'login' ? 'Welcome back 👋' : 'Create your account 🚀'}</h2>
      <p className="text-xs opacity-60 mb-4">{mode === 'login' ? 'Pick up right where your career left off.' : 'Free forever for the core workflow. No card, no spam.'}</p>
      <div className="relative"><span className="absolute left-3 top-3 text-sm opacity-60">👤</span><input className={field} placeholder="Name (your login id)" value={u} onChange={ev => setU(ev.target.value)} onKeyDown={onKey} /></div>
      {mode === 'register' && <div className="relative anim-pop"><span className="absolute left-3 top-3 text-sm opacity-60">✉️</span><input className={field} placeholder="Email (optional)" value={email} onChange={ev => setEmail(ev.target.value)} onKeyDown={onKey} /></div>}
      <div className="relative"><span className="absolute left-3 top-3 text-sm opacity-60">🔑</span><input className={field + ' pr-11'} type={showPw ? 'text' : 'password'} placeholder="Password (min 6 chars)" value={p} onChange={ev => setP(ev.target.value)} onKeyDown={onKey} /><button onClick={() => setShowPw(!showPw)} title={showPw ? 'Hide' : 'Show'} className="absolute right-2 top-2 px-2 py-1 text-sm opacity-70">{showPw ? '🙈' : '👁️'}</button></div>
      {mode === 'register' && <div className="flex gap-1 mb-2">{[['6+ chars', p.length >= 6], ['has letter', /[a-zA-Z]/.test(p)], ['has number', /\d/.test(p)]].map(([t, ok]) => <span key={t} className={`text-[10px] px-2 py-0.5 rounded-full border ${ok ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300' : 'border-slate-600 opacity-60'}`}>{ok ? '✓ ' : ''}{t}</span>)}</div>}
      {err && <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/40 rounded-lg p-2 mb-2 anim-pop">⚠️ {err}</div>}
      <button onClick={submit} disabled={busy} className={btn}>{busy ? 'Please wait…' : mode === 'login' ? 'Login → Dashboard' : 'Create account →'}</button>
      <button onClick={switchMode} className="text-xs underline mt-3 w-full text-center">{mode === 'login' ? "New here? Create an account" : 'Have an account? Login instead'}</button>
      <div className="text-[10px] opacity-50 text-center mt-3">bcrypt-hashed passwords • 7-day JWT sessions</div>
    </div>
  </div>
}
// Dashboard per mockup: sidebar + Your CVs cards with ATS%
// ---------- career journey (Create → Analyze → Improve → Match → Interview → Apply) ----------
const JOURNEY = [['create', 'Create', '/create', '➕'], ['analyze', 'Analyze', '/analyzer', '📤'], ['improve', 'Improve', '/analyzer', '🤖'], ['match', 'Match', '/match', '🎯'], ['interview', 'Interview', '/interview', '🎤'], ['apply', 'Apply', '/tracker', '📋']]
function getJourney() { try { return JSON.parse(localStorage.getItem('cvforge_journey') || '{}') } catch { return {} } }
function setJourneyStage(k) { try { const j = getJourney(); j[k] = true; localStorage.setItem('cvforge_journey', JSON.stringify(j)) } catch {} }
function journeyState(cvs, hist, draft) {
  const flags = getJourney()
  const best = hist.length ? Math.max(...hist.map(h => h.overall ?? h.scoreData?.overall ?? 0)) : 0
  return { create: cvs.length > 0 || !!(draft.name || '').trim(), analyze: hist.length > 0, improve: best >= 65, match: !!flags.match, interview: !!flags.interview, apply: !!flags.apply, best }
}
function Dashboard({ go, auth }) {
  const [cvs, setCvs] = useState([]); const [hist, setHist] = useState([]); const [apps, setApps] = useState([]); const [msg, setMsg] = useState(''); const [qr, setQr] = useState(null)
  const [draft] = useDraft(); const prog = draftProgress(draft)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!auth.token) return
    setLoaded(false)
    Promise.all([
      getJSON('/api/cvs', auth.token).then(j => setCvs(j.items || [])).catch(() => {}),
      getJSON('/api/history', auth.token).then(j => setHist(j.items || [])).catch(() => {}),
      getJSON('/api/applications', auth.token).then(j => setApps(j.items || [])).catch(() => {}),
    ]).finally(() => setLoaded(true))
  }, [auth.token])
  const skel = <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className={card}><div className="h-4 rounded bg-slate-700/60 w-2/3 is-busy"></div><div className="h-8 rounded bg-slate-700/40 mt-2"></div><div className="h-3 rounded bg-slate-700/40 mt-2 w-1/2"></div></div>)}</div>
  const share = async (id) => {
    try {
      const j = await postJSON(`/api/cvs/${id}/share`, {}, auth.token)
      const link = window.location.origin + window.location.pathname + '#/s/' + j.token
      await navigator.clipboard.writeText(link).catch(() => {})
      setQr(link); setMsg('🔗 Share link copied (QR below). Anyone with it can view read-only.')
    } catch (e) { setMsg('Share failed: ' + e.message) }
  }
  const revoke = async (id) => {
    try { await fetch(API + `/api/cvs/${id}/share`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.token } }); setQr(null); setMsg('🔒 Share link revoked.') }
    catch (e) { setMsg('Revoke failed: ' + e.message) }
  }
  if (!auth.token) return <div className={card}>Login to open your dashboard. <button onClick={() => go('/login')} className="underline">Login / Signup →</button></div>
  const js = journeyState(cvs, hist, draft)
  const doneCount = JOURNEY.filter(([k]) => js[k]).length
  const best = js.best || 0
  const latest = (() => { try { const h = hist[0]; if (!h) return null; return h.resultJson ? JSON.parse(h.resultJson) : null } catch { return null } })()
  const gaps = latest?.skills?.gap?.missing?.slice(0, 5) || []
  const careerProf = getCareerProfile()
  const targetJD = hist[0]?.jdText || (careerProf.targetRole ? `Target role (profile): ${careerProf.targetRole}${careerProf.location ? ' — ' + careerProf.location : ''}` : '')
  const activeApps = apps.filter(a => !['offer', 'rejected'].includes(a.status))
  const atsScore = latest?.detailed?.ats_compatibility ?? null
  const matchCov = latest?.skills?.gap?.coverage ?? null
  const matchN = latest ? `${(latest.skills?.gap?.matched || []).length}/${(latest.skills?.jd_skills || []).length} skills` : ''
  const interviewBest = (() => { try { return parseFloat(localStorage.getItem('cvforge_interview_best') || '0') || 0 } catch { return 0 } })()
  const readiness = !hist.length ? ['—', 'Run your first analysis'] : best >= 75 ? ['Ready', 'Above most ATS filters'] : best >= 60 ? ['Almost', 'One improvement pass away'] : ['Building', 'Follow the actions below']
  const actions = []
  if (!getCareerProfile().targetRole) actions.push(['🎯', 'Set your target role', 'Career Profile steers Match + Dashboard', '/profile'])
  if (!cvs.length && !draft.name) actions.push(['🌱', 'Create your first CV', 'Guided: Fresher Mode takes 4 steps', '/fresher'])
  if (hist.length && best < 65) actions.push(['🤖', 'Improve your weakest CV', `Best is ${best}/100 — run Improve`, '/analyzer'])
  if (gaps.length) actions.push(['🎯', `Close the gap: ${gaps[0]}`, 'Mini-project + mark Familiar', '/match'])
  if (!apps.length) actions.push(['📋', 'Track your first application', 'Pipeline + reminders', '/tracker'])
  if (!getJourney().interview) actions.push(['🎤', 'Practice interviewing', 'STAR-scored mock questions', '/interview'])
  if (!actions.length) actions.push(['🚀', 'Share your CV link', 'QR + read-only link', '/profile'])
  return <div className="grid gap-4">
    {/* greeting */}
    <div className="flex items-end justify-between flex-wrap gap-2">
      <div><h2 className="text-2xl font-black tracking-tight">{greet}, {auth.user}</h2><p className="text-xs opacity-60">Career Overview • {doneCount}/{JOURNEY.length} journey stages • {prog.pct}% profile</p></div>
      <div className="flex gap-2"><button onClick={() => go('/create')} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 font-bold text-sm text-white">+ New CV</button><button onClick={() => go('/analyzer')} className="px-4 py-2 rounded-xl border border-slate-600 font-bold text-sm">Analyze</button></div>
    </div>
    {/* career overview grid */}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div className={`${card} reveal flex items-center gap-3`}><Score v={best} small /><div><div className="text-[11px] opacity-60">CV SCORE (BEST)</div><div className="text-xl font-black">{hist.length ? best + '/100' : '—'}</div><div className="text-[11px] opacity-60">{hist.length} {hist.length === 1 ? 'analysis' : 'analyses'}</div></div></div>
      <div className={`${card} reveal`} style={{ animationDelay: '.05s' }}><div className="text-[11px] opacity-60">ATS SCORE</div><div className="text-xl font-black">{atsScore != null ? atsScore + '%' : '—'}</div><div className="text-[11px] opacity-60">{readiness[0]}{readiness[0] !== '—' ? ` — ${readiness[1]}` : ''}</div></div>
      <div className={`${card} reveal`} style={{ animationDelay: '.1s' }}><div className="text-[11px] opacity-60">PROFILE COMPLETION</div><div className="text-xl font-black">{prog.pct}%</div><div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: prog.pct + '%' }}></div></div><div className="text-[11px] opacity-60 mt-1">{prog.done}/{prog.total} fields</div></div>
      <div className={`${card} reveal`} style={{ animationDelay: '.15s' }}><div className="text-[11px] opacity-60">JOB MATCH</div><div className="text-xl font-black">{matchCov != null ? matchCov + '%' : '—'}</div><div className="text-[11px] opacity-60">{matchN || (targetJD ? 'vs latest target' : 'Analyze to measure fit')}</div><button onClick={() => go('/match')} className="text-[11px] underline mt-1">Rank jobs →</button></div>
      <div className={`${card} reveal`} style={{ animationDelay: '.2s' }}><div className="text-[11px] opacity-60">APPLICATIONS ({activeApps.length} ACTIVE)</div>{apps.length ? <div className="text-xs mt-1">{apps.slice(0, 3).map(a => <div key={a._id || a.id} className="truncate">{a.title} @ {a.company || '?'} — <b>{a.status}</b></div>)}</div> : <div className="text-xs opacity-60 mt-1">Nothing tracked yet.</div>}<button onClick={() => go('/tracker')} className="text-[11px] underline mt-1">Open tracker →</button></div>
      <div className={`${card} reveal`} style={{ animationDelay: '.25s' }}><div className="text-[11px] opacity-60">INTERVIEW READINESS</div><div className="text-xl font-black">{interviewBest ? interviewBest + '/10' : '—'}</div><div className="text-[11px] opacity-60">{interviewBest ? (interviewBest >= 8 ? 'Interview ready 🌟' : interviewBest >= 6 ? 'Good — keep polishing' : 'Needs practice') : 'No mock yet'}</div><button onClick={() => go('/interview')} className="text-[11px] underline mt-1">Practice →</button></div>
    </div>
    <div className={`${card} reveal`} style={{ borderColor: 'rgba(99,102,241,.4)' }}><div className="text-[11px] opacity-60">RECOMMENDED ACTIONS</div><div className="grid sm:grid-cols-3 gap-2 mt-1">{actions.slice(0, 3).map(([i, t, d, to]) => <button key={t} onClick={() => go(to)} className="block w-full text-left p-2.5 rounded-xl bg-slate-950 border border-slate-700 hover:border-indigo-400 transition-all text-xs"><span className="mr-1">{i}</span><b>{t}</b><br /><span className="opacity-60 ml-5">{d} →</span></button>)}</div></div>
    {/* journey (slim) */}
    <div className={card}><div className="flex items-center gap-1 overflow-x-auto">{JOURNEY.map(([k, label, path, icon], i) => <div key={k} className="flex items-center gap-1 shrink-0">
        <button onClick={() => go(path)} title={label} className={`w-9 h-9 rounded-full grid place-items-center border-2 transition-all ${js[k] ? 'bg-emerald-500 border-emerald-300' : 'bg-slate-800 border-slate-600'}`}>{js[k] ? '✓' : icon}</button>
        {i < JOURNEY.length - 1 && <div className={`w-4 sm:w-6 journey-line ${js[k] ? '' : 'opacity-20'}`}></div>}</div>)}<span className="text-[11px] opacity-60 ml-2">Journey {doneCount}/{JOURNEY.length}</span></div></div>
    {/* your CVs (existing) */}
    <div><h2 className="font-black text-lg mb-2">Your CVs</h2>
      {msg && <div className="text-xs mb-2 break-all">{msg}</div>}
      {qr && <div className={`${card} flex items-center gap-3 mb-2`}><img src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qr)}`} alt="Share QR" className="rounded-lg bg-white p-1 w-[140px] h-[140px]" /><div className="text-xs break-all"><b>Scan to open</b><br />{qr}<br /><span className="opacity-60">QR via qrserver (needs internet); link works regardless.</span></div></div>}
      <div className={`${card} mb-2`}><b className="text-sm">📈 Profile progress — {prog.pct}%</b><div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-1"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500" style={{ width: prog.pct + '%' }}></div></div><div className="text-[11px] opacity-60 mt-1">{prog.done}/{prog.total}: name, email, education, experience, skills, projects — finish in Create CV.</div></div>
      {!loaded ? skel : !cvs.length ? <div className={card}><span className="text-sm opacity-70">📭 No CVs yet — your first one takes ~2 minutes.</span> <button onClick={() => go('/create')} className="underline text-sm">Create your first CV →</button></div> : null}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cvs.map((c, i) => { const score = hist[i]?.overall ?? hist[i]?.scoreData?.overall ?? null; return <div key={c._id || c.id || i} className={card}>
          <b className="text-sm">{c.personalInfo?.name || 'Untitled CV'}</b><div className="text-[11px] text-slate-500">{c.template} • {(c.createdAt || '').slice(0, 10)}</div>
          <div className="flex items-center gap-2 mt-2">{score != null ? <><Score v={Math.round(score)} small /><span className="text-xs">{score}% ATS</span></> : <span className="text-xs text-slate-500">Not analyzed yet</span>}</div>
          <div className="flex gap-2 mt-2 flex-wrap"><button onClick={() => go('/preview')} className="text-xs underline">Preview</button><button onClick={() => go('/analyzer')} className="text-xs underline">Analyze</button><button onClick={() => share(c._id || c.id)} className="text-xs underline">🔗 Share / QR</button><button onClick={() => { if (confirm('Revoke this share link? Viewers will lose access.')) revoke(c._id || c.id) }} className="text-xs underline">🔒 Revoke</button></div>
        </div> })}
      </div></div>
  </div>
}
const STEPS = ['Personal Info', 'Education', 'Skills', 'Experience', 'Projects', 'Certifications', 'Template']

// ---------- structured entry cards (Add / Edit / Delete) ----------
const SECTION_FIELDS = {
  education: [['school', 'School / College *', 'Pune University'], ['degree', 'Degree', 'BCA Computer Science'], ['years', 'Years', '2022-2025'], ['detail', 'Score / detail', '78%, First Class']],
  experience: [['role', 'Role *', 'Software Intern'], ['org', 'Company', 'Tech Solutions'], ['dates', 'Dates', 'Jun 2024 - Dec 2024']],
  projects: [['name', 'Project *', 'E-Commerce Clone'], ['tech', 'Tech stack', 'React, Node.js, MongoDB']],
}
function EntryList({ icon, title, hint, items, onChange, section, single, singleKey, singleLabel, textareaKey, textareaLabel, textareaPh, aiKind, aiTech, addLabel }) {
  const list = Array.isArray(items) ? items.filter(x => x && typeof x === 'object') : []
  const [editing, setEditing] = useState(null) // id | 'new' | null
  const [form, setForm] = useState({})
  const startNew = () => { const blank = { id: uid() }; setForm(blank); setEditing('new') }
  const startEdit = (it) => { setForm({ ...it }); setEditing(it.id) }
  const save = () => {
    if (section && SECTION_FIELDS[section]) {
      const req = SECTION_FIELDS[section][0][0]
      if (!String(form[req] || '').trim()) return toast('Please fill the required field (*)')
    } else if (single && !String(form[singleKey] || '').trim()) return toast('Cannot save an empty entry')
    const next = editing === 'new' ? [...list, form] : list.map(it => it.id === editing ? form : it)
    onChange(next); setEditing(null); setForm({})
  }
  const headline = (it) => single ? it[singleKey] : (it.role || it.name || it.school || '')
  const subline = (it) => single ? '' : ([it.org || it.degree || it.tech, it.dates || it.years, it.detail].filter(Boolean).join(' • '))
  return <div>
    <div className="flex items-center justify-between mb-2"><b>{icon} {title}</b><span className="text-[11px] text-slate-500">{list.length} added</span></div>
    {hint && <div className="text-[11px] text-slate-500 mb-2">{hint}</div>}
    <div className="grid gap-2">
      {list.map(it => <div key={it.id} className="bg-slate-950 border border-slate-700 rounded-xl p-3">
        {editing === it.id ? <EntryForm section={section} single={single} singleKey={singleKey} singleLabel={singleLabel} textareaKey={textareaKey} textareaLabel={textareaLabel} textareaPh={textareaPh} aiKind={aiKind} aiTech={aiTech} form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(null)} /> :
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm"><b>{headline(it) || '(untitled)'}</b>{subline(it) && <div className="text-xs text-slate-400">{subline(it)}</div>}
            {(it.bullets || it.desc) && <div className="text-xs text-slate-500 mt-1 whitespace-pre-wrap">{(it.bullets || it.desc).slice(0, 160)}{(it.bullets || it.desc).length > 160 ? '…' : ''}</div>}</div>
          <div className="flex gap-1 shrink-0"><button onClick={() => startEdit(it)} className="text-xs px-2 py-1 rounded-lg bg-slate-800 border border-slate-600">Edit</button><button onClick={() => onChange(list.filter(x => x.id !== it.id))} className="text-xs px-2 py-1 rounded-lg bg-rose-950 border border-rose-800 text-rose-200">Delete</button></div>
        </div>}
      </div>)}
    </div>
    {editing === 'new'
      ? <div className="bg-slate-950 border border-indigo-500 rounded-xl p-3 mt-2"><EntryForm section={section} single={single} singleKey={singleKey} singleLabel={singleLabel} textareaKey={textareaKey} textareaLabel={textareaLabel} textareaPh={textareaPh} aiKind={aiKind} aiTech={aiTech} form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(null)} /></div>
      : <button onClick={startNew} className="mt-2 w-full py-2 rounded-xl border border-dashed border-slate-600 text-sm font-bold hover:border-indigo-400">+ Add {addLabel || title}</button>}
  </div>
}
function EntryForm({ section, single, singleKey, singleLabel, textareaKey, textareaLabel, textareaPh, aiKind, aiTech, form, setForm, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const aiFill = () => {
    const sug = describeBullets(aiTech, aiKind)
    const cur = form[textareaKey] ? form[textareaKey].replace(/\s+$/, '') + '\n' : ''
    setForm({ ...form, [textareaKey]: cur + sug[(form[textareaKey] || '').split('\n').filter(Boolean).length % sug.length] })
  }
  return <div>
    {single
      ? <input className={inp} placeholder={singleLabel} value={form[singleKey] || ''} onChange={set(singleKey)} />
      : SECTION_FIELDS[section].map(([k, label, ph]) => <div key={k}><label className="text-[11px] text-slate-400">{label}</label><input className={inp} placeholder={ph} value={form[k] || ''} onChange={set(k)} /></div>)}
    {textareaKey && <div><label className="text-[11px] text-slate-400">{textareaLabel}</label><textarea className={inp + ' h-20'} placeholder={textareaPh} value={form[textareaKey] || ''} onChange={set(textareaKey)} />{aiKind && <button onClick={aiFill} className="text-[11px] px-2 py-1 rounded-lg bg-indigo-900 border border-indigo-700 mb-2">✨ AI describe (uses your Skills)</button>}</div>}
    <div className="flex gap-2"><button onClick={onSave} className="px-4 py-2 rounded-lg bg-indigo-600 font-bold text-sm">Save</button><button onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-600 text-sm">Cancel</button></div>
  </div>
}

// ---------- A4 CV preview (white page, desktop + mobile) ----------
function A4Preview({ draft: rawDraft, template, liveText }) {
  const draft = normalizeDraft(rawDraft || {})
  const tpl = template || 'modern'
  const L = (arr) => (arr || []).filter(Boolean)
  const edu = L(draft.education).map(e => `${e.degree ? e.degree + ', ' : ''}${e.school || ''}${e.years ? ' — ' + e.years : ''}${e.detail ? ' (' + e.detail + ')' : ''}`)
  return <div className={`a4 ${tpl}`}>
    <h2>{(draft.name || 'YOUR NAME').toUpperCase()}</h2>
    <div className="a4-contact">{[draft.email, draft.phone, draft.location].filter(Boolean).join('  •  ')}</div>
    {(draft.linkedin || draft.github) && <div className="a4-contact">{[draft.linkedin, draft.github].filter(Boolean).join('  •  ')}</div>}
    {draft.summary && <><h4>Summary</h4><p>{draft.summary}</p></>}
    {!!edu.length && <><h4>Education</h4><ul>{edu.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
    {!!L(draft.experience).length && <><h4>Experience</h4>{L(draft.experience).map(e => <div key={e.id} className="a4-block"><b>{[e.role, e.org].filter(Boolean).join(', ')}</b>{e.dates && <span> — {e.dates}</span>}{e.bullets && <ul>{e.bullets.split('\n').map((b, i) => <li key={i}>{b.replace(/^[-•]\s*/, '')}</li>)}</ul>}</div>)}</>}
    {!!L(draft.projects).length && <><h4>Projects</h4>{L(draft.projects).map(p => <div key={p.id} className="a4-block"><b>{p.name}</b>{p.tech && <span> — {p.tech}</span>}{p.desc && <p>{p.desc}</p>}</div>)}</>}
    {draft.skills && <><h4>Skills</h4><p>{draft.skills}</p></>}
    {!!L(draft.achievements).length && <><h4>Achievements</h4><ul>{L(draft.achievements).map(a => <li key={a.id}>{a.text}</li>)}</ul></>}
    {!!L(draft.certs).length && <><h4>Certifications</h4><p>{L(draft.certs).map(c => c.name).join(', ')}</p></>}
    {liveText && <div className="a4-note">AI-polished on Build →</div>}
  </div>
}
function Create({ go, auth }) {
  const [draft, setDraft, clearDraft, savedAt] = useDraft()
  const [step, setStep] = useState(0); const [out, setOut] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [view, setView] = useState('edit')
  const set = k => e => setDraft({ [k]: e.target.value })
  const v = (k) => draft[k] || ''
  const prog = draftProgress(draft)
  const doneSteps = [!!(v('name').trim() && v('email').includes('@')), (draft.education || []).length > 0, !!v('skills').trim(), (draft.experience || []).length > 0, (draft.projects || []).length > 0, (draft.certs || []).length > 0, !!v('template')]
  const payload = () => draftToPayload(draft)
  const saveCV = async () => {
    if (!auth.token) { go('/login'); return }
    try { await postJSON('/api/cvs', payload(), auth.token); toast('CV saved to your account ✓') }
    catch (e) { setErr('Save failed: ' + (e.message || 'server unreachable')) }
  }
  const build = async () => { setBusy(true); setErr(''); try { setOut(await postJSON('/api/build', payload())) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const TPL_META = [['modern', '🟣 Modern', 'Indigo accents'], ['minimal', '⬜ Minimal', 'Clean + airy'], ['professional', '💼 Professional', 'Navy, boardroom-ready'], ['tech', '💻 Tech', 'Mono accents, dev style'], ['fresher', '🌱 Fresher', 'Green, student-first'], ['classic', '📜 Classic', 'Max ATS parse'], ['neon', '🌙 Neon', 'Dark page']]
  return <div>
    {/* compact stepper + progress + autosave (below xl; xl uses the left section panel) */}
    <div className={`${card} !p-3 mb-3 xl:hidden`}>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">{STEPS.map((s, i) => <button key={s} onClick={() => setStep(i)} className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${step === i ? 'bg-gradient-to-r from-indigo-500 to-cyan-500' : 'bg-slate-800 border border-slate-700'}`}><span className={`w-4 h-4 rounded-full grid place-items-center text-[10px] ${doneSteps[i] ? 'bg-emerald-500' : 'bg-slate-600'}`}>{doneSteps[i] ? '✓' : i + 1}</span>{s}</button>)}</div>
      <div className="flex items-center gap-2 mt-2"><div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all" style={{ width: prog.pct + '%' }}></div></div><span className="text-[11px] font-bold">{prog.pct}%</span><span className="text-[11px] text-slate-500">{savedAt ? `Autosaved ✓ ${savedAt.toLocaleTimeString()}` : 'Autosave on…'}</span></div>
    </div>
    {/* mobile Edit / Preview tabs */}
    <div className="md:hidden flex gap-2 mb-3"><button onClick={() => setView('edit')} className={`flex-1 py-2 rounded-xl text-sm font-bold ${view === 'edit' ? 'bg-gradient-to-r from-indigo-500 to-cyan-500' : 'bg-slate-800 border border-slate-700'}`}>✏️ Edit</button><button onClick={() => setView('preview')} className={`flex-1 py-2 rounded-xl text-sm font-bold ${view === 'preview' ? 'bg-gradient-to-r from-indigo-500 to-cyan-500' : 'bg-slate-800 border border-slate-700'}`}>👁️ Preview</button></div>
    <div className="grid md:grid-cols-2 xl:grid-cols-[210px_minmax(0,1fr)_minmax(0,1.05fr)] gap-4">
      {/* left section panel (document-editor rail, xl+) */}
      <div className={`${card} !p-3 hidden xl:flex xl:flex-col gap-1 h-fit sticky top-4`}>
        <b className="text-xs opacity-70 px-1">SECTIONS</b>
        {STEPS.map((s, i) => <button key={s} onClick={() => setStep(i)} className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-bold text-left transition-all ${step === i ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 text-white' : 'hover:bg-slate-800'}`}><span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] shrink-0 ${doneSteps[i] ? 'bg-emerald-500' : 'bg-slate-600'}`}>{doneSteps[i] ? '✓' : i + 1}</span>{s}</button>)}
        <div className="mt-2 px-1"><div className="flex justify-between text-[11px] font-bold"><span>{prog.pct}%</span><span className="opacity-60">{savedAt ? `✓ ${savedAt.toLocaleTimeString()}` : 'Autosave…'}</span></div><div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all" style={{ width: prog.pct + '%' }}></div></div></div>
      </div>
      <div className={`${card} ${view === 'preview' ? 'hidden md:block' : ''}`}>
        {step === 0 && <div><b>Personal Info</b><div className="grid grid-cols-2 gap-2 mt-2"><input className={inp} placeholder="Full Name *" value={v('name')} onChange={set('name')} /><input className={inp} placeholder="Email *" value={v('email')} onChange={set('email')} /><input className={inp} placeholder="Phone" value={v('phone')} onChange={set('phone')} /><input className={inp} placeholder="Location" value={v('location')} onChange={set('location')} /><input className={inp} placeholder="LinkedIn URL" value={v('linkedin')} onChange={set('linkedin')} /><input className={inp} placeholder="GitHub URL" value={v('github')} onChange={set('github')} /></div><label className="text-xs text-slate-400">Summary (blank = AI generates)</label><textarea className={inp + ' h-16'} value={v('summary')} onChange={set('summary')} /></div>}
        {step === 1 && <div className="grid gap-3"><EntryList icon="🎓" title="Education" hint="Degree, college, years, score — freshers: this is your headline section." items={draft.education || []} onChange={(education) => setDraft({ education })} section="education" addLabel="school" /></div>}
        {step === 3 && <EntryList icon="💼" title="Experience" hint="One card per role. Bullets: one achievement per line." items={draft.experience || []} onChange={(experience) => setDraft({ experience })} section="experience" textareaKey="bullets" textareaLabel="Achievements (one per line)" textareaPh="Built REST API with Flask for 500+ users&#10;Improved load time 30%" aiKind="experience" aiTech={v('skills')} />}
        {step === 2 && <div><b>Skills</b><textarea className={inp + ' h-24 mt-2'} value={v('skills')} onChange={set('skills')} placeholder="Python, React, SQL, Git, Docker" /><label className="text-xs text-slate-400">Target JD (tailors summary + skills)</label><textarea className={inp + ' h-24'} value={v('jd')} onChange={set('jd')} placeholder="Paste job description…" /></div>}
        {step === 4 && <div className="grid gap-3"><EntryList icon="🚀" title="Projects" items={draft.projects || []} onChange={(projects) => setDraft({ projects })} section="projects" textareaKey="desc" textareaLabel="What it does (1-2 lines)" textareaPh="Cart + payment flow for 500 test users" aiKind="project" aiTech={v('skills')} /><EntryList icon="🏆" title="Achievements" hint="Quantify: ranks, %, users." items={draft.achievements || []} onChange={(achievements) => setDraft({ achievements })} single singleKey="text" singleLabel="Achievement" /></div>}
        {step === 5 && <EntryList icon="📜" title="Certifications" hint="Courses, certificates, licenses — one per card." items={draft.certs || []} onChange={(certs) => setDraft({ certs })} single singleKey="name" singleLabel="Certification name (e.g. AWS Cloud Practitioner 2024)" />}
        {step === 6 && <div><b>Professional templates — switching never loses your info</b><div className="grid grid-cols-2 gap-2 mt-2">{TPL_META.map(([t, n, d]) => <button key={t} onClick={() => setDraft({ template: t })} className={`rounded-xl p-2 text-left border-2 ${(v('template') || 'modern') === t ? 'border-indigo-400' : 'border-slate-700'}`}><div className={`rounded-lg p-2 text-[10px] mb-1 ${t === 'neon' ? 'bg-slate-950 text-slate-200' : 'bg-white text-slate-900'}`}><b>Aa</b> — {t}</div><b className="text-xs">{n}</b><div className="text-[10px] text-slate-500">{d}</div></button>)}</div>
          <button onClick={build} disabled={busy} className={`${btn} mt-3`}>{busy ? 'Building…' : '✨ Build my CV →'}</button>
          <div className="flex gap-3 mt-2"><button onClick={saveCV} className="text-xs underline">💾 Save CV to account</button><button onClick={() => { if (confirm('Clear this draft? Unsaved entries will be lost.')) clearDraft() }} className="text-xs underline">Clear</button></div>
          {out && <div className="text-xs mt-2 anim-pop">Score {out.analysis.scores.overall}/100 — {out.analysis.scores.verdict} <button onClick={() => go('/preview')} className="underline ml-1">Preview →</button></div>}</div>}
        {err && <div className="text-xs text-rose-300 mt-2">⚠️ {err}</div>}
        <div className="flex justify-between mt-3"><button onClick={() => setStep(Math.max(0, step - 1))} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">← Back</button><button onClick={() => setStep(Math.min(6, step + 1))} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">Next →</button></div>
      </div>
      <div className={`${view === 'edit' ? 'hidden md:block' : ''}`}>
        <div className="md:sticky md:top-4"><div className="flex items-center justify-between mb-2"><b>A4 Live Preview</b><button onClick={() => go('/preview')} className="text-xs underline">Full preview + PDF →</button></div>
        <A4Preview draft={draft} template={v('template') || 'modern'} /></div>
      </div>
    </div>
  </div>
}
function Templates({ go }) {
  const [, setDraft] = useDraft()
  return <div className="grid gap-3"><h2 className="font-black text-lg">🎨 Templates</h2>
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{[['modern', '🟣 Modern', 'Indigo accents, clean'], ['minimal', '⬜ Minimal', 'Whitespace, junior-friendly'], ['professional', '💼 Professional', 'Navy, boardroom-ready'], ['tech', '💻 Tech', 'Mono accents, dev style'], ['fresher', '🌱 Fresher', 'Green, student-first'], ['classic', '📜 Classic ATS', 'Serif, max parseability'], ['neon', '🌙 Neon Dark', 'Dark, portfolio-style']].map(([t, n, d]) =>
      <div key={t} className={card}><b>{n}</b><div className="text-xs text-slate-400 mb-2">{d}</div>
        <div className={`rounded-lg p-3 text-[11px] ${t === 'neon' ? 'bg-slate-950 text-slate-200' : 'bg-white text-slate-900'}`}><b>YOUR NAME</b><div>email • phone</div><div className="mt-1 font-bold">SUMMARY</div><div>Motivated developer…</div></div>
        <button onClick={() => { setDraft({ template: t }); go('/create') }} className="mt-2 text-xs underline">Use {t} →</button></div>)}</div></div>
}
function Settings({ auth, go }) {
  const [health, setHealth] = useState(null); const [, , clearDraft] = useDraft(); const [msg, setMsg] = useState('')
  useEffect(() => { getJSON('/api/health').then(setHealth).catch(() => {}) }, [])
  const exportAll = async () => {
    try {
      const j = await getJSON('/api/me/export', auth.token)
      const b = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cvforge-my-data.json'; a.click()
    } catch (e) { setMsg('Export failed: ' + e.message) }
  }
  const delAccount = async () => {
    if (!confirm('Delete your account + all CVs, analyses and applications? This cannot be undone.')) return
    if (!confirm('Really delete everything? Last chance.')) return
    try { await fetch(API + '/api/me', { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.token } }); auth.logout(); go('/') }
    catch (e) { setMsg('Delete failed: ' + e.message) }
  }
  return <div className={`${card} max-w-lg`}><h2 className="font-black text-lg">⚙️ Settings</h2>
    <div className="text-xs text-slate-400">API: {API || 'same origin (this site)'}</div>
    <div className="text-xs mt-1">Backend: {health ? `ok • mongo=${String(health.mongo)} • llm=${String(health.llm)}` : '…'}</div>
    <div className="text-xs text-slate-400 mt-2">Uploads: PDF/DOCX/TXT/MD • max 5MB • memory-only (auto-deleted, never on disk) • rate-limited API.</div>
    <div className="flex gap-2 mt-3 flex-wrap"><button onClick={() => { if (confirm('Clear local draft?')) clearDraft() }} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs">Clear local draft</button>{auth.user && <button onClick={auth.logout} className="px-3 py-1.5 rounded-lg bg-rose-900 text-xs">Logout {auth.user}</button>}</div>
    {auth.token && <div className="mt-4 border-t border-slate-700 pt-3"><b className="text-sm">🔒 Privacy</b><div className="text-xs opacity-70">Share links are random unguessable tokens; revoke any time. Export or erase everything below.</div>
      <div className="flex gap-2 mt-2 flex-wrap"><button onClick={exportAll} className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs">⬇ Export my data (JSON)</button><button onClick={delAccount} className="px-3 py-1.5 rounded-lg bg-red-950 border border-red-800 text-red-200 text-xs">🗑 Delete my account + all data</button></div></div>}
    {msg && <div className="text-xs mt-2">{msg}</div>}</div>
}
function Preview() {
  const [draft] = useDraft(); const [built, setBuilt] = useState(''); const [score, setScore] = useState(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState(''); const tpl = draft.template || 'modern'
  useEffect(() => { postJSON('/api/build', draftToPayload(draft)).then(r => { setBuilt(r.cv_text); setScore(r.analysis.scores) }).catch(e => setErr(e.message || 'Build failed — is the server reachable?')) }, [])
  const pdf = async () => {
    try {
      const r = await fetch(API + '/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${draft.name || 'Resume'} — ${tpl} CV`, text: built }) })
      if (!r.ok) throw new Error(`PDF failed (${r.status})`)
      const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'resume.pdf'; a.click()
    } catch (e) { setErr(e.message) }
  }
  const docx = async () => {
    try {
      const r = await fetch(API + '/api/docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${draft.name || 'Resume'} — ${tpl} CV`, text: built }) })
      if (!r.ok) throw new Error(`DOCX failed (${r.status})`)
      const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'resume.docx'; a.click()
    } catch (e) { setErr(e.message) }
  }
  return <div className="grid gap-3"><div className="flex gap-2 items-center flex-wrap"><b>CV Preview ({tpl})</b>{score && <span className="text-xs">ATS {score.overall}/100 — {score.verdict}</span>}</div>
    {err && <div className="text-xs text-rose-300">⚠️ {err}</div>}
    <div className="max-w-[700px] mx-auto w-full"><A4Preview draft={draft} template={tpl} /></div>
    <div className="flex gap-2 flex-wrap justify-center"><button onClick={pdf} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 font-bold text-sm">📄 Download as PDF</button><button onClick={docx} className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-600 text-sm font-bold">📝 Download as DOCX</button><button onClick={() => window.print()} className="px-4 py-2 rounded-xl border border-slate-600 text-sm">🖨️ Print</button></div>
    {msg && <div className="text-xs text-center break-all">{msg}</div>}
    {built && <details className="max-w-[700px] mx-auto w-full"><summary className="text-xs text-slate-400">AI-polished plain text (sent to PDF)</summary><pre className="whitespace-pre-wrap text-[11px] rounded-xl p-4 bg-slate-950 border border-slate-700 mt-1">{built.slice(0, 4000)}</pre></details>}</div>
}
function ImprovePanel({ cv, jd, res, onApplyImproved }) {
  const [, setDraft] = useDraft()
  const [enh, setEnh] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [applied, setApplied] = useState(false)
  const run = async () => {
    setBusy(true); setErr(''); setApplied(false)
    try { const j = await postJSON('/api/enhance', { cv_text: cv, jd_text: jd }); setEnh(j.enhanced); setJourneyStage('improve') }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const applyToCV = () => { onApplyImproved(enh.enhanced_full); setApplied(true) }
  const applyToDraft = () => {
    try {
      const cur = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')
      const skills = [cur.skills, (enh.missing_injected || []).map(m => `${m} (Familiar)`)].filter(Boolean).join(', ')
      localStorage.setItem(DRAFT_KEY, JSON.stringify(normalizeDraft({ ...cur, summary: enh.enhanced_summary || cur.summary, skills: skills || cur.skills })))
      setApplied('draft')
    } catch (e) { setErr('Could not write draft: ' + e.message) }
  }
  const reportText = () => {
    const s = res.scores, d = res.detailed || {}, cmp = res.comparison || {}
    return [`CVForge analysis — ${new Date().toLocaleString()}`, `Overall ${s.overall}/100 — ${s.verdict}`,
      `Keyword ${s.keyword_match}% | Semantic ${s.semantic_similarity}% | Skills ${s.skill_coverage}% | ATS ${d.ats_compatibility ?? '—'}% | Formatting ${d.formattingScore ?? '—'}%`,
      `Present: ${(cmp.present || []).join(', ') || '—'}`, `Missing: ${(cmp.missing || []).join(', ') || '—'}`,
      `Sections missing: ${(d.missing_sections || []).join(', ') || 'none'}`,
      `Suggestions:\n${(d.suggestions || []).map(x => '- ' + x).join('\n')}`].join('\n')
  }
  const copyReport = async () => { try { await navigator.clipboard.writeText(reportText()); setErr(''); setApplied('copied') } catch { setErr('Copy blocked by browser') } }
  const downloadReport = () => { const b = new Blob([reportText()], { type: 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'cvforge-report.txt'; a.click() }
  const before = res.scores.overall, after = enh ? enh.predicted_score : null
  return <div className="analysis-card sect-improve"><h3>🚀 Improve My CV — Before vs After</h3>
    <p className="text-[11px] opacity-80">AI rewrites your bullets STAR-style and injects missing skills honestly as “(Familiar)”. Apply it back into the CV box above and the report re-runs — this comparison becomes real measured numbers.</p>
    <div className="flex gap-2 flex-wrap mt-2">
      {!enh && <button onClick={run} disabled={busy} className="glow-btn px-4 py-2.5 rounded-xl font-black text-sm text-white">{busy ? 'Rewriting…' : '🚀 Improve My CV'}</button>}
      <button onClick={copyReport} className="px-3 py-2 rounded-xl border border-slate-500 text-xs">📋 Copy report</button>
      <button onClick={downloadReport} className="px-3 py-2.5 rounded-xl border border-slate-500 text-sm">⬇ Report .txt</button>
    </div>
    {err && !applied && <p className="missing text-xs mt-1">⚠️ {err}</p>}
    {applied === 'copied' && <p className="success text-xs mt-1">✅ Report copied.</p>}
    {enh && <div className="mt-3 anim-pop">
      <div className="grid grid-cols-2 gap-3 max-w-md">
        {[['Before', before, '#64748b'], ['After' + (applied === true ? ' (measured)' : ' (predicted)'), applied === true ? (res.scores.overall) : after, '#10b981']].map(([l, v, c]) =>
          <div key={l} className="p-3 rounded-xl border border-white/10 text-center" style={{ background: 'rgba(255,255,255,.04)' }}><div className="text-[11px] opacity-70">{l}</div><div className="text-3xl font-black" style={{ color: c }}>{v}</div><div className="h-2 rounded-full mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,.12)' }}><div className="h-full rounded-full transition-all duration-700" style={{ width: Math.min(100, v) + '%', background: c }}></div></div></div>)}
      </div>
      <ul className="text-xs mt-2">{(enh.enhanced_bullets || []).map((b, i) => <li key={i}>{b}</li>)}</ul>
      <p className="text-xs mt-1"><b>Skills line:</b> {enh.enhanced_skills_line}</p>
      <p className="text-[11px] opacity-70 mt-1">Fixes: {(enh.fixes || []).join(' • ')}</p>
      {!applied || applied === 'copied'
        ? <div className="flex gap-2 flex-wrap mt-2"><button onClick={applyToCV} className="px-4 py-2.5 rounded-xl bg-emerald-600 font-black text-sm text-white">⬆ Use improved CV + re-analyze</button><button onClick={applyToDraft} className="px-4 py-2.5 rounded-xl border border-slate-500 text-sm">⬆ Send to my draft</button></div>
        : applied === true
          ? <p className="success text-xs mt-2 anim-pop">✅ Applied + re-analyzed above — that After score is now <b>measured</b>, not predicted.</p>
          : <p className="success text-xs mt-2">✅ In your draft — open Create CV → Build → Analyze to verify.</p>}
    </div>}
  </div>
}
function QuickFixPanel({ cv, onApply }) {
  const [pairs, setPairs] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [applied, setApplied] = useState([])
  const applyAll = () => { (pairs || []).forEach((p, i) => { if (!applied.includes(i)) onApply(p.original, p.improved) }); setApplied((pairs || []).map((_, i) => i)) }
  const load = async () => {
    setBusy(true); setErr(''); setApplied([])
    try { const j = await postJSON('/api/quickfix', { cv_text: cv }); setPairs(j.pairs || []) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return <div><h3>🛠️ Quick Fix — original vs improved</h3>
    <p className="text-[11px]">One-tap fixes per sentence (action verbs + typos). Metrics are flagged, never invented — Apply writes it into your CV box above.</p>
    {!pairs && <button onClick={load} disabled={busy} className="mt-1 px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>{busy ? 'Finding fixes…' : '🛠️ Find quick fixes'}</button>}
    {pairs && !!pairs.length && <button onClick={applyAll} className="mt-1 ml-2 px-4 py-2.5 rounded-xl font-bold text-sm text-white bg-emerald-600">⚡ Apply all ({pairs.length - applied.length} left)</button>}
    {err && <p className="missing text-xs mt-1">⚠️ {err}</p>}
    {pairs && !pairs.length && <p className="success text-xs mt-1">✅ Nothing to fix — every line already starts strong.</p>}
    {(pairs || []).map((p, i) => <div key={i} className="grid md:grid-cols-2 gap-2 mt-2 p-2 rounded-xl bg-slate-50 border border-slate-200">
      <div className="text-xs"><b className="missing">Before</b><p className="mt-0.5">{p.original}</p></div>
      <div className="text-xs"><b className="success">After</b><p className="mt-0.5">{p.improved}</p><p className="opacity-70 text-[11px]">{p.reasons.join(' • ')}</p>
      {applied.includes(i) ? <span className="success font-bold">✓ Applied</span> : <button onClick={() => { onApply(p.original, p.improved); setApplied(a => [...a, i]) }} className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">Apply ✓</button>}</div>
    </div>)}
  </div>
}
function Analyzer({ auth }) {
  const [cv, setCv] = useState('Aman Verma\naman@mail.com\nB.Tech CSE, Pune University 2021-2025\nEXPERIENCE\nSoftware Intern - Built REST API with Flask for 500 users\nPROJECTS\nEcom Clone - React, MongoDB\nSKILLS\nJava, Python, React, MongoDB')
  const [jd, setJd] = useState('Hiring: Java, React, AWS, Docker'); const [url, setUrl] = useState('')
  const [cvFile, setCvFile] = useState(null); const [jdFile, setJdFile] = useState(null); const [drag, setDrag] = useState(null)
  const [fresher, setFresher] = useState(false)
  const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [stage, setStage] = useState(-1); const [err, setErr] = useState('')
  const [mode, setMode] = useState('analyze')
  const [draft] = useDraft()
  const [bd, setBd] = useState(null); const [gen, setGen] = useState(''); const [genScore, setGenScore] = useState(null); const [genFull, setGenFull] = useState(null); const [busyG, setBusyG] = useState(false)
  const [versions, setVersions] = useState(null); const [imp, setImp] = useState(null)
  const hasProfile = !!((draft.name || '').trim() || (draft.skills || '').trim())
  const analyzeReq = async () => {
    setBusyG(true); setErr(''); setBd(null); setGen(''); setGenScore(null)
    try {
      const fd = new FormData()
      fd.append('profile', JSON.stringify(draftToPayload(draft)))
      fd.append('jd_text', jd); fd.append('jd_url', url); if (fresher) fd.append('fresher', 'true')
      if (jdFile) fd.append('jd_file', jdFile)
      const r = await fetch(API + '/api/jd-breakdown', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `Requirements failed (${r.status})`)
      setBd(j); setJourneyStage('match')
    } catch (e) { setErr(e.message) } finally { setBusyG(false) }
  }
  const generateTailored = async () => {
    setBusyG(true); setErr('')
    try {
      const j = await postJSON('/api/jd-cv', { profile: draftToPayload(draft), jd_text: jd, jd_url: url })
      setGen(j.cv_text); setImp(null)
      const a = await postJSON('/api/analyze', { cv_text: j.cv_text, jd_text: jd, ...(fresher ? { mode: 'fresher' } : {}) })
      setGenScore(a.scores); setGenFull(a); setJourneyStage('create')
    } catch (e) { setErr(e.message) } finally { setBusyG(false) }
  }
  const recheckGen = async () => {
    setBusyG(true); setErr('')
    try { const a = await postJSON('/api/analyze', { cv_text: gen, jd_text: jd, ...(fresher ? { mode: 'fresher' } : {}) }); setGenScore(a.scores); setGenFull(a) }
    catch (e) { setErr(e.message) } finally { setBusyG(false) }
  }
  const exportGen = async (kind) => {
    try {
      const r = await fetch(API + (kind === 'docx' ? '/api/docx' : '/api/pdf'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `${draft.name || 'Resume'} — ${bd?.role || 'Tailored'} CV`, text: gen }) })
      if (!r.ok) throw new Error(`Export failed (${r.status})`)
      const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = kind === 'docx' ? 'tailored-cv.docx' : 'tailored-cv.pdf'; a.click()
    } catch (e) { setErr(e.message) }
  }
  const improveGen = async () => {
    setBusyG(true); setErr('')
    try {
      const j = await postJSON('/api/enhance', { cv_text: gen, jd_text: jd })
      setImp(j.enhanced)
    } catch (e) { setErr(e.message) } finally { setBusyG(false) }
  }
  const saveVersion = async () => {
    if (!auth.token) return setErr('Login to save versions (Profile keeps them per job).')
    setBusyG(true); setErr('')
    try {
      const p = draftToPayload(draft)
      await postJSON('/api/cvs', { ...p, role: bd?.role || 'Tailored', generatedText: gen }, auth.token)
      setErr(''); setVersions(null); toast('Version saved ✓ — find it below + in Dashboard')
    } catch (e) { setErr(e.message) } finally { setBusyG(false) }
  }
  const loadVersions = async () => {
    if (!auth.token) return setErr('Login to see saved versions.')
    setBusyG(true); setErr('')
    try { const j = await getJSON('/api/cvs', auth.token); setVersions((j.items || []).filter(c => c.generatedText)) }
    catch (e) { setErr(e.message) } finally { setBusyG(false) }
  }
  const STAGES = ['Uploading', 'Extracting', 'Structuring', 'Comparing', 'Generating Report']
  const fmtSize = (f) => !f ? '' : f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB'
  const pickFile = (f, which) => {
    setErr('')
    if (!f) return
    const ok = /\.(pdf|docx|txt|md)$/i.test(f.name)
    if (!ok) return setErr(`"${f.name}" not supported — use PDF, DOCX, TXT or MD.`)
    if (f.size > 5 * 1024 * 1024) return setErr(`"${f.name}" is ${fmtSize(f)} — max 5 MB.`)
    if (which === 'cv') { setCvFile(f); if (/\.txt$/i.test(f.name)) { const r = new FileReader(); r.onload = () => setCv(String(r.result).slice(0, 50000)); r.readAsText(f) } }
    else { setJdFile(f); if (/\.txt$/i.test(f.name)) { const r = new FileReader(); r.onload = () => setJd(String(r.result).slice(0, 50000)); r.readAsText(f) } }
  }
  const runStages = () => {
    setStage(0); let i = 0
    const t = setInterval(() => { i += 1; if (i < STAGES.length) setStage(i); else clearInterval(t) }, 450)
    return () => clearInterval(t)
  }
  const go = async (cvOverride) => {
    const cvT = typeof cvOverride === 'string' ? cvOverride : cv
    if (typeof cvOverride === 'string') { setCv(cvOverride); setRes(null) }
    setBusy(true); setErr(''); setRes(null)
    const stopStages = runStages()
    try {
      const wait = new Promise(r => setTimeout(r, STAGES.length * 450 + 200))
      let req
      if (cvFile || jdFile || (url && jd.trim().length < 30)) {
        const fd = new FormData(); fd.append('cv_text', cvT); fd.append('jd_text', jd)
        if (fresher) fd.append('mode', 'fresher')
        if (cvFile) fd.append('cv_file', cvFile); if (jdFile) fd.append('jd_file', jdFile)
        if (url && jd.trim().length < 30) fd.append('jd_url', url)
        req = fetch(API + '/api/analyze', { method: 'POST', headers: auth.token ? { Authorization: 'Bearer ' + auth.token } : {}, body: fd }).then(async r => {
          const ct = r.headers.get('content-type') || ''
          if (!r.ok) { let m = `Analysis failed (${r.status})`; try { const j = ct.includes('json') ? await r.json() : null; if (j?.error) m = j.error } catch {} throw new Error(m) }
          return r.json()
        })
      } else {
        req = postJSON('/api/analyze', { cv_text: cvT, jd_text: jd, jd_url: url, ...(fresher ? { mode: 'fresher' } : {}) }, auth.token)
      }
      const [r] = await Promise.all([req, wait])
      setStage(STAGES.length); setRes(r)
      if (auth.token) fetch(API + '/api/history', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token }, body: JSON.stringify({ cv_text: cvT, jd_text: jd }) }).catch(() => {})
    } catch (e) { setErr(e.message || 'Analysis failed') } finally { stopStages(); setBusy(false) }
  }
  const d = res?.detailed, st = res?.structured, cmp = res?.comparison
  const dropProps = (which) => ({
    onDragOver: (e) => { e.preventDefault(); setDrag(which) },
    onDragLeave: () => setDrag(null),
    onDrop: (e) => { e.preventDefault(); setDrag(null); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) pickFile(f, which) },
  })
  const fileChip = (f, which) => f ? <div className="flex items-center gap-2 mt-2 p-2.5 rounded-xl border border-emerald-400/40 text-xs anim-pop" style={{ background: 'rgba(16,185,129,.12)' }}><span className="text-xl">📎</span><span className="flex-1 min-w-0"><b className="block truncate">{f.name}</b><span className="opacity-70">{fmtSize(f)} • {(f.name.split('.').pop() || '').toUpperCase()} • parsed on Analyze</span></span><button onClick={() => which === 'cv' ? setCvFile(null) : setJdFile(null)} className="px-2 py-1 rounded-lg border border-slate-500">✕</button></div>
    : <label className={`dropzone-big block mt-2 ${drag === which ? 'over' : ''}`} {...dropProps(which)}><span className="dz-icon">{which === 'cv' ? '📄' : '💼'}</span><br /><b>Drop your {which === 'cv' ? 'CV' : 'job description'} here or click to upload</b><br /><span className="opacity-60 text-[11px]">PDF / DOCX / TXT / MD • max 5 MB • or paste text below</span><input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={e => { if (e.target.files[0]) pickFile(e.target.files[0], which); e.target.value = '' }} /></label>
  const darkInput = 'w-full p-3 rounded-xl border border-white/15 text-sm mt-1 text-slate-100 placeholder:text-slate-500'
  return <div className="analyzer-page grid gap-4">
    {/* hero */}
    <div className="analysis-card text-center !py-10 anim-pop overflow-hidden">
      <div className="ai-particles">{Array.from({ length: 14 }).map((_, i) => <span key={i} style={{ left: ((i * 67 + 11) % 100) + '%', bottom: '-12px', width: 6 + (i % 3) * 5 + 'px', height: 6 + (i % 3) * 5 + 'px', animationDuration: 6 + (i % 5) * 2 + 's', animationDelay: (i % 7) * 0.9 + 's' }} />)}</div>
      <span className="float-doc text-3xl hidden sm:block" style={{ top: '18px', left: '5%', animationDelay: '0s' }}>📄</span>
      <span className="float-doc text-2xl hidden sm:block" style={{ top: '30px', right: '7%', animationDelay: '1.4s' }}>✨</span>
      <span className="float-doc text-2xl hidden md:block" style={{ bottom: '22px', left: '12%', animationDelay: '2.6s' }}>🤖</span>
      <h2 className="!text-3xl sm:!text-4xl font-black relative">Build a Resume That Gets Noticed <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300">🚀</span></h2>
      <p className="text-sm mt-2 max-w-xl mx-auto relative">Drop your CV + the job description — get an <b>ATS score</b>, <b>skill match</b>, <b>missing keywords</b> and one-tap <b>fixes</b>. Free, private, no sign-up needed to try.</p>
      <button onClick={() => setFresher(!fresher)} className={`relative mt-4 px-4 py-2 rounded-full text-xs font-bold border-2 transition-all ${fresher ? 'bg-emerald-500 border-emerald-300 text-white shadow-lg' : 'border-slate-500 hover:border-indigo-300'}`}>{fresher ? '🎓 Fresher Mode ON — projects, skills & internships weighted, no experience penalty' : '🎓 Student / fresher? Turn on Fresher Mode'}</button>
    </div>
    {/* mode tabs: analyze existing CV vs create CV for this job */}
    <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl analysis-card !p-1.5">
      <button onClick={() => { setMode('analyze'); setErr('') }} className={`py-3 rounded-xl text-sm sm:text-base font-black transition-all ${mode === 'analyze' ? 'glow-btn text-white' : 'opacity-60'}`}>📊 Analyze My CV</button>
      <button onClick={() => { setMode('create'); setErr('') }} className={`py-3 rounded-xl text-sm sm:text-base font-black transition-all ${mode === 'create' ? 'glow-btn text-white' : 'opacity-60'}`}>🎯 Create CV for This Job</button>
    </div>
    {mode === 'analyze' && <div className="analysis-card"><h3>📤 Your documents</h3>
    <div className="grid md:grid-cols-2 gap-4 mt-2">
      <div className="rounded-2xl p-1"><label className="text-xs font-bold">📄 CV / Resume</label><textarea className={darkInput + ' h-40'} style={{ background: 'rgba(2,6,23,.55)' }} placeholder="…or paste CV text here" value={cv} onChange={e => setCv(e.target.value)} />{fileChip(cvFile, 'cv')}</div>
      <div className="rounded-2xl p-1"><label className="text-xs font-bold">💼 Job Description</label><textarea className={darkInput + ' h-28'} style={{ background: 'rgba(2,6,23,.55)' }} placeholder="…or paste the JD here" value={jd} onChange={e => setJd(e.target.value)} /><input className={darkInput} style={{ background: 'rgba(2,6,23,.55)' }} placeholder="…or JD link https:// (LinkedIn / company site)" value={url} onChange={e => setUrl(e.target.value)} />{fileChip(jdFile, 'jd')}</div></div>
    <button onClick={go} disabled={busy} className="glow-btn w-full mt-4 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl text-white">✨ Analyze My Resume ✨</button>
    {(busy || stage >= 0) && <div className="mt-4"><div className="flex items-center gap-1.5">{STAGES.map((s, i) => <div key={s} className="flex-1 text-center"><div className={`h-2.5 rounded-full transition-all duration-300 ${i <= stage ? '' : ''}`} style={i <= stage ? { background: 'linear-gradient(90deg,#6366f1,#06b6d4)', boxShadow: '0 0 12px rgba(99,102,241,.7)' } : { background: 'rgba(255,255,255,.12)' }}></div><div className={`text-[10px] sm:text-[11px] mt-1 font-bold ${i === stage && busy ? 'text-cyan-300' : 'opacity-60'}`}>{i < stage || (!busy && stage >= STAGES.length) ? '✓ ' : i === stage && busy ? '◉ ' : ''}{s}</div></div>)}</div></div>}
    {err && <div className="analysis-card mt-3 sect-missing"><p className="missing text-xs">⚠️ {err}</p></div>}</div>}
    {mode === 'create' && <div className="analysis-card anim-pop"><h3>🎯 Job Requirements → Tailored CV</h3>
      {(() => { const steps = [['🎯', 'Enter Job', !!jd.trim()], ['🧠', 'Understand', !!bd], ['✨', 'Generate', !!gen], ['📊', 'ATS Check', !!genScore]]; return <div className="flex items-center gap-1 mt-2">{steps.map(([i, l, done], x) => <div key={l} className="flex items-center gap-1 flex-1"><div className={`flex-1 text-center py-1.5 rounded-lg text-[11px] font-bold ${done ? '' : 'opacity-50'}`} style={done ? { background: 'linear-gradient(135deg,#6366f1,#06b6d4)', color: '#fff' } : { background: 'rgba(255,255,255,.07)' }}>{i} {l}</div>{x < steps.length - 1 && <span className="opacity-40 text-xs">→</span>}</div>)}</div> })()}
      <p className="text-[11px] opacity-80">No complete CV needed — paste the requirements. AI extracts skills, qualifications & responsibilities, matches them against <b>your profile</b> {hasProfile ? <span className="success">✓ ({draft.name || 'draft loaded'} — edit in Create CV)</span> : <span className="warning">⚠️ draft empty — fill Create CV first for a personal result</span>}, then drafts the CV using only what you provide.</p>
      <div className="grid md:grid-cols-2 gap-3 mt-2">
        <div><label className="text-xs font-bold">Requirements / JD</label><textarea className={darkInput + ' h-44'} style={{ background: 'rgba(2,6,23,.55)' }} placeholder={'Junior Python Developer\n- Python, Flask, REST API\n- Docker, AWS\nB.Tech • 1+ years'} value={jd} onChange={e => setJd(e.target.value)} /><input className={darkInput} style={{ background: 'rgba(2,6,23,.55)' }} placeholder="…or JD link https://" value={url} onChange={e => setUrl(e.target.value)} />{fileChip(jdFile, 'jd')}</div>
        <div className="p-3 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,.03)' }}><b className="text-xs">Workflow</b><ol className="text-xs mt-1 ml-4 list-decimal opacity-80"><li>Analyze requirements</li><li>Review skill match</li><li>Generate tailored CV</li><li>Edit → ATS re-check</li><li>Download PDF/DOCX</li></ol>
        <button onClick={analyzeReq} disabled={busyG} className="glow-btn w-full mt-3 py-3.5 rounded-2xl font-black text-white">🔍 Analyze Requirements</button></div>
      </div>
      {err && <div className="analysis-card mt-3 sect-missing"><p className="missing text-xs">⚠️ {err}</p></div>}
      {bd && <div className="mt-3 anim-pop">
        <p className="text-sm"><b>Role: {bd.role}</b> • coverage {bd.coverage}%</p>
        <div className="grid md:grid-cols-2 gap-3 mt-2 text-xs">
          <div className="p-3 rounded-xl border border-white/10 sect-strength" style={{ background: 'rgba(16,185,129,.07)' }}><b>✅ Required Skills ({bd.required.skills.length})</b><p className="mt-1">{bd.required.skills.join(', ') || '—'}</p>
            <b className="success block mt-1">Matching yours ({bd.matching.length}):</b><p>{bd.matching.join(', ') || '—'}</p></div>
          <div className="p-3 rounded-xl border border-white/10 sect-missing" style={{ background: 'rgba(244,63,94,.07)' }}><b className="missing">✗ Missing ({bd.missing.length})</b><p className="mt-1">{bd.missing.join(', ') || 'None 🎉'}</p>
            {!!bd.required.preferred.length && <p className="mt-1"><b>💎 Preferred (bonus):</b> {bd.required.preferred.join(', ')}</p>}
            {!!bd.required.technologies.length && <p className="mt-1"><b>🛠️ Key technologies:</b> {bd.required.technologies.join(', ')}</p>}
            <b className="block mt-1">⭐ Recommended keywords:</b><p>{bd.recommendedKeywords.join(', ') || '—'}</p></div>
        </div>
        {!!bd.required.responsibilities.length && <div className="text-xs mt-2"><b>📋 Key responsibilities:</b><ul className="list-disc ml-4">{bd.required.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
        {!!bd.required.qualifications.length && <p className="text-xs mt-1"><b>🎓 Qualifications asked:</b> {bd.required.qualifications.join(' • ')}</p>}
        <p className="text-xs mt-1"><b>💼 Experience asked:</b> {bd.required.experience != null ? `~${bd.required.experience} yrs` : 'not specified'}</p>
        <div className="grid md:grid-cols-2 gap-3 mt-2 text-xs">
          <div className="p-3 rounded-xl border border-white/10 sect-strength" style={{ background: 'rgba(16,185,129,.07)' }}><b className="success">💪 Strengths</b><ul className="list-disc ml-4 mt-1">{(bd.strengths || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          <div className="p-3 rounded-xl border border-white/10 sect-improve" style={{ background: 'rgba(56,189,248,.07)' }}><b>🎯 Areas to Improve</b><ul className="list-disc ml-4 mt-1">{(bd.areas || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        </div>
        <div className="p-3 rounded-xl border border-white/10 sect-improve mt-2" style={{ background: 'rgba(56,189,248,.07)' }}><b className="text-xs">🧱 CV Sections to Improve</b><ul className="text-xs list-disc ml-4 mt-1">{bd.sectionsToImprove.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <button onClick={generateTailored} disabled={busyG} className="glow-btn w-full mt-3 py-4 rounded-2xl font-black text-white text-base">✨ Generate Job-Tailored CV</button>
      </div>}
      {gen && <div className="mt-3 anim-pop"><h3>📝 Your tailored CV — edit freely, then re-check</h3>
        <textarea className={darkInput + ' h-72 font-mono'} style={{ background: 'rgba(2,6,23,.55)' }} value={gen} onChange={e => setGen(e.target.value)} />
        {genScore && <div className="mt-2 p-3 rounded-xl border border-white/10" style={{ background: 'rgba(16,185,129,.07)' }}>
          <p className="text-sm"><b>📊 ATS re-check: {genScore.overall}/100</b> — {genScore.verdict} <span className="text-[11px] opacity-70">({genFull?.scores ? `keyword ${genFull.scores.keyword_match}% • skills ${genFull.scores.skill_coverage}%` : ''})</span></p>
          {genFull?.comparison && <div className="h-2 rounded-full overflow-hidden mt-1" style={{ background: 'rgba(255,255,255,.12)' }}><div className="h-full rounded-full" title="Keyword coverage" style={{ width: Math.min(100, Math.round((genFull.comparison.present.length / Math.max(genFull.comparison.jd_skills.length, 1)) * 100)) + '%', background: 'linear-gradient(90deg,#10b981,#06b6d4)' }}></div></div>}
          {genFull?.comparison && <p className="text-[11px] mt-1">Keyword coverage: {genFull.comparison.present.length}/{genFull.comparison.jd_skills.length} JD terms present{genFull.comparison.missing.length ? ` — still missing: ${genFull.comparison.missing.slice(0, 6).join(', ')}` : ' — full coverage 🎉'}</p>}
          {!!(genFull?.whyMatch || []).length && <div className="text-xs mt-2"><b>❓ Why this CV matches the job:</b><ul className="list-disc ml-4 mt-1">{genFull.whyMatch.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
          {genFull?.recruiter && <div className="text-xs mt-2 p-2 rounded-lg border border-white/10" style={{ background: 'rgba(255,255,255,.04)' }}><b>👔 Recruiter view (30-sec skim):</b> {genFull.recruiter.skim}<br /><span className="success">+ {(genFull.recruiter.strengths || []).join(' • ')}</span>{!!(genFull.recruiter.concerns || []).length && <><br /><span className="missing">! {(genFull.recruiter.concerns || []).join(' • ')}</span></>}</div>}
        </div>}
        <div className="flex gap-2 flex-wrap mt-2"><button onClick={recheckGen} disabled={busyG} className="px-4 py-2.5 rounded-xl bg-indigo-600 font-bold text-sm text-white">↻ Re-check ATS</button>
        <button onClick={improveGen} disabled={busyG} className="px-4 py-2.5 rounded-xl font-bold text-sm text-white" style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>🚀 Improve this CV</button>
        <button onClick={() => exportGen('pdf')} className="px-4 py-2.5 rounded-xl border border-slate-500 text-sm">📄 PDF</button>
        <button onClick={() => exportGen('docx')} className="px-4 py-2.5 rounded-xl border border-slate-500 text-sm">📝 DOCX</button>
        <button onClick={saveVersion} disabled={busyG} className="px-4 py-2.5 rounded-xl border border-emerald-500 text-sm">💾 Save version</button>
        <button onClick={loadVersions} disabled={busyG} className="px-4 py-2.5 rounded-xl border border-slate-500 text-sm">🗂 My versions</button></div>
        {imp && <div className="mt-2 text-xs anim-pop"><b>🚀 Improved bullets (predicted {imp.predicted_score}%):</b><ul className="list-disc ml-4 mt-1">{(imp.enhanced_bullets || []).map((b, i) => <li key={i}>{b} <button onClick={() => setGen(g => g + '\n' + b)} className="underline">+ add</button></li>)}</ul></div>}
        {versions && <div className="mt-2 text-xs"><b>🗂 Saved versions (per job):</b>{!versions.length && <span className="opacity-60"> none yet — save this one above.</span>}<ul className="mt-1">{versions.map(v => <li key={v._id || v.id} className="mt-1"><b>{v.role || v.personalInfo?.name || 'CV'}</b> <span className="opacity-60">{(v.createdAt || '').slice(0, 10)}</span> <button onClick={() => { setGen(v.generatedText || ''); setGenScore(null); setGenFull(null) }} className="underline ml-1">Load</button></li>)}</ul></div>}
      </div>}
    </div>}
    {res && <div className="analysis-card grid gap-4 anim-pop">
      <div className="flex gap-4 items-center flex-wrap"><div className="score-3d"><Score v={res.scores.overall} /></div><div className="flex-1 min-w-[220px]"><h2>ATS Score {res.meta?.fresher && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,.2)', color: '#6ee7b7' }}>🎓 Fresher Mode</span>}</h2><h3>{res.scores.verdict}</h3>
        {(() => { const _s = res.scores.overall; const _t = _s >= 80 ? ['💪 Strong Match', 'linear-gradient(135deg,#10b981,#06b6d4)'] : _s >= 65 ? ['👍 Good Match', 'linear-gradient(135deg,#6366f1,#8b5cf6)'] : _s >= 45 ? ['🌱 Growing — fixable', 'linear-gradient(135deg,#f59e0b,#f97316)'] : ['🧭 Starting Point', 'linear-gradient(135deg,#64748b,#475569)']; return <span className="tier-badge" style={{ background: _t[1] }}>{_t[0]}</span> })()}
        <div className="grid gap-1 mt-2">{[['Keyword 40%', res.scores.keyword_match, '#6366f1'], ['Semantic 30%', res.scores.semantic_similarity, '#06b6d4'], ['Skills 20%', res.scores.skill_coverage, '#16a34a'], ['ATS 10%', d?.ats_compatibility ?? 0, '#d97706']].map(([l, v, c]) =>
          <div key={l} className="grid grid-cols-[86px_1fr_44px] gap-2 items-center text-[11px]"><span className="opacity-80">{l}</span><div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.12)' }}><div className="h-full rounded-full transition-all duration-700" style={{ width: Math.max(0, Math.min(100, v)) + '%', background: c }}></div></div><b>{v}%</b></div>)}</div></div></div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl border border-white/10 sect-strength" style={{ background: 'rgba(16,185,129,.07)' }}><h3>💪 Strengths — Skills Match ({res.scores.skill_coverage}%)</h3>
          <div className="text-xs mt-1"><b className="success">✓ Yours ({(cmp?.present || []).length})</b><div className="flex flex-wrap gap-1 mt-1">{(cmp?.present || []).map(s => <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: '#dcfce7', color: '#15803d' }}>{s} ✓</span>)}</div></div>
          <div className="text-xs mt-1"><b className="missing">✗ To learn ({(cmp?.missing || []).length})</b><div className="flex flex-wrap gap-1 mt-1">{(cmp?.missing || []).map(s => <span key={s} className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: '#fee2e2', color: '#b91c1c' }}>{s} ✕</span>)}</div></div></div>
        <div className="p-3 rounded-xl border border-white/10" style={{ background: 'rgba(255,255,255,.03)' }}><h3>💼 Experience Match</h3><p className="text-xs mt-1"><b>{res.experience?.status}</b></p><p className="text-xs opacity-70">Yours: {res.experience?.cv ?? '—'} yrs • Needs: {res.experience?.required ?? '—'} yrs</p>
          {res.meta?.fresher && <p className="text-[11px] mt-1">🎓 Students: internships, freelance & project work all count — list them under Experience.</p>}</div>
      </div>
      <div className="grid md:grid-cols-2 gap-3 text-sm">
        <div><h3>🔑 Keywords ({d?.keywords?.score ?? '—'}%)</h3><p className="text-[11px]">Top JD: {(d?.keywords?.top || []).map(([k, v]) => `${k}(${v})`).join(', ')}</p><p className="text-xs mt-1"><b className="success">Matched ({(d?.keywords?.matched || []).length}):</b> {(d?.keywords?.matched || []).slice(0, 20).join(', ')}</p><p className="text-xs"><b className="missing">Missing:</b> {(d?.keywords?.missing || []).join(', ')}</p></div>
        <div className="p-3 rounded-xl border border-white/10 sect-missing" style={{ background: 'rgba(244,63,94,.07)' }}><h3>🎓 Education</h3><p className="text-xs"><b>{d?.education?.status}</b> — {d?.education?.detail}</p><h3 className="mt-2">❌ Missing Skills</h3><p className="missing text-xs">{(cmp?.missing || []).join(', ') || 'None — full coverage 🎉'}</p><p className="text-[11px]">Add only skills you truly have; mark learning ones “(Familiar)” with a mini-project as proof.</p></div>
      </div>
      <div><h3>❌ Missing sections</h3><p className="missing text-xs inline">{(d?.missing_sections || []).join(', ') || 'none — all present ✅'}</p><h3 className="mt-2">🧹 Formatting ({d?.formattingScore ?? '\u2014'}%)</h3><ul className="text-xs list-disc ml-4">{(d?.formatting || []).map((f, i) => <li key={i}>{f}</li>)}</ul></div>
      <div className="p-3 rounded-xl border border-white/10 sect-missing" style={{ background: 'rgba(244,63,94,.05)' }}><h3>🔻 Weaknesses (biggest score leaks)</h3><ul className="text-xs list-disc ml-4 mt-1">{(() => {
        const dims = [['Keywords', res.scores.keyword_match, 'mirror JD phrasing in bullets'], ['Meaning match', res.scores.semantic_similarity, 'echo the JD\u2019s language, not just skills'], ['Skills', res.scores.skill_coverage, 'close the missing-skills gap above'], ['Structure', d?.ats_compatibility ?? 0, 'add the missing sections'], ['Formatting', d?.formattingScore ?? 0, 'bullets, verbs, metrics, ATS-safe layout']].sort((a, b) => a[1] - b[1]).slice(0, 3)
        return dims.map(([l, v, fix]) => <li key={l}><b>{l} {v}%</b> — {fix}</li>)
      })()}</ul></div>
      <div><h3>💡 Suggestions</h3>{(d?.suggestions || []).map((s, i) => <p key={i} className={`text-xs rounded-lg p-2 my-1 border ${/add|missing|weak|gap/i.test(s) ? 'warning' : 'success'}`}>💡 {s}</p>)}</div>
      <div className="analysis-card sect-improve !p-4"><h3>🎯 Want a CV built for this exact JD?</h3><p className="text-[11px] opacity-80">Switch to Create-for-this-Job with this JD carried over — requirements breakdown, tailored draft, re-check, download.</p><button onClick={() => { setMode('create'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="glow-btn mt-2 px-4 py-2.5 rounded-xl font-black text-sm text-white">🎯 Generate tailored CV for this JD →</button></div>
      <QuickFixPanel cv={cv} onApply={(orig, imp) => setCv(c => c.includes(orig) ? c.replace(orig, imp) : c + '\n' + imp)} />
      <GrammarPanel cv={cv} />
      <ImprovePanel cv={cv} jd={jd} res={res} onApplyImproved={(t) => { window.scrollTo({ top: 0, behavior: 'smooth' }); go(t) }} />
      <details><summary className="text-xs">📄 Extracted structured data (JSON)</summary><pre className="mt-1">{JSON.stringify({ name: st?.name, education: st?.education, skills: st?.skills, experience: (st?.experience || []).slice(0, 3), projects: (st?.projects || []).slice(0, 3) }, null, 1)}</pre></details>
    </div>}
  </div>
}
function GrammarPanel({ cv }) {
  const [issues, setIssues] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const check = async () => {
    setBusy(true); setErr('')
    try { const j = await postJSON('/api/grammar', { text: cv }); setIssues(j.issues || []) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return <div className="analysis-card"><h3>🔤 Grammar & spelling screen</h3><p className="text-[11px]">Offline basic check — typos, repeats, punctuation. Apply fixes in Create CV.</p>
    <button onClick={check} disabled={busy} className="mt-1 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-xs font-bold">{busy ? 'Checking…' : 'Run check'}</button>
    {err && <p className="missing text-xs mt-1">⚠️ {err}</p>}
    {issues && (issues.length
      ? <ul className="text-xs mt-2">{issues.map((g, i) => <li key={i}>{g.line ? `Line ${g.line}: ` : ''}<b className="warning">{g.issue}</b> → <span className="success">{g.fix}</span></li>)}</ul>
      : <p className="success text-xs mt-2">✅ No issues found — clean!</p>)}
  </div>
}
function Tracker({ auth, go }) {
  const [items, setItems] = useState([]); const [title, setTitle] = useState(''); const [company, setCompany] = useState(''); const [notes, setNotes] = useState(''); const [remind, setRemind] = useState(''); const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const load = () => { if (auth.token) getJSON('/api/applications', auth.token).then(j => { setItems(j.items || []); setLoaded(true) }).catch(e => { setErr(e.message); setLoaded(true) }) }
  useEffect(load, [auth.token])
  useEffect(() => { // follow-up reminders: ping once per day for overdue items
    try {
      const now = new Date().toISOString().slice(0, 10)
      const due = items.filter(a => a.remindAt && a.remindAt.slice(0, 10) <= now && !['offer', 'rejected'].includes(a.status))
      if (due.length && Notification.permission === 'granted' && localStorage.getItem('cvforge_notif_' + now) !== '1') {
        new Notification(`CVForge: ${due.length} follow-up${due.length > 1 ? 's' : ''} due`, { body: due.map(a => `${a.title} @ ${a.company || '?'}`).join('\n') })
        localStorage.setItem('cvforge_notif_' + now, '1')
      }
    } catch {}
  }, [items])
  if (!auth.token) return <div className={card}>Login to track applications. <button onClick={() => go('/login')} className="underline">Login →</button></div>
  const add = async () => {
    if (!title.trim()) return setErr('Job title required')
    try { await postJSON('/api/applications', { title: title.trim(), company: company.trim(), notes: notes.trim(), remindAt: remind || null }, auth.token); setTitle(''); setCompany(''); setNotes(''); setRemind(''); setErr(''); setJourneyStage('apply'); load() }
    catch (e) { setErr(e.message) }
  }
  const patch = async (id, body) => { try { await fetch(API + '/api/applications/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token }, body: JSON.stringify(body) }); load() } catch (e) { setErr(e.message) } }
  const setStatus = (id, status) => patch(id, { status })
  const askNotif = async () => { try { await Notification.requestPermission() } catch {} }
  const del = async (id) => { try { await fetch(API + '/api/applications/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.token } }); load() } catch (e) { setErr(e.message) } }
  const dueBadge = (a) => {
    if (!a.remindAt || ['offer', 'rejected'].includes(a.status)) return null
    const today = new Date().toISOString().slice(0, 10)
    const d = a.remindAt.slice(0, 10)
    if (d <= today) return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-900 border border-amber-700">⏰ follow-up due ({d})</span>
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">🔔 {d}</span>
  }
  const ST = ['wishlist', 'applied', 'screening', 'interview', 'offer', 'rejected']
  const counts = ST.map(s => [s, items.filter(i => i.status === s).length])
  return <div className="grid gap-3">
    <div className={card}><b>📋 Track Applications</b><div className="text-xs opacity-70">wishlist → applied → screening → interview → offer (or rejected)</div>
      <div className="flex gap-2 flex-wrap mt-2 text-[11px]">{counts.map(([s, n]) => <span key={s} className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700">{s}: <b>{n}</b></span>)}</div>
      <div className="grid sm:grid-cols-[1fr_1fr_1fr_auto_auto] gap-2 mt-2"><input className={inp} placeholder="Job title *" value={title} onChange={e => setTitle(e.target.value)} /><input className={inp} placeholder="Company" value={company} onChange={e => setCompany(e.target.value)} /><input className={inp} placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} /><input type="date" title="Follow-up reminder" className={inp} value={remind} onChange={e => setRemind(e.target.value)} /><button onClick={add} className="px-4 py-2 rounded-lg bg-indigo-600 font-bold text-sm h-fit">+ Add</button></div>
      <button onClick={askNotif} className="text-[11px] underline mt-1">🔔 Enable reminder notifications</button>
      {err && <div className="text-xs text-rose-300 mt-1">⚠️ {err}</div>}</div>
    {items.map(a => <div key={a._id || a.id} className={`${card} flex items-center gap-3 flex-wrap`}>
      <div className="flex-1 min-w-[160px]"><b className="text-sm">{a.title}</b> <span className="ml-1">{dueBadge(a)}</span><div className="text-xs opacity-70">{a.company} • {(a.createdAt || '').slice(0, 10)}</div>{a.notes && <div className="text-xs mt-1">{a.notes}</div>}
        <input type="date" title="Reminder date" value={(a.remindAt || '').slice(0, 10)} onChange={e => patch(a._id || a.id, { remindAt: e.target.value || null })} className="text-[11px] mt-1 p-1 rounded bg-slate-950 border border-slate-700" /></div>
      <select value={a.status} onChange={e => setStatus(a._id || a.id, e.target.value)} className="text-xs p-1.5 rounded-lg bg-slate-950 border border-slate-700">{ST.map(s => <option key={s} value={s}>{s}</option>)}</select>
      <button onClick={() => { if (confirm(`Delete "${a.title}" from tracker?`)) del(a._id || a.id) }} className="text-xs px-2 py-1 rounded-lg border border-rose-800 text-rose-200" aria-label={`Delete ${a.title}`}>Delete</button>
    </div>)}
    {!loaded ? <div className="grid gap-2">{[0, 1].map(i => <div key={i} className={card}><div className="h-4 rounded bg-slate-700/60 w-1/3 is-busy"></div><div className="h-3 rounded bg-slate-700/40 mt-2 w-1/2"></div></div>)}</div> : !items.length ? <div className={card}><span className="text-sm opacity-70">📭 No applications yet — add your first target role above.</span></div> : null}
  </div>
}
function SharedCV() {
  const token = (window.location.hash.match(/^#\/s\/([a-z0-9]+)/) || [])[1] || ''
  const [cv, setCv] = useState(null); const [err, setErr] = useState('')
  useEffect(() => { getJSON('/api/share/' + token).then(setCv).catch(() => setErr('This link is invalid or was revoked.')) }, [token])
  if (err) return <div className={card}><p className="missing text-sm">⚠️ {err}</p></div>
  if (!cv) return <div className={card}>Loading shared CV…</div>
  const pi = cv.personalInfo || {}
  const sec = (t, body) => body ? <><h4>{t}</h4>{body}</> : null
  return <div className="max-w-[700px] mx-auto"><div className="text-xs opacity-60 mb-2">🔗 Shared via CVForge (read-only)</div>
    <div className="a4 modern"><h2>{(pi.name || 'Resume').toUpperCase()}</h2>
      <div className="a4-contact">{[pi.email, pi.phone, pi.location].filter(Boolean).join('  •  ')}</div>
      {sec('Summary', pi.summary && <p>{pi.summary}</p>)}
      {sec('Education', cv.education && <p style={{ whiteSpace: 'pre-wrap' }}>{cv.education}</p>)}
      {sec('Experience', cv.experience && <p style={{ whiteSpace: 'pre-wrap' }}>{cv.experience}</p>)}
      {sec('Skills', cv.skills && <p>{cv.skills}</p>)}
      {sec('Projects', cv.projects && <p style={{ whiteSpace: 'pre-wrap' }}>{cv.projects}</p>)}
    </div></div>
}
// Offline AI bullet writer: turns tech keywords into STAR bullets (LLM Enhance polishes further)
function describeBullets(tech, kind) {
  const t = (tech || 'this stack').split(',').map(s => s.trim()).filter(Boolean)
  const stack = t.slice(0, 3).join(', ') || 'modern stack'
  const first = t[0] || 'the app'
  if (kind === 'project') return [
    `Built ${first} project with ${stack} — handles core flows for 500+ test users`,
    `Designed REST APIs and data models, cutting response time 30% with caching`,
    `Deployed with Git CI and documented setup so anyone can run it in 5 minutes`,
  ]
  return [
    `Built ${stack} features serving 500+ users, improving load time 30%`,
    `Implemented ${first} workflows with code reviews in an Agile team of 4`,
    `Automated testing and deployment, cutting release effort 40%`,
  ]
}
function Interview() {
  const [cv, setCv] = useState('Aman Python React internship project'); const [jd, setJd] = useState('Junior Python Developer Flask React'); const [qs, setQs] = useState([]); const [ans, setAns] = useState({}); const [out, setOut] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const start = async () => { setBusy(true); setErr(''); setOut(null); try { const j = await postJSON('/api/practice', { cv_text: cv, jd_text: jd }); setQs(j.questions || []) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  const submit = async () => {
    setBusy(true); setErr('')
    try { const _ev = await postJSON('/api/practice/evaluate', { questions: qs, answers: qs.map((_, i) => ans[i] || '') }); setOut(_ev); setJourneyStage('interview'); try { const prev = parseFloat(localStorage.getItem('cvforge_interview_best') || '0'); if (_ev.avg > prev) localStorage.setItem('cvforge_interview_best', String(_ev.avg)) } catch {} }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return <div className="grid gap-3">
    <div className={`${card}`}><b>🎤 AI Interview Practice</b><div className="text-xs opacity-70">Tailored questions from your CV + JD, STAR-scored 0-10 (offline; LLM upgrades when key set).</div>
      <div className="grid md:grid-cols-2 gap-2 mt-2"><textarea className={inp + ' h-24'} value={cv} onChange={e => setCv(e.target.value)} placeholder="Your CV summary / skills" /><textarea className={inp + ' h-24'} value={jd} onChange={e => setJd(e.target.value)} placeholder="Target JD" /></div>
      <button onClick={start} disabled={busy} className={btn}>{busy ? 'Preparing…' : 'Start practice →'}</button>
      {err && <div className="text-xs text-rose-300 mt-1">⚠️ {err}</div>}</div>
    {qs.map((q, i) => <div key={i} className={card}><b className="text-sm">Q{i + 1} [{q.type}]:</b> <span className="text-sm">{q.q}</span><div className="text-[11px] opacity-60">💡 {q.tip}</div><textarea className={inp + ' h-20 mt-1'} placeholder="Your answer (situation → action → result + metric)…" value={ans[i] || ''} onChange={e => setAns({ ...ans, [i]: e.target.value })} /></div>)}
    {!!qs.length && <button onClick={submit} disabled={busy} className={btn}>{busy ? 'Scoring…' : 'Evaluate answers →'}</button>}
    {out && <div className={card}><h3>Result: {out.avg}/10 — {out.level}</h3>{out.results.map((r, i) => <div key={i} className="q text-sm"><b>Q{i + 1}:</b> {String(r.q).slice(0, 120)}<br />Score: <b>{r.ev.score}/10 ({r.ev.level})</b><br /><span className="text-xs opacity-70">{r.ev.feedback}</span></div>)}</div>}
  </div>
}
// ---------- Fresher Mode: guided first CV for students ----------
const FRESHER_EXAMPLE = { name: 'Aarav Kumar', email: 'aarav.kumar@mail.com', phone: '+91 98765 43210', college: 'Pune University', degree: 'BCA Computer Science', years: '2022-2025', score: '78%, First Class', skills: 'Python, HTML, CSS, JavaScript, SQL, Git', proj1: 'Student Result Portal', proj1tech: 'Python, Flask, SQLite', proj1desc: 'Built login + marks pages used by 200 classmates; cut result-check time 50%', proj2: 'Portfolio Website', proj2tech: 'HTML, CSS, JavaScript', proj2desc: 'Designed responsive portfolio; hosted free with 1000+ visits', cert: 'NPTEL Python (2024)' }
const FRESHER_TIPS = ['No experience needed — internships, coursework, and projects count. Use a real email + phone.', 'One strong education block beats three weak ones. Add your score — it matters for freshers.', 'Skills + 2 projects get you shortlisted. Quantify everything: users, %, marks.', 'Pick Classic for ATS, Modern for style. Then Preview → PDF → Analyze.']
function Fresher({ go }) {
  const [, setDraft] = useDraft()
  const [step, setStep] = useState(0); const [f, setF] = useState({ name: '', email: '', phone: '', college: '', degree: '', years: '', score: '', skills: '', proj1: '', proj1tech: '', proj1desc: '', proj2: '', proj2tech: '', proj2desc: '', cert: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const fillExample = () => setF({ ...FRESHER_EXAMPLE })
  const finish = () => {
    setDraft({
      name: f.name, email: f.email, phone: f.phone, location: '', linkedin: '', github: '', summary: '', skills: f.skills, jd: '', template: f.template || 'classic',
      education: f.college || f.degree ? [{ id: uid(), school: f.college, degree: f.degree, years: f.years, detail: f.score }] : [],
      experience: [], projects: [
        ...(f.proj1 ? [{ id: uid(), name: f.proj1, tech: f.proj1tech, desc: f.proj1desc }] : []),
        ...(f.proj2 ? [{ id: uid(), name: f.proj2, tech: f.proj2tech, desc: f.proj2desc }] : []),
      ],
      certs: f.cert ? [{ id: uid(), name: f.cert }] : [], achievements: [],
    })
    setJourneyStage('create')
    go('/preview')
  }
  const titles = ['About you', 'Education', 'Skills + Projects', 'Template + Finish']
  return <div className="max-w-xl mx-auto grid gap-3">
    <div className={card}><b>🌱 Fresher Mode</b><div className="text-xs opacity-70">Your first CV in 4 guided steps — no experience needed.</div>
      <div className="flex gap-1 mt-2">{titles.map((t, i) => <button key={t} onClick={() => setStep(i)} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${step === i ? 'bg-gradient-to-r from-indigo-500 to-cyan-500' : 'bg-slate-800 border border-slate-700'}`}>{i + 1}. {t}</button>)}</div>
      <div className="text-[11px] mt-2 p-2 rounded-lg bg-indigo-950 border border-indigo-800">💡 {FRESHER_TIPS[step]} <button onClick={fillExample} className="underline ml-1">Fill example</button></div></div>
    <div className={card}>
      {step === 0 && <><b>About you</b><input className={inp} placeholder="Full name *" value={f.name} onChange={set('name')} /><input className={inp} placeholder="Email *" value={f.email} onChange={set('email')} /><input className={inp} placeholder="Phone" value={f.phone} onChange={set('phone')} /></>}
      {step === 1 && <><b>Education</b><input className={inp} placeholder="College *" value={f.college} onChange={set('college')} /><input className={inp} placeholder="Degree *" value={f.degree} onChange={set('degree')} /><div className="grid grid-cols-2 gap-2"><input className={inp} placeholder="Years (2022-2025)" value={f.years} onChange={set('years')} /><input className={inp} placeholder="Score (78%)" value={f.score} onChange={set('score')} /></div></>}
      {step === 2 && <><b>Skills</b><textarea className={inp + ' h-16'} placeholder="Python, HTML, CSS…" value={f.skills} onChange={set('skills')} /><b>Project 1</b><input className={inp} placeholder="Project name *" value={f.proj1} onChange={set('proj1')} /><input className={inp} placeholder="Tech (Python, Flask)" value={f.proj1tech} onChange={set('proj1tech')} /><textarea className={inp} placeholder="What it does + numbers" value={f.proj1desc} onChange={set('proj1desc')} /><b>Project 2 (optional)</b><input className={inp} placeholder="Project name" value={f.proj2} onChange={set('proj2')} /><input className={inp} placeholder="Tech" value={f.proj2tech} onChange={set('proj2tech')} /><textarea className={inp} placeholder="What it does + numbers" value={f.proj2desc} onChange={set('proj2desc')} /><b>Certification (optional)</b><input className={inp} placeholder="NPTEL Python (2024)" value={f.cert} onChange={set('cert')} /></>}
      {step === 3 && <><b>Template</b><div className="grid grid-cols-2 gap-2 mt-2">{['classic', 'modern', 'minimal', 'professional', 'tech', 'fresher', 'neon'].map(t => <button key={t} onClick={() => setF({ ...f, template: t })} className={`p-2 rounded-xl border-2 text-xs font-bold ${(f.template || 'classic') === t ? 'border-indigo-400' : 'border-slate-700'}`}>{t}</button>)}</div>
        <button onClick={finish} disabled={!f.name.trim() || !f.email.includes('@')} className={`${btn} mt-3`}>🎓 Build my first CV →</button></>}
      <div className="flex justify-between mt-3"><button onClick={() => setStep(Math.max(0, step - 1))} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">← Back</button><button onClick={() => setStep(Math.min(3, step + 1))} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">Next →</button></div>
    </div></div>
}
function Matcher() {
  const [cv, setCv] = useState('Aman a@mail.com Java Python React MongoDB'); const [jobs, setJobs] = useState(['Backend: Java, AWS, Docker', 'Frontend: React, JavaScript, CSS']); const [r, setR] = useState(null); const [err, setErr] = useState('')
  const setJ = (i) => (e) => setJobs(j => j.map((x, k) => k === i ? e.target.value : x))
  return <div className="grid gap-3"><label className="text-xs text-slate-400">CV</label><textarea className="h-24 p-3 rounded-xl bg-slate-950 border border-slate-700 text-sm" value={cv} onChange={e => setCv(e.target.value)} />
    <label className="text-xs text-slate-400">Jobs (title: required skills)</label>{jobs.map((j, i) => <div key={i} className="flex gap-2"><input className={inp} value={j} onChange={setJ(i)} /><button onClick={() => setJobs(j => j.filter((_, k) => k !== i))} className="text-xs">✕</button></div>)}
    <button onClick={() => setJobs(j => [...j, 'New role: skills…'])} className="text-xs underline text-left">+ Add job</button>
    <button onClick={async () => { setErr(''); try { const _mr = await postJSON('/api/match', { cv_text: cv, jobs: jobs.map((t, i) => ({ title: t.split(':')[0] || `Job ${i + 1}`, text: t })) }); setR(_mr); setJourneyStage('match') } catch (e) { setErr(e.message || 'Matcher failed') } }} className={btn}>🎯 Rank best fit</button>
    {err && <div className="text-xs text-rose-300">⚠️ {err}</div>}
    {r?.ranking?.map((x, i) => <div key={i} className={`${card} flex gap-3 items-center`}><Score v={x.overall} small /><div className="text-sm"><b>#{i + 1} {x.title}</b> — {x.verdict}<div className="text-xs text-rose-300">Missing: {x.missing.join(', ') || '—'}</div></div></div>)}</div>
}
function getCareerProfile() { try { return JSON.parse(localStorage.getItem('cvforge_profile') || '{}') } catch { return {} } }
function Profile({ auth, go }) {
  const [items, setItems] = useState([]); const [cvs, setCvs] = useState([]); const [loaded, setLoaded] = useState(false)
  const [prof, setProf] = useState(getCareerProfile()); const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!auth.token) return
    setLoaded(false)
    Promise.all([
      getJSON('/api/history', auth.token).then(j => setItems(j.items || [])).catch(() => {}),
      getJSON('/api/cvs', auth.token).then(j => setCvs(j.items || [])).catch(() => {}),
    ]).finally(() => setLoaded(true))
  }, [auth.token])
  if (!auth.token) return <div className={card}>Login required. <button onClick={() => go('/login')} className="underline">Login →</button></div>
  const saveProf = () => { try { localStorage.setItem('cvforge_profile', JSON.stringify(prof)) } catch {}; setEditing(false); toast('Career profile saved ✓') }
  const pct = ['targetRole', 'level', 'location'].filter(k => (prof[k] || '').trim()).length
  return <div className="grid gap-3"><div className={card}><div className="flex items-center justify-between gap-2"><div><b>👤 {auth.user}</b><div className="text-xs text-slate-400">Profile • Saved CVs: {cvs.length} • Analyses: {items.length}</div></div><button onClick={() => { auth.logout(); go('/') }} className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs">Logout</button></div></div>
    <div className={card}><div className="flex items-center justify-between"><b className="text-sm">🎯 Career Profile ({pct}/3)</b><button onClick={() => setEditing(!editing)} className="text-xs underline">{editing ? 'Cancel' : 'Edit'}</button></div>
      {editing
        ? <div className="grid gap-2 mt-2"><input className={inp} placeholder="Target role (e.g. Junior Python Developer)" value={prof.targetRole || ''} onChange={e => setProf({ ...prof, targetRole: e.target.value })} /><div className="grid grid-cols-2 gap-2"><select className={inp} value={prof.level || ''} onChange={e => setProf({ ...prof, level: e.target.value })}><option value="">Experience level…</option><option value="fresher">🌱 Fresher / student</option><option value="junior">1–2 years</option><option value="mid">3–5 years</option><option value="senior">5+ years</option></select><input className={inp} placeholder="Preferred location" value={prof.location || ''} onChange={e => setProf({ ...prof, location: e.target.value })} /></div><button onClick={saveProf} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 font-bold text-sm text-white w-fit">Save profile</button></div>
        : <div className="text-xs mt-1 opacity-80">{pct === 3 ? <span>Targeting <b>{prof.targetRole}</b> • {prof.level} • {prof.location}</span> : <span>Half-finished profile — <button onClick={() => setEditing(true)} className="underline">complete it</button> so Match & Dashboard target the right jobs.</span>}</div>}
    </div>
    {!loaded ? <div className="grid sm:grid-cols-2 gap-3">{[0, 1].map(i => <div key={i} className={card}><div className="h-4 rounded bg-slate-700/60 w-1/2 is-busy"></div><div className="h-3 rounded bg-slate-700/40 mt-2 w-2/3"></div></div>)}</div> : <>
    <h3 className="font-bold text-sm">Saved CVs</h3>{!cvs.length ? <div className={card}><span className="text-sm opacity-70">📭 No saved CVs yet.</span> <button onClick={() => go('/create')} className="underline text-sm">Create one →</button></div> : cvs.map(c => <div key={c._id || c.id} className={card}><b className="text-sm">{c.personalInfo?.name || 'CV'}</b><span className="text-xs text-slate-500"> • {c.template}{c.role ? ` • 🎯 ${c.role}` : ''}</span></div>)}
    <h3 className="font-bold text-sm">Analyses</h3>{!items.length ? <div className={card}><span className="text-sm opacity-70">📭 No analyses yet.</span> <button onClick={() => go('/analyzer')} className="underline text-sm">Run your first →</button></div> : items.map(a => <div key={a.id || a._id} className={card}><b>{a.overall ?? a.scoreData?.overall}/100</b> — {a.verdict || a.scoreData?.verdict}<div className="text-xs text-slate-400">{(a.createdAt || '').slice(0, 16)}</div></div>)}</>}</div>
}

function Footer({ go }) {
  const sec = (id) => { go('/'); setTimeout(() => { const el = document.getElementById('lp-' + id); if (el) el.scrollIntoView({ behavior: 'smooth' }) }, 120) }
  return <div className="mt-10 border-t border-slate-800 pt-6 pb-2 text-xs opacity-70">
    <div className="grid sm:grid-cols-4 gap-4 max-w-6xl">
      <div><b className="text-sm opacity-100">🔨 CVForge</b><div className="mt-1">Create. Analyze. Improve.<br />Honest AI career platform.</div></div>
      <div><b>Product</b><div className="mt-1 grid gap-1">{[['Create CV', '/create'], ['CV Analyzer', '/analyzer'], ['Job Matcher', '/match'], ['Interview', '/interview'], ['Tracker', '/tracker']].map(([l, to]) => <button key={to} onClick={() => go(to)} className="text-left hover:opacity-100">{l}</button>)}</div></div>
      <div><b>Site</b><div className="mt-1 grid gap-1">{[['Features', () => sec('features')], ['Templates', () => sec('templates')], ['Pricing', () => sec('pricing')], ['About', () => sec('about')]].map(([l, fn]) => <button key={l} onClick={fn} className="text-left hover:opacity-100">{l}</button>)}</div></div>
      <div><b>Legal</b><div className="mt-1 grid gap-1"><button onClick={() => go('/privacy')} className="text-left hover:opacity-100">Privacy Policy</button><button onClick={() => go('/terms')} className="text-left hover:opacity-100">Terms of Service</button></div></div>
    </div>
    <div className="text-center mt-4">© 2026 CVForge • Crafted for placements, worldwide.</div>
  </div>
}
function Privacy() {
  return <div className={`${card} max-w-2xl mx-auto`}><h2 className="font-black text-xl">Privacy Policy</h2><div className="text-sm mt-2 grid gap-2 opacity-80">
    <p><b>What we store:</b> your account (name, email, bcrypt-hashed password), CVs, analyses and applications you explicitly save.</p>
    <p><b>Uploads:</b> CV/JD files live in server memory only during analysis and are never written to disk.</p>
    <p><b>Sharing:</b> share links are random unguessable tokens, revocable anytime from Dashboard. No trackers, no ads, no data sale — ever.</p>
    <p><b>Your rights:</b> Settings → export everything as JSON, or delete your account and all data permanently.</p>
    <p><b>Storage:</b> demo deployments use in-memory storage (wiped on restart); production uses your own MongoDB Atlas.</p></div></div>
}
function Terms() {
  return <div className={`${card} max-w-2xl mx-auto`}><h2 className="font-black text-xl">Terms of Service</h2><div className="text-sm mt-2 grid gap-2 opacity-80">
    <p><b>Honest use:</b> CVForge drafts from information you provide and marks learning skills “(Familiar)”. Only claim what is true — you are responsible for final content.</p>
    <p><b>Scores are guidance:</b> ATS predictions estimate wording/structure fit, not hiring outcomes.</p>
    <p><b>Fair use:</b> 5 MB uploads, rate-limited APIs. Don't abuse shared links or scrape the service.</p>
    <p><b>Availability:</b> demo hosting may sleep/restart (clearing unsaved demo data); export anything important.</p></div></div>
}
function NotFound({ go }) {
  return <div className={`${card} max-w-md mx-auto text-center py-10`}><div className="text-5xl">🧭</div><h2 className="font-black text-xl mt-2">Lost? This page doesn't exist.</h2><p className="text-xs opacity-60 mt-1">The link may be old or mistyped.</p><div className="flex gap-2 justify-center mt-4"><button onClick={() => go('/')} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 font-bold text-sm text-white">← Home</button><button onClick={() => go('/dashboard')} className="px-4 py-2 rounded-xl border border-slate-600 text-sm">Dashboard</button></div></div>
}
const ROUTES = ['/', '/login', '/dashboard', '/create', '/fresher', '/preview', '/analyzer', '/match', '/interview', '/tracker', '/profile', '/templates', '/settings', '/privacy', '/terms']
export default function App() {
  const [route, go] = useHashRoute(); const auth = useAuth()
  const [theme, setTheme] = useState(localStorage.getItem('cvforge_theme') || 'dark')
  useEffect(() => { document.body.style.background = theme === 'dark' ? '#020617' : '#eef2f7'; document.body.style.color = theme === 'dark' ? '#f1f5f9' : '#0f172a' }, [theme])
  return <div className={`max-w-6xl mx-auto p-4 pb-24 md:pb-4 min-h-screen ${theme === 'dark' ? 'text-slate-100' : ''} ${theme}`}>
    <TopNav route={route} go={go} auth={auth} theme={theme} setTheme={setTheme} />
    <div key={route + (theme || '')} className="anim-page"><PageErrorBoundary key={route}>
    {route === '/' && <Home go={go} />}
    {route === '/login' && <Login go={go} auth={auth} />}
    {route === '/dashboard' && <Dashboard go={go} auth={auth} />}
    {route === '/create' && <Create go={go} auth={auth} />}
    {route === '/fresher' && <Fresher go={go} />}
    {route === '/preview' && <Preview go={go} auth={auth} />}
    {route === '/analyzer' && <Analyzer auth={auth} />}
    {route === '/match' && <Matcher />}
    {route === '/interview' && <Interview />}
    {route === '/tracker' && <Tracker auth={auth} go={go} />}
    {route === '/profile' && <Profile auth={auth} go={go} />}
    {route === '/templates' && <Templates go={go} />}
    {route === '/settings' && <Settings auth={auth} go={go} />}
    {route.startsWith('/s/') && <SharedCV />}
    {route === '/privacy' && <Privacy />}
    {route === '/terms' && <Terms />}
    {!ROUTES.includes(route) && !route.startsWith('/s/') && <NotFound go={go} />}
    </PageErrorBoundary></div>
    <Footer go={go} />
    <Toasts />
    {/* mobile bottom navigation */}
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 backdrop-blur bg-slate-950/90 border-t border-slate-700">
      <div className="grid grid-cols-5 max-w-md mx-auto">{[['/', '🏠', 'Home'], ['/create', '✨', 'Create'], ['/analyzer', '📤', 'Analyze'], ['/match', '🎯', 'Jobs'], ['/dashboard', '📊', 'Board']].map(([p, i, l]) =>
        <button key={p} onClick={() => go(p)} className={`py-2.5 text-[10px] font-bold flex flex-col items-center gap-0.5 ${route === p ? 'text-cyan-300' : 'opacity-60'}`}><span className="text-lg leading-none">{i}</span>{l}</button>)}</div>
    </div>
  </div>
}
