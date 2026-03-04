---
title: Shortcuts Guide
slug: shortcuts-guide
createdAt: '2026-03-03T15:25:00.000Z'
updatedAt: '2026-03-03T15:25:00.000Z'
publishedAt: '2026-03-03T15:25:00.000Z'
kind: chapter
bookSlug: webbook-handbook
order: 8
summary: 'How keyboard shortcuts work in the markdown editor and how to remap them.'
status: published
allowExecution: false
fontPreset: source-serif
---
# Shortcuts Guide

WebBook includes keyboard shortcuts for the markdown source editor so common formatting actions do not require constant toolbar clicks.

## Where shortcuts apply

The current shortcut system applies to the markdown source editor inside the authoring desk.

It does not currently target:

- the public reading page
- the live preview pane
- browser-level global shortcuts outside the editor

## Default shortcuts

The current defaults are:

- `Ctrl+B` for bold
- `Ctrl+I` for italic
- `Ctrl+E` for inline math
- `Ctrl+Shift+E` for block math
- `Ctrl+Shift+I` for image insertion
- `Ctrl+Z` for undo
- `Ctrl+Y` for redo

These defaults are chosen to stay close to familiar editor conventions.

## What each shortcut does

### Bold

`Ctrl+B` wraps the selected text in markdown bold markers.

Example:

```md
**selected text**
```

### Italic

`Ctrl+I` wraps the selected text in markdown italic markers.

Example:

```md
*selected text*
```

### Inline math

`Ctrl+E` wraps the current selection in inline math delimiters.

If nothing is selected, it inserts an empty inline math wrapper so you can type directly into it.

Example:

```md
$K u = f$
```

### Block math

`Ctrl+Shift+E` inserts or wraps a display equation block.

Example:

```md
$$
K u = f
$$
```

### Image insertion

`Ctrl+Shift+I` opens the image insertion flow for the markdown editor.

This is why `Ctrl+I` stays reserved for italic.

### Undo and redo

`Ctrl+Z` moves to the previous editor snapshot.

`Ctrl+Y` reapplies the next snapshot.

## How to remap shortcuts

WebBook includes a dedicated shortcut settings page in the authoring desk:

- `Authoring desk`
- `Shortcuts`

That page lets you:

- see the current bindings
- record a new shortcut for an action
- save the edited mappings
- restore the defaults

## How recording works

When you click `Record` on a shortcut:

1. WebBook enters capture mode for that action.
2. You press the key combination you want.
3. The shortcut is assigned if it is valid and not already taken.
4. Press `Escape` to cancel recording.

## Conflict handling

If you try to assign a shortcut that is already used by another action, WebBook blocks the change and shows a message explaining the conflict.

That prevents two editor actions from sharing the same key combination.

## Storage model

Shortcut mappings are stored per signed-in user on the current device. That means:

- your mapping can differ from another user's mapping
- your mapping can differ between machines
- restoring defaults only affects the current saved local mapping

## Recommended usage

For the smoothest editing workflow:

1. Keep bold, italic, undo, and redo close to the defaults.
2. Reserve `Ctrl+E` and `Ctrl+Shift+E` for math if you write technical content often.
3. Use the toolbar when learning the system, then switch to shortcuts once the flow feels natural.

## Practical example

A common technical editing sequence could look like this:

1. Type a sentence.
2. Use `Ctrl+E` to insert inline math.
3. Use `Ctrl+Shift+E` for a larger derivation.
4. Use `Ctrl+B` to emphasize an important term.
5. Use `Ctrl+Shift+I` to add a figure.

That gives a very fast writing flow without leaving the keyboard.
