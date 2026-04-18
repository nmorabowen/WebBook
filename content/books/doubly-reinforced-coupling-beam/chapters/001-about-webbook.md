---
id: c38bdeb1-75ed-447c-b7b9-db37c64c145d
title: About WebBook
slug: about-webbook
createdAt: '2026-03-03T03:05:00.000Z'
updatedAt: '2026-04-18T19:41:55.434Z'
publishedAt: '2026-03-03T03:05:00.000Z'
routeAliases:
  - kind: chapter
    location: webbook-handbook/about-webbook
kind: chapter
bookSlug: doubly-reinforced-coupling-beam
order: 1
summary: 'What WebBook is, why it exists, and how the main parts fit together.'
status: published
allowExecution: false
fontPreset: source-serif
---
# About WebBook

WebBook is a markdown-first writing and publishing system designed for technical books and notes. The project combines the feel of a notebook or handbook with features that are usually spread across several different tools.

## Core idea

The source of truth is plain markdown stored on disk. The editor adds a comfortable writing surface, but the stored content remains simple files that can be backed up, exported, versioned, and restored.

That model gives WebBook several practical advantages:

- content is easy to move between machines
- backups are simple because there is no database dependency
- books and notes can be published as clean HTML pages
- operations such as export, import, duplication, and restore are predictable

## Main surfaces

WebBook has two primary surfaces.

### Public reading room

The public side presents published books and notes in a book-like layout. Readers can navigate chapters, use the outline, follow wiki links, view MathJax equations, inspect code blocks, and run allowed Python cells where execution is enabled.

### Authoring desk

The authoring side is the editor workspace. It is where books, chapters, and notes are created, reordered, styled, and published. The authoring desk also provides access to:

- general settings
- access and user management
- shortcuts
- typography controls
- media management
- revisions and restore flows

## Content model

WebBook stores three main content types:

- books
- chapters
- standalone notes

A book contains ordered chapters. Notes are independent pages that can still participate in search, wiki links, backlinks, and export/import.

## Why this project exists

WebBook is aimed at authors who want:

- markdown authoring
- notebook-style public presentation
- technical writing with equations and code
- self-hosted control over content and deployment

For a feature-level overview, continue with [[core-functions]].
