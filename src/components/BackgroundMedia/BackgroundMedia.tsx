import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { BackgroundFit, BackgroundMediaKind } from '../../types';
import './BackgroundMedia.css';

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogv', 'ogg']);
const DEFINITELY_ANIMATED_IMAGE_EXTENSIONS = new Set(['gif', 'apng']);
const INSPECTABLE_ANIMATION_EXTENSIONS = new Set(['png', 'webp', 'apng']);

export type BackgroundImageAnimationStatus = 'animated' | 'static' | 'unknown';

export function sourceExtension(source: string): string {
  const normalized = String(source ?? '').trim().split(/[?#]/, 1)[0] ?? '';
  const fileName = normalized.split(/[\\/]/).pop() ?? '';
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function detectBackgroundMediaKind(source: string, requested: BackgroundMediaKind = 'auto'): Exclude<BackgroundMediaKind, 'auto'> {
  if (requested === 'image' || requested === 'video') return requested;
  const value = String(source ?? '').trim().toLowerCase();
  if (value.startsWith('data:video/')) return 'video';
  if (value.startsWith('data:image/')) return 'image';
  return VIDEO_EXTENSIONS.has(sourceExtension(source)) ? 'video' : 'image';
}

/** Only returns true for formats that can be identified as animated without reading file bytes. */
export function isAnimatedBackgroundSource(source: string): boolean {
  const value = String(source ?? '').trim().toLowerCase();
  if (value.startsWith('data:image/gif')) return true;
  return DEFINITELY_ANIMATED_IMAGE_EXTENSIONS.has(sourceExtension(source));
}

export function resolveBackgroundMediaUrl(source: string): string {
  const trimmed = String(source ?? '').trim();
  if (!trimmed) return '';
  if (/^(data:|blob:|https?:\/\/|asset:|tauri:)/i.test(trimmed)) return trimmed;
  try {
    return convertFileSrc(trimmed);
  } catch {
    return trimmed.replace(/\\/g, '/');
  }
}

function asciiAt(bytes: Uint8Array, offset: number, marker: string): boolean {
  if (offset < 0 || offset + marker.length > bytes.length) return false;
  for (let index = 0; index < marker.length; index += 1) {
    if (bytes[offset + index] !== marker.charCodeAt(index)) return false;
  }
  return true;
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return -1;
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return -1;
  return (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + ((bytes[offset + 3] << 24) >>> 0)) >>> 0;
}

function pngHasAnimationChunk(bytes: Uint8Array): boolean | null {
  if (bytes.length < 8 || !asciiAt(bytes, 1, 'PNG')) return null;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32BigEndian(bytes, offset);
    if (length < 0 || length > bytes.length - offset - 12) return null;
    const typeOffset = offset + 4;
    if (asciiAt(bytes, typeOffset, 'acTL')) return true;
    if (asciiAt(bytes, typeOffset, 'IEND')) return false;
    offset += 12 + length;
  }
  return null;
}

function webpHasAnimationChunk(bytes: Uint8Array): boolean | null {
  if (bytes.length < 12 || !asciiAt(bytes, 0, 'RIFF') || !asciiAt(bytes, 8, 'WEBP')) return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = readUint32LittleEndian(bytes, offset + 4);
    if (size < 0 || size > bytes.length - offset - 8) return null;
    if (asciiAt(bytes, offset, 'ANIM') || asciiAt(bytes, offset, 'ANMF')) return true;
    offset += 8 + size + (size % 2);
  }
  return false;
}

function decodeDataUrl(source: string): Uint8Array | null {
  const match = /^data:[^,]*?(;base64)?,(.*)$/is.exec(source);
  if (!match) return null;
  try {
    if (match[1]) {
      const binary = atob(match[2]);
      return Uint8Array.from(binary, (char) => char.charCodeAt(0));
    }
    return new TextEncoder().encode(decodeURIComponent(match[2]));
  } catch {
    return null;
  }
}

async function readAnimationProbeBytes(source: string): Promise<Uint8Array | null> {
  const trimmed = String(source ?? '').trim();
  if (!trimmed) return null;
  const dataBytes = trimmed.startsWith('data:') ? decodeDataUrl(trimmed) : null;
  if (dataBytes) return dataBytes.subarray(0, 1_048_576);
  try {
    const response = await fetch(resolveBackgroundMediaUrl(trimmed), { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const buffer = await blob.slice(0, 1_048_576).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/** Detect APNG and animated WebP by their container chunks. Unknown is intentionally conservative. */
export async function inspectBackgroundImageAnimation(source: string): Promise<BackgroundImageAnimationStatus> {
  if (isAnimatedBackgroundSource(source)) return 'animated';
  const value = String(source ?? '').trim().toLowerCase();
  const extension = sourceExtension(source);
  const isPng = extension === 'png' || extension === 'apng' || value.startsWith('data:image/png');
  const isWebp = extension === 'webp' || value.startsWith('data:image/webp');
  if (!isPng && !isWebp && !INSPECTABLE_ANIMATION_EXTENSIONS.has(extension)) return 'static';
  const bytes = await readAnimationProbeBytes(source);
  if (!bytes) return 'unknown';
  if (isPng) {
    const animated = pngHasAnimationChunk(bytes);
    return animated === null ? 'unknown' : animated ? 'animated' : 'static';
  }
  if (isWebp) {
    const animated = webpHasAnimationChunk(bytes);
    return animated === null ? 'unknown' : animated ? 'animated' : 'static';
  }
  return 'unknown';
}

function objectFitForBackground(fit: BackgroundFit): CSSProperties['objectFit'] {
  if (fit === 'stretch') return 'fill';
  if (fit === 'contain') return 'contain';
  return 'cover';
}

interface StaticImageFrameProps {
  source: string;
  className: string;
  style: CSSProperties;
  onError: () => void;
}

/** Draws one frame to canvas so GIF/APNG/animated WebP respects reduced-motion. */
function StaticImageFrame({ source, className, style, onError }: StaticImageFrameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    let cancelled = false;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled) return;
      const naturalWidth = Math.max(1, image.naturalWidth || 1);
      const naturalHeight = Math.max(1, image.naturalHeight || 1);
      const scale = Math.min(1, 4096 / Math.max(naturalWidth, naturalHeight));
      canvas.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) return onErrorRef.current();
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.onerror = () => onErrorRef.current();
    image.src = source;
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [source]);

  return <canvas ref={canvasRef} className={className} style={style} aria-hidden="true" />;
}

export interface BackgroundMediaLayerProps {
  enabled: boolean;
  source: string;
  mediaKind?: BackgroundMediaKind;
  fit: BackgroundFit;
  positionX: number;
  positionY: number;
  opacity: number;
  dim: number;
  blur: number;
  motionEnabled?: boolean;
  playbackRate?: number;
  pauseWhenHidden?: boolean;
  containAmbient?: boolean;
  reduceMotion?: boolean;
  className?: string;
  showFallback?: boolean;
  fallbackLabel?: string;
}

export function BackgroundMediaLayer({
  enabled,
  source,
  mediaKind = 'auto',
  fit,
  positionX,
  positionY,
  opacity,
  dim,
  blur,
  motionEnabled = true,
  playbackRate = 1,
  pauseWhenHidden = true,
  containAmbient = true,
  reduceMotion = false,
  className = '',
  showFallback = false,
  fallbackLabel = '选择图片或动态壁纸后可在这里预览',
}: BackgroundMediaLayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [fallbackSource, setFallbackSource] = useState('');
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || (document.visibilityState !== 'hidden' && document.hasFocus()));
  const resolvedSource = useMemo(() => fallbackSource || resolveBackgroundMediaUrl(source), [fallbackSource, source]);
  const detectedKind = useMemo(() => detectBackgroundMediaKind(source, mediaKind), [mediaKind, source]);
  const [imageAnimationStatus, setImageAnimationStatus] = useState<BackgroundImageAnimationStatus>(() =>
    detectedKind === 'image' && isAnimatedBackgroundSource(source) ? 'animated' : 'unknown',
  );
  const clampedX = Math.max(0, Math.min(100, Number(positionX) || 0));
  const clampedY = Math.max(0, Math.min(100, Number(positionY) || 0));
  const shouldRender = enabled && Boolean(resolvedSource) && !failed;
  const shouldPlay = shouldRender && motionEnabled && !reduceMotion && (!pauseWhenHidden || pageVisible);
  const position = `${clampedX}% ${clampedY}%`;
  const safeOpacity = Math.max(0, Math.min(1, Number(opacity) || 0));
  const safeBlur = Math.max(0, Math.min(64, Number(blur) || 0));
  const mediaStyle = {
    objectFit: objectFitForBackground(fit),
    objectPosition: position,
    opacity: safeOpacity,
    filter: `blur(${safeBlur}px)`,
  } as CSSProperties;

  useEffect(() => {
    setFailed(false);
    setFallbackSource('');
    setFallbackAttempted(false);
  }, [source, mediaKind]);

  useEffect(() => {
    let cancelled = false;
    if (detectedKind !== 'image') {
      setImageAnimationStatus('static');
      return;
    }
    const immediate = isAnimatedBackgroundSource(source) ? 'animated' : 'unknown';
    setImageAnimationStatus(immediate);
    if (immediate === 'animated') return;
    void inspectBackgroundImageAnimation(source).then((status) => {
      if (!cancelled) setImageAnimationStatus(status);
    });
    return () => { cancelled = true; };
  }, [detectedKind, source]);

  useEffect(() => {
    if (!pauseWhenHidden) return;
    const syncVisibility = () => setPageVisible(document.visibilityState !== 'hidden' && document.hasFocus());
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('focus', syncVisibility);
    window.addEventListener('blur', syncVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('focus', syncVisibility);
      window.removeEventListener('blur', syncVisibility);
    };
  }, [pauseWhenHidden]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = Math.max(0.25, Math.min(2, Number(playbackRate) || 1));
    if (shouldPlay) void video.play().catch(() => undefined);
    else video.pause();
  }, [playbackRate, shouldPlay]);

  function handleMediaError() {
    const isDirectSource = /^(data:|blob:|https?:\/\/|asset:|tauri:)/i.test(String(source ?? '').trim());
    if (detectedKind === 'image' && !isDirectSource && !fallbackAttempted) {
      setFallbackAttempted(true);
      void invoke<string>('read_icon_as_data_url', { path: source })
        .then((dataUrl) => {
          if (dataUrl) setFallbackSource(dataUrl);
          else setFailed(true);
        })
        .catch(() => setFailed(true));
      return;
    }
    setFailed(true);
  }

  const sharedVideoProps = {
    autoPlay: shouldPlay,
    loop: true,
    muted: true,
    playsInline: true,
    preload: 'metadata' as const,
    draggable: false,
    onError: handleMediaError,
  };
  const layerStyle = {
    '--background-media-dim': String(Math.max(0, Math.min(0.9, Number(dim) || 0))),
    '--background-media-overscan': `${Math.ceil(safeBlur * 2.2)}px`,
  } as CSSProperties;
  const renderStaticFrame = detectedKind === 'image' && (reduceMotion || !motionEnabled) && imageAnimationStatus !== 'static';

  return (
    <div
      className={`background-media-layer ${className} background-media-fit-${fit} ${fit === 'tile' ? 'background-media-tile-mode' : ''} ${failed ? 'background-media-failed' : ''}`}
      aria-hidden={!showFallback}
      style={layerStyle}
    >
      {shouldRender && fit === 'contain' && containAmbient && detectedKind === 'image' && (
        renderStaticFrame ? (
          <StaticImageFrame
            className="background-media-element background-media-ambient"
            source={resolvedSource}
            onError={handleMediaError}
            style={{ ...mediaStyle, objectFit: 'cover', opacity: Math.min(0.62, Math.max(0.22, safeOpacity * 0.62)), filter: `blur(${Math.max(18, safeBlur + 16)}px)` }}
          />
        ) : (
          <img
            className="background-media-element background-media-ambient"
            src={resolvedSource}
            alt=""
            draggable={false}
            decoding="async"
            onError={handleMediaError}
            style={{ ...mediaStyle, objectFit: 'cover', opacity: Math.min(0.62, Math.max(0.22, safeOpacity * 0.62)), filter: `blur(${Math.max(18, safeBlur + 16)}px)` }}
          />
        )
      )}

      {shouldRender && fit === 'tile' && detectedKind === 'image' && !renderStaticFrame && (
        <div
          className="background-media-tile"
          style={{
            backgroundImage: `url("${resolvedSource.replace(/"/g, '\\"')}")`,
            backgroundPosition: position,
            opacity: safeOpacity,
            filter: `blur(${safeBlur}px)`,
          }}
        />
      )}

      {shouldRender && detectedKind === 'image' && (fit !== 'tile' || renderStaticFrame) && (
        renderStaticFrame ? (
          <StaticImageFrame
            className="background-media-element background-media-primary"
            source={resolvedSource}
            onError={handleMediaError}
            style={{ ...mediaStyle, objectFit: fit === 'tile' ? 'cover' : objectFitForBackground(fit) }}
          />
        ) : (
          <img
            className="background-media-element background-media-primary"
            src={resolvedSource}
            alt=""
            draggable={false}
            decoding="async"
            onError={handleMediaError}
            style={mediaStyle}
          />
        )
      )}

      {shouldRender && detectedKind === 'video' && (
        <video
          ref={videoRef}
          className="background-media-element background-media-primary"
          src={resolvedSource}
          {...sharedVideoProps}
          style={{ ...mediaStyle, objectFit: fit === 'tile' ? 'cover' : objectFitForBackground(fit) }}
        />
      )}

      {shouldRender && <div className="background-media-dim" />}
      {showFallback && !shouldRender && <div className="background-media-fallback">{fallbackLabel}</div>}
    </div>
  );
}
