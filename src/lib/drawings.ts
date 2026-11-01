import type { Fish } from './reef';

// Original sample drawings; uploaded fish always use the child's own cutout.
const sketches = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220">
    <g stroke="#723e25" stroke-width="5" stroke-linejoin="round">
      <path d="M254 106 335 49l-8 116-73-47" fill="#ee9d61"/>
      <path d="m131 63 39-47 43 49m-78 91 46 47 37-43" fill="#efb968"/>
      <path d="M27 108C65 26 206 24 274 108c-59 84-209 81-247 0Z" fill="#f3b873"/>
      <path d="m113 53-11 110m50-118-7 125m49-116-9 103" fill="none" stroke="#dc7950" stroke-width="14"/>
      <path d="m285 98 31-25m-30 40 29 20" fill="none" stroke-width="3"/>
      <circle cx="66" cy="92" r="14" fill="#fff4d6"/><circle cx="62" cy="93" r="6" fill="#422f2c" stroke="none"/>
      <path d="m35 121 24 4" fill="none" stroke-width="3"/>
    </g></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="240" viewBox="0 0 340 240">
    <g stroke="#36696b" stroke-width="5" stroke-linejoin="round">
      <path d="m239 116 78-60-3 130-75-58" fill="#81bcb0"/>
      <path d="m115 62 33-44 51 46m-65 109 29 44 47-42" fill="#6fada0"/>
      <path d="M25 120C51 29 215 29 261 122c-43 93-206 88-236-2Z" fill="#acd0ad"/>
      <path d="m138 92 56 33-50 25Z" fill="#72b9ad"/>
      <g fill="#5da394" stroke="none"><circle cx="113" cy="83" r="8"/><circle cx="192" cy="80" r="7"/><circle cx="111" cy="156" r="6"/><circle cx="220" cy="126" r="8"/></g>
      <circle cx="65" cy="107" r="15" fill="#faf0d7"/><circle cx="62" cy="109" r="7" fill="#304e51" stroke="none"/>
      <path d="m35 139 23-2" fill="none" stroke-width="3"/>
    </g></svg>`,
  `<svg xmlns="http://www.w3.org/2000/svg" width="350" height="240" viewBox="0 0 350 240">
    <g stroke="#835953" stroke-width="5" stroke-linejoin="round">
      <path d="m249 118 77-55-7 116-68-48" fill="#d29293"/>
      <path d="m117 65 43-43 48 46m-81 102 39 46 48-42" fill="#e6b5ac"/>
      <path d="M30 121C68 36 221 36 267 123c-50 82-198 80-237-2Z" fill="#edc4b8"/>
      <path d="m109 69 9 103m35-114 9 118m33-101 7 85" fill="none" stroke="#d99e9e" stroke-width="12"/>
      <circle cx="69" cy="109" r="14" fill="#fff1d7"/><circle cx="66" cy="110" r="6" fill="#593d3b" stroke="none"/>
      <path d="m38 138 19-3" fill="none" stroke-width="3"/>
    </g></svg>`,
];

export async function sampleFish(): Promise<Fish[]> {
  return Promise.all(sketches.map(async (svg, index) => {
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Your browser does not support drawing previews.');
    context.drawImage(image, 0, 0);
    return {
      id: `sample-${index}`,
      name: ['Sunny', 'Pickle', 'Peaches'][index],
      image: canvas.toDataURL('image/png'),
      aspect: canvas.width / canvas.height,
      facing: 'left' as const,
    };
  }));
}
