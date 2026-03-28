// In-memory database for the demo app
// BUG: No migration system — schema changes require manual updates

const db = {
  users: [],
  sessions: [],
  records: [
    { id: "rec_1", title: "First record", createdAt: "2026-01-01T00:00:00Z" },
    { id: "rec_2", title: "Second record", createdAt: "2026-01-02T00:00:00Z" },
    { id: "rec_3", title: "Third record", createdAt: "2026-01-03T00:00:00Z" },
  ],
  settings: {
    theme: "light",
    // BUG: no dark mode support
    notifications: true,
    language: "en",
  },
  activities: [],
};

module.exports = { db };
