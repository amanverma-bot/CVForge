// ── Offline Scoring Engine ─────────────────────────────────────────────────
// Deterministic CV-vs-JD analysis without requiring an LLM API key.
// Produces bounded scores (0-100), skill extraction, keyword matching,
// section analysis, ATS compatibility, and improvement suggestions.

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was",
  "were", "will", "with", "you", "your", "we", "our", "us", "me", "my", "i",
  "am", "can", "could", "should", "would", "may", "might", "must", "shall",
]);

const COMMON_SKILLS = [
  "javascript", "typescript", "python", "java", "c++", "c#", "go", "rust",
  "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "sql", "nosql",
  "react", "angular", "vue", "svelte", "node.js", "nodejs", "express", "django",
  "flask", "spring", "laravel", "rails", "html", "css", "sass", "less", "tailwind",
  "bootstrap", "webpack", "vite", "babel", "git", "docker", "kubernetes", "aws",
  "azure", "gcp", "google cloud", "heroku", "vercel", "netlify", "linux", "unix",
  "windows", "macos", "jenkins", "github actions", "circleci", "travis",
  "mongodb", "postgresql", "mysql", "redis", "elasticsearch", "rabbitmq",
  "kafka", "graphql", "rest", "api", "microservices", "serverless", "ci/cd",
  "tdd", "agile", "scrum", "kanban", "jira", "confluence", "figma", "sketch",
  "adobe xd", "photoshop", "illustrator", "after effects", "premiere",
  "machine learning", "deep learning", "ai", "nlp", "computer vision",
  "tensorflow", "pytorch", "keras", "scikit-learn", "pandas", "numpy",
  "tableau", "power bi", "excel", "jira", "salesforce", "hubspot",
  "wordpress", "shopify", "woocommerce", "seo", "sem", "google analytics",
  "facebook ads", "google ads", "content marketing", "email marketing",
  "copywriting", "proofreading", "translation", "transcription",
  "project management", "product management", "business analysis",
  "data analysis", "data visualization", "statistics", "mathematics",
  "research", "writing", "editing", "public speaking", "presentation",
  "leadership", "teamwork", "communication", "problem solving",
  "critical thinking", "time management", "organizational skills",
];

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s.]/g, " ") // keep dots (for node.js, c# etc.)
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function extractSkills(text) {
  const low = normalize(text);
  const words = low.split(/\s+/);
  const found = [];
  for (const skill of COMMON_SKILLS) {
    const skillLow = skill.toLowerCase();
    // Multi-word skills: check as phrase with boundaries
    if (skillLow.includes(" ")) {
      const escaped = skillLow.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
      if (pattern.test(low)) {
        found.push(skill);
        continue;
      }
    }
    // Single-word skills: exact word match
    else if (words.includes(skillLow)) {
      found.push(skill);
      continue;
    }
    // CamelCase boundary match (e.g., "ReactJS" contains "react" + "JS")
    // Only split when suffix is all uppercase (e.g., "JS", "API", "UI")
    for (const word of text.split(/\s+/)) {
      // Strip trailing punctuation from the word
      const cleanWord = word.replace(/[^a-zA-Z]+$/, "");
      const wordLow = cleanWord.toLowerCase();
      if (
        wordLow.startsWith(skillLow) &&
        wordLow.length > skillLow.length
      ) {
        const suffix = cleanWord.slice(skillLow.length);
        // Suffix must be all uppercase letters (e.g., "JS" in "ReactJS")
        if (/^[A-Z]+$/.test(suffix)) {
          found.push(skill);
          break;
        }
      }
    }
  }
  return found;
}

