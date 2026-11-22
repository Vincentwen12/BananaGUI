import { For, Show, createEffect, onCleanup, type JSX } from 'solid-js';
import { Icon } from './Icon';
import type { Toast } from '../state/app';

const modalStack: symbol[] = [];

export function Modal(props: {
  open: boolean;
  title: string;
  wide?: boolean;
  onClose: () => void;
  children: JSX.Element;
  footer?: JSX.Element;
}) {
  let panel: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open) return;
    const id = Symbol('modal');
    modalStack.push(id);
    const isTop = () => modalStack[modalStack.length - 1] === id;
    const onKey = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        props.onClose();
      }
      if (event.key === 'Tab' && panel) {
        const focusable = panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    onCleanup(() => {
      window.removeEventListener('keydown', onKey, true);
      const index = modalStack.indexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
    });
    requestAnimationFrame(() => {
      if (!isTop()) return;
      const target = panel?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select, button.primary, button',
      );
      target?.focus();
    });
  });

  return (
    <Show when={props.open}>
      <div class="overlay" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
        <div class={`dialog${props.wide ? ' wide' : ''}`} ref={panel} role="dialog" aria-modal="true" aria-label={props.title}>
          <header class="dialog-head">
            <h2>{props.title}</h2>
            <span class="spacer" />
            <button class="icon-btn sm" type="button" aria-label="关闭" onClick={props.onClose}>
              <Icon name="close" />
            </button>
          </header>
          {props.children}
          {props.footer}
        </div>
      </div>
    </Show>
  );
}

export function Switch(props: { checked: boolean; disabled?: boolean; label?: string; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      class={`switch${props.checked ? ' on' : ''}`}
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
    >
      <span class="visually-hidden">{props.label}</span>
    </button>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div class="segmented" role="tablist">
      <For each={props.options}>
        {(option) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.value === option.value}
            class={props.value === option.value ? 'active' : ''}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        )}
      </For>
    </div>
  );
}

export function Toasts(props: { items: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div class="toasts" aria-live="polite">
      <For each={props.items}>
        {(item) => (
          <div class={`toast ${item.kind}`}>
            <span class="toast-mark" />
            <span class="toast-title">{item.title}</span>
            <button class="icon-btn sm" type="button" aria-label="关闭" onClick={() => props.onDismiss(item.id)}>
              <Icon name="close" />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

export function Dots() {
  return (
    <span class="dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export function Field(props: { label?: string; hint?: string; children: JSX.Element }) {
  return (
    <div class="field">
      <Show when={props.label}>
        <span class="field-label">{props.label}</span>
      </Show>
      {props.children}
      <Show when={props.hint}>
        <span class="hint">{props.hint}</span>
      </Show>
    </div>
  );
}

export function SettingRow(props: { title: string; hint?: string; children: JSX.Element }) {
  return (
    <div class="setting-row">
      <div class="setting-label">
        <span class="setting-title">{props.title}</span>
        <Show when={props.hint}>
          <span class="setting-hint">{props.hint}</span>
        </Show>
      </div>
      <div class="setting-control">{props.children}</div>
    </div>
  );
}
