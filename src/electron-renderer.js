const state = {
  data: null,
  pendingAttachment: null,
};

const els = {
  accountsList: document.getElementById('accounts-list'),
  topicsList: document.getElementById('topics-list'),
  messagesList: document.getElementById('messages-list'),
  logList: document.getElementById('log-list'),
  topicsSubtitle: document.getElementById('topics-subtitle'),
  chatTitle: document.getElementById('chat-title'),
  chatMeta: document.getElementById('chat-meta'),
  accountForm: document.getElementById('account-form'),
  addAccountBtn: document.getElementById('add-account'),
  cancelAddBtn: document.getElementById('cancel-add'),
  refreshBtn: document.getElementById('refresh'),
  startAllBtn: document.getElementById('start-all'),
  stopAllBtn: document.getElementById('stop-all'),
  composer: document.getElementById('composer'),
  messageInput: document.getElementById('message-input'),
  attachBtn: document.getElementById('attach-image'),
  attachmentBar: document.getElementById('attachment-bar'),
};

function timeLabel(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function escapeText(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderAccounts() {
  const accounts = state.data?.accounts || [];
  if (accounts.length === 0) {
    els.accountsList.innerHTML = `<div class="card"><div class="title">No accounts yet</div><div class="meta">Add your first Zalo profile and bot token.</div></div>`;
    return;
  }

  els.accountsList.innerHTML = accounts
    .map((account) => {
      const active = account.id === state.data.selectedAccountId;
      return `
        <div class="card ${active ? 'active' : ''}" data-account="${account.id}">
          <div class="title">${escapeText(account.label)}</div>
          <div class="meta">${escapeText(account.id)}</div>
          <div class="row">
            <span class="pill ${account.status}">${account.status}</span>
            <span class="small">${account.conversationCount || 0} topics</span>
          </div>
          <div class="row">
            <button data-action="select-account" data-id="${account.id}">Open</button>
            ${account.status === 'running'
              ? `<button class="ghost" data-action="stop-account" data-id="${account.id}">Stop</button>`
              : `<button class="ghost" data-action="start-account" data-id="${account.id}">Start</button>`}
          </div>
        </div>
      `;
    })
    .join('');
}

function renderTopics() {
  const conversations = state.data?.conversations || [];
  const account = state.data?.selectedAccount;
  els.topicsSubtitle.textContent = account
    ? `${account.label} · ${conversations.length} topics`
    : 'Select an account.';

  if (!account) {
    els.topicsList.innerHTML = `<div class="card"><div class="title">No account selected</div><div class="meta">Open an account to see topics.</div></div>`;
    return;
  }

  if (conversations.length === 0) {
    els.topicsList.innerHTML = `<div class="card"><div class="title">No topics yet</div><div class="meta">Send a message from Zalo to create the first topic.</div></div>`;
    return;
  }

  els.topicsList.innerHTML = conversations
    .map((topic) => {
      const active = topic.conversationId === state.data.selectedConversationId;
      return `
        <div class="topic-item ${active ? 'active' : ''}" data-conversation="${topic.conversationId}">
          <div class="topic-title">${escapeText(topic.title || topic.conversationId)}</div>
          <div class="topic-sub">${escapeText(topic.lastMessage || 'No messages yet')}</div>
          <div class="topic-sub">${timeLabel(topic.updatedAt)} · topic ${topic.topicId}</div>
        </div>
      `;
    })
    .join('');
}

function renderMessages() {
  const account = state.data?.selectedAccount;
  const messages = state.data?.messages || [];
  const selectedConversation = state.data?.selectedConversation;
  if (!account) {
    els.chatTitle.textContent = 'Conversation';
    els.chatMeta.textContent = 'Open an account to inspect chats.';
    els.messagesList.innerHTML = '';
    return;
  }

  if (!selectedConversation) {
    els.chatTitle.textContent = account.label;
    els.chatMeta.textContent = 'Choose a topic to view the thread.';
    els.messagesList.innerHTML = `<div class="card"><div class="title">No topic selected</div><div class="meta">Pick one from the Topics pane.</div></div>`;
    return;
  }

  els.chatTitle.textContent = selectedConversation.title || selectedConversation.conversationId;
  els.chatMeta.textContent = `Topic ${selectedConversation.topicId} · ${selectedConversation.conversationId}`;
  els.messagesList.innerHTML = messages
    .map((message) => {
      const side = message.direction === 'out' ? 'out' : 'in';
      const attachment = message.attachment
        ? `<div class="attachment">${escapeText(message.attachment.title || message.attachment.url || '')}</div>`
        : '';
      return `
        <div class="message ${side}">
          <div class="head">
            <span>${escapeText(message.senderName || message.source || '')}</span>
            <span>${timeLabel(message.createdAt)}</span>
          </div>
          <div class="body">${escapeText(message.text || '(attachment)')}</div>
          ${attachment}
        </div>
      `;
    })
    .join('') || `<div class="card"><div class="title">Empty thread</div><div class="meta">No messages yet.</div></div>`;
  els.messagesList.scrollTop = els.messagesList.scrollHeight;
}

function renderLogs() {
  const logs = state.data?.logs || [];
  els.logList.innerHTML = logs
    .slice()
    .reverse()
    .map((entry) => {
      const scope = entry.accountId ? `${entry.accountId} / ${entry.scope}` : entry.scope;
      const payload = entry.message || (entry.error?.message ?? '');
      return `
        <div class="log-line">
          <span class="scope">${escapeText(scope)}</span>
          <span class="level">${escapeText(entry.level)}</span>
          <span>${escapeText(payload)}</span>
        </div>
      `;
    })
    .join('') || `<div class="card"><div class="title">No logs yet</div></div>`;
  els.logList.scrollTop = els.logList.scrollHeight;
}

function renderAttachmentBar() {
  if (!state.pendingAttachment) {
    els.attachmentBar.classList.add('hidden');
    els.attachmentBar.textContent = '';
    return;
  }
  els.attachmentBar.classList.remove('hidden');
  els.attachmentBar.textContent = `Attached: ${state.pendingAttachment.filePath}`;
}

function render() {
  renderAccounts();
  renderTopics();
  renderMessages();
  renderLogs();
  renderAttachmentBar();
}

async function loadState() {
  state.data = await window.z2t.getState();
  render();
}

window.z2t.onState((nextState) => {
  state.data = nextState;
  render();
});

window.z2t.onLog((entry) => {
  state.data = state.data || {};
  state.data.logs = [...(state.data.logs || []), entry].slice(-300);
  renderLogs();
});

window.z2t.onTranscript((event) => {
  if (!state.data || state.data.selectedAccountId !== event.accountId) return;
  if (state.data.selectedConversationId !== event.conversationId) return;
  loadState();
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === 'select-account') {
    await window.z2t.selectAccount(id);
    await loadState();
  }
  if (action === 'start-account') {
    await window.z2t.startAccount(id);
    await loadState();
  }
  if (action === 'stop-account') {
    await window.z2t.stopAccount(id);
    await loadState();
  }
});

els.topicsList.addEventListener('click', async (event) => {
  const topic = event.target.closest('[data-conversation]');
  if (!topic) return;
  await window.z2t.selectConversation(topic.dataset.conversation);
  await loadState();
});

els.addAccountBtn.addEventListener('click', () => {
  els.accountForm.classList.remove('hidden');
});

els.cancelAddBtn.addEventListener('click', () => {
  els.accountForm.classList.add('hidden');
});

els.refreshBtn.addEventListener('click', loadState);

els.startAllBtn.addEventListener('click', async () => {
  await window.z2t.startAll();
  await loadState();
});

els.stopAllBtn.addEventListener('click', async () => {
  await window.z2t.stopAll();
  await loadState();
});

els.attachBtn.addEventListener('click', async () => {
  const filePath = await window.z2t.pickImage();
  if (!filePath) return;
  state.pendingAttachment = { filePath };
  renderAttachmentBar();
});

els.accountForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(els.accountForm);
  const input = {
    label: form.get('label'),
    telegramBotToken: form.get('telegramBotToken'),
    telegramForumChatId: form.get('telegramForumChatId'),
    allowedTelegramUserIds: form.get('allowedTelegramUserIds'),
    zaloLoginMode: form.get('zaloLoginMode'),
    autoStart: form.get('autoStart') === 'on',
  };
  await window.z2t.addAccount(input);
  els.accountForm.reset();
  els.accountForm.classList.add('hidden');
  state.pendingAttachment = null;
  await loadState();
});

els.composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const accountId = state.data?.selectedAccountId;
  const conversationId = state.data?.selectedConversationId;
  const text = els.messageInput.value.trim();
  if (!accountId || !conversationId) return;

  if (state.pendingAttachment?.filePath) {
    await window.z2t.sendImage({
      accountId,
      conversationId,
      filePath: state.pendingAttachment.filePath,
      caption: text,
    });
    state.pendingAttachment = null;
  } else if (text) {
    await window.z2t.sendMessage({
      accountId,
      conversationId,
      text,
    });
  }

  els.messageInput.value = '';
  await loadState();
});

await loadState();