function analyse(cvText, jdText, opts = {}) {
  const cvSkills = extractSkills(cvText);
  const jdSkills = extractSkills(jdText);
  const cvTokens = new Set(tokenize(cvText));
  const jdTokens = new Set(tokenize(jdText));

  // Keyword overlap
  const jdWords = tokenize(jdText);
  const matchedKeywords = jdWords.filter((w) => cvTokens.has(w));
  const missingKeywords = jdWords.filter((w) => !cvTokens.has(w));
  const keywordMatch = jdWords.length
    ? Math.round((matchedKeywords.length / jdWords.length) * 100)
    : 0;

  // Skill overlap
  const jdSkillsSet = new Set(jdSkills.map((s) => s.toLowerCase()));
  const matchedSkills = cvSkills.filter((s) => jdSkillsSet.has(s.toLowerCase()));
  const missingSkills = jdSkills.filter((s) => !matchedSkills.includes(s));
  const skillCoverage = jdSkills.length
    ? Math.round((matchedSkills.length / jdSkills.length) * 100)
    : 0;

  // Semantic similarity (token-based approximation)
  const cvTokenSet = new Set(tokenize(cvText));
  const jdTokenSet = new Set(tokenize(jdText));
  const intersection = new Set([...cvTokenSet].filter((t) => jdTokenSet.has(t)));
  const union = new Set([...cvTokenSet, ...jdTokenSet]);
  const semanticSimilarity = union.size
    ? Math.round((intersection.size / union.size) * 100)
    : 0;

  // Section analysis
  const sections = {
    contact: /(email|@|phone|\+?[\d\s-]{7,})/i.test(cvText),
    summary: /(summary|objective|profile|about)/i.test(cvText),
    experience: /(experience|employment|work history|internship)/i.test(cvText),
    education: /(education|degree|university|college|school)/i.test(cvText),
    skills: /(skills|technologies|tools|proficiencies)/i.test(cvText),
    projects: /(projects|portfolio|github)/i.test(cvText),
    certifications: /(certification|certificate|certified|license)/i.test(cvText),
  };

  const missingSections = Object.entries(sections)
    .filter(([, present]) => !present)
    .map(([name]) => name);

  const presentSections = Object.entries(sections)
    .filter(([, present]) => present)
    .map(([name]) => name);

  // ATS compatibility
  let atsScore = 100;
  if (!sections.contact) atsScore -= 20;
  if (!sections.summary) atsScore -= 10;
  if (!sections.experience) atsScore -= 20;
  if (!sections.education) atsScore -= 15;
  if (!sections.skills) atsScore -= 15;
  atsScore = Math.max(0, Math.min(100, atsScore));

  // Formatting checks
  const formatting = [];
  if (cvText.length < 200) formatting.push("CV is too short — add more detail");
  if (cvText.length > 10000) formatting.push("CV is very long — consider condensing");
  if (!/\d/.test(cvText)) formatting.push("No numbers/metrics found — add quantifiable achievements");
  if (!/[A-Z][a-z]+ [A-Z][a-z]+/.test(cvText)) formatting.push("No clear name format detected");
  if (!sections.contact) formatting.push("Missing contact information section");
  const formattingScore = Math.max(0, 100 - formatting.length * 15);

  // Overall score (weighted)
  const weights = {
    keyword: 0.30,
    semantic: 0.25,
    skills: 0.25,
    ats: 0.20,
  };
  const overall = Math.round(
    keywordMatch * weights.keyword +
      semanticSimilarity * weights.semantic +
      skillCoverage * weights.skills +
      atsScore * weights.ats
  );

  const verdict =
    overall >= 80
      ? "Strong Match"
      : overall >= 65
        ? "Good Match"
        : overall >= 45
          ? "Moderate Match"
          : "Starting Point";

  // Experience matching
  const cvExperienceMatch = cvText.match(/(\d+)\s*\+?\s*(year|yr)s?/i);
  const jdExperienceMatch = jdText.match(/(\d+)\s*\+?\s*(year|yr)s?/i);
  const cvYears = cvExperienceMatch ? parseInt(cvExperienceMatch[1], 10) : 0;
  const jdYears = jdExperienceMatch ? parseInt(jdExperienceMatch[1], 10) : 0;

  // Suggestions
  const suggestions = [];
  if (missingKeywords.length > 0) {
    suggestions.push(
      `Add these missing keywords: ${missingKeywords.slice(0, 8).join(", ")}`
    );
  }
  if (missingSkills.length > 0) {
    suggestions.push(
      `Consider adding these skills: ${missingSkills.slice(0, 6).join(", ")}`
    );
  }
  if (missingSections.length > 0) {
    suggestions.push(
      `Add missing sections: ${missingSections.join(", ")}`
    );
  }
  if (formatting.length > 0) {
    suggestions.push(...formatting.slice(0, 3));
  }
  if (suggestions.length === 0) {
    suggestions.push("Your CV looks well-optimized for this role!");
  }

  // Quick fixes (action verb improvements)
  const weakOpeners = [
    "responsible for", "responsible of", "tasked with", "duties included",
    "worked on", "helped with", "assisted with", "was responsible for",
  ];
  const quickFixes = [];
  const sentences = cvText.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase().trim();
    for (const weak of weakOpeners) {
      if (lower.startsWith(weak)) {
        const rest = sentence.slice(weak.length).trim();
        quickFixes.push({
          original: sentence.trim(),
          improved: `Developed and delivered ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`,
          reasons: ["Use strong action verbs", "Replace passive language"],
        });
        break;
      }
    }
    if (quickFixes.length >= 5) break;
  }

  // JD breakdown
  const jdRequirements = {
    required: {
      skills: jdSkills.filter((s) => !s.toLowerCase().includes("preferred") && !s.toLowerCase().includes("bonus")),
      preferred: [],
      technologies: jdSkills.filter(
        (s) =>
          ["javascript", "python", "java", "react", "node.js", "sql", "aws", "docker"].includes(
            s.toLowerCase()
          )
      ),
      responsibilities: [],
      qualifications: [],
      experience: jdYears || null,
    },
    missing: missingSkills,
    matching: matchedSkills,
    coverage: skillCoverage,
  };

  return {
    scores: {
      overall,
      keyword_match: keywordMatch,
      semantic_similarity: semanticSimilarity,
      skill_coverage: skillCoverage,
      verdict,
    },
    skills: {
      cv_skills: cvSkills,
      jd_skills: jdSkills,
      matched: matchedSkills,
      missing: missingSkills,
      gap: {
        matched: matchedSkills,
        missing: missingSkills,
        coverage: skillCoverage,
      },
    },
    comparison: {
      present: matchedKeywords,
      missing: missingKeywords,
      jd_skills: jdSkills,
    },
    sections,
    missing_sections: missingSections,
    present_sections: presentSections,
    ats_compatibility: atsScore,
    ats_checks: [
      { name: "Contact section", passed: sections.contact },
      { name: "Summary section", passed: sections.summary },
      { name: "Experience section", passed: sections.experience },
      { name: "Education section", passed: sections.education },
      { name: "Skills section", passed: sections.skills },
      { name: "Projects section", passed: sections.projects },
      { name: "Certifications section", passed: sections.certifications },
    ],
    formattingScore,
    formatting,
    experience: {
      cv: cvYears,
      required: jdYears,
      status:
        jdYears && cvYears >= jdYears
          ? "Meets requirement"
          : jdYears
            ? `Gap: ${jdYears - cvYears} year(s) short`
            : "Not specified",
    },
    detailed: {
      ats_compatibility: atsScore,
      formattingScore,
      missing_sections: missingSections,
      suggestions,
      keywords: {
        score: keywordMatch,
        top: matchedKeywords.slice(0, 10).map((k) => [k, 1]),
        matched: matchedKeywords,
        missing: missingKeywords,
      },
    },
    whyMatch: matchedSkills.slice(0, 5).map((s) => `You have ${s} experience`),
    recruiter: {
      skim: `CV shows ${matchedSkills.length}/${jdSkills.length} required skills matched.`,
      strengths: matchedSkills.slice(0, 3),
      concerns: missingSkills.slice(0, 3),
    },
    meta: {
      fresher: opts.fresher || false,
    },
    structured: {
      name: "",
      education: [],
      skills: cvSkills,
      experience: [],
      projects: [],
    },
  };
}

