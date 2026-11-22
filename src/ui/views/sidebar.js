import { create, relativeTime } from '../dom.js';
import { icon } from '../icons.js';
import { activeWorkspace, store, workspaces } from '../store.js';

export function createSidebar({ list, actions }) {
  // 记录用户主动折叠的工作区；默认全部展开。点击当前工作区只折叠，不重新载入。
  const collapsed = new Set();

  function sessionRow(session, active) {
    const row = create('div', `session-row${active ? ' active' : ''}`);
    row.title = session.title;
    const main = create('button', 'session-main');
    main.type = 'button';
    main.dataset.session = session.id;
    main.append(create('span', 'session-title', session.title || '新对话'));
    main.append(create('span', 'session-time', relativeTime(session.updatedAt)));
    main.addEventListener('mouseenter', () => {
      actions.onSessionHover?.(session, main.getBoundingClientRect());
    });
    main.addEventListener('mouseleave', () => actions.onSessionHoverEnd?.());
    const more = create('button', 'icon-btn session-more');
    more.type = 'button';
    more.setAttribute('aria-label', `对话操作：${session.title}`);
    more.innerHTML = icon('ellipsis');
    more.addEventListener('click', (event) => {
      event.stopPropagation();
      const rect = more.getBoundingClientRect();
      actions.onSessionMenu?.(session, rect.right, rect.bottom + 4);
    });
    row.append(main, more);
    return row;
  }

  function render(state = store) {
    const keepScroll = list.scrollTop;
    const active = activeWorkspace();
    const query = (state.filters?.query || '').trim().toLowerCase();
    const onlyActive = state.filters?.mode === 'active';
    const groups = workspaces().filter((group) => {
      if (onlyActive && group.workspace !== active) return false;
      if (!query) return true;
      if (group.label.toLowerCase().includes(query)) return true;
      return group.sessions.some((session) => session.title.toLowerCase().includes(query));
    });
    list.replaceChildren();
    if (!groups.length) {
      list.append(create('div', 'empty-workspaces', query ? '没有匹配的工作区或会话。' : '还没有工作区。点右上角文件夹图标添加。'));
      list.scrollTop = keepScroll;
      return;
    }
    for (const group of groups) {
      const isActive = group.workspace === active;
      const groupEl = create('div', `workspace-group${isActive ? ' active' : ''}`);
      const row = create('button', 'workspace-row');
      row.type = 'button';
      row.dataset.workspace = group.workspace;
      row.title = group.workspace || group.label;
      const folder = create('span', 'folder-icon');
      folder.innerHTML = icon('folder');
      row.append(folder, create('span', 'workspace-name', group.label));
      const chevron = create('span', 'chevron');
      chevron.innerHTML = icon('chevron-right');
      row.append(chevron);
      groupEl.append(row);
      const show = !collapsed.has(group.workspace) || query.length > 0;
      groupEl.classList.toggle('expanded', show);
      const sessions = create('div', 'session-list');
      const sessionsFiltered = query
        ? group.sessions.filter(
            (session) =>
              session.title.toLowerCase().includes(query) || group.label.toLowerCase().includes(query),
          )
        : group.sessions;
      if (!sessionsFiltered.length) {
        sessions.append(
          create('div', 'empty-workspaces', group.workspace ? '这个工作区还没有对话。' : '没有未分组对话。'),
        );
      } else {
        for (const session of sessionsFiltered) {
          sessions.append(sessionRow(session, session.id === state.session?.id));
        }
      }
      groupEl.append(sessions);
      list.append(groupEl);
    }
    list.scrollTop = keepScroll;
  }

  list.addEventListener('click', (event) => {
    const session = event.target.closest('[data-session]');
    if (session) {
      actions.onSession?.(session.dataset.session);
      return;
    }
    const row = event.target.closest('[data-workspace]');
    if (!row) return;
    const workspace = row.dataset.workspace;
    if (workspace === activeWorkspace()) {
      if (collapsed.has(workspace)) collapsed.delete(workspace);
      else collapsed.add(workspace);
      render();
      return;
    }
    collapsed.delete(workspace);
    actions.onWorkspace?.(workspace);
    render();
  });

  return { render };
}
