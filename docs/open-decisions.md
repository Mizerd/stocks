# Open decisions

## Swedbank Robur funds

Status: on hold.

The Robur source is built (`worker/providers/robur.ts`) but left out of `SOURCES` in `worker/funds.ts`.
It reads the full fund list at swedbankrobur.fondlista.se (about 140 funds, e.g. Corp Bond Nordic C).

Why it is off: the list is run by Morningstar, and copying a whole database into a public site
without permission is a risk under the EU database right. Showing a single fund's price is not.

Options:

1. One fund at a time: fetch a fund's daily NAV only when someone searches for it or adds it to My list,
   instead of serving the whole list. Small change, low risk. Recommended.
2. Everything: add `robur` to `SOURCES` in `worker/funds.ts`. One line, slightly higher risk.
3. Ask Swedbank Robur or Morningstar for permission first, then do option 2.

Estonian pension funds (Pensionikeskus, the public register) are already live and not affected.
