import { describe, it, expect } from 'vitest';
import { languageCodeToLanguage, determineAppLanguage } from '../language';

describe('Language Utils', () => {
  it('should convert language codes to language names', () => {
    expect(languageCodeToLanguage('ko-KR')).toBe('Korean_한국어');
    expect(languageCodeToLanguage('en-US')).toBe('English');
    expect(languageCodeToLanguage('zh-CN')).toBe('ChineseSimplified_简体中文');
    expect(languageCodeToLanguage('zh-TW')).toBe('ChineseTraditional_繁體中文');
    expect(languageCodeToLanguage('ja-JP')).toBe('Japanese_日本語');
  });

  it('should determine app language with English as default', () => {
    const language = determineAppLanguage('ko-KR');
    expect(language).toBe('Korean_한국어');
    expect(typeof language).toBe('string');
  });

  it('should return English as fallback for unsupported language', () => {
    const language = determineAppLanguage('xx-XX');
    expect(language).toBe('English');
  });
});
