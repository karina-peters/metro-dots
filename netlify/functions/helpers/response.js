const LIVE_REFRESH_INTERVAL = 4;

export const OK = (data) =>
  Response.json(
    { data },
    {
      headers: {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Netlify-CDN-Cache-Control": `public, s-maxage=${LIVE_REFRESH_INTERVAL}`,
      },
    },
  );

export const Error = (status, message) => Response.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
