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

// Conversation cards for dinner dates — press T at the table to draw one.
// Both of you see the same card. Add your own!
export const TABLE_TALK = [
  "What's a tiny moment with me you think about more than you've admitted?",
  "If we could teleport anywhere right now for 24 hours, where are we going?",
  "What did you think the first time you saw me — honestly?",
  "What's something you want us to be doing in five years?",
  "Which of my habits secretly makes you smile?",
  "What's a fear you've never said out loud?",
  "When did you know this was different from anything before?",
  "What's the best meal we've ever had together — and why was it the company?",
  "If our relationship had a theme song, what would it be?",
  "What's one thing you wish we did more often?",
  "What part of your day do you most wish I was there for?",
  "What's something hard from your past that made you who you are?",
  "Where do you feel most at home — place, person, or moment?",
  "What's a dream you shelved that you'd pick back up if nothing could fail?",
  "What do you hope never changes about us?",
  "What's the most spontaneous thing you want us to do together?",
  "Which trip should be our next one, and what's the first thing we do there?",
  "What's a compliment you've never forgotten?",
  "What do you think our hardest year so far taught us?",
  "If we opened a tiny shop together, what would we sell?",
  "What's your favorite photo of us, and what was happening right before it?",
  "What's something you're proud of that you don't talk about enough?",
  "How do you want to be loved on your worst days?",
  "What's a question you've been wanting to ask me?",
  "What would a perfect lazy Sunday with me look like?",
  "What's one way I've changed you?",
  "If we wrote a book about us, what would this chapter be called?",
  "What are you most excited to show me in your city someday?",
  "What's the smallest thing I do that makes you feel safe?",
  "When distance feels heavy, what helps you most?",
  "What tradition should we start, just the two of us?",
  "What's something silly you'd never do in front of anyone but me?",
  "What's your favorite thing I've ever said to you?",
  "If tonight never had to end, what would we do next?",
  "What are you grateful for about us, right now, at this table?",
  "Describe our future kitchen. What's cooking and who's cooking it?",
];
