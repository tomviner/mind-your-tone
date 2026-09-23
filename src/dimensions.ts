export const DIMENSIONS = {
  red_alert: {
    name: "Red alert",
    low: "No rush",
    high: "Drop everything",
    instructions: "How urgent and time-sensitive does this phrase sound?",
    criteria: [
      "Leisurely: no time pressure at all",
      "Soon-ish: a mild preference for prompt action",
      "Pressing: action is clearly wanted now",
      "Urgent: delay sounds costly or unacceptable",
      "Emergency: drop everything and act immediately",
    ],
  },
  corporate_fog: {
    name: "Corporate fog",
    low: "Plain English",
    high: "Synergy event",
    instructions:
      "How bureaucratic, jargon-heavy, or corporately vague is this phrase?",
    criteria: [
      "Plain everyday speech with concrete words",
      "Mostly plain with a trace of workplace formality",
      "Noticeably corporate or procedural language",
      "Dense business jargon and indirect phrasing",
      "Maximum corporate fog: abstract synergy-heavy bureaucracy",
    ],
  },
  jazz_hands: {
    name: "Jazz hands",
    low: "Deadpan",
    high: "Full cabaret",
    instructions: "How playful, theatrical, or flamboyant is this phrase?",
    criteria: [
      "Entirely restrained and deadpan",
      "A faint playful wink",
      "Clearly lively or humorous",
      "Highly theatrical and showy",
      "Full cabaret: exuberant, flamboyant, and impossible to miss",
    ],
  },
  main_character: {
    name: "Main character",
    low: "Background extra",
    high: "My biopic",
    instructions:
      "How strongly does this phrase center the speaker and their importance?",
    criteria: [
      "Impersonal: the speaker is absent or incidental",
      "Light personal presence without self-focus",
      "The speaker is a clear participant",
      "Strong self-focus and personal importance",
      "Total protagonist energy: everything revolves around the speaker",
    ],
  },
  knife_out: {
    name: "Knife out",
    low: "Velvet glove",
    high: "Open warfare",
    instructions: "How hostile, cutting, or confrontational is this phrase?",
    criteria: [
      "Gentle and non-confrontational",
      "Slightly cool or edged",
      "Clearly critical or confrontational",
      "Cutting and openly hostile",
      "Open warfare: aggressively antagonistic or insulting",
    ],
  },
  receipts: {
    name: "Receipts",
    low: "Vibes only",
    high: "Exhibit A",
    instructions: "How concrete, checkable, and specific is this phrase?",
    criteria: [
      "Purely vague: no checkable detail",
      "A little context but few concrete details",
      "Some specific people, actions, quantities, or times",
      "Detailed and readily checkable",
      "Exhibit A: exact, evidence-rich, and highly verifiable",
    ],
  },
  pinky_swear: {
    name: "Pinky swear",
    low: "Maybe-ish",
    high: "Bet the house",
    instructions: "How certain and committed does the speaker sound?",
    criteria: [
      "Highly tentative and hedged",
      "Leaning one way but preserving doubt",
      "Fairly confident with some qualification",
      "Strongly certain or committed",
      "Absolute certainty with no room for doubt",
    ],
  },
  feelings_leak: {
    name: "Feelings leak",
    low: "Poker face",
    high: "Emotional flood",
    instructions: "How much emotional intensity is exposed by this phrase?",
    criteria: [
      "Emotionally sealed and neutral",
      "A faint feeling is detectable",
      "Clear emotion at moderate intensity",
      "Strong and explicit emotion",
      "Emotional flood: overwhelming feeling dominates the phrase",
    ],
  },
  sugar_coating: {
    name: "Sugar coating",
    low: "No chaser",
    high: "Fondant armour",
    instructions:
      "How softened, tactful, or elaborately polite is this phrase?",
    criteria: [
      "Completely blunt and unsoftened",
      "Direct but lightly courteous",
      "Balanced tact and directness",
      "Heavily softened and very polite",
      "Fondant armour: elaborate tact obscures the direct point",
    ],
  },
} as const;

export type DimensionKey = keyof typeof DIMENSIONS;

export const DIMENSION_KEYS = Object.keys(DIMENSIONS) as DimensionKey[];
