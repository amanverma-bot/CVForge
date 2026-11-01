// Unit tests for the offline scoring engine (lib/scoring.js) — the AI fallback core.
import { describe, it, expect } from "vitest";
import scoring from "../lib/scoring.js";

describe("scoring.extractSkills", () => {
  it("detects canonical skills and aliases", () => {
    const skills = scoring.extractSkills("Worked with ReactJS, Node.js, PostgreSQL and Docker");
    expect(skills).toContain("react");
    expect(skills).toContain("node.js");
    expect(skills).toContain("postgresql");
    expect(skills).toContain("docker");
  });

  it("does not false-positive on substrings (java vs javascript)", () => {
    const skills = scoring.extractSkills("I write JavaScript daily");
    expect(skills).toContain("javascript");
    expect(skills).not.toContain("java");
  });
});

describe("scoring.analyse", () => {
  it("returns a bounded overall score with all sections", () => {
    const res = scoring.analyse(scoring.DEMO_CV, scoring.DEMO_JD);
    expect(res.scores.overall).toBeGreaterThanOrEqual(0);
    expect(res.scores.overall).toBeLessThanOrEqual(100);
    expect(res.skills.cv_skills.length).toBeGreaterThan(0);
    expect(res.skills.jd_skills.length).toBeGreaterThan(0);
    expect(Array.isArray(res.ats_checks)).toBe(true);
  });

  it("scores a perfect self-match at least as high as a mismatch", () => {
    const match = scoring.analyse(scoring.DEMO_CV, scoring.DEMO_CV);
    const mismatch = scoring.analyse(scoring.DEMO_CV, "Senior C++ systems engineer with Rust and embedded experience");
    expect(match.scores.overall).toBeGreaterThanOrEqual(mismatch.scores.overall);
  });
});

describe("scoring.quickFixes", () => {
  it("rewrites weak openers with strong verbs and flags missing metrics", () => {
    const pairs = scoring.quickFixes("responsible for building the payment gateway");
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].improved.toLowerCase()).not.toContain("responsible for");
    const reasons = pairs[0].reasons.join(" ");
    expect(reasons).toMatch(/verb|metric/i);
  });

  it("never invents metrics in the improved text", () => {
    const pairs = scoring.quickFixes("managed the team schedule");
    for (const p of pairs) {
      const invented = /\d+\s*%/.test(p.original) === false && /\d+\s*%/.test(p.improved);
      expect(invented).toBe(false);
    }
  });
});

describe("scoring.grammarCheck", () => {
  it("catches double spaces, typos and repeated words", () => {
    const issues = scoring.grammarCheck("I recieve  the the report");
    const text = issues.map((i) => i.issue.toLowerCase()).join(" | ");
    expect(text).toMatch(/double space/);
    expect(text).toMatch(/typo/);
    expect(text).toMatch(/repeated word/);
  });
});

describe("scoring.buildCV", () => {
  it("uppercases the name and includes standard ATS headings", () => {
    const cv = scoring.buildCV({ name: "Aman Verma", skills: "Python, React", experience: "intern at acme", projects: "ecom clone" });
    expect(cv.split("\n")[0]).toBe("AMAN VERMA");
    for (const heading of ["SUMMARY", "EDUCATION", "EXPERIENCE", "PROJECTS", "SKILLS"]) {
      expect(cv).toContain(heading);
    }
  });
});

describe("scoring.analyzeJDRequirements", () => {
  it("separates required vs preferred skills without inventing matches", () => {
    const out = scoring.analyzeJDRequirements(
      { skills: "Python, Flask", experience: "" },
      "Requirements:\n- Python, Flask, Docker\n- B.Tech degree\nPreferred: Machine Learning, AWS"
    );
    expect(out.required.skills).toContain("python");
    expect(out.required.skills).toContain("docker");
    expect(out.required.preferred).toContain("machine learning");
    expect(out.missing).toContain("docker");
    expect(out.matching).toContain("python");
  });
});
