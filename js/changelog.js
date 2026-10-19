// What's new — newest first. Add an entry here with every update.
export const CHANGELOG = [
  {
    version: '1.13', date: '2026-10-19', title: 'About page',
    items: ['A public page to show Life Quest off, at /about. Share the link and it shows a proper preview card.'],
  },
  {
    version: '1.12', date: '2026-10-19', title: 'Comics & barcode scanner',
    items: [
      'New Comics section: series, issues, trades and manga, with a reading pile, collection and ratings.',
      'Scan barcodes with your camera on Books and Comics. ISBNs fill in title and cover; single issues pick up the issue number.',
      'Comics count toward Knowledge: 15 XP per comic read.',
    ],
  },
  {
    version: '1.11', date: '2026-10-19', title: 'Fair-use limits',
    items: [
      'Generous limits keep the app healthy for everyone, e.g. 20,000 characters per note and 2,000 notes.',
      'Adding more than 60 entries in a minute asks you to wait a moment.',
    ],
  },
  {
    version: '1.10', date: '2026-10-19', title: 'Support Life Quest',
    items: ['A small "buy me a coffee" note at the bottom of every page.'],
  },
  {
    version: '1.9', date: '2026-10-19', title: 'Prayer times & What’s new',
    items: [
      'Official MUIS prayer times on the Prayer page, with the Hijri date and Syuruk.',
      'The next prayer is highlighted with a live countdown; Home shows it too.',
      'This changelog, with a dot on Settings when there’s something new.',
    ],
  },
  {
    version: '1.8', date: '2026-10-19', title: 'Reorder sections',
    items: ['Up/down arrows in Settings to set the order of your menu and Home.'],
  },
  {
    version: '1.7', date: '2026-10-19', title: 'Settings & Finance',
    items: [
      'Settings: choose which sections you use, plus your name and currency.',
      'Finance: income and spending with categories, monthly budgets and savings goals.',
      'New Wealth stat that rewards the habit, never the spending.',
    ],
  },
  {
    version: '1.6', date: '2026-10-19', title: 'Instant switching',
    items: ['Sections open instantly and refresh quietly in the background.'],
  },
  {
    version: '1.5', date: '2026-10-19', title: 'ISBN lookup',
    items: ['Type an ISBN to fill in a book’s title, author, pages and cover.', 'Covers shown in all book lists.'],
  },
  {
    version: '1.4', date: '2026-10-19', title: 'Daily Awrad',
    items: ['Daily Awrad tracker on the Prayer page, with its own streak.'],
  },
  {
    version: '1.3', date: '2026-10-19', title: 'Jobs',
    items: ['New Job task type with its own section on Tasks.'],
  },
  {
    version: '1.0', date: '2026-10-19', title: 'Life Quest launches',
    items: ['Tasks, prayer, fitness, books, notes, quotes and hobbies, with XP and levels.'],
  },
];

export const LATEST = CHANGELOG[0].version;
const SEEN_KEY = 'lifequest:seen-version';
export function hasUnseen() {
  try { return localStorage.getItem(SEEN_KEY) !== LATEST; } catch { return false; }
}
export function markSeen() {
  try { localStorage.setItem(SEEN_KEY, LATEST); } catch { /* ignore */ }
}
