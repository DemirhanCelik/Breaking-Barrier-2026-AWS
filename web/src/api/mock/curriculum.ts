/**
 * SYNTHETIC, ILLUSTRATIVE curriculum for the "AI-Generated Design" unit.
 *
 * The companion doc (stage ladders + trajectory-to-level map) was not available,
 * so concepts, descriptors, levels, and probes here are placeholders written for
 * the hackathon demo. Teaching & Learning must replace and approve them (FR7).
 * CSTA codes are illustrative mappings, not ratified alignments.
 *
 * Scenario: the school's Robotics Club needs a webpage (header, events list,
 * sign-up form). Students direct an AI to design and build it.
 */
import type { ConceptId, Stage } from '../types';

export interface Concept {
  id: ConceptId;
  name: string;
  csta: string;
  order: number;
  descriptors: Record<Stage, string>;
}

/** A deterministic probe (design §7 step 2). */
export interface Check {
  id: string;
  /** Teacher-facing evidence label. */
  label: string;
  /** Student-facing formative coaching when the check is not met. */
  hint: string;
  test: (text: string) => boolean;
}

export interface Transition {
  concept: ConceptId;
  from: Stage;
  to: Stage;
  checks: string[];
}

export interface Level {
  id: string;
  code: string;
  kind: 'task' | 'project';
  title: string;
  intro: string;
  instructions: string[];
  aiOutput?: string;
  responseLabel: string;
  responsePlaceholder: string;
  transitions: Transition[];
}

export const CLASS_INFO = {
  id: 'k-period3',
  name: 'Period 3 - AI Foundations (demo)',
  bar: 2 as Stage,
};

export const CONCEPTS: Concept[] = [
  {
    id: 'c1',
    name: 'Decompose a design',
    csta: '3A-AP-17 (illustrative)',
    order: 1,
    descriptors: {
      0: 'Does not yet break the design into parts.',
      1: 'Lists some parts of the design, but parts overlap or miss key pieces.',
      2: 'Breaks the design into distinct parts and says what each part does.',
      3: 'Orders the parts into a build plan and explains the dependencies between them.',
    },
  },
  {
    id: 'c2',
    name: 'Test and refine AI output',
    csta: '3A-AP-21 (illustrative)',
    order: 2,
    descriptors: {
      0: 'Accepts AI output without checking it.',
      1: 'Notices a problem in AI output when it is obvious.',
      2: 'Checks AI output against stated requirements and names a specific problem and fix.',
      3: 'Designs tests, including edge cases, before accepting AI output.',
    },
  },
  {
    id: 'c3',
    name: 'AI collaboration',
    csta: '3A-AP-16 (illustrative)',
    order: 3,
    descriptors: {
      0: 'Sends the AI a vague request and accepts the first answer.',
      1: 'States a goal in the prompt but leaves out constraints or edge cases.',
      2: 'Names a goal, a constraint, and an edge case; compares AI output to intent and revises with a targeted change.',
      3: 'Plans a multi-step exchange with the AI and explains why each revision moves the output closer to intent.',
    },
  },
  {
    id: 'c4',
    name: 'Responsible design',
    csta: '3A-IC-24 (illustrative)',
    order: 4,
    descriptors: {
      0: 'Does not consider who the design affects.',
      1: 'Names one group of people the design could leave out.',
      2: 'Identifies an accessibility or fairness issue and proposes a concrete change.',
      3: 'Weighs trade-offs between design choices and justifies a decision for different users.',
    },
  },
];

export const REQUIRED_CONCEPTS: ConceptId[] = ['c1', 'c2', 'c3', 'c4'];

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const rx = (re: RegExp) => (t: string) => re.test(t);
const listItems = (t: string) =>
  t.split('\n').filter((l) => /^\s*([-*•]|\d+[.)])\s+\S/.test(l)).length;

