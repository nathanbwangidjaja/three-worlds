// ❤ EDIT ME ❤
// All the words in the game live here. Replace the [bracketed] bits
// with your own memories and messages before gift day.

export const STORY = {
  // Floating heart markers at each "home" (the exact map locations you gave)
  homes: {
    boston: {
      label: "his home",
      speaker: "Cambridge, Boston",
      pages: [
        "This is my street. The real one — every building around you is real.\n\nWhen you miss me, this is where I am.",
        "[Write something about your place here — what she'd see if she visited, where you think of her.]",
      ],
    },
    tangerang: {
      label: "her home",
      speaker: "Tangerang",
      pages: [
        "And this is your street, rebuilt from the real map.\n\nI walked it in my head more times than you know.",
        "[Write something about her place — a memory of being there, or wishing you were.]",
      ],
    },
  },

  // The plaque at the base of the Eiffel Tower
  eiffel: {
    speaker: "🗼 Tour Eiffel",
    pages: [
      "9,862 miles apart.\n\nBoston is that way. Tangerang is the other way.\nBut right here, we're 0 miles apart.",
      "[Your anniversary message goes here. This is the big one — they'll read it together under the tower.]",
      "Happy anniversary. ❤",
    ],
  },

  // The bench on the Champ de Mars (press E to sit together)
  bench: {
    speaker: "A bench on the Champ de Mars",
    pages: [
      "Saved you a seat.\n\n[A note about the future — the someday-trip to Paris for real.]",
    ],
  },

  // Shown when both of you stand near the tower together
  togetherBanner: "💞 You're here together — look up",

  // System messages
  partnerJoined: (name) => `💌 ${name} just stepped into the world`,
  partnerLeft: (name) => `${name} left — the world feels quieter`,
  partnerWorld: (name, city) => `${name} is in ${city}`,
};
