# image-carousel

v2 of the pasted-image preview: one thumbnail above Pi's prompt with a two-arrow navigator across the pasted `[Image N]` labels.
Builds on v1 (`feat/image-label-links`, commit 7344e99). Branch: `feat/image-carousel`.

## Specs

- S1: "al pegar la imagen se muestre una pequeña vista previa sobre el cuadro de prompt"
- S2: "añadir un navegador de 2 flechas con la etiqueta de la imagen que se está mostrando, de esta forma solo se visualiza la miniatura de una sola imagen y con el navegador se desplaza entre las que estén pegadas"
- S3: Navigation (user choice "Sigue al cursor + atajo"): "Muestra la imagen recién pegada y, si el cursor está junto a un [Image N], esa. Además Ctrl+Shift+←/→ pasa a la anterior/siguiente. Funciona aunque el terminal se coma el atajo."
- S4: Legend: "colocaría el texto y la navegación debajo de las imagenes en lugar de arriba" and "mejoraría esa leyenda para hacerla más compacta y estética" (replaces the header `‹  [Image 2] · 2/3  ›     Ctrl+Shift+←/→` above the thumbnail).
- S5: "eliminaría el Open image de debajo de la imagen para que no entre en conflicto" (the thumbnail gets no Open image link).

## Tasks

- T1 [S1,S3] labels.ts exposes draft entries in text order, the label at the cursor and the last pasted id — inline — done (101 tests pass), commit: fad7ad3
- T2 [S2,S3,S4] carousel.ts: selection state (paste, cursor, shortcut events) and widget component (header + one Image thumbnail, text fallback) — inline — done (110 tests pass), commit: fad7ad3
- T3 [S1-S4] index.ts wiring (aboveEditor widget, Ctrl+Shift+←/→ shortcuts, PI_IMAGE_PREVIEW=0 opt-out, status), README, CHANGELOG — inline — done (119 tests pass), commit: fad7ad3
- T5 [S4,S5] Legend below the thumbnail, compact and styled; no Open image link on the thumbnail — inline — commit: see L8
- T4 [S1-S5] Manual check in Orca and another terminal — user — pending

## Log

- L1: "Quiero que preparemos un nuevo feat para nuestro plugin, probaremos varias versiones según lo que sea más viable y de menos probelmas, el preoblema que busco solucionar es que al momento de pegar una imagen no tienes forma de visualizar de forma rápida la misma, por lo que puedes olvidar la imagen que has pegado o simplemente mandar una captura erronea, para este feat tengo de primeras varias ideas, para empezar que al pegar la imagen se muestre una pequeña vista previa sobre el cuadro de prompt y conforme se vayan pegando imagen se vayan mostrando al lado una de la otra, esta versión quizás sea más compatible fuera de Orca para pi. La otra opción que barajo es que al pasar el ratón por encima de la etiqueta que formamos de [imagen 1] aparezca una vista previa con Orca o se pueda abrir la imagen a modo de enlace."
- L2: v1 (label links + `/orca-images open N`) implemented, tested by the user in Orca: "Vale, funciona perfectamente, puedes continuar".
- L3: Evidence: pi-tui tracks only the first Kitty sequence per line (terminal-image.js `.exec`), so side-by-side thumbnails in one row are unsafe. Mouse clicks cannot reach the app without mouse tracking, so arrows are keyboard-driven. Ctrl+Shift+←/→ is unbound in Pi's default keybindings.
- L4: User: "Se me ocurre algo mejor que quizás sea técnicamnete más compatible, añadir un navegador de 2 flechas con la etiqueta de la imagen que se está mostrando, de esta forma solo se visualiza la miniatura de una sola imagen y con el navegador se desplaza entre las que estén pegadas". Navigation choice: "Sigue al cursor + atajo (Recomendada)".
- L5: T1-T3 committed together in fad7ad3 (558 lines incl. tests and docs, over the ~400-line slice; one behavior, kept as one unit). Native assess: medium, review not due. Waiting on T4 manual check by the user.
- L6: Native review (resilience + reliability) found 3 CRITICAL: thumbnail cache keyed by path showed a stale image for a re-pasted overwritten file; `open N` resolved labels deleted from the draft. Fixed in d0dd471 (cache keyed by label id + path; pathOf and the sent map use only labels present in the text). Validator approved; authority acknowledged. Advisory warnings R3-002 (src/labels.ts:152) and R4-003 (src/carousel.ts:77) left as follow-ups.
- L7: User after testing v2: "Vale, me gusta, solo qeu colocaría el texto y la navegación debajo de las imagenes en lugar de arriba y además eliminaría el Open image de debajo de la imagen para que no entre en conflicto. [screenshot of the header `‹  [Image 3] · 3/3  ›   Ctrl+Shift+←/→`] por último mejoraría esa leyenda para hacerla más compacta y estética"
