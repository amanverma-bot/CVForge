import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  FileText,
  BarChart3,
  Briefcase,
  ShieldCheck,
  Clock,
  Rocket,
  Users,
  DollarSign,
  Sparkles,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Analysis',
    description: 'Get instant ATS score, keyword match, and detailed feedback on your resume against any job description.',
  },
  {
    icon: FileText,
    title: 'Smart Resume Builder',
    description: 'Guided builder with live A4 preview, auto-save, and 10+ professional templates tailored for your industry.',
  },
  {
    icon: BarChart3,
    title: 'Job Matcher',
    description: 'Compare your CV against up to 10 job descriptions at once. See which roles you\'re best fit for.',
  },
  {
    icon: Briefcase,
    title: 'Application Tracker',
    description: 'Track every application, set follow-up reminders, and manage your job search pipeline in one place.',
  },
  {
    icon: ShieldCheck,
    title: 'Privacy First',
    description: 'Your data stays yours. Encrypted storage, revocable share links, and easy data export or deletion.',
  },
  {
    icon: Clock,
    title: 'Fresher Mode',
    description: 'Guided 4-step builder for students with no experience. Internships, projects, and coursework count as proof.',
  },
];

const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    pricePeriod: '/month',
    description: 'Perfect for students and occasional job seekers.',
    features: [
      'Create up to 3 CVs',
      'Unlimited AI analysis',
      'PDF & DOCX export',
      '8 professional templates',
      'Application tracker (5 items)',
      'Community support',
    ],
    cta: 'Get Started Free',
    ctaVariant: 'primary',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$12',
    pricePeriod: '/month',
    description: 'For serious job seekers who want every advantage.',
    features: [
      'Unlimited CVs',
      'Unlimited AI analysis with LLM',
      'PDF & DOCX export',
      'All 15+ premium templates',
      'Unlimited application tracker',
      'AI cover letter generator',
      'Priority email support',
      'Interview practice with AI feedback',
    ],
    cta: 'Start Free Trial',
    ctaVariant: 'accent',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '$29',
    pricePeriod: '/month',
    description: 'For placement cells, universities, and career coaches.',
    features: [
      'Everything in Pro, plus:',
      'Team workspaces & collaboration',
      'Bulk CV analysis',
      'SSO & admin controls',
      'Custom branding',
      'API access',
      'Dedicated support',
      'Volume discounts',
    ],
    cta: 'Contact Sales',
    ctaVariant: 'outline',
    popular: false,
  },
];

const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Software Engineer',
    company: 'TechCorp',
    avatar: 'SC',
    content: 'CVForge helped me tailor my resume for each job application. I went from 0 interviews to 5 in just 2 weeks.',
    rating: 5,
  },
  {
    name: 'Marcus Rodriguez',
    role: 'Product Manager',
    company: 'StartupX',
    avatar: 'MR',
    content: 'The ATS score breakdown was eye-opening. I fixed my keywords and landed my dream role at a FAANG company.',
    rating: 5,
  },
  {
    name: 'Priya Sharma',
    role: 'Recent Graduate',
    company: 'University',
    avatar: 'PS',
    content: 'Fresher Mode walked me through my first CV. No experience needed - my projects and internships counted.',
    rating: 5,
  },
];

