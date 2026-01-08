<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ProgressItem {
    file: string;
    status: string;
    progress: number;
    loaded: number;
    total: number;
}

const messages = ref<Message[]>([]);
const input = ref('');
const status = ref<string>('idle'); // idle, loading, ready, generating, error
const progressItems = ref<ProgressItem[]>([]);
const loadingMessage = ref('');
const systemPrompt = ref('あなたは親切なAIアシスタントです。日本語で答えてください。');

let worker: Worker | null = null;

// Initialize worker
onMounted(() => {
  worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });

  worker.addEventListener('message', (event) => {
    const { status: workerStatus, message, progress, text } = event.data;

    switch (workerStatus) {
      case 'loading':
        status.value = 'loading';
        loadingMessage.value = message || 'Loading...';
        break;
      case 'progress':
        if (progress) {
             const existing = progressItems.value.find(p => p.file === progress.file);
             if (existing) {
                 existing.progress = progress.progress;
                 existing.loaded = progress.loaded;
                 existing.total = progress.total;
             } else {
                 progressItems.value.push(progress);
             }
        }
        break;
      case 'ready':
        status.value = 'ready';
        loadingMessage.value = '';
        progressItems.value = [];
        break;
      case 'start':
        status.value = 'generating';
        messages.value.push({ role: 'assistant', content: '' });
        break;
      case 'output':
        const lastMsg = messages.value[messages.value.length - 1];
        if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.content += text;
            scrollToBottom();
        }
        break;
      case 'complete':
        status.value = 'ready';
        break;
      case 'error':
        status.value = 'error';
        loadingMessage.value = message;
        break;
    }
  });

  // Start loading model immediately - REMOVED
  // worker.postMessage({ type: 'load' });
});

const startDownload = () => {
    worker?.postMessage({ type: 'load' });
};

onUnmounted(() => {
    worker?.terminate();
});

const sendMessage = () => {
    if (!input.value.trim() || (status.value !== 'ready' && status.value !== 'generating')) return;
    if (status.value === 'generating') return;

    const userMsg = input.value;
    input.value = '';
    messages.value.push({ role: 'user', content: userMsg });

    worker?.postMessage({
        type: 'generate',
        data: {
            messages: messages.value.map(m => ({ role: m.role, content: m.content })),
            systemPrompt: systemPrompt.value
        }
    });

    nextTick(scrollToBottom);
};

const chatContainer = ref<HTMLDivElement | null>(null);
const scrollToBottom = () => {
    nextTick(() => {
        if (chatContainer.value) {
            chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
        }
    });
}

// Auto scroll on new message
watch(messages, scrollToBottom, { deep: true });

const reloadPage = () => {
    window.location.reload();
};

