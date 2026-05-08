// Mock for mjml v5 that avoids ESM dynamic imports incompatible with Jest CJS
// FEATURE: Test infrastructure for email template rendering

const mjml2html = async (input: string) => {
  if (!input) throw new Error('mjml input is required');
  if (input.includes('mj-invalid-tag')) {
    return { html: '<p>partial</p>', errors: [{ message: 'Unknown tag: mj-invalid-tag' }] };
  }
  return { html: `<!doctype html><html><body>${input}</body></html>`, errors: [] };
};

module.exports = mjml2html;
module.exports.default = mjml2html;
