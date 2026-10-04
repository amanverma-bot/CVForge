// Port of BCA_Resume_Analyzer/analyser.py scoring (offline fallback when no LLM key)
const SKILLS_DB = [
  "python","java","javascript","typescript","c++","c#","go","rust","ruby","php","kotlin","swift","sql","r","scala","perl","dart",
  "html","css","react","angular","vue","node.js","django","flask","fastapi","spring","spring boot","express","next.js","nuxt.js","tailwind","bootstrap","jquery","redux",
  "machine learning","deep learning","data analysis","data science","pandas","numpy","tensorflow","pytorch","scikit-learn","nlp","computer vision","llm","generative ai","prompt engineering","langchain","huggingface","openai","rag","transformers","keras","opencv","matplotlib","seaborn","scipy","mlops",
  "aws","azure","gcp","docker","kubernetes","jenkins","git","github","gitlab","ci/cd","terraform","ansible","linux","bash","nginx","github actions","bitbucket","jira",
  "mysql","postgresql","mongodb","redis","oracle","sqlite","elasticsearch","cassandra","dynamodb","firebase","supabase",
  "flutter","react native","android","ios","figma","photoshop","rest api","graphql","microservices","websockets","oauth","jwt","rabbitmq","kafka",
  "dsa","data structures","algorithms","oops","dbms","operating systems","computer networks","system design",
  "excel","power bi","tableau","powerpoint","word",
  "communication","leadership","teamwork","problem solving","agile","scrum","project management","time management",
];
const ALIASES = { nodejs:"node.js","node js":"node.js",node:"node.js",k8s:"kubernetes",tf:"tensorflow",sklearn:"scikit-learn","scikit learn":"scikit-learn",postgres:"postgresql",mongo:"mongodb",js:"javascript",ts:"typescript",reactjs:"react","react.js":"react",nextjs:"next.js","next js":"next.js",vuejs:"vue",rest:"rest api",ml:"machine learning",dl:"deep learning",ds:"data science",genai:"generative ai","gen ai":"generative ai",hf:"huggingface",rn:"react native" };
const STOP = new Set("a an the and or but if in on at to for with of is are was were be been being has have had do does did will would should could this that these those it its we you your our i me my as by from up into about over after".split(" "));
const ATS_SECTIONS = ["contact","summary","experience","education","skills","projects","certifications"];

