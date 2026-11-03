# Business Requirements Document — CodeAI Adaptive Learning Engine (MVP)

| Field | Value |
|-------|-------|
| **Document type** | Business Requirements Document (BRD) |
| **Status** | Draft for review |
| **Version** | 0.2 |
| **Date** | November 3, 2026 |
| **Author / owner** | Product owner (CodeAI, non-profit) |
| **Reviewers** | Teaching & Learning, Engineering, Data, AWS Imagine Grant sponsor |
| **Source material** | CodeAI Vision Document, Technical Environment Document, CSTA-aligned concept/stage curriculum (AI-Generated Design unit, illustrative), stakeholder decisions |
| **v0.2 changes** | Adopted the instructor-set CSTA concept + Stage 0–3 model; diagnostic-driven placement; 3-month path to Stage 2 with Stage 3 optional; aim broadened to coding + using AI for coding; two new tenets (standards-are-fixed, tutor-not-examiner); thin teacher dashboard added; pathway = AI routes authored content (reading A). Owner-made calls flagged in Section 16. |

---

## 1. Executive summary

Students use AI everywhere and learn about it almost nowhere. 84% of high-school students already use AI, and only 16% of educators say their students learn about it in school. Inside every classroom, teachers face struggling, on-pace, and advanced students at once, and report that serving all three simultaneously is not possible. Differentiation has been the number-one teacher pain point on CodeAI for six consecutive years.

This document specifies the business requirements for an **adaptive learning engine**: a layer that places each student with a diagnostic, builds a personalized roadmap toward instructor-set standards, evaluates the work they submit, and routes them to the next step in real time, without teacher intervention.

