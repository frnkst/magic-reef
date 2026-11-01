# Magic Reef

A small React + Three.js aquarium for children's drawings. Open the aquarium on
a laptop, scan its QR code with a phone, photograph a fish, and release
the actual drawing into the water.

The MVP uses flat, transparent fish with subtle swimming deformation instead of
3D fish models. This deliberately preserves each drawing's shape and colors.
OpenRouter vision analysis automatically identifies the crop and head/tail
direction. The app masks and rotates the original photo pixels; it never generates
a replacement fish. There are no required coloring templates, paid 3D models, or tests.

## Run locally

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Without environment variables, **Try the local demo** shows the starter aquarium.
Preparing new drawings requires an OpenRouter key even in the local demo.
Demo drawings are saved in this browser's local storage; they do **not** sync
between a phone and laptop. The shared aquarium requires Supabase.

## Connect Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the project's **SQL Editor**, paste all of `supabase/schema.sql`, and run
   it once. Then run `supabase/ai.sql`. For an existing aquarium, run **only**
   `supabase/ai.sql` to add the AI request budget.
3. In the project's API settings, find the project URL and **publishable** key
   (the legacy **anon** key also works). Put them in `.env.local`:

   ```dotenv
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

4. Restart the development server. **Create an aquarium** now creates a shared
   room with its own permanent, unguessable link.

Never put a Supabase **secret** or **service_role** key in the app or in a
`VITE_` variable. The publishable key is intentionally public; database access
is limited to the SQL functions. Tables have RLS enabled and no direct client
access. Authentication, Supabase Storage, and Realtime configuration are not
needed.

## Deploy to Vercel

1. Import this repository into Vercel. The framework is **Vite**.
2. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and `OPENROUTER_API_KEY` to the production
   environment variables.
3. Deploy. Vercel runs `npm run build`, publishes `dist`, and deploys
   `api/analyze-fish.ts` as a server-side function.
4. Open the deployed HTTPS URL on the laptop, create an aquarium, and scan the
   QR code on the phone. Leave the aquarium tab visible on the laptop.

Environment variables are baked into the frontend build; redeploy after changing
them. Vercel's HTTPS is important for phone camera and clipboard features.
The photo button uses the native file/camera picker, not a continuous camera feed;
camera-picker behavior depends on the phone's browser. On desktop it opens a file
picker. The separate photo-library button does not request camera capture.

For local phone use, open the network URL printed by Vite **on the laptop first**.
The QR code uses the address of the current page, so `localhost` cannot be scanned
from another device. Both devices need network access to Supabase.

## Connect OpenRouter

1. Create an [OpenRouter](https://openrouter.ai) API key and add credits.
2. Add `OPENROUTER_API_KEY` to `.env.local` for local development and to Vercel's
   environment settings for deployment. **Never prefix this key with `VITE_`**;
   it must stay on the server.
3. Optionally set `OPENROUTER_MODEL` (default: `google/gemini-2.5-flash`). The model
   must support image input and structured JSON-schema output.
4. Run `supabase/ai.sql` if using a shared aquarium, then restart/redeploy.

`npm run dev` serves the same AI handler through Vite middleware, including local
demo uploads. `npm run preview` serves only static files and cannot prepare new
fish; use the development server or the deployed Vercel site for uploads.

The deployed demo does not allow paid AI requests without a valid shared room.
The database limits shared rooms to 10 analysis attempts per 10 minutes and the
deployment to 200 per rolling day, with concurrent-safe reservations. Failed
attempts also count. These are basic MVP spending safeguards, not a substitute for
setting a credit limit on the OpenRouter key and Vercel abuse/firewall controls.
The service requests providers that do not collect data (`data_collection: deny`);
model/provider availability depends on those settings.

## Using it

- Draw a fish on plain white paper. A dark, closed outline and bright colors
  give the best cutout. Leave some paper around the fins.
- Take a well-lit photo from straight above. Avoid hands, table edges, and
  other drawings in the frame.
- AI automatically locates the fish and rotates it for upright, horizontal swimming.
  Adaptive, edge-connected paper removal creates the transparent cutout while
  preserving closed white details. No crop or direction controls.
- Check the cutout preview and optionally give the fish a name. If the AI missed
  part of the drawing, choose a clearer photo or explicitly retry preparation.
- Release the fish. The laptop polls every three seconds and downloads only
  drawings it has not loaded before. Refreshing retains the aquarium.
- Use **Full screen** for an unobstructed view. Escape exits browser fullscreen.
  Bookmark the aquarium URL; this browser also remembers the last created room.

## Printable coloring sheets

Open **Print coloring sheets** on the homepage (or `/?view=coloring`).
Six original vector fish have closed black outlines, large coloring areas, clear
eyes, fins, and tails. Print all six on landscape A4, one fish per page, or save a
PDF through the print dialog. Disable browser headers/footers and use 100% scale.
Individual SVG downloads are also available under `public/coloring/`.

Keep the surrounding paper white and the outline visible. Photograph a single
colored sheet from above in good light, with all fins visible. The sheets are
designed to help recognition, not to guarantee it; always check the AI preview.

The aquarium uses an original AI-generated reef illustration at
`public/reef-background.jpg`, with an open-water center and no baked-in fish.
The same background appears in the homepage preview and shared/demo aquariums;
the drawings and bubbles are animated separately in Three.js.

## MVP limits and privacy

- Each aquarium accepts **40 uploaded drawings**. The local demo also has three
  original starter drawings.
- Selecting a photo sends a resized JPEG (at most 1600 pixels on its longest side)
  through the Vercel function to **OpenRouter and its selected AI provider**.
  Do not photograph faces, names, or other personal details. Consult their
  data-processing policies before using children's artwork.
  Photos are not stored by this application's server, and photo data/API keys are
  not logged. Only the approved PNG cutout, name, aspect ratio, and orientation
  are stored in Supabase. Cutouts are at most 600 pixels on their longest side and 700 KB
  including base64 encoding. The input photo limit is 25 MB.
- Supabase's database stores the PNG data directly for simple MVP deployment.
  Full-size image storage, realtime subscriptions, and a management UI can be
  added later if needed.
- **The aquarium link is its access key.** Anyone with it can view and add fish.
  Share it only with trusted people. There are no accounts or public room lists.
  Sharing an upload link also grants viewing access.
- Data persists until the Supabase project owner removes it. There is no
  automated expiration or in-app deletion in this MVP. To delete a room, delete
  its row in the `tanks` table using Supabase's Table Editor; its fish cascade-delete.
- Anonymous tank creation has a 1,000-room deployment cap and per-tank uploads
  are capped/validated server-side. This is intended for a small, trusted-family
  deployment, not a large public service. Public launch needs additional abuse
  controls, storage budgeting, deletion/retention UX, and a privacy policy.
- AI crop detection and automatic paper removal are approximate, not a
  pixel-perfect segmentation model. Use plain, light paper and a closed dark outline.
  Strong shadows, perspective, crowded photos, or unusual drawings can yield
  imperfect cutouts; the preview is authoritative. AI does not redraw or recolor
  the fish, and white interiors are preserved. JPEG and PNG are the most portable inputs; unsupported
  phone formats show an error rather than uploading a broken fish.
- Requires a WebGL-capable browser. Fish are readable 2D artwork moving in a
  Three.js scene, not anatomically modeled 3D animals.
- Fonts are loaded from Google Fonts with local fallbacks. Fish/photo data is
  not sent there.

## Commands

```sh
npm run dev      # development server
npm run build    # TypeScript check and production build
npm run preview  # serve the production build locally
```

Inspired by the idea behind
[MrMoT9I/paper-aquarium](https://github.com/MrMoT9I/paper-aquarium), with an
independent implementation, original sample artwork, and no borrowed fish models
or assets.
