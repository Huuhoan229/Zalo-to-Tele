import fs from 'node:fs/promises';
import path from 'node:path';

const EMPTY_STATE = {
  version: 1,
  conversations: {},
  topics: {},
};

export class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = structuredClone(EMPTY_STATE);
    this.writeQueue = Promise.resolve();
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = { ...structuredClone(EMPTY_STATE), ...JSON.parse(raw) };
      this.state.conversations ||= {};
      this.state.topics ||= {};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
  }

  async save() {
    this.writeQueue = this.writeQueue.then(async () => {
      const tmpPath = `${this.filePath}.tmp`;
      await fs.writeFile(tmpPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
      await fs.rename(tmpPath, this.filePath);
    });
    return this.writeQueue;
  }

  getByConversation(conversationId) {
    return this.state.conversations[String(conversationId)] || null;
  }

  getByTopic(topicId) {
    return this.state.topics[String(topicId)] || null;
  }

  listMappings() {
    return Object.values(this.state.conversations).sort((a, b) =>
      String(a.title).localeCompare(String(b.title)),
    );
  }

  async upsertMapping(mapping) {
    const normalized = {
      conversationId: String(mapping.conversationId),
      threadType: mapping.threadType,
      topicId: Number(mapping.topicId),
      title: mapping.title || `Zalo ${mapping.conversationId}`,
      updatedAt: new Date().toISOString(),
    };

    this.state.conversations[normalized.conversationId] = normalized;
    this.state.topics[String(normalized.topicId)] = normalized;
    await this.save();
    return normalized;
  }
}
