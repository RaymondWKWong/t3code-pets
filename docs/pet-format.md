# T3 Pet package format

A `.t3pet` file is a ZIP archive containing inert data only. Executable code, nested archives, remote references, directories, and undeclared files are rejected.

## Archive layout

```text
pet.json
spritesheet-left.webp
spritesheet-right.webp
thumbnail.webp
```

Archives may contain at most 16 entries, 25 MiB of compressed data, and 64 MiB after extraction. Paths must be unique, relative, slash-separated basenames without traversal. Symlinks, encrypted entries, absolute paths, and executable permission bits are rejected.

## Manifest

```json
{
  "schemaVersion": 1,
  "id": "romeo-golden-british-shorthair",
  "displayName": "Romeo - Golden British Shorthair",
  "description": "Romeo, the golden British Shorthair, supports you throughout your work as a faithful workspace companion.",
  "petVersion": "1.0.0",
  "spriteVersionNumber": 2,
  "atlases": {
    "left": "spritesheet-left.webp",
    "right": "spritesheet-right.webp"
  },
  "thumbnail": "thumbnail.webp",
  "timingProfile": "codex-v2"
}
```

Objects are strict and unknown fields fail validation. IDs use lowercase ASCII letters, digits, and hyphens. `petVersion` is semantic versioning. File fields are safe basenames, and the timing profile is currently fixed to `codex-v2`.

## Sprite v2

Both atlases must be WebP images measuring 1536 by 2288 pixels. Each contains an 8 by 11 grid of 192 by 208 pixel cells.

Rows have these standard meanings:

1. idle
2. running right
3. running left
4. waving
5. jumping
6. failed
7. waiting for the user
8. working
9. review
10. pointer directions 0 through 7
11. pointer directions 8 through 15

The `left` atlas is used while the pet occupies the left side and should face into the workspace. The `right` atlas is its inward-facing counterpart. Runtime midpoint hysteresis prevents flicker while the pet is near the centre.

## Deterministic packaging

Builders must sort entries lexically, use a fixed timestamp, and preserve fixed permissions and compression settings. Rebuilding unchanged sources must produce identical bytes and SHA-256. Validate the completed archive before publishing it.

The stable validator reports bounded issue codes for manifest, path, archive, WebP, and atlas failures. A failed import never partially changes IndexedDB.
