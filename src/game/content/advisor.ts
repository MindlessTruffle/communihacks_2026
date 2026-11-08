// Fixed advisor lines (all pre-voiced by tools/bake-voices.mjs).
export const ADVISOR = {
  intro: [
    "Welcome, Your Majesty! I am Sage Ollie, your royal advisor.",
    "People will come to ask for help. You choose: yes, or no.",
    "Watch your people, their happiness, and your gold. Let's begin!",
  ],
  dayStart: [
    "A new day! Let's see who visits.",
    "Good morning, Your Majesty. The people are waiting.",
    "Ready? Remember: needs come first, then wants.",
    "Another day in the kingdom. Choose wisely!",
  ],
  upkeepSoon: "Castle upkeep is coming soon. Keep 120 gold safe!",
  upkeepTomorrow: "Upkeep is tomorrow! Do you have 120 gold?",
  lowGold: "Our gold is getting low. Let's be careful with spending.",
  lowHappy: "The people seem sad. Maybe help them a little?",
  cantAfford: "We don't have enough gold for that.",
  evening: "The sun is setting. Let's take a walk through town.",
  marketIntro: "First, let's make a shopping list. Then we stick to it!",
  marketOver: "That's more than our budget. Let's take something off.",
  marketDone: "Great shopping! Let's head home to sleep.",
  budgetWin: "Well done, Your Majesty! You stuck to the budget, so the treasury keeps the savings. Staying in budget pays off!",
  budgetWinPerfect: "Wonderful, Your Majesty! Everything on the list, no shiny sales, and gold saved. A perfect shop!",
  marketTrap: "Hmm. Is that on our list?",
  marketOffList: "That one is not on our list.",
  goodStreak: "You're making great choices today!",
  growth: "Look out the window! The kingdom is growing!",
  restDay: "The kingdom needs a rest. Let's talk about your reign.",
  courtDone: "That's everyone for today. Well done, Your Majesty!",
  treasuryHint: "Want to visit the Royal Treasury before court?",
};

/** Summary sentence chosen by how the day went. */
export function summarySentence(dp: number, dh: number, dg: number): string {
  if (dh > 4 && dp > 0) return "People are happy, the city is growing!";
  if (dh < -5) return "People are a bit sad today.";
  if (dg > 20) return "The treasury is growing. Nice saving!";
  if (dg < -40) return "We spent a lot of gold today.";
  return "A calm day in the kingdom.";
}

export const SUMMARY_SENTENCES = [
  "People are happy, the city is growing!",
  "People are a bit sad today.",
  "The treasury is growing. Nice saving!",
  "We spent a lot of gold today.",
  "A calm day in the kingdom.",
];
