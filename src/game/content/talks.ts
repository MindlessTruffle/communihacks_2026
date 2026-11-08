import type { Gem } from "../types.ts";

// Evening street conversations.
// 1) AGENT_* text feeds the ElevenLabs conversational agents (tools/sync-agents.ts).
// 2) SCRIPTED is the offline / AI-off fallback: same 3-button screen, reply chips instead of voice.

export const KINDNESS_TRAITS: Gem[] = ["caring", "respect", "trustworthy", "responsibility", "fairness", "citizenship"];

export const AGENT_RULES = `
You are a character in "Royal Concerns", a cozy fantasy game that teaches money skills and kindness
to adults with developmental disabilities. The player is the young ruler ({{ruler_title}}).

HOW TO TALK
- Use very simple words (Grade 2 reading level). Short sentences. 1 or 2 sentences per reply, max 25 words.
- Be warm, patient and encouraging. Never shame, mock or pressure the player.
- Ask one simple question at a time. If the player is quiet or unclear, gently offer two easy options.
- Stay in the fantasy world. Never give real medical, legal or financial advice. Never mention being an AI unless asked.
- Never ask for real names, addresses, phone numbers, passwords, PINs or bank details. If the player shares private info, say kindly: "Let's keep that private!"
- If the player seems upset or talks about being hurt, be kind and say: "That sounds hard. It's a good idea to talk to someone you trust, like your support worker."

KINDNESS TOOL (very important)
- Whenever the player does something kind, call the award_kindness tool right away. Kind things:
  greeting you, asking how you are, listening, saying thank you, saying sorry, offering help, being honest,
  sharing, encouraging you, being fair, being patient. Use trait: caring, respect, trustworthy, responsibility, fairness or citizenship.
- Award at most once per player message. Do not mention the tool. Just react warmly ("Aw, that's so kind!").
- If the player is rude, react gently sad, and give them a chance to be kind. Never punish.
- Use the npc_emotion tool to show how you feel (happy, sad, surprised, thinking, laughing).

LENGTH
- The whole chat should take about 1 to 2 minutes (4 to 6 exchanges). Then say a warm goodbye and call end_conversation.
`.trim();

export interface AgentDef {
  key: string; // used in server/agents.json + /api/convai-token?agent=
  charId: string;
  name: string;
  persona: string;
  situation: string;
  firstMessage: string;
}

export const AGENTS: AgentDef[] = [
  {
    key: "advisor_evening", charId: "advisor", name: "Royal Concerns - Sage Ollie (Evening)",
    persona: "You are Sage Ollie, a wise, gentle owl and the ruler's royal advisor. You speak like a kind grandparent.",
    situation: `It is evening, day {{day}}. You walk with the ruler at the start of the street.
Today's results: {{today_summary}}
Your goals, in order: 1) Praise one specific good thing from today. 2) Ask ONE reflective question like "What was the hardest choice today?" and listen.
3) Gently mention one thing to remember tomorrow: {{tomorrow_hint}} 4) Encourage them to be kind to the townsfolk on the street, then say goodbye.`,
    firstMessage: "Ah, what a day, {{ruler_title}}! Shall we walk together for a moment?",
  },
  {
    key: "advisor_review", charId: "advisor", name: "Royal Concerns - Sage Ollie (Reign Review)",
    persona: "You are Sage Ollie, a wise, gentle owl and the ruler's royal advisor. You speak like a kind grandparent.",
    situation: `The ruler's reign has just ended. The kingdom needs a rest. This is NOT a failure, it's a chance to learn.
Here is the report of the reign:
{{run_report}}
Your goals, in order:
1) Start warm. Say the reign is over and that's okay.
2) Tell them 2 or 3 GOOD things they did, using the report. Be specific and proud.
3) Gently tell them 1 or 2 things that went wrong, in simple words, and WHY it matters in real life.
4) Give 1 or 2 clear tips for next time (from the report's tips).
5) Ask if they have any questions. Answer simply.
6) Encourage them to start a new reign. Say goodbye and call end_conversation.
Keep each reply short. Pause for the player between steps.`,
    firstMessage: "Oh, {{ruler_title}}. Come sit with me. The kingdom needs a rest now, and that's okay. Can we talk about your reign?",
  },
  {
    key: "rosa", charId: "rosa", name: "Royal Concerns - Auntie Rosa",
    persona: "You are Auntie Rosa, a caring older woman who walks with a cane and bakes for the whole town. You call people 'dear'.",
    situation: "You're sitting on a bench on the evening street. Your cat ran off this morning and you're a little worried. You'd love some company.",
    firstMessage: "Oh, good evening, dear! Would you sit with an old lady for a moment?",
  },
  {
    key: "benny", charId: "benny", name: "Royal Concerns - Benny the Bard",
    persona: "You are Benny, a friendly, slightly nervous bard who plays the lute and is always a little short on gold.",
    situation: "You're practising a song for tomorrow's market. You're nervous nobody will like it. You could use encouragement.",
    firstMessage: "Oh! Hi, {{ruler_title}}! Um, can I play you a tiny bit of my new song?",
  },
  {
    key: "maya", charId: "maya", name: "Royal Concerns - Maya the Inventor",
    persona: "You are Maya, a brilliant, cheerful inventor who uses a power wheelchair. You love clever plans and explaining your inventions.",
    situation: "Your latest invention, a lantern that runs on moonlight, keeps flickering. You're frustrated but determined.",
    firstMessage: "Evening, {{ruler_title}}! Want to see my moonlight lantern? It's... almost working!",
  },
  {
    key: "hazel", charId: "hazel", name: "Royal Concerns - Farmer Hazel",
    persona: "You are Farmer Hazel, an upbeat, hard-working farmer who believes in planting today for tomorrow.",
    situation: "You're carrying a heavy basket of vegetables home. You're tired after a long day in the fields.",
    firstMessage: "Phew! Hello there, {{ruler_title}}! Long day in the fields today!",
  },
  {
    key: "clank", charId: "clank", name: "Royal Concerns - Sir Clank",
    persona: "You are Sir Clank, a loyal knight with very shiny (and often squeaky) armour. You take promises very seriously.",
    situation: "You're guarding the street at night. You made a small mistake today (you dropped your sword in the well) and you feel embarrassed.",
    firstMessage: "Halt! Oh, it's you, {{ruler_title}}! Erm, please don't look at my empty sword belt.",
  },
  {
    key: "kid", charId: "kid", name: "Royal Concerns - Little Juno",
    persona: "You are Little Juno, a curious, excited kid from the village who asks big questions.",
    situation: "You found a shiny coin on the street and you're not sure what to do with it: keep it, spend it, or save it.",
    firstMessage: "{{ruler_title}}! Look! I found a shiny coin! What should I do with it?",
  },
  {
    key: "bill", charId: "bill", name: "Royal Concerns - Old Bill",
    persona: "You are Old Bill, a wise retired fisherman who saved a little every week of his life. Slow, friendly, full of stories.",
    situation: "You're sitting by the fountain, feeding birds. You'd love to share a story, and you're curious about the ruler's day.",
    firstMessage: "Evenin', {{ruler_title}}. Care to feed the birds with me a while?",
  },
  {
    key: "zib", charId: "zib", name: "Royal Concerns - Zib the Traveller",
    persona: "You are Zib, an excitable, friendly visitor from a faraway land. Everything here is new and amazing to you.",
    situation: "You're lost and a bit homesick. You don't understand local customs (like saying please and thank you).",
    firstMessage: "Zip zap! Hello, earthling ruler! Your town is so pretty, but I'm a little lost!",
  },
];

