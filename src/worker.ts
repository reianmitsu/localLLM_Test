import { env, pipeline, TextStreamer, type TextGenerationPipeline } from '@huggingface/transformers';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Types
interface GenerateMessage {
    messages: { role: string; content: string }[];
    systemPrompt?: string;
}

// Global pipeline variable
let generator: TextGenerationPipeline | null = null;
const MODEL_ID = 'LiquidAI/LFM2.5-1.2B-JP-ONNX';



self.addEventListener('message', async (event) => {
    const { type, data } = event.data;

    try {
        if (type === 'load') {
            if (generator) {
                self.postMessage({ status: 'ready' });
                return;
            }

            self.postMessage({ status: 'loading', message: 'Initiating model download...' });

            // @ts-ignore
            generator = await pipeline('text-generation', MODEL_ID, {
                dtype: 'q4',
                device: 'webgpu', // Prefer WebGPU
                progress_callback: (progress: any) => {
                    self.postMessage({ status: 'progress', progress });
                }
            } as any);

            self.postMessage({ status: 'ready' });
        }

        else if (type === 'generate') {
            if (!generator) {
                throw new Error('Model is not loaded');
            }

            const { messages, systemPrompt } = data as GenerateMessage;

            // Prepare messages
            const inputMessages = systemPrompt
                ? [{ role: 'system', content: systemPrompt }, ...messages]
                : messages;

            // Create streamer
            const streamer = new TextStreamer(generator.tokenizer, {
                skip_prompt: true,
                skip_special_tokens: true,
            });
            // Monkey patch to capture output
            (streamer as any).on_finalized_text = (text: string) => {
                self.postMessage({ status: 'output', text });
            };

            self.postMessage({ status: 'start' });

            // Generate
            await generator(inputMessages, {
                max_new_tokens: 512,
                temperature: 0.7,
                top_p: 0.9,
                do_sample: true,
                streamer,
            });

            self.postMessage({ status: 'complete' });
        }
    } catch (error: any) {
        console.error('Worker Error:', error);
        self.postMessage({ status: 'error', message: error.message || String(error) });
    }
});
