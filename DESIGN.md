# Design

Pause follows the fleet style guide, `~/Developer/DESIGN.md`. The rules below are pause's own, on top of it.

## Visual world

Incumbent truth, from `src/index.css`, `src/App.css`, `src/Modal/Modal.css`, `src/Header/Header.css`: white page, black ink, centered column, `Satisfy` 54px wordmark, `Raleway` everywhere else, `#dcdcdc` 1px rules, buttons with a 5px corner and a `1px 1px 1px #b7b7b7` drop that goes flat on press, no transitions, no transforms, a vivid `#0edc00` green as the one accent. Modals: 3px corner, `0 0 3px #a2a2a2` shadow, 20px heading over a `#dcdcdc` rule. Charts carry all the color (Please.js analogous schemes). It is a quiet, almost stationery-like tool; the new screens stay in it.

## Tokens

Defined on `:root` in `src/index.css` (existing literals keep working):

```
--pause-paper: #ffffff;   --pause-ink: #000000;      --pause-muted: #595959;  (7.0:1)
--pause-rule: #dcdcdc;    --pause-drop: #b7b7b7;     --pause-wash: #f4f4f4;   (skeleton, hover wash)
--pause-green: #0edc00;   (fill only; black text on it 11.3:1)
--pause-green-ink: #087a00; (links/success text, 5.5:1)
--pause-red-ink: #c00000;   (errors, 6.5:1)
```

## Components

Shared styles live in `src/components/ui.css`: `.pause-button` (the `#save` look: green fill, black text, 5px corner, drop shadow, flat on `:active`, black 2px focus ring offset 3px), `.pause-button.quiet` (white fill, black text, 1px `--pause-rule` border), `.pause-link` (`--pause-green-ink`, underline on hover). 44px minimum tap height on all of them.

## Page titles and Back link

Page titles on new routes: `Satisfy` 40px, centered, like `#title` at a smaller size. Back link top-left on every non-home route: "‹ Pause", Raleway 15px, `--pause-ink`, fixed at `top: 8px; left: 16px` mirroring the header's right-side trigger.

## Faces

Satisfy (wordmark, page titles, the most-planned figure), Raleway (everything else).