function detailedFeedback(cvText, jdText, analysis) {
  return {
    ats_compatibility: analysis.ats_compatibility,
    formattingScore: analysis.formattingScore,
    missing_sections: analysis.missing_sections,
    suggestions: analysis.suggestions,
    keywords: analysis.comparison,
  };
}

function quickFixes(cvText) {
  const weakOpeners = [
    "responsible for", "tasked with", "duties included", "worked on",
    "helped with", "assisted with", "was responsible for",
  ];
  const fixes = [];
  const sentences = cvText.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  for (const sentence of sentences) {
    const lower = sentence.toLowerCase().trim();
    for (const weak of weakOpeners) {
      if (lower.startsWith(weak)) {
        const rest = sentence.slice(weak.length).trim();
        fixes.push({
          original: sentence.trim(),
          improved: `Developed and delivered ${rest.charAt(0).toLowerCase()}${rest.slice(1)}`,
          reasons: ["Use strong action verbs", "Replace passive language"],
        });
        break;
      }
    }
    if (fixes.length >= 5) break;
  }
  return fixes;
}

function grammarCheck(text) {
  const issues = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (/ {2}/g.test(line)) {
      issues.push({ line: i + 1, issue: "Double space", fix: "Replace with single space" });
    }
    if (/\b(the the|a a|and and|of of)\b/i.test(line)) {
      issues.push({ line: i + 1, issue: "Repeated word", fix: "Remove duplicate" });
    }
    if (/recieve/i.test(line)) {
      issues.push({ line: i + 1, issue: "Typo: 'recieve'", fix: "Use 'receive'" });
    }
    if (/seperate/i.test(line)) {
      issues.push({ line: i + 1, issue: "Typo: 'seperate'", fix: "Use 'separate'" });
    }
  });
  return issues;
}

