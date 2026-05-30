'use client';

// Host-rendered modal for plugin-requested confirm/alert dialogs.
// Subscribes to the host-dialog queue and renders the head request, one at
// a time. Closing the modal advances the queue.

import React, { useEffect, useSyncExternalStore } from 'react';
import { head, resolveHead, subscribe } from '@/lib/plugin-sandbox/host-dialog';

// Lightweight **bold** support in plugin dialog messages. Everything else is
// rendered literally (newlines come from the parent's white-space: pre-wrap).
// Splitting on the ** delimiter yields alternating plain/bold segments (odd
// indices are bold). Plugins control these strings, so the delimiters balance.
function renderMessage(message?: string): React.ReactNode {
  if (!message) return null;
  return message.split('**').map((seg, i) =>
    i % 2 === 1
      ? <strong key={i}>{seg}</strong>
      : <React.Fragment key={i}>{seg}</React.Fragment>,
  );
}

export function PluginDialogHost(): React.JSX.Element | null {
  const current = useSyncExternalStore(subscribe, head, () => null);

  useEffect(() => {
    if (!current) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveHead(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolveHead(true);
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [current]);

  if (!current) return null;

  const confirmLabel = current.confirmLabel ?? (current.kind === 'alert' ? 'OK' : 'Confirm');
  const cancelLabel = current.cancelLabel ?? 'Cancel';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="plugin-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resolveHead(false);
      }}
    >
      <div
        style={{
          background: 'var(--color-popover, #fff)',
          color: 'var(--color-popover-foreground, #0f172a)',
          border: '1px solid var(--color-border, #e2e8f0)',
          borderRadius: 12,
          padding: 20,
          maxWidth: 480,
          width: '92%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
        }}
      >
        <h2 id="plugin-dialog-title" style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px 0' }}>
          {current.title}
        </h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, margin: '0 0 16px 0', color: 'var(--color-muted-foreground, #64748b)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {renderMessage(current.message)}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {current.kind === 'confirm' && (
            <button
              type="button"
              autoFocus={!!current.danger}
              onClick={() => resolveHead(false)}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid var(--color-border, #e2e8f0)',
                background: 'transparent',
                color: 'inherit',
              }}
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            autoFocus={current.kind === 'alert' || !current.danger}
            onClick={() => resolveHead(true)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid transparent',
              background: current.danger ? 'var(--color-destructive, #dc2626)' : 'var(--color-primary, #3b82f6)',
              color: current.danger ? 'var(--color-destructive-foreground, #fff)' : 'var(--color-primary-foreground, #fff)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-muted-foreground, #94a3b8)', textAlign: 'right' }}>
          From plugin: {current.pluginId}
        </div>
      </div>
    </div>
  );
}
