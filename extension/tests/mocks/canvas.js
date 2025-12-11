export function createCanvas() {
  return {
    getContext: () => ({
      fillRect: () => {},
      clearRect: () => {},
      getImageData: () => ({ data: [] }),
      putImageData: () => {},
      createImageData: () => [],
      setTransform: () => {},
      drawImage: () => {},
      save: () => {},
      fillText: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      stroke: () => {},
      translate: () => {},
      scale: () => {},
      rotate: () => {},
      arc: () => {},
      fill: () => {},
      strokeRect: () => {},
      measureText: () => ({ width: 0 }),
      transform: () => {}
    }),
    toBuffer: () => Buffer.from(''),
    toDataURL: () => 'data:image/png;base64,',
    width: 0,
    height: 0
  };
}

export const Image = function Image() {};
export const loadImage = async () => ({});
