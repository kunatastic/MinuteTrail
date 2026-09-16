# MinuteTrail website

A static landing page and privacy policy. No build, JavaScript, external fonts,
analytics or runtime dependencies. Artwork is local SVG. Paths are relative, so
the site works at a domain root or a project subdirectory.

## Preview

From the repository root, run `python3 -m http.server 8080 --directory site`, then
open `http://localhost:8080`. This is a development preview, not a deployment.

## Publish

### Vercel

1. Commit and push `site/` to the GitHub repository.
2. In Vercel, choose **Add New → Project** and import `kunatastic/MinuteTrail`.
3. Set **Framework Preset** to **Other** and **Root Directory** to `site`.
4. Override **Build Command** and leave it empty. Set **Output Directory** to
   `.` (relative to `site`). No install command or environment variables are needed.
5. Deploy. Use the production domain, not a temporary preview URL, for the store:
   `https://your-project.vercel.app/privacy.html`.
6. Check that the homepage and policy open in a signed-out/private browser window.
   The policy must be publicly accessible, without a Vercel login requirement.

These are the static HTML settings described in
[Vercel's build configuration documentation](https://vercel.com/docs/builds/configure-a-build).

### Other static hosts

Deploy the contents of `site/` to a static host; use `site` as the publish directory
and leave the build command empty. The public policy will be at
`https://YOUR-HOST/privacy.html` (or under your site's project path). Verify the
page loads without authentication before entering its URL in the Chrome Web Store
Developer Dashboard. Creating these files does not enable hosting or publish them.

For GitHub Pages, publish only this folder as the Pages artifact using a deployment
workflow, or place its contents on a dedicated Pages branch. Do not publish the
extension source folder as the site's root. No deployment workflow is enabled here.

## Before the store listing goes live

- Replace the GitHub installation CTA and the two coming-soon messages in
  `index.html` with the actual Chrome Web Store listing link once it exists.
- Verify the maintainer/contact link and hosting disclosure in `privacy.html`.
  If using a host other than GitHub Pages, identify that host and link its policy.
- Keep the store's privacy declarations consistent with the current extension.
  The existing store drafts still mention the removed clear-history and profile
  labeling features; those drafts need correction before submission.
- The policy includes locally processed hostnames/timestamps, permissions,
  recovery backups, retention, removal instructions, and Limited Use. Keep it
  aligned with code changes; do not replace it with an inaccurate blanket
  claim that the extension processes no data.

References checked September 16, 2026:
[Chrome Web Store privacy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy)
and [user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
