// Offline Storage for Ankore
// Uses IndexedDB for conversations and local storage for settings

class OfflineStorage {
  constructor() {
    this.dbName = 'ankore-db';
    this.dbVersion = 1;
    this.db = null;
  }

  // Initialize IndexedDB
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const conversationsStore = db.createObjectStore('conversations', {
            keyPath: 'id',
            autoIncrement: true,
          });
          conversationsStore.createIndex('timestamp', 'timestamp', { unique: false });
          conversationsStore.createIndex('synced', 'synced', { unique: false });
        }

        // Create messages store
        if (!db.objectStoreNames.contains('messages')) {
          const messagesStore = db.createObjectStore('messages', {
            keyPath: 'id',
            autoIncrement: true,
          });
          messagesStore.createIndex('conversationId', 'conversationId', { unique: false });
          messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // ===== CONVERSATION METHODS =====

  // Save conversation
  async saveConversation(conversation) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['conversations'], 'readwrite');
      const store = transaction.objectStore('conversations');

      const data = {
        ...conversation,
        timestamp: Date.now(),
        synced: false, // Mark as needing sync
      };

      const request = conversation.id ? store.put(data) : store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get all conversations
  async getConversations() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['conversations'], 'readonly');
      const store = transaction.objectStore('conversations');
      const index = store.index('timestamp');

      const request = index.getAll();

      request.onsuccess = () => {
        // Sort by timestamp descending
        const conversations = request.result.sort((a, b) => b.timestamp - a.timestamp);
        resolve(conversations);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get single conversation
  async getConversation(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['conversations'], 'readonly');
      const store = transaction.objectStore('conversations');

      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Delete conversation
  async deleteConversation(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['conversations', 'messages'], 'readwrite');

      // Delete conversation
      const convStore = transaction.objectStore('conversations');
      convStore.delete(id);

      // Delete associated messages
      const msgStore = transaction.objectStore('messages');
      const index = msgStore.index('conversationId');
      const request = index.openCursor(IDBKeyRange.only(id));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // ===== MESSAGE METHODS =====

  // Save message
  async saveMessage(message) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');

      const data = {
        ...message,
        timestamp: Date.now(),
        synced: false,
      };

      const request = store.add(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Get messages for conversation
  async getMessages(conversationId) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('conversationId');

      const request = index.getAll(IDBKeyRange.only(conversationId));

      request.onsuccess = () => {
        const messages = request.result.sort((a, b) => a.timestamp - b.timestamp);
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Get unsynced messages (for background sync)
  async getUnsyncedMessages() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('synced');

      const request = index.getAll(IDBKeyRange.only(false));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Mark message as synced
  async markSynced(id) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');

      const request = store.get(id);

      request.onsuccess = () => {
        const message = request.result;
        if (message) {
          message.synced = true;
          store.put(message);
        }
        resolve(true);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ===== SETTINGS METHODS =====

  // Get setting
  async getSetting(key) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readonly');
      const store = transaction.objectStore('settings');

      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value ?? null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Set setting
  async setSetting(key, value) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['settings'], 'readwrite');
      const store = transaction.objectStore('settings');

      const request = store.put({ key, value });

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // ===== UTILITY METHODS =====

  // Clear all data
  async clearAll() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(
        ['conversations', 'messages', 'settings'],
        'readwrite',
      );

      transaction.objectStore('conversations').clear();
      transaction.objectStore('messages').clear();
      transaction.objectStore('settings').clear();

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Get storage usage estimate
  async getStorageUsage() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage,
        available: estimate.quota,
        percent: ((estimate.usage / estimate.quota) * 100).toFixed(2),
      };
    }
    return null;
  }

  // Export data for backup
  async exportData() {
    const conversations = await this.getConversations();
    const settings = {};

    // Get all settings
    const settingKeys = ['theme', 'voiceEnabled', 'notificationsEnabled'];
    for (const key of settingKeys) {
      settings[key] = await this.getSetting(key);
    }

    return {
      conversations,
      settings,
      exportDate: new Date().toISOString(),
    };
  }
}

// Create singleton instance
const offlineStorage = new OfflineStorage();

// Auto-initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    offlineStorage.init().catch(() => {});
  });
} else {
  offlineStorage.init().catch(() => {});
}

// Export for use in other scripts
window.offlineStorage = offlineStorage;
