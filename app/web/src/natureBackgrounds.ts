export const NATURE_BACKGROUNDS: string[] = [
  'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1503614472-8c93d56e92ce?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1515612148533-6247582c12c7?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1503424886307-b090341d25d1?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1501908734255-16579c18c25f?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1528184039930-bd03972bd974?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1435732960391-11053ee5e6b6?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1419064642531-e575728395f2?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1494783367193-149034c05e8f?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1682685797365-41f45b562c0a?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1495667789375-0ea23c94f110?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1464852045489-bccb7d17fe39?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1600298882698-312a4137fd33?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1596003903067-bf5762ad5c19?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1439853949127-fa647821eba0?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1472791108553-c9405341e398?fm=jpg&q=60&w=1600&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?fm=jpg&q=60&w=1600&auto=format&fit=crop'
];

let currentBg: string | null = null;

export function getNatureBackground(): string {
  if (!currentBg) {
    currentBg = NATURE_BACKGROUNDS[Math.floor(Math.random() * NATURE_BACKGROUNDS.length)];
  }
  return currentBg;
}