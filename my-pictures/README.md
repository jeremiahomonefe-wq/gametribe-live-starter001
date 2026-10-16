# Adding your own pictures to Guess the Picture

1. Copy your image files into this folder (`my-pictures/`). PNG, JPG, WebP, GIF and SVG work. Keep each one under 200 KB (about 800 px wide is plenty).
2. Add one line per picture to `pictures.csv` (see `pictures.example.csv`):

| Column | Meaning |
| --- | --- |
| `file` | The image's file name in this folder |
| `category` | A group name, for example Cartoons. Up to 30 characters |
| `answer` | The correct answer, as players will see it |
| `wrong_1` to `wrong_3` | Optional. Your own three wrong answers. Leave all three empty to borrow wrong answers from other pictures in the same category |
| `question` | Optional. The question shown above the picture. Default: "Who or what is this?" |

3. Run `npm run add-pictures`, then `npm run build`, then redeploy.

Rules the script checks for you (it changes nothing until every row is fine):
- A category needs at least 4 pictures to borrow wrong answers. Fewer than 4? Give `wrong_1` to `wrong_3` on those rows.
- One picture per answer in a category.
- The answer and its three wrong answers must all be different.

`pictures.csv` is the master list: each run rebuilds your pictures from it, so keep this folder. Removing a row removes that picture. Flags and logos are never touched.
Images are renamed to random-looking names automatically, so a picture's web address never gives away its answer.
Check that you have the right to use every image, especially photos of people and cartoon characters.
