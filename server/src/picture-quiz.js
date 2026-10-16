// "Guess the Picture": builds a picture round (a normal quiz with mode 'picture') from the picture pool.
// Each question shows one picture and four answers: the right one plus three wrong ones from the same category,
// so a flag is never mixed with a logo. Pure functions, no Node imports, shared by the browser and the tests.
import { PICTURE_POOL } from './picture-pool.js';
import { CUSTOM_PICTURES } from './custom-pictures.js';

// Built-in flags and logos plus anything added with `npm run add-pictures`.
export const ALL_PICTURES = [...PICTURE_POOL, ...CUSTOM_PICTURES];

export const PICTURE_TITLE = 'Guess the Picture';
export const PICTURE_DEFAULTS = { count: 20, seconds: 12 };
// Categories that come from your own pictures (my-pictures/pictures.csv), as opposed to the built-in Flags and Logos.
export const customCategories = () => [...new Set(CUSTOM_PICTURES.map((p) => p.category))];
export const pictureCategories = (pool = ALL_PICTURES) => [...new Set(pool.map((p) => p.category))];

function shuffle(list, random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// categories: which categories to draw from (default all). Questions from different categories are mixed.
export function buildPictureRound({ count = PICTURE_DEFAULTS.count, seconds = PICTURE_DEFAULTS.seconds, categories = null, pool = ALL_PICTURES, random = Math.random } = {}) {
  const chosen = categories?.length ? pool.filter((p) => categories.includes(p.category)) : pool;
  const picked = shuffle(chosen, random).slice(0, Math.max(1, count));
  const questions = picked.map((item) => {
    // Wrong answers: the three you wrote for this picture, otherwise three from the same category (never the right answer).
    const wrong = item.wrong?.length === 3
      ? item.wrong
      : shuffle(pool.filter((p) => p.category === item.category && p.answer !== item.answer), random).slice(0, 3).map((p) => p.answer);
    if (wrong.length < 3) throw new Error(`Not enough ${item.category} pictures to make four answers.`);
    const options = shuffle([item.answer, ...wrong], random);
    return {
      prompt: item.prompt || (item.category === 'Flags' ? 'Which country does this flag belong to?' : item.category === 'Logos' ? 'Which brand does this logo belong to?' : 'Who or what is this?'),
      options,
      correctIndex: options.indexOf(item.answer),
      durationSeconds: seconds,
      image: item.image,
      category: item.category
    };
  });
  return { title: PICTURE_TITLE, mode: 'picture', questions };
}
