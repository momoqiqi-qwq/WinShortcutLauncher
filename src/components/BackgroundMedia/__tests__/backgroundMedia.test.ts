import { describe, expect, it } from 'vitest';
import {
  detectBackgroundMediaKind,
  inspectBackgroundImageAnimation,
  isAnimatedBackgroundSource,
} from '../BackgroundMedia';

function dataUrl(mime: string, bytes: number[]) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mime};base64,${btoa(binary)}`;
}

function be32(value: number) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function le32(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function ascii(value: string) {
  return Array.from(value, (char) => char.charCodeAt(0));
}

function pngChunk(type: string, data: number[] = []) {
  return [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

function webpChunk(type: string, data: number[] = []) {
  return [...ascii(type), ...le32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
}

describe('background media detection', () => {
  it('does not classify every WebP file as animated', () => {
    expect(isAnimatedBackgroundSource('wallpaper.webp')).toBe(false);
    expect(isAnimatedBackgroundSource('wallpaper.gif')).toBe(true);
    expect(detectBackgroundMediaKind('wallpaper.mp4')).toBe('video');
    expect(detectBackgroundMediaKind('wallpaper.webp')).toBe('image');
  });

  it('detects APNG through the acTL chunk', async () => {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const animated = dataUrl('image/png', [...signature, ...pngChunk('acTL', [0, 0, 0, 1, 0, 0, 0, 0]), ...pngChunk('IEND')]);
    const staticPng = dataUrl('image/png', [...signature, ...pngChunk('IEND')]);
    expect(await inspectBackgroundImageAnimation(animated)).toBe('animated');
    expect(await inspectBackgroundImageAnimation(staticPng)).toBe('static');
  });

  it('detects animated WebP through RIFF animation chunks', async () => {
    const animatedBody = [...ascii('WEBP'), ...webpChunk('ANIM', [0, 0, 0, 0, 0, 0])];
    const staticBody = [...ascii('WEBP'), ...webpChunk('VP8 ', [0, 0])];
    const animated = dataUrl('image/webp', [...ascii('RIFF'), ...le32(animatedBody.length), ...animatedBody]);
    const staticWebp = dataUrl('image/webp', [...ascii('RIFF'), ...le32(staticBody.length), ...staticBody]);
    expect(await inspectBackgroundImageAnimation(animated)).toBe('animated');
    expect(await inspectBackgroundImageAnimation(staticWebp)).toBe('static');
  });
});
