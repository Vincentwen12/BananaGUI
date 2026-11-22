import { create, formatNumber, shortPath } from '../dom.js';
import { icon } from '../icons.js';

export const REASONING_LABELS = {
  fast: '快速',
  standard: '标准',
  deep: '深入',
};

export const REASONING_HINTS = {
  fast: '响应快、消耗少',
  standard: '速度和准确率平衡',
  deep: '高强度思考，适合复杂任务',
};

export function autoResize(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(220, Math.max(64, textarea.scrollHeight))}px`;
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      reject(new Error('只支持 png / jpg / gif / webp 图片。'));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      reject(new Error('图片超过 4MB 上限。'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, dataUrl: String(reader.result) });
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.readAsDataURL(file);
  });
}

export function renderAttachments(container, images, onRemove) {
  container.replaceChildren();
  images.forEach((image, index) => {
    const chip = create('div', 'attachment-chip');
    if (image.dataUrl) {
      const preview = create('img');
      preview.src = image.dataUrl;
      preview.alt = '';
      chip.append(preview);
    } else {
      chip.innerHTML += icon('image');
    }
    chip.append(create('span', 'chip-name', image.name || `图片 ${index + 1}`));
    const remove = create('button');
    remove.type = 'button';
    remove.setAttribute('aria-label', `移除 ${image.name || '图片'}`);
    remove.innerHTML = icon('close');
    remove.addEventListener('click', () => onRemove(index));
    chip.append(remove);
    container.append(chip);
  });
}

export function updateComposer(state, elements) {
  const { textarea, sendBtn, modeLabel, modelLabel, reasoningLabel, contextWorkspace, contextReasoning, hint, usage } =
    elements;
  const info = state.info;
  const session = state.session;
  const mode = session?.mode === 'plan' ? 'plan' : 'build';
  if (modeLabel) modeLabel.textContent = mode === 'plan' ? '只读计划' : '工作区内修改';
  if (modelLabel) {
    modelLabel.textContent = info?.providerError
      ? '模型不可用'
      : info
        ? info.model
        : '加载中…';
    if (info && modelLabel instanceof HTMLElement) {
      modelLabel.title = `${info.currentProvider} / ${info.model}`;
    }
  }
  if (reasoningLabel) reasoningLabel.textContent = REASONING_LABELS[session?.reasoning ?? 'standard'] ?? '标准';
  if (contextReasoning) {
    contextReasoning.textContent = `${REASONING_LABELS[session?.reasoning ?? 'standard'] ?? '标准'}模式`;
  }
  if (contextWorkspace) {
    contextWorkspace.textContent = state.session?.workspace
      ? shortPath(state.session.workspace)
      : info?.workspace
        ? shortPath(info.workspace)
        : '未选择工作区';
  }
  const hasText = Boolean(textarea?.value.trim()) || Boolean(state.images?.length);
  if (sendBtn) {
    sendBtn.classList.toggle('ready', hasText && !state.running);
    sendBtn.classList.toggle('stop', state.running);
    sendBtn.setAttribute('aria-label', state.running ? '停止' : '发送');
    sendBtn.innerHTML = icon(state.running ? 'stop' : 'arrow-up');
  }
  if (textarea) {
    textarea.readOnly = false;
    textarea.placeholder = '描述你想要构建的内容，/ 调用指令，@ 文件或对话';
  }
  if (hint) {
    hint.textContent = state.running ? '香蕉正在思考… · Esc 中断' : 'Enter 发送 · Shift+Enter 换行 · / 命令 · @ 文件';
  }
  if (usage) {
    const sessionUsage = session?.usage;
    const context = state.usage?.contextTokens;
    const parts = [];
    if (sessionUsage?.inputTokens || sessionUsage?.outputTokens) {
      parts.push(`本会话 ↑${formatNumber(sessionUsage.inputTokens)} ↓${formatNumber(sessionUsage.outputTokens)}`);
    }
    if (context) parts.push(`上下文 ${formatNumber(context)}`);
    usage.textContent = parts.join(' · ');
  }
}

export function slashQuery(textarea) {
  const value = textarea.value;
  const start = value.lastIndexOf('/');
  if (start < 0) return null;
  const before = value.slice(0, start);
  if (before && !/\s$/.test(before)) return null;
  const after = value.slice(start + 1);
  if (/\s/.test(after)) return null;
  return { start, query: after };
}

export function atQuery(textarea) {
  const value = textarea.value;
  const start = value.lastIndexOf('@');
  if (start < 0) return null;
  const before = value.slice(0, start);
  if (before && !/\s$/.test(before)) return null;
  const after = value.slice(start + 1);
  if (/\s/.test(after)) return null;
  return { start, query: after };
}

export function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  const position = start + text.length;
  textarea.setSelectionRange(position, position);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function replaceRange(textarea, start, end, text) {
  textarea.value = `${textarea.value.slice(0, start)}${text}${textarea.value.slice(end)}`;
  const position = start + text.length;
  textarea.setSelectionRange(position, position);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
