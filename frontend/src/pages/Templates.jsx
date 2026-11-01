import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Palette,
  FileText,
  Layers,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const templates = [
  {
    key: 'modern',
    name: 'Modern',
    desc: 'Clean design with forest green accents. Perfect for tech and creative roles.',
    category: 'Tech / Creative',
    rating: 4.9,
    downloads: '12.5K',
    preview: 'M',
  },
  {
    key: 'minimal',
    name: 'Minimal',
    desc: 'Whitespace-focused, distraction-free layout. Ideal for conservative industries.',
    category: 'Finance / Legal',
    rating: 4.8,
    downloads: '9.2K',
    preview: 'M',
  },
  {
    key: 'professional',
    name: 'Professional',
    desc: 'Boardroom-ready with navy accents. Best for corporate and executive positions.',
    category: 'Corporate / Executive',
    rating: 4.9,
    downloads: '15.1K',
    preview: 'P',
  },
  {
    key: 'tech',
    name: 'Tech',
    desc: 'Developer-focused with monospace accents and project highlights.',
    category: 'Engineering / IT',
    rating: 4.7,
    downloads: '8.3K',
    preview: 'T',
  },
  {
    key: 'fresher',
    name: 'Fresher',
    desc: 'Student-first layout emphasizing education, projects, and internships.',
    category: 'Students / Entry Level',
    rating: 4.6,
    downloads: '11.7K',
    preview: 'F',
  },
  {
    key: 'classic',
    name: 'Classic',
    desc: 'Serif typography with maximum ATS parseability. Traditional format.',
    category: 'Academic / Research',
    rating: 4.5,
    downloads: '7.4K',
    preview: 'C',
  },
  {
    key: 'neon',
    name: 'Neon',
    desc: 'Dark portfolio-style design for creative and design roles.',
    category: 'Design / Creative',
    rating: 4.4,
    downloads: '5.2K',
    preview: 'N',
  },
];

export default function Templates() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('modern');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Templates</h1>
          <p className="text-muted-foreground">
            Choose from professionally designed, ATS-optimized resume templates.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Palette className="w-4 h-4 mr-1" />
            All Templates
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/create')}>
            <ArrowRight className="w-4 h-4 mr-1" />
            Use Selected
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {templates.map((tpl) => (
          <Card
            key={tpl.key}
            padding="none"
            className={cn(
              'group cursor-pointer border-border transition-all hover:shadow-lg hover:border-primary/50',
              selected === tpl.key
                ? 'border-primary shadow-sm ring-1 ring-primary'
                : ''
            )}
            onClick={() => setSelected(tpl.key)}
          >
            <div className="h-48 bg-muted rounded-t-lg flex items-center justify-center overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/10" />
              <div className="w-16 h-16 rounded-full bg-card flex items-center justify-center text-foreground text-2xl font-bold shadow-lg border-4 border-card">
                {tpl.preview}
              </div>
            </div>
            <div className="p-5">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-bold text-foreground">{tpl.name}</h3>
                <div className="flex items-center gap-1 text-warning">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className="text-xs">
                      {i <= Math.floor(tpl.rating) ? '★' : '☆'}
                    </span>
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">({tpl.rating})</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{tpl.desc}</p>
              <div className="flex items-center justify-between mb-4">
                <Badge variant="muted" className="text-xs">{tpl.category}</Badge>
                <span className="text-xs text-muted-foreground">{tpl.downloads} downloads</span>
              </div>
              <Button
                variant={selected === tpl.key ? 'primary' : 'outline'}
                size="sm"
                className="w-full"
                onClick={() => setSelected(tpl.key)}
              >
                {selected === tpl.key ? 'Selected' : 'Select Template'}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}