The product the engine serves is an **instructor-configured path**. For a given class the instructor sets a concept set and its rubrics (CSTA-aligned, e.g., the AI-Generated Design unit's four concepts), a path duration (≈3 months), and a bar: **every student reaches at least Stage 2 (Meeting) on every concept; Stage 3 (Exceeding) is optional**. A diagnostic promotes each student from Stage 0 to their true entry stage per concept, and the engine personalizes the route from there.

The **MVP proves the mechanism**, not a full term. On a bounded slice of one instructor-configured unit, it demonstrates: a diagnostic placing a student per concept, a roadmap that covers every required concept, the validate→route loop advancing a student across real stage transitions, a safe fallback, and content filtering — with validation agreement against human raters as the launch gate. Proving this gives CodeAI a replicable template for the catalog.

---

## 2. Problem statement

Three problems compound:

1. **An AI-literacy gap at scale.** 84% of high-school students use AI; 16% learn about it in school. 75% believe AI fluency will matter more than other subjects, and 63% tie it to readiness for life after school.
2. **Differentiation is unsolved and teacher-bound.** Teachers cannot personalize for a wide capability range in real time. Reactive, teacher-facing tools do not reach the problem, which lives inside the student's learning experience.
3. **Access and equity gaps.** Only 60% of public high schools offer a foundational CS course and 6.4% of students enroll annually; 3.2 million children are homeschooled. 45% of CodeAI students come from high-needs schools and 50% from underrepresented groups — the learners least able to absorb a differentiation shortfall.

Demand for help is proven: 39,000+ teachers have used CodeAI's AI Teaching Assistant to answer 67,000 planning and differentiation questions. The missing piece is a student-facing adaptive experience, which does not yet exist.

---

## 3. Aim and framing

**The aim for grades 9–12 is twofold: learn to code and learn to use AI for coding, against the CSTA-aligned standards the instructor presets.** Coding competency is a first-class outcome; the ability to direct, evaluate, and correct AI is the second, inseparable outcome. (A simpler "how to use AI" segment for grade 6 is a future audience that informs design but is out of MVP scope.)

Two distinct notions of "adapt" stay separate throughout:
- **The engine adapts to the student** — the mechanism; it is concept-agnostic.
- **The content teaches the student to direct AI and to build** — the learning aim.

Consequence for requirements: mastery is defined as demonstrated competency against a concept's Stage descriptors, never as "the program compiles." A student at Stage 2 on "AI Collaboration" names a goal, a constraint, and an edge case, compares AI output to intent, and revises with a targeted change — that is what the engine scores.

---

## 4. Learning model and mastery definition

This model is set by the instructor/curriculum (CSTA-aligned); the engine operates over it generically.

- **Concept.** A learning objective mapped to a CSTA standard, with a four-stage rubric. A unit has several (the illustrative unit has four).
- **Stage (mastery scale).** Per concept, a student is at **Stage 0 (Missing) → 1 (Beginning) → 2 (Meeting) → 3 (Exceeding)**, each with concrete behavioral descriptors. The descriptors are the validation rubric.
- **Mastery signal is a vector**, one stage per concept, not a single scalar.
- **Learning trajectory.** Each stage transition is served by specific authored levels (e.g., Concept 3 Stage 1→2 = L6, L8, L9, L11). The engine routes along these.
- **Diagnostic placement.** Every student is assumed Stage 0 by default; the diagnostic promotes them to their true entry stage per concept.
- **The bar.** Reach **Stage 2 on every required concept** within the path. **Stage 3 is optional depth.**
- **Backstage for students.** The stage vector, diagnostic placement, and validation scores are visible to the teacher and used by the router; they are never surfaced to the student. The student-facing experience stays formative and open-ended (coaching and progress, not scores).
- **The engine's job, stated exactly:** move each student from their diagnostic-placed entry stage to Stage 2 on every required concept within the instructor-set duration, routing through authored levels, offering Stage 3 only as optional depth. It may reorder and personalize; it may never drop a required concept or let a student finish below Stage 2 on one.

**Product target vs MVP proof.** The instructor-configured path runs ≈3 months across all concepts. The hackathon MVP proves the *mechanism* on a compressed, bounded slice and simulates longitudinal progress. The MVP does not run the full term and must not be presented as a longitudinal result.

---

## 5. Tenets

Ordered. When requirements conflict, earlier tenets win.

1. **Student safety and privacy are non-negotiable.** Filtering runs on both student input and model output. No student PII in the hackathon environment. Student data is never shared for commercial purposes.
2. **The instructor's standards are the fixed spine.** The AI personalizes the route to them; it may never drop a required concept or let a student finish below Stage 2 on one.
3. **We tutor; we do not examine.** Exams and official grades belong to the teacher. The mastery signal is formative and never becomes the grade.
4. **Mastery stays backstage for students.** Stage, score, placement, rubric evaluation, and peer comparison are tracking signals for the teacher and the router only; the student never sees them, and adaptive routes are never labeled or styled by difficulty tier. The experience stays open-ended so no student is demotivated by a label.
5. **Measure demonstrated competency against Stage descriptors, not code execution alone.**
6. **Keep students together.** Everyone reaches Stage 2 on every required concept; Stage 3 is optional depth, not a race ahead of the class.
7. **Human-authored, human-approved content reaches students.** The AI places, routes, and coaches; it does not put unreviewed generated curriculum in front of a student in the MVP.
8. **Degrade safely, and prove the mechanism on a bounded slice before scaling.**

---

## 6. Customers and stakeholders

| Customer | Primary need | How the MVP serves it |
|----------|--------------|-----------------------|
| **Students, grades 9–12** (classroom and homeschool) | Instruction that meets their starting point regardless of class size or teacher bandwidth | Diagnostic placement + a personalized roadmap to Stage 2 on every concept |
| **Teachers** | Relief from the differentiation burden with no new tools; confidence that standards are met | Adaptivity runs without intervention; a read-only view shows attainment vs the Stage 2 bar |
| **Administrators / districts** | Scalable, standards-aligned curriculum reaching every student without per-school customization | A replicable instructor-configured template |
| **Teaching & Learning** | Author and approve adaptive content without proportional authoring effort | Pre-authored levels + stage rubrics; depth-based variation bounds authoring |

---

## 7. Goals and success metrics

### 7.1 Business goals (post-MVP horizon)
- Deliver standards-aligned coding + AI-for-coding instruction that brings every student in a mixed 9–12 class to the instructor's bar within the term.
- Reduce the teacher differentiation burden to where one teacher runs a mixed cohort to standard without manual per-student adjustment.
- Establish a replicable adaptive template across the catalog, culminating in student-built projects.

### 7.2 MVP success metrics (measurable, hackathon horizon)

| # | Metric | Target | Measurement |
|---|--------|--------|-------------|
| M1 | Diagnostic placement | The diagnostic produces a per-concept entry stage for every required concept | Placement output |
| M2 | Roadmap coverage (must-learn guarantee) | The generated roadmap includes a path to Stage 2 for **every** required concept the student is below Stage 2 on; none can be skipped | Roadmap inspection |
| M3 | Adaptive advancement | A student advances a concept across **≥2 stage transitions via ≥3 routed levels**, the route chosen from the mastery signal | Session trace |
| M4 | Differentiated paths | Two students with different diagnostic placements receive **visibly different roadmaps/routes** to the same bar | Side-by-side traces |
| M5 | Validation agreement | Mastery-stage signal agrees with human raters on a benchmark set at **≥80% exact-stage (or ≥90% within ±1 stage)** — threshold ratified by T&L | Benchmark comparison |
| M6 | Safe fallback | Induced validation/routing failure drops the student to a working non-adaptive path with **0 broken sessions** | Fault-injection test |
| M7 | Safety coverage | Filtering fires on **100%** of student inputs and model outputs before delivery | Filter audit log |

*M5 is the primary launch gate and must be ratified against a real human-rated benchmark set. The ≈3-month path duration is a product target, not an MVP-measured metric.*

---

## 8. Scope

### 8.1 In scope (MVP)
- **Diagnostic placement** that sets a per-concept entry stage (promotes from Stage 0).
- **Roadmap generation** across the instructor's full concept set, guaranteeing coverage to Stage 2 on every required concept.
- A **validation service** scoring each submission to a per-concept stage against the published descriptors (Bedrock rubric eval + deterministic probes).
- A **routing service** (deterministic rules over the stage vector) that advances a student along authored trajectories toward Stage 2, offering Stage 3 optionally.
- **Pre-authored, pre-approved levels** mapped to stage transitions.
- An **"AI assistant on failure"** support path and **coaching hints** on the authored route.
- A **student-built project** culmination (the unit's final level).
- A **thin, read-only teacher view**: per-concept stage per student vs the Stage 2 bar, plus diagnostic results.
- **Content filtering** on input and output; a working **non-adaptive fallback** path.

### 8.2 Out of scope (MVP), with reason
| Item | Reason |
|------|--------|
| Running the literal ≈3-month path | The MVP proves the mechanism on a compressed slice |
| Durable multi-lesson/multi-term student profile storage | Hackathon seeds/simulates longitudinal progress; a persistent profile adds data-retention/privacy decisions |
| Live content generation in the student path | Tenet 6; sandbox-only stretch, gated, never shown to the cohort |
| Full teacher analytics (class-wide dashboards, skill drill-downs) | The thin attainment view is enough to close the standards loop |
| Standards tagged to individual tasks for external reporting | Builds on the loop once it works |
| Catalog-wide scaling; per-student teacher edits to the roadmap | Follow a proven template |

---

## 9. Business requirements

Prioritized (MoSCoW). Each traces to a metric or tenet.

### 9.1 Functional

| ID | Requirement | Priority | Traces to |
|----|-------------|----------|-----------|
| FR1 | The system shall run a diagnostic that promotes a student from Stage 0 to a true entry stage for each required concept. | Must | M1 |
| FR2 | The system shall generate a personalized roadmap across the instructor's full concept set that guarantees a path to Stage 2 on every required concept the student has not yet met. | Must | M2 |
| FR3 | The system shall accept a student submission and score it to a per-concept stage (0–3) against the published Stage descriptors, using rubric eval plus deterministic probes. | Must | M5 |
| FR4 | The mastery signal shall reflect demonstrated competency against the Stage descriptors, not code execution alone. | Must | M5 |
| FR5 | The routing service shall select the next authored level via deterministic rules over the stage vector, advancing the student toward Stage 2 and never dropping a required concept or finishing below Stage 2 on one. | Must | M3, M4 |
| FR6 | The system shall offer Stage 3 (Exceeding) content as optional depth, without advancing a student past the class into unrequired future content. | Should | M4 |
| FR7 | All student-facing levels shall be pre-authored and T&L-approved; the AI places, routes, and coaches but does not deliver unreviewed generated curriculum. | Must | Tenet 7 |
| FR8 | On a failed attempt, the system shall provide an AI assistant / coaching support path scoped to the current concept and stage. | Should | M3 |
| FR9 | The path shall culminate in a student-built project (e.g., build/debug a tool with AI). | Should | — |
| FR10 | On any validation or routing failure, the system shall deliver a working non-adaptive path and flag persistent failure for the teacher. | Must | M6 |
| FR11 | The system shall apply content filtering to student input and model output before delivery. | Must | M7 |
| FR12 | The system shall present a read-only **teacher-only** view of each student's per-concept stage vs the Stage 2 bar, including diagnostic results. Stage, score, and placement are never surfaced to students. | Should (P1) | — |
| FR13 | The student-facing experience shall never expose stage, score, placement, rubric evaluation, or peer comparison. It shall show only the current task, the student's work/artifact, formative coaching, and non-evaluative progress. Adaptive routes shall not be labeled or styled by difficulty tier. | Must | Tenet 4 |
| FR14 | The system may generate candidate level content in a sandbox, gated by safety filtering and a curriculum-quality check, with no path to the live cohort in the MVP. | Could (stretch) | — |

### 9.2 Non-functional

| ID | Requirement | Priority |
|----|-------------|----------|
| NFR1 | **Safety:** input/output filtering shall be fail-closed; unfilterable content is withheld. | Must |
| NFR2 | **Privacy:** no student PII in the hackathon environment; no student data shared commercially. | Must |
| NFR3 | **Model abstraction:** Amazon Bedrock sits behind an abstraction so models swap without reworking validation or routing. | Must |
| NFR4 | **Auditability:** routing decisions shall be explainable to a teacher (deterministic rules, not an opaque model/agent). | Must |
| NFR5 | **Cost/latency:** heavy model work stays off the student write path where possible (content pre-authored; validations cached); bounded during Hour-of-AI peaks. | Must |
| NFR6 | **Reliability:** fallback models and a non-adaptive path against third-party model availability or pricing changes. | Should |
| NFR7 | **Stack compatibility:** prefer CodeAI production versions (Ruby 3.2 / Rails 7.1, React 18 / MUI 7, Aurora SQL, AWS SDK for Ruby); Python permitted. Stack fidelity shall not consume build time at the expense of routing and adaptive concepts. | Should |
| NFR8 | **Observability:** evaluation runs shall be inspectable (e.g., Langfuse) to support tuning and the LLM-as-judge stretch. | Could |

---

## 10. Solution overview

**Adaptivity approach:** human-authored curriculum with **AI placing and routing** (diagnostic → roadmap → next-step selection), plus generated **coaching/hints** on the authored route. The AI generates the *route*, not the student-facing *content*. Full content generation (Approach 3) is a gated sandbox stretch only. This satisfies Tenet 6, keeps routing auditable (NFR4), and keeps expensive model work off the student path (NFR5).

**The core loop:** `diagnostic → roadmap across concept set → [ submit → validate to per-concept stage → route toward Stage 2 → deliver authored level ] → project`, with a fallback branch on any failure. Bedrock is used only for the validation rubric eval and coaching; routing is rules over the stage vector.

**Convergence:** all students reach Stage 2 on every required concept (the shared bar); fast finishers take Stage 3 depth and the project further. Depth, not pace, absorbs the 9–12 spread.

---

## 11. User journeys

### Journey 1 — Student runs the adaptive path (core)
1. Student signs in; the diagnostic places them per concept (promoting from Stage 0 where they already demonstrate competence).
2. The engine builds a roadmap covering every required concept they are below Stage 2 on.
3. The student submits work; validation scores it to a per-concept stage.
4. Routing selects the next authored level toward Stage 2; on a failed attempt the AI assistant supports them.
5. The student advances concept by concept, culminating in a student-built project; fast finishers take Stage 3 depth.

**Outcome:** a path that adapts to what the student demonstrates, converging on the instructor's bar without teacher intervention. **MVP limitation:** a compressed, simulated timeline on a bounded slice, not a full term.

### Journey 2 — Teacher checks attainment
The teacher opens a read-only view showing each student's per-concept stage against the Stage 2 bar, plus diagnostic placement, and sees who needs attention. The teacher still owns exams and grades.

### Journey 3 — Failure and fallback
On validation or routing failure, the student is placed on a working non-adaptive path and continues toward the standard; persistent failure is flagged for the teacher.

---

## 12. Assumptions

- The instructor sets the concept set, rubrics/standards (CSTA-aligned), path duration (≈3 months), and the Stage 2 bar with Stage 3 optional.
- A diagnostic can place a student per concept across the full concept set within a reasonable length.
- CodeAI's existing Bedrock rubric-eval capability transfers to scoring submissions against Stage descriptors.
- T&L can supply a human-rated benchmark set and sign off on authored levels before launch.
- For the hackathon, longitudinal cross-lesson progress is seeded/simulated rather than durably stored.

---

## 13. Dependencies

| Dependency | Owner | Needed by |
|------------|-------|-----------|
| Concept set + Stage rubrics + trajectory-to-level mapping for the chosen unit | T&L / instructor | Before build |
| Human-rated benchmark set (student submissions scored by stage) for M5 | T&L / Data | Before launch gate |
| Pre-authored, approved levels covering the demonstrated trajectories | T&L | Before end-to-end run |
| Amazon Bedrock access and model credits | Engineering / AWS sponsor | Build start |
| Content-filtering capability on input and output | Engineering | Before any student-facing run |

---

## 14. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Validation unreliable, so the stage signal is wrong | Medium | High | Score against concrete Stage descriptors; benchmark vs human raters; make M5 a hard launch gate |
| Diagnostic across all concepts is too long or inaccurate | Medium | Medium | Keep it short per concept; allow early levels to correct placement; treat placement as revisable |
| Scale, cost, latency during Hour-of-AI peaks | High | High | Pre-author content, route among it, tier models, rate-limit at the edge, cache validations |
| Teams over-invest in stack fidelity or UI, starving routing work | Medium | Medium | NFR7 permits moving fast off-stack; cap UI at a thin shell |
| Mastery collapses into "the code runs" | Medium | High | FR4 + Tenet 4; score against Stage descriptors |
| Concepts with weak/ambiguous rubric evidence hurt validation | Medium | Medium | Prefer concepts with clean standard match and mid-path evidence for the benchmark; flag gaps rather than force a match |
| Third-party model availability, pricing, deprecation | Medium | Medium | Model abstraction (NFR3), fallback models, non-adaptive path |

---

## 15. Open questions

1. Can agent / multi-agent routing add value, or does deterministic routing remain preferable for auditability?
2. What is the ratified M5 agreement threshold, set against the real benchmark set?
3. How short can the diagnostic be while still placing a student across the full concept set reliably?
4. Durable student-profile storage: in a later version, or needed sooner than assumed?
5. Does the thin teacher view make the MVP cut, or move to fast-follow?
6. Which unit is the MVP demonstration slice? (Working example: the AI-Generated Design unit.)
7. Stretch: run evals on AI-generated output quality grounded in a curriculum-quality rubric?

---

## 16. Owner-made calls in v0.2 (flagged for veto)

These were decided by the owner to keep momentum; reviewers may override.
- **Pathway = AI routes authored content (reading A)**, not AI-generated student-facing content. Generation stays in the sandbox.
- **Longitudinal progress is simulated for the hackathon**, not durably persisted.
- **Thin teacher view included as P1 (Should)**, because the standards loop is incomplete until the teacher can see attainment.
- **No single MVP concept is pre-selected;** the engine operates over the instructor's full concept set, and the demonstration uses a bounded slice of one unit.

---

## 17. Definition of done / launch gates

- [ ] All Must-have FRs and NFRs implemented and tested.
- [ ] Diagnostic places a test student per concept (M1); roadmap covers every required concept (M2).
- [ ] A student advances ≥2 stage transitions via ≥3 routed levels (M3); two students with different placements get different routes (M4).
- [ ] Validation agreement meets the ratified threshold on the human-rated benchmark set (M5) — **primary gate**.
- [ ] Fallback verified on induced failure with 0 broken sessions (M6).
- [ ] Content filtering verified on input and output (M7).
- [ ] Teaching & Learning sign-off on all student-facing content.

---

## Appendix A — Companion artifacts
- *Companion — Adaptive Engine: Stage Model, Validation, and Routing* (`Companion-Adaptive-Engine-StageModel-and-Routing.md`). Operational detail aligned to this BRD's per-concept Stage 0–3 model: the mastery vector, stage ladders + trajectory-to-level mappings, diagnostic placement, validation (rubric eval + deterministic probes), and the deterministic routing rules with the must-learn coverage guarantee. Supersedes the earlier 0–3 scalar skill-tree draft.

## Appendix B — Glossary
- **Concept:** a CSTA-mapped learning objective with a four-stage rubric.
- **Stage:** per-concept mastery level 0–3 (Missing / Beginning / Meeting / Exceeding).
- **Mastery signal:** the vector of per-concept stages for a student.
- **Trajectory:** the authored levels that carry a student across a stage transition.
- **Diagnostic placement:** promotion from Stage 0 to a true entry stage per concept.
- **The bar:** Stage 2 on every required concept; Stage 3 optional.
- **Level:** a sub-lesson step; **Unit:** a sequence of lessons/concepts; **Project:** the student-built culmination.
