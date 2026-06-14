// ❤ Loads all the editable words from copy.json ❤
//
// You don't edit THIS file — you edit  client/src/copy.json .
// Everything the game says reads from there through the `C` object below.
//
// `fmt(template, vars)` fills in the {curly-brace} blanks, e.g.
//   fmt(C.system.partnerJoined, { name: "Cinta" })  ->  "💌 Cinta just stepped into the world"

import C from "../copy.json";

export { C };

export function fmt(template, vars) {
  if (template == null) return "";
  if (!vars) return template;
  return String(template).replace(/\{(\w+)\}/g, (m, key) =>
    vars[key] != null ? vars[key] : m
  );
}
