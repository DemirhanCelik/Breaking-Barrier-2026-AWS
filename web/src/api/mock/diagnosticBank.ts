/**
 * Diagnostic question bank. Mirrors the `diagnostic.bank` in
 * api/config/curriculum/ai_generated_design.yml (keep in sync by hand); see that file for
 * the source document and the concept mapping. One question per concept per stage is
 * served to each student; placement climbs the stages until the first miss.
 */
import type { ConceptId, Stage } from '../types';

export interface DiagnosticQuestion {
  id: string;
  concept: ConceptId;
  stage: Stage;
  prompt: string;
  figure?: string;
  options: { id: string; text: string }[];
  answer: string;
}

export const DIAGNOSTIC_INTRO =
  'Before you start, answer a few quick questions about designing websites with AI. This just helps us pick where you start. It is not a test, and nothing here is graded.';

export const DIAGNOSTIC_BANK: DiagnosticQuestion[] = [
  {
    id: 'c1-1a',
    concept: 'c1',
    stage: 1,
    prompt: 'Look at this site map. Where would a page about beginner yoga classes most logically belong?',
    figure: 'Home\n ├─ Activities\n ├─ About\n └─ Contact',
    options: [
      { id: 'a', text: 'Under Contact' },
      { id: 'b', text: 'Outside the website structure' },
      { id: 'c', text: 'Under Activities' },
      { id: 'd', text: 'Under About' },
    ],
    answer: 'c',
  },
  {
    id: 'c1-1b',
    concept: 'c1',
    stage: 1,
    prompt: 'You are planning a class schedule page. What should go in the box labeled "main content"?',
    options: [
      { id: 'a', text: "The website's file storage location" },
      { id: 'b', text: 'Information about the available classes and their schedules' },
      { id: 'c', text: 'Only the final background colors' },
      { id: 'd', text: "The web hosting provider's name" },
    ],
    answer: 'b',
  },
  {
    id: 'c1-1c',
    concept: 'c1',
    stage: 1,
    prompt:
      'A student makes a site map with the pages Home, Classes, Registration, and Contact, but the pages are not connected. What basic improvement would make the site map more useful?',
    options: [
      { id: 'a', text: 'Connect the pages to show how a visitor moves between them, starting from Home' },
      { id: 'b', text: 'Give each page box a different color' },
      { id: 'c', text: 'Remove the Contact page so there are fewer pages' },
      { id: 'd', text: 'Write the page names in a bigger font' },
    ],
    answer: 'a',
  },
  {
    id: 'c1-2a',
    concept: 'c1',
    stage: 2,
    prompt:
      'You are planning a website for a community center. Visitors need to discover activities, schedules, and class details like instructors, and register for classes. Which site structure shows the best decomposition and organization?',
    options: [
      {
        id: 'a',
        text: 'Homepage → Activities → Individual Class Pages → Registration, plus instructor and contact pages, with consistent navigation',
      },
      {
        id: 'b',
        text: 'One homepage with all the information, forms, schedules, and instructor profiles and no separate sections',
      },
      { id: 'c', text: 'Several disconnected pages with different information and no clear navigation' },
      { id: 'd', text: 'A separate website for each activity, each with its own unrelated navigation' },
    ],
    answer: 'a',
  },
  {
    id: 'c1-2b',
    concept: 'c1',
    stage: 2,
    prompt:
      'You are making a wireframe for a class registration page before building it. Which approach best uses abstraction?',
    options: [
      { id: 'a', text: 'Pick the final colors, fonts, photos, and animations before deciding where content goes' },
      {
        id: 'b',
        text: 'Use simple boxes and labels for navigation, class information, registration fields, and buttons, and leave out visual details',
      },
      { id: 'c', text: 'Draw a detailed picture of the finished website without marking its structural parts' },
      { id: 'd', text: "Copy another website's look exactly because its design was already tested" },
    ],
    answer: 'b',
  },
  {
    id: 'c1-2c',
    concept: 'c1',
    stage: 2,
    prompt:
      'A visitor wants to find a beginner yoga class, see its schedule, and register. Which approach shows the best structural planning?',
    options: [
      { id: 'a', text: 'Make visitors return to the homepage after each step' },
      { id: 'b', text: 'Put the registration information on an unrelated page so the class page has fewer buttons' },
      {
        id: 'c',
        text: 'Create a clear flow from Homepage → Activities → Yoga Classes → Registration, with consistent navigation and layouts across pages',
      },
      {
        id: 'd',
        text: 'Use a different navigation menu and layout on each page to keep the site visually interesting',
      },
    ],
    answer: 'c',
  },
  {
    id: 'c1-3a',
    concept: 'c1',
    stage: 3,
    prompt:
      'Your community center site must have pages for activities, schedules, registration, and contact. While planning, you realize visitors may want to compare several activities before registering. What is the best design decision?',
    options: [
      { id: 'a', text: 'Follow the original requirements exactly, because adding anything would complicate the site' },
      { id: 'b', text: 'Add a separate page for every possible action, even if navigation gets more complicated' },
      {
        id: 'c',
        text: 'Adjust the site map so visitors can compare activities and move directly between activity details, schedules, and registration',
      },
      { id: 'd', text: 'Use the same wireframe for every page no matter what it contains' },
    ],
    answer: 'c',
  },
  {
    id: 'c1-3b',
    concept: 'c1',
    stage: 3,
    prompt:
      'A team is planning a 12-page website. They need to check whether the overall navigation makes sense and whether users can easily complete a registration form. Which approach shows the strongest use of site maps and wireframes?',
    options: [
      {
        id: 'a',
        text: 'Use a site map to check how the pages connect, and a detailed wireframe to check how the registration form is organized',
      },
      { id: 'b', text: 'Make detailed wireframes for all 12 pages before thinking about how they connect' },
      { id: 'c', text: 'Use only a site map, because it shows every detail of the layout' },
      { id: 'd', text: 'Focus on visual branding first and figure out navigation after building' },
    ],
    answer: 'a',
  },
  {
    id: 'c1-3c',
    concept: 'c1',
    stage: 3,
    prompt:
      'Your site lets users browse dozens of classes and register. Your first design is one long page listing every class, and testers say it is hard to find relevant activities. Which revision is best?',
    options: [
      { id: 'a', text: 'Keep the structure and change the background colors to make it more attractive' },
      { id: 'b', text: 'Add more descriptions to the same page so users have more information' },
      { id: 'c', text: 'Create a completely different navigation system for each class category' },
      {
        id: 'd',
        text: 'Organize classes into consistent categories, add filtering, and reuse one class-detail layout so browsing and registering are clearer',
      },
    ],
    answer: 'd',
  },
  {
    id: 'c2-1a',
    concept: 'c2',
    stage: 1,
    prompt:
      'A student asks an AI for a blue website with three navigation buttons. The AI makes a red website with three navigation buttons. Which evaluation correctly identifies the obvious mismatch?',
    options: [
      { id: 'a', text: 'The navigation buttons match the request, but the website uses the wrong color' },
      { id: 'b', text: 'The website completely matches the request' },
      { id: 'c', text: 'The website should be rejected because it has navigation buttons' },
      { id: 'd', text: 'The AI did not make any of the requested features' },
    ],
    answer: 'a',
  },
  {
    id: 'c2-2a',
    concept: 'c2',
    stage: 2,
    prompt:
      'You ask an AI for a website with readable text on phones, a working class search, and a visible registration button. The result has attractive colors and a visible registration button, but the text is tiny on phones and the search does not work. Which evaluation shows the best reasoning?',
    options: [
      {
        id: 'a',
        text: 'The registration button meets one requirement, but the tiny text and broken search fail two others, so those need fixing before you accept it',
      },
      { id: 'b', text: 'It meets the request because it looks professional and has a registration button' },
      { id: 'c', text: 'Regenerate the whole website because the colors are not appealing' },
      { id: 'd', text: 'Accept it, because AI tools are generally reliable' },
    ],
    answer: 'a',
  },
  {
    id: 'c2-3a',
    concept: 'c2',
    stage: 3,
    prompt:
      'An AI makes a registration form that looks right and passes basic testing. But every attempt to have the AI fix its keyboard navigation breaks other features that worked. What is the best decision?',
    options: [
      { id: 'a', text: 'Keep asking for the same change until the AI eventually gets it right' },
      { id: 'b', text: 'Accept the form because it looks right and works with a mouse' },
      {
        id: 'c',
        text: 'Keep the working parts, fix the keyboard accessibility yourself if you can, and test the final form against every requirement',
      },
      { id: 'd', text: 'Drop keyboard navigation from the requirements because the AI is struggling with it' },
    ],
    answer: 'c',
  },
  {
    id: 'c3-1a',
    concept: 'c3',
    stage: 1,
    prompt:
      'You want an AI to make a page showing the activities a community center offers. Which prompt states the basic goal, even if it could include more detail?',
    options: [
      { id: 'a', text: 'Make it look interesting' },
      { id: 'b', text: 'Create a webpage that lists the activities offered by a community center' },
      { id: 'c', text: 'Generate something for visitors' },
      { id: 'd', text: 'Make a modern design' },
    ],
    answer: 'b',
  },
  {
    id: 'c3-1b',
    concept: 'c3',
    stage: 1,
    prompt:
      'An AI-made website has text that is hard to read. You notice and want to make a first revision. Which response is an attempt to improve the output, even if it is not very specific yet?',
    options: [
      { id: 'a', text: 'The AI must be right, so I will keep the design' },
      { id: 'b', text: 'I will ignore it because the website looks good' },
      { id: 'c', text: '"Make the text easier to read."' },
      { id: 'd', text: 'Delete the whole website without trying to improve it' },
    ],
    answer: 'c',
  },
  {
    id: 'c3-2a',
    concept: 'c3',
    stage: 2,
    prompt:
      'You want an AI to make a mobile-friendly class registration page. Users must be able to pick classes and register, including when a class is full. Which prompt should you send?',
    options: [
      { id: 'a', text: '"Make a nice-looking website for a community center."' },
      { id: 'b', text: '"Create a registration page with attractive colors and a modern layout."' },
      {
        id: 'c',
        text: '"Create a mobile-responsive class registration page where users select classes and submit a registration form. Use readable text and accessible form controls. If a class is full, show a clear message and an option to join a waitlist."',
      },
      { id: 'd', text: '"Generate a website where people can register for classes. Make it look professional."' },
    ],
    answer: 'c',
  },
  {
    id: 'c3-2b',
    concept: 'c3',
    stage: 2,
    prompt:
      'On small screens, an AI-made class schedule page shows class titles overlapping the registration buttons. Which follow-up prompt shows the best iteration?',
    options: [
      { id: 'a', text: '"Fix the website and make it look better."' },
      { id: 'b', text: '"Redesign the whole website with a completely different layout."' },
      { id: 'c', text: '"Change the background colors so the registration buttons stand out."' },
      {
        id: 'd',
        text: '"On screens 375 pixels wide or narrower, put each class title above its registration button and add enough spacing to prevent overlap. Keep the rest of the design the same."',
      },
    ],
    answer: 'd',
  },
  {
    id: 'c3-3a',
    concept: 'c3',
    stage: 3,
    prompt:
      'You are using an AI website builder to turn a wireframe into a responsive site. The wireframe shows three activity cards in a row but does not say how they should look on small screens. Which prompt is best?',
    options: [
      { id: 'a', text: '"Create a website that looks exactly like this wireframe."' },
      {
        id: 'b',
        text: '"Create a responsive website from this wireframe. Keep the three activity cards in one row on desktop, but stack them vertically on narrow mobile screens. Keep their order, keep text readable, and prevent horizontal scrolling."',
      },
      { id: 'c', text: '"Build a modern-looking website with three activity cards and attractive colors."' },
      { id: 'd', text: '"Generate the website first, and I will tell you what to fix afterward."' },
    ],
    answer: 'b',
  },
  {
    id: 'c3-3b',
    concept: 'c3',
    stage: 3,
    prompt:
      'An AI-made website has three problems: the menu overlaps the logo, the class cards are too narrow, and the registration buttons do not work. Which approach shows the best iterative prompting?',
    options: [
      { id: 'a', text: 'Ask the AI to fix all three at once without checking which changes worked' },
      { id: 'b', text: 'Regenerate the whole website again and again until the problems disappear' },
      { id: 'c', text: 'Rewrite the original prompt with more descriptive words, but do not test the changes' },
      {
        id: 'd',
        text: 'Fix one problem at a time, test each revision against its requirement, and keep successful changes before moving on',
      },
    ],
    answer: 'd',
  },
  {
    id: 'c4-1a',
    concept: 'c4',
    stage: 1,
    prompt:
      'A school website shows light gray words on a white background, and they are hard to read. What is the accessibility problem?',
    options: [
      { id: 'a', text: 'The website has too many pictures' },
      { id: 'b', text: 'The text does not have enough color contrast' },
      { id: 'c', text: 'The website has too many pages' },
      { id: 'd', text: 'The website needs more animations' },
    ],
    answer: 'b',
  },
  {
    id: 'c4-1b',
    concept: 'c4',
    stage: 1,
    prompt:
      'A student cannot use a mouse because of a physical disability and needs to use a school website with only a keyboard. Which feature would help?',
    options: [
      { id: 'a', text: 'More colorful backgrounds' },
      { id: 'b', text: 'Music that plays automatically' },
      { id: 'c', text: 'Being able to reach every button and menu with the keyboard' },
      { id: 'd', text: 'More pictures on every page' },
    ],
    answer: 'c',
  },
  {
    id: 'c4-1c',
    concept: 'c4',
    stage: 1,
    prompt:
      'Your teacher explains that AI sometimes repeats accessibility problems from the examples it learned from. What does this mean?',
    options: [
      { id: 'a', text: 'AI-generated designs are always accessible to everyone' },
      { id: 'b', text: "AI automatically understands every user's needs" },
      { id: 'c', text: 'AI cannot create websites for students' },
      { id: 'd', text: 'AI may copy design problems from the examples it learned from' },
    ],
    answer: 'd',
  },
  {
    id: 'c4-1d',
    concept: 'c4',
    stage: 1,
    prompt:
      'Emma is using a school website. She says, "The words are too small, and I have trouble reading them." What problem is Emma having?',
    options: [
      { id: 'a', text: 'The website has too many pictures' },
      { id: 'b', text: 'The text on the website is too small' },
      { id: 'c', text: 'The website has too many colors' },
      { id: 'd', text: 'The website loads too slowly' },
    ],
    answer: 'b',
  },
  {
    id: 'c4-1e',
    concept: 'c4',
    stage: 1,
    prompt:
      'Alex says, "I prefer websites with simple layouts and large buttons." Which design best matches what Alex said?',
    options: [
      { id: 'a', text: 'A website with many small buttons and pictures' },
      { id: 'b', text: 'A website with complicated menus' },
      { id: 'c', text: 'A website with large buttons and a simple layout' },
      { id: 'd', text: 'A website with many animations' },
    ],
    answer: 'c',
  },
  {
    id: 'c4-1f',
    concept: 'c4',
    stage: 1,
    prompt:
      'A student testing a school app says, "I can\'t find the homework page because there are too many buttons." What is the most obvious usability problem?',
    options: [
      { id: 'a', text: 'The app does not have enough colors' },
      { id: 'b', text: 'The app needs more pictures' },
      { id: 'c', text: 'The app should have more features' },
      { id: 'd', text: 'The app is hard to navigate' },
    ],
    answer: 'd',
  },
  {
    id: 'c4-2a',
    concept: 'c4',
    stage: 2,
    prompt:
      'A school website has a video explaining how to do homework, but the video has no captions. Which accessibility principle is most affected, and why?',
    options: [
      { id: 'a', text: 'Perceivable, because students who cannot hear the audio may miss important information' },
      { id: 'b', text: 'Operable, because the website has too many buttons' },
      { id: 'c', text: 'Understandable, because the website uses too many colors' },
      { id: 'd', text: 'Robust, because the video is too long' },
    ],
    answer: 'a',
  },
  {
    id: 'c4-2b',
    concept: 'c4',
    stage: 2,
    prompt:
      'An AI makes a study app with small text, thin fonts, and light-colored buttons. It looks modern, but students with low vision struggle to use it. Which change makes it more inclusive?',
    options: [
      { id: 'a', text: 'Add more animations to make it interesting' },
      { id: 'b', text: 'Keep it, because most students think it looks good' },
      { id: 'c', text: 'Increase the text size and color contrast so students with low vision can read and use it' },
      { id: 'd', text: 'Remove all the buttons so it looks simpler' },
    ],
    answer: 'c',
  },
  {
    id: 'c4-2c',
    concept: 'c4',
    stage: 2,
    prompt:
      "An AI makes pictures of students for a technology club website. Almost every picture shows the same type of student, even though the school's students come from many backgrounds. Why might the AI do this?",
    options: [
      { id: 'a', text: 'AI always chooses the most accurate picture of students' },
      {
        id: 'b',
        text: 'The AI may have learned from training data that overrepresents some groups and underrepresents others',
      },
      { id: 'c', text: 'AI intentionally leaves out students from different backgrounds' },
      { id: 'd', text: 'Students from different backgrounds cannot join technology clubs' },
    ],
    answer: 'b',
  },
  {
    id: 'c4-2d',
    concept: 'c4',
    stage: 2,
    prompt:
      "Maya checks her homework assignments on her phone while riding the bus, but her internet connection is often poor during the ride. Which statement best describes Maya's underlying need?",
    options: [
      { id: 'a', text: 'Maya needs an app with colorful backgrounds' },
      { id: 'b', text: 'Maya needs to see her homework assignments even when her connection is poor' },
      { id: 'c', text: 'Maya needs a new phone with better features' },
      { id: 'd', text: 'Maya needs an app that plays music while she studies' },
    ],
    answer: 'b',
  },
  {
    id: 'c4-2e',
    concept: 'c4',
    stage: 2,
    prompt:
      'Lucas has trouble reading text when the word color and background color are too similar. You are designing a learning website for him. Which decision is best, and why?',
    options: [
      { id: 'a', text: 'Light gray text on a white background, because it looks modern' },
      { id: 'b', text: 'More animations, because they make the site interesting' },
      {
        id: 'c',
        text: 'Dark text on a light background, because strong contrast makes the words easier for Lucas to read',
      },
      { id: 'd', text: 'Smaller text, so more fits on each page' },
    ],
    answer: 'c',
  },
  {
    id: 'c4-2f',
    concept: 'c4',
    stage: 2,
    prompt:
      'You designed a homework app for students who need to check upcoming assignments quickly, but they must click through four pages to see their deadlines. Which evaluation best explains the problem?',
    options: [
      {
        id: 'a',
        text: "The app does not meet students' need to find assignments quickly, because the deadlines are hard to reach",
      },
      { id: 'b', text: 'The app is badly designed because four pages are always too many for any app' },
      { id: 'c', text: 'The app needs brighter colors to be more attractive' },
      { id: 'd', text: 'The app works because it includes all the homework information' },
    ],
    answer: 'a',
  },
  {
    id: 'c4-3a',
    concept: 'c4',
    stage: 3,
    prompt:
      'Your school will use an AI tool to make a new learning website. Before students try it, you are asked to find possible accessibility problems. What is the most effective approach?',
    options: [
      { id: 'a', text: 'Check whether it looks attractive and uses the school colors' },
      { id: 'b', text: 'Wait for students to complain before improving accessibility' },
      { id: 'c', text: 'Ask the AI whether the website is accessible and accept its answer' },
      {
        id: 'd',
        text: 'Test keyboard navigation, text contrast, image descriptions, and screen-reader support to find barriers for different users',
      },
    ],
    answer: 'd',
  },
  {
    id: 'c4-3b',
    concept: 'c4',
    stage: 3,
    prompt:
      'An AI makes pictures for a career website. Most pictures of engineers show men, and most pictures of nurses show women. Which explanation and solution best address the underlying problem?',
    options: [
      {
        id: 'a',
        text: 'The AI may have learned gender stereotypes from unbalanced training data. Review its data sources and improve representation, and change the pictures to show people of different genders in both careers',
      },
      { id: 'b', text: 'The AI is right because its pictures show what all engineers and nurses look like' },
      { id: 'c', text: "Changing the website's background color fixes the problem" },
      { id: 'd', text: 'Keep the same pictures because students are used to them' },
    ],
    answer: 'a',
  },
  {
    id: 'c4-3c',
    concept: 'c4',
    stage: 3,
    prompt:
      "An AI design tool suggests using only small icons without text labels to match the school's modern brand. Some students cannot tell what the icons mean, and screen-reader users cannot tell what they do. What is the best decision?",
    options: [
      { id: 'a', text: 'Keep the icons because the brand matters most' },
      { id: 'b', text: 'Replace all icons with long paragraphs, even if navigation gets harder' },
      {
        id: 'c',
        text: 'Keep a consistent visual style while adding clear text labels and accessible names to the icons',
      },
      { id: 'd', text: 'Make a separate website only for students with disabilities and leave the original as is' },
    ],
    answer: 'c',
  },
  {
    id: 'c4-3d',
    concept: 'c4',
    stage: 3,
    prompt:
      'You are designing a school lunch ordering app. Students want to order quickly. In your research you learn some students have food allergies, but nobody asked for allergy information. What should you do?',
    options: [
      { id: 'a', text: 'Only make ordering faster, because that is what students asked for' },
      { id: 'b', text: 'Remove some food choices to make the app simpler' },
      { id: 'c', text: 'Add more colorful food pictures' },
      {
        id: 'd',
        text: 'Include clearly labeled, school-verified allergy information, because students may need it to choose safely even though they did not ask',
      },
    ],
    answer: 'd',
  },
  {
    id: 'c4-3e',
    concept: 'c4',
    stage: 3,
    prompt:
      'You are designing a class discussion app. Some students prefer voice messages because typing is slow. Others have hearing difficulties or cannot record in a noisy classroom. Which decision best balances these needs?',
    options: [
      { id: 'a', text: 'Allow only voice messages because they are faster' },
      { id: 'b', text: 'Allow both voice messages and text, so each student can choose a method that works for them' },
      { id: 'c', text: 'Allow only text because it is easier to organize' },
      { id: 'd', text: 'Design it around whichever method you personally prefer' },
    ],
    answer: 'b',
  },
  {
    id: 'c4-3f',
    concept: 'c4',
    stage: 3,
    prompt:
      'You made a study planner for students who lose track of deadlines. In testing, 8 of 10 students could not find their next assignment, though several loved the purple background. One says, "I need the app to be purple because purple makes it easier to use." What is the best next step?',
    options: [
      { id: 'a', text: 'Keep the design because students like how it looks' },
      { id: 'b', text: 'Make it a brighter purple because a student called it a need' },
      {
        id: 'c',
        text: 'Improve how upcoming assignments are shown, since testing shows students cannot find deadlines, and treat the purple as a personal preference',
      },
      { id: 'd', text: 'Add more decorations to make it even more attractive' },
    ],
    answer: 'c',
  },
];
