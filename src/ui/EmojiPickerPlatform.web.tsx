import { EmojiPicker as FrimousseEmojiPicker } from 'frimousse';
import type { CSSProperties } from 'react';

import { useAppTheme } from '@theme';

import type { EmojiPickerPlatformProps } from './EmojiPickerPlatform';

/** Uses Frimousse so web users get searchable system-rendered emoji glyphs. */
export function EmojiPickerPlatform({ onChange, testID }: EmojiPickerPlatformProps) {
  const { colors } = useAppTheme();
  const styles: Record<string, CSSProperties> = {
    categoryHeader: {
      backgroundColor: colors.surface,
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: 600,
      padding: '8px 4px',
      position: 'sticky',
      top: 0,
      zIndex: 1,
    },
    emoji: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 8,
      color: colors.text,
      cursor: 'pointer',
      display: 'flex',
      fontSize: 24,
      height: 42,
      justifyContent: 'center',
      padding: 0,
      width: '100%',
    },
    listRow: {
      display: 'grid',
      gap: 6,
      gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    },
    root: { width: '100%' },
    search: {
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      color: colors.text,
      fontSize: 16,
      height: 44,
      marginBottom: 8,
      padding: '0 12px',
      width: '100%',
    },
    viewport: {
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 10,
      maxHeight: 300,
      minHeight: 120,
      overflowY: 'auto',
      padding: 8,
    },
  };

  return (
    <FrimousseEmojiPicker.Root
      columns={8}
      data-testid={`${testID}-emoji-picker`}
      onEmojiSelect={({ emoji }) => onChange(emoji)}
      style={styles.root}
    >
      <FrimousseEmojiPicker.Search
        aria-label="Search emojis"
        data-testid={`${testID}-emoji-search`}
        placeholder="Search emojis"
        style={styles.search}
      />
      <FrimousseEmojiPicker.SkinToneSelector
        aria-label="Change emoji skin tone"
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          color: colors.text,
          cursor: 'pointer',
          fontSize: 18,
          height: 34,
          marginBottom: 8,
          padding: '0 8px',
        }}
      />
      <FrimousseEmojiPicker.Viewport style={styles.viewport}>
        <FrimousseEmojiPicker.Loading>
          <span style={{ color: colors.textMuted, fontSize: 14 }}>Loading emojis...</span>
        </FrimousseEmojiPicker.Loading>
        <FrimousseEmojiPicker.Empty>
          <span style={{ color: colors.textMuted, fontSize: 14 }}>No matching emojis.</span>
        </FrimousseEmojiPicker.Empty>
        <FrimousseEmojiPicker.List
          components={{
            CategoryHeader: ({ category, style, ...props }) => (
              <div {...props} style={{ ...style, ...styles.categoryHeader }}>
                {category.label}
              </div>
            ),
            Emoji: ({ emoji, style, ...props }) => (
              <button
                {...props}
                aria-label={emoji.label}
                style={{
                  ...style,
                  ...styles.emoji,
                  backgroundColor: emoji.isActive ? colors.active.background : colors.surface,
                }}
                type="button"
              >
                {emoji.emoji}
              </button>
            ),
            Row: ({ style, ...props }) => (
              <div {...props} style={{ ...style, ...styles.listRow }} />
            ),
          }}
        />
      </FrimousseEmojiPicker.Viewport>
    </FrimousseEmojiPicker.Root>
  );
}