export const CHECKS: Record<string, Check> = {
  length20: {
    id: 'length20',
    label: 'Response has enough detail (20+ words)',
    hint: 'Say a bit more. Walk through your thinking in a few sentences.',
    test: (t) => words(t) >= 20,
  },
  parts3: {
    id: 'parts3',
    label: 'Names at least three parts',
    hint: 'Try listing each part of the page on its own line, starting with a dash.',
    test: (t) => listItems(t) >= 3 || t.split(',').length >= 4,
  },
  partPurpose: {
    id: 'partPurpose',
    label: 'Says what each part does',
    hint: 'For each part, add what it does for a visitor, for example "events list - shows the next meetups".',
    test: rx(/\b(shows?|lets?|displays?|holds?|handles?|contains?|so (that|people|visitors)|for (visitors|members|people))\b/i),
  },
  order: {
    id: 'order',
    label: 'Orders the parts and names a dependency',
    hint: 'Which part has to exist before another one can work? Put your parts in build order and say why.',
    test: rx(/\b(first|then|before|after|depends on|needs .* (first|before))\b/i),
  },
  problem: {
    id: 'problem',
    label: 'Names a specific problem in the AI output',
    hint: 'Point to one exact thing in the AI output that does not match what the club asked for.',
    test: rx(/\b(bug|wrong|error|missing|broken|doesn'?t|does not|fails?|incorrect|forgot|no way to)\b/i),
  },
  requirement: {
    id: 'requirement',
    label: 'Compares output to the stated requirements',
    hint: 'Look back at what the club asked for. Which requirement does the output miss?',
    test: rx(/\b(asked|required|requirement|supposed to|should|club wants|needs? to|expected)\b/i),
  },
  fix: {
    id: 'fix',
    label: 'Proposes a concrete fix',
    hint: 'Now say what you would change to fix it.',
    test: rx(/\b(fix|change|add|remove|replace|instead|update|adjust)\b/i),
  },
  testCase: {
    id: 'testCase',
    label: 'Writes a test with an input and expected result',
    hint: 'Write a test like "If I enter ___, the page should ___".',
    test: rx(/\b(if i|when i|test|try|enter|input|type)\b[\s\S]*\b(should|expect|shows?|see)\b/i),
  },
  edgeCase: {
    id: 'edgeCase',
    label: 'Covers an edge case',
    hint: 'What happens in an unusual situation, like an empty list, a blank field, or a really long name?',
    test: rx(/\b(empty|blank|no events|nothing|too long|invalid|missing|zero|edge case|duplicate)\b/i),
  },
  goal: {
    id: 'goal',
    label: 'Prompt states a goal',
    hint: 'Start your prompt by telling the AI what you want it to make and why.',
    test: rx(/\b(make|create|build|design|write|generate|update|add|change|improve|turn|i want|i need|goal|so that)\b/i),
  },
  constraint: {
    id: 'constraint',
    label: 'Prompt sets a constraint',
    hint: 'Add a limit the AI has to respect, such as "use only our two school colors" or "no more than three sections".',
    test: rx(/\b(must|only|no more than|at most|under|limit|without|don'?t|do not|exactly|max(imum)?)\b/i),
  },
  promptEdge: {
    id: 'promptEdge',
    label: 'Prompt names an edge case',
    hint: 'Tell the AI what to do in an unusual case, for example "if there are no events, show a friendly message".',
    test: rx(/\b(if|when|in case|unless)\b[\s\S]*\b(empty|blank|no |none|missing|too long|invalid|zero)/i),
  },
  targetedRevision: {
    id: 'targetedRevision',
    label: 'Revises with a targeted change',
    hint: 'Ask the AI to change one specific thing and keep the rest the same.',
    test: rx(/\b(change only|just change|only change|keep (the )?rest|keep everything|instead of|replace .* with|update the)\b/i),
  },
  compareIntent: {
    id: 'compareIntent',
    label: 'Compares AI output to intent',
    hint: 'Say what you meant, then say how the AI output differs from that.',
    test: rx(/\b(i (meant|wanted|asked)|my plan|intended|but (it|the ai)|instead it|compared to|differs?)\b/i),
  },
  multiStep: {
    id: 'multiStep',
    label: 'Plans a multi-step exchange and explains each step',
    hint: 'Plan two or three prompts in a row and say why each one gets closer to what you want.',
    test: (t) =>
      /\b(step|prompt) ?(1|one)\b|\bfirst\b/i.test(t) &&
      /\b(step|prompt) ?(2|two)\b|\bthen\b|\bnext\b/i.test(t) &&
      /\b(because|so that|this gets|closer)\b/i.test(t),
  },
  group: {
    id: 'group',
    label: 'Names a group of people who could be left out',
    hint: 'Think about who might have trouble using the page: people using screen readers, phones, or a different language.',
    test: rx(/\b(screen ?readers?|blind|colou?r ?blind|deaf|phones?|mobile|language|english learners?|disabilit\w*|wheelchair|older|low vision|keyboard|dyslexi\w*)\b/i),
  },
  concreteChange: {
    id: 'concreteChange',
    label: 'Proposes a concrete accessibility or fairness change',
    hint: 'Name one change you would make to the page so that group can use it.',
    test: rx(/\b(alt text|contrast|captions?|labels?|font size|bigger|larger|translat\w*|keyboard|aria|headings?|plain language)\b/i),
  },
  tradeoff: {
    id: 'tradeoff',
    label: 'Weighs a trade-off and justifies a decision',
    hint: 'Name something you gain and something you give up with your choice, then say why it is still the right call.',
    test: rx(/\b(trade-?off|on the other hand|however|downside|cost|versus|vs\.?|but it also)\b/i),
  },
};

export const LEVELS: Level[] = [
  {
    id: 'l1',
    code: 'L1',
    kind: 'task',
    title: 'Sketch the parts of the club page',
    intro: 'The Robotics Club wants a webpage. Before asking an AI to build anything, figure out what the page needs.',
    instructions: [
      'List the parts the page needs, one per line.',
      'Next to each part, say what it does for a visitor.',
    ],
    responseLabel: 'Your list of page parts',
    responsePlaceholder: '- Header - shows the club name and logo\n- ...',
    transitions: [{ concept: 'c1', from: 0, to: 1, checks: ['parts3'] }],
  },
  {
    id: 'l2',
    code: 'L2',
    kind: 'task',
    title: 'Find what the AI got wrong on a sign-up form',
    intro: 'The club asked for a sign-up form that collects a name and an email and confirms the sign-up. Here is what an AI made.',
    instructions: ['Read the AI output.', 'Describe one thing that is wrong or missing.'],
    aiOutput:
      '<form>\n  <input placeholder="Your name">\n  <button>Sign up</button>\n</form>\n<!-- On submit: nothing happens -->',
    responseLabel: 'What is wrong or missing?',
    responsePlaceholder: 'The form is missing...',
    transitions: [{ concept: 'c2', from: 0, to: 1, checks: ['problem'] }],
  },
  {
    id: 'l3',
    code: 'L3',
    kind: 'task',
    title: 'Write your first prompt for the page header',
    intro: 'Time to talk to the AI. You need a header for the club page.',
    instructions: ['Write the prompt you would send to the AI to make the header.'],
    responseLabel: 'Your prompt',
    responsePlaceholder: 'Make a header for...',
    transitions: [{ concept: 'c3', from: 0, to: 1, checks: ['goal'] }],
  },
  {
    id: 'l4',
    code: 'L4',
    kind: 'task',
    title: 'Spot who the page could leave out',
    intro: 'A good page works for every student in the school, not only the people who built it.',
    instructions: ['Name a group of people who might have trouble using the club page, and say why.'],
    responseLabel: 'Who could be left out, and why?',
    responsePlaceholder: 'Students who...',
    transitions: [{ concept: 'c4', from: 0, to: 1, checks: ['group'] }],
  },
  {
    id: 'l5',
    code: 'L5',
    kind: 'task',
    title: 'Break the page into buildable pieces',
    intro: 'An AI does better with one clear piece at a time. Turn your sketch into pieces you could ask for separately.',
    instructions: [
      'List at least three pieces, one per line.',
      'For each piece, say what it shows or lets a visitor do.',
    ],
    responseLabel: 'Your buildable pieces',
    responsePlaceholder: '- Events list - shows...\n- ...',
    transitions: [{ concept: 'c1', from: 1, to: 2, checks: ['parts3', 'partPurpose'] }],
  },
  {
    id: 'l6',
    code: 'L6',
    kind: 'task',
    title: 'Give the AI a goal and a limit',
    intro: 'The club wants an events list. Vague prompts get vague results.',
    instructions: [
      'Write a prompt for the events list that says what you want.',
      'Add at least one limit the AI must follow.',
      'Tell the AI what to do in one unusual case.',
    ],
    responseLabel: 'Your prompt',
    responsePlaceholder: 'Create an events list that...',
    transitions: [{ concept: 'c3', from: 1, to: 2, checks: ['goal', 'constraint', 'promptEdge'] }],
  },
  {
    id: 'l7',
    code: 'L7',
    kind: 'task',
    title: 'Make a test checklist for the events list',
    intro: 'The club asked for an events list that shows the date, time, and room for each meetup, newest first. The AI says it is done.',
    instructions: [
      'Compare the AI output with what the club asked for.',
      'Name one specific problem and how you would fix it.',
    ],
    aiOutput:
      'Events\n- Build night - Room 204\n- Competition prep - Room 110\n- Kickoff - Room 204\n(sorted oldest first)',
    responseLabel: 'Problem and fix',
    responsePlaceholder: 'The club asked for... but the list...',
    transitions: [{ concept: 'c2', from: 1, to: 2, checks: ['requirement', 'problem', 'fix'] }],
  },
  {
    id: 'l8',
    code: 'L8',
    kind: 'task',
    title: 'Catch the edge case before the AI does',
    intro: 'The sign-up form now works for normal input. What about unusual input?',
    instructions: [
      'Write a prompt asking the AI to improve the form. Include a goal, a limit, and an edge case.',
      'Add one test you would run afterward, with what you expect to see.',
    ],
    responseLabel: 'Your prompt and test',
    responsePlaceholder: 'Update the sign-up form so that... If I enter..., the page should...',
    transitions: [
      { concept: 'c3', from: 1, to: 2, checks: ['goal', 'constraint', 'promptEdge'] },
      { concept: 'c2', from: 1, to: 2, checks: ['testCase', 'edgeCase', 'fix'] },
    ],
  },
  {
    id: 'l9',
    code: 'L9',
    kind: 'task',
    title: "Compare the AI's page to your plan",
    intro: 'You planned a header, an events list, and a sign-up form. The AI built a page with a big photo gallery and no sign-up form.',
    aiOutput: '[Header: Robotics Club]\n[Photo gallery: 24 photos]\n[Events list]\n[Footer]',
    instructions: [
      'Say how the AI page differs from your plan.',
      'Break the missing part into pieces and say what each piece does.',
      'Write a follow-up prompt that changes only what needs to change.',
    ],
    responseLabel: 'Your comparison and follow-up prompt',
    responsePlaceholder: 'I wanted... but the AI... Pieces: - ... Follow-up: Keep the rest and...',
    transitions: [
      { concept: 'c3', from: 1, to: 2, checks: ['compareIntent', 'targetedRevision'] },
      { concept: 'c1', from: 1, to: 2, checks: ['parts3', 'partPurpose'] },
    ],
  },
  {
    id: 'l10',
    code: 'L10',
    kind: 'task',
    title: 'Make the page work for everyone',
    intro: 'The AI used light gray text on a white background and photos with no descriptions.',
    instructions: [
      'Name who would have trouble with this page.',
      'Propose one concrete change to fix it.',
    ],
    responseLabel: 'Who and what to change',
    responsePlaceholder: 'Students who use... would... I would add...',
    transitions: [{ concept: 'c4', from: 1, to: 2, checks: ['group', 'concreteChange'] }],
  },
  {
    id: 'l11',
    code: 'L11',
    kind: 'task',
    title: 'Fix one thing without breaking the rest',
    intro: 'The page is almost right, but the sign-up button says "Submit query" and the club wants "Join the club".',
    instructions: [
      'Say what you intended and how the AI output differs.',
      'Write a revision prompt that changes only that one thing.',
      'Say how you would check the fix worked.',
    ],
    responseLabel: 'Your revision prompt and check',
    responsePlaceholder: 'I wanted... but it... Prompt: Change only... Check: If I...',
    transitions: [
      { concept: 'c3', from: 1, to: 2, checks: ['compareIntent', 'targetedRevision'] },
      { concept: 'c2', from: 1, to: 2, checks: ['requirement', 'problem', 'fix'] },
    ],
  },
  {
    id: 'l12',
    code: 'L12',
    kind: 'task',
    title: 'Plan the feature the club asked for next',
    intro: 'The club now wants members to RSVP to each event.',
    instructions: [
      'Break the RSVP feature into pieces.',
      'Put them in build order and say which piece depends on which.',
    ],
    responseLabel: 'Your build plan',
    responsePlaceholder: '- First, ... because...\n- Then ...',
    transitions: [{ concept: 'c1', from: 2, to: 3, checks: ['parts3', 'order', 'partPurpose'] }],
  },
  {
    id: 'l13',
    code: 'L13',
    kind: 'task',
    title: "Stress-test the AI's RSVP logic",
    intro: 'The AI wrote RSVP logic. Before you accept it, design tests that could break it.',
    aiOutput:
      'function rsvp(eventId, name) {\n  attendees[eventId].push(name);\n  return "You are in!";\n}',
    instructions: [
      'Write at least two tests, each with an input and an expected result.',
      'Include at least one edge case.',
    ],
    responseLabel: 'Your tests',
    responsePlaceholder: 'Test 1: If I enter..., it should...\nTest 2: ...',
    transitions: [{ concept: 'c2', from: 2, to: 3, checks: ['testCase', 'edgeCase', 'length20'] }],
  },
  {
    id: 'l14',
    code: 'L14',
    kind: 'task',
    title: 'Coach the AI through a redesign',
    intro: 'The club wants a fresh look for the whole page before the competition.',
    instructions: [
      'Plan two or three prompts you would send in order.',
      'For each prompt, explain why it gets closer to what the club wants.',
    ],
    responseLabel: 'Your prompt plan',
    responsePlaceholder: 'Prompt 1: ... because... Prompt 2: ... so that...',
    transitions: [{ concept: 'c3', from: 2, to: 3, checks: ['multiStep', 'constraint'] }],
  },
  {
    id: 'l15',
    code: 'L15',
    kind: 'task',
    title: 'Write a design note on a hard choice',
    intro: 'The club wants a background video on the homepage. Some students load the page on slow phones.',
    instructions: [
      'Decide whether to keep the video.',
      'Explain what you gain and give up, and who each choice affects.',
    ],
    responseLabel: 'Your design note',
    responsePlaceholder: 'I would... The trade-off is...',
    transitions: [{ concept: 'c4', from: 2, to: 3, checks: ['tradeoff', 'group', 'length20'] }],
  },
  {
    id: 'p1',
    code: 'P1',
    kind: 'project',
    title: 'Build your own club page with AI',
    intro: 'Pick any club, real or made up, and work with an AI to build its page. Use everything you practiced.',
    instructions: [
      'Plan the pieces of the page.',
      'Write the prompts you send, and say how you checked and revised the output.',
      'Note one change you made so more people can use the page.',
    ],
    responseLabel: 'Your project log',
    responsePlaceholder: 'Club: ...\nPlan: ...\nPrompt 1: ...\nWhat I checked and changed: ...',
    transitions: [],
  },
];

export const PROJECT_LEVEL_ID = 'p1';

/** The non-adaptive path (FR10): a fixed, working sequence through authored levels. */
export const FALLBACK_SEQUENCE = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l10', 'l11', 'p1'];


export const conceptById = (id: ConceptId) => CONCEPTS.find((c) => c.id === id)!;
export const levelById = (id: string) => LEVELS.find((l) => l.id === id)!;