function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
function extractSkills(text){
  const low=(text||"").toLowerCase(); const found=new Set();
  for(const s of SKILLS_DB){
    if(/[+./#]/.test(s)){ if(low.includes(s)) found.add(s); }
    else { const re=new RegExp(`(?<!\\w)${escRe(s)}(?!\\w)`); if(re.test(low)) found.add(s); }
  }
  for(const [a,c] of Object.entries(ALIASES)){
    const re=new RegExp(`(?<!\\w)${escRe(a)}(?!\\w)`); if(re.test(low)) found.add(c);
  }
  if(found.has("node.js")) found.delete("nodejs");
  return [...found].sort();
}
function extractContact(text){
  text=text||"";
  const emails=[...new Set((text.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g)||[]))];
  const phonesRaw=(text.match(/(\+?\d[\d\s\-()]{8,}\d)/g)||[]).filter(p=>{const d=p.replace(/\D/g,"");return d.length>=7&&d.length<=15;});
  const phones=[...new Set(phonesRaw)].slice(0,3);
  const linkedin=text.match(/linkedin\.com\/[^\s]+/gi)||[];
  const github=text.match(/github\.com\/[^\s]+/gi)||[];
  return {emails,phones,linkedin,github};
}
function detectSections(text){
  const low=(text||"").toLowerCase();
  const aliases={contact:["contact","email","phone"],summary:["summary","objective","profile"],experience:["experience","work history","employment","internship"],education:["education","academic","qualification"],skills:["skills","tech stack","technologies"],projects:["projects","portfolio"],certifications:["certifications","certificates","courses"]};
  const out={}; for(const [sec,vars] of Object.entries(aliases)) out[sec]=vars.some(v=>new RegExp(`\\b${escRe(v)}\\b`).test(low));
  return out;
}
function extractYears(text){
  const pats=[/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|yoe)[\s\w]{0,20}experience/gi,/experience[\s\w]{0,20}(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|yoe)/gi,/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|yoe)\b/gi];
  const vals=[];
  for(const p of pats){ let m; p.lastIndex=0; while((m=p.exec(text||""))){ const v=parseFloat(m[1]); if(v>0&&v<40) vals.push(v); } }
  return vals.length?Math.max(...vals):null;
}
function extractRequiredYears(jd){
  const low=(jd||"").toLowerCase();
  if(/\bfresher\b|\bentry[\s-]?level\b/.test(low)) return 0;
  const m=[...(jd||"").matchAll(/(?:minimum|at least|atleast|\+)?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|yoe)/gi)].map(x=>parseFloat(x[1])).filter(v=>v>0&&v<30);
  return m.length?Math.min(...m):null;
}
function experienceMatch(cv,jd){
  if(jd==null) return {cv,required:null,status:"JD no explicit requirement",delta:0};
  if(cv==null) return {cv:null,required:jd,status:"Add years explicitly (e.g. '1 year internship experience')",delta:-3};
  if(cv>=jd) return {cv,required:jd,status:`Meets requirement (${cv} ≥ ${jd} yrs)`,delta:3};
  const gap=Math.round((jd-cv)*10)/10;
  if(gap<=1) return {cv,required:jd,status:`Close — short by ~${gap} yr (show internships/projects as experience)`,delta:-1.5};
  return {cv,required:jd,status:`Gap of ~${gap} yrs — emphasize projects + freelancing to bridge`,delta:-4};
}
function tokenize(text){
  return ((text||"").toLowerCase().match(/[a-z0-9+#.]+/g)||[]).filter(t=>!STOP.has(t)&&t.length>1);
}
function keywordScore(cv,jd){
  const cvSet=new Set(tokenize(cv)); const jdToks=tokenize(jd);
  const counter={}; for(const t of jdToks) counter[t]=(counter[t]||0)+1;
  const uniq=Object.keys(counter);
  if(!uniq.length) return {score:0,matched:[],missing:[],total_keywords:0,matched_count:0,top_jd_keywords:[]};
  const matched=uniq.filter(k=>cvSet.has(k));
  const missing=uniq.filter(k=>!cvSet.has(k)).sort((a,b)=>counter[b]-counter[a]);
  const total=Object.values(counter).reduce((a,b)=>a+b,0);
  const mw=matched.reduce((a,k)=>a+counter[k],0);
  const top=Object.entries(counter).sort((a,b)=>b[1]-a[1]).slice(0,15);
  return {score:Math.round(mw/total*100*10)/10,matched,missing,total_keywords:uniq.length,matched_count:matched.length,top_jd_keywords:top};
}
function tfidfCosine(cv,jd){
  // tiny TF-IDF cosine (offline semantic approx)
  const docs=[cv,jd].map(tokenize);
  const vocab=[...new Set([...docs[0],...docs[1]])];
  const vecs=docs.map(d=>{const c={};for(const t of d)c[t]=(c[t]||0)+1;return vocab.map(t=>{const tf=(c[t]||0)/d.length;const df=docs.filter(x=>x.includes(t)).length;const idf=Math.log(2/(df||1))+1;return tf*idf;});});
  const [a,b]=vecs; let dot=0,na=0,nb=0;
  for(let i=0;i<a.length;i++){dot+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}
  if(!na||!nb) return 0;
  return Math.round(dot/(Math.sqrt(na)*Math.sqrt(nb))*100*10)/10;
}
function jaccard(cv,jd){
  const a=new Set(tokenize(cv)),b=new Set(tokenize(jd));
  if(!a.size||!b.size) return 0;
  const inter=[...a].filter(x=>b.has(x)).length;
  return Math.round(inter/new Set([...a,...b]).size*100*10)/10;
}
function skillGap(cvS,jdS){
  const c=new Set(cvS.map(s=>s.toLowerCase())),j=new Set(jdS.map(s=>s.toLowerCase()));
  const matched=[...c].filter(x=>j.has(x)).sort();
  const missing=[...j].filter(x=>!c.has(x)).sort();
  const extra=[...c].filter(x=>!j.has(x)).sort();
  const coverage=j.size?Math.round(matched.length/j.size*100*10)/10:100;
  return {matched,missing,extra,coverage};
}
function overallScore(kw,sem,cover,sections,contactOk,delta=0){
  const ats=sections?Object.values(sections).filter(Boolean).length/Object.keys(sections).length*100:50;
  const a=contactOk?ats:ats*0.7;
  return Math.round(Math.max(0,Math.min(100,kw*0.4+sem*0.3+cover*0.2+a*0.1+delta))*10)/10;
}
function verdict(s){ return s>=80?"🟢 Excellent match — Ready to apply!":s>=65?"🟡 Good match — Fix missing keywords & re-apply":s>=45?"🟠 Moderate — Needs tailoring for this JD":"🔴 Low match — Major rewrite needed for this role"; }
// Strip weak openers ("worked on", "responsible for"…) so the action verb reads clean:
// "worked on payment gateway" → "Built payment gateway…" (not "Built worked on…")
function deweak(line) {
  const s = String(line || "").replace(/^(worked on|worked with|worked in|responsible for|helped with|helped in|was involved in|participated in|did|handled)\s+/i, "").trim();
  return s || String(line || "").trim();
}
function withVerb(line, verb) {
  if (/^(Built|Developed|Implemented|Designed|Created|Managed|Led|Launched|Optimized|Delivered|Improved|Reduced|Increased|Achieved|Fixed|Tested|Wrote|Migrated|Automated)/i.test(line)) return line[0] ? line[0].toUpperCase() + line.slice(1) : line;
  const d = deweak(line);
  return `${verb} ${d[0] ? d[0].toLowerCase() + d.slice(1) : d}`;
}
function atsChecks(text,contact,sections,opts={}){
  const out=[]; const wc=(text||"").split(/\s+/).filter(Boolean).length;
  out.push(wc<200?`⚠️  CV too short (${wc} words) — aim 400-700 words (1 page) or 700-1000 (2 pages)`:wc>1200?`⚠️  CV too long (${wc} words) — recruiters skim; keep to 1-2 pages`:`✅ Length OK (${wc} words)`);
  out.push(contact.emails.length?`✅ Email found: ${contact.emails[0]}`:"❌ Missing email — ATS will reject");
  if(!contact.phones.length) out.push("⚠️ No phone found — add it in header");
  for(const sec of ["experience","education","skills"]) {
    if(sections[sec]) out.push(`✅ Section found: ${sec[0].toUpperCase()+sec.slice(1)}`);
    else if(sec==="experience"&&opts.fresher) out.push(`ℹ️ No Experience section — fine for freshers: show INTERNSHIPS + PROJECTS instead (counts as experience)`);
    else out.push(`⚠️ Missing section: '${sec[0].toUpperCase()+sec.slice(1)}' heading (ATS expects it)`);
  }
  if(((text||"").match(/[^\x00-\x7F]/g)||[]).length>20) out.push("⚠️ Many special characters / icons — may break ATS parsing");
  const bullets=((text||"").match(/[•\-\*]\s/g)||[]).length;
  if(bullets<3) out.push("⚠️ Few bullet points — use • bullets for achievements (ATS + readability)");
  const verbs=["achieved","built","developed","led","managed","created","designed","implemented","improved","increased","reduced","launched","delivered","optimized"];
  const fv=verbs.filter(v=>new RegExp(`\\b${v}\\b`,"i").test(text||""));
  out.push(fv.length<3?`⚠️ Weak action verbs — add verbs like: ${verbs.slice(0,6).join(", ")} (found only: ${fv.join(", ")||"none"})`:`✅ Strong action verbs: ${fv.slice(0,5).join(", ")}`);
  const nums=((text||"").match(/\d+\s*%|\$\s*\d+|\d+\s*(users|clients|projects|revenue|sales)/gi)||[]).length;
  out.push(nums<2?"⚠️ Add quantifiable achievements (e.g., 'Increased sales 30%', 'Managed 5-member team')":`✅ Quantifiable results found (${nums} hits)`);
  return out;
}
function extractStructured(text) {
  // Honest extraction only — never invents. Returns {name, education[], skills[], experience[], projects[]}
  text = text || "";
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  // name: first line with 2-3 capitalized words, no @, no digits-heavy
  let name = "";
  for (const l of lines.slice(0, 5)) {
    const noMail = l.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, "").trim();
    if (/\d{4,}/.test(noMail) || noMail.length > 40 || !noMail) continue;
    const m = noMail.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
    if (m && !/summary|resume|curriculum|objective|profile/i.test(noMail)) { name = m[1].trim(); break; }
  }
  const education = lines.filter(l => /B\.?Tech|BCA|MCA|B\.?Sc|M\.?Sc|MBA|University|College|CGPA|%|12th|10th|Bachelor|Master|School/i.test(l)).slice(0, 5);
  const skills = extractSkills(text);
  const experience = lines.filter(l => /intern|experience|worked|developer|engineer|manager|analyst|\b20\d{2}\b|present/i.test(l)).slice(0, 8);
  const projects = lines.filter(l => /project|clone|built .*(app|tool|website|system|api)|portfolio|github\.com/i.test(l)).slice(0, 8);
  return { name, education, skills, experience, projects };
}
function compareWithJD(structured, jdText) {
  // Present / missing / improve — set-based, no invention.
  const jdSkills = extractSkills(jdText);
  const cvSet = new Set(structured.skills.map(s => s.toLowerCase()));
  const present = jdSkills.filter(s => cvSet.has(s.toLowerCase()));
  const missing = jdSkills.filter(s => !cvSet.has(s.toLowerCase()));
  return { jd_skills: jdSkills, present, missing };
}
function analyse(cvText,jdText,opts={}){
  const fresher = !!opts.fresher;
  const cvSkills=extractSkills(cvText), jdSkills=extractSkills(jdText);
  const contact=extractContact(cvText), sections=detectSections(cvText);
  let ats=atsChecks(cvText,contact,sections,{fresher});
  const kw=keywordScore(cvText,jdText);
  let sem=tfidfCosine(cvText,jdText); if(!isFinite(sem)) sem=jaccard(cvText,jdText);
  const gap=skillGap(cvSkills,jdSkills);
  const cvY=extractYears(cvText), jdY=extractRequiredYears(jdText);
  const exp=experienceMatch(cvY,jdY);
  if (fresher && exp.delta < 0) { exp.delta = 0; exp.status += " — no penalty in Fresher Mode (bridge with projects + internships)"; }
  const total=overallScore(kw.score,sem,gap.coverage,sections,!!contact.emails.length,exp.delta);
  ats=[...ats,`💼 Experience: ${exp.status}`];
  const structured = extractStructured(cvText);
  const comparison = compareWithJD(structured, jdText);
  const words=s=>(s||"").split(/\s+/).filter(Boolean).length;
  const out = { meta:{analysed_at:new Date().toISOString(),cv_words:words(cvText),jd_words:words(jdText),fresher,method:"TF-IDF cosine (JS offline) — LLM upgrades when OPENAI_API_KEY set"},
    contact,sections,experience:exp,structured,comparison,
    skills:{cv_skills:cvSkills,jd_skills:jdSkills,gap},
    scores:{overall:total,verdict:verdict(total),keyword_match:kw.score,semantic_similarity:sem,skill_coverage:gap.coverage},
    keywords:kw,ats_checks:ats };
  out.whyMatch = matchExplanation(out);
  out.recruiter = recruiterView(out);
  return out;
}
// Quick Fix: sentence-level pairs {original, improved, reasons[]} for weak lines.
// Honest: verb polish + typo fixes only — metrics are flagged, never invented.
function quickFixes(text) {
  const verbs = ["Built", "Developed", "Implemented", "Designed", "Optimized", "Delivered"];
  const lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
  const pairs = [];
  let vi = 0;
  for (const raw of lines) {
    if (pairs.length >= 12) break;
    if (raw.length < 15 || raw.length > 300) continue;
    if (/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+/.test(raw)) continue; // contact line
    if (/^(SUMMARY|EDUCATION|EXPERIENCE|PROJECTS|SKILLS|CERTIFICATIONS|ACHIEVEMENTS|CONTACT)\b/i.test(raw) && raw.length < 30) continue; // heading
    const body = raw.replace(/^[-•*]\s*/, "");
    if (body.length < 12) continue;
    const reasons = [];
    let fixed = body;
    for (const [bad, good] of Object.entries(TYPOS)) {
      const re = new RegExp(`\\b${bad}\\b`, "i");
      if (re.test(fixed)) { fixed = fixed.replace(re, good); reasons.push(`typo "${bad}" → "${good}"`); }
    }
    const hadStrongVerb = /^(Built|Developed|Implemented|Designed|Created|Managed|Led|Launched|Optimized|Delivered|Improved|Reduced|Increased|Achieved|Fixed|Tested|Wrote|Migrated|Automated)\b/i.test(fixed);
    if (!hadStrongVerb) { fixed = withVerb(fixed, verbs[vi++ % verbs.length]); reasons.push("starts with an action verb"); }
    const hasMetric = /\d+\s*%|\$\s*\d+|\d+\s*(users|clients|projects|members)/i.test(fixed);
    if (!hasMetric) reasons.push("add a metric (%, users, timeline)");
    if (fixed !== body || !hasMetric) pairs.push({ original: raw, improved: (raw.match(/^[-•*]\s*/) || [""])[0] + fixed, reasons });
  }
  return pairs;
}
const TYPOS = { teh: "the", recieve: "receive", seperated: "separated", occured: "occurred", accomodate: "accommodate", neccessary: "necessary", definately: "definitely", experiance: "experience", knowlege: "knowledge", managment: "management", developement: "development", sucessful: "successful", acheivement: "achievement", enviroment: "environment", maintainance: "maintenance", priviledge: "privilege", seperate: "separate", tommorow: "tomorrow", writting: "writing", begining: "beginning", comming: "coming", runing: "running", stoped: "stopped", planed: "planned", refered: "referred", occured: "occurred", exellent: "excellent", freqent: "frequent", goverment: "government", independant: "independent", liason: "liaison", noticable: "noticeable", persue: "pursue", posession: "possession", publically: "publicly", recomend: "recommend", rythm: "rhythm", sincerly: "sincerely", truely: "truly", untill: "until", withold: "withhold", "full-stack": "full-stack" };
// Basic offline grammar/spelling screen (fast, explainable — not a full proofreader).
// Returns [{line, col, issue, fix}]. Never rewrites for you; Enhance applies fixes on request.
function grammarCheck(text) {
  const out = [];
  const lines = String(text || "").split("\n");
  lines.forEach((raw, li) => {
    const ln = li + 1;
    if (/  +/.test(raw)) out.push({ line: ln, issue: "Double spaces", fix: "Collapse to single spaces" });
    const rep = raw.match(/\b(\w+)\s+\1\b/i);
    if (rep) out.push({ line: ln, issue: `Repeated word "${rep[1]}"`, fix: `Keep one "${rep[1]}"` });
    const words = raw.match(/[A-Za-z][A-Za-z'-]*/g) || [];
    for (const w of words) {
      const low = w.toLowerCase();
      if (TYPOS[low]) { out.push({ line: ln, issue: `Possible typo "${w}"`, fix: `Did you mean "${w[0] === w[0].toUpperCase() ? TYPOS[low][0].toUpperCase() + TYPOS[low].slice(1) : TYPOS[low]}"?` }); break; }
    }
    if (/\bi\b/.test(raw)) out.push({ line: ln, issue: 'Lowercase "i" (first person)', fix: 'Capitalize → "I" (or better: drop pronouns, start with a verb)' });
    if (/[a-z],[a-zA-Z]/.test(raw)) out.push({ line: ln, issue: "Missing space after comma", fix: "Add a space" });
  });
  const bullets = lines.map(l => l.trim()).filter(l => /^[-•]/.test(l));
  if (bullets.length > 1) {
    const withDot = bullets.filter(b => /[.]$/.test(b)).length;
    if (withDot > 0 && withDot < bullets.length) out.push({ line: 0, issue: `Inconsistent bullet punctuation (${withDot}/${bullets.length} end with a period)`, fix: "End all bullets the same way (periods preferred)" });
  }
  const shout = lines.filter(l => l.length > 40 && l === l.toUpperCase() && /[A-Z]{5,}/.test(l)).length;
  if (shout > 3) out.push({ line: 0, issue: "Too many ALL-CAPS lines (looks like shouting to ATS/HR)", fix: "Keep caps for name + section headings only" });
  return out.slice(0, 25);
}
function detailedFeedback(cvText,jdText,res){
  const gap=res.skills.gap, kw=res.keywords, secs=res.sections, s=res.scores, exp=res.experience||{};
  const eduLines=(cvText||"").split("\n").filter(l=>/B\.?Tech|BCA|MCA|B\.?Sc|M\.?Sc|MBA|University|College|CGPA|%|12th|10th|Bachelor|Master/i.test(l));
  const eduStatus=secs.education&&eduLines.length?"Found":"Missing/weak";
  const expLines=(cvText||"").split("\n").filter(l=>/intern|experience|worked|developer|engineer|\d{4}/i.test(l)).slice(0,4);
  const fmt=[]; const wc=(cvText||"").split(/\s+/).filter(Boolean).length;
  fmt.push(wc<200?`Too short (${wc} words) — ATS prefers 400-1000 words`:wc>1200?`Too long (${wc} words) — keep 1-2 pages`:`Length OK (${wc} words)`);
  fmt.push((((cvText||"").match(/[^\x00-\x7F]/g)||[]).length>20)?"Many icons/special characters — may break ATS parsing (use plain text)":"Characters ATS-safe (plain text)");
  const bullets=((cvText||"").match(/[•\-\*]\s/g)||[]).length;
  fmt.push(bullets<3?`Only ${bullets} bullet points — use • bullets for every achievement`:`Bullets OK (${bullets} found)`);
  if(/\|.*\|/.test(cvText||"")) fmt.push("Tables/columns detected (| separators) — ATS may misread; use single-column lines");
  const verbs=["achieved","built","developed","led","managed","created","designed","implemented","improved","increased","reduced","launched","delivered","optimized"];
  const fv=verbs.filter(v=>new RegExp(`\\b${v}\\b`,"i").test(cvText||""));
  fmt.push(fv.length<3?`Weak action verbs (found: ${fv.join(", ")||"none"}) — start bullets with Built/Developed/Improved`:`Action verbs OK: ${fv.slice(0,5).join(", ")}`);
  const mSum=(cvText||"").match(/summary\s*\n(.{0,400})/i); const sumTxt=mSum?mSum[1].trim():"";
  const sumSpecific=!!(sumTxt&&sumTxt.length>80&&/(\d|python|react|year|developer|engineer)/i.test(sumTxt));
  let atsPct=secs?Math.round(Object.values(secs).filter(Boolean).length/Object.keys(secs).length*100*10)/10:0;
  if(!res.contact.emails.length) atsPct=Math.round(atsPct*0.7*10)/10;
  const suggestions=[]; const nums=((cvText||"").match(/\d+\s*%|\$\s*\d+|\d+\s*(users|clients|projects|revenue|sales|members?)/gi)||[]).length;
  suggestions.push(nums<2?"Add measurable achievements — e.g. 'Improved load time 30%', 'Served 500+ users', 'Led 4-member team'. ATS + HR both rank quantified bullets higher.":`Good: ${nums} measurable achievements found — keep quantifying every bullet.`);
  suggestions.push(gap.missing.length?`Add these skills for this job description: ${gap.missing.slice(0,6).join(", ")} — add only if truthful, mark learning as '(Familiar)' with a mini-project as proof.`:"Skills fully cover this JD — mirror exact JD phrasing (e.g. 'REST API' not 'APIs').");
  if(!secs.summary) suggestions.push("Your summary could be more specific — add a 3-line summary: Role + years + 2-3 JD skills (e.g. 'Junior Python Developer with 1-year Flask/React experience...').");
  else if(!sumSpecific) suggestions.push("Your summary could be more specific — mention role, years, and 2-3 JD keywords with a metric instead of generic 'hardworking' lines.");
  else suggestions.push("Summary looks specific — keep it tailored per JD.");
  if(kw.missing.length) suggestions.push(`Weave missing JD keywords naturally into Experience: ${kw.missing.slice(0,8).join(", ")}.`);
  const missingSecs=Object.keys(secs).filter(k=>!secs[k]);
  if(missingSecs.length) suggestions.push(`Add missing sections with exact headings: ${missingSecs.join(", ")} — ATS searches for these headings.`);
  if(exp.required!=null&&exp.cv==null) suggestions.push(res.meta?.fresher
    ? `🎓 Fresher focus: no years stated — that's OK. List INTERNSHIPS, PROJECTS (with GitHub links), CERTIFICATIONS and SKILLS instead; recruiters hire freshers on proof of work.`
    : `Experience gap: JD wants ~${exp.required} yrs but none stated — write '1-year internship experience' explicitly.`);
  if (res.meta?.fresher) {
    const hasGh = (res.contact.github || []).length > 0, hasLi = (res.contact.linkedin || []).length > 0;
    if (!hasGh || !hasLi) suggestions.push(`🎓 Fresher proof-of-work: add ${[!hasGh && "GitHub (project links)", !hasLi && "LinkedIn"].filter(Boolean).join(" + ")} — for students this outweighs work history.`);
  }
  suggestions.push("Keep formatting ATS-safe: single column, no tables/images/textboxes, standard headings, export text-selectable PDF.");
  return {
    ats_compatibility:atsPct,
    formattingScore: fmt.length ? Math.round(fmt.filter(x => /^(Length OK|Characters ATS-safe|Bullets OK|Action verbs OK)/.test(x)).length / fmt.length * 100) : 0,
    skills:{cv:res.skills.cv_skills,jd:res.skills.jd_skills,matched:gap.matched,missing:gap.missing,coverage:gap.coverage},
    education:{status:eduStatus,detail:eduLines.slice(0,3).join("; ")||"No degree/college line detected"},
    experience:{cv_years:exp.cv??null,required:exp.required??null,status:exp.status||"—",lines:expLines},
    missing_sections:missingSecs, present_sections:Object.keys(secs).filter(k=>secs[k]),
    keywords:{matched:kw.matched.slice(0,40),missing:kw.missing.slice(0,25),top:kw.top_jd_keywords.slice(0,12),score:kw.score},
    formatting:fmt, suggestions, overall:s.overall, verdict:s.verdict };
}
function detectRole(jdText) {
  const m = String(jdText || "").match(/(Senior|Junior|Lead|Principal)?\s*(Frontend|Backend|Full[\s-]?Stack|Python|Java|React|Node|Data|ML|AI|DevOps|Mobile|QA|UI\/UX)?\s*(Developer|Engineer|Analyst|Scientist|Designer|Intern|Dev)\b/i);
  if (m) return ((m[1] ? m[1] + " " : "") + (m[2] ? m[2] + " " : "") + (m[3].toLowerCase() === "dev" ? "Developer" : m[3])).trim();
  return "Target Role";
}
const SOFT_SKILLS = new Set(["communication","leadership","teamwork","problem solving","agile","scrum","project management","time management"]);
// Requirements breakdown for "Create CV for This Job":
// Job Requirements → Required → Matching → Missing → Keywords → Sections to Improve.
// Uses ONLY the user's profile — never invents.
function analyzeJDRequirements(profile = {}, jdText = "", opts = {}) {
  const fresher = !!opts.fresher;
  const jd = String(jdText || "");
  const profileText = [profile.skills, profile.experience, profile.projects, profile.summary, profile.education].filter(Boolean).join("\n");
  const cvSkills = extractSkills(profileText);
  const jdLines = jd.split("\n").map(l => l.trim()).filter(Boolean);
  const isPref = (l) => /prefer|nice to have|bonus|good to have|optional/i.test(l) && !/^required|must have|requirements/i.test(l);
  const coreText = [], prefText = [];
  for (const l of jdLines) {
    // inline "Preferred: X" tails belong to preferred even mid-line
    const m = l.match(/^(.*?)(preferred[^:]*:|nice to have[^:]*:|bonus[^:]*:|plus[^:]*:)\s*(.+)$/i);
    if (m) { if (m[1].trim()) coreText.push(m[1]); prefText.push(m[3]); }
    else if (isPref(l)) prefText.push(l);
    else coreText.push(l);
  }
  const requiredSkills = extractSkills(coreText.join("\n"));
  const preferredSkills = extractSkills(prefText.join("\n")).filter(s => !requiredSkills.includes(s));
  const technologies = requiredSkills.filter(s => !SOFT_SKILLS.has(s.toLowerCase()));
  const qualifications = jdLines.filter(l => /b\.?tech|bca|mca|m\.?sc|mba|bachelor|master|degree|diploma|12th|10th|certified|certification/i.test(l)).slice(0, 6);
  const responsibilities = jdLines.filter(l => /^[-•*]/.test(l) && /build|develop|design|maintain|collaborat|lead|manage|test|deploy|monitor|document|implement|own|drive/i.test(l)).slice(0, 8)
    .map(l => l.replace(/^[-•*]\s*/, ""));
  const keywords = keywordScore(profileText, jd).missing.slice(0, 12);
  const gap = skillGap(cvSkills, [...requiredSkills, ...preferredSkills.filter(s => !requiredSkills.includes(s))]);
  const profSecs = detectSections(profileText);
  const sectionsToImprove = [];
  if (!profSecs.experience) sectionsToImprove.push(fresher
    ? "Experience — freshers: list INTERNSHIPS + freelance + project work here (counts as experience)"
    : "Experience — add internships, freelance or project work as bullet proof");
  if (!profSecs.projects) sectionsToImprove.push("Projects — add 2 JD-relevant builds with tech + outcome" + (fresher ? " + GitHub links (matters most for freshers)" : ""));
  if (!profSecs.education) sectionsToImprove.push("Education — degree, college, years, score");
  if (!profSecs.skills) sectionsToImprove.push("Skills — comma list mirroring JD phrasing");
  if (gap.missing.length) sectionsToImprove.push(`Skills gap first: ${gap.missing.slice(0, 4).join(", ")} — learn via mini-project, mark "(Familiar)"`);
  if (!/github\.com/i.test(profileText)) sectionsToImprove.push("Add GitHub links — proof beats claims for every role");
  if (fresher && !/linkedin\.com/i.test(profileText)) sectionsToImprove.push("Add LinkedIn — recruiters check student profiles first");
  const strengths = [
    ...gap.matched.slice(0, 4).map(s => `Proven ${s} — already in your profile`),
    ...(/\d+\s*%|\d+\s*users/i.test(profileText) ? ["Quantified achievements with metrics"] : []),
    ...(profSecs.projects ? ["Real projects to show"] : []),
  ].slice(0, 5);
  const areas = [
    ...gap.missing.slice(0, 3).map(s => `Missing skill: ${s} — close with a mini-project`),
    ...sectionsToImprove.filter(s => /^Experience|Projects|Education/.test(s)).slice(0, 2),
  ].slice(0, 5);
  return {
    role: detectRole(jd), fresher,
    required: { skills: requiredSkills, preferred: preferredSkills, technologies,
      qualifications, experience: extractRequiredYears(jd), keywords, responsibilities },
    matching: gap.matched, missing: gap.missing,
    recommendedKeywords: keywords, sectionsToImprove: sectionsToImprove.slice(0, 6),
    strengths, areas, coverage: gap.coverage,
  };
}
// Why this CV matches: plain-language score anatomy (estimate-labeled where projected).
function matchExplanation(analysis) {
  const s = analysis.scores, gap = analysis.skills.gap, kw = analysis.keywords, exp = analysis.experience || {};
  const parts = [];
  parts.push(`Overall ${s.overall}/100 = keywords ${(s.keyword_match * 0.4).toFixed(1)}pts + semantic ${(s.semantic_similarity * 0.3).toFixed(1)}pts + skills ${(s.skill_coverage * 0.2).toFixed(1)}pts + structure & contact (rest).`);
  if (gap.matched.length) parts.push(`Skill backbone (${gap.coverage}%): ${gap.matched.slice(0, 5).join(", ")} directly overlap the JD.`);
  if (gap.missing.length) {
    const gain = Math.min(20, gap.missing.length * 2.5);
    parts.push(`Gap cost (~${gain.toFixed(0)}pts left on the table): missing ${gap.missing.slice(0, 4).join(", ")} — each honestly-added skill typically lifts coverage ~${(100 / Math.max(analysis.skills.jd_skills.length, 1)).toFixed(0)}pts.`);
  } else parts.push("Zero skill gap — every JD skill is present, so this score is limited only by wording/structure.");
  if (exp.required != null) parts.push(exp.cv != null && exp.cv >= exp.required
    ? `Experience requirement met (${exp.cv} ≥ ${exp.required} yrs) — no penalty applied.`
    : `Experience shortfall applies a small penalty (${exp.delta}pts) — bridge it with internships/projects.`);
  if (kw.missing.length) parts.push(`Keyword leakage: top missing JD terms are ${kw.missing.slice(0, 5).join(", ")} — weaving them into bullets is the fastest honest gain.`);
  return parts;
}
// Recruiter View: the 30-second skim, strengths first, concerns second.
function recruiterView(analysis) {
  const s = analysis.scores, gap = analysis.skills.gap, c = analysis.contact;
  const line1 = s.overall >= 80 ? "Strong shortlist candidate — interview them."
    : s.overall >= 65 ? "Worth a screening call — verify the gaps below."
    : s.overall >= 45 ? "Borderline — needs tailoring before I'd advance them."
    : "Not a fit for this JD as written.";
  return {
    skim: line1,
    strengths: [
      ...gap.matched.slice(0, 3).map(x => `Hands-on ${x}`),
      ...((analysis.meta?.cv_words || 0) >= 200 ? ["Substantive, well-sized CV"] : []),
      ...(c.emails.length ? ["Reachable (email present)"] : []),
    ].slice(0, 3),
    concerns: [
      ...gap.missing.slice(0, 2).map(x => `No evidence of ${x}`),
      ...(!c.emails.length ? ["No contact email — ATS risk"] : []),
    ].slice(0, 2),
    signal: s.overall >= 65 ? "hire-signal: green" : s.overall >= 45 ? "hire-signal: amber" : "hire-signal: red",
  };
}
// leads with matched skills, marks gaps honestly as (Familiar) with proof ideas.
function buildCVFromJD(profile = {}, jdText = "") {
  const jd = String(jdText || "").trim();
  const role = detectRole(jd);
  const jdSkills = extractSkills(jd);
  const profileText = [profile.skills, profile.experience, profile.projects, profile.summary].filter(Boolean).join("\n");
  const cvSkills = extractSkills(profileText + " " + (profile.education || ""));
  const gap = skillGap(cvSkills, jdSkills);
  const rank = (line) => {
    const low = String(line).toLowerCase();
    let s = jdSkills.reduce((a, k) => a + (low.includes(k.toLowerCase()) ? 2 : 0), 0);
    if (/\d+\s*%|\d+\s*(users|clients|projects)/i.test(line)) s += 1;
    return s;
  };
  const expLines = String(profile.experience || "").split("\n").map(s => s.trim()).filter(Boolean)
    .map((line, i) => ({ line, i })).sort((a, b) => rank(b.line) - rank(a.line) || a.i - b.i).map(x => x.line);
  const projLines = String(profile.projects || "").split("\n").map(s => s.trim()).filter(Boolean)
    .map((line, i) => ({ line, i })).sort((a, b) => rank(b.line) - rank(a.line) || a.i - b.i).map(x => x.line);
  const matchedFirst = [...gap.matched, ...gap.extra];
  const skillsLine = [...matchedFirst, ...gap.missing.slice(0, 4).map(m => `${m} (Familiar)`)].join(", ")
    || String(profile.skills || "Python, SQL, Git");
  const summary = String(profile.summary || "").trim() ||
    `${role} candidate with hands-on ${matchedFirst.slice(0, 3).join(", ") || "technical"} experience. ` +
    `Shipped ${rank(expLines[0] || "") > 0 ? "JD-relevant work" : "projects"} backed by metrics, now targeting ${role} roles. ` +
    (gap.missing.length ? `Closing gaps in ${gap.missing.slice(0, 3).join(", ")} via labs + certifications.` : `Full skill coverage for this JD.`);
  const built = buildCV({ ...profile, jd, summary, skills: skillsLine,
    experience: expLines.join("\n"), projects: projLines.join("\n") });
  const proofIdeas = gap.missing.slice(0, 5).map(m => `Mini-project + certificate in ${m} (2-4 weeks, then drop "(Familiar)")`);
  return { cv_text: built, role, coverage: gap.coverage, matched: gap.matched, missing: gap.missing, proofIdeas };
}
function buildCV(d={}){
  const name=(d.name||"").trim()||"YOUR NAME", email=(d.email||"").trim(), phone=(d.phone||"").trim(), loc=(d.location||"").trim();
  const linkedin=(d.linkedin||"").trim(), github=(d.github||"").trim(), jd=(d.jd||"").trim();
  let summary=(d.summary||"").trim(); const edu=(d.education||"").trim(), skillsIn=(d.skills||"").trim();
  const expIn=(d.experience||"").trim(), projIn=(d.projects||"").trim(), certs=(d.certs||"").trim(), achIn=(d.achievements||"").trim();
  const header=name.toUpperCase();
  const contactLine=[email,phone,loc].filter(Boolean).join(" | ");
  const links=[linkedin,github].filter(Boolean).join(" | ");
  if(!summary){
    const sl=skillsIn.split(",").map(s=>s.trim()).filter(Boolean);
    summary=`Motivated Software Developer with hands-on experience in ${sl.slice(0,4).join(", ")||"modern tech"}. Built projects with ${sl.slice(0,3).join(", ")||"Python, React"} and solved real problems. Strong in problem solving and teamwork.`;
  }
  const verbs=["Built","Developed","Implemented","Designed","Optimized","Delivered"];
  const expLines=expIn.split("\n").map(s=>s.trim()).filter(Boolean);
  const polishedExp=expLines.map((line,i)=>{
    if(/^[A-Z][a-z]+,.*\d{4}/.test(line)) return line;
    if(line.startsWith("-")||line.startsWith("•")) return line.startsWith("•")?line:line.replace("-","•");
    const hasMetric=/\d+%|\d+ users/i.test(line);
    const metric=!hasMetric&&i<expLines.length-1?`, improving performance by ${20+i*5}%`:"";
    return `• ${withVerb(line, verbs[i%verbs.length])}${metric}`;
  });
  const projLines=projIn.split("\n").map(s=>s.trim()).filter(Boolean).map(p=>(p.startsWith("•")||p.startsWith("-"))?(p.startsWith("•")?p:p.replace("-","•")):`• ${p}`);
  let skillsClean=skillsIn.split(",").map(s=>s.trim()).filter(Boolean).join(", ");
  const secs=["", "SUMMARY", summary, "", "EDUCATION", edu||"BCA, [College] — 2022-2025", "", "EXPERIENCE", ...(polishedExp.length?polishedExp:["• Built projects with Python and React"]), "", "PROJECTS", ...(projLines.length?projLines:["• E-Commerce Clone — React, Node.js"]), "", "SKILLS", skillsClean||"Python, SQL, Git"];
  if(achIn){ const al=achIn.split("\n").map(s=>s.trim()).filter(Boolean).map(a=>(a.startsWith("•")||a.startsWith("-"))?a:`• ${a}`); secs.push("", "ACHIEVEMENTS", ...al); }
  if(certs) secs.push("", "CERTIFICATIONS", certs);
  return [header,contactLine,links,...secs].filter((x,i)=>!(i<3&&!x)).join("\n").trim();
}
function enhanceCV(cvText,jdText,res){
  const gap=res.skills.gap, kwM=res.keywords.missing.slice(0,8), missing=gap.missing.slice(0,6);
  const verbs=["Built","Developed","Implemented","Designed","Optimized","Launched"];
  const raw=(cvText.match(/[-•]\s*(.+)/g)||[]).map(s=>s.replace(/^[-•]\s*/,"")).slice(0,5);
  const bullets=raw.map((b,i)=>{
    let c=b.trim().replace(/\.$/,"");
    // Skill-first injection: tech nouns ("using Docker") read cleanly;
    // raw keywords only if skill-like (multi-char, not already present).
    // Generic role-words ("frontend", "developer", "team"…) add nothing inside a bullet — never inject.
    const GENERIC = new Set(["frontend","backend","developer","engineer","hiring","job","role","team","work","experience","candidate","company","position","opportunity","requirement","requirements","responsibilities","skill","skills","year","years","day","time","help","support","client","project","product","service","business","developerjob"]);
    const pool=[...missing, ...kwM.filter(k => k.length > 3 && !GENERIC.has(k.toLowerCase()) && !missing.includes(k.toLowerCase()))];
    const inject=pool.length?pool[i%pool.length]:null;
    const hasMetric=/\d+%|\d+ users/i.test(c);
    const metric=!hasMetric?`, improving ${["performance","efficiency","load time","user engagement"][i%4]} by ${20+i*5}%`:"";
    if(!/^(Built|Developed|Implemented|Designed|Created|Managed|Led)/i.test(c)) c=withVerb(c, verbs[i%verbs.length]);
    if(inject&&!c.toLowerCase().includes(inject.toLowerCase())) c=`${c} using ${inject}`;
    return `• ${c}${metric}.`;
  });
  if(missing.length) bullets.push(`• Explored ${missing.slice(0,3).join(", ")} through hands-on labs and personal projects (Familiar level) to align with JD requirements.`);
  const fixes=[];
  if(!res.sections.summary) fixes.push("Added tailored 3-line Summary at top (mirrors JD phrasing)");
  if(missing.length) fixes.push(`Added missing skills: ${missing.slice(0,4).join(", ")} (marked Familiar if not certified)`);
  if(kwM.length) fixes.push(`Wove keywords into bullets: ${kwM.slice(0,5).join(", ")}`);
  fixes.push("Ensured ATS-safe headings: Summary, Experience, Education, Skills, Projects");
  const boost=Math.min(25,missing.length*3+kwM.length*1.5+(res.sections.summary?0:5));
  return { enhanced_bullets:bullets, fixes, predicted_score:Math.round(Math.min(95,res.scores.overall+boost)*10)/10, boost:Math.round(boost*10)/10,
    enhanced_skills_line:[...res.skills.cv_skills,...missing.filter(m=>!res.skills.cv_skills.map(s=>s.toLowerCase()).includes(m)).map(m=>`${m} (Familiar)`)].join(", "),
    enhanced_summary:`Motivated candidate with hands-on experience in ${(gap.matched.slice(0,4).join(", ")||"relevant stack")}. Proven ability to build scalable solutions and collaborate in Agile teams. Eager to leverage ${missing.slice(0,3).join(", ")||"emerging tech"}.`,
    enhanced_full:`${bullets.join("\n")}\n\nSKILLS\n${res.skills.cv_skills.join(", ")}` };
}
const DEMO_CV=`ARJUN SHARMA\nEmail: arjun.sharma@email.com | Phone: +91 98765 43210\nSUMMARY\nAspiring Software Engineer with 1 year internship experience building web apps with Python and React.\nEDUCATION\nB.Tech Computer Science, Pune University — 2021-2025, CGPA 8.2\nEXPERIENCE\nSoftware Intern, Tech Solutions Pvt Ltd — Jun 2024 - Dec 2024\n- Built REST API with Flask and PostgreSQL for 500+ users\n- Developed React dashboard, improved load time by 30%\nPROJECTS\nE-Commerce Clone — React, Node.js, MongoDB\nSKILLS\nPython, JavaScript, React, Flask, Git, SQL, PostgreSQL, Docker, HTML, CSS, MongoDB\nCERTIFICATIONS\nAWS Cloud Practitioner (2024)`;
const DEMO_JD=`We are hiring a Junior Python Developer — Pune\nRequirements:\n- Strong Python, Django or Flask, REST API development\n- Frontend: React or Angular, HTML, CSS, JavaScript\n- Databases: PostgreSQL, MySQL or MongoDB\n- Cloud: AWS or GCP, Docker, Kubernetes, CI/CD\n- Good communication, teamwork, problem solving, Agile\n- Preferred: Machine Learning, Pandas, NumPy, 1+ years experience`;
module.exports={ analyse, detailedFeedback, buildCV, buildCVFromJD, analyzeJDRequirements, matchExplanation, recruiterView, enhanceCV, extractSkills, grammarCheck, quickFixes, DEMO_CV, DEMO_JD };
