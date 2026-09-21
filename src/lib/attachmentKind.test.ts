import { describe, expect, it } from 'vitest';
import { getAttachmentKind } from './attachmentKind';

describe('getAttachmentKind', () => {
  it('classifies PNG as image', () => {
    expect(getAttachmentKind({ mimeType: 'image/png', name: 'photo.png' })).toBe('image');
  });

  it('classifies JPEG as image', () => {
    expect(getAttachmentKind({ mimeType: 'image/jpeg', name: 'photo.jpg' })).toBe('image');
  });

  it('classifies SVG as image, not a generic file — the regression this fixes', () => {
    expect(getAttachmentKind({ mimeType: 'image/svg+xml', name: 'icon.svg' })).toBe('image');
  });

  it('classifies GIF as image', () => {
    expect(getAttachmentKind({ mimeType: 'image/gif', name: 'meme.gif' })).toBe('image');
  });

  it('classifies MP4 as video', () => {
    expect(getAttachmentKind({ mimeType: 'video/mp4', name: 'clip.mp4' })).toBe('video');
  });

  it('classifies webm audio as audio (not video, despite the shared container extension)', () => {
    expect(getAttachmentKind({ mimeType: 'audio/webm', name: 'voice.webm' })).toBe('audio');
  });

  it('classifies a PDF as a generic file', () => {
    expect(getAttachmentKind({ mimeType: 'application/pdf', name: 'invoice.pdf' })).toBe('file');
  });

  it('falls back to the file extension when mimeType is missing (older persisted messages)', () => {
    expect(getAttachmentKind({ name: 'icon.svg' })).toBe('image');
    expect(getAttachmentKind({ name: 'clip.mp4' })).toBe('video');
    expect(getAttachmentKind({ name: 'voice.m4a' })).toBe('audio');
    expect(getAttachmentKind({ name: 'invoice.pdf' })).toBe('file');
  });

  it('falls back to the persisted kind when neither mimeType nor a recognizable extension is available', () => {
    expect(getAttachmentKind({ fallbackKind: 'image' })).toBe('image');
    expect(getAttachmentKind({ name: 'noextension', fallbackKind: 'video' })).toBe('video');
  });

  it('defaults to file when nothing is known at all', () => {
    expect(getAttachmentKind({})).toBe('file');
  });
});
