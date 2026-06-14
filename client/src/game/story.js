// ❤ EDIT ME ❤
// The actual words now live in  client/src/copy.json  (edit that file).
// This file just shapes them into what the game expects.

import { C, fmt } from "./copy.js";

const L = C.love;

export const STORY = {
  homes: {
    boston: {
      label: L.homeHisLabel,
      speaker: L.homeHisSpeaker,
      pages: L.homeHisPages,
    },
    tangerang: {
      label: L.homeHerLabel,
      speaker: L.homeHerSpeaker,
      pages: L.homeHerPages,
    },
  },

  eiffel: {
    speaker: L.eiffelSpeaker,
    pages: L.eiffelPages,
  },

  bench: {
    speaker: L.benchSpeaker,
    pages: L.benchPages,
  },

  togetherBanner: L.togetherBanner,

  partnerJoined: (name) => fmt(C.system.partnerJoined, { name }),
  partnerLeft: (name) => fmt(C.system.partnerLeft, { name }),
  partnerWorld: (name, city) => fmt(C.system.partnerWorld, { name, city }),
};

export const TABLE_TALK = C.tableTalk;