function buildCV(profile) {
  const name = (profile.name || "YOUR NAME").toUpperCase();
  const lines = [name];
  if (profile.email || profile.phone || profile.location) {
    lines.push([profile.email, profile.phone, profile.location].filter(Boolean).join(" • "));
  }
  lines.push("", "SUMMARY", profile.summary || "Motivated professional with a track record of delivering results.", "");
  lines.push("EDUCATION", profile.education || "Degree • Institution • Year", "");
  lines.push("EXPERIENCE", profile.experience || "Role • Company • Dates", "");
  lines.push("PROJECTS", profile.projects || "Project • Tech • Description", "");
  lines.push("SKILLS", profile.skills || "Skill 1, Skill 2, Skill 3", "");
  if (profile.certs) lines.push("CERTIFICATIONS", profile.certs, "");
  return lines.join("\n");
}

function buildCVFromJD(profile, jd) {
  const jdSkills = extractSkills(jd);
  const matchedSkills = jdSkills.filter((s) =>
    (profile.skills || "").toLowerCase().includes(s.toLowerCase())
  );
  const cvText = buildCV({
    ...profile,
    skills: [...matchedSkills, ...(profile.skills ? profile.skills.split(",") : [])].join(", "),
  });
  return { cv_text: cvText, matched_skills: matchedSkills, missing_skills: jdSkills.filter((s) => !matchedSkills.includes(s)) };
}

function analyseJDRequirements(profile, jd, opts = {}) {
  const jdSkills = extractSkills(jd);
  const profileSkills = extractSkills(profile.skills || "");
  const profileSkillsSet = new Set(profileSkills.map((s) => s.toLowerCase()));
  const matching = jdSkills.filter((s) => profileSkillsSet.has(s.toLowerCase()));
  const missing = jdSkills.filter((s) => !profileSkillsSet.has(s.toLowerCase()));
  const required = {
    skills: jdSkills,
    preferred: [],
    technologies: jdSkills.filter((s) =>
      ["javascript", "python", "java", "react", "node.js", "sql", "aws", "docker"].includes(s.toLowerCase())
    ),
    responsibilities: [],
    qualifications: [],
    experience: null,
  };

  // Parse "Preferred:" section from JD
  const preferredMatch = jd.match(/[Pp]referred:?\s*([^\n]*(?:\n[^\n]*)*)/i);
  if (preferredMatch) {
    const preferredText = preferredMatch[1];
    const preferredSkills = extractSkills(preferredText);
    required.preferred = preferredSkills;
  }

  const coverage = jdSkills.length ? Math.round((matching.length / jdSkills.length) * 100) : 0;
  const sectionsToImprove = missing.length > 0 ? ["Skills section", "Experience bullets"] : [];
  const areas = missing.length > 0 ? [`Learn ${missing.slice(0, 3).join(", ")}`] : [];
  const strengths = matching.length > 0 ? [`Strong match on ${matching.slice(0, 3).join(", ")}`] : [];
  return {
    required,
    missing,
    matching,
    preferred: required.preferred,
    technologies: required.technologies,
    responsibilities: [],
    qualifications: [],
    experience: null,
    recommendedKeywords: missing.slice(0, 10),
    coverage,
    sectionsToImprove,
    strengths,
    areas,
    role: "",
  };
}

const DEMO_CV = `Aman Verma
aman@mail.com
B.Tech CSE, Pune University 2021-2025
EXPERIENCE
Software Intern - Built REST API with Flask for 500 users
PROJECTS
Ecom Clone - React, MongoDB
SKILLS
Java, Python, React, MongoDB`;

const DEMO_JD = `Hiring: Java, React, AWS, Docker`;

module.exports = {
  analyse,
  analyze: analyse,
  detailedFeedback,
  quickFixes,
  grammarCheck,
  buildCV,
  buildCVFromJD,
  analyseJDRequirements,
  analyzeJDRequirements: analyseJDRequirements,
  extractSkills,
  DEMO_CV,
  DEMO_JD,
};