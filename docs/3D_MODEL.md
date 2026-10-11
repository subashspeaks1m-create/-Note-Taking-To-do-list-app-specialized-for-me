# Your 3D character

`src/assets/models/subash-wardrobe.glb` is the web copy of Prem's Blender master
`subash-wardrobe.blend` (Realism Wardrobe v6). One body, one 53-bone skeleton, the
`Idle` animation and all 14 outfits as `outfit_<id>` nodes. Each outfit lists the
body parts it covers in `hides`; helmet, mask and cowl pieces carry `helmet: true`
and hide the head when worn.

Where it shows:

- **Vault**: drag to turn, Front/Left/Back/Right, Face close-up, Fit, Auto-rotate,
  and Mask for the outfits that have one (Web Runner, Symbiote, Arc Armor, Dark
  Knight, Flame Rider).
- **Character page**: you in today's outfit, standing on the rune platform and
  turning with it. The 2D portrait shows while the model loads, and stays if the
  device has no WebGL.

## Web copy

| | Blender export | In the app |
|---|---|---|
| File | 35.0 MB | 8.3 MB |
| Triangles | 2.76 M | 1.80 M |
| Textures | 13 PNG, 20 MB | 13 WebP, 1.3 MB |

Changes: textures to WebP at most 1024 px (the face texture kept at full size),
Draco geometry without stored tangents (Three.js derives them), and every third
hair strand kept; the hair shell underneath fills the gaps, and a face close-up
looks the same. To redo it after a new export, see `tools/optimize-model.mjs`.

The model is downloaded the first time the Vault or Character page opens and then
cached for offline use.

## Known limits (from the kit's own notes)

Face shape is estimated from three photos and the face texture is AI-assisted, so
likeness isn't exact. No facial expressions. The neck is a simple shape. Costume
folds are prototypes, not sculpted game assets. Phone frame rate is untested on a
real device.

## Credits

Body, skin and most clothing bases: MakeHuman community and MPFB (CC0). Hoodie,
athletic tank and untucked shirt bases: Elvaerwyn (CC-BY, credited in the Vault).
Face from Prem's photos, with Google's canonical face topology (Apache-2.0).
Costume details were modeled by script; they are inspired by, not copied from,
GTA, Marvel or DC assets. Full list: `ASSET-CREDITS.md` in the Realism Wardrobe v6
folder.
