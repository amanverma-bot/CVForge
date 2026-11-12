import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

const footerLinks = [
  {
    title: 'Product',
    items: [
      { name: 'Features', href: '/' },
      { name: 'Pricing', href: '/' },
      { name: 'Templates', href: '/templates' },
      { name: 'CV Analyzer', href: '/analyzer' },
      { name: 'Job Matcher', href: '/match' },
    ],
  },
  {
    title: 'Company',
    items: [
      { name: 'About', href: '/' },
      { name: 'Contact', href: '/' },
      { name: 'Blog', href: '/' },
      { name: 'Careers', href: '/' },
      { name: 'Press', href: '/' },
    ],
  },
  {
    title: 'Legal',
    items: [
      { name: 'Privacy', href: '/privacy' },
      { name: 'Terms', href: '/terms' },
      { name: 'Security', href: '/' },
    ],
  },
];

export const Footer = () => {
  return (
    <footer className="bg-muted border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-on-primary font-black text-xs">
                CV
              </div>
              <span className="font-bold text-lg text-foreground tracking-tight">CVForge</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              Build professional resumes with AI-powered analysis. Create, analyze, improve — get hired faster.
            </p>
          </div>
          {footerLinks.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-foreground mb-4 tracking-tight uppercase">
                {group.title}
              </h3>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} CVForge Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Email">
              <Mail className="w-4 h-4" />
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="GitHub">
              <span className="text-xs font-mono">github</span>
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="LinkedIn">
              <span className="text-xs font-mono">linkedin</span>
            </a>
            <a href="#" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Twitter">
              <span className="text-xs font-mono">twitter</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
