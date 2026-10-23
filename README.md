# Create Your Own Trip

Answer a few questions and get a road trip you can drive: bases for each night, a day-by-day plan with drive times, hidden gems, Booking.com searches, a packing list, a booking timeline and a rough budget.

Live test site: https://salzmann-trips.github.io/CreateYourOwn/

## Files
| File | What it is |
|---|---|
| `index.html` | The page (home, wizard, trip view). |
| `app.js` | The app. The `CONFIG` block at the top switches live planning on (`apiUrl`, `turnstileSiteKey`). |
| `plan.js` | The questions, the prompt for Claude and the check every plan must pass. Shared with the server. |
| `app.css` | Styles. |
| `legal.html` | Imprint, disclaimer, privacy (draft, must be completed before launch). |
| `data/samples/` | Sample trips for the inspiration gallery (`index.json` lists them). |
| `worker/` | The planning server for Cloudflare Workers (step 2, not needed for the demo). |

## Demo mode
With `apiUrl` empty, the wizard works fully, but instead of creating the trip it gives a ready-made request to paste into Claude, plus sample trips.

Map data © OpenStreetMap contributors. Routing: OSRM demo server (test use only; switch to a hosted routing service before launch).
