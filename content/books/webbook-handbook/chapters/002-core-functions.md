---
title: Core Functions
slug: core-functions
createdAt: '2026-03-03T03:05:00.000Z'
updatedAt: '2026-03-03T03:05:00.000Z'
publishedAt: '2026-03-03T03:05:00.000Z'
kind: chapter
bookSlug: webbook-handbook
order: 2
summary: 'Feature overview for writing, publishing, media, math, code, and operations.'
status: published
allowExecution: false
fontPreset: source-serif
---
# Core Functions

This chapter summarizes the main capabilities that are already implemented in WebBook.

## Writing and structure

Authors can create:

- books
- chapters
- standalone notes

The authoring desk supports:

- markdown editing
- live preview
- toolbar actions
- keyboard shortcuts
- undo and redo
- source-to-preview navigation aids

## Linking and navigation

WebBook supports Obsidian-style wiki links such as:

- `[[webbook-notes]]`
- `[[webbook-handbook/core-functions]]`
- `[[webbook-handbook/core-functions#writing-and-structure]]`

The system also builds:

- backlinks
- outlines from headings
- search indexes

## Math and technical writing

MathJax is integrated for both inline and display equations. The system supports:

- inline math like `$E = mc^2$`
- display math with `$$ ... $$`
- matrices, aligned environments, tags, and common LaTeX commands
- math command autocomplete in the editor

General settings also allow global MathJax styling, including font, size, color, and inline positioning.

## Code and execution

WebBook supports fenced code blocks with syntax highlighting. It also supports executable Python cells through the isolated Python runner service.

The execution path includes:

- a separate FastAPI runner
- rate limiting
- output capture
- image artifact support through `matplotlib`

## Media and file handling

WebBook supports:

- image upload
- generic file upload
- folder upload as zip
- media management per page
- soft delete for uploaded media

Media can be referenced directly in markdown, and layout blocks can place media beside text when needed.

## Publishing and operations

Operational features include:

- draft or published status
- revision snapshots
- workspace export and import as zip
- deployment scripts for production
- backup and restore tooling

For installation, continue with [[webbook-handbook/installation-guide]].
