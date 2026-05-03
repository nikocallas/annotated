// Placeholder Vercel function.
//
// Vercel validates that api/index.js exists before it runs the build command.
// script/build.ts overwrites this file with a bundled Express handler during
// every production build.
export default function handler(_req, res) {
  res.status(503).json({ error: "API bundle was not generated" });
}
