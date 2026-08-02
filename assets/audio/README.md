# Audio assets — provenance and licensing

## `anchors-aweigh.mp3`

**"Anchors Aweigh"** — the fight song of the United States Naval Academy and
the unofficial march of the US Navy.

| | |
|---|---|
| Composer | Charles A. Zimmermann (1861–1916), bandmaster, US Naval Academy Band |
| Composed | 1906 |
| Performer | United States Navy Band |
| Recorded | 1993, Zimmermann's original 1906 arrangement |
| Source | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Anchors_Aweigh,_Modern_1993_Recording.oga), sourced from the [Library of Congress](https://www.loc.gov/item/ihas.100010415/) |
| Status | **Public domain** |

### Why it is public domain

Two independent grounds, both of which have to hold for a recording to be
freely usable — the composition and the performance are separately
copyrightable, and it is common to clear one and not the other:

1. **The composition.** Published in 1906, i.e. before 1 January 1931, so US
   copyright has expired. Zimmermann died in 1916, which also clears the
   life-plus-70 term used in most other jurisdictions.
2. **The recording.** Performed by the United States Navy Band. Works created
   by US federal government employees in the course of their duties are not
   eligible for copyright protection in the United States.

Wikimedia Commons records the file's licence as "Public domain" in both the
`LicenseShortName` and `UsageTerms` fields of its metadata.

### Processing applied

Downloaded as Ogg Vorbis (4.1 MB, 2:43, ~203 kbps) and transcoded to MP3 for
browser compatibility — Safari does not reliably decode Ogg Vorbis:

```
ffmpeg -i anchors-aweigh.oga -codec:a libmp3lame -b:a 96k -ar 44100 -ac 2 anchors-aweigh.mp3
```

96 kbps keeps the file under 2 MB, which matters because it is served from
GitHub Pages and fetched on first play. No other edits were made; the audio is
otherwise unmodified.

### A note on the other tracks

This is the only binary audio asset in the project. The other two tracks —
`chip` (NES-style 2A03 synthesis) and `naval` (an ambient sonar drone) — are
generated at runtime by `src/chiptune.js` and `src/audio.js` respectively, and
ship as code rather than files. All sound effects are synthesized too.
