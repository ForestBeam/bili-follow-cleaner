# Store listing · English

## Basics

- Name: Follow List Cleaner
- Short description (≤132 chars):

  Tidy up your Bilibili following list: grid multi-select, paced bulk unfollow, undo in one click. Non-official, no backend.

- Category: Productivity
- Language: English (add as a locale alongside the Simplified Chinese listing)
- Homepage: https://github.com/ForestBeam/bili-follow-cleaner
- Support: https://github.com/ForestBeam/bili-follow-cleaner/issues
- Privacy policy: https://github.com/ForestBeam/bili-follow-cleaner/blob/main/PRIVACY.md

## Detailed description

Follow List Cleaner helps you tidy up the accounts you follow on Bilibili: pick accounts one by one in an avatar grid, review the list before anything happens, then run it with visible progress — pausable, resumable, and reversible.

### Features

- Avatar grid with nickname search and Bilibili group filters
- Review screen: see the complete list before acting; unfollowing does not notify anyone
- Random pacing with automatic slowdown when the platform signals rate limiting, plus a circuit breaker after repeated failures
- Pause, abort, and resume: unfinished work continues after a page reload without repeating finished items
- Undo: the finish screen offers "Re-follow these N accounts"
- Protection list: manually locked accounts plus Bilibili "Special follow" are never selected
- Recent-follow exclusion: accounts followed within the last 7 days are skipped by default
- Operation log: a plan-and-result snapshot is saved before each run and can be exported as JSON / CSV
- Finish screen report card: shows what this run did and lets you copy a share-ready summary

### How to use

1. On any Bilibili page, click the toolbar icon to open the panel (click again to close)
2. Search or filter, select accounts, then continue to the confirmation screen
3. Click "Unfollow N accounts"; you may close the panel, the task keeps running on the page
4. A system notification appears when it finishes; use "Re-follow" to undo

### Privacy

- No backend, no analytics, no third-party SDK: every request goes to `*.bilibili.com` only
- All data stays in your own browser (`chrome.storage.local`) and is removed when you uninstall
- The extension uses your existing browser login; it never reads your password or cookie contents

### Disclaimer

This is an unofficial tool, not affiliated with or endorsed by Bilibili. Bulk unfollowing may trigger platform rate limits; defaults are conservative on purpose. Start small and follow Bilibili's terms of service.

### About the author

Built by ForestBeam. Open source (MIT): https://github.com/ForestBeam/bili-follow-cleaner . The panel footer and the settings "About & feedback" section link to the project home and issue tracker; links only open when the user clicks them, and the extension itself makes no external requests.