export default function Landing() {
  const [email, setEmail] = useState('');

  const handleNewsletter = (e) => {
    e.preventDefault();
    alert('Thanks for subscribing!');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation is handled by App.jsx Navbar */}
      
      {/* Hero Section */}
      <section className="relative px-4 py-16 sm:py-24 lg:py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold border border-primary/20">
                <Sparkles className="w-4 h-4" />
                New: AI Cover Letter Generator
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
                Build a Resume That <br />
                <span className="text-primary">Gets You Hired</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
                AI-powered resume builder and analyzer. Get instant ATS scores, keyword matching, and professional PDF exports. Join 50,000+ job seekers getting hired faster.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button variant="primary" size="lg" asChild className="w-full sm:w-auto">
                  <Link to="/create">
                    <ArrowRight className="w-5 h-5 mr-2" />
                    Build My CV
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild className="w-full sm:w-auto">
                  <Link to="/analyzer">
                    Analyze My CV
                  </Link>
                </Button>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-success" />
                  <span>No credit card required</span>
                </div>
                <div className="w-px h-4 bg-muted mx-2" />
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  <span>Setup in under 2 minutes</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded-2xl" />
              <div className="relative z-10 bg-card border border-border rounded-2xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary text-xl">
                    CV
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Sample CV Preview</div>
                    <div className="text-xs text-muted-foreground">ATS-optimized • Single column</div>
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="text-2xl font-bold text-gray-900">Aarav Kumar</div>
                  <div className="text-sm text-gray-500 mb-2">aarav.kumar@email.com • Pune, India</div>
                  <div className="mb-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Summary</div>
                    <p className="text-sm text-gray-600">
                      Junior developer with internship experience and 2 shipped projects. Skilled in Python, React, and SQL.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Skills</div>
                      <p className="text-sm text-gray-600">Python, React, SQL, Docker, Git</p>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Experience</div>
                      <p className="text-sm text-gray-600">Software Intern • Tech Solutions</p>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-gray-100">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">ATS Score</div>
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-success font-bold text-sm">
                        87
                      </div>
                      <span className="text-sm font-medium text-foreground">Strong Match</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="px-4 py-16 bg-muted">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Everything between you and hired</h2>
            <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
              One workflow: Create → Analyze → Match → Interview → Apply → Track
            </p>
          </div>
          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} padding="md" className="hover:shadow-lg transition-shadow group">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-on-primary transition-colors">
                  <feature.icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="px-4 py-10 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
            <span className="text-sm font-medium text-foreground">Trustpilot</span>
            <span className="text-sm font-medium text-foreground">Product Hunt</span>
            <span className="text-sm font-medium text-foreground">LinkedIn</span>
            <span className="text-sm font-medium text-foreground">Glassdoor</span>
            <span className="text-sm font-medium text-foreground">Indeed</span>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="px-4 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Simple, transparent pricing</h2>
            <p className="text-lg text-muted-foreground mt-2">Choose the plan that fits your job search journey</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                padding="lg"
                className={cn(
                  'relative flex flex-col',
                  plan.popular
                    ? 'border-primary bg-primary/5 shadow-lg scale-[1.02] z-10'
                    : 'border-border hover:border-primary/50'
                )}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 right-6 bg-accent text-on-accent">
                    Most Popular
                  </Badge>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.pricePeriod}</span>
                  </div>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm">
                      <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                      <span className={cn(
                        plan.popular ? 'text-foreground' : 'text-muted-foreground',
                        'leading-relaxed'
                      )}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={plan.ctaVariant}
                  size="lg"
                  className="w-full"
                  onClick={() => alert(`${plan.name} plan selected`)}
                >
                  {plan.cta}
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="px-4 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">Trusted by job seekers worldwide</h2>
            <p className="text-lg text-muted-foreground mt-2">Real results from real people</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <Card key={t.name} padding="md" className="hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-4">
                  <Avatar src={null} name={t.name} size="sm" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}, {t.company}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 mb-4 text-warning">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4" fill={i <= t.rating ? 'currentColor' : 'none'} stroke={i <= t.rating ? undefined : 'currentColor'} />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  "{t.content}"
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative rounded-2xl bg-gradient-to-r from-primary to-secondary p-8 md:p-12 overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="w-64 h-64 bg-primary rounded-full mix-blend-overlay filter blur-3xl -top-24 -left-24" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4 relative z-10">
              Ready to land your dream job?
            </h2>
            <p className="text-lg text-white/90 mb-8 max-w-md mx-auto relative z-10">
              Join 50,000+ job seekers using CVForge to create winning resumes and get hired faster.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center relative z-10">
              <Button variant="accent" size="lg" asChild className="w-full sm:w-auto">
                <Link to="/create">
                  <Rocket className="w-5 h-5 mr-2" />
                  Start Building Free
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="w-full sm:w-auto border-white text-white">
                View Pricing
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Avatar({ src, name, size = 'sm' }) {
  const sizes = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm', lg: 'w-12 h-12 text-base' };
  const initials = name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : '?';
  return (
    <div className={cn('rounded-full flex-shrink-0 flex items-center justify-center font-semibold bg-muted', sizes[size])}>
      {initials}
    </div>
  );
}