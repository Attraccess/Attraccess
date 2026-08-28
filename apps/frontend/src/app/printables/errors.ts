/**
 * Stable, machine-readable reason code for a render that produced no output at all — e.g. a
 * label made entirely of glyphs the vendored Liberation Sans lacks (emoji, CJK, ...), which
 * yields an empty letters object and OpenSCAD writes nothing to /out.stl.
 *
 * This is NOT user-facing prose: it carries no internal detail (like the OpenSCAD part name)
 * and is not translated by the worker, because the worker has no access to i18n. Callers map
 * it to a translated message; see `errorNoOutput` in en.json/de.json.
 *
 * Kept in its own module (rather than in openscad.worker.ts) so UI code can import it as a
 * normal value without pulling the worker's module graph — which also imports the raw .scad
 * source — into the main bundle.
 */
export const NO_OUTPUT_ERROR = 'no-output';
