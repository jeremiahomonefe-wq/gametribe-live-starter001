// Pure quiz rules with no Node imports, so the server and the browser editor share one source of truth.
export const QUIZ_LIMITS = { maxQuestions: 50, maxTitle: 80, maxPrompt: 200, maxOption: 100, minOptions: 2, maxOptions: 4, minSeconds: 5, maxSeconds: 120, defaultSeconds: 15, maxImage: 300, maxCategory: 30, pictureOptions: 4 };

// A picture quiz ("Guess the Picture") is a normal quiz with mode 'picture': every question has a picture and
// exactly four answers. Pictures are site paths (/pictures/...) or https addresses, never anything else.
export const QUIZ_MODES = ['quiz', 'picture'];
const IMAGE_PATTERN = /^(\/pictures\/[A-Za-z0-9._\/-]+|https:\/\/[^\s"'<>]+)$/;
export const isValidImage = (value) => typeof value === 'string' && value.length <= QUIZ_LIMITS.maxImage && IMAGE_PATTERN.test(value) && !value.includes('..');

export const DEMO_QUIZ = {
  title: 'Game Tribe Quick Challenge',
  questions: [
    { prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], correctIndex: 1, durationSeconds: 15 },
    { prompt: 'How many sides does a hexagon have?', options: ['Five', 'Six', 'Seven', 'Eight'], correctIndex: 1, durationSeconds: 15 },
    { prompt: 'Which device is commonly used to move a cursor on a computer?', options: ['Router', 'Scanner', 'Mouse', 'Speaker'], correctIndex: 2, durationSeconds: 15 }
  ]
};

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

// Returns { ok, quiz (cleaned copy), issues: [{ question: index|null, message }], error (first message) }.
export function validateQuiz(input) {
  const L = QUIZ_LIMITS;
  const issues = [];
  const add = (question, message) => issues.push({ question, message });
  if (!input || typeof input !== 'object') {
    return { ok: false, quiz: null, issues: [{ question: null, message: 'The quiz is missing.' }], error: 'The quiz is missing.' };
  }
  const title = clean(input.title);
  if (!title) add(null, 'Give the quiz a title.');
  else if (title.length > L.maxTitle) add(null, `The title must be ${L.maxTitle} characters or fewer.`);

  const mode = input.mode === undefined || input.mode === null || input.mode === '' ? 'quiz' : input.mode;
  if (!QUIZ_MODES.includes(mode)) add(null, 'The quiz type must be quiz or picture.');

  const raw = Array.isArray(input.questions) ? input.questions : [];
  if (!raw.length) add(null, 'Add at least one question.');
  else if (raw.length > L.maxQuestions) add(null, `A quiz can have up to ${L.maxQuestions} questions.`);

  const questions = raw.slice(0, L.maxQuestions + 1).map((q, i) => {
    const n = `Question ${i + 1}`;
    const prompt = clean(q?.prompt);
    if (!prompt) add(i, `${n}: write the question.`);
    else if (prompt.length > L.maxPrompt) add(i, `${n}: keep the question under ${L.maxPrompt} characters.`);

    const options = Array.isArray(q?.options) ? q.options.map(clean) : [];
    if (options.length < L.minOptions || options.length > L.maxOptions) add(i, `${n}: use ${L.minOptions} to ${L.maxOptions} answer options.`);
    else if (options.some((o) => !o)) add(i, `${n}: fill in every answer option or remove the empty ones.`);
    else if (options.some((o) => o.length > L.maxOption)) add(i, `${n}: keep each answer under ${L.maxOption} characters.`);
    else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) add(i, `${n}: answer options must be different from each other.`);

    if (mode === 'picture' && options.length !== L.pictureOptions) add(i, `${n}: picture questions need exactly ${L.pictureOptions} answer options.`);

    const image = clean(q?.image);
    if (image && !isValidImage(image)) add(i, `${n}: the picture must be a /pictures/ path or an https:// address (up to ${L.maxImage} characters).`);
    else if (mode === 'picture' && !image) add(i, `${n}: add a picture.`);
    const category = clean(q?.category);
    if (category.length > L.maxCategory) add(i, `${n}: keep the category under ${L.maxCategory} characters.`);

    const correctIndex = q?.correctIndex;
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) add(i, `${n}: choose the correct answer.`);

    const durationSeconds = q?.durationSeconds === undefined ? L.defaultSeconds : q.durationSeconds;
    if (!Number.isInteger(durationSeconds) || durationSeconds < L.minSeconds || durationSeconds > L.maxSeconds) {
      add(i, `${n}: set a time limit between ${L.minSeconds} and ${L.maxSeconds} seconds.`);
    }
    // image and category are only present when used, so text quizzes keep exactly their old shape.
    return { prompt, options, correctIndex, durationSeconds, ...(image ? { image } : {}), ...(category ? { category } : {}) };
  });

  const quiz = { title, ...(mode === 'picture' ? { mode } : {}), questions: questions.slice(0, L.maxQuestions) };
  return { ok: issues.length === 0, quiz, issues, error: issues[0]?.message };
}
