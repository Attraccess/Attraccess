# Desktop device shell

`attractap.png` is the original 1880 × 3388 front-view CAD render supplied for
the desktop simulator. The build embeds it in the executable, so launching the
app does not depend on the working directory or an external asset path.

The screen and NFC hit area in `src/sdl_display.cpp` are measured against this
image and scaled to the simulator's 500 × 901 logical canvas. Update those
rectangles if the CAD framing changes.

`attractap.icns` is the macOS app icon made from the same render, centered on a
transparent square without cropping or stretching. It includes the standard
16, 32, 128, 256, and 512 point sizes at 1× and 2× resolution. The 1024-pixel
master has 42 pixels of vertical padding on each side. Regenerate the icon from
`attractap.png` and package the PNG iconset with macOS `iconutil` if the render
changes. CMake copies it into the app bundle and sets `CFBundleIconFile`.
