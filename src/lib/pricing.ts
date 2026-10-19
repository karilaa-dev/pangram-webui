// Published API rates (USD), from the StealthGPT and Pangram API pricing pages.

/** StealthGPT bills input + output words; Super costs more than Standard/Lite. */
const HUMANIZER_PER_1000_WORDS: Record<string, number> = { lite: 0.2, standard: 0.2, super: 0.5 };

/** Pangram charges $0.05 per block: 100 words on Pangram 4, 1,000 on legacy Pangram 3. */
const PANGRAM_BLOCK_PRICE = 0.05;
const pangramBlock = (model: string) => (/pangram[-_ ]?3(\b|$)/i.test(model) ? 1000 : 100);

export const humanizeCost = (model: string, inputWords: number, outputWords = inputWords) =>
  ((inputWords + outputWords) / 1000) * (HUMANIZER_PER_1000_WORDS[model] ?? HUMANIZER_PER_1000_WORDS.standard!);

/** Each check is rounded up to whole blocks. */
export const pangramCost = (model: string, words: number) => Math.ceil(words / pangramBlock(model)) * PANGRAM_BLOCK_PRICE;

export const humanizeRate = (model: string) => (model === "super" ? "$0.05 / 100 words" : "$0.20 / 1,000 words");
export const pangramRate = (model: string) => (pangramBlock(model) === 1000 ? "$0.05 / 1,000 words" : "$0.05 / 100 words");

export const usd = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);
