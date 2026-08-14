# Font upload fixtures

These files are local inputs for testing the AstroBox font upload and Lua
installer flow. They are not bundled as the JSLab default font.

For `SarasaTermSCNerd-Misans-v2.ttf`, enter the values from its companion JSON
when the AstroBox plugin asks for font data:

- Name: `Sarasa Term SC Nerd`
- Line height ratio: `1.5543`
- Line height offset: `0.4022`
- ASCII width ratio: `0.5`
- Wide character width ratio: `1`

The line-height values come from JSLab's former Sarasa editor calculation:
`fontSize * 1.5543 + 0.4022`. The width ratios preserve the former terminal
font cursor and hit-testing calculation.
