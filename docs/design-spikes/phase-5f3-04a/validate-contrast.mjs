import assert from 'node:assert/strict';

const pairs = [
  ['Primary text / canvas', '#35101F', '#FFF7F9', 4.5],
  ['Secondary text / canvas', '#6A4C58', '#FFF7F9', 4.5],
  ['Muted text / canvas', '#765B66', '#FFF7F9', 4.5],
  ['Inverse text / inverse surface', '#FFF7F9', '#35101F', 4.5],
  ['Primary action default', '#FFFFFF', '#7A1838', 4.5],
  ['Primary action hover', '#FFFFFF', '#67122F', 4.5],
  ['Primary action pressed', '#FFFFFF', '#541027', 4.5],
  ['Secondary action default', '#7A1838', '#FFF7F9', 4.5],
  ['Secondary action hover', '#67122F', '#F7DDE4', 4.5],
  ['Secondary action pressed', '#541027', '#F0CBD5', 4.5],
  ['Destructive filled action', '#FFFFFF', '#8C1D2C', 4.5],
  ['Error text / error surface', '#8C1D2C', '#FDEDEF', 4.5],
  ['Success text / success surface', '#1F633D', '#EAF7EF', 4.5],
  ['Warning text / warning surface', '#704500', '#FFF3D6', 4.5],
  ['Information text / information surface', '#155E85', '#EAF5FB', 4.5],
  ['Interactive border / surface', '#765B66', '#FFFFFF', 3],
  ['Focus ring / light canvas', '#0B63A5', '#FFF7F9', 3],
  ['Focus ring / dark inverse', '#FFD27A', '#35101F', 3],
  ['Focus ring / brand surface', '#FFD27A', '#7A1838', 3]
];

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

for (const [name, foreground, background, minimum] of pairs) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= minimum, `${name}: ${ratio.toFixed(2)}:1 is below ${minimum}:1`);
  console.log(`${name}: ${ratio.toFixed(2)}:1 (minimum ${minimum}:1)`);
}