const clearHistory = () => {
    if (confirm('チャット履歴を削除しますか？')) {
        messages.value = [];
    }
};
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-900 text-white font-sans">
    <!-- Header -->
    <header class="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 backdrop-blur sticky top-0 z-20">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
            <span class="text-xs font-bold">AI</span>
        </div>
        <h1 class="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
            Local LLM
        </h1>
      </div>
      
      <div v-if="status === 'ready'" class="flex items-center gap-2 text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <div class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
        Ready
      </div>
      <div v-else-if="status === 'loading'" class="flex items-center gap-2 text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
        <div class="w-2 h-2 rounded-full bg-blue-400 animate-spin"></div>
        {{ loadingMessage }}
      </div>
      <div v-else-if="status === 'generating'" class="flex items-center gap-2 text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
        <div class="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></div>
        生成中...
      </div>
      <div v-else-if="status === 'error'" class="flex items-center gap-2 text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20">
        エラー
      </div>


    </header>

    <!-- Main Chat Area -->
    <main class="flex-1 overflow-hidden relative flex flex-col">
        <!-- Progress Overlay -->
        <div v-if="status === 'idle'" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm p-8 transition-all">
            <div class="max-w-md w-full space-y-6 bg-gray-900 p-8 rounded-2xl border border-gray-800 shadow-2xl text-center">
                <div class="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center text-3xl mx-auto mb-4">📥</div>
                <h3 class="text-xl font-bold text-white">モデルのダウンロード</h3>
                <div class="text-sm text-gray-400 space-y-2">
                    <p>初回起動時にモデルデータをダウンロードします。</p>
                    <p class="text-yellow-500/80 font-medium">⚠️ ファイルサイズ: 約1.2GB</p>
                    <p>Wi-Fi環境での実行を強く推奨します。</p>
                </div>
                <button 
                    @click="startDownload"
                    class="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                >
                    ダウンロードを開始
                </button>
            </div>
        </div>

        <div v-if="status === 'loading'" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm p-8 transition-all">
            <div class="max-w-md w-full space-y-6 bg-gray-900 p-6 rounded-2xl border border-gray-800 shadow-2xl">
                <div class="text-center space-y-2">
                    <h3 class="text-xl font-bold text-white">モデルをダウンロード中</h3>
                    <p class="text-sm text-gray-400">LiquidAI/LFM2.5-1.2B-JP-ONNX を読み込んでいます...</p>
                    <p class="text-xs text-gray-500">注: ブラウザのキャッシュに保存されます。</p>
                </div>
                
                <div class="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    <div v-for="item in progressItems" :key="item.file" class="group">
                        <div class="flex justify-between mb-1 text-xs text-gray-400 group-hover:text-gray-200">
                            <span class="truncate max-w-[200px]" :title="item.file">{{ item.file }}</span>
                            <span>{{ item.progress ? item.progress.toFixed(1) : 0 }}%</span>
                        </div>
                        <div class="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-gradient-to-r from-blue-500 to-emerald-500 h-1.5 rounded-full transition-all duration-300 ease-out" :style="{ width: `${item.progress ?? 0}%` }"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Error Overlay -->
        <div v-if="status === 'error'" class="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950/90 p-8 text-center text-red-400">
             <div class="bg-red-500/10 p-6 rounded-2xl border border-red-500/20 max-w-md">
                <h3 class="text-lg font-bold mb-2">エラーが発生しました</h3>
                <p>{{ loadingMessage }}</p>
                <button @click="reloadPage" class="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded text-sm transition-colors">再読み込み</button>
             </div>
        </div>

        <!-- System Prompt -->
        <div class="px-4 py-3 border-b border-gray-800 bg-gray-800/20">
            <details class="group">
                <summary class="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-300 select-none flex items-center gap-2">
                    <svg class="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                    システムプロンプト
                </summary>
                <div class="mt-3 pl-2 border-l-2 border-gray-700">
                    <textarea 
                        v-model="systemPrompt" 
                        class="w-full bg-transparent text-sm text-gray-300 focus:outline-none resize-none" 
                        rows="2"
                    ></textarea>
                </div>
            </details>
        </div>

        <!-- Chat History -->
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth custom-scrollbar">
            <div v-if="messages.length === 0 && status === 'ready'" class="flex h-full flex-col items-center justify-center text-gray-500 space-y-4">
                <div class="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center text-3xl">👋</div>
                <p>準備完了！チャットを始めましょう。</p>
            </div>

            <div v-for="(msg, idx) in messages" :key="idx" class="flex w-full" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
                <div class="max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-4 shadow-sm" 
                    :class="msg.role === 'user' 
                        ? 'bg-blue-600 text-white rounded-tr-sm' 
                        : 'bg-gray-800 text-gray-100 rounded-tl-sm border border-gray-700'">
                    <div class="text-xs opacity-50 mb-1 uppercase tracking-wider font-bold">{{ msg.role }}</div>
                    <div class="whitespace-pre-wrap leading-relaxed">{{ msg.content }}<span v-if="msg.role === 'assistant' && idx === messages.length - 1 && status === 'generating'" class="inline-block w-2 H-4 bg-emerald-500 animate-pulse ml-1">▋</span></div>
                </div>
            </div>
        </div>
    </main>

    <!-- Input Area -->
    <footer class="p-4 bg-gray-900 border-t border-gray-800">
        <div class="max-w-4xl mx-auto flex gap-3 items-center">
            <button 
                v-if="messages.length > 0"
                @click="clearHistory"
                class="p-3 text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-all rounded-xl shrink-0"
                title="警告: チャット履歴が全て削除されます"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
            <form @submit.prevent="sendMessage" class="flex-1 relative">
                <input 
                    v-model="input" 
                    type="text" 
                    placeholder="Type your message..." 
                    class="w-full bg-gray-800 text-white rounded-xl pl-5 pr-24 py-4 border border-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-lg placeholder-gray-500 disabled:opacity-50"
                    :disabled="status !== 'ready' && status !== 'generating'"
                />
                <button 
                    type="submit" 
                    class="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-6 font-medium transition-all disabled:opacity-0 disabled:scale-95 transform active:scale-95 shadow-md flex items-center justify-center"
                    :disabled="!input.trim() || status !== 'ready'"
                >
                    <span v-if="status === 'ready'">送信</span>
                    <span v-else class="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                </button>
            </form>
        </div>
    </footer>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #4b5563;
}
</style>
