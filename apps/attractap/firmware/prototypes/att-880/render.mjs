// Throwaway review artifact builder. It packages real LVGL frames; no image recreation.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, 'output');
const rows = [
  [
    '01-home',
    'Signed out',
    'The familiar list remains. Scan to sign in, or tap a resource to request its details.',
    'Authentication',
  ],
  [
    '02-scan-for-details',
    'Resource first → scan',
    'Opening Lasercutter while signed out asks for a card. Successful authentication opens its details directly. No selected-row highlight.',
    'Authentication',
  ],
  [
    '03-authenticating',
    'Checking the NFC card',
    'A blocking indicator acknowledges the scan immediately. Success follows the entry path; a failed scan returns to sign-in.',
    'Authentication',
  ],
  [
    '04-authenticated',
    'Every row splits',
    'The logo disappears. Logout, username and timeout share one row. Each resource has two flush, equal halves: details left, action right.',
    'Authentication',
  ],
  [
    '05-auth-rejected',
    'Card rejected',
    'Show a clear error, dismiss it and allow another scan. Never expose signed-in actions on a failed login.',
    'Authentication',
  ],
  [
    '06-starting',
    'Start pending',
    'Lasercutter is the action target. The overlay blocks duplicate taps and competing actions until the response arrives.',
    'Quick actions',
  ],
  [
    '07-started',
    'Start confirmed',
    'Stay on the list. The target now says “Von dir verwendet”, Start becomes Stop, and a success message confirms the result.',
    'Quick actions',
  ],
  [
    '08-stopping',
    'Stop pending',
    'This example stops the 3D printer. The feedback names the target; the list remains visible behind the blocking overlay.',
    'Quick actions',
  ],
  [
    '09-stopped',
    'Stop confirmed',
    'The 3D printer returns to available and its action becomes Start. The confirmation identifies the changed resource.',
    'Quick actions',
  ],
  [
    '10-details',
    'Resource details',
    'The left half opens this resource. The same session bar remains. Back returns to the authenticated list without logging out.',
    'Details',
  ],
  [
    '11-project-picker',
    'Choose a project',
    'Project selection stays in details. Quick Start uses no project; a user who needs a project starts from details.',
    'Details',
  ],
  [
    '12-project-selected',
    'Start with a project',
    'The chosen project is visible before starting. This review fixture uses “Regalbau”.',
    'Details',
  ],
  [
    '13-active-details',
    'An active session',
    'Details show the current usage and elapsed time. Stop and configured flow actions remain available.',
    'Details',
  ],
  [
    '14-required-form',
    'Required form',
    'Quick Start must preserve required forms. Present the required step before starting; cancel returns without performing the action.',
    'Forms and supervision',
  ],
  [
    '15-form-ready',
    'Form completed',
    'The required confirmation is present. Start submits the response and resumes the original resource action.',
    'Forms and supervision',
  ],
  [
    '16-form-validation',
    'Incomplete form',
    'Explain the missing requirement inline. Keep the entered data and do not start the resource.',
    'Forms and supervision',
  ],
  [
    '17-supervisor-waiting',
    'Supervisor required',
    'A supervised start keeps the original user and resource. Ask an authorized supervisor to hold their card.',
    'Forms and supervision',
  ],
  [
    '18-supervisor-checking',
    'Checking supervision',
    'Indicate that the supervisor card is being checked. Do not lose the initiating user or switch the action target.',
    'Forms and supervision',
  ],
  [
    '19-supervisor-rejected',
    'Supervisor rejected',
    'A rejected supervisor can retry with another card or cancel. The original user stays signed in.',
    'Forms and supervision',
  ],
  [
    '20-action-error',
    'Action not confirmed',
    'For an uncertain result, reload the authoritative resource status before offering another action. Do not claim success or blindly resend Start.',
    'Recovery and access',
  ],
  [
    '21-door-details',
    'Door details',
    'The door row opens its own controls. The right half offers the common “Öffnen” action; the left half retains lock and unlock controls.',
    'Doors',
  ],
  [
    '22-door-pending',
    'Opening the door',
    'Door commands get the same blocking progress feedback and explicit target as machine actions.',
    'Doors',
  ],
  [
    '23-door-opened',
    'Door command confirmed',
    'Show command confirmation; this does not claim a physical door sensor has reported an open door.',
    'Doors',
  ],
  [
    '24-other-user',
    'Another user is using it',
    'An ordinary user sees “Belegt”. Do not offer Stop for another person without the existing permission. Details stay available.',
    'Recovery and access',
  ],
  [
    '25-takeover',
    'Permitted takeover',
    'Show takeover only when allowed. Keep the consequence explicit in details instead of hiding it behind an ordinary Start button.',
    'Recovery and access',
  ],
  [
    '26-no-introduction',
    'Introduction missing',
    'An unavailable action carries a reason rather than an active Start. Open details to see the introduction guidance.',
    'Recovery and access',
  ],
  [
    '27-maintenance',
    'Maintenance restriction',
    'Details explain the restriction and name the contact. This fixture is an ordinary user, so no start action is offered.',
    'Recovery and access',
  ],
  [
    '28-introduction-details',
    'Introduction guidance',
    'Show why this user cannot start the resource and whom they can contact. Existing supervisor and maintainer exceptions remain separate.',
    'Recovery and access',
  ],
  [
    '29-offline',
    'Reader disconnected',
    'No new authentication or actions while disconnected. The reader shows reconnection progress.',
    'Session and setup',
  ],
  [
    '30-expiring',
    'Five seconds remaining',
    'The timeout is visible on the list as well as in details. Interaction renews the login; waiting expires it.',
    'Session and setup',
  ],
  [
    '31-logged-out',
    'Explicit logout',
    'Return to the unsigned list and remove authenticated controls. Logging out of the reader does not stop an existing resource usage.',
    'Session and setup',
  ],
  [
    '32-expired',
    'Login expired',
    'The idle deadline has passed. Clear login and pending navigation, return to the list and ask for a new scan.',
    'Session and setup',
  ],
  [
    '33-no-resources',
    'No linked resources',
    'Explain that the reader needs configuration. Do not present an empty interactive list.',
    'Session and setup',
  ],
  [
    '34-one-resource',
    'One linked resource',
    'Keep the same two actions, even when there is only one resource. This is a proposed consistency choice to review.',
    'Session and setup',
  ],
];
const states = [];
for (const [id, title, note, group] of rows) {
  const png = await sharp(await fs.readFile(path.join(output, id + '.rgba')), {
    raw: { width: 480, height: 480, channels: 4 },
  })
    .png()
    .toBuffer();
  await fs.writeFile(path.join(output, id + '.png'), png);
  states.push({ id, title, note, group, image: 'data:image/png;base64,' + png.toString('base64') });
}
const escape = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
async function sheet(name, title, subtitle, ids) {
  const width = 1536,
    cell = 496,
    top = 125,
    h = Math.ceil(ids.length / 3) * 560 + top + 24;
  const text = [
    `<svg width="${width}" height="${h}"><rect width="100%" height="100%" fill="#111c20"/><g font-family="Arial, sans-serif" fill="#f4f8f8"><text x="24" y="45" font-size="28" font-weight="bold">${escape(title)}</text><text x="24" y="82" font-size="18" fill="#afc0c3">${escape(subtitle)}</text>`,
  ];
  const layers = [];
  ids.forEach((id, i) => {
    const state = states.find((s) => s.id === id),
      x = 24 + (i % 3) * cell,
      y = top + Math.floor(i / 3) * 560;
    text.push(
      `<text x="${x}" y="${y + 18}" font-size="20" font-weight="bold">${id.slice(0, 2)}  ${escape(state.title)}</text>`,
    );
    layers.push({ input: path.join(output, id + '.png'), left: x, top: y + 38 });
  });
  text.push('</g></svg>');
  await sharp(Buffer.from(text.join('')))
    .composite(layers)
    .png()
    .toFile(path.join(output, name + '.png'));
}
await sheet(
  '01-flow',
  'ATT-880 · Scan → choose an action → see the result',
  'Real LVGL prototype frames · 480 × 480 · simulated data · awaiting design review',
  ['01-home', '04-authenticated', '10-details', '06-starting', '07-started', '09-stopped'],
);
await sheet(
  '02-authentication',
  'Authentication and quick actions',
  'Left half: details · Right half: action · No selected-resource highlight',
  rows.slice(0, 9).map((r) => r[0]),
);
await sheet(
  '03-details-and-forms',
  'Details, projects and required forms',
  'Quick actions preserve the existing prerequisites before executing',
  rows.slice(9, 18).map((r) => r[0]),
);
await sheet(
  '04-access-and-recovery',
  'Supervision, errors, doors and restrictions',
  'Permissions decide the action · pending actions block further input',
  rows.slice(18, 27).map((r) => r[0]),
);
await sheet(
  '05-session-and-setup',
  'Access guidance, connection and session states',
  'Reader logout ends authentication, not the resource usage',
  rows.slice(27).map((r) => r[0]),
);
const template = await fs.readFile(path.join(root, 'viewer.html'), 'utf8');
await fs.writeFile(path.join(output, 'ATT-880-prototype.html'), template.replace('__STATES__', JSON.stringify(states)));
console.log(
  `Rendered ${states.length} native-resolution frames, five screenshot sheets, and a self-contained walkthrough.`,
);
