/**
 * Authored formative practice bank. Mirrors api/config/curriculum/practice_bank.yml
 * (keep in sync by hand). SYNTHETIC: Teaching & Learning must review it.
 */
import type { ConceptId, Stage } from '../types';

export interface BankItem {
  id: string;
  concept: ConceptId;
  from: Stage;
  to: Stage;
  title: string;
  scenario: string;
  task: string;
  tip: string;
}

export const PRACTICE_BANK: BankItem[] = [
  {
    id: 'pb-c1-01',
    concept: 'c1',
    from: 0,
    to: 1,
    title: 'Break down a bake sale flyer',
    scenario: 'The student council is making a flyer for a bake sale.',
    task: 'List three parts the flyer needs, one per line.',
    tip: 'Think about what someone glancing at the flyer needs to know first.',
  },
  {
    id: 'pb-c1-12',
    concept: 'c1',
    from: 1,
    to: 2,
    title: 'Plan a library hours page',
    scenario: 'The school library wants a simple page showing its hours and how to reserve a study room.',
    task: 'List the parts of the page, and next to each one say what it does for a visitor.',
    tip: 'If two parts do the same job, merge them.',
  },
  {
    id: 'pb-c1-23',
    concept: 'c1',
    from: 2,
    to: 3,
    title: 'Order the build for a lost-and-found page',
    scenario: 'The front office wants a lost-and-found page with a list of items, a photo of each, and a claim form.',
    task: 'Put the parts in the order you would build them and explain which parts depend on others.',
    tip: 'Ask yourself: what has to exist before the claim form can work?',
  },
  {
    id: 'pb-c2-01',
    concept: 'c2',
    from: 0,
    to: 1,
    title: 'Check an AI-made event list',
    scenario: 'An AI made a list of upcoming games for the soccer team, but two games show the same date and time.',
    task: 'Describe one thing that looks wrong in this output.',
    tip: 'Read it like a fan trying to show up on the right day.',
  },
  {
    id: 'pb-c2-12',
    concept: 'c2',
    from: 1,
    to: 2,
    title: 'Compare a menu page to the request',
    scenario:
      'The cafeteria asked an AI for a lunch menu page that shows prices and marks vegetarian options. The AI page shows dishes and prices only.',
    task: 'Compare the page to what was asked for. Name the specific problem and the fix you would ask for.',
    tip: 'Go through the request one requirement at a time.',
  },
  {
    id: 'pb-c2-23',
    concept: 'c2',
    from: 2,
    to: 3,
    title: 'Test a carpool sign-up before using it',
    scenario: "An AI built a carpool sign-up form for the band trip. You haven't tried it yet.",
    task: 'Write three tests you would run before trusting the form, including at least one unusual case.',
    tip: 'What could a rushed or confused user type in?',
  },
  {
    id: 'pb-c3-01',
    concept: 'c3',
    from: 0,
    to: 1,
    title: 'Ask for a recycling poster',
    scenario: 'The environment club wants an AI to design a poster about recycling at school.',
    task: 'Write the prompt you would send, stating the goal of the poster.',
    tip: 'Say what the poster should make people do.',
  },
  {
    id: 'pb-c3-12',
    concept: 'c3',
    from: 1,
    to: 2,
    title: 'Tighten a prompt for a tutoring schedule',
    scenario:
      "A peer-tutoring group wants an AI to make a weekly schedule table. Their first prompt was 'make a tutoring schedule'.",
    task: 'Rewrite the prompt with a goal, a constraint, and something the AI should do if a slot is empty.',
    tip: 'A constraint limits how the AI does it, like format, size or colors.',
  },
  {
    id: 'pb-c3-23',
    concept: 'c3',
    from: 2,
    to: 3,
    title: 'Plan a conversation for a club logo',
    scenario: 'The chess club wants an AI to help design a logo, and they expect a few rounds of changes.',
    task: 'Plan three prompts in order and explain how each one moves the logo closer to what the club wants.',
    tip: "Decide what to lock in first so later changes don't undo it.",
  },
  {
    id: 'pb-c4-01',
    concept: 'c4',
    from: 0,
    to: 1,
    title: 'Who could miss the announcement?',
    scenario: 'The school posts club announcements only as images on a website.',
    task: 'Name one group of students who could miss these announcements, and say why.',
    tip: 'Think about how different people read or reach a website.',
  },
  {
    id: 'pb-c4-12',
    concept: 'c4',
    from: 1,
    to: 2,
    title: 'Make a sign-up sheet work for more people',
    scenario: "The volunteer club's sign-up page uses small light-gray text and only works on a laptop.",
    task: 'Name who this leaves out and one specific change that would help them.',
    tip: 'Pick one group and one concrete fix.',
  },
  {
    id: 'pb-c4-23',
    concept: 'c4',
    from: 2,
    to: 3,
    title: 'Weigh a video on the welcome page',
    scenario: 'Student government wants an autoplay welcome video at the top of the school club directory.',
    task: 'Decide whether to keep the video and explain what you gain and what you give up.',
    tip: 'Name both sides before you decide.',
  },
];
