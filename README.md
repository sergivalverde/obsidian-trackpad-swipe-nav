# Trackpad Swipe Navigation

> [!WARNING]
> **Alpha version for my personal use.** This plugin is not in the list of
> Obsidian community plugins. It can change or stop working at any time.
> Use it at your own risk.

An Obsidian plugin for macOS. A two-finger horizontal swipe on the trackpad
goes back or forward, the same as in Safari.

- Swipe right: go back.
- Swipe left: go forward.

The swipe works in notes and in the Obsidian web viewer.

## How it works

The plugin reads the trackpad scroll events. A swipe is one series of
scroll events, with gaps of less than 250 ms between them. The plugin
moves one page for each swipe. Thus the scroll events that come after you
lift your fingers do not move a second page.

The plugin moves a page only when these conditions are true:

- The horizontal movement is 120 px or more.
- The horizontal movement is two times the vertical movement or more.
- The swipe does not start in an element that can scroll horizontally, such
  as a wide table, a code block or a wide web page. That element scrolls.
- The Ctrl key is not down. Thus a pinch to zoom does not move a page.

Scroll events on a web page do not go to Obsidian. Thus the plugin adds a
small script to each web viewer page. The script finds the swipe and sends a
message to the plugin.

The plugin uses the Obsidian commands "Navigate back" and "Navigate forward".

## Install

### With BRAT

1. Install the BRAT community plugin.
2. In BRAT, select **Add beta plugin**.
3. Type `sergivalverde/obsidian-trackpad-swipe-nav`.
4. Turn on **Trackpad Swipe Navigation** in **Settings → Community plugins**.

BRAT installs the latest release. All releases are alpha versions.

### By hand

1. Make the folder `<vault>/.obsidian/plugins/trackpad-swipe-nav/`.
2. Copy `main.js` and `manifest.json` from the latest release into that folder.
3. Restart Obsidian.
4. Turn on **Trackpad Swipe Navigation** in **Settings → Community plugins**.

## Settings

The plugin has no settings screen. To change the limits, edit these values at
the top of `makeDetector` in `main.js`:

| Value | Default | Effect |
|---|---|---|
| `GESTURE_GAP_MS` | 250 | The maximum gap between the scroll events of one swipe |
| `THRESHOLD_PX` | 120 | The minimum horizontal movement for a swipe |
| `DOMINANCE` | 2 | How much larger the horizontal movement must be than the vertical movement |

## Tests

The tests use the Node.js test runner and need no packages. Use Node.js 18
or later.

```sh
npm test
```

The tests give the swipe detector a fake clock and fake scroll events. They
check these items:

- The swipe direction: a swipe to the right goes back.
- One long swipe moves one page only, also with the scroll events after the swipe.
- A gap of more than 250 ms starts a new swipe.
- The minimum movement of 120 px, and the horizontal-to-vertical ratio.
- A pinch to zoom does nothing.
- Elements that can scroll horizontally scroll before a page moves.
- The web viewer script sends one message for each swipe, also when Obsidian
  adds it two times.
- The plugin runs the correct Obsidian commands.

The tests do not use Obsidian or a real trackpad. After a change, try a swipe
in a note and in the web viewer.

## Release

1. Run `npm test`.
2. Increase `version` in `manifest.json` and `package.json`, and add the
   version to `versions.json`. Keep the `-alpha` suffix while the plugin is
   for personal use.
3. Make a GitHub release. The tag is the version, without `v` (for example `0.1.0-alpha`).
4. Attach `main.js` and `manifest.json` to the release.
