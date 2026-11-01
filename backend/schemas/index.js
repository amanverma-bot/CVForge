// Zod schemas — the single source of truth for what the API accepts.
// All strings are sanitized (control chars stripped, trimmed) and length-capped.
// Enum-style fields are whitelisted so no unvalidated value ever reaches the DB.
const { z } = require("zod");

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const clean = (max) =>
  z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, "").trim())
    .refine((s) => s.length <= max, { message: `Must be at most ${max} characters` });

const required = (max) => clean(max).refine((s) => s.length > 0, { message: "Required" });

const optional = (max) =>
  z.preprocess((v) => (v === undefined || v === null ? undefined : String(v)), clean(max).optional());

const toBool = (v) => (v === undefined || v === null || v === "" ? false : ["1", "true", "yes", "on"].includes(String(v).toLowerCase()));
const fresherFlag = z.preprocess(toBool, z.boolean()).optional();

const optionalUrl = z.preprocess(
  (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
  z.string().url("Must be a valid URL").max(500).optional()
);

const TEMPLATES = ["modern", "minimal", "professional", "tech", "fresher", "classic", "neon", "brutal"];
const templateEnum = z.enum(TEMPLATES).catch("modern");

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "Invalid id");

const profileFields = {
  name: optional(120),
  email: optional(120),
  phone: optional(40),
  location: optional(120),
  linkedin: optional(200),
  github: optional(200),
  summary: optional(2000),
  skills: optional(3000),
  jd: optional(20000),
  education: optional(5000),
  experience: optional(8000),
  projects: optional(8000),
  certs: optional(1000),
  achievements: optional(3000),
  template: templateEnum.optional(),
};

const profileObject = z.object(profileFields).strip();

// Accepts either a JSON string (multipart form field) or a real object.
const profileInput = z.preprocess(
  (v) => {
    if (typeof v === "string") {
      if (!v.trim()) return {};
      try {
        const parsed = JSON.parse(v);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
    return {};
  },
  profileObject.default({})
);

const register = z.object({
  name: z
    .string()
    .transform((s) => s.replace(CONTROL_CHARS, "").trim())
    .refine((s) => /^[a-zA-Z0-9_-]{3,32}$/.test(s), { message: "Name must be 3-32 chars: letters, numbers, _ or -" }),
  email: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v).trim()),
    z.string().email("Invalid email").max(120).optional()
  ),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  captcha_token: z.string().min(8).max(200),
  captcha_answer: z.preprocess((v) => Number(v), z.number().int().min(-1000).max(1000)),
});

const login = z.object({
  name: z.string().transform((s) => s.replace(CONTROL_CHARS, "").trim()).pipe(z.string().min(1).max(120)),
  password: z.string().min(1).max(128),
});

const analyze = z.object({
  cv_text: optional(50000),
  jd_text: optional(50000),
  jd_url: optionalUrl,
  mode: z.enum(["fresher", "default"]).catch("default").optional(),
  fresher: fresherFlag,
});

const quickfix = z.object({ cv_text: required(30000) });
const grammar = z.object({ text: required(30000) });

const build = z.object(profileFields).strip();

const jdBreakdown = z.object({
  profile: profileInput,
  jd_text: optional(20000),
  jd_url: optionalUrl,
  fresher: fresherFlag,
});

const jdCv = z.object({
  profile: profileInput,
  jd_text: optional(20000),
  jd_url: optionalUrl,
});

const cvJdPair = z.object({
  cv_text: required(50000),
  jd_text: required(50000),
});

const coverLetter = cvJdPair.extend({ name: optional(80) });

const match = z.object({
  cv_text: required(50000),
  jobs: z
    .array(
      z.union([
        z.string().transform((s) => s.replace(CONTROL_CHARS, "").slice(0, 20000)),
        z
          .object({
            title: optional(200),
            text: optional(20000),
            jd: optional(20000),
          })
          .strip(),
      ])
    )
    .min(1, "jobs[] required")
    .max(10, "Max 10 jobs per request"),
});

const practice = z.object({
  cv_text: required(20000),
  jd_text: required(20000),
});

const evaluate = z.object({
  questions: z
    .array(
      z.union([
        z.string().max(2000),
        z
          .object({
            q: z.string().max(2000),
            type: optional(50),
            tip: optional(200),
            keywords: z.array(z.string().max(60)).max(20).optional(),
          })
          .strip(),
      ])
    )
    .min(1)
    .max(10),
  answers: z.array(z.string().max(5000)).min(1).max(10),
});

const pdf = z.object({
  title: z.string().max(120).default("Resume"),
  text: z.string().max(30000).default(""),
});

const createCV = z.object({
  ...profileFields,
  role: optional(120),
  generatedText: optional(20000),
});

const createApplication = z.object({
  title: required(120),
  company: optional(120),
  status: z.enum(["wishlist", "applied", "screening", "interview", "offer", "rejected"]).optional(),
  notes: optional(2000),
  remindAt: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : v),
    z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, "Invalid date"), z.null()]).optional()
  ),
});

const updateApplication = createApplication.partial();

const createHistory = z.object({
  cv_text: optional(50000),
  jd_text: optional(50000),
  cvId: z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : String(v)),
    id.optional()
  ),
});

const idParam = z.object({ id });
const tokenParam = z.object({ token: z.string().regex(/^[a-f0-9]{8,64}$/, "Invalid share token") });

module.exports = {
  register,
  login,
  analyze,
  quickfix,
  grammar,
  build,
  jdBreakdown,
  jdCv,
  cvJdPair,
  coverLetter,
  match,
  practice,
  evaluate,
  pdf,
  createCV,
  createApplication,
  updateApplication,
  createHistory,
  idParam,
  tokenParam,
  TEMPLATES,
};
