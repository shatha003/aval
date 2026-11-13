export const short = (s: string, head = 10, tail = 4) => (s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);

/** Last chars of a did:key / urn are the distinctive ones. */
export const tag = (s: string) => {
  const last = s.split(":").pop() ?? s;
  return `${last.slice(0, 6)}…${last.slice(-4)}`;
};

export const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;

export const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();

/** Reason codes read better as words. */
export const words = (code: string) => code.toLowerCase().replace(/_/g, " ");