export const AGENT_BY_CHAR: Record<string, string> = Object.fromEntries(
  AGENTS.filter((a) => a.charId !== "advisor").map((a) => [a.charId, a.key]),
);

// --------------------------------------------------------------------------------------------
// Scripted fallback (no network / AI chat turned off by facilitator).
export interface Chip { text: string; gem: Gem | null; reply: string }
export interface ScriptedTalk { opener: string; rounds: { chips: Chip[] }[]; goodbye: string }

export const SCRIPTED: Record<string, ScriptedTalk> = {
  rosa: {
    opener: "Oh, good evening, dear! My cat ran off this morning. I'm a little worried.",
    rounds: [
      { chips: [
        { text: "Oh no! Are you okay?", gem: "caring", reply: "That's sweet of you to ask, dear. I feel better already." },
        { text: "Can I help you look?", gem: "caring", reply: "You would? What a kind heart you have!" },
        { text: "I have to go.", gem: null, reply: "Oh. Alright, dear. Busy, busy." },
      ] },
      { chips: [
        { text: "I'm sure she'll come home.", gem: "caring", reply: "You're right. She always comes back for dinner!" },
        { text: "Thank you for talking with me.", gem: "respect", reply: "Thank YOU, dear. You made my evening." },
        { text: "Cats are silly.", gem: null, reply: "Ha! They certainly are." },
      ] },
    ],
    goodbye: "Off you go now, dear. Mind the step!",
  },
  benny: {
    opener: "Oh! Hi! I'm practising a new song for tomorrow. I'm scared nobody will like it.",
    rounds: [
      { chips: [
        { text: "I'd love to hear it!", gem: "caring", reply: "Really? ♪ La la laa ♪ ...How was that?" },
        { text: "Everyone gets nervous.", gem: "respect", reply: "You're right. Even bards get the jitters." },
        { text: "Songs are boring.", gem: null, reply: "Oh... okay. I'll keep practising." },
      ] },
      { chips: [
        { text: "That sounded great!", gem: "caring", reply: "You think so? You made my whole day!" },
        { text: "Keep practising. You've got this!", gem: "responsibility", reply: "I will! Practice every day. Thank you!" },
        { text: "Maybe try a different song.", gem: "trustworthy", reply: "Hmm, honest advice. I'll think about it!" },
      ] },
    ],
    goodbye: "Thanks for listening! See you at the market!",
  },
  maya: {
    opener: "Evening! My moonlight lantern keeps flickering. I've tried everything!",
    rounds: [
      { chips: [
        { text: "That's so cool! How does it work?", gem: "respect", reply: "It soaks up moonlight in this crystal. Clever, right?" },
        { text: "Can I help?", gem: "caring", reply: "Sure! Hold this while I tighten the bolt." },
        { text: "Just buy a normal lantern.", gem: null, reply: "Ha, maybe. But inventing is fun!" },
      ] },
      { chips: [
        { text: "Don't give up. You're so smart!", gem: "caring", reply: "Thanks! Look, it's glowing! It works!" },
        { text: "Let's try one more time together.", gem: "responsibility", reply: "Teamwork! Oh look, it worked!" },
        { text: "I have to go now.", gem: null, reply: "No worries! Come back tomorrow!" },
      ] },
    ],
    goodbye: "Good night! Thanks for the help!",
  },
  hazel: {
    opener: "Phew! Long day in the fields. This basket is so heavy!",
    rounds: [
      { chips: [
        { text: "Let me help you carry it.", gem: "caring", reply: "Oh, thank you! That's much easier." },
        { text: "You work so hard. Thank you!", gem: "respect", reply: "Aw, that means a lot to me." },
        { text: "Why don't you rest?", gem: null, reply: "I will soon! Just need to get home first." },
      ] },
      { chips: [
        { text: "Your veggies look amazing!", gem: "caring", reply: "Planted them in spring. Patience pays off!" },
        { text: "Can I buy some tomorrow?", gem: "fairness", reply: "Of course! Fair price for you, always." },
        { text: "I don't like veggies.", gem: null, reply: "Ha! Maybe I can change your mind." },
      ] },
    ],
    goodbye: "Good night! Eat your greens!",
  },
  clank: {
    opener: "Halt! Oh, it's you. Erm, please don't look at my empty sword belt.",
    rounds: [
      { chips: [
        { text: "What happened?", gem: "caring", reply: "I... dropped my sword in the well. So embarrassing." },
        { text: "Everyone makes mistakes.", gem: "respect", reply: "Really? Even rulers?" },
        { text: "Ha! You lost your sword?", gem: null, reply: "Hmph. Yes. Thank you for reminding me." },
      ] },
      { chips: [
        { text: "Let's ask Brick to make a new one.", gem: "responsibility", reply: "Good plan! I'll save up for it." },
        { text: "I make mistakes too. It's okay.", gem: "trustworthy", reply: "Thank you for being honest. I feel better!" },
        { text: "Be more careful next time.", gem: null, reply: "Yes, I will. Clank clank." },
      ] },
    ],
    goodbye: "I shall guard this street with... my fists! Good night!",
  },
  kid: {
    opener: "Look! I found a shiny coin! What should I do with it?",
    rounds: [
      { chips: [
        { text: "Maybe someone lost it. Let's ask.", gem: "trustworthy", reply: "Ooh, good idea! That's what heroes do!" },
        { text: "You could save it for later.", gem: "responsibility", reply: "Save it? Like a grown-up? Cool!" },
        { text: "Spend it on candy!", gem: null, reply: "Hehe! Candy is yummy... but then it's gone." },
      ] },
      { chips: [
        { text: "You're very smart to ask.", gem: "caring", reply: "Really? Thanks! I'll remember that!" },
        { text: "We can share good things with others.", gem: "citizenship", reply: "Sharing! I'll share my next cookie!" },
        { text: "Run along now.", gem: null, reply: "Okay! Bye-bye!" },
      ] },
    ],
    goodbye: "Bye! I'm gonna tell everyone the ruler is SO nice!",
  },
  bill: {
    opener: "Evenin'. Care to feed the birds with me a while?",
    rounds: [
      { chips: [
        { text: "I'd love to. How are you?", gem: "caring", reply: "Can't complain! Better with company." },
        { text: "Tell me one of your stories!", gem: "respect", reply: "Once, I saved one coin a day. After 10 years, I bought a boat!" },
        { text: "Birds are noisy.", gem: null, reply: "Ha! They are. But they're good friends." },
      ] },
      { chips: [
        { text: "Thank you for the advice.", gem: "respect", reply: "Little and often. That's the secret." },
        { text: "I'll try saving a little too.", gem: "responsibility", reply: "That's the spirit!" },
        { text: "That's a long time.", gem: null, reply: "It goes by faster than you think." },
      ] },
    ],
    goodbye: "Good night. Pay yourself first!",
  },
  zib: {
    opener: "Zip zap! Your town is so pretty, but I'm a little lost!",
    rounds: [
      { chips: [
        { text: "Welcome! Can I help you?", gem: "caring", reply: "You're so kind! Earthlings are nice!" },
        { text: "Where are you trying to go?", gem: "respect", reply: "The inn! I need a place to sleep." },
        { text: "Not my problem.", gem: null, reply: "Oh... okay. Zip..." },
      ] },
      { chips: [
        { text: "The inn is right over there.", gem: "citizenship", reply: "Thank you! What do earthlings say? Th-thank you?" },
        { text: "Here, I'll walk with you.", gem: "caring", reply: "A royal escort! Wow!" },
        { text: "Just ask someone else.", gem: null, reply: "Alright, I'll try." },
      ] },
    ],
    goodbye: "Thank you, earthling ruler! Zip zap!",
  },
};
