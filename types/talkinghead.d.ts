declare module "@/vendor/talkinghead/talkinghead.mjs" {
  export class TalkingHead {
    constructor(node: HTMLElement, options?: Record<string, unknown>);
    showAvatar(
      avatar: Record<string, unknown>,
      onProgress?: (event: ProgressEvent) => void,
    ): Promise<void>;
    streamStart(
      options?: Record<string, unknown>,
      onAudioStart?: (() => void) | null,
      onAudioEnd?: (() => void) | null,
    ): Promise<void>;
    streamAudio(payload: {
      audio: Float32Array;
      visemes?: string[];
      vtimes?: number[];
      vdurations?: number[];
    }): void;
    streamInterrupt(): void;
    streamStop(): void;
    start(): void;
    stop(): void;
    dispose(): void;
  }
}
