---
id: cad7dcbe-84b1-44c1-aa0e-e8c46cb3c30e
title: Proxmox VPS Recommendations
slug: proxmox-vps-recommendations
createdAt: '2026-03-03T03:05:00.000Z'
updatedAt: '2026-04-18T19:41:55.434Z'
publishedAt: '2026-03-03T03:05:00.000Z'
routeAliases:
  - kind: chapter
    location: webbook-handbook/proxmox-vps-recommendations
kind: chapter
bookSlug: doubly-reinforced-coupling-beam
order: 2
summary: >-
  Recommended Proxmox VM sizing and configuration for running WebBook in
  production.
status: published
allowExecution: false
fontPreset: source-serif
---
# Proxmox VPS Recommendations

WebBook does not need extreme hardware, but it benefits from fast storage and enough headroom for Python execution, image processing, and backups.

## Recommended starting VM

For a comfortable single-instance production deployment on Proxmox:

- `4 vCPU`
- `8 GB RAM`
- `80 GB SSD`

That is the recommended default for:

- the Next.js web app
- the Python runner
- Redis
- Caddy
- local backups
- moderate media uploads

## Smaller personal deployment

If usage is mostly personal or low traffic:

- `2 vCPU`
- `4 GB RAM`
- `40-60 GB SSD`

## Heavier technical usage

If the site will host larger uploads, more runnable Python cells, or heavier concurrent use:

- `6 vCPU`
- `12-16 GB RAM`
- `120+ GB SSD`

## Proxmox-specific recommendations

Use these settings where possible:

- CPU type: `host`
- machine type: `q35`
- disk bus: `virtio-scsi`
- network device: `virtio`
- storage on SSD-backed pools

## Why storage matters most

For WebBook, disk pressure usually appears before CPU pressure because the instance accumulates:

- media uploads
- exported archives
- local backups
- content revisions

If you are unsure where to spend resources, prioritize:

1. reliable SSD storage
2. enough RAM for container headroom
3. moderate CPU allocation

## Practical advice

Start with `4 vCPU / 8 GB / 80 GB`, then observe:

- upload growth
- backup size
- Python execution load
- memory use during deploys

That is usually enough for a serious single-site deployment on a Proxmox host with much larger total capacity.
