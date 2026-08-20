export {};

declare global {
  interface Window {
    pianoPuzzle?: {
      getAppInfo: () => Promise<{ name: string; version: string }>;
      chooseAsset: (type: "image" | "midi" | "audio") => Promise<{
        filePath: string; fileName: string; fileSize: number; mimeType: string; dataBase64: string;
      } | null>;
    };
  }
}
