import React, { useState, useEffect } from 'react';
import {
  FileText,
  User,
  GraduationCap,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Folder,
  Award,
  Palette,
  Save,
  Download,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useStore } from '@/store/useStore';
import { api, apiBlob, downloadBlob, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'personal', label: 'Personal Info', icon: User },
  { key: 'summary', label: 'Professional Summary', icon: FileText },
  { key: 'education', label: 'Education', icon: GraduationCap },
  { key: 'experience', label: 'Experience', icon: Briefcase },
  { key: 'projects', label: 'Projects', icon: Folder },
  { key: 'skills', label: 'Skills & Certs', icon: Award },
  { key: 'template', label: 'Template & Preview', icon: Palette },
];

const TEMPLATES = [
  { key: 'modern', name: 'Modern', desc: 'Clean with forest accents' },
  { key: 'minimal', name: 'Minimal', desc: 'Whitespace-focused' },
  { key: 'professional', name: 'Professional', desc: 'Boardroom-ready' },
  { key: 'tech', name: 'Tech', desc: 'Developer-focused' },
  { key: 'fresher', name: 'Fresher', desc: 'Student-first' },
  { key: 'classic', name: 'Classic', desc: 'Max ATS parse' },
  { key: 'neon', name: 'Neon', desc: 'Dark portfolio style' },
];

const initialDraft = {
  name: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  github: '',
  summary: '',
  template: 'modern',
  education: [],
  experience: [],
  projects: [],
  skills: '',
  certs: [],
  achievements: [],
};

const buildEntryList = (items, defaults) =>
  (Array.isArray(items) ? items : []).map((item, index) => ({
    ...defaults,
    ...(item && typeof item === 'object' ? item : {}),
    id: item?.id ?? `restored-${index}-${Date.now()}`,
  }));

// Persisted drafts can be partial (or come from an older data shape). Normalizing
// here keeps every input controlled and makes the live preview safe to render.
const normalizeDraft = (data) => {
  const source = data && typeof data === 'object' ? data : {};
  const template = TEMPLATES.some((item) => item.key === source.template)
    ? source.template
    : 'modern';

  return {
    ...initialDraft,
    ...source,
    name: source.name ?? '',
    email: source.email ?? '',
    phone: source.phone ?? '',
    location: source.location ?? '',
    linkedin: source.linkedin ?? '',
    github: source.github ?? '',
    summary: source.summary ?? '',
    skills: Array.isArray(source.skills) ? source.skills.join(', ') : source.skills ?? '',
    template,
    education: buildEntryList(source.education, {
      school: '',
      degree: '',
      years: '',
      detail: '',
    }),
    experience: buildEntryList(source.experience, {
      role: '',
      org: '',
      dates: '',
      bullets: '',
    }),
    projects: buildEntryList(source.projects, { name: '', tech: '', desc: '' }),
    certs: buildEntryList(source.certs, { name: '' }),
    achievements: Array.isArray(source.achievements) ? source.achievements : [],
  };
};

const logRequestFailure = (action, error) => {
  const status = error?.status;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'unknown';

  console.error(`[Create] ${action} failed`, error);
  console.error('[Create] Request diagnostics', {
    status,
    message: error?.message,
    origin,
    protocol,
  });

  if (status === 401 || status === 403) {
    console.error(
      `[Create] ${status} received. Check Google Cloud API key restrictions, OAuth authorized origins, Firebase authorized domains, backend CORS, and the signed-in user's permissions for ${origin}.`
    );
  }

  if (protocol === 'https:') {
    console.error(
      '[Create] Mixed-content hint: this page is served over HTTPS. Browser requests to HTTP endpoints are blocked; make sure every API URL also uses HTTPS.'
    );
  }
};

