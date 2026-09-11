// src/model/term.ts
function blockLabel(block2) {
  return block2 === "1" ? "first block" : block2 === "2" ? "second block" : "";
}
function placeLabel(t, block2) {
  const where = t.season === "S" ? blockLabel(block2) : "";
  return where === "" ? termLabel(t) : `${termLabel(t)}, ${where}`;
}
var SEASON_ORDER = { P: 0, S: 1, F: 2 };
var SEASON_NAME = { F: "Fall", P: "Spring", S: "Summer" };
var ACADEMIC_ORDER = ["F", "P", "S"];
function term(year, season) {
  return { year, season };
}
function parseTerm(key) {
  const year = Number(key.slice(0, 4));
  const season = key.slice(4);
  if (!Number.isInteger(year) || !(season in SEASON_ORDER)) {
    throw new Error(`malformed term key ${JSON.stringify(key)}`);
  }
  return { year, season };
}
function termKey(t) {
  return `${t.year}${t.season}`;
}
function termLabel(t) {
  return `${SEASON_NAME[t.season]} ${t.year}`;
}
function compareTerms(a, b) {
  return a.year - b.year || SEASON_ORDER[a.season] - SEASON_ORDER[b.season];
}
var termBefore = (a, b) => compareTerms(a, b) < 0;
function seasonWord(s) {
  return SEASON_NAME[s].toLowerCase();
}
function seasonsPhrase(seasons) {
  const words = seasons.map(seasonWord);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}
function nextTerm(t, seasons = ACADEMIC_ORDER) {
  const ordered = [...seasons].sort((a, b) => SEASON_ORDER[a] - SEASON_ORDER[b]);
  const first = ordered[0];
  if (first === void 0) throw new Error("nextTerm needs at least one season");
  for (const season of ordered) {
    if (SEASON_ORDER[season] > SEASON_ORDER[t.season]) return { year: t.year, season };
  }
  return { year: t.year + 1, season: first };
}
function termSequence(from, count2, seasons = ACADEMIC_ORDER) {
  const out = [];
  let current = from;
  for (let i = 0; i < count2; i += 1) {
    out.push(current);
    current = nextTerm(current, seasons);
  }
  return out;
}
var START_MONTH = { P: 1, S: 5, F: 8 };
function yearFrom(start, at) {
  const months = at.year * 12 + START_MONTH[at.season] - (start.year * 12 + START_MONTH[start.season]);
  return Math.floor(Math.max(0, months) / 12) + 1;
}

// src/model/course.ts
function creditsNominal(c) {
  return typeof c === "number" ? c : c.min;
}
var GRADE_ORDER = [
  "E",
  "D-",
  "D",
  "D+",
  "C-",
  "C",
  "C+",
  "B-",
  "B",
  "B+",
  "A-",
  "A"
];
function gradeAtLeast(held, required) {
  const h = GRADE_ORDER.indexOf(held);
  const r = GRADE_ORDER.indexOf(required);
  if (h < 0 || r < 0) return false;
  return h >= r;
}
function isPrereqNode(expr) {
  return "op" in expr;
}
function prereqLeaves(expr) {
  if (expr === void 0) return [];
  return isPrereqNode(expr) ? expr.of.flatMap(prereqLeaves) : [expr];
}
function prereqCourses(expr) {
  return prereqLeaves(expr).flatMap((leaf2) => "course" in leaf2 ? [leaf2.course] : []);
}
function courseParts(id) {
  const match2 = /^([A-Z]{2,5})\s?(\d{3,4})[A-Z]?$/i.exec(id.trim());
  if (match2 === null) return void 0;
  return { subject: match2[1].toUpperCase(), number: Number.parseInt(match2[2], 10) };
}
var CourseCatalog = class {
  #byId = /* @__PURE__ */ new Map();
  #canonical = /* @__PURE__ */ new Map();
  constructor(courses) {
    for (const course of courses) {
      this.#byId.set(course.id, course);
      this.#canonical.set(course.id, course.id);
      for (const alias of course.aliases ?? []) this.#canonical.set(alias, course.id);
    }
  }
  canonical(id) {
    return this.#canonical.get(id) ?? id;
  }
  get(id) {
    return this.#byId.get(this.canonical(id));
  }
  has(id) {
    return this.#byId.has(this.canonical(id));
  }
  get size() {
    return this.#byId.size;
  }
  *[Symbol.iterator]() {
    yield* this.#byId.values();
  }
};

// src/model/grid.ts
function parseGrid(raw) {
  const terms = raw.terms.map((term2) => ({
    index: term2.index,
    // NFR-DATA-02: the subtotal the department printed, carried so the plan
    // can be checked against it.
    ...term2.printedCredits !== void 0 ? { credits: term2.printedCredits } : {},
    items: term2.items.flatMap((item) => {
      switch (item.kind) {
        case "course":
          return item.code ? [{ kind: "course", code: item.code, ...item.credits !== void 0 ? { credits: item.credits } : {} }] : [];
        case "choice":
          return item.options?.length ? [{
            kind: "choice",
            options: item.options,
            ...item.label ? { label: item.label } : {},
            ...item.credits !== void 0 ? { credits: item.credits } : {}
          }] : [];
        case "combined":
          return (item.codes ?? []).map((code) => ({ kind: "course", code }));
        case "slot":
          return [{
            kind: "slot",
            slot: item.slot ?? "@SLOT",
            label: item.label ?? item.slot ?? "Requirement",
            credits: item.credits ?? 3,
            ...item.options ? { options: item.options } : {}
          }];
      }
    })
  }));
  return { programId: raw.programId, catalogYear: raw.catalogYear, source: raw.source, seasons: raw.seasons, terms };
}
function gridItemId(termIndex, position) {
  return `g${termIndex}.${position}`;
}

// src/model/context.ts
var EMPTY_CONTEXT = Object.freeze({});
function completedByCode(context, canonical = (id) => id) {
  const out = /* @__PURE__ */ new Map();
  for (const c of context.completed ?? []) out.set(canonical(c.code), c);
  return out;
}

// src/model/offering.ts
function toRhythm(raw) {
  if ("lastOffered" in raw) return raw;
  return {
    pattern: raw.pattern,
    ...raw.trend ? { trend: raw.trend } : {},
    termsOffered: raw.terms_offered,
    yearsOffered: raw.years_offered,
    opportunities: raw.opportunities,
    lastOffered: raw.last_offered,
    termsSinceLastOffered: raw.terms_since_last_offered,
    recentTerms: raw.recent_terms,
    sectionsRecent: raw.sections_recent,
    sectionsPrior: raw.sections_prior
  };
}
var UNKNOWN_COURSE = {
  verdict: "no_evidence",
  confidence: "none",
  allowed: true,
  certain: false,
  reason: "No offering history is on file for this course."
};
var OfferingEvidence = class _OfferingEvidence {
  #courses;
  #window;
  constructor(document2) {
    this.#courses = document2.courses;
    this.#window = document2.window;
  }
  /**
   * Build the index from course records that carry their own offering
   * evidence.
   *
   * Plan 4.2 puts the derived fact on the course with its provenance and
   * confidence, rather than in a separate file the reader has to remember to
   * consult. This is the reader for that shape; `availability` is unchanged,
   * which is the point.
   */
  static fromCourses(courses, window2) {
    const records = {};
    for (const course of courses) {
      const offering = course.offering;
      if (offering === void 0) continue;
      records[course.id] = {
        title: "",
        value: offering.value,
        confidence: offering.confidence,
        first_observed: offering.firstObserved ?? null,
        last_observed: offering.lastObserved ?? null,
        observed_terms: offering.observedTerms ?? 0,
        seasons: offering.seasons ?? {},
        ...offering.verdict ? { verdict: offering.verdict } : {},
        ...offering.note ? { notes: [offering.note] } : {},
        ...offering.notes ? { notes: offering.notes } : {},
        ...offering.aliases ? { aliases: offering.aliases } : {},
        ...offering.rhythm ? { rhythm: offering.rhythm } : {}
      };
    }
    return new _OfferingEvidence({
      schema_version: 1,
      generated: {},
      window: window2 ?? {
        terms: [],
        first_term: null,
        last_term: null,
        seasons: {}
      },
      courses: records
    });
  }
  static empty() {
    return new _OfferingEvidence({
      schema_version: 1,
      generated: {},
      window: { terms: [], first_term: null, last_term: null, seasons: {} },
      courses: {}
    });
  }
  get window() {
    return this.#window;
  }
  /** The course's offering rhythm, FR-DATA-25, where the schedule has one. */
  rhythmOf(id) {
    const raw = this.#courses[id]?.rhythm;
    return raw === void 0 ? void 0 : toRhythm(raw);
  }
  /**
   * Whether `id` may sit in `at`.
   *
   * FR-DATA-19: a program with catalog data alone and no offering evidence
   * still produces a plan, marked with what is unknown. So the default is to
   * allow and to say the placement is uncertain, never to refuse.
   */
  availability(id, at, block2) {
    const record = this.#courses[id];
    if (record === void 0) return UNKNOWN_COURSE;
    const where = at.season === "S" && block2 !== void 0 ? `the ${blockLabel(block2)} of summer` : seasonWord(at.season);
    if (record.verdict === "no_record") {
      return {
        verdict: "no_record",
        confidence: "none",
        allowed: true,
        certain: false,
        reason: `${id} is in the catalog, and no section of it appears anywhere in the schedule on record.`
      };
    }
    const whole2 = record.seasons[at.season];
    if (whole2 === void 0) {
      return {
        verdict: "no_evidence",
        confidence: "none",
        allowed: true,
        certain: false,
        reason: `The schedule on file covers no ${seasonWord(at.season)} terms.`
      };
    }
    const season = at.season === "S" && block2 !== void 0 ? whole2.blocks?.[block2] ?? whole2 : whole2;
    switch (season.verdict) {
      case "runs":
        return {
          verdict: "runs",
          confidence: season.confidence,
          allowed: true,
          certain: season.confidence === "high" || season.confidence === "moderate",
          reason: `${id} has run in ${where} in ${season.observed} of the last ${season.opportunities} on record.`
        };
      case "never_observed": {
        const solid = season.confidence === "high";
        const years = season.opportunities === 1 ? "year" : "years";
        return {
          verdict: "never_observed",
          confidence: season.confidence,
          allowed: !solid,
          certain: solid,
          reason: solid ? `${id} has not run in ${where} in ${season.opportunities} ${years} on record.` : `${id} has not run in ${where} in ${season.opportunities} ${years} on record, but that record is known to be incomplete.`
        };
      }
      case "no_record":
      case "no_evidence":
        return {
          verdict: "no_evidence",
          confidence: "none",
          allowed: true,
          certain: false,
          reason: `${id} has been on the books for ${season.opportunities} ${seasonWord(at.season)} ${season.opportunities === 1 ? "term" : "terms"}, too few to say whether it runs then.`
        };
    }
  }
};

// src/model/plan.ts
function termCredits(t) {
  return t.items.reduce((sum, item) => sum + creditsNominal(item.credits), 0);
}
function allItems(plan) {
  return plan.terms.flatMap((t) => t.items.map((item) => ({ item, term: t.term })));
}

// src/constraints/prerequisite.ts
var MET = { truth: "met", reasons: [], missingCourses: [] };
function evaluate(expr, state, options = {}) {
  if (expr === void 0) return MET;
  if (isPrereqNode(expr)) {
    switch (expr.op) {
      case "AND":
        return combine(
          expr.of.map((e) => evaluate(e, state, options)),
          expr.of.length
        );
      case "OR":
        return combine(
          expr.of.map((e) => evaluate(e, state, options)),
          1
        );
      case "N_OF":
        return combine(
          expr.of.map((e) => evaluate(e, state, options)),
          expr.n
        );
    }
  }
  return leaf(expr, state, options);
}
function combine(results, need) {
  const met = results.filter((r) => r.truth === "met").length;
  const unknown = results.filter((r) => r.truth === "unknown").length;
  if (met >= need) return MET;
  const failing = results.filter((r) => r.truth !== "met");
  const reasons = need === 1 && failing.length > 1 ? [choiceReason(failing)] : failing.flatMap((r) => r.reasons);
  const missingCourses = [...new Set(failing.flatMap((r) => r.missingCourses))];
  if (met + unknown >= need) return { truth: "unknown", reasons, missingCourses };
  return { truth: "unmet", reasons, missingCourses };
}
function choiceReason(failing) {
  const plain = failing.every((r) => r.missingCourses.length === 1 && r.reasons.length === 1 && /^\S+ \S+ has to come first\.$/.test(r.reasons[0]));
  if (plain) return `One of ${listWords(failing.map((r) => r.missingCourses[0]))} has to come first.`;
  const parts = failing.map((r) => r.reasons.map((reason) => reason.replace(/^Needs /, "").replace(/\.$/, "")).join("; "));
  return `One of these: ${parts.join("; ")}.`;
}
function listWords(words) {
  if (words.length <= 2) return words.join(" or ");
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}
function higherHeld(subject, above, state, concurrentOk) {
  const held = [...state.earlier, ...concurrentOk ? state.concurrent : []];
  const candidates = held.map((id) => ({ id, parts: courseParts(id) })).filter(({ parts }) => parts !== void 0 && parts.subject === subject && parts.number > above).sort((a, b) => a.parts.number - b.parts.number);
  return candidates[0]?.id;
}
function gradeOfSubstitute(id, minGrade, state) {
  if (minGrade === void 0) return MET;
  const record = state.completed.get(id);
  if (record?.grade !== void 0 && gradeAtLeast(record.grade, minGrade)) return MET;
  return {
    truth: "unknown",
    reasons: [`${id} would count, with a ${minGrade} or better, and ${record?.grade === void 0 ? "no grade was given" : `${record.grade} was recorded`}.`],
    missingCourses: []
  };
}
function leaf(expr, state, options) {
  if ("course" in expr && (expr.orHigher === true || expr.orEquivalent === true)) {
    const { orHigher: _h, orEquivalent: _e, ...named } = expr;
    const result = leaf(named, state, options);
    if (result.truth === "met") return MET;
    const parts = expr.orHigher === true ? courseParts(state.canonical(expr.course)) : void 0;
    const higher = parts === void 0 ? void 0 : higherHeld(parts.subject, parts.number, state, options.concurrentOk === true);
    if (higher !== void 0) return gradeOfSubstitute(higher, expr.minGrade, state);
    const rest = expr.orHigher === true ? "a higher course" : "equivalent knowledge";
    return {
      truth: "unknown",
      reasons: [`Needs ${expr.course} or ${rest}, and whether ${rest} counts is not something this page can tell.`],
      missingCourses: []
    };
  }
  if ("higherThan" in expr) {
    const numbers = expr.higherThan.courses.map((code) => courseParts(code)?.number ?? 0);
    const above = Math.max(0, ...numbers);
    const higher = higherHeld(expr.higherThan.subject, above, state, options.concurrentOk === true);
    if (higher !== void 0) return gradeOfSubstitute(higher, expr.minGrade, state);
    return {
      truth: "unknown",
      reasons: [
        `Needs a ${expr.higherThan.subject} course numbered above ${expr.higherThan.courses.join(", ")}, and none is held.`
      ],
      missingCourses: []
    };
  }
  if ("recommended" in expr) {
    return MET;
  }
  if ("course" in expr) {
    const id = state.canonical(expr.course);
    const heldEarlier = state.earlier.has(id);
    const heldConcurrent = options.concurrentOk === true && state.concurrent.has(id);
    if (!heldEarlier && !heldConcurrent) {
      if (state.slotCandidates?.has(id) === true) {
        return {
          truth: "unknown",
          reasons: [
            `${expr.course} would satisfy this, and an earlier requirement in the plan can be filled with it.`
          ],
          missingCourses: []
        };
      }
      if (state.contextWithheld === true && state.inPlan?.has(id) !== true) {
        return {
          truth: "unknown",
          reasons: [
            `${expr.course} has to come first, and whether it has been taken was not shared with this plan.`
          ],
          missingCourses: [expr.course]
        };
      }
      return {
        truth: "unmet",
        reasons: [`${expr.course} has to come first.`],
        missingCourses: [expr.course]
      };
    }
    if (expr.withinYears !== void 0) {
      const when = state.whenEarlier?.get(id);
      const years = expr.withinYears;
      const noun = years === 1 ? "year" : "years";
      const saidRecent = state.context.standing?.[`recent:${id}`] === true;
      if (when === void 0 && saidRecent) {
      } else if (when === void 0 || state.at === void 0) {
        return {
          truth: "unknown",
          reasons: [`${expr.course} has to be within the past ${years} ${noun}, and when it was taken is not recorded here.`],
          missingCourses: []
        };
      } else if (monthsBetween(when, state.at) > years * 12) {
        return {
          truth: "unmet",
          reasons: [
            `${expr.course} has to be within the past ${years} ${noun}, and ${termLabel(when)} is more than that before ${termLabel(state.at)}.`
          ],
          missingCourses: [expr.course]
        };
      }
    }
    if (expr.minGrade !== void 0) {
      const record = state.completed.get(id);
      const saidGrade = state.context.standing?.[`grade:${id}:${expr.minGrade}`] === true;
      if (record === void 0) {
        if (saidGrade) return MET;
        return {
          truth: "unknown",
          reasons: [`${expr.course} needs a ${expr.minGrade} or better.`],
          missingCourses: []
        };
      }
      if (record.grade === void 0) {
        if (saidGrade) return MET;
        return {
          truth: "unknown",
          reasons: [`${expr.course} needs a ${expr.minGrade} or better, and no grade was given.`],
          missingCourses: []
        };
      }
      if (!gradeAtLeast(record.grade, expr.minGrade)) {
        return {
          truth: "unmet",
          reasons: [
            `${expr.course} needs a ${expr.minGrade} or better; ${record.grade} was recorded.`
          ],
          missingCourses: [expr.course]
        };
      }
    }
    return MET;
  }
  if ("placement" in expr) {
    const target = state.canonical(expr.placement);
    if (state.earlier.has(target)) return MET;
    const parts = expr.orHigher === true ? courseParts(target) : void 0;
    if (parts !== void 0 && higherHeld(parts.subject, parts.number, state, false) !== void 0) return MET;
    const name = expr.orHigher === true ? `${expr.placement} or higher` : expr.placement;
    const subject = placementSubject(expr.placement);
    const given = state.context.placement ?? {};
    const stated = subject === void 0 ? Object.values(given) : given[subject] !== void 0 ? [given[subject]] : [];
    if (stated.length === 0) {
      return {
        truth: "unknown",
        reasons: [
          state.contextWithheld === true ? `Needs placement into ${name}, and placement was not shared with this plan.` : `Needs placement into ${name}, which has not been given.`
        ],
        missingCourses: []
      };
    }
    if (stated.some((p) => state.canonical(p) === target)) return MET;
    if (parts !== void 0) {
      const placed = stated.map((p) => courseParts(state.canonical(p))).find((q) => q !== void 0 && q.subject === parts.subject);
      if (placed !== void 0 && placed.number > parts.number) return MET;
      if (placed !== void 0 && placed.number < parts.number) {
        return {
          truth: "unmet",
          reasons: [`Placed into ${stated[0]}, which is below ${expr.placement}.`],
          missingCourses: []
        };
      }
    }
    return {
      truth: "unknown",
      reasons: [
        `Placed into ${stated[0]}; whether that placement also covers ${name} is not something this page can tell.`
      ],
      missingCourses: []
    };
  }
  if ("creditThreshold" in expr) {
    if (state.creditsEarned >= expr.creditThreshold) return MET;
    if (state.contextWithheld === true) {
      return {
        truth: "unknown",
        reasons: [
          `Needs ${expr.creditThreshold} credits earned first, and credit already earned was not shared with this plan.`
        ],
        missingCourses: []
      };
    }
    return {
      truth: "unmet",
      reasons: [`Needs ${expr.creditThreshold} credits earned first.`],
      missingCourses: []
    };
  }
  if ("unparsed" in expr) {
    return {
      truth: "unknown",
      reasons: [`Has a prerequisite the system could not read: "${expr.unparsed}"`],
      missingCourses: []
    };
  }
  if (state.context.standing?.[assertionKey(expr)] === true) return MET;
  if ("standing" in expr && expr.standing === "matriculation" && state.context.standing?.["matriculated"] === true) return MET;
  if ("programAdmission" in expr && state.context.standing?.["matriculated"] === true) return MET;
  const described = describeUncheckable(expr);
  return { truth: "unknown", reasons: [described], missingCourses: [] };
}
function assertionKey(expr) {
  if ("standing" in expr) return expr.standing;
  if ("programAdmission" in expr) return "matriculated";
  if ("permission" in expr) return `permission:${expr.permission}`;
  if ("classStanding" in expr) return `classStanding:${expr.classStanding}`;
  if ("testScore" in expr) return `testScore:${expr.testScore.test}:${expr.testScore.min}`;
  if ("creditThreshold" in expr) return `creditThreshold:${expr.creditThreshold}`;
  if ("major" in expr) return `major:${expr.major}`;
  if ("milestone" in expr) return `milestone:${expr.milestone}`;
  if ("background" in expr) return `background:${expr.background}`;
  return "";
}
function describeUncheckable(expr) {
  if ("standing" in expr) return `Needs ${humanize(expr.standing)}.`;
  if ("programAdmission" in expr) return `Needs admission to ${expr.programAdmission}.`;
  if ("permission" in expr) return `Needs permission: ${expr.permission}.`;
  if ("classStanding" in expr) return `Needs ${humanize(expr.classStanding)} standing.`;
  if ("major" in expr) return `Needs a declared major: ${expr.major}.`;
  if ("milestone" in expr) return `Needs ${expr.milestone}.`;
  if ("background" in expr) return `Needs ${expr.background}.`;
  if ("testScore" in expr) {
    return `Needs a ${expr.testScore.test} score of at least ${expr.testScore.min}.`;
  }
  return "Has a prerequisite the system cannot check.";
}
function humanize(token) {
  return token.replace(/_/g, " ");
}
function placementSubject(course) {
  const subject = course.split(" ")[0]?.toUpperCase();
  if (subject === "MATH" || subject === "MAT" || subject === "STAT") return "math";
  if (subject === "ENGL" || subject === "ENGH") return "english";
  return void 0;
}
var SEASON_MONTH = { P: 1, S: 5, F: 8 };
function monthsBetween(from, to) {
  return to.year * 12 + SEASON_MONTH[to.season] - (from.year * 12 + SEASON_MONTH[from.season]);
}
function corequisitesMet(course, state) {
  const missing = [];
  for (const raw of course.corequisites ?? []) {
    const id = state.canonical(raw);
    if (!state.earlier.has(id) && !state.concurrent.has(id)) missing.push(raw);
  }
  if (missing.length === 0) return MET;
  const sentence = missing.length === 1 ? `${missing[0]} has to be taken in the same term or earlier` : `${missing.join(", ")} have to be taken in the same term or earlier`;
  if (state.contextWithheld === true && missing.every((raw) => state.inPlan?.has(state.canonical(raw)) !== true)) {
    return {
      truth: "unknown",
      reasons: [`${sentence}, and whether that has happened was not shared with this plan.`],
      missingCourses: missing
    };
  }
  return { truth: "unmet", reasons: [`${sentence}.`], missingCourses: missing };
}

// src/reflow/reflow.ts
var DEFAULT_MAX_CREDITS = 18;
function bind(grid, start) {
  const terms = termSequence(start, grid.terms.length, grid.seasons);
  const out = /* @__PURE__ */ new Map();
  grid.terms.forEach((gridTerm, i) => {
    const bound = terms[i];
    if (bound !== void 0) out.set(gridTerm.index, bound);
  });
  return out;
}
function apply(grid, bound, catalog, context) {
  const canonical = (id) => catalog.canonical(id);
  const completed = completedByCode(context, canonical);
  const inProgress = new Set((context.inProgress ?? []).map(canonical));
  const held = /* @__PURE__ */ new Set([...completed.keys(), ...inProgress]);
  const remaining = [];
  const applied = [];
  const consumed = /* @__PURE__ */ new Set();
  for (const gridTerm of grid.terms) {
    const boundTerm = bound.get(gridTerm.index);
    if (boundTerm === void 0) continue;
    gridTerm.items.forEach((item, position) => {
      const id = gridItemId(gridTerm.index, position);
      const satisfiedBy = itemSatisfiedBy(item, held, consumed, canonical);
      if (satisfiedBy !== void 0) {
        consumed.add(satisfiedBy);
        const record = completed.get(satisfiedBy);
        applied.push({
          code: satisfiedBy,
          credits: record?.credits ?? gridItemCredits(item, catalog),
          satisfied: id
        });
        return;
      }
      remaining.push({
        id,
        gridTermIndex: gridTerm.index,
        item,
        boundTerm,
        placedTerm: boundTerm,
        ...itemCode(item) !== void 0 ? { code: canonical(itemCode(item)) } : {},
        credits: gridItemCredits(item, catalog)
      });
    });
  }
  for (const [code, record] of completed) {
    if (consumed.has(code)) continue;
    const credits = catalog.get(code)?.credits;
    applied.push({ code, credits: record.credits ?? (credits === void 0 ? 0 : creditsNominal(credits)) });
  }
  return { remaining, applied };
}
function itemSatisfiedBy(item, held, consumed, canonical) {
  const candidates = item.kind === "course" ? [item.code] : item.kind === "choice" ? item.options : item.options ?? [];
  for (const raw of candidates) {
    const id = canonical(raw);
    if (held.has(id) && !consumed.has(id)) return id;
  }
  return void 0;
}
function itemCode(item) {
  if (item.kind === "course") return item.code;
  if (item.kind === "choice") return item.options[0];
  return void 0;
}
function gridItemCredits(item, catalog) {
  if (item.kind === "slot") return creditsNominal(item.credits);
  const code = itemCode(item);
  const course = code !== void 0 ? catalog.get(code) : void 0;
  if (course) return creditsNominal(course.credits);
  if (item.credits !== void 0) return creditsNominal(item.credits);
  return 3;
}
var capAt = (cap, term2) => typeof cap === "number" ? cap : cap(term2);
function compact(items, catalog, offerings, context, maxCredits, start, seasons) {
  arrange(
    items,
    catalog,
    offerings,
    context,
    maxCredits,
    start,
    (floor, bound) => candidateTerms(floor, bound.boundTerm, seasons),
    false,
    // Nothing fits: the course stays where the department put it, and the
    // check reports what is wrong there. Reflow does not create overloads
    // and does not hide the department's (INV-05, FR-PLAN-18). One
    // exception, the sponsor's sixteenth review: a course the department
    // put in a season it has never run in, on a complete record, goes to
    // the first later term it fits, since a plan that schedules a course
    // where it has never run is no plan for the student; the scarcity
    // report still reads the department's own placement (checkPublishedGrid
    // does not compact).
    (bound, _floor, _candidates, _hasRoom, fitsAt) => {
      if (bound.code === void 0 || seasonSupport(offerings, bound.code, bound.boundTerm) <= DOUBTFUL) return bound.boundTerm;
      const later = termSequence(nextTerm(bound.boundTerm, seasons), HORIZON, seasons);
      for (const worst of [SEEN, DOUBTFUL]) {
        const found2 = later.find((at) => fitsAt(at, worst));
        if (found2 !== void 0) return found2;
      }
      return bound.boundTerm;
    }
  );
}
var HORIZON = 64;
function spread(items, catalog, offerings, context, maxCredits, start, seasons) {
  arrange(
    items,
    catalog,
    offerings,
    context,
    maxCredits,
    start,
    (floor) => termSequence(floor, HORIZON, seasons),
    true,
    // Room under the cap in a season the course has been seen in first;
    // then room in a season whose record has a hole; then room anywhere.
    (bound, floor, candidates, hasRoom) => {
      const support = (at) => bound.code === void 0 ? SEEN : seasonSupport(offerings, bound.code, at);
      return candidates.find((at) => hasRoom(at) && support(at) === SEEN) ?? candidates.find((at) => hasRoom(at) && support(at) <= DOUBTFUL) ?? candidates.find(hasRoom) ?? floor;
    }
  );
}
function arrange(items, catalog, offerings, context, maxCredits, start, candidatesFor, pack, whenNothingFits) {
  const cap = maxCredits;
  const load2 = /* @__PURE__ */ new Map();
  for (const item of items) {
    load2.set(termKey(item.boundTerm), 0);
  }
  const canonical = (id) => catalog.canonical(id);
  const completed = completedByCode(context, canonical);
  const placedByTerm = /* @__PURE__ */ new Map();
  const slotsByTerm = /* @__PURE__ */ new Map();
  let floor = start;
  let floorGridIndex = -1;
  const place = (bound, chosen) => {
    bound.placedTerm = chosen;
    const key = termKey(chosen);
    load2.set(key, (load2.get(key) ?? 0) + bound.credits);
    if (bound.code !== void 0) {
      const set = placedByTerm.get(key) ?? /* @__PURE__ */ new Set();
      set.add(bound.code);
      placedByTerm.set(key, set);
    } else if (bound.item.kind === "slot" && bound.item.options !== void 0) {
      const set = slotsByTerm.get(key) ?? /* @__PURE__ */ new Set();
      for (const option of bound.item.options) set.add(canonical(option));
      slotsByTerm.set(key, set);
    }
  };
  const fitsAt = (bound, at, worst) => fits(bound, at, catalog, offerings, context, completed, placedByTerm, slotsByTerm, load2, capAt(cap, at), worst);
  const hasRoom = (bound) => (candidate) => (load2.get(termKey(candidate)) ?? 0) + bound.credits <= capAt(cap, candidate);
  const placeOne = (bound) => {
    const candidates = candidatesFor(floor, bound);
    let chosen;
    for (const worst of [SEEN, DOUBTFUL]) {
      chosen = candidates.find((candidate) => fitsAt(bound, candidate, worst));
      if (chosen !== void 0) break;
    }
    place(bound, chosen ?? whenNothingFits(bound, floor, candidates, hasRoom(bound), (at, worst) => fitsAt(bound, at, worst)));
  };
  const placeGroup = (group) => {
    let pending = [...group];
    const candidates = candidatesFor(floor, group[0]);
    for (const worst of [SEEN, DOUBTFUL]) {
      for (const at of candidates) {
        if (pending.length === 0) return;
        const chosen = bestFill(pending, at, worst);
        for (const bound of chosen) place(bound, at);
        if (chosen.length > 0) pending = pending.filter((bound) => !chosen.includes(bound));
      }
    }
    for (const unit of unitsOf(pending)) {
      if (unit.length === 1) {
        placeOne(unit[0]);
        continue;
      }
      let chosen;
      for (const worst of [SEEN, DOUBTFUL]) {
        chosen = candidates.find((candidate) => unitFits(unit, candidate, worst));
        if (chosen !== void 0) break;
      }
      const at = chosen ?? whenNothingFits(
        unit[0],
        floor,
        candidates,
        (candidate) => (load2.get(termKey(candidate)) ?? 0) + unitCredits(unit) <= capAt(cap, candidate),
        (candidate, worst) => unitFits(unit, candidate, worst)
      );
      for (const bound of unit) place(bound, at);
    }
  };
  const unitsOf = (pending) => {
    const codes = /* @__PURE__ */ new Map();
    for (const bound of pending) if (bound.code !== void 0) codes.set(bound.code, bound);
    const partners = (bound) => {
      if (bound.code === void 0) return [];
      const out = /* @__PURE__ */ new Set();
      for (const raw of catalog.get(bound.code)?.corequisites ?? []) {
        const other = codes.get(canonical(raw));
        if (other !== void 0 && other !== bound) out.add(other);
      }
      for (const other of pending) {
        if (other === bound || other.code === void 0) continue;
        if ((catalog.get(other.code)?.corequisites ?? []).some((raw) => canonical(raw) === bound.code)) out.add(other);
      }
      return [...out];
    };
    const taken = /* @__PURE__ */ new Set();
    const units = [];
    for (const bound of pending) {
      if (taken.has(bound)) continue;
      const unit = [];
      const queue = [bound];
      while (queue.length > 0) {
        const next = queue.shift();
        if (taken.has(next)) continue;
        taken.add(next);
        unit.push(next);
        queue.push(...partners(next));
      }
      units.push(unit);
    }
    return units;
  };
  const unitCredits = (unit) => unit.reduce((sum, bound) => sum + bound.credits, 0);
  const unitFits = (unit, at, worst) => {
    const key = termKey(at);
    if ((load2.get(key) ?? 0) + unitCredits(unit) > capAt(cap, at)) return false;
    const placedBefore = new Set(placedByTerm.get(key) ?? []);
    const withUnit = new Set(placedBefore);
    for (const bound of unit) if (bound.code !== void 0) withUnit.add(bound.code);
    placedByTerm.set(key, withUnit);
    const ok = unit.every((bound) => fitsAt(bound, at, worst));
    placedByTerm.set(key, placedBefore);
    return ok;
  };
  const bestFill = (pending, at, worst) => {
    const room = capAt(cap, at) - (load2.get(termKey(at)) ?? 0);
    if (room <= 0) return [];
    const pool = unitsOf(pending.slice(0, 12));
    let best = [];
    let bestCredits = 0;
    const key = termKey(at);
    const search = (from, taken, credits) => {
      if (credits > bestCredits) {
        best = [...taken];
        bestCredits = credits;
      }
      if (credits >= room) return;
      for (let i = from; i < pool.length; i += 1) {
        const unit = pool[i];
        if (credits + unitCredits(unit) > room) continue;
        if (!unitFits(unit, at, worst)) continue;
        const loadBefore = load2.get(key) ?? 0;
        const placedBefore = new Set(placedByTerm.get(key) ?? []);
        const slotsBefore = new Set(slotsByTerm.get(key) ?? []);
        for (const bound of unit) place(bound, at);
        search(i + 1, [...taken, ...unit], credits + unitCredits(unit));
        load2.set(key, loadBefore);
        placedByTerm.set(key, placedBefore);
        slotsByTerm.set(key, slotsBefore);
        if (bestCredits >= room) return;
      }
    };
    search(0, [], 0);
    return best;
  };
  let index = 0;
  while (index < items.length) {
    const bound = items[index];
    if (bound.gridTermIndex !== floorGridIndex) {
      floorGridIndex = bound.gridTermIndex;
      floor = items.filter((other) => other.gridTermIndex < bound.gridTermIndex).reduce(
        (latest, other) => termBefore(latest, other.placedTerm) ? other.placedTerm : latest,
        start
      );
    }
    if (!pack) {
      placeOne(bound);
      index += 1;
      continue;
    }
    const group = [];
    while (index < items.length && items[index].gridTermIndex === floorGridIndex) {
      group.push(items[index]);
      index += 1;
    }
    placeGroup(group);
  }
}
function candidateTerms(earliest, latest, seasons) {
  if (compareTerms(earliest, latest) > 0) return [latest];
  const out = [];
  for (const t of termSequence(earliest, 64, seasons)) {
    out.push(t);
    if (compareTerms(t, latest) >= 0) break;
  }
  return out;
}
var SEEN = 0;
var DOUBTFUL = 1;
function seasonSupport(offerings, code, at) {
  const availability = offerings.availability(code, at);
  if (availability.verdict !== "never_observed") return SEEN;
  return availability.allowed ? DOUBTFUL : DOUBTFUL + 1;
}
function fits(bound, at, catalog, offerings, context, completed, placedByTerm, slotsByTerm, load2, maxCredits, worst) {
  if ((load2.get(termKey(at)) ?? 0) + bound.credits > maxCredits) return false;
  if (bound.code === void 0) return true;
  if (seasonSupport(offerings, bound.code, at) > worst) return false;
  const course = catalog.get(bound.code);
  if (course === void 0) return true;
  const state = prereqState(at, catalog, context, completed, placedByTerm, slotsByTerm);
  const prereqs = evaluate(course.prerequisites, state, {
    ...course.concurrentOk !== void 0 ? { concurrentOk: course.concurrentOk } : {}
  });
  if (prereqs.truth === "unmet") return false;
  return corequisitesMet(course, state).truth !== "unmet";
}
function prereqState(at, catalog, context, completed, placedByTerm, slotsByTerm) {
  const slotCandidates = /* @__PURE__ */ new Set();
  for (const [key, options] of slotsByTerm) {
    if (compareTerms(parseTerm(key), at) <= 0) for (const option of options) slotCandidates.add(option);
  }
  const earlier = new Set(completed.keys());
  for (const id of context.inProgress ?? []) earlier.add(catalog.canonical(id));
  for (const [key, codes] of placedByTerm) {
    if (termBefore(parseTerm(key), at)) for (const code of codes) earlier.add(code);
  }
  return {
    earlier,
    concurrent: placedByTerm.get(termKey(at)) ?? /* @__PURE__ */ new Set(),
    completed,
    context,
    canonical: (id) => catalog.canonical(id),
    creditsEarned: 0,
    slotCandidates
  };
}

// src/reflow/check.ts
var FULL_TIME_CREDITS = 12;
var FULL_TIME_SUMMER_CREDITS = 9;
function check(plan, input) {
  const problems = [];
  const canonical = (id) => input.catalog.canonical(id);
  const completed = completedByCode(input.context, canonical);
  const placedByTerm = /* @__PURE__ */ new Map();
  const slotsByTerm = /* @__PURE__ */ new Map();
  const firstBlockByTerm = /* @__PURE__ */ new Map();
  const done = /* @__PURE__ */ new Set();
  for (const t of plan.terms) {
    const courses = /* @__PURE__ */ new Set();
    const slots = /* @__PURE__ */ new Set();
    const firstBlock = /* @__PURE__ */ new Set();
    for (const item of t.items) {
      if (item.kind === "course") {
        courses.add(canonical(item.code));
        if (item.done === true) done.add(canonical(item.code));
        if (t.term.season === "S" && item.block === "1") firstBlock.add(canonical(item.code));
      } else if (item.kind === "slot") {
        for (const option of item.options ?? []) slots.add(canonical(option));
      }
    }
    placedByTerm.set(termKey(t.term), courses);
    slotsByTerm.set(termKey(t.term), slots);
    firstBlockByTerm.set(termKey(t.term), firstBlock);
  }
  const inPlan = /* @__PURE__ */ new Set();
  for (const codes of placedByTerm.values()) for (const code of codes) inPlan.add(code);
  checkDuplicates(plan, canonical, problems, input.catalog);
  if (input.publishedCredits) checkPublishedCredits(plan, input.publishedCredits, problems);
  for (const raw of input.context.inProgress ?? []) {
    const code = canonical(raw);
    problems.push({
      severity: "warning",
      kind: "in-progress",
      rule: "FR-CTX-05",
      message: `${code} is in progress, so the rest of this plan assumes it is passed.`,
      remedy: "If it is not passed, whatever depends on it moves."
    });
  }
  for (const planTerm of plan.terms) {
    checkTermLoad(planTerm, input, problems);
    for (const item of planTerm.items) {
      if (item.kind === "named") {
        problems.push({
          severity: "gap",
          kind: "student-named",
          rule: "FR-EDIT-07",
          message: `${item.label} was added by name, so it is left out of prerequisite, availability and requirement checks.`,
          itemId: item.id,
          term: planTerm.term
        });
        continue;
      }
      if (item.kind === "slot") {
        problems.push({
          severity: "gap",
          kind: "unfilled-requirement",
          rule: "FR-PLAN-07",
          message: `${item.label} has no course chosen yet.`,
          remedy: item.options?.length ? `Choose one of ${item.options.slice(0, 4).join(", ")}.` : "Pick a course that fills this requirement.",
          itemId: item.id,
          term: planTerm.term
        });
        continue;
      }
      if (item.done === true) continue;
      checkCourse(
        item.code,
        item.id,
        planTerm.term,
        item.block,
        input,
        completed,
        placedByTerm,
        slotsByTerm,
        inPlan,
        done,
        firstBlockByTerm,
        problems
      );
    }
  }
  return problems;
}
function checkCourse(rawCode, itemId, at, block2, input, completed, placedByTerm, slotsByTerm, inPlan, done, firstBlockByTerm, problems) {
  const code = input.catalog.canonical(rawCode);
  const course = input.catalog.get(code);
  const availability = input.offerings.availability(code, at, block2);
  if (!availability.allowed) {
    problems.push({
      severity: "error",
      kind: "not-offered",
      rule: "INV-06",
      message: `${code} is in ${placeLabel(at, block2)}. ${availability.reason}`,
      remedy: "Move it to a term the course has run in.",
      itemId,
      term: at
    });
  } else if (!availability.certain) {
    problems.push({
      severity: "warning",
      kind: availability.verdict === "never_observed" ? "offering-doubtful" : "offering-unknown",
      rule: "FR-VAL-08",
      // Named, since the page groups one sentence said of many courses.
      message: `${code}: ${availability.reason}`,
      remedy: "Check the class schedule before you register.",
      itemId,
      term: at
    });
  }
  const rhythm = input.offerings.rhythmOf(code);
  if (availability.allowed && rhythm !== void 0) {
    if (rhythm.pattern === "biennial") {
      const lastYear = Number(rhythm.lastOffered.slice(0, 4));
      if ((at.year - lastYear) % 2 !== 0) {
        problems.push({
          severity: "warning",
          kind: "off-year",
          rule: "FR-VAL-14",
          message: `${code} has run every other year on the record: ${rhythm.yearsOffered.join(", ")}. ${at.year} is a year between.`,
          remedy: `Plan it for ${termLabel(term(at.year + 1, at.season))}, or ask the department when it runs next.`,
          itemId,
          term: at
        });
      }
    } else if (rhythm.pattern === "dormant") {
      problems.push({
        severity: "warning",
        kind: "dormant",
        rule: "FR-VAL-14",
        message: `${code} has not run since ${termLabel(parseTerm(rhythm.lastOffered))}, ${rhythm.termsSinceLastOffered} terms ago.`,
        remedy: "Ask the department whether it will be offered again before you count on it.",
        itemId,
        term: at
      });
    }
  }
  if (course === void 0) return;
  const state = buildState(at, block2, input, completed, placedByTerm, slotsByTerm, inPlan, done, firstBlockByTerm);
  const prereqs = evaluate(course.prerequisites, state, {
    ...course.concurrentOk !== void 0 ? { concurrentOk: course.concurrentOk } : {}
  });
  if (prereqs.truth === "unmet") {
    problems.push({
      severity: "error",
      kind: "prerequisite",
      rule: "INV-01",
      message: `${code} in ${termLabel(at)}: ${prereqs.reasons.join(" ")}`,
      ...prereqs.missingCourses.length > 0 ? { remedy: `Take ${prereqs.missingCourses.join(" and ")} in an earlier term.` } : {},
      itemId,
      term: at
    });
  } else if (prereqs.truth === "unknown") {
    problems.push({
      severity: "warning",
      kind: "prerequisite-unverified",
      rule: "FR-DATA-16",
      message: `${code}: ${prereqs.reasons.join(" ")}`,
      remedy: "Confirm with an advisor before you register.",
      itemId,
      term: at
    });
  }
  const coreqs = corequisitesMet(course, state);
  if (coreqs.truth === "unmet") {
    problems.push({
      severity: "error",
      kind: "corequisite",
      rule: "INV-02",
      message: `${code} in ${termLabel(at)}: ${coreqs.reasons.join(" ")}`,
      itemId,
      term: at
    });
  } else if (coreqs.truth === "unknown") {
    problems.push({
      severity: "warning",
      kind: "corequisite-unverified",
      rule: "INV-02",
      message: `${code} in ${termLabel(at)}: ${coreqs.reasons.join(" ")}`,
      remedy: "Confirm with an advisor before you register.",
      itemId,
      term: at
    });
  }
}
function buildState(at, block2, input, completed, placedByTerm, slotsByTerm, inPlan, done, firstBlockByTerm) {
  const slotCandidates = /* @__PURE__ */ new Set();
  for (const [key, options] of slotsByTerm) {
    if (compareTerms(parseTerm(key), at) <= 0) for (const option of options) slotCandidates.add(option);
  }
  const earlier = new Set(completed.keys());
  for (const id of input.context.inProgress ?? []) earlier.add(input.catalog.canonical(id));
  for (const code of done) earlier.add(code);
  const whenEarlier = /* @__PURE__ */ new Map();
  for (const [key, codes] of placedByTerm) {
    const other = parseTerm(key);
    if (compareTerms(other, at) < 0) {
      for (const code of codes) {
        earlier.add(code);
        if (!whenEarlier.has(code)) whenEarlier.set(code, other);
      }
    }
  }
  const concurrent = new Set(placedByTerm.get(termKey(at)) ?? []);
  if (at.season === "S" && block2 === "2") {
    for (const code of firstBlockByTerm.get(termKey(at)) ?? []) {
      earlier.add(code);
      concurrent.delete(code);
      if (!whenEarlier.has(code)) whenEarlier.set(code, at);
    }
  }
  return {
    earlier,
    concurrent,
    completed,
    context: input.context,
    canonical: (id) => input.catalog.canonical(id),
    creditsEarned: 0,
    slotCandidates,
    at,
    whenEarlier,
    ...input.contextWithheld === true ? { contextWithheld: true, inPlan } : {}
  };
}
function checkTermLoad(planTerm, input, problems) {
  const credits = termCredits(planTerm);
  if (credits === 0) return;
  if (credits > input.maxCreditsPerTerm) {
    problems.push({
      severity: "error",
      kind: "term-load",
      rule: "INV-05",
      message: `${termLabel(planTerm.term)} has ${credits} credits, above the ${input.maxCreditsPerTerm} this plan allows.`,
      remedy: "Move something to another term, or raise the limit.",
      term: planTerm.term
    });
    return;
  }
  const summer = planTerm.term.season === "S";
  const fullTime = input.fullTimeCredits ?? (summer ? FULL_TIME_SUMMER_CREDITS : FULL_TIME_CREDITS);
  if (credits < fullTime) {
    problems.push({
      severity: "warning",
      kind: "part-time",
      rule: "FR-VAL-11",
      message: `${termLabel(planTerm.term)} has ${credits} credits, below the ${fullTime} that count as full time${summer ? " in summer" : ""}.`,
      remedy: "Full-time status affects financial aid and flat-rate tuition.",
      term: planTerm.term
    });
  }
}
function checkPublishedCredits(plan, published, problems) {
  const counted = /* @__PURE__ */ new Map();
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      const index = item.kind === "named" ? void 0 : item.publishedTermIndex;
      if (index === void 0) continue;
      counted.set(index, (counted.get(index) ?? 0) + creditsNominal(item.credits));
    }
  }
  for (const [index, printed] of published) {
    const actual = counted.get(index);
    if (actual === void 0 || Math.abs(actual - printed) < 1e-6) continue;
    problems.push({
      severity: "warning",
      kind: "published-credits",
      rule: "NFR-DATA-02",
      message: `The department prints ${printed} credits for term ${index} of its plan, and the courses it lists come to ${actual}.`,
      remedy: "Check the credit hours with an advisor before you register."
    });
  }
}
function checkDuplicates(plan, canonical, problems, catalog) {
  const seen = /* @__PURE__ */ new Map();
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind !== "course") continue;
      const code = canonical(item.code);
      if (catalog?.get(code)?.repeatable === true) continue;
      const first = seen.get(code);
      if (first !== void 0) {
        problems.push({
          severity: "error",
          kind: "duplicate",
          rule: "INV-09",
          message: `${code} appears in both ${termLabel(first)} and ${termLabel(planTerm.term)}.`,
          itemId: item.id,
          term: planTerm.term
        });
      } else {
        seen.set(code, planTerm.term);
      }
    }
  }
}

// src/edit/operations.ts
function withTerm(terms, at) {
  if (terms.some((t) => termKey(t.term) === termKey(at))) return [...terms];
  return [...terms, { term: at, items: [] }].sort((a, b) => compareTerms(a.term, b.term));
}
function findItem(plan, itemId) {
  for (const planTerm of plan.terms) {
    const item = planTerm.items.find((candidate) => candidate.id === itemId);
    if (item !== void 0) return { item, term: planTerm.term };
  }
  return void 0;
}
function tidy(terms, keep) {
  return terms.filter(
    (planTerm) => planTerm.items.length > 0 || keep !== void 0 && termKey(planTerm.term) === termKey(keep)
  );
}
function inBlock(item, to, block2) {
  const { block: _old, ...rest } = item;
  return to.season === "S" && block2 !== void 0 ? { ...rest, block: block2 } : rest;
}
function moveItem(plan, itemId, to, block2) {
  const found2 = findItem(plan, itemId);
  if (found2 === void 0) return plan;
  const wanted = to.season === "S" ? block2 : void 0;
  if (termKey(found2.term) === termKey(to)) {
    if (found2.item.block === wanted) return plan;
    return {
      ...plan,
      terms: plan.terms.map(
        (planTerm) => termKey(planTerm.term) === termKey(to) ? { ...planTerm, items: planTerm.items.map((item) => item.id === itemId ? inBlock(item, to, wanted) : item) } : planTerm
      )
    };
  }
  const moved = inBlock(
    found2.item.kind === "named" ? found2.item : { ...found2.item, placement: "moved" },
    to,
    wanted
  );
  const terms = withTerm(plan.terms, to).map((planTerm) => {
    if (termKey(planTerm.term) === termKey(found2.term)) {
      return { ...planTerm, items: planTerm.items.filter((item) => item.id !== itemId) };
    }
    if (termKey(planTerm.term) === termKey(to)) {
      return { ...planTerm, items: [...planTerm.items, moved] };
    }
    return planTerm;
  });
  return { ...plan, terms: tidy(terms, to) };
}
function placeItem(plan, itemId, to, index, block2) {
  return reorderItem(moveItem(plan, itemId, to, block2), itemId, index);
}
function swapTerms(plan, a, b) {
  if (termKey(a) === termKey(b)) return plan;
  const first = plan.terms.find((planTerm) => termKey(planTerm.term) === termKey(a));
  const second = plan.terms.find((planTerm) => termKey(planTerm.term) === termKey(b));
  if (first === void 0 || second === void 0) return plan;
  const stays = (item) => item.kind !== "slot" && item.done === true;
  const carried = (items, to) => items.filter((item) => !stays(item)).map((item) => inBlock(item.kind === "named" ? item : { ...item, placement: "moved" }, to, item.block));
  const swapped = (own, incoming, to) => [
    ...own.filter(stays),
    ...carried(incoming, to)
  ];
  return {
    ...plan,
    terms: plan.terms.map((planTerm) => {
      if (planTerm === first) return { ...planTerm, items: swapped(first.items, second.items, a) };
      if (planTerm === second) return { ...planTerm, items: swapped(second.items, first.items, b) };
      return planTerm;
    })
  };
}
function toggleDone(plan, itemId) {
  const found2 = findItem(plan, itemId);
  if (found2 === void 0 || found2.item.kind === "slot") return plan;
  const done = found2.item.done !== true;
  const terms = plan.terms.map((planTerm) => {
    if (termKey(planTerm.term) !== termKey(found2.term)) return planTerm;
    return {
      ...planTerm,
      items: planTerm.items.map((item) => {
        if (item.id !== itemId || item.kind === "slot") return item;
        if (done) return { ...item, done: true };
        const { done: _done, ...rest } = item;
        return rest;
      })
    };
  });
  return { ...plan, terms };
}
function untickAll(plan) {
  let changed = false;
  const terms = plan.terms.map((planTerm) => ({
    ...planTerm,
    items: planTerm.items.map((item) => {
      if (item.kind === "slot" || item.done !== true) return item;
      changed = true;
      const { done: _done, ...rest } = item;
      return rest;
    })
  }));
  return changed ? { ...plan, terms } : plan;
}
function removeItem(plan, itemId) {
  const found2 = findItem(plan, itemId);
  if (found2 === void 0) return plan;
  const terms = plan.terms.map((planTerm) => ({
    ...planTerm,
    items: planTerm.items.filter((item) => item.id !== itemId)
  }));
  return { ...plan, terms: tidy(terms) };
}
function reorderItem(plan, itemId, toIndex) {
  const found2 = findItem(plan, itemId);
  if (found2 === void 0) return plan;
  return {
    ...plan,
    terms: plan.terms.map((planTerm) => {
      if (termKey(planTerm.term) !== termKey(found2.term)) return planTerm;
      const items = planTerm.items.filter((item) => item.id !== itemId);
      const target = Math.max(0, Math.min(toIndex, items.length));
      items.splice(target, 0, found2.item);
      return { ...planTerm, items };
    })
  };
}
var counter = 0;
function newId(prefix) {
  counter += 1;
  return `${prefix}${counter}`;
}
function addCourse(plan, at, code, catalog, forRequirement, block2) {
  const canonical = catalog.canonical(code);
  const course = catalog.get(canonical);
  const item = {
    kind: "course",
    id: newId("a"),
    code: canonical,
    title: course?.title ?? canonical,
    credits: course?.credits ?? 3,
    placement: "added",
    ...forRequirement !== void 0 ? { forRequirement } : {},
    ...at.season === "S" && block2 !== void 0 ? { block: block2 } : {}
  };
  return {
    ...plan,
    terms: withTerm(plan.terms, at).map(
      (planTerm) => termKey(planTerm.term) === termKey(at) ? { ...planTerm, items: [...planTerm.items, item] } : planTerm
    )
  };
}
function addSlot(plan, at, spec, block2) {
  const item = {
    kind: "slot",
    id: newId("s"),
    slot: spec.slot,
    label: spec.label,
    credits: spec.credits,
    placement: "added",
    ...spec.options?.length ? { options: [...spec.options] } : {},
    ...at.season === "S" && block2 !== void 0 ? { block: block2 } : {}
  };
  return {
    ...plan,
    terms: withTerm(plan.terms, at).map(
      (planTerm) => termKey(planTerm.term) === termKey(at) ? { ...planTerm, items: [...planTerm.items, item] } : planTerm
    )
  };
}
function addNamedCourse(plan, at, label, credits, block2) {
  const item = {
    kind: "named",
    id: newId("n"),
    label: label.trim() || "Course you named",
    credits,
    placement: "named",
    ...at.season === "S" && block2 !== void 0 ? { block: block2 } : {}
  };
  return {
    ...plan,
    terms: withTerm(plan.terms, at).map(
      (planTerm) => termKey(planTerm.term) === termKey(at) ? { ...planTerm, items: [...planTerm.items, item] } : planTerm
    )
  };
}
function fillSlot(plan, slotId, code, catalog, requirement) {
  const found2 = findItem(plan, slotId);
  if (found2 === void 0 || found2.item.kind !== "slot") return plan;
  const slot = found2.item;
  const canonical = catalog.canonical(code);
  const course = catalog.get(canonical);
  const filled = {
    kind: "course",
    id: slot.id,
    code: canonical,
    title: course?.title ?? canonical,
    credits: course?.credits ?? slot.credits,
    placement: "added",
    ...slot.from !== void 0 ? { from: slot.from } : {},
    // The grid writes "GE" where the requirement table says "American
    // Institutions". The caller may know the better name, through the binding.
    forRequirement: requirement ?? slot.label,
    ...slot.publishedTermIndex !== void 0 ? { publishedTermIndex: slot.publishedTermIndex } : {}
  };
  return {
    ...plan,
    terms: plan.terms.map((planTerm) => ({
      ...planTerm,
      items: planTerm.items.map((item) => item.id === slotId ? filled : item)
    }))
  };
}
var ownOptions = (slot) => slot.options;
function resolveSlotOptions(slot, optionsFor = ownOptions) {
  const answer = optionsFor(slot);
  if (answer === void 0) return void 0;
  return Array.isArray(answer) ? { options: answer } : answer;
}
function fillFor(plan, code, catalog, optionsFor = ownOptions) {
  const canonical = catalog.canonical(code);
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind !== "slot") continue;
      const resolution = resolveSlotOptions(item, optionsFor);
      if (resolution?.options.some((option) => catalog.canonical(option) === canonical)) {
        return { slot: item, requirement: resolution.requirement ?? item.label };
      }
    }
  }
  return void 0;
}
function addCourseFilling(plan, at, code, catalog, index, optionsFor = ownOptions, block2) {
  const fill = fillFor(plan, code, catalog, optionsFor);
  if (fill !== void 0) {
    const filled = fillSlot(plan, fill.slot.id, code, catalog, fill.requirement);
    const placed = placeItem(filled, fill.slot.id, at, index ?? itemsIn(filled, at).length, block2);
    return withPlacement(placed, fill.slot.id, "added");
  }
  const added = addCourse(plan, at, code, catalog, void 0, block2);
  const item = itemsIn(added, at).at(-1);
  if (item === void 0 || index === void 0) return added;
  return placeItem(added, item.id, at, index, block2);
}
function itemsIn(plan, at) {
  return plan.terms.find((planTerm) => termKey(planTerm.term) === termKey(at))?.items ?? [];
}
function withPlacement(plan, itemId, placement) {
  return {
    ...plan,
    terms: plan.terms.map((planTerm) => ({
      ...planTerm,
      items: planTerm.items.map(
        (item) => item.id === itemId && item.kind !== "named" ? { ...item, placement } : item
      )
    }))
  };
}
function swapCourse(plan, itemId, to, catalog) {
  const found2 = findItem(plan, itemId);
  if (found2 === void 0 || found2.item.kind !== "course") return plan;
  const canonical = catalog.canonical(to);
  const course = catalog.get(canonical);
  return {
    ...plan,
    terms: plan.terms.map((planTerm) => ({
      ...planTerm,
      items: planTerm.items.map(
        (item) => item.id === itemId && item.kind === "course" ? {
          ...item,
          code: canonical,
          title: course?.title ?? canonical,
          credits: course?.credits ?? item.credits,
          placement: "swapped"
        } : item
      )
    }))
  };
}
function addTerm(plan, at) {
  return { ...plan, terms: withTerm(plan.terms, at) };
}
function removeTerm(plan, at) {
  return {
    ...plan,
    terms: plan.terms.filter((planTerm) => termKey(planTerm.term) !== termKey(at))
  };
}
function termAfterLast(plan, seasons) {
  const last = plan.terms.at(-1)?.term ?? plan.start;
  return nextTerm(last, seasons);
}

// src/edit/session.ts
var HISTORY_DEPTH = 40;
var EditSession = class {
  #plan;
  #past = [];
  #future = [];
  #input;
  /** The item the last edit touched, for FR-EDIT-10. */
  #touched;
  #restored;
  constructor(plan, input, options = {}) {
    this.#input = input;
    this.#restored = options.restored === true;
    this.#plan = this.#validated(plan);
  }
  get plan() {
    return this.#plan;
  }
  get canUndo() {
    return this.#past.length > 0;
  }
  get canRedo() {
    return this.#future.length > 0;
  }
  get edited() {
    return this.#past.length > 0 || this.#restored;
  }
  /** The item the last edit touched, so the page can show what changed. */
  get touched() {
    return this.#touched;
  }
  #checkInput() {
    return {
      catalog: this.#input.catalog,
      offerings: this.#input.offerings,
      context: this.#input.context,
      maxCreditsPerTerm: this.#input.maxCreditsPerTerm,
      ...this.#input.publishedCredits ? { publishedCredits: this.#input.publishedCredits } : {},
      ...this.#input.contextWithheld === true ? { contextWithheld: true } : {}
    };
  }
  /** FR-VAL-01: the same engine, on every change. */
  #validated(plan) {
    return { ...plan, problems: check(plan, this.#checkInput()) };
  }
  /**
   * Apply an edit.
   *
   * An operation that changes nothing is not recorded. Otherwise a student
   * dragging a course back where it started would have to press undo twice to
   * get anywhere, which reads as the undo being broken.
   *
   * `touched` names the item the edit was about, for FR-EDIT-10. An edit that
   * creates its item cannot name it in advance, so it may pass a function of
   * the resulting plan instead.
   */
  apply(operation, touched) {
    const next = operation(this.#plan);
    if (next === this.#plan) return false;
    const validated = this.#validated(next);
    if (sameShape(validated, this.#plan)) return false;
    this.#past.push(this.#plan);
    if (this.#past.length > HISTORY_DEPTH) this.#past.shift();
    this.#future = [];
    this.#plan = validated;
    this.#touched = typeof touched === "function" ? touched(validated) : touched;
    return true;
  }
  /**
   * FR-EDIT-02: what an operation would do, checked, without doing it.
   *
   * A swap is offered with a preview before the plan changes, and the preview
   * has to be the same check the change would get, on the same plan. Nothing
   * is recorded; the plan on the page is untouched.
   */
  preview(operation) {
    return this.#validated(operation(this.#plan));
  }
  undo() {
    const previous = this.#past.pop();
    if (previous === void 0) return false;
    this.#future.push(this.#plan);
    this.#plan = this.#validated(previous);
    this.#touched = void 0;
    return true;
  }
  redo() {
    const next = this.#future.pop();
    if (next === void 0) return false;
    this.#past.push(this.#plan);
    this.#plan = this.#validated(next);
    this.#touched = void 0;
    return true;
  }
  /**
   * The same session against a changed record: the student marked a course
   * passed, a placement or a standing, and their edits are theirs to keep
   * (the sponsor's thirteenth review saw an added course vanish). The plan
   * is checked again with the new input, and every later check uses it.
   */
  retarget(input) {
    this.#input = input;
    this.#plan = this.#validated(this.#plan);
  }
  /** Back to the plan the engine produced, in one step that undo can reverse. */
  reset(original) {
    const validated = this.#validated(original);
    this.#past.push(this.#plan);
    this.#future = [];
    this.#plan = validated;
    this.#touched = void 0;
  }
};
function sameShape(a, b) {
  if (a.terms.length !== b.terms.length) return false;
  for (let i = 0; i < a.terms.length; i += 1) {
    const left = a.terms[i];
    const right = b.terms[i];
    if (left.term.year !== right.term.year || left.term.season !== right.term.season) return false;
    if (left.items.length !== right.items.length) return false;
    for (let j = 0; j < left.items.length; j += 1) {
      const one = left.items[j];
      const other = right.items[j];
      if (one.id !== other.id || one.kind !== other.kind) return false;
      if (one.kind === "course" && other.kind === "course" && one.code !== other.code) return false;
      if (one.kind !== "slot" && other.kind !== "slot" && one.done === true !== (other.done === true)) return false;
      if (one.block !== other.block) return false;
    }
  }
  return true;
}

// src/requirements/model.ts
function isGeneralEducation(node) {
  return node.type === "Slot" && node.source === "ge_course_map";
}
function requirementPath(index) {
  return index.length === 0 ? "r" : `r.${index.join(".")}`;
}
function* walk(node, index = []) {
  yield { node, index: [...index], path: requirementPath(index) };
  const children = node.of ?? [];
  for (let i = 0; i < children.length; i += 1) {
    yield* walk(children[i], [...index, i]);
  }
}
function groupChoices(root) {
  const out = [];
  for (const { node, path } of walk(root)) {
    if (node.type !== "OneOf" && node.type !== "NOf" && node.type !== "CreditsFrom") continue;
    const groups = (node.of ?? []).map((child, index) => ({ child, index })).filter(({ child }) => child.group === true && child.label !== void 0 && (child.of?.length ?? 0) > 0).map(({ child, index }) => ({ index, label: child.label }));
    if (groups.length >= 2) out.push({ path, label: node.label ?? node.type, groups });
  }
  return out;
}
function coursesUnder(node) {
  const out = [];
  for (const { node: child } of walk(node)) {
    if (child.type === "Course" && child.code) out.push(child.code);
  }
  return out;
}

// src/requirements/satisfy.ts
var labelOf = (node) => node.label ?? node.code ?? node.slot ?? node.type;
function poolMatches(node, code) {
  const [subject, rawNumber] = code.split(" ");
  if (subject === void 0 || rawNumber === void 0) return false;
  if (node.subject !== void 0 && node.subject !== subject) return false;
  const number = Number.parseInt(rawNumber, 10);
  if (!Number.isFinite(number)) return false;
  if (node.levels?.length) {
    return node.levels.some((level) => number >= level && number < level + 1e3);
  }
  if (node.minLevel !== void 0) return number >= node.minLevel;
  return node.subject !== void 0;
}
function collectSlots(root, held, catalog, chosen) {
  const slots = [];
  const optionsOf = (node) => {
    const out = [];
    for (const child of node.of ?? []) {
      if (child.type === "Course" && child.code) out.push(catalog.canonical(child.code));
    }
    return out;
  };
  const visit = (node, index) => {
    const path = requirementPath(index);
    const kept = applicable(node, path, chosen);
    const children = kept.map(({ child }) => child);
    const eachChild = (fn) => {
      for (const { child, i } of kept) fn(child, i);
    };
    switch (node.type) {
      case "Course":
        if (node.code) {
          slots.push({
            key: path,
            path,
            node,
            label: labelOf(node),
            candidates: [catalog.canonical(node.code)]
          });
        }
        return;
      case "Pool": {
        const candidates = [...held].filter((code) => poolMatches(node, code));
        if (node.n === void 0 && node.credits === void 0) {
          slots.push({ key: path, path, node, label: labelOf(node), candidates });
          return;
        }
        const places = node.n ?? Math.max(1, candidates.length);
        for (let i = 0; i < places; i += 1) {
          slots.push({ key: `${path}#${i}`, path, node, label: labelOf(node), candidates });
        }
        return;
      }
      case "OneOf":
      case "Slot": {
        slots.push({ key: path, path, node, label: labelOf(node), candidates: optionsOf({ ...node, of: children }) });
        eachChild((child, i) => {
          if (child.type !== "Course") visit(child, [...index, i]);
        });
        return;
      }
      case "NOf": {
        const options = optionsOf({ ...node, of: children });
        const need = node.n ?? 1;
        for (let i = 0; i < need; i += 1) {
          slots.push({
            key: `${path}#${i}`,
            path,
            node,
            label: labelOf(node),
            candidates: options
          });
        }
        eachChild((child, i) => {
          if (child.type !== "Course") visit(child, [...index, i]);
        });
        return;
      }
      default:
        eachChild((child, i) => visit(child, [...index, i]));
    }
  };
  visit(root, []);
  return slots;
}
function match(slots, held) {
  const claimedBy = /* @__PURE__ */ new Map();
  const augment = (slotIndex, seen) => {
    for (const course of slots[slotIndex].candidates) {
      if (!held.has(course) || seen.has(course)) continue;
      seen.add(course);
      const holder = claimedBy.get(course);
      if (holder === void 0 || augment(holder, seen)) {
        claimedBy.set(course, slotIndex);
        return true;
      }
    }
    return false;
  };
  const order = slots.map((slot, index) => ({ index, width: slot.candidates.length })).sort((a, b) => a.width - b.width || a.index - b.index);
  for (const { index } of order) augment(index, /* @__PURE__ */ new Set());
  const assignment = /* @__PURE__ */ new Map();
  for (const [course, slotIndex] of claimedBy) {
    assignment.set(slots[slotIndex].key, course);
  }
  return assignment;
}
function applicable(node, path, chosen) {
  const children = (node.of ?? []).map((child, i) => ({ child, i }));
  const choice = chosen?.[path];
  if (choice === void 0) return children;
  if (!children.some(({ child }) => child.group === true && child.label === choice)) return children;
  return children.filter(({ child }) => child.group !== true || child.label === choice);
}
function satisfy(input) {
  const withheld = input.contextWithheld === true;
  const held = new Set([...input.held].map((code) => input.catalog.canonical(code)));
  const chosen = input.chosen;
  const slots = collectSlots(input.requirements, held, input.catalog, chosen);
  const general = slots.filter((slot) => isGeneralEducation(slot.node));
  const assignment = match(slots.filter((slot) => !isGeneralEducation(slot.node)), held);
  for (const [key, code] of match(general, held)) assignment.set(key, code);
  const filledCount = /* @__PURE__ */ new Map();
  for (const slot of slots) {
    if (assignment.has(slot.key)) {
      filledCount.set(slot.path, (filledCount.get(slot.path) ?? 0) + 1);
    }
  }
  const filled = (path) => (filledCount.get(path) ?? 0) > 0;
  const progress = /* @__PURE__ */ new Map();
  for (const slot of slots) {
    if (slot.node.type !== "Pool" || slot.node.n === void 0 && slot.node.credits === void 0) continue;
    const code = assignment.get(slot.key);
    const got = progress.get(slot.path) ?? { count: 0, credits: 0, atLevel: 0 };
    if (code !== void 0) {
      const course = input.catalog.get(code);
      const credits = course ? creditsNominal(course.credits) : 0;
      const number = Number.parseInt(code.split(" ")[1] ?? "", 10);
      got.count += 1;
      got.credits += credits;
      if (slot.node.minCreditsAtLevel !== void 0 && number >= slot.node.minCreditsAtLevel.level) got.atLevel += credits;
    }
    progress.set(slot.path, got);
  }
  const standings = /* @__PURE__ */ new Map();
  const evaluate2 = (node, index) => {
    const path = requirementPath(index);
    const kept = applicable(node, path, chosen);
    const children = kept.map(({ child }) => child);
    const childStandings = kept.map(({ child, i }) => evaluate2(child, [...index, i]));
    const standing = decide(node, path, childStandings, children);
    standings.set(path, standing);
    return standing;
  };
  const decide = (node, path, childStandings, children) => {
    switch (node.type) {
      case "Course":
        if (filled(path)) return "met";
        return withheld ? "unverifiable" : "unmet";
      case "Pool": {
        if (node.n === void 0 && node.credits === void 0) {
          if (filled(path)) return "met";
          return withheld ? "unverifiable" : "unmet";
        }
        if (poolEnough(node, progress.get(path))) return "met";
        return withheld ? "unverifiable" : "unmet";
      }
      case "Slot":
        if (filled(path)) return "met";
        if (node.of === void 0 || node.of.length === 0) return "unverifiable";
        return withheld ? "unverifiable" : "unmet";
      case "Milestone":
        return "unverifiable";
      case "Unparsed":
        return "unverifiable";
      case "OneOf": {
        if (filled(path) || childStandings.includes("met")) return "met";
        return childStandings.includes("unverifiable") ? "unverifiable" : "unmet";
      }
      case "NOf": {
        const need = node.n ?? 1;
        const met = Math.max(
          filledCount.get(path) ?? 0,
          childStandings.filter((s) => s === "met").length
        );
        if (met >= need) return "met";
        const possible = met + childStandings.filter((s) => s === "unverifiable").length;
        return possible >= need ? "unverifiable" : "unmet";
      }
      case "CreditsFrom": {
        const need = node.n ?? node.credits ?? 0;
        const earned = children.reduce(
          (total, child, i) => childStandings[i] === "met" ? total + creditsOfRequirement(child, input.catalog) : total,
          0
        );
        if (earned >= need) return "met";
        const possible = earned + children.reduce(
          (total, child, i) => childStandings[i] === "unverifiable" ? total + creditsOfRequirement(child, input.catalog) : total,
          0
        );
        return possible >= need ? "unverifiable" : "unmet";
      }
      case "AllOf":
      default: {
        if (children.length === 0) return "unverifiable";
        if (childStandings.every((s) => s === "met")) return "met";
        return childStandings.includes("unmet") ? "unmet" : "unverifiable";
      }
    }
  };
  const overall = evaluate2(input.requirements, []);
  const findings = [];
  const collect2 = (node, index) => {
    const path = requirementPath(index);
    const standing = standings.get(path) ?? "unmet";
    if (standing === "met") return;
    const kept = applicable(node, path, chosen);
    const children = kept.map(({ child }) => child);
    const decided = kept.length < (node.of?.length ?? 0);
    if (isReportable(node) && !decided) {
      const childStandings = kept.map(
        ({ i }) => standings.get(requirementPath([...index, i])) ?? "unmet"
      );
      findings.push(finding(node, path, standing, childStandings, children, withheld, progress.get(path)));
      return;
    }
    for (const { child, i } of kept) collect2(child, [...index, i]);
  };
  collect2(input.requirements, []);
  const applied = new Set(assignment.values());
  const unapplied = [...held].filter((code) => !applied.has(code)).sort();
  const creditsApplied = [...applied].reduce((total, code) => {
    const course = input.catalog.get(code);
    return total + (course ? creditsNominal(course.credits) : 0);
  }, 0);
  return {
    standing: overall,
    findings,
    assignment,
    unapplied,
    creditsApplied,
    creditsRequired: input.totalCredits
  };
}
function creditsOfRequirement(node, catalog) {
  if (node.credits !== void 0) return node.credits;
  if (node.type === "Course" && node.code) {
    const course = catalog.get(node.code);
    if (course) return creditsNominal(course.credits);
  }
  if (node.of?.length) {
    return node.of.reduce((total, child) => total + creditsOfRequirement(child, catalog), 0);
  }
  return 3;
}
function isReportable(node) {
  return node.type === "Course" || node.type === "Slot" || node.type === "Pool" || node.type === "Milestone" || node.type === "Unparsed" || node.type === "OneOf" || node.type === "NOf" || node.type === "CreditsFrom";
}
var WITHHELD_REASON = "Coursework completed before this plan was not shared, so this may already be met.";
var NOTHING = { count: 0, credits: 0, atLevel: 0 };
function poolEnough(node, got) {
  const have = got ?? NOTHING;
  if (node.n !== void 0) return have.count >= node.n;
  if (have.credits < (node.credits ?? 0)) return false;
  return node.minCreditsAtLevel === void 0 || have.atLevel >= node.minCreditsAtLevel.credits;
}
function finding(node, path, standing, childStandings, children, withheld, progress) {
  const found2 = describe(node, path, standing, childStandings, children, progress);
  if (withheld && standing === "unverifiable" && found2.reason === void 0 && node.type !== "Milestone" && node.type !== "Unparsed") {
    return { ...found2, reason: WITHHELD_REASON };
  }
  return found2;
}
function describe(node, path, standing, childStandings, children, progress) {
  const label = labelOf(node);
  const options = children.filter((child) => child.type === "Course" && child.code).map((child) => child.code);
  const bundles = children.flatMap((child) => {
    if (child.type !== "AllOf" || child.group === true) return [];
    const leaves = child.of ?? [];
    const codes = leaves.flatMap((leaf2) => leaf2.type === "Course" && leaf2.code ? [leaf2.code] : []);
    return codes.length >= 2 && codes.length === leaves.length ? [{ label: child.label ?? codes.join(" and "), codes }] : [];
  });
  const groups = children.flatMap((child) => {
    if (child.group !== true || child.label === void 0) return [];
    const under = coursesUnder(child);
    return under.length > 0 ? [{ label: child.label, options: under }] : [];
  });
  const listed = {
    ...options.length ? { options } : {},
    ...bundles.length ? { bundles } : {},
    ...groups.length ? { groups } : {}
  };
  const base = { path, label, type: node.type, standing };
  switch (node.type) {
    case "Course":
      return { ...base, ...node.code ? { code: node.code } : {}, message: `${label} is not in the plan.` };
    case "Milestone":
      return {
        ...base,
        message: `${label} is something the planner cannot check.`,
        reason: "Confirm it with an advisor."
      };
    case "Unparsed":
      return {
        ...base,
        message: `${label}`,
        reason: "The system could not read this requirement, so it is not checked."
      };
    case "Slot":
      return {
        ...base,
        message: options.length > 0 || bundles.length > 0 ? `${label} has no course chosen yet.` : `${label} has no course chosen yet, and the program page does not list the options.`,
        ...listed
      };
    case "Pool": {
      const got = progress ?? NOTHING;
      if (node.n !== void 0) {
        return {
          ...base,
          message: `${label} needs ${node.n} ${node.n === 1 ? "course" : "courses"}, and the plan has ${got.count}.`,
          countShort: Math.max(0, node.n - got.count)
        };
      }
      if (node.credits !== void 0) {
        const rider = node.minCreditsAtLevel !== void 0 ? ` ${node.minCreditsAtLevel.credits} of them must be numbered ${node.minCreditsAtLevel.level} or above; the plan has ${got.atLevel}.` : "";
        return {
          ...base,
          message: `${label} needs ${node.credits} credits, and the plan has ${got.credits}.${rider}`,
          creditsShort: Math.max(0, node.credits - got.credits)
        };
      }
      return { ...base, message: `${label} is not satisfied by anything in the plan.` };
    }
    case "OneOf": {
      const name = node.label || (options.length > 0 ? options.join(" or ") : "One of these");
      return {
        ...base,
        label: name,
        message: options.length === 0 && bundles.length > 0 ? `${name} needs one of its combinations, and none is in the plan.` : `${name} needs one course, and none is in the plan.`,
        ...listed
      };
    }
    case "NOf": {
      const need = node.n ?? 1;
      const met = childStandings.filter((s) => s === "met").length;
      return {
        ...base,
        message: `${label} needs ${need} ${need === 1 ? "course" : "courses"}, and the plan has ${met}.`,
        ...listed
      };
    }
    case "CreditsFrom": {
      const need = node.n ?? node.credits ?? 0;
      return {
        ...base,
        message: `${label} needs ${need} credits.`,
        creditsShort: need,
        ...listed
      };
    }
    default:
      return { ...base, message: `${label} is not satisfied.` };
  }
}

// src/requirements/minors.ts
function creditsOf(catalog, code) {
  const course = catalog.get(code);
  return course?.credits === void 0 ? 0 : creditsNominal(course.credits);
}
function minorStanding(candidate, input) {
  const required = candidate.tree.totalCredits ?? candidate.totalCredits;
  const satisfaction = satisfy({
    requirements: candidate.tree.requirements,
    catalog: input.catalog,
    held: input.held,
    ...required !== void 0 ? { totalCredits: required } : {},
    ...input.contextWithheld ? { contextWithheld: true } : {}
  });
  const counted = [...new Set(satisfaction.assignment.values())].sort();
  const covered = satisfaction.creditsApplied;
  const needed = required === void 0 ? void 0 : Math.max(0, required - covered);
  const filled = fittingCourses(satisfaction, input.openPlaces ?? [], input.catalog);
  const fitting = filled.map((fill) => fill.code);
  const fits2 = Math.min(
    needed ?? Number.POSITIVE_INFINITY,
    filled.reduce((sum, fill) => sum + fill.credits, 0)
  );
  return {
    id: candidate.id,
    name: candidate.name,
    department: candidate.department,
    satisfaction,
    covered,
    required,
    needed,
    counted,
    fitting,
    fits: Number.isFinite(fits2) ? fits2 : 0,
    extra: needed === void 0 ? void 0 : Math.max(0, needed - (Number.isFinite(fits2) ? fits2 : 0)),
    sameDepartment: candidate.department !== void 0 && input.majorDepartment !== void 0 && candidate.department === input.majorDepartment
  };
}
function fittingCourses(satisfaction, places, catalog) {
  const wanted = /* @__PURE__ */ new Set();
  for (const finding3 of satisfaction.findings) {
    if (finding3.standing !== "unmet") continue;
    for (const code of finding3.code !== void 0 ? [finding3.code] : []) wanted.add(catalog.canonical(code));
    for (const code of finding3.options ?? []) wanted.add(catalog.canonical(code));
    for (const bundle of finding3.bundles ?? []) for (const code of bundle.codes) wanted.add(catalog.canonical(code));
    for (const group of finding3.groups ?? []) for (const code of group.options) wanted.add(catalog.canonical(code));
  }
  if (wanted.size === 0 || places.length === 0) return [];
  const credits = (code) => creditsOf(catalog, code);
  const candidates = [...wanted].sort((a, b) => credits(b) - credits(a) || a.localeCompare(b));
  const options = places.map((place) => new Set(place.options.map((code) => catalog.canonical(code))));
  const placeOf = /* @__PURE__ */ new Map();
  const augment = (code, seen) => {
    for (let i = 0; i < options.length; i += 1) {
      if (!options[i].has(code) || seen.has(i)) continue;
      seen.add(i);
      const holder = placeOf.get(i);
      if (holder === void 0 || augment(holder, seen)) {
        placeOf.set(i, code);
        return true;
      }
    }
    return false;
  };
  for (const code of candidates) augment(code, /* @__PURE__ */ new Set());
  return [...placeOf.entries()].map(([place, code]) => ({ code, credits: Math.min(credits(code), places[place].credits) })).sort((a, b) => a.code.localeCompare(b.code));
}
function rankMinors(candidates, input) {
  const held = [...input.held];
  const standings = [...candidates].map((candidate) => minorStanding(candidate, { ...input, held }));
  return standings.sort((a, b) => {
    if (a.extra === void 0 || b.extra === void 0) {
      if (a.extra === void 0 && b.extra === void 0) return a.name.localeCompare(b.name);
      return a.extra === void 0 ? 1 : -1;
    }
    return a.extra - b.extra || (a.needed ?? 0) - (b.needed ?? 0) || b.covered - a.covered || a.name.localeCompare(b.name);
  });
}

// src/requirements/doubledip.ts
function doubleDips(root, catalog) {
  const general = /* @__PURE__ */ new Map();
  const also = /* @__PURE__ */ new Map();
  const visit = (node, index, block2) => {
    const path = requirementPath(index);
    if (isGeneralEducation(node)) {
      const label = node.label ?? node.slot ?? "General education";
      for (const child of node.of ?? []) {
        if (child.type === "Course" && child.code) {
          const code = catalog.canonical(child.code);
          if (!general.has(code)) general.set(code, { path, label, category: node.geCategory ?? label });
        }
      }
      return;
    }
    if (node.type === "Course" && node.code) {
      const code = catalog.canonical(node.code);
      const list = also.get(code) ?? [];
      list.push({ path, label: block2 ?? node.label ?? code });
      also.set(code, list);
      return;
    }
    (node.of ?? []).forEach(
      (child, i) => visit(child, [...index, i], index.length === 0 ? child.label ?? block2 : block2)
    );
  };
  visit(root, [], void 0);
  const out = /* @__PURE__ */ new Map();
  for (const [code, ge] of general) {
    const majors = also.get(code);
    if (majors === void 0) continue;
    const outside = majors.filter((m) => !m.path.startsWith(ge.path.split(".").slice(0, 2).join(".")));
    if (outside.length === 0) continue;
    out.set(code, { code, general: ge, also: outside });
  }
  return out;
}
function doubleDipLabel(dip) {
  const blocks2 = [...new Set(dip.also.map((m) => m.label))];
  return `${dip.general.category} and ${blocks2.join(" and ")}`;
}

// src/model/costs.ts
function tuitionBand(credits, table) {
  if (credits <= 0) return void 0;
  if (credits < table.plateau.from) return "below";
  if (credits > table.plateau.to) return "above";
  return "plateau";
}
function registrationTier(earned, table) {
  return [...table.tiers].filter((tier) => earned >= tier.threshold).sort((a, b) => b.threshold - a.threshold)[0];
}
function registrationTerms(table) {
  return [...new Set(table.tiers.flatMap((tier) => Object.keys(tier.opens)))].sort();
}

// src/serialize/plan.ts
var PLAN_FORMAT = 1;
function serializeItem(item) {
  const base = {
    kind: item.kind,
    id: item.id,
    credits: item.credits,
    placement: item.placement
  };
  if (item.kind === "course") {
    base["code"] = item.code;
    base["title"] = item.title;
    if (item.publishedTermIndex !== void 0) {
      base["publishedTermIndex"] = item.publishedTermIndex;
    }
    if (item.forRequirement !== void 0) base["forRequirement"] = item.forRequirement;
    if (item.done === true) base["done"] = true;
    if (item.block !== void 0) base["block"] = item.block;
  } else if (item.kind === "slot") {
    base["slot"] = item.slot;
    base["label"] = item.label;
    if (item.options) base["options"] = item.options;
    if (item.publishedTermIndex !== void 0) {
      base["publishedTermIndex"] = item.publishedTermIndex;
    }
    if (item.block !== void 0) base["block"] = item.block;
  } else {
    base["label"] = item.label;
    if (item.done === true) base["done"] = true;
    if (item.block !== void 0) base["block"] = item.block;
  }
  return base;
}
function serializeProblem(problem) {
  const out = {
    severity: problem.severity,
    kind: problem.kind,
    message: problem.message
  };
  if (problem.rule !== void 0) out["rule"] = problem.rule;
  if (problem.itemId !== void 0) out["itemId"] = problem.itemId;
  if (problem.term !== void 0) out["term"] = termKey(problem.term);
  return out;
}
function deserializePlan(raw) {
  if (typeof raw !== "object" || raw === null) return void 0;
  const document2 = raw;
  if (typeof document2["planFormat"] !== "number") return void 0;
  if (document2["planFormat"] > PLAN_FORMAT) return void 0;
  const terms = document2["terms"];
  if (!Array.isArray(terms)) return void 0;
  try {
    const planTerms = terms.map((entry) => ({
      term: parseTerm(String(entry["term"])),
      items: entry["items"].map(deserializeItem)
    }));
    return {
      id: String(document2["id"] ?? ""),
      programId: String(document2["programId"] ?? ""),
      catalogYear: String(document2["catalogYear"] ?? ""),
      start: parseTerm(String(document2["start"])),
      terms: planTerms,
      // Re-derived rather than restored: a stored verdict is a claim about a
      // plan the checker has not seen, and FR-VAL-01 says the engine checks
      // what is in front of it.
      problems: [],
      appliedCredit: document2["appliedCredit"] ?? [],
      meta: document2["meta"] ?? {
        dataVersion: "",
        builtAt: "",
        engineVersion: "",
        source: ""
      }
    };
  } catch {
    return void 0;
  }
}
function deserializeItem(raw) {
  const credits = raw["credits"];
  const base = {
    id: String(raw["id"]),
    credits,
    placement: raw["placement"],
    // Which part of a summer it sits in, where it sits in one.
    ...raw["block"] === "1" || raw["block"] === "2" ? { block: raw["block"] } : {}
  };
  if (raw["kind"] === "slot") {
    return {
      ...base,
      kind: "slot",
      slot: String(raw["slot"]),
      label: String(raw["label"]),
      ...raw["options"] ? { options: raw["options"] } : {},
      ...raw["publishedTermIndex"] !== void 0 ? { publishedTermIndex: Number(raw["publishedTermIndex"]) } : {}
    };
  }
  if (raw["kind"] === "named") {
    return {
      ...base,
      kind: "named",
      label: String(raw["label"]),
      placement: "named",
      ...raw["done"] === true ? { done: true } : {}
    };
  }
  return {
    ...base,
    kind: "course",
    code: String(raw["code"]),
    title: String(raw["title"] ?? raw["code"]),
    ...raw["forRequirement"] !== void 0 ? { forRequirement: String(raw["forRequirement"]) } : {},
    ...raw["publishedTermIndex"] !== void 0 ? { publishedTermIndex: Number(raw["publishedTermIndex"]) } : {},
    ...raw["done"] === true ? { done: true } : {}
  };
}
function serializePlan(plan, context, extra = {}, graduation) {
  return {
    planFormat: PLAN_FORMAT,
    id: plan.id,
    programId: plan.programId,
    catalogYear: plan.catalogYear,
    start: termKey(plan.start),
    terms: plan.terms.map((term2) => ({
      term: termKey(term2.term),
      items: term2.items.map(serializeItem)
    })),
    appliedCredit: plan.appliedCredit.map((applied) => ({ ...applied })),
    claims: {
      problems: plan.problems.map(serializeProblem),
      errorCount: plan.problems.filter((p) => p.severity === "error").length,
      ...graduation !== void 0 ? { graduation: graduation.map((g) => ({ ruleId: g.ruleId, kind: g.kind, standing: g.standing })) } : {}
    },
    context,
    meta: { ...plan.meta, ...extra }
  };
}

// src/reflow/generate.ts
var GENERATED_SOURCE = "planner_generated";
var CREDITS_PER_TERM = 15;
var OVERFILL = 1;
var COURSE_SLACK = 1;
var SMALLEST_COURSE_CAP = 4;
var CALENDAR_START = term(2026, "F");
var levelOf = (code) => {
  const number = Number.parseInt(code.split(" ")[1] ?? "", 10);
  return Number.isFinite(number) ? number : 0;
};
var slug = (label) => "@" + (label.replace(/\(.*?\)/g, " ").replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/).slice(0, 3).join("_").toUpperCase() || "REQUIREMENT");
function creditsFor(node, code, catalog, notes) {
  if (node.credits !== void 0 && node.credits > 0) return node.credits;
  const record = catalog.get(code);
  if (record?.credits !== void 0) {
    const credits = creditsNominal(record.credits);
    if (credits > 0) return credits;
  }
  notes.add(`No credit figure on record for ${code}; three assumed.`);
  return 3;
}
function commonest(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best;
  let bestCount = 0;
  for (const [value, count2] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (count2 > bestCount) {
      best = value;
      bestCount = count2;
    }
  }
  return best;
}
function typicalCredits(options, catalog) {
  const known = [];
  for (const code of options) {
    const record = catalog.get(code);
    if (record?.credits === void 0) continue;
    const credits = creditsNominal(record.credits);
    if (credits > 0) known.push(credits);
  }
  return commonest(known) ?? 3;
}
function honorsBase(options) {
  if (options.length < 2) return void 0;
  const bases = new Set(options.map((code) => code.replace(/H$/, "")));
  if (bases.size !== 1) return void 0;
  const base = [...bases][0];
  return options.includes(base) ? base : void 0;
}
function typicalMemberCredits(node, catalog) {
  const values = (node.of ?? []).map((member) => memberCredits(member, catalog)).filter((value) => value !== void 0 && value > 0);
  return commonest(values);
}
function memberCredits(member, catalog) {
  switch (member.type) {
    case "Course": {
      const record = member.code === void 0 ? void 0 : catalog.get(catalog.canonical(member.code));
      const own = record?.credits === void 0 ? void 0 : creditsNominal(record.credits);
      if (own !== void 0 && own > 0) return own;
      return member.credits !== void 0 && member.credits > 0 ? member.credits : void 0;
    }
    case "AllOf": {
      const parts = member.of ?? [];
      if (parts.length === 0 || parts.some((part) => part.type !== "Course" || part.code === void 0)) return void 0;
      const each = parts.map((part) => memberCredits(part, catalog));
      if (each.some((value) => value === void 0)) return void 0;
      const codes = parts.map((part) => catalog.canonical(part.code));
      const linked = (code) => codes.some((other) => other !== code && ((catalog.get(other)?.corequisites ?? []).map((c) => catalog.canonical(c)).includes(code) || (catalog.get(code)?.corequisites ?? []).map((c) => catalog.canonical(c)).includes(other)));
      const isLab = (code) => /\b(lab|laboratory)\b/i.test(catalog.get(code)?.title ?? "");
      const loose = codes.filter((code) => !linked(code) && !isLab(code));
      return loose.length <= 1 ? each.reduce((sum, value) => sum + value, 0) : commonest(each);
    }
    default:
      return member.of === void 0 ? void 0 : typicalMemberCredits(member, catalog);
  }
}
function splitCredits(total, each) {
  if (total <= each * 1.5) return [total];
  const count2 = Math.ceil(total / each);
  const base = Math.floor(total / count2);
  const extra = total - base * count2;
  return Array.from({ length: count2 }, (_, i) => base + (i < extra ? 1 : 0));
}
var labelFor = (node, options) => {
  if (node.label) return node.label.replace(/\s*\d+$/, "").replace(/:\s*$/, "").trim() || node.label;
  if (node.slot) return node.slot;
  if (options.length > 0 && options.length <= 3) return options.join(" or ");
  if (options.length > 3) return `${options[0]} or ${options.length - 1} others`;
  return node.type;
};
function collect(root, catalog, notes) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const visit = (node, path, underGeneral = false) => {
    const general = underGeneral || /general education/i.test(node.label ?? "");
    switch (node.type) {
      case "AllOf": {
        (node.of ?? []).forEach((child, i) => visit(child, `${path}.${i}`, general));
        return;
      }
      case "Course": {
        if (node.code === void 0) return;
        const code = catalog.canonical(node.code);
        if (seen.has(code)) return;
        seen.add(code);
        out.push({ kind: "course", code, credits: creditsFor(node, code, catalog, notes) });
        return;
      }
      case "OneOf":
      case "NOf":
      case "CreditsFrom":
      case "Pool":
      case "Slot": {
        const options = [...new Set(coursesUnder(node).map((code) => catalog.canonical(code)))];
        const plain = node.type === "OneOf" ? honorsBase(options) : void 0;
        if (plain !== void 0) {
          visit({ type: "Course", code: plain }, path, general);
          return;
        }
        const each = (node.type === "OneOf" ? typicalMemberCredits(node, catalog) : void 0) ?? typicalCredits(options, catalog);
        const generalEducation = general || isGeneralEducation(node);
        const early = generalEducation || options.length > 0 && options.every((code) => levelOf(code) < 3e3);
        let sizes;
        if (node.type === "OneOf") sizes = node.credits !== void 0 ? splitCredits(node.credits, each) : [each];
        else if (node.type === "NOf") sizes = Array.from({ length: Math.max(1, node.n ?? 1) }, () => each);
        else if (node.type === "CreditsFrom") sizes = splitCredits(node.credits ?? node.n ?? each, each);
        else sizes = splitCredits(node.credits ?? (node.n !== void 0 ? node.n * each : each), each);
        const label = labelFor(node, options);
        const slotName = generalEducation ? "@GE" : slug(label);
        for (const credits of sizes.filter((size) => size > 0)) {
          out.push({ kind: "slot", credits, label, slotName, path, options, early });
        }
        return;
      }
      case "Milestone":
      case "Unparsed": {
        notes.add(
          `"${node.label ?? node.type}" is a requirement the sequence cannot place as a course; it is still checked under Program requirements.`
        );
        return;
      }
    }
  };
  visit(root, "r");
  return out;
}
function depths(courses, catalog) {
  const inSet = new Set(courses.map((c) => c.code));
  const needs = /* @__PURE__ */ new Map();
  for (const wanted of courses) {
    const before = [...new Set(prereqCourses(catalog.get(wanted.code)?.prerequisites).map((code) => catalog.canonical(code)))].filter((code) => inSet.has(code) && code !== wanted.code);
    needs.set(wanted.code, before);
  }
  const depth = /* @__PURE__ */ new Map();
  const visiting = /* @__PURE__ */ new Set();
  const of = (code) => {
    const known = depth.get(code);
    if (known !== void 0) return known;
    if (visiting.has(code)) return 0;
    visiting.add(code);
    const d = (needs.get(code) ?? []).reduce((most, other) => Math.max(most, of(other) + 1), 0);
    visiting.delete(code);
    depth.set(code, d);
    return d;
  };
  for (const code of inSet) of(code);
  return depth;
}
function generateGrid(input) {
  const { catalog, offerings } = input;
  const seasons = input.seasons ?? ["F", "P"];
  const perTerm = input.creditsPerTerm ?? CREDITS_PER_TERM;
  const notes = /* @__PURE__ */ new Set();
  const wanted = collect(input.tree.requirements, catalog, notes);
  const courses = wanted.filter((w) => w.kind === "course");
  const openSlots = wanted.filter((w) => w.kind === "slot");
  const total = input.tree.totalCredits ?? input.program.credits ?? wanted.reduce((sum, w) => sum + w.credits, 0);
  const listed = wanted.reduce((sum, w) => sum + w.credits, 0);
  const electives = [];
  if (total > listed) {
    for (const credits of splitCredits(total - listed, 3)) {
      electives.push({ kind: "slot", credits, label: "Elective", slotName: "@ELECTIVE", options: [], early: false });
    }
    notes.add(
      `The requirement table accounts for ${listed} of the ${total} credits the degree requires; the other ${total - listed} are placed as open elective slots.`
    );
  } else if (listed > total * 1.1) {
    notes.add(
      `The requirement table lists ${listed} credits against the ${total} the degree requires. Where it describes tracks of which one is taken, the sequence carries them all, as the requirement check does.`
    );
  }
  const depth = depths(courses, catalog);
  const ordered = [...courses].sort(
    (a, b) => (depth.get(a.code) ?? 0) - (depth.get(b.code) ?? 0) || levelOf(a.code) - levelOf(b.code) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
  );
  const creditsInCourses = ordered.reduce((sum, w) => sum + w.credits, 0);
  const allCredits = creditsInCourses + [...openSlots, ...electives].reduce((sum, w) => sum + w.credits, 0);
  let termCount = Math.max(1, Math.ceil(allCredits / (perTerm + OVERFILL)));
  const calendar = termSequence(CALENDAR_START, 200, seasons);
  const load2 = [];
  const placed = /* @__PURE__ */ new Map();
  const byTerm = [];
  const ensure = (index) => {
    while (byTerm.length <= index) {
      byTerm.push([]);
      load2.push(0);
    }
  };
  ensure(termCount - 1);
  const courseCap = Math.max(SMALLEST_COURSE_CAP, Math.ceil(creditsInCourses / termCount) + COURSE_SLACK);
  const supportAt = (code, index) => seasonSupport(offerings, code, calendar[index] ?? calendar[calendar.length - 1]);
  const bestSupport = (code) => Math.min(...calendar.slice(0, seasons.length).map((at) => seasonSupport(offerings, code, at)));
  const seasonAllowed = (code, index) => supportAt(code, index) <= bestSupport(code);
  const runsSomewhere = (code) => bestSupport(code) === 0;
  const seenAnywhere = (code) => ["F", "P", "S"].some((season) => offerings.availability(code, term(CALENDAR_START.year, season)).verdict === "runs");
  const byCode = new Map(ordered.map((w) => [w.code, w]));
  const seasonWords = seasons.map(seasonWord).join(" or ");
  const related = (code) => {
    const record = catalog.get(code);
    const inSet = (codes) => [...new Set(codes.map((c) => catalog.canonical(c)))].filter((c) => c !== code && byCode.has(c)).map((c) => byCode.get(c));
    return { before: inSet(prereqCourses(record?.prerequisites)), beside: inSet(record?.corequisites ?? []) };
  };
  const floorOf = (code) => {
    const { before, beside } = related(code);
    const known = (w) => placed.has(w.code) && Number.isFinite(placed.get(w.code));
    const after = before.filter(known).reduce((latest, w) => Math.max(latest, placed.get(w.code) + 1), 0);
    const with_ = beside.filter(known).reduce((latest, w) => Math.max(latest, placed.get(w.code)), 0);
    return Math.max(after, with_);
  };
  const put = (wanted2, index) => {
    ensure(index);
    byTerm[index].push(wanted2);
    load2[index] = (load2[index] ?? 0) + wanted2.credits;
    placed.set(wanted2.code, index);
  };
  const initialTerms = termCount;
  const levels = [...new Set(courses.map((w) => Math.floor(levelOf(w.code) / 1e3)))].sort((a, b) => a - b);
  const levelFloor = (level) => {
    const rank = levels.indexOf(Math.floor(level / 1e3));
    if (rank <= 0) return 0;
    return Math.min(initialTerms - 1, Math.round(rank / levels.length * initialTerms));
  };
  const place = (wanted2, trail) => {
    const code = wanted2.code;
    if (placed.has(code) || trail.has(code)) return;
    trail.add(code);
    const { before, beside } = related(code);
    for (const needed of before) place(needed, trail);
    const companions = beside.filter((w) => !placed.has(w.code) && !trail.has(w.code));
    for (const companion of companions) {
      for (const needed of related(companion.code).before) {
        if (needed.code !== code) place(needed, trail);
      }
    }
    const group = [wanted2, ...companions.filter((w) => !placed.has(w.code))].filter((w) => {
      if (runsSomewhere(w.code) || !seenAnywhere(w.code)) return true;
      notes.add(`${w.code} has not run in ${seasonWords} on the record, only in summer; it is left for you to place in a summer term.`);
      placed.set(w.code, Number.POSITIVE_INFINITY);
      return false;
    });
    if (group.length === 0) {
      trail.delete(code);
      return;
    }
    const floor = Math.max(...group.map((w) => Math.max(floorOf(w.code), levelFloor(levelOf(w.code)))));
    const credits = group.reduce((sum, w) => sum + w.credits, 0);
    for (const member of group) {
      if (!runsSomewhere(member.code)) {
        notes.add(`${member.code} has never been scheduled on the record; it is placed where its prerequisites allow.`);
      }
    }
    let index = floor;
    for (; index < floor + 400; index += 1) {
      ensure(index);
      const room = (load2[index] ?? 0) + credits <= courseCap || (load2[index] ?? 0) === 0;
      const season = group.every((w) => seasonAllowed(w.code, index));
      if (room && season) break;
    }
    for (const member of group) put(member, index);
    trail.delete(code);
  };
  for (const wanted2 of ordered) place(wanted2, /* @__PURE__ */ new Set());
  termCount = Math.max(termCount, byTerm.length);
  const firstHalf = Math.max(1, Math.ceil(termCount / 2));
  const lightest = (from, limit) => {
    let best = Math.min(from, termCount - 1);
    for (let i = best + 1; i < limit; i += 1) if ((load2[i] ?? 0) < (load2[best] ?? 0)) best = i;
    return best;
  };
  const bySlot = [...openSlots.filter((s) => s.early), ...openSlots.filter((s) => !s.early), ...electives];
  for (const slot of bySlot) {
    const floor = slot.options.length > 0 ? levelFloor(Math.min(...slot.options.map(levelOf))) : 0;
    let index = lightest(floor, slot.early ? Math.max(firstHalf, floor + 1) : termCount);
    if (slot.early && (load2[index] ?? 0) >= perTerm) index = lightest(floor, termCount);
    byTerm[index].push(slot);
    load2[index] = (load2[index] ?? 0) + slot.credits;
  }
  const bindings = [];
  const terms = byTerm.map((items, i) => {
    const index = i + 1;
    const gridItems = items.map(
      (w) => w.kind === "course" ? { kind: "course", code: w.code, credits: w.credits } : { kind: "slot", slot: w.slotName, label: w.label, credits: w.credits }
    );
    items.forEach((w, position) => {
      if (w.kind === "slot" && w.path !== void 0) {
        bindings.push({
          slot: gridItemId(index, position),
          requirement: w.path,
          label: w.label,
          basis: "placed by the planner for this requirement when the sequence was built",
          confidence: "high"
        });
      }
    });
    return { index, items: gridItems };
  });
  const title = input.program.degree ? `${input.program.name}, ${input.program.degree}` : input.program.name;
  return {
    grid: {
      programId: input.program.id,
      catalogYear: input.catalogYear,
      source: GENERATED_SOURCE,
      seasons,
      terms,
      meta: { name: input.program.name, degree: input.program.degree, title, totalCredits: total }
    },
    bindings,
    notes: [...notes].sort()
  };
}

// src/reflow/index.ts
function reflow(input) {
  const bound = bind(input.grid, input.start);
  const { remaining, applied } = apply(input.grid, bound, input.catalog, input.context);
  const remainingCredits = remaining.reduce((sum, b) => sum + b.credits, 0);
  const largest = remaining.reduce((most, b) => Math.max(most, b.credits), 0);
  let maxCredits = input.maxCreditsPerTerm ?? input.context.constraints?.maxCreditsPerTerm ?? DEFAULT_MAX_CREDITS;
  if (input.pace === void 0) {
    let cap = maxCredits;
    if (input.capAsPublished) {
      const loads = publishedLoads(input.grid, input.catalog);
      const byTerm = /* @__PURE__ */ new Map();
      input.grid.terms.forEach((gridTerm, i) => {
        const at = bound.get(gridTerm.index);
        if (at !== void 0) byTerm.set(termKey(at), Math.max(loads[i] ?? 0, largest));
      });
      maxCredits = Math.max(largest, 1, ...loads);
      const peak = maxCredits;
      cap = (term2) => byTerm.get(termKey(term2)) ?? peak;
    }
    compact(remaining, input.catalog, input.offerings, input.context, cap, input.start, input.grid.seasons);
  } else if ("maxCredits" in input.pace) {
    maxCredits = Math.max(largest, 1, Math.round(input.pace.maxCredits));
    spread(remaining, input.catalog, input.offerings, input.context, maxCredits, input.start, input.pace.seasons);
  } else {
    const terms2 = Math.max(1, input.pace.terms);
    const floor = Math.max(largest, Math.ceil(remainingCredits / terms2));
    const ceiling = Math.max(floor, DEFAULT_MAX_CREDITS);
    for (let cap = floor; cap <= ceiling; cap += 1) {
      maxCredits = cap;
      spread(
        remaining,
        input.catalog,
        input.offerings,
        input.context,
        cap,
        input.start,
        input.pace.seasons
      );
      if (countTerms(remaining) <= terms2) break;
    }
  }
  const terms = assemble(remaining, input.catalog);
  const publishedLast = lastTerm([...bound.values()]);
  const reflowedLast = lastTerm(terms.map((t) => t.term));
  const draft = {
    id: planId(input.grid, input.start, input.context),
    programId: input.grid.programId,
    catalogYear: input.grid.catalogYear,
    start: input.start,
    terms,
    problems: [],
    appliedCredit: applied,
    meta: input.meta
  };
  const checkInput = {
    catalog: input.catalog,
    offerings: input.offerings,
    context: input.context,
    maxCreditsPerTerm: maxCredits,
    ...publishedCredits(input.grid)
  };
  const plan = { ...draft, problems: check(draft, checkInput) };
  return {
    plan,
    changed: remaining.some((b) => compareTerms(b.placedTerm, b.boundTerm) !== 0),
    termsSaved: reflowedLast !== void 0 && publishedLast !== void 0 && compareTerms(reflowedLast, publishedLast) > 0 ? -countTermsBetween(publishedLast, reflowedLast, input.pace?.seasons ?? input.grid.seasons) : countTermsBetween(reflowedLast, publishedLast, input.grid.seasons),
    maxCreditsPerTerm: maxCredits,
    remainingCredits
  };
}
function yearsWord(n) {
  return `${Number.isInteger(n) ? n : `${Math.floor(n)}\xBD`} ${n === 1 ? "year" : "years"}`;
}
function yearsSpanned(start, last, seasons) {
  const terms = countTermsBetween(start, last, seasons) + 1;
  return Math.max(0.5, Math.round(terms / Math.max(1, seasons.length) * 2) / 2);
}
function countTerms(items) {
  return new Set(items.map((b) => termKey(b.placedTerm))).size;
}
function publishedLoads(grid, catalog) {
  return grid.terms.map((t) => t.items.reduce((sum, item) => sum + gridItemCredits(item, catalog), 0));
}
function publishedCredits(grid) {
  const printed = /* @__PURE__ */ new Map();
  for (const gridTerm of grid.terms) {
    if (gridTerm.credits !== void 0) printed.set(gridTerm.index, gridTerm.credits);
  }
  return printed.size > 0 ? { publishedCredits: printed } : {};
}
function assemble(items, catalog) {
  const byTerm = /* @__PURE__ */ new Map();
  for (const bound of items) {
    const key = termKey(bound.placedTerm);
    const bucket = byTerm.get(key) ?? { term: bound.placedTerm, items: [] };
    bucket.items.push(toPlanItem(bound, catalog));
    byTerm.set(key, bucket);
  }
  return [...byTerm.values()].sort((a, b) => compareTerms(a.term, b.term)).map((t) => ({ term: t.term, items: t.items }));
}
function toPlanItem(bound, catalog) {
  const moved = compareTerms(bound.placedTerm, bound.boundTerm) !== 0;
  const placement = moved ? "moved" : "published";
  if (bound.item.kind === "slot") {
    return {
      kind: "slot",
      id: bound.id,
      slot: bound.item.slot,
      label: bound.item.label,
      credits: bound.item.credits,
      placement,
      from: bound.id,
      publishedTermIndex: bound.gridTermIndex,
      ...bound.item.options ? { options: bound.item.options } : {}
    };
  }
  const code = bound.code ?? (bound.item.kind === "course" ? bound.item.code : "");
  const course = catalog.get(code);
  return {
    kind: "course",
    id: bound.id,
    code,
    title: course?.title ?? code,
    credits: course?.credits ?? bound.credits,
    placement,
    from: bound.id,
    publishedTermIndex: bound.gridTermIndex,
    ...bound.item.kind === "choice" && bound.item.label !== void 0 ? { forRequirement: bound.item.label } : {}
  };
}
function lastTerm(terms) {
  return terms.reduce(
    (latest, t) => latest === void 0 || compareTerms(latest, t) < 0 ? t : latest,
    void 0
  );
}
function countTermsBetween(earlier, later, seasons) {
  if (earlier === void 0 || later === void 0) return 0;
  let count2 = 0;
  let cursor = earlier;
  while (compareTerms(cursor, later) < 0 && count2 < 64) {
    count2 += 1;
    cursor = nextTerm(cursor, seasons);
  }
  return count2;
}
function planId(grid, start, context) {
  return planIdFor(grid.programId, grid.catalogYear, start, context);
}
function planIdFor(programId, catalogYear, start, context) {
  const completed = (context.completed ?? []).map((c) => c.code).sort().join(",");
  const seed = `${programId}|${catalogYear}|${termKey(start)}|${completed}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `p${(hash >>> 0).toString(36)}`;
}

// src/serialize/share.ts
var LINK_FORMAT = 1;
var LINK_PARAMETER = "plan";
var CONTEXT_FIELDS = [
  "completed",
  "inProgress",
  "placement",
  "standing",
  "chosen",
  "minor",
  "minors",
  "majors",
  "majorChoices",
  "constraints",
  "catalogYear"
];
function shareDocument(plan, context, options) {
  const full = serializePlan(plan, context, options.extra ?? {});
  const includes = options.withContext ? CONTEXT_FIELDS.filter((field) => context[field] !== void 0) : [];
  const terms = options.withContext ? full.terms : full.terms.map((planTerm) => ({
    ...planTerm,
    items: planTerm.items.map(({ done: _done, ...rest }) => rest)
  }));
  if (includes.length === 0) {
    return {
      planFormat: full.planFormat,
      // The id the same plan has under no context. The real one is seeded from
      // the completed coursework, and this link says nothing about that.
      id: planIdFor(plan.programId, plan.catalogYear, plan.start, EMPTY_CONTEXT),
      programId: full.programId,
      catalogYear: full.catalogYear,
      start: full.start,
      terms,
      meta: full.meta,
      includes: []
    };
  }
  const carried = {};
  for (const field of includes) carried[field] = context[field];
  return {
    planFormat: full.planFormat,
    id: full.id,
    programId: full.programId,
    catalogYear: full.catalogYear,
    start: full.start,
    terms,
    meta: full.meta,
    includes,
    context: carried,
    appliedCredit: full.appliedCredit
  };
}
async function encodeShare(document2) {
  const bytes = new TextEncoder().encode(JSON.stringify(document2));
  return `${LINK_PARAMETER}=${LINK_FORMAT}.${toBase64Url(await deflate(bytes))}`;
}
async function shareLink(pageHref, document2) {
  const hash = pageHref.indexOf("#");
  const base = hash >= 0 ? pageHref.slice(0, hash) : pageHref;
  return `${base}#${await encodeShare(document2)}`;
}
var NOT_A_PLAN = "This link does not hold a plan this page can read.";
var DAMAGED = "This link is damaged, or was cut short when it was copied.";
var MAX_BYTES = 4 * 1024 * 1024;
var refused = (reason) => ({ kind: "refused", reason });
async function openShare(linkOrFragment) {
  const hash = linkOrFragment.indexOf("#");
  const fragment = hash >= 0 ? linkOrFragment.slice(hash + 1) : linkOrFragment;
  const value = new URLSearchParams(fragment).get(LINK_PARAMETER);
  if (value === null || value === "") return { kind: "none" };
  const dot = value.indexOf(".");
  const format = dot > 0 ? Number(value.slice(0, dot)) : Number.NaN;
  if (!Number.isInteger(format) || format < 1) return refused(NOT_A_PLAN);
  if (format > LINK_FORMAT) {
    return refused(
      `This link was made by a newer version of the planner (link format ${format}; this page reads up to ${LINK_FORMAT}).`
    );
  }
  const payload = value.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) return refused(DAMAGED);
  let raw;
  try {
    const bytes = await inflate(fromBase64Url(payload), MAX_BYTES);
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return refused(DAMAGED);
  }
  return openDocument(raw);
}
function openDocument(raw) {
  if (!isRecord(raw)) return refused(NOT_A_PLAN);
  const planFormat = raw["planFormat"];
  if (typeof planFormat !== "number" || !Number.isInteger(planFormat) || planFormat < 1) {
    return refused(NOT_A_PLAN);
  }
  if (planFormat > PLAN_FORMAT) {
    return refused(
      `This plan was written by a newer version of the planner (plan format ${planFormat}; this page reads up to ${PLAN_FORMAT}).`
    );
  }
  const includes = readIncludes(raw["includes"]);
  if (includes === void 0) {
    return refused("This link does not say what it includes, so it was not opened.");
  }
  let context;
  if (includes.length === 0) {
    if (raw["context"] !== void 0 || raw["appliedCredit"] !== void 0) {
      return refused(
        "This link carries student information it does not declare, so it was not opened."
      );
    }
  } else {
    context = validateContext(raw["context"], includes);
    if (context === void 0) {
      return refused(
        "This link says it includes the student's information, and what it carries is not in the form the planner writes, so it was not opened."
      );
    }
  }
  const plan = deserializePlan(raw);
  if (plan === void 0) return refused(NOT_A_PLAN);
  const flaw = wellFormed(plan);
  if (flaw !== void 0) return refused(`This link does not hold a well-formed plan: ${flaw}.`);
  return {
    kind: "opened",
    plan,
    includes,
    context,
    document: raw
  };
}
function readIncludes(raw) {
  if (!Array.isArray(raw) || raw.length > CONTEXT_FIELDS.length) return void 0;
  const out = [];
  for (const entry of raw) {
    if (!isContextField(entry) || out.includes(entry)) return void 0;
    out.push(entry);
  }
  return out;
}
var isContextField = (value) => typeof value === "string" && CONTEXT_FIELDS.includes(value);
var CREDIT_SOURCES = /* @__PURE__ */ new Set([
  "uvu",
  "transfer",
  "concurrent_enrollment",
  "ap",
  "clep",
  "prior_learning"
]);
function validateContext(raw, includes) {
  if (!isRecord(raw)) return void 0;
  const keys = Object.keys(raw).sort();
  if (keys.join("|") !== [...includes].sort().join("|")) return void 0;
  const out = {};
  if (includes.includes("completed")) {
    const list = raw["completed"];
    if (!Array.isArray(list) || list.length > 400) return void 0;
    const completed = [];
    for (const entry of list) {
      if (!isRecord(entry)) return void 0;
      const allowed = /* @__PURE__ */ new Set(["code", "grade", "source", "institution", "credits"]);
      if (Object.keys(entry).some((key) => !allowed.has(key))) return void 0;
      if (!isText(entry["code"], 1, 24)) return void 0;
      const course = { code: entry["code"] };
      if (entry["grade"] !== void 0) {
        if (!isText(entry["grade"], 1, 4)) return void 0;
        course["grade"] = entry["grade"];
      }
      if (entry["source"] !== void 0) {
        if (typeof entry["source"] !== "string" || !CREDIT_SOURCES.has(entry["source"])) {
          return void 0;
        }
        course["source"] = entry["source"];
      }
      if (entry["institution"] !== void 0) {
        if (!isText(entry["institution"], 0, 80)) return void 0;
        course["institution"] = entry["institution"];
      }
      if (entry["credits"] !== void 0) {
        if (!isNumber(entry["credits"], 0, 30)) return void 0;
        course["credits"] = entry["credits"];
      }
      completed.push(course);
    }
    out["completed"] = completed;
  }
  if (includes.includes("inProgress")) {
    const list = raw["inProgress"];
    if (!Array.isArray(list) || list.length > 60) return void 0;
    if (!list.every((code) => isText(code, 1, 24))) return void 0;
    out["inProgress"] = [...list];
  }
  if (includes.includes("placement")) {
    const placement = raw["placement"];
    if (!isRecord(placement)) return void 0;
    const entries = Object.entries(placement);
    if (entries.length > 10) return void 0;
    for (const [subject, code] of entries) {
      if (!isText(subject, 1, 24) || !isText(code, 1, 24)) return void 0;
    }
    out["placement"] = { ...placement };
  }
  if (includes.includes("standing")) {
    const standing = raw["standing"];
    if (!isRecord(standing)) return void 0;
    const entries = Object.entries(standing);
    if (entries.length > 60) return void 0;
    for (const [name, held] of entries) {
      if (!isText(name, 1, 160) || typeof held !== "boolean") return void 0;
    }
    out["standing"] = { ...standing };
  }
  if (includes.includes("chosen")) {
    const chosen = raw["chosen"];
    if (!isRecord(chosen)) return void 0;
    const entries = Object.entries(chosen);
    if (entries.length > 10) return void 0;
    for (const [path, label] of entries) {
      if (!isText(path, 1, 40) || !/^r(\.\d{1,3})*$/.test(path)) return void 0;
      if (!isText(label, 1, 120)) return void 0;
    }
    out["chosen"] = { ...chosen };
  }
  if (includes.includes("minor")) {
    const minor = raw["minor"];
    if (!isText(minor, 1, 120) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(minor)) return void 0;
    out["minor"] = minor;
  }
  for (const field of ["minors", "majors"]) {
    if (!includes.includes(field)) continue;
    const list = raw[field];
    if (!Array.isArray(list) || list.length > 10) return void 0;
    if (!list.every((id) => isText(id, 1, 120) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))) return void 0;
    out[field] = [...list];
  }
  if (includes.includes("majorChoices")) {
    const byMajor = raw["majorChoices"];
    if (!isRecord(byMajor)) return void 0;
    const majors = Object.entries(byMajor);
    if (majors.length > 10) return void 0;
    const kept = {};
    for (const [id, chosen] of majors) {
      if (!isText(id, 1, 120) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return void 0;
      if (!isRecord(chosen)) return void 0;
      const entries = Object.entries(chosen);
      if (entries.length === 0 || entries.length > 10) return void 0;
      for (const [path, label] of entries) {
        if (!isText(path, 1, 40) || !/^r(\.\d{1,3})*$/.test(path)) return void 0;
        if (!isText(label, 1, 120)) return void 0;
      }
      kept[id] = { ...chosen };
    }
    out["majorChoices"] = kept;
  }
  if (includes.includes("constraints")) {
    const constraints = raw["constraints"];
    if (!isRecord(constraints)) return void 0;
    const allowed = /* @__PURE__ */ new Set(["maxCreditsPerTerm", "modality", "campus"]);
    if (Object.keys(constraints).some((key) => !allowed.has(key))) return void 0;
    const kept = {};
    if (constraints["maxCreditsPerTerm"] !== void 0) {
      if (!isNumber(constraints["maxCreditsPerTerm"], 1, 30)) return void 0;
      kept["maxCreditsPerTerm"] = constraints["maxCreditsPerTerm"];
    }
    for (const field of ["modality", "campus"]) {
      const list = constraints[field];
      if (list === void 0) continue;
      if (!Array.isArray(list) || list.length > 10 || !list.every((v) => isText(v, 1, 40))) {
        return void 0;
      }
      kept[field] = [...list];
    }
    out["constraints"] = kept;
  }
  if (includes.includes("catalogYear")) {
    if (!isText(raw["catalogYear"], 1, 16)) return void 0;
    out["catalogYear"] = raw["catalogYear"];
  }
  return out;
}
var PLACEMENTS = /* @__PURE__ */ new Set(["published", "moved", "added", "swapped", "named"]);
var MAX_TERMS = 60;
var MAX_ITEMS = 500;
function wellFormed(plan) {
  if (!isText(plan.programId, 1, 80)) return "it names no program";
  if (!isText(plan.catalogYear, 0, 32)) return "its catalog year is not text";
  if (!isText(plan.id, 0, 64)) return "its id is not text";
  if (!isRecord(plan.meta)) return "it carries no provenance";
  for (const field of ["dataVersion", "builtAt", "engineVersion", "source"]) {
    if (!isText(plan.meta[field], 0, 120)) return `its provenance has no ${field}`;
  }
  if (!isTerm(plan.start)) return "its starting term is not a term";
  if (plan.terms.length > MAX_TERMS) return `it has more than ${MAX_TERMS} terms`;
  let previous;
  const ids = /* @__PURE__ */ new Set();
  let count2 = 0;
  for (const planTerm of plan.terms) {
    if (!isTerm(planTerm.term)) return "a term is not a term";
    if (previous !== void 0 && compareTerms(previous, planTerm.term) >= 0) {
      return "its terms are out of calendar order, or a term appears twice";
    }
    previous = planTerm.term;
    if (!Array.isArray(planTerm.items)) return "a term has no item list";
    for (const item of planTerm.items) {
      count2 += 1;
      if (count2 > MAX_ITEMS) return `it has more than ${MAX_ITEMS} items`;
      if (!isText(item.id, 1, 64)) return "an item has no id";
      if (ids.has(item.id)) return `item ${item.id} appears twice`;
      ids.add(item.id);
      if (!isCredits(item.credits)) return `${item.id} has credits that are not a number`;
      if (!PLACEMENTS.has(item.placement)) return `${item.id} has a placement the planner does not write`;
      if (item.block !== void 0 && item.block !== "1" && item.block !== "2") {
        return `${item.id} names a summer block the planner does not write`;
      }
      if (item.kind === "course") {
        if (!isText(item.code, 1, 32)) return `${item.id} is a course with no code`;
        if (!isText(item.title, 0, 200)) return `${item.id} has a title that is not text`;
        if (item.forRequirement !== void 0 && !isText(item.forRequirement, 1, 200)) {
          return `${item.id} names a requirement that is not text`;
        }
      } else if (item.kind === "slot") {
        if (!isText(item.slot, 1, 64)) return `${item.id} is a requirement with no name`;
        if (!isText(item.label, 0, 200)) return `${item.id} has a label that is not text`;
        if (item.options !== void 0) {
          if (!Array.isArray(item.options) || item.options.length > 100) {
            return `${item.id} lists too many options`;
          }
          if (!item.options.every((option) => isText(option, 1, 32))) {
            return `${item.id} lists an option that is not a course code`;
          }
        }
      } else if (item.kind === "named") {
        if (!isText(item.label, 0, 200)) return `${item.id} has a label that is not text`;
      } else {
        return `${String(item.id)} is of a kind the planner does not write`;
      }
      if (item.kind !== "named" && item.publishedTermIndex !== void 0) {
        const index = item.publishedTermIndex;
        if (!Number.isInteger(index) || index < 1 || index > MAX_TERMS) {
          return `${item.id} came from a grid term that does not exist`;
        }
      }
    }
  }
  if (!Array.isArray(plan.appliedCredit) || plan.appliedCredit.length > 400) {
    return "its applied credit is not a list";
  }
  for (const applied of plan.appliedCredit) {
    if (!isRecord(applied) || !isText(applied["code"], 1, 32) || !isNumber(applied["credits"], 0, 30)) {
      return "an applied credit is not one the planner writes";
    }
    if (applied["satisfied"] !== void 0 && !isText(applied["satisfied"], 1, 64)) {
      return "an applied credit points at an item that is not text";
    }
  }
  return void 0;
}
function catalogDifferences(plan, catalog) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind !== "course") continue;
      const code = catalog.canonical(item.code);
      if (seen.has(code)) continue;
      seen.add(code);
      const course = catalog.get(code);
      if (course === void 0) {
        out.push(`${item.code} is not in the catalog this page has.`);
        continue;
      }
      const planned = creditsNominal(item.credits);
      const current = creditsNominal(course.credits);
      if (planned !== current) {
        out.push(
          `${item.code} is ${current} credits in the current catalog; the plan has it at ${planned}.`
        );
      }
      if (item.title !== course.title && item.title !== item.code) {
        out.push(
          `${item.code} is titled "${course.title}" in the current catalog; the plan says "${item.title}".`
        );
      }
    }
  }
  return out;
}
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isText = (value, min, max) => typeof value === "string" && value.length >= min && value.length <= max;
var isNumber = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
var isTerm = (value) => isRecord(value) && Number.isInteger(value["year"]) && value["year"] >= 1900 && value["year"] <= 2200 && (value["season"] === "F" || value["season"] === "P" || value["season"] === "S");
function isCredits(value) {
  if (isNumber(value, 0, 30)) return true;
  return isRecord(value) && isNumber(value["min"], 0, 30) && isNumber(value["max"], 0, 30) && value["min"] <= value["max"];
}
function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4);
  return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
}
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes, limit) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// src/requirements/graduation.ts
function courseNumber(code) {
  const digits = /\b(\d{3,4})[A-Za-z]{0,2}$/.exec(code.trim());
  return digits ? Number(digits[1]) : void 0;
}
function isGlobalIntercultural(code) {
  return /\d[Gg]$/.test(code.trim());
}
function tally(input, level) {
  const t = {
    planned: 0,
    plannedUpper: 0,
    plannedUndecided: 0,
    plannedSlots: 0,
    plannedGlobal: 0,
    completedKnown: 0,
    completedUnknownCredits: 0,
    completedUpperKnown: 0,
    completedUpperUnknown: 0,
    completedGlobal: 0,
    atUvuKnown: 0,
    sourceUnknown: 0,
    sourceUnknownCredits: 0,
    sourceUnknownUnbounded: 0,
    transferKnown: 0,
    transferUnknownCredits: 0
  };
  for (const term2 of input.plan.terms) {
    for (const item of term2.items) {
      const credits = creditsNominal(item.credits);
      t.planned += credits;
      if (item.kind !== "course") {
        t.plannedUndecided += credits;
        if (item.kind === "slot") t.plannedSlots += 1;
        continue;
      }
      const number = courseNumber(item.code);
      if (number !== void 0 && number >= level) t.plannedUpper += credits;
      if (isGlobalIntercultural(item.code)) t.plannedGlobal += 1;
    }
  }
  for (const entry of input.context.completed ?? []) {
    const code = input.catalog.canonical(entry.code);
    const known = entry.credits ?? (input.catalog.get(code) ? creditsNominal(input.catalog.get(code).credits) : void 0);
    const number = courseNumber(code);
    const upper = number !== void 0 && number >= level;
    if (isGlobalIntercultural(code)) t.completedGlobal += 1;
    if (known === void 0) {
      t.completedUnknownCredits += 1;
      if (upper) t.completedUpperUnknown += 1;
    } else {
      t.completedKnown += known;
      if (upper) t.completedUpperKnown += known;
    }
    if (entry.source === "uvu" || entry.source === "concurrent_enrollment") {
      if (known !== void 0) t.atUvuKnown += known;
    } else if (entry.source === "transfer") {
      if (known === void 0) t.transferUnknownCredits += 1;
      else t.transferKnown += known;
    } else if (entry.source === void 0) {
      t.sourceUnknown += 1;
      if (known === void 0) t.sourceUnknownUnbounded += 1;
      else t.sourceUnknownCredits += known;
    }
  }
  return t;
}
var plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`;
function checkGraduation(input) {
  const withheld = input.contextWithheld === true;
  const findings = input.rules.map((rule) => finding2(rule, input, withheld));
  const standing = findings.some((f) => f.standing === "unmet") ? "unmet" : findings.every((f) => f.standing === "met") ? "met" : "unverifiable";
  return { standing, findings };
}
function finding2(rule, input, withheld) {
  const base = { ruleId: rule.id, kind: rule.kind, text: rule.text };
  const level = rule.kind === "min_credits_at_level" ? rule.level : 3e3;
  const t = tally(input, level);
  const notShared = "Completed coursework was not shared with this plan, so what it adds is not known.";
  switch (rule.kind) {
    case "min_total_credits": {
      const known = t.planned + t.completedKnown;
      if (known >= rule.credits) {
        return { ...base, standing: "met", message: `The plan and completed courses come to ${known} credits; the rule asks for ${rule.credits}.` };
      }
      if (withheld) {
        return { ...base, standing: "unverifiable", message: `The plan holds ${t.planned} credits against ${rule.credits} required. ${notShared}` };
      }
      if (t.completedUnknownCredits > 0) {
        return {
          ...base,
          standing: "unverifiable",
          message: `The plan and completed courses with a known credit value come to ${known} credits against ${rule.credits} required, and ${plural(t.completedUnknownCredits, "completed course")} carry no credit value the planner can see.`
        };
      }
      return {
        ...base,
        standing: "unmet",
        message: `The plan and completed courses come to ${known} credits; the rule asks for ${rule.credits}.`,
        remedy: `${rule.credits - known} more credits would satisfy it.`
      };
    }
    case "min_credits_at_level": {
      const known = t.plannedUpper + t.completedUpperKnown;
      const named = `numbered ${rule.level} or above`;
      if (known >= rule.credits) {
        return { ...base, standing: "met", message: `${known} credits are in courses ${named}; the rule asks for ${rule.credits}.` };
      }
      if (withheld) {
        return { ...base, standing: "unverifiable", message: `The plan holds ${t.plannedUpper} credits in courses ${named} against ${rule.credits} required. ${notShared}` };
      }
      if (t.completedUpperUnknown > 0) {
        return {
          ...base,
          standing: "unverifiable",
          message: `${known} credits are in courses ${named} against ${rule.credits} required, and ${plural(t.completedUpperUnknown, "completed upper-division course")} carry no credit value the planner can see.`
        };
      }
      if (known + t.plannedUndecided >= rule.credits) {
        return {
          ...base,
          standing: "unverifiable",
          message: `${known} credits are in courses ${named} against ${rule.credits} required, and ${t.plannedUndecided} credits are in requirements with no course chosen yet, which may or may not be upper division.`
        };
      }
      return {
        ...base,
        standing: "unmet",
        message: `${known} credits are in courses ${named}${t.plannedUndecided > 0 ? `, and even the ${t.plannedUndecided} in requirements not yet chosen would not reach ${rule.credits}` : `; the rule asks for ${rule.credits}`}.`,
        remedy: `${rule.credits - known - t.plannedUndecided} more upper-division credits would satisfy it.`
      };
    }
    case "min_credits_at_institution": {
      const certain = t.planned + t.atUvuKnown;
      if (certain >= rule.credits) {
        return { ...base, standing: "met", message: `${certain} credits are at UVU: the plan's ${t.planned}${t.atUvuKnown > 0 ? ` and ${t.atUvuKnown} completed there` : ""}. The rule asks for ${rule.credits}.` };
      }
      if (withheld) {
        return { ...base, standing: "unverifiable", message: `The plan puts ${t.planned} credits at UVU against ${rule.credits} required in residence. ${notShared}` };
      }
      const possible = certain + t.sourceUnknownCredits;
      if (t.sourceUnknown > 0 && (t.sourceUnknownUnbounded > 0 || possible >= rule.credits)) {
        return {
          ...base,
          standing: "unverifiable",
          message: `${certain} credits are known to be at UVU against ${rule.credits} required in residence, and ${plural(t.sourceUnknown, "completed course")} do not say where they were taken.`
        };
      }
      return {
        ...base,
        standing: "unmet",
        message: `${certain} credits are at UVU: the plan's ${t.planned}${t.atUvuKnown > 0 ? ` and ${t.atUvuKnown} completed there` : ""}.` + (t.sourceUnknown > 0 ? ` ${plural(t.sourceUnknown, "completed course")} do not say where they were taken, and even counted as UVU credit they reach ${possible}.` : "") + ` The rule asks for ${rule.credits} in residence.`,
        remedy: t.sourceUnknown > 0 ? `At least ${rule.credits - possible} more credits taken at UVU would satisfy it.` : `${rule.credits - certain} more credits taken at UVU would satisfy it.`
      };
    }
    case "min_credits_at_institution_within_last": {
      if (t.planned >= rule.credits) {
        return { ...base, standing: "met", message: `The plan's ${t.planned} credits at UVU are the last credits earned, and the rule asks for ${rule.credits} of the last ${rule.ofLastHours} to be at UVU.` };
      }
      return {
        ...base,
        standing: "unverifiable",
        message: `The plan holds ${t.planned} credits at UVU, fewer than the ${rule.credits} the rule wants within the last ${rule.ofLastHours} hours. Whether earlier UVU credits fall in that window depends on the order they were earned, which the planner does not know.`
      };
    }
    case "min_credits_at_institution_in_category":
      return {
        ...base,
        standing: "unverifiable",
        message: `Which courses count as ${rule.category} is not something the planner can tell from the catalog page, so the ${rule.credits} credits in residence there are not checked.`
      };
    case "max_transfer_credits": {
      if (withheld) {
        return { ...base, standing: "unverifiable", message: `The cap is ${rule.credits} transfer credits${rule.category ? ` in ${rule.category}` : ""} from a two-year college. ${notShared}` };
      }
      if (t.transferUnknownCredits === 0 && t.transferKnown <= rule.credits) {
        return { ...base, standing: "met", message: `Transfer credit comes to ${t.transferKnown}, within the cap of ${rule.credits}${rule.category ? ` for ${rule.category}` : ""}.` };
      }
      if (t.transferUnknownCredits > 0) {
        return { ...base, standing: "unverifiable", message: `${plural(t.transferUnknownCredits, "transfer course")} carry no credit value the planner can see, so the cap of ${rule.credits} cannot be checked.` };
      }
      return {
        ...base,
        standing: "unverifiable",
        message: `Transfer credit comes to ${t.transferKnown}, above the cap of ${rule.credits}${rule.category ? ` for ${rule.category}` : ""}. Whether it came from a two-year college${rule.category ? `, and how much of it is in ${rule.category},` : ""} is not recorded, so the cap may or may not apply.`
      };
    }
    case "max_credits_by_mode": {
      const total = t.planned + t.completedKnown;
      if (total <= rule.credits && t.completedUnknownCredits === 0 && !withheld) {
        return { ...base, standing: "met", message: `All credit together comes to ${total}, within the ${rule.credits} the rule allows through independent study or extension.` };
      }
      return {
        ...base,
        standing: "unverifiable",
        message: `How a course was taken is not recorded, so the ${rule.credits}-credit cap on independent study and extension classes is not checked.`
      };
    }
    case "min_courses_with_attribute": {
      if (rule.attribute === "global_intercultural") {
        const count2 = t.plannedGlobal + t.completedGlobal;
        const marked = "numbered with a G, which is how the catalog marks Global/Intercultural courses";
        if (count2 >= rule.count) {
          return { ...base, standing: "met", message: `${plural(count2, "course")} ${count2 === 1 ? "is" : "are"} ${marked}; the rule asks for ${rule.count}.` };
        }
        if (withheld) {
          return { ...base, standing: "unverifiable", message: `The plan holds ${plural(count2, "course")} ${marked}, against ${rule.count} required. ${notShared}` };
        }
        if (count2 + t.plannedSlots >= rule.count) {
          return {
            ...base,
            standing: "unverifiable",
            message: `${plural(count2, "course")} in the plan or completed ${count2 === 1 ? "is" : "are"} ${marked}, against ${rule.count} required, and ${plural(t.plannedSlots, "open requirement")} could be filled with one.`
          };
        }
        return {
          ...base,
          standing: "unmet",
          message: `${plural(count2, "course")} in the plan or completed ${count2 === 1 ? "is" : "are"} ${marked}; the rule asks for ${rule.count}.`,
          remedy: rule.examples?.length ? `${rule.examples.join(" or ")} would satisfy it.` : `${plural(rule.count - count2, "more Global/Intercultural course")} would satisfy it.`
        };
      }
      return {
        ...base,
        standing: "unverifiable",
        message: `The catalog marks ${rule.attribute === "writing_enriched" ? "Writing Enriched" : rule.attribute} courses in a way the course records on file do not carry, so the ${rule.count} required are not checked.`
      };
    }
    case "min_gpa":
      return {
        ...base,
        standing: "unverifiable",
        message: `A GPA of ${rule.gpa.toFixed(1)} ${rule.scope === "overall" ? "overall" : `in ${rule.scope}`} is required. The planner does not hold grades it can verify, so this is shown, not checked.${rule.note ? ` ${rule.note}.` : ""}`
      };
    case "min_grade":
      return {
        ...base,
        standing: "unverifiable",
        message: `A grade of ${rule.grade} or better is required in ${rule.scope}. The planner does not hold grades it can verify, so this is shown, not checked.`
      };
    case "policy":
      return { ...base, standing: "unverifiable", message: "A statement the planner cannot check. The catalog's words are shown." };
    case "milestone":
      return {
        ...base,
        standing: "unverifiable",
        message: `${rule.label} is something to be done rather than credit to be earned, and the planner cannot tell whether it has been. Confirm it with an advisor.`
      };
    case "unparsed":
      return { ...base, standing: "unverifiable", message: "A requirement the planner could not read. The catalog's words are shown." };
  }
}

// src/reflow/needs.ts
function prerequisiteStanding(code, at, plan, context, catalog, optionsFor) {
  const course = catalog.get(catalog.canonical(code));
  if (course?.prerequisites === void 0 || "unparsed" in course.prerequisites) return void 0;
  const canonical = (id) => catalog.canonical(id);
  const completed = /* @__PURE__ */ new Map();
  for (const entry of context.completed ?? []) completed.set(canonical(entry.code), entry);
  const earlier = new Set(completed.keys());
  for (const id of context.inProgress ?? []) earlier.add(canonical(id));
  const concurrent = /* @__PURE__ */ new Set();
  const slotCandidates = /* @__PURE__ */ new Set();
  for (const planTerm of plan.terms) {
    const order = compareTerms(planTerm.term, at);
    for (const item of planTerm.items) {
      if (item.kind === "course") {
        const id = canonical(item.code);
        if (order < 0 || item.done === true) earlier.add(id);
        else if (order === 0) concurrent.add(id);
      } else if (item.kind === "slot" && order <= 0) {
        for (const option of resolveSlotOptions(item, optionsFor)?.options ?? []) slotCandidates.add(canonical(option));
      }
    }
  }
  return evaluate(
    course.prerequisites,
    { earlier, concurrent, completed, context, canonical, creditsEarned: 0, at, slotCandidates },
    course.concurrentOk !== void 0 ? { concurrentOk: course.concurrentOk } : {}
  );
}

// src/reflow/extend.ts
var extensionSlot = (id) => `@EXT:${id}`;
var MOST_NEW_TERMS = 12;
var MOST_PLACEHOLDERS = 6;
function extendPlan(input) {
  const { catalog, offerings, context, maxCredits, seasons } = input;
  const canonical = (id) => catalog.canonical(id);
  let plan = input.plan;
  const added = [];
  const notes = [];
  const heldNow = () => {
    const held = /* @__PURE__ */ new Set();
    for (const entry of context.completed ?? []) held.add(canonical(entry.code));
    for (const id of context.inProgress ?? []) held.add(canonical(id));
    for (const planTerm of plan.terms) for (const item of planTerm.items) if (item.kind === "course") held.add(canonical(item.code));
    return held;
  };
  const creditsOf3 = (code) => {
    const course = catalog.get(code);
    return course?.credits === void 0 ? 3 : Math.max(0, creditsNominal(course.credits));
  };
  const room = (planTerm, credits) => termCredits(planTerm) + credits <= maxCredits;
  const seen = (code, at) => offerings.availability(code, at).verdict !== "never_observed";
  const lastTerm2 = () => plan.terms.at(-1)?.term ?? plan.start;
  const termAfterLast2 = () => nextTerm(lastTerm2(), seasons);
  const placeCourse = (code, program, label) => {
    const credits = creditsOf3(code);
    const fill = fillFor(plan, code, catalog, input.optionsFor);
    if (fill !== void 0) {
      const at2 = plan.terms.find((planTerm) => planTerm.items.some((item) => item.id === fill.slot.id))?.term ?? lastTerm2();
      plan = addCourseFilling(plan, at2, code, catalog, void 0, input.optionsFor);
      added.push({ program: program.name, label, code, term: at2, filled: fill.requirement });
      return;
    }
    const fits2 = (planTerm) => room(planTerm, credits) && seen(code, planTerm.term) && prerequisiteStanding(code, planTerm.term, plan, context, catalog, input.optionsFor)?.truth !== "unmet";
    let at = plan.terms.find(fits2)?.term;
    if (at === void 0) {
      let candidate = termAfterLast2();
      for (let i = 0; i < MOST_NEW_TERMS && at === void 0; i += 1) {
        const trial = addTerm(plan, candidate);
        const trialTerm = trial.terms.find((planTerm) => termKey(planTerm.term) === termKey(candidate));
        const okay = (seen(code, candidate) || i === MOST_NEW_TERMS - 1) && prerequisiteStanding(code, candidate, trial, context, catalog, input.optionsFor)?.truth !== "unmet";
        if (okay && room(trialTerm, credits)) {
          plan = trial;
          at = candidate;
        } else {
          candidate = nextTerm(candidate, seasons);
        }
      }
    }
    if (at === void 0) {
      notes.push(`${code}, for the ${program.name}, could not be placed: no term within ${MOST_NEW_TERMS} of the end holds it.`);
      return;
    }
    plan = addCourse(plan, at, code, catalog, `${program.name}: ${label}`);
    added.push({ program: program.name, label, code, term: at });
  };
  const placeChoice = (finding3, options, program) => {
    const each = mostCommon(options.map(creditsOf3)) ?? 3;
    const count2 = Math.min(
      MOST_PLACEHOLDERS,
      Math.max(1, finding3.countShort ?? (finding3.creditsShort !== void 0 ? Math.ceil(finding3.creditsShort / Math.max(1, each)) : 1))
    );
    const lower = options.every((code) => (Number.parseInt(code.split(" ")[1] ?? "", 10) || 0) < 3e3);
    const label = `${program.name}: ${finding3.label.replace(/:$/, "")}`;
    for (let i = 0; i < count2; i += 1) {
      const fromIndex = lower ? 0 : Math.floor(plan.terms.length / 2);
      const withRoom = plan.terms.filter((planTerm, index) => index >= fromIndex && room(planTerm, each));
      let at = withRoom[0]?.term ?? plan.terms.filter((planTerm) => room(planTerm, each)).at(-1)?.term;
      if (at === void 0) {
        at = termAfterLast2();
        plan = addTerm(plan, at);
      }
      plan = addSlot(plan, at, {
        slot: extensionSlot(program.id),
        label,
        credits: each,
        options: [...new Set(options.map(canonical))]
      });
      added.push({ program: program.name, label: finding3.label, term: at });
    }
  };
  for (const program of input.programs) {
    const standing = satisfy({
      requirements: program.tree.requirements,
      catalog,
      held: heldNow(),
      ...program.tree.totalCredits !== void 0 ? { totalCredits: program.tree.totalCredits } : {},
      ...program.chosen ? { chosen: program.chosen } : {}
    });
    for (const finding3 of standing.findings) {
      if (finding3.standing !== "unmet") continue;
      if (finding3.code !== void 0) {
        const code = canonical(finding3.code);
        if (heldNow().has(code)) continue;
        placeCourse(code, program, finding3.label);
        continue;
      }
      const held = heldNow();
      const started = (finding3.bundles ?? []).filter((bundle) => {
        const codes = bundle.codes.map(canonical);
        return codes.some((code) => held.has(code)) && codes.some((code) => !held.has(code));
      });
      if (started.length === 1 && !(finding3.options ?? []).some((code) => held.has(canonical(code)))) {
        for (const code of started[0].codes.map(canonical)) {
          if (!heldNow().has(code)) placeCourse(code, program, finding3.label);
        }
        continue;
      }
      const options = [
        ...new Set(
          [
            ...finding3.options ?? [],
            ...(finding3.bundles ?? []).flatMap((bundle) => bundle.codes),
            ...(finding3.groups ?? []).flatMap((group) => group.options)
          ].map(canonical)
        )
      ];
      if (options.length === 0) {
        notes.push(`${program.name}: "${finding3.label}" lists no courses the planner can place; it is still checked under the program's fold.`);
        continue;
      }
      const throughSlot = plan.terms.some(
        (planTerm) => planTerm.items.some((item) => {
          if (item.kind !== "slot") return false;
          const offered = resolveSlotOptions(item, input.optionsFor)?.options ?? [];
          return offered.some((option) => options.includes(canonical(option)));
        })
      );
      if (throughSlot) continue;
      placeChoice(finding3, options, program);
    }
  }
  plan = { ...plan, terms: [...plan.terms].sort((a, b) => compareTerms(a.term, b.term)) };
  return { plan, added, notes };
}
function mostCommon(values) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best;
  let bestCount = 0;
  for (const [value, count2] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (count2 > bestCount) {
      best = value;
      bestCount = count2;
    }
  }
  return best;
}

// ../web/src/chain.ts
function prerequisiteChoices(expr) {
  const out = /* @__PURE__ */ new Map();
  const visit = (node, inChoice) => {
    if (isPrereqNode(node)) {
      const choice = inChoice || node.op === "OR" && node.of.length > 1 || node.op === "N_OF" && node.n < node.of.length;
      for (const child of node.of) visit(child, choice);
      return;
    }
    if ("recommended" in node) return;
    if ("course" in node) out.set(node.course, inChoice && (out.get(node.course) ?? true));
  };
  if (expr !== void 0) visit(expr, false);
  return out;
}
function planGraph(plan, catalog) {
  const byCode = /* @__PURE__ */ new Map();
  const graph = /* @__PURE__ */ new Map();
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind !== "course") continue;
      const code = catalog.canonical(item.code);
      if (!byCode.has(code)) byCode.set(code, item.id);
      graph.set(item.id, { needs: /* @__PURE__ */ new Set(), unlocks: /* @__PURE__ */ new Set(), optional: /* @__PURE__ */ new Set() });
    }
  }
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind !== "course") continue;
      const course = catalog.get(catalog.canonical(item.code));
      if (course === void 0) continue;
      const node = graph.get(item.id);
      const wanted = prerequisiteChoices(course.prerequisites);
      for (const raw of course.corequisites ?? []) wanted.set(raw, false);
      for (const [raw, optional] of wanted) {
        const other = byCode.get(catalog.canonical(raw));
        if (other === void 0 || other === item.id) continue;
        node.needs.add(other);
        graph.get(other).unlocks.add(item.id);
        if (optional) node.optional.add(other);
        else node.optional.delete(other);
      }
    }
  }
  return graph;
}
function traceChain(graph, itemId) {
  const walk3 = (start, edge) => {
    const seen = /* @__PURE__ */ new Set();
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.pop();
      for (const next of graph.get(current)?.[edge] ?? []) {
        if (next === start || seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen;
  };
  const pre = walk3(itemId, "needs");
  const post = walk3(itemId, "unlocks");
  const chain = /* @__PURE__ */ new Set([itemId, ...pre]);
  const swap = /* @__PURE__ */ new Set();
  for (const needed of pre) {
    let seen = false;
    let free = true;
    for (const member of chain) {
      const node = graph.get(member);
      if (member === needed || node === void 0 || !node.needs.has(needed)) continue;
      seen = true;
      if (!node.optional.has(needed)) free = false;
    }
    if (seen && free) swap.add(needed);
  }
  return { pre, post, swap };
}

// ../web/src/dnd.ts
function insertionIndex(rects, x, y, vertical) {
  if (rects.length === 0) return 0;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let after = false;
  rects.forEach((rect, index) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distance = Math.abs(y - cy) * 2 + Math.abs(x - cx);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
      after = vertical ? y > cy : x > cx;
    }
  });
  return best + (after ? 1 : 0);
}
function landingIndex(payload, to, at) {
  if (payload.kind === "item" && payload.from === to && at > payload.fromIndex) return at - 1;
  return at;
}
function readPayload(text) {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (raw["kind"] === "item" && typeof raw["itemId"] === "string" && typeof raw["from"] === "string") {
      return {
        kind: "item",
        itemId: raw["itemId"],
        from: raw["from"],
        fromIndex: Number(raw["fromIndex"]) || 0,
        label: String(raw["label"] ?? raw["itemId"])
      };
    }
    if (raw["kind"] === "library" && typeof raw["code"] === "string") {
      return { kind: "library", code: raw["code"], label: String(raw["label"] ?? raw["code"]) };
    }
    if (raw["kind"] === "term" && typeof raw["from"] === "string") {
      return { kind: "term", from: raw["from"], label: String(raw["label"] ?? raw["from"]) };
    }
  } catch {
  }
  return null;
}
var DragController = class {
  #hooks;
  #payload = null;
  #zone = null;
  #at = -1;
  #ghost = null;
  /** A finger is dragging a card; the native drag machinery must stay out. */
  #touchDragging = false;
  /** The click that follows a finger's drag is not a tap on the card. */
  #suppressClick = false;
  constructor(hooks) {
    this.#hooks = hooks;
    document.addEventListener("dragover", (event) => {
      if (this.#payload === null) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".dropzone") === null || target === null) this.#over(null, 0, 0);
    });
    document.addEventListener("dragend", () => this.#end());
    document.addEventListener("drop", () => this.#end());
  }
  /**
   * Make an element draggable: natively for a mouse, and by pointer for a
   * finger.
   *
   * With a grip, the pointer drag starts on the grip at once, and a tap on the
   * grip must not open the card behind it. Without one, the card itself is the
   * handle: a finger that holds still on it for a moment picks it up, a finger
   * that moves straight away is scrolling, and a tap is a tap. A mouse on a
   * card uses the native drag, so the pointer path ignores it.
   */
  attachSource(source, payload, grip) {
    source.draggable = true;
    source.addEventListener("dragstart", (event) => {
      if (this.#touchDragging) {
        event.preventDefault();
        return;
      }
      event.dataTransfer?.setData("text/plain", JSON.stringify(payload));
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = payload.kind === "library" ? "copy" : "move";
      }
      this.#payload = payload;
      source.classList.add("dragging");
    });
    source.addEventListener("dragend", () => {
      source.classList.remove("dragging");
      this.#end();
    });
    if (grip !== void 0) {
      grip.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") return;
        this.#beginPointerDrag(event, grip, source, payload, "now");
      });
      grip.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
      });
    }
    source.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse") return;
      this.#beginPointerDrag(event, source, source, payload, "hold");
    });
    source.addEventListener(
      "click",
      (event) => {
        if (this.#suppressClick) {
          event.stopPropagation();
          event.preventDefault();
        }
      },
      true
    );
    source.addEventListener("contextmenu", (event) => {
      if (this.#touchDragging) event.preventDefault();
    });
  }
  attachZone(zone) {
    zone.classList.add("dropzone");
    zone.addEventListener("dragover", (event) => {
      if (this.#payload === null) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = this.#payload.kind === "library" ? "copy" : "move";
      }
      this.#over(zone, event.clientX, event.clientY);
    });
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      const payload = this.#payload ?? readPayload(event.dataTransfer?.getData("text/plain"));
      const at = this.#indexIn(zone, event.clientX, event.clientY);
      this.#end();
      if (payload !== null) this.#hooks.onDrop(payload, zone, at);
    });
  }
  #indexIn(zone, x, y) {
    const rects = this.#hooks.itemsOf(zone).map((item) => item.getBoundingClientRect());
    return insertionIndex(rects, x, y, this.#hooks.vertical());
  }
  #over(zone, x, y) {
    if (zone !== this.#zone) {
      for (const other of this.#hooks.zones()) other.classList.remove("dragover");
      this.#clearMarks();
      this.#zone = zone;
      this.#at = -1;
      zone?.classList.add("dragover");
    }
    if (zone === null) return;
    if (this.#payload?.kind === "term") {
      this.#at = 0;
      return;
    }
    const at = this.#indexIn(zone, x, y);
    if (at !== this.#at) {
      this.#at = at;
      this.#mark(zone, at);
    }
  }
  #mark(zone, at) {
    this.#clearMarks();
    const items = this.#hooks.itemsOf(zone);
    if (items.length === 0) return;
    if (at >= items.length) items[items.length - 1].classList.add("dropafter");
    else items[at].classList.add("dropbefore");
  }
  #clearMarks() {
    for (const marked of document.querySelectorAll(".dropbefore, .dropafter")) {
      marked.classList.remove("dropbefore", "dropafter");
    }
  }
  #end() {
    for (const zone of this.#hooks.zones()) zone.classList.remove("dragover");
    this.#clearMarks();
    this.#ghost?.remove();
    this.#ghost = null;
    this.#payload = null;
    this.#zone = null;
    this.#at = -1;
    document.body.classList.remove("is-dragging");
  }
  /** Keep the strip moving under the finger when a drag reaches its edge. */
  #edgeScroll(x) {
    const strip = this.#hooks.strip();
    if (strip === null) return;
    const rect = strip.getBoundingClientRect();
    const edge = 56;
    if (x > rect.right - edge) strip.scrollLeft += Math.min(24, (x - (rect.right - edge)) / 2);
    else if (x < rect.left + edge) strip.scrollLeft -= Math.min(24, (rect.left + edge - x) / 2);
  }
  /**
   * A pointer drag. "now" is the grip's: it begins with the first movement.
   * "hold" is the card's own, for a finger: it begins after the pointer has
   * held still for a moment, and a pointer that moves before then is left to
   * the browser, which is scrolling. Once a drag has begun, touch scrolling is
   * stopped for the rest of the gesture.
   */
  #beginPointerDrag(event, handle, source, payload, mode) {
    if (event.button !== 0) return;
    if (mode === "now") {
      event.preventDefault();
      event.stopPropagation();
    }
    if (mode === "hold" && event.defaultPrevented) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let timer = null;
    const stopScroll = (touch) => {
      if (dragging && touch.cancelable) touch.preventDefault();
    };
    const start = () => {
      dragging = true;
      this.#touchDragging = mode === "hold";
      this.#payload = payload;
      source.classList.add("dragging");
      document.body.classList.add("is-dragging");
      this.#ghost = document.createElement("div");
      this.#ghost.className = "draghost";
      this.#ghost.textContent = payload.label;
      this.#ghost.style.transform = `translate(${startX + 12}px, ${startY - 14}px)`;
      document.body.append(this.#ghost);
      document.addEventListener("touchmove", stopScroll, { passive: false });
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
      }
    };
    const move = (moving) => {
      if (!dragging) {
        const far = Math.abs(moving.clientX - startX) >= 6 || Math.abs(moving.clientY - startY) >= 6;
        if (!far) return;
        if (mode === "hold") {
          finish(false);
          return;
        }
        start();
      }
      moving.preventDefault();
      if (this.#ghost !== null) {
        this.#ghost.style.transform = `translate(${moving.clientX + 12}px, ${moving.clientY - 14}px)`;
      }
      this.#edgeScroll(moving.clientX);
      const under = document.elementFromPoint(moving.clientX, moving.clientY);
      const zone = under instanceof Element ? under.closest(".dropzone") : null;
      this.#over(zone, moving.clientX, moving.clientY);
    };
    const finish = (ok) => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      document.removeEventListener("touchmove", stopScroll);
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
      }
      source.classList.remove("dragging");
      const was = dragging;
      dragging = false;
      this.#touchDragging = false;
      const zone = this.#zone;
      const at = this.#at;
      this.#end();
      if (was) {
        this.#suppressClick = true;
        setTimeout(() => {
          this.#suppressClick = false;
        }, 400);
      }
      if (ok && was && zone !== null) {
        this.#hooks.onDrop(payload, zone, at < 0 ? this.#hooks.itemsOf(zone).length : at);
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
    if (mode === "now") {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
      }
    } else {
      timer = setTimeout(() => {
        timer = null;
        start();
      }, 350);
    }
  }
};

// ../web/src/dom.ts
var element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== void 0) node.textContent = text;
  return node;
};

// ../web/src/courselist.ts
var SEARCH_ABOVE = 8;
var SLICE = 120;
function matchesWords(text, query) {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t !== "");
  if (tokens.length === 0) return true;
  const words = text.toLowerCase().split(/[^a-z0-9]+/);
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}
var count = (groups) => groups.reduce((n, g) => n + g.rows.length, 0);
function courseList(input) {
  const wrap = element("div", `clist${input.className ? ` ${input.className}` : ""}`);
  const head = element("div", "clist-head");
  const search = element("input", "clist-search");
  search.type = "search";
  search.placeholder = input.placeholder ?? "Search by code or title";
  search.setAttribute("aria-label", `Search ${input.name}`);
  search.autocomplete = "off";
  const total = element("span", "clist-count");
  head.append(search, total);
  const box = element("div", "clist-box");
  box.setAttribute("role", "list");
  box.setAttribute("aria-label", input.name);
  const foot = element("div", "clist-foot");
  wrap.append(head, box, foot);
  let groups = input.groups;
  let query = "";
  const searchAbove = input.searchAbove ?? SEARCH_ABOVE;
  const slice = input.slice ?? SLICE;
  const kept = () => (input.source !== void 0 ? query === "" ? [] : input.source(query) : groups).map((group) => ({
    ...group.label !== void 0 ? { label: group.label } : {},
    rows: group.rows.filter((row2) => matchesWords(row2.searchText ?? `${row2.code} ${row2.title ?? ""}`, query))
  })).filter((group) => group.rows.length > 0);
  const rowElement = (row2) => {
    const line = element("div", `clist-row${row2.muted ? " muted" : ""}`);
    line.setAttribute("role", "listitem");
    line.dataset["key"] = row2.key;
    const onOpen = row2.onOpen;
    const face = onOpen === void 0 ? element("div", "clist-face") : element("button", "clist-face clist-open");
    if (onOpen !== void 0) {
      face.type = "button";
      face.setAttribute("aria-label", row2.openLabel ?? `${row2.code}: read about it`);
      face.addEventListener("click", () => onOpen(face));
    }
    face.append(element("span", "clist-code", row2.code));
    const text = element("span", "clist-text");
    if (row2.title) text.append(element("span", "clist-title", row2.title));
    if (row2.note) text.append(element("span", "clist-note", row2.note));
    face.append(text);
    if (row2.detail) face.append(element("span", "clist-detail", row2.detail));
    line.append(face);
    if (row2.tags?.length) {
      const tags = element("span", "clist-tags");
      for (const tag of row2.tags) tags.append(element("span", `clist-tag${tag.tone ? ` ${tag.tone}` : ""}`, tag.text));
      line.append(tags);
    }
    if (row2.actions?.length || row2.expand !== void 0) {
      const acts = element("span", "clist-acts");
      if (row2.expand !== void 0) {
        const expand = row2.expand;
        const toggle = element("button", "clist-act", expand.label);
        toggle.type = "button";
        toggle.setAttribute("aria-expanded", "false");
        const panel2 = element("div", "clist-panel");
        panel2.hidden = true;
        toggle.addEventListener("click", () => {
          const open = panel2.hidden;
          panel2.textContent = "";
          if (open) panel2.append(expand.render());
          panel2.hidden = !open;
          toggle.setAttribute("aria-expanded", String(open));
        });
        acts.append(toggle);
        line.append(panel2);
      }
      for (const action of row2.actions ?? []) {
        const control = element("button", `clist-act${action.primary ? " primary" : ""}`, action.label);
        control.type = "button";
        if (action.ariaLabel) control.setAttribute("aria-label", action.ariaLabel);
        control.addEventListener("click", action.onClick);
        acts.append(control);
      }
      const panel = line.querySelector(".clist-panel");
      if (panel !== null) line.insertBefore(acts, panel);
      else line.append(acts);
    }
    row2.onRender?.(line);
    return line;
  };
  const flatten = () => {
    const out = [];
    for (const group of kept()) {
      if (group.label !== void 0) out.push({ heading: group.label });
      out.push(...group.rows);
    }
    return out;
  };
  let pending = [];
  const drawMore = () => {
    const next = pending.splice(0, slice);
    for (const entry of next) {
      box.append("heading" in entry ? element("h4", "clist-group", entry.heading) : rowElement(entry));
    }
  };
  box.addEventListener("scroll", () => {
    if (pending.length === 0) return;
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 200) drawMore();
  });
  const render = () => {
    const sourced = input.source !== void 0;
    const shown = kept();
    const matched = count(shown);
    const all = sourced ? matched : count(groups);
    search.hidden = !sourced && all <= searchAbove;
    head.hidden = search.hidden;
    box.textContent = "";
    foot.textContent = "";
    total.textContent = all === 0 ? "" : query === "" || sourced ? `${all} ${all === 1 ? "course" : "courses"}${sourced ? " match" : ""}` : `${matched} of ${all} match`;
    if (sourced && query === "") {
      if (input.emptyText) box.append(element("p", "clist-empty", input.emptyText));
      return;
    }
    if (all === 0) {
      if (input.emptyText) box.append(element("p", "clist-empty", input.emptyText));
      return;
    }
    if (matched === 0) {
      box.append(element("p", "clist-empty", input.noMatchText ?? "Nothing in this list matches that."));
      return;
    }
    pending = flatten();
    drawMore();
    moreBelow();
    setTimeout(moreBelow, 0);
  };
  const moreBelow = () => {
    box.classList.toggle("more-below", box.scrollHeight > box.clientHeight + 1 && box.scrollTop + box.clientHeight < box.scrollHeight - 1);
  };
  box.addEventListener("scroll", moreBelow);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(moreBelow).observe(box);
  let timer = null;
  search.addEventListener("input", () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value.trim();
      render();
    }, 90);
  });
  render();
  return {
    element: wrap,
    update(next) {
      groups = next;
      render();
    },
    setQuery(next) {
      query = next.trim();
      search.value = next;
      render();
    },
    get query() {
      return query;
    }
  };
}

// ../web/src/info.ts
var marks = 0;
function boundsAround(node) {
  const root = document.documentElement;
  let box = {
    left: 0,
    top: 0,
    right: root.clientWidth || window.innerWidth,
    bottom: root.clientHeight || window.innerHeight
  };
  for (let el = node.parentElement; el !== null; el = el.parentElement) {
    const style = window.getComputedStyle(el);
    if (!/auto|scroll|hidden/.test(`${style.overflowX} ${style.overflowY}`)) continue;
    const rect = el.getBoundingClientRect();
    box = {
      left: Math.max(box.left, rect.left),
      top: Math.max(box.top, rect.top),
      right: Math.min(box.right, rect.right),
      bottom: Math.min(box.bottom, rect.bottom)
    };
  }
  return box;
}
function infoMark(about, text) {
  const id = `info-${++marks}`;
  const wrap = element("span", "info");
  const button = element("button", "info-btn");
  button.type = "button";
  button.setAttribute("aria-label", `About ${about}`);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", id);
  const glyph = element("span", void 0, "i");
  glyph.setAttribute("aria-hidden", "true");
  button.append(glyph);
  const pop = element("div", "info-pop", text);
  pop.id = id;
  pop.hidden = true;
  wrap.append(button, pop);
  let hovered = false;
  let held = false;
  let pinned = false;
  let byPointer = false;
  const place = () => {
    pop.style.left = "";
    pop.classList.remove("above");
    const rect = pop.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const bounds = boundsAround(wrap);
    const margin = 8;
    const overRight = rect.right - (bounds.right - margin);
    const overLeft = bounds.left + margin - rect.left;
    if (overRight > 0) pop.style.left = `${-overRight}px`;
    else if (overLeft > 0) pop.style.left = `${overLeft}px`;
    const anchor = wrap.getBoundingClientRect();
    if (rect.bottom > bounds.bottom - margin && anchor.top - bounds.top > rect.height + margin) {
      pop.classList.add("above");
    }
  };
  const outside = (event) => {
    if (!wrap.contains(event.target)) close();
  };
  const update = () => {
    const open = hovered || held || pinned;
    if (open === !pop.hidden) return;
    pop.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      place();
      document.addEventListener("pointerdown", outside, true);
    } else {
      document.removeEventListener("pointerdown", outside, true);
    }
  };
  function close() {
    hovered = false;
    held = false;
    pinned = false;
    update();
  }
  wrap.addEventListener("mouseenter", () => {
    hovered = true;
    update();
  });
  wrap.addEventListener("mouseleave", () => {
    hovered = false;
    update();
  });
  wrap.addEventListener("pointerdown", () => {
    byPointer = true;
  });
  wrap.addEventListener(
    "focus",
    () => {
      held = !byPointer;
      byPointer = false;
      update();
    },
    true
  );
  wrap.addEventListener(
    "blur",
    (event) => {
      if (wrap.contains(event.relatedTarget)) return;
      held = false;
      pinned = false;
      update();
    },
    true
  );
  button.addEventListener("click", () => {
    if (pinned) {
      close();
    } else {
      pinned = true;
      update();
    }
  });
  wrap.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || pop.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  return {
    element: wrap,
    id,
    get isOpen() {
      return !pop.hidden;
    },
    describe(field) {
      const had = field.getAttribute("aria-describedby");
      field.setAttribute("aria-describedby", had ? `${had} ${id}` : id);
    }
  };
}

// ../web/src/programpicker.ts
var NO_FILTERS = { college: "", department: "", degree: "" };
var degreeOf = (choice) => choice.degree ?? choice.group ?? choice.label;
function matchPrograms(choices, query) {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t !== "");
  if (tokens.length === 0) return [...choices];
  return choices.filter((choice) => {
    const words = choice.label.toLowerCase().split(/[^a-z0-9]+/);
    return tokens.every((token) => words.some((word) => word.startsWith(token)));
  });
}
function filterPrograms(choices, filters) {
  return choices.filter(
    (choice) => (filters.college === "" || choice.college === filters.college) && (filters.department === "" || choice.department === filters.department) && (filters.degree === "" || degreeOf(choice) === filters.degree)
  );
}
function filterOptions(choices, filters) {
  const distinct = (values) => [...new Set(values.filter((v) => v !== void 0 && v !== ""))].sort((a, b) => a.localeCompare(b));
  const inCollege = filterPrograms(choices, { ...NO_FILTERS, college: filters.college });
  const inDepartment = filterPrograms(inCollege, { ...NO_FILTERS, department: filters.department });
  return {
    colleges: distinct(choices.map((c) => c.college)),
    departments: distinct(inCollege.map((c) => c.department)),
    degrees: distinct(inDepartment.filter((c) => c.college !== void 0).map(degreeOf))
  };
}
var narrowed = (filters) => filters.college !== "" || filters.department !== "" || filters.degree !== "";
function filterSelects(choices, filters, onChange, ariaSuffix = "") {
  const options = filterOptions(choices, filters);
  if (options.colleges.length === 0) return [];
  const select2 = (name, label, all, values) => {
    const wrap = element("label", "combo-filter");
    wrap.append(element("span", "combo-filter-label", label));
    const pick = element("select");
    pick.setAttribute("aria-label", `${label}${ariaSuffix}`);
    const any = element("option", void 0, all);
    any.value = "";
    pick.append(any);
    for (const value of values) {
      const node = element("option", void 0, value);
      node.value = value;
      pick.append(node);
    }
    pick.value = values.includes(filters[name]) ? filters[name] : "";
    pick.addEventListener("change", () => {
      const value = pick.value;
      if (name === "college") onChange({ college: value, department: "", degree: "" });
      else if (name === "department") onChange({ ...filters, department: value, degree: "" });
      else onChange({ ...filters, degree: value });
    });
    wrap.append(pick);
    return wrap;
  };
  const out = [
    select2("college", "College", "All colleges", options.colleges),
    select2("department", "Department", "All departments", options.departments),
    select2("degree", "Degree", "All degrees", options.degrees)
  ];
  if (narrowed(filters)) {
    const clear = element("button", "combo-clear", "Clear filters");
    clear.type = "button";
    clear.setAttribute("aria-label", "Clear the college, department and degree filters");
    clear.addEventListener("click", () => onChange(NO_FILTERS));
    out.push(clear);
  }
  return out;
}
var ProgramPicker = class {
  element;
  #input;
  /** The current choice, named under the field: the field itself rests on its placeholder. */
  #chosen;
  #panel;
  #filters;
  #list;
  #choices;
  /** How many choices each group holds; a group of one is not shown as one. */
  #groupSize = /* @__PURE__ */ new Map();
  #onPick;
  #filter = NO_FILTERS;
  #current = 0;
  #active = -1;
  #shown = [];
  #unchoose = null;
  /** Choices kept out of the list: a program already chosen elsewhere on the page. */
  #excluded = /* @__PURE__ */ new Set();
  #chosenRow;
  /** Chips for what has been added through this control, filled by the page. */
  chips;
  /** Beside the chosen name, filled by the page: the track, where the program offers one. */
  beside;
  #chosenLine;
  constructor(label, choices, current, onPick, info, onClear) {
    this.#choices = choices;
    for (const choice of choices) {
      if (choice.group !== void 0) {
        this.#groupSize.set(choice.group, (this.#groupSize.get(choice.group) ?? 0) + 1);
      }
    }
    this.#current = current;
    this.#onPick = onPick;
    this.element = element("div", "control combo");
    const id = `combo-${Math.random().toString(36).slice(2, 8)}`;
    const caption = element("label", "control-label", label);
    caption.htmlFor = `${id}-input`;
    this.#input = element("input", "combo-input");
    this.#input.id = `${id}-input`;
    this.#input.type = "text";
    this.#input.autocomplete = "off";
    this.#input.setAttribute("role", "combobox");
    this.#input.setAttribute("aria-autocomplete", "list");
    this.#input.setAttribute("aria-expanded", "false");
    this.#input.setAttribute("aria-controls", `${id}-list`);
    this.#input.placeholder = "Type to search, or narrow the list below";
    this.#chosen = element("span", "combo-chosen");
    this.#chosen.id = `${id}-chosen`;
    this.#input.setAttribute("aria-describedby", this.#chosen.id);
    this.#panel = element("div", "combo-panel");
    this.#panel.hidden = true;
    this.#filters = element("div", "combo-filters");
    this.#list = element("ul", "combo-list");
    this.#list.id = `${id}-list`;
    this.#list.setAttribute("role", "listbox");
    const dismiss = element("button", "combo-close", "\xD7");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Close the list");
    dismiss.addEventListener("mousedown", (event) => event.preventDefault());
    dismiss.addEventListener("click", () => {
      this.#close();
      this.show(this.#current);
      this.#input.blur();
    });
    this.#panel.append(dismiss, this.#filters, this.#list);
    let head = caption;
    if (info !== void 0) {
      head = element("span", "control-head");
      const mark = infoMark(label, info);
      mark.describe(this.#input);
      head.append(caption, mark.element);
    }
    const chosenRow = element("span", "combo-chosen-row combo-chip");
    chosenRow.append(this.#chosen);
    this.#chosenRow = chosenRow;
    if (onClear !== void 0) {
      const clear = element("button", "combo-chip-x combo-unchoose", "\xD7");
      clear.type = "button";
      clear.setAttribute("aria-label", `Remove the chosen ${label.toLowerCase()}`);
      clear.title = `Remove the chosen ${label.toLowerCase()}`;
      clear.addEventListener("click", onClear);
      chosenRow.append(clear);
      this.#unchoose = clear;
    }
    this.beside = element("span", "combo-beside");
    this.#chosenLine = element("span", "combo-chosen-line");
    this.#chosenLine.append(chosenRow, this.beside);
    this.chips = element("span", "combo-chips");
    this.element.append(head, this.#input, this.#chosenLine, this.chips, this.#panel);
    this.show(current);
    this.#input.addEventListener("focus", () => this.#open(this.#input.value));
    this.#input.addEventListener("input", () => this.#open(this.#input.value));
    this.#input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (this.#panel.hidden) this.#open(this.#input.value);
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.#highlight((this.#active + step + this.#shown.length) % Math.max(1, this.#shown.length));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const index = this.#shown[this.#active] ?? this.#shown[0];
        if (index !== void 0) this.#pick(index);
      } else if (event.key === "Escape") {
        this.#close();
        this.show(this.#current);
      }
    });
    this.element.addEventListener("focusout", () => {
      setTimeout(() => {
        if (!this.element.contains(document.activeElement)) {
          this.#close();
          this.show(this.#current);
        }
      }, 120);
    });
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.#panel.hidden) {
        this.#close();
        this.show(this.#current);
        this.#input.focus();
      }
    });
  }
  /**
   * The program the page is on, named under the field. The field itself is
   * left to its placeholder, as the sponsor asked, so it reads as the search
   * it is; the name sits under it, and describes it.
   */
  show(index) {
    this.#current = index;
    this.#input.value = "";
    this.#chosen.textContent = this.#choices[index]?.label ?? "";
    this.#chosenRow.hidden = this.#choices[index] === void 0;
    this.#chosenLine.hidden = this.#choices[index] === void 0;
    if (this.#unchoose !== null) this.#unchoose.hidden = this.#choices[index] === void 0;
  }
  /**
   * Choices to leave out of the list: what is already chosen elsewhere, so
   * the same major or minor cannot be added twice. The list is drawn again
   * if it is open.
   */
  exclude(indices) {
    this.#excluded = new Set(indices);
  }
  /** The filters as set, for a test or a caller that wants to know. */
  get filters() {
    return this.#filter;
  }
  #query() {
    return this.#input.value;
  }
  #drawFilters() {
    this.#filters.textContent = "";
    this.#filters.append(
      ...filterSelects(this.#choices, this.#filter, (next) => {
        this.#filter = next;
        this.#open(this.#query(), true);
      })
    );
  }
  #open(query, keepFocus = false) {
    const kept = filterPrograms(
      this.#choices.map((c, i) => ({ ...c, i })).filter((c) => !this.#excluded.has(c.i)),
      this.#filter
    );
    const last = "\uFFFF";
    const matches = [...matchPrograms(kept, query)].sort(
      (a, b) => (a.college ?? last).localeCompare(b.college ?? last) || (a.department ?? last).localeCompare(b.department ?? last) || a.i - b.i
    );
    this.#shown = matches.map((m) => m.i);
    const anyCollege = this.#choices.some((c) => c.college !== void 0);
    this.#drawFilters();
    this.#list.textContent = "";
    if (this.#shown.length === 0) {
      const narrowed2 = this.#filter.college !== "" || this.#filter.department !== "" || this.#filter.degree !== "";
      this.#list.append(
        element(
          "li",
          "combo-none",
          narrowed2 ? "No program matches that within what the filters keep." : "No program matches that"
        )
      );
    }
    let lastGroup;
    let lastCollege;
    let lastDepartment;
    this.#shown.forEach((index, at) => {
      const choice = this.#choices[index];
      if (choice === void 0) return;
      if (anyCollege) {
        const college = choice.college ?? "Other programs";
        if (college !== lastCollege) {
          const heading = element("li", "combo-college", college);
          heading.setAttribute("role", "presentation");
          this.#list.append(heading);
          lastCollege = college;
          lastDepartment = void 0;
          lastGroup = void 0;
        }
        if (choice.department !== void 0 && choice.department !== lastDepartment) {
          const heading = element("li", "combo-dept", choice.department);
          heading.setAttribute("role", "presentation");
          this.#list.append(heading);
          lastDepartment = choice.department;
          lastGroup = void 0;
        }
      }
      const grouped = choice.group !== void 0 && (this.#groupSize.get(choice.group) ?? 0) > 1;
      if (grouped && choice.group !== lastGroup) {
        const heading = element("li", "combo-group", choice.group);
        heading.setAttribute("role", "presentation");
        this.#list.append(heading);
      }
      lastGroup = grouped ? choice.group : void 0;
      const option = element("li", `combo-option${grouped ? " member" : ""}`);
      option.append(element("span", "combo-name", grouped ? choice.display ?? choice.label : choice.label));
      option.id = `${this.#list.id}-${index}`;
      option.setAttribute("role", "option");
      option.setAttribute("aria-label", choice.label);
      option.setAttribute("aria-selected", String(index === this.#current));
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.#pick(index);
      });
      option.addEventListener("mousemove", () => this.#highlight(at));
      this.#list.append(option);
    });
    this.#panel.hidden = false;
    this.#input.setAttribute("aria-expanded", "true");
    this.#highlight(Math.max(0, this.#shown.indexOf(this.#current)));
    if (!keepFocus && document.activeElement !== this.#input) this.#input.focus();
  }
  #highlight(at) {
    this.#active = at;
    [...this.#list.querySelectorAll(".combo-option")].forEach((option, i) => {
      option.classList.toggle("active", i === at);
      if (i === at) this.#input.setAttribute("aria-activedescendant", option.id);
    });
  }
  #close() {
    this.#panel.hidden = true;
    this.#input.setAttribute("aria-expanded", "false");
    this.#input.removeAttribute("aria-activedescendant");
    this.#active = -1;
  }
  #pick(index) {
    const changed = index !== this.#current;
    this.#close();
    this.show(index);
    this.#input.blur();
    if (changed) this.#onPick(index);
  }
};

// ../web/src/picker.ts
function searchCatalog(catalog, query, exclude, limit = 12, within) {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t !== "");
  if (tokens.length === 0 && within === void 0) return { entries: [], total: 0 };
  const matches = [];
  for (const course of catalog) {
    if (exclude.has(course.id)) continue;
    if (within !== void 0 && !within.has(course.id)) continue;
    const words = `${course.id} ${course.title}`.toLowerCase().split(/[^a-z0-9]+/);
    if (tokens.every((token) => words.some((word) => word.startsWith(token)))) matches.push(course);
  }
  matches.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    entries: matches.slice(0, limit).map((course) => ({
      code: course.id,
      title: course.title,
      credits: creditsNominal(course.credits)
    })),
    total: matches.length
  };
}
var CoursePicker = class {
  element;
  #catalog;
  #hooks;
  #search;
  #filters;
  #filter = NO_FILTERS;
  /** Every course the search and the filters keep, as one scrolling list. */
  #results;
  #resultsBox;
  #hint;
  /** What has been passed: one list that scrolls and folds, so twenty courses or eighty take the same room. */
  #passed;
  /** The course just picked, so its row can be seen arriving. */
  #justAdded = null;
  #timer = null;
  /** The result the arrow keys have reached, for Enter to add; none until a key is pressed. */
  #active = -1;
  constructor(catalog, hooks) {
    this.#catalog = catalog;
    this.#hooks = hooks;
    this.element = element("div", "picker");
    this.#filters = element("div", "pick-filters");
    this.#filters.hidden = (hooks.facets?.length ?? 0) === 0;
    this.element.append(this.#filters);
    this.#drawFilters();
    this.#search = element("input", "pick-search");
    this.#search.type = "search";
    this.#search.placeholder = "Search by code or title, then pick from the list";
    this.#search.setAttribute("aria-label", "Search the catalog for a course you have passed");
    this.#search.autocomplete = "off";
    this.#search.addEventListener("input", () => {
      if (this.#timer !== null) clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.#renderResults(), 90);
    });
    this.#search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const rows2 = this.#resultRows();
        if (rows2.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.#highlight((this.#active + step + rows2.length) % rows2.length);
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const rows = this.#resultRows();
      const row2 = rows[this.#active] ?? rows[0];
      row2?.querySelector("button.clist-open")?.click();
    });
    this.#results = courseList({
      groups: [],
      name: "the courses that match",
      searchAbove: Number.POSITIVE_INFINITY,
      className: "pick-results"
    });
    this.#resultsBox = this.#results.element;
    this.#resultsBox.hidden = true;
    this.#hint = element("p", "pick-hint");
    this.#hint.hidden = true;
    this.#passed = courseList({
      groups: [],
      name: "the courses you have passed",
      searchAbove: 12,
      className: "pick-passed"
    });
    this.#passed.element.hidden = true;
    this.element.append(this.#search, this.#resultsBox, this.#hint, this.#passed.element);
    this.refresh();
  }
  /** The lists changed under the picker; draw them again. */
  refresh() {
    this.#renderPassed();
    this.#renderResults();
  }
  /** The courses the filters keep, canonical; nothing while no filter is set. */
  #within() {
    if (!narrowed(this.#filter)) return void 0;
    const out = /* @__PURE__ */ new Set();
    for (const facet of filterPrograms(this.#hooks.facets ?? [], this.#filter)) {
      for (const code of facet.courses) out.add(this.#catalog.canonical(code));
    }
    return out;
  }
  #drawFilters() {
    this.#filters.textContent = "";
    this.#filters.append(
      ...filterSelects(this.#hooks.facets ?? [], this.#filter, (next) => {
        this.#filter = next;
        this.#drawFilters();
        this.#renderResults();
      }, ", to narrow the courses")
    );
  }
  /** The search field, for a label or a description to point at. */
  get field() {
    return this.#search;
  }
  #resultRows() {
    return [...this.#resultsBox.querySelectorAll(".clist-row")];
  }
  /** The row the keys have reached, marked and scrolled into view. */
  #highlight(at) {
    this.#active = at;
    this.#resultRows().forEach((row2, i) => {
      row2.classList.toggle("active", i === at);
      if (i === at) row2.scrollIntoView({ block: "nearest" });
    });
  }
  #pick(code) {
    this.#justAdded = code;
    this.#hooks.onAdd(code);
    this.#search.value = "";
    this.refresh();
    this.#search.focus();
  }
  #renderResults() {
    this.#active = -1;
    const exclude = new Set(this.#hooks.chosen().map((c) => c.code));
    const within = this.#within();
    const { entries, total } = searchCatalog(this.#catalog, this.#search.value, exclude, Number.POSITIVE_INFINITY, within);
    const hidden = this.#search.value.trim() === "" && within === void 0;
    this.#resultsBox.hidden = hidden;
    this.#hint.hidden = hidden;
    if (hidden) return;
    this.#results.update([
      {
        rows: entries.map((entry) => ({
          key: entry.code,
          code: entry.code,
          title: entry.title,
          detail: `${entry.credits} cr`,
          onOpen: () => this.#pick(entry.code),
          openLabel: `Add ${entry.code}, ${entry.title}, to what you have passed`,
          actions: [{ label: "Add", ariaLabel: `Add ${entry.code} to what you have passed`, onClick: () => this.#pick(entry.code), primary: true }]
        }))
      }
    ]);
    this.#hint.textContent = total === 0 ? within === void 0 ? "Nothing in the catalog matches that. Try the code, like MATH 1210." : "Nothing within what the filters keep matches that." : `${total} ${total === 1 ? "course matches" : "courses match"}. Click one to add it, or press Enter for the first.`;
  }
  #renderPassed() {
    const chosen = this.#hooks.chosen();
    const added = this.#justAdded;
    this.#justAdded = null;
    const rows = chosen.map(({ code }) => {
      const course = this.#catalog.get(code);
      return {
        key: code,
        code,
        title: course?.title ?? "not in the catalog on file",
        ...course !== void 0 ? { detail: `${creditsNominal(course.credits)} cr` } : {},
        actions: [
          {
            label: "\xD7",
            ariaLabel: `Remove ${code} from what you have passed`,
            onClick: () => {
              this.#hooks.onRemove(code);
              this.refresh();
            }
          }
        ],
        onRender: (row2) => {
          if (course === void 0) row2.classList.add("unknown");
          if (code === added) {
            row2.classList.add("just-added");
            setTimeout(() => row2.classList.remove("just-added"), 1800);
          }
        }
      };
    });
    this.#passed.element.hidden = rows.length === 0;
    this.#passed.update([{ rows }]);
  }
};

// ../web/src/rhythm.ts
function rhythmTag(rhythm) {
  switch (rhythm?.pattern) {
    case "biennial":
      return "every other year";
    case "rare":
      return "rarely offered";
    case "intermittent":
      return "offered irregularly";
    case "dormant":
      return `not since ${rhythm.lastOffered.slice(0, 4)}`;
    case "new":
      return "new course";
    default:
      return void 0;
  }
}
function rhythmSentences(rhythm) {
  if (rhythm === void 0) return [];
  const out = [];
  const n = rhythm.recentTerms;
  switch (rhythm.pattern) {
    case "biennial":
      out.push(`Every other year on the record: ${rhythm.yearsOffered.join(", ")}.`);
      break;
    case "rare":
      out.push(
        `Rarely offered: ${rhythm.termsOffered} of the ${rhythm.opportunities} terms since it first appeared.`
      );
      break;
    case "dormant":
      out.push(
        `Not offered since ${termLabel(parseTerm(rhythm.lastOffered))}, ${rhythm.termsSinceLastOffered} terms ago.`
      );
      break;
    case "intermittent":
      out.push(
        `Offered irregularly: ${rhythm.termsOffered} of the ${rhythm.opportunities} terms since it first appeared, and in no season more than half of them.`
      );
      break;
    case "new":
      out.push(
        `New to the schedule: ${rhythm.opportunities} ${rhythm.opportunities === 1 ? "term" : "terms"} of history so far.`
      );
      break;
    case "regular":
      break;
  }
  const against = `${rhythm.sectionsRecent} in the last ${n} terms against ${rhythm.sectionsPrior} in the ${n} before`;
  switch (rhythm.trend) {
    case "shrinking sharply":
    case "shrinking":
    case "growing":
      out.push(`Sections are ${rhythm.trend}: ${against}.`);
      break;
    case "returning":
      out.push(
        `Back on the schedule after a gap: ${rhythm.sectionsRecent} sections in the last ${n} terms, none in the ${n} before.`
      );
      break;
    default:
      break;
  }
  return out;
}

// ../web/src/scrollkeep.ts
function scrollerFor(panel, from, fallback) {
  let node = from instanceof HTMLElement ? from : null;
  while (node !== null && node !== panel) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return fallback;
}
var canScroll = (box, deltaY) => deltaY < 0 ? box.scrollTop > 0 : box.scrollTop + box.clientHeight < box.scrollHeight - 1;
function keepWheelIn(panel, body) {
  panel.addEventListener(
    "wheel",
    (event) => {
      const inner = scrollerFor(panel, event.target, body);
      if (inner !== body && canScroll(inner, event.deltaY)) return;
      if (canScroll(body, event.deltaY)) {
        if (inner !== body) {
          body.scrollTop += event.deltaY;
          event.preventDefault();
        }
        return;
      }
      event.preventDefault();
    },
    { passive: false }
  );
}

// ../web/src/drawer.ts
var SEASON_ORDER2 = ["F", "P", "S"];
var SUMMER_INFO = "Summer is the full term and two seven-week blocks. Each part has its own offering record, shown below, and a course moved into a summer from another term is the full term until you say otherwise.";
var Drawer = class {
  #scrim = element("div", "scrim");
  #panel = element("aside", "drawer");
  #head = element("div", "dr-head");
  #body = element("div", "dr-body");
  /** Tick, move, remove: pinned under the body, so they are always in reach. */
  #foot = element("div", "dr-foot");
  #close = element("button", "dr-close", "\xD7");
  #lastFocused = null;
  /** What is open, so a redraw of the page can draw it again. */
  #current = null;
  /** Told which item is on show, or none, so the page can mark its card. */
  #onChange;
  constructor(onChange = () => void 0) {
    this.#onChange = onChange;
    this.#panel.setAttribute("role", "dialog");
    this.#panel.setAttribute("aria-label", "Course detail");
    this.#panel.hidden = true;
    this.#scrim.hidden = true;
    this.#close.type = "button";
    this.#close.setAttribute("aria-label", "Close");
    this.#close.addEventListener("click", () => this.close());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !this.#panel.hidden) this.close();
    });
    this.#foot.setAttribute("aria-label", "Tick, move or remove");
    this.#panel.append(this.#head, this.#body, this.#foot);
    keepWheelIn(this.#panel, this.#body);
    document.body.append(this.#scrim, this.#panel);
  }
  close() {
    if (this.#panel.hidden) return;
    this.#panel.hidden = true;
    this.#scrim.hidden = true;
    this.#current = null;
    if (this.#panel.contains(document.activeElement)) this.#lastFocused?.focus();
    this.#lastFocused = null;
    this.#onChange(void 0);
  }
  get isOpen() {
    return !this.#panel.hidden;
  }
  /** The item on show, so a redraw can find it in the new plan. */
  get itemId() {
    return this.#current?.item.id;
  }
  open(input, from) {
    const wasOpen = !this.#panel.hidden;
    this.#lastFocused = from;
    this.#draw(input);
    this.#panel.hidden = false;
    this.#scrim.hidden = false;
    if (!wasOpen) this.#close.focus();
    else this.#body.scrollTop = 0;
    this.#onChange(input.item.id);
  }
  /**
   * The same drawer, drawn again from the plan as it is now. A tick, a move
   * or a choice made from the drawer changes the plan and the page redraws;
   * the drawer stays open on the same item, where it was scrolled to, with
   * focus where it was, rather than closing on every change (the sponsor's
   * fifth review). `from` is where focus returns to when it does close: the
   * card as drawn now, since the one that opened it is gone.
   */
  refresh(input, from) {
    if (this.#panel.hidden) return;
    if (from !== null) this.#lastFocused = from;
    const scrolled = this.#body.scrollTop;
    const focused = document.activeElement;
    const focusPath = focused instanceof HTMLElement && this.#panel.contains(focused) ? pathWithin(this.#panel, focused) : null;
    this.#draw(input);
    this.#body.scrollTop = scrolled;
    if (focusPath !== null) {
      const again = elementAt(this.#panel, focusPath);
      (again ?? this.#close).focus({ preventScroll: true });
    }
  }
  #draw(input) {
    this.#current = input;
    this.#onChange(input.item.id);
    this.#head.textContent = "";
    this.#body.textContent = "";
    this.#foot.textContent = "";
    this.#head.append(this.#close, ...header(input));
    for (const block2 of blocks(input)) this.#body.append(block2);
    const actions = actionsFooter(input);
    this.#foot.hidden = actions === null;
    if (actions !== null) this.#foot.append(...actions);
  }
};
function pathWithin(root, node) {
  const path = [];
  let current = node;
  while (current !== null && current !== root) {
    const parent = current.parentElement;
    if (parent === null) return path;
    path.unshift([...parent.children].indexOf(current));
    current = parent;
  }
  return path;
}
function elementAt(root, path) {
  let current = root;
  for (const index of path) {
    current = current?.children[index] ?? null;
    if (current === null) return null;
  }
  return current instanceof HTMLElement ? current : null;
}
function header(input) {
  const { item } = input;
  const wrap = element("div", "dr-title");
  const credits = creditsNominal(item.credits);
  if (item.kind === "course") {
    const course = input.catalog.get(item.code);
    wrap.append(element("p", "dr-code", item.code));
    wrap.append(element("h2", void 0, course?.title ?? item.title));
    const seasons = course?.offering?.value;
    const runs = seasons !== void 0 && /^[FPS]+$/.test(seasons) ? `runs ${seasonsPhrase([...seasons])}` : void 0;
    wrap.append(
      element(
        "p",
        "dr-meta",
        [`${credits} credit${credits === 1 ? "" : "s"}`, placeLabel(input.term, item.block), input.category, runs].filter((part) => part !== void 0 && part !== "").join(" \xB7 ")
      )
    );
  } else {
    wrap.append(element("p", "dr-code slot", item.kind === "slot" ? "Requirement" : "Your course"));
    wrap.append(element("h2", void 0, item.label));
    wrap.append(
      element("p", "dr-meta", `${credits} credit${credits === 1 ? "" : "s"} \xB7 ${placeLabel(input.term, item.block)}`)
    );
  }
  return [wrap];
}
function actionsFooter(input) {
  if (input.onMove === void 0 && input.onRemove === void 0 && input.onToggleDone === void 0 && input.onAdd === void 0) {
    return null;
  }
  const nodes = [];
  const actions = element("div", "dr-actions");
  const terms = input.terms ?? [];
  if (input.onAdd !== void 0) {
    const add = element("button", "btn btn-primary btn-sm", input.onAdd.label);
    add.type = "button";
    add.addEventListener("click", () => input.onAdd?.add());
    actions.append(add);
  }
  if (input.onMove !== void 0 && terms.length > 1) {
    const row2 = element("div", "dr-move");
    const pick = element("select");
    pick.setAttribute("aria-label", "The term to move this to");
    terms.forEach((t, i) => {
      const option = element("option", void 0, termLabel(t));
      option.value = String(i);
      if (compareTerms(t, input.term) === 0) {
        option.disabled = true;
        option.selected = true;
        option.textContent = `${termLabel(t)} (here now)`;
      }
      pick.append(option);
    });
    const go = element("button", "btn btn-secondary btn-sm", "Move");
    go.type = "button";
    go.addEventListener("click", () => {
      const to = terms[Number(pick.value)];
      if (to !== void 0 && compareTerms(to, input.term) !== 0) input.onMove?.(to, void 0);
    });
    row2.append(element("span", "control-label", "Move to"), pick, go);
    nodes.push(row2);
  }
  if (input.onMove !== void 0 && input.term.season === "S") {
    const row2 = element("div", "dr-move dr-block");
    row2.setAttribute("role", "group");
    row2.setAttribute("aria-label", "Which part of the summer");
    const head = element("span", "control-head");
    const mark = infoMark("Part of summer", SUMMER_INFO);
    mark.describe(row2);
    head.append(element("span", "control-label", "Part of summer"), mark.element);
    row2.append(head);
    const parts = [
      { block: void 0, label: "Full term" },
      { block: "1", label: "First block" },
      { block: "2", label: "Second block" }
    ];
    const seg = element("div", "seg");
    for (const part of parts) {
      const current = input.item.block === part.block;
      const button = element("button", `seg-btn${current ? " current" : ""}`, part.label);
      button.type = "button";
      button.setAttribute("aria-pressed", String(current));
      if (!current) button.addEventListener("click", () => input.onMove?.(input.term, part.block));
      seg.append(button);
    }
    row2.append(seg);
    nodes.push(row2);
  }
  if (input.onToggleDone !== void 0 && input.item.kind !== "slot") {
    const done = input.item.done === true;
    const tick = element("button", `btn btn-secondary btn-sm dr-tick${done ? " is-done" : ""}`);
    const box = element("span", "item-chk dr-chk");
    box.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><polyline points="2,6.4 4.8,9 10,3"></polyline></svg>';
    tick.append(box, document.createTextNode(done ? "Done" : "Mark as done"));
    tick.type = "button";
    tick.setAttribute("aria-pressed", String(done));
    tick.title = done ? "Marked as done. Click to unmark it: it goes back to being a course still to take." : "It stays where it is, greyed, counts toward your degree, and satisfies what depends on it.";
    tick.addEventListener("click", () => input.onToggleDone?.());
    actions.append(tick);
  }
  if (input.onRemove !== void 0) {
    const drop = element("button", "btn btn-secondary btn-sm danger dr-remove", "Remove from the plan");
    drop.type = "button";
    drop.addEventListener("click", () => input.onRemove?.());
    actions.append(drop);
  }
  if (actions.childElementCount > 0) nodes.push(actions);
  return nodes;
}
function block(title, ...nodes) {
  return blockTagged(title, void 0, ...nodes);
}
function blockTagged(title, tag, ...nodes) {
  return blockHeaded(title, tag, void 0, ...nodes);
}
function blockHeaded(title, tag, info, ...nodes) {
  const wrap = element("section", "blk");
  const heading = element("h3", void 0, title);
  if (tag !== void 0) heading.append(element("span", `blk-tag ${tag.tone}`, tag.text));
  if (info !== void 0) {
    const mark = infoMark(title, info);
    heading.append(mark.element);
  }
  wrap.append(heading);
  for (const node of nodes) if (node) wrap.append(node);
  return wrap;
}
var SECTIONS_INFO = "How many sections ran each term, counted from the class schedule rather than the catalog. Summer is split into the full term and the two seven-week blocks; a section the schedule put outside the three is counted under other dates.";
function blocks(input) {
  const out = [];
  const { item } = input;
  if (item.kind === "named") {
    out.push(
      block(
        "A course you named",
        element(
          "p",
          void 0,
          "You added this yourself, so it is left out of prerequisite, availability and requirement checks. Its credits still count toward the term."
        )
      )
    );
    return out;
  }
  if (item.kind === "slot") {
    out.push(...slotBlocks(input, item));
  } else {
    const course = input.catalog.get(item.code);
    out.push(prerequisiteBlock(input, course));
    const opens = unlocksBlock(input);
    if (opens !== null) out.push(opens);
    const twice = input.doubleDips?.get(input.catalog.canonical(item.code));
    if (twice !== void 0) out.push(twiceBlock(item.code, twice));
    out.push(...offeringBlock(item.code, course?.offering));
    if (input.alternatives !== void 0) out.push(alternativesBlock(input, item, input.alternatives));
  }
  const problems = input.problems.filter((problem) => problem.itemId === item.id);
  if (problems.length > 0) out.push(problemBlock(problems));
  return out;
}
function bindingSentence(label) {
  const trimmed = label.replace(/[.\s]+$/, "");
  return /^(complete|choose|select|take|any|\d)/i.test(trimmed) ? `This slot is for: ${trimmed}.` : `This is your ${trimmed}.`;
}
function twiceFirst(options, input) {
  const dips = input.doubleDips;
  if (dips === void 0 || dips.size === 0) return options;
  const twice = options.filter((code) => dips.has(input.catalog.canonical(code)));
  if (twice.length === 0) return options;
  return [...twice, ...options.filter((code) => !dips.has(input.catalog.canonical(code)))];
}
function otherSide(dip, input) {
  const here = input.finding?.path;
  const blocks2 = [...new Set(dip.also.map((m) => m.label))].join(" and ");
  if (here !== void 0 && here === dip.general.path) return blocks2;
  if (here !== void 0 && dip.also.some((m) => m.path.startsWith(here))) return dip.general.category;
  return `${dip.general.category} and ${blocks2}`;
}
function twiceBlock(code, dip) {
  return block(
    "Counts twice",
    element(
      "p",
      void 0,
      `${code} is listed under ${doubleDipLabel(dip)}. Taking it meets both, so it is one class fewer to register for. Its credits count once toward the degree.`
    )
  );
}
var listedCount = (listed) => listed.options.length + listed.bundles.length + listed.groups.reduce((n, g) => n + g.options.length, 0);
function chooser(input, listed, requirementName) {
  const canonical = (code) => input.catalog.canonical(code);
  const rowFor = (code) => {
    const course = input.catalog.get(code);
    const held = input.placement.get(canonical(code));
    const twice = input.doubleDips?.get(canonical(code));
    const tags = [];
    if (held) tags.push({ text: `in the plan, ${termLabel(held)}`, tone: "ok" });
    if (twice !== void 0) tags.push({ text: `also ${otherSide(twice, input)}`, tone: "ok" });
    const ready2 = held === void 0 ? input.readiness?.(code) : void 0;
    if (ready2?.truth === "none" || ready2?.truth === "met") tags.push({ text: "ready to take", tone: "ok" });
    else if (ready2?.truth === "unmet") tags.push({ text: "needs first", tone: "warn" });
    else if (ready2?.truth === "unknown") tags.push({ text: "to confirm" });
    const onChoose = input.onChoose;
    return {
      key: code,
      code,
      ...course ? { title: course.title, detail: `${creditsNominal(course.credits)} cr` } : {},
      ...ready2?.truth === "unmet" && ready2.needs ? { note: `Needs first: ${ready2.needs}` } : {},
      tags,
      muted: held !== void 0,
      actions: !held && onChoose !== void 0 ? [{ label: "Choose", ariaLabel: `Choose ${code} for ${requirementName}`, onClick: () => onChoose(code) }] : []
    };
  };
  const bundleRow = (bundle) => {
    const records = bundle.codes.map((code) => input.catalog.get(code));
    const credits = records.every((course) => course !== void 0) ? `${records.reduce((sum, course) => sum + creditsNominal(course.credits), 0)} cr` : "credits not on file";
    const allIn = bundle.codes.every((code) => input.placement.has(canonical(code)));
    const onChooseBundle = input.onChooseBundle;
    return {
      key: bundle.codes.join("+"),
      code: bundle.codes.join(" + "),
      title: bundle.label.replace(/\s*\(\d+(?:\.\d+)?\)$/, ""),
      detail: credits,
      searchText: `${bundle.codes.join(" ")} ${bundle.label}`,
      tags: allIn ? [{ text: "in the plan", tone: "ok" }] : [],
      muted: allIn,
      actions: !allIn && onChooseBundle !== void 0 ? [{
        label: bundle.codes.length === 2 ? "Choose both" : `Choose all ${bundle.codes.length}`,
        ariaLabel: `Choose ${bundle.codes.join(" and ")} together for ${requirementName}`,
        onClick: () => onChooseBundle(bundle.codes)
      }] : []
    };
  };
  if (listed !== void 0) {
    const groups = [];
    const single = [...listed.options.map(rowFor), ...listed.bundles.map(bundleRow)];
    if (single.length > 0) groups.push({ rows: single });
    for (const group of listed.groups) groups.push({ label: group.label, rows: group.options.map(rowFor) });
    return courseList({
      groups,
      name: `the courses that would fill ${requirementName}`,
      placeholder: `Search these ${listedCount(listed)} courses`,
      className: "chooser"
    }).element;
  }
  return courseList({
    groups: [],
    source: (query) => {
      const { entries } = searchCatalog(input.catalog, query, new Set(input.placement.keys()), Number.POSITIVE_INFINITY);
      return [{ rows: entries.map((entry) => rowFor(entry.code)) }];
    },
    name: `the catalog, for a course to fill ${requirementName}`,
    placeholder: "Search the catalog by code or title",
    emptyText: "Type a code or a title to search the catalog.",
    noMatchText: "Nothing in the catalog matches that.",
    className: "chooser"
  }).element;
}
function slotBlocks(input, item) {
  const out = [];
  const finding3 = input.finding;
  const explanation = element("div");
  if (input.binding) {
    explanation.append(element("p", "binding", bindingSentence(input.binding.label)));
  }
  explanation.append(
    element(
      "p",
      void 0,
      "The department left this open, so it is a decision rather than a course. Its credits are counted; what fills it is up to you."
    )
  );
  const listed = {
    options: twiceFirst(finding3?.options ?? item.options ?? [], input),
    bundles: finding3?.bundles ?? [],
    groups: finding3?.groups ?? []
  };
  const anythingListed = listedCount(listed) > 0;
  if (input.met) {
    const course = input.satisfiedBy ? input.catalog.get(input.satisfiedBy) : void 0;
    explanation.append(
      element(
        "p",
        "met",
        input.satisfiedBy ? `You have already met this, with ${input.satisfiedBy}` + (course ? ` (${course.title}).` : ".") : "You have already met this requirement."
      )
    );
  } else if (finding3?.standing === "unverifiable" || !anythingListed) {
    explanation.append(
      element(
        "p",
        "unverifiable",
        finding3?.reason ?? "The planner cannot check this one. Nothing here can tell whether you have already met it, which is a different thing from knowing you have not. It is left open rather than counted either way."
      )
    );
  }
  if (input.binding) {
    explanation.append(
      element(
        "p",
        "muted",
        `Matched to that requirement because ${input.binding.basis}` + (input.binding.confidence === "moderate" ? ", which is a reading of the catalog rather than something it states." : ".")
      )
    );
  }
  out.push(block("What this is", explanation));
  const requirementName = input.binding?.label ?? item.label;
  if (anythingListed) {
    const note = listed.groups.length > 0 ? element("p", "muted", "No track is chosen yet, so every track's courses count; choose a track beside the program's name to narrow this to one.") : void 0;
    const wrap = element("div");
    if (note) wrap.append(note);
    wrap.append(chooser(input, listed, requirementName));
    out.push(block("Courses that would fill it", wrap));
  } else if (input.onChoose !== void 0) {
    const wrap = element("div");
    wrap.append(chooser(input, void 0, requirementName));
    out.push(
      blockHeaded(
        "Courses that would fill it",
        void 0,
        "The program page does not list the options; they are set out in the catalog's general education tables, and an advisor can confirm which count. Search the catalog and choose one here, and the plan will say whether it fits.",
        wrap
      )
    );
  } else {
    out.push(
      block(
        "Courses that would fill it",
        element(
          "p",
          "muted",
          "The program page does not list them. They are set out in the general education tables in the catalog, and an advisor can confirm which ones count."
        )
      )
    );
  }
  return out;
}
function prerequisiteBlock(input, course) {
  if (course?.prerequisites === void 0) {
    return block("Needs first", element("p", "muted", "No prerequisite listed."));
  }
  const wrap = element("div", "needs");
  if ("unparsed" in course.prerequisites) {
    wrap.append(
      element("p", "source", String(course.prerequisites.unparsed)),
      element(
        "p",
        "unverifiable",
        "The planner could not read this one, so it is showing you the catalog's own words and checking nothing. Read it yourself before you register."
      )
    );
    return block("Needs first", wrap);
  }
  const held = /* @__PURE__ */ new Set();
  for (const entry of input.context.completed ?? []) held.add(input.catalog.canonical(entry.code));
  const facts = { input, held, done: input.doneCourses ?? /* @__PURE__ */ new Set() };
  const advice = [];
  const required = withoutAdvice(course.prerequisites, advice);
  if (required !== void 0) wrap.append(...needsNodes(required, facts, true).nodes);
  if (advice.length > 0) {
    wrap.append(element("p", "muted", required !== void 0 ? "Recommended as well, not required:" : "Recommended, not required:"));
    for (const expr of advice) wrap.append(...needsNodes(expr, { ...facts, advice: true }, true).nodes);
  }
  if (course.prerequisiteSource) {
    wrap.append(element("p", "source", `The catalog says: ${course.prerequisiteSource}`));
  }
  return block("Needs first", wrap);
}
function withoutAdvice(expr, advice) {
  if ("recommended" in expr) {
    advice.push(expr.recommended);
    return void 0;
  }
  if (!isPrereqNode(expr)) return expr;
  const kept = expr.of.map((child) => withoutAdvice(child, advice)).filter((child) => child !== void 0);
  if (kept.length === 0) return void 0;
  if (kept.length === 1) return kept[0];
  return { ...expr, of: kept };
}
function needsNodes(expr, facts, top) {
  if (!isPrereqNode(expr)) {
    const line = needsRow(expr, facts);
    return { nodes: [line], met: line.classList.contains("met") };
  }
  const children = expr.op === "N_OF" ? expr.of : expr.of.flatMap((child) => isPrereqNode(child) && child.op === expr.op ? child.of : [child]);
  if (expr.op === "AND" && top) {
    const built = children.map((child) => needsNodes(child, facts, true));
    return { nodes: built.flatMap((b) => b.nodes), met: built.every((b) => b.met) };
  }
  if (expr.op === "OR" && children.every((child) => "programAdmission" in child)) {
    const line = admissionRow(children, facts);
    return { nodes: [line], met: line.classList.contains("met") };
  }
  const group = element("div", "needs-group");
  group.setAttribute("role", "group");
  const label = expr.op === "AND" ? "All of these" : expr.op === "OR" ? "One of these" : `${expr.n} of these`;
  group.setAttribute("aria-label", label);
  group.append(element("p", "needs-group-label", label));
  const members = children.map((child) => needsNodes(child, facts, false));
  for (const member of members) group.append(...member.nodes);
  const need = expr.op === "AND" ? members.length : expr.op === "OR" ? 1 : expr.n;
  const met = members.filter((member) => member.met).length >= need;
  if (expr.op !== "AND" && met) {
    for (const member of members) {
      if (member.met) continue;
      for (const node of member.nodes) {
        const rows = node.classList.contains("needs-row") ? [node] : [...node.querySelectorAll(".needs-row")];
        for (const rowNode of rows) {
          if (rowNode.classList.contains("met")) continue;
          rowNode.classList.remove("missing", "open", "in");
          rowNode.classList.add("spare");
          const status = rowNode.querySelector("em");
          if (status !== null) status.textContent = "not needed; another of these is met";
        }
      }
    }
  }
  return { nodes: [group], met };
}
function row(facts, label, details, status, held, change, action) {
  const line = element("label", `needs-row ${status.tone}`);
  const box = element("input");
  box.type = "checkbox";
  box.checked = held;
  box.disabled = change === void 0 || facts.advice === true;
  box.setAttribute("aria-label", label);
  if (change !== void 0 && facts.advice !== true) box.addEventListener("change", () => change(box.checked));
  const text = element("span", "needs-text");
  text.append(element("b", void 0, label));
  for (const detail of details) text.append(element("i", void 0, detail));
  text.append(element("em", void 0, status.text));
  if (action !== void 0) {
    const button = element("button", "btn btn-secondary btn-sm needs-act", action.label);
    button.type = "button";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action.run();
    });
    text.append(button);
  }
  line.append(box, text);
  return line;
}
function needsRow(leaf2, facts) {
  const { input } = facts;
  const canonical = (id) => input.catalog.canonical(id);
  if ("course" in leaf2) {
    const code = canonical(leaf2.course);
    const passed = facts.held.has(code);
    const done = facts.done.has(code);
    const inPlan = input.placement.get(code);
    const details = [];
    if (leaf2.orHigher === true) details.push("or higher");
    if (leaf2.orEquivalent === true) details.push("or equivalent");
    if (leaf2.minGrade) details.push(`${leaf2.minGrade} or better`);
    if (leaf2.withinYears !== void 0) details.push(`within ${leaf2.withinYears} years`);
    const title = input.catalog.get(code)?.title;
    if (title) details.push(title);
    const change2 = input.onCourseHeld === void 0 ? void 0 : (held) => {
      input.onCourseHeld?.(code, held);
      if (leaf2.withinYears !== void 0) input.onStanding?.(`recent:${code}`, held);
      if (leaf2.minGrade !== void 0) input.onStanding?.(`grade:${code}:${leaf2.minGrade}`, held);
    };
    if (passed) return row(facts, leaf2.course, details, { text: "passed", tone: "met" }, true, change2);
    if (done && inPlan) return row(facts, leaf2.course, details, { text: `marked done, ${termLabel(inPlan)}`, tone: "met" }, true, change2);
    const parts = leaf2.orHigher === true ? courseParts(code) : void 0;
    const higher = parts === void 0 ? void 0 : [...facts.held, ...facts.done].find((other) => {
      const q = courseParts(other);
      return q !== void 0 && q.subject === parts.subject && q.number > parts.number;
    });
    if (higher !== void 0) {
      return row(facts, leaf2.course, details, { text: `${higher}, which is higher, is passed`, tone: "met" }, true, void 0);
    }
    if (inPlan !== void 0) {
      const before = compareTerms(inPlan, input.term) < 0;
      const line = row(
        facts,
        leaf2.course,
        details,
        before ? { text: `in the plan, ${termLabel(inPlan)}`, tone: "in" } : { text: `in the plan, ${termLabel(inPlan)}, which is not before this course`, tone: "missing" },
        false,
        change2
      );
      if (input.onHoverCourse !== void 0) {
        line.addEventListener("mouseenter", () => input.onHoverCourse?.(code));
        line.addEventListener("mouseleave", () => input.onHoverCourse?.(null));
      }
      return line;
    }
    const draggable = (line) => {
      if (input.dnd === void 0 || facts.advice === true) return line;
      input.dnd.attachSource(line, { kind: "library", code, label: code });
      line.classList.add("can-drag");
      line.title = `Drag ${code} into a term to add it to the plan`;
      return line;
    };
    const orDrag = input.dnd === void 0 || facts.advice === true ? "" : ", or drag it into a term";
    const slotAt = input.slotFor?.get(code);
    if (slotAt !== void 0) {
      const before = compareTerms(slotAt, input.term) < 0;
      return draggable(row(
        facts,
        leaf2.course,
        details,
        before ? { text: `a placeholder in the plan, ${termLabel(slotAt)}, could be it`, tone: "open" } : { text: `a placeholder in the plan, ${termLabel(slotAt)}, could be it, but that is not before this course`, tone: "missing" },
        false,
        change2,
        input.onFillSlot === void 0 ? void 0 : { label: `Put it in ${termLabel(slotAt)}`, run: () => input.onFillSlot?.(code) }
      ));
    }
    if (input.contextWithheld === true) return row(facts, leaf2.course, details, { text: "not shared", tone: "open" }, false, void 0);
    if (leaf2.orHigher === true || leaf2.orEquivalent === true) {
      return draggable(row(facts, leaf2.course, details, { text: `not in the plan; mark it if you have passed it${orDrag}`, tone: "open" }, false, change2));
    }
    return draggable(row(facts, leaf2.course, details, { text: `not in the plan; mark it if you have passed it${orDrag}`, tone: "missing" }, false, change2));
  }
  if ("placement" in leaf2) {
    const target = canonical(leaf2.placement);
    const subject = placementSubject(leaf2.placement);
    const given = input.context.placement ?? {};
    const stated = subject === void 0 ? void 0 : given[subject];
    const label2 = `placement into ${leaf2.placement}${leaf2.orHigher === true ? " or higher" : ""}`;
    const details = leaf2.withinYears !== void 0 ? [`a score within ${leaf2.withinYears} years`] : [];
    const parts = leaf2.orHigher === true ? courseParts(target) : void 0;
    const statedParts = stated === void 0 ? void 0 : courseParts(canonical(stated));
    const above = parts !== void 0 && statedParts !== void 0 && statedParts.subject === parts.subject && statedParts.number > parts.number;
    const matched = facts.held.has(target) || stated !== void 0 && canonical(stated) === target || above;
    const change2 = subject === void 0 || input.onPlacement === void 0 ? void 0 : (held) => input.onPlacement?.(subject, held ? target : void 0);
    if (matched) return row(facts, label2, details, { text: stated ? `placed into ${stated}` : `${target} is passed`, tone: "met" }, true, change2);
    if (stated !== void 0) {
      const below = parts !== void 0 && statedParts !== void 0 && statedParts.subject === parts.subject && statedParts.number < parts.number;
      return row(
        facts,
        label2,
        details,
        below ? { text: `placed into ${stated}, which is below`, tone: "missing" } : { text: `placed into ${stated}; can't tell`, tone: "open" },
        false,
        change2
      );
    }
    return row(facts, label2, details, { text: "not said; mark it if your score placed you there", tone: "open" }, false, change2);
  }
  if ("higherThan" in leaf2) {
    const above = Math.max(0, ...leaf2.higherThan.courses.map((code) => courseParts(code)?.number ?? 0));
    const higher = [...facts.held, ...facts.done].find((other) => {
      const q = courseParts(other);
      return q !== void 0 && q.subject === leaf2.higherThan.subject && q.number > above;
    });
    const label2 = `any ${leaf2.higherThan.subject} course numbered above ${leaf2.higherThan.courses.join(", ")}`;
    const details = leaf2.minGrade ? [`${leaf2.minGrade} or better`] : [];
    return higher !== void 0 ? row(facts, label2, details, { text: `${higher} is passed`, tone: "met" }, true, void 0) : row(facts, label2, details, { text: "none passed; add one under Courses you've passed", tone: "open" }, false, void 0);
  }
  const key = assertionKey(leaf2);
  const said = input.context.standing ?? {};
  const met = key !== "" && (said[key] === true || "standing" in leaf2 && leaf2.standing === "matriculation" && said["matriculated"] === true);
  const label = describeLeaf(leaf2);
  const change = key === "" || input.onStanding === void 0 ? void 0 : (held) => input.onStanding?.(key, held);
  if (met) return row(facts, label, [], { text: "marked by you", tone: "met" }, true, change);
  if (input.contextWithheld === true) return row(facts, label, [], { text: "not shared", tone: "open" }, false, void 0);
  return row(facts, label, [], { text: change === void 0 ? "not said; confirm it" : "not said; mark it if you have it", tone: "open" }, false, change);
}
function admissionRow(leaves, facts) {
  const { input } = facts;
  const names = leaves.map((leaf2) => leaf2.programAdmission);
  const label = `admission to ${names.length <= 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`}`;
  const met = input.context.standing?.["matriculated"] === true;
  const change = input.onStanding === void 0 ? void 0 : (held) => input.onStanding?.("matriculated", held);
  if (met) return row(facts, label, ["one of them"], { text: "marked by you", tone: "met" }, true, change);
  if (input.contextWithheld === true) return row(facts, label, ["one of them"], { text: "not shared", tone: "open" }, false, void 0);
  return row(facts, label, ["one of them"], { text: change === void 0 ? "not said; confirm it" : "not said; mark it if you are admitted", tone: "open" }, false, change);
}
function describeLeaf(leaf2) {
  if ("standing" in leaf2) return String(leaf2.standing).replace(/_/g, " ");
  if ("classStanding" in leaf2) return `${leaf2.classStanding} standing`;
  if ("permission" in leaf2) return `${leaf2.permission} approval`;
  if ("programAdmission" in leaf2) return `admission to ${leaf2.programAdmission}`;
  if ("testScore" in leaf2) return `${leaf2.testScore.test} ${leaf2.testScore.min}`;
  if ("creditThreshold" in leaf2) return `${leaf2.creditThreshold} credits earned`;
  if ("major" in leaf2) return `a declared major: ${leaf2.major}`;
  if ("milestone" in leaf2) return leaf2.milestone;
  if ("background" in leaf2) return leaf2.background;
  if ("unparsed" in leaf2) return String(leaf2.unparsed);
  return "a condition";
}
function alternativesBlock(input, item, alternatives) {
  const wrap = element("div");
  wrap.append(
    element(
      "p",
      void 0,
      `The department lists these in place of ${item.code}, for ${alternatives.requirement}.`
    )
  );
  const preview = (code) => {
    const panel = element("div");
    const result = alternatives.preview(code);
    const own = result.problems.filter((p) => p.severity !== "gap");
    if (own.length === 0) {
      panel.append(element("p", void 0, `${code} would carry no problems in ${termLabel(input.term)}.`));
    } else {
      panel.append(element("p", void 0, `${code} in ${termLabel(input.term)} would carry:`));
      const list = element("ul");
      for (const problem of own) list.append(element("li", problem.severity, problem.message));
      panel.append(list);
    }
    panel.append(
      element(
        "p",
        "muted",
        `Across the plan: ${result.errorsBefore} ${plural2(result.errorsBefore, "error")} now, ${result.errorsAfter} after; ${result.warningsBefore} ${plural2(result.warningsBefore, "warning")} now, ${result.warningsAfter} after.`
      )
    );
    return panel;
  };
  const rows = alternatives.options.map((option) => ({
    key: option.code,
    code: option.code,
    title: option.title,
    detail: `${option.credits} cr`,
    expand: { label: "Preview", render: () => preview(option.code) },
    actions: [{ label: "Swap", ariaLabel: `Swap ${item.code} for ${option.code}`, onClick: () => alternatives.swap(option.code) }]
  }));
  wrap.append(
    courseList({
      groups: [{ rows }],
      name: `the courses the department lists in place of ${item.code}`,
      className: "alternatives"
    }).element
  );
  return block("Instead of this course", wrap);
}
var plural2 = (n, word) => n === 1 ? word : `${word}s`;
function unlocksBlock(input) {
  const codes = input.unlocks ?? [];
  if (codes.length === 0) return null;
  const row2 = element("div", "pill-row");
  for (const code of codes) {
    const course = input.catalog.get(code);
    const node = element("span", "pill pill-in");
    node.append(element("b", void 0, code));
    if (course !== void 0) node.append(element("i", void 0, course.title));
    const at = input.placement.get(input.catalog.canonical(code));
    if (at !== void 0) node.append(element("em", void 0, termLabel(at)));
    row2.append(node);
  }
  return block("Opens up", row2, element("p", "muted", "Courses in this plan that list this one as a prerequisite or corequisite."));
}
function trendTag(rhythm) {
  switch (rhythm?.trend) {
    case "shrinking sharply":
    case "shrinking":
      return { text: rhythm.trend, tone: "warn" };
    case "growing":
    case "returning":
      return { text: rhythm.trend, tone: "ok" };
    default:
      return void 0;
  }
}
function offeringBlock(code, offering) {
  const title = "Sections offered, by term";
  if (offering === void 0) {
    return [block(title, element("p", "muted", "No offering history on file."))];
  }
  const wrap = element("div");
  if (offering.verdict === "no_record") {
    wrap.append(element("p", "unverifiable", offering.note ?? "The schedule has never carried it."));
    return [block(title, wrap)];
  }
  const years = /* @__PURE__ */ new Set();
  for (const season of SEASON_ORDER2) {
    for (const key of Object.keys(offering.seasons?.[season]?.by_term ?? {})) {
      years.add(Number(key.slice(0, 4)));
    }
  }
  const columns = [...years].sort((a, b) => a - b);
  if (columns.length > 0) {
    const table = element("table", "ogrid");
    const head = element("tr");
    head.append(element("th", "row", ""));
    for (const year of columns) head.append(element("th", void 0, `'${String(year).slice(2)}`));
    table.append(head);
    const rowFor = (label, season, byTerm, sub = false) => {
      const line = element("tr", sub ? "sub" : void 0);
      line.append(element("th", "row", label));
      for (const year of columns) {
        const count2 = byTerm?.[`${year}${season}`] ?? 0;
        const cell = element("td");
        const mark = element("span", `cell ${count2 > 0 ? "on" : "off"}`, count2 > 0 ? String(count2) : "");
        const what = sub ? `Summer, ${label.toLowerCase()}` : label;
        mark.title = `${what} ${year}: ${count2 > 0 ? `${count2} section${count2 === 1 ? "" : "s"}` : "none"}`;
        cell.append(mark);
        line.append(cell);
      }
      return line;
    };
    for (const season of SEASON_ORDER2) {
      const evidence = offering.seasons?.[season];
      if (evidence === void 0) continue;
      if (season === "S" && evidence.blocks !== void 0) {
        const heading = element("tr", "grp");
        heading.append(element("th", "row", "Summer"));
        const filler = element("td");
        filler.colSpan = columns.length;
        heading.append(filler);
        table.append(heading);
        const parts = [["full", "Full term"], ["1", "First block"], ["2", "Second block"]];
        for (const [key, label] of parts) {
          const part = evidence.blocks[key];
          if (part !== void 0) table.append(rowFor(label, "S", part.by_term, true));
        }
        const other = {};
        for (const year of columns) {
          const key = `${year}S`;
          const whole2 = evidence.by_term?.[key] ?? 0;
          const counted = ["full", "1", "2"].reduce((sum, k) => sum + (evidence.blocks?.[k]?.by_term?.[key] ?? 0), 0);
          if (whole2 > counted) other[key] = whole2 - counted;
        }
        if (Object.keys(other).length > 0) table.append(rowFor("Other dates", "S", other, true));
        continue;
      }
      table.append(rowFor(SEASON_NAME[season], season, evidence.by_term));
    }
    wrap.append(table);
  }
  for (const season of SEASON_ORDER2) {
    const evidence = offering.seasons?.[season];
    if (evidence === void 0 || evidence.verdict !== "no_evidence") continue;
    wrap.append(element("p", `verdict ${evidence.verdict}`, seasonSentence(code, season, evidence)));
  }
  if (offering.byArrangementOnly) {
    wrap.append(
      element(
        "p",
        "unverifiable",
        "Every section on record is individualized instruction, arranged with an instructor rather than scheduled. The terms above say when that has happened, not when a class is offered."
      )
    );
  }
  for (const sentence of rhythmSentences(offering.rhythm)) {
    wrap.append(element("p", "rhythm", sentence));
  }
  if (offering.canonicalId) {
    wrap.append(
      element("p", "muted", `History is recorded under ${offering.canonicalId}, this course's current number.`)
    );
  }
  const out = [blockHeaded(title, trendTag(offering.rhythm), columns.length > 0 ? SECTIONS_INFO : void 0, wrap)];
  if (offering.when !== void 0) out.push(meetingBlock(offering.when));
  return out;
}
function meetingBlock(when) {
  const box = element("div", "whenbox");
  const bars = (title, pairs, total2) => {
    const wrap = element("div", "wrow");
    wrap.append(element("div", "wlab", title));
    const strip = element("div", "wbars");
    const top = Math.max(1, ...pairs.map((pair) => pair[1]));
    for (const [label, n] of pairs) {
      const cell = element("div", `wcell${n > 0 ? "" : " zero"}`);
      const bar = element("i");
      bar.style.height = `${n > 0 ? Math.max(8, Math.round(n / top * 34)) : 2}px`;
      cell.append(bar, element("b", void 0, label));
      cell.title = n > 0 ? `${n} of ${total2} section${total2 === 1 ? "" : "s"}: ${label}` : `never: ${label}`;
      cell.append(element("span", "sr", cell.title));
      strip.append(cell);
    }
    wrap.append(strip);
    return wrap;
  };
  if (when.timed > 0) {
    const DAYS = [["M", "Mon"], ["T", "Tue"], ["W", "Wed"], ["R", "Thu"], ["F", "Fri"], ["S", "Sat"], ["U", "Sun"]];
    const days = DAYS.filter(([key]) => key !== "S" && key !== "U" || (when.days[key] ?? 0) > 0);
    box.append(bars("Days it has met", days.map(([key, label]) => [label, when.days[key] ?? 0]), when.timed));
    box.append(
      bars(
        "Start time",
        [["Morning", when.time.morning ?? 0], ["Afternoon", when.time.afternoon ?? 0], ["Evening", when.time.evening ?? 0]],
        when.timed
      )
    );
  }
  const formats = [
    ["In person", when.format.person ?? 0],
    ["Online", when.format.online ?? 0],
    ["Live stream", when.format.stream ?? 0]
  ];
  if ((when.format.hybrid ?? 0) > 0) formats.push(["Hybrid", when.format.hybrid ?? 0]);
  if ((when.format.other ?? 0) > 0) formats.push(["Other", when.format.other ?? 0]);
  const total = formats.reduce((sum, pair) => sum + pair[1], 0);
  if (total > 0) box.append(bars("Format", formats, total));
  const parts = [];
  if (when.timed > 0) parts.push(`${when.timed} section${when.timed === 1 ? "" : "s"} with a set meeting time`);
  if (when.noset > 0) parts.push(`${when.noset} with none, which is usually an online section`);
  return blockHeaded(
    "When it has met",
    void 0,
    `On the schedule: ${parts.join(", ")}. A live stream section is online at a set time. Morning starts before noon, afternoon from noon to four. Past terms are a guide, not a promise; the published schedule is the only place a future term is settled.`,
    box
  );
}
function seasonSentence(code, season, evidence) {
  const name = seasonWord(season);
  switch (evidence.verdict) {
    case "no_evidence":
      return `Too few ${name} terms on the books to say whether ${code} runs then.`;
    default:
      return "";
  }
}
function problemBlock(problems) {
  const list = element("ul", "dr-problems");
  for (const problem of problems) {
    const entry = element("li", problem.severity);
    entry.append(element("span", "problem-message", problem.message));
    if (problem.remedy) entry.append(element("span", "problem-remedy", problem.remedy));
    list.append(entry);
  }
  return block("What the planner noticed", list);
}

// ../web/src/library.ts
function searchCourses(input) {
  const inPlan = /* @__PURE__ */ new Set();
  for (const planTerm of input.plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind === "course") inPlan.add(input.catalog.canonical(item.code));
    }
  }
  const tokens = input.query.toLowerCase().split(/\s+/).filter((t) => t !== "");
  const matches = [];
  for (const course of input.catalog) {
    if (inPlan.has(course.id)) continue;
    if (input.within !== void 0 && !input.within.has(course.id)) continue;
    const words = `${course.id} ${course.title}`.toLowerCase().split(/[^a-z0-9]+/);
    if (tokens.every((token) => words.some((word) => word.startsWith(token)))) matches.push(course);
  }
  matches.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const fillsByCode = /* @__PURE__ */ new Map();
  for (const planTerm of input.plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind !== "slot") continue;
      const resolution = resolveSlotOptions(item, input.optionsFor);
      for (const option of resolution?.options ?? []) {
        const code = input.catalog.canonical(option);
        if (!fillsByCode.has(code)) fillsByCode.set(code, resolution?.requirement ?? item.label);
      }
    }
  }
  const limit = input.limit ?? Number.POSITIVE_INFINITY;
  const entries = matches.slice(0, limit).map((course) => {
    const availability = input.offerings.availability(course.id, input.at);
    const runs = !availability.allowed ? "never" : availability.certain ? "runs" : "uncertain";
    return {
      code: course.id,
      title: course.title,
      credits: creditsNominal(course.credits),
      runs,
      reason: runs === "runs" ? void 0 : availability.reason,
      fills: fillsByCode.get(course.id),
      done: input.completed?.has(course.id) ?? false,
      rhythm: rhythmTag(input.offerings.rhythmOf(course.id)),
      twice: (() => {
        const dip = input.doubleDips?.get(course.id);
        return dip === void 0 ? void 0 : doubleDipLabel(dip);
      })()
    };
  });
  return { entries, total: matches.length };
}
function neededCourses(plan, catalog, optionsFor) {
  const out = /* @__PURE__ */ new Set();
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind !== "slot") continue;
      for (const code of resolveSlotOptions(item, optionsFor)?.options ?? []) out.add(catalog.canonical(code));
    }
  }
  return out;
}
var CourseLibrary = class {
  element;
  #catalog;
  #offerings;
  #hooks;
  #search;
  #aim;
  #count;
  /** Every match, drawn in slices as the list is scrolled. */
  #list;
  #namedTarget;
  #slots;
  #placeholders = [];
  #plan = null;
  #completed = /* @__PURE__ */ new Set();
  #optionsFor;
  #doubleDips;
  #target = null;
  #timer = null;
  #scope = "program";
  #program;
  #scopes;
  /** What just happened, above the list, with a way back. */
  #status;
  constructor(catalog, offerings, hooks) {
    this.#catalog = catalog;
    this.#offerings = offerings;
    this.#hooks = hooks;
    this.element = element("aside", "library");
    this.element.hidden = true;
    this.element.setAttribute("aria-label", "Course library");
    const head = element("div", "lib-head");
    head.append(element("h3", void 0, "Course library"));
    const close = element("button", "dr-close", "\xD7");
    close.type = "button";
    close.setAttribute("aria-label", "Close the course library");
    close.addEventListener("click", () => this.#hooks.onClose());
    head.append(close);
    const aimRow = element("label", "lib-aim");
    aimRow.append(element("span", "control-label", "Add to"));
    this.#aim = element("select");
    this.#aim.addEventListener("change", () => {
      const key = this.#aim.value;
      const found2 = this.#plan?.terms.find((t) => termKey(t.term) === key)?.term;
      if (found2) this.#target = found2;
      this.#render();
    });
    aimRow.append(this.#aim);
    head.append(aimRow);
    const scopes = element("div", "seg lib-scope");
    scopes.setAttribute("role", "group");
    scopes.setAttribute("aria-label", "Which courses to list");
    for (const [scope, label] of [["needed", "Still needed"], ["program", "In your program"], ["all", "All courses"]]) {
      const button = element("button", "seg-btn", label);
      button.type = "button";
      button.dataset["scope"] = scope;
      button.addEventListener("click", () => {
        this.#scope = scope;
        this.#render();
      });
      scopes.append(button);
    }
    this.#scopes = scopes;
    head.append(scopes);
    this.#search = element("input", "lib-search");
    this.#search.type = "search";
    this.#search.placeholder = "Search by code or title";
    this.#search.setAttribute("aria-label", "Search the catalog");
    this.#search.addEventListener("input", () => {
      if (this.#timer !== null) clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.#render(), 90);
    });
    head.append(this.#search);
    this.element.append(head);
    this.#status = element("p", "lib-status");
    this.#status.setAttribute("aria-live", "polite");
    this.#status.hidden = true;
    this.#slots = element("div", "lib-slots");
    this.#slots.hidden = true;
    this.#count = element("p", "lib-count");
    this.#list = courseList({
      groups: [],
      name: "the course library",
      searchAbove: Number.POSITIVE_INFINITY,
      className: "lib-list"
    });
    this.element.append(this.#status, this.#slots, this.#count, this.#list.element);
    const box = this.#list.element.querySelector(".clist-box");
    if (box !== null) keepWheelIn(this.element, box);
    const named = element("form", "addnamed lib-named");
    named.append(element("span", "control-label", "Not in the list? Add it by name"));
    const row2 = element("div", "lib-named-row");
    const nameField = element("input");
    nameField.type = "text";
    nameField.placeholder = "Course name or code";
    nameField.setAttribute("aria-label", "Name a course to add");
    const creditField = element("input");
    creditField.type = "number";
    creditField.min = "0";
    creditField.max = "12";
    creditField.value = "3";
    creditField.setAttribute("aria-label", "Credits");
    const submit = element("button", "btn btn-secondary btn-sm", "Add by name");
    submit.type = "submit";
    this.#namedTarget = element("span", "lib-named-to");
    row2.append(nameField, creditField, submit, this.#namedTarget);
    named.append(
      row2,
      element(
        "span",
        "lib-hint",
        "A course added by name is left out of prerequisite, availability and requirement checks."
      )
    );
    named.addEventListener("submit", (event) => {
      event.preventDefault();
      const label = nameField.value.trim();
      if (label === "" || this.#target === null) return;
      this.#hooks.onAddNamed(label, Number(creditField.value) || 3, this.#target);
      nameField.value = "";
    });
    this.element.append(named);
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.#hooks.onClose();
    });
  }
  get isOpen() {
    return !this.element.hidden;
  }
  open(at) {
    if (at !== void 0) this.#target = at;
    this.element.hidden = false;
    this.#render();
    this.#search.focus();
  }
  close() {
    this.element.hidden = true;
    this.#status.hidden = true;
  }
  /**
   * What was just added, said above the list with a way back, so a course
   * added by mistake can be taken out without closing the panel and the
   * next one added. Undo is the plan's own; the sentence goes when it is
   * pressed, when something else is said, or when the panel closes.
   */
  notice(text, undo) {
    this.#status.textContent = "";
    this.#status.append(element("span", void 0, text));
    if (undo !== void 0) {
      const back = element("button", "lib-undo", "Undo");
      back.type = "button";
      back.addEventListener("click", () => {
        this.#status.hidden = true;
        undo();
      });
      this.#status.append(back);
    }
    this.#status.hidden = false;
  }
  /** The requirement placeholders this program's grid uses. */
  placeholders(specs) {
    this.#placeholders = specs;
  }
  /** The courses the program's requirement tables name, the major's and the minor's, or none. */
  programCourses(codes) {
    this.#program = codes !== void 0 && codes.size > 0 ? codes : void 0;
    if (this.#program === void 0 && this.#scope === "program") this.#scope = "all";
  }
  /** The plan changed under the panel. Keep the aim if its term still exists. */
  update(plan, completed, optionsFor, doubleDips2) {
    this.#plan = plan;
    this.#completed = completed;
    this.#optionsFor = optionsFor;
    this.#doubleDips = doubleDips2;
    const keys = plan.terms.map((t) => termKey(t.term));
    if (this.#target === null || !keys.includes(termKey(this.#target))) {
      this.#target = plan.terms.at(-1)?.term ?? plan.start;
    }
    this.#aim.textContent = "";
    for (const planTerm of plan.terms) {
      const option = element("option", void 0, termLabel(planTerm.term));
      option.value = termKey(planTerm.term);
      this.#aim.append(option);
    }
    this.#aim.value = termKey(this.#target);
    this.#namedTarget.textContent = `into ${termLabel(this.#target)}`;
    if (this.isOpen) this.#render();
  }
  /**
   * The program's own placeholders, to put back one that was removed or to
   * build a blank plan from. Folded shut, since a plan laid out from the
   * grid already holds them; each label once, however many terms carry it.
   */
  #renderSlots(at) {
    this.#slots.textContent = "";
    this.#slots.hidden = this.#placeholders.length === 0;
    if (this.#placeholders.length === 0) return;
    const seen = /* @__PURE__ */ new Map();
    for (const spec of this.#placeholders) {
      const key = `${spec.label}|${creditsNominal(spec.credits)}`;
      if (!seen.has(key)) seen.set(key, spec);
    }
    const fold2 = element("details", "fold lib-fold");
    fold2.append(element("summary", void 0, `Requirements to fill later (${seen.size})`));
    const body = element("div", "fold-body lib-fold-body");
    body.append(
      element(
        "p",
        "muted",
        `A placeholder for a requirement, added to ${termLabel(at)} to choose the course later: to put back one that was taken out, or to build a plan from nothing.`
      )
    );
    const list = element("div", "lib-slot-list");
    for (const spec of seen.values()) {
      const credits = creditsNominal(spec.credits);
      const add = element("button", "lib-slot", `+ ${spec.label} \xB7 ${credits} cr`);
      add.type = "button";
      add.title = `Add a ${spec.label} placeholder to ${termLabel(at)}; choose the course later`;
      add.addEventListener("click", () => this.#hooks.onAddSlot(spec, at));
      list.append(add);
    }
    body.append(list);
    fold2.append(body);
    this.#slots.append(fold2);
  }
  #render() {
    const plan = this.#plan;
    const at = this.#target;
    if (plan === null || at === null) {
      this.#count.textContent = "";
      this.#list.update([]);
      return;
    }
    this.#namedTarget.textContent = `into ${termLabel(at)}`;
    this.#renderSlots(at);
    for (const button of this.#scopes.querySelectorAll(".seg-btn")) {
      const scope = button.dataset["scope"];
      button.hidden = scope === "program" && this.#program === void 0;
      button.classList.toggle("current", scope === this.#scope);
      button.setAttribute("aria-pressed", String(scope === this.#scope));
    }
    const within = this.#scope === "needed" ? neededCourses(plan, this.#catalog, this.#optionsFor) : this.#scope === "program" ? this.#program : void 0;
    const found2 = searchCourses({
      catalog: this.#catalog,
      offerings: this.#offerings,
      plan,
      at,
      query: this.#search.value,
      completed: this.#completed,
      ...within !== void 0 ? { within } : {},
      ...this.#optionsFor ? { optionsFor: this.#optionsFor } : {},
      ...this.#doubleDips ? { doubleDips: this.#doubleDips } : {}
    });
    const entries = this.#scope === "needed" ? [...found2.entries].sort((a, b) => Number(b.twice !== void 0) - Number(a.twice !== void 0)) : found2.entries;
    const total = found2.total;
    const noun = this.#scope === "needed" ? "would fill a requirement still open" : this.#scope === "program" ? "in your program" : "in the catalog";
    this.#count.textContent = total === 0 ? this.#search.value.trim() === "" ? this.#scope === "needed" ? "Nothing still open has courses listed for it." : "Nothing to list." : "Nothing matches that search." : `${total} ${total === 1 ? "course" : "courses"} ${noun}. Click one to read about it, or add it to ${termLabel(at)}.`;
    const rows = entries.map((entry) => {
      const tags = [];
      if (entry.done) tags.push({ text: "passed" });
      if (entry.rhythm !== void 0) tags.push({ text: entry.rhythm, tone: "warn" });
      if (entry.runs === "never") tags.push({ text: `not in ${seasonWord(at.season)}`, tone: "crit" });
      const needs = this.#hooks.needsFirst?.(entry.code, at);
      if (needs !== void 0) tags.push({ text: "needs first", tone: "warn" });
      const notes = [
        ...needs !== void 0 ? [`Needs first: ${needs}`] : [],
        ...entry.fills !== void 0 ? [`Would fill: ${entry.fills}`] : [],
        ...entry.twice !== void 0 ? [`Counts twice: ${entry.twice}`] : []
      ];
      return {
        key: entry.code,
        code: entry.code,
        title: entry.title,
        detail: `${entry.credits} cr`,
        ...notes.length > 0 ? { note: notes.join(" \xB7 ") } : {},
        tags,
        muted: entry.done || entry.runs === "never",
        onOpen: (from) => this.#hooks.onRead(entry.code, at, from),
        openLabel: `${entry.code}, ${entry.title}: read about it`,
        actions: [{
          label: "Add",
          ariaLabel: `Add ${entry.code} to ${termLabel(at)}`,
          onClick: () => this.#hooks.onAdd(entry.code, at),
          primary: true
        }],
        onRender: (row2) => {
          const face = row2.querySelector(".clist-face");
          if (face !== null) {
            face.title = `${entry.code}: read about it, drag it into a term, or add it`;
            this.#hooks.dnd.attachSource(face, { kind: "library", code: entry.code, label: entry.code });
          }
        }
      };
    });
    this.#list.update([{ rows }]);
  }
};

// ../web/src/alternatives.ts
function alternativesFor(item, grid, bindings, requirements, canonical) {
  if (item.kind !== "course") return void 0;
  const current = canonical(item.code);
  const others = (codes) => {
    const out = [];
    for (const code of codes) {
      const id = canonical(code);
      if (id !== current && !out.includes(id)) out.push(id);
    }
    return out;
  };
  const gridRef = item.from ?? item.id;
  if (grid !== void 0) {
    for (const term2 of grid.terms) {
      for (const [position, gridItem] of term2.items.entries()) {
        if (gridItemId(term2.index, position) !== gridRef) continue;
        if (gridItem.kind !== "choice") break;
        const options = others(gridItem.options);
        if (options.length === 0) return void 0;
        return { requirement: gridItem.label ?? item.forRequirement ?? "this choice", options };
      }
    }
  }
  const binding = bindings.get(item.id);
  if (binding !== void 0 && requirements !== void 0) {
    for (const { node, path } of walk(requirements.requirements)) {
      if (path !== binding.requirement) continue;
      const listed = (node.of ?? []).flatMap(
        (child) => child.type === "Course" && child.code ? [child.code] : []
      );
      const options = others(listed);
      return options.length === 0 ? void 0 : { requirement: binding.label, options };
    }
  }
  return void 0;
}

// ../web/src/categories.ts
var KNOWN_TAGS = [
  [/general education/i, "GE"],
  [/matriculation/i, "MATRIC"],
  [/core/i, "CORE"],
  [/track/i, "TRACK"],
  [/emphasis/i, "EMPH"],
  [/elective/i, "ELEC"]
];
function unique(tag, taken) {
  let candidate = tag;
  let n = 2;
  while (taken.has(candidate)) candidate = `${tag}${n++}`;
  taken.add(candidate);
  return candidate;
}
function tagFor(label, taken) {
  let tag = KNOWN_TAGS.find(([pattern]) => pattern.test(label))?.[1];
  if (tag === void 0) {
    const words = label.replace(/requirements?:?/gi, "").replace(/[()]/g, "").trim().split(/\s+/).filter(Boolean);
    tag = words.length > 1 ? words.map((w) => w[0]).join("").toUpperCase().slice(0, 4) : (words[0] ?? "").toUpperCase().slice(0, 4);
  }
  let candidate = tag;
  let n = 2;
  while (taken.has(candidate)) candidate = `${tag}${n++}`;
  taken.add(candidate);
  return candidate;
}
function categoriesFor(document2, bindings, canonical, extras = []) {
  const list = [];
  const byCode = /* @__PURE__ */ new Map();
  const byTop = /* @__PURE__ */ new Map();
  const byExtra = /* @__PURE__ */ new Map();
  const taken = /* @__PURE__ */ new Set();
  if (document2 !== void 0) {
    (document2.requirements.of ?? []).forEach((child, top) => {
      const label = child.label?.trim().replace(/:$/, "");
      if (!label) return;
      const index = list.length;
      list.push({ index, label, tag: tagFor(label, taken) });
      byTop.set(top, index);
      for (const { node } of walk(child)) {
        if (node.type === "Course" && node.code !== void 0) {
          const code = canonical(node.code);
          if (!byCode.has(code)) byCode.set(code, index);
        }
      }
    });
  }
  for (const extra of extras) {
    const index = list.length;
    list.push({ index, label: extra.label, tag: /minor/i.test(extra.label) ? unique("MINOR", taken) : tagFor(extra.label, taken) });
    byExtra.set(`@EXT:${extra.id}`, index);
    for (const { node } of walk(extra.tree.requirements)) {
      if (node.type === "Course" && node.code !== void 0) {
        const code = canonical(node.code);
        if (!byCode.has(code)) byCode.set(code, index);
      }
    }
  }
  const throughBinding = (slotId) => {
    if (slotId === void 0) return void 0;
    const path = bindings.get(slotId)?.requirement;
    if (path === void 0) return void 0;
    const top = Number(path.split(".")[1]);
    const index = byTop.get(top);
    return index === void 0 ? void 0 : list[index];
  };
  const of = (item) => {
    if (item.kind === "named") return void 0;
    if (item.kind === "slot") {
      const extra = byExtra.get(item.slot);
      if (extra !== void 0) return list[extra];
      return throughBinding(item.id) ?? throughBinding(item.from);
    }
    const index = byCode.get(canonical(item.code));
    if (index !== void 0) return list[index];
    return throughBinding(item.from);
  };
  return { list, of };
}

// ../web/src/about.ts
function fold(title, ...body) {
  const box = element("details", "fold");
  box.append(element("summary", void 0, title));
  const content = element("div", "fold-body");
  for (const part of body) content.append(typeof part === "string" ? element("p", void 0, part) : part);
  box.append(content);
  return box;
}
function column(title, ...folds) {
  const col = element("div", "about-col");
  col.append(element("h2", void 0, title), ...folds);
  return col;
}
var LINKS = [
  { label: "UVU catalog", href: "https://catalog.uvu.edu/", why: "The requirements themselves, and the year yours falls under." },
  { label: "Registrar", href: "https://www.uvu.edu/registrar/", why: "Registration and records." },
  { label: "Transfer credit", href: "https://www.uvu.edu/transfer/index.html", why: "Courses taken elsewhere, AP, CLEP and IB." },
  { label: "Credit for Prior Learning", href: "https://www.uvu.edu/cpl/", why: "Test out of a course, or get credit for what you already know." },
  { label: "Dates and deadlines", href: "https://www.uvu.edu/schedule/index.html", why: "When each term starts, and the last day to add or drop." },
  { label: "Apply for graduation", href: "https://www.uvu.edu/graduation/apply/index.html", why: "Required to receive the degree, whatever your plan says." }
];
function aboutPage(input) {
  const section = element("section", "about-page");
  const year = input.catalogYear || "current";
  const first = input.window.first_term ? termLabel(parseTerm(input.window.first_term)) : void 0;
  const last = input.window.last_term ? termLabel(parseTerm(input.window.last_term)) : void 0;
  const terms = input.window.terms.length;
  const links = element("ul", "link-list");
  const advisor = element("li");
  advisor.append(element("b", void 0, "Your department's academic advisor"));
  advisor.append(element("small", void 0, "Your plan, substitutions, and anything this page cannot see."));
  links.append(advisor);
  for (const link of LINKS) {
    const item = element("li");
    const anchor = element("a", void 0, link.label);
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    item.append(anchor);
    if (link.label === "Credit for Prior Learning") {
      item.append(
        infoMark(
          "Credit for Prior Learning",
          "UVU grants Credit for Prior Learning through exams, certifications, military training and portfolio review, most often against 1000 and 2000 level courses; one exam can take a whole term's course off your plan. Credit earned this way still has to fit your degree, and exam or review fees apply, so start with the Credit for Prior Learning office before you register."
        ).element
      );
    }
    item.append(element("small", void 0, link.why));
    links.append(item);
  }
  section.append(column(
    "About the plans",
    fold(
      "Start here",
      `This is a planning map, not a degree audit. Wolverine Track and your department's academic advisor are authoritative, and this page cannot see your record: it knows what you enter under "Your record" and what you mark as done, and nothing else.`,
      `Requirements follow the ${year} catalog. If your catalog year is earlier, your advisor can tell you which requirements apply to you.`
    ),
    fold(
      "Rules beyond courses",
      "Some requirements are rules over the whole plan rather than courses: a minimum number of credits, credits at the 3000 level or above, a residency minimum, a Global/Intercultural course, and for some programs matriculation into the major. Where your program's catalog page states them they are checked under Graduation, three ways: met, not met, or cannot be checked from what this page knows. A rule the page cannot check is said to be unchecked, not assumed met."
    ),
    fold("Where to go next", links)
  ));
  section.append(column(
    "About this page",
    fold(
      "How the plan is checked",
      "The plan is your department's plan of study or, where the department has not published one, the sequence the planner built from the catalog's requirement table. Either is laid out from your first term at the pace you choose, with the courses you have passed taken out and the rest pulled forward where prerequisites, corequisites, offering history and term loads allow; the order is kept.",
      "Every change you make is checked the same way: no course before its prerequisite, none in a season or summer block it has never run in, no term over its cap, and no requirement dropped without saying so."
    ),
    fold(
      "Where the offering data comes from",
      (first && last ? `The class schedule from ${first} to ${last}, ${terms} terms in all. ` : "The class schedule on record. ") + "The catalog lists a course whether or not it runs, so the seasons come from the schedule instead. A course runs in a season when it has run there since it first appeared; it has never run there when it had at least five chances on a complete record and took none. A hole the record is known to have weakens that claim rather than silencing it, and the page says which it is.",
      "Summer is split into the full term and two seven-week blocks, each judged on its own record, so a course placed in a block is told whether it has ever run there."
    ),
    fold(
      "Editing a plan",
      "Your edits, the courses you mark as done and what you enter about yourself stay in this browser and go nowhere else, kept per program, pace and starting term. The code you copy carries the plan and what you have told the planner about yourself, so an advisor who opens it sees what you see.",
      "Undo, or Ctrl+Z, takes back your last change, a reset included; Reset brings back the plan as it was laid out. Every check runs again after each change, so you always see where the plan stands."
    )
  ));
  return section;
}

// ../web/src/planviews.ts
var HEAVY_LOAD = 17;
var HEAVY_SUMMER = 12;
var REGISTRATION_MAX = 20;
var heavyFor = (t) => t.season === "S" ? HEAVY_SUMMER : HEAVY_LOAD;
function loadNote(term2, credits) {
  if (credits > REGISTRATION_MAX) {
    const note = element("span", "term-why", "over the registration limit");
    note.title = `${credits} credits is more than the ${REGISTRATION_MAX} registration allows in one term.`;
    return note;
  }
  if (credits >= heavyFor(term2)) {
    const note = element("span", "term-why", "heavy load");
    note.title = `${heavyFor(term2)} credits or more in ${term2.season === "S" ? "a summer" : "a term"} is a heavy load.`;
    return note;
  }
  return null;
}
function blockWord(block2) {
  return block2 === void 0 ? "Full term" : block2 === "1" ? "1st block" : "2nd block";
}
function itemName(item) {
  return item.kind === "course" ? item.code : item.label;
}
function creditsOf2(item) {
  return creditsNominal(item.credits);
}
var CARD_SPECIFIC = /* @__PURE__ */ new Set([
  "not-offered",
  "offering-doubtful",
  "off-year",
  "dormant",
  "corequisite",
  "duplicate",
  "prerequisite"
]);
function problemsByItem(plan) {
  const byItem = /* @__PURE__ */ new Map();
  for (const problem of plan.problems) {
    if (problem.itemId === void 0) continue;
    byItem.set(problem.itemId, [...byItem.get(problem.itemId) ?? [], problem]);
  }
  return byItem;
}
function problemsOf(byItem, item) {
  const all = byItem.get(item.id) ?? [];
  const specific = all.filter((p) => p.severity === "error" || CARD_SPECIFIC.has(p.kind));
  const tone = specific.some((p) => p.severity === "error") ? "bad" : specific.length ? "iffy" : "";
  return { all, specific, tone };
}
function doneCredits(plan) {
  const applied = plan.appliedCredit.reduce((sum, entry) => sum + entry.credits, 0);
  const ticked = plan.terms.reduce(
    (sum, term2) => sum + term2.items.reduce((s, item) => s + (item.kind !== "slot" && item.done === true ? creditsOf2(item) : 0), 0),
    0
  );
  return applied + ticked;
}
function doneToggle(input, item, className) {
  if (item.kind === "slot") return null;
  const done = item.done === true;
  const control = element("button", className);
  control.type = "button";
  control.setAttribute("role", "checkbox");
  control.setAttribute("aria-checked", String(done));
  control.setAttribute("aria-label", `${itemName(item)}: ${done ? "done" : "not done yet"}`);
  control.title = done ? "Marked as done. Click to unmark it." : "Mark this when you have passed it.";
  control.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><polyline points="2,6.4 4.8,9 10,3"></polyline></svg>';
  control.addEventListener("click", (event) => {
    event.stopPropagation();
    input.edit((p) => toggleDone(p, item.id), item.id);
  });
  return control;
}
function removeButton(input, item, className) {
  const drop = element("button", className, "\xD7");
  drop.type = "button";
  drop.title = "Remove from the plan";
  drop.setAttribute("aria-label", `Remove ${itemName(item)}`);
  drop.addEventListener("click", (event) => {
    event.stopPropagation();
    input.edit((p) => removeItem(p, item.id), item.id);
  });
  return drop;
}
function marker(tone, message) {
  const dot = element("span", `item-dot ${tone === "bad" ? "error" : "warning"}`, tone === "bad" ? "!" : "?");
  dot.title = message;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}
function rhythmMarker(words) {
  const dot = element("span", "item-dot rhythm");
  dot.title = `Offered irregularly: ${words}`;
  dot.setAttribute("aria-hidden", "true");
  dot.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 4.4c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0M1.5 8c1.5-1.6 3-1.6 4.5 0s3 1.6 4.5 0"/></svg>';
  return dot;
}
function describe2(item, problems) {
  const first = problems.specific[0]?.message;
  return [
    item.kind === "course" ? item.title : item.kind === "slot" ? "a requirement to fill" : "a course you named",
    `${creditsOf2(item)} credits`,
    ...item.kind === "course" && item.forRequirement && (item.placement === "added" || item.placement === "swapped") ? [`for ${item.forRequirement}`] : [],
    ...first ? [first] : []
  ].join(", ");
}
function colour(input, item, box) {
  const category = input.categoryOf?.(item);
  if (category === void 0) return void 0;
  box.classList.add("cat");
  box.style.setProperty("--cat", `var(--cat-${category.index % 8})`);
  return category;
}
function payloadFor(item, at, position) {
  return { kind: "item", itemId: item.id, from: termKey(at), fromIndex: position, label: itemName(item) };
}
function gripBar(className, title) {
  const bar = element("span", className);
  bar.setAttribute("aria-hidden", "true");
  bar.title = title;
  bar.append(element("i"), element("i"), element("i"));
  return bar;
}
function termPayload(at) {
  return { kind: "term", from: termKey(at), label: termLabel(at) };
}
function canHover() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}
var escapeId = (id) => typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id.replace(/([^\w-])/g, "\\$1");
var pendingClear = /* @__PURE__ */ new WeakMap();
function trace(input, face, item, on) {
  const root = face.closest(".terms, .ttable");
  if (root === null) return;
  const clear = () => {
    for (const lit of root.querySelectorAll(".lit")) lit.classList.remove("lit", "lit-self", "lit-pre", "lit-post", "lit-swap");
    root.classList.remove("tracing");
  };
  const pending = pendingClear.get(root);
  if (pending !== void 0) {
    clearTimeout(pending);
    pendingClear.delete(root);
  }
  if (!on) {
    pendingClear.set(root, setTimeout(clear, 90));
    return;
  }
  const chain = input.chainOf?.(item);
  if (chain === void 0 || chain.pre.size === 0 && chain.post.size === 0) {
    clear();
    return;
  }
  for (const lit of root.querySelectorAll(".lit")) lit.classList.remove("lit", "lit-self", "lit-pre", "lit-post", "lit-swap");
  root.classList.add("tracing");
  const mark = (id, cls) => {
    root.querySelector(`[data-item="${escapeId(id)}"]`)?.classList.add("lit", cls);
  };
  mark(item.id, "lit-self");
  for (const id of chain.pre) mark(id, "lit-pre");
  for (const id of chain.swap) mark(id, "lit-swap");
  for (const id of chain.post) mark(id, "lit-post");
}
function attachTrace(input, face, item) {
  if (input.chainOf === void 0) return;
  face.addEventListener("mouseenter", () => {
    if (canHover()) trace(input, face, item, true);
  });
  face.addEventListener("mouseleave", () => trace(input, face, item, false));
  face.addEventListener("focus", () => {
    let visible = false;
    try {
      visible = face.matches(":focus-visible");
    } catch {
      visible = false;
    }
    if (canHover() || visible) trace(input, face, item, true);
  });
  face.addEventListener("blur", () => trace(input, face, item, false));
}
function removeTermButton(input, at, className) {
  const control = element("button", className, "\xD7");
  control.type = "button";
  control.title = `Remove ${termLabel(at)} and everything in it`;
  control.setAttribute("aria-label", `Remove ${termLabel(at)} and everything in it`);
  control.addEventListener("click", () => input.edit((p) => removeTerm(p, at)));
  return control;
}
function addHereButton(input, at) {
  const control = element("button", "addbtn", "+ course");
  control.type = "button";
  control.setAttribute("aria-label", `Add a course to ${termLabel(at)}`);
  control.addEventListener("click", () => input.onAddHere(at));
  return control;
}
function fillsTag(item) {
  if (item.kind !== "course" || item.forRequirement === void 0) return null;
  if (item.placement !== "added" && item.placement !== "swapped") return null;
  return element("span", "item-tag", `for ${item.forRequirement}`);
}
function planGrid(input) {
  const { plan, dnd } = input;
  const outer = element("div", "gridwrap");
  outer.style.setProperty("--term-max", termMax(plan.terms.length));
  outer.append(yearBand(plan));
  const wrap = element("div", "terms");
  const byItem = problemsByItem(plan);
  plan.terms.forEach((planTerm, termIndex) => {
    const credits = planTerm.items.reduce((sum, item) => sum + creditsOf2(item), 0);
    const column2 = element("div", "term");
    if (planTerm.term.season === "S") column2.classList.add("summer");
    if (credits >= heavyFor(planTerm.term)) column2.classList.add("lvl-heavy");
    if (credits > REGISTRATION_MAX) column2.classList.add("lvl-over");
    const head = element("div", "term-head");
    const grip = gripBar("term-grip", `Drag ${termLabel(planTerm.term)} onto another term to swap them`);
    head.title = `Drag ${termLabel(planTerm.term)} onto another term to swap the two`;
    const title = element("span", "term-title");
    title.append(element("span", "term-name", termLabel(planTerm.term)));
    const why = loadNote(planTerm.term, credits);
    if (why !== null) title.append(why);
    head.append(
      grip,
      title,
      element("span", "term-credits", `${credits} cr`),
      removeTermButton(input, planTerm.term, "term-act")
    );
    dnd.attachSource(head, termPayload(planTerm.term), grip);
    column2.append(head);
    column2.dataset["term"] = termKey(planTerm.term);
    const body = element("div", "term-body");
    planTerm.items.forEach((item, position) => {
      body.append(card(input, byItem, item, planTerm.term, position));
    });
    column2.append(body);
    dnd.attachZone(column2);
    const foot = element("div", "term-foot");
    foot.append(addHereButton(input, planTerm.term));
    column2.append(foot);
    wrap.append(column2);
  });
  wrap.append(newTermColumn(input));
  outer.append(wrap);
  return outer;
}
function yearBand(plan) {
  const band = element("div", "yearband");
  let last = "";
  for (const planTerm of plan.terms) {
    const year = yearWord(planTerm.term, plan.start);
    band.append(element("div", "yb", year === last ? "" : year));
    last = year;
  }
  band.append(element("div", "yb", ""));
  return band;
}
function card(input, byItem, item, at, position) {
  const problems = problemsOf(byItem, item);
  const box = element("div", `item ${item.kind} ${problems.tone} ${item.placement}`.replace(/\s+/g, " ").trim());
  box.dataset["item"] = item.id;
  if (item.kind === "course") box.dataset["code"] = item.code;
  const category = colour(input, item, box);
  if (item.kind !== "slot" && item.done === true) box.classList.add("done");
  const bar = gripBar("item-bar", `Drag ${itemName(item)} to another term, or to another place in this one`);
  box.append(bar);
  const open = element("button", "item-open");
  open.type = "button";
  open.addEventListener("click", () => input.onOpen(item, at, open));
  open.append(element("span", "item-name", itemName(item)));
  if (item.kind === "course") open.append(element("span", "item-title", item.title));
  const credits = element("span", "item-credits", `${creditsOf2(item)}`);
  open.append(credits);
  const tags = element("span", "item-tags");
  if (category !== void 0) tags.append(element("span", "item-cat", category.tag));
  if (at.season === "S") tags.append(element("span", "item-tag block", blockWord(item.block)));
  const rhythm = item.kind === "course" ? rhythmTag(input.rhythmOf?.(item)) : void 0;
  if (rhythm !== void 0) tags.append(element("span", "item-tag rhythm", rhythm));
  const fills = fillsTag(item);
  if (fills) tags.append(fills);
  if (tags.childElementCount > 0) open.append(tags);
  if (rhythm !== void 0) credits.prepend(rhythmMarker(rhythm));
  const first = problems.specific[0];
  if (first !== void 0) credits.prepend(marker(problems.tone, first.message));
  const described = describe2(item, problems);
  open.title = described;
  open.setAttribute("aria-label", `${itemName(item)}, ${described}, details`);
  const tick = doneToggle(input, item, "item-chk");
  if (tick !== null) box.append(tick);
  box.append(open, removeButton(input, item, "item-x"));
  if (item.id === input.touched) box.classList.add("touched");
  input.dnd.attachSource(box, payloadFor(item, at, position), bar);
  attachTrace(input, open, item);
  return box;
}
function newTermColumn(input) {
  const next = termAfterLast(input.plan, input.seasons);
  const column2 = element("div", "term new-term");
  column2.dataset["term"] = termKey(next);
  column2.dataset["new"] = "1";
  const head = element("div", "term-head");
  head.append(element("span", "term-name", termLabel(next)));
  column2.append(head);
  const body = element("div", "term-body");
  body.append(element("p", void 0, "Drop a course here to start this term."));
  const add = element("button", "addbtn", `Add ${termLabel(next)}`);
  add.type = "button";
  add.addEventListener("click", () => input.edit((p) => addTerm(p, next)));
  body.append(add);
  column2.append(body);
  input.dnd.attachZone(column2);
  return column2;
}
function planTable(input) {
  const { plan, dnd } = input;
  const byItem = problemsByItem(plan);
  const table = element("table", "ttable");
  const head = element("thead");
  const headRow = element("tr");
  for (const [text, className] of [["Term", ""], ["Courses", ""], ["Credits", "tcr"], ["", "tact"]]) {
    const th = element("th", className || void 0);
    th.scope = "col";
    if (text) th.textContent = text;
    else th.append(element("span", "sr", "Actions"));
    headRow.append(th);
  }
  head.append(headRow);
  table.append(head);
  const body = element("tbody");
  plan.terms.forEach((planTerm, termIndex) => {
    const credits = planTerm.items.reduce((sum, item) => sum + creditsOf2(item), 0);
    const row2 = element("tr", "trow");
    if (planTerm.term.season === "S") row2.classList.add("summer");
    if (credits >= heavyFor(planTerm.term)) row2.classList.add("lvl-heavy");
    if (credits > REGISTRATION_MAX) row2.classList.add("lvl-over");
    const th = element("th", "tterm");
    th.scope = "row";
    const grip = gripBar("term-grip", `Drag ${termLabel(planTerm.term)} onto another term to swap them`);
    th.title = `Drag ${termLabel(planTerm.term)} onto another term to swap the two`;
    th.append(grip, document.createTextNode(termLabel(planTerm.term)), element("span", "term-year", yearWord(planTerm.term, plan.start)));
    const why = loadNote(planTerm.term, credits);
    if (why !== null) th.append(why);
    dnd.attachSource(th, termPayload(planTerm.term), grip);
    row2.append(th);
    const cell = element("td");
    row2.dataset["term"] = termKey(planTerm.term);
    const chips = element("div", "chiprow");
    planTerm.items.forEach((item, position) => {
      chips.append(chip(input, byItem, item, planTerm.term, position));
    });
    chips.append(addHereButton(input, planTerm.term));
    cell.append(chips);
    dnd.attachZone(row2);
    row2.append(cell);
    row2.append(element("td", "tcr", String(credits)));
    const actions = element("td", "tact");
    actions.append(removeTermButton(input, planTerm.term, "term-act"));
    row2.append(actions);
    body.append(row2);
  });
  body.append(newTermRow(input));
  table.append(body);
  return table;
}
function chip(input, byItem, item, at, position) {
  const problems = problemsOf(byItem, item);
  const box = element("span", `chip ${item.kind} ${problems.tone} ${item.placement}`.replace(/\s+/g, " ").trim());
  box.dataset["item"] = item.id;
  if (item.kind === "course") box.dataset["code"] = item.code;
  colour(input, item, box);
  if (item.kind !== "slot" && item.done === true) box.classList.add("done");
  const tick = doneToggle(input, item, "chip-chk");
  if (tick !== null) box.append(tick);
  const open = element("button", "chip-open");
  open.type = "button";
  open.append(document.createTextNode(itemName(item)));
  open.append(element("i", void 0, String(creditsOf2(item))));
  if (at.season === "S") open.append(element("i", "chip-block", blockWord(item.block)));
  const rhythm = item.kind === "course" ? rhythmTag(input.rhythmOf?.(item)) : void 0;
  if (rhythm !== void 0) open.append(rhythmMarker(rhythm));
  const first = problems.specific[0];
  if (first !== void 0) open.append(marker(problems.tone, first.message));
  const described = describe2(item, problems);
  open.title = described;
  open.setAttribute("aria-label", `${itemName(item)}, ${described}, details`);
  open.addEventListener("click", () => input.onOpen(item, at, open));
  box.append(open, removeButton(input, item, "chip-x"));
  if (item.id === input.touched) box.classList.add("touched");
  input.dnd.attachSource(box, payloadFor(item, at, position));
  attachTrace(input, open, item);
  return box;
}
function newTermRow(input) {
  const next = termAfterLast(input.plan, input.seasons);
  const row2 = element("tr", "trow new-term");
  row2.dataset["term"] = termKey(next);
  row2.dataset["new"] = "1";
  const th = element("th", "tterm", termLabel(next));
  th.scope = "row";
  row2.append(th);
  const cell = element("td");
  const line = element("div", "chiprow");
  line.append(element("span", void 0, "Drop a course here to start this term, or"));
  const add = element("button", "addbtn", `add ${termLabel(next)}`);
  add.type = "button";
  add.addEventListener("click", () => input.edit((p) => addTerm(p, next)));
  line.append(add);
  cell.append(line);
  row2.append(cell, element("td", "tcr", ""), element("td", "tact", ""));
  input.dnd.attachZone(row2);
  return row2;
}
function yearWord(at, start) {
  return `Year ${yearFrom(start, at)}`;
}
function termMax(count2) {
  return count2 < 6 ? "300px" : "1fr";
}
function additionsFold(additions, notes) {
  const count2 = additions.reduce((n, a) => n + a.items.length, 0);
  const fold2 = element("details", "fold pgm-additions");
  const names = additions.map((a) => a.program);
  fold2.append(element("summary", void 0, `Added for ${names.length <= 2 ? names.join(" and ") : `${names.length} programs`} (${count2})`));
  const body = element("div", "fold-body");
  for (const addition of additions) {
    if (additions.length > 1) body.append(element("h4", "clist-group", addition.program));
    const list = element("ul", "added-list");
    for (const item of addition.items) {
      const row2 = element("li", item.code === void 0 ? "choice" : void 0);
      if (item.code !== void 0) {
        row2.append(element("b", void 0, item.code));
        if (item.title) row2.append(document.createTextNode(` ${item.title}`));
      } else {
        row2.append(element("b", void 0, "To choose"), document.createTextNode(` ${item.label.replace(/:$/, "")}`));
      }
      if (item.filled) row2.append(element("small", void 0, `fills ${item.filled}`));
      list.append(row2);
    }
    body.append(list);
  }
  for (const note of notes) body.append(element("p", "muted", note));
  fold2.append(body);
  return fold2;
}
function planSummary(input) {
  const { plan } = input;
  const section = element("section", "summary");
  const head = element("div", "pgm");
  if (input.degree) {
    head.append(element("p", "eyebrow-label", `${input.degree} \xB7 ${input.source === GENERATED_SOURCE ? "sequence the planner built" : "plan of study"}`));
  }
  head.append(element("h2", void 0, input.title));
  if (input.pace && (input.pace.custom || input.pace.published)) {
    head.append(
      element(
        "p",
        "pgm-line",
        input.pace.custom ? "A blank plan to build up: add terms, then add courses and requirements from the library." : `As the department planned it, over ${seasonsPhrase(input.seasons)}, no term over ${input.pace.cap} credits.`
      )
    );
  }
  if (input.additions?.length || input.additionNotes?.length) head.append(additionsFold(input.additions ?? [], input.additionNotes ?? []));
  const catalogUrl = input.facts?.url ?? (input.source && /^https?:\/\//.test(input.source) ? input.source : void 0);
  if (input.facts) {
    const facts = element("p", "pgm-facts");
    facts.append(element("span", void 0, `${input.facts.college} \xB7 ${input.facts.department}`));
    if (catalogUrl) {
      facts.append(" \xB7 ");
      const link = element("a", "cat-link", "Catalog page");
      link.href = catalogUrl;
      link.target = "_blank";
      link.rel = "noopener";
      facts.append(link);
    }
    head.append(facts);
  } else if (catalogUrl) {
    const link = element("a", "cat-link", "Official requirements: the catalog page");
    link.href = catalogUrl;
    link.target = "_blank";
    link.rel = "noopener";
    head.append(link);
  }
  if (input.facts && !input.facts.onFile) {
    const notice = element("div", "pgm-notice");
    notice.setAttribute("role", "note");
    if (input.facts.requirementsOnFile) {
      notice.append(
        element("b", void 0, "No published plan of study on file. "),
        "The planner has this program's requirement table from the catalog, so Program requirements below lists what the degree needs and checks it against what you add; the terms below start empty, since the department's own semester plan is not on file. The catalog page has it."
      );
    } else {
      notice.append(
        element("b", void 0, "Catalog page only. "),
        "The planner has this program from the catalog's program list, not its plan of study or requirement table. The terms below start empty, and nothing here is checked against the program's requirements. The catalog page has both."
      );
    }
    head.append(notice);
  }
  if (input.facts && input.facts.siblings.length > 1) {
    const family = element("div", "pgm-family");
    family.setAttribute("role", "group");
    family.setAttribute("aria-label", "Programs in this degree");
    family.append(element("span", "pgm-family-label", "In this degree"));
    for (const sibling of input.facts.siblings) {
      const button = element("button", `pgm-sib${sibling.current ? " current" : ""}${sibling.onFile ? "" : " catalog-only"}`);
      button.type = "button";
      button.setAttribute("aria-pressed", String(sibling.current));
      button.append(element("span", void 0, sibling.label));
      button.addEventListener("click", sibling.pick);
      family.append(button);
    }
    head.append(family);
  }
  if (input.facts?.unnamedEmphases !== void 0) {
    const n = input.facts.unnamedEmphases;
    head.append(
      element(
        "p",
        "pgm-facts pgm-unnamed",
        n === 1 ? "The catalog page defines an emphasis block of its own. The extract carries its courses but not its name, so it cannot be offered here as a choice." : `The catalog page defines ${n} emphasis or track blocks of its own. The extract carries their courses but not their names, so they cannot be offered here as choices.`
      )
    );
  }
  if (input.facts?.emphasisCourses) {
    const courses = input.facts.emphasisCourses;
    const fold2 = element("details", "fold pgm-emph");
    const summary = element("summary");
    summary.append(element("span", "fold-label", `${courses.heading} (${courses.entries.length})`));
    fold2.append(summary);
    const body = element("div", "fold-body");
    if (courses.note) body.append(element("p", "muted", courses.note));
    const list = element("ul", "pgm-emph-list");
    for (const entry of courses.entries) {
      const row2 = element("li");
      row2.append(element("b", void 0, entry.code), ` ${entry.title}`);
      if (entry.detail) row2.append(element("span", "muted", ` \xB7 ${entry.detail}`));
      list.append(row2);
    }
    body.append(list);
    if (courses.unparsed?.length) {
      body.append(
        element("p", "muted", `Not read, kept as written: ${courses.unparsed.join("; ")}`)
      );
    }
    fold2.append(body);
    head.append(fold2);
  }
  section.append(head);
  const loads = plan.terms.map((term2) => term2.items.reduce((sum, item) => sum + creditsOf2(item), 0));
  const planned = loads.reduce((a, b) => a + b, 0);
  const done = doneCredits(plan);
  const sorted = [...loads].sort((a, b) => a - b);
  const median = sorted.length === 0 ? 0 : sorted[Math.floor((sorted.length - 1) / 2)];
  const peak = sorted.at(-1) ?? 0;
  const last = plan.terms.at(-1)?.term;
  const errors = plan.problems.filter((p) => p.severity === "error").length;
  const stats = element("div", "stats");
  const stat = (key, value, unit, tone = "", target) => {
    let tile;
    if (target !== void 0 && input.onJump !== void 0) {
      const button = element("button", `stat link ${tone}`.trim());
      button.type = "button";
      button.title = "Show the list";
      const jump = input.onJump;
      button.addEventListener("click", () => jump(target));
      tile = button;
    } else {
      tile = element("div", `stat ${tone}`.trim());
    }
    const figure = element("div", "v");
    figure.append(element("span", "n", value));
    if (unit) figure.append(element("span", "u", unit));
    tile.append(element("div", "k", key), figure);
    stats.append(tile);
  };
  const counted = planned + done;
  const required = input.requiredCredits;
  stat(
    "Credits",
    required === void 0 ? String(counted) : `${Math.min(counted, required)}/${required}`,
    `${planned} in the plan \xB7 ${done} passed` + (required !== void 0 && counted < required ? ` \xB7 ${required - counted} still to find` : "")
  );
  stat("Terms", String(plan.terms.length), last ? seasonsPhrase(input.seasons) : "none scheduled");
  stat("Credits a term", String(median), `median \xB7 min ${sorted[0] ?? 0} \xB7 max ${peak}`, peak >= HEAVY_LOAD ? "warn" : "");
  stat("Finishing", last ? termLabel(last) : "\u2014", last ? yearsWord(yearsSpanned(plan.start, last, input.seasons)) : "no terms");
  stat("To fix", String(errors), errors > 0 ? "problems, click to see" : "problems", errors > 0 ? "bad" : "ok", "checks#error");
  const byItem = problemsByItem(plan);
  let watch = 0;
  for (const term2 of plan.terms) {
    for (const item of term2.items) if (problemsOf(byItem, item).tone === "iffy") watch += 1;
  }
  stat(
    "To confirm",
    String(watch),
    watch > 0 ? `${watch === 1 ? "course" : "courses"}, click to see` : "courses",
    watch > 0 ? "warn" : "ok",
    "checks#warning"
  );
  if (input.standing) {
    const unmet = input.standing.findings.filter((f) => f.standing === "unmet").length;
    const open = input.standing.findings.filter((f) => f.standing === "unverifiable").length;
    stat(
      "Requirements",
      String(unmet),
      (unmet > 0 ? "still needed" : "still needed, all met") + (open > 0 ? ` \xB7 ${open} can't be checked here` : ""),
      unmet > 0 ? "bad" : "ok",
      "requirements"
    );
  }
  if (input.graduation) {
    const all = input.graduation.findings.length;
    const met = input.graduation.findings.filter((f) => f.standing === "met").length;
    const unmet = input.graduation.findings.filter((f) => f.standing === "unmet").length;
    const open = all - met - unmet;
    stat(
      "Graduation",
      `${met}/${all}`,
      "rules met" + (unmet > 0 ? ` \xB7 ${unmet} not yet` : "") + (open > 0 ? ` \xB7 ${open} can't be checked here` : ""),
      unmet > 0 ? "bad" : met === all ? "ok" : "",
      "graduation"
    );
  }
  if (stats.childElementCount === 8) stats.classList.add("two-rows");
  section.append(stats);
  return section;
}

// ../web/src/context.ts
var STORAGE_KEY = "uvu-planner.context.v1";
var PLAN_KEY = "uvu-planner.plan.v1";
var SHARED_KEY = "uvu-planner.shared.v1";
var ENTRY = /^([A-Za-z]{2,5})\s*[- ]?\s*(\d{3,4}[A-Za-z]?)\s*(?:[:;-]?\s*([A-Da-d][+-]?|[Pp]ass|[Cc][Rr]))?$/;
var BARE_GRADE = /^([A-Da-d][+-]?|[Pp]ass|[Cc][Rr])$/;
function parseCompleted(text, catalog) {
  const completed = [];
  const unknown = [];
  const unreadable = [];
  const seen = /* @__PURE__ */ new Set();
  let credits = 0;
  for (const raw of text.split(/[,\n;\t]+/)) {
    const piece = raw.trim();
    if (piece === "") continue;
    const bare = BARE_GRADE.exec(piece);
    if (bare !== null) {
      const previous = completed.at(-1);
      if (previous !== void 0 && previous.grade === void 0 && /^[A-Da-d]/.test(piece)) {
        completed[completed.length - 1] = { ...previous, grade: piece.toUpperCase() };
        continue;
      }
      unreadable.push(piece);
      continue;
    }
    const match2 = ENTRY.exec(piece);
    if (match2 === null) {
      unreadable.push(piece);
      continue;
    }
    const code = `${match2[1].toUpperCase()} ${match2[2].toUpperCase()}`;
    const canonical = catalog.canonical(code);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const course = catalog.get(canonical);
    if (course === void 0) unknown.push(code);
    else credits += creditsNominal(course.credits);
    const grade = match2[3];
    completed.push({
      code: canonical,
      ...grade && /^[A-Da-d]/.test(grade) ? { grade: grade.toUpperCase() } : {}
    });
  }
  return { completed, unknown, unreadable, credits };
}
function toStudentContext(input) {
  const placement = {};
  if (input.mathPlacement) placement["math"] = input.mathPlacement;
  if (input.englishPlacement) placement["english"] = input.englishPlacement;
  const standing = {};
  if (input.advancedStanding) standing["university_advanced_standing"] = true;
  if (input.matriculated) standing["matriculated"] = true;
  for (const key of input.asserted ?? []) if (key !== "") standing[key] = true;
  return {
    ...input.completed.length > 0 ? { completed: [...input.completed] } : {},
    ...input.inProgress && input.inProgress.length > 0 ? { inProgress: [...input.inProgress] } : {},
    ...Object.keys(placement).length > 0 ? { placement } : {},
    ...Object.keys(standing).length > 0 ? { standing } : {},
    ...input.chosen && Object.keys(input.chosen).length > 0 ? { chosen: { ...input.chosen } } : {},
    ...input.minors && input.minors.length > 0 ? { minors: [...input.minors] } : {},
    ...input.majors && input.majors.length > 0 ? { majors: [...input.majors] } : {},
    ...input.majorChoices && Object.keys(input.majorChoices).length > 0 ? { majorChoices: Object.fromEntries(Object.entries(input.majorChoices).map(([id, chosen]) => [id, { ...chosen }])) } : {},
    ...input.maxCreditsPerTerm !== void 0 ? { constraints: { maxCreditsPerTerm: input.maxCreditsPerTerm } } : {},
    ...input.catalogYear ? { catalogYear: input.catalogYear } : {}
  };
}
function loadStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? void 0 : JSON.parse(raw);
  } catch {
    return void 0;
  }
}
function save(stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
  }
}
function savePlan(key, plan, slot = PLAN_KEY) {
  try {
    window.localStorage.setItem(slot, JSON.stringify({ key, plan }));
  } catch {
  }
}
function loadPlan(key, slot = PLAN_KEY) {
  try {
    const raw = window.localStorage.getItem(slot);
    if (raw === null) return void 0;
    const stored = JSON.parse(raw);
    return stored.key === key ? stored.plan : void 0;
  } catch {
    return void 0;
  }
}
function forgetPlan(key, slot = PLAN_KEY) {
  try {
    const raw = window.localStorage.getItem(slot);
    if (raw === null) return;
    const stored = JSON.parse(raw);
    if (stored.key === key) window.localStorage.removeItem(slot);
  } catch {
  }
}
var saveSharedPlan = (key, plan) => savePlan(key, plan, SHARED_KEY);
var loadSharedPlan = (key) => loadPlan(key, SHARED_KEY);
var forgetSharedPlan = (key) => forgetPlan(key, SHARED_KEY);

// ../web/src/data.ts
var DATA_BASE = "./data";
var BASE = DATA_BASE;
function mergeCourses(base, delta) {
  const removed = new Set(delta.removed);
  const out = /* @__PURE__ */ new Map();
  for (const course of base) {
    if (removed.has(course.id)) continue;
    const changed = delta.changed[course.id];
    out.set(course.id, changed === void 0 ? course : { ...changed, ...course.offering ? { offering: course.offering } : {} });
  }
  for (const [id, course] of Object.entries(delta.changed)) {
    if (!out.has(id) && !removed.has(id)) out.set(id, course);
  }
  return [...out.values()];
}
var collegeName = (name) => name.replace(/^Scott M\. Smith College\b/, "Smith College");
var withCollegeName = (entry) => entry.college === void 0 ? entry : { ...entry, college: collegeName(entry.college) };
var STAMP = typeof document === "undefined" ? null : document.querySelector('meta[name="build"]')?.getAttribute("content") ?? null;
async function json(path) {
  const response = await fetch(`${BASE}/${path}${STAMP === null ? "" : `?v=${STAMP}`}`);
  if (!response.ok) throw new Error(`could not load ${path}: ${response.status}`);
  return await response.json();
}
async function load() {
  const manifest = await json("manifest.json");
  const optional = (file) => file === void 0 ? Promise.resolve(void 0) : json(file);
  const [courseDoc, rawGrids, rawRequirements, rawBindings, rawGraduation, rawIndex, tuition, registration, outcomes, rawGenerated, rawGeneratedBindings] = await Promise.all([
    json("courses/catalog.json"),
    Promise.all(manifest.grids.map((file) => json(`grids-catalog/${file}`))),
    manifest.requirementsFile ? json(manifest.requirementsFile).then((bundle) => Object.values(bundle)) : Promise.all(
      manifest.requirements.map((file) => json(`requirements/${file}`))
    ),
    Promise.all(manifest.bindings.map((file) => json(`bindings/${file}`))),
    Promise.all(
      (manifest.graduation ?? []).map((file) => json(`graduation/${file}`))
    ),
    manifest.programIndex ? json(manifest.programIndex) : Promise.resolve({ programs: [] }),
    optional(manifest.reference?.tuition),
    optional(manifest.reference?.registration),
    optional(manifest.reference?.outcomes),
    optional(manifest.generatedGrids),
    optional(manifest.generatedBindings)
  ]);
  const editions = await Promise.all(
    (manifest.years ?? []).map(async (entry) => ({
      year: entry.year,
      delta: await json(entry.courses),
      trees: Object.values(await json(entry.requirements)),
      index: (await json(entry.programs)).programs.map(withCollegeName),
      outcomes: await optional(entry.outcomes)
    }))
  );
  const listed = new Map(rawIndex.programs.map((program2) => [program2.id, program2]));
  const courses = Object.values(courseDoc.courses);
  const trees = new Map(rawRequirements.map((doc) => [doc.programId, doc]));
  const graduation = new Map(rawGraduation.map((doc) => [doc.programId, doc]));
  const bindings = new Map(
    rawBindings.map((doc) => [
      doc.programId,
      new Map(doc.bindings.map((b) => [b.slot, b]))
    ])
  );
  const program = (raw, file, slotBindings) => ({
    file,
    id: raw.programId,
    name: raw.meta?.name ?? raw.programId,
    degree: raw.meta?.degree ?? "",
    totalCredits: raw.meta?.totalCredits,
    variant: raw.variant ?? 0,
    variants: raw.variants ?? 1,
    grid: parseGrid(raw),
    notes: raw.terms.flatMap((term2) => term2.notes ?? []),
    bindings: slotBindings,
    ...trees.has(raw.programId) ? { requirements: trees.get(raw.programId) } : {},
    ...graduation.has(raw.programId) ? { graduation: graduation.get(raw.programId) } : {},
    ...listed.has(raw.programId) ? { catalog: listed.get(raw.programId) } : {},
    ...raw.notes?.length ? { buildNotes: raw.notes } : {}
  });
  const programs = [
    ...rawGrids.map((raw, index) => program(raw, manifest.grids[index], bindings.get(raw.programId) ?? /* @__PURE__ */ new Map())),
    // The planner's own sequences, after the departments' plans, each with
    // the bindings built beside it. The file name is what a stored choice and
    // a share link carry; it names no file on the server.
    ...Object.values(rawGenerated ?? {}).map(
      (raw) => program(
        raw,
        `${raw.programId}.generated.json`,
        new Map((rawGeneratedBindings?.[raw.programId]?.bindings ?? []).map((b) => [b.slot, b]))
      )
    )
  ].sort((a, b) => a.name.localeCompare(b.name) || a.variant - b.variant);
  const baseYear = manifest.baseYear ?? [...trees.values()][0]?.catalogYear ?? "2026-2027";
  const years = [baseYear, ...editions.map((e) => e.year).filter((y) => y !== baseYear)];
  const shared = {
    years,
    ...tuition ? { tuition } : {},
    ...registration ? { registration } : {},
    dataVersion: manifest.dataVersion,
    builtAt: manifest.builtAt
  };
  const views = /* @__PURE__ */ new Map();
  const forYear = (year) => views.get(year) ?? views.get(baseYear);
  views.set(baseYear, {
    ...shared,
    year: baseYear,
    forYear,
    catalog: new CourseCatalog(courses),
    offerings: OfferingEvidence.fromCourses(courses, courseDoc.offeringWindow),
    programs,
    trees,
    index: rawIndex.programs.map(withCollegeName),
    ...outcomes ? { outcomes } : {}
  });
  for (const edition of editions) {
    const merged = mergeCourses(courses, edition.delta);
    const catalog = new CourseCatalog(merged);
    const offerings = OfferingEvidence.fromCourses(merged, courseDoc.offeringWindow);
    const editionTrees = new Map(edition.trees.map((doc) => [doc.programId, doc]));
    const editionPrograms = edition.index.filter((entry) => entry.award !== "Minor" && editionTrees.has(entry.id)).map((entry) => generatedProgram(entry, editionTrees.get(entry.id), catalog, offerings, edition.year)).sort((a, b) => a.name.localeCompare(b.name));
    views.set(edition.year, {
      ...shared,
      year: edition.year,
      forYear,
      catalog,
      offerings,
      programs: editionPrograms,
      trees: editionTrees,
      index: edition.index,
      ...edition.outcomes ? { outcomes: edition.outcomes } : {}
    });
  }
  return views.get(baseYear);
}
function generatedProgram(entry, tree, catalog, offerings, year) {
  let built;
  const build = () => built ??= generateGrid({
    tree,
    program: { id: entry.id, name: entry.name, degree: entry.degree, ...entry.credits !== void 0 ? { credits: entry.credits } : {} },
    catalog,
    offerings,
    catalogYear: year
  });
  return {
    file: `${entry.id}.${year}.generated.json`,
    id: entry.id,
    name: entry.name,
    degree: entry.degree,
    totalCredits: tree.totalCredits ?? entry.credits,
    variant: 0,
    variants: 1,
    get grid() {
      return build().grid;
    },
    notes: [],
    requirements: tree,
    get bindings() {
      return new Map(build().bindings.map((b) => [b.slot, { requirement: b.requirement, label: b.label, basis: b.basis, confidence: b.confidence }]));
    },
    catalog: entry,
    get buildNotes() {
      return build().notes;
    }
  };
}

// ../web/src/costs.ts
function costsSection(input) {
  if (input.tuition === void 0 && input.registration === void 0) return void 0;
  const section = element("details", "fold costs");
  section.id = "costs";
  section.append(element("summary", void 0, "Tuition and registration"));
  const body = element("div", "fold-body");
  if (input.tuition !== void 0) body.append(...tuitionPart(input, input.tuition));
  if (input.registration !== void 0) body.append(...registrationPart(input, input.registration));
  section.append(body);
  return section;
}
var TUITION_PAGE = "https://www.uvu.edu/tuition/";
function tuitionPart(input, table) {
  const out = [];
  out.push(element("p", "eyebrow-label cost-head", "Tuition"));
  const { from, to } = table.plateau;
  const fees = table.feesFrom ?? void 0;
  out.push(
    element(
      "p",
      void 0,
      `In a fall or spring semester, ${from} to ${to} credits cost the same, so ${from} credits cost what ${to} do and the credits between are at no extra tuition. Below ${from}, tuition is charged by the credit; above ${to}, each further credit is charged again.` + (fees !== void 0 ? ` Student fees stop rising at ${fees} credits.` : "")
    )
  );
  const rows = input.plan.terms.filter((planTerm) => planTerm.term.season !== "S").map((planTerm) => {
    const credits = input.creditsOf(planTerm.term);
    return { label: termLabel(planTerm.term), credits, band: tuitionBand(credits, table) };
  }).filter((row2) => row2.band !== void 0);
  if (rows.length > 0) {
    const named = (band) => rows.filter((row2) => row2.band === band).map((row2) => `${row2.label} (${row2.credits})`);
    const parts = [];
    const on = named("plateau");
    const under = named("below");
    const over = named("above");
    if (on.length > 0) parts.push(`on the flat rate: ${on.join(", ")}`);
    if (under.length > 0) parts.push(`under it, charged by the credit: ${under.join(", ")}`);
    if (over.length > 0) parts.push(`over it, with the credits past ${to} charged again: ${over.join(", ")}`);
    out.push(element("p", void 0, `In this plan, ${parts.join("; ")}.`));
  }
  out.push(
    element(
      "p",
      "muted",
      "Credits beyond 125% of what the degree requires are billed to residents at double the resident rate under Utah's R515 policy, on or off the flat rate."
    )
  );
  const where = element("p", "muted");
  const page = element("a", void 0, "UVU's tuition and fees page");
  page.href = TUITION_PAGE;
  page.target = "_blank";
  page.rel = "noopener";
  where.append(`The amounts for ${table.academicYear} are on `, page, ", which is where to check them.");
  out.push(where);
  return out;
}
function registrationPart(input, table) {
  const out = [];
  out.push(element("p", "eyebrow-label cost-head", "When registration opens for you"));
  const tier = registrationTier(input.earnedCredits, table);
  const dated = registrationTerms(table);
  const planned = new Set(input.plan.terms.map((t) => termKey(t.term)));
  const at = typeof table.opensAt === "string" ? table.opensAt : table.opensAt.join(" or ");
  if (tier === void 0) {
    out.push(element("p", "muted", "The registration table has no tier for this credit count."));
    return out;
  }
  out.push(
    element(
      "p",
      void 0,
      `With ${input.earnedCredits} ${input.earnedCredits === 1 ? "credit" : "credits"} earned, you are in the ${tier.threshold}+ tier: registration opens by tier, students with the most credits first, at ${at}. A tier is a floor, not a band: reaching it opens registration for you on that day and every day after.`
    )
  );
  const bySeason = /* @__PURE__ */ new Map();
  for (const key of dated) {
    const when = tier.opens[key];
    const at2 = parseTerm(key);
    if (when === void 0) continue;
    const held = bySeason.get(at2.season);
    if (held === void 0 || compareTerms(at2, held.term) > 0) bySeason.set(at2.season, { when, term: at2 });
  }
  if (bySeason.size > 0) {
    out.push(
      element(
        "p",
        "muted",
        "The most recent dates on file for your tier, one for each season. The registrar publishes each year's dates; a later year's fall in about the same weeks."
      )
    );
    const list = element("ul", "reg-dates");
    for (const season of ["F", "P", "S"]) {
      const entry = bySeason.get(season);
      if (entry === void 0) continue;
      const date = /* @__PURE__ */ new Date(`${entry.when}T12:00:00`);
      const words = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      const item = element("li");
      item.append(element("b", void 0, `A ${seasonWord(season)} term`), document.createTextNode(`: ${words}, for ${termLabel(entry.term)}`));
      list.append(item);
    }
    out.push(list);
  }
  out.push(
    element(
      "p",
      "muted",
      "Earned credits are the courses you've passed, as you listed them above."
    )
  );
  return out;
}

// ../web/src/minors.ts
function minorCandidates(loaded) {
  const out = [];
  for (const entry of loaded.index) {
    if (entry.award !== "Minor") continue;
    const tree = loaded.trees.get(entry.id);
    if (tree === void 0) continue;
    out.push({
      id: entry.id,
      name: entry.name,
      tree,
      ...entry.credits !== void 0 ? { totalCredits: entry.credits } : {},
      department: entry.department
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
function minorChoices(candidates) {
  return candidates.map((candidate) => ({
    label: `${candidate.name}, Minor`,
    degree: "Minor",
    ...candidate.department ? { department: candidate.department } : {}
  }));
}

// ../web/src/outcomes.ts
var whole = (n) => n.toLocaleString("en-US");
var money = (n) => `$${n.toLocaleString("en-US")}`;
function outcomesFold(outcomes) {
  if (outcomes === void 0) return void 0;
  const hasOutcomes = (outcomes.outcomes?.length ?? 0) > 0;
  const hasJobs = (outcomes.occupations?.length ?? 0) > 0;
  if (!hasOutcomes && !hasJobs) return void 0;
  const fold2 = element("details", "fold outcomes");
  fold2.append(element("summary", void 0, "What graduates can do, and where they work"));
  const body = element("div", "fold-body");
  if (hasOutcomes) {
    body.append(element("h3", void 0, "Learning outcomes"));
    const list = element("ul", "outcome-list");
    for (const sentence of outcomes.outcomes ?? []) list.append(element("li", void 0, sentence));
    body.append(list);
  }
  if (hasJobs) {
    const heading = element("h3", void 0, "Occupations");
    heading.append(
      infoMark(
        "Occupations",
        "The catalog page's own figures for these occupations, as it gives them; the planner adds nothing to them."
      ).element
    );
    body.append(heading);
    const table = element("table", "jobs-table");
    const head = element("tr");
    for (const label of ["Occupation", "Positions", "Growth", "Median salary", "Openings a year"]) {
      head.append(element("th", void 0, label));
    }
    table.append(head);
    for (const job of outcomes.occupations ?? []) {
      const row2 = element("tr");
      row2.append(
        element("td", void 0, job.occupation),
        element("td", "num", job.positions !== void 0 ? whole(job.positions) : "\u2014"),
        element("td", "num", job.growthPct !== void 0 ? `${job.growthPct}%` : "\u2014"),
        element("td", "num", job.medianSalary !== void 0 ? money(job.medianSalary) : "\u2014"),
        element("td", "num", job.openingsThousands !== void 0 ? `${whole(Math.round(job.openingsThousands * 1e3))}` : "\u2014")
      );
      table.append(row2);
    }
    body.append(table);
  }
  fold2.append(body);
  return fold2;
}

// ../web/src/applyrecord.ts
function applyRecordToSlots(plan, passed, catalog, optionsFor) {
  let out = plan;
  const used = /* @__PURE__ */ new Set();
  for (const raw of passed) {
    const code = catalog.canonical(raw);
    if (used.has(code)) continue;
    const applied = out.appliedCredit.find((entry2) => catalog.canonical(entry2.code) === code);
    if (applied?.satisfied !== void 0) continue;
    const fill = fillFor(out, code, catalog, optionsFor);
    if (fill === void 0) continue;
    used.add(code);
    const credits = catalog.get(code)?.credits;
    const entry = { code, credits: applied?.credits ?? (credits === void 0 ? 0 : creditsNominal(credits)), satisfied: fill.slot.id };
    out = {
      ...out,
      terms: out.terms.map((planTerm) => ({ ...planTerm, items: planTerm.items.filter((item) => item.id !== fill.slot.id) })),
      appliedCredit: applied === void 0 ? [...out.appliedCredit, entry] : out.appliedCredit.map((other) => other === applied ? entry : other)
    };
  }
  return out;
}
function applyRecordToPlan(plan, passed, catalog, optionsFor) {
  const held = new Set(passed.map((code) => catalog.canonical(code)));
  const applied = [...plan.appliedCredit];
  const terms = plan.terms.map((planTerm) => ({
    ...planTerm,
    items: planTerm.items.filter((item) => {
      if (item.kind !== "course" || !held.has(catalog.canonical(item.code))) return true;
      const code = catalog.canonical(item.code);
      const already = applied.findIndex((entry2) => catalog.canonical(entry2.code) === code && entry2.satisfied === void 0);
      const entry = { code, credits: creditsNominal(item.credits), satisfied: item.id };
      if (already >= 0) applied[already] = entry;
      else applied.push(entry);
      return false;
    })
  }));
  const without = terms.some((planTerm, i) => planTerm.items.length !== plan.terms[i].items.length) ? { ...plan, terms, appliedCredit: applied } : plan;
  return applyRecordToSlots(without, passed, catalog, optionsFor);
}

// ../web/src/closest.ts
function awardKind(entry) {
  if (/graduate|master|doctor/i.test(`${entry.degree} ${entry.title}`)) return void 0;
  switch (entry.award) {
    case "Bachelor":
      return "bachelor";
    case "Associate":
      return "associate";
    case "Certificate":
      return "certificate";
    default:
      return void 0;
  }
}
function closestPrograms(entries, trees, passed, catalog, each = 3) {
  const held = passed.map((code) => catalog.canonical(code));
  const ranked = [];
  for (const entry of entries) {
    const kind = awardKind(entry);
    const tree = trees.get(entry.id);
    if (kind === void 0 || tree === void 0) continue;
    const required = tree.totalCredits ?? entry.credits;
    if (required === void 0) continue;
    const standing = satisfy({ requirements: tree.requirements, catalog, held, totalCredits: required });
    const covered = standing.creditsApplied;
    if (covered === 0) continue;
    ranked.push({ id: entry.id, title: entry.title, kind, required, covered, needed: Math.max(0, required - covered) });
  }
  const out = [];
  for (const kind of ["certificate", "associate", "bachelor"]) {
    out.push(
      ...ranked.filter((c) => c.kind === kind).sort((a, b) => (a.needed ?? Number.POSITIVE_INFINITY) - (b.needed ?? Number.POSITIVE_INFINITY)).slice(0, each)
    );
  }
  return out;
}

// ../web/src/needsfirst.ts
function needsFirst(code, at, plan, context, catalog, optionsFor) {
  const result = prerequisiteStanding(code, at, plan, context, catalog, optionsFor);
  if (result === void 0 || result.truth !== "unmet") return void 0;
  const phrases = result.reasons.map(
    (reason) => reason.replace(/\.$/, "").replace(/^(\S+ \S+) has to come first$/, "$1").replace(/^One of (.*) has to come first$/, "one of $1")
  );
  if (phrases.length > 0) return phrases.join("; ");
  const missing = [...new Set(result.missingCourses)];
  return missing.length > 0 ? missing.join(", ") : void 0;
}

// ../web/src/programs.ts
var programLabel = (program) => {
  const name = `${program.name}${program.degree ? `, ${program.degree}` : ""}`;
  return program.variants > 1 ? `${name} (plan ${program.variant + 1} of ${program.variants})` : name;
};
var familyKey = (family) => `${family.name}, ${family.degree}`;
function chosenFor(choice) {
  return choice.track === void 0 ? void 0 : { [choice.track.path]: choice.track.label };
}
function programChoices(loaded) {
  const onFile = /* @__PURE__ */ new Map();
  for (const program of loaded.programs) {
    onFile.set(program.id, [...onFile.get(program.id) ?? [], program]);
  }
  const families = /* @__PURE__ */ new Map();
  for (const entry of loaded.index) {
    const key = familyKey(entry.family);
    families.set(key, (families.get(key) ?? 0) + 1);
  }
  const listed = [...loaded.index].sort(
    (a, b) => a.family.name.localeCompare(b.family.name) || a.family.degree.localeCompare(b.family.degree) || Number(a.emphasis !== void 0) - Number(b.emphasis !== void 0) || (a.emphasis ?? "").localeCompare(b.emphasis ?? "") || a.title.localeCompare(b.title)
  );
  const out = [];
  const placed = /* @__PURE__ */ new Set();
  const facets = (key, entry) => ({
    degree: key,
    ...entry ? { catalog: entry, college: entry.college, department: entry.department } : {}
  });
  const withTracks = (program, label, key, grouped, shortName, entry) => {
    const tracks = program.requirements === void 0 ? [] : groupChoices(program.requirements.requirements);
    const groupedHere = grouped || tracks.length > 0 || program.variants > 1;
    out.push({
      label,
      ...groupedHere ? { group: key, display: shortName } : {},
      program,
      ...facets(key, entry)
    });
    for (const offered of tracks) {
      for (const group of offered.groups) {
        out.push({
          label: `${label} \xB7 ${group.label}`,
          group: key,
          display: group.label,
          program,
          ...facets(key, entry),
          track: { path: offered.path, label: group.label, asks: offered.label }
        });
      }
    }
  };
  for (const entry of listed) {
    const key = familyKey(entry.family);
    const grouped = (families.get(key) ?? 0) > 1;
    const shortName = entry.emphasis !== void 0 ? entry.title.replace(`${entry.family.name} - `, "").replace(`, ${entry.degree}`, "") : entry.title;
    const programs = onFile.get(entry.id) ?? [];
    if (programs.length === 0) {
      const tree = loaded.trees.get(entry.id);
      const tracks = tree === void 0 ? [] : groupChoices(tree.requirements);
      const groupedHere = grouped || tracks.length > 0;
      out.push({
        label: entry.title,
        ...groupedHere ? { group: key, display: shortName } : {},
        ...facets(key, entry)
      });
      for (const offered of tracks) {
        for (const group of offered.groups) {
          out.push({
            label: `${entry.title} \xB7 ${group.label}`,
            group: key,
            display: group.label,
            ...facets(key, entry),
            track: { path: offered.path, label: group.label, asks: offered.label }
          });
        }
      }
      continue;
    }
    placed.add(entry.id);
    for (const program of [...programs].sort((a, b) => a.variant - b.variant)) {
      const short = program.variants > 1 ? `${shortName} (plan ${program.variant + 1} of ${program.variants})` : shortName;
      withTracks(program, programLabel(program), key, grouped, short, entry);
    }
  }
  for (const program of loaded.programs) {
    if (placed.has(program.id)) continue;
    const label = programLabel(program);
    withTracks(program, label, label, false, label);
  }
  return out;
}
function stubProgram(entry, catalogYear, requirements) {
  return {
    ...requirements ? { requirements } : {},
    file: "",
    id: entry.id,
    name: entry.name,
    degree: entry.degree,
    totalCredits: entry.credits,
    variant: 0,
    variants: 1,
    grid: {
      programId: entry.id,
      catalogYear,
      source: "catalog_program_index",
      seasons: ["F", "P"],
      terms: []
    },
    notes: [],
    bindings: /* @__PURE__ */ new Map(),
    catalog: entry
  };
}
var creditsWord = (credits) => credits === void 0 ? void 0 : typeof credits === "number" ? `${credits} cr` : `${credits.min} to ${credits.max} cr`;
function factsFor(choice, choices, catalog, pick, loaded) {
  const entry = choice.catalog;
  const program = choice.program;
  if (entry === void 0 && program === void 0) return void 0;
  const key = entry !== void 0 ? familyKey(entry.family) : void 0;
  const indexed = choices.map((c, index) => ({ c, index }));
  const siblings = indexed.filter(({ c }) => c.track === void 0).filter(({ c }) => key !== void 0 && c.catalog !== void 0 && familyKey(c.catalog.family) === key || key === void 0 && c.program?.id === program?.id).map(({ c, index }) => ({
    label: c.display ?? c.label,
    current: c.program !== void 0 && program !== void 0 ? c.program.file === program.file : c === choice || c.catalog !== void 0 && c.catalog === choice.catalog && c.program === void 0,
    onFile: c.program !== void 0,
    pick: () => pick(index)
  }));
  const own = indexed.filter(
    ({ c }) => program !== void 0 ? c.program !== void 0 && c.program.file === program.file : c.program === void 0 && c.catalog === entry
  );
  const offered = own.filter(({ c }) => c.track !== void 0);
  const tracks = offered.length === 0 ? void 0 : {
    // A track, whatever the table calls it: an emphasis is a program
    // of its own in the list, a track a choice inside one (FR-PLAN-20).
    label: "Track",
    asks: offered[0].c.track.asks,
    options: [
      ...own.filter(({ c }) => c.track === void 0).map(({ index }) => ({ label: "Not chosen yet", current: choice.track === void 0, pick: () => pick(index) })),
      ...offered.map(({ c, index }) => ({
        label: c.track.label,
        current: choice.track?.label === c.track.label,
        pick: () => pick(index)
      }))
    ]
  };
  const courses = program === void 0 ? entry?.emphasisCourses ?? entry?.emphasisWithinPage : void 0;
  const emphasisCourses = courses === void 0 || entry === void 0 ? void 0 : {
    heading: entry.emphasis !== void 0 ? "Courses the catalog lists for this emphasis" : "Courses the catalog lists for this program's emphasis block",
    entries: courses.entries.flatMap((item) => {
      const rows = [item, ...item.alternatives ?? []];
      return rows.map((row2, i) => {
        const code = row2.codes.join(" & ");
        const known = row2.codes.length === 1 ? catalog.get(row2.codes[0]) : void 0;
        const title = known?.title ?? row2.titles?.join(" and ") ?? row2.title ?? "";
        const detail = [i > 0 ? "or the one above" : void 0, creditsWord(row2.credits), ...row2.notes ?? []].filter((d) => d !== void 0).join(" \xB7 ");
        return { code, title, ...detail ? { detail } : {} };
      });
    }),
    ...courses.note ? { note: courses.note } : {},
    ...courses.unparsed?.length ? { unparsed: courses.unparsed } : {}
  };
  const unnamedEmphases = program === void 0 && entry !== void 0 && entry.emphasis === void 0 && entry.emphasisWithinPage !== void 0 ? Math.max(1, entry.emphasisBlockCount ?? 1) : void 0;
  return {
    college: entry?.college ?? "",
    department: entry?.department ?? "",
    url: entry?.url ?? "",
    onFile: program !== void 0,
    requirementsOnFile: program?.requirements !== void 0 || entry !== void 0 && loaded !== void 0 && loaded.trees.has(entry.id),
    siblings: siblings.length > 1 ? siblings : [],
    ...tracks ? { tracks } : {},
    ...emphasisCourses ? { emphasisCourses } : {},
    ...unnamedEmphases !== void 0 ? { unnamedEmphases } : {}
  };
}

// ../web/src/share.ts
function describeIncluded(context, includes, voice) {
  const you = voice === "you";
  const parts = [];
  if (includes.includes("completed")) {
    const completed = context.completed ?? [];
    const n = completed.length;
    const noun = n === 1 ? "course" : "courses";
    const grades = completed.some((c) => c.grade !== void 0);
    const where = completed.some((c) => c.institution !== void 0 || c.source !== void 0);
    const details = [grades ? "with grades" : "", where ? "where they were taken" : ""].filter(Boolean).join(" and ");
    parts.push(
      (you ? `the ${n} ${noun} you listed` : `the student's ${n} completed ${noun}`) + (details ? `, ${details}` : "")
    );
  }
  if (includes.includes("inProgress")) {
    const n = (context.inProgress ?? []).length;
    const noun = n === 1 ? "course" : "courses";
    parts.push(you ? `the ${n} ${noun} you are taking now` : `${n} ${noun} in progress`);
  }
  if (includes.includes("placement")) {
    const subjects = Object.keys(context.placement ?? {}).map(
      (s) => s === "english" ? "English" : s
    );
    parts.push(`${you ? "your" : "their"} ${joinWords(subjects)} placement`);
  }
  if (includes.includes("standing")) {
    parts.push(you ? "the standing you said you hold" : "the standing the student says they hold");
  }
  if (includes.includes("chosen")) {
    const labels = Object.values(context.chosen ?? {});
    parts.push(
      labels.length === 1 ? `${you ? "your choice of" : "the student's choice of"} ${labels[0]}` : `${you ? "the tracks you chose" : "the tracks the student chose"}`
    );
  }
  if (includes.includes("minor") || includes.includes("minors")) {
    const n = (context.minors ?? (context.minor ? [context.minor] : [])).length;
    parts.push(you ? `the ${n > 1 ? "minors" : "minor"} you added` : `the ${n > 1 ? "minors" : "minor"} the student added`);
  }
  if (includes.includes("majors")) {
    const n = (context.majors ?? []).length;
    parts.push(you ? `the ${n > 1 ? "majors" : "major"} you added` : `the ${n > 1 ? "majors" : "major"} the student added`);
  }
  if (includes.includes("majorChoices")) {
    const n = Object.values(context.majorChoices ?? {}).reduce((sum, chosen) => sum + Object.keys(chosen).length, 0);
    parts.push(`${you ? "your" : "the student's"} choice of ${n === 1 ? "track" : "tracks"} in ${n === 1 ? "an added major" : "the added majors"}`);
  }
  if (includes.includes("constraints")) {
    const constraints = context.constraints ?? {};
    const pieces = [];
    if (constraints.maxCreditsPerTerm !== void 0) {
      pieces.push(
        `${you ? "your limit of" : "a limit of"} ${constraints.maxCreditsPerTerm} credits a term`
      );
    }
    if (constraints.modality?.length || constraints.campus?.length) {
      pieces.push(`${you ? "your" : "their"} delivery and campus preferences`);
    }
    if (pieces.length > 0) parts.push(joinWords(pieces));
  }
  if (includes.includes("catalogYear")) {
    parts.push(`${you ? "your" : "the"} catalog year, ${context.catalogYear}`);
  }
  return joinWords(parts, "; ");
}
function joinWords(parts, separator = ", ") {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(separator)}${separator}and ${parts.at(-1)}`;
}
function shareControls(input) {
  let generation = 0;
  const make = async () => {
    const mine = ++generation;
    const document2 = shareDocument(input.plan, input.context, {
      withContext: input.canIncludeContext,
      ...input.extra ? { extra: input.extra } : {}
    });
    const link = await shareLink(window.location.href, document2);
    return mine === generation ? planCode(link) : "";
  };
  const share = element("details", "share-open share-code");
  share.append(element("summary", "btn btn-secondary btn-sm", "Share this plan"));
  const sharePanel = element("div", "share-panel");
  const shown = element("input", "linkfield");
  shown.type = "text";
  shown.readOnly = true;
  shown.setAttribute("aria-label", "The plan's code");
  shown.addEventListener("focus", () => shown.select());
  const copyCode = element("button", "btn btn-primary btn-sm", "Copy code");
  copyCode.type = "button";
  const status = element("span", "share-status");
  status.setAttribute("role", "status");
  const codeRow = element("div", "share-row");
  codeRow.append(shown, copyCode);
  sharePanel.append(
    codeRow,
    status,
    element(
      "p",
      "share-note",
      input.canIncludeContext ? 'Paste the code into a message. It carries this plan and what you have told the planner about yourself, so an advisor who opens it under "Open a shared plan" sees what you see.' : "Paste the code into a message. It carries this plan as it was shared with you."
    )
  );
  share.append(sharePanel);
  const fill = () => {
    shown.value = "";
    status.textContent = "";
    void make().then((code) => {
      if (code === "") return;
      shown.value = code;
      shown.focus();
      shown.select();
    });
  };
  share.addEventListener("toggle", () => {
    if (share.open) fill();
  });
  copyCode.addEventListener("click", () => {
    void (async () => {
      const code = shown.value === "" ? await make() : shown.value;
      if (code === "") return;
      shown.value = code;
      try {
        await navigator.clipboard.writeText(code);
        status.textContent = "Copied.";
        share.open = false;
      } catch {
        shown.focus();
        shown.select();
        status.textContent = "Select the code and copy it.";
      }
    })();
  });
  const open = element("details", "share-open");
  open.append(element("summary", "btn btn-secondary btn-sm", "Open a shared plan"));
  const openPanel = element("div", "share-panel");
  const openRow = element("div", "share-row");
  const pasted = element("input", "linkfield");
  pasted.type = "text";
  pasted.placeholder = "Paste a plan's code";
  pasted.setAttribute("aria-label", "A shared plan's code");
  const go = element("button", "btn btn-primary btn-sm", "Open");
  go.type = "button";
  const problem = element("p", "share-err");
  problem.setAttribute("role", "alert");
  const openIt = () => {
    const code = planCode(pasted.value);
    if (code === "") {
      problem.textContent = "Paste the code you were sent first.";
      pasted.focus();
      return;
    }
    void openShare(code).then((result) => {
      if (result.kind === "refused") {
        problem.textContent = `That is not a plan this page can read: ${result.reason}`;
        pasted.setAttribute("aria-invalid", "true");
        pasted.focus();
        return;
      }
      problem.textContent = "";
      pasted.removeAttribute("aria-invalid");
      open.open = false;
      window.location.hash = code;
    });
  };
  go.addEventListener("click", openIt);
  pasted.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      openIt();
    }
  });
  pasted.addEventListener("input", () => {
    problem.textContent = "";
    pasted.removeAttribute("aria-invalid");
  });
  openRow.append(pasted, go);
  openPanel.append(openRow, problem);
  open.append(openPanel);
  const away = (event) => {
    if (!share.isConnected && !open.isConnected) {
      document.removeEventListener("pointerdown", away, true);
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!share.contains(target)) share.open = false;
    if (!open.contains(target)) open.open = false;
  };
  document.addEventListener("pointerdown", away, true);
  return [share, open];
}
function planCode(linkOrCode) {
  const text = linkOrCode.trim();
  if (text === "") return "";
  const hash = text.indexOf("#");
  const fragment = hash >= 0 ? text.slice(hash + 1) : text;
  return fragment.startsWith("plan=") ? fragment : `plan=${fragment}`;
}
function sharedNotice(input) {
  const { opened } = input;
  const plan = opened.plan;
  const stale = plan.meta.dataVersion !== input.pageDataVersion || plan.meta.builtAt !== input.pageBuiltAt;
  const box = element("div", `alert ${stale ? "alert-warning" : "alert-info"} shared${stale ? " stale" : ""}`);
  box.append(element("h3", void 0, "A plan somebody shared"));
  if (input.programName === void 0) {
    box.append(
      element(
        "p",
        void 0,
        `For a program this build of the planner does not carry (${plan.programId}). The plan is shown as it was shared. Requirement checks are not available for it.`
      )
    );
  } else if (!input.exactGrid) {
    box.append(
      element(
        "p",
        void 0,
        `For ${input.programName}. The exact published plan it was made from is not in this build of the planner, so the department's printed credit totals are not checked.`
      )
    );
  } else {
    box.append(
      element(
        "p",
        void 0,
        `For ${input.programName}. It is shown as it was shared, which may not be the department's published plan.`
      )
    );
  }
  if (opened.context === void 0) {
    box.append(
      element(
        "p",
        void 0,
        "It was shared without anything about the student: no completed courses, placement, or credit limit. A check that depends on those says it cannot be made, rather than reporting a problem."
      )
    );
  } else {
    box.append(
      element(
        "p",
        void 0,
        `It includes ${describeIncluded(opened.context, opened.includes, "student")}.`
      )
    );
  }
  if (stale) {
    box.append(
      element(
        "p",
        void 0,
        `It was made on data ${plan.meta.dataVersion || "of unknown version"}, built ${plan.meta.builtAt || "on an unknown date"}. This page has data ${input.pageDataVersion}, built ${input.pageBuiltAt}. The plan has been checked again against the current data.`
      )
    );
  }
  if (input.yearNote !== void 0) box.append(element("p", void 0, input.yearNote));
  if (input.differences.length > 0) {
    box.append(
      element("p", void 0, "Where the plan differs from the catalog on this page:")
    );
    const list = element("ul");
    for (const difference of input.differences) list.append(element("li", void 0, difference));
    box.append(list);
  }
  const leave = element("button", "btn btn-secondary btn-sm", "Plan my own degree instead");
  leave.type = "button";
  leave.addEventListener("click", input.onLeave);
  box.append(leave);
  return box;
}
function refusedNotice(reason, onLeave) {
  const box = element("div", "alert alert-warning shared refused");
  box.append(
    element("h3", void 0, "This link did not open"),
    element("p", void 0, reason),
    element(
      "p",
      void 0,
      "Nothing from it was used. Ask whoever sent it to copy the link again from their planner."
    )
  );
  const leave = element("button", "btn btn-secondary btn-sm", "Plan my own degree instead");
  leave.type = "button";
  leave.addEventListener("click", onLeave);
  box.append(leave);
  return box;
}

// ../web/src/checks.ts
function foldGroup(id, tone, label, count2, open, list) {
  const details = element("details", `fold ${tone}`);
  details.dataset["fold"] = id;
  details.open = open;
  details.append(element("summary", void 0, `${label} (${count2})`));
  const body = element("div", "fold-body");
  body.append(list);
  details.append(body);
  return details;
}
function optionsList(finding3, dips, titleOf) {
  const options = finding3.options ?? [];
  const note = (code) => {
    const dip = dips?.get(code);
    if (dip === void 0) return void 0;
    const blocks2 = [...new Set(dip.also.map((m) => m.label))].join(" and ");
    const other = finding3.path === dip.general.path ? blocks2 : dip.also.some((m) => m.path.startsWith(finding3.path)) ? dip.general.category : `${dip.general.category} and ${blocks2}`;
    return `also ${other}`;
  };
  const ordered = [...options.filter((c) => dips?.has(c)), ...options.filter((c) => !dips?.has(c))];
  const rows = ordered.map((code) => {
    const also = note(code);
    const title = titleOf(code);
    return {
      key: code,
      code,
      ...title !== void 0 ? { title } : {},
      tags: also === void 0 ? [] : [{ text: also, tone: "ok" }]
    };
  });
  return courseList({
    groups: [{ rows }],
    name: `the courses that would fill ${finding3.label}`,
    searchAbove: 10,
    className: "options"
  }).element;
}
function requirementTree(tree, standing, titleOf = () => void 0) {
  const byPath = new Map(standing.findings.map((f) => [f.path, f]));
  const assigned = (path) => {
    const out = [];
    for (const [key, code] of standing.assignment) {
      if (key === path || key.startsWith(`${path}#`)) out.push(code);
    }
    return out;
  };
  let met = 0;
  let total = 0;
  const leaf2 = (node, path) => {
    const line = element("li", "req");
    const codes = assigned(path);
    const finding3 = byPath.get(path);
    const state = codes.length > 0 && finding3 === void 0 ? "met" : finding3?.standing === "unverifiable" ? "unverifiable" : finding3 !== void 0 ? "unmet" : "met";
    total += 1;
    if (state === "met") met += 1;
    line.classList.add(state);
    line.append(element("i", "req-mark", state === "met" ? "\u2713" : state === "unmet" ? "\u25CB" : "?"));
    const text = element("span", "req-text");
    if (node.type === "Course" && node.code !== void 0) {
      text.append(element("b", void 0, node.code));
      const title = node.title ?? titleOf(node.code);
      if (title) text.append(document.createTextNode(` ${title}`));
    } else {
      const options = coursesUnder(node);
      const label = node.label?.replace(/:$/, "");
      if (label) {
        text.append(document.createTextNode(label));
        if (options.length > 0) text.append(element("small", void 0, ` ${options.length} ${options.length === 1 ? "option" : "options"}`));
      } else if (options.length > 0 && options.length <= 4) {
        text.append(document.createTextNode(node.type === "AllOf" ? options.join(" and ") : options.join(" or ")));
      } else {
        text.append(document.createTextNode(`${node.type === "NOf" && node.n !== void 0 ? `${node.n} of` : "One of"} ${options.length} courses`));
      }
    }
    const by = codes.filter((code) => !(node.type === "Course" && node.code !== void 0 && code === node.code));
    if (state === "met" && by.length > 0) text.append(element("em", void 0, `met by ${by.join(", ")}`));
    else if (state === "unmet") text.append(element("em", void 0, "still needed"));
    else if (state === "unverifiable") text.append(element("em", void 0, "can't be checked here"));
    line.append(text);
    return line;
  };
  const block2 = (node, path) => {
    if (node.type === "AllOf" && node.of !== void 0) {
      const out = [];
      if (node.label) out.push(element("li", "req-head", node.label.replace(/:$/, "")));
      const list = element("ul", "req-list");
      node.of.forEach((child, i) => {
        for (const item of block2(child, `${path}.${i}`)) list.append(item);
      });
      const holder = element("li", "req-block");
      holder.append(list);
      out.push(holder);
      return out;
    }
    return [leaf2(node, path)];
  };
  const body = element("div", "fold-body");
  const top = element("ul", "req-list top");
  (tree.requirements.of ?? [tree.requirements]).forEach((child, i) => {
    for (const item of block2(child, `r.${i}`)) top.append(item);
  });
  body.append(top);
  const fold2 = element("details", "fold all-reqs");
  fold2.dataset["fold"] = "all-requirements";
  fold2.append(element("summary", void 0, `Every requirement (${met} of ${total} met)`));
  fold2.append(body);
  return fold2;
}
function requiredCoursesFold(input) {
  const canonical = (code) => input.catalog.canonical(code);
  const required = /* @__PURE__ */ new Set();
  const visit = (node, outright) => {
    if (node.type === "Course") {
      if (outright && node.code !== void 0) required.add(canonical(node.code));
      return;
    }
    const still = outright && node.type === "AllOf" && node.group !== true;
    for (const child of node.of ?? []) visit(child, still);
  };
  for (const program of input.programs) visit(program.tree.requirements, true);
  const placement = /* @__PURE__ */ new Map();
  for (const planTerm of input.plan.terms) {
    for (const item of planTerm.items) if (item.kind === "course") placement.set(canonical(item.code), planTerm.term);
  }
  const rows = [...required].sort((a, b) => a.localeCompare(b, "en")).map((code) => {
    const course = input.catalog.get(code);
    const at = placement.get(code);
    const passed = input.passed.has(code);
    const tags = passed ? [{ text: "passed", tone: "ok" }] : at !== void 0 ? [{ text: `in the plan \xB7 ${termLabel(at)}`, tone: "ok" }] : [{ text: "not in the plan", tone: "warn" }];
    const onOpen = input.onOpen;
    return {
      key: code,
      code,
      title: course?.title ?? "",
      ...course?.credits !== void 0 ? { detail: `${creditsNominal(course.credits)} cr` } : {},
      tags,
      muted: passed,
      ...onOpen !== void 0 ? { onOpen: (from) => onOpen(code, from), openLabel: `Read about ${code}` } : {}
    };
  });
  const fold2 = element("details", "fold all-courses");
  fold2.dataset["fold"] = "required-courses";
  const several = input.programs.length > 1;
  fold2.append(element("summary", void 0, `Every course the ${several ? "programs require" : "program requires"} (${rows.length})`));
  const body = element("div", "fold-body");
  body.append(
    courseList({
      groups: [{ rows }],
      name: "every course the programs require",
      placeholder: "Search by code or title",
      searchAbove: 6,
      emptyText: 'The requirement tables name no course outright; the choices are under "Every requirement".'
    }).element
  );
  fold2.append(body);
  return fold2;
}
function foldRow(...folds) {
  const row2 = element("div", "fold-row");
  for (const fold2 of folds) if (fold2 !== void 0) row2.append(fold2);
  return row2;
}
function requirementList(standing, dips, titleOf = () => void 0, programName) {
  const section = element("div", "checks");
  section.id = "requirements";
  section.append(element("h3", void 0, programName ?? "Program requirements"));
  if (standing.findings.length === 0) {
    section.append(element("p", "ok", "Every requirement this page can check is met."));
    return section;
  }
  const groups = [
    { key: "unmet", label: "Still needed", tone: "warning" },
    { key: "unverifiable", label: "Can't be checked here", tone: "gap" }
  ];
  for (const { key, label, tone } of groups) {
    const found2 = standing.findings.filter((f) => f.standing === key);
    if (found2.length === 0) continue;
    const list = element("ul");
    for (const finding3 of found2) {
      const entry = element("li");
      entry.append(element("span", "problem-message", finding3.message));
      if (finding3.options?.length) entry.append(optionsList(finding3, dips, titleOf));
      if (finding3.reason) entry.append(element("span", "problem-remedy", finding3.reason));
      list.append(entry);
    }
    section.append(foldGroup(key, tone, label, found2.length, key === "unmet", list));
  }
  return section;
}
function graduationList(graduation) {
  const section = element("div", "checks");
  section.id = "graduation";
  section.append(element("h3", void 0, "Graduation rules"));
  const groups = [
    { key: "unmet", label: "Still needed", tone: "warning", open: true },
    { key: "unverifiable", label: "Can't be checked here", tone: "gap", open: false },
    { key: "met", label: "Met", tone: "ok", open: false }
  ];
  for (const { key, label, tone, open } of groups) {
    const found2 = graduation.findings.filter((f) => f.standing === key);
    if (found2.length === 0) continue;
    const list = element("ul");
    for (const finding3 of found2) {
      const entry = element("li");
      entry.append(element("span", "problem-message", finding3.message));
      if (finding3.remedy) entry.append(element("span", "problem-remedy", finding3.remedy));
      entry.append(element("span", "problem-source", `The catalog says: ${finding3.text}`));
      list.append(entry);
    }
    section.append(foldGroup(key, tone, label, found2.length, open, list));
  }
  return section;
}
function found(problems, standing, graduation, minor, dips, titleOf, majors = [], programName) {
  const row2 = element("div", "checks-row");
  row2.append(problemList(problems));
  if (standing) row2.append(requirementList(standing, dips, titleOf, programName));
  for (const major of majors) row2.append(majorSection(major, titleOf));
  if (minor) for (const chosen of minor.chosen) row2.append(minorSection(minor, chosen));
  if (graduation) row2.append(graduationList(graduation));
  return row2;
}
function majorSection(major, titleOf) {
  const section = requirementList(major.standing, void 0, titleOf);
  section.id = `major-${major.id}`;
  const heading = section.querySelector("h3");
  if (heading !== null) heading.textContent = major.name;
  if (major.onRemove !== void 0) {
    const remove = element("button", "btn btn-secondary btn-sm btn-quiet remove-major", "Remove this major");
    remove.type = "button";
    remove.addEventListener("click", major.onRemove);
    heading?.after(remove);
  }
  return section;
}
var CLOSEST_MINORS = 5;
function minorOffer(input) {
  const section = element("details", "checks minor");
  section.id = "minor";
  const heading = element("summary");
  const title = element("h3", void 0, "Suggested minors");
  title.append(
    infoMark(
      "Suggested minors",
      "The minors that would add the fewest credits beyond this plan: what its courses already in the plan cover, what would fill a requirement the plan leaves open, and what is left. A course counts for both a major and a minor."
    ).element
  );
  heading.append(title);
  const body = element("div", "minor-body");
  section.append(heading, body);
  const taken = new Set(input.chosen.map((m) => m.id));
  const list = element("ul", "minor-list");
  for (const minor of input.ranked.filter((m) => !taken.has(m.id)).slice(0, CLOSEST_MINORS)) {
    list.append(minorRow(minor, input));
  }
  body.append(list);
  body.append(element("p", "muted", "Any other minor can be added in the Minor field beside this list."));
  return section;
}
function minorSection(input, chosen) {
  const section = element("details", "checks minor");
  section.id = `minor-${chosen.id}`;
  section.open = true;
  const heading = element("summary");
  heading.append(
    element(
      "h3",
      void 0,
      // The name alone; the credits beyond the plan are in the offer beside
      // the Minor field (the sponsor's twentieth review).
      `Minor: ${chosen.name}`
    )
  );
  const body = element("div", "minor-body");
  section.append(heading, body);
  body.append(element("p", "minor-covered", coveredSentence(chosen)));
  if (chosen.sameDepartment) {
    body.append(
      element(
        "p",
        "unverifiable",
        "This minor is in the same department as the major. Ask your advisor whether the university allows the pairing; the planner does not know the rule."
      )
    );
  }
  const findings = chosen.satisfaction.findings;
  if (findings.length === 0) {
    body.append(element("p", "ok", "Every requirement of the minor this page can check is met."));
    return section;
  }
  const groups = [
    { key: "unmet", label: "Still needed", tone: "warning" },
    { key: "unverifiable", label: "Can't be checked here", tone: "gap" }
  ];
  for (const { key, label, tone } of groups) {
    const found2 = findings.filter((f) => f.standing === key);
    if (found2.length === 0) continue;
    const list = element("ul");
    for (const finding3 of found2) {
      const entry = element("li");
      entry.append(element("span", "problem-message", finding3.message));
      if (finding3.options?.length) entry.append(optionsList(finding3, void 0, input.titleOf ?? (() => void 0)));
      if (finding3.reason) entry.append(element("span", "problem-remedy", finding3.reason));
      list.append(entry);
    }
    body.append(foldGroup(`minor-${chosen.id}-${key}`, tone, label, found2.length, key === "unmet", list));
  }
  return section;
}
function coveredSentence(minor) {
  const by = minor.counted.length === 0 ? "" : ` (${minor.counted.join(", ")})`;
  const credits = (n) => `${n} ${n === 1 ? "credit" : "credits"}`;
  if (minor.required === void 0 || minor.needed === void 0) {
    return `The catalog gives no credit total for it. ${credits(minor.covered)} of its requirements are met by courses already in the plan${by}.`;
  }
  if (minor.needed === 0) {
    return `Needs ${credits(minor.required)}, all of them already in the plan${by}.`;
  }
  const parts = [`${minor.covered} already in the plan${by}`];
  if (minor.fits > 0) parts.push(`${minor.fits} that would fill a requirement the plan leaves open (${minor.fitting.join(", ")})`);
  const extra = minor.extra ?? minor.needed;
  parts.push(extra === 0 ? "nothing to add beyond the plan" : `${extra} to add beyond the plan`);
  return `Needs ${credits(minor.required)}: ${parts.join("; ")}.`;
}
function minorRow(minor, input) {
  const entry = element("li", minor.sameDepartment ? "same-department" : void 0);
  const head = element("span", "problem-message");
  head.append(element("strong", void 0, `${minor.name}, Minor`));
  head.append(
    document.createTextNode(
      minor.extra === void 0 ? ": the catalog gives no credit total" : minor.needed === 0 ? ": the credit total is already covered" : minor.extra === 0 ? ": nothing beyond your plan" : `: ${minor.extra} ${minor.extra === 1 ? "credit" : "credits"} beyond your plan`
    )
  );
  entry.append(head);
  entry.append(element("span", "problem-remedy", coveredSentence(minor)));
  if (minor.sameDepartment) {
    entry.append(element("span", "problem-remedy", "Same department as the major; ask your advisor whether the pairing is allowed."));
  }
  if (!input.readOnly) {
    const add = element("button", "btn btn-secondary btn-sm", "Add");
    add.type = "button";
    add.setAttribute("aria-label", `Add the ${minor.name} minor`);
    add.addEventListener("click", () => input.onAdd(minor.id));
    entry.append(add);
  }
  return entry;
}
var ABOUT_THE_DEPARTMENT = /* @__PURE__ */ new Set(["published-credits"]);
function problemList(all) {
  const problems = all.filter((p) => !ABOUT_THE_DEPARTMENT.has(p.kind));
  const section = element("div", "checks");
  section.id = "checks";
  section.append(element("h3", void 0, "What the planner found"));
  if (problems.length === 0) {
    section.append(element("p", "ok", "Nothing to fix."));
    return section;
  }
  const groups = [
    { key: "error", severity: "error", label: "To fix", open: true, pick: () => true },
    { key: "warning", severity: "warning", label: "To confirm", open: false, pick: (p) => CARD_SPECIFIC.has(p.kind) },
    { key: "note", severity: "warning", label: "Notes", open: false, pick: (p) => !CARD_SPECIFIC.has(p.kind) },
    { key: "gap", severity: "gap", label: "Still to decide", open: false, pick: () => true }
  ];
  for (const { key, severity, label, open, pick } of groups) {
    const group = problems.filter((p) => p.severity === severity && pick(p));
    if (group.length === 0) continue;
    const seen = /* @__PURE__ */ new Map();
    for (const problem of group) {
      const key2 = `${problem.kind}|${problem.message}`;
      const entry = seen.get(key2);
      if (entry) entry.count += 1;
      else seen.set(key2, { problem, count: 1 });
    }
    const list = element("ul");
    for (const { problem, count: count2 } of seen.values()) {
      const entry = element("li");
      entry.append(
        element(
          "span",
          "problem-message",
          count2 > 1 ? `${problem.message} (${count2} courses)` : problem.message
        )
      );
      if (problem.remedy) entry.append(element("span", "problem-remedy", problem.remedy));
      list.append(entry);
    }
    section.append(foldGroup(key, severity, label, group.length, open, list));
  }
  return section;
}

// ../web/src/editbar.ts
function addTermMenu(plan, edit) {
  const box = element("details", "addterm");
  const summary = element("summary", "btn btn-secondary btn-sm", "+ Add a term");
  box.append(summary);
  const list = element("div", "addterm-list");
  const have = new Set(plan.terms.map((t) => termKey(t.term)));
  const first = plan.terms[0]?.term ?? plan.start;
  const last = plan.terms.at(-1)?.term ?? plan.start;
  const calendar = ["F", "P", "S"];
  const gaps = [];
  const after = [];
  let cursor = first;
  while (compareTerms(cursor, last) <= 0) {
    if (!have.has(termKey(cursor))) gaps.push(cursor);
    cursor = nextTerm(cursor, calendar);
  }
  for (let i = 0; i < 3; i += 1) {
    after.push(cursor);
    cursor = nextTerm(cursor, calendar);
  }
  const group = (title, terms) => {
    if (terms.length === 0) return;
    list.append(element("span", "addterm-h", title));
    for (const t of terms) {
      const option = element("button", "addterm-opt", termLabel(t));
      option.type = "button";
      option.addEventListener("click", () => {
        box.open = false;
        edit((p) => addTerm(p, t));
      });
      list.append(option);
    }
  };
  group("A gap in the plan", gaps);
  group("After the end", after);
  box.append(list);
  return box;
}
function editBar(input) {
  const { session, reset, edit, sharedView } = input;
  const bar = element("div", "editbar");
  const button = (label, title, enabled, className, act) => {
    const control = element("button", className, label);
    control.type = "button";
    control.title = title;
    control.disabled = !enabled;
    control.addEventListener("click", act);
    bar.append(control);
    return control;
  };
  const libraryButton = element("button", "btn btn-primary btn-sm", "Browse courses");
  libraryButton.type = "button";
  libraryButton.title = "The courses in your program, what you still need, or the whole catalog; read one, add it, or drag it into a term";
  libraryButton.setAttribute("aria-expanded", String(input.libraryOpen));
  libraryButton.addEventListener("click", input.toggleLibrary);
  bar.append(libraryButton);
  bar.append(addTermMenu(session.plan, edit));
  const undo = input.undo ?? { can: () => session.canUndo, run: () => session.undo() };
  const redo = input.redo ?? { can: () => session.canRedo, run: () => session.redo() };
  button("Undo", "Undo the last change (control-Z)", undo.can(), "btn btn-secondary btn-sm btn-quiet", () => {
    if (undo.run()) input.afterUndo();
  });
  button("Redo", "Redo (control-shift-Z)", redo.can(), "btn btn-secondary btn-sm btn-quiet", () => {
    if (redo.run()) input.afterUndo();
  });
  if (session.edited) {
    button(
      "Reset",
      sharedView ? "Back to the plan as it was shared. Undo brings your changes back." : "Back to the plan as it was laid out. Undo brings your changes back.",
      true,
      "btn btn-secondary btn-sm btn-quiet reset",
      reset
    );
  }
  if (input.share?.length) {
    const share = element("span", "editbar-share");
    share.append(...input.share);
    bar.append(share);
  }
  return bar;
}

// ../web/src/controls.ts
var fields = 0;
function labelFor2(text, field, info) {
  if (field.id === "") field.id = `field-${++fields}`;
  const caption = element("label", "control-label", text);
  caption.htmlFor = field.id;
  if (info === void 0) return caption;
  const head = element("span", "control-head");
  const mark = infoMark(text, info);
  mark.describe(field);
  head.append(caption, mark.element);
  return head;
}
function select(label, options, selected, onChange, info) {
  const wrap = element("div", "control");
  const field = element("select");
  options.forEach((text, index) => {
    const option = element("option", void 0, text);
    option.value = String(index);
    field.append(option);
  });
  field.value = String(Math.max(0, selected));
  field.addEventListener("change", () => onChange(Number(field.value)));
  wrap.append(labelFor2(label, field, info), field);
  return wrap;
}

// ../web/src/sections.ts
function transcriptReport(parsed, what) {
  const wrap = element("div", "transcript");
  if (parsed.completed.length === 0 && parsed.unknown.length === 0 && parsed.unreadable.length === 0) {
    return element("div", "transcript empty");
  }
  const known = parsed.completed.length - parsed.unknown.length;
  wrap.append(
    element(
      "p",
      "ok",
      `${known} ${what} ${known === 1 ? "course" : "courses"} recognized, ${parsed.credits} credits.` + (what === "in progress" ? " Treated as passed for sequencing, and flagged on the plan as not yet confirmed." : "")
    )
  );
  if (parsed.unknown.length > 0) {
    wrap.append(
      element(
        "p",
        "muted",
        `${parsed.unknown.length} not in the catalog on file, counted anyway: ${parsed.unknown.slice(0, 8).join(", ")}` + (parsed.unknown.length > 8 ? `, and ${parsed.unknown.length - 8} more` : "")
      )
    );
  }
  if (parsed.unreadable.length > 0) {
    wrap.append(
      element(
        "p",
        "bad",
        `${parsed.unreadable.length} could not be read as a course code: ${parsed.unreadable.slice(0, 5).map((t) => `"${t}"`).join(", ")}` + (parsed.unreadable.length > 5 ? ", and more" : "") + ". They are not counted."
      )
    );
  }
  return wrap;
}
function viewBar(input) {
  const bar = element("div", "vbar");
  const wrap = element("div", "viewwrap");
  const label = element("span", "control-label", "View");
  label.id = "view-label";
  const toggle = element("div", "viewtoggle");
  toggle.setAttribute("role", "group");
  toggle.setAttribute("aria-labelledby", "view-label");
  for (const [value, name, detail] of [
    ["grid", "Grid", "term columns"],
    ["table", "Table", "compact list"]
  ]) {
    const control = element("button", "btn btn-secondary btn-sm", name);
    control.type = "button";
    control.append(element("small", void 0, detail));
    control.setAttribute("aria-pressed", String(input.view === value));
    control.addEventListener("click", () => {
      if (input.view !== value) input.setView(value);
    });
    toggle.append(control);
  }
  wrap.append(label, toggle);
  bar.append(wrap);
  if (input.requiredCredits !== void 0 && input.requiredCredits > 0) {
    const done = doneCredits(input.plan);
    const row2 = element("div", "prog-row");
    const meter = element("div", "bar");
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", "Credits already done");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuenow", String(done));
    meter.setAttribute("aria-valuemax", String(input.requiredCredits));
    const fill = element("i");
    fill.style.width = `${Math.min(100, Math.round(done / input.requiredCredits * 100))}%`;
    meter.append(fill);
    row2.append(
      element("span", "prog-lab", "Degree progress"),
      meter,
      element(
        "span",
        "prog-txt",
        done > 0 ? `${done}/${input.requiredCredits} credits` : "Nothing completed yet"
      )
    );
    const ticked = input.plan.terms.reduce(
      (n, term2) => n + term2.items.filter((item) => item.kind !== "slot" && item.done === true).length,
      0
    );
    if (ticked > 0 && input.onUntickAll !== void 0) {
      const clear = element("button", "btn btn-secondary btn-sm btn-quiet untick", `Unmark all ${ticked}`);
      clear.type = "button";
      clear.title = "Unmark every course marked done in the plan. Undo puts the marks back.";
      clear.addEventListener("click", input.onUntickAll);
      row2.append(clear);
    }
    bar.append(row2);
  }
  return bar;
}
function legend(categories) {
  const box = element("div", "legend");
  for (const category of categories) {
    const item = element("span", "lg");
    item.style.setProperty("--cat", `var(--cat-${category.index % 8})`);
    item.append(element("b", "lgtag", category.tag), document.createTextNode(category.label));
    box.append(item);
  }
  if (categories.length > 0) {
    const plain = element("span", "lg");
    plain.append(element("i", "sw"), document.createTextNode("Not required"));
    box.append(plain);
  }
  const mark = (tone, glyph, text) => {
    const item = element("span", "lg");
    item.append(element("i", `item-dot ${tone}`, glyph), document.createTextNode(text));
    box.append(item);
  };
  mark("error", "!", "Won't work where it is");
  mark("warning", "?", "Something to confirm");
  const load2 = (tone, text) => {
    const item = element("span", "lg");
    item.append(element("i", `sw load ${tone}`), document.createTextNode(text));
    box.append(item);
  };
  load2("heavy", `Heavy term: ${HEAVY_LOAD} credits or more, ${HEAVY_SUMMER} in summer`);
  load2("over", `Over the ${REGISTRATION_MAX} credits registration allows`);
  const irregular = element("span", "lg");
  irregular.append(rhythmMarker("every other year, rarely, irregularly, not lately, or new"), document.createTextNode("Offered irregularly: every other year, rarely, or not lately"));
  box.append(irregular);
  const how = element("span", "lg how");
  const guide = infoMark(
    "using the plan",
    "Click a course for its prerequisites, offering history, the courses that can replace it, and to move or remove it. Hover one to light up what it needs and what it unlocks; a dashed outline is a prerequisite you could meet with a different course. Drag a course to another term, or a term's header onto another term to swap the two; on a phone, hold first or drag by the dots."
  );
  how.append(document.createTextNode("Moving, marking and reading"), guide.element);
  box.append(how);
  return box;
}
function departmentNotes(notes) {
  const box = element("div", "alert alert-info notes");
  box.append(element("h3", void 0, "From the department"));
  const list = element("ul");
  for (const note of notes) list.append(element("li", void 0, note));
  box.append(list);
  return box;
}
var sourceWords = (source) => source === GENERATED_SOURCE ? "a sequence the planner built from the program's requirement table, not a plan the department published" : source === "catalog_program_index" ? "the catalog's program list, with no plan of study on file" : "the department's published plan of study";
function provenance(plan, loaded) {
  const footer = element("div", "provenance");
  footer.append(
    element(
      "p",
      void 0,
      `Catalog year ${plan.catalogYear || "unknown"}. Data ${plan.meta.dataVersion || "of unknown version"}, built ${plan.meta.builtAt || "on an unknown date"}. Source: ${sourceWords(plan.meta.source)}.`
    )
  );
  if (plan.meta.dataVersion !== loaded.dataVersion || plan.meta.builtAt !== loaded.builtAt) {
    footer.append(
      element("p", void 0, `This page: data ${loaded.dataVersion}, built ${loaded.builtAt}.`)
    );
  }
  footer.append(
    element(
      "p",
      "advisory",
      "This plan is advisory. Wolverine Track is the authoritative degree audit. Check with an advisor before you register."
    )
  );
  return footer;
}

// ../web/src/main.ts
var START_YEARS = [2022, 2023, 2024, 2025, 2026, 2027, 2028];
var SEASONS = [
  { value: "F", label: "Fall" },
  { value: "P", label: "Spring" },
  { value: "S", label: "Summer" }
];
var CREDIT_CAPS = [9, 12, 15, 18];
var INFO = {
  passed: "Include this term's courses if you expect to pass them. Transfer, concurrent enrollment, AP and CLEP credit counts as the UVU course it was accepted as.",
  math: "Choose the course your ACT or SAT score, or UVU's placement test, placed you into; it answers the mathematics prerequisites that ask for a placement score. Scores age: those prerequisites ask for a score or a prior course within the past two years.",
  english: "Choose the course your ACT or SAT score, or UVU's placement test, placed you into; it answers the English prerequisites that ask for a placement score. Scores age: ENGL 1010 takes one no more than five years old.",
  standing: "What most 3000-level courses ask for. UVU grants it once you have passed ENGL 2010 and a Quantitative Literacy course. Yes satisfies the prerequisites that ask for it; otherwise those courses show it as not said, for you to confirm. Wolverine Track or your advisor can confirm it.",
  admitted: "Matriculation: what some programs ask for before their core courses, and your program's catalog page says what it takes. Yes satisfies the prerequisites that ask for it; otherwise those courses show it as not said, for you to confirm. Wolverine Track or your advisor can confirm it.",
  catalogYear: "Your requirements are drawn from the catalog of the year you started, or a later one you have chosen with an advisor. Choosing a year here lays the page out again from that year's catalog: its programs, requirements, course credits and prerequisites. If yours is earlier than the years listed, your department's academic advisor can tell you which requirements apply.",
  pace: "Credits a term. The plan is laid out at that load over as many terms as it takes, and the Terms tile says how many, when it finishes and how many years.",
  minor: 'A minor alongside your major, or several. "Suggested minors", beside this field, lists the minors that would add the fewest credits beyond your plan; add one there or here, and what it still needs is listed in its place. The \xD7 on a chip takes it off again.'
};
function placementTargets(catalog, subject, stored) {
  const found2 = /* @__PURE__ */ new Set();
  for (const course of catalog) {
    for (const leaf2 of prereqLeaves(course.prerequisites)) {
      if ("placement" in leaf2 && placementSubject(leaf2.placement) === subject) found2.add(catalog.canonical(leaf2.placement));
    }
  }
  if (stored !== "") found2.add(stored);
  return ["", ...[...found2].sort()];
}
var placementLabel = (code, catalog) => {
  if (code === "") return "Not sure";
  const title = catalog.get(code)?.title;
  return title ? `${code} \xB7 ${title}` : code;
};
var DEFAULT_LOAD = 15;
async function main() {
  window.plannerStarted = true;
  const root = document.getElementById("app");
  if (root === null) return;
  root.textContent = "Loading the catalog...";
  let loaded;
  try {
    const all = await load();
    const remembered = loadStored()?.catalogYear;
    loaded = remembered !== void 0 && all.years.includes(remembered) ? all.forYear(remembered) : all;
  } catch (error) {
    root.textContent = "";
    root.append(
      element("p", "error", `The catalog data did not load. ${String(error)}`),
      element("p", "muted", "Run the build first: see the README.")
    );
    return;
  }
  const stored = loadStored();
  const choices = programChoices(loaded);
  const minors = minorCandidates(loaded);
  const rememberedIndex = Math.max(
    choices.findIndex(
      (c) => c.program !== void 0 && c.program.file === stored?.programFile && (c.track?.label ?? "") === (stored?.programTrack ?? "")
    ),
    choices.findIndex((c) => c.catalog?.id === stored?.programId && (c.track?.label ?? "") === (stored?.programTrack ?? "")),
    stored?.programId ? -1 : choices.findIndex((c) => c.program?.id === "computer-science-bs" || c.catalog?.id === "computer-science-bs")
  );
  const programLost = rememberedIndex < 0 && Boolean(stored?.programId);
  const state = {
    // A store that says the program was taken away stays that way.
    programIndex: stored?.programFile === "" && stored?.programId === "" ? -1 : rememberedIndex,
    cap: stored?.cap,
    summers: stored?.summers,
    blank: stored?.blank === true,
    start: stored?.start ? parseStart(stored.start) : { year: 2026, season: "F" },
    completedText: stored?.completedText ?? "",
    inProgressText: stored?.inProgressText ?? "",
    mathPlacement: stored?.mathPlacement ?? "",
    englishPlacement: stored?.englishPlacement ?? "",
    advancedStanding: stored?.advancedStanding === true,
    asserted: [...stored?.asserted ?? []],
    minorIds: [...stored?.minorIds ?? (stored?.minorId ? [stored.minorId] : [])],
    majorIds: [...stored?.majorIds ?? []],
    majorChoices: Object.fromEntries(Object.entries(stored?.majorChoices ?? {}).map(([id, chosen]) => [id, { ...chosen }])),
    matriculated: stored?.matriculated === true,
    view: stored?.view === "table" ? "table" : "grid",
    catalogYear: loaded.year
  };
  const undoLog = [];
  const redoLog = [];
  const snapshot = () => ({
    completedText: state.completedText,
    inProgressText: state.inProgressText,
    mathPlacement: state.mathPlacement,
    englishPlacement: state.englishPlacement,
    advancedStanding: state.advancedStanding,
    matriculated: state.matriculated,
    asserted: [...state.asserted]
  });
  const restore = (taken) => {
    Object.assign(state, { ...taken, asserted: [...taken.asserted] });
  };
  const remember = (change) => {
    const before = snapshot();
    change();
    let withPlan = false;
    if (editing !== null && editing.edited && live !== null) {
      const passedNow = codesIn(state.completedText, loaded.catalog);
      const options = live.optionsFor;
      withPlan = editing.apply((p) => applyRecordToPlan(p, passedNow, loaded.catalog, options));
    }
    undoLog.push({ kind: "record", before, after: snapshot(), withPlan });
    redoLog.length = 0;
  };
  const notePlanStep = () => {
    undoLog.push({ kind: "plan" });
    redoLog.length = 0;
  };
  const canUndo = () => undoLog.length > 0;
  const canRedo = () => redoLog.length > 0;
  const undoLast = () => {
    const step = undoLog.pop();
    if (step === void 0) return false;
    if (step.kind === "record") {
      restore(step.before);
      if (step.withPlan) editing?.undo();
      redoLog.push(step);
      draw();
      return true;
    }
    if (editing === null || !editing.undo()) return undoLast();
    redoLog.push(step);
    return true;
  };
  const redoLast = () => {
    const step = redoLog.pop();
    if (step === void 0) return false;
    if (step.kind === "record") {
      restore(step.after);
      if (step.withPlan) editing?.redo();
      undoLog.push(step);
      draw();
      return true;
    }
    if (editing === null || !editing.redo()) return redoLast();
    undoLog.push(step);
    return true;
  };
  root.textContent = "";
  const controls = element("section", "controls");
  const sharedControls = element("section", "controls shared-controls");
  const output = element("section", "output");
  root.append(controls, sharedControls, output);
  const drawer = new Drawer((itemId) => {
    for (const marked of output.querySelectorAll(".selected")) marked.classList.remove("selected");
    if (itemId !== void 0) output.querySelector(`[data-item="${CSS.escape(itemId)}"]`)?.classList.add("selected");
  });
  let editing = null;
  let editingKey = "";
  let shared = null;
  let sharedRoute = null;
  let sharedMaxCredits;
  let pendingFocus = null;
  let live = null;
  const redrawCurrent = () => {
    if (sharedRoute !== null) drawShared(sharedRoute.fragment, sharedRoute.opened);
    else draw();
  };
  const arrivalIn = (before, to) => {
    const kinds = new Map(before.terms.flatMap((t) => t.items.map((i) => [i.id, i.kind])));
    return (next) => next.terms.find((t) => termKey(t.term) === termKey(to))?.items.find((i) => kinds.get(i.id) !== i.kind)?.id;
  };
  const dropOn = (payload, zone, at) => {
    if (live === null) return;
    const key = zone.dataset["term"];
    if (key === void 0) return;
    let to;
    try {
      to = parseTerm(key);
    } catch {
      return;
    }
    const isNew = zone.dataset["new"] === "1";
    const before = live.plan;
    if (payload.kind === "term") {
      let from;
      try {
        from = parseTerm(payload.from);
      } catch {
        return;
      }
      live.edit((p) => swapTerms(isNew ? addTerm(p, to) : p, from, to));
      return;
    }
    const index = landingIndex(payload, termKey(to), at);
    if (payload.kind === "item") {
      const block2 = to.season === "S" ? before.terms.find((t) => termKey(t.term) === termKey(to))?.items.find((i) => i.id === payload.itemId)?.block : void 0;
      live.edit((p) => placeItem(isNew ? addTerm(p, to) : p, payload.itemId, to, index, block2), payload.itemId);
    } else {
      const { optionsFor } = live;
      live.edit(
        (p) => addCourseFilling(isNew ? addTerm(p, to) : p, to, payload.code, loaded.catalog, index, optionsFor),
        arrivalIn(before, to)
      );
    }
  };
  const dnd = new DragController({
    zones: () => [...output.querySelectorAll(".dropzone")],
    itemsOf: (zone) => [...zone.querySelectorAll("[data-item]")],
    vertical: () => state.view === "grid",
    // The wrapper scrolls, so the year band moves with the columns.
    strip: () => output.querySelector(".gridwrap"),
    onDrop: dropOn
  });
  const addPassedAware = (p, at, code, optionsFor) => {
    const added = addCourseFilling(p, at, code, loaded.catalog, void 0, optionsFor);
    if (!codesIn(state.completedText, loaded.catalog).includes(loaded.catalog.canonical(code))) return added;
    const item = added.terms.find((planTerm) => termKey(planTerm.term) === termKey(at))?.items.find((other) => other.kind === "course" && loaded.catalog.canonical(other.code) === loaded.catalog.canonical(code) && other.done !== true);
    return item === void 0 ? added : toggleDone(added, item.id);
  };
  const addedNotice = (code, at) => {
    const title = loaded.catalog.get(code)?.title;
    library.notice(`${code}${title ? `, ${title},` : ""} added to ${termLabel(at)}.`, () => {
      if (editing !== null && editing.undo()) draw();
    });
  };
  const readCourse = (code, at, from) => {
    if (live === null) return;
    if (live === null) return;
    const course = loaded.catalog.get(code);
    const placement = /* @__PURE__ */ new Map();
    for (const planTerm of live.plan.terms) {
      for (const planItem of planTerm.items) {
        if (planItem.kind === "course") {
          placement.set(loaded.catalog.canonical(planItem.code), planTerm.term);
        }
      }
    }
    drawer.open(
      {
        item: {
          kind: "course",
          id: `library:${code}`,
          code,
          title: course?.title ?? code,
          credits: course?.credits ?? 3,
          placement: "added"
        },
        term: at,
        catalog: loaded.catalog,
        context: live.context,
        placement,
        problems: [],
        doubleDips: live.doubleDips,
        ...live.contextWithheld ? { contextWithheld: true } : {},
        // The reader came from the library to decide; deciding is here too.
        onAdd: {
          label: `Add to ${termLabel(at)}`,
          add: () => {
            if (live === null) return;
            drawer.close();
            const { plan: before, optionsFor } = live;
            live.edit((p) => addPassedAware(p, at, code, optionsFor), arrivalIn(before, at));
            addedNotice(code, at);
          }
        }
      },
      from
    );
  };
  const library = new CourseLibrary(loaded.catalog, loaded.offerings, {
    onAdd: (code, at) => {
      if (live === null) return;
      const { plan: before, optionsFor } = live;
      live.edit((p) => addPassedAware(p, at, code, optionsFor), arrivalIn(before, at));
      addedNotice(code, at);
    },
    onAddNamed: (label, credits, at) => {
      if (live === null) return;
      const before = live.plan;
      live.edit((p) => addNamedCourse(p, at, label, credits), arrivalIn(before, at));
    },
    onRead: readCourse,
    onAddSlot: (spec, at) => {
      if (live === null) return;
      const before = live.plan;
      live.edit((p) => addSlot(p, at, spec), arrivalIn(before, at));
    },
    onClose: () => {
      library.close();
      redrawCurrent();
    },
    dnd,
    needsFirst: (code, at) => live === null ? void 0 : needsFirst(code, at, live.plan, live.context, loaded.catalog, live.optionsFor)
  });
  root.append(library.element);
  const sessionInput = (context, maxCredits, program, contextWithheld) => {
    const publishedCredits2 = /* @__PURE__ */ new Map();
    for (const gridTerm of program?.grid.terms ?? []) {
      if (gridTerm.credits !== void 0) publishedCredits2.set(gridTerm.index, gridTerm.credits);
    }
    return {
      catalog: loaded.catalog,
      offerings: loaded.offerings,
      context,
      maxCreditsPerTerm: maxCredits,
      ...publishedCredits2.size > 0 ? { publishedCredits: publishedCredits2 } : {},
      ...contextWithheld ? { contextWithheld: true } : {}
    };
  };
  const slotOptionsFor = (bindings, standing) => {
    const findingAt = (path, label) => {
      if (standing === void 0) return void 0;
      const direct = standing.findings.find((f) => f.path === path);
      if (direct !== void 0) return direct;
      const under = standing.findings.filter((f) => f.path.startsWith(`${path}.`));
      if (under.length === 0) return void 0;
      const options = [...new Set(under.flatMap((f) => f.code !== void 0 ? [f.code] : f.options ?? []))];
      return {
        path,
        label,
        type: "CreditsFrom",
        standing: under.some((f) => f.standing === "unmet") ? "unmet" : "unverifiable",
        message: `${label}: what your track still needs is listed under Program requirements.`,
        ...options.length > 0 ? { options } : {}
      };
    };
    const optionsFor = (slot) => {
      const binding = bindings.get(slot.id);
      const finding3 = binding === void 0 ? void 0 : findingAt(binding.requirement, binding.label);
      if (binding !== void 0 && finding3 !== void 0) {
        const options = [
          ...finding3.options ?? [],
          ...bundleOptions(finding3, slot),
          ...(finding3.groups ?? []).flatMap((group) => group.options)
        ];
        if (options.length > 0) return { options: [...new Set(options)], requirement: binding.label };
      }
      return slot.options;
    };
    const bundleOptions = (finding3, slot) => {
      const codes = (finding3.bundles ?? []).flatMap((bundle) => bundle.codes);
      const want = creditsOf2(slot);
      const fitting = codes.filter((code) => {
        const course = loaded.catalog.get(code);
        return course !== void 0 && creditsNominal(course.credits) === want;
      });
      return fitting.length > 0 ? fitting : codes;
    };
    return { optionsFor, findingAt };
  };
  const render = (view) => {
    const { session, program } = view;
    const plan = session.plan;
    const held = plan.terms.flatMap(
      (planTerm) => planTerm.items.flatMap((item) => item.kind === "course" ? [item.code] : [])
    );
    const allHeld = [...held, ...(view.context.completed ?? []).map((entry) => entry.code)];
    const standing = view.requirements === void 0 ? void 0 : satisfy({
      requirements: view.requirements.requirements,
      catalog: loaded.catalog,
      held: allHeld,
      ...view.requirements.totalCredits !== void 0 ? { totalCredits: view.requirements.totalCredits } : {},
      ...view.contextWithheld ? { contextWithheld: true } : {},
      ...view.context.chosen ? { chosen: view.context.chosen } : {}
    });
    const graduation = view.graduation === void 0 ? void 0 : checkGraduation({
      rules: view.graduation.rules,
      plan,
      context: view.context,
      catalog: loaded.catalog,
      ...view.contextWithheld ? { contextWithheld: true } : {}
    });
    const edit = (operation, touched) => {
      if (session.apply(operation, touched)) {
        if (view.shared === void 0) notePlanStep();
        pendingFocus = "touched";
        view.redraw();
      }
    };
    view.persist(session.plan, session.edited);
    const seasons = view.pace?.seasons ?? program?.grid.seasons ?? seasonsOf(plan);
    const { optionsFor, findingAt } = slotOptionsFor(view.bindings, standing);
    const forLabel = (slot, binding) => binding !== void 0 && !/^(complete|choose|select|take|any|\d)/i.test(binding.label.trim()) ? binding.label : slot.label;
    const fillBundle = (before, slot, at, codes, binding) => {
      const creditsFor2 = (code) => {
        const course = loaded.catalog.get(code);
        return course === void 0 ? void 0 : creditsNominal(course.credits);
      };
      const remaining = [...codes];
      const take = (want) => {
        if (remaining.length === 0) return void 0;
        const fitting = remaining.findIndex((code) => creditsFor2(code) === want);
        return remaining.splice(fitting >= 0 ? fitting : 0, 1)[0];
      };
      let next = before;
      const own = take(creditsOf2(slot));
      if (own !== void 0) next = fillSlot(next, slot.id, own, loaded.catalog, forLabel(slot, binding));
      const companions = binding === void 0 ? [] : allItems(next).map(({ item }) => item).filter((other) => other.kind === "slot" && other.id !== slot.id).filter((other) => view.bindings.get(other.id)?.requirement === binding.requirement);
      for (const companion of companions) {
        const code = take(creditsOf2(companion));
        if (code !== void 0) next = fillSlot(next, companion.id, code, loaded.catalog, forLabel(companion, binding));
      }
      for (const code of remaining) next = addCourse(next, at, code, loaded.catalog, forLabel(slot, binding));
      return next;
    };
    const openPlaces = plan.terms.flatMap(
      (planTerm) => planTerm.items.flatMap((item) => {
        if (item.kind !== "slot") return [];
        const options = resolveSlotOptions(item, optionsFor)?.options ?? [];
        return options.length > 0 ? [{ credits: creditsOf2(item), options }] : [];
      })
    );
    const rankedMinors = rankMinors(minors, {
      held: allHeld,
      catalog: loaded.catalog,
      openPlaces,
      ...view.facts?.department ? { majorDepartment: view.facts.department } : {},
      ...view.contextWithheld ? { contextWithheld: true } : {}
    });
    const chosenMinors = view.context.minors ?? (view.context.minor ? [view.context.minor] : []);
    const minorPanel = {
      chosen: chosenMinors.flatMap((id) => rankedMinors.filter((m) => m.id === id)),
      ranked: rankedMinors,
      readOnly: view.shared !== void 0,
      onAdd: (id) => {
        if (!state.minorIds.includes(id)) state.minorIds.push(id);
        draw();
      },
      onRemove: (id) => {
        state.minorIds = state.minorIds.filter((m) => m !== id);
        draw();
      },
      titleOf: (code) => loaded.catalog.get(code)?.title
    };
    drawMinorOffer(minorPanel);
    const majorPanels = (view.context.majors ?? []).flatMap((id) => {
      const tree = loaded.trees.get(id);
      const entry = loaded.index.find((p) => p.id === id);
      if (tree === void 0) return [];
      const chosenHere = view.context.majorChoices?.[id];
      return [{
        id,
        name: entry?.title ?? tree.title ?? id,
        standing: satisfy({
          requirements: tree.requirements,
          catalog: loaded.catalog,
          held: allHeld,
          ...tree.totalCredits !== void 0 ? { totalCredits: tree.totalCredits } : {},
          ...chosenHere ? { chosen: chosenHere } : {},
          ...view.contextWithheld ? { contextWithheld: true } : {}
        }),
        ...view.shared === void 0 ? {
          onRemove: () => {
            state.majorIds = state.majorIds.filter((m) => m !== id);
            draw();
          }
        } : {}
      }];
    });
    const dips = view.requirements === void 0 ? /* @__PURE__ */ new Map() : doubleDips(view.requirements.requirements, loaded.catalog);
    live = { edit, plan, context: view.context, contextWithheld: view.contextWithheld, optionsFor, doubleDips: dips };
    library.placeholders(placeholdersFor(program));
    library.update(
      plan,
      new Set((view.context.completed ?? []).map((entry) => loaded.catalog.canonical(entry.code))),
      optionsFor,
      dips
    );
    {
      const scope = /* @__PURE__ */ new Set();
      if (view.requirements !== void 0) {
        for (const code of coursesUnder(view.requirements.requirements)) scope.add(loaded.catalog.canonical(code));
      }
      for (const chosen of minorPanel.chosen) {
        const minorTree = minors.find((m) => m.id === chosen.id)?.tree;
        if (minorTree !== void 0) {
          for (const code of coursesUnder(minorTree.requirements)) scope.add(loaded.catalog.canonical(code));
        }
      }
      for (const major of majorPanels) {
        const tree = loaded.trees.get(major.id);
        if (tree !== void 0) for (const code of coursesUnder(tree.requirements)) scope.add(loaded.catalog.canonical(code));
      }
      library.programCourses(scope);
    }
    const openItem = (item, at, from, again = false) => {
      const placement = /* @__PURE__ */ new Map();
      const doneCourses = /* @__PURE__ */ new Set();
      for (const planTerm of plan.terms) {
        for (const planItem of planTerm.items) {
          if (planItem.kind === "course") {
            placement.set(loaded.catalog.canonical(planItem.code), planTerm.term);
            if (planItem.done === true) doneCourses.add(loaded.catalog.canonical(planItem.code));
          }
        }
      }
      const binding = item.kind === "slot" ? view.bindings.get(item.id) : void 0;
      const finding3 = binding === void 0 ? void 0 : findingAt(binding.requirement, binding.label);
      const codeOfItem = /* @__PURE__ */ new Map();
      for (const planTerm of plan.terms) {
        for (const planItem of planTerm.items) {
          if (planItem.kind === "course") codeOfItem.set(planItem.id, loaded.catalog.canonical(planItem.code));
        }
      }
      const unlocks = [...graph.get(item.id)?.unlocks ?? []].map((id) => codeOfItem.get(id)).filter((code) => code !== void 0).sort();
      const category = categories.of(item)?.label;
      const satisfiedBy = binding !== void 0 && finding3 === void 0 ? standing?.assignment.get(binding.requirement) : void 0;
      const alternatives = alternativesFor(
        item,
        program?.grid,
        view.bindings,
        view.requirements,
        (id) => loaded.catalog.canonical(id)
      );
      const say = view.say;
      const slotFor = /* @__PURE__ */ new Map();
      for (const planTerm of plan.terms) {
        for (const planItem of planTerm.items) {
          if (planItem.kind !== "slot") continue;
          for (const option of resolveSlotOptions(planItem, optionsFor)?.options ?? []) {
            const canonical = loaded.catalog.canonical(option);
            if (!slotFor.has(canonical)) slotFor.set(canonical, planTerm.term);
          }
        }
      }
      const input = {
        item,
        term: at,
        catalog: loaded.catalog,
        context: view.context,
        placement,
        doneCourses,
        slotFor,
        onHoverCourse: (code) => {
          for (const lit of output.querySelectorAll(".peer-lit")) lit.classList.remove("peer-lit");
          if (code !== null) output.querySelector(`[data-code="${CSS.escape(loaded.catalog.canonical(code))}"]`)?.classList.add("peer-lit");
        },
        // Which of a placeholder's options are ready to take at its term.
        readiness: (code) => {
          const standing2 = prerequisiteStanding(code, at, plan, view.context, loaded.catalog, optionsFor);
          if (standing2 === void 0) return { truth: "none" };
          if (standing2.truth === "unmet") {
            const needs = needsFirst(code, at, plan, view.context, loaded.catalog, optionsFor);
            return { truth: "unmet", ...needs !== void 0 ? { needs } : {} };
          }
          return { truth: standing2.truth };
        },
        // The course into the earliest placeholder that would take it.
        onFillSlot: (code) => {
          const fill = fillFor(plan, code, loaded.catalog, optionsFor);
          if (fill !== void 0) edit((p) => fillSlot(p, fill.slot.id, code, loaded.catalog, fill.requirement), fill.slot.id);
        },
        problems: plan.problems,
        dnd,
        doubleDips: dips,
        unlocks,
        ...say ? {
          onCourseHeld: (code, held2) => {
            const there = allItems(plan).find(({ item: other }) => other.kind === "course" && loaded.catalog.canonical(other.code) === code);
            if (there !== void 0 && there.item.kind === "course" && there.item.done === true !== held2) {
              edit((p) => toggleDone(p, there.item.id), there.item.id);
            } else {
              say.courseHeld(code, held2);
            }
          },
          onStanding: say.standing,
          onPlacement: say.placement
        } : {},
        ...category !== void 0 ? { category } : {},
        ...finding3 ? { finding: finding3 } : {},
        ...binding ? { binding } : {},
        ...binding && finding3 === void 0 ? { met: true } : {},
        ...satisfiedBy ? { satisfiedBy } : {},
        ...view.contextWithheld ? { contextWithheld: true } : {},
        // FR-EDIT-01 without a pointer: the cards carry no arrows, so the
        // drawer is where a keyboard moves or removes a course. The
        // drawer stays open through a tick, a move or a choice and is
        // drawn again from the new plan; only removing closes it.
        terms: plan.terms.map((t) => t.term),
        onMove: (to, block2) => {
          edit((p) => moveItem(p, item.id, to, block2), item.id);
        },
        onRemove: () => {
          drawer.close();
          edit((p) => removeItem(p, item.id));
        },
        ...item.kind !== "slot" ? {
          onToggleDone: () => {
            edit((p) => toggleDone(p, item.id), item.id);
          }
        } : {},
        // FR-EDIT-04 from the drawer: choose one of the slot's options, or
        // a course and its lab together.
        ...item.kind === "slot" ? {
          onChoose: (code) => {
            edit((p) => fillSlot(p, item.id, code, loaded.catalog, forLabel(item, binding)), item.id);
          },
          onChooseBundle: (codes) => {
            edit((p) => fillBundle(p, item, at, codes, binding), item.id);
          }
        } : {},
        // FR-EDIT-02: swap for what the department listed, with a preview.
        ...alternatives !== void 0 ? {
          alternatives: {
            requirement: alternatives.requirement,
            options: alternatives.options.map((code) => {
              const course = loaded.catalog.get(code);
              return {
                code,
                title: course?.title ?? code,
                credits: course ? creditsNominal(course.credits) : 3
              };
            }),
            preview: (code) => {
              const next = session.preview((p) => swapCourse(p, item.id, code, loaded.catalog));
              const count2 = (problems, severity) => problems.filter((p) => p.severity === severity).length;
              return {
                problems: next.problems.filter((p) => p.itemId === item.id),
                errorsBefore: count2(plan.problems, "error"),
                errorsAfter: count2(next.problems, "error"),
                warningsBefore: count2(plan.problems, "warning"),
                warningsAfter: count2(next.problems, "warning")
              };
            },
            swap: (code) => {
              edit((p) => swapCourse(p, item.id, code, loaded.catalog), item.id);
            }
          }
        } : {}
      };
      if (again) drawer.refresh(input, from);
      else if (from !== null) drawer.open(input, from);
    };
    const categories = categoriesFor(view.requirements, view.bindings, (id) => loaded.catalog.canonical(id), view.extras);
    const graph = planGraph(plan, loaded.catalog);
    const planView = (state.view === "table" ? planTable : planGrid)({
      plan,
      seasons,
      categoryOf: categories.of,
      chainOf: (item) => traceChain(graph, item.id),
      rhythmOf: (item) => item.kind === "course" ? loaded.offerings.rhythmOf(loaded.catalog.canonical(item.code)) : void 0,
      cap: view.maxCredits,
      touched: session.touched,
      edit,
      onOpen: openItem,
      onAddHere: (at) => {
        library.open(at);
        view.redraw();
      },
      dnd
    });
    const planArea = planView;
    const tools = element("div", "gridtools");
    tools.append(
      editBar({
        session,
        seasons,
        reset: view.reset,
        draw: view.redraw,
        afterUndo: () => {
          pendingFocus = "toolbar";
          view.redraw();
        },
        edit,
        sharedView: view.shared !== void 0,
        ...view.shared === void 0 ? {
          undo: { can: canUndo, run: () => undoLast() },
          redo: { can: canRedo, run: () => redoLast() }
        } : {},
        libraryOpen: library.isOpen,
        toggleLibrary: () => {
          if (library.isOpen) library.close();
          else library.open();
          view.redraw();
        },
        share: shareControls({
          plan,
          context: view.context,
          canIncludeContext: !view.contextWithheld,
          extra: view.shareExtra
        })
      })
    );
    const scrollTop = document.documentElement.scrollTop;
    output.textContent = "";
    output.append(
      ...view.shared ? [
        sharedNotice({
          opened: view.shared.opened,
          programName: view.program !== void 0 || view.requirements !== void 0 ? view.title : void 0,
          exactGrid: view.shared.exactGrid,
          ...plan.catalogYear && plan.catalogYear !== loaded.year ? {
            yearNote: `It was made from the ${plan.catalogYear} catalog, and this page is laid out from ${loaded.year}. ` + (loaded.years.includes(plan.catalogYear) ? `To check it against its own catalog, choose ${plan.catalogYear} under Catalog year at the top.` : "That edition is not on file here, so it is checked against this one.")
          } : {},
          pageDataVersion: loaded.dataVersion,
          pageBuiltAt: loaded.builtAt,
          differences: catalogDifferences(plan, loaded.catalog),
          onLeave: view.leave
        })
      ] : [],
      withOutcomes(planSummary({
        ...additionsInput(view.additions, view.extendNotes, loaded.catalog),
        title: view.title,
        ...program?.degree ? { degree: program.degree } : {},
        plan,
        seasons,
        ...view.requiredCredits !== void 0 ? { requiredCredits: view.requiredCredits } : {},
        ...view.pace ? {
          pace: {
            cap: view.maxCredits,
            // With a minor's courses in it, the plan is the department's
            // sequence and more; the sentence says so rather than "as planned".
            published: view.pace.published && view.additions.length === 0,
            custom: view.pace.blank
          }
        } : {},
        ...standing ? { standing } : {},
        onJump: jumpTo,
        ...graduation ? { graduation } : {},
        ...program ? { source: program.grid.source } : {},
        ...view.facts ? { facts: view.facts } : {}
      }), view, loaded),
      // Every requirement of the program against the plan, and every course
      // in the plan, folded shut side by side under the figures (the
      // sponsor's ninth and twentieth reviews).
      foldRow(
        view.requirements !== void 0 && standing !== void 0 ? requirementTree(view.requirements, standing, (code) => loaded.catalog.get(code)?.title) : void 0,
        requiredCoursesFold({
          programs: [
            ...view.requirements !== void 0 ? [{ name: view.title, tree: view.requirements }] : [],
            ...majorPanels.flatMap((major) => {
              const tree = loaded.trees.get(major.id);
              return tree === void 0 ? [] : [{ name: major.name, tree }];
            }),
            ...minorPanel.chosen.flatMap((chosen) => {
              const tree = minors.find((m) => m.id === chosen.id)?.tree;
              return tree === void 0 ? [] : [{ name: `${chosen.name} minor`, tree }];
            })
          ],
          plan,
          passed: new Set((view.context.completed ?? []).map((entry) => loaded.catalog.canonical(entry.code))),
          catalog: loaded.catalog,
          // A row opens the course's drawer: the plan's own card where the
          // course is in the plan, else the reader the library uses.
          onOpen: (code, from) => {
            for (const planTerm of plan.terms) {
              for (const item of planTerm.items) {
                if (item.kind === "course" && loaded.catalog.canonical(item.code) === code) {
                  openItem(item, planTerm.term, from);
                  return;
                }
              }
            }
            readCourse(code, plan.terms[0]?.term ?? state.start, from);
          }
        })
      ),
      viewBar({
        view: state.view,
        setView: (next) => {
          state.view = next;
          view.redraw();
        },
        plan,
        requiredCredits: view.requiredCredits,
        onUntickAll: () => edit(untickAll)
      }),
      ...view.parsed ? [transcriptReport(view.parsed, "completed")] : [],
      ...view.inProgress ? [transcriptReport(view.inProgress, "in progress")] : [],
      ...program?.notes.length ? [departmentNotes(program.notes)] : [],
      planArea,
      // What the colours mean, directly under the plan they colour.
      legend(categories.list),
      tools,
      found(plan.problems, standing, graduation, minorPanel, dips, (code) => loaded.catalog.get(code)?.title, majorPanels, view.title),
      ...costsBelow(plan, view, loaded),
      aboutPage({ catalogYear: plan.catalogYear, window: loaded.offerings.window }),
      provenance(plan, loaded)
    );
    document.documentElement.scrollTop = scrollTop;
    if (drawer.isOpen) {
      const shown = drawer.itemId === void 0 ? void 0 : allItems(plan).find(({ item }) => item.id === drawer.itemId);
      if (shown === void 0) drawer.close();
      else {
        const card2 = output.querySelector(`[data-item="${CSS.escape(shown.item.id)}"] .item-open, [data-item="${CSS.escape(shown.item.id)}"] .chip-open`);
        openItem(shown.item, shown.term, card2, true);
      }
    }
    const touchedElement = session.touched === void 0 ? null : output.querySelector(`[data-item="${CSS.escape(session.touched)}"]`);
    touchedElement?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (pendingFocus !== null) {
      const target = pendingFocus === "touched" ? touchedElement?.querySelector(".item-open, .chip-open") ?? null : null;
      const toolbar = [...output.querySelectorAll(".editbar .btn")];
      const fallback = toolbar.find((b) => !b.disabled) ?? null;
      (target ?? fallback)?.focus({ preventScroll: true });
      pendingFocus = null;
    }
  };
  const jumpTo = (target) => {
    const [sectionId, foldId] = target.split("#");
    const section = document.getElementById(sectionId ?? "");
    if (section === null) return;
    const folds = [...section.querySelectorAll("details[data-fold]")];
    const wanted = foldId ? folds.find((f) => f.dataset["fold"] === foldId) : folds[0];
    if (wanted !== void 0) wanted.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const draw = () => {
    controls.hidden = false;
    about.element.hidden = false;
    about.refresh();
    sharedControls.hidden = true;
    drawChips();
    if (state.programIndex < 0) {
      programPicker.show(-1);
      drawer.close();
      library.close();
      editing = null;
      editingKey = "";
      save({
        completedText: state.completedText,
        inProgressText: state.inProgressText,
        mathPlacement: state.mathPlacement,
        englishPlacement: state.englishPlacement,
        advancedStanding: state.advancedStanding,
        matriculated: state.matriculated,
        ...state.asserted.length > 0 ? { asserted: state.asserted } : {},
        programFile: "",
        programId: "",
        ...state.minorIds.length > 0 ? { minorIds: state.minorIds } : {},
        ...state.majorIds.length > 0 ? { majorIds: state.majorIds } : {},
        start: `${state.start.year}${state.start.season}`,
        ...paceStored(),
        view: state.view,
        catalogYear: loaded.year
      });
      refreshPace(Math.min(REGISTRATION_MAX, Math.max(1, Math.round(state.cap ?? DEFAULT_LOAD))), state.summers ?? false, state.blank, false);
      refreshTrack(void 0, "");
      output.textContent = "";
      const empty = element("section", "empty-program");
      empty.setAttribute("aria-live", "polite");
      empty.append(
        element("p", "eyebrow-label", "No program chosen"),
        element("h2", void 0, programLost ? `Your program is not in the ${loaded.year} catalog's list` : "Start with your program"),
        element(
          "p",
          void 0,
          programLost ? "The catalog year changed under it. Choose the program again from this year's list, or choose another year under Catalog year at the top." : "Search for your degree, certificate or emphasis under Program, or narrow the list by college and department. The plan, its checks and its requirements appear here once one is chosen."
        )
      );
      const choose = element("button", "btn btn-primary", "Choose a program");
      choose.type = "button";
      choose.addEventListener("click", () => {
        programPicker.element.querySelector("input")?.focus();
      });
      empty.append(choose);
      output.append(empty);
      return;
    }
    const choice = choices[state.programIndex] ?? choices[0];
    const program = choice.program ?? stubProgram(choice.catalog, loaded.year, loaded.trees.get(choice.catalog.id));
    const onFile = choice.program !== void 0;
    programPicker.show(state.programIndex);
    minorPicker.show(-1);
    const loads = onFile ? publishedLoads(program.grid, loaded.catalog) : [];
    const departmentCap = Math.max(1, ...loads);
    const cap = Math.min(REGISTRATION_MAX, Math.max(1, Math.round(state.cap ?? departmentCap)));
    const gridSummers = program.grid.seasons.includes("S");
    const summers = state.summers ?? gridSummers;
    const blank = !onFile || state.blank;
    const asPlanned = onFile && !blank && cap === departmentCap && summers === gridSummers;
    const seasons = asPlanned ? program.grid.seasons : summers ? ["F", "P", "S"] : ["F", "P"];
    const pace = { cap, seasons, published: asPlanned, blank };
    refreshPace(cap, summers, state.blank, onFile);
    const parsed = parseCompleted(state.completedText, loaded.catalog);
    const inProgress = parseCompleted(state.inProgressText, loaded.catalog);
    const majorChoices = Object.fromEntries(
      state.majorIds.flatMap((id) => {
        const chosen = state.majorChoices[id];
        return chosen !== void 0 && Object.keys(chosen).length > 0 ? [[id, chosen]] : [];
      })
    );
    const described = toStudentContext({
      completed: parsed.completed,
      inProgress: inProgress.completed.map((entry) => entry.code),
      ...state.mathPlacement ? { mathPlacement: state.mathPlacement } : {},
      ...state.englishPlacement ? { englishPlacement: state.englishPlacement } : {},
      ...state.advancedStanding ? { advancedStanding: true } : {},
      ...state.matriculated ? { matriculated: true } : {},
      ...state.asserted.length > 0 ? { asserted: state.asserted } : {},
      // FR-PLAN-20: the track, where the student chose one, is part of what
      // they have said about themselves, and travels with the rest.
      ...chosenFor(choice) ? { chosen: chosenFor(choice) } : {},
      // FR-PLAN-21: so are the minors, and any further major.
      ...state.minorIds.length > 0 ? { minors: state.minorIds } : {},
      ...state.majorIds.length > 0 ? { majors: state.majorIds } : {},
      ...Object.keys(majorChoices).length > 0 ? { majorChoices } : {},
      catalogYear: loaded.year
    });
    save({
      completedText: state.completedText,
      inProgressText: state.inProgressText,
      mathPlacement: state.mathPlacement,
      englishPlacement: state.englishPlacement,
      advancedStanding: state.advancedStanding,
      matriculated: state.matriculated,
      ...state.asserted.length > 0 ? { asserted: state.asserted } : {},
      programFile: program.file,
      programId: choice.catalog?.id ?? program.id,
      ...choice.track ? { programTrack: choice.track.label } : {},
      ...state.minorIds.length > 0 ? { minorIds: state.minorIds } : {},
      ...state.majorIds.length > 0 ? { majorIds: state.majorIds } : {},
      ...Object.keys(majorChoices).length > 0 ? { majorChoices } : {},
      start: `${state.start.year}${state.start.season}`,
      // The load the plan is for is part of what identifies it, so an edit
      // does not go missing when the page comes back at another pace.
      ...paceStored(),
      view: state.view,
      catalogYear: loaded.year
    });
    const key = [
      loaded.year,
      onFile ? program.file : `catalog:${program.id}`,
      choice.track?.label ?? "",
      `${cap}|${summers ? "summers" : ""}|${blank ? "blank" : ""}`,
      termKey(state.start),
      // The record is not part of the identity: a course marked passed
      // changes the plan under the same key rather than starting another.
      // The other programs' needs are in the plan, so they are part of what identifies it.
      state.minorIds.join(","),
      state.majorIds.map((id) => `${id}:${Object.values(majorChoices[id] ?? {}).join("+")}`).join(",")
    ].join("|");
    if (key !== editingKey) {
      editing = null;
      editingKey = key;
    }
    const result = blank ? blankResult(program, state.start, described, loaded) : reflow({
      grid: program.grid,
      catalog: loaded.catalog,
      offerings: loaded.offerings,
      context: described,
      start: state.start,
      meta: {
        dataVersion: loaded.dataVersion,
        builtAt: loaded.builtAt,
        engineVersion: "0.1.0",
        source: program.grid.source
      },
      // The department's own load is reflow as before, with no term carrying
      // more than the department put in it, so the plan is theirs and not a
      // packed version of it. Any other load is the same sequence spread at
      // that load over as many terms as it takes.
      ...asPlanned ? { capAsPublished: true } : { pace: { maxCredits: cap, seasons } }
    });
    const context = {
      ...described,
      constraints: { ...described.constraints ?? {}, maxCreditsPerTerm: result.maxCreditsPerTerm }
    };
    const extensions = [
      ...state.minorIds.flatMap((id) => {
        const minor = minors.find((m) => m.id === id);
        return minor === void 0 ? [] : [{ id: minor.id, name: `${minor.name} minor`, tree: minor.tree }];
      }),
      ...state.majorIds.flatMap((id) => {
        const tree = loaded.trees.get(id);
        const entry = loaded.index.find((p) => p.id === id);
        const chosen = described.majorChoices?.[id];
        return tree === void 0 ? [] : [{ id, name: entry?.title ?? id, tree, ...chosen ? { chosen } : {} }];
      })
    ];
    const baseHeld = [
      ...result.plan.terms.flatMap((planTerm) => planTerm.items.flatMap((item) => item.kind === "course" ? [item.code] : [])),
      ...(described.completed ?? []).map((entry) => entry.code)
    ];
    const baseStanding = program.requirements === void 0 ? void 0 : satisfy({
      requirements: program.requirements.requirements,
      catalog: loaded.catalog,
      held: baseHeld,
      ...program.requirements.totalCredits !== void 0 ? { totalCredits: program.requirements.totalCredits } : {},
      ...described.chosen ? { chosen: described.chosen } : {}
    });
    const extended = blank || extensions.length === 0 ? void 0 : extendPlan({
      plan: result.plan,
      catalog: loaded.catalog,
      offerings: loaded.offerings,
      context: described,
      programs: extensions,
      maxCredits: result.maxCreditsPerTerm,
      seasons,
      optionsFor: slotOptionsFor(program.bindings, baseStanding).optionsFor
    });
    const laidOut = extended?.plan ?? result.plan;
    const openOptions = (of) => slotOptionsFor(
      program.bindings,
      program.requirements === void 0 ? void 0 : satisfy({
        requirements: program.requirements.requirements,
        catalog: loaded.catalog,
        held: of.terms.flatMap((planTerm) => planTerm.items.flatMap((item) => item.kind === "course" ? [item.code] : [])),
        ...program.requirements.totalCredits !== void 0 ? { totalCredits: program.requirements.totalCredits } : {},
        ...described.chosen ? { chosen: described.chosen } : {}
      })
    ).optionsFor;
    const passedCodes = (described.completed ?? []).map((entry) => entry.code);
    const withRecord = blank ? laidOut : applyRecordToSlots(laidOut, passedCodes, loaded.catalog, openOptions(laidOut));
    const extras = extensions.map((extension) => ({ id: extension.id, label: extension.name, tree: extension.tree }));
    const requiredTotal = program.totalCredits === void 0 ? void 0 : program.totalCredits + extensions.reduce((sum, extension) => {
      const standing = minorStanding(
        { id: extension.id, name: extension.name, tree: extension.tree },
        { held: baseHeld, catalog: loaded.catalog }
      );
      return sum + (standing.needed ?? 0);
    }, 0);
    const input = sessionInput(context, REGISTRATION_MAX, program, false);
    if (editing !== null && !editing.edited) editing = null;
    if (editing === null) {
      const stored2 = deserializePlan(loadPlan(key));
      const restored = stored2 === void 0 || blank ? stored2 : applyRecordToPlan(stored2, passedCodes, loaded.catalog, openOptions(stored2));
      editing = new EditSession(restored ?? withRecord, input, {
        restored: restored !== void 0
      });
    } else {
      editing.retarget(input);
    }
    const facts = factsFor(choice, choices, loaded.catalog, (index) => {
      state.programIndex = index;
      draw();
    }, loaded);
    refreshTrack(facts?.tracks, choice.catalog?.title ?? choice.label.replace(/ · .*$/, ""));
    render({
      title: programLabel(program),
      program,
      requirements: program.requirements,
      bindings: program.bindings,
      graduation: program.graduation,
      session: editing,
      context,
      contextWithheld: false,
      pace,
      maxCredits: result.maxCreditsPerTerm,
      requiredCredits: requiredTotal,
      parsed,
      inProgress,
      facts,
      shared: void 0,
      // A link names the grid file so the reader's build can find the exact
      // published plan; a program with no grid on file has nothing to name.
      shareExtra: onFile ? { grid: program.file } : {},
      extras,
      additions: extended?.added ?? [],
      extendNotes: extended?.notes ?? [],
      redraw: draw,
      reset: () => {
        editing?.reset(withRecord);
        notePlanStep();
        draw();
      },
      persist: (plan, edited) => {
        if (edited) savePlan(key, serializePlan(plan, context));
        else forgetPlan(key);
      },
      leave: () => void 0,
      say: {
        courseHeld: (code, held) => {
          remember(() => {
            const passed = codesIn(state.completedText, loaded.catalog);
            state.completedText = (held ? [...passed.filter((c) => c !== code), code] : passed.filter((c) => c !== code)).join("\n");
          });
          draw();
        },
        standing: (key2, held) => {
          remember(() => {
            if (key2 === "university_advanced_standing") state.advancedStanding = held;
            else if (key2 === "matriculated") state.matriculated = held;
            else state.asserted = held ? [.../* @__PURE__ */ new Set([...state.asserted, key2])] : state.asserted.filter((k) => k !== key2);
          });
          draw();
        },
        placement: (subject, code) => {
          remember(() => {
            if (subject === "math") state.mathPlacement = code ?? "";
            else state.englishPlacement = code ?? "";
          });
          draw();
        }
      }
    });
  };
  const drawShared = (fragment, opened) => {
    controls.hidden = true;
    about.element.hidden = true;
    sharedControls.hidden = false;
    sharedRoute = { fragment, opened };
    const plan = opened.plan;
    const gridFile = plan.meta.grid;
    const sameProgram = loaded.programs.filter((p) => p.id === plan.programId);
    const program = loaded.programs.find((p) => p.file === gridFile) ?? (sameProgram.length === 1 ? sameProgram[0] : void 0);
    const related = program ?? sameProgram[0];
    const listed = loaded.index.find((p) => p.id === plan.programId);
    const context = opened.context ?? EMPTY_CONTEXT;
    const contextWithheld = opened.context === void 0;
    const maxCredits = sharedMaxCredits ?? REGISTRATION_MAX;
    const key = `shared|${maxCredits}|${fragment}`;
    const input = sessionInput(context, maxCredits, program, contextWithheld);
    if (shared === null || shared.key !== key) {
      const restored = deserializePlan(loadSharedPlan(key));
      shared = {
        key,
        session: new EditSession(restored ?? plan, input, { restored: restored !== void 0 })
      };
    }
    const live2 = shared;
    const caps = CREDIT_CAPS.includes(maxCredits) ? CREDIT_CAPS : [...CREDIT_CAPS, maxCredits].sort((a, b) => a - b);
    sharedControls.textContent = "";
    sharedControls.append(
      select("Credits a term, at most", caps.map(String), caps.indexOf(maxCredits), (index) => {
        sharedMaxCredits = caps[index];
        drawShared(fragment, opened);
      })
    );
    const leaveControl = element("button", "btn btn-secondary btn-sm leave", "Plan my own degree instead");
    leaveControl.type = "button";
    leaveControl.addEventListener("click", leave);
    sharedControls.append(leaveControl);
    render({
      title: related ? programLabel(related) : listed?.title ?? plan.programId,
      program,
      requirements: related?.requirements,
      bindings: related?.bindings ?? /* @__PURE__ */ new Map(),
      graduation: related?.graduation,
      session: live2.session,
      context,
      contextWithheld,
      pace: void 0,
      maxCredits,
      requiredCredits: related?.totalCredits ?? listed?.credits,
      parsed: void 0,
      inProgress: void 0,
      facts: void 0,
      shared: { opened, exactGrid: program !== void 0 },
      shareExtra: program ? { grid: program.file } : {},
      extras: [],
      additions: [],
      extendNotes: [],
      redraw: () => drawShared(fragment, opened),
      reset: () => {
        live2.session.reset(plan);
        drawShared(fragment, opened);
      },
      // The reader's copy of somebody else's plan, without that somebody's
      // context: their edits are theirs to keep, the context is not.
      persist: (current, edited) => {
        if (edited) saveSharedPlan(key, shareDocument(current, EMPTY_CONTEXT, { withContext: false }));
        else forgetSharedPlan(key);
      },
      leave
    });
  };
  const showRefused = (reason) => {
    controls.hidden = true;
    about.element.hidden = true;
    sharedControls.hidden = true;
    sharedRoute = null;
    output.textContent = "";
    output.append(refusedNotice(reason, leave));
  };
  function leave() {
    drawer.close();
    library.close();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    shared = null;
    sharedRoute = null;
    sharedMaxCredits = void 0;
    draw();
  }
  const route = async () => {
    drawer.close();
    const fragment = window.location.hash.replace(/^#/, "");
    const result = await openShare(fragment);
    if (result.kind === "none") {
      sharedRoute = null;
      draw();
    } else if (result.kind === "refused") {
      showRefused(result.reason);
    } else {
      drawShared(fragment, result);
    }
  };
  const programPicker = new ProgramPicker(
    "Program",
    choices.map((c) => ({
      label: c.label,
      ...c.display !== void 0 ? { display: c.display } : {},
      ...c.group !== void 0 ? { group: c.group } : {},
      ...c.college !== void 0 ? { college: c.college } : {},
      ...c.department !== void 0 ? { department: c.department } : {},
      ...c.degree !== void 0 ? { degree: c.degree } : {}
    })),
    state.programIndex,
    (index) => {
      const picked = choices[index];
      const pickedId = picked?.catalog?.id ?? picked?.program?.id;
      const primary = choices[state.programIndex];
      const primaryId = primary?.catalog?.id ?? primary?.program?.id;
      if (state.programIndex < 0 || pickedId === void 0 || pickedId === primaryId) {
        state.programIndex = index;
      } else {
        if (!state.majorIds.includes(pickedId)) state.majorIds.push(pickedId);
        programPicker.show(state.programIndex);
      }
      draw();
    },
    "The first program you choose is the plan's. Choose another and it is added as a second major beside it, checked with the first and its courses carried in the plan, with an \xD7 to take it off. Where a program offers tracks, the track is chosen under it.",
    () => {
      state.programIndex = -1;
      draw();
    }
  );
  programPicker.element.classList.add("program-control");
  const trackPick = (of, options, selected, onChange, asks) => {
    const wrap = element("label", "track-pick");
    wrap.append(element("span", void 0, "track"));
    const field = element("select");
    options.forEach((text, index) => {
      const option = element("option", void 0, text);
      option.value = String(index);
      field.append(option);
    });
    field.value = String(selected);
    field.title = `${asks.replace(/[.\s]+$/, "")}. A track is a choice inside this program's requirements, not a program of its own; the check counts the track you choose, and with none chosen every track counts.`;
    field.setAttribute("aria-label", `Track for ${of}`);
    field.addEventListener("change", () => onChange(Number(field.value)));
    wrap.append(field);
    return wrap;
  };
  const refreshTrack = (tracks, of) => {
    programPicker.beside.textContent = "";
    if (tracks === void 0) return;
    programPicker.beside.append(
      trackPick(
        of,
        tracks.options.map((option) => option.label),
        Math.max(0, tracks.options.findIndex((option) => option.current)),
        (index) => tracks.options[index]?.pick(),
        tracks.asks
      )
    );
  };
  const drawChips = () => {
    const chip2 = (label, remove, what) => {
      const node = element("span", "combo-chip");
      node.append(element("span", void 0, label));
      const off = element("button", "combo-chip-x", "\xD7");
      off.type = "button";
      off.setAttribute("aria-label", `Remove ${what}`);
      off.addEventListener("click", remove);
      node.append(off);
      return node;
    };
    programPicker.chips.textContent = "";
    const idOf = (choice) => choice.catalog?.id ?? choice.program?.id;
    programPicker.exclude(choices.flatMap((choice, i) => {
      const id = idOf(choice);
      return id !== void 0 && state.majorIds.includes(id) ? [i] : [];
    }));
    minorPicker.exclude(minors.flatMap((minor, i) => state.minorIds.includes(minor.id) ? [i] : []));
    for (const id of state.majorIds) {
      const entry = loaded.index.find((p) => p.id === id);
      const name = entry?.title ?? id;
      const line = element("span", "chip-line");
      line.append(chip2(name, () => {
        state.majorIds = state.majorIds.filter((m) => m !== id);
        delete state.majorChoices[id];
        draw();
      }, `the major ${name}`));
      const tree = loaded.trees.get(id);
      for (const offered of tree === void 0 ? [] : groupChoices(tree.requirements)) {
        const labels = offered.groups.map((group) => group.label);
        const current = state.majorChoices[id]?.[offered.path];
        line.append(
          trackPick(name, ["Not chosen yet", ...labels], current === void 0 ? 0 : labels.indexOf(current) + 1, (index) => {
            const chosen = { ...state.majorChoices[id] ?? {} };
            const label = labels[index - 1];
            if (label === void 0) delete chosen[offered.path];
            else chosen[offered.path] = label;
            state.majorChoices[id] = chosen;
            draw();
          }, offered.label)
        );
      }
      programPicker.chips.append(line);
    }
    minorPicker.chips.textContent = "";
    for (const id of state.minorIds) {
      const candidate = minors.find((m) => m.id === id);
      minorPicker.chips.append(chip2(`${candidate?.name ?? id}, Minor`, () => {
        state.minorIds = state.minorIds.filter((m) => m !== id);
        draw();
      }, `the minor ${candidate?.name ?? id}`));
    }
  };
  const paceControl = element("div", "control pace-control");
  const paceRow = element("div", "pace-row");
  const paceSlider = element("input");
  paceSlider.type = "range";
  paceSlider.min = "1";
  paceSlider.max = String(REGISTRATION_MAX);
  paceSlider.step = "1";
  paceSlider.setAttribute("aria-valuetext", "");
  const paceFigure = element("output", "pace-figure");
  const paceWord = (cap) => `${cap} ${cap === 1 ? "credit" : "credits"}`;
  const showFigure = (cap) => {
    paceFigure.textContent = "";
    paceFigure.append(document.createTextNode(paceWord(cap)));
    paceFigure.append(element("small", void 0, "a term"));
    paceSlider.setAttribute("aria-valuetext", `${paceWord(cap)} a term`);
    paceSlider.style.setProperty("--pace-value", `${((cap - 1) / (REGISTRATION_MAX - 1) * 100).toFixed(1)}%`);
  };
  paceSlider.addEventListener("input", () => showFigure(Number(paceSlider.value)));
  paceSlider.addEventListener("change", () => {
    state.cap = Number(paceSlider.value);
    draw();
  });
  const paceTrack = element("div", "pace-track");
  paceTrack.append(paceSlider);
  paceRow.append(paceTrack, paceFigure);
  const paceOpts = element("div", "pace-opts");
  const summersBox = element("input");
  summersBox.type = "checkbox";
  const summersLabel = element("label");
  summersLabel.append(summersBox, document.createTextNode("Summers too"));
  summersBox.addEventListener("change", () => {
    state.summers = summersBox.checked;
    draw();
  });
  const blankBox = element("input");
  blankBox.type = "checkbox";
  const blankLabel = element("label");
  blankLabel.append(blankBox, document.createTextNode("Blank plan"));
  blankBox.addEventListener("change", () => {
    state.blank = blankBox.checked;
    draw();
  });
  paceOpts.append(summersLabel, blankLabel);
  paceRow.append(paceOpts);
  paceControl.append(labelFor2("Pace", paceSlider, INFO.pace), paceRow);
  const plateau = loaded.tuition?.plateau;
  if (plateau !== void 0) {
    const span = REGISTRATION_MAX - 1;
    const from = ((Math.max(1, plateau.from) - 1) / span * 100).toFixed(1);
    const to = ((Math.min(REGISTRATION_MAX, plateau.to) - 1) / span * 100).toFixed(1);
    paceSlider.style.setProperty(
      "--pace-track",
      `linear-gradient(to right, var(--line) 0 ${from}%, var(--flat-rate) ${from}% ${to}%, var(--line) ${to}% 100%)`
    );
    paceControl.append(
      element("p", "pace-note", `Tuition is the same from ${plateau.from} to ${plateau.to} credits a term, the shaded part of the slider.`)
    );
  }
  const refreshPace = (cap, summers, blank, onFile) => {
    paceSlider.value = String(cap);
    showFigure(cap);
    summersBox.checked = summers;
    blankBox.checked = blank;
    blankBox.disabled = !onFile;
  };
  const paceStored = () => ({
    ...state.cap !== void 0 ? { cap: state.cap } : {},
    ...state.summers !== void 0 ? { summers: state.summers } : {},
    ...state.blank ? { blank: true } : {}
  });
  const minorPicker = new ProgramPicker(
    "Minor",
    minorChoices(minors),
    -1,
    (index) => {
      const id = minors[index]?.id;
      if (id !== void 0 && !state.minorIds.includes(id)) state.minorIds.push(id);
      draw();
    },
    INFO.minor
  );
  const sortedYears = [...loaded.years].sort();
  const yearControl = select(
    "Catalog year",
    sortedYears.map((y) => y === loaded.years[0] ? `${y}, current` : y),
    Math.max(0, sortedYears.indexOf(state.catalogYear)),
    (index) => {
      const chosen = sortedYears[index];
      if (chosen === void 0 || chosen === state.catalogYear) return;
      state.catalogYear = chosen;
      save({ ...loadStored() ?? { completedText: "", inProgressText: "", mathPlacement: "", englishPlacement: "" }, catalogYear: chosen });
      window.location.reload();
    },
    INFO.catalogYear
  );
  yearControl.classList.add("year-control");
  controls.append(
    yearControl,
    programPicker.element,
    minorPicker.element,
    paceControl,
    select(
      "First term",
      START_YEARS.flatMap((year) => SEASONS.map((s) => `${s.label} ${year}`)),
      Math.max(0, START_YEARS.indexOf(state.start.year)) * SEASONS.length + Math.max(0, SEASONS.findIndex((s) => s.value === state.start.season)),
      (index) => {
        const year = START_YEARS[Math.floor(index / SEASONS.length)];
        const season = SEASONS[index % SEASONS.length].value;
        state.start = { year, season };
        draw();
      }
    )
  );
  minorPicker.element.classList.add("minor-control");
  const suggestCell = element("div", "control suggest-control");
  minorPicker.element.after(suggestCell);
  let suggestOpen = false;
  const drawMinorOffer = (panel) => {
    suggestCell.textContent = "";
    const taken = new Set(panel.chosen.map((m) => m.id));
    if (panel.readOnly || !panel.ranked.some((m) => !taken.has(m.id))) return;
    const offer = minorOffer(panel);
    offer.open = suggestOpen;
    offer.addEventListener("toggle", () => {
      suggestOpen = offer.open;
    });
    suggestCell.append(offer);
  };
  for (const control of controls.querySelectorAll(".control")) {
    if (control.querySelector(".control-label")?.textContent === "First term") control.classList.add("start-control");
  }
  const facets = loaded.index.flatMap((entry) => {
    const tree = loaded.trees.get(entry.id);
    if (tree === void 0) return [];
    return [{
      label: entry.title,
      college: entry.college,
      department: entry.department,
      degree: entry.title,
      courses: [...new Set(coursesUnder(tree.requirements).map((code) => loaded.catalog.canonical(code)))]
    }];
  });
  const about = aboutYou(state, loaded.catalog, facets, () => draw(), remember, {
    find: (passed) => closestPrograms(loaded.index, loaded.trees, passed, loaded.catalog, 5),
    load: () => Math.min(REGISTRATION_MAX, Math.max(1, Math.round(state.cap ?? DEFAULT_LOAD))),
    choose: (id) => {
      const at = choices.findIndex((c) => c.track === void 0 && (c.catalog?.id ?? c.program?.id) === id);
      if (at < 0) return;
      state.programIndex = at;
      draw();
      controls.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  });
  root.insertBefore(about.element, controls);
  document.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
    const target = event.target;
    if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
    if (sharedRoute === null) {
      if (editing === null && !canUndo() && !canRedo()) return;
      event.preventDefault();
      if (event.shiftKey ? redoLast() : undoLast()) draw();
      return;
    }
    const live2 = shared?.session ?? null;
    if (live2 === null) return;
    event.preventDefault();
    if (event.shiftKey ? live2.redo() : live2.undo()) drawShared(sharedRoute.fragment, sharedRoute.opened);
  });
  window.addEventListener("hashchange", () => {
    void route();
  });
  await route();
}
var parseStart = (key) => parseTerm(key);
function seasonsOf(plan) {
  const seen = new Set(plan.terms.map((t) => t.term.season));
  return seen.size > 0 ? [...seen] : ["F", "P", "S"];
}
function codesIn(text, catalog) {
  return parseCompleted(text, catalog).completed.map((entry) => entry.code);
}
function aboutYou(state, catalog, facets, draw, remember, nearby) {
  const panel = element("section", "about");
  const summary = element("h2", "about-head", "Courses passed, placements and standing");
  panel.append(summary);
  const body = element("div", "about-body");
  const field = element("div", "about-field");
  const picker = new CoursePicker(catalog, {
    facets,
    chosen: () => codesIn(state.completedText, catalog).map((code) => ({ code })),
    onAdd: (code) => {
      remember(() => {
        const passed = codesIn(state.completedText, catalog);
        if (!passed.includes(code)) state.completedText = [...passed, code].join("\n");
      });
      draw();
    },
    onRemove: (code) => {
      remember(() => {
        state.completedText = codesIn(state.completedText, catalog).filter((c) => c !== code).join("\n");
      });
      draw();
    }
  });
  field.append(labelFor2("Courses you've passed", picker.field, INFO.passed), picker.element);
  const clear = element("button", "btn btn-secondary btn-sm btn-quiet clear", "Clear this list");
  clear.type = "button";
  const confirm = element("span", "confirm-row");
  confirm.hidden = true;
  const question = element("span", "confirm-q");
  const yes = element("button", "btn btn-secondary btn-sm danger", "Yes, clear it");
  yes.type = "button";
  const keep = element("button", "btn btn-secondary btn-sm btn-quiet", "Keep it");
  keep.type = "button";
  confirm.append(question, yes, keep);
  const ask = (open) => {
    confirm.hidden = !open;
    clear.hidden = open;
    (open ? yes : clear).focus();
  };
  clear.addEventListener("click", () => {
    const n = codesIn(state.completedText, catalog).length + codesIn(state.inProgressText, catalog).length;
    if (n === 0) return;
    question.textContent = `Clear all ${n} ${n === 1 ? "course" : "courses"}? Undo brings them back.`;
    ask(true);
  });
  keep.addEventListener("click", () => ask(false));
  yes.addEventListener("click", () => {
    remember(() => {
      state.completedText = "";
      state.inProgressText = "";
    });
    picker.refresh();
    ask(false);
    draw();
  });
  field.append(clear, confirm);
  body.append(field);
  const side = element("div", "about-side");
  const mathPlacement = placementTargets(catalog, "math", state.mathPlacement);
  const englishPlacement = placementTargets(catalog, "english", state.englishPlacement);
  const placements = element("div", "about-row");
  const mathControl = select(
    "Math placement",
    mathPlacement.map((code) => placementLabel(code, catalog)),
    mathPlacement.indexOf(state.mathPlacement),
    (index) => {
      state.mathPlacement = mathPlacement[index] ?? "";
      draw();
    },
    INFO.math
  );
  const englishControl = select(
    "English placement",
    englishPlacement.map((code) => placementLabel(code, catalog)),
    englishPlacement.indexOf(state.englishPlacement),
    (index) => {
      state.englishPlacement = englishPlacement[index] ?? "";
      draw();
    },
    INFO.english
  );
  placements.append(mathControl, englishControl);
  side.append(placements);
  const standing = element("div", "about-row");
  const yesNo = ["Not yet, or not sure", "Yes"];
  const standingControl = select(
    "University Advanced Standing",
    yesNo,
    state.advancedStanding ? 1 : 0,
    (index) => {
      state.advancedStanding = index === 1;
      draw();
    },
    INFO.standing
  );
  const admittedControl = select(
    "Admitted to your major",
    yesNo,
    state.matriculated ? 1 : 0,
    (index) => {
      state.matriculated = index === 1;
      draw();
    },
    INFO.admitted
  );
  standing.append(standingControl, admittedControl);
  side.append(standing);
  const closest = element("section", "closest");
  const closestSummary = element("div", "closest-head");
  closestSummary.append(
    element("span", void 0, "Programs you are closest to finishing"),
    infoMark(
      "Programs you are closest to finishing",
      // Short, and still honest about what the count leaves out (the sponsor
      // found the longer version awkward).
      "Ranked by the credits each program still needs after the courses you have passed. Prerequisites, placements and graduation rules are not counted, so the real distance can be longer."
    ).element
  );
  closest.append(closestSummary);
  const closestBody = element("div", "closest-body");
  closest.append(closestBody);
  const kinds = { certificate: "Certificates", associate: "Associate degrees", bachelor: "Bachelor's degrees" };
  let drawnFor;
  const drawClosest = () => {
    const passed = codesIn(state.completedText, catalog);
    const load2 = Math.max(1, nearby.load());
    const key = `${load2}|${passed.join(",")}`;
    if (key === drawnFor) return;
    drawnFor = key;
    closestBody.textContent = "";
    if (passed.length === 0) {
      closestBody.append(element("p", "muted", "Add the courses you have passed, and the programs nearest to done from them are listed here."));
      return;
    }
    const found2 = nearby.find(passed);
    for (const kind of ["certificate", "associate", "bachelor"]) {
      const rows = found2.filter((c) => c.kind === kind);
      if (rows.length === 0) continue;
      closestBody.append(element("p", "eyebrow-label closest-kind", kinds[kind]));
      const list = element("ul", "closest-list");
      for (const row2 of rows) {
        const item = element("li");
        const needed = row2.needed ?? 0;
        const terms = Math.ceil(needed / load2);
        item.append(
          element("b", void 0, row2.title),
          element(
            "span",
            "closest-need",
            needed === 0 ? "every credit its table counts is in your record" : `${needed} of ${row2.required} cr still needed \xB7 about ${terms} ${terms === 1 ? "term" : "terms"}`
          )
        );
        const pick = element("button", "btn btn-secondary btn-sm", "Select");
        pick.type = "button";
        pick.addEventListener("click", () => nearby.choose(row2.id));
        item.append(pick);
        list.append(item);
      }
      closestBody.append(list);
    }
  };
  side.append(closest);
  body.append(side);
  panel.append(body);
  const set = (control, index) => {
    const field2 = control.querySelector("select");
    if (field2 !== null) field2.value = String(Math.max(0, index));
  };
  const refresh = () => {
    drawClosest();
    picker.refresh();
    set(mathControl, mathPlacement.indexOf(state.mathPlacement));
    set(englishControl, englishPlacement.indexOf(state.englishPlacement));
    set(standingControl, state.advancedStanding ? 1 : 0);
    set(admittedControl, state.matriculated ? 1 : 0);
  };
  return { element: panel, refresh };
}
function placeholdersFor(program) {
  if (program === void 0) return [];
  const seen = /* @__PURE__ */ new Map();
  for (const term2 of program.grid.terms) {
    for (const item of term2.items) {
      if (item.kind !== "slot") continue;
      const label = item.label ?? item.slot;
      const key = `${item.slot}|${label}|${JSON.stringify(item.credits)}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        slot: item.slot,
        label,
        credits: item.credits,
        ...item.options?.length ? { options: [...item.options] } : {}
      });
    }
  }
  return [...seen.values()];
}
function additionsInput(added, notes, catalog) {
  if (added.length === 0 && notes.length === 0) return {};
  const programs = [...new Set(added.map((a) => a.program))];
  return {
    additions: programs.map((program) => ({
      program,
      items: added.filter((a) => a.program === program).map((a) => ({
        ...a.code !== void 0 ? { code: a.code } : {},
        ...a.code !== void 0 && catalog.get(a.code)?.title ? { title: catalog.get(a.code).title } : {},
        label: a.label,
        term: termLabel(a.term),
        ...a.filled !== void 0 ? { filled: a.filled } : {}
      }))
    })),
    additionNotes: notes
  };
}
function blankResult(program, start, context, loaded) {
  const plan = {
    id: planIdFor(program.id, program.grid.catalogYear, start, context),
    programId: program.id,
    catalogYear: program.grid.catalogYear,
    start,
    terms: termSequence(start, 4, program.grid.seasons).map((term2) => ({ term: term2, items: [] })),
    problems: [],
    appliedCredit: [],
    meta: {
      dataVersion: loaded.dataVersion,
      builtAt: loaded.builtAt,
      engineVersion: "0.1.0",
      source: "blank"
    }
  };
  return { plan, changed: false, termsSaved: 0, maxCreditsPerTerm: DEFAULT_MAX_CREDITS, remainingCredits: 0 };
}
function costsBelow(plan, view, loaded) {
  if (loaded.tuition === void 0 && loaded.registration === void 0) return [];
  const earned = new Set((view.context.completed ?? []).map((entry) => loaded.catalog.canonical(entry.code)));
  for (const planTerm of plan.terms) {
    for (const item of planTerm.items) {
      if (item.kind === "course" && item.done === true) earned.add(loaded.catalog.canonical(item.code));
    }
  }
  let earnedCredits = 0;
  for (const code of earned) {
    const course = loaded.catalog.get(code);
    if (course) earnedCredits += creditsNominal(course.credits);
  }
  const section = costsSection({
    plan,
    ...loaded.tuition ? { tuition: loaded.tuition } : {},
    ...loaded.registration ? { registration: loaded.registration } : {},
    earnedCredits,
    creditsOf: (at) => {
      const planTerm = plan.terms.find((t) => t.term.year === at.year && t.term.season === at.season);
      return planTerm === void 0 ? 0 : termCredits(planTerm);
    }
  });
  return section === void 0 ? [] : [section];
}
function withOutcomes(summary, view, loaded) {
  const id = view.program?.id;
  if (id === void 0) return summary;
  const fold2 = outcomesFold(loaded.outcomes?.programs[id]);
  const name = summary.querySelector(".pgm h2");
  if (fold2 !== void 0) {
    if (name !== null) name.after(fold2);
    else summary.append(fold2);
  }
  return summary;
}
var ready = main();
export {
  ready
};

