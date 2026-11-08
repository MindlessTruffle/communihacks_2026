Generate game UI icons for "Royal Concerns" (a cozy kingdom life-skills game for adults with developmental disabilities).

STYLE: use the attached reference screenshots ONLY as a style guide: hand-drawn cartoon look, thick uneven black ink outline (~8% of icon size),
flat bright fill colours with one simple darker shade, slightly wobbly shapes, friendly and chunky, readable at 48px.
Do NOT copy any specific icon or character from the references - every icon must be an original drawing.
Each icon: square 256x256 PNG, TRANSPARENT background, centred, ~10% padding, no text, no drop shadow box.

Save each file into public/ui/icons/ with exactly these names:
- people.png        : simple person bust (head + shoulders), royal blue (#2f6fd6)
- happy.png         : round green blob creature with a big smile (#3fae49)
- sad.png           : same green blob, sad face
- coin.png          : gold coin seen at a slight angle, with a rim (#f2b627)
- sun.png           : smiling cartoon sun (day phase)
- lantern.png       : glowing paper lantern (evening phase)
- moon.png          : crescent moon with a small star (night phase)
- check.png         : bold white check mark with black outline (goes on a green round button)
- cross.png         : bold white X with black outline (goes on an orange square button)
- speaker.png       : speaker with sound waves (replay voice)
- gear.png          : settings gear
- crown.png         : gold crown with gems
- house.png         : small cottage (summary card)
- vault.png         : bank vault door (savings)
- jar.png           : glass jar with coins (savings goal)
- crystal.png       : blue crystal with a lock (locked savings / GIC)
- hammer.png        : hammer and anvil (guild job)
- chart.png         : rising chart arrow on a scroll (shares)
- chest.png         : treasure chest (tax-free savings)
- card.png          : golden merchant card (credit card)
- shield.png        : shield (insurance)
- tree.png          : small tree with coins as fruit (RDSP future savings)
- book.png          : school book (RESP)
- cottage.png       : cozy retirement cottage with a rocking chair (pension)

Use your image generation tool for each icon, then post-process if needed so the background is transparent (Python + Pillow is available).
When finished, write public/ui/icons/index.json listing the generated file names. Do not modify any other files.