export default function Create() {
  const { setCVData, cvData } = useStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState(() => normalizeDraft(cvData));
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'preview'
  const [toast, setToast] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [saving, setSaving] = useState(false);

  const currentStep = STEPS[stepIndex];
  const activeTemplate = draft.template || 'modern';

  // Autosave to store
  useEffect(() => {
    setCVData(draft);
  }, [draft, setCVData]);

  const nextStep = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex((prev) => prev + 1);
  };

  const prevStep = () => {
    if (stepIndex > 0) setStepIndex((prev) => prev - 1);
  };

  // Functional updates prevent stale-closure writes when users type quickly.
  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const addEducation = (e) => {
    e.preventDefault();
    setDraft((prev) => ({
      ...prev,
      education: [
        ...(prev.education || []),
        { id: Date.now(), school: '', degree: '', years: '', detail: '' },
      ],
    }));
  };

  const addExperience = (e) => {
    e.preventDefault();
    setDraft((prev) => ({
      ...prev,
      experience: [
        ...(prev.experience || []),
        { id: Date.now(), role: '', org: '', dates: '', bullets: '' },
      ],
    }));
  };

  const addProject = (e) => {
    e.preventDefault();
    setDraft((prev) => ({
      ...prev,
      projects: [
        ...(prev.projects || []),
        { id: Date.now(), name: '', tech: '', desc: '' },
      ],
    }));
  };

  const addCert = (e) => {
    e.preventDefault();
    setDraft((prev) => ({
      ...prev,
      certs: [...(prev.certs || []), { id: Date.now(), name: '' }],
    }));
  };

  const removeEntry = (array, id) => {
    setDraft((prev) => ({
      ...prev,
      [array]: (prev[array] || []).filter((item) => item.id !== id),
    }));
  };

  const updateEntry = (array, id, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [array]: (prev[array] || []).map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const educationText = (d) =>
    (d.education || [])
      .map((e) => [e.degree, e.school, e.years, e.detail].filter(Boolean).join(' | '))
      .filter(Boolean)
      .join('\n');

  const experienceText = (d) =>
    (d.experience || [])
      .map((e) => [e.role, e.org, e.dates, e.bullets].filter(Boolean).join(' | '))
      .filter(Boolean)
      .join('\n');

  const projectsText = (d) =>
    (d.projects || [])
      .map((p) => [p.name, p.tech, p.desc].filter(Boolean).join(' | '))
      .filter(Boolean)
      .join('\n');

  const certsText = (d) =>
    (d.certs || []).map((c) => c.name).filter(Boolean).join(', ');

  const buildResumeText = (d) => {
    const contact = [d.email, d.phone, d.location, d.linkedin, d.github].filter(Boolean).join(' | ');
    return [
      d.name,
      contact,
      '',
      d.summary ? `SUMMARY\n${d.summary}\n` : '',
      d.education?.length ? `EDUCATION\n${educationText(d)}\n` : '',
      d.experience?.length ? `EXPERIENCE\n${experienceText(d)}\n` : '',
      d.projects?.length ? `PROJECTS\n${projectsText(d)}\n` : '',
      d.skills ? `SKILLS\n${d.skills}\n` : '',
      d.certs?.length ? `CERTIFICATIONS\n${certsText(d)}\n` : '',
      d.achievements?.length ? `ACHIEVEMENTS\n${d.achievements.join('\n')}\n` : '',
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
  };

  const buildPayload = () => ({
    name: draft.name.trim(),
    email: draft.email.trim(),
    phone: draft.phone.trim(),
    location: draft.location.trim(),
    linkedin: draft.linkedin.trim(),
    github: draft.github.trim(),
    summary: draft.summary.trim(),
    education: educationText(draft),
    experience: experienceText(draft),
    projects: projectsText(draft),
    skills: draft.skills.trim(),
    template: draft.template || 'modern',
    role: draft.experience?.[0]?.role?.trim() || '',
    generatedText: buildResumeText(draft),
  });

  const saveCV = async () => {
    if (!draft.name.trim()) {
      showToast('Please enter your name', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      const isUpdate = Boolean(savedId);
      const saved = isUpdate
        ? await api(`/api/cvs/${savedId}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api('/api/cvs', { method: 'POST', body: JSON.stringify(payload) });
      const realId = saved?.id || saved?._id;
      if (realId) setSavedId(realId);
      showToast(isUpdate ? 'CV updated successfully!' : 'CV saved successfully!');
    } catch (err) {
      logRequestFailure('Save CV', err);
      showToast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportPDF = async () => {
    try {
      const text = buildResumeText(draft);
      if (!text) {
        showToast('Add some CV content before exporting', 'error');
        return;
      }

      setSaving(true);
      const blob = await apiBlob('/api/pdf', {
        method: 'POST',
        body: JSON.stringify({ title: draft.name || 'Resume', text }),
      });
      const slug = (draft.name || 'resume').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'resume';
      downloadBlob(blob, `${slug}.pdf`);
      showToast('PDF downloaded');
    } catch (err) {
      logRequestFailure('Export PDF', err);
      showToast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  const renderLivePreview = () => {
    try {
      return (
        <Card
          padding="none"
          className={cn(
            'overflow-hidden flex flex-col border-border',
            viewMode === 'preview'
              ? 'h-[calc(100vh-220px)] min-h-[520px]'
              : 'h-[600px] max-h-[75vh] min-h-[420px]'
          )}
        >
          <div className="relative h-full overflow-y-auto bg-white dark:bg-gray-900">
            <div className={cn('a4 p-8', activeTemplate)}>
              <h2 className="text-3xl font-bold text-foreground mb-2 uppercase tracking-tighter">
                {draft.name || 'YOUR NAME'}
              </h2>
              <div className="text-sm text-muted-foreground mb-6 flex items-center gap-2">
                {[draft.email, draft.phone, draft.location].filter(Boolean).join(' • ')}
              </div>
              {draft.summary && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-1 border-b border-primary/20 pb-1">
                    Professional Summary
                  </h4>
                  <p className="text-sm text-gray-700 leading-relaxed">{draft.summary}</p>
                </div>
              )}
              {draft.education.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 border-b border-primary/20 pb-1">
                    Education
                  </h4>
                  {draft.education.map((edu) => (
                    <div key={edu.id} className="mb-3">
                      <h5 className="text-sm font-semibold text-foreground">{edu.school}</h5>
                      <p className="text-xs text-muted-foreground">
                        {[edu.degree, edu.years, edu.detail].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {draft.experience.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 border-b border-primary/20 pb-1">
                    Experience
                  </h4>
                  {draft.experience.map((exp) => (
                    <div key={exp.id} className="mb-3">
                      <h5 className="text-sm font-semibold text-foreground">
                        {exp.role} <span className="text-xs text-muted-foreground font-normal">| {exp.org}</span>
                      </h5>
                      <p className="text-xs text-muted-foreground">{exp.dates}</p>
                      <ul className="mt-1 text-sm text-gray-700 space-y-1 list-disc pl-4">
                        {String(exp.bullets || '')
                          .split('\n')
                          .filter(Boolean)
                          .map((bullet, i) => (
                            <li key={`${exp.id}-bullet-${i}`}>{bullet}</li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {draft.projects.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 border-b border-primary/20 pb-1">
                    Projects
                  </h4>
                  {draft.projects.map((proj) => (
                    <div key={proj.id} className="mb-3">
                      <h5 className="text-sm font-semibold text-foreground">{proj.name}</h5>
                      <p className="text-xs text-muted-foreground">{proj.tech}</p>
                      <p className="text-sm text-gray-700 mt-1">{proj.desc}</p>
                    </div>
                  ))}
                </div>
              )}
              {draft.skills && (
                <div className="mb-6">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 border-b border-primary/20 pb-1">
                    Skills
                  </h4>
                  <p className="text-sm text-gray-700">{draft.skills}</p>
                </div>
              )}
              {draft.certs.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 border-b border-primary/20 pb-1">
                    Certifications
                  </h4>
                  <p className="text-sm text-gray-700">
                    {draft.certs.map((cert) => cert.name).filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </Card>
      );
    } catch (err) {
      console.error(
        '[Create] Live preview render failed. Check the draft data shape, template class, and preview styles.',
        err
      );
      return (
        <Card padding="md" className="border-destructive/40">
          <p className="text-sm text-destructive">
            The live preview could not be rendered. Open the browser console for details.
          </p>
        </Card>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Create CV</h1>
        <p className="text-muted-foreground">Build your professional resume step by step</p>
      </div>

      {/* Progress Stepper */}
      <Card padding="md" className="border-border">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">{currentStep.label}</span>
            <span className="text-xs text-muted-foreground">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {STEPS.map((step, i) => (
              <div key={step.key} className="flex items-center gap-1">
                <div
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                    i < stepIndex
                      ? 'bg-success text-white'
                      : i === stepIndex
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-4 h-0.5 bg-muted"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Main Content - Edit / Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 lg:min-h-[70vh]">
        {/* Left: Edit Form */}
        <div className="space-y-6">
          {stepIndex === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Full Name"
                  placeholder="John Doe"
                  value={draft.name}
                  onChange={(e) => setField('name', e.target.value)}
                  leftIcon={<User className="w-4 h-4" />}
                />
                <Input
                  label="Email"
                  placeholder="john@example.com"
                  type="email"
                  value={draft.email}
                  onChange={(e) => setField('email', e.target.value)}
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Phone"
                  placeholder="+1 (555) 000-0000"
                  value={draft.phone}
                  onChange={(e) => setField('phone', e.target.value)}
                  leftIcon={<Phone className="w-4 h-4" />}
                />
                <Input
                  label="Location"
                  placeholder="City, State"
                  value={draft.location}
                  onChange={(e) => setField('location', e.target.value)}
                  leftIcon={<MapPin className="w-4 h-4" />}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="LinkedIn"
                  placeholder="linkedin.com/in/johndoe"
                  value={draft.linkedin}
                  onChange={(e) => setField('linkedin', e.target.value)}
                  leftIcon={<Mail className="w-4 h-4" />}
                />
                <Input
                  label="GitHub"
                  placeholder="github.com/johndoe"
                  value={draft.github}
                  onChange={(e) => setField('github', e.target.value)}
                  leftIcon={<Mail className="w-4 h-4" />}
                />
              </div>
            </div>
          )}

          {stepIndex === 1 && (
            <div className="space-y-4">
              <Input
                label="Professional Summary"
                placeholder="Write a 2-3 sentence summary of your professional background..."
                value={draft.summary}
                onChange={(e) => setField('summary', e.target.value)}
                className="h-32"
              />
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-xs text-muted-foreground">
                  Tip: Keep it concise. Mention your years of experience, key skills, and what you&apos;re looking for.
                </p>
              </div>
            </div>
          )}

          {stepIndex === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Education</h3>
                <Button variant="outline" size="sm" onClick={addEducation}>
                  <Plus className="w-3 h-3 mr-1" /> Add School
                </Button>
              </div>
              {draft.education.map((edu, idx) => (
                <Card key={edu.id} padding="sm" className="border-border space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                      label="School"
                      value={edu.school}
                      onChange={(e) => updateEntry('education', edu.id, 'school', e.target.value)}
                    />
                    <Input
                      label="Degree"
                      value={edu.degree}
                      onChange={(e) => updateEntry('education', edu.id, 'degree', e.target.value)}
                    />
                    <Input
                      label="Years"
                      placeholder="2020-2024"
                      value={edu.years}
                      onChange={(e) => updateEntry('education', edu.id, 'years', e.target.value)}
                    />
                    <Input
                      label="Score / GPA"
                      placeholder="3.8 / 4.0"
                      value={edu.detail}
                      onChange={(e) => updateEntry('education', edu.id, 'detail', e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => removeEntry('education', edu.id)}
                    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </Card>
              ))}
              {draft.education.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No education entries yet. Click &quot;Add School&quot; to get started.</p>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={addEducation} className="w-full mt-4">
                <Plus className="w-4 h-4 mr-2" /> Add Another School
              </Button>
            </div>
          )}

          {stepIndex === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Experience</h3>
                <Button variant="outline" size="sm" onClick={addExperience}>
                  <Plus className="w-3 h-3 mr-1" /> Add Role
                </Button>
              </div>
              {draft.experience.map((exp, idx) => (
                <Card key={exp.id} padding="sm" className="border-border space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Input
                      label="Role"
                      placeholder="Software Engineer"
                      value={exp.role}
                      onChange={(e) => updateEntry('experience', exp.id, 'role', e.target.value)}
                    />
                    <Input
                      label="Company"
                      placeholder="Tech Corp"
                      value={exp.org}
                      onChange={(e) => updateEntry('experience', exp.id, 'org', e.target.value)}
                    />
                    <Input
                      label="Dates"
                      placeholder="Jan 2023 - Present"
                      value={exp.dates}
                      onChange={(e) => updateEntry('experience', exp.id, 'dates', e.target.value)}
                    />
                  </div>
                  <Input
                    label="Achievements (one per line)"
                    placeholder="• Built REST API serving 10k+ users\n• Reduced load time by 30%\n• Led team of 4 developers"
                    value={exp.bullets}
                    onChange={(e) => updateEntry('experience', exp.id, 'bullets', e.target.value)}
                    className="h-24"
                  />
                  <button
                    onClick={() => removeEntry('experience', exp.id)}
                    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </Card>
              ))}
              {draft.experience.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No experience entries yet. Click &quot;Add Role&quot; to get started.</p>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={addExperience} className="w-full mt-4">
                <Plus className="w-4 h-4 mr-2" /> Add Another Role
              </Button>
            </div>
          )}

          {stepIndex === 4 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground">Projects</h3>
                <Button variant="outline" size="sm" onClick={addProject}>
                  <Plus className="w-3 h-3 mr-1" /> Add Project
                </Button>
              </div>
              {draft.projects.map((proj, idx) => (
                <Card key={proj.id} padding="sm" className="border-border space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Input
                      label="Project Name"
                      placeholder="E-Commerce Platform"
                      value={proj.name}
                      onChange={(e) => updateEntry('projects', proj.id, 'name', e.target.value)}
                    />
                    <Input
                      label="Tech Stack"
                      placeholder="React, Node.js, MongoDB"
                      value={proj.tech}
                      onChange={(e) => updateEntry('projects', proj.id, 'tech', e.target.value)}
                    />
                  </div>
                  <Input
                    label="Description"
                    placeholder="Built a full-stack e-commerce platform with payment integration..."
                    value={proj.desc}
                    onChange={(e) => updateEntry('projects', proj.id, 'desc', e.target.value)}
                    className="h-24"
                  />
                  <button
                    onClick={() => removeEntry('projects', proj.id)}
                    className="text-xs text-destructive hover:text-destructive/80 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Remove
                  </button>
                </Card>
              ))}
              {draft.projects.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No project entries yet. Click &quot;Add Project&quot; to get started.</p>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={addProject} className="w-full mt-4">
                <Plus className="w-4 h-4 mr-2" /> Add Another Project
              </Button>
            </div>
          )}

          {stepIndex === 5 && (
            <div className="space-y-4">
              <Input
                label="Skills"
                placeholder="Python, React, SQL, Docker, Git, AWS..."
                value={draft.skills}
                onChange={(e) => setField('skills', e.target.value)}
                className="h-32"
                helperText="Comma-separated list of your technical and soft skills"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Certifications</h4>
                  {draft.certs.map((cert) => (
                    <div key={cert.id} className="flex items-center gap-2">
                      <Input
                        label=""
                        value={cert.name}
                        onChange={(e) => updateEntry('certs', cert.id, 'name', e.target.value)}
                        className="input-sm"
                      />
                      <button
                        onClick={() => removeEntry('certs', cert.id)}
                        className="text-xs text-destructive p-1 hover:bg-destructive/10 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addCert} className="w-full">
                    <Plus className="w-3 h-3 mr-1" /> Add Certification
                  </Button>
                </div>
              </div>
            </div>
          )}

          {stepIndex === 6 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    onClick={() => {
                      setField('template', tpl.key);
                    }}
                    className={cn(
                      'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all',
                      activeTemplate === tpl.key
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5'
                    )}
                  >
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold">
                      {tpl.name.charAt(0)}
                    </div>
                    <span className="text-xs font-medium">{tpl.name}</span>
                    <span className="text-[10px] opacity-60">{tpl.desc}</span>
                  </button>
                ))}
              </div>
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <div className="h-48 bg-white border rounded-lg p-4 overflow-hidden relative">
                  <div className="absolute top-2 left-2 right-2 h-1 bg-primary rounded-full" />
                  <div className="mt-4">
                    <h4 className="font-bold text-sm">{draft.name || 'Your Name'}</h4>
                    <p className="text-xs text-muted-foreground">{draft.email}</p>
                    <div className="mt-2 text-xs text-gray-600">
                      {draft.skills?.split(',').slice(0, 4).join(' • ') || 'Skills preview...'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Navigation controls + Live Preview */}
        <div className="space-y-5">
          {/* Navigation controls (top) */}
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              fullWidth
              disabled={stepIndex === STEPS.length - 1}
              onClick={() => {
                setStepIndex(STEPS.length - 1);
                setViewMode('preview');
              }}
            >
              Finish & Preview
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={nextStep}
              disabled={stepIndex === STEPS.length - 1}
            >
              Next Step
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              fullWidth
              disabled={stepIndex === 0}
              onClick={prevStep}
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>
          </div>

          {/* Live preview header and mode toggle */}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
            <h3 className="text-lg font-semibold text-foreground">Live Preview</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                aria-pressed={viewMode === 'edit'}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  viewMode === 'edit'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted-hover'
                )}
              >
                <Edit className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                aria-pressed={viewMode === 'preview'}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  viewMode === 'preview'
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted-hover'
                )}
              >
                <Eye className="w-3.5 h-3.5" />
                Preview
              </button>
            </div>
          </div>

          {/* Autosave status */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Save className="w-3 h-3" />
            <span>Auto-save enabled - changes saved automatically</span>
          </div>

          {/* Preview actions in the required order */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              fullWidth
              onClick={saveCV}
              disabled={!draft.name.trim() || saving}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              fullWidth
              onClick={exportPDF}
              disabled={!draft.name.trim() || saving}
            >
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
          </div>

          {/* The preview is always mounted and reads directly from draft, so every
              keystroke re-renders this block immediately in both Edit and Preview modes. */}
          {renderLivePreview()}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={cn(
            'px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom fade-in duration-300',
            toast.type === 'success' ? 'bg-success text-white' : 'bg-destructive text-white'
          )}>
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}