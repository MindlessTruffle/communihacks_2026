import type { Character } from "../types.ts";

// Voice IDs are ElevenLabs premade voices (available on every account).
const V = {
  george: "JBFqnCBsd6RMkjVDRZzb", // warm British storyteller
  charlie: "IKne3meq5aSn9XLyUdCD",
  callum: "N2lVS1w4EtoT3dr4eOWO",
  matilda: "XrExE9yKIg1WjnnlVkGX",
  will: "bIHbv24MWmeRgasZH58o",
  lily: "pFZP5JQG7iQjIQuC4Bku",
  harry: "SOYHLrjzK2X1ezoPC6cr",
  laura: "FGY2WhTYpPnrIDTdsKH5",
  chris: "iP95p4xoKVk53GoZ742B",
  jessica: "cgSgspJ2msm6clMCkdW9",
  bella: "hpp4J3VqNfWAUOO0d1Us",
  daniel: "onwK4e9ZLuTAKqWW03F9",
  bill: "pqHfZKP75CvOlQylNhV4",
  sarah: "EXAVITQu4vr4xnSDxMaL",
  eric: "cjVigY5qzO86Huf0OWal",
  alice: "Xb7hH8MSUJpSbSDYk0k2",
  river: "SAz9YHcvj6GT2YYXdXww",
  roger: "CwhRBWXzGAHq8TQ4Fs17",
  brian: "nPczCjzI2devNBz1zQrb",
  liam: "TX3LPaxmHKxFdv7VOQHJ",
  // Added from the shared Voice Library (see handoff-notes/voice.md). Account-local copies, same IDs.
  sunny: "FgiNpTIapnCbaD6xiqIo", // Sunny - Bubbly, Children Narrator: young, bright, child-like (Little Juno)
  serena: "mqyRCI8OeJTogXjYUGZ5", // Serena - melodic, dreamy, ethereal: soft airy ghost (Boo)
  cody: "1RVpBInY9YUYMLSUQReV", // Cody McAvoy - Devoted Knight: calm, pleasant, young (Sir Clank)
  nana: "xIzR6egd3S3LJZbVW0c1", // Nana Margaret - Little Old Lady: warm elderly (Auntie Rosa)
};
export const NARRATOR_VOICE = V.river;

const mc = (n: string) => `/models/chars/${n}.glb`;

export const CHARACTERS: Record<string, Character> = {
  advisor: { id: "advisor", name: "Sage Ollie", model: "/models/owl.glb", color: "#7b4fc9", voiceId: V.george,
    bio: "A wise, gentle owl in a purple robe. The ruler's royal advisor. Patient, warm, encouraging, uses very simple words." },
  tilly: { id: "tilly", name: "Tilly the Clerk", model: mc("tilly"), color: "#b04a2f", voiceId: V.laura,
    bio: "The castle's bill collector. Quick-talking, organized, a little dramatic about deadlines, but kind." },
  marlo: { id: "marlo", name: "Marlo the Merchant", model: mc("marlo"), color: "#2e7d4f", voiceId: V.charlie,
    bio: "A cheerful travelling salesman who LOVES deals and sometimes oversells." },
  fenwick: { id: "fenwick", name: "Sly Fenwick", model: mc("fenwick"), color: "#6b3d8f", voiceId: V.callum,
    bio: "A smooth-talking trickster who tries scams. Charming but not to be trusted." },
  hazel: { id: "hazel", name: "Farmer Hazel", model: mc("hazel"), color: "#4f8a1e", voiceId: V.matilda,
    bio: "A hard-working, upbeat farmer who believes in planting today for tomorrow." },
  benny: { id: "benny", name: "Benny the Bard", model: mc("benny"), color: "#c0681a", voiceId: V.will,
    bio: "A friendly lute player who is always a little short on gold." },
  rosa: { id: "rosa", name: "Auntie Rosa", model: mc("rosa"), aid: "/models/chars/cane.glb", color: "#c23b6b", voiceId: V.nana,
    bio: "A caring older woman who walks with a cane. Knows everyone in town and bakes for them." },
  clank: { id: "clank", name: "Sir Clank", model: mc("clank"), color: "#4d5d8c", voiceId: V.cody,
    bio: "A loyal knight with very shiny (and often broken) armour. Keeps promises." },
  wren: { id: "wren", name: "Wren the Builder", model: mc("wren"), color: "#a8741a", voiceId: V.chris,
    bio: "A down-to-earth builder who can build anything once you save up for it." },
  boo: { id: "boo", name: "Boo", model: mc("boo"), color: "#4a90a8", voiceId: V.serena,
    bio: "A tiny friendly castle ghost who wants shiny things. Comic relief." },
  maya: { id: "maya", name: "Maya the Inventor", model: mc("maya"), aid: "/models/chars/wheelchair-power.glb", color: "#1f7a8c", voiceId: V.bella,
    bio: "A brilliant inventor who uses a power wheelchair. Runs the Shield Guild and loves clever plans." },
  cogs: { id: "cogs", name: "Treasurer Cogs", model: mc("cogs"), color: "#5b6b7a", voiceId: V.daniel,
    bio: "The royal treasury robot. Very precise, polite, loves numbers and safe vaults." },
  bill: { id: "bill", name: "Old Bill", model: mc("bill"), color: "#7a5a2f", voiceId: V.bill,
    bio: "A wise retired fisherman who saved a little every week of his life." },
  pip: { id: "pip", name: "Doctor Pip", model: mc("pip"), color: "#2f6fd6", voiceId: V.sarah,
    bio: "The town healer. Calm and caring." },
  gus: { id: "gus", name: "Captain Gus", model: mc("gus"), color: "#33508f", voiceId: V.roger,
    bio: "Captain of the town guard. Laid-back but protective." },
  zib: { id: "zib", name: "Zib the Traveller", model: mc("zib"), color: "#7d3cc8", voiceId: V.liam,
    bio: "An excitable visitor from a faraway land with strange coins." },
  brick: { id: "brick", name: "Brick the Smith", model: mc("brick"), color: "#8f3a1f", voiceId: V.brian,
    bio: "A big-hearted blacksmith with a booming voice." },
  prof: { id: "prof", name: "Professor Quill", model: mc("prof"), color: "#3d6b4f", voiceId: V.alice,
    bio: "A teacher who runs the town school." },
  kid: { id: "kid", name: "Little Juno", model: mc("kid"), color: "#2e8f4f", voiceId: V.sunny, scale: 0.8,
    bio: "A curious kid from the village who asks big questions." },
};

export const RULER_MODELS = [
  { id: "ruler-a", label: "A" },
  { id: "ruler-b", label: "B" },
  { id: "ruler-c", label: "C" },
  { id: "ruler-d", label: "D" },
  { id: "ruler-e", label: "E" },
  { id: "ruler-f", label: "F" },
];